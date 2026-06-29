# HTTPS 与域名部署

本文档介绍 CubeSandbox 部署时的域名和 TLS 证书相关要求。

> **注意：** TLS 配置只影响客户端如何访问 **CubeProxy**。`E2B_API_URL` 始终指向 **Cube API Server**（默认端口 `3000`）。

## 沙箱域名格式

沙箱访问 URL 动态生成：

```
<sandbox-service-port>-<sandboxId>.<domain>
```

示例：

```
49983-1aa1fae8fb364edaa8203a7481995b4d.cube.app
```

客户端网络必须支持 `*.<domain>` 的 **泛域名 DNS 解析**，且解析到 CubeProxy 所在节点。

## 一键安装（内置 DNS）

一键安装脚本会自动：

1. 启动 **CoreDNS** 容器，处理 `*.cube.app`
2. 通过 `systemd-resolved` 或 `NetworkManager + dnsmasq` 配置主机 DNS 路由
3. 通过 `mkcert` 安装 `cube.app` 测试证书

这适用于单机快速体验，**不适合生产环境**。

## 生产环境：自定义域名部署

使用自己的域名部署时，需要确保以下组件配置一致。

### 1. DNS 配置

添加一条泛域名 A 记录，指向运行 CubeProxy 的节点：

```dns
*.your.domain.com  A  <CubeProxy 节点 IP>
```

注意：

- 使用 **泛域名** 记录（`*.your.domain.com`），不是单条主机记录。
- 多节点部署时，CubeProxy 运行在控制节点，因此泛域名应解析到控制节点 IP。
- 沙箱实例运行在计算节点，但访问流量统一经过控制节点的 CubeProxy 路由。
- 内网测试可以用 `/etc/hosts` 或自建 DNS，生产建议通过 DNS 服务商配置。

验证解析：

```bash
dig +short test.your.domain.com
# 应返回 <CubeProxy 节点 IP>
```

### 2. 关闭内置 DNS（可选）

一键安装默认会启动 CoreDNS 处理 `*.cube.app`。如果使用自己的域名和 DNS，可以关闭：

```bash
# .env
CUBE_PROXY_DNS_ENABLE=0
CUBE_PROXY_ENABLE=1
```

也可以保留 CoreDNS 作为 fallback；只要 `CUBE_API_SANDBOX_DOMAIN` 配置正确，不会与自定义域名冲突。

### 3. 配置 Cube API Server

SDK 客户端从 Cube API 获取沙箱访问域名，必须设置为你的域名：

```bash
# .env
CUBE_API_SANDBOX_DOMAIN=your.domain.com
```

或启动时指定：

```bash
./cube-api --sandbox-domain your.domain.com
```

**重要：** 该域名必须与证书的 Common Name（CN）或 Subject Alternative Name（SAN）一致。

### 4. 准备 SSL 证书

CubeProxy 基于 OpenResty/Nginx，需要为 `your.domain.com` 准备有效的 TLS 证书和私钥。

#### 选项 A — Let's Encrypt / 商业证书

典型文件：

```bash
/path/to/fullchain.pem   # 证书 + 中间 CA
/path/to/privkey.pem     # 私钥
```

#### 选项 B — 内网 CA / 自签名证书

使用 OpenSSL 或内部 PKI 签发。客户端机器必须信任签发 CA。

#### 选项 C — mkcert（仅开发/测试）

```bash
mkcert -install
mkcert your.domain.com
```

客户端信任 mkcert CA：

```bash
export SSL_CERT_FILE=/root/.local/share/mkcert/rootCA.pem
```

### 5. 配置 CubeProxy

编辑安装后的 CubeProxy 配置：

```bash
/usr/local/services/cubetoolbox/cubeproxy/nginx.conf
/usr/local/services/cubetoolbox/cubeproxy/docker-compose.yaml
```

#### nginx.conf

```nginx
server {
    listen 443 ssl;
    server_name your.domain.com;

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    # 原有 location 配置 ...
}
```

#### docker-compose.yaml

将证书文件挂载到容器内：

```yaml
services:
  cube-proxy:
    volumes:
      - /path/to/fullchain.pem:/etc/nginx/certs/fullchain.pem:ro
      - /path/to/privkey.pem:/etc/nginx/certs/privkey.pem:ro
```

重启 CubeProxy：

```bash
sudo systemctl restart cube-sandbox-cube-proxy.service
```

### 6. 防火墙 / 安全组

需要开放的端口：

| 端口 | 服务 | 访问来源 | 是否必需 |
|------|------|----------|----------|
| 3000 | Cube API | SDK 客户端 | 是 |
| 443 | CubeProxy HTTPS | SDK 客户端 / 浏览器 | 是 |
| 80 | CubeProxy HTTP | SDK 客户端 / 浏览器 | 可选 |

### 7. SDK 使用前的检查清单

```bash
# 1. 泛域名 DNS 解析到 CubeProxy
dig +short test.your.domain.com

# 2. Cube API 配置的域名正确
rg CUBE_API_SANDBOX_DOMAIN /usr/local/services/cubetoolbox/.one-click.env

# 3. CubeProxy 监听 443 端口
ss -tlnp | grep 443

# 4. 证书包含正确域名
openssl s_client -connect your.domain.com:443 -servername your.domain.com </dev/null | openssl x509 -noout -text | grep -A1 "Subject Alternative Name"

# 5. Cube API 健康检查通过
curl -s http://<cube-api-host>:3000/health
```

### 常见问题

| 现象 | 原因 |
|------|------|
| `CERTIFICATE_VERIFY_FAILED` | 客户端不信任证书，或证书已过期。 |
| `hostname doesn't match` | `CUBE_API_SANDBOX_DOMAIN` 与证书 CN/SAN 不一致。 |
| `*.your.domain.com` 无法解析 | 泛域名 DNS 未配置或存在缓存。 |
| 443 端口连接被拒绝 | 防火墙/安全组未放行，或 CubeProxy 未运行。 |
| 证书已配置但请求失败 | docker-compose 未正确挂载证书文件。 |

## 路径式访问（无需 DNS/证书）

在没有泛域名 DNS 的环境中，可以使用 CubeProxy 的路径式访问：

```
http://<cube-proxy-host>:<http-port>/sandbox/<sandbox-id>/<container-port>/<path>
```

示例：

```
http://10.0.0.5/sandbox/abc123/49999/health
```

该模式无需 DNS 或证书配置。

## 端口说明

| 端口 | 服务 | 协议 | 说明 |
|------|------|------|------|
| 3000 | Cube API | HTTP | SDK 控制面入口 |
| 443 | CubeProxy | HTTPS | 沙箱数据面入口 |
| 80 | CubeProxy | HTTP | 可选，可禁用 |

## 客户端配置

```bash
export E2B_API_URL=http://<cube-api-host>:3000
export E2B_API_KEY=dummy
export SSL_CERT_FILE=/path/to/ca.pem   # 使用 mkcert 或自签名证书时需要
```

## 常见问题

- **DNS 不生效**：检查泛域名记录是否解析到 CubeProxy IP
- **证书错误**：确保客户端信任 CA，或改用路径式访问
- **域名不匹配**：检查 `CUBE_API_SANDBOX_DOMAIN` 是否与证书一致

更多细节请参考 [HTTPS & Domain Resolution](/guide/https-and-domain)。

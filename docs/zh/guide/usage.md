# 业务使用指南

> 本文档介绍部署完成后，如何通过 Web 控制台、REST API 和 Python SDK 使用 CubeSandbox 沙箱服务。

## 1. 服务入口

假设部署完成后，CubeSandbox 运行在节点 `172.20.16.160`，自定义域名为 `*.sandbox.test.chinawayltd.com`。

| 入口 | 地址 | 说明 |
|---|---|---|
| Web Dashboard | `http://172.20.16.160:12088` | 浏览器访问的沙箱管理控制台 |
| REST API | `http://172.20.16.160:3000` | E2B 兼容 API |
| REST API（管理前缀） | `http://172.20.16.160:3000/cubeapi/v1/...` | 带 `/cubeapi/v1` 前缀的管理类接口 |
| 沙箱子域名 | `{port}-{sandbox_id}.sandbox.test.chinawayltd.com` | 访问沙箱内部暴露的服务 |

### 1.1 Web 控制台

直接用浏览器打开：

```text
http://172.20.16.160:12088
```

控制台提供：

- 沙箱列表、状态、资源占用
- 模板列表
- 节点和集群概览
- 日志查看

### 1.2 REST API 健康检查

```bash
curl -s http://172.20.16.160:3000/health
```

预期返回：

```json
{"status":"ok"}
```

## 2. REST API 使用

CubeAPI 同时提供两套路由：

- **根路径 `/`**：E2B 兼容接口，如 `/sandboxes`、`/templates`、`/health`
- **`/cubeapi/v1/` 前缀**：管理类接口也挂载在这里，如 `/cubeapi/v1/cluster/overview`

### 2.1 常用 API 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/sandboxes` | 列出所有沙箱 |
| POST | `/sandboxes` | 创建沙箱 |
| GET | `/v2/sandboxes` | 列出沙箱（V2 格式） |
| GET | `/sandboxes/{sandboxID}` | 获取沙箱详情 |
| DELETE | `/sandboxes/{sandboxID}` | 停止/删除沙箱 |
| POST | `/sandboxes/{sandboxID}/refresh` | 刷新沙箱超时时间 |
| POST | `/sandboxes/{sandboxID}/pause` | 暂停沙箱 |
| POST | `/sandboxes/{sandboxID}/resume` | 恢复沙箱 |
| POST | `/sandboxes/{sandboxID}/connect` | 连接到已有沙箱 |
| GET | `/sandboxes/{sandboxID}/logs` | 获取沙箱日志 |
| GET | `/templates` | 列出模板 |
| POST | `/templates` | 创建模板 |
| GET | `/templates/{templateID}` | 获取模板详情 |
| POST | `/templates/{templateID}` | 重建模板 |
| PATCH | `/templates/{templateID}` | 更新模板 |
| DELETE | `/templates/{templateID}` | 删除模板 |
| GET | `/cubeapi/v1/cluster/overview` | 集群概览 |
| GET | `/cubeapi/v1/nodes` | 列出节点 |

### 2.2 创建沙箱

```bash
curl -X POST http://172.20.16.160:3000/sandboxes \
  -H "Content-Type: application/json" \
  -d '{
    "templateID": "tpl-python-311-envd",
    "timeout": 300
  }'
```

返回示例：

```json
{
  "sandboxID": "abc123-def456",
  "templateID": "tpl-python-311-envd",
  "status": "running",
  "domain": "sandbox.test.chinawayltd.com"
}
```

### 2.3 列出沙箱

```bash
curl -s http://172.20.16.160:3000/sandboxes | python3 -m json.tool
```

### 2.4 删除沙箱

```bash
curl -X DELETE http://172.20.16.160:3000/sandboxes/{sandboxID}
```

## 3. Python SDK 使用

CubeSandbox 提供 E2B 兼容的 Python SDK，位于仓库 `sdk/python/` 目录。

### 3.1 安装 SDK

```bash
cd /root/CubeSandbox/sdk/python
pip install -e .
```

### 3.2 环境变量配置

```bash
export CUBE_API_URL="http://172.20.16.160:3000"
export CUBE_TEMPLATE_ID="tpl-python-311-envd"
export CUBE_PROXY_NODE_IP="172.20.16.160"
export CUBE_PROXY_PORT_HTTP="80"
export CUBE_SANDBOX_DOMAIN="sandbox.test.chinawayltd.com"
```

- `CUBE_API_URL`：CubeAPI 地址
- `CUBE_TEMPLATE_ID`：默认模板 ID
- `CUBE_PROXY_NODE_IP`：CubeProxy 节点 IP，SDK 会绕过 DNS 直接连到该 IP
- `CUBE_PROXY_PORT_HTTP`：CubeProxy HTTP 端口
- `CUBE_SANDBOX_DOMAIN`：沙箱子域名后缀

### 3.3 创建沙箱并执行代码

```python
from cubesandbox import Sandbox

# 创建沙箱
sandbox = Sandbox.create(template="tpl-python-311-envd")
print(f"Sandbox ID: {sandbox.sandbox_id}")

# 执行 Python 代码
result = sandbox.run_code("print('Hello from CubeSandbox!')")
print("stdout:", result.logs.stdout)
print("stderr:", result.logs.stderr)

# 执行 shell 命令
cmd_result = sandbox.commands.run("python3 --version")
print("stdout:", cmd_result.stdout)
print("exit_code:", cmd_result.exit_code)

# 销毁沙箱
sandbox.kill()
```

### 3.4 指定模板和超时时间

```python
from cubesandbox import Sandbox

sandbox = Sandbox.create(
    template="tpl-python-311-envd",
    timeout=600,  # 10 分钟
)
```

### 3.5 连接到已有沙箱

```python
from cubesandbox import Sandbox

sandbox = Sandbox.connect("abc123-def456")
result = sandbox.run_code("print('reconnected')")
sandbox.kill()
```

### 3.6 文件操作

```python
from cubesandbox import Sandbox

sandbox = Sandbox.create(template="tpl-python-311-envd")

# 写入文件
sandbox.commands.run("echo 'hello' > /tmp/test.txt")

# 读取文件
content = sandbox.files.read("/tmp/test.txt")
print(content)

sandbox.kill()
```

> 注：`files.read()` 内部通过 `run_code()` 执行 Python 代码读取文件，因此需要模板内的代码执行服务正常工作。

## 4. 访问沙箱内部服务

沙箱创建后，其内部暴露的端口可以通过子域名访问：

```text
http://{port}-{sandbox_id}.{domain}
https://{port}-{sandbox_id}.{domain}
```

例如，使用 Python 3.11 模板时，代码执行服务监听在 `49999` 端口：

```text
http://49999-abc123-def456.sandbox.test.chinawayltd.com/execute
```

### 4.1 访问流程

```text
客户端
  │
  ▼  DNS 查询 49999-abc123-def456.sandbox.test.chinawayltd.com
  │
  ▼  解析到 172.20.16.160
  │
  ▼  发送 HTTP 请求，Host 头为 49999-abc123-def456.sandbox.test.chinawayltd.com
  │
  ▼  cube-proxy（监听 80/443）根据 Host 解析出 sandboxID 和端口
  │
  ▼  转发到对应沙箱的内部 IP 和端口
```

### 4.2 使用 curl 直接访问

```bash
# HTTP
curl -H "Host: 49999-abc123-def456.sandbox.test.chinawayltd.com" \
  http://172.20.16.160/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "print(1)"}'

# HTTPS（自签名证书，测试时使用 -k）
curl -k -H "Host: 49999-abc123-def456.sandbox.test.chinawayltd.com" \
  https://172.20.16.160/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "print(1)"}'
```

### 4.3 SDK 自动处理路由

SDK 的 `IPOverrideTransport` 会自动：

1. 把请求目标 IP 改为 `CUBE_PROXY_NODE_IP`
2. 保留原始 `Host` 头
3. 使用 `CUBE_PROXY_PORT_HTTP` 作为连接端口

因此业务代码不需要手动处理子域名解析。

## 5. 外部客户端接入要求

### 5.1 DNS 配置

外部客户端必须能将 `*.sandbox.test.chinawayltd.com` 解析到 `172.20.16.160`。

方案一：在 DNS 服务器添加通配符记录：

```text
*.sandbox.test.chinawayltd.com  A  172.20.16.160
```

方案二：在客户端 `/etc/hosts` 中为每个沙箱子域名添加记录：

```text
172.20.16.160  49999-abc123-def456.sandbox.test.chinawayltd.com
```

### 5.2 证书信任

由于使用自定义 SSL 证书，外部客户端访问 HTTPS 时需要：

1. 将 `/data/ssl/_.sandbox.test.chinawayltd.com.crt` 导入系统信任库
2. 或者在测试时使用 `-k`/`--insecure` 跳过证书验证

Python SDK 当前默认使用 HTTP（端口 80），若改为 HTTPS，需要额外配置 SSL 上下文信任该证书。

## 6. 典型业务架构

### 6.1 AI Agent 代码执行服务

```text
用户 / 前端
   │
   ▼
业务后端（FastAPI / Flask / Django）
   │
   ├── 调用 CubeAPI 创建沙箱 ──▶ 172.20.16.160:3000
   │
   ├── 通过子域名下发代码执行请求 ──▶ 49999-{id}.sandbox.test.chinawayltd.com
   │
   └── 调用 CubeAPI 销毁沙箱 ──▶ 172.20.16.160:3000
```

### 6.2 多沙箱并发

```python
from concurrent.futures import ThreadPoolExecutor
from cubesandbox import Sandbox

def run_in_sandbox(code):
    sandbox = Sandbox.create(template="tpl-python-311-envd", timeout=60)
    try:
        result = sandbox.run_code(code)
        return result.logs.stdout
    finally:
        sandbox.kill()

codes = [
    "print('task 1')",
    "print('task 2')",
    "print('task 3')",
]

with ThreadPoolExecutor(max_workers=3) as executor:
    results = list(executor.map(run_in_sandbox, codes))
    print(results)
```

### 6.3 长生命周期沙箱

默认沙箱有超时时间，会被自动回收。如果需要延长：

```python
# 创建时指定长超时
sandbox = Sandbox.create(template="tpl-python-311-envd", timeout=3600)

# 或在运行中刷新
sandbox.refresh()
```

## 7. 完整示例：FastAPI 集成

```python
from fastapi import FastAPI
from cubesandbox import Sandbox

app = FastAPI()

@app.post("/run")
def run_code(code: str):
    sandbox = Sandbox.create(template="tpl-python-311-envd", timeout=300)
    try:
        result = sandbox.run_code(code)
        return {
            "stdout": result.logs.stdout,
            "stderr": result.logs.stderr,
            "error": result.error.value if result.error else None,
        }
    finally:
        sandbox.kill()
```

启动：

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

调用：

```bash
curl -X POST http://localhost:8000/run \
  -H "Content-Type: application/json" \
  -d '{"code": "print(1 + 2)"}'
```

## 8. 常见问题

### 8.1 SDK 连接沙箱子域名时报 DNS 错误

确保客户端能解析 `*.sandbox.test.chinawayltd.com`，或正确设置了 `CUBE_PROXY_NODE_IP` 让 SDK 绕过 DNS。

### 8.2 HTTPS 访问报证书错误

自定义证书需要客户端信任。测试时可先用 HTTP（端口 80）验证功能。

### 8.3 沙箱创建成功但代码执行 404

检查模板是否正确暴露了代码执行端口（如 Python 模板的 `49999`），并且模板内该端口有服务监听。

### 8.4 沙箱自动退出

检查沙箱超时时间，以及系统 guest rootfs 是否正确注入了 `cube-agent`。详见[一键部署与 SDK 验证指南](./one-click-verification.md)。

## 9. 相关文档

- [一键部署与 SDK 验证指南](./one-click-verification.md) — 从零开始部署并验证的完整步骤
- [从 OCI 镜像制作模板](./tutorials/template-from-image.md) — 如何制作自定义模板
- [模板检查与请求预览](./template-inspection-and-preview.md) — 查看模板内部请求结构
- [HTTPS 证书与域名解析](./https-and-domain.md) — 域名和证书配置细节

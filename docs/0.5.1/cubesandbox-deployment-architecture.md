# CubeSandbox 部署架构图

> 本文档描述 CubeSandbox one-click / 多节点部署下的整体架构、服务关系、请求流转，以及 wildcard DNS 与 HTTPS 证书的工作方式。

---

## 1. 整体部署架构（控制节点 + 计算节点）

```mermaid
flowchart TB
    subgraph Internet["外部网络"]
        Client["Client / E2B SDK"]
        UserDNS["用户 DNS 服务商<br/>*.your.domain.com → A 记录"]
    end

    subgraph ControlNode["控制节点 (Control Node)"]
        direction TB
        CubeAPI["CubeAPI :3000<br/>E2B API 网关"]
        CubeMaster["CubeMaster :8089<br/>调度器"]
        Redis["Redis :6379"]
        MySQL["MySQL :3306"]
        CubeProxy["cube-proxy :80/:443<br/>OpenResty + Lua"]
        CoreDNS["CoreDNS :53<br/>*.cube.app 解析"]
        WebUI["WebUI :12088"]
        CLM["cube-lifecycle-manager<br/>AutoPause/AutoResume"]
    end

    subgraph ComputeNode1["计算节点 #1"]
        direction TB
        Cubelet1["Cubelet :9999"]
        NetAgent1["network-agent :19090"]
        CubeEgress1["cube-egress<br/>MITM 代理"]
        CubeVS1["CubeVS (eBPF)"]
        subgraph Sandboxes1["本节点沙箱"]
            VM1a["MicroVM #1"]
            VM1b["MicroVM #2"]
        end
    end

    subgraph ComputeNodeN["计算节点 #N"]
        direction TB
        CubeletN["Cubelet :9999"]
        NetAgentN["network-agent :19090"]
        CubeEgressN["cube-egress"]
        CubeVSN["CubeVS (eBPF)"]
        subgraph SandboxesN["本节点沙箱"]
            VMNa["MicroVM #x"]
        end
    end

    Client -->|1. 管理 API| CubeAPI
    CubeAPI -->|gRPC| CubeMaster
    CubeMaster -->|读写| Redis
    CubeMaster -->|gRPC| Cubelet1
    CubeMaster -->|gRPC| CubeletN
    CubeMaster -.->|可选元数据| MySQL

    Client -->|2. 访问沙箱服务| UserDNS
    UserDNS -->|A 记录| CubeProxy
    CubeProxy -->|查 Redis 路由表| Redis
    CubeProxy -->|转发 HTTP/HTTPS| VM1a
    CubeProxy -->|转发| VM1b
    CubeProxy -->|转发| VMNa

    CLM -->|监听生命周期事件| Redis
    CLM -->|Pause/Resume| Cubelet1
    CLM -->|Pause/Resume| CubeletN

    Cubelet1 -->|管理| VM1a
    Cubelet1 -->|管理| VM1b
    NetAgent1 -->|配置网络| CubeVS1
    CubeVS1 -->|出站流量| CubeEgress1
    CubeEgress1 -->|过滤/审计| Internet

    CubeletN -->|管理| VMNa
    NetAgentN -->|配置网络| CubeVSN
    CubeVSN -->|出站流量| CubeEgressN
```

### 部署方式说明

| 节点 | 服务 | 部署方式 | 说明 |
|------|------|----------|------|
| 控制节点 | CubeAPI、CubeMaster | systemd + 本地二进制 | 自研控制面，无状态 |
| 控制节点 | Redis、MySQL | systemd + Docker 容器 | 第三方依赖 |
| 控制节点 | cube-proxy、CoreDNS、WebUI、cube-lifecycle-manager | systemd + Docker 容器 | 网关/DNS/控制台/生命周期管理 |
| 控制/计算节点 | network-agent、cubelet | systemd + 本地二进制 | 节点数据面核心 |
| 控制/计算节点 | cube-egress | systemd + Docker 容器 (`--network=host`) | 透明 MITM 代理 |

---

## 2. Wildcard DNS 解析特写

```mermaid
sequenceDiagram
    participant Client as 客户端 / E2B SDK
    participant DNS as 用户 DNS 服务商<br/>或本地 CoreDNS
    participant CubeProxy as cube-proxy<br/>:443 / :80
    participant Redis as Redis
    participant Sandbox as 目标 MicroVM

    Note over Client,Sandbox: 沙箱创建后，客户端访问沙箱服务
    Client->>DNS: 查询 49983-abc123.your.domain.com
    DNS-->>Client: 返回 cube-proxy 节点 IP<br/>例如 1.2.3.4
    Client->>CubeProxy: HTTPS 请求<br/>Host: 49983-abc123.your.domain.com
    CubeProxy->>Redis: 查 sandbox_id=abc123 的<br/>节点 IP + 容器端口
    Redis-->>CubeProxy: backend_ip=10.0.1.10<br/>backend_port=49999
    CubeProxy->>Sandbox: 转发到 10.0.1.10:49999
    Sandbox-->>CubeProxy: 响应
    CubeProxy-->>Client: 响应
```

### Wildcard DNS 字段含义

| 字段 | 示例 | 含义 |
|------|------|------|
| `49983` | `49983-abc123.your.domain.com` | cube-proxy 对外暴露的访问端口 |
| `abc123` | `49983-abc123.your.domain.com` | sandbox ID，由 CubeMaster 分配 |
| `your.domain.com` | `49983-abc123.your.domain.com` | 用户配置的 base domain |
| `*.your.domain.com` | wildcard A 记录 | 全部解析到 cube-proxy 所在节点 IP |

### one-click 快速体验 vs 生产部署

| 场景 | DNS 配置位置 | 说明 |
|------|--------------|------|
| one-click 快速体验 | CoreDNS + 宿主机 DNS 路由 | 控制节点本机启动 CoreDNS，`*.cube.app` 解析到本机 IP |
| 生产部署 | 用户自己的 DNS 服务商 | 配置 `*.your.domain.com → <cube-proxy IP>` |

---

## 3. HTTPS 证书路径

```mermaid
flowchart LR
    subgraph CertSource["证书来源"]
        MKCERT["mkcert 自动生成<br/>cube.app+3.pem"]
        Custom["用户自定义证书<br/>your.domain.com.crt"]
    end

    subgraph HostPath["宿主机路径"]
        CertDir["/usr/local/services/cubetoolbox/cubeproxy/certs/"]
        NGINXConf["/usr/local/services/cubetoolbox/cubeproxy/nginx.conf"]
    end

    subgraph ContainerPath["cube-proxy 容器内"]
        ContainerCert["/usr/local/openresty/nginx/certs/"]
        ContainerNGINX["nginx 读取 ssl_certificate"]
    end

    MKCERT --> CertDir
    Custom --> CertDir
    CertDir -->|volume mount| ContainerCert
    NGINXConf -->|volume mount| ContainerNGINX
    ContainerNGINX -->|引用| ContainerCert
    ContainerNGINX -->|监听 443| HTTPS["HTTPS 流量"]
```

### 证书配置方式

| 方式 | 配置入口 | 适用场景 |
|------|----------|----------|
| 自动生成 | `mkcert cube.app "*.cube.app"` | one-click 本地体验 |
| 自定义证书 | `.env` 中 `CUBE_PROXY_SSL_CERT_SRC` / `CUBE_PROXY_SSL_KEY_SRC` | 生产环境 |
| 手动替换 | 直接放到 `/usr/local/services/cubetoolbox/cubeproxy/certs/` | 临时调试 |

---

## 4. 完整请求生命周期

```mermaid
sequenceDiagram
    autonumber
    participant Client as E2B SDK / Client
    participant CubeAPI as CubeAPI :3000
    participant CubeMaster as CubeMaster :8089
    participant Redis as Redis
    participant Cubelet as Cubelet（某节点）
    participant Shim as CubeShim
    participant VM as MicroVM
    participant CubeProxy as cube-proxy :443
    participant DNS as DNS *.your.domain.com

    Note over Client,VM: 第一阶段：创建沙箱
    Client->>CubeAPI: POST /sandboxes
    CubeAPI->>CubeMaster: CreateSandbox gRPC
    CubeMaster->>CubeMaster: 选节点
    CubeMaster->>Cubelet: RunCubeSandbox gRPC
    Cubelet->>Shim: containerd Shim v2 Create+Start
    Shim->>VM: restore_vm() 启动 MicroVM
    Cubelet->>VM: 配置 TAP + network-agent
    CubeMaster->>Redis: 发布生命周期事件
    CubeMaster-->>CubeAPI: 返回 sandbox_id + domain
    CubeAPI-->>Client: 201 {sandbox_id, ...}

    Note over Client,VM: 第二阶段：访问沙箱服务
    Client->>DNS: 解析 49983-abc123.your.domain.com
    DNS-->>Client: 1.2.3.4（cube-proxy IP）
    Client->>CubeProxy: GET https://49983-abc123.your.domain.com/
    CubeProxy->>Redis: 查 abc123 路由
    Redis-->>CubeProxy: backend_ip/port
    CubeProxy->>VM: 转发 HTTP 请求
    VM-->>CubeProxy: 响应
    CubeProxy-->>Client: 响应
```

---

## 5. 核心组件关系速查

| 组件 | 角色 | 直接交互对象 |
|------|------|--------------|
| **CubeAPI** | E2B 兼容 API 网关 | Client、CubeMaster |
| **CubeMaster** | 集群调度器 | CubeAPI、Redis、Cubelet |
| **cube-lifecycle-manager** | 自动暂停/恢复管家 | Redis、CubeProxy、Cubelet |
| **cube-proxy** | 流量入口/路由网关 | Client、Redis、MicroVM、CLM |
| **network-agent** | 节点网络配置器 | Cubelet、CubeVS、cube-egress |
| **cube-egress** | 出站流量安检门 | CubeVS、外部网络 |

---

## 6. 一句话总结

> 客户端先通过 **CubeAPI** 创建沙箱，拿到 `49983-abc123.your.domain.com` 这样的域名；然后客户端向 DNS 查询这个域名，DNS 的 wildcard 记录 `*.your.domain.com` 把它解析到 **cube-proxy** 的 IP；cube-proxy 根据 Host 头里的 sandbox ID 去 **Redis** 查真实后端，最后把请求转发到对应节点上的 **MicroVM**。

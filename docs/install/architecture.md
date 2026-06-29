# 架构说明

## 组件部署方式

CubeSandbox 采用混合部署策略：

| 组件 | 部署方式 | 说明 |
|------|----------|------|
| **CubeMaster** | 主机进程（systemd） | 调度/控制平面 |
| **CubeAPI** | 主机进程（systemd） | E2B 兼容 REST API |
| **Cubelet** | 主机进程（systemd） | 节点代理 |
| **network-agent** | 主机进程（systemd） | eBPF 网络编排 |
| **MySQL** | Docker 容器 | 数据库 |
| **Redis** | Docker 容器 | 缓存 |
| **CubeProxy** | Docker 容器 | TLS 反向代理 |
| **CoreDNS** | Docker 容器 | DNS 服务 |

## 为什么核心组件不用 Docker？

### 1. 直接硬件交互需求

Cubelet 管理 MicroVM，需要直接访问和操作宿主机的底层资源：

- `/dev/kvm` 设备
- cgroup v2 控制器
- 网络命名空间、网桥、veth pair
- 进程和 PID 命名空间

Docker 容器的隔离层会让这些操作变得复杂，需要额外授予 `privileged`、`--device`、capabilities 等权限。

### 2. eBPF 网络操作

network-agent 使用 eBPF/XDP 实现 CubeVS（Cube Virtual Switch），需要在宿主机内核态加载程序、管理 tc/iptables 规则。这些操作在容器内有诸多限制。

### 3. VM 生命周期管理

Cubelet 通过 containerd-shim 启动和停止 MicroVM，需要与宿主机进程树、systemd、PID 文件等紧密协作。作为主机进程运行最自然。

### 4. 性能敏感

控制平面和节点代理需要极低延迟地调度沙箱。Docker 的网络栈、存储卷和 seccomp 等隔离机制会带来额外开销。

### 5. systemd 原生集成

使用 systemd 可以直接获得：

- 服务依赖管理（`After`/`Wants`/`Requires`）
- 自动重启（`Restart=on-failure`）
- 统一日志收集（`journalctl`）
- 资源限制（cgroup）
- PID 文件管理

这与 Kubernetes 不把 kubelet/containerd 放进 Docker 中的理念一致。

## 为什么基础设施用 Docker？

以下组件容器化是因为它们：

- 是通用第三方服务，有成熟镜像
- 不需要与宿主机 KVM/网络栈深度集成
- 便于版本管理和数据持久化
- 隔离性好，避免污染宿主机环境

## 调用关系

```
cube-sandbox-control.target
    │
    ├── MySQL（Docker）
    ├── Redis（Docker）
    ├── CubeMaster（主机进程）
    │       └── 依赖 MySQL、Redis
    ├── CubeAPI（主机进程）
    │       └── 依赖 CubeMaster
    ├── network-agent（主机进程）
    ├── cubelet（主机进程）
    │       └── 依赖 network-agent
    ├── CubeProxy（Docker）
    ├── CoreDNS（Docker）
    ├── DNS 路由配置（systemd-resolved / dnsmasq）
    └── WebUI（主机进程）
            └── 依赖 cube-api
```

## 主机进程与容器的关系

```
┌─────────────────────────────────────────────────────────────┐
│                        宿主机                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  CubeMaster │  │   CubeAPI   │  │      Cubelet        │  │
│  │  (systemd)  │  │  (systemd)  │  │     (systemd)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐                                            │
│  │network-agent│                                            │
│  │  (systemd)  │                                            │
│  └─────────────┘                                            │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │  MySQL      │  │   Redis     │  │     CubeProxy       │  │
│  │  (Docker)   │  │  (Docker)   │  │     (Docker)        │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
│  ┌─────────────┐                                            │
│  │  CoreDNS    │                                            │
│  │  (Docker)   │                                            │
│  └─────────────┘                                            │
└─────────────────────────────────────────────────────────────┘
```

## 总结

- **Docker 用于通用基础设施**：数据库、缓存、代理、DNS
- **systemd 用于虚拟化平台核心**：调度、API、节点代理、网络编排

这种设计与 Kubernetes、OpenStack 等大型平台的部署思路一致：平台本身运行在主机上，依赖服务容器化。

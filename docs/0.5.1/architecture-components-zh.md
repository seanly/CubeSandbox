# CubeSandbox 0.5.1 架构组件关系

> 基于 0.5.1 分支代码与文档整理，中文。

---

## 1. 整体架构分层

CubeSandbox 采用 **控制面 / 数据面分离** 的设计：

| 分层 | 组件 | 职责 |
|---|---|---|
| **控制面** | CubeAPI、CubeMaster、WebUI、cube-lifecycle-manager、Redis | API 网关、调度、生命周期事件、运维面板、自动暂停/恢复协调 |
| **数据面** | Cubelet、CubeShim、CubeHypervisor、CubeCoW、CubeVS、CubeEgress、CubeProxy | VM 生命周期、存储、网络、安全策略、请求路由 |

核心设计原则：

- **控制面无状态**：所有状态存在 Redis，CubeMaster 多副本可横向扩展。
- **数据面节点本地**：每个计算节点运行 Cubelet + Shim + Hypervisor + CubeVS + CubeEgress。
- **硬件级隔离**：每个 Sandbox 跑在独立 KVM MicroVM 里，独占 Guest Kernel。

---

## 2. 组件关系图

```text
Client / SDK
    │  E2B-compatible REST
    ▼
[CubeAPI] ──gRPC──► [CubeMaster] ──gRPC──► [Cubelet] ──containerd Shim v2──► [CubeShim]
   Rust                 Go                  Go                       Rust(containerd-shim-cube-rs)
    │                    │                   │                              │
    │                    │                   ▼                              ▼
    │                    │            [containerd]                  [CubeHypervisor] ──► MicroVM
    │                    │           (image pull)                        RustVMM + KVM
    │                    │                   │
    │                    │                   ▼
    │                    │            [CubeCoW] (rootfs/memory volume clone/snapshot)
    │                    │
    │                    └── Redis (state / events / routing table / distributed locks)
    │
    ▼
[CubeProxy] ◄── Redis 路由表 / lifecycle 事件 ──► [cube-lifecycle-manager]
 OpenResty+Lua                  (AutoPause/AutoResume)
    │
    ├──► 外部请求路由到 Sandbox
    │
    └──► 出站流量 ──► [CubeVS] (eBPF) ──TPROXY──► [CubeEgress] (L7 MITM proxy) ──► Internet
```

---

## 3. 核心组件职责与关系

### 控制面

| 组件 | 语言 | 关键文件 | 职责 |
|---|---|---|---|
| **CubeAPI** | Rust | `CubeAPI/src/main.rs` | E2B 兼容的 REST 网关，鉴权回调，限流，转发 gRPC 到 CubeMaster |
| **CubeMaster** | Go | `CubeMaster/cmd/cubemaster/app/main.go` | 集群调度器：选节点、分发创建/暂停/恢复/销毁请求、发布生命周期事件 |
| **cube-lifecycle-manager** | Go | `cube-lifecycle-manager/cmd/cube-lifecycle-manager/main.go` | **v0.5.1 新增独立服务**，负责 AutoPause/AutoResume，替代了原先 CubeProxy 容器内的 sidecar |
| **WebUI** | TS/Vue | `web/` | `:12088` 管理控制台 |

### 数据面

| 组件 | 语言 | 关键文件 | 职责 |
|---|---|---|---|
| **Cubelet** | Go | `Cubelet/cmd/cubelet/main.go` | 节点代理，管理本节点所有 Sandbox 的完整生命周期 |
| **CubeShim** | Rust | `CubeShim/shim/src/main.rs` | containerd Shim v2 实现，准备 rootfs/memory，调用 Hypervisor 启动/恢复 VM |
| **CubeHypervisor** | Rust | `hypervisor/src/main.rs` | 基于 RustVMM + KVM 的轻量 VMM，管理 vCPU、内存、virtio 设备、快照/恢复 |
| **CubeCoW** | Rust | `cubecow/src/lib.rs` | 基于 XFS reflink (`FICLONE`) 的 O(1) 快照/克隆存储引擎 |
| **CubeVS** | eBPF + Go | `CubeNet/src/` | 内核态网络数据面：SNAT/DNAT、会话跟踪、LPM 网络策略、ARP 代理 |
| **CubeEgress** | OpenResty + Lua | `CubeEgress/lua/` | 透明 L7 egress 代理：域名白名单、凭证注入、访问审计 |
| **CubeProxy** | OpenResty + Lua | `CubeProxy/lua/` | 反向代理：Host/Path 两种模式把外部请求路由到 Sandbox |

---

## 4. v0.5.1 的新架构变化

### 4.1 cube-lifecycle-manager 从 sidecar 独立为控制面服务

这是 0.5.1 最大的架构调整：

- **v0.5.0**：AutoPause/Resume 逻辑跑在 `CubeProxy/sidecar/` 里，随 CubeProxy 单实例部署，无法水平扩展。
- **v0.5.1**：提取为独立的 `cube-lifecycle-manager` 控制面服务：
  - 通过 **Redis 服务发现** 动态发现所有 CubeProxy 副本的 admin 端点（`cube-lifecycle-manager/internal/discovery/`）。
  - 包含 sweeper（扫描 idle）、resumer（恢复暂停实例）、registry（代理注册表）、redisstream（消费生命周期事件）。
  - 与 CubeProxy 的 wire protocol 保持不变（admin push + `/_sidecar_resume` callback）。
  - 已接入一键安装和 TencentCloud Terraform 部署。

关键文件：

- `cube-lifecycle-manager/cmd/cube-lifecycle-manager/main.go`
- `cube-lifecycle-manager/internal/sweeper/sweeper.go`
- `cube-lifecycle-manager/internal/resumer/resumer.go`
- `cube-lifecycle-manager/internal/discovery/discovery.go`

### 4.2 三值 Timeout 语义

Sandbox 空闲超时从 SDK 硬编码默认值，下落到 **CubeMaster 服务端统一决策**：

| 值 | 含义 |
|---|---|
| 未设置 (`None`/`nil`) | 使用集群 `default_timeout_insec`；若未配置或 ≤0 → 永不回收 |
| `NEVER_TIMEOUT` (`-1`) | 永不因 idle 回收 |
| `0` | 首次 sweep 立即回收 |
| `N > 0` | Idle TTL = N 秒 |

- SDK 的 `Timeout` 改为 optional pointer，新增 `set_timeout()` / `SetTimeout()`。
- 创建 RPC 超时与 idle TTL 解耦：新增 `create_timeout_insec`（默认 300s）只约束创建/调度过程。

### 4.3 Host-Mount 路径白名单

- 之前 host mount 接受任意绝对路径，存在主机目录任意绑定风险。
- v0.5.1 限制为可配置前缀（默认 `/data/shared/`），`filepath.Clean` 处理 `..`，禁止 `/`。

### 4.4 其他架构级增强

- **ARM64 全栈原生支持**：Hypervisor、Shim、BPF、guest agent、CI/CD、部署工具链全部支持 aarch64；PVM/live-migration 仍为 x86_64 独占。
- **CubeEgress 透明代理 IP 从 sandbox CIDR 推导**：不再硬编码 `192.168.0.1`。
- **CubeEgress fail-closed bootstrap**：启动策略未加载完成前返回 403，而非放行。
- **TAP 设备回收安全**：cleanup 成功前不归还 TAP 池，防止跨 Sandbox 策略泄漏。

---

## 5. 典型请求链路

### Sandbox.create() 控制链路

```text
Client/SDK ──POST /sandboxes──► CubeAPI
                                    │
                                    ▼ gRPC CreateSandbox
                              CubeMaster (选节点)
                                    │
                                    ▼ gRPC RunCubeSandbox
                              Cubelet
                                    │
                                    ├── CubeCoW clone template rootfs/memory
                                    │
                                    ▼ containerd Shim v2 Create + Start
                              CubeShim
                                    │
                                    ▼ launch_vmm() → create_vm() → restore_vm()
                              CubeHypervisor
                                    │
                                    ◄── VM ready (vsock listening)
                                    │
                              Cubelet ──► CubeVS AddTAPDevice + AttachFilter
                                    │
                                    ◄── Sandbox running
                              CubeMaster ──► Redis publish lifecycle event
                                    │
                              CubeAPI ──► 201 { sandbox_id, ... }
```

### 外部请求进入 Sandbox 数据链路

```text
Client ──► CubeProxy (Host/Path 路由)
              │
              ├── 若 Sandbox 已暂停 ──► cube-lifecycle-manager ──► 恢复 Sandbox
              │
              ▼
        CubeVS from_world / from_envoy
              │
              ▼
        Sandbox TAP device ──► MicroVM
```

### 出站流量链路

```text
Sandbox ──► TAP ──► CubeVS from_cube (eBPF)
                        │
                        ├── L7_REQUIRED (80/443) ──► cube-dev ──► CubeEgress (TPROXY) ──► Internet
                        │
                        └── 普通流量 ──► SNAT ──► Host NIC ──► Internet
```

---

## 6. 存储层：CubeCoW

`CubeCoW` 基于 XFS reflink：

```text
Template (只读基础镜像)
    └── FICLONE ──► Sandbox rootfs volume (CoW)
                          ├── FICLONE ──► Snapshot A
                          └── FICLONE ──► Clone 1, Clone 2, ...
```

- 快照是**元数据级**，不拷贝数据。
- 增量脏页跟踪：只持久化自上次快照以来变化的匿名页。
- Cubelet 所有 rootfs / memory volume 操作都走 CubeCoW。

---

## 7. 网络层：CubeVS + CubeProxy + CubeEgress

### CubeVS 三个 eBPF 程序

| 程序 | 文件 | 挂载点 | 方向 | 作用 |
|---|---|---|---|---|
| `from_cube` | `CubeNet/src/mvmtap.bpf.c` | TAP TC ingress | Sandbox → Host | SNAT、策略、ARP 代理、L7 代理选择 |
| `from_world` | `CubeNet/src/nodenic.bpf.c` | 主机网卡 TC ingress | External → Host | 反向 NAT、端口映射 |
| `from_envoy` | `CubeNet/src/localgw.bpf.c` | cube-dev TC egress | Proxy → Sandbox | DNAT 到 Sandbox IP |

### CubeEgress

- 基于 OpenResty + Lua 的透明 L7 代理。
- 所有 HTTP/HTTPS 出站通过 TPROXY 拦截。
- 功能：域名/SNI/方法/路径白名单、凭证注入（secrets 不进入 Sandbox）、JSONL 审计日志。
- Sandbox 内信任 CubeEgress 自签 CA，实现 TLS 透明检查。

### CubeProxy

- OpenResty + Lua，支持 Host-based 和 Path-based 两种路由模式。
- 路由元数据来自 Redis。
- v0.5.1 支持多副本，与 cube-lifecycle-manager 配合实现 AutoPause/Resume。

---

## 8. 安全层

1. **硬件隔离**：每个 Sandbox 独立 KVM MicroVM + Guest Kernel。
2. **网络隔离**：CubeVS 默认拒绝私网/链路本地地址，支持 per-sandbox allow/deny。
3. **出站控制**：CubeEgress L7 域名白名单 + fail-closed。
4. **凭证保险库**：HTTP 头重写注入凭证，Sandbox 和模型上下文都看不到密钥。
5. **Seccomp**：CubeHypervisor 最小 syscall 白名单。
6. **入向访问令牌**：`allow_public_traffic=false` 的 Sandbox 会分配 `traffic_access_token`，CubeProxy 每次请求校验（v0.5.0+）。

---

## 9. 关键入口与协议文件

| 组件 | 入口 | gRPC/协议定义 |
|---|---|---|
| CubeAPI | `CubeAPI/src/main.rs` | `openapi.yml` |
| CubeMaster | `CubeMaster/cmd/cubemaster/app/main.go` | `CubeMaster/api/services/cubebox/v1/cubebox.proto` |
| Cubelet | `Cubelet/cmd/cubelet/main.go` | `Cubelet/api/services/cubebox/v1/cubebox.proto` |
| CubeShim | `CubeShim/shim/src/main.rs` | `CubeShim/protoc/protos/` |
| cube-lifecycle-manager | `cube-lifecycle-manager/cmd/cube-lifecycle-manager/main.go` | Redis stream / HTTP admin push |
| CubeHypervisor | `hypervisor/src/main.rs` | VMM 内部 API |

---

## 总结

v0.5.1 的架构核心变化是 **把 AutoPause/AutoResume 协调器从 CubeProxy sidecar 拆成独立的 `cube-lifecycle-manager` 控制面服务**，从而让 CubeProxy 可以水平扩展；同时通过 **三值 Timeout 语义** 把生命周期策略下沉到 CubeMaster，**Host-Mount 白名单** 加固主机目录访问。数据面（Cubelet → Shim → Hypervisor → CubeVS → CubeEgress）和控制面的 API/Master/Redis 分工在 0.5.1 保持稳定。

---

# 附录：打包与安装

## 1. 打包体系概览

CubeSandbox 提供两类部署交付物：

1. **单机一键安装包（one-click）**：面向单台 Linux 物理机 / 虚拟机，把控制面与数据面合并在同一节点。
2. **腾讯云 Terraform 集群部署**：面向生产多节点，使用 Terraform 在腾讯云创建 TKE 控制平面 + CVM 计算节点。

打包脚本集中在 `deploy/one-click/`，CI 工作流在 `.github/workflows/release-one-click.yml`。

---

## 2. 一键安装包构建流程

### 2.1 推荐入口

```bash
./deploy/one-click/build-release-bundle-builder.sh
```

该脚本的工作流程：

1. **拉起 builder 镜像**（`docker/Dockerfile.builder`）：统一包含 Go、Rust、protoc、BPF 工具链、Node.js 等。
2. **在 builder 容器内编译全部二进制**：
   - Go：`cubemaster`、`cubemastercli`、`cubelet`、`cubecli`、`network-agent`、`cubevsmapdump`
   - Rust：`cube-api`、`cube-agent`、`containerd-shim-cube-rs`、`cube-runtime`
   - CubeCoW SDK 静态库（`make cubecow-sdk`）
3. **回到宿主机调用底层打包脚本**：
   ```bash
   ./deploy/one-click/build-release-bundle.sh
   ```
4. **生成最终产物**：
   ```
   deploy/one-click/dist/cube-sandbox-one-click-<version>.tar.gz
   ```

### 2.2 底层打包脚本

`deploy/one-click/build-release-bundle.sh` 负责：

- 接收 `ONE_CLICK_*_BIN` 预编译产物（或自行编译）。
- 构建 WebUI 静态资源（`web/dist`，宿主机需 `npm`）。
- 构建 Guest 镜像：基于 `deploy/guest-image/Dockerfile` 生成本地 Guest Image（`cube-guest-image-cpu.img`），并把 `cube-agent` 注入为 `/sbin/init`。
- 打包内核产物：`vmlinux`（普通内核）与可选的 `vmlinux-pvm`（PVM 嵌套虚拟化内核）。
- 组装 `sandbox-package.tar.gz`、 CubeProxy / WebUI / support / systemd 模板。
- 生成 `release-manifest.json`：记录每个组件的版本、commit、构建时间、sha256。

### 2.3 产物内容

解压后的 release tarball 包含：

| 文件/目录 | 说明 |
|---|---|
| `sandbox-package.tar.gz` | 运行时核心包 |
| `release-manifest.json` | 发布清单，含各组件 sha256 |
| `CubeAPI/bin/cube-api` | REST API 网关二进制 |
| `containerd-shim-cube-rs` / `cube-runtime` | containerd shim 与运行时 |
| `cube-image/cube-guest-image-cpu.img` | Guest OS 镜像 |
| `cube-kernel-scf.zip` | 普通/PVM 内核打包 |
| `cubeproxy/` | CubeProxy OpenResty + Lua 上下文 |
| `support/` | MySQL/Redis Docker Compose 模板、mkcert |
| `webui/` | WebUI nginx 配置与 `web/dist` |
| `systemd/` | systemd unit 模板 |
| `cube-lifecycle-manager/` | v0.5.1 新增 CLM 部署模板 |
| `install.sh` / `install-compute.sh` / `down.sh` / `smoke.sh` | 安装/卸载/自检脚本 |
| `terraform/tencentcloud/` | 腾讯云集群部署 Terraform |

---

## 3. 安装流程

### 3.1 控制节点安装

```bash
tar -xzf cube-sandbox-one-click-<version>.tar.gz
cd cube-sandbox-one-click-<version>
cp env.example .env
sudo ./install.sh
```

安装路径固定为 `/usr/local/services/cubetoolbox`。

### 3.2 安装模式（v0.5.1）

`install.sh` 支持三种模式：

| 模式 | 行为 |
|---|---|
| `install`（默认） | 全新安装；若已存在安装会重置配置 |
| `upgrade` | 保留现有配置的升级；执行三向 env 合并、预检、备份 |
| `auto` | 检测到已有安装则升级，否则全新安装 |

升级流程关键点：

- **三向 env 合并**：新默认值 + 旧运行时 `.one-click.env` + 旧 `env.example` 基线 + 新的 `.env`，生成合并后的运行时配置。
- **预检（preflight）**：检查磁盘空间、semver 兼容性、CIDR 冲突等。
- **备份**：先备份旧配置再执行任何破坏性变更。
- **敏感信息脱敏**：diff 报告中隐藏密码，但实际合并文件保留。

### 3.3 计算节点安装

同一 release tarball 可在第二台机器上作为纯计算节点复用：

```bash
sudo ./install-compute.sh
```

计算节点只运行 `cube-sandbox-compute.target`（Cubelet、CubeEgress、network-agent 等），注册到已有控制平面。

### 3.4 systemd 服务

v0.5.1 新安装统一使用 systemd 管理，不再依赖旧的 shell up/down 脚本：

| Target / Service | 角色 | 说明 |
|---|---|---|
| `cube-sandbox-control.target` | 控制节点 | 汇总所有控制面服务 |
| `cube-sandbox-compute.target` | 计算节点 | 汇总所有数据面服务 |
| `cube-sandbox-cubemaster.service` | 控制面 | CubeMaster |
| `cube-sandbox-cube-api.service` | 控制面 | CubeAPI |
| `cube-sandbox-cube-lifecycle-manager.service` | 控制面 | v0.5.1 新增 AutoPause/Resume 协调器 |
| `cube-sandbox-cube-proxy.service` | 控制面 | 请求路由代理 |
| `cube-sandbox-cubelet.service` | 数据面 | 节点 Sandbox 生命周期 |
| `cube-sandbox-cube-egress.service` | 数据面 | L7 出站代理 |
| `cube-sandbox-network-agent.service` | 数据面 | CubeVS eBPF 网络控制面 |
| `cube-sandbox-mysql.service` | 依赖 | 本地 MySQL 容器 |
| `cube-sandbox-redis.service` | 依赖 | 本地 Redis 容器 |
| `cube-sandbox-webui.service` | 控制面 | WebUI nginx |

---

## 4. 关键配置映射

一键安装不把配置放到额外的全局 `configs/` 层，而是直接写入各组件原生路径：

| 源 | 目标 |
|---|---|
| `configs/single-node/cubemaster.yaml` | `CubeMaster/conf.yaml` |
| `Cubelet/config/` | `Cubelet/config/` |
| `Cubelet/dynamicconf/` | `Cubelet/dynamicconf/` |
| `configs/single-node/network-agent.yaml` | `network-agent/network-agent.yaml` |
| `support/` | `/usr/local/services/cubetoolbox/support/` |
| `cubeproxy/` | `/usr/local/services/cubetoolbox/cubeproxy/` |
| `webui/` | `/usr/local/services/cubetoolbox/webui/` |

核心环境变量在 `env.example` 中定义，运行时被 `install.sh` 渲染并持久化为 `.one-click.env`。

---

## 5. 腾讯云 Terraform 集群部署

`deploy/one-click/terraform/tencentcloud/` 提供生产级一键集群部署：

- **基础设施**：私有 VPC、子网、NAT 网关、安全组、堡垒机。
- **中间件**：TencentDB MySQL、TencentDB Redis、CFS 共享存储、TCR 私有镜像仓库。
- **TKE 控制平面**：Kubernetes v1.34.1，部署：
  - `cube-master`（多副本 + CFS 共享存储）
  - `cube-api`
  - `cube-proxy`（多副本）
  - `cube-webui`
  - `cube-lifecycle-manager`（v0.5.1 新增）
- **计算节点**：TKE 节点池/CVM，自动扩缩容。

入口脚本：

- `create.sh`：创建集群。
- `destroy.sh`：销毁集群。
- `validate.sh`：预检。

---

## 6. CI/CD 发布流程

`.github/workflows/release-one-click.yml` 在推送 `v*` 标签时触发：

1. `verify_versions`：检查硬编码镜像标签与发布标签一致。
2. `build_pvm_guest_vmlinux`：构建 PVM Guest 内核。
3. `release_docker_images`：构建并推送多架构组件镜像到 GHCR/TCR。
4. `release_amd64` / `release_arm64`：分别在原生 runner 上构建一键安装包。
5. 上传产物到同一个 GitHub Release。

---

## 7. 关键打包/安装文件索引

| 文件 | 作用 |
|---|---|
| `deploy/one-click/build-release-bundle-builder.sh` | 推荐打包入口 |
| `deploy/one-click/build-release-bundle.sh` | 底层打包脚本 |
| `deploy/one-click/build-vm-assets.sh` | 构建 shim、runtime、agent、guest image |
| `deploy/one-click/install.sh` | 控制节点安装入口 |
| `deploy/one-click/install-compute.sh` | 计算节点安装入口 |
| `deploy/one-click/down.sh` | 停止服务 |
| `deploy/one-click/smoke.sh` | 健康检查 |
| `deploy/one-click/env.example` | 环境变量模板 |
| `deploy/one-click/config-cube.toml` | 默认运行时配置模板 |
| `deploy/one-click/systemd/*.service` | systemd unit 模板 |
| `deploy/one-click/terraform/tencentcloud/create.sh` | 腾讯云集群部署入口 |
| `docker/Dockerfile.builder` | 统一构建镜像 |
| `deploy/guest-image/Dockerfile` | Guest OS 镜像构建 |
| `.github/workflows/release-one-click.yml` | 一键包 CI 发布 |
| `.github/workflows/release-docker-images.yml` | 组件镜像 CI 发布 |

---

## 8. 安装后验证

```bash
sudo ./smoke.sh          # 健康检查
sudo systemctl status cube-sandbox-control.target
open http://<target-host>:12088   # WebUI
```

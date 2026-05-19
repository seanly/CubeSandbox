# 01 — 对比总览：CubeSandbox 与 E2B Infrastructure

## 摘要

| | **E2B Infrastructure** (`e2b-dev/infra`) | **CubeSandbox**（本仓库） |
|---|------------------------------------------|---------------------------|
| **角色** | [E2B](https://e2b.dev) 云平台后端 | 高性能、可自建的沙箱服务 |
| **SDK** | E2B 原生目标 | **兼容 E2B REST API**（改 URL 即可） |
| **虚拟化** | Firecracker microVM | KVM / RustVMM，普通云 VM 可用 **PVM** |
| **编排** | Nomad + Consul | CubeMaster + Cubelet |
| **主数据库** | PostgreSQL（文档以 Supabase 为例） | MySQL 8 |
| **部署** | Terraform 多节点池集群 | 一键 / 离线包 / 多机 |
| **最适合** | 在 GCP/AWS 复刻 E2B SaaS | 私有化 Agent 执行、成本/密度/延迟 |

两套方案**不是同一套二进制**，解决的都是 AI Agent 隔离执行，但运维模型不同。

---

## 问题域

两者均提供：

- 硬件级隔离（每个沙箱独立 Guest 内核）
- 创建/连接/销毁沙箱的 REST 与 SDK
- 模板与镜像构建流水线
- 按沙箱暴露端口，供 SDK 客户端访问

差异在于：开箱即用的**云产品能力**（鉴权、计费、分析、边缘）vs **更精简的运行时**。

---

## 功能对比矩阵

| 维度 | E2B Infra | CubeSandbox |
|------|-----------|-------------|
| **开源** | 是 | 是 |
| **E2B SDK 兼容** | 原生 | 是（`E2B_API_URL` → CubeAPI `:3000`） |
| **冷启动（宣传）** | 资源池；非百毫秒营销 | **裸金属 &lt;60ms**（见文档 05） |
| **单沙箱内存开销** | 完整 microVM | **&lt;5MB** 级（≤32GB 规格，CoW） |
| **隔离** | Firecracker | MicroVM + **CubeVS eBPF** |
| **API** | Gin (Go) | cube-api（E2B 兼容） |
| **VM 内守护进程** | Envd | cube-agent |
| **调度** | Nomad + orchestrator 池 | CubeMaster → Cubelet |
| **边缘路由** | client-proxy + Cloudflare | CubeProxy + CoreDNS（`cube.app`） |
| **鉴权** | Supabase JWT | 可选；本地可用 `dummy` |
| **缓存** | Redis | Redis |
| **分析** | ClickHouse + Grafana 栈 | Web UI；运维组件更轻 |
| **模板存储** | GCS/S3 + NFS/Filestore | OCI 镜像 + 本地/SCF 包 |
| **云目标** | GCP（成熟）、AWS（Beta） | 裸金属、PVM 云主机、WSL2、多机 |
| **单机生产** | 非设计目标 | 支持（一键） |
| **多租户 SaaS** | 围绕 Postgres 用户/团队 | 需自建或扩展 |

---

## 技术栈概览

### E2B Infrastructure

| 包/区域 | 职责 |
|---------|------|
| `packages/api` | REST、鉴权、OpenAPI |
| `packages/orchestrator` | Firecracker、NBD、网络 |
| `packages/envd` | VM 内进程/文件 API |
| `packages/client-proxy` | 边缘路由、Consul |
| `packages/db` | PostgreSQL（sqlc） |
| `iac/provider-gcp`、`aws` | Terraform、Nomad、Packer |

### CubeSandbox

| 组件 | 职责 |
|------|------|
| **CubeAPI** | E2B 兼容网关 |
| **CubeMaster** | 调度、集群元数据（`:8089`） |
| **CubeProxy** | Host 路由 |
| **Cubelet** | 节点沙箱生命周期 |
| **network-agent** | TAP、CubeVS |
| **CubeHypervisor / CubeShim** | KVM microVM + containerd |
| **CubeVS** | eBPF 网络策略 |
| `deploy/one-click` | 发布包与安装脚本 |

---

## 性能数据语境（README）

CubeSandbox 相对 Docker/传统 VM 的对比中，**启动时延在裸金属上测得**，例如：

- 单并发约 60ms
- 50 并发平均约 67ms，P95 约 90ms，P99 约 137ms

**普通云 VM + PVM** 上不要默认等同上述数字，请用 [`examples/cube-bench`](https://github.com/tencentcloud/CubeSandbox/tree/master/examples/cube-bench) 在目标规格上实测。

---

## 共存关系

- 不能把 CubeSandbox 直接当作 E2B Nomad 里的一个 Job 无改造挂载。
- **可以**对两套后端只改 `E2B_API_URL`/域名使用同一 E2B SDK。
- **可以**并行运行两套集群服务不同负载，见 [06 — 选型与迁移](./06-selection-and-migration.md)。

---

## 后续阅读

- [02 — 架构对比](./02-architecture-comparison.md)
- [03 — CubeSandbox 部署指南](./03-cubesandbox-deployment-guide.md)
- [05 — 运行环境与性能](./05-runtime-environment-performance.md)

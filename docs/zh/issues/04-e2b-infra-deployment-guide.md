# 04 — E2B Infrastructure 部署指南

自建 **[E2B Infrastructure](https://github.com/e2b-dev/infra)** 的参考说明，便于与 CubeSandbox 评估对照。权威步骤见上游 `self-host.md`。

---

## 部署内容概览

### Nomad 服务（节选）

| Job | 职责 |
|-----|------|
| api | REST、鉴权 |
| orchestrator | Firecracker 生命周期 |
| client-proxy | 边缘路由 |
| template-manager | 模板构建 |
| clickhouse / loki / otel | 分析与可观测性 |
| ingress | Traefik 入口 |

### 数据与存储

| 组件 | 用途 |
|------|------|
| PostgreSQL | 主元数据（文档常指 Supabase） |
| Redis | 缓存 |
| ClickHouse | 分析 |
| GCS/S3 | 内核、Firecracker、模板 |

---

## 支持云厂商

| 云 | 状态 |
|----|------|
| GCP | 成熟 |
| AWS | Beta |
| Azure / 通用 Linux | 规划中 |

---

## 前置条件

### 工具

Terraform **v1.5.x**、Packer、Go、Docker+buildx、NPM、gcloud/aws cli。

### 账号与服务

| 项 | 必需 |
|----|------|
| Cloudflare + 域名 | 是 |
| PostgreSQL 连接串 | 是 |
| Supabase JWT | 可选（Dashboard） |
| Grafana/PostHog | 可选 |

### GCP 配额示例

Persistent Disk SSD ≥2500GB、CPU ≥24 等（见 `self-host.md`）。

---

## GCP 部署流程

| 步骤 | 操作 |
|------|------|
| 1 | `.env.gcp.template` → `.env.prod` |
| 2 | `make switch-env ENV=prod` |
| 3 | `make provider-login` → `make init` |
| 4 | `make build-and-upload` → `make copy-public-builds` |
| 5 | GCP Secrets Manager 填入 Cloudflare、Postgres 等 |
| 6 | `make plan-without-jobs` → `apply` |
| 7 | 等待 TLS |
| 8 | `make plan` → `apply`（Nomad Jobs + 迁移） |
| 9 | `make prep-cluster` |

### 节点池（逻辑）

- **control-server**：Nomad/Consul
- **api**：API、Ingress、client-proxy、遥测
- **orchestrator**：Firecracker（需 KVM）
- **build**：模板构建
- **clickhouse**：分析

---

## AWS 部署流程（Beta）

1. `.env` 设置 `PROVIDER=aws`
2. `make init`、Secrets Manager 填密钥
3. Packer 构建 AMI：`iac/provider-aws/nomad-cluster-disk-image`
4. `build-and-upload`、`copy-public-builds`
5. `plan-without-jobs` → `apply` → `plan` → `apply`
6. `prep-cluster`

**Client 池**需裸金属或嵌套虚拟化实例（如 `m8i.4xlarge` 类），并确认区域配额。

---

## 常用 Make 目标

| 命令 | 说明 |
|------|------|
| `make init` | 初始化 Terraform |
| `make plan` / `apply` | 含 Nomad Jobs |
| `make plan-without-jobs` | 仅基础设施 |
| `make build-and-upload` | 构建并上传镜像/二进制 |
| `make prep-cluster` | 初始用户/团队/模板 |
| `make destroy` | 销毁 |

---

## 客户端配置

```python
sandbox = Sandbox.create(domain="<your-domain>")
```

```bash
E2B_DOMAIN=<your-domain> e2b <command>
```

---

## 与 CubeSandbox 部署成本对比

| 维度 | E2B Infra | CubeSandbox |
|------|-----------|-------------|
| 首沙箱时间 | 小时～天 | 分钟级 |
| 最小集群 | 多节点池 | 单机即可 |
| IaC | 必须 Terraform | 脚本/离线包 |
| 普通云 VM 无 KVM | 不适合做 orchestrator 节点 | **PVM 路径** |

---

## 何时选 E2B 自建

- 需要与 e2b.dev **产品能力对齐**（团队、Dashboard、分析链）
- 已有 **GCP/AWS + Terraform + Nomad** 运维体系
- 明确使用 **Firecracker** 技术栈

Agent 私有化、普通云 VM、毫秒级创建（裸金属验证）优先看 [03 — Cube 部署](./03-cubesandbox-deployment-guide.md)。

---

## 参考

- https://github.com/e2b-dev/infra/blob/main/self-host.md
- 工作区：`infra/CLAUDE.md`

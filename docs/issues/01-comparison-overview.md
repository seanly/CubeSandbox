# 01 — Comparison Overview: CubeSandbox vs E2B Infrastructure

## Executive summary

| | **E2B Infrastructure** (`e2b-dev/infra`) | **CubeSandbox** (this repo) |
|---|------------------------------------------|-----------------------------|
| **Role** | Backend for the full [E2B](https://e2b.dev) cloud product | High-performance, self-hostable sandbox service |
| **SDK** | Native E2B SDK target | **E2B-compatible** REST API (drop-in URL swap) |
| **Hypervisor** | Firecracker microVMs | KVM / RustVMM (CubeHypervisor) + optional **PVM** on standard cloud VMs |
| **Orchestration** | Nomad + Consul | CubeMaster + Cubelet |
| **Primary DB** | PostgreSQL (Supabase documented) | MySQL 8 |
| **Deploy model** | Terraform multi-pool cloud cluster | One-click / offline bundle / multi-node |
| **Best fit** | Replicate E2B SaaS on GCP/AWS | Private Agent execution, cost/density/latency focus |

The two projects are **not interchangeable binaries**. They solve overlapping problems (isolated code execution for AI agents) with different operational models.

---

## Problem space

Both stacks provide:

- Hardware-isolated execution environments (dedicated guest kernel per sandbox)
- REST (and SDK) APIs to create, connect to, and destroy sandboxes
- Template/build pipelines for custom images
- Per-sandbox networking and port exposure for SDK clients

They differ in **how much “cloud product”** you get out of the box (auth, billing, analytics, edge routing) vs **how lean** the runtime can be.

---

## Feature comparison matrix

| Dimension | E2B Infra | CubeSandbox |
|-----------|-----------|-------------|
| **Open source** | Yes | Yes |
| **E2B SDK compatible** | Native | Yes (`E2B_API_URL` → CubeAPI `:3000`) |
| **Cold start (advertised)** | Pool-based; not sub-100ms marketed | **&lt;60ms** on bare metal (see doc 05) |
| **Per-sandbox memory overhead** | Full microVM | **&lt;5MB** base (≤32GB spec, CoW) |
| **Isolation** | Firecracker VM | MicroVM + **CubeVS eBPF** policies |
| **API framework** | Gin (Go) | cube-api (E2B-compatible) |
| **In-VM daemon** | Envd (Connect RPC) | cube-agent |
| **Scheduler** | Nomad jobs on orchestrator pool | CubeMaster → Cubelet |
| **Edge routing** | client-proxy + Cloudflare | CubeProxy + CoreDNS (`cube.app`) |
| **Auth** | Supabase JWT | Optional; local `dummy` key |
| **Cache / state** | Redis | Redis |
| **Analytics** | ClickHouse + Grafana stack | Web UI; lighter built-in ops |
| **Template storage** | GCS/S3 + NFS/Filestore | OCI images + local/SCF bundles |
| **Cloud targets** | GCP (mature), AWS (beta) | Bare metal, PVM cloud VM, WSL2, multi-node |
| **Single-machine prod** | Not designed for | Supported (one-click) |
| **Multi-tenant SaaS** | Built around Postgres teams/users | Bring your own or extend |

---

## Technology stack

### E2B Infrastructure (Go monorepo + IaC)

| Package / area | Purpose |
|----------------|---------|
| `packages/api` | REST API, auth, OpenAPI |
| `packages/orchestrator` | Firecracker lifecycle, NBD, networking |
| `packages/envd` | In-VM process/filesystem API |
| `packages/client-proxy` | Edge routing, Consul discovery |
| `packages/db` | PostgreSQL migrations (sqlc) |
| `packages/clickhouse` | Analytics |
| `iac/provider-gcp`, `iac/provider-aws` | Terraform, Nomad jobs, Packer AMIs |

### CubeSandbox (Rust + Go)

| Component | Purpose |
|-----------|---------|
| **CubeAPI** | E2B-compatible gateway |
| **CubeMaster** | Scheduling, cluster meta (`:8089`) |
| **CubeProxy** | `<port>-<sandbox_id>.<domain>` routing |
| **Cubelet** | Node sandbox lifecycle |
| **network-agent** | TAP, CubeVS integration |
| **CubeHypervisor / CubeShim** | KVM microVM + containerd shim |
| **CubeVS** | eBPF isolation and egress policy |
| `deploy/one-click` | Release bundle and installers |

---

## Benchmark context (CubeSandbox README)

CubeSandbox publishes comparisons vs Docker and traditional VMs. **Startup numbers are measured on bare metal**, for example:

- Single concurrency: ~60ms create latency
- 50 concurrent creates: avg ~67ms, P95 ~90ms, P99 ~137ms

Do not assume identical numbers on **PVM + ordinary cloud VM** without running [`examples/cube-bench`](https://github.com/tencentcloud/CubeSandbox/tree/master/examples/cube-bench) on your SKU.

---

## Coexistence

- **Cannot** mount CubeSandbox as a Nomad task inside E2B Infra’s orchestrator pool without custom integration.
- **Can** use the same **E2B SDK** against either backend by changing `E2B_API_URL` / domain.
- **Can** run separate clusters (E2B self-host + CubeSandbox) for different workloads; see [06 — Selection & migration](./06-selection-and-migration.md).

---

## Next documents

- [02 — Architecture comparison](./02-architecture-comparison.md)
- [03 — CubeSandbox deployment guide](./03-cubesandbox-deployment-guide.md)
- [05 — Runtime environment & performance](./05-runtime-environment-performance.md)

# 03 — CubeSandbox Deployment Guide

Comprehensive deployment reference for CubeSandbox. For interactive install, prefer [Quick Start](../guide/quickstart.md).

---

## Deployment scenarios

| ID | Scenario | Doc / entry | KVM | Best for |
|----|----------|-------------|-----|----------|
| **A** | Online one-click (bare metal / KVM cloud) | `deploy/one-click/online-install.sh` | Native `/dev/kvm` | Fastest POC |
| **B** | Online one-click + **PVM** | Same + `CUBE_PVM_ENABLE=1` | `kvm_pvm` | Ordinary cloud VM |
| **C** | Self-build offline bundle | `build-release-bundle-builder.sh` | Native or PVM | Air-gap, custom bits |
| **D** | Multi-node cluster | `install-compute.sh` | Per node | Scale-out compute |
| **E** | Dev environment (QEMU) | `dev-env/` | Inside VM | Laptop / macOS host |
| **F** | PVM kernel only migration | [PVM deploy](../guide/pvm-deploy.md) | Switch kernel, no reinstall | Existing install → PVM |

---

## Hardware and OS requirements

### Common (all production paths)

| Requirement | Detail |
|-------------|--------|
| Architecture | **x86_64** |
| RAM | ≥ 8 GB (≥ 16 GB recommended production) |
| Disk | ≥ 50 GB system; **`/data/cubelet` on XFS** recommended (separate volume) |
| OS | OpenCloudOS 9 (recommended), Ubuntu 22.04+ |
| Privilege | **root** for install scripts |
| Docker | Running (MySQL, Redis, CubeProxy nginx) |
| Tools on target | `tar`, `rg`, `ss`; DNS via systemd-resolved or NetworkManager+dnsmasq |

### Path-specific

| Path | Extra requirement |
|------|-------------------|
| **A, C, D** (native KVM) | `ls /dev/kvm` readable; **no nested virt** for self-build bare-metal doc |
| **B, F** (PVM) | PVM host kernel (`cube.pvm.host`), `modprobe kvm_pvm`, guest `vmlinux-pvm` |
| **E** | Host with QEMU; not production |

::: warning Nested virtualization
[Self-build deploy](../guide/self-build-deploy.md) states bare-metal/physical and **does not support nested virtualization** for that path. Cloud users without `/dev/kvm` must use **PVM (B)**, not standard guest kernel only.
:::

---

## Architecture: single control node

```
┌─────────────────────────────────────────────────────────┐
│ Control node (all-in-one)                                │
│  cube-api :3000  │  CubeMaster :8089  │  Cubelet        │
│  network-agent   │  CubeShim (host)    │  cube-runtime  │
│  MySQL + Redis (Docker)  │  CubeProxy + CoreDNS (Docker) │
│  Default install: /usr/local/services/cubetoolbox        │
└─────────────────────────────────────────────────────────┘
```

---

## Scenario A — Online install (native KVM)

### Install

```bash
# Global
curl -sL https://github.com/tencentcloud/CubeSandbox/raw/master/deploy/one-click/online-install.sh | bash

# China mirror
curl -sL https://cnb.cool/CubeSandbox/CubeSandbox/-/git/raw/master/deploy/one-click/online-install.sh | MIRROR=cn bash
```

### Post-install

1. Create template: `cubemastercli tpl create-from-image ...`
2. Watch: `cubemastercli tpl watch --job-id <id>`
3. Health: `smoke.sh` in install dir or `curl http://127.0.0.1:3000/health`

### Client env

```bash
export E2B_API_URL=http://<host>:3000
export E2B_API_KEY=dummy
export CUBE_TEMPLATE_ID=<template-id>
export SSL_CERT_FILE=/root/.local/share/mkcert/rootCA.pem
```

---

## Scenario B — Online install with PVM

Prerequisites: [PVM deploy](../guide/pvm-deploy.md) — host kernel, reboot, `kvm_pvm` loaded.

```bash
curl -sL https://cnb.cool/CubeSandbox/CubeSandbox/-/git/raw/master/deploy/one-click/online-install.sh \
  | CUBE_PVM_ENABLE=1 MIRROR=cn bash
```

Verify install log contains:

```text
[one-click] CUBE_PVM_ENABLE=1, installed PVM guest kernel as .../cube-kernel-scf/vmlinux
```

**Pitfall**: If `cp env.example .env` exists with `CUBE_PVM_ENABLE=0`, installer overrides shell env — set in `.env` before `install.sh`.

---

## Scenario C — Self-build release bundle

### Build machine

| Tool | Purpose |
|------|---------|
| Docker | Builder image |
| `make` | Build orchestration |
| `vmlinux` | Place under `deploy/one-click/assets/kernel-artifacts/` |
| Optional `vmlinux-pvm` | PVM guest kernel in same dir |

```bash
cd CubeSandbox
./deploy/one-click/build-release-bundle-builder.sh
# Output: deploy/one-click/dist/cube-sandbox-one-click-<git-sha>.tar.gz
```

### Target machine

```bash
tar -xzf cube-sandbox-one-click-*.tar.gz
cd cube-sandbox-one-click-*
cp env.example .env
# Optional: CUBE_SANDBOX_NODE_IP=<ip>
sudo ./install.sh
sudo ./smoke.sh
```

Environment reference: `deploy/one-click/env.example`.

---

## Scenario D — Multi-node cluster

### Control node

Standard `install.sh` (scenarios A–C).

### Compute node

`.env` keys:

```bash
ONE_CLICK_DEPLOY_ROLE=compute
CUBE_SANDBOX_NODE_IP=<this-node-ip>
ONE_CLICK_CONTROL_PLANE_IP=<control-ip>
# Or explicit:
# ONE_CLICK_CONTROL_PLANE_CUBEMASTER_ADDR=<control-ip>:8089
```

```bash
sudo ./install-compute.sh
sudo ./smoke.sh
```

### Network firewall

| From | To | Port | Service |
|------|-----|------|---------|
| Compute nodes | Control node | **8089** | CubeMaster / meta API |
| Clients | Control node | **3000** | CubeAPI |
| Clients | Control node | **443** (or proxy port) | CubeProxy HTTPS |

Verify registration on control node:

```bash
curl http://127.0.0.1:8089/internal/meta/nodes
```

---

## Port reference

| Port | Component | Notes |
|------|-----------|-------|
| 3000 | cube-api | E2B-compatible HTTP |
| 8089 | CubeMaster | Scheduling, `/internal/meta` |
| 49983, 49999 | Guest | Template-dependent (agent / probe) |
| 443 / proxy | CubeProxy | `*.cube.app` pattern |
| 3306 | MySQL | Docker, internal |
| 6379 | Redis | Docker, internal |

---

## Directory layout (default)

| Path | Content |
|------|---------|
| `/usr/local/services/cubetoolbox` | Binaries, configs, scripts |
| `/data/cubelet` | Sandbox runtime data (configure disk) |
| `/usr/local/bin/containerd-shim-cube-rs` | Shim symlinks |
| `~/.local/share/mkcert/` or `/root/...` | TLS CA for dev HTTPS |

---

## Deployment checklist

### Pre-flight

- [ ] x86_64 Linux with sufficient RAM/disk
- [ ] Docker installed and running
- [ ] For native KVM: `/dev/kvm` present
- [ ] For PVM: PVM host kernel booted, `kvm_pvm` in `lsmod`
- [ ] Outbound internet for images (or private registry mirror)
- [ ] `CUBE_SANDBOX_NODE_IP` correct on multi-homed hosts

### Install

- [ ] `install.sh` or `install-compute.sh` exit 0
- [ ] `smoke.sh` / `curl :3000/health` OK
- [ ] Template `READY` via `cubemastercli`
- [ ] E2B SDK smoke test (`e2b-code-interpreter`)

### Production hardening (beyond one-click)

- [ ] Replace `E2B_API_KEY=dummy` — [Authentication](../guide/authentication.md)
- [ ] Real TLS / domain — [HTTPS & domain](../guide/https-and-domain.md)
- [ ] Backup MySQL volume
- [ ] Monitor Cubelet/CubeMaster logs
- [ ] Run `cube-bench` at expected concurrency

---

## Troubleshooting quick links

| Symptom | Check |
|---------|-------|
| PVM not active | `grep CUBE_PVM_ENABLE` in `.one-click.env`; guest kernel log at install |
| No `/dev/kvm` | PVM path vs wrong kernel |
| Compute not in cluster | Firewall 8089; `ONE_CLICK_CONTROL_PLANE_IP` |
| SDK hits E2B cloud | `E2B_API_URL` unset |
| HTTPS errors | `SSL_CERT_FILE` → mkcert root CA |

Official: [Troubleshooting](../guide/troubleshooting/index.md), [PVM FAQ](../guide/pvm-deploy.md#troubleshooting).

---

## Related

- [05 — Runtime environment & performance](./05-runtime-environment-performance.md)
- [06 — Selection & migration](./06-selection-and-migration.md)

# 03 — CubeSandbox 部署指南

CubeSandbox 全场景部署参考。日常安装请优先 [快速开始](../guide/quickstart.md)。

---

## 部署场景一览

| 编号 | 场景 | 入口 | KVM | 适用 |
|------|------|------|-----|------|
| **A** | 线上一键（裸金属/KVM 云） | `online-install.sh` | 原生 `/dev/kvm` | 最快体验 |
| **B** | 线上一键 + **PVM** | 同上 + `CUBE_PVM_ENABLE=1` | `kvm_pvm` | 普通云服务器 |
| **C** | 源码离线包 | `build-release-bundle-builder.sh` | 原生或 PVM | 内网、定制 |
| **D** | 多机集群 | `install-compute.sh` | 每节点 | 算力扩展 |
| **E** | QEMU 开发环境 | `dev-env/` | VM 内 | 本机开发 |
| **F** | 已有集群切 PVM | [PVM 部署](../guide/pvm-deploy.md) | 换内核 | 无需重装业务组件 |

---

## 硬件与系统要求

### 通用

| 项 | 要求 |
|----|------|
| 架构 | **x86_64** |
| 内存 | ≥8GB（生产建议 ≥16GB） |
| 磁盘 | 系统盘 ≥50GB；**`/data/cubelet` 建议 XFS 独立盘** |
| 系统 | OpenCloudOS 9（推荐）、Ubuntu 22.04+ |
| 权限 | **root** 执行安装脚本 |
| Docker | 已运行（MySQL、Redis、CubeProxy） |

### 分场景

| 场景 | 额外要求 |
|------|----------|
| A/C/D | `ls /dev/kvm` 可用；自建文档写明裸金属路径**不支持嵌套虚拟化** |
| B/F | PVM 宿主机内核、`kvm_pvm`、guest `vmlinux-pvm` |

---

## 单机控制面架构

```
┌──────────────────────────────────────────────┐
│ 控制节点（All-in-One）                         │
│ cube-api:3000 │ CubeMaster:8089 │ Cubelet    │
│ network-agent │ CubeShim                        │
│ MySQL+Redis(Docker) │ CubeProxy+CoreDNS(Docker) │
│ 默认路径: /usr/local/services/cubetoolbox      │
└──────────────────────────────────────────────┘
```

---

## 场景 A — 线上一键（原生 KVM）

```bash
# 国际
curl -sL https://github.com/tencentcloud/CubeSandbox/raw/master/deploy/one-click/online-install.sh | bash

# 国内镜像
curl -sL https://cnb.cool/CubeSandbox/CubeSandbox/-/git/raw/master/deploy/one-click/online-install.sh | MIRROR=cn bash
```

安装后：创建模板 → `cubemastercli tpl watch` → `smoke.sh`。

客户端：

```bash
export E2B_API_URL=http://<主机>:3000
export E2B_API_KEY=dummy
export CUBE_TEMPLATE_ID=<模板ID>
export SSL_CERT_FILE=/root/.local/share/mkcert/rootCA.pem
```

---

## 场景 B — PVM 云主机

先完成 [PVM 部署](../guide/pvm-deploy.md)（宿主机内核、重启、`kvm_pvm`）。

```bash
curl -sL https://cnb.cool/CubeSandbox/CubeSandbox/-/git/raw/master/deploy/one-click/online-install.sh \
  | CUBE_PVM_ENABLE=1 MIRROR=cn bash
```

确认日志含：`CUBE_PVM_ENABLE=1, installed PVM guest kernel`。

**注意**：若目录内 `.env` 含 `CUBE_PVM_ENABLE=0`，会覆盖 shell 环境变量。

---

## 场景 C — 离线发布包

**构建机**：

```bash
# 将 vmlinux 放入 deploy/one-click/assets/kernel-artifacts/
./deploy/one-click/build-release-bundle-builder.sh
# 产出: deploy/one-click/dist/cube-sandbox-one-click-<sha>.tar.gz
```

**目标机**：

```bash
tar -xzf cube-sandbox-one-click-*.tar.gz && cd cube-sandbox-one-click-*
cp env.example .env
sudo ./install.sh && sudo ./smoke.sh
```

环境变量详见 `deploy/one-click/env.example`。

---

## 场景 D — 多机集群

**计算节点 `.env`**：

```bash
ONE_CLICK_DEPLOY_ROLE=compute
CUBE_SANDBOX_NODE_IP=<本机IP>
ONE_CLICK_CONTROL_PLANE_IP=<控制节点IP>
```

```bash
sudo ./install-compute.sh
```

**防火墙**：计算节点 → 控制节点 **TCP 8089**。

控制节点验证：

```bash
curl http://127.0.0.1:8089/internal/meta/nodes
```

详见 [多机集群部署](../guide/multi-node-deploy.md)。

---

## 端口表

| 端口 | 组件 |
|------|------|
| 3000 | cube-api（E2B 兼容） |
| 8089 | CubeMaster |
| 49983/49999 | 来宾内服务（随模板） |
| 443 等 | CubeProxy |

---

## 部署检查清单

**安装前**

- [ ] x86_64、内存/磁盘满足要求
- [ ] Docker 正常
- [ ] 原生 KVM 或 PVM 内核就绪
- [ ] 多网卡时设置 `CUBE_SANDBOX_NODE_IP`

**安装后**

- [ ] `smoke.sh` / `/health` 通过
- [ ] 模板状态 `READY`
- [ ] E2B SDK 冒烟测试
- [ ] 生产前跑 `cube-bench`

**生产加固**

- [ ] 替换 `dummy` API Key → [鉴权](../guide/authentication.md)
- [ ] 正式域名/TLS → [HTTPS](../guide/https-and-domain.md)
- [ ] MySQL 备份

---

## 相关文档

- [05 — 运行环境与性能](./05-runtime-environment-performance.md)
- [06 — 选型与迁移](./06-selection-and-migration.md)

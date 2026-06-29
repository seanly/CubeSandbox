# 部署指南

## 前置条件

### 硬件

- x86_64 架构
- `/dev/kvm` 可用（裸机）或使用 PVM 模式（普通云 VM）
- 内存 ≥ 8GB
- `/data/cubelet` 所在文件系统为 **XFS**

### 软件

- Linux 系统（OpenCloudOS 9 / Rocky Linux 9 / Ubuntu 22.04+）
- Docker 已安装并运行
- systemd
- root 权限

## 部署流程

```bash
# 1. 解压发布包
tar -xzf cube-sandbox-one-click-<version>.tar.gz
cd cube-sandbox-one-click-<version>

# 2. 配置环境变量
cp env.example .env

# 3. 安装
sudo ./install.sh
```

## install.sh 执行流程

```
1. 预检检查
   ├── /dev/kvm 可用性
   ├── 内存 >= 8GB
   ├── /data/cubelet 文件系统为 XFS
   ├── cgroup v2 cpu 控制器
   └── 依赖工具（tar, rg, ss, systemctl, docker）

2. 安装依赖
   ├── ripgrep
   ├── Docker（如缺失）
   └── 配置 Docker 镜像加速（可选）

3. 解压发布包到临时目录

4. 停止现有部署

5. 安装文件到 /usr/local/services/cubetoolbox

6. 选择 Guest 内核
   ├── CUBE_PVM_ENABLE=0: 使用普通 vmlinux
   └── CUBE_PVM_ENABLE=1: 用 vmlinux-pvm 覆盖 vmlinux

7. 创建日志/数据目录

8. 生成 .one-click.env 环境配置文件

9. 创建 /usr/local/bin 符号链接

10. 安装 systemd 服务单元

11. 启动 systemd target

12. 运行 quickcheck 健康检查
```

## 启动的服务

### 控制节点（`cube-sandbox-control.target`）

| systemd 服务 | 类型 | 说明 | 依赖 |
|--------------|------|------|------|
| `cube-sandbox-mysql.service` | Docker 容器 | MySQL 数据库 | — |
| `cube-sandbox-redis.service` | Docker 容器 | Redis 缓存 | — |
| `cube-sandbox-cubemaster.service` | 主机进程 | 控制平面 | MySQL、Redis |
| `cube-sandbox-cube-api.service` | 主机进程 | REST API（端口 3000） | CubeMaster |
| `cube-sandbox-network-agent.service` | 主机进程 | 网络编排（eBPF） | — |
| `cube-sandbox-cubelet.service` | 主机进程 | 节点代理 | network-agent |
| `cube-sandbox-cube-proxy.service` | Docker 容器 | TLS 反向代理 | — |
| `cube-sandbox-coredns.service` | Docker 容器 | DNS 服务 | — |
| `cube-sandbox-dns.service` | 系统配置 | `*.cube.app` 路由 | — |
| `cube-sandbox-webui.service` | 主机进程 | Web 管理界面 | cube-api |
| `cube-sandbox-seed-cubemaster-metrics.timer` | timer | 定时指标采集 | — |

### 计算节点（`cube-sandbox-compute.target`）

用于多节点扩展，只启动核心服务：

- `cube-sandbox-network-agent.service`
- `cube-sandbox-cubelet.service`

## 服务依赖关系

```
cube-sandbox-control.target
    │
    ├── MySQL ──▶ Redis ──▶ CubeMaster ──▶ CubeAPI
    │
    ├── network-agent ──▶ cubelet
    │
    ├── CubeProxy + CoreDNS + DNS路由
    │
    └── WebUI
```

## 安装目录结构

```
/usr/local/services/cubetoolbox/
├── .one-click.env
├── CubeAPI/bin/cube-api
├── CubeMaster/bin/cubemaster
├── CubeMaster/bin/cubemastercli
├── CubeMaster/conf.yaml
├── Cubelet/bin/cubelet
├── Cubelet/bin/cubecli
├── Cubelet/config/
├── Cubelet/dynamicconf/
├── network-agent/bin/network-agent
├── network-agent/network-agent.yaml
├── cube-shim/bin/containerd-shim-cube-rs
├── cube-shim/bin/cube-runtime
├── cube-shim/conf/config-cube.toml
├── cube-kernel-scf/vmlinux
├── cube-kernel-scf/vmlinux-pvm
├── cube-image/cube-guest-image-cpu.img
├── cubeproxy/
├── coredns/
├── webui/dist/
├── support/
├── systemd/
├── scripts/
└── sql/
```

## 日志路径

| 组件 | 日志位置 |
|------|----------|
| cube-api | `/data/log/CubeAPI/` |
| CubeMaster | `/data/log/CubeMaster/` |
| Cubelet | `/data/log/Cubelet/` |
| CubeShim | `/data/log/CubeShim/` |
| Hypervisor/VMM | `/data/log/CubeVmm/` |
| CubeProxy | `/data/log/cube-proxy/` |
| 进程 stdout/stderr | `/var/log/cube-sandbox-one-click/` |

## 常用管理命令

```bash
# 查看所有服务状态
systemctl status cube-sandbox-control.target

# 停止所有服务
sudo ./down.sh

# 重启所有服务
sudo systemctl restart cube-sandbox-control.target

# 健康检查
sudo ./smoke.sh

# 查看各组件日志
journalctl -u cube-sandbox-cubelet -f
journalctl -u cube-sandbox-cubemaster -f
journalctl -u cube-sandbox-cube-api -f
journalctl -u cube-sandbox-network-agent -f
```

## PVM 模式部署

如果在普通云服务器（非裸机）上部署，需要启用 PVM 模式：

```bash
# .env
CUBE_PVM_ENABLE=1
```

PVM 需要宿主机运行 PVM-enabled 内核。相关脚本位于 `deploy/pvm/`：

- `build-pvm-host-kernel-pkg.sh` — 编译 PVM Host 内核 RPM/DEB
- `build-pvm-guest-vmlinux.sh` — 编译 PVM Guest vmlinux
- `pvm_setup.sh` — 一站式 PVM 环境配置

## 多节点部署

控制节点部署完成后，可以在其他机器上部署计算节点：

```bash
# 在计算节点上配置 .env
ONE_CLICK_DEPLOY_ROLE=compute
ONE_CLICK_CONTROL_PLANE_IP=<control-node-ip>
ONE_CLICK_CONTROL_PLANE_CUBEMASTER_ADDR=<control-node-ip>:8089

sudo ./install.sh
```

更多细节请参考 `docs/guide/multi-node-deploy.md`。

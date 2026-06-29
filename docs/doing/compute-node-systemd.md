# 任务 2：计算节点保持 systemd

## 目标

明确计算节点只运行核心计算组件，使用 systemd 管理，不引入 Docker Compose。

## 当前状态

计算节点保持 systemd 管理方式，使用官方原有的 IP/地址方式连接控制平面。

## 计算节点 target

- `cube-sandbox-compute.target`
  - `cube-sandbox-network-agent.service`
  - `cube-sandbox-cubelet.service`

## 关键设计

### 1. 计算节点不需要 Docker

纯计算节点只运行 cubelet/network-agent，完全不需要 Docker。

`install.sh` 中 `needs_docker_for_install` 逻辑保留：

- 如果 role 不是 compute，需要 Docker
- 如果 role 是 compute 但之前安装的是 control，也需要 Docker（用于清理旧控制面容器）
- 全新 compute 安装不强制安装 Docker

### 2. 计算节点安装内容

已有 `install-compute.sh`：

```bash
export ONE_CLICK_DEPLOY_ROLE=compute
exec "${SCRIPT_DIR}/install.sh" "$@"
```

`install.sh` 在 compute 角色下只复制：

- `network-agent/`
- `Cubelet/`
- `cube-shim/`
- `cube-kernel-scf/`
- `cube-image/`
- `systemd/`
- `scripts/`

不复制：

- `cubeproxy/`
- `coredns/`
- `support/`
- `webui/`
- `CubeMaster/`
- `CubeAPI/`

### 3. 控制节点与计算节点通信

Cubelet 通过 `meta_server_endpoint` 连接 CubeMaster gRPC。

#### 控制平面地址配置方式

| 优先级 | 变量/方式 | 说明 |
|--------|-----------|------|
| 1 | `ONE_CLICK_CONTROL_PLANE_CUBEMASTER_ADDR` | 直接指定完整地址，如 `10.0.0.10:8089` |
| 2 | `ONE_CLICK_CONTROL_PLANE_IP` | 指定 IP，端口取 `CUBEMASTER_ADDR` 默认值 8089 |

#### 写入 cubelet 配置

`prepare-compute-role.sh` 会调用 `resolve_control_plane_cubemaster_addr()` 获取地址，并写入：

```yaml
meta_server_config:
  meta_server_endpoint: "10.0.0.10:8089"
```

相关实现：

- `deploy/one-click/scripts/systemd/common.sh`：`resolve_control_plane_cubemaster_addr()`
- `deploy/one-click/scripts/systemd/prepare-compute-role.sh`

### 4. network-agent 与 CubeMaster

network-agent 不直接连接 CubeMaster，只通过 UNIX socket 为本地 cubelet 提供网络能力：

- `grpc+unix:///tmp/cube/network-agent-grpc.sock`
- `/tmp/cube/network-agent-tap.sock`

## 下一步

- 在真实环境验证计算节点通过 IP/地址注册到原生 systemd 控制节点
- 验证多节点调度、网络、DNS 是否正常

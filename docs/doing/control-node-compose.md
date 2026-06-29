# 任务 1：控制节点 Docker Compose 化

## 状态

**已取消。** 控制节点保持原生 systemd 部署，不再容器化。

## 决策原因

经过分析，控制节点保持原生 systemd 部署更简洁：

- 原生二进制已经能稳定运行
- 容器化增加了构建、镜像管理、网络调试复杂度
- 当前主要痛点是**打包构建**（国内镜像、离线构建），不是控制节点部署形态
- 计算节点必须原生运行（需要 `/dev/kvm`、cgroup、eBPF），控制面原生部署与计算节点保持一致

## 保留的改进

虽然控制节点不 Docker 化，但以下改进仍然保留：

- 计算节点支持通过**域名**连接控制面（`cubemaster.cube.app`）
- 打包流程支持国内镜像
- 未来仍可在必要时用 systemd 单独管理控制面服务

## 历史记录

此任务曾探索过以下方案，现已归档：

- `deploy/compose/control-node-compose.yml`（已删除）
- `deploy/compose/install-control-compose.sh`（已删除）
- `deploy/compose/docker/cubemaster/Dockerfile`（已删除）
- `deploy/compose/docker/cubeapi/Dockerfile`（已删除）

## 相关文档

- [计算节点 systemd 部署](./compute-node-systemd.md)
- [打包国内镜像](./packaging-china-mirror.md)
- [离线构建](./offline-build.md)

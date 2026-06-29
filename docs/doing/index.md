# CubeSandbox 部署与打包改造任务清单

本清单跟踪 CubeSandbox 的部署架构改造和打包环境改造任务。

## 任务概览

| 编号 | 任务 | 状态 | 优先级 |
|------|------|------|--------|
| 1 | [控制节点 Docker Compose 化](./control-node-compose.md) | 已取消，保持原生 systemd | 低 |
| 2 | [计算节点保持 systemd](./compute-node-systemd.md) | 已完成 | 中 |
| 3 | [打包国内镜像](./packaging-china-mirror.md) | 已完成改造，待验证 | 高 |
| 4 | [离线构建支持](./offline-build.md) | 待开始 | 中 |

## 任务说明

### 任务 1：控制节点 Docker Compose 化

将控制节点的纯控制平面服务容器化，统一使用 Docker Compose 管理：

- CubeMaster
- CubeAPI
- WebUI
- MySQL（已是 Docker）
- Redis（已是 Docker）
- CubeProxy（已是 Docker）
- CoreDNS（已是 Docker）

cubelet 和 network-agent 仍使用 systemd，不强制容器化。

### 任务 2：计算节点保持 systemd

计算节点仅运行：

- network-agent
- cubelet

保持 systemd 管理方式，并明确与 Docker Compose 控制节点的边界。

### 任务 3：打包国内镜像

将打包流程中的外部网络依赖替换为国内镜像或可配置 mirror：

- Go 下载：使用国内 mirror
- protoc 下载：使用国内 mirror
- protoc-gen-go / grpc / doc：使用 GOPROXY 国内代理
- libseccomp 下载：使用国内 mirror
- npm registry：使用国内源
- Go modules：使用 GOPROXY 国内代理
- 所有 URL 参数化，支持环境变量覆盖

### 任务 4：离线构建支持

建立离线构建能力：

- 定义 `offline-cache/` 目录结构
- 所有外部依赖支持本地预下载
- Dockerfile.builder 支持 COPY 本地缓存
- 提供收集依赖到 cache 的脚本
- 校验文件 sha256

## 进度更新

- 2026-06-29：任务清单创建，开始任务 3（打包国内镜像）

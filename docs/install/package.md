# 打包指南

## 发布包内容

完整发布包 `cube-sandbox-one-click-<version>.tar.gz` 包含：

| 目录/文件 | 说明 |
|-----------|------|
| `CubeMaster/bin/` | 控制平面二进制（cubemaster、cubemastercli） |
| `Cubelet/bin/` | 节点代理二进制（cubelet、cubecli） |
| `CubeAPI/bin/` | E2B 兼容 API 服务 |
| `network-agent/bin/` | 网络代理 |
| `cube-shim/bin/` | containerd-shim-cube-rs、cube-runtime |
| `cube-kernel-scf/` | Guest 内核（vmlinux、vmlinux-pvm） |
| `cube-image/` | Guest VM 磁盘镜像 |
| `cubeproxy/` | CubeProxy Docker Compose 配置 |
| `coredns/` | CoreDNS Docker Compose 配置 |
| `webui/dist/` | 前端静态资源 |
| `support/` | MySQL/Redis Docker Compose + mkcert |
| `systemd/` | systemd unit 文件 |
| `scripts/` | 启动/停止/检查脚本 |
| `sql/` | 数据库初始化脚本 |
| `env.example` | 环境变量模板 |

## 打包脚本

### 推荐入口

```bash
./deploy/one-click/build-release-bundle-builder.sh
```

这是官方推荐的完整打包脚本，会自动处理所有步骤。

### 脚本调用链

```
build-release-bundle-builder.sh
        │
        ▼
build-release-bundle.sh
        │
        ├── 编译组件二进制
        │
        ├── build-vm-assets.sh          ← 构建 guest image
        │       │
        │       ├── docker build        (TencentOS4 minimal)
        │       ├── docker export       (导出 rootfs)
        │       ├── 注入 cube-agent
        │       └── mkfs.ext4           (生成 ext4 镜像)
        │
        ├── 打包 kernel zip
        ├── 构建 WebUI (npm ci + build)
        └── 打包最终 tar.gz
```

### 使用预构建二进制

如果某些组件已经编译好，可以通过环境变量指定路径跳过编译：

```bash
ONE_CLICK_CUBEMASTER_BIN=/path/to/cubemaster \
ONE_CLICK_CUBELET_BIN=/path/to/cubelet \
ONE_CLICK_CUBE_API_BIN=/path/to/cube-api \
./deploy/one-click/build-release-bundle-builder.sh
```

完整的环境变量列表请参考 `docs/guide/self-build-deploy.md` 的 **Build-time Options** 章节。

## 输出位置

```
deploy/one-click/dist/
└── cube-sandbox-one-click-<git-commit>.tar.gz
```

## 验证发布包

```bash
tar -tzf deploy/one-click/dist/cube-sandbox-one-click-*.tar.gz | head -50
```

确保以下关键文件存在：

```
cube-sandbox-one-click-*/CubeMaster/bin/cubemaster
cube-sandbox-one-click-*/Cubelet/bin/cubelet
cube-sandbox-one-click-*/CubeAPI/bin/cube-api
cube-sandbox-one-click-*/network-agent/bin/network-agent
cube-sandbox-one-click-*/cube-shim/bin/containerd-shim-cube-rs
cube-sandbox-one-click-*/cube-image/cube-guest-image-cpu.img
cube-sandbox-one-click-*/cube-kernel-scf/vmlinux
```

## 手动更新包

对于已部署节点的二进制热更新，可以使用：

```bash
make manual-release
```

产物：
```
_output/release/cube-manual-update-YYYYMMDD-HHMMSS.tar.gz
_output/release/cube-manual-update-YYYYMMDD-HHMMSS.tar.gz.sha256
_output/release/deploy-manual.sh
```

部署方式：

```bash
sudo ./deploy-manual.sh cube-manual-update-*.tar.gz
```

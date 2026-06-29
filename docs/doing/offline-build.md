# 任务 4：离线构建支持

## 目标

建立完全离线的 CubeSandbox 构建能力，所有外部依赖可预下载到本地 cache。

## 状态

待开始。

## 离线缓存目录结构

```
offline-cache/
├── apt/                    # Ubuntu deb 包缓存（可选）
├── go/
│   └── go1.24.8.linux-amd64.tar.gz
├── protoc/
│   └── protoc-28.3-linux-x86_64.zip
├── libseccomp/
│   └── libseccomp-2.5.5.tar.gz
├── gomod/                  # Go module cache
├── cargo/                  # Cargo registry cache
├── npm/                    # npm cache or node_modules
├── docker-images/          # 预拉取的基础镜像 tar
│   ├── tencentos4-minimal.tar
│   ├── mysql-8.0.tar
│   ├── redis-7-alpine.tar
│   └── coredns-1.14.2.tar
├── vmlinux/
│   ├── vmlinux
│   └── vmlinux-pvm
└── checksums.sha256
```

## 改造内容

### 1. Dockerfile.builder 支持本地 COPY

当检测到 `offline-cache/` 存在时，使用 `COPY` 而不是 `curl/wget`：

```dockerfile
ARG OFFLINE_BUILD=0
COPY offline-cache/go/go*.tar.gz /tmp/go.tgz
# 或
RUN curl -fsSL "${GO_DOWNLOAD_URL}" -o /tmp/go.tgz
```

### 2. 离线构建脚本

`scripts/prepare-offline-cache.sh`：

- 在正常网络环境下运行
- 下载所有依赖到 `offline-cache/`
- 计算并保存 sha256

### 3. 构建脚本支持离线模式

```bash
./deploy/one-click/build-release-bundle-builder.sh --offline
# 或
OFFLINE_BUILD=1 ./deploy/one-click/build-release-bundle-builder.sh
```

### 4. Docker 镜像离线加载

```bash
# 准备阶段
docker pull cube-sandbox-image.tencentcloudcr.com/opensource/tencentos4-minimal:4.4-v20250331
docker save ... > offline-cache/docker-images/tencentos4-minimal.tar

# 离线构建前
docker load < offline-cache/docker-images/tencentos4-minimal.tar
```

## 依赖

- 任务 3（打包国内镜像）完成，作为基础

## 下一步

等待任务 3 完成后开始设计和实现 `offline-cache/` 机制。

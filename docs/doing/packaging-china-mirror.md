# 任务 3：打包国内镜像

## 目标

将 CubeSandbox 打包流程中的外部网络依赖替换为国内镜像或可配置 mirror，使构建在国内网络环境下可用。

## 状态

已完成代码改造，待实际构建验证。

## 已完成的改造

### 1. Dockerfile.builder 参数化

所有外部下载 URL 已改为 `ARG`，支持 `--build-arg` 覆盖：

- `GO_DOWNLOAD_URL`
- `PROTOC_DOWNLOAD_URL`
- `LIBSECCOMP_DOWNLOAD_URL`
- `GOPROXY`
- `NPM_CONFIG_REGISTRY`
- `CARGO_REGISTRY_URL`
- `APT_PRIMARY_MIRROR`
- `APT_SECURITY_MIRROR`

相关提交：
- [docker/Dockerfile.builder](/docker/Dockerfile.builder)

### 2. Makefile 增加 mirror 参数

根 Makefile 新增：

- `builder-image-china` 快捷目标
- 所有 mirror 变量可覆盖
- `builder-run` 自动传递 `GOPROXY` 和 `NPM_CONFIG_REGISTRY`

```bash
# 使用国内镜像构建 builder 镜像
make builder-image-china

# 完整发布包使用国内镜像
GO_DOWNLOAD_URL=https://goproxy.cn/dl/go1.24.8.linux-amd64.tar.gz \
PROTOC_DOWNLOAD_URL=https://proxy.syscube.dev/https://github.com/protocolbuffers/protobuf/releases/download/v28.3/protoc-28.3-linux-x86_64.zip \
LIBSECCOMP_DOWNLOAD_URL=https://proxy.syscube.dev/https://github.com/seccomp/libseccomp/releases/download/v2.5.5/libseccomp-2.5.5.tar.gz \
GOPROXY=https://goproxy.cn,https://goproxy.io,direct \
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
./deploy/one-click/build-release-bundle-builder.sh
```

相关提交：
- [Makefile](/Makefile)

### 3. 打包脚本传递 mirror 环境变量

`deploy/one-click/build-release-bundle-builder.sh` 已修改，在调用 `make builder-image` 和 `make builder-run` 时传递 mirror 变量。

`deploy/one-click/build-release-bundle.sh` 已修改，支持通过 `NPM_CONFIG_REGISTRY` 设置 npm registry。

### 4. 文档更新

已更新 [docs/install/build.md](/docs/install/build.md)，新增"国内镜像构建"章节。

## 外部依赖清单

### Dockerfile.builder

| 依赖 | 当前来源 | 状态 |
|------|----------|------|
| Ubuntu apt | `mirrors.tencent.com` | ✅ 已是国内 |
| Go 二进制 | `https://go.dev/dl/...` | ✅ 已参数化 |
| protoc 二进制 | `https://github.com/...` | ✅ 已参数化 |
| protoc-gen-go / grpc | `google.golang.org` | ✅ 通过 GOPROXY |
| protoc-gen-doc | `github.com` | ✅ 通过 GOPROXY |
| Rust toolchain | `rsproxy.cn` | ✅ 已是国内 |
| libseccomp | `https://github.com/...` | ✅ 已参数化 |

### 组件构建

| 依赖 | 当前来源 | 状态 |
|------|----------|------|
| Go modules | `proxy.golang.org` | ✅ 通过 GOPROXY |
| Cargo crates | `rsproxy.cn` / crates.io | ✅ 已是国内或已配置 |
| npm packages | `registry.npmjs.org` | ✅ 通过 NPM_CONFIG_REGISTRY |

### Guest Image

| 依赖 | 当前来源 | 状态 |
|------|----------|------|
| TencentOS4 minimal | `tencentcloudcr.com` | ✅ 已是国内 |
| yum packages | base image 内部 | ⚠️ 取决于 base image |

### 运行时镜像

| 依赖 | 当前来源 | 状态 |
|------|----------|------|
| MySQL/Redis/CoreDNS | `tencentcloudcr.com` | ✅ 已是国内 |

### vmlinux

| 来源 | 状态 |
|------|------|
| GitHub Release | ✅ 支持本地路径覆盖，新增 `scripts/download-vmlinux.sh` 自动下载脚本 |

## 新增的辅助脚本

- `scripts/download-vmlinux.sh`：自动从 GitHub Release 下载 vmlinux / vmlinux-pvm，支持代理和自定义版本
- `make pvm-release`：一键构建 PVM 完整发布包

## 用法示例

```bash
# 一键构建 PVM 发布包（含国内镜像 + vmlinux-pvm 下载）
make pvm-release
```

## 验证计划

1. 在国内网络环境下执行 `make builder-image-china`
2. 使用国内 mirror 执行完整发布包构建
3. 对比构建产物与公网构建结果

## 已知限制

- guest-image 中的 yum 源取决于 TencentOS4 minimal base image 内部配置，暂不可覆盖
- vmlinux 仍需从 Release 获取，但已提供 `scripts/download-vmlinux.sh` 辅助脚本

## 下一步

运行完整发布包构建验证，修复验证中发现的问题。

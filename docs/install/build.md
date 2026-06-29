# 构建指南

## 环境要求

### 硬件

- **x86_64** 架构
- **KVM 支持** — 验证：`ls /dev/kvm`
- 推荐：8+ CPU 核心，16+ GB 内存（安装脚本硬性要求 8GB）
- 物理机或支持嵌套虚拟化的裸金属服务器（PVM 模式可在普通云 VM 上运行）

### 操作系统

- OpenCloudOS 9（推荐）
- Rocky Linux 9 / CentOS Stream 9 / RHEL 9
- Ubuntu 22.04+

### 构建机器依赖

| 工具 | 用途 |
|------|------|
| `docker` | 运行统一 builder 容器，编译所有组件 |
| `make` | 执行根 Makefile 编排构建 |
| `tar` | 打包发布产物 |
| `python3` | guest image 生成脚本依赖 |
| `truncate` / `ldd` / `mkfs.ext4` | 生成 guest VM 磁盘镜像 |
| `ripgrep` (`rg`) | 安装脚本使用 |

> 项目采用统一 Docker builder 镜像，构建过程不需要在宿主机安装 Go、Rust、Node 等工具链。

## 安装依赖工具

### Rocky Linux 9 / CentOS / RHEL

```bash
# 安装 Docker
sudo dnf install -y docker
sudo systemctl start docker
sudo systemctl enable docker

# 安装其他构建工具
sudo dnf install -y make tar python3 e2fsprogs ripgrep

# 安装 Node.js 20（前端构建需要）
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

### Ubuntu 22.04+

```bash
sudo apt update
sudo apt install -y docker.io make tar python3 e2fsprogs ripgrep nodejs npm
```

## 准备 vmlinux

CubeSandbox 需要一个 Linux guest 内核（`vmlinux`）来启动沙箱 VM。

### 方式一：从 Release 下载（推荐）

访问 [GitHub Releases](https://github.com/TencentCloud/CubeSandbox/releases)，下载对应版本的发布包或 vmlinux 文件。

项目提供了自动下载脚本：

```bash
# 下载普通 vmlinux（从完整安装包中提取）
./scripts/download-vmlinux.sh

# 同时下载 vmlinux-pvm
./scripts/download-vmlinux.sh --pvm

# 只下载 vmlinux-pvm（直接下载 release asset，更快）
./scripts/download-vmlinux.sh --only-pvm

# 使用代理下载
./scripts/download-vmlinux.sh --pvm --proxy https://proxy.syscube.dev/
```

脚本默认输出到 `deploy/one-click/assets/kernel-artifacts/`。

也可以手动下载：

```bash
# 下载完整安装包并提取 vmlinux
cd /tmp
wget https://github.com/TencentCloud/CubeSandbox/releases/download/v0.3.1/cube-sandbox-one-click-9003288.tar.gz
tar -xzf cube-sandbox-one-click-9003288.tar.gz \
  --wildcards "*/cube-kernel-scf.zip"

# 解压内核 zip 取出 vmlinux
python3 -c "
import zipfile
z = zipfile.ZipFile('/tmp/cube-sandbox-one-click-9003288/assets/kernel-artifacts/cube-kernel-scf.zip')
z.extract('vmlinux', '/tmp/')
"

# 放到项目指定位置
cp /tmp/vmlinux deploy/one-click/assets/kernel-artifacts/vmlinux
```

如果需要 PVM 模式，还需下载 `vmlinux-pvm`：

```bash
wget https://github.com/TencentCloud/CubeSandbox/releases/download/v0.3.1/vmlinux-pvm \
  -O deploy/one-click/assets/kernel-artifacts/vmlinux-pvm
```

### 方式二：从源码编译 PVM Guest vmlinux

项目提供了从 OpenCloudOS 内核源码编译 PVM guest 内核的脚本：

```bash
./deploy/pvm/build-pvm-guest-vmlinux.sh
```

该脚本会自动：
1. 克隆 OpenCloudOS-Kernel 源码（tag: `6.6.69-1.cubesandbox`）
2. 下载 PVM guest kernel `.config`
3. 执行 `make -j$(nproc) vmlinux`
4. 输出到 `pvm-guest-build/output/vmlinux`

脚本会自动安装编译依赖（gcc、make、bison、flex、lz4、python3 等）。

## 构建步骤

### 1. 构建 Builder 镜像

```bash
make builder-image
```

首次执行会构建 `cube-sandbox-builder:latest` 镜像，包含：
- Go 1.24.8
- Rust 多版本（1.77.2 / 1.85 / 1.89）
- Protocol Buffers + protoc-gen-go / protoc-gen-go-grpc
- musl-tools 和静态 libseccomp

### 2. 构建各组件（可选）

如果只想单独构建某个组件：

```bash
make all              # cubemaster + cubelet + network-agent
make cubeapi          # cube-api
make agent            # cube-agent
make shim             # containerd-shim-cube-rs + cube-runtime
make web-build        # 前端
```

产物默认输出到 `_output/bin/`。

### 3. 构建完整发布包

```bash
./deploy/one-click/build-release-bundle-builder.sh
```

该脚本会：
1. 在 builder 容器内编译所有核心组件
2. 构建 guest VM 镜像（需要 Docker）
3. 打包所有产物为发布 tar.gz

最终产物位置：
```
deploy/one-click/dist/cube-sandbox-one-click-<git-commit>.tar.gz
```

## PVM 发布包一键构建

如果要构建包含 PVM 内核的完整发布包，可以直接使用：

```bash
make pvm-release
```

这个 target 会自动完成：
1. `make builder-image-china` — 构建国内镜像版 builder
2. `./scripts/download-vmlinux.sh --only-pvm` — 下载 PVM guest 内核
3. 用 `vmlinux-pvm` 覆盖 `vmlinux` 作为默认 guest 内核
4. `./deploy/one-click/build-release-bundle-builder.sh` — 构建完整发布包

等价于手动执行：

```bash
make builder-image-china
./scripts/download-vmlinux.sh --only-pvm
cp deploy/one-click/assets/kernel-artifacts/vmlinux-pvm \
   deploy/one-click/assets/kernel-artifacts/vmlinux
./deploy/one-click/build-release-bundle-builder.sh
```

## 国内镜像构建

如果处于受限网络环境（如中国大陆），构建流程支持配置镜像源。

### 快速使用国内镜像

```bash
make builder-image-china

GO_DOWNLOAD_URL=https://mirrors.aliyun.com/golang/go1.24.8.linux-amd64.tar.gz \
PROTOC_DOWNLOAD_URL=https://proxy.syscube.dev/https://github.com/protocolbuffers/protobuf/releases/download/v28.3/protoc-28.3-linux-x86_64.zip \
LIBSECCOMP_DOWNLOAD_URL=https://proxy.syscube.dev/https://github.com/seccomp/libseccomp/releases/download/v2.5.5/libseccomp-2.5.5.tar.gz \
GOPROXY=https://goproxy.cn,https://goproxy.io,direct \
NPM_CONFIG_REGISTRY=https://registry.npmmirror.com \
./deploy/one-click/build-release-bundle-builder.sh
```

### 可配置的镜像变量

| 变量 | 默认值 | 国内镜像默认值 |
|------|--------|----------------|
| `APT_PRIMARY_MIRROR` | `http://mirrors.tencent.com/ubuntu` | 相同 |
| `APT_SECURITY_MIRROR` | `http://mirrors.tencent.com/ubuntu` | 相同 |
| `GO_DOWNLOAD_URL` | `https://go.dev/dl/...` | `https://mirrors.aliyun.com/golang/...` |
| `PROTOC_DOWNLOAD_URL` | `https://github.com/...` | `https://proxy.syscube.dev/https://github.com/...` |
| `LIBSECCOMP_DOWNLOAD_URL` | `https://github.com/...` | `https://proxy.syscube.dev/https://github.com/...` |
| `GOPROXY` | `https://proxy.golang.org,direct` | `https://goproxy.cn,https://goproxy.io,direct` |
| `NPM_CONFIG_REGISTRY` | `https://registry.npmjs.org/` | `https://registry.npmmirror.com` |
| `CARGO_REGISTRY_URL` | — | — |

可以通过环境变量或 make 变量覆盖：

```bash
make builder-image GO_DOWNLOAD_URL=https://your-mirror/go1.24.8.linux-amd64.tar.gz
```

### 已使用国内镜像的依赖

- Ubuntu APT 源：`mirrors.tencent.com`
- Rust toolchain：`rsproxy.cn`
- Guest image 基础镜像：`tencentcloudcr.com`
- MySQL / Redis / CoreDNS 运行时镜像：`tencentcloudcr.com`

## 常见问题

### npm 缺失

前端构建需要 npm。安装 Node.js 20：

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs
```

### vmlinux-pvm 未找到

打包脚本会查找 `deploy/one-click/assets/kernel-artifacts/vmlinux-pvm`。如果使用 PVM 模式，确保该文件存在：

```bash
cp deploy/one-click/assets/kernel-artifacts/vmlinux \
   deploy/one-click/assets/kernel-artifacts/vmlinux-pvm
```

### guest image 构建失败

构建 guest image 需要 Docker 能够拉取基础镜像：

```
cube-sandbox-image.tencentcloudcr.com/opensource/tencentos4-minimal:4.4-v20250331
```

确保网络可达或已配置 Docker 镜像加速。

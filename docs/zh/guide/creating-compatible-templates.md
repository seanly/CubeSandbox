# 创建兼容的 CubeSandbox 模板

> 本文回答一个常见问题：**普通 Docker/OCI 镜像能直接作为 CubeSandbox 模板吗？**  
> 答案是：**不能直接使用，但经过改造后可以。**

CubeSandbox 不是用容器运行时直接启动镜像，而是把镜像作为 **MicroVM 的根文件系统（rootfs）** 来启动。因此，镜像必须满足 CubeSandbox 的运行时契约，才能通过 `cubemastercli tpl create-from-image` 成功转换成模板。

---

## 1. 什么是 CubeSandbox 模板？

一个 **Template** 不是单纯的容器镜像，而是：

1. 从一个 OCI 镜像构建出的 **ext4 rootfs**；
2. 在 MicroVM 中冷启动后捕获的 **内存/状态快照（snapshot）**；
3. 注册到系统中、可被 `template_id` 引用的 **热启动基础单元**。

完整生命周期见 [Templates Overview](./templates.md)。

---

## 2. 为什么普通镜像不能直接当模板？

普通镜像缺少 CubeSandbox 运行时所依赖的几个关键能力：

| 缺失能力 | 后果 |
|---|---|
| 没有 `envd` 守护进程 | SDK 的文件读写、进程启动、Jupyter 内核等 API 全部不可用。 |
| 没有可被探测的 HTTP 服务 | `create-from-image` 的 readiness probe 会超时，模板永远无法进入 `READY` 状态。 |
| 不兼容 MicroVM 引导流程 | `cube-agent` 作为 PID 1 启动后无法正确初始化环境，镜像可能根本起不来。 |
| 端口未显式声明 | CubeMaster 不知道该把哪些端口暴露给沙箱外部。 |

因此，**直接拿 `python:3.11`、`nginx:latest` 这类原始镜像去创建模板，几乎一定会失败。**

---

## 3. 镜像必须满足的运行时契约

### 3.1 必须包含并启动 `envd`

`envd` 是 CubeSandbox 沙箱内的核心服务，实现了与 E2B 兼容的 API（文件、进程、内核等）。它默认监听 **49983** 端口，并提供 `/health` 端点。

官方基础镜像 `ghcr.io/tencentcloud/cubesandbox-base:2026.16` 已经内置 `envd` 和正确的 entrypoint，建议以此为基础：

```dockerfile
FROM ghcr.io/tencentcloud/cubesandbox-base:2026.16
```

`envd` 的启动逻辑在 [docker/cube-entrypoint.sh](../../../docker/cube-entrypoint.sh) 中：

1. 后台启动 `envd`（端口 `${ENVD_PORT:-49983}`）。
2. 如果用户定义了 `CMD`，则把它作为前台进程运行；`envd` 保持在后台。
3. 如果没有 `CMD`，则前台等待 `envd`。

> **关键约定**：不要覆盖 `ENTRYPOINT` 以至于 `envd` 无法启动。如果你需要自定义入口，请确保它最终会启动 `/usr/bin/envd`。

### 3.2 必须通过 HTTP Readiness Probe

创建模板时，CubeMaster 会在 MicroVM 里反复访问你指定的 HTTP 端点，只有返回 **2xx** 后才认为模板就绪。

创建命令必须指定：

```bash
--expose-port <port>   # 声明容器暴露的端口
--probe <port>         # 指定探测端口
--probe-path <path>    # 指定探测路径，例如 /health
```

官方基础镜像可以直接使用：

```bash
--probe 49983 --probe-path /health
```

详见 [Creating Templates from OCI Images](./tutorials/template-from-image.md)。

### 3.3 必须兼容 `cube-agent` 的 MicroVM 引导

MicroVM 启动后，PID 1 是 `cube-agent`。它会做初始化挂载（`/proc`、`/sys`、`/dev/shm`、`/run` 等），并执行 `/etc/rc.local`。因此镜像里需要：

- 可用的 `/bin/sh` 和基础工具（`busybox`、`util-linux` 等）；
- 能被 `cube-agent` 正确挂载和引导的文件系统布局。

相关代码：

- [agent/src/main.rs](../../../agent/src/main.rs)
- [agent/src/mount.rs](../../../agent/src/mount.rs)

### 3.4 端口暴露限制

除了 `envd` 默认占用的 `49983`，自定义端口最多还能声明 **3 个**。如果你需要 `run_code` / Jupyter 支持，通常还需要暴露 **49999**。

相关实现见 [CubeMaster/pkg/templatecenter/template_image.go](../../../CubeMaster/pkg/templatecenter/template_image.go)。

---

## 4. 如何创建兼容的模板？

### 4.1 推荐做法：基于官方基础镜像

```dockerfile
# syntax=docker/dockerfile:1.7
FROM ghcr.io/tencentcloud/cubesandbox-base:2026.16

# 安装你的运行时依赖
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# 可选：如果你需要 run_code / Jupyter 能力
RUN pip install --no-cache-dir jupyter_kernel_gateway ipykernel

# 不要覆盖 ENTRYPOINT
# cube-entrypoint.sh 会在后台启动 envd，然后执行下面的 CMD
CMD ["python3", "-m", "http.server", "8080"]
```

构建并推送镜像：

```bash
docker build -t my-registry/my-sandbox:v1 .
docker push my-registry/my-sandbox:v1
```

### 4.2 使用 CLI 创建模板

```bash
cubemastercli tpl create-from-image \
  --image my-registry/my-sandbox:v1 \
  --writable-layer-size 2G \
  --expose-port 49983 \
  --expose-port 49999 \
  --probe 49983 \
  --probe-path /health
```

> 如果你在中国大陆，建议使用 `cube-sandbox-cn.tencentcloudcr.com/cube-sandbox/sandbox-code:latest` 等国内镜像仓库。

### 4.3 等待模板就绪

```bash
cubemastercli tpl watch --job-id <job_id>
```

直到输出中 `status` 变为 `READY`，这个 `template_id` 就可以被 SDK 用来创建沙箱了。

---

## 5. 示例参考

| 示例 | 路径 | 说明 |
|---|---|---|
| 官方基础镜像 | [docker/Dockerfile.cube-base](../../../docker/Dockerfile.cube-base) | 内置 `envd`、tini、entrypoint，暴露 `49983`。 |
| nginx 演示镜像 | [examples/cubesandbox-base-nginx/Dockerfile](../../../examples/cubesandbox-base-nginx/Dockerfile) | 继承基础镜像，安装 nginx，暴露 `80` 和 `49983`，用 `CMD` 启动 nginx。 |
| 给任意镜像注入 envd | [examples/mini-rl-training/envd-inject/Dockerfile](../../../examples/mini-rl-training/envd-inject/Dockerfile) | 如果你的镜像无法改 `FROM`，可以手动复制 `envd` 进去。 |

---

## 6. 常见失败原因速查

| 现象 | 可能原因 | 解决方式 |
|---|---|---|
| `phase: PULLING` 卡住 | 镜像仓库不可达或需要认证 | 检查网络；私有仓库加 `--registry-username` / `--registry-password`。 |
| `status: FAILED` after `BUILDING` | 构建失败（Dockerfile 错误、磁盘满等） | 查看 `cubemastercli tpl status --job-id <id> --json` 的 `last_error`。 |
| 模板创建超时 / probe 失败 | `envd` 没启动，或 probe 路径/端口不对 | 确保 entrypoint 启动了 `envd`；核对 `--probe` 和 `--probe-path`。 |
| SDK 无法读写文件/执行代码 | 镜像没有 `envd` | 基于官方基础镜像重建，或手动注入 `envd`。 |

---

## 7. 总结

- **普通镜像 ≠ CubeSandbox 模板。**
- 模板 = OCI 镜像 → ext4 rootfs → MicroVM 冷启动 → snapshot → 注册。
- 镜像必须满足三个核心契约：**包含 `envd`**、**通过 HTTP readiness probe**、**兼容 `cube-agent` 引导**。
- 最稳妥的做法是 **基于 `ghcr.io/tencentcloud/cubesandbox-base:2026.16`** 构建你的业务镜像，然后走 `create-from-image` 流程。

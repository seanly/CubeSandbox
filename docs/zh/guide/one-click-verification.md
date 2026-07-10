# 一键部署与 Python SDK 验证指南

> 本文档记录如何在单台裸金属服务器上完成 CubeSandbox 一键部署，并使用自定义域名 + SSL 证书对外提供服务，最终通过 Python SDK 成功创建沙箱并执行代码。
>
> 适用场景：评估体验、开发测试、需要自定义域名和证书的生产前验证。

## 1. 目标环境

本指南以如下环境为例：

| 项目 | 值 |
|---|---|
| 宿主机 OS | Rocky Linux 9.5 |
| 宿主机 IP | `172.20.16.160` |
| 自定义域名 | `*.sandbox.test.chinawayltd.com` |
| SSL 证书目录 | `/data/ssl` |
| 证书文件 | `_.sandbox.test.chinawayltd.com.crt` / `_.sandbox.test.chinawayltd.com.key` |
| CubeSandbox 安装目录 | `/usr/local/services/cubetoolbox` |
| 安装包解压目录 | `/opt/cube-sandbox-install/cube-sandbox-one-click-<git-sha>` |
| 官方仓库 | `/root/CubeSandbox` |

## 2. 前置条件

- 物理机或裸金属服务器，x86_64 架构，已启用 KVM（`ls /dev/kvm` 存在）。
- 已安装 Docker，且能运行容器。
- 已配置 Docker 镜像仓库镜像（如 `https://hub.rat.dev`），否则部分基础镜像可能无法拉取。
- 已准备通配符域名证书，并放到 `/data/ssl`。
- 已安装 `systemd-resolved`（Rocky Linux 9 默认可能未安装，后文会说明如何补装）。
- root 权限。

## 3. 构建 one-click 发布包

CubeSandbox 提供容器化 builder，无需宿主机安装 npm/Node.js 即可构建 Web 前端。

### 3.1 确保 builder 镜像包含 Node.js

项目仓库中的 `docker/Dockerfile.builder` 需要包含 Node.js 22，以便在容器内构建 web dashboard。关键片段如下：

```dockerfile
ARG NODE_VERSION=22.15.0
ARG NODE_DOWNLOAD_URL=https://npmmirror.com/mirrors/node/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz

ENV PATH=/usr/local/go/bin:/usr/local/node/bin:/go/bin:/usr/local/cargo/bin:${PATH}

RUN curl -fsSL "${NODE_DOWNLOAD_URL}" -o /tmp/node.tar.xz \
    && tar -xJf /tmp/node.tar.xz -C /usr/local \
    && mv /usr/local/node-v${NODE_VERSION}-linux-x64 /usr/local/node \
    && rm -f /tmp/node.tar.xz \
    && node --version && npm --version
```

构建 builder 镜像：

```bash
cd /root/CubeSandbox
make builder-image  # 或对应的构建命令
```

### 3.2 执行打包脚本

```bash
cd /root/CubeSandbox/deploy/one-click
./build-release-bundle-builder.sh
```

脚本会：

1. 在 builder 容器内编译 cubemaster、cubelet、cube-api、network-agent、cube-agent、cube-shim 等二进制。
2. 在 builder 容器内执行 `npm ci && npm run build` 构建 web dashboard。
3. 在宿主机上打包生成 one-click 发布包。

打包完成后，输出类似：

```text
cube-sandbox-one-click-<git-sha>.tar.gz
```

## 4. 安装 CubeSandbox

### 4.1 解压安装包

```bash
mkdir -p /opt/cube-sandbox-install
tar -xzf cube-sandbox-one-click-<git-sha>.tar.gz -C /opt/cube-sandbox-install
cd /opt/cube-sandbox-install/cube-sandbox-one-click-<git-sha>
```

### 4.2 准备 .env

从 `env.example` 复制：

```bash
cp env.example .env
```

按实际环境修改 `.env`。本例中的关键配置如下：

```bash
# 节点 IP
CUBE_SANDBOX_NODE_IP=172.20.16.160

# 自定义域名
CUBE_API_SANDBOX_DOMAIN=sandbox.test.chinawayltd.com

# SSL 证书
CUBE_PROXY_CERT_DIR=/data/ssl
CUBE_PROXY_SSL_CERT=_.sandbox.test.chinawayltd.com.crt
CUBE_PROXY_SSL_KEY=_.sandbox.test.chinawayltd.com.key

# Redis 必须能被 cube-proxy 容器访问，因此使用宿主机 IP 而不是 127.0.0.1
CUBE_PROXY_REDIS_IP=172.20.16.160

# Proxy 监听端口
CUBE_PROXY_HTTPS_PORT=443
CUBE_PROXY_HTTP_PORT=80
```

### 4.3 修改 cube-proxy 网络模式

默认 `cube-proxy` 使用 Docker bridge 并做端口映射 `80→8081`、`443→8080`。当使用 `--network host` 时，端口映射失效，因此需要让 OpenResty 直接监听 `80/443`。

修改 `scripts/systemd/cube-proxy-start.sh`：

```bash
docker create \
  --name "${CUBE_PROXY_CONTAINER_NAME}" \
  --network host \
  -v "${CERT_DIR}:/usr/local/openresty/nginx/certs:ro" \
  -v "${GLOBAL_CONF}:/usr/local/openresty/nginx/conf/global/global.conf:ro" \
  "${CUBE_PROXY_IMAGE_TAG}" >/dev/null
```

修改 `cubeproxy/build-context/nginx.conf`：

```nginx
listen 80 reuseport;
listen 443 ssl reuseport;
```

### 4.4 执行安装

```bash
./install.sh
```

安装完成后，systemd 会启动所有服务：

```bash
systemctl status cube-sandbox-control.target
```

## 5. 安装后常见问题与修复

### 5.1 DNS 服务无法启动：`cannot remove /etc/resolv.conf`

Rocky Linux 9 默认未安装 `systemd-resolved`，导致 `cube-sandbox-dns.service` 无法替换 `/etc/resolv.conf`。

修复：

```bash
dnf install -y systemd-resolved
systemctl enable --now systemd-resolved
```

### 5.2 CoreDNS 端口 53 被占用

NetworkManager fallback 可能启动遗留的 dnsmasq 进程，占用 `169.254.254.53:53`。

修复：

```bash
# 查找占用进程
ss -lnp | grep ':53 '

# 停止并清理 NetworkManager 相关配置
rm -f /etc/NetworkManager/conf.d/90-cubeproxy-dns.conf
rm -f /etc/NetworkManager/dnsmasq.d/90-cubeproxy-cube-app.conf
systemctl restart NetworkManager
```

### 5.3 cube-proxy 无法连接 Redis

当 cube-proxy 使用 host 网络模式时，`127.0.0.1:6379` 指向容器自身而非宿主机。已在 `.env` 中将 `CUBE_PROXY_REDIS_IP` 改为宿主机 IP。

### 5.4 沙箱启动后立即退出

现象：通过 API 创建沙箱后，状态很快从 `running` 变为 `exited`。

根因：`cubemastercli template create-from-image` 生成的 ext4 rootfs 是**应用模板 rootfs**，而微 VM 启动所需的 `cube-agent` 在**系统 guest rootfs** 中。如果系统 guest rootfs 未正确注入 `cube-agent`，VM 启动后没有 init 进程，会立即退出。

修复：手动挂载系统 guest rootfs 镜像，注入 `cube-agent`：

```bash
# 假设系统 guest rootfs 镜像路径
RFS_IMG=/usr/local/services/cubetoolbox/cubebox_os_image/rfs-<artifact_id>/rfs-<artifact_id>.ext4
MNT=/tmp/rfs-mount

mkdir -p "${MNT}"
mount -o loop "${RFS_IMG}" "${MNT}"

# 注入 cube-agent 作为 /usr/sbin/init
cp -f /root/CubeSandbox/deploy/one-click/.work/prebuilt/cube-agent "${MNT}/usr/sbin/cube-agent-bin"
cat > "${MNT}/usr/sbin/init" <<'EOF'
#!/bin/sh
exec /usr/sbin/cube-agent-bin init "$@"
EOF
chmod +x "${MNT}/usr/sbin/init" "${MNT}/usr/sbin/cube-agent-bin"

# 写入基础配置
cat > "${MNT}/etc/hostname" <<'EOF'
localhost
EOF
cat > "${MNT}/etc/hosts" <<'EOF'
127.0.0.1 localhost
EOF
cat > "${MNT}/etc/resolv.conf" <<'EOF'
nameserver 119.29.29.29
EOF
cat > "${MNT}/etc/rc.local" <<'EOF'
#!/bin/sh
exit 0
EOF
chmod +x "${MNT}/etc/rc.local"

umount "${MNT}"

# 重新计算 sha256 并更新 MySQL
sha=$(sha256sum "${RFS_IMG}" | awk '{print $1}')
size=$(stat -c%s "${RFS_IMG}")
mysql -uroot -pcube_root cube_mvp -e "
UPDATE t_cube_rootfs_artifact SET ext4_sha256='${sha}', ext4_size_bytes=${size} WHERE artifact_id='rfs-<artifact_id>';
"
```

> 注：在 CI/CD 场景下，应修改 `deploy/one-click/build-vm-assets.sh` 的 `inject_agent_into_guest_rootfs` 步骤，确保系统 guest rootfs 打包时即包含 cube-agent。

## 6. 服务状态检查

安装完成后，确认所有 systemd unit 均为 `active`：

```bash
systemctl is-active cubemaster cubelet cube-api cube-proxy cube-sandbox-dns \
  cube-sandbox-mysql cube-sandbox-redis cube-sandbox-network-agent \
  cube-sandbox-webui cube-sandbox-coredns
```

健康检查：

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:8089/notify/health
```

## 7. 制作 Python 3.11 模板

### 7.1 关键概念：系统 rootfs vs 应用 rootfs

CubeSandbox 的沙箱由两层 rootfs 组成：

| 层级 | 镜像 | 挂载为 | 是否含 cube-agent |
|---|---|---|---|
| 系统 Guest Rootfs | `cube-sandbox-guest-image:one-click` | `pmem0` | 是 |
| 应用 Template Rootfs | 用户通过 `create-from-image` 生成的镜像 | `pmem1+` | 否 |

因此，**应用模板镜像不需要包含 cube-agent**，但需要提供 Python SDK 访问所需的代码执行服务。

### 7.2 为什么需要自定义代码执行服务

项目仓库提供的 `docker/Dockerfile.cube-base` 会从 `e2b-dev/infra@2026.16` 编译 `envd`。该 `envd` 暴露以下端点：

- `GET /health`
- `POST /init`
- `GET /envs`
- `GET/POST /files`
- `GET /metrics`

但它**没有 `/execute`**。

而 Python SDK 的 `Sandbox.run_code()` 硬编码请求：

```python
url = f"http://{self.get_host(JUPYTER_PORT)}/execute"
# JUPYTER_PORT = 49999
```

所以模板内必须在 `49999` 端口提供一个 `/execute` 服务，否则 `run_code()` 会返回 HTTP 404。

### 7.3 编译 envd

使用 builder 镜像编译 envd：

```bash
mkdir -p /tmp/envd-build
docker run --rm -v /tmp/envd-build:/out -e ENVD_REF=2026.16 \
  cube-sandbox-builder:latest bash -c '
set -e
cd /tmp
if [ ! -d /tmp/infra ]; then
  git clone --depth 1 --branch "$ENVD_REF" https://github.com/e2b-dev/infra.git /tmp/infra
fi
cd /tmp/infra/packages/envd
commit_sha=$(git rev-parse --short HEAD)
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -a \
  -ldflags "-X=main.commitSHA=${commit_sha} -s -w" \
  -o /out/envd .
/out/envd -version
/out/envd -commit
'
```

编译产物：`/tmp/envd-build/envd`

### 7.4 准备模板 Dockerfile

创建构建目录：

```bash
mkdir -p /tmp/python-template-build
cp /tmp/envd-build/envd /tmp/python-template-build/envd
cp /root/CubeSandbox/docker/cube-entrypoint.sh /tmp/python-template-build/cube-entrypoint.sh
```

其中 `cube-entrypoint.sh` 是项目自带的标准入口脚本。

创建 `/tmp/python-template-build/cube-code-server.py`：

```python
#!/usr/bin/env python3
"""
Minimal code-execution server compatible with the CubeSandbox / e2b Python SDK.

Endpoints:
  GET  /health  -> 204 No Content
  POST /execute -> run Python code and stream NDJSON events:
      {"type": "stdout", "text": "..."}
      {"type": "stderr", "text": "..."}
      {"type": "error", "name": "...", "value": "...", "traceback": "..."}
      {"type": "result", "text": "...", "is_main_result": true}
      {"type": "number_of_executions", "execution_count": N}

Request body (JSON):
  {"code": "print(1)", "language": "python", "env_vars": {...}}
"""

import json
import os
import subprocess
import sys
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("CUBE_CODE_PORT", "49999"))


def execute_code(code: str, env_vars: dict | None = None):
    env = os.environ.copy()
    if env_vars:
        env.update({k: str(v) for k, v in env_vars.items()})

    wrapper = r'''
import sys, json, traceback, io
code = sys.argv[1]
local_ns = {}
out = io.StringIO()
err = io.StringIO()
try:
    sys.stdout = out
    sys.stderr = err
    exec(compile(code, "<sandbox>", "exec"), local_ns)
    sys.stdout = sys.__stdout__
    sys.stderr = sys.__stderr__
    print(json.dumps({"ok": True, "stdout": out.getvalue(), "stderr": err.getvalue()}))
except Exception as e:
    sys.stdout = sys.__stdout__
    sys.stderr = sys.__stderr__
    print(json.dumps({
        "ok": False,
        "stdout": out.getvalue(),
        "stderr": err.getvalue(),
        "error_name": type(e).__name__,
        "error_value": str(e),
        "traceback": traceback.format_exc()
    }))
'''
    proc = subprocess.run(
        [sys.executable, "-c", wrapper, code],
        capture_output=True,
        text=True,
        env=env,
    )
    try:
        result = json.loads(proc.stdout)
    except Exception:
        result = {
            "ok": False,
            "stdout": proc.stdout,
            "stderr": proc.stderr,
            "error_name": "ExecutionError",
            "error_value": "Failed to parse execution result",
            "traceback": proc.stdout + "\n" + proc.stderr,
        }

    for line in result.get("stdout", "").splitlines(keepends=True):
        if line.endswith("\n"):
            line = line[:-1]
        yield {"type": "stdout", "text": line}

    for line in result.get("stderr", "").splitlines(keepends=True):
        if line.endswith("\n"):
            line = line[:-1]
        yield {"type": "stderr", "text": line}

    if result.get("ok"):
        yield {"type": "result", "text": "", "is_main_result": True}
    else:
        yield {
            "type": "error",
            "name": result.get("error_name", "Error"),
            "value": result.get("error_value", ""),
            "traceback": result.get("traceback", ""),
        }

    yield {"type": "number_of_executions", "execution_count": 1}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"[cube-code-server] {self.address_string()} - {fmt % args}", file=sys.stderr)

    def do_GET(self):
        if self.path == "/health":
            self.send_response(204)
            self.end_headers()
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path != "/execute":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length).decode("utf-8", errors="replace")
        try:
            payload = json.loads(body) if body else {}
        except Exception as e:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(json.dumps({"type": "error", "name": "BadRequest", "value": str(e)}).encode())
            return

        code = payload.get("code", "")
        env_vars = payload.get("env_vars") or {}

        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Transfer-Encoding", "chunked")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()

        def write_event(evt):
            data = json.dumps(evt).encode() + b"\n"
            self.wfile.write(b"%x\r\n%s\r\n" % (len(data), data))
            self.wfile.flush()

        try:
            for evt in execute_code(code, env_vars):
                write_event(evt)
        except Exception as e:
            write_event({
                "type": "error",
                "name": type(e).__name__,
                "value": str(e),
                "traceback": traceback.format_exc(),
            })

        self.wfile.write(b"0\r\n\r\n")
        self.wfile.flush()


if __name__ == "__main__":
    print(f"Starting cube-code-server on port {PORT}", file=sys.stderr)
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    server.serve_forever()
```

创建 `/tmp/python-template-build/cube-entrypoint-custom.sh`：

```bash
#!/bin/sh
set -eu

ENVD_BIN="${ENVD_BIN:-/usr/bin/envd}"
ENVD_PORT="${ENVD_PORT:-49983}"
CODE_SERVER_BIN="${CODE_SERVER_BIN:-/usr/local/bin/cube-code-server.py}"
CODE_SERVER_PORT="${CODE_SERVER_PORT:-49999}"

if [ ! -x "${ENVD_BIN}" ]; then
    echo "cube-entrypoint: envd binary not found at ${ENVD_BIN}" >&2
    exit 127
fi

if [ ! -x "${CODE_SERVER_BIN}" ]; then
    echo "cube-entrypoint: code server not found at ${CODE_SERVER_BIN}" >&2
    exit 127
fi

mkdir -p /var/log

"${ENVD_BIN}" -port "${ENVD_PORT}" >>/var/log/envd.log 2>&1 &
ENVD_PID=$!
echo "cube-entrypoint: started envd (pid=${ENVD_PID}) on port ${ENVD_PORT}" >&2

python3 "${CODE_SERVER_BIN}" >>/var/log/cube-code-server.log 2>&1 &
CODE_PID=$!
echo "cube-entrypoint: started cube-code-server (pid=${CODE_PID}) on port ${CODE_SERVER_PORT}" >&2

forward_signal() {
    sig="$1"
    kill -s "${sig}" "${ENVD_PID}" 2>/dev/null || true
    kill -s "${sig}" "${CODE_PID}" 2>/dev/null || true
}
trap 'forward_signal TERM' TERM
trap 'forward_signal INT'  INT
trap 'forward_signal HUP'  HUP

wait "${CODE_PID}"
exit $?
```

创建 `/tmp/python-template-build/Dockerfile`：

```dockerfile
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    ENVD_PORT=49983 \
    ENVD_BIN=/usr/bin/envd \
    CODE_SERVER_PORT=49999 \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        python3.11 \
        python3-pip \
        tini \
    && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 100 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --create-home --uid 1000 --shell /bin/bash user \
    && mkdir -p /etc/sudoers.d \
    && echo 'user ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/user \
    && chmod 0440 /etc/sudoers.d/user

COPY envd /usr/bin/envd
COPY cube-entrypoint-custom.sh /usr/local/bin/cube-entrypoint.sh
COPY cube-code-server.py /usr/local/bin/cube-code-server.py

RUN chmod +x /usr/bin/envd /usr/local/bin/cube-entrypoint.sh /usr/local/bin/cube-code-server.py \
    && /usr/bin/envd -version

EXPOSE 49983 49999

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/cube-entrypoint.sh"]
CMD []
```

### 7.5 构建模板镜像

```bash
cd /tmp/python-template-build
docker build -t cube-python-311-envd:latest .
```

### 7.6 通过 CubeMaster 创建模板

```bash
cubemastercli -a 127.0.0.1 -p 8089 template create-from-image \
  --image cube-python-311-envd:latest \
  --template-id tpl-python-311-envd \
  --writable-layer-size 2Gi \
  --expose-port 49999 \
  --memory 4096 \
  --cpu 2000 \
  --json
```

记录返回的 `job_id`，然后等待完成：

```bash
cubemastercli -a 127.0.0.1 -p 8089 template watch --job-id <job-id> --json
```

当 `status` 变为 `READY` 时即可使用。

## 8. Python SDK 验证

### 8.1 安装 SDK

```bash
cd /root/CubeSandbox/sdk/python
pip install -e .
```

### 8.2 配置环境变量

```bash
export CUBE_API_URL="http://127.0.0.1:3000"
export CUBE_TEMPLATE_ID="tpl-python-311-envd"
export CUBE_PROXY_NODE_IP="172.20.16.160"
export CUBE_PROXY_PORT_HTTP="80"
export CUBE_SANDBOX_DOMAIN="sandbox.test.chinawayltd.com"
```

### 8.3 运行验证脚本

创建 `/tmp/test-sdk-e2e.py`：

```python
#!/usr/bin/env python3
"""End-to-end CubeSandbox Python SDK test."""

import os
import time

os.environ.setdefault("CUBE_API_URL", "http://127.0.0.1:3000")
os.environ.setdefault("CUBE_TEMPLATE_ID", "tpl-python-311-envd")
os.environ.setdefault("CUBE_PROXY_NODE_IP", "172.20.16.160")
os.environ.setdefault("CUBE_PROXY_PORT_HTTP", "80")
os.environ.setdefault("CUBE_SANDBOX_DOMAIN", "sandbox.test.chinawayltd.com")

from cubesandbox import Sandbox
from cubesandbox._transport import build_client
from cubesandbox._config import Config


def wait_for_health(sandbox, port=49999, timeout=60):
    config = Config()
    client = build_client(config)
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            resp = client.get(f"http://{sandbox.get_host(port)}/health")
            if resp.status_code in (200, 204):
                return True
        except Exception:
            pass
        time.sleep(1)
    return False


def main():
    print("=" * 60)
    print("CubeSandbox Python SDK end-to-end test")
    print("=" * 60)

    print("\n[1/4] Creating sandbox from template tpl-python-311-envd ...")
    sandbox = Sandbox.create(template="tpl-python-311-envd")
    print(f"      Sandbox ID: {sandbox.sandbox_id}")
    print(f"      Execute URL: http://{sandbox.get_host(49999)}/execute")

    print("\n[2/4] Waiting for code server to be healthy ...")
    if wait_for_health(sandbox):
        print("      Health check passed")
    else:
        print("      WARNING: health check did not pass, continuing anyway")

    print("\n[3/4] Running Python code ...")
    result = sandbox.run_code("print('Hello from CubeSandbox Python 3.11!')")
    print(f"      stdout: {result.logs.stdout}")
    print(f"      stderr: {result.logs.stderr}")
    print(f"      error:  {result.error}")
    assert result.error is None
    assert result.logs.stdout == ["Hello from CubeSandbox Python 3.11!"]
    print("      ✓ run_code assertion passed")

    print("\n[4/4] Running shell command via commands.run ...")
    cmd_result = sandbox.commands.run("python3 --version")
    print(f"      stdout: {cmd_result.stdout.strip()}")
    print(f"      stderr: {cmd_result.stderr.strip()}")
    print(f"      exit_code: {cmd_result.exit_code}")
    assert cmd_result.exit_code == 0
    assert "Python 3.11" in cmd_result.stdout
    print("      ✓ commands.run assertion passed")

    print("\n[Cleanup] Killing sandbox ...")
    sandbox.kill()
    print("      Done")

    print("\n" + "=" * 60)
    print("All tests passed!")
    print("=" * 60)


if __name__ == "__main__":
    main()
```

执行：

```bash
python3 /tmp/test-sdk-e2e.py
```

预期输出：

```text
============================================================
CubeSandbox Python SDK end-to-end test
============================================================

[1/4] Creating sandbox from template tpl-python-311-envd ...
      Sandbox ID: 3426f16545bd4574af0bc0b398b6a18d
      Execute URL: http://49999-3426f16545bd4574af0bc0b398b6a18d.sandbox.test.chinawayltd.com/execute

[2/4] Waiting for code server to be healthy ...
      Health check passed

[3/4] Running Python code ...
      stdout: ['Hello from CubeSandbox Python 3.11!']
      stderr: []
      error:  None
      ✓ run_code assertion passed

[4/4] Running shell command via commands.run ...
      stdout: Python 3.11.0rc10
      stderr:
      exit_code: 0
      ✓ commands.run assertion passed

[Cleanup] Killing sandbox ...
      Done

============================================================
All tests passed!
============================================================
```

## 9. 验证清单

| 检查项 | 命令/方法 | 期望结果 |
|---|---|---|
| 所有服务运行 | `systemctl is-active cube-sandbox-control.target` | `active` |
| CubeAPI 健康 | `curl http://127.0.0.1:3000/health` | `{"status":"ok"}` |
| CubeMaster 健康 | `curl http://127.0.0.1:8089/notify/health` | HTTP 200 |
| 模板就绪 | `cubemastercli -a 127.0.0.1 -p 8089 template list` | `tpl-python-311-envd` 状态 `READY` |
| DNS 解析 | `dig +short 49999-<sandbox_id>.sandbox.test.chinawayltd.com` | 解析到 `172.20.16.160` |
| HTTPS 访问 | `curl -k https://49999-<sandbox_id>.sandbox.test.chinawayltd.com/health` | HTTP 204 |
| Python SDK | `python3 /tmp/test-sdk-e2e.py` | `All tests passed!` |

## 10. 注意事项

1. **自定义代码执行服务仅用于验证**：`cube-code-server.py` 是每个请求独立子进程执行的简单实现，不保留会话状态，不适合生产负载。生产环境应使用完整的代码执行后端（如 Jupyter kernel、e2b 官方 code execution service）。
2. **系统 guest rootfs 必须包含 cube-agent**：如果沙箱创建后立即退出，优先检查 `/usr/local/services/cubetoolbox/cube-image/cube-guest-image-cpu.img` 是否正确注入了 `cube-agent` 作为 `/sbin/init`。
3. **域名解析**：客户端机器需要将 `*.sandbox.test.chinawayltd.com` 解析到 `172.20.16.160`。本机已通过 systemd-resolved + CoreDNS 配置完成；外部客户端需自行配置 DNS。
4. **证书信任**：自定义证书不是公共 CA 签发，客户端需要手动信任 `/data/ssl/_.sandbox.test.chinawayltd.com.crt`，或者使用 `-k` 参数测试。

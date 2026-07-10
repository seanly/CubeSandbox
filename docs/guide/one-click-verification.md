# One-Click Deployment & Python SDK Verification Guide

> This document records how to complete a CubeSandbox one-click deployment on a single bare-metal server, expose it with a custom domain + SSL certificate, and successfully create and execute code in a sandbox through the Python SDK.
>
> Use cases: evaluation, development/testing, and pre-production validation with custom domains and certificates.

## 1. Target Environment

This guide uses the following example environment:

| Item | Value |
|---|---|
| Host OS | Rocky Linux 9.5 |
| Host IP | `172.20.16.160` |
| Custom domain | `*.sandbox.test.chinawayltd.com` |
| SSL certificate directory | `/data/ssl` |
| Certificate files | `_.sandbox.test.chinawayltd.com.crt` / `_.sandbox.test.chinawayltd.com.key` |
| CubeSandbox install directory | `/usr/local/services/cubetoolbox` |
| Package extraction directory | `/opt/cube-sandbox-install/cube-sandbox-one-click-<git-sha>` |
| Official repository | `/root/CubeSandbox` |

## 2. Prerequisites

- Physical or bare-metal server, x86_64 architecture, KVM enabled (`ls /dev/kvm` exists).
- Docker installed and able to run containers.
- Docker registry mirror configured (e.g. `https://hub.rat.dev`), otherwise some base images may be unreachable.
- Wildcard domain certificate prepared and placed in `/data/ssl`.
- `systemd-resolved` installed (not installed by default on Rocky Linux 9; see section 5.1).
- root privileges.

## 3. Build the One-Click Release Package

CubeSandbox provides a containerized builder so the Web dashboard can be built without host npm/Node.js.

### 3.1 Ensure the Builder Image Contains Node.js

The project's `docker/Dockerfile.builder` must include Node.js 22 to build the web dashboard inside the container. Key snippets:

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

Build the builder image:

```bash
cd /root/CubeSandbox
make builder-image  # or the corresponding build command
```

### 3.2 Run the Packaging Script

```bash
cd /root/CubeSandbox/deploy/one-click
./build-release-bundle-builder.sh
```

The script will:

1. Compile cubemaster, cubelet, cube-api, network-agent, cube-agent, cube-shim binaries inside the builder container.
2. Run `npm ci && npm run build` inside the builder container to build the web dashboard.
3. Package everything into a one-click release archive on the host.

Output:

```text
cube-sandbox-one-click-<git-sha>.tar.gz
```

## 4. Install CubeSandbox

### 4.1 Extract the Package

```bash
mkdir -p /opt/cube-sandbox-install
tar -xzf cube-sandbox-one-click-<git-sha>.tar.gz -C /opt/cube-sandbox-install
cd /opt/cube-sandbox-install/cube-sandbox-one-click-<git-sha>
```

### 4.2 Prepare .env

Copy from `env.example`:

```bash
cp env.example .env
```

Edit `.env` for your environment. Key settings for this guide:

```bash
# Node IP
CUBE_SANDBOX_NODE_IP=172.20.16.160

# Custom domain
CUBE_API_SANDBOX_DOMAIN=sandbox.test.chinawayltd.com

# SSL certificates
CUBE_PROXY_CERT_DIR=/data/ssl
CUBE_PROXY_SSL_CERT=_.sandbox.test.chinawayltd.com.crt
CUBE_PROXY_SSL_KEY=_.sandbox.test.chinawayltd.com.key

# Redis must be reachable from the cube-proxy container, so use host IP instead of 127.0.0.1
CUBE_PROXY_REDIS_IP=172.20.16.160

# Proxy ports
CUBE_PROXY_HTTPS_PORT=443
CUBE_PROXY_HTTP_PORT=80
```

### 4.3 Change cube-proxy Network Mode

By default `cube-proxy` uses Docker bridge with port mappings `80→8081` and `443→8080`. When using `--network host`, these mappings do not apply, so OpenResty must listen directly on `80/443`.

Edit `scripts/systemd/cube-proxy-start.sh`:

```bash
docker create \
  --name "${CUBE_PROXY_CONTAINER_NAME}" \
  --network host \
  -v "${CERT_DIR}:/usr/local/openresty/nginx/certs:ro" \
  -v "${GLOBAL_CONF}:/usr/local/openresty/nginx/conf/global/global.conf:ro" \
  "${CUBE_PROXY_IMAGE_TAG}" >/dev/null
```

Edit `cubeproxy/build-context/nginx.conf`:

```nginx
listen 80 reuseport;
listen 443 ssl reuseport;
```

### 4.4 Run the Installer

```bash
./install.sh
```

After installation, systemd will start all services:

```bash
systemctl status cube-sandbox-control.target
```

## 5. Post-Installation Issues & Fixes

### 5.1 DNS Service Fails: `cannot remove /etc/resolv.conf`

Rocky Linux 9 does not install `systemd-resolved` by default, so `cube-sandbox-dns.service` cannot replace `/etc/resolv.conf`.

Fix:

```bash
dnf install -y systemd-resolved
systemctl enable --now systemd-resolved
```

### 5.2 CoreDNS Port 53 Already in Use

A leftover dnsmasq spawned by NetworkManager fallback may occupy `169.254.254.53:53`.

Fix:

```bash
# Find the process
ss -lnp | grep ':53 '

# Clean up NetworkManager configuration
rm -f /etc/NetworkManager/conf.d/90-cubeproxy-dns.conf
rm -f /etc/NetworkManager/dnsmasq.d/90-cubeproxy-cube-app.conf
systemctl restart NetworkManager
```

### 5.3 cube-proxy Cannot Reach Redis

When cube-proxy runs in host network mode, `127.0.0.1:6379` resolves to the container itself, not the host. Set `CUBE_PROXY_REDIS_IP` to the host IP in `.env`.

### 5.4 Sandbox Exits Immediately After Creation

Symptom: sandbox status changes from `running` to `exited` shortly after creation.

Root cause: `cubemastercli template create-from-image` generates an **application template rootfs**. The micro-VM also needs a **system guest rootfs** containing `cube-agent` as `/sbin/init`. If the system guest rootfs is missing `cube-agent`, the VM has no init process and exits immediately.

Fix: manually mount the system guest rootfs image and inject `cube-agent`:

```bash
RFS_IMG=/usr/local/services/cubetoolbox/cubebox_os_image/rfs-<artifact_id>/rfs-<artifact_id>.ext4
MNT=/tmp/rfs-mount

mkdir -p "${MNT}"
mount -o loop "${RFS_IMG}" "${MNT}"

cp -f /root/CubeSandbox/deploy/one-click/.work/prebuilt/cube-agent "${MNT}/usr/sbin/cube-agent-bin"
cat > "${MNT}/usr/sbin/init" <<'EOF'
#!/bin/sh
exec /usr/sbin/cube-agent-bin init "$@"
EOF
chmod +x "${MNT}/usr/sbin/init" "${MNT}/usr/sbin/cube-agent-bin"

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

# Recalculate sha256 and update MySQL
sha=$(sha256sum "${RFS_IMG}" | awk '{print $1}')
size=$(stat -c%s "${RFS_IMG}")
mysql -uroot -pcube_root cube_mvp -e "
UPDATE t_cube_rootfs_artifact SET ext4_sha256='${sha}', ext4_size_bytes=${size} WHERE artifact_id='rfs-<artifact_id>';
"
```

> Note: In CI/CD, modify `deploy/one-click/build-vm-assets.sh` so that `inject_agent_into_guest_rootfs` runs during system guest rootfs packaging.

## 6. Service Status Checks

After installation, confirm all systemd units are `active`:

```bash
systemctl is-active cubemaster cubelet cube-api cube-proxy cube-sandbox-dns \
  cube-sandbox-mysql cube-sandbox-redis cube-sandbox-network-agent \
  cube-sandbox-webui cube-sandbox-coredns
```

Health endpoints:

```bash
curl -s http://127.0.0.1:3000/health
curl -s http://127.0.0.1:8089/notify/health
```

## 7. Build a Python 3.11 Template

### 7.1 Key Concept: System Rootfs vs Application Rootfs

A CubeSandbox sandbox uses two rootfs layers:

| Layer | Image | Mounted as | Contains cube-agent |
|---|---|---|---|
| System Guest Rootfs | `cube-sandbox-guest-image:one-click` | `pmem0` | Yes |
| Application Template Rootfs | User image from `create-from-image` | `pmem1+` | No |

Therefore, **application template images do not need cube-agent**, but they must provide a code execution service accessible to the Python SDK.

### 7.2 Why a Custom Code Execution Service Is Needed

The project's `docker/Dockerfile.cube-base` compiles `envd` from `e2b-dev/infra@2026.16`. That `envd` exposes:

- `GET /health`
- `POST /init`
- `GET /envs`
- `GET/POST /files`
- `GET /metrics`

But it **does not expose `/execute`**.

The Python SDK's `Sandbox.run_code()` hardcodes:

```python
url = f"http://{self.get_host(JUPYTER_PORT)}/execute"
# JUPYTER_PORT = 49999
```

So the template must provide an `/execute` service on port `49999`, otherwise `run_code()` returns HTTP 404.

### 7.3 Compile envd

Use the builder image to compile envd:

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

Output: `/tmp/envd-build/envd`

### 7.4 Prepare the Template Dockerfile

Create the build directory:

```bash
mkdir -p /tmp/python-template-build
cp /tmp/envd-build/envd /tmp/python-template-build/envd
cp /root/CubeSandbox/docker/cube-entrypoint.sh /tmp/python-template-build/cube-entrypoint.sh
```

Create `/tmp/python-template-build/cube-code-server.py`:

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

Create `/tmp/python-template-build/cube-entrypoint-custom.sh`:

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

Create `/tmp/python-template-build/Dockerfile`:

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

### 7.5 Build the Template Image

```bash
cd /tmp/python-template-build
docker build -t cube-python-311-envd:latest .
```

### 7.6 Create the Template via CubeMaster

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

Record the returned `job_id` and wait for completion:

```bash
cubemastercli -a 127.0.0.1 -p 8089 template watch --job-id <job-id> --json
```

When `status` becomes `READY`, the template is usable.

## 8. Python SDK Verification

### 8.1 Install the SDK

```bash
cd /root/CubeSandbox/sdk/python
pip install -e .
```

### 8.2 Configure Environment Variables

```bash
export CUBE_API_URL="http://127.0.0.1:3000"
export CUBE_TEMPLATE_ID="tpl-python-311-envd"
export CUBE_PROXY_NODE_IP="172.20.16.160"
export CUBE_PROXY_PORT_HTTP="80"
export CUBE_SANDBOX_DOMAIN="sandbox.test.chinawayltd.com"
```

### 8.3 Run the Verification Script

Create `/tmp/test-sdk-e2e.py`:

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

Run:

```bash
python3 /tmp/test-sdk-e2e.py
```

Expected output:

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

## 9. Verification Checklist

| Check | Command/Method | Expected Result |
|---|---|---|
| All services running | `systemctl is-active cube-sandbox-control.target` | `active` |
| CubeAPI health | `curl http://127.0.0.1:3000/health` | `{"status":"ok"}` |
| CubeMaster health | `curl http://127.0.0.1:8089/notify/health` | HTTP 200 |
| Template ready | `cubemastercli -a 127.0.0.1 -p 8089 template list` | `tpl-python-311-envd` status `READY` |
| DNS resolution | `dig +short 49999-<sandbox_id>.sandbox.test.chinawayltd.com` | Resolves to `172.20.16.160` |
| HTTPS access | `curl -k https://49999-<sandbox_id>.sandbox.test.chinawayltd.com/health` | HTTP 204 |
| Python SDK | `python3 /tmp/test-sdk-e2e.py` | `All tests passed!` |

## 10. Notes

1. **Custom code execution service is for verification only**: `cube-code-server.py` runs each request in an isolated subprocess and does not preserve session state. It is not suitable for production load. For production, use a complete code execution backend (e.g. Jupyter kernel, e2b official code execution service).
2. **System guest rootfs must contain cube-agent**: If a sandbox exits immediately after creation, first verify that `/usr/local/services/cubetoolbox/cube-image/cube-guest-image-cpu.img` has `cube-agent` injected as `/sbin/init`.
3. **Domain resolution**: Client machines must resolve `*.sandbox.test.chinawayltd.com` to `172.20.16.160`. The host itself is configured via systemd-resolved + CoreDNS; external clients need their own DNS configuration.
4. **Certificate trust**: The custom certificate is not issued by a public CA. Clients must manually trust `/data/ssl/_.sandbox.test.chinawayltd.com.crt` or use `-k` for testing.

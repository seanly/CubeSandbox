# Usage Guide

> This document explains how to use the CubeSandbox sandbox service after deployment via the Web console, REST API, and Python SDK.

## 1. Service Endpoints

Assuming CubeSandbox is deployed on node `172.20.16.160` with custom domain `*.sandbox.test.chinawayltd.com`:

| Entrypoint | URL | Description |
|---|---|---|
| Web Dashboard | `http://172.20.16.160:12088` | Browser-based management console |
| REST API | `http://172.20.16.160:3000` | E2B-compatible API |
| REST API (admin prefix) | `http://172.20.16.160:3000/cubeapi/v1/...` | Management endpoints with `/cubeapi/v1` prefix |
| Sandbox subdomain | `{port}-{sandbox_id}.sandbox.test.chinawayltd.com` | Access services exposed inside a sandbox |

### 1.1 Web Console

Open directly in a browser:

```text
http://172.20.16.160:12088
```

The console provides:

- Sandbox list, status, and resource usage
- Template list
- Node and cluster overview
- Log viewing

### 1.2 REST API Health Check

```bash
curl -s http://172.20.16.160:3000/health
```

Expected response:

```json
{"status":"ok"}
```

## 2. Using the REST API

CubeAPI provides two route prefixes:

- **Root path `/`** — E2B-compatible interfaces such as `/sandboxes`, `/templates`, `/health`
- **`/cubeapi/v1/` prefix** — Management endpoints are also mounted here, e.g. `/cubeapi/v1/cluster/overview`

### 2.1 Common API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/sandboxes` | List sandboxes |
| POST | `/sandboxes` | Create a sandbox |
| GET | `/v2/sandboxes` | List sandboxes (V2 format) |
| GET | `/sandboxes/{sandboxID}` | Get sandbox details |
| DELETE | `/sandboxes/{sandboxID}` | Stop/delete a sandbox |
| POST | `/sandboxes/{sandboxID}/refresh` | Refresh sandbox timeout |
| POST | `/sandboxes/{sandboxID}/pause` | Pause sandbox |
| POST | `/sandboxes/{sandboxID}/resume` | Resume sandbox |
| POST | `/sandboxes/{sandboxID}/connect` | Connect to an existing sandbox |
| GET | `/sandboxes/{sandboxID}/logs` | Get sandbox logs |
| GET | `/templates` | List templates |
| POST | `/templates` | Create a template |
| GET | `/templates/{templateID}` | Get template details |
| POST | `/templates/{templateID}` | Rebuild template |
| PATCH | `/templates/{templateID}` | Update template |
| DELETE | `/templates/{templateID}` | Delete template |
| GET | `/cubeapi/v1/cluster/overview` | Cluster overview |
| GET | `/cubeapi/v1/nodes` | List nodes |

### 2.2 Create a Sandbox

```bash
curl -X POST http://172.20.16.160:3000/sandboxes \
  -H "Content-Type: application/json" \
  -d '{
    "templateID": "tpl-python-311-envd",
    "timeout": 300
  }'
```

Example response:

```json
{
  "sandboxID": "abc123-def456",
  "templateID": "tpl-python-311-envd",
  "status": "running",
  "domain": "sandbox.test.chinawayltd.com"
}
```

### 2.3 List Sandboxes

```bash
curl -s http://172.20.16.160:3000/sandboxes | python3 -m json.tool
```

### 2.4 Delete a Sandbox

```bash
curl -X DELETE http://172.20.16.160:3000/sandboxes/{sandboxID}
```

## 3. Using the Python SDK

CubeSandbox provides an E2B-compatible Python SDK in the `sdk/python/` directory.

### 3.1 Install the SDK

```bash
cd /root/CubeSandbox/sdk/python
pip install -e .
```

### 3.2 Configure Environment Variables

```bash
export CUBE_API_URL="http://172.20.16.160:3000"
export CUBE_TEMPLATE_ID="tpl-python-311-envd"
export CUBE_PROXY_NODE_IP="172.20.16.160"
export CUBE_PROXY_PORT_HTTP="80"
export CUBE_SANDBOX_DOMAIN="sandbox.test.chinawayltd.com"
```

- `CUBE_API_URL` — CubeAPI address
- `CUBE_TEMPLATE_ID` — Default template ID
- `CUBE_PROXY_NODE_IP` — CubeProxy node IP; the SDK bypasses DNS and connects directly to this IP
- `CUBE_PROXY_PORT_HTTP` — CubeProxy HTTP port
- `CUBE_SANDBOX_DOMAIN` — Sandbox subdomain suffix

### 3.3 Create a Sandbox and Run Code

```python
from cubesandbox import Sandbox

# Create a sandbox
sandbox = Sandbox.create(template="tpl-python-311-envd")
print(f"Sandbox ID: {sandbox.sandbox_id}")

# Execute Python code
result = sandbox.run_code("print('Hello from CubeSandbox!')")
print("stdout:", result.logs.stdout)
print("stderr:", result.logs.stderr)

# Execute a shell command
cmd_result = sandbox.commands.run("python3 --version")
print("stdout:", cmd_result.stdout)
print("exit_code:", cmd_result.exit_code)

# Destroy the sandbox
sandbox.kill()
```

### 3.4 Specify Template and Timeout

```python
from cubesandbox import Sandbox

sandbox = Sandbox.create(
    template="tpl-python-311-envd",
    timeout=600,  # 10 minutes
)
```

### 3.5 Connect to an Existing Sandbox

```python
from cubesandbox import Sandbox

sandbox = Sandbox.connect("abc123-def456")
result = sandbox.run_code("print('reconnected')")
sandbox.kill()
```

### 3.6 File Operations

```python
from cubesandbox import Sandbox

sandbox = Sandbox.create(template="tpl-python-311-envd")

# Write a file
sandbox.commands.run("echo 'hello' > /tmp/test.txt")

# Read a file
content = sandbox.files.read("/tmp/test.txt")
print(content)

sandbox.kill()
```

> Note: `files.read()` internally uses `run_code()` to execute Python code that reads the file, so the template's code execution service must be working.

## 4. Accessing Sandbox Internal Services

After a sandbox is created, its exposed ports can be accessed via subdomains:

```text
http://{port}-{sandbox_id}.{domain}
https://{port}-{sandbox_id}.{domain}
```

For example, with the Python 3.11 template, the code execution service listens on port `49999`:

```text
http://49999-abc123-def456.sandbox.test.chinawayltd.com/execute
```

### 4.1 Access Flow

```text
Client
  │
  ▼  DNS query for 49999-abc123-def456.sandbox.test.chinawayltd.com
  │
  ▼  Resolves to 172.20.16.160
  │
  ▼  HTTP request with Host header 49999-abc123-def456.sandbox.test.chinawayltd.com
  │
  ▼  cube-proxy (listening on 80/443) parses sandboxID and port from Host
  │
  ▼  Forwards to the sandbox's internal IP and port
```

### 4.2 Direct curl Access

```bash
# HTTP
curl -H "Host: 49999-abc123-def456.sandbox.test.chinawayltd.com" \
  http://172.20.16.160/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "print(1)"}'

# HTTPS (self-signed certificate, use -k for testing)
curl -k -H "Host: 49999-abc123-def456.sandbox.test.chinawayltd.com" \
  https://172.20.16.160/execute \
  -H "Content-Type: application/json" \
  -d '{"code": "print(1)"}'
```

### 4.3 SDK Handles Routing Automatically

The SDK's `IPOverrideTransport` automatically:

1. Replaces the request target IP with `CUBE_PROXY_NODE_IP`
2. Preserves the original `Host` header
3. Uses `CUBE_PROXY_PORT_HTTP` as the connection port

So business code does not need to manually handle subdomain resolution.

## 5. External Client Requirements

### 5.1 DNS Configuration

External clients must be able to resolve `*.sandbox.test.chinawayltd.com` to `172.20.16.160`.

Option 1: Add a wildcard record on your DNS server:

```text
*.sandbox.test.chinawayltd.com  A  172.20.16.160
```

Option 2: Add per-sandbox entries to the client's `/etc/hosts`:

```text
172.20.16.160  49999-abc123-def456.sandbox.test.chinawayltd.com
```

### 5.2 Certificate Trust

Because a custom SSL certificate is used, external clients accessing HTTPS must either:

1. Import `/data/ssl/_.sandbox.test.chinawayltd.com.crt` into the system trust store
2. Use `-k`/`--insecure` to skip verification during testing

The Python SDK currently defaults to HTTP (port 80). To use HTTPS, you need to configure an SSL context that trusts the certificate.

## 6. Typical Business Architecture

### 6.1 AI Agent Code Execution Service

```text
User / Frontend
   │
   ▼
Business backend (FastAPI / Flask / Django)
   │
   ├── Create sandbox via CubeAPI ──▶ 172.20.16.160:3000
   │
   ├── Send code execution request via subdomain ──▶ 49999-{id}.sandbox.test.chinawayltd.com
   │
   └── Destroy sandbox via CubeAPI ──▶ 172.20.16.160:3000
```

### 6.2 Concurrent Sandboxes

```python
from concurrent.futures import ThreadPoolExecutor
from cubesandbox import Sandbox

def run_in_sandbox(code):
    sandbox = Sandbox.create(template="tpl-python-311-envd", timeout=60)
    try:
        result = sandbox.run_code(code)
        return result.logs.stdout
    finally:
        sandbox.kill()

codes = [
    "print('task 1')",
    "print('task 2')",
    "print('task 3')",
]

with ThreadPoolExecutor(max_workers=3) as executor:
    results = list(executor.map(run_in_sandbox, codes))
    print(results)
```

### 6.3 Long-Running Sandboxes

By default sandboxes have a timeout and are automatically reclaimed. To extend:

```python
# Specify a long timeout at creation
sandbox = Sandbox.create(template="tpl-python-311-envd", timeout=3600)

# Or refresh while running
sandbox.refresh()
```

## 7. Complete Example: FastAPI Integration

```python
from fastapi import FastAPI
from cubesandbox import Sandbox

app = FastAPI()

@app.post("/run")
def run_code(code: str):
    sandbox = Sandbox.create(template="tpl-python-311-envd", timeout=300)
    try:
        result = sandbox.run_code(code)
        return {
            "stdout": result.logs.stdout,
            "stderr": result.logs.stderr,
            "error": result.error.value if result.error else None,
        }
    finally:
        sandbox.kill()
```

Start:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

Call:

```bash
curl -X POST http://localhost:8000/run \
  -H "Content-Type: application/json" \
  -d '{"code": "print(1 + 2)"}'
```

## 8. FAQ

### 8.1 SDK reports DNS error when connecting to sandbox subdomain

Ensure the client can resolve `*.sandbox.test.chinawayltd.com`, or set `CUBE_PROXY_NODE_IP` correctly so the SDK bypasses DNS.

### 8.2 HTTPS access fails with certificate error

The custom certificate must be trusted by the client. Test functionality with HTTP (port 80) first.

### 8.3 Sandbox created but code execution returns 404

Check that the template exposes the code execution port (e.g. `49999` for the Python template) and that a service is listening on that port inside the sandbox.

### 8.4 Sandbox exits automatically

Check the sandbox timeout and whether the system guest rootfs has `cube-agent` injected correctly. See [One-Click Deployment Verification Guide](./one-click-verification.md).

## 9. Related Documentation

- [One-Click Deployment Verification Guide](./one-click-verification.md) — Complete steps to deploy and verify from scratch
- [Create Templates from OCI Image](./tutorials/template-from-image.md) — How to build custom templates
- [Template Inspection & Request Preview](./template-inspection-and-preview.md) — Inspect template request structure
- [HTTPS & Domain Resolution](./https-and-domain.md) — Domain and certificate configuration details

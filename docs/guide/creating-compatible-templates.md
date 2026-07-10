# Creating CubeSandbox-Compatible Templates

> This doc answers a common question: **Can a plain Docker/OCI image be used directly as a CubeSandbox template?**  
> Answer: **No — but it can be turned into one.**

CubeSandbox does not run images with a container runtime. Instead, it boots an image as the **rootfs of a MicroVM**. So the image must satisfy CubeSandbox's runtime contract before `cubemastercli tpl create-from-image` can turn it into a template.

---

## 1. What is a CubeSandbox Template?

A **Template** is not just a container image. It consists of:

1. An **ext4 rootfs** built from an OCI image.
2. A **memory/state snapshot** captured after cold-booting that rootfs inside a MicroVM.
3. A registered, hot-startable base unit referenced by a `template_id`.

See [Templates Overview](./templates.md) for the full lifecycle.

---

## 2. Why a Plain Image Is Not Enough

A plain image lacks the capabilities the CubeSandbox runtime relies on:

| Missing capability | Consequence |
|---|---|
| No `envd` daemon | SDK calls for files, processes, Jupyter kernels, etc. will not work. |
| No probe-able HTTP service | `create-from-image` readiness probe times out and the template never becomes `READY`. |
| Incompatible with MicroVM boot flow | `cube-agent` running as PID 1 cannot initialize the environment correctly. |
| Ports not declared | CubeMaster does not know which ports to expose to sandbox consumers. |

So using an unmodified `python:3.11` or `nginx:latest` image directly will almost always fail.

---

## 3. Runtime Contract for Template Images

### 3.1 Must Include and Start `envd`

`envd` is the in-sandbox service that implements the E2B-compatible API (files, processes, kernels, etc.). It listens on port **49983** by default and exposes a `/health` endpoint.

The official base image `ghcr.io/tencentcloud/cubesandbox-base:2026.16` already bundles `envd` and the correct entrypoint. Use it as a starting point:

```dockerfile
FROM ghcr.io/tencentcloud/cubesandbox-base:2026.16
```

The startup logic is in [docker/cube-entrypoint.sh](../../../docker/cube-entrypoint.sh):

1. Start `envd` in the background on `${ENVD_PORT:-49983}`.
2. If a user `CMD` is provided, exec it as the foreground process while `envd` stays alive.
3. If no `CMD` is provided, wait on `envd`.

> **Important:** Do not override `ENTRYPOINT` in a way that prevents `envd` from starting. If you need a custom entrypoint, make sure it eventually launches `/usr/bin/envd`.

### 3.2 Must Pass an HTTP Readiness Probe

During template creation, CubeMaster repeatedly calls the HTTP endpoint you specify. The template is considered ready only when it returns **2xx**.

The create command must include:

```bash
--expose-port <port>   # declare the port exposed by the container
--probe <port>         # port CubeMaster should probe
--probe-path <path>    # HTTP path to GET, e.g. /health
```

For the official base image you can use:

```bash
--probe 49983 --probe-path /health
```

See [Creating Templates from OCI Images](./tutorials/template-from-image.md) for details.

### 3.3 Must Be Compatible with `cube-agent` Boot Flow

Inside the MicroVM, `cube-agent` runs as PID 1. It performs initial mounts (`/proc`, `/sys`, `/dev/shm`, `/run`, etc.) and executes `/etc/rc.local`. The image therefore needs:

- A working `/bin/sh` and basic tooling (`busybox`, `util-linux`, etc.).
- A filesystem layout that `cube-agent` can mount and bootstrap.

Relevant code:

- [agent/src/main.rs](../../../agent/src/main.rs)
- [agent/src/mount.rs](../../../agent/src/mount.rs)

### 3.4 Port Exposure Limits

Besides the default `envd` port `49983`, you can declare at most **3 custom ports**. If you need `run_code` / Jupyter support, you will typically also expose **49999**.

See [CubeMaster/pkg/templatecenter/template_image.go](../../../CubeMaster/pkg/templatecenter/template_image.go).

---

## 4. How to Create a Compatible Template

### 4.1 Recommended: Build on Top of the Official Base Image

```dockerfile
# syntax=docker/dockerfile:1.7
FROM ghcr.io/tencentcloud/cubesandbox-base:2026.16

# Install your runtime dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Optional: if you need run_code / Jupyter support
RUN pip install --no-cache-dir jupyter_kernel_gateway ipykernel

# Do NOT override ENTRYPOINT.
# cube-entrypoint.sh starts envd in the background, then runs the CMD below.
CMD ["python3", "-m", "http.server", "8080"]
```

Build and push:

```bash
docker build -t my-registry/my-sandbox:v1 .
docker push my-registry/my-sandbox:v1
```

### 4.2 Create the Template via CLI

```bash
cubemastercli tpl create-from-image \
  --image my-registry/my-sandbox:v1 \
  --writable-layer-size 2G \
  --expose-port 49983 \
  --expose-port 49999 \
  --probe 49983 \
  --probe-path /health
```

> For mainland China, use the domestic registry equivalents such as `cube-sandbox-cn.tencentcloudcr.com/cube-sandbox/sandbox-code:latest`.

### 4.3 Wait Until the Template Is Ready

```bash
cubemastercli tpl watch --job-id <job_id>
```

Once `status` becomes `READY`, the `template_id` can be used by the SDK to create sandboxes.

---

## 5. Example References

| Example | Path | Description |
|---|---|---|
| Official base image | [docker/Dockerfile.cube-base](../../../docker/Dockerfile.cube-base) | Bundles `envd`, tini, entrypoint, and exposes `49983`. |
| Nginx demo image | [examples/cubesandbox-base-nginx/Dockerfile](../../../examples/cubesandbox-base-nginx/Dockerfile) | Extends the base image, installs nginx, exposes `80` and `49983`, starts nginx via `CMD`. |
| Inject `envd` into an existing image | [examples/mini-rl-training/envd-inject/Dockerfile](../../../examples/mini-rl-training/envd-inject/Dockerfile) | For images where you cannot change the `FROM`. |

---

## 6. Common Failure Scenarios

| Symptom | Likely cause | Fix |
|---|---|---|
| `phase: PULLING` stuck | Registry unreachable or needs auth | Check network; for private registries add `--registry-username` / `--registry-password`. |
| `status: FAILED` after `BUILDING` | Build error (bad Dockerfile, disk full, etc.) | Run `cubemastercli tpl status --job-id <id> --json` and inspect `last_error`. |
| Template creation times out / probe fails | `envd` not started, or wrong probe port/path | Ensure the entrypoint starts `envd`; verify `--probe` and `--probe-path`. |
| SDK cannot read files / run code | Image lacks `envd` | Rebuild from the official base image or manually inject `envd`. |

---

## 7. Summary

- **A plain image is not a CubeSandbox template.**
- Template = OCI image → ext4 rootfs → MicroVM cold boot → snapshot → registration.
- The image must satisfy three core contracts: **includes `envd`**, **passes an HTTP readiness probe**, and **is compatible with the `cube-agent` boot flow**.
- The safest approach is to **build `FROM ghcr.io/tencentcloud/cubesandbox-base:2026.16`** and then use `create-from-image`.

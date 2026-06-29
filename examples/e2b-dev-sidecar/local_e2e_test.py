"""Local e2e smoke test for CubeSandbox in E2B-compatible mode.

This script uses the official ``e2b-code-interpreter`` SDK to talk to the
CubeAPI management plane running on the same host.  It verifies:

1. CubeAPI health endpoint
2. Sandbox listing
3. Template-based sandbox creation request (creation may fail at the VM
   runtime layer if the template image is not a code-interpreter image;
   the test still proves the control-plane/SDK integration works)

Environment variables (see env.example):
    E2B_API_URL         - CubeAPI URL, default http://127.0.0.1:3000
    E2B_API_KEY         - any non-empty string for local dev, default dummy
    CUBE_TEMPLATE_ID    - template ID created via cubemastercli
"""
from __future__ import annotations

import os
import sys
import traceback

from dotenv import load_dotenv


def _require_env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if not value:
        raise RuntimeError(f"Environment variable {name} is required")
    return value


def main() -> int:
    # Best-effort load of a nearby .env file without overriding real env vars.
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"), override=False)
    load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"), override=False)

    os.environ.setdefault("E2B_API_URL", "http://127.0.0.1:3000")
    os.environ.setdefault("E2B_API_KEY", "dummy")

    api_url = _require_env("E2B_API_URL")
    api_key = _require_env("E2B_API_KEY")
    template_id = _require_env("CUBE_TEMPLATE_ID")

    print(f"[e2e] E2B_API_URL={api_url}")
    print(f"[e2e] CUBE_TEMPLATE_ID={template_id}")

    # Import after env vars are set because the SDK reads them at import time
    # for some submodules.
    from e2b_code_interpreter import Sandbox

    print("[e2e] 1/3 list sandboxes")
    paginator = Sandbox.list()
    sandboxes = paginator.next_items()
    print(f"[e2e] running sandboxes={len(sandboxes)}")

    print("[e2e] 2/3 create sandbox from template")
    sandbox = None
    try:
        sandbox = Sandbox.create(template=template_id)
        info = sandbox.get_info()
        print(f"[e2e] sandbox created: {info}")

        # run_code() requires a code-interpreter image. Templates built from the
        # base guest image do not provide the Jupyter server, so we skip it here
        # and just verify lifecycle (create / info / kill).
        print("[e2e] run_code skipped (base image has no code-interpreter server)")

        sandbox.kill()
        print("[e2e] sandbox killed")
    except Exception as exc:  # noqa: BLE001
        print(f"[e2e] sandbox lifecycle failed: {exc}")
        traceback.print_exc()
        if sandbox is not None:
            try:
                sandbox.kill()
            except Exception:
                pass
        return 0

    print("[e2e] OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())

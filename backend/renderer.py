"""Playwright/bwrap HTML → PNG renderer.

Architecture:
1. Download HTML from R2 to ephemeral tmpdir under /var/tmp/forge-render/
2. Bind-mount vendored fonts
3. Run bwrap + playwright screenshot (no network, per-render isolation)
4. Upload PNG to R2
5. Cleanup tmpdir

bwrap sandbox:
- --unshare-net: Chromium has no network (prevents SSRF)
- --bind only ephemeral workspace
- vendored fonts only (no external requests needed)
- user namespace isolation
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
import tempfile
import uuid
from pathlib import Path

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ASSETS_DIR = Path(__file__).parent / "assets"
FONTS_DIR = ASSETS_DIR / "fonts"
RENDER_BASE = Path("/var/tmp/forge-render")

# Try to detect venv playwright path
def _playwright_path() -> str:
    venv = os.environ.get("VIRTUAL_ENV") or str(Path(__file__).parent.parent / ".venv")
    candidates = [
        f"{venv}/bin/playwright",
        "/opt/forge-simple/.venv/bin/playwright",
        "playwright",  # fallback to PATH
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    return "playwright"


def _ms_playwright_cache() -> str:
    # Check common locations
    candidates = [
        str(Path.home() / ".cache" / "ms-playwright"),
        "/root/.cache/ms-playwright",
    ]
    for c in candidates:
        if Path(c).exists():
            return c
    return str(Path.home() / ".cache" / "ms-playwright")


# ---------------------------------------------------------------------------
# bwrap command builder
# ---------------------------------------------------------------------------

def build_render_cmd(workspace_dir: str, html_rel: str, png_rel: str) -> list[str]:
    """Build bwrap + playwright screenshot command.

    workspace_dir: absolute path to ephemeral tmpdir (will be bind-mounted as /workspace)
    html_rel: filename relative to workspace, e.g. "slide_01.html"
    png_rel: filename relative to workspace, e.g. "slide_01.png"
    """
    playwright_bin = _playwright_path()
    ms_playwright = _ms_playwright_cache()
    venv = os.environ.get("VIRTUAL_ENV") or str(Path(__file__).parent.parent / ".venv")

    cmd = [
        "bwrap",
        # System libs — read-only
        "--ro-bind", "/usr", "/usr",
        "--ro-bind", "/lib", "/lib",
    ]

    # lib64 may not exist on all systems
    if Path("/lib64").exists():
        cmd += ["--ro-bind", "/lib64", "/lib64"]

    cmd += [
        "--ro-bind", "/bin", "/bin",
    ]

    if Path("/etc/fonts").exists():
        cmd += ["--ro-bind", "/etc/fonts", "/etc/fonts"]
    if Path("/etc/resolv.conf").exists():
        cmd += ["--ro-bind", "/etc/resolv.conf", "/etc/resolv.conf"]
    if Path("/etc/ssl").exists():
        cmd += ["--ro-bind", "/etc/ssl", "/etc/ssl"]

    # Playwright Chromium cache (read-only — contains browser binary)
    cmd += ["--ro-bind", ms_playwright, "/root/.cache/ms-playwright"]

    # Python venv (read-only — contains playwright CLI)
    cmd += ["--ro-bind", venv, venv]

    # Vendored fonts → /workspace/fonts (read-only inside sandbox)
    cmd += ["--ro-bind", str(FONTS_DIR), "/workspace/fonts"]

    # Standard ephemeral mounts
    cmd += [
        "--dev", "/dev",
        "--proc", "/proc",
        "--tmpfs", "/tmp",
        "--tmpfs", "/root/.config",       # Chromium profile writable in tmpfs
        "--tmpfs", "/root/.cache/chromium",  # Chromium runtime cache
    ]

    # Writable workspace (HTML in, PNG out)
    cmd += [
        "--bind", workspace_dir, "/workspace",
        "--chdir", "/workspace",
    ]

    # Namespace isolation
    cmd += [
        "--unshare-user",
        "--unshare-pid",
        "--unshare-uts",
        "--unshare-ipc",
        "--unshare-cgroup-try",
        "--unshare-net",        # No network — prevents SSRF
        "--die-with-parent",
        "--new-session",
    ]

    # playwright screenshot command
    cmd += [
        playwright_bin, "screenshot",
        "--viewport-size=1080,1350",
        "--full-page=false",
        f"file:///workspace/{html_rel}",
        f"/workspace/{png_rel}",
    ]

    return cmd


# ---------------------------------------------------------------------------
# Main render function
# ---------------------------------------------------------------------------

async def render_html(
    sid: str,
    html_key_rel: str,
    png_key_rel: str,
    timeout: float = 35.0,
) -> str:
    """Download HTML from R2, render via bwrap+playwright, upload PNG to R2.

    Returns summary string like "Rendered slide_01.html → slide_01.png (142 KB)".
    Raises on error.
    """
    from backend.storage_r2 import get_object, put_object, session_key, validate_key_name

    validate_key_name(html_key_rel)
    validate_key_name(png_key_rel)

    html_r2_key = session_key(sid, html_key_rel)
    png_r2_key = session_key(sid, png_key_rel)

    # Create ephemeral workspace
    RENDER_BASE.mkdir(parents=True, exist_ok=True)
    workspace = RENDER_BASE / f"{sid}-{uuid.uuid4().hex[:8]}"
    workspace.mkdir(parents=True, exist_ok=True)

    try:
        # Download HTML from R2
        html_bytes = await get_object(html_r2_key)
        html_file = workspace / html_key_rel
        html_file.write_bytes(html_bytes)

        # Build and run bwrap command
        cmd = build_render_cmd(str(workspace), html_key_rel, png_key_rel)
        logger.debug("render cmd: %s", " ".join(cmd))

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(), timeout=timeout
                )
            except asyncio.TimeoutError:
                proc.kill()
                await proc.communicate()
                raise TimeoutError(f"Render timed out after {timeout}s")
        except asyncio.CancelledError:
            proc.kill()
            try:
                await asyncio.wait_for(proc.wait(), timeout=2.0)
            except asyncio.TimeoutError:
                pass
            raise

        if proc.returncode != 0:
            err = stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(f"Renderer failed (rc={proc.returncode}): {err[-500:]}")

        # Read output PNG
        png_file = workspace / png_key_rel
        if not png_file.exists() or png_file.stat().st_size == 0:
            err = stderr.decode("utf-8", errors="replace").strip()
            raise RuntimeError(f"PNG not created. stderr: {err[-300:]}")

        png_bytes = png_file.read_bytes()
        if len(png_bytes) > 1_000_000:
            logger.warning("PNG size %d bytes exceeds 1MB", len(png_bytes))

        # Upload PNG to R2
        await put_object(png_r2_key, png_bytes, content_type="image/png")

        size_kb = len(png_bytes) // 1024
        return f"Rendered {html_key_rel} → {png_key_rel} ({size_kb} KB)"

    finally:
        if workspace.exists():
            shutil.rmtree(workspace, ignore_errors=True)


# ---------------------------------------------------------------------------
# Availability check (called at lifespan)
# ---------------------------------------------------------------------------

async def check_renderer_available() -> dict[str, str]:
    """Check bwrap, playwright, and R2 availability. Returns status dict."""
    import subprocess
    from backend.storage_r2 import ping

    status: dict[str, str] = {}

    # bwrap version
    try:
        result = subprocess.run(["bwrap", "--version"], capture_output=True, text=True, timeout=5)
        status["bwrap"] = result.stdout.strip() or result.stderr.strip() or "ok"
    except FileNotFoundError:
        status["bwrap"] = "NOT FOUND"
    except Exception as e:
        status["bwrap"] = f"error: {e}"

    # playwright version
    try:
        playwright_bin = _playwright_path()
        result = subprocess.run(
            [playwright_bin, "--version"], capture_output=True, text=True, timeout=5
        )
        status["playwright"] = result.stdout.strip() or "ok"
    except FileNotFoundError:
        status["playwright"] = "NOT FOUND"
    except Exception as e:
        status["playwright"] = f"error: {e}"

    # R2 connectivity
    try:
        await ping()
        status["r2"] = "ok"
    except Exception as e:
        status["r2"] = f"error: {e}"

    # Fonts directory
    if FONTS_DIR.exists() and any(FONTS_DIR.iterdir()):
        status["fonts"] = f"ok ({len(list(FONTS_DIR.iterdir()))} files)"
    else:
        status["fonts"] = "NOT FOUND"

    return status

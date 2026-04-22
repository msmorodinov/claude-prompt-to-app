"""Tests for renderer.py.

Render tests require bwrap + playwright installed. Skipped when not available.
R2 tests require R2 credentials. Skipped when not configured.
"""
from __future__ import annotations

import os
import shutil
import uuid
from pathlib import Path

import pytest

from backend.renderer import build_render_cmd, FONTS_DIR

# ---------------------------------------------------------------------------
# Unit tests (no bwrap/R2 needed)
# ---------------------------------------------------------------------------


class TestBuildRenderCmd:
    def test_cmd_structure(self):
        cmd = build_render_cmd("/tmp/workspace", "slide_01.html", "slide_01.png")
        assert cmd[0] == "bwrap"
        assert "--unshare-net" in cmd
        assert "--unshare-user" in cmd
        assert "--unshare-pid" in cmd
        assert "--die-with-parent" in cmd
        assert "screenshot" in cmd
        assert "--viewport-size=1080,1350" in cmd
        assert "--full-page=false" in cmd

    def test_no_share_net(self):
        """Verify network is unshared (SSRF prevention)."""
        cmd = build_render_cmd("/tmp/ws", "test.html", "test.png")
        assert "--share-net" not in cmd
        assert "--unshare-net" in cmd

    def test_workspace_bind(self):
        cmd = build_render_cmd("/var/tmp/forge-render/test", "a.html", "a.png")
        # workspace should be bound
        assert "--bind" in cmd
        bind_idx = cmd.index("--bind")
        assert cmd[bind_idx + 1] == "/var/tmp/forge-render/test"
        assert cmd[bind_idx + 2] == "/workspace"

    def test_fonts_bind(self):
        cmd = build_render_cmd("/tmp/ws", "slide.html", "slide.png")
        assert "--ro-bind" in cmd
        # find fonts bind
        font_binds = []
        i = 0
        while i < len(cmd):
            if cmd[i] == "--ro-bind":
                font_binds.append((cmd[i+1], cmd[i+2]))
                i += 3
            else:
                i += 1
        src_dests = [(src, dst) for src, dst in font_binds if "/workspace/fonts" in dst]
        assert len(src_dests) == 1, "fonts must be bound to /workspace/fonts"

    def test_html_png_paths(self):
        cmd = build_render_cmd("/tmp/ws", "slide_01.html", "slide_01.png")
        assert "file:///workspace/slide_01.html" in cmd
        assert "/workspace/slide_01.png" in cmd

    def test_tmpfs_profile(self):
        """Chromium profile dirs must be tmpfs (writable, not ro-bind)."""
        cmd = build_render_cmd("/tmp/ws", "a.html", "a.png")
        tmpfs_mounts = []
        i = 0
        while i < len(cmd):
            if cmd[i] == "--tmpfs":
                tmpfs_mounts.append(cmd[i + 1])
                i += 2
            else:
                i += 1
        assert "/root/.config" in tmpfs_mounts
        assert "/root/.cache/chromium" in tmpfs_mounts


class TestFontsDir:
    def test_fonts_exist(self):
        assert FONTS_DIR.exists(), f"Fonts directory {FONTS_DIR} not found"
        files = list(FONTS_DIR.iterdir())
        assert len(files) >= 9, f"Expected 9+ font files, got {len(files)}: {[f.name for f in files]}"

    def test_required_fonts_present(self):
        font_names = {f.name for f in FONTS_DIR.iterdir()}
        required = [
            "Unbounded-Regular.woff2",
            "Unbounded-Bold.woff2",
            "Unbounded-Black.woff2",
            "Montserrat-Regular.woff2",
            "Montserrat-Medium.woff2",
            "Montserrat-Bold.woff2",
            "JetBrainsMono-Regular.woff2",
            "JetBrainsMono-Bold.woff2",
            "NotoColorEmoji.woff2",
        ]
        for r in required:
            assert r in font_names, f"Missing font: {r}"


# ---------------------------------------------------------------------------
# Integration tests (require bwrap + playwright + R2)
# ---------------------------------------------------------------------------

def _bwrap_available() -> bool:
    return shutil.which("bwrap") is not None


def _playwright_available() -> bool:
    from backend.renderer import _playwright_path
    try:
        p = _playwright_path()
        return Path(p).exists()
    except Exception:
        return False


def _r2_available() -> bool:
    from backend.storage_r2 import is_configured
    return is_configured() and not os.environ.get("SKIP_R2_TESTS")


render_skip = pytest.mark.skipif(
    not (_bwrap_available() and _playwright_available() and _r2_available()),
    reason="bwrap, playwright, or R2 not available"
)

MINIMAL_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
body {
  width: 1080px; height: 1350px; margin: 0;
  background: #1a1a2e;
  display: flex; align-items: center; justify-content: center;
}
h1 { color: #e8c46c; font-size: 80px; font-family: sans-serif; }
</style>
</head>
<body><h1>Test Slide</h1></body>
</html>"""

FONT_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'Unbounded';
  src: url('file:///workspace/fonts/Unbounded-Bold.woff2') format('woff2');
  font-weight: 700;
}
body {
  width: 1080px; height: 1350px; margin: 0;
  background: #1a1a2e;
  display: flex; align-items: center; justify-content: center;
}
h1 { color: #e8c46c; font-size: 80px; font-family: 'Unbounded', sans-serif; font-weight: 700; }
</style>
</head>
<body><h1>Unbounded Font</h1></body>
</html>"""

NETWORK_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<script>
// Attempt network request that should fail due to --unshare-net
try {
  fetch('http://169.254.169.254/latest/meta-data/').catch(function() {});
  var xhr = new XMLHttpRequest();
  xhr.open('GET', 'http://169.254.169.254/', false);
  try { xhr.send(); } catch(e) {}
} catch(e) {}
</script>
<style>
body { width: 1080px; height: 1350px; margin: 0; background: #222; }
h1 { color: white; font-size: 60px; font-family: sans-serif; }
</style>
</head>
<body><h1>Network blocked</h1></body>
</html>"""


@render_skip
@pytest.mark.asyncio
async def test_render_basic():
    """Minimal HTML renders to 1080×1350 PNG."""
    import struct
    from backend import storage_r2
    from backend.renderer import render_html

    sid = f"test-render-{uuid.uuid4().hex[:8]}"
    prefix = storage_r2.session_prefix(sid)

    try:
        await storage_r2.put_object(
            storage_r2.session_key(sid, "slide_01.html"),
            MINIMAL_HTML.encode(),
            content_type="text/html",
        )
        result = await render_html(sid, "slide_01.html", "slide_01.png", timeout=60.0)
        assert "Rendered" in result
        assert "slide_01.html" in result
        assert "slide_01.png" in result

        png_bytes = await storage_r2.get_object(storage_r2.session_key(sid, "slide_01.png"))
        assert len(png_bytes) > 1000
        # PNG magic bytes
        assert png_bytes[:8] == b'\x89PNG\r\n\x1a\n'

        # Check dimensions from IHDR chunk
        width = struct.unpack(">I", png_bytes[16:20])[0]
        height = struct.unpack(">I", png_bytes[20:24])[0]
        assert width == 1080
        assert height == 1350
    finally:
        await storage_r2.delete_prefix(prefix)


@render_skip
@pytest.mark.asyncio
async def test_bwrap_no_network():
    """HTML with network fetch doesn't block render (JS error, not render error)."""
    from backend import storage_r2
    from backend.renderer import render_html

    sid = f"test-nonet-{uuid.uuid4().hex[:8]}"
    prefix = storage_r2.session_prefix(sid)

    try:
        await storage_r2.put_object(
            storage_r2.session_key(sid, "nonet.html"),
            NETWORK_HTML.encode(),
            content_type="text/html",
        )
        # Should succeed (network error in JS doesn't break screenshot)
        result = await render_html(sid, "nonet.html", "nonet.png", timeout=45.0)
        assert "Rendered" in result

        png_bytes = await storage_r2.get_object(storage_r2.session_key(sid, "nonet.png"))
        assert png_bytes[:8] == b'\x89PNG\r\n\x1a\n'
    finally:
        await storage_r2.delete_prefix(prefix)


@render_skip
@pytest.mark.asyncio
async def test_fonts_rendered():
    """HTML using @font-face from /workspace/fonts renders successfully."""
    from backend import storage_r2
    from backend.renderer import render_html

    sid = f"test-fonts-{uuid.uuid4().hex[:8]}"
    prefix = storage_r2.session_prefix(sid)

    try:
        await storage_r2.put_object(
            storage_r2.session_key(sid, "font_test.html"),
            FONT_HTML.encode(),
            content_type="text/html",
        )
        result = await render_html(sid, "font_test.html", "font_test.png", timeout=60.0)
        assert "Rendered" in result

        png_bytes = await storage_r2.get_object(storage_r2.session_key(sid, "font_test.png"))
        assert len(png_bytes) > 1000
        assert png_bytes[:8] == b'\x89PNG\r\n\x1a\n'
    finally:
        await storage_r2.delete_prefix(prefix)

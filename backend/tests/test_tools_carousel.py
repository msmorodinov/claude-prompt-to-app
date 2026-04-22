"""Tests for carousel MCP tools: write_file, render_html, list_files."""
from __future__ import annotations

import asyncio
import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.tools import create_tools, _ALLOWED_EXT, _KEY_RE


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def make_session(session_id: str, mode: str = "carousel") -> MagicMock:
    session = MagicMock()
    session.session_id = session_id
    session.mode = mode
    return session


def get_carousel_tools(session_id: str):
    session = make_session(session_id)
    tools = create_tools(session, session_id, include_carousel_tools=True)
    by_name = {t.name: t for t in tools}
    return by_name


# ---------------------------------------------------------------------------
# Test write_file
# ---------------------------------------------------------------------------

class TestWriteFile:
    @pytest.mark.asyncio
    async def test_rejected_bad_extension(self):
        tools = get_carousel_tools("sid1")
        wf = tools["write_file"]
        result = await wf.handler({"path": "slide.exe", "content": "bad"})
        assert result["is_error"] is True
        assert "not allowed" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_rejected_slash_in_path(self):
        tools = get_carousel_tools("sid1")
        wf = tools["write_file"]
        result = await wf.handler({"path": "subdir/slide.html", "content": "x"})
        assert result["is_error"] is True

    @pytest.mark.asyncio
    async def test_rejected_path_traversal(self):
        tools = get_carousel_tools("sid1")
        wf = tools["write_file"]
        result = await wf.handler({"path": "../etc/passwd.html", "content": "x"})
        assert result["is_error"] is True

    @pytest.mark.asyncio
    async def test_rejected_content_too_large(self):
        tools = get_carousel_tools("sid1")
        wf = tools["write_file"]
        result = await wf.handler({"path": "big.html", "content": "x" * 1_100_000})
        assert result["is_error"] is True
        assert "too large" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_success_mocked(self):
        sid = f"test-{uuid.uuid4().hex[:8]}"
        tools = get_carousel_tools(sid)
        wf = tools["write_file"]

        with patch("backend.storage_r2.list_prefix", new_callable=AsyncMock) as mock_list, \
             patch("backend.storage_r2.put_object", new_callable=AsyncMock) as mock_put:
            mock_list.return_value = []
            mock_put.return_value = None

            result = await wf.handler({"path": "slide_01.html", "content": "<html></html>"})
            assert not result.get("is_error")
            assert "Wrote slide_01.html" in result["content"][0]["text"]
            mock_put.assert_called_once()

    @pytest.mark.asyncio
    async def test_file_limit_rejected(self):
        sid = f"test-{uuid.uuid4().hex[:8]}"
        tools = get_carousel_tools(sid)
        wf = tools["write_file"]

        with patch("backend.storage_r2.list_prefix", new_callable=AsyncMock) as mock_list:
            # Simulate 50 existing files
            mock_list.return_value = [{"key": f"k{i}", "size": 100} for i in range(50)]
            result = await wf.handler({"path": "slide_new.html", "content": "<html></html>"})
            assert result["is_error"] is True
            assert "limit" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_storage_limit_rejected(self):
        sid = f"test-{uuid.uuid4().hex[:8]}"
        tools = get_carousel_tools(sid)
        wf = tools["write_file"]

        with patch("backend.storage_r2.list_prefix", new_callable=AsyncMock) as mock_list:
            # Simulate 19.9 MB already used
            mock_list.return_value = [{"key": "big", "size": 19_900_000}]
            result = await wf.handler({"path": "slide_02.html", "content": "x" * 200_000})
            assert result["is_error"] is True

    @pytest.mark.asyncio
    async def test_valid_extensions_accepted(self):
        sid = f"test-{uuid.uuid4().hex[:8]}"
        tools = get_carousel_tools(sid)
        wf = tools["write_file"]

        for ext in [".html", ".md", ".txt", ".json"]:
            with patch("backend.storage_r2.list_prefix", new_callable=AsyncMock) as mock_list, \
                 patch("backend.storage_r2.put_object", new_callable=AsyncMock):
                mock_list.return_value = []
                result = await wf.handler({"path": f"file{ext}", "content": "content"})
                assert not result.get("is_error"), f"Extension {ext} should be allowed"


# ---------------------------------------------------------------------------
# Test render_html
# ---------------------------------------------------------------------------

class TestRenderHtml:
    @pytest.mark.asyncio
    async def test_rejects_non_html_input(self):
        tools = get_carousel_tools("sid1")
        rh = tools["render_html"]
        result = await rh.handler({"input_path": "slide.txt", "output_path": "slide.png"})
        assert result["is_error"] is True
        assert ".html" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_rejects_non_png_output(self):
        tools = get_carousel_tools("sid1")
        rh = tools["render_html"]
        result = await rh.handler({"input_path": "slide.html", "output_path": "slide.jpg"})
        assert result["is_error"] is True
        assert ".png" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_rejects_path_traversal(self):
        tools = get_carousel_tools("sid1")
        rh = tools["render_html"]
        result = await rh.handler({"input_path": "../slide.html", "output_path": "out.png"})
        assert result["is_error"] is True

    @pytest.mark.asyncio
    async def test_success_mocked(self):
        sid = f"test-{uuid.uuid4().hex[:8]}"
        tools = get_carousel_tools(sid)
        rh = tools["render_html"]

        with patch("backend.storage_r2.list_prefix", new_callable=AsyncMock) as mock_list, \
             patch("backend.renderer.render_html", new_callable=AsyncMock) as mock_render:
            mock_list.return_value = [{"key": "k", "size": 1000}]
            mock_render.return_value = "Rendered slide_01.html → slide_01.png (142 KB)"

            result = await rh.handler({"input_path": "slide_01.html", "output_path": "slide_01.png"})
            assert not result.get("is_error")
            assert "Rendered" in result["content"][0]["text"]


# ---------------------------------------------------------------------------
# Test list_files
# ---------------------------------------------------------------------------

class TestListFiles:
    @pytest.mark.asyncio
    async def test_empty_session(self):
        sid = f"test-{uuid.uuid4().hex[:8]}"
        tools = get_carousel_tools(sid)
        lf = tools["list_files"]

        with patch("backend.storage_r2.list_prefix", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = []
            result = await lf.handler({})
            assert not result.get("is_error")
            assert "No files" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_lists_files(self):
        sid = f"test-{uuid.uuid4().hex[:8]}"
        tools = get_carousel_tools(sid)
        lf = tools["list_files"]

        from datetime import datetime
        with patch("backend.storage_r2.list_prefix", new_callable=AsyncMock) as mock_list:
            mock_list.return_value = [
                {"key": f"dev/sessions/{sid}/slide_01.html", "size": 4200, "last_modified": datetime(2026, 4, 22, 10, 0)},
                {"key": f"dev/sessions/{sid}/slide_01.png", "size": 145_120, "last_modified": datetime(2026, 4, 22, 10, 1)},
            ]
            result = await lf.handler({})
            text = result["content"][0]["text"]
            assert "slide_01.html" in text
            assert "slide_01.png" in text
            assert "4.1 KB" in text or "4.2 KB" in text


# ---------------------------------------------------------------------------
# Test carousel tools not included by default
# ---------------------------------------------------------------------------

def test_carousel_tools_not_in_default():
    session = make_session("sid1", mode="normal")
    tools = create_tools(session, "sid1", include_carousel_tools=False)
    names = {t.name for t in tools}
    assert "write_file" not in names
    assert "render_html" not in names
    assert "list_files" not in names


def test_carousel_tools_included_when_flag_set():
    session = make_session("sid1", mode="carousel")
    tools = create_tools(session, "sid1", include_carousel_tools=True)
    names = {t.name for t in tools}
    assert "write_file" in names
    assert "render_html" in names
    assert "list_files" in names

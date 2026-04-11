"""Pytest fixtures for backend tests."""

from __future__ import annotations

import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from backend.db import DB_PATH, init_db, save_session
from backend.server import app, sessions
from backend.session import SessionState


@pytest.fixture
def event_loop():
    """Create a new event loop for each test."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing FastAPI endpoints."""
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def session():
    """Create and register a test session (in-memory + DB)."""
    await init_db()
    s = sessions.create()
    await save_session(s.session_id, user_id=s.user_id)
    yield s
    sessions.remove(s.session_id)


@pytest.fixture
def mock_session():
    """Standalone SessionState for unit tests (not registered in server)."""
    return SessionState()


@pytest_asyncio.fixture
async def tmp_db(tmp_path):
    """Temporary SQLite database for isolated unit tests."""
    db_path = tmp_path / "test.db"
    await init_db(db_path)
    yield db_path

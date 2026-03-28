"""Pytest fixtures for backend tests."""

from __future__ import annotations

import asyncio

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

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
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def session():
    """Create and register a test session."""
    s = sessions.create()
    yield s
    sessions.remove(s.session_id)


@pytest.fixture
def mock_session():
    """Standalone SessionState for unit tests (not registered in server)."""
    return SessionState()

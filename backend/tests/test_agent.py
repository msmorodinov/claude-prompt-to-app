"""Tests for agent runner: model passthrough + user_message XML wrapping."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.session import SessionState


def _mock_client_context():
    """Return (client_cls_mock, client_mock) where ClaudeSDKClient(...) yields client_mock."""
    client_mock = MagicMock()
    client_mock.query = AsyncMock()

    async def _empty_response():
        return
        yield  # make this an async generator

    client_mock.receive_response = MagicMock(return_value=_empty_response())

    client_cls = MagicMock()
    client_cls.return_value.__aenter__ = AsyncMock(return_value=client_mock)
    client_cls.return_value.__aexit__ = AsyncMock(return_value=None)
    return client_cls, client_mock


@pytest.mark.asyncio
async def test_run_agent_wraps_user_message_in_xml():
    from backend import agent as agent_mod

    session = SessionState(user_id="u1", mode="normal", model="opus")
    client_cls, client_mock = _mock_client_context()

    with patch.object(agent_mod, "ClaudeSDKClient", client_cls), \
         patch.object(agent_mod, "_get_prompt_for_session", AsyncMock(return_value="PROMPT")), \
         patch.object(agent_mod, "get_auth_env", AsyncMock(return_value={})):
        await agent_mod.run_agent(session, "hello world")

    sent = client_mock.query.await_args.args[0]
    assert sent.startswith("<user_message>\n")
    assert sent.endswith("\n</user_message>")
    assert "hello world" in sent


@pytest.mark.asyncio
async def test_run_agent_passes_model_to_options():
    from backend import agent as agent_mod

    session = SessionState(user_id="u1", mode="normal", model="sonnet")
    client_cls, _ = _mock_client_context()

    with patch.object(agent_mod, "ClaudeSDKClient", client_cls), \
         patch.object(agent_mod, "ClaudeAgentOptions") as options_cls, \
         patch.object(agent_mod, "_get_prompt_for_session", AsyncMock(return_value="PROMPT")), \
         patch.object(agent_mod, "get_auth_env", AsyncMock(return_value={})):
        await agent_mod.run_agent(session, "hi")

    kwargs = options_cls.call_args.kwargs
    assert kwargs["model"] == "sonnet"


@pytest.mark.asyncio
async def test_run_agent_forces_opus_for_app_builder_regardless_of_session_model():
    from backend import agent as agent_mod

    # Even though session.model is sonnet, app-builder mode must force opus
    session = SessionState(user_id="u1", mode="app-builder", model="sonnet")
    client_cls, _ = _mock_client_context()

    with patch.object(agent_mod, "ClaudeSDKClient", client_cls), \
         patch.object(agent_mod, "ClaudeAgentOptions") as options_cls, \
         patch.object(agent_mod, "get_auth_env", AsyncMock(return_value={})):
        await agent_mod.run_agent(session, "build me an app")

    kwargs = options_cls.call_args.kwargs
    assert kwargs["model"] == "opus"


@pytest.mark.asyncio
async def test_run_agent_opus_default_when_session_model_unset():
    from backend import agent as agent_mod

    # Default SessionState.model is 'opus' — verify passthrough
    session = SessionState(user_id="u1", mode="normal")
    assert session.model == "opus"
    client_cls, _ = _mock_client_context()

    with patch.object(agent_mod, "ClaudeSDKClient", client_cls), \
         patch.object(agent_mod, "ClaudeAgentOptions") as options_cls, \
         patch.object(agent_mod, "_get_prompt_for_session", AsyncMock(return_value="PROMPT")), \
         patch.object(agent_mod, "get_auth_env", AsyncMock(return_value={})):
        await agent_mod.run_agent(session, "hi")

    assert options_cls.call_args.kwargs["model"] == "opus"

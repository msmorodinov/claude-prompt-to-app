"""Claude Agent SDK client for running agent sessions."""

from __future__ import annotations

import logging
from pathlib import Path

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    TextBlock,
    create_sdk_mcp_server,
)

from backend.db import get_prompt_body_by_version, get_session
from backend.prompt_config import load_prompt
from backend.session import SessionState
from backend.tools import create_tools

logger = logging.getLogger(__name__)

FRAMEWORK_PATH = Path(__file__).parent / "framework.md"


async def _get_prompt_for_session(session: SessionState) -> str:
    """Get the locked prompt version for this session from DB.

    Falls back to prompt.md for pre-migration sessions or if DB lookup fails.
    """
    if session.prompt_version_id:
        body = await get_prompt_body_by_version(session.prompt_version_id)
        if body:
            return body
        logger.warning(
            "prompt_version_id=%d not found in DB, falling back to file",
            session.prompt_version_id,
        )
    _, body = load_prompt()
    return body


async def run_agent(session: SessionState, user_message: str) -> None:
    framework = FRAMEWORK_PATH.read_text()
    app_prompt = await _get_prompt_for_session(session)
    system_prompt = f"{app_prompt}\n\n{framework}"
    tools = create_tools(session, session.session_id)

    server = create_sdk_mcp_server(
        name="app",
        version="1.0.0",
        tools=tools,
    )

    options = ClaudeAgentOptions(
        mcp_servers={"app": server},
        allowed_tools=[
            "mcp__app__show",
            "mcp__app__ask",
            "WebSearch",
            "WebFetch",
        ],
        disallowed_tools=["AskUserQuestion"],
        system_prompt=system_prompt,
        permission_mode="acceptEdits",
    )

    await session.set_status("active")

    try:
        async with ClaudeSDKClient(options=options) as client:
            await client.query(user_message)
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    _process_assistant_message(session, message)

        await session.set_status("done")
        session.push_sse("done", {})
    except Exception as e:
        logger.exception("Agent error")
        await session.set_status("error")
        session.push_sse("error", {"message": str(e)})


def _format_history_as_context(history: list[dict]) -> str:
    """Format DB history into a text summary for agent context injection."""
    lines: list[str] = []
    for entry in history:
        role = entry["role"]
        content = entry["content"]
        if role == "user":
            text = content.get("text", "")
            if text:
                lines.append(f"User: {text}")
            answers = content.get("answers")
            if answers:
                for k, v in answers.items():
                    lines.append(f"User answered '{k}': {v}")
        elif role == "assistant":
            blocks = content.get("blocks", [])
            for block in blocks:
                btype = block.get("type", "text")
                text = block.get("content", block.get("text", ""))
                if text:
                    lines.append(f"Assistant ({btype}): {text}")
            stream_text = content.get("stream_text", "")
            if stream_text:
                lines.append(f"Assistant: {stream_text}")
    return "\n".join(lines)


async def run_agent_with_context(session: SessionState) -> None:
    """Restart agent with full conversation history as context."""
    history = await get_session(session.session_id)
    context = _format_history_as_context(history)
    context_message = (
        "[CONTEXT: This session was interrupted and is being resumed. "
        "Here is the previous conversation:\n"
        f"{context}\n"
        "]\n\n"
        "[INSTRUCTION: Continue the session from where it was interrupted. "
        "Do NOT repeat what was already said or ask questions that were already answered. "
        "Acknowledge the interruption briefly and continue.]"
    )
    await run_agent(session, context_message)


def _process_assistant_message(
    session: SessionState, message: AssistantMessage
) -> None:
    for block in message.content:
        if isinstance(block, TextBlock) and block.text.strip():
            session.push_sse("stream_delta", {"text": block.text})

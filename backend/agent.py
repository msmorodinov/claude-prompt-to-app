"""Claude Agent SDK client for running workshop sessions."""

from __future__ import annotations

import logging
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    TextBlock,
    create_sdk_mcp_server,
)

from backend.prompt import POSITIONING_SYSTEM_PROMPT
from backend.session import SessionState
from backend.tools import create_workshop_tools

logger = logging.getLogger(__name__)


async def run_agent(session: SessionState, user_message: str) -> None:
    """Run the Claude agent loop for a workshop session.

    Streams responses and tool calls. The session's SSE queue receives
    events as they happen.
    """
    tools = create_workshop_tools(session)

    server = create_sdk_mcp_server(
        name="workshop",
        version="1.0.0",
        tools=tools,
    )

    options = ClaudeAgentOptions(
        mcp_servers={"workshop": server},
        allowed_tools=[
            "mcp__workshop__show",
            "mcp__workshop__ask",
            "WebSearch",
            "WebFetch",
        ],
        disallowed_tools=["AskUserQuestion"],
        system_prompt=POSITIONING_SYSTEM_PROMPT,
        permission_mode="acceptEdits",
    )

    try:
        session.push_sse("research_start", {"label": "Thinking..."})

        async with ClaudeSDKClient(options=options) as client:
            await client.query(user_message)
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    _process_assistant_message(session, message)

        session.push_sse("research_done", {"label": "Done"})
        session.push_sse("done", {})
    except Exception as e:
        logger.exception("Agent error")
        session.push_sse("error", {"message": str(e)})


def _process_assistant_message(
    session: SessionState, message: AssistantMessage
) -> None:
    """Extract text blocks from assistant messages and send as stream deltas."""
    for block in message.content:
        if isinstance(block, TextBlock) and block.text.strip():
            session.push_sse("stream_delta", {"text": block.text})

"""Claude Agent SDK client for running agent sessions."""

from __future__ import annotations

import logging

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    TextBlock,
    create_sdk_mcp_server,
)

from backend.prompt import POSITIONING_SYSTEM_PROMPT
from backend.session import SessionState
from backend.tools import create_tools

logger = logging.getLogger(__name__)


async def run_agent(session: SessionState, user_message: str) -> None:
    tools = create_tools(session)

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
        system_prompt=POSITIONING_SYSTEM_PROMPT,
        permission_mode="acceptEdits",
    )

    try:
        async with ClaudeSDKClient(options=options) as client:
            await client.query(user_message)
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    _process_assistant_message(session, message)

        session.push_sse("done", {})
    except Exception as e:
        logger.exception("Agent error")
        session.push_sse("error", {"message": str(e)})


def _process_assistant_message(
    session: SessionState, message: AssistantMessage
) -> None:
    for block in message.content:
        if isinstance(block, TextBlock) and block.text.strip():
            session.push_sse("stream_delta", {"text": block.text})

"""MCP tools for the workshop: show (fire-and-forget) and ask (blocking)."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from claude_agent_sdk import tool

from backend.schemas import ASK_SCHEMA, SHOW_SCHEMA
from backend.session import SessionState

ASK_TIMEOUT_SECONDS = 600  # 10 minutes max wait for user response


def _normalize_option(opt: Any) -> str:
    """Convert option to plain string. Claude may send {value, label} objects."""
    if isinstance(opt, str):
        return opt
    if isinstance(opt, dict):
        return opt.get("label") or opt.get("value") or str(opt)
    return str(opt)


def _normalize_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize question options from {value,label} objects to plain strings."""
    result = []
    for q in questions:
        q = dict(q)  # shallow copy
        if q.get("type") in ("single_select", "multi_select") and "options" in q:
            q["options"] = [_normalize_option(o) for o in q["options"]]
        result.append(q)
    return result


def create_workshop_tools(session: SessionState) -> list:
    """Create show/ask tools bound to a specific session.

    Returns a list of tool-decorated async functions.
    """

    @tool("show", "Display content blocks to the user", SHOW_SCHEMA)
    async def show_tool(args: dict[str, Any]) -> dict[str, Any]:
        """Fire-and-forget: push display blocks to browser via SSE."""
        try:
            blocks = args.get("blocks", [])
            session.push_sse("assistant_message", {"blocks": blocks})
            session.add_to_history("assistant", {"blocks": blocks})
            return {
                "content": [
                    {"type": "text", "text": f"Displayed {len(blocks)} block(s)."}
                ]
            }
        except Exception as e:
            return {
                "content": [{"type": "text", "text": f"Error in show: {e}"}],
                "is_error": True,
            }

    @tool("ask", "Ask questions and wait for user response", ASK_SCHEMA)
    async def ask_tool(args: dict[str, Any]) -> dict[str, Any]:
        """Blocking: push questions to browser, wait for POST /answers."""
        try:
            ask_id = uuid.uuid4().hex[:8]
            preamble = args.get("preamble")
            questions = _normalize_questions(args.get("questions", []))

            # Send ask to browser
            session.push_sse(
                "ask_message",
                {"id": ask_id, "preamble": preamble, "questions": questions},
            )
            session.add_to_history(
                "assistant",
                {"ask_id": ask_id, "preamble": preamble, "questions": questions},
            )

            # Block until user answers
            session.start_ask(ask_id)
            try:
                await asyncio.wait_for(
                    session.pending_ask_event.wait(),
                    timeout=ASK_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                session.clear_ask()
                return {
                    "content": [
                        {"type": "text", "text": "User did not respond in time."}
                    ],
                    "is_error": True,
                }

            answers = session.pending_answers
            session.clear_ask()

            # Record user answers in history
            session.push_sse("user_message", {"answers": answers})
            session.add_to_history("user", {"answers": answers})

            # Format answers for Claude
            answer_lines = [
                f"- {qid}: {val}" for qid, val in answers.items()
            ]
            answer_text = "User answers:\n" + "\n".join(answer_lines)
            return {"content": [{"type": "text", "text": answer_text}]}
        except Exception as e:
            session.clear_ask()
            return {
                "content": [{"type": "text", "text": f"Error in ask: {e}"}],
                "is_error": True,
            }

    return [show_tool, ask_tool]

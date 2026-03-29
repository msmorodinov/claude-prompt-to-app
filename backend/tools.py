"""MCP tools for the agent app: show (fire-and-forget) and ask (blocking)."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from claude_agent_sdk import tool

from backend.db import save_message
from backend.schemas import ASK_SCHEMA, SHOW_SCHEMA
from backend.session import SessionState

ASK_TIMEOUT_SECONDS = 600

_SELECT_TYPES = frozenset({"single_select", "multi_select"})


def _tool_result(text: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}]}


def _tool_error(text: str) -> dict[str, Any]:
    return {"content": [{"type": "text", "text": text}], "is_error": True}


def _normalize_option(opt: Any) -> str:
    if isinstance(opt, str):
        return opt
    if isinstance(opt, dict):
        return opt.get("label") or opt.get("value") or str(opt)
    return str(opt)


def _normalize_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for q in questions:
        q = dict(q)
        if q.get("type") in _SELECT_TYPES and "options" in q:
            q["options"] = [_normalize_option(o) for o in q["options"]]
        result.append(q)
    return result


def create_tools(session: SessionState, session_id: str) -> list:
    @tool("show", "Display content to the user. Blocks can include text, tables, comparisons, metrics, quotes, and more. Returns immediately.", SHOW_SCHEMA)
    async def show_tool(args: dict[str, Any]) -> dict[str, Any]:
        try:
            blocks = args.get("blocks", [])
            session.push_sse("assistant_message", {"blocks": blocks})
            session.add_to_history("assistant", {"blocks": blocks})
            await save_message(session_id, "assistant", {"blocks": blocks})
            return _tool_result(f"Displayed {len(blocks)} block(s).")
        except Exception as e:
            return _tool_error(f"Error in show: {e}")

    @tool("ask", "Ask the user questions and wait for their response. Supports select, text input, ranking, sliders, matrix, and tags. Blocks until user submits.", ASK_SCHEMA)
    async def ask_tool(args: dict[str, Any]) -> dict[str, Any]:
        try:
            ask_id = uuid.uuid4().hex[:8]
            preamble = args.get("preamble")
            questions = _normalize_questions(args.get("questions", []))

            session.push_sse(
                "ask_message",
                {"id": ask_id, "preamble": preamble, "questions": questions},
            )
            ask_content = {"ask_id": ask_id, "preamble": preamble, "questions": questions}
            session.add_to_history("assistant", ask_content)
            await save_message(session_id, "assistant", ask_content)

            session.start_ask(ask_id)
            try:
                await asyncio.wait_for(
                    session.pending_ask_event.wait(),
                    timeout=ASK_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                session.clear_ask()
                return _tool_error("User did not respond in time.")

            answers = session.pending_answers
            session.clear_ask()

            session.push_sse("user_message", {"answers": answers})
            session.add_to_history("user", {"answers": answers})
            await save_message(session_id, "user", {"answers": answers})

            label_by_id = {q["id"]: q.get("label", q["id"]) for q in questions}
            answer_lines = [
                f"- {label_by_id.get(qid, qid)}: {val}"
                for qid, val in answers.items()
            ]
            answer_text = "User answers:\n" + "\n".join(answer_lines)
            return _tool_result(answer_text)
        except Exception as e:
            session.clear_ask()
            return _tool_error(f"Error in ask: {e}")

    return [show_tool, ask_tool]

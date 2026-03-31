"""MCP tools for the agent app: show (fire-and-forget) and ask (blocking)."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from claude_agent_sdk import tool

from backend.db import create_app, increment_message_count, save_message, validate_app_fields
from backend.schemas import ASK_SCHEMA, SAVE_APP_SCHEMA, SHOW_SCHEMA
from backend.session import SessionState

ASK_TIMEOUT_SECONDS = 600

_SELECT_TYPES = frozenset({"single_select", "multi_select"})


def _tool_response(text: str, *, is_error: bool = False) -> dict[str, Any]:
    result: dict[str, Any] = {"content": [{"type": "text", "text": text}]}
    if is_error:
        result["is_error"] = True
    return result


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


def create_tools(session: SessionState, session_id: str, *, include_save_app: bool = False) -> list:
    @tool("show", "Display content to the user. Blocks can include text, tables, comparisons, metrics, quotes, and more. Returns immediately.", SHOW_SCHEMA)
    async def show_tool(args: dict[str, Any]) -> dict[str, Any]:
        try:
            blocks = args.get("blocks", [])
            session.push_sse("assistant_message", {"blocks": blocks})
            session.add_to_history("assistant", {"blocks": blocks})
            await save_message(session_id, "assistant", {"blocks": blocks})
            await increment_message_count(session_id)
            return _tool_response(f"Displayed {len(blocks)} block(s).")
        except Exception as e:
            return _tool_response(f"Error in show: {e}", is_error=True)

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
            await session.set_status("waiting_input")
            try:
                await asyncio.wait_for(
                    session.pending_ask_event.wait(),
                    timeout=ASK_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                session.clear_ask()
                return _tool_response("User did not respond in time.", is_error=True)

            await session.set_status("active")

            answers = session.pending_answers
            session.clear_ask()

            session.push_sse("user_message", {"answers": answers})
            session.add_to_history("user", {"answers": answers})
            await save_message(session_id, "user", {"answers": answers})
            await increment_message_count(session_id)

            label_by_id = {q["id"]: q.get("label", q["id"]) for q in questions}
            answer_lines = [
                f"- {label_by_id.get(qid, qid)}: {val}"
                for qid, val in answers.items()
            ]
            answer_text = "User answers:\n" + "\n".join(answer_lines)
            return _tool_response(answer_text)
        except Exception as e:
            session.clear_ask()
            return _tool_response(f"Error in ask: {e}", is_error=True)

    @tool("save_app", "Save a new app/prompt to the database as a draft. Only available in App Builder.", SAVE_APP_SCHEMA)
    async def save_app_tool(args: dict[str, Any]) -> dict[str, Any]:
        try:
            slug = args.get("slug", "")
            title = args.get("title", "")
            subtitle = args.get("subtitle", "")
            body = args.get("body", "")

            errors = validate_app_fields(slug=slug, title=title, body=body)
            if errors:
                return _tool_response("Validation failed: " + "; ".join(errors), is_error=True)

            result = await create_app(slug, title, subtitle, body, is_active=False)
            return _tool_response(
                f"App '{title}' saved as draft (slug: {slug}). "
                f"Admin must activate it. App ID: {result['id']}"
            )
        except Exception as e:
            if "UNIQUE constraint" in str(e):
                return _tool_response(f"Slug '{slug}' already exists. Choose a different slug.", is_error=True)
            return _tool_response(f"Error saving app: {e}", is_error=True)

    tools = [show_tool, ask_tool]
    if include_save_app:
        tools.append(save_app_tool)
    return tools

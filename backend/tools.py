"""MCP tools for the agent app: show (fire-and-forget) and ask (blocking)."""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

from claude_agent_sdk import tool

from backend.db import create_app, increment_message_count, save_message, update_app, validate_app_fields
from backend.schemas import ASK_SCHEMA, SAVE_APP_SCHEMA, SHOW_SCHEMA, UPDATE_APP_SCHEMA
from backend.session import SessionState

ASK_TIMEOUT_SECONDS = 1800

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
    for question in questions:
        normalized = dict(question)
        if normalized.get("type") in _SELECT_TYPES and "options" in normalized:
            normalized["options"] = [_normalize_option(o) for o in normalized["options"]]
        result.append(normalized)
    return result


def create_tools(session: SessionState, session_id: str, *, include_save_app: bool = False, include_update_app: bool = False) -> list:
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

            if session.is_duplicate_ask(questions):
                return _tool_response("Question already displayed, awaiting user response.")

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
                await session.set_status("waiting_input")
                session.push_sse("ask_timeout", {"message": "Session paused — no response received"})
                task = asyncio.current_task()
                if task:
                    task.cancel()
                return _tool_response("Session paused.", is_error=True)

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

    @tool("update_app", "Update an existing app's prompt. Creates a new version. Only available in App Builder edit mode.", UPDATE_APP_SCHEMA)
    async def update_app_tool(args: dict[str, Any]) -> dict[str, Any]:
        try:
            raw_app_id = args.get("app_id")
            body = args.get("body", "")
            change_note = args.get("change_note", "AI-assisted edit")

            if raw_app_id is None:
                return _tool_response("app_id is required", is_error=True)
            if not isinstance(raw_app_id, int):
                return _tool_response("app_id must be an integer", is_error=True)
            app_id = raw_app_id

            # Security: only allow updating the session's assigned edit target
            if session.edit_app_id is None or app_id != session.edit_app_id:
                return _tool_response(
                    "Unauthorized: not authorized to update this app",
                    is_error=True,
                )

            errors = validate_app_fields(body=body)
            if errors:
                return _tool_response("Validation failed: " + "; ".join(errors), is_error=True)

            result = await update_app(app_id, body=body, change_note=change_note)
            return _tool_response(
                f"App updated (ID: {result['id']}). "
                f"New version created. Version ID: {result['current_version_id']}"
            )
        except ValueError as e:
            return _tool_response(str(e), is_error=True)
        except Exception as e:
            return _tool_response(f"Error updating app: {e}", is_error=True)

    tools = [show_tool, ask_tool]
    if include_save_app:
        tools.append(save_app_tool)
    if include_update_app:
        tools.append(update_app_tool)
    return tools

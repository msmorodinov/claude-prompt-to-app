"""Prompt validator — checks MCP tool coverage via Sonnet."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from collections import deque

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    TextBlock,
)

logger = logging.getLogger(__name__)

VALIDATOR_SYSTEM_PROMPT = """You are a tool-coverage analyzer for an AI agent framework.

The agent has specific MCP tools with widget types. You analyze system prompts
and find every phrase that implies using a tool or widget.

For each found reference, return the EXACT quote from the prompt (verbatim substring),
which tool/widget it maps to, and whether the mapping is clear or ambiguous.

Focus ONLY on what the prompt mentions. Do NOT list tools that aren't referenced.
Return ONLY valid JSON, no markdown.

IMPORTANT: Quotes must be EXACT substrings of the prompt text — do not paraphrase,
normalize whitespace, or change capitalization. The quotes will be used for
text matching via indexOf()."""

USER_MESSAGE_TEMPLATE = """## Available Tools and Widgets

### show tool — Display content to user (fire-and-forget)
Widgets: text (markdown), section_header (titles), data_table (tabular data),
comparison (side-by-side), category_list (grouped lists), quote_highlight (key quotes),
metric_bars (scored metrics), copyable (copy-to-clipboard), progress (progress bar),
final_result (accent result), timer (countdown)

### ask tool — Ask user questions (blocks until response)
Widgets: single_select (radio buttons), multi_select (checkboxes),
free_text (text input), rank_priorities (drag-drop ranking),
slider_scale (numeric 1-10 scale), matrix_2x2 (2x2 grid placement),
tag_input (enter tags)

### Built-in tools
WebSearch (web search), WebFetch (fetch URL content)

## System prompt to analyze

{prompt_body}

## Task

Find every phrase in the prompt that describes using a tool or widget.
Return JSON array of references. Each reference must have:
- "quote": exact substring from the prompt (verbatim, for text matching)
- "tool": "show" | "ask" | "WebSearch" | "WebFetch" | null
- "widget": widget type name | null
- "status": "clear" | "ambiguous" | "not_found"
- "note": explanation string | null (required for ambiguous/not_found)

Return: {"references": [...]}"""

# --- Cache (async-safe) ---
_cache: dict[str, dict] = {}
_cache_lock = asyncio.Lock()
MAX_CACHE_SIZE = 8


async def _get_cached(key: str) -> dict | None:
    async with _cache_lock:
        return _cache.get(key)


async def _set_cached(key: str, value: dict) -> None:
    async with _cache_lock:
        if len(_cache) >= MAX_CACHE_SIZE:
            _cache.pop(next(iter(_cache)))
        _cache[key] = value


# --- Rate limiter (per-IP, sliding window) ---
_rate_windows: dict[str, deque] = {}
RATE_LIMIT = 10
RATE_WINDOW_SEC = 60


def check_rate_limit(client_ip: str) -> bool:
    """Return True if request is allowed, False if rate limited.

    NOTE: rate state is per-process. Correct only with workers=1 (uvicorn default).
    """
    now = time.monotonic()
    window = _rate_windows.get(client_ip)
    if window is None:
        window = deque()
        _rate_windows[client_ip] = window
    # Remove expired entries
    while window and window[0] < now - RATE_WINDOW_SEC:
        window.popleft()
    # Evict empty windows to prevent unbounded growth
    if not window:
        del _rate_windows[client_ip]
    if len(window) >= RATE_LIMIT:
        return False
    _rate_windows.setdefault(client_ip, deque()).append(now)
    return True


# --- Main validation function ---
async def validate_prompt(prompt_body: str) -> dict:
    """Validate prompt tool coverage via Sonnet. Returns references dict."""
    if not prompt_body.strip():
        return {
            "references": [],
            "summary": {"total": 0, "clear": 0, "ambiguous": 0, "not_found": 0},
            "cached": False,
        }

    cache_key = hashlib.sha256(prompt_body.encode()).hexdigest()
    cached = await _get_cached(cache_key)
    if cached is not None:
        return {**cached, "cached": True}

    user_message = USER_MESSAGE_TEMPLATE.replace("{prompt_body}", prompt_body)

    # For long prompts, add priority instruction
    if len(prompt_body) > 20_000:
        user_message = (
            "Focus on the most important tool references. Limit to 30 references max.\n\n"
            + user_message
        )

    options = ClaudeAgentOptions(
        model="claude-sonnet-4-6-20250514",
        system_prompt=VALIDATOR_SYSTEM_PROMPT,
        max_turns=1,
        allowed_tools=[],
        permission_mode="dontAsk",
    )

    text = ""
    async with asyncio.timeout(90):
        async with ClaudeSDKClient(options=options) as client:
            await client.query(user_message)
            async for message in client.receive_response():
                if isinstance(message, AssistantMessage):
                    for block in message.content:
                        if isinstance(block, TextBlock):
                            text += block.text

    # Parse JSON response
    result = json.loads(text)
    if not isinstance(result, dict) or "references" not in result:
        raise ValueError(f"Unexpected response shape: {type(result).__name__}")

    # Build summary
    refs = result["references"]
    summary = {
        "total": len(refs),
        "clear": sum(1 for r in refs if r.get("status") == "clear"),
        "ambiguous": sum(1 for r in refs if r.get("status") == "ambiguous"),
        "not_found": sum(1 for r in refs if r.get("status") == "not_found"),
    }

    validated = {"references": refs, "summary": summary, "cached": False}
    await _set_cached(cache_key, validated)
    return validated

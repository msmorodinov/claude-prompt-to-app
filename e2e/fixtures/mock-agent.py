"""Mock agent that returns canned tool calls for E2E testing.

Instead of calling the real Claude SDK, this sends predefined
SSE events to simulate a workshop conversation.
"""

from __future__ import annotations

import asyncio
from typing import Any

from backend.session import SessionState


async def run_mock_agent(session: SessionState, message: str) -> None:
    """Simulate a Claude agent with canned responses."""
    await asyncio.sleep(0.1)  # Simulate thinking

    # Step 1: Show welcome text
    session.push_sse(
        "assistant_message",
        {
            "blocks": [
                {
                    "type": "text",
                    "content": "Welcome to the Positioning Workshop! Let's find your unique position.",
                },
                {
                    "type": "section_header",
                    "title": "GETTING STARTED",
                    "subtitle": "Tell me about your company",
                },
            ]
        },
    )
    session.add_to_history(
        "assistant", {"blocks": [{"type": "text", "content": "Welcome..."}]}
    )

    await asyncio.sleep(0.1)

    # Step 2: Ask initial questions
    ask_id = "mock-ask-1"
    session.push_sse(
        "ask_message",
        {
            "id": ask_id,
            "preamble": "I need to understand your business first.",
            "questions": [
                {
                    "type": "free_text",
                    "id": "company_desc",
                    "label": "What does your company do? (2-3 sentences)",
                    "placeholder": "We build...",
                    "multiline": True,
                },
                {
                    "type": "single_select",
                    "id": "stage",
                    "label": "What stage is your company?",
                    "options": [
                        "Pre-seed solo/duo",
                        "Pre-seed with team",
                        "Seed",
                        "Series A+",
                    ],
                },
            ],
        },
    )
    session.add_to_history("assistant", {"ask_id": ask_id, "questions": []})

    # Wait for user answer
    session.start_ask(ask_id)
    try:
        await asyncio.wait_for(session.pending_ask_event.wait(), timeout=300)
    except asyncio.TimeoutError:
        session.push_sse("error", {"message": "Timeout waiting for answer"})
        session.clear_ask()
        return

    answers = session.pending_answers
    session.clear_ask()
    session.push_sse("user_message", {"answers": answers})
    session.add_to_history("user", {"answers": answers})

    await asyncio.sleep(0.1)

    # Step 3: Show research and results
    session.push_sse("research_start", {"label": "Searching competitors..."})
    await asyncio.sleep(0.3)
    session.push_sse("research_done", {"label": "Found 3 competitors"})

    session.push_sse(
        "assistant_message",
        {
            "blocks": [
                {
                    "type": "competitor_table",
                    "columns": ["Name", "Position", "Price", "Weakness"],
                    "rows": [
                        ["Acme Corp", "Fast and cheap", "Free", "No API"],
                        ["Globex", "Enterprise-grade", "$$$", "Slow"],
                        ["Initech", "AI-powered", "$$", "Buggy"],
                    ],
                    "highlights": {
                        "table_stakes": ["Speed", "Easy onboarding"],
                        "white_space": ["Compliance", "Local integrations"],
                    },
                },
                {
                    "type": "text",
                    "content": "All three say 'we're faster'. Nobody talks about compliance. That's your white space.",
                },
            ]
        },
    )

    await asyncio.sleep(0.1)

    # Step 4: Final result
    session.push_sse(
        "assistant_message",
        {
            "blocks": [
                {
                    "type": "final_result",
                    "content": "## Positioning Statement\n\nWe help FMCG brand managers launch compliant private label products 3x faster through integrated marketplace automation, unlike generic platforms that ignore local regulations.",
                },
                {
                    "type": "strength_meter",
                    "metrics": [
                        {"label": "Specificity", "value": 8, "max": 10},
                        {"label": "Verifiability", "value": 7, "max": 10},
                        {"label": "Compression", "value": 9, "max": 10},
                        {"label": "Differentiation", "value": 8, "max": 10},
                    ],
                },
            ]
        },
    )

    session.push_sse("done", {})

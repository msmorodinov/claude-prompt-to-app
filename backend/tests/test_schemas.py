"""Tests for schema definitions."""

from __future__ import annotations

from backend.schemas import (
    ASK_SCHEMA,
    DISPLAY_WIDGET_TYPES,
    DISPLAY_WIDGETS,
    INPUT_WIDGET_TYPES,
    INPUT_WIDGETS,
    SHOW_SCHEMA,
)


class TestDisplayWidgets:
    def test_all_display_types_defined(self):
        expected = {
            "text",
            "section_header",
            "data_table",
            "comparison",
            "category_list",
            "quote_highlight",
            "metric_bars",
            "copyable",
            "progress",
            "final_result",
            "timer",
        }
        assert DISPLAY_WIDGET_TYPES == expected

    def test_each_widget_has_type_field(self):
        for name, schema in DISPLAY_WIDGETS.items():
            assert "type" in schema["properties"]
            assert schema["properties"]["type"]["const"] == name

    def test_each_widget_has_required(self):
        for name, schema in DISPLAY_WIDGETS.items():
            assert "required" in schema
            assert "type" in schema["required"]


class TestInputWidgets:
    def test_all_input_types_defined(self):
        expected = {
            "single_select",
            "multi_select",
            "free_text",
            "rank_priorities",
            "slider_scale",
            "matrix_2x2",
            "tag_input",
        }
        assert INPUT_WIDGET_TYPES == expected

    def test_each_widget_has_id_field(self):
        for name, schema in INPUT_WIDGETS.items():
            assert "id" in schema["properties"]
            assert "id" in schema["required"]

    def test_each_widget_has_label_field(self):
        for name, schema in INPUT_WIDGETS.items():
            assert "label" in schema["properties"]
            assert "label" in schema["required"]


class TestShowSchema:
    def test_show_requires_blocks(self):
        assert "blocks" in SHOW_SCHEMA["properties"]
        assert "blocks" in SHOW_SCHEMA["required"]

    def test_show_blocks_oneof_matches_display_widgets(self):
        items = SHOW_SCHEMA["properties"]["blocks"]["items"]
        oneof_types = {s["properties"]["type"]["const"] for s in items["oneOf"]}
        assert oneof_types == DISPLAY_WIDGET_TYPES


class TestAskSchema:
    def test_ask_requires_questions(self):
        assert "questions" in ASK_SCHEMA["properties"]
        assert "questions" in ASK_SCHEMA["required"]

    def test_ask_has_optional_preamble(self):
        assert "preamble" in ASK_SCHEMA["properties"]
        assert "preamble" not in ASK_SCHEMA["required"]

    def test_ask_questions_oneof_matches_input_widgets(self):
        items = ASK_SCHEMA["properties"]["questions"]["items"]
        oneof_types = {s["properties"]["type"]["const"] for s in items["oneOf"]}
        assert oneof_types == INPUT_WIDGET_TYPES

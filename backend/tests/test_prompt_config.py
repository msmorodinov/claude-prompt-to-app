"""Tests for prompt_config.py — pure Python, no SDK dependency."""

from __future__ import annotations

import textwrap
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.prompt_config import _parse_yaml_simple, load_prompt, get_app_config


class TestParseYamlSimple:
    def test_parses_single_key_value(self):
        result = _parse_yaml_simple("title: My App")
        assert result == {"title": "My App"}

    def test_parses_multiple_key_values(self):
        text = "title: Workshop\nsubtitle: Learn things"
        result = _parse_yaml_simple(text)
        assert result["title"] == "Workshop"
        assert result["subtitle"] == "Learn things"

    def test_strips_whitespace_from_keys_and_values(self):
        result = _parse_yaml_simple("  title  :   trimmed value  ")
        assert result["title"] == "trimmed value"

    def test_returns_empty_dict_for_empty_string(self):
        result = _parse_yaml_simple("")
        assert result == {}

    def test_ignores_lines_without_colon(self):
        result = _parse_yaml_simple("no colon here\ntitle: valid")
        assert result == {"title": "valid"}

    def test_value_with_colon_preserves_first_partition(self):
        # "url: http://example.com" — only the first colon is used
        result = _parse_yaml_simple("url: http://example.com")
        assert result["url"] == "http://example.com"

    def test_parses_empty_value(self):
        result = _parse_yaml_simple("key: ")
        assert result["key"] == ""

    def test_handles_multiple_lines_with_mixed_content(self):
        text = textwrap.dedent("""\
            title: Positioning Workshop
            subtitle: Your interactive workshop
            version: 1
        """)
        result = _parse_yaml_simple(text)
        assert result["title"] == "Positioning Workshop"
        assert result["subtitle"] == "Your interactive workshop"
        assert result["version"] == "1"


class TestLoadPrompt:
    def test_returns_frontmatter_and_body(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text(
            "---\ntitle: Test App\nsubtitle: A sub\n---\nBody content here.\n"
        )
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            meta, body = load_prompt()
        assert meta["title"] == "Test App"
        assert meta["subtitle"] == "A sub"
        assert "Body content here." in body

    def test_returns_empty_meta_when_no_frontmatter(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("Just plain text, no frontmatter.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            meta, body = load_prompt()
        assert meta == {}
        assert "Just plain text" in body

    def test_body_does_not_include_frontmatter_delimiters(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("---\ntitle: T\n---\nActual body.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            _, body = load_prompt()
        assert "---" not in body
        assert "title: T" not in body

    def test_full_text_returned_when_no_frontmatter(self, tmp_path):
        content = "No frontmatter here.\nSecond line."
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text(content)
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            meta, body = load_prompt()
        assert meta == {}
        assert body == content

    def test_empty_frontmatter_section(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("---\n---\nBody only.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            meta, body = load_prompt()
        assert meta == {}
        assert "Body only." in body

    def test_frontmatter_with_only_title(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("---\ntitle: Solo Title\n---\nContent.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            meta, body = load_prompt()
        assert meta == {"title": "Solo Title"}
        assert "Content." in body


class TestGetAppConfig:
    def test_returns_title_from_frontmatter(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("---\ntitle: My Workshop\n---\nBody.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            config = get_app_config()
        assert config["title"] == "My Workshop"

    def test_returns_subtitle_when_present(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("---\ntitle: App\nsubtitle: A great app\n---\nBody.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            config = get_app_config()
        assert config["subtitle"] == "A great app"

    def test_no_subtitle_key_when_absent(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("---\ntitle: App\n---\nBody.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            config = get_app_config()
        assert "subtitle" not in config

    def test_defaults_title_to_app_when_no_frontmatter(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("Just text, no frontmatter.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            config = get_app_config()
        assert config["title"] == "App"

    def test_defaults_title_to_app_when_title_missing_from_frontmatter(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("---\nsubtitle: Only sub\n---\nBody.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            config = get_app_config()
        assert config["title"] == "App"
        assert config["subtitle"] == "Only sub"

    def test_returns_dict_structure(self, tmp_path):
        prompt_file = tmp_path / "prompt.md"
        prompt_file.write_text("---\ntitle: T\nsubtitle: S\n---\nBody.\n")
        with patch("backend.prompt_config.PROMPT_PATH", prompt_file):
            config = get_app_config()
        assert isinstance(config, dict)
        assert set(config.keys()) == {"title", "subtitle"}

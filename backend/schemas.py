"""JSON schemas for show/ask widget types."""

DISPLAY_WIDGETS = {
    "text": {
        "type": "object",
        "properties": {
            "type": {"const": "text"},
            "content": {"type": "string", "description": "Markdown content"},
        },
        "required": ["type", "content"],
    },
    "section_header": {
        "type": "object",
        "properties": {
            "type": {"const": "section_header"},
            "title": {"type": "string"},
            "subtitle": {"type": "string"},
        },
        "required": ["type", "title"],
    },
    "data_table": {
        "type": "object",
        "properties": {
            "type": {"const": "data_table"},
            "columns": {"type": "array", "items": {"type": "string"}, "description": "Column headers"},
            "rows": {
                "type": "array",
                "items": {"type": "array", "items": {"type": "string"}},
                "description": "Row data (each row is an array of cell strings)",
            },
            "caption": {"type": "string", "description": "Caption below the table"},
            "highlights": {
                "type": "object",
                "description": "Column name → array of cell values to highlight",
                "additionalProperties": {
                    "type": "array",
                    "items": {"type": "string"},
                },
            },
        },
        "required": ["type", "columns", "rows"],
    },
    "comparison": {
        "type": "object",
        "properties": {
            "type": {"const": "comparison"},
            "left": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["label", "content"],
            },
            "right": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["label", "content"],
            },
            "note": {"type": "string"},
        },
        "required": ["type", "left", "right"],
    },
    "category_list": {
        "type": "object",
        "properties": {
            "type": {"const": "category_list"},
            "categories": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string"},
                        "items": {
                            "type": "array",
                            "items": {"type": "string"},
                        },
                        "style": {
                            "type": "string",
                            "enum": ["default", "success", "warning", "error"],
                        },
                    },
                    "required": ["label", "items"],
                },
            },
        },
        "required": ["type", "categories"],
    },
    "quote_highlight": {
        "type": "object",
        "properties": {
            "type": {"const": "quote_highlight"},
            "quote": {"type": "string"},
            "attribution": {"type": "string"},
            "note": {"type": "string"},
        },
        "required": ["type", "quote"],
    },
    "metric_bars": {
        "type": "object",
        "properties": {
            "type": {"const": "metric_bars"},
            "metrics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "label": {"type": "string", "description": "Metric name"},
                        "value": {"type": "number", "description": "Current value"},
                        "max": {"type": "number", "description": "Maximum value (bar fills value/max)"},
                        "unit": {"type": "string", "description": "Optional unit label (e.g. '%', 'pts')"},
                    },
                    "required": ["label", "value", "max"],
                },
            },
        },
        "required": ["type", "metrics"],
    },
    "copyable": {
        "type": "object",
        "properties": {
            "type": {"const": "copyable"},
            "label": {"type": "string"},
            "content": {"type": "string"},
        },
        "required": ["type", "content"],
    },
    "progress": {
        "type": "object",
        "properties": {
            "type": {"const": "progress"},
            "label": {"type": "string"},
            "percent": {"type": "number", "minimum": 0, "maximum": 100},
        },
        "required": ["type", "label", "percent"],
    },
    "final_result": {
        "type": "object",
        "properties": {
            "type": {"const": "final_result"},
            "content": {"type": "string", "description": "Markdown content"},
        },
        "required": ["type", "content"],
    },
    "timer": {
        "type": "object",
        "properties": {
            "type": {"const": "timer"},
            "seconds": {"type": "integer", "minimum": 1},
            "label": {"type": "string"},
        },
        "required": ["type", "seconds"],
    },
}

INPUT_WIDGETS = {
    "single_select": {
        "type": "object",
        "properties": {
            "type": {"const": "single_select"},
            "id": {"type": "string"},
            "label": {"type": "string"},
            "options": {"type": "array", "items": {"type": "string"}},
            "allow_custom": {"type": "boolean"},
        },
        "required": ["type", "id", "label", "options"],
    },
    "multi_select": {
        "type": "object",
        "properties": {
            "type": {"const": "multi_select"},
            "id": {"type": "string"},
            "label": {"type": "string"},
            "options": {"type": "array", "items": {"type": "string"}},
            "min_select": {"type": "integer", "minimum": 0},
            "max_select": {"type": "integer", "minimum": 1},
        },
        "required": ["type", "id", "label", "options"],
    },
    "free_text": {
        "type": "object",
        "properties": {
            "type": {"const": "free_text"},
            "id": {"type": "string"},
            "label": {"type": "string"},
            "placeholder": {"type": "string"},
            "max_words": {"type": "integer"},
            "multiline": {"type": "boolean"},
        },
        "required": ["type", "id", "label"],
    },
    "rank_priorities": {
        "type": "object",
        "properties": {
            "type": {"const": "rank_priorities"},
            "id": {"type": "string"},
            "label": {"type": "string"},
            "items": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["type", "id", "label", "items"],
    },
    "slider_scale": {
        "type": "object",
        "properties": {
            "type": {"const": "slider_scale"},
            "id": {"type": "string"},
            "label": {"type": "string"},
            "min": {"type": "number"},
            "max": {"type": "number"},
            "step": {"type": "number"},
            "min_label": {"type": "string"},
            "max_label": {"type": "string"},
        },
        "required": ["type", "id", "label", "min", "max"],
    },
    "matrix_2x2": {
        "type": "object",
        "properties": {
            "type": {"const": "matrix_2x2"},
            "id": {"type": "string"},
            "label": {"type": "string"},
            "x_axis": {"type": "string"},
            "y_axis": {"type": "string"},
            "items": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["type", "id", "label", "x_axis", "y_axis", "items"],
    },
    "tag_input": {
        "type": "object",
        "properties": {
            "type": {"const": "tag_input"},
            "id": {"type": "string"},
            "label": {"type": "string"},
            "min_tags": {"type": "integer"},
            "max_tags": {"type": "integer"},
            "placeholder": {"type": "string"},
        },
        "required": ["type", "id", "label"],
    },
}

SHOW_SCHEMA = {
    "type": "object",
    "properties": {
        "blocks": {
            "type": "array",
            "description": "Array of display widgets to show",
            "items": {"oneOf": list(DISPLAY_WIDGETS.values())},
        },
    },
    "required": ["blocks"],
}

ASK_SCHEMA = {
    "type": "object",
    "properties": {
        "preamble": {
            "type": "string",
            "description": "Optional text to show before questions",
        },
        "questions": {
            "type": "array",
            "description": "Array of input widgets (questions)",
            "items": {"oneOf": list(INPUT_WIDGETS.values())},
        },
    },
    "required": ["questions"],
}

SAVE_APP_SCHEMA = {
    "type": "object",
    "properties": {
        "slug": {
            "type": "string",
            "minLength": 2,
            "maxLength": 64,
            "description": "URL-friendly ID (lowercase, hyphens, 2+ chars)",
        },
        "title": {
            "type": "string",
            "maxLength": 200,
            "description": "Human-readable app title",
        },
        "subtitle": {
            "type": "string",
            "maxLength": 200,
            "description": "Short tagline (optional)",
        },
        "body": {
            "type": "string",
            "maxLength": 50000,
            "description": "Full system prompt in Markdown",
        },
    },
    "required": ["slug", "title", "body"],
}

DISPLAY_WIDGET_TYPES = set(DISPLAY_WIDGETS.keys())
INPUT_WIDGET_TYPES = set(INPUT_WIDGETS.keys())

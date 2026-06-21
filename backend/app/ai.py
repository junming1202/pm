"""OpenRouter AI client.

`ask()` is a single-turn smoke test. `chat()` is the board assistant: it sends
the board JSON, conversation history, and the user's question, and uses
Structured Outputs to get back a reply plus an optional list of board
operations. The API key is read from OPENROUTER_API_KEY (.env); the model id is
fixed to the value specified for this project.
"""

import json
import os

import httpx
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "deepseek/deepseek-v4-flash"

# Structured Outputs schema: the model must return a reply and a list of
# operations. Each operation names a type and carries the fields that type
# needs; columns and cards are referenced by their string ids from the board.
RESPONSE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "board_assistant",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["reply", "operations"],
            "properties": {
                "reply": {
                    "type": "string",
                    "description": "A short message to show the user.",
                },
                "operations": {
                    "type": "array",
                    "description": "Board changes to apply, in order. Empty if none.",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "type",
                            "column_id",
                            "card_id",
                            "title",
                            "details",
                            "index",
                        ],
                        "properties": {
                            "type": {
                                "type": "string",
                                "enum": [
                                    "create_card",
                                    "edit_card",
                                    "move_card",
                                    "rename_column",
                                ],
                            },
                            "column_id": {
                                "type": "string",
                                "description": "Target column id. '' when not used.",
                            },
                            "card_id": {
                                "type": "string",
                                "description": "Target card id. '' when not used.",
                            },
                            "title": {
                                "type": "string",
                                "description": "Card or column title. '' when not used.",
                            },
                            "details": {
                                "type": "string",
                                "description": "Card details. '' when not used.",
                            },
                            "index": {
                                "type": "integer",
                                "description": "0-based position for move_card. 0 otherwise.",
                            },
                        },
                    },
                },
            },
        },
    },
}

SYSTEM_PROMPT = (
    "You are a Kanban board assistant. You receive the current board as JSON and "
    "the user's request. Answer briefly in 'reply'. If the user asks to change the "
    "board, return operations referencing the existing column and card ids. "
    "Operation types: create_card (column_id, title, details), edit_card (card_id, "
    "title, details), move_card (card_id, column_id, index), rename_column "
    "(column_id, title). Use '' for unused string fields and 0 for unused index. "
    "Only return operations when the user clearly wants a change."
)


class AIError(Exception):
    """Raised when the AI call cannot be made or fails."""


def _api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise AIError("OPENROUTER_API_KEY is not set. Add it to .env.")
    return key


def _post(payload: dict) -> dict:
    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {_api_key()}"},
            json=payload,
            timeout=60,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise AIError(f"OpenRouter returned {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise AIError(f"OpenRouter request failed: {exc}") from exc
    return response.json()


def ask(prompt: str) -> str:
    """Send a single-turn prompt to the model and return the reply text."""
    data = _post(
        {"model": MODEL, "messages": [{"role": "user", "content": prompt}]}
    )
    return data["choices"][0]["message"]["content"]


def chat(board: dict, history: list[dict], question: str) -> dict:
    """Ask the board assistant. Returns {"reply": str, "operations": list}.

    history is a list of {"role": "user"|"assistant", "content": str}.
    """
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        *history,
        {
            "role": "user",
            "content": f"Board:\n{json.dumps(board)}\n\nRequest:\n{question}",
        },
    ]
    data = _post(
        {"model": MODEL, "messages": messages, "response_format": RESPONSE_SCHEMA}
    )
    content = data["choices"][0]["message"]["content"]
    try:
        parsed = json.loads(content)
    except (json.JSONDecodeError, TypeError) as exc:
        raise AIError("AI returned an invalid response") from exc
    if not isinstance(parsed, dict) or "reply" not in parsed:
        raise AIError("AI response missing required fields")
    parsed.setdefault("operations", [])
    return parsed

"""OpenRouter AI client.

A minimal helper that sends a chat completion request to OpenRouter and returns
the assistant's reply text. The API key is read from OPENROUTER_API_KEY (.env);
the model id is fixed to the value specified for this project.
"""

import os

import httpx
from dotenv import load_dotenv

load_dotenv()

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = "deepseek/deepseek-v4-flash"


class AIError(Exception):
    """Raised when the AI call cannot be made or fails."""


def _api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise AIError("OPENROUTER_API_KEY is not set. Add it to .env.")
    return key


def ask(prompt: str) -> str:
    """Send a single-turn prompt to the model and return the reply text."""
    try:
        response = httpx.post(
            OPENROUTER_URL,
            headers={"Authorization": f"Bearer {_api_key()}"},
            json={
                "model": MODEL,
                "messages": [{"role": "user", "content": prompt}],
            },
            timeout=30,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise AIError(f"OpenRouter returned {exc.response.status_code}") from exc
    except httpx.HTTPError as exc:
        raise AIError(f"OpenRouter request failed: {exc}") from exc

    data = response.json()
    return data["choices"][0]["message"]["content"]

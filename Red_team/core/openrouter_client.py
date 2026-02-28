"""
OpenRouter client for cloud LLM inference.
Uses the OpenAI-compatible API at https://openrouter.ai/api/v1.

Includes retry with exponential backoff and model fallback for rate limits.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from openai import AsyncOpenAI, RateLimitError, NotFoundError

from core.config import settings

logger = logging.getLogger(__name__)

# Fallback chain for when primary model is rate-limited or unavailable
FALLBACK_MODELS = [
    "deepseek/deepseek-r1-0528:free",
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.3-70b-instruct:free",
]


class OpenRouterClient:
    """Async wrapper around OpenRouter's OpenAI-compatible API."""

    BASE_URL = "https://openrouter.ai/api/v1"
    MAX_RETRIES = 5
    BASE_DELAY = 2  # seconds

    def __init__(self, api_key: str | None = None):
        self._api_key = api_key or settings.openrouter_api_key
        self._client = AsyncOpenAI(
            api_key=self._api_key,
            base_url=self.BASE_URL,
            max_retries=0,  # We handle retries ourselves for fallback
        )

    async def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
        **kwargs: Any,
    ) -> str:
        """
        Send a chat completion with retry + model fallback.
        """
        models_to_try = [model] + [m for m in FALLBACK_MODELS if m != model]

        for model_name in models_to_try:
            for attempt in range(self.MAX_RETRIES):
                try:
                    response = await self._client.chat.completions.create(
                        model=model_name,
                        messages=messages,
                        temperature=temperature,
                        max_tokens=max_tokens,
                        **kwargs,
                    )
                    # Handle None response or empty choices
                    if response is None or not response.choices:
                        logger.warning("OpenRouter: empty response from %s, trying fallback...", model_name)
                        break  # Try next model
                    content = response.choices[0].message.content or ""
                    if model_name != model:
                        logger.info("OpenRouter: used fallback model %s", model_name)
                    logger.debug("OpenRouter %s response: %d chars", model_name, len(content))
                    return content

                except RateLimitError as e:
                    delay = min(self.BASE_DELAY * (2 ** attempt), 32)
                    logger.warning(
                        "OpenRouter 429 on %s (attempt %d/%d), waiting %ds...",
                        model_name, attempt + 1, self.MAX_RETRIES, delay,
                    )
                    if attempt < self.MAX_RETRIES - 1:
                        await asyncio.sleep(delay)
                    else:
                        logger.warning("Max retries on %s, trying fallback...", model_name)
                        break  # Try next model

                except NotFoundError:
                    logger.warning("Model %s not found, trying fallback...", model_name)
                    break  # Try next model
                    
                except Exception as e:
                    logger.warning("OpenRouter error on %s: %s, trying fallback...", model_name, e)
                    break  # Try next model

        raise RuntimeError(
            f"All OpenRouter models exhausted after retries. "
            f"Tried: {', '.join(models_to_try)}"
        )

    async def ping(self) -> bool:
        """Check OpenRouter connectivity."""
        try:
            await self._client.models.list()
            return True
        except Exception:
            return False


# Default singleton
openrouter_client = OpenRouterClient()

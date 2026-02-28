"""
Unified LLM client with OpenRouter as primary and Ollama as fallback.
"""

from __future__ import annotations

import logging
from typing import Any

from core.config import settings
from core.openrouter_client import openrouter_client
from core.ollama_client import ollama_client

logger = logging.getLogger(__name__)


class LLMClient:
    """
    Unified LLM client that uses OpenRouter as primary and Ollama as fallback.
    """

    async def chat(
        self,
        model: str,
        messages: list[dict[str, str]],
        temperature: float = 0.3,
        max_tokens: int = 4096,
        fallback_model: str | None = None,
        **kwargs: Any,
    ) -> str:
        """
        Send a chat completion request.
        
        Tries OpenRouter first (if API key is set), then falls back to Ollama.
        """
        # Try OpenRouter first if we have an API key
        if settings.openrouter_api_key and settings.openrouter_api_key != "your_openrouter_api_key_here":
            try:
                logger.debug(f"Trying OpenRouter with model: {model}")
                response = await openrouter_client.chat(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    **kwargs,
                )
                logger.info(f"OpenRouter success with model: {model}")
                return response
            except Exception as e:
                logger.warning(f"OpenRouter failed: {e}, trying fallback...")
        else:
            logger.debug("No OpenRouter API key set, using Ollama")

        # Fallback to Ollama
        ollama_model = fallback_model or settings.commander_model_fallback
        try:
            logger.debug(f"Trying Ollama with model: {ollama_model}")
            response = await ollama_client.chat(
                model=ollama_model,
                messages=messages,
                temperature=temperature,
                **kwargs,
            )
            logger.info(f"Ollama fallback success with model: {ollama_model}")
            return response
        except Exception as e:
            logger.error(f"Ollama fallback also failed: {e}")
            raise RuntimeError(
                f"Both OpenRouter (primary) and Ollama (fallback) failed. "
                f"OpenRouter model: {model}, Ollama model: {ollama_model}"
            )

    async def ping_openrouter(self) -> bool:
        """Check if OpenRouter is available."""
        if not settings.openrouter_api_key:
            return False
        return await openrouter_client.ping()

    async def ping_ollama(self) -> bool:
        """Check if Ollama is available."""
        return await ollama_client.ping()


# Default singleton
llm_client = LLMClient()

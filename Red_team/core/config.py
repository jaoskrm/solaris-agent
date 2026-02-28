"""
Centralized configuration loaded from environment variables.
Uses pydantic-settings for validation and type coercion.
"""

from pathlib import Path

from pydantic_settings import BaseSettings
from pydantic import Field

# Resolve .env relative to project root (parent of core/)
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    """All configuration for the Red Team agent swarm."""

    # Redis (message bus)
    redis_url: str = Field(default="redis://localhost:6381", description="Redis connection URL")

    # Ollama (local LLMs)
    ollama_base_url: str = Field(
        default="http://localhost:11434", description="Ollama server base URL"
    )

    # OpenRouter (cloud LLMs)
    openrouter_api_key: str = Field(default="", description="OpenRouter API key")

    # Target
    juice_shop_url: str = Field(
        default="http://localhost:3000", description="Juice Shop target URL"
    )

    # Model selection (per PRD Section 3.2)
    # Commander: Qwen3-235B via OpenRouter (cloud) OR local Ollama fallback
    commander_model: str = Field(
        default="qwen/qwen3-235b-a22b:free",
        description="OpenRouter model for Commander agent (cloud mode)",
    )
    commander_model_local: str = Field(
        default="llama3:latest",
        description="Ollama model for Commander agent (local mode)",
    )
    # Alpha Recon: llama3:latest via Ollama (local)
    recon_model: str = Field(
        default="llama3:latest",
        description="Ollama model for Alpha Recon agent",
    )
    # Gamma Exploit: qwen2.5-coder:7b via Ollama (local)
    exploit_model: str = Field(
        default="qwen2.5-coder:7b-instruct",
        description="Ollama model for Gamma Exploit agent",
    )

    # HITL (Phase 3)
    hitl_timeout_seconds: int = Field(
        default=120, description="Seconds to wait for human approval"
    )
    max_reflection_iterations: int = Field(
        default=3, description="Max PentAGI reflection retries"
    )

    model_config = {"env_file": str(_ENV_FILE), "env_file_encoding": "utf-8", "extra": "ignore"}


# Singleton — import this everywhere
settings = Settings()

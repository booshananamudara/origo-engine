"""
Base platform adapter interface.

Every AI platform adapter must:
  1. Subclass BasePlatformAdapter
  2. Implement the async complete() method
  3. Register itself in platforms/__init__.py

Adding a new platform (e.g. Gemini) = one new file + one line in __init__.py.
No other files change.
"""
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.models.response import Platform


@dataclass
class PlatformResponse:
    platform: Platform
    raw_response: str
    model_used: str
    latency_ms: int
    tokens_used: int | None = None
    cost_usd: float | None = None


class BasePlatformAdapter(ABC):
    """Common interface for all AI platform adapters."""

    platform: Platform  # subclasses must set this class var

    @abstractmethod
    async def complete(self, prompt_text: str, client_id: uuid.UUID) -> PlatformResponse:
        """
        Send prompt_text to the platform and return a structured response.

        Must:
        - Retry on 429/5xx using exponential backoff with jitter (see retry.py)
        - Log estimated cost_usd to stdout on every call
        - Never log or expose API keys
        - Include client_id on every structured log line
        """
        ...

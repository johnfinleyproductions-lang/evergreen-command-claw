"""Async OpenAI-compatible client for llama.cpp's llama-server.

Thin wrapper around httpx.AsyncClient. No Vercel AI SDK, no magic. Talks
directly to /v1/chat/completions on llama-server (port 8081 by default).
"""
from __future__ import annotations

import logging
from typing import Any, Optional

import httpx

from config import config

log = logging.getLogger(__name__)


class LLMClient:
    def __init__(
        self,
        base_url: str,
        model: str,
        timeout: float = 600.0,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "LLMClient":
        self._client = httpx.AsyncClient(timeout=self.timeout)
        return self

    async def __aexit__(self, *exc_info: Any) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    async def chat(
        self,
        messages: list[dict],
        tools: Optional[list[dict]] = None,
        temperature: Optional[float] = None,
    ) -> dict:
        """POST /v1/chat/completions and return the full JSON response."""
        if self._client is None:
            raise RuntimeError("LLMClient not opened (use 'async with')")

        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature if temperature is not None else config.LLM_TEMPERATURE,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        log.debug("llm.chat: %d messages, %d tools", len(messages), len(tools or []))
        r = await self._client.post(
            f"{self.base_url}/v1/chat/completions",
            json=payload,
        )
        r.raise_for_status()
        return r.json()

    async def models(self) -> dict:
        """GET /v1/models — smoke test that the server is reachable."""
        if self._client is None:
            raise RuntimeError("LLMClient not opened (use 'async with')")
        r = await self._client.get(f"{self.base_url}/v1/models")
        r.raise_for_status()
        return r.json()


def make_client() -> LLMClient:
    return LLMClient(
        base_url=config.LLM_BASE_URL,
        model=config.LLM_MODEL,
        timeout=config.LLM_TIMEOUT,
    )

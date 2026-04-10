"""Fetch a URL and return its readable text content.

Async tool (uses httpx.AsyncClient directly, no thread offload). Strips
HTML via BeautifulSoup and truncates very long pages so the model doesn't
get drowned in a 500 KB wall of nav/footer cruft.

Note on MAX_CONTENT_LENGTH: this is deliberately aggressive. Every fetched
page lands in the agent's message history as a `tool` message, and the
history grows with every iteration. At 6000 chars (~1500 tokens) a page,
the agent can chain 5+ fetches inside even a modest 8K context window.
Raising this number is tempting but has burned us before -- two 50KB
fetches blew through an 8192-token context on the tier 2 smoke test.
"""
from typing import Any

import httpx
from bs4 import BeautifulSoup

from .base import Tool

MAX_CONTENT_LENGTH = 6_000
USER_AGENT = "EvergreenCommand/0.1 (+local research agent)"


class FetchUrlTool(Tool):
    name = "fetch_url"
    description = (
        "Fetch a URL and return its readable text content. HTML is stripped "
        "down to body text (scripts, styles, nav, footer removed). Long pages "
        "are truncated to about 6000 characters -- enough for a summary, not "
        "enough to blow the context window. Use this after web_search to read "
        "the actual content of a promising result."
    )
    parameters = {
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The full URL to fetch (must start with http:// or https://).",
            },
        },
        "required": ["url"],
    }

    async def execute(self, **kwargs: Any) -> dict:
        url = kwargs.get("url")
        if not isinstance(url, str) or not url.startswith(("http://", "https://")):
            raise ValueError("fetch_url requires a valid http(s) URL")

        async with httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": USER_AGENT},
        ) as client:
            r = await client.get(url)
            r.raise_for_status()

        content_type = r.headers.get("content-type", "")

        if "html" in content_type.lower():
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            title = soup.title.string.strip() if soup.title and soup.title.string else None
        else:
            text = r.text
            title = None

        truncated = len(text) > MAX_CONTENT_LENGTH
        if truncated:
            text = text[:MAX_CONTENT_LENGTH]

        return {
            "url": url,
            "status": r.status_code,
            "content_type": content_type,
            "title": title,
            "length": len(text),
            "truncated": truncated,
            "text": text,
        }

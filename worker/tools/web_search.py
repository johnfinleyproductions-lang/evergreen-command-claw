"""DuckDuckGo web search tool — ported from evergreenagrent.

Uses `ddgs` (the renamed successor to `duckduckgo-search`). No API key needed.
Returns a list of results with title, url, and snippet.
"""
from typing import Any

from .base import Tool


class WebSearchTool(Tool):
    name = "web_search"
    description = (
        "Search the web via DuckDuckGo. Returns a list of results with title, "
        "url, and a short snippet. Use this for research, fact-checking, or "
        "finding specific pages to read with fetch_url."
    )
    parameters = {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query.",
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of results to return (default 5, max 20).",
                "default": 5,
            },
        },
        "required": ["query"],
    }

    def execute(self, **kwargs: Any) -> dict:
        # Lazy import so the worker can boot even if ddgs isn't installed.
        try:
            from ddgs import DDGS
        except ImportError:  # pragma: no cover
            from duckduckgo_search import DDGS  # type: ignore

        query = kwargs.get("query")
        if not isinstance(query, str) or not query.strip():
            raise ValueError("web_search requires a non-empty 'query' string")

        max_results = min(int(kwargs.get("max_results", 5) or 5), 20)

        results: list[dict] = []
        with DDGS() as ddgs:
            for i, r in enumerate(ddgs.text(query, max_results=max_results)):
                results.append(
                    {
                        "title": r.get("title", ""),
                        "url": r.get("href") or r.get("url", ""),
                        "snippet": r.get("body", ""),
                    }
                )
                if i + 1 >= max_results:
                    break

        return {
            "query": query,
            "result_count": len(results),
            "results": results,
        }

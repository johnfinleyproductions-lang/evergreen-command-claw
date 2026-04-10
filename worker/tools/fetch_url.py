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

Note on content types: we explicitly only handle text-ish responses.
Binary formats (PDF, images, archives) get rejected with a useful error
the agent can see and recover from. This exists because Postgres JSONB
**cannot store \\u0000 null bytes** -- if you try to insert a tool_calls
row whose `result` jsonb payload contains a raw null byte,
asyncpg raises UntranslatableCharacterError and the whole tool_call INSERT
fails. Binary PDF content is riddled with nulls, so we refuse it up front.
As an extra belt-and-suspenders we also strip any remaining nulls from
text before returning.
"""
from typing import Any

import httpx
from bs4 import BeautifulSoup

from .base import Tool

MAX_CONTENT_LENGTH = 6_000
USER_AGENT = "EvergreenCommand/0.1 (+local research agent)"

# Content types we know how to render as readable text. Anything else gets
# rejected with a useful error so the agent can try a different URL.
_ALLOWED_CONTENT_PREFIXES = (
    "text/",
    "application/json",
    "application/xml",
    "application/xhtml",
    "application/rss",
    "application/atom",
    "application/ld+json",
    "application/javascript",
)


def _sanitize(text: str) -> str:
    """Strip characters that PostgreSQL JSONB refuses to round-trip.

    JSONB rejects the unicode null escape \\u0000. We also drop the other
    C0 control characters except \\t, \\n, \\r which are legitimate in
    scraped text.
    """
    if not text:
        return text
    # Fast path: no nulls -> just replace the control chars we care about
    if "\x00" in text:
        text = text.replace("\x00", "")
    # Drop C0 controls except tab/newline/cr
    return "".join(
        ch for ch in text
        if ch >= " " or ch in ("\t", "\n", "\r")
    )


class FetchUrlTool(Tool):
    name = "fetch_url"
    description = (
        "Fetch a URL and return its readable text content. HTML is stripped "
        "down to body text (scripts, styles, nav, footer removed). Long pages "
        "are truncated to about 6000 characters -- enough for a summary, not "
        "enough to blow the context window. Only text/HTML/JSON/XML pages are "
        "supported -- PDFs, images, and other binary formats will be rejected "
        "with an error, so prefer HTML landing pages over direct PDF links. "
        "Use this after web_search to read the actual content of a promising result."
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
        ctype_lower = content_type.lower()

        # Reject binary / unsupported content types before we try to
        # stuff raw bytes into a JSONB column.
        if not any(ctype_lower.startswith(p) for p in _ALLOWED_CONTENT_PREFIXES):
            raise ValueError(
                f"fetch_url refuses content-type '{content_type}' for {url}: "
                f"this tool only handles text/HTML/JSON/XML. Try a web_search "
                f"for an HTML summary page instead of a direct file link."
            )

        if "html" in ctype_lower:
            soup = BeautifulSoup(r.text, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
                tag.decompose()
            text = soup.get_text(separator="\n", strip=True)
            title = soup.title.string.strip() if soup.title and soup.title.string else None
        else:
            text = r.text
            title = None

        # Belt-and-suspenders: even "text/*" responses have been observed
        # with embedded null bytes (misconfigured servers, mojibake, etc.).
        # Strip them before they reach JSONB.
        text = _sanitize(text)

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

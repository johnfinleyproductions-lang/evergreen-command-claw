"""Tool registry with async dispatch.

Sync tools are offloaded to a thread via asyncio.to_thread so they don't
block the event loop. Async tools are awaited directly.
"""
import asyncio
import inspect
from typing import Any

from .base import Tool


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, Tool] = {}

    def register(self, tool: Tool) -> None:
        self._tools[tool.name] = tool

    def get(self, name: str) -> Tool | None:
        return self._tools.get(name)

    @property
    def schemas(self) -> list[dict]:
        return [t.to_schema() for t in self._tools.values()]

    @property
    def names(self) -> list[str]:
        return list(self._tools.keys())

    async def execute(self, name: str, **kwargs: Any) -> dict:
        """Execute a tool by name. Raises KeyError if tool not found."""
        tool = self._tools.get(name)
        if tool is None:
            raise KeyError(f"tool '{name}' not registered")

        if inspect.iscoroutinefunction(tool.execute):
            return await tool.execute(**kwargs)
        return await asyncio.to_thread(tool.execute, **kwargs)


registry = ToolRegistry()

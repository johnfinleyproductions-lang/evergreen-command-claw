"""Tool ABC — ported from evergreenagrent with two changes:

1. execute() returns a **dict** (not string) so it can be stored as JSONB
2. execute() may be sync or async — the registry handles both
"""
from abc import ABC, abstractmethod
from typing import Any


class Tool(ABC):
    name: str
    description: str
    parameters: dict  # JSON Schema

    def to_schema(self) -> dict:
        """Return an OpenAI-compatible function-calling schema."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters,
            },
        }

    @abstractmethod
    def execute(self, **kwargs: Any) -> dict:
        """Run the tool. Must return a JSON-serializable dict.

        May be overridden as async (registry detects coroutine functions).
        """

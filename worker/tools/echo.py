"""Stub tool for Phase 3A — proves the end-to-end plumbing works.

Takes {message: str} and returns {echo, length, reversed}.
No external APIs, no side effects, no failure modes (except bad input).
"""
from typing import Any

from .base import Tool


class EchoTool(Tool):
    name = "echo"
    description = "Echoes a message back with its length and reversed form."
    parameters = {
        "type": "object",
        "properties": {
            "message": {
                "type": "string",
                "description": "The message to echo.",
            },
        },
        "required": ["message"],
    }

    def execute(self, **kwargs: Any) -> dict:
        message = kwargs.get("message")
        if not isinstance(message, str):
            raise ValueError("echo tool requires a string 'message' argument")
        return {
            "echo": message,
            "length": len(message),
            "reversed": message[::-1],
        }

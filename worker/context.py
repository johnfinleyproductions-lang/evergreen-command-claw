"""Context variables that tools can read to know what run they're running in.

asyncio.to_thread (used by the registry for sync tools) automatically propagates
contextvars via contextvars.copy_context(), so sync tools can read current_run_id
just fine even though they execute off the event loop.
"""
from contextvars import ContextVar
from uuid import UUID

current_run_id: ContextVar[UUID] = ContextVar("current_run_id")

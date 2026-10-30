"""Live notifications over WebSockets ("push, don't poll", like Dropbox's notification servers).

The web app opens ONE WebSocket to the branch it is using: ws://<branch>/ws?token=<login token>.
This module remembers who is connected to THIS branch and pushes small JSON messages to them.

Every branch pushes only to its own connected users:
  - for changes made here, right after they are saved;
  - for changes made at other branches, when their event arrives through RabbitMQ.
So each connected person gets each notification exactly once, whichever branch they use.

Messages can be sent from any thread (request handlers, the RabbitMQ consumer thread):
they are handed to the web server's event loop with run_coroutine_threadsafe.
"""
import asyncio
import json
import logging
import uuid
from dataclasses import dataclass

from fastapi import WebSocket

log = logging.getLogger("notifier")


@dataclass(eq=False)
class Connection:
    websocket: WebSocket
    user_id: uuid.UUID
    role: str
    branch_id: str | None


class Notifier:
    def __init__(self):
        self.connections: set[Connection] = set()
        self.loop: asyncio.AbstractEventLoop | None = None

    def attach_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    def add(self, conn: Connection) -> None:
        self.connections.add(conn)

    def remove(self, conn: Connection) -> None:
        self.connections.discard(conn)

    async def _send(self, conn: Connection, message: dict) -> None:
        try:
            await conn.websocket.send_text(json.dumps(message, default=str))
        except Exception:
            self.connections.discard(conn)

    def _dispatch(self, targets: list[Connection], message: dict) -> None:
        if not targets or self.loop is None or self.loop.is_closed():
            return
        for conn in targets:
            try:
                asyncio.run_coroutine_threadsafe(self._send(conn, message), self.loop)
            except RuntimeError:
                pass

    def to_users(self, user_ids, message: dict) -> None:
        ids = {u for u in user_ids if u}
        self._dispatch([c for c in list(self.connections) if c.user_id in ids], message)

    def to_staff(self, branch_id: str, message: dict) -> None:
        """Staff of a branch (and admins)."""
        self._dispatch(
            [c for c in list(self.connections)
             if c.role == "admin" or (c.role == "staff" and c.branch_id == branch_id)],
            message,
        )

    @property
    def connected_count(self) -> int:
        return len(self.connections)


notifier = Notifier()

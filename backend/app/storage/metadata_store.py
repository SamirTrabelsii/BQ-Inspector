from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Set

import aiosqlite

from app.config import settings
from app.models.node import Edge, Node, NodeStatus, Variable

logger = logging.getLogger(__name__)


class MetadataStore:
    """Async SQLite-backed store for node and edge metadata.

    Uses a single persistent connection for the lifetime of the app,
    instead of opening/closing a connection per operation.
    Nodes are stored as JSON blobs for schema flexibility.
    """

    def __init__(self) -> None:
        self.db_path = settings.metadata_db_path
        self._db: Optional[aiosqlite.Connection] = None

    async def initialize(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db = await aiosqlite.connect(self.db_path)
        # Enable WAL mode for better concurrent read performance
        await self._db.execute("PRAGMA journal_mode=WAL")
        await self._db.execute("PRAGMA synchronous=NORMAL")
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS nodes (
                id          TEXT PRIMARY KEY,
                data        TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        """)
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS edges (
                id         TEXT PRIMARY KEY,
                source_id  TEXT NOT NULL,
                target_id  TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)
        await self._db.execute("""
            CREATE TABLE IF NOT EXISTS variables (
                name        TEXT PRIMARY KEY,
                value       TEXT NOT NULL,
                type        TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
        """)
        # Add indexes for common lookups
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id)"
        )
        await self._db.execute(
            "CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id)"
        )
        await self._db.commit()
        logger.info("MetadataStore initialized (persistent connection, WAL mode)")

    async def close(self) -> None:
        if self._db:
            await self._db.close()
            self._db = None
            logger.info("MetadataStore connection closed")

    async def _ensure_connected(self) -> aiosqlite.Connection:
        """Guard: reconnect if the connection was lost."""
        if self._db is None:
            logger.warning("MetadataStore reconnecting...")
            self._db = await aiosqlite.connect(self.db_path)
            await self._db.execute("PRAGMA journal_mode=WAL")
            await self._db.execute("PRAGMA synchronous=NORMAL")
        return self._db

    # ── Nodes ────────────────────────────────────────────────────────────────

    async def get_all_nodes(self) -> List[Node]:
        db = await self._ensure_connected()
        async with db.execute(
            "SELECT data FROM nodes ORDER BY created_at"
        ) as cursor:
            rows = await cursor.fetchall()
        return [Node.model_validate_json(row[0]) for row in rows]

    async def get_node(self, node_id: str) -> Optional[Node]:
        db = await self._ensure_connected()
        async with db.execute(
            "SELECT data FROM nodes WHERE id = ?", (node_id,)
        ) as cursor:
            row = await cursor.fetchone()
        return Node.model_validate_json(row[0]) if row else None

    async def save_node(self, node: Node) -> None:
        now = datetime.utcnow().isoformat()
        db = await self._ensure_connected()
        await db.execute(
            """
            INSERT INTO nodes (id, data, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                data       = excluded.data,
                updated_at = excluded.updated_at
            """,
            (node.id, node.model_dump_json(), now, now),
        )
        await db.commit()

    async def delete_node(self, node_id: str) -> None:
        db = await self._ensure_connected()
        await db.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
        await db.commit()

    async def propagate_staleness(self, start_node_id: str) -> None:
        """
        Recursively marks all downstream nodes as STALE if they are currently CACHED or ERROR.
        """
        import logging
        logger = logging.getLogger(__name__)

        all_nodes = await self.get_all_nodes()
        nodes_by_id = {n.id: n for n in all_nodes}
        
        # Build adjacency list for downstream edges
        downstream_map = {n.id: [] for n in all_nodes}
        for n in all_nodes:
            for up_id in n.upstream_ids:
                if up_id in downstream_map:
                    downstream_map[up_id].append(n.id)

        # BFS to find all downstream nodes
        queue = [start_node_id]
        visited: Set[str] = set()

        while queue:
            current_id = queue.pop(0)
            if current_id in visited:
                continue
            visited.add(current_id)

            for child_id in downstream_map.get(current_id, []):
                child_node = nodes_by_id.get(child_id)
                if child_node and child_node.status in (NodeStatus.CACHED, NodeStatus.ERROR):
                    child_node.status = NodeStatus.STALE
                    await self.save_node(child_node)
                    logger.info(f"[metadata_store] marked downstream node {child_id} as STALE due to upstream changes")
                    queue.append(child_id)

    # ── Edges ────────────────────────────────────────────────────────────────

    async def get_all_edges(self) -> List[Edge]:
        db = await self._ensure_connected()
        async with db.execute(
            "SELECT id, source_id, target_id FROM edges"
        ) as cursor:
            rows = await cursor.fetchall()
        return [Edge(id=r[0], source_id=r[1], target_id=r[2]) for r in rows]

    async def save_edge(self, edge: Edge) -> None:
        now = datetime.utcnow().isoformat()
        db = await self._ensure_connected()
        await db.execute(
            """
            INSERT OR REPLACE INTO edges (id, source_id, target_id, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (edge.id, edge.source_id, edge.target_id, now),
        )
        await db.commit()

    async def delete_edge(self, edge_id: str) -> None:
        db = await self._ensure_connected()
        await db.execute("DELETE FROM edges WHERE id = ?", (edge_id,))
        await db.commit()

    async def get_edges_for_node(self, node_id: str) -> List[Edge]:
        db = await self._ensure_connected()
        async with db.execute(
            "SELECT id, source_id, target_id FROM edges WHERE source_id = ? OR target_id = ?",
            (node_id, node_id),
        ) as cursor:
            rows = await cursor.fetchall()
        return [Edge(id=r[0], source_id=r[1], target_id=r[2]) for r in rows]

    # ── Variables ────────────────────────────────────────────────────────────

    async def get_all_variables(self) -> List[Variable]:
        db = await self._ensure_connected()
        async with db.execute(
            "SELECT name, value, type FROM variables ORDER BY name"
        ) as cursor:
            rows = await cursor.fetchall()
        return [Variable(name=r[0], value=r[1], type=r[2]) for r in rows]

    async def get_variable(self, name: str) -> Optional[Variable]:
        db = await self._ensure_connected()
        async with db.execute(
            "SELECT name, value, type FROM variables WHERE name = ?", (name,)
        ) as cursor:
            row = await cursor.fetchone()
        return Variable(name=row[0], value=row[1], type=row[2]) if row else None

    async def save_variable(self, var: Variable) -> None:
        now = datetime.utcnow().isoformat()
        db = await self._ensure_connected()
        await db.execute(
            """
            INSERT INTO variables (name, value, type, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                value      = excluded.value,
                type       = excluded.type,
                updated_at = excluded.updated_at
            """,
            (var.name, var.value, var.type, now, now),
        )
        await db.commit()

    async def delete_variable(self, name: str) -> None:
        db = await self._ensure_connected()
        await db.execute("DELETE FROM variables WHERE name = ?", (name,))
        await db.commit()


metadata_store = MetadataStore()

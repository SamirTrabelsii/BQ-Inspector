from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional

import aiosqlite

from app.config import settings
from app.models.node import Edge, Node


class MetadataStore:
    """Async SQLite-backed store for node and edge metadata.

    Nodes are stored as JSON blobs for schema flexibility. This avoids
    migration pain as the Node model evolves in future versions.
    """

    def __init__(self) -> None:
        self.db_path = settings.metadata_db_path

    async def initialize(self) -> None:
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS nodes (
                    id          TEXT PRIMARY KEY,
                    data        TEXT NOT NULL,
                    created_at  TEXT NOT NULL,
                    updated_at  TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS edges (
                    id         TEXT PRIMARY KEY,
                    source_id  TEXT NOT NULL,
                    target_id  TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
            """)
            await db.commit()

    # ── Nodes ────────────────────────────────────────────────────────────────

    async def get_all_nodes(self) -> List[Node]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT data FROM nodes ORDER BY created_at"
            ) as cursor:
                rows = await cursor.fetchall()
        return [Node.model_validate_json(row[0]) for row in rows]

    async def get_node(self, node_id: str) -> Optional[Node]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT data FROM nodes WHERE id = ?", (node_id,)
            ) as cursor:
                row = await cursor.fetchone()
        return Node.model_validate_json(row[0]) if row else None

    async def save_node(self, node: Node) -> None:
        now = datetime.utcnow().isoformat()
        async with aiosqlite.connect(self.db_path) as db:
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
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
            await db.commit()

    # ── Edges ────────────────────────────────────────────────────────────────

    async def get_all_edges(self) -> List[Edge]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT id, source_id, target_id FROM edges"
            ) as cursor:
                rows = await cursor.fetchall()
        return [Edge(id=r[0], source_id=r[1], target_id=r[2]) for r in rows]

    async def save_edge(self, edge: Edge) -> None:
        now = datetime.utcnow().isoformat()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute(
                """
                INSERT OR REPLACE INTO edges (id, source_id, target_id, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (edge.id, edge.source_id, edge.target_id, now),
            )
            await db.commit()

    async def delete_edge(self, edge_id: str) -> None:
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("DELETE FROM edges WHERE id = ?", (edge_id,))
            await db.commit()

    async def get_edges_for_node(self, node_id: str) -> List[Edge]:
        async with aiosqlite.connect(self.db_path) as db:
            async with db.execute(
                "SELECT id, source_id, target_id FROM edges WHERE source_id = ? OR target_id = ?",
                (node_id, node_id),
            ) as cursor:
                rows = await cursor.fetchall()
        return [Edge(id=r[0], source_id=r[1], target_id=r[2]) for r in rows]


metadata_store = MetadataStore()

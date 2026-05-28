from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime

from app.engine.bigquery_connector import bq_connector
from app.engine.cache_manager import cache_manager
from app.engine.duckdb_engine import duckdb_engine
from app.models.node import NodeStatus, NodeType
from app.storage.metadata_store import metadata_store

logger = logging.getLogger(__name__)


async def execute_node(node_id: str) -> None:
    node = await metadata_store.get_node(node_id)
    if node is None:
        logger.error(f"[executor] node {node_id} not found")
        return

    node.status = NodeStatus.RUNNING
    node.error_message = None
    await metadata_store.save_node(node)
    logger.info(f"[executor] starting node={node_id} type={node.type} name={node.name!r}")

    start = time.monotonic()

    try:
        loop = asyncio.get_running_loop()

        # ── Step 1: fetch data ───────────────────────────────────────────────
        if node.type == NodeType.SOURCE:
            if not node.sql.strip():
                raise ValueError("SQL query is empty")
            logger.info(f"[executor] {node_id} → sending query to BigQuery...")
            table = await loop.run_in_executor(
                None,
                lambda: bq_connector.execute_query(node.sql, node.bq_project),
            )
            logger.info(f"[executor] {node_id} → BigQuery returned {table.num_rows} rows, {table.num_columns} cols")
        else:
            if not node.sql.strip():
                raise ValueError("SQL query is empty")
            logger.info(f"[executor] {node_id} → executing DuckDB transform...")
            table = await duckdb_engine.execute(node.sql)
            logger.info(f"[executor] {node_id} → DuckDB returned {table.num_rows} rows")

        # ── Step 2: write parquet ────────────────────────────────────────────
        logger.info(f"[executor] {node_id} → writing parquet cache...")
        cache_path = await loop.run_in_executor(
            None,
            lambda: cache_manager.write(node_id, table),
        )
        logger.info(f"[executor] {node_id} → parquet written to {cache_path}")

        # ── Step 3: register DuckDB view ─────────────────────────────────────
        logger.info(f"[executor] {node_id} → registering DuckDB view...")
        await duckdb_engine.register_node(node_id, cache_path)

        # ── Step 4: introspect ───────────────────────────────────────────────
        schema    = await duckdb_engine.get_schema(node_id)
        row_count = await duckdb_engine.get_row_count(node_id)
        elapsed   = int((time.monotonic() - start) * 1000)

        node.status            = NodeStatus.CACHED
        node.cached_at         = datetime.utcnow()
        node.cache_path        = cache_path
        node.columns           = schema
        node.row_count         = row_count
        node.execution_time_ms = elapsed
        node.error_message     = None

        logger.info(f"[executor] {node_id} → CACHED ✓  rows={row_count}  elapsed={elapsed}ms")

    except Exception as exc:
        logger.exception(f"[executor] {node_id} → FAILED: {exc}")
        node.status        = NodeStatus.ERROR
        node.error_message = str(exc)

    await metadata_store.save_node(node)

    # Propagate staleness to downstream nodes
    if node.status == NodeStatus.CACHED:
        all_nodes = await metadata_store.get_all_nodes()
        for downstream in all_nodes:
            if node_id in downstream.upstream_ids and downstream.status == NodeStatus.CACHED:
                downstream.status = NodeStatus.STALE
                await metadata_store.save_node(downstream)
                logger.info(f"[executor] marked downstream {downstream.id} as STALE")

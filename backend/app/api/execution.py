from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from app.engine.executor import execute_node
from app.engine.duckdb_engine import duckdb_engine
from app.models.node import ExecutionStarted, Node, NodeStatus, ResultsResponse
from app.storage.metadata_store import metadata_store

router = APIRouter(tags=["execution"])


@router.post("/nodes/{node_id}/execute", response_model=ExecutionStarted)
async def start_execution(node_id: str, background_tasks: BackgroundTasks) -> ExecutionStarted:
    node = await metadata_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status == NodeStatus.RUNNING:
        raise HTTPException(status_code=409, detail="Node is already running")
    background_tasks.add_task(execute_node, node_id)
    return ExecutionStarted(node_id=node_id)


@router.get("/nodes/{node_id}/results", response_model=ResultsResponse)
async def get_results(
    node_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=200, ge=1, le=2000),
) -> ResultsResponse:
    node = await metadata_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status not in (NodeStatus.CACHED, NodeStatus.STALE):
        raise HTTPException(status_code=409, detail=f"Node not cached (status: {node.status})")
    offset  = (page - 1) * page_size
    preview = await duckdb_engine.get_preview(node_id, limit=page_size, offset=offset)
    return ResultsResponse(
        node_id=node_id, columns=preview["columns"], rows=preview["rows"],
        total_rows=node.row_count or 0, page=page, page_size=page_size,
    )


@router.post("/nodes/{node_id}/invalidate", response_model=Node)
async def invalidate_node(node_id: str) -> Node:
    from app.engine.cache_manager import cache_manager
    node = await metadata_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    cache_manager.delete(node_id)
    await duckdb_engine.unregister_node(node_id)
    node.status = NodeStatus.IDLE
    node.cached_at = None
    node.cache_path = None
    node.columns = None
    node.row_count = None
    node.execution_time_ms = None
    node.error_message = None
    await metadata_store.save_node(node)
    return node


@router.get("/nodes/{node_id}/profile")
async def get_profile(node_id: str):
    node = await metadata_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status not in (NodeStatus.CACHED, NodeStatus.STALE):
        raise HTTPException(status_code=409, detail=f"Node not cached (status: {node.status})")
    return {"node_id": node_id, "profile": await duckdb_engine.get_profile(node_id)}


@router.get("/nodes/{node_id}/search")
async def search_node(
    node_id: str,
    q: str = Query(..., min_length=1),
    column: str = Query(default=""),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=200, ge=1, le=1000),
):
    node = await metadata_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.status not in (NodeStatus.CACHED, NodeStatus.STALE):
        raise HTTPException(status_code=409, detail="Node not cached")
    offset = (page - 1) * page_size
    result = await duckdb_engine.search(node_id, q, column, page_size, offset)
    return {**result, "node_id": node_id, "page": page, "page_size": page_size}


@router.get("/nodes/{node_a}/diff/{node_b}")
async def diff_nodes(
    node_a: str, node_b: str,
    key_col: str   = Query(..., description="Comma-separated key column(s), e.g. 'id' or 'id,date'"),
    status: str    = Query(default="all"),
    page: int      = Query(default=1, ge=1),
    page_size: int = Query(default=100, ge=1, le=500),
):
    for nid in (node_a, node_b):
        n = await metadata_store.get_node(nid)
        if not n:
            raise HTTPException(status_code=404, detail=f"Node {nid} not found")
        if n.status not in (NodeStatus.CACHED, NodeStatus.STALE):
            raise HTTPException(status_code=409, detail=f"Node {nid} is not cached")
    # Parse composite key columns (comma-separated)
    key_cols = [k.strip() for k in key_col.split(",") if k.strip()]
    if not key_cols:
        raise HTTPException(status_code=400, detail="key_col must not be empty")
    offset = (page - 1) * page_size
    try:
        result = await duckdb_engine.diff(node_a, node_b, key_cols, status, page_size, offset)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {**result, "node_a": node_a, "node_b": node_b,
            "key_col": key_col, "page": page, "page_size": page_size}
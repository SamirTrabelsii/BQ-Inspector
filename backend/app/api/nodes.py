from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Response

from app.engine.cache_manager import cache_manager
from app.engine.duckdb_engine import duckdb_engine
from app.models.node import (
    CanvasState, CreateNodeRequest, Node,
    NodePosition, NodeStatus, UpdateNodeRequest,
)
from app.storage.metadata_store import metadata_store

router = APIRouter(tags=["nodes"])


@router.get("/canvas", response_model=CanvasState)
async def get_canvas() -> CanvasState:
    nodes = await metadata_store.get_all_nodes()
    edges = await metadata_store.get_all_edges()
    return CanvasState(nodes=nodes, edges=edges)


@router.get("/nodes", response_model=List[Node])
async def list_nodes() -> List[Node]:
    return await metadata_store.get_all_nodes()


@router.get("/nodes/{node_id}", response_model=Node)
async def get_node(node_id: str) -> Node:
    node = await metadata_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.post("/nodes", response_model=Node, status_code=201)
async def create_node(req: CreateNodeRequest) -> Node:
    node = Node(
        name=req.name,
        type=req.type,
        position=req.position or NodePosition(),
        bq_project=req.bq_project,
    )
    await metadata_store.save_node(node)
    return node


@router.put("/nodes/{node_id}", response_model=Node)
async def update_node(node_id: str, req: UpdateNodeRequest) -> Node:
    node = await metadata_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    if req.name is not None:
        node.name = req.name
    if req.sql is not None and req.sql != node.sql:
        node.sql = req.sql
        if node.status == NodeStatus.CACHED:
            node.status = NodeStatus.STALE
    if req.position is not None:
        node.position = req.position
    if req.bq_project is not None:
        node.bq_project = req.bq_project
    if req.upstream_ids is not None:
        node.upstream_ids = req.upstream_ids

    await metadata_store.save_node(node)
    return node


@router.delete("/nodes/{node_id}")
async def delete_node(node_id: str) -> Response:
    node = await metadata_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")

    await duckdb_engine.unregister_node(node_id)
    cache_manager.delete(node_id)
    await metadata_store.delete_node(node_id)

    edges = await metadata_store.get_edges_for_node(node_id)
    for edge in edges:
        await metadata_store.delete_edge(edge.id)
        other_id = edge.target_id if edge.source_id == node_id else edge.source_id
        other = await metadata_store.get_node(other_id)
        if other and node_id in other.upstream_ids:
            other.upstream_ids.remove(node_id)
            await metadata_store.save_node(other)

    return Response(status_code=204)

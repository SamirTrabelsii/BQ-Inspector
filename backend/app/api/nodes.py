from __future__ import annotations

from typing import List

import shutil
from pathlib import Path
from fastapi import APIRouter, HTTPException, Response, UploadFile, File

from app.config import settings
from app.engine.cache_manager import cache_manager
from app.engine.duckdb_engine import duckdb_engine
from app.models.node import (
    CanvasState, CreateNodeRequest, Node,
    NodePosition, NodeStatus, UpdateNodeRequest, NodeType
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

    needs_propagation = False

    if req.name is not None:
        node.name = req.name
    if req.sql is not None and req.sql != node.sql:
        node.sql = req.sql
        needs_propagation = True
        if node.status == NodeStatus.CACHED:
            node.status = NodeStatus.STALE
    if req.position is not None:
        node.position = req.position
    if req.bq_project is not None:
        node.bq_project = req.bq_project
    if req.upstream_ids is not None:
        node.upstream_ids = req.upstream_ids

    # Update CSV fields if provided
    if req.csv_path is not None and req.csv_path != node.csv_path:
        node.csv_path = req.csv_path
        needs_propagation = True
        if node.status == NodeStatus.CACHED:
            node.status = NodeStatus.STALE
    if req.csv_filename is not None:
        node.csv_filename = req.csv_filename
    if req.csv_delimiter is not None and req.csv_delimiter != node.csv_delimiter:
        node.csv_delimiter = req.csv_delimiter
        needs_propagation = True
        if node.status == NodeStatus.CACHED:
            node.status = NodeStatus.STALE
    if req.csv_has_header is not None and req.csv_has_header != node.csv_has_header:
        node.csv_has_header = req.csv_has_header
        needs_propagation = True
        if node.status == NodeStatus.CACHED:
            node.status = NodeStatus.STALE

    await metadata_store.save_node(node)
    
    if needs_propagation:
        await metadata_store.propagate_staleness(node_id)
        
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


@router.post("/nodes/{node_id}/upload", response_model=Node)
async def upload_csv(node_id: str, file: UploadFile = File(...)) -> Node:
    node = await metadata_store.get_node(node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    if node.type != NodeType.CSV:
        raise HTTPException(status_code=400, detail="Node is not a CSV node")

    # Define and ensure upload folder exists
    uploads_dir = Path(settings.data_dir) / "uploads"
    uploads_dir.mkdir(parents=True, exist_ok=True)

    file_path = uploads_dir / f"{node_id}_{file.filename}"
    # Save file
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    node.csv_path = str(file_path.absolute())
    node.csv_filename = file.filename
    # If cached or running, reset status to idle so they can run again
    if node.status in (NodeStatus.CACHED, NodeStatus.STALE, NodeStatus.ERROR):
        node.status = NodeStatus.IDLE
        node.error_message = None

    await metadata_store.save_node(node)
    await metadata_store.propagate_staleness(node_id)
    return node

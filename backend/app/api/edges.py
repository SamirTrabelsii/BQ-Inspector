from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, Response

from app.models.node import CreateEdgeRequest, Edge, NodeStatus
from app.storage.metadata_store import metadata_store

router = APIRouter(tags=["edges"])


@router.get("/edges", response_model=List[Edge])
async def list_edges() -> List[Edge]:
    return await metadata_store.get_all_edges()


@router.post("/edges", response_model=Edge, status_code=201)
async def create_edge(req: CreateEdgeRequest) -> Edge:
    source = await metadata_store.get_node(req.source_id)
    target = await metadata_store.get_node(req.target_id)

    if not source:
        raise HTTPException(status_code=404, detail=f"Source node {req.source_id} not found")
    if not target:
        raise HTTPException(status_code=404, detail=f"Target node {req.target_id} not found")

    # Prevent duplicate edges
    existing = await metadata_store.get_all_edges()
    for e in existing:
        if e.source_id == req.source_id and e.target_id == req.target_id:
            return e  # Already exists — idempotent

    edge = Edge(source_id=req.source_id, target_id=req.target_id)
    await metadata_store.save_edge(edge)

    # Keep target.upstream_ids in sync
    if req.source_id not in target.upstream_ids:
        target.upstream_ids.append(req.source_id)
        if target.status == NodeStatus.CACHED:
            target.status = NodeStatus.STALE
        await metadata_store.save_node(target)
        await metadata_store.propagate_staleness(target.id)

    return edge


@router.delete("/edges/{edge_id}")
async def delete_edge(edge_id: str) -> Response:
    edges = await metadata_store.get_all_edges()
    edge = next((e for e in edges if e.id == edge_id), None)
    if not edge:
        raise HTTPException(status_code=404, detail="Edge not found")

    await metadata_store.delete_edge(edge_id)

    # Remove source from target.upstream_ids
    target = await metadata_store.get_node(edge.target_id)
    if target and edge.source_id in target.upstream_ids:
        target.upstream_ids.remove(edge.source_id)
        if target.status == NodeStatus.CACHED:
            target.status = NodeStatus.STALE
        await metadata_store.save_node(target)
        await metadata_store.propagate_staleness(target.id)

    return Response(status_code=204)

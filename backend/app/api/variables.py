from __future__ import annotations

import re
from typing import List
from fastapi import APIRouter, HTTPException, Response

from app.models.node import Variable, NodeStatus
from app.storage.metadata_store import metadata_store

router = APIRouter(tags=["variables"])


async def invalidate_dependent_nodes(var_name: str) -> None:
    """Find all cached/stale nodes referencing `{{ var_name }}` and mark them as STALE."""
    nodes = await metadata_store.get_all_nodes()
    # Reference format: {{ var_name }}
    # Let's match case-insensitively or exactly. Since variable names are case-sensitive, exact match is robust.
    pattern = f"{{{{{var_name}}}}}"
    
    for node in nodes:
        # Check if query references the variable and is cached or already stale
        if pattern in node.sql:
            if node.status == NodeStatus.CACHED:
                node.status = NodeStatus.STALE
                await metadata_store.save_node(node)


@router.get("/variables", response_model=List[Variable])
async def list_variables() -> List[Variable]:
    return await metadata_store.get_all_variables()


@router.post("/variables", response_model=Variable, status_code=201)
async def create_variable(req: Variable) -> Variable:
    # Validate name (alphanumeric and underscores, starting with a letter)
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9_]*$", req.name):
        raise HTTPException(
            status_code=400,
            detail="Variable name must start with a letter and contain only alphanumeric characters and underscores."
        )
    
    # Check if already exists
    existing = await metadata_store.get_variable(req.name)
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Variable '{req.name}' already exists."
        )

    await metadata_store.save_variable(req)
    # Trigger smart invalidation (in case any node was pre-written with the variable name)
    await invalidate_dependent_nodes(req.name)
    return req


@router.put("/variables/{name}", response_model=Variable)
async def update_variable(name: str, req: Variable) -> Variable:
    existing = await metadata_store.get_variable(name)
    if not existing:
        raise HTTPException(status_code=404, detail="Variable not found")

    # If renaming, make sure new name is valid and does not collide
    if req.name != name:
        if not re.match(r"^[a-zA-Z][a-zA-Z0-9_]*$", req.name):
            raise HTTPException(
                status_code=400,
                detail="Variable name must start with a letter and contain only alphanumeric characters and underscores."
            )
        collision = await metadata_store.get_variable(req.name)
        if collision:
            raise HTTPException(
                status_code=409,
                detail=f"Variable '{req.name}' already exists."
            )
        # Delete old key
        await metadata_store.delete_variable(name)

    await metadata_store.save_variable(req)
    
    # Invalidate downstream nodes if either name or value changed
    if req.name != name or req.value != existing.value or req.type != existing.type:
        await invalidate_dependent_nodes(name)
        if req.name != name:
            await invalidate_dependent_nodes(req.name)

    return req


@router.delete("/variables/{name}")
async def delete_variable(name: str) -> Response:
    existing = await metadata_store.get_variable(name)
    if not existing:
        raise HTTPException(status_code=404, detail="Variable not found")

    await metadata_store.delete_variable(name)
    # Mark referencing nodes as stale since parameter is removed
    await invalidate_dependent_nodes(name)
    return Response(status_code=204)

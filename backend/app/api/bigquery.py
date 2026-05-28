from __future__ import annotations

import asyncio
from typing import Any, Dict, List

from fastapi import APIRouter, HTTPException

from app.engine.bigquery_connector import bq_connector

router = APIRouter(prefix="/bq", tags=["bigquery"])


@router.get("/status")
async def bq_status() -> Dict[str, Any]:
    available = await asyncio.to_thread(lambda: bq_connector.is_available)
    return {
        "available": available,
        "message": (
            "BigQuery connected via ADC"
            if available
            else "No credentials found. Run: gcloud auth application-default login"
        ),
    }


@router.get("/projects")
async def list_projects() -> List[Dict[str, Any]]:
    try:
        return await asyncio.to_thread(bq_connector.list_projects)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/projects/{project}/datasets")
async def list_datasets(project: str) -> List[Dict[str, str]]:
    try:
        return await asyncio.to_thread(bq_connector.list_datasets, project)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/projects/{project}/datasets/{dataset}/tables")
async def list_tables(project: str, dataset: str) -> List[Dict[str, str]]:
    try:
        return await asyncio.to_thread(bq_connector.list_tables, project, dataset)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))


@router.get("/projects/{project}/datasets/{dataset}/tables/{table}/schema")
async def get_table_schema(project: str, dataset: str, table: str) -> List[Dict[str, str]]:
    try:
        return await asyncio.to_thread(bq_connector.get_table_schema, project, dataset, table)
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc))

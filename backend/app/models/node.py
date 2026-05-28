from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_serializer


class NodeType(str, Enum):
    SOURCE = "source"       # Runs SQL against BigQuery
    TRANSFORM = "transform" # Runs SQL against cached DuckDB views
    CSV = "csv"             # Loads local CSV or uploaded CSV


class NodeStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    CACHED = "cached"
    ERROR = "error"
    STALE = "stale"  # SQL changed after caching


class ColumnInfo(BaseModel):
    name: str
    type: str  # normalized: string | integer | float | boolean | date | timestamp | json
    nullable: bool = True


class NodePosition(BaseModel):
    x: float = 100.0
    y: float = 100.0


class Node(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    name: str
    type: NodeType
    sql: str = ""
    status: NodeStatus = NodeStatus.IDLE

    # Future-proof: version_id enables lineage + time travel later
    version_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    cached_at: Optional[datetime] = None
    cache_path: Optional[str] = None
    columns: Optional[List[ColumnInfo]] = None
    row_count: Optional[int] = None
    execution_time_ms: Optional[int] = None
    error_message: Optional[str] = None
    upstream_ids: List[str] = Field(default_factory=list)
    position: NodePosition = Field(default_factory=NodePosition)

    # Source nodes only: BigQuery project
    bq_project: Optional[str] = None

    # CSV nodes only
    csv_path: Optional[str] = None
    csv_filename: Optional[str] = None
    csv_delimiter: str = ","
    csv_has_header: bool = True

    @field_serializer('cached_at')
    def serialize_dt(self, v: datetime | None) -> str | None:
        return v.isoformat() if v else None


class Variable(BaseModel):
    name: str
    value: str
    type: str  # string | number | boolean | date


class Edge(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    source_id: str  # upstream node
    target_id: str  # downstream node


class CanvasState(BaseModel):
    nodes: List[Node] = Field(default_factory=list)
    edges: List[Edge] = Field(default_factory=list)


# ── Request models ──────────────────────────────────────────────────────────

class CreateNodeRequest(BaseModel):
    name: str
    type: NodeType
    position: Optional[NodePosition] = None
    bq_project: Optional[str] = None


class UpdateNodeRequest(BaseModel):
    name: Optional[str] = None
    sql: Optional[str] = None
    position: Optional[NodePosition] = None
    bq_project: Optional[str] = None
    upstream_ids: Optional[List[str]] = None
    csv_path: Optional[str] = None
    csv_filename: Optional[str] = None
    csv_delimiter: Optional[str] = None
    csv_has_header: Optional[bool] = None


class CreateEdgeRequest(BaseModel):
    source_id: str
    target_id: str


# ── Response models ──────────────────────────────────────────────────────────

class ExecutionStarted(BaseModel):
    node_id: str
    message: str = "Execution started"


class ResultsResponse(BaseModel):
    node_id: str
    columns: List[Dict[str, str]]  # [{name, type}, ...]
    rows: List[List[Any]]
    total_rows: int
    page: int
    page_size: int

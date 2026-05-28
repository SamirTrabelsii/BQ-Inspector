export type NodeType = 'source' | 'transform' | 'csv'
export type NodeStatus = 'idle' | 'running' | 'cached' | 'error' | 'stale'

export interface ColumnInfo {
  name: string
  type: 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'timestamp' | 'json'
  nullable: boolean
}

export interface NodePosition {
  x: number
  y: number
}

export interface QFNode {
  id: string
  name: string
  type: NodeType
  sql: string
  status: NodeStatus
  version_id: string
  cached_at?: string
  cache_path?: string
  columns?: ColumnInfo[]
  row_count?: number
  execution_time_ms?: number
  error_message?: string
  upstream_ids: string[]
  position: NodePosition
  bq_project?: string
  csv_path?: string
  csv_filename?: string
  csv_delimiter?: string
  csv_has_header?: boolean
}

export interface QFEdge {
  id: string
  source_id: string
  target_id: string
}

export interface CanvasState {
  nodes: QFNode[]
  edges: QFEdge[]
}

export interface CreateNodeRequest {
  name: string
  type: NodeType
  position?: NodePosition
  bq_project?: string
}

export interface UpdateNodeRequest {
  name?: string
  sql?: string
  position?: NodePosition
  bq_project?: string
  upstream_ids?: string[]
  csv_path?: string
  csv_filename?: string
  csv_delimiter?: string
  csv_has_header?: boolean
}

export interface CreateEdgeRequest {
  source_id: string
  target_id: string
}

export interface ResultsResponse {
  node_id: string
  columns: Array<{ name: string; type: string }>
  rows: Array<Array<unknown>>
  total_rows: number
  page: number
  page_size: number
}

export interface BQStatus {
  available: boolean
  message: string
}

export interface RFNodeData {
  qfNode: QFNode
}

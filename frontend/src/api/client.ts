import axios from 'axios'
import type {
  CanvasState, CreateEdgeRequest, CreateNodeRequest,
  QFEdge, QFNode, ResultsResponse, UpdateNodeRequest, BQStatus,
} from '../types'

const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30_000,   // 30s default (was 10s — too aggressive)
})

// ── Retry interceptor ─────────────────────────────────────────────────────────
// Automatically retries on network errors or 5xx (up to 2 retries with backoff)

const MAX_RETRIES = 2
const RETRY_DELAY_MS = 1_000

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config
    if (!config) return Promise.reject(error)

    config.__retryCount = config.__retryCount || 0

    // Only retry on network errors or 5xx server errors, not on 4xx client errors
    const isRetryable =
      !error.response ||                      // network error / timeout
      (error.response.status >= 500 && error.response.status < 600)

    if (isRetryable && config.__retryCount < MAX_RETRIES) {
      config.__retryCount += 1
      console.warn(
        `[api] Retry ${config.__retryCount}/${MAX_RETRIES} for ${config.method?.toUpperCase()} ${config.url}`
      )
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * config.__retryCount))
      return http(config)
    }

    return Promise.reject(error)
  }
)

// ── API functions ─────────────────────────────────────────────────────────────

export const getCanvas = (): Promise<CanvasState> =>
  http.get<CanvasState>('/canvas').then((r) => r.data)

export const getNode = (id: string): Promise<QFNode> =>
  http.get<QFNode>(`/nodes/${id}`).then((r) => r.data)

export const createNode = (req: CreateNodeRequest): Promise<QFNode> =>
  http.post<QFNode>('/nodes', req).then((r) => r.data)

export const updateNode = (id: string, req: UpdateNodeRequest): Promise<QFNode> =>
  http.put<QFNode>(`/nodes/${id}`, req).then((r) => r.data)

export const deleteNode = (id: string): Promise<void> =>
  http.delete(`/nodes/${id}`).then(() => undefined)

export const createEdge = (req: CreateEdgeRequest): Promise<QFEdge> =>
  http.post<QFEdge>('/edges', req).then((r) => r.data)

export const deleteEdge = (id: string): Promise<void> =>
  http.delete(`/edges/${id}`).then(() => undefined)

export const executeNode = (id: string): Promise<void> =>
  http.post(`/nodes/${id}/execute`).then(() => undefined)

export const getResults = (id: string, page = 1, pageSize = 200): Promise<ResultsResponse> =>
  http.get<ResultsResponse>(`/nodes/${id}/results`, {
    params: { page, page_size: pageSize },
  }).then((r) => r.data)

export const invalidateNode = (id: string): Promise<QFNode> =>
  http.post<QFNode>(`/nodes/${id}/invalidate`).then((r) => r.data)

export const getBQStatus = (): Promise<BQStatus> =>
  http.get<BQStatus>('/bq/status').then((r) => r.data)

export const listBQProjects = (): Promise<Array<{ id: string; name: string }>> =>
  http.get('/bq/projects').then((r) => r.data)

export const listBQDatasets = (project: string): Promise<Array<{ id: string; project: string }>> =>
  http.get(`/bq/projects/${project}/datasets`).then((r) => r.data)

export const listBQTables = (project: string, dataset: string): Promise<Array<{ id: string; dataset: string; project: string }>> =>
  http.get(`/bq/projects/${project}/datasets/${dataset}/tables`).then((r) => r.data)

export interface ColumnProfile {
  column: string
  type: string
  total: number
  null_count: number
  null_pct: number
  unique_count: number
  min: string | null
  max: string | null
  trim_count: number | null   // null = not a string column
}

export interface ProfileResponse {
  node_id: string
  profile: ColumnProfile[]
}

export const getProfile = (id: string): Promise<ProfileResponse> =>
  http.get<ProfileResponse>(`/nodes/${id}/profile`).then((r) => r.data)

// ── Diff ──────────────────────────────────────────────────────────────────────

export interface DiffRow {
  status: 'added' | 'removed' | 'changed' | 'unchanged'
  values: Record<string, string | null>
  old_values: Record<string, string | null> | null
  changed_cols: string[]
}

export interface DiffSummary {
  added: number; removed: number; changed: number; unchanged: number; total: number
}

export interface DiffResponse {
  node_a: string; node_b: string; key_col: string
  key_cols: string[]
  summary: DiffSummary
  columns: string[]
  rows: DiffRow[]
  total_filtered: number
  page: number; page_size: number
}

export const getDiff = (
  nodeA: string, nodeB: string,
  keyCols: string[], status = 'all',
  page = 1, pageSize = 100
): Promise<DiffResponse> =>
  http.get<DiffResponse>(`/nodes/${nodeA}/diff/${nodeB}`, {
    params: { key_col: keyCols.join(','), status, page, page_size: pageSize },
  }).then((r) => r.data)

export interface SearchResponse {
  node_id: string
  columns: Array<{ name: string; type: string }>
  rows: Array<Array<unknown>>
  total_matches: number
  page: number
  page_size: number
}

export const searchNode = (
  id: string,
  q: string,
  column = '',
  page = 1,
  pageSize = 200
): Promise<SearchResponse> =>
  http.get<SearchResponse>(`/nodes/${id}/search`, {
    params: { q, column, page, page_size: pageSize },
  }).then((r) => r.data)
import { create } from 'zustand'
import type { QFNode, QFEdge, UpdateNodeRequest, ResultsResponse, NodeType, NodePosition } from '../types'
import * as api from '../api/client'

interface NodeStore {
  nodes: Record<string, QFNode>
  edges: QFEdge[]
  results: Record<string, ResultsResponse>
  loading: boolean
  loadCanvas: () => Promise<void>
  createNode: (name: string, type: NodeType, position?: NodePosition) => Promise<QFNode>
  updateNode: (id: string, req: UpdateNodeRequest) => Promise<void>
  deleteNode: (id: string) => Promise<void>
  executeNode: (id: string) => Promise<void>
  invalidateNode: (id: string) => Promise<void>
  /** Returns the backend edge id so Canvas can use it as RF edge id */
  addEdge: (sourceId: string, targetId: string) => Promise<string>
  removeEdge: (edgeId: string) => Promise<void>
  loadResults: (id: string) => Promise<void>
  patchNode: (node: QFNode) => void
}

const MAX_POLL = 300
const POLL_MS  = 2000
const polls: Record<string, ReturnType<typeof setInterval>> = {}

function startPolling(nodeId: string, patchNode: (n: QFNode) => void) {
  if (polls[nodeId]) return
  let attempts = 0
  polls[nodeId] = setInterval(async () => {
    attempts++
    if (attempts > MAX_POLL) {
      clearInterval(polls[nodeId]); delete polls[nodeId]
      return
    }
    try {
      const node = await api.getNode(nodeId)
      patchNode(node)
      if (node.status !== 'running') { clearInterval(polls[nodeId]); delete polls[nodeId] }
    } catch { clearInterval(polls[nodeId]); delete polls[nodeId] }
  }, POLL_MS)
}

export const useNodeStore = create<NodeStore>((set, get) => ({
  nodes: {}, edges: [], results: {}, loading: false,

  loadCanvas: async () => {
    set({ loading: true })
    try {
      const canvas = await api.getCanvas()
      const nodes: Record<string, QFNode> = {}
      canvas.nodes.forEach((n) => { nodes[n.id] = n })
      set({ nodes, edges: canvas.edges })
    } finally { set({ loading: false }) }
  },

  createNode: async (name, type, position) => {
    const node = await api.createNode({ name, type, position: position ?? { x: 200 + Math.random() * 300, y: 120 + Math.random() * 200 } })
    set((s) => ({ nodes: { ...s.nodes, [node.id]: node } }))
    return node
  },

  updateNode: async (id, req) => {
    const node = await api.updateNode(id, req)
    set((s) => ({ nodes: { ...s.nodes, [id]: node } }))
  },

  deleteNode: async (id) => {
    await api.deleteNode(id)
    set((s) => {
      const nodes = { ...s.nodes }; delete nodes[id]
      return { nodes, edges: s.edges.filter((e) => e.source_id !== id && e.target_id !== id) }
    })
  },

  executeNode: async (id) => {
    await api.executeNode(id)
    set((s) => ({ nodes: { ...s.nodes, [id]: { ...s.nodes[id], status: 'running' } } }))
    startPolling(id, get().patchNode)
  },

  invalidateNode: async (id) => {
    const node = await api.invalidateNode(id)
    set((s) => ({ nodes: { ...s.nodes, [id]: node } }))
  },

  // Returns backend edge id — Canvas uses this as RF edge id so they always match
  addEdge: async (sourceId, targetId) => {
    const edge = await api.createEdge({ source_id: sourceId, target_id: targetId })
    set((s) => ({ edges: [...s.edges.filter(e => e.id !== edge.id), edge] }))
    const target = await api.getNode(targetId)
    set((s) => ({ nodes: { ...s.nodes, [targetId]: target } }))
    return edge.id  // ← backend UUID, used as RF edge id
  },

  // edgeId is now always the backend UUID
  removeEdge: async (edgeId) => {
    await api.deleteEdge(edgeId)
    set((s) => ({ edges: s.edges.filter((e) => e.id !== edgeId) }))
  },

  loadResults: async (id) => {
    const results = await api.getResults(id)
    set((s) => ({ results: { ...s.results, [id]: results } }))
  },

  patchNode: (node) => set((s) => ({ nodes: { ...s.nodes, [node.id]: node } })),
}))

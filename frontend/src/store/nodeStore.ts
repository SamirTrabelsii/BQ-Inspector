import { create } from 'zustand'
import type { QFNode, QFEdge, UpdateNodeRequest, ResultsResponse, NodeType, NodePosition, QFVariable } from '../types'
import * as api from '../api/client'

interface NodeStore {
  nodes: Record<string, QFNode>
  edges: QFEdge[]
  results: Record<string, ResultsResponse>
  loading: boolean
  error: string | null
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
  clearError: () => void
  uploadCSV: (id: string, file: File) => Promise<void>
  variables: QFVariable[]
  loadVariables: () => Promise<void>
  saveVariable: (varData: QFVariable, originalName?: string) => Promise<void>
  deleteVariable: (name: string) => Promise<void>
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
  nodes: {}, edges: [], results: {}, variables: [], loading: false, error: null,

  clearError: () => set({ error: null }),

  loadCanvas: async () => {
    set({ loading: true, error: null })
    try {
      const canvas = await api.getCanvas()
      const nodes: Record<string, QFNode> = {}
      canvas.nodes.forEach((n) => { nodes[n.id] = n })
      
      let vars: QFVariable[] = []
      try {
        vars = await api.listVariables()
      } catch (err) {
        console.error('[store] failed to load variables:', err)
      }

      set({ nodes, edges: canvas.edges, variables: vars })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load canvas'
      console.error('[store] loadCanvas failed:', msg)
      set({ error: msg })
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
  uploadCSV: async (id, file) => {
    const node = await api.uploadCSV(id, file)
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
    let target = await api.getNode(targetId)
    const source = get().nodes[sourceId]

    // Auto-scaffold SQL if it's a transform node
    if (target.type === 'transform' && source) {
      const currentSql = target.sql?.trim() || ''
      if (currentSql === '') {
        const newSql = `SELECT * FROM {{${source.name}}}`
        target = await api.updateNode(targetId, { sql: newSql })
      } else {
        const newSql = target.sql + `\n-- JOIN {{${source.name}}} ON ...`
        target = await api.updateNode(targetId, { sql: newSql })
      }
    }

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

  loadVariables: async () => {
    try {
      const vars = await api.listVariables()
      set({ variables: vars })
    } catch (e: unknown) {
      console.error('[store] loadVariables failed:', e)
    }
  },

  saveVariable: async (varData, originalName) => {
    try {
      const keyName = originalName || varData.name
      const existing = get().variables.find((v) => v.name === keyName)
      let updatedVar: QFVariable
      if (existing) {
        updatedVar = await api.updateVariable(keyName, varData)
      } else {
        updatedVar = await api.createVariable(varData)
      }
      set((s) => {
        const filtered = s.variables.filter((v) => v.name !== keyName)
        return { variables: [...filtered, updatedVar] }
      })
      await get().loadCanvas()
    } catch (e: unknown) {
      console.error('[store] saveVariable failed:', e)
      throw e
    }
  },

  deleteVariable: async (name) => {
    try {
      await api.deleteVariable(name)
      set((s) => ({ variables: s.variables.filter((v) => v.name !== name) }))
      await get().loadCanvas()
    } catch (e: unknown) {
      console.error('[store] deleteVariable failed:', e)
      throw e
    }
  },
}))

import { useCallback, useEffect } from 'react'
import {
  ReactFlow, Background, Controls, MiniMap, addEdge,
  useNodesState, useEdgesState, Panel, BackgroundVariant,
  type Connection, type Edge, type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { SourceNode } from '../Nodes/SourceNode'
import { TransformNode } from '../Nodes/TransformNode'
import { useNodeStore } from '@/store/nodeStore'
import { useCanvasStore } from '@/store/canvasStore'
import type { QFNode, QFEdge } from '@/types'

const NODE_TYPES = { sourceNode: SourceNode, transformNode: TransformNode }

function toRFNode(qfNode: QFNode): Node {
  return {
    id: qfNode.id,
    type: qfNode.type === 'source' ? 'sourceNode' : 'transformNode',
    position: { x: qfNode.position.x, y: qfNode.position.y },
    data: {},
  }
}

function toRFEdge(qfEdge: QFEdge): Edge {
  return {
    id: qfEdge.id,               // ← always the backend UUID now
    source: qfEdge.source_id,
    target: qfEdge.target_id,
    type: 'smoothstep',
    style: { stroke: '#475569', strokeWidth: 1.5 },
  }
}

export function Canvas() {
  const { nodes: qfNodes, edges: qfEdges, updateNode, addEdge: addQFEdge, removeEdge } = useNodeStore()
  const { selectNode, selectedNodeId } = useCanvasStore()

  const [rfNodes, setRFNodes, onNodesChange] = useNodesState([])
  const [rfEdges, setRFEdges, onEdgesChange] = useEdgesState([])

  // Sync store → RF nodes
  useEffect(() => {
    const incoming = Object.values(qfNodes).map(toRFNode)
    setRFNodes((prev) => {
      const posMap = new Map(prev.map((n) => [n.id, n.position]))
      return incoming.map((n) => ({
        ...n,
        position: posMap.get(n.id) ?? n.position,
        selected: n.id === selectedNodeId,
      }))
    })
  }, [qfNodes, selectedNodeId])

  // Sync store → RF edges
  useEffect(() => {
    setRFEdges(qfEdges.map(toRFEdge))
  }, [qfEdges])

  const onNodeDragStop = useCallback(
    (_: React.MouseEvent, node: Node) => {
      updateNode(node.id, { position: { x: node.position.x, y: node.position.y } })
    }, [updateNode])

  // onConnect: call store (async), get back backend id, add to RF with that id
  const onConnect = useCallback(async (params: Connection) => {
    if (!params.source || !params.target) return
    try {
      const backendEdgeId = await addQFEdge(params.source, params.target)
      setRFEdges((eds) => addEdge(
        { ...params, id: backendEdgeId, type: 'smoothstep', style: { stroke: '#475569', strokeWidth: 1.5 } },
        eds.filter(e => e.id !== backendEdgeId)  // avoid duplicate
      ))
    } catch (err) {
      console.error('[canvas] edge creation failed:', err)
    }
  }, [addQFEdge])

  // Delete edge: id is now always the backend UUID
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    if (confirm('Remove this connection?')) removeEdge(edge.id)
  }, [removeEdge])

  const onNodeClick  = useCallback((_: React.MouseEvent, node: Node) => { selectNode(node.id) }, [selectNode])
  const onPaneClick  = useCallback(() => { selectNode(null) }, [selectNode])

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={rfNodes} edges={rfEdges} nodeTypes={NODE_TYPES}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect} onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} onPaneClick={onPaneClick}
        fitView fitViewOptions={{ padding: 0.2 }} minZoom={0.2} maxZoom={2}
        proOptions={{ hideAttribution: true }}
        deleteKeyCode={null}  // ← disable RF's own delete (we handle it manually)
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e293b" />
        <Controls style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
        <MiniMap style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
          nodeColor={(n) => n.type === 'sourceNode' ? '#1d4ed8' : '#7c3aed'}
          maskColor="rgba(0,0,0,0.6)" />
        {Object.keys(qfNodes).length === 0 && (
          <Panel position="top-center">
            <div className="mt-32 flex flex-col items-center gap-3 pointer-events-none">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                <span className="text-3xl">⬡</span>
              </div>
              <p className="text-slate-400 text-sm">No nodes yet — use the toolbar to add one</p>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  )
}

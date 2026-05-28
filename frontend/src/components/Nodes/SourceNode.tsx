import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import { useNodeStore } from '@/store/nodeStore'

export const SourceNode = memo(function SourceNode({ id, selected }: NodeProps) {
  const node = useNodeStore((s) => s.nodes[id])
  if (!node) return null
  return <BaseNode qfNode={node} selected={!!selected} />
})

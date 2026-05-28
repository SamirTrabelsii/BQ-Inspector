import { memo } from 'react'
import type { NodeProps } from '@xyflow/react'
import { BaseNode } from './BaseNode'
import { useNodeStore } from '@/store/nodeStore'

export const TransformNode = memo(function TransformNode({ id, selected }: NodeProps) {
  const node = useNodeStore((s) => s.nodes[id])
  if (!node) return null
  return <BaseNode qfNode={node} selected={!!selected} />
})

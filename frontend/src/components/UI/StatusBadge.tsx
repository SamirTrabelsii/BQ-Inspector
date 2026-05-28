import type { NodeStatus } from '@/types'

const CONFIG: Record<NodeStatus, { dot: string; label: string; text: string }> = {
  idle:    { dot: 'bg-slate-500',              label: 'Idle',    text: 'text-slate-400' },
  running: { dot: 'bg-amber-400 animate-pulse', label: 'Running', text: 'text-amber-400' },
  cached:  { dot: 'bg-emerald-400',             label: 'Cached',  text: 'text-emerald-400' },
  error:   { dot: 'bg-red-500',                 label: 'Error',   text: 'text-red-400' },
  stale:   { dot: 'bg-orange-400',              label: 'Stale',   text: 'text-orange-400' },
}

export function StatusBadge({ status }: { status: NodeStatus }) {
  const c = CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

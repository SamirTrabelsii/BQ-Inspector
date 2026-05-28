import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import {
  Database, Wand2, Play, RefreshCw, AlertCircle,
  Clock, Rows, Loader2, ChevronRight, FileSpreadsheet,
} from 'lucide-react'
import type { QFNode } from '@/types'
import { StatusBadge } from '@/components/UI/StatusBadge'
import { ColumnChip } from '@/components/UI/ColumnChip'
import { useNodeStore } from '@/store/nodeStore'
import { useCanvasStore } from '@/store/canvasStore'

const TYPE_CONFIG = {
  source: {
    icon: Database,
    label: 'BIGQUERY',
    border: 'border-blue-500/40',
    header: 'from-blue-950/30 to-transparent',
    accent: 'text-blue-400',
    badge: 'bg-blue-900/50 text-blue-300 border border-blue-700/40',
    handleColor: '#3b82f6',
  },
  csv: {
    icon: FileSpreadsheet,
    label: 'CSV',
    border: 'border-emerald-500/40',
    header: 'from-emerald-950/30 to-transparent',
    accent: 'text-emerald-400',
    badge: 'bg-emerald-900/50 text-emerald-300 border border-emerald-700/40',
    handleColor: '#10b981',
  },
  transform: {
    icon: Wand2,
    label: 'TRANSFORM',
    border: 'border-violet-500/40',
    header: 'from-violet-950/30 to-transparent',
    accent: 'text-violet-400',
    badge: 'bg-violet-900/50 text-violet-300 border border-violet-700/40',
    handleColor: '#8b5cf6',
  },
}

function formatMs(ms?: number): string {
  if (!ms) return ''
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

function formatRows(n?: number): string {
  if (!n) return '0'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toLocaleString()
}

interface BaseNodeProps {
  qfNode: QFNode
  selected: boolean
}

export const BaseNode = memo(function BaseNode({ qfNode, selected }: BaseNodeProps) {
  const cfg = TYPE_CONFIG[qfNode.type]
  const Icon = cfg.icon
  const { executeNode } = useNodeStore()
  const { selectNode, openResults } = useCanvasStore()

  const visibleColumns = qfNode.columns?.slice(0, 6) ?? []
  const extraCols = (qfNode.columns?.length ?? 0) - visibleColumns.length

  const handleRun = (e: React.MouseEvent) => {
    e.stopPropagation()
    executeNode(qfNode.id)
    openResults()
  }

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    selectNode(qfNode.id)
  }

  return (
    <div
      onClick={handleOpen}
      className={`
        relative w-72 rounded-xl border bg-slate-900 shadow-2xl cursor-pointer
        transition-all duration-150 select-none
        ${cfg.border}
        ${selected
          ? 'ring-2 ring-white/20 shadow-[0_0_30px_rgba(255,255,255,0.06)]'
          : 'hover:border-opacity-70'}
      `}
    >
      <div className={`absolute inset-x-0 top-0 h-20 rounded-t-xl bg-gradient-to-b ${cfg.header} pointer-events-none`} />

      {/* Header */}
      <div className="relative flex items-start justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-[10px] font-bold tracking-widest ${cfg.badge} px-1.5 py-0.5 rounded`}>
            {cfg.label}
          </span>
          <Icon size={12} className={`${cfg.accent} shrink-0`} />
        </div>
        <StatusBadge status={qfNode.status} />
      </div>

      {/* Name */}
      <div className="px-3 pb-2">
        <h3 className="text-sm font-semibold text-white truncate">{qfNode.name}</h3>
        {qfNode.bq_project && (
          <p className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">{qfNode.bq_project}</p>
        )}
        {qfNode.csv_filename && (
          <p className="text-[10px] text-emerald-500 truncate mt-0.5 font-mono">File: {qfNode.csv_filename}</p>
        )}
        {!qfNode.csv_filename && qfNode.csv_path && (
          <p className="text-[10px] text-slate-500 truncate mt-0.5 font-mono">Path: {qfNode.csv_path}</p>
        )}
      </div>

      {/* SQL preview */}
      {qfNode.sql && (
        <div className="mx-3 mb-2 px-2 py-1.5 rounded bg-slate-800/60 border border-slate-700/40">
          <p className="text-[10px] text-slate-400 font-mono truncate">{qfNode.sql.trim().split('\n')[0]}</p>
        </div>
      )}

      {/* Stats */}
      {(qfNode.status === 'cached' || qfNode.status === 'stale') && (
        <div className="flex items-center gap-3 px-3 pb-2">
          {qfNode.row_count !== undefined && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Rows size={10} className="text-slate-500" />
              {formatRows(qfNode.row_count)}
            </span>
          )}
          {qfNode.execution_time_ms !== undefined && (
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <Clock size={10} className="text-slate-500" />
              {formatMs(qfNode.execution_time_ms)}
            </span>
          )}
          {qfNode.status === 'stale' && (
            <span className="text-[10px] text-orange-400 ml-auto">SQL changed</span>
          )}
        </div>
      )}

      {/* Running */}
      {qfNode.status === 'running' && (
        <div className="flex items-center gap-2 px-3 pb-2">
          <Loader2 size={12} className="text-amber-400 animate-spin" />
          <span className="text-[11px] text-amber-400">Executing…</span>
        </div>
      )}

      {/* Error */}
      {qfNode.status === 'error' && qfNode.error_message && (
        <div className="mx-3 mb-2 flex items-start gap-1.5 px-2 py-1.5 rounded bg-red-950/30 border border-red-800/40">
          <AlertCircle size={11} className="text-red-400 mt-0.5 shrink-0" />
          <p className="text-[10px] text-red-300 font-mono leading-relaxed line-clamp-2">{qfNode.error_message}</p>
        </div>
      )}

      {/* Column chips */}
      {visibleColumns.length > 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {visibleColumns.map((col) => <ColumnChip key={col.name} column={col} />)}
          {extraCols > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded border border-slate-700/50 bg-slate-800/50 text-[10px] text-slate-500">
              +{extraCols}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-800/60">
        <button
          onClick={handleRun}
          disabled={qfNode.status === 'running'}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all
            ${qfNode.status === 'running'
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : qfNode.status === 'stale'
                ? 'bg-orange-600 hover:bg-orange-500 text-white'
                : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`}
        >
          {qfNode.status === 'running'
            ? <Loader2 size={11} className="animate-spin" />
            : qfNode.status === 'stale' ? <RefreshCw size={11} /> : <Play size={11} />}
          {qfNode.status === 'stale' ? 'Re-run' : 'Run'}
        </button>
        <button
          onClick={handleOpen}
          className="flex items-center gap-1 ml-auto px-2 py-1 rounded text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all"
        >
          Edit <ChevronRight size={11} />
        </button>
      </div>

      {/* Handles */}
      {qfNode.type === 'transform' && (
        <Handle type="target" position={Position.Left}
          style={{ background: cfg.handleColor, border: '2px solid #0f172a', width: 10, height: 10 }} />
      )}
      <Handle type="source" position={Position.Right}
        style={{ background: cfg.handleColor, border: '2px solid #0f172a', width: 10, height: 10 }} />
    </div>
  )
})

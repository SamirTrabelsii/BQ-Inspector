import type { ColumnInfo } from '@/types'

const TYPE_COLORS: Record<string, string> = {
  string:    'bg-blue-900/60 text-blue-300 border-blue-700/50',
  integer:   'bg-green-900/60 text-green-300 border-green-700/50',
  float:     'bg-teal-900/60 text-teal-300 border-teal-700/50',
  boolean:   'bg-orange-900/60 text-orange-300 border-orange-700/50',
  date:      'bg-purple-900/60 text-purple-300 border-purple-700/50',
  timestamp: 'bg-violet-900/60 text-violet-300 border-violet-700/50',
  json:      'bg-yellow-900/60 text-yellow-300 border-yellow-700/50',
}

const TYPE_ABBR: Record<string, string> = {
  string: 'str', integer: 'int', float: 'flt',
  boolean: 'bool', date: 'date', timestamp: 'ts', json: 'json',
}

interface ColumnChipProps {
  column: ColumnInfo
  onClick?: () => void
}

export function ColumnChip({ column, onClick }: ColumnChipProps) {
  const colors = TYPE_COLORS[column.type] ?? 'bg-slate-800 text-slate-300 border-slate-600'
  const abbr   = TYPE_ABBR[column.type] ?? column.type

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-mono
        ${colors} hover:brightness-125 transition-all cursor-default`}
      title={`${column.name}: ${column.type}`}
    >
      <span className="opacity-60 text-[10px]">{abbr}</span>
      <span className="truncate max-w-[80px]">{column.name}</span>
    </button>
  )
}

import { useRef, useState } from 'react'
import type { ResultsResponse } from '@/types'

interface DataTableProps { results: ResultsResponse }

const TYPE_ALIGN: Record<string, string> = {
  integer: 'text-right', float: 'text-right', boolean: 'text-center',
}

export function DataTable({ results }: DataTableProps) {
  const { columns, rows, total_rows } = results
  const tbodyRef = useRef<HTMLDivElement>(null)
  const [hoveredRow, setHoveredRow] = useState<number | null>(null)

  if (!columns.length) {
    return (
      <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
        No data
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-slate-700/50 shrink-0">
        <span className="text-xs text-slate-400">
          <span className="text-slate-200 font-medium">{total_rows.toLocaleString()}</span>{' '}
          rows · showing {rows.length.toLocaleString()}
        </span>
        <span className="text-xs text-slate-500">{columns.length} columns</span>
      </div>
      <div ref={tbodyRef} className="overflow-auto flex-1">
        <table className="w-full text-xs border-collapse" style={{ minWidth: columns.length * 140 }}>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-10 px-2 py-2 bg-slate-800/95 border-b border-slate-700 text-slate-500 font-normal text-right">#</th>
              {columns.map((col) => (
                <th key={col.name}
                  className={`px-3 py-2 bg-slate-800/95 border-b border-slate-700 text-left font-medium text-slate-300 whitespace-nowrap ${TYPE_ALIGN[col.type] ?? ''}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 font-normal uppercase">{col.type.slice(0, 3)}</span>
                    {col.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}
                onMouseEnter={() => setHoveredRow(ri)}
                onMouseLeave={() => setHoveredRow(null)}
                className={`border-b border-slate-800/60 transition-colors
                  ${hoveredRow === ri ? 'bg-slate-700/30' : ri % 2 === 0 ? 'bg-transparent' : 'bg-slate-800/20'}`}>
                <td className="px-2 py-1.5 text-slate-600 text-right select-none font-mono">{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className={`px-3 py-1.5 text-slate-300 font-mono whitespace-nowrap ${TYPE_ALIGN[columns[ci]?.type] ?? ''}`}>
                    {cell === null || cell === undefined
                      ? <span className="text-slate-600 italic">null</span>
                      : typeof cell === 'boolean'
                        ? <span className={cell ? 'text-emerald-400' : 'text-red-400'}>{String(cell)}</span>
                        : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

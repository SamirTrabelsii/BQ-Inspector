import { useEffect, useState } from 'react'
import { Loader2, ChevronLeft, ChevronRight, GitCompare, ChevronDown } from 'lucide-react'
import { getDiff } from '@/api/client'
import { useNodeStore } from '@/store/nodeStore'
import type { DiffResponse, DiffRow, DiffSummary } from '@/api/client'

const PAGE_SIZE = 100

// ── Summary tabs ──────────────────────────────────────────────────────────────
function SummaryTabs({
    summary, active, onChange,
}: { summary: DiffSummary; active: string; onChange: (s: string) => void }) {
    const tabs = [
        { key: 'added', label: 'Added', count: summary.added, cls: 'border-emerald-500 text-emerald-300', dim: 'text-emerald-600 border-emerald-900 hover:border-emerald-600' },
        { key: 'removed', label: 'Removed', count: summary.removed, cls: 'border-red-500 text-red-300', dim: 'text-red-700 border-red-900 hover:border-red-700' },
        { key: 'changed', label: 'Changed', count: summary.changed, cls: 'border-amber-500 text-amber-300', dim: 'text-amber-700 border-amber-900 hover:border-amber-700' },
        { key: 'unchanged', label: 'Unchanged', count: summary.unchanged, cls: 'border-slate-500 text-slate-400', dim: 'text-slate-600 border-slate-800 hover:border-slate-600' },
    ]
    return (
        <div className="flex gap-2 px-3 py-2 border-b border-slate-700/50 bg-slate-800/20 shrink-0">
            {tabs.map((t) => (
                <button key={t.key} onClick={() => onChange(t.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
            ${active === t.key ? t.cls + ' bg-slate-800' : t.dim}`}>
                    <span>{t.label}</span>
                    <span className="tabular-nums font-mono">{t.count.toLocaleString()}</span>
                </button>
            ))}
        </div>
    )
}

// ── Simple table (Added / Removed / Unchanged) ────────────────────────────────
const STATUS_ROW: Record<string, string> = {
    added: 'border-l-2 border-l-emerald-500 bg-emerald-950/20',
    removed: 'border-l-2 border-l-red-500 bg-red-950/20',
    unchanged: '',
}
const STATUS_ICON: Record<string, string> = {
    added: '+', removed: '−', unchanged: '=',
}
const STATUS_ICON_COLOR: Record<string, string> = {
    added: 'text-emerald-400', removed: 'text-red-400', unchanged: 'text-slate-600',
}

function SimpleTable({
    columns, rows, status,
}: { columns: string[]; rows: DiffRow[]; status: string }) {
    if (!rows.length) return (
        <div className="flex items-center justify-center h-32 text-slate-500 text-sm">No rows</div>
    )
    return (
        <div className="overflow-auto h-full">
            <table className="w-full text-xs border-collapse" style={{ minWidth: columns.length * 140 }}>
                <thead className="sticky top-0 z-10">
                    <tr>
                        <th className="w-6 px-2 py-2 bg-slate-800/95 border-b border-slate-700" />
                        <th className="w-10 px-2 py-2 bg-slate-800/95 border-b border-slate-700 text-slate-500 font-normal text-right">#</th>
                        {columns.map((col) => (
                            <th key={col} className="px-3 py-2 bg-slate-800/95 border-b border-slate-700 text-left font-medium text-slate-300 whitespace-nowrap">
                                {col}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, ri) => (
                        <tr key={ri} className={`border-b border-slate-800/50 hover:brightness-110 transition-all ${STATUS_ROW[status] ?? ''}`}>
                            <td className={`px-2 py-2 text-center font-bold text-sm ${STATUS_ICON_COLOR[status]}`}>
                                {STATUS_ICON[status]}
                            </td>
                            <td className="px-2 py-2 text-slate-600 text-right font-mono">{ri + 1}</td>
                            {columns.map((col) => {
                                const val = row.values[col]
                                return (
                                    <td key={col} className="px-3 py-2 font-mono whitespace-nowrap text-slate-300">
                                        {val === null ? <span className="text-slate-600 italic">null</span> : val}
                                    </td>
                                )
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ── Changed table — field-level before/after ──────────────────────────────────
function ChangedTable({
    columns, rows, keyCol,
}: { columns: string[]; rows: DiffRow[]; keyCol: string }) {
    const changed = rows.filter((r) => r.status === 'changed' && r.changed_cols.length > 0)

    if (!changed.length) return (
        <div className="flex items-center justify-center h-32 text-slate-500 text-sm">No changed rows</div>
    )

    return (
        <div className="overflow-auto h-full">
            <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 z-10">
                    <tr>
                        <th className="px-3 py-2 bg-slate-800/95 border-b border-slate-700 text-left font-medium text-slate-300 w-40 whitespace-nowrap">
                            {keyCol} (key)
                        </th>
                        <th className="px-3 py-2 bg-slate-800/95 border-b border-slate-700 text-left font-medium text-slate-300 w-40">
                            Field changed
                        </th>
                        <th className="px-3 py-2 bg-slate-800/95 border-b border-slate-700 text-left font-medium text-red-400/80 w-1/3">
                            ← Before (Node B)
                        </th>
                        <th className="px-3 py-2 bg-slate-800/95 border-b border-slate-700 text-left font-medium text-emerald-400/80 w-1/3">
                            After (Node A) →
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {changed.map((row, ri) => {
                        const keyVal = row.values[keyCol] ?? row.old_values?.[keyCol] ?? '—'
                        return row.changed_cols.map((col, ci) => {
                            const oldVal = row.old_values?.[col]
                            const newVal = row.values[col]
                            const isFirst = ci === 0
                            return (
                                <tr key={`${ri}-${ci}`}
                                    className={`hover:bg-slate-800/30 transition-colors
                    ${isFirst ? 'border-t-2 border-slate-700' : 'border-t border-slate-800/40'}`}>
                                    {/* Key cell — spans all changed fields for this record */}
                                    {isFirst && (
                                        <td rowSpan={row.changed_cols.length}
                                            className="px-3 py-2 font-mono text-amber-300 font-semibold align-top border-l-2 border-l-amber-500 bg-amber-950/20 whitespace-nowrap">
                                            {keyVal}
                                        </td>
                                    )}
                                    {/* Field name */}
                                    <td className="px-3 py-2 font-mono text-slate-400 whitespace-nowrap">
                                        {col}
                                    </td>
                                    {/* Before */}
                                    <td className="px-3 py-2 font-mono whitespace-nowrap bg-red-950/10">
                                        {oldVal === null
                                            ? <span className="text-slate-600 italic">null</span>
                                            : <span className="text-red-300">{oldVal}</span>}
                                    </td>
                                    {/* After */}
                                    <td className="px-3 py-2 font-mono whitespace-nowrap bg-emerald-950/10">
                                        {newVal === null
                                            ? <span className="text-slate-600 italic">null</span>
                                            : <span className="text-emerald-300">{newVal}</span>}
                                    </td>
                                </tr>
                            )
                        })
                    })}
                </tbody>
            </table>
        </div>
    )
}

// ── Main component ────────────────────────────────────────────────────────────
export function DiffView({ nodeAId }: { nodeAId: string }) {
    const { nodes } = useNodeStore()
    const nodeA = nodes[nodeAId]

    const otherCached = Object.values(nodes).filter(
        (n) => n.id !== nodeAId && (n.status === 'cached' || n.status === 'stale')
    )

    const [nodeBId, setNodeBId] = useState('')
    const [keyCol, setKeyCol] = useState('')
    const [filter, setFilter] = useState('changed')   // default to most useful tab
    const [page, setPage] = useState(1)
    const [result, setResult] = useState<DiffResponse | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!nodeBId && otherCached.length > 0) setNodeBId(otherCached[0].id)
    }, [otherCached.length])

    useEffect(() => {
        if (nodeA?.columns?.length && !keyCol) {
            const preferred = nodeA.columns.find((c) => /^(id|key|uuid|pk|_id)$/i.test(c.name))
            setKeyCol(preferred?.name ?? nodeA.columns[0].name)
        }
    }, [nodeA?.columns])

    useEffect(() => {
        if (!nodeBId || !keyCol) return
        runDiff()
    }, [nodeBId, keyCol, filter, page])

    async function runDiff() {
        setLoading(true); setError(null)
        try {
            const r = await getDiff(nodeAId, nodeBId, keyCol, filter, page, PAGE_SIZE)
            setResult(r)
        } catch (e: unknown) {
            setError(String(e))
        } finally {
            setLoading(false)
        }
    }

    const totalPages = result ? Math.ceil(result.total_filtered / PAGE_SIZE) : 1

    if (otherCached.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
                <GitCompare size={28} className="text-slate-700" />
                <p className="text-sm">No other cached nodes to compare against.</p>
                <p className="text-xs text-slate-600">Run at least one more node first.</p>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full">

            {/* ── Config bar ── */}
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/50 bg-slate-800/40 shrink-0 flex-wrap">
                {/* Node A */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Node A</span>
                    <span className="text-xs font-semibold text-slate-200 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded truncate max-w-[120px]">
                        {nodeA?.name}
                    </span>
                </div>

                <span className="text-slate-600 text-base">↔</span>

                {/* Node B */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Node B</span>
                    <select value={nodeBId}
                        onChange={(e) => { setNodeBId(e.target.value); setPage(1); setResult(null) }}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 outline-none focus:border-indigo-500">
                        {otherCached.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                    </select>
                </div>

                <div className="w-px h-4 bg-slate-700 mx-1" />

                {/* Key column */}
                <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider">Key</span>
                    <select value={keyCol}
                        onChange={(e) => { setKeyCol(e.target.value); setPage(1); setResult(null) }}
                        className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 outline-none focus:border-indigo-500">
                        {(nodeA?.columns ?? []).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    </select>
                </div>

                {loading && <Loader2 size={12} className="animate-spin text-slate-500 ml-1" />}

                {/* Pagination */}
                {result && totalPages > 1 && (
                    <div className="flex items-center gap-1 ml-auto">
                        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                            className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30">
                            <ChevronLeft size={13} />
                        </button>
                        <span className="text-xs text-slate-500 tabular-nums">{page} / {totalPages}</span>
                        <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                            className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30">
                            <ChevronRight size={13} />
                        </button>
                    </div>
                )}
            </div>

            {/* ── Summary tabs ── */}
            {result && (
                <SummaryTabs
                    summary={result.summary}
                    active={filter}
                    onChange={(f) => { setFilter(f); setPage(1) }}
                />
            )}

            {/* ── Body ── */}
            <div className="flex-1 min-h-0 overflow-hidden">
                {error ? (
                    <div className="flex items-center justify-center h-full px-8">
                        <p className="text-sm text-red-400 font-mono text-center">{error}</p>
                    </div>
                ) : loading && !result ? (
                    <div className="flex items-center justify-center h-full gap-2 text-slate-500">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-sm">Computing diff…</span>
                    </div>
                ) : result ? (
                    filter === 'changed' ? (
                        <ChangedTable
                            columns={result.columns}
                            rows={result.rows}
                            keyCol={keyCol}
                        />
                    ) : (
                        <SimpleTable
                            columns={result.columns}
                            rows={result.rows}
                            status={filter}
                        />
                    )
                ) : null}
            </div>
        </div>
    )
}
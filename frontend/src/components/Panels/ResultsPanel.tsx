import { useEffect, useRef, useState } from 'react'
import {
  X, Download, ChevronLeft, ChevronRight, Loader2,
  TableProperties, BarChart2, Search, CheckCircle2, Scissors, GitCompare,
} from 'lucide-react'
import { useNodeStore } from '@/store/nodeStore'
import { useCanvasStore } from '@/store/canvasStore'
import { getResults, getProfile, searchNode } from '@/api/client'
import type { ResultsResponse } from '@/types'
import type { ColumnProfile, ProfileResponse, SearchResponse } from '@/api/client'

// Add this line right after the lucide import:
import { DiffView } from './DiffView'

const PAGE_SIZE = 200

// ── Highlight matching text ───────────────────────────────────────────────────
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-amber-400/30 text-amber-200 rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  )
}

// ── Data table ────────────────────────────────────────────────────────────────
type TableData = { columns: Array<{ name: string; type: string }>; rows: Array<Array<unknown>> }

const TYPE_ALIGN: Record<string, string> = {
  integer: 'text-right', float: 'text-right', boolean: 'text-center',
}

function DataTable({ data, highlight = '' }: { data: TableData; highlight?: string }) {
  const { columns, rows } = data
  if (!columns.length) return <div className="flex items-center justify-center h-32 text-slate-500 text-sm">No data</div>
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs border-collapse" style={{ minWidth: columns.length * 130 }}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th className="w-10 px-2 py-2 bg-slate-800/95 border-b border-slate-700 text-slate-500 font-normal text-right">#</th>
            {columns.map((col) => (
              <th key={col.name}
                className={`px-3 py-2 bg-slate-800/95 border-b border-slate-700 text-left font-medium text-slate-300 whitespace-nowrap ${TYPE_ALIGN[col.type] ?? ''}`}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-500 font-normal">{col.type.slice(0, 3)}</span>
                  {col.name}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className={`border-b border-slate-800/60 hover:bg-slate-700/20 transition-colors ${ri % 2 === 0 ? '' : 'bg-slate-800/20'}`}>
              <td className="px-2 py-1.5 text-slate-600 text-right select-none font-mono">{ri + 1}</td>
              {row.map((cell, ci) => {
                const str = cell === null || cell === undefined ? '' : String(cell)
                const align = TYPE_ALIGN[columns[ci]?.type] ?? ''
                return (
                  <td key={ci} className={`px-3 py-1.5 font-mono whitespace-nowrap ${align} ${cell === null || cell === undefined ? 'text-slate-600' : 'text-slate-300'}`}>
                    {cell === null || cell === undefined
                      ? <span className="italic">null</span>
                      : typeof cell === 'boolean'
                        ? <span className={cell ? 'text-emerald-400' : 'text-red-400'}>{String(cell)}</span>
                        : highlight
                          ? <Highlight text={str} query={highlight} />
                          : str}
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

// ── Profile view ──────────────────────────────────────────────────────────────
function NullBar({ pct }: { pct: number }) {
  const color = pct === 0 ? 'bg-emerald-500' : pct < 5 ? 'bg-amber-400' : 'bg-red-500'
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className={`text-xs tabular-nums ${pct === 0 ? 'text-emerald-400' : pct < 5 ? 'text-amber-400' : 'text-orange-400'}`}>{pct}%</span>
    </div>
  )
}

const TYPE_COLORS: Record<string, string> = {
  string: 'bg-blue-900/50 text-blue-300', integer: 'bg-green-900/50 text-green-300',
  float: 'bg-teal-900/50 text-teal-300', boolean: 'bg-orange-900/50 text-orange-300',
  date: 'bg-purple-900/50 text-purple-300', timestamp: 'bg-violet-900/50 text-violet-300',
  json: 'bg-yellow-900/50 text-yellow-300',
}

function ProfileView({ profile }: { profile: ColumnProfile[] }) {
  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0 z-10">
          <tr>
            {['Column', 'Type', 'Nulls', 'Null %', 'Unique', 'Min', 'Max', 'Needs Trim?'].map((h) => (
              <th key={h} className="px-3 py-2 bg-slate-800/95 border-b border-slate-700 text-left text-slate-400 font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {profile.map((col, i) => (
            <tr key={col.column} className={`border-b border-slate-800/60 hover:bg-slate-700/20 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-800/20'}`}>
              <td className="px-3 py-2 font-mono text-slate-200 whitespace-nowrap">{col.column}</td>
              <td className="px-3 py-2">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-medium ${TYPE_COLORS[col.type] ?? 'bg-slate-700 text-slate-300'}`}>{col.type}</span>
              </td>
              <td className="px-3 py-2 tabular-nums">
                {col.null_count === 0
                  ? <span className="text-emerald-400">0</span>
                  : <span className="text-orange-400">{col.null_count.toLocaleString()}</span>}
              </td>
              <td className="px-3 py-2"><NullBar pct={col.null_pct} /></td>
              <td className="px-3 py-2 tabular-nums text-slate-300">
                {col.unique_count.toLocaleString()}
                <span className="text-slate-600 ml-1">({col.total > 0 ? Math.round(100 * col.unique_count / col.total) : 0}%)</span>
              </td>
              <td className="px-3 py-2 font-mono text-slate-400 max-w-[100px] truncate">{col.min ?? <span className="text-slate-600">—</span>}</td>
              <td className="px-3 py-2 font-mono text-slate-400 max-w-[100px] truncate">{col.max ?? <span className="text-slate-600">—</span>}</td>
              <td className="px-3 py-2">
                {col.trim_count === null
                  ? <span className="text-slate-600">—</span>
                  : col.trim_count === 0
                    ? <span className="flex items-center gap-1 text-emerald-400"><CheckCircle2 size={11} />No</span>
                    : <span className="flex items-center gap-1 text-amber-400"><Scissors size={11} />Yes</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────
type Tab = 'data' | 'profile' | 'diff'

export function ResultsPanel() {
  const { selectedNodeId, toggleResults } = useCanvasStore()
  const { nodes } = useNodeStore()
  const node = selectedNodeId ? nodes[selectedNodeId] : null
  const isCached = node?.status === 'cached' || node?.status === 'stale'

  const [tab, setTab] = useState<Tab>('data')
  const [results, setResults] = useState<ResultsResponse | null>(null)
  const [profile, setProfile] = useState<ColumnProfile[] | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search state
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')   // debounced
  const [searchCol, setSearchCol] = useState('')
  const [searchRes, setSearchRes] = useState<SearchResponse | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchPage, setSearchPage] = useState(1)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Load data & profile when node becomes cached
  useEffect(() => {
    if (!node?.id) { setResults(null); setProfile(null); return }
    if (!isCached) return
    loadData(1)
    loadProfile()
  }, [node?.id, node?.status])

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!searchInput.trim()) { setSearchQuery(''); setSearchRes(null); return }
    debounceRef.current = setTimeout(() => {
      setSearchQuery(searchInput.trim())
      setSearchPage(1)
    }, 350)
  }, [searchInput])

  // Run search when query/column/page changes
  useEffect(() => {
    if (!searchQuery || !node || !isCached) return
    runSearch(searchQuery, searchCol, searchPage)
  }, [searchQuery, searchCol, searchPage])

  // Focus input when search opens
  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50)
    else { setSearchInput(''); setSearchQuery(''); setSearchRes(null) }
  }, [searchOpen])

  async function loadData(p: number) {
    if (!node || !isCached) return
    setLoading(true); setError(null)
    try { const d = await getResults(node.id, p, PAGE_SIZE); setResults(d); setPage(p) }
    catch (e: unknown) { if (!String(e).includes('409')) setError(String(e)) }
    finally { setLoading(false) }
  }

  async function loadProfile() {
    if (!node || !isCached) return
    try { const p = await getProfile(node.id); setProfile(p.profile) }
    catch { /* non-critical */ }
  }

  async function runSearch(q: string, col: string, p: number) {
    if (!node) return
    setSearchLoading(true)
    try {
      const r = await searchNode(node.id, q, col, p, PAGE_SIZE)
      setSearchRes(r)
    } catch { /* ignore */ }
    finally { setSearchLoading(false) }
  }

  const totalPages = results ? Math.ceil(results.total_rows / PAGE_SIZE) : 1
  const searchTotalPages = searchRes ? Math.ceil(searchRes.total_matches / PAGE_SIZE) : 1
  const isSearching = !!searchQuery
  const qualityIssues = profile ? profile.filter(c => c.null_pct > 0 || (c.trim_count ?? 0) > 0).length : 0

  const handleExportCsv = () => {
    const src = isSearching && searchRes ? searchRes : results
    if (!src) return
    const header = src.columns.map((c) => c.name).join(',')
    const rows = src.rows.map((row) =>
      row.map((cell) => { const s = cell == null ? '' : String(cell); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s }).join(',')
    ).join('\n')
    const blob = new Blob([header + '\n' + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `${node?.name ?? 'export'}${isSearching ? '_search' : ''}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  // What to display in the data tab
  const displayData: TableData | null = isSearching && searchRes
    ? { columns: searchRes.columns, rows: searchRes.rows }
    : results
      ? { columns: results.columns.map(c => ({ name: c.name, type: c.type })), rows: results.rows }
      : null

  return (
    <div className="flex flex-col h-full bg-slate-900 border-t border-slate-700/50">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-slate-700/50 shrink-0 bg-slate-800/40">

        {/* Tabs */}
        <div className="flex items-center bg-slate-800 rounded-lg p-0.5 gap-0.5">
          <button onClick={() => setTab('data')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
              ${tab === 'data' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            <TableProperties size={11} /> Data
            {results && <span className="text-slate-500 tabular-nums">{results.total_rows.toLocaleString()}</span>}
          </button>
          <button onClick={() => setTab('profile')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
              ${tab === 'profile' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            <BarChart2 size={11} /> Profile
            {qualityIssues > 0 && (
              <span className="bg-amber-500/20 text-amber-400 rounded px-1 text-[10px]">{qualityIssues}</span>
            )}
          </button>
          <button onClick={() => setTab('diff')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all
              ${tab === 'diff' ? 'bg-slate-700 text-slate-100' : 'text-slate-500 hover:text-slate-300'}`}>
            <GitCompare size={11} /> Diff
          </button>
        </div>

        <span className="text-xs text-slate-600 truncate max-w-[120px]">{node?.name}</span>

        <div className="ml-auto flex items-center gap-1">
          {/* Search toggle — only on data tab */}
          {tab === 'data' && isCached && (
            <button onClick={() => setSearchOpen(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-all
                ${searchOpen ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'}`}>
              <Search size={11} />
              {isSearching && searchRes && (
                <span className="tabular-nums">{searchRes.total_matches.toLocaleString()} hits</span>
              )}
            </button>
          )}

          {/* Pagination */}
          {tab === 'data' && !isSearching && results && totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => loadData(page - 1)} disabled={page <= 1}
                className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30"><ChevronLeft size={13} /></button>
              <span className="text-xs text-slate-500 tabular-nums">{page}/{totalPages}</span>
              <button onClick={() => loadData(page + 1)} disabled={page >= totalPages}
                className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30"><ChevronRight size={13} /></button>
            </div>
          )}
          {tab === 'data' && isSearching && searchRes && searchTotalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setSearchPage(p => Math.max(1, p - 1))} disabled={searchPage <= 1}
                className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30"><ChevronLeft size={13} /></button>
              <span className="text-xs text-slate-500 tabular-nums">{searchPage}/{searchTotalPages}</span>
              <button onClick={() => setSearchPage(p => Math.min(searchTotalPages, p + 1))} disabled={searchPage >= searchTotalPages}
                className="p-1 text-slate-500 hover:text-slate-300 disabled:opacity-30"><ChevronRight size={13} /></button>
            </div>
          )}

          {displayData && (
            <button onClick={handleExportCsv}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:text-slate-200 hover:bg-slate-700 transition-all">
              <Download size={11} /> CSV
            </button>
          )}
          <button onClick={toggleResults} className="p-1 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded transition-colors">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* ── Search bar (collapsible) ── */}
      {tab === 'data' && searchOpen && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/40 bg-slate-800/30 shrink-0">
          <Search size={12} className="text-slate-500 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search any value across all columns…"
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 outline-none"
          />
          {/* Column filter */}
          {results && results.columns.length > 0 && (
            <select
              value={searchCol}
              onChange={(e) => { setSearchCol(e.target.value); setSearchPage(1) }}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-300 outline-none focus:border-slate-500"
            >
              <option value="">All columns</option>
              {results.columns.map(c => (
                <option key={c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          )}
          {searchLoading && <Loader2 size={12} className="animate-spin text-slate-500 shrink-0" />}
          {searchInput && (
            <button onClick={() => setSearchInput('')} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex-1 min-h-0">
        {loading && !isSearching ? (
          <div className="flex items-center justify-center h-full gap-2 text-slate-500">
            <Loader2 size={14} className="animate-spin" /><span className="text-sm">Loading…</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-red-400 font-mono">{error}</p>
          </div>
        ) : !node ? (
          <div className="flex items-center justify-center h-full text-slate-600 text-sm">Select a node to view its data</div>
        ) : !isCached ? (
          <div className="flex items-center justify-center h-full gap-2 text-slate-500">
            {node.status === 'running' && <Loader2 size={14} className="animate-spin text-amber-400" />}
            <span className="text-sm">{node.status === 'running' ? 'Executing…' : 'Run the node to see results'}</span>
          </div>
        ) : node.status === 'error' ? (
          <div className="flex items-center justify-center h-full px-8">
            <p className="text-sm text-red-400 font-mono text-center">{node.error_message}</p>
          </div>
        ) : tab === 'data' ? (
          isSearching && searchLoading && !searchRes ? (
            <div className="flex items-center justify-center h-full gap-2 text-slate-500">
              <Loader2 size={14} className="animate-spin" /><span className="text-sm">Searching…</span>
            </div>
          ) : isSearching && searchRes && searchRes.total_matches === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
              <Search size={20} className="text-slate-700" />
              <span className="text-sm">No results for <code className="text-slate-400">"{searchQuery}"</code></span>
            </div>
          ) : displayData ? (
            <DataTable data={displayData} highlight={isSearching ? searchQuery : ''} />
          ) : null
        ) : tab === 'diff' ? (
          <DiffView nodeAId={node.id} />
        ) : tab === 'profile' && profile ? (
          <ProfileView profile={profile} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <Loader2 size={14} className="animate-spin text-slate-500" />
          </div>
        )}
      </div>
    </div>
  )
}
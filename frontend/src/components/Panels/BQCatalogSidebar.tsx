import { useCallback, useEffect, useState } from 'react'
import {
  Database, ChevronRight, ChevronDown, Table2, Layers,
  Search, Loader2, AlertCircle, FolderOpen, X, Braces,
  Trash2, Plus, Calendar, ToggleLeft, Binary, Type, Check,
} from 'lucide-react'
import { listBQProjects, listBQDatasets, listBQTables, getBQStatus } from '@/api/client'
import { useCanvasStore } from '@/store/canvasStore'
import { useNodeStore } from '@/store/nodeStore'
import type { QFVariable } from '@/types'

// ── Tree item types ─────────────────────────────────────────────────────────

interface ProjectItem {
  id: string
  name: string
  expanded: boolean
  loading: boolean
  datasets: DatasetItem[]
}

interface DatasetItem {
  id: string
  project: string
  expanded: boolean
  loading: boolean
  tables: TableItem[]
}

interface TableItem {
  id: string
  dataset: string
  project: string
}

// ── Component ───────────────────────────────────────────────────────────────

export function BQCatalogSidebar() {
  const { toggleCatalog, leftSidebarTab, setLeftSidebarTab } = useCanvasStore()
  const { variables, saveVariable, deleteVariable } = useNodeStore()

  // BQ Catalog States
  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [bqAvailable, setBqAvailable] = useState<boolean | null>(null)

  // Variables Panel States
  const [editingVar, setEditingVar] = useState<QFVariable | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [varName, setVarName] = useState('')
  const [varType, setVarType] = useState<'string' | 'number' | 'boolean' | 'date'>('string')
  const [varValue, setVarValue] = useState('')
  const [varError, setVarError] = useState<string | null>(null)

  // Initial load: check BQ status, then load projects
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const status = await getBQStatus()
        if (cancelled) return
        setBqAvailable(status.available)
        if (!status.available) return

        setLoading(true)
        const raw = await listBQProjects()
        if (cancelled) return
        setProjects(
          raw.map((p) => ({
            id: p.id,
            name: p.name || p.id,
            expanded: false,
            loading: false,
            datasets: [],
          }))
        )
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load projects')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Toggle project ────────────────────────────────────────────────────────
  const toggleProject = useCallback(async (projectId: string) => {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p
        if (p.expanded) return { ...p, expanded: false }
        return { ...p, expanded: true, loading: p.datasets.length === 0 }
      })
    )
    // Fetch datasets if not loaded
    const proj = projects.find((p) => p.id === projectId)
    if (proj && proj.datasets.length === 0) {
      try {
        const raw = await listBQDatasets(projectId)
        setProjects((prev) =>
          prev.map((p) =>
            p.id !== projectId
              ? p
              : {
                  ...p,
                  loading: false,
                  datasets: raw.map((d) => ({
                    id: d.id,
                    project: projectId,
                    expanded: false,
                    loading: false,
                    tables: [],
                  })),
                }
          )
        )
      } catch {
        setProjects((prev) =>
          prev.map((p) => (p.id !== projectId ? p : { ...p, loading: false }))
        )
      }
    }
  }, [projects])

  // ── Toggle dataset ────────────────────────────────────────────────────────
  const toggleDataset = useCallback(
    async (projectId: string, datasetId: string) => {
      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== projectId) return p
          return {
            ...p,
            datasets: p.datasets.map((d) => {
              if (d.id !== datasetId) return d
              if (d.expanded) return { ...d, expanded: false }
              return { ...d, expanded: true, loading: d.tables.length === 0 }
            }),
          }
        })
      )
      // Fetch tables if not loaded
      const proj = projects.find((p) => p.id === projectId)
      const ds = proj?.datasets.find((d) => d.id === datasetId)
      if (ds && ds.tables.length === 0) {
        try {
          const raw = await listBQTables(projectId, datasetId)
          setProjects((prev) =>
            prev.map((p) => {
              if (p.id !== projectId) return p
              return {
                ...p,
                datasets: p.datasets.map((d) =>
                  d.id !== datasetId
                    ? d
                    : {
                        ...d,
                        loading: false,
                        tables: raw.map((t) => ({
                          id: t.id,
                          dataset: datasetId,
                          project: projectId,
                        })),
                      }
                ),
              }
            })
          )
        } catch {
          setProjects((prev) =>
            prev.map((p) => {
              if (p.id !== projectId) return p
              return {
                ...p,
                datasets: p.datasets.map((d) =>
                  d.id !== datasetId ? d : { ...d, loading: false }
                ),
              }
            })
          )
        }
      }
    },
    [projects]
  )

  // ── Drag handler ──────────────────────────────────────────────────────────
  const onTableDragStart = (
    e: React.DragEvent,
    table: TableItem
  ) => {
    e.dataTransfer.setData(
      'application/bq-table',
      JSON.stringify({
        project: table.project,
        dataset: table.dataset,
        table: table.id,
      })
    )
    e.dataTransfer.effectAllowed = 'move'
  }

  // ── Search filter ─────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase()

  const filteredProjects = projects.map((p) => {
    if (!q) return p
    const filteredDatasets = p.datasets.map((d) => {
      const filteredTables = d.tables.filter((t) =>
        t.id.toLowerCase().includes(q)
      )
      return { ...d, tables: filteredTables }
    }).filter((d) => d.tables.length > 0 || d.id.toLowerCase().includes(q))
    return { ...p, datasets: filteredDatasets }
  }).filter((p) => {
    if (!q) return true
    return (
      p.id.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      p.datasets.length > 0
    )
  })

  // ── Variables helper icons ────────────────────────────────────────────────
  const getVarIcon = (type: string) => {
    switch (type) {
      case 'number': return <Binary size={11} className="text-blue-400" />
      case 'boolean': return <ToggleLeft size={11} className="text-emerald-400" />
      case 'date': return <Calendar size={11} className="text-purple-400" />
      default: return <Type size={11} className="text-orange-400" />
    }
  }

  // ── Variables Actions ─────────────────────────────────────────────────────
  const resetForm = () => {
    setIsAdding(false)
    setEditingVar(null)
    setVarName('')
    setVarType('string')
    setVarValue('')
    setVarError(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setVarError(null)

    const cleanedName = varName.trim()
    if (!cleanedName) {
      setVarError('Name is required.')
      return
    }

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(cleanedName)) {
      setVarError('Name must start with a letter and contain only alphanumeric characters and underscores.')
      return
    }

    try {
      await saveVariable(
        { name: cleanedName, value: varValue, type: varType },
        editingVar?.name // Pass original name if editing (for renames)
      )
      resetForm()
    } catch (err: unknown) {
      setVarError(err instanceof Error ? err.message : 'Failed to save variable.')
    }
  }

  const handleEdit = (v: QFVariable) => {
    setEditingVar(v)
    setIsAdding(false)
    setVarName(v.name)
    setVarType(v.type)
    setVarValue(v.value)
    setVarError(null)
  }

  const handleDelete = async (name: string) => {
    if (confirm(`Are you sure you want to delete the variable "${name}"?`)) {
      try {
        await deleteVariable(name)
        if (editingVar?.name === name || varName === name) {
          resetForm()
        }
      } catch (err) {
        alert('Failed to delete variable.')
      }
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#21262d] select-none">
      
      {/* ── Tabbed Headers ── */}
      <div className="flex border-b border-[#21262d] bg-[#161b22]/50 shrink-0">
        <button
          onClick={() => setLeftSidebarTab('catalog')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[11px] font-semibold transition-all border-b-2 outline-none
            ${leftSidebarTab === 'catalog'
              ? 'border-blue-500 text-blue-400 bg-white/5'
              : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/2'}`}
        >
          <Database size={12} />
          <span>BQ Catalog</span>
        </button>
        <button
          onClick={() => setLeftSidebarTab('variables')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[11px] font-semibold transition-all border-b-2 outline-none
            ${leftSidebarTab === 'variables'
              ? 'border-purple-500 text-purple-400 bg-white/5'
              : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/2'}`}
        >
          <Braces size={12} />
          <span>Parameters</span>
        </button>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 flex flex-col min-h-0">
        {leftSidebarTab === 'catalog' ? (
          /* ========================================= */
          /* ============ BQ CATALOG VIEW ============ */
          /* ========================================= */
          <div className="flex flex-col flex-1 min-h-0">
            {/* Search */}
            <div className="px-3 py-2 border-b border-[#21262d] shrink-0">
              <div className="relative">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
                />
                <input
                  className="w-full bg-[#161b22] border border-[#30363d] rounded-lg text-xs text-gray-300 pl-7 pr-2 py-1.5 outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
                  placeholder="Filter tables…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>

            {/* Tree body */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 custom-scrollbar">
              {/* Loading state */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={16} className="animate-spin text-blue-400" />
                  <span className="ml-2 text-xs text-gray-500">Loading projects…</span>
                </div>
              )}

              {/* BQ not available */}
              {bqAvailable === false && (
                <div className="flex flex-col items-center justify-center px-4 py-8 text-center gap-2">
                  <AlertCircle size={20} className="text-red-400" />
                  <p className="text-xs text-gray-400 leading-relaxed">
                    BigQuery is not connected.
                  </p>
                  <p className="text-[10px] text-gray-600 font-mono">
                    Run: gcloud auth application-default login
                  </p>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mx-3 my-2 px-3 py-2 rounded-lg bg-red-950/40 border border-red-800/40 text-[11px] text-red-400">
                  {error}
                </div>
              )}

              {/* Empty after filter */}
              {!loading && bqAvailable && filteredProjects.length === 0 && (
                <div className="flex flex-col items-center py-8 text-center gap-1">
                  <FolderOpen size={18} className="text-gray-700" />
                  <p className="text-xs text-gray-600">
                    {q ? 'No matching tables' : 'No projects found'}
                  </p>
                </div>
              )}

              {/* Project tree */}
              {filteredProjects.map((project) => (
                <div key={project.id}>
                  {/* Project row */}
                  <button
                    onClick={() => toggleProject(project.id)}
                    className="w-full flex items-center gap-1.5 px-3 py-1.5 text-left hover:bg-[#161b22] transition-colors group"
                  >
                    {project.loading ? (
                      <Loader2 size={11} className="animate-spin text-gray-500 shrink-0" />
                    ) : project.expanded ? (
                      <ChevronDown size={11} className="text-gray-500 shrink-0" />
                    ) : (
                      <ChevronRight size={11} className="text-gray-500 shrink-0" />
                    )}
                    <Database size={11} className="text-blue-400 shrink-0" />
                    <span className="text-[11px] text-gray-300 truncate font-medium group-hover:text-white transition-colors">
                      {project.name}
                    </span>
                  </button>

                  {/* Datasets */}
                  {project.expanded &&
                    project.datasets.map((dataset) => (
                      <div key={dataset.id}>
                        <button
                          onClick={() => toggleDataset(project.id, dataset.id)}
                          className="w-full flex items-center gap-1.5 pl-7 pr-3 py-1 text-left hover:bg-[#161b22] transition-colors group"
                        >
                          {dataset.loading ? (
                            <Loader2 size={10} className="animate-spin text-gray-500 shrink-0" />
                          ) : dataset.expanded ? (
                            <ChevronDown size={10} className="text-gray-600 shrink-0" />
                          ) : (
                            <ChevronRight size={10} className="text-gray-600 shrink-0" />
                          )}
                          <Layers size={10} className="text-purple-400 shrink-0" />
                          <span className="text-[11px] text-gray-400 truncate group-hover:text-gray-200 transition-colors">
                            {dataset.id}
                          </span>
                        </button>

                        {/* Tables */}
                        {dataset.expanded &&
                          dataset.tables.map((table) => (
                            <div
                              key={table.id}
                              draggable
                              onDragStart={(e) => onTableDragStart(e, table)}
                              className="flex items-center gap-1.5 pl-12 pr-3 py-1 cursor-grab hover:bg-blue-950/30 transition-colors group active:cursor-grabbing"
                              title={`Drag onto canvas: ${project.id}.${dataset.id}.${table.id}`}
                            >
                              <Table2 size={10} className="text-emerald-400 shrink-0" />
                              <span className="text-[11px] text-gray-400 truncate group-hover:text-white transition-colors font-mono">
                                {table.id}
                              </span>
                            </div>
                          ))}

                        {/* Dataset loading spinner */}
                        {dataset.expanded && dataset.loading && (
                          <div className="flex items-center gap-2 pl-12 py-2">
                            <Loader2 size={10} className="animate-spin text-gray-600" />
                            <span className="text-[10px] text-gray-600">Loading tables…</span>
                          </div>
                        )}

                        {/* Dataset empty */}
                        {dataset.expanded && !dataset.loading && dataset.tables.length === 0 && (
                          <div className="pl-12 py-1.5">
                            <span className="text-[10px] text-gray-600 italic">No tables</span>
                          </div>
                        )}
                      </div>
                    ))}

                  {/* Project loading spinner */}
                  {project.expanded && project.loading && (
                    <div className="flex items-center gap-2 pl-7 py-2">
                      <Loader2 size={10} className="animate-spin text-gray-600" />
                      <span className="text-[10px] text-gray-600">Loading datasets…</span>
                    </div>
                  )}

                  {/* Project empty */}
                  {project.expanded && !project.loading && project.datasets.length === 0 && (
                    <div className="pl-7 py-1.5">
                      <span className="text-[10px] text-gray-600 italic">No datasets</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Footer hint */}
            <div className="px-3 py-2 border-t border-[#21262d] shrink-0">
              <p className="text-[10px] text-gray-600 leading-relaxed text-center">
                Drag a table onto the canvas to create a Source node
              </p>
            </div>
          </div>
        ) : (
          /* ========================================= */
          /* ============ VARIABLES VIEW ============= */
          /* ========================================= */
          <div className="flex flex-col flex-1 min-h-0 animate-fade-in">
            {/* Header + Add button */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[#21262d] bg-[#161b22]/30 shrink-0">
              <span className="text-[10px] font-bold text-purple-400 tracking-wider uppercase">
                Global Parameters
              </span>
              {!isAdding && !editingVar && (
                <button
                  onClick={() => setIsAdding(true)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-purple-400 hover:text-white px-2 py-0.5 rounded border border-purple-500/30 bg-purple-950/20 hover:bg-purple-800/40 transition-colors"
                >
                  <Plus size={10} /> Add Param
                </button>
              )}
            </div>

            {/* Editor form (Add or Edit) */}
            {(isAdding || editingVar) && (
              <form onSubmit={handleSave} className="m-3 p-3 rounded-lg border border-[#30363d] bg-[#161b22] flex flex-col gap-2.5 animate-fade-in shrink-0">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase">
                    {editingVar ? 'Edit Parameter' : 'New Parameter'}
                  </span>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-gray-500 hover:text-white transition-colors"
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Name */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-500">Name (e.g. start_date)</label>
                  <input
                    type="text"
                    required
                    value={varName}
                    onChange={(e) => setVarName(e.target.value)}
                    placeholder="Alphanumeric name…"
                    className="w-full bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded px-2.5 py-1 text-xs text-gray-200 outline-none transition-colors font-mono"
                  />
                </div>

                {/* Type Selection */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-500">Data Type</label>
                  <div className="grid grid-cols-4 gap-1 p-0.5 bg-[#0d1117] rounded-lg border border-[#30363d]">
                    {(['string', 'number', 'boolean', 'date'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setVarType(t)
                          if (t === 'boolean' && varValue !== 'true' && varValue !== 'false') {
                            setVarValue('false')
                          }
                        }}
                        className={`py-1 text-[10px] rounded font-semibold capitalize transition-all outline-none
                          ${varType === t
                            ? 'bg-purple-900/50 text-purple-300'
                            : 'text-gray-500 hover:text-gray-300'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dynamic Value Input */}
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-500">Value</label>
                  {varType === 'boolean' ? (
                    <div className="flex items-center gap-2 mt-1 select-none">
                      <input
                        type="checkbox"
                        id="var-bool-input"
                        checked={varValue === 'true'}
                        onChange={(e) => setVarValue(e.target.checked ? 'true' : 'false')}
                        className="rounded border-[#30363d] bg-[#0d1117] text-purple-500 focus:ring-purple-500 focus:ring-offset-[#161b22] cursor-pointer"
                      />
                      <label htmlFor="var-bool-input" className="text-xs text-gray-300 cursor-pointer">
                        {varValue === 'true' ? 'True' : 'False'}
                      </label>
                    </div>
                  ) : varType === 'date' ? (
                    <input
                      type="date"
                      required
                      value={varValue}
                      onChange={(e) => setVarValue(e.target.value)}
                      className="w-full bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded px-2.5 py-1 text-xs text-gray-200 outline-none transition-colors cursor-pointer"
                    />
                  ) : varType === 'number' ? (
                    <input
                      type="number"
                      step="any"
                      required
                      value={varValue}
                      onChange={(e) => setVarValue(e.target.value)}
                      placeholder="0.0"
                      className="w-full bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded px-2.5 py-1 text-xs text-gray-200 outline-none transition-colors font-mono"
                    />
                  ) : (
                    <input
                      type="text"
                      required
                      value={varValue}
                      onChange={(e) => setVarValue(e.target.value)}
                      placeholder="Enter value…"
                      className="w-full bg-[#0d1117] border border-[#30363d] focus:border-purple-500 rounded px-2.5 py-1 text-xs text-gray-200 outline-none transition-colors"
                    />
                  )}
                </div>

                {/* Form Error */}
                {varError && (
                  <span className="text-[10px] text-red-400 bg-red-950/20 border border-red-800/30 p-1.5 rounded">
                    {varError}
                  </span>
                )}

                {/* Actions */}
                <div className="flex gap-2 justify-end mt-1 shrink-0">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-2.5 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-500 text-white transition-all shadow-md shadow-purple-950/30"
                  >
                    <Check size={11} /> Save
                  </button>
                </div>
              </form>
            )}

            {/* Variables list */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar flex flex-col gap-2">
              {variables.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center gap-2">
                  <Braces size={20} className="text-gray-700 animate-pulse" />
                  <p className="text-xs text-gray-500">No parameters defined yet.</p>
                  <p className="text-[10px] text-gray-600 leading-relaxed max-w-[160px]">
                    Create a variable and reference it in SQL queries with {"{{ name }}"}
                  </p>
                </div>
              ) : (
                variables.map((v) => (
                  <div
                    key={v.name}
                    className={`flex items-start justify-between p-2.5 rounded-lg border transition-all duration-150 group bg-[#161b22]/40 hover:bg-[#161b22]/70 cursor-pointer
                      ${editingVar?.name === v.name
                        ? 'border-purple-500 bg-[#161b22]'
                        : 'border-[#21262d] hover:border-purple-500/40'}`}
                    onClick={() => handleEdit(v)}
                  >
                    <div className="flex flex-col min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        {getVarIcon(v.type)}
                        <span className="text-xs font-mono font-bold text-gray-200 truncate">
                          {v.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-500 truncate mt-1">
                        Value: <code className="text-gray-300 font-mono text-[10px]">
                          {v.type === 'boolean'
                            ? (v.value === 'true' ? 'true' : 'false')
                            : v.value || '""'}
                        </code>
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(v.name)
                      }}
                      className="p-1 rounded text-gray-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      title="Delete Parameter"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Floating help section */}
            <div className="px-3 py-2.5 border-t border-[#21262d] bg-[#161b22]/10 shrink-0">
              <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider block mb-1">
                Tip: How to reference
              </span>
              <p className="text-[10px] text-gray-600 leading-relaxed">
                Add variable as <code className="text-gray-400 font-mono text-[9px] bg-slate-800/60 px-1 rounded">{"{{ start_date }}"}</code> directly inside your SQL editor.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Top right drawer close button */}
      <button
        onClick={toggleCatalog}
        className="absolute top-2.5 right-3 p-1 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors z-30"
      >
        <X size={13} />
      </button>
    </div>
  )
}

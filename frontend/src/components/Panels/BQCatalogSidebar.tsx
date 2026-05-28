import { useCallback, useEffect, useState } from 'react'
import {
  Database, ChevronRight, ChevronDown, Table2, Layers,
  Search, Loader2, AlertCircle, FolderOpen, X,
} from 'lucide-react'
import { listBQProjects, listBQDatasets, listBQTables, getBQStatus } from '@/api/client'
import { useCanvasStore } from '@/store/canvasStore'

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
  const { toggleCatalog } = useCanvasStore()

  const [projects, setProjects] = useState<ProjectItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [bqAvailable, setBqAvailable] = useState<boolean | null>(null)

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

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-[#0d1117] border-r border-[#21262d] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#21262d] shrink-0">
        <div className="flex items-center gap-2">
          <Database size={13} className="text-blue-400" />
          <span className="text-xs font-semibold text-white tracking-wide">
            BigQuery Catalog
          </span>
        </div>
        <button
          onClick={toggleCatalog}
          className="p-1 rounded text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

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
  )
}

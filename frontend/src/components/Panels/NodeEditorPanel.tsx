import { useEffect, useState } from 'react'
import Editor from '@monaco-editor/react'
import { X, Play, Trash2, RefreshCw, Database, Wand2, ChevronDown, ChevronRight, Loader2, Copy, Check, FileSpreadsheet, Upload } from 'lucide-react'
import { useNodeStore } from '@/store/nodeStore'
import { useCanvasStore } from '@/store/canvasStore'
import { StatusBadge } from '@/components/UI/StatusBadge'

export function NodeEditorPanel() {
  const { selectedNodeId, closeEditor, openResults } = useCanvasStore()
  const { nodes, updateNode, executeNode, deleteNode, loadResults, invalidateNode, uploadCSV } = useNodeStore()
  const node = selectedNodeId ? nodes[selectedNodeId] : null

  const [localName, setLocalName] = useState('')
  const [localSql, setLocalSql] = useState('')
  const [localProject, setLocalProject] = useState('')
  const [localCsvPath, setLocalCsvPath] = useState('')
  const [localCsvDelimiter, setLocalCsvDelimiter] = useState(',')
  const [localCsvHasHeader, setLocalCsvHasHeader] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [upstreamOpen, setUpstreamOpen] = useState(true)

  useEffect(() => {
    if (node) {
      setLocalName(node.name)
      setLocalSql(node.sql)
      setLocalProject(node.bq_project ?? '')
      setLocalCsvPath(node.csv_path ?? '')
      setLocalCsvDelimiter(node.csv_delimiter ?? ',')
      setLocalCsvHasHeader(node.csv_has_header ?? true)
      setIsDirty(false)
    }
  }, [node?.id])

  useEffect(() => {
    if (!node) return
    setIsDirty(
      localName !== node.name ||
      localSql !== node.sql ||
      localProject !== (node.bq_project ?? '') ||
      localCsvPath !== (node.csv_path ?? '') ||
      localCsvDelimiter !== (node.csv_delimiter ?? ',') ||
      localCsvHasHeader !== (node.csv_has_header ?? true)
    )
  }, [localName, localSql, localProject, localCsvPath, localCsvDelimiter, localCsvHasHeader, node])

  if (!node) return null

  const upstreamNodes = node.upstream_ids.map((id) => nodes[id]).filter(Boolean)
  const isRunning = node.status === 'running'
  const isCached = node.status === 'cached' || node.status === 'stale'

  const handleSave = async () => {
    setIsSaving(true)
    await updateNode(node.id, {
      name: localName,
      sql: localSql,
      bq_project: localProject || undefined,
      csv_path: localCsvPath || undefined,
      csv_delimiter: localCsvDelimiter,
      csv_has_header: localCsvHasHeader,
    })
    setIsDirty(false)
    setIsSaving(false)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      await uploadCSV(node.id, file)
      // Check Zustand state directly to refresh input UI
      const updatedNode = useNodeStore.getState().nodes[node.id]
      if (updatedNode) {
        setLocalCsvPath(updatedNode.csv_path ?? '')
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleRun = async () => {
    if (isDirty) await handleSave()
    await executeNode(node.id)
    openResults()
  }

  const handleDelete = async () => {
    if (!confirm(`Delete node "${node.name}"?`)) return
    closeEditor()
    await deleteNode(node.id)
  }

  const copyViewName = () => {
    navigator.clipboard.writeText(`node_${node.id}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700/50">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {node.type === 'source' ? (
            <Database size={14} className="text-blue-400 shrink-0" />
          ) : node.type === 'csv' ? (
            <FileSpreadsheet size={14} className="text-emerald-400 shrink-0" />
          ) : (
            <Wand2 size={14} className="text-violet-400 shrink-0" />
          )}
          <input
            className="flex-1 bg-transparent text-white font-semibold text-sm outline-none min-w-0 border-b border-transparent hover:border-slate-600 focus:border-slate-500 py-0.5"
            value={localName}
            onChange={(e) => setLocalName(e.target.value)}
            placeholder="Node name"
          />
        </div>
        <StatusBadge status={node.status} />
        <button onClick={closeEditor} className="p-1 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* View name */}
      <div className="px-4 py-2 bg-slate-800/40 border-b border-slate-700/30 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">DuckDB view</span>
          <code className="text-[11px] text-slate-300 font-mono bg-slate-800 px-1.5 py-0.5 rounded">node_{node.id}</code>
          <button onClick={copyViewName} className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors">
            {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
          </button>
        </div>
      </div>

      {/* BQ Project */}
      {node.type === 'source' && (
        <div className="px-4 py-3 border-b border-slate-700/30 shrink-0">
          <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">BigQuery Project</label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200 font-mono outline-none focus:border-blue-500 transition-colors"
            placeholder="my-gcp-project"
            value={localProject}
            onChange={(e) => setLocalProject(e.target.value)}
          />
        </div>
      )}

      {/* CSV Source settings */}
      {node.type === 'csv' && (
        <div className="px-4 py-3 border-b border-slate-700/30 shrink-0 space-y-4 bg-slate-900">
          {/* File Upload */}
          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">Upload CSV File</label>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors shrink-0">
                <Upload size={13} />
                {uploading ? 'Uploading…' : 'Choose CSV'}
                <input type="file" accept=".csv" onChange={handleFileUpload} className="hidden" disabled={uploading} />
              </label>
              <div className="text-xs text-slate-400 truncate flex-1 font-mono">
                {node.csv_filename ? node.csv_filename : 'No file uploaded'}
              </div>
            </div>
          </div>

          {/* Local File Path */}
          <div>
            <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">Or Local Absolute Path</label>
            <input
              className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 font-mono outline-none focus:border-emerald-500 transition-colors"
              placeholder="e.g. C:/data/sales.csv"
              value={localCsvPath}
              onChange={(e) => setLocalCsvPath(e.target.value)}
            />
          </div>

          {/* Parsing Options */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-1.5">Delimiter</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200 font-mono text-center outline-none focus:border-emerald-500 transition-colors"
                placeholder=","
                maxLength={1}
                value={localCsvDelimiter}
                onChange={(e) => setLocalCsvDelimiter(e.target.value)}
              />
            </div>
            <div className="flex flex-col justify-end pb-1.5">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={localCsvHasHeader}
                  onChange={(e) => setLocalCsvHasHeader(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500/30"
                />
                <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Has Header</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Upstream tables */}
      {upstreamNodes.length > 0 && (
        <div className="border-b border-slate-700/30 shrink-0">
          <button
            onClick={() => setUpstreamOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 text-[11px] text-slate-400 hover:text-slate-300 hover:bg-slate-800/40 transition-colors"
          >
            {upstreamOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            <span className="uppercase tracking-wider">Upstream tables</span>
            <span className="ml-auto bg-slate-700 text-slate-400 rounded px-1.5 py-0.5 text-[10px]">{upstreamNodes.length}</span>
          </button>
          {upstreamOpen && (
            <div className="px-4 pb-2 flex flex-col gap-1">
              {upstreamNodes.map((n) => (
                <div key={n!.id} className="flex items-center gap-2 px-2 py-1 rounded bg-slate-800/50 border border-slate-700/40">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <code className="text-[11px] text-slate-300 font-mono flex-1 truncate">node_{n!.id}</code>
                  <span className="text-[10px] text-slate-500 truncate">{n!.name}</span>
                </div>
              ))}
              <p className="text-[10px] text-slate-600 mt-1">Reference these view names in your SQL.</p>
            </div>
          )}
        </div>
      )}

      {/* SQL Editor (only for BigQuery source and transform nodes) */}
      {node.type !== 'csv' ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center px-4 py-2 shrink-0">
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">SQL Query</span>
            {isDirty && <span className="ml-2 text-[10px] text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">unsaved</span>}
          </div>
          <div className="flex-1 min-h-0" onKeyDown={(e) => e.stopPropagation()}>
            <Editor
              height="100%"
              defaultLanguage="sql"
              value={localSql}
              onChange={(val) => setLocalSql(val ?? '')}
              theme="vs-dark"
              options={{
                fontSize: 12,
                fontFamily: 'JetBrains Mono, Fira Code, monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                lineNumbers: 'on',
                wordWrap: 'on',
                padding: { top: 8, bottom: 8 },
                automaticLayout: true,
                tabSize: 2,
              }}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-slate-950/20 text-slate-500 shrink-0 border-b border-slate-800/40">
          <FileSpreadsheet size={32} className="text-slate-700 mb-2" />
          <p className="text-xs max-w-[240px] leading-relaxed">
            CSV nodes load structured data directly into local Parquet. No SQL query is needed.
          </p>
          {node.status === 'cached' && (
            <p className="text-[10px] text-slate-600 mt-2 font-mono">
              Registered as view: <code className="text-slate-400 font-bold bg-slate-900/60 px-1 py-0.5 rounded">node_{node.id}</code>
            </p>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-700/50 shrink-0 bg-slate-900/80">
        <button
          onClick={handleRun}
          disabled={isRunning || (node.type !== 'csv' ? !localSql.trim() : !localCsvPath)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-all
            ${isRunning || (node.type !== 'csv' ? !localSql.trim() : !localCsvPath)
              ? 'bg-slate-800 text-slate-600 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/30'}`}
        >
          {isRunning ? <><Loader2 size={13} className="animate-spin" /> Running…</> : <><Play size={13} /> Run</>}
        </button>
        {isDirty && (
          <button onClick={handleSave} disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 transition-all">
            {isSaving ? <Loader2 size={13} className="animate-spin" /> : null} Save
          </button>
        )}
        {isCached && (
          <button onClick={() => { loadResults(node.id); openResults() }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-all">
            View data
          </button>
        )}
        {isCached && (
          <button onClick={() => invalidateNode(node.id)} title="Clear cache"
            className="p-1.5 rounded text-slate-500 hover:text-orange-400 hover:bg-slate-800 transition-all">
            <RefreshCw size={13} />
          </button>
        )}
        <button onClick={handleDelete} title="Delete node"
          className="ml-auto p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-all">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

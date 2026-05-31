import { useEffect, useState } from "react";
import { Plus, Zap, Database, CircleAlert, CircleCheck, Table2, FolderOpen, Braces, RefreshCw } from "lucide-react";
import { useCanvasStore } from "@/store/canvasStore";
import { useNodeStore } from "@/store/nodeStore";
import { getBQStatus } from "@/api/client";
import type { BQStatus } from "@/types";

export function TopBar() {
  const { openAddNode, isCatalogOpen, toggleCatalog, leftSidebarTab, setLeftSidebarTab } = useCanvasStore();
  const { nodes, loadCanvas, loading } = useNodeStore();

  const [bqStatus, setBqStatus] = useState<BQStatus | null>(null);
  const [showBQTooltip, setShowBQTooltip] = useState(false);

  useEffect(() => {
    getBQStatus().then(setBqStatus).catch(() =>
      setBqStatus({ available: false, message: "Backend unreachable" })
    );
  }, []);

  const nodeCount = Object.keys(nodes).length;
  const cachedCount = Object.values(nodes).filter((n) => n.status === "cached").length;
  const runningCount = Object.values(nodes).filter((n) => n.status === "running").length;

  return (
    <div className="flex items-center justify-between px-4 h-12 border-b border-[#30363d] bg-[#161b22] shrink-0 z-20">
      {/* ── Left: Logo + stats ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* Toggle Catalog Sidebar Button */}
        <button
          onClick={() => {
            if (isCatalogOpen && leftSidebarTab === 'catalog') {
              toggleCatalog();
            } else {
              setLeftSidebarTab('catalog');
              if (!isCatalogOpen) toggleCatalog();
            }
          }}
          className={`p-1.5 rounded-lg border transition-all ${
            isCatalogOpen && leftSidebarTab === 'catalog'
              ? "bg-blue-600/20 border-blue-500/40 text-blue-400 hover:bg-blue-600/30"
              : "bg-[#0f1117] border-[#30363d] text-gray-400 hover:bg-[#1c2333] hover:text-white"
          }`}
          title={isCatalogOpen && leftSidebarTab === 'catalog' ? "Hide Catalog Sidebar" : "Show Catalog Sidebar"}
        >
          <FolderOpen size={14} />
        </button>

        {/* Toggle Global Parameters Button */}
        <button
          onClick={() => {
            if (isCatalogOpen && leftSidebarTab === 'variables') {
              toggleCatalog();
            } else {
              setLeftSidebarTab('variables');
              if (!isCatalogOpen) toggleCatalog();
            }
          }}
          className={`p-1.5 rounded-lg border transition-all ${
            isCatalogOpen && leftSidebarTab === 'variables'
              ? "bg-purple-600/20 border-purple-500/40 text-purple-400 hover:bg-purple-600/30"
              : "bg-[#0f1117] border-[#30363d] text-gray-400 hover:bg-[#1c2333] hover:text-white"
          }`}
          title={isCatalogOpen && leftSidebarTab === 'variables' ? "Hide Global Parameters" : "Show Global Parameters"}
        >
          <Braces size={14} />
        </button>

        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
            <Zap size={14} fill="white" className="text-white" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">
            QueryFlow
          </span>
        </div>

        {/* Canvas stats */}
        <div className="flex items-center gap-3 text-[11px] text-gray-500 border-l border-[#30363d] pl-4">
          <span className="flex items-center gap-1">
            <Table2 size={11} />
            <span className="font-mono text-gray-400">{nodeCount}</span> nodes
          </span>
          {cachedCount > 0 && (
            <span className="flex items-center gap-1 text-green-500">
              <CircleCheck size={11} />
              {cachedCount} cached
            </span>
          )}
          {runningCount > 0 && (
            <span className="flex items-center gap-1 text-yellow-500 animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              {runningCount} running
            </span>
          )}
        </div>
      </div>

      {/* ── Right: Actions + BQ status ─────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        {/* BigQuery connection status */}
        {bqStatus && (
          <div
            className="relative"
            onMouseEnter={() => setShowBQTooltip(true)}
            onMouseLeave={() => setShowBQTooltip(false)}
          >
            <button className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all bg-[#0f1117] hover:bg-[#1c2333]"
              style={{
                borderColor: bqStatus.available ? "rgba(63, 185, 80, 0.4)" : "rgba(248, 81, 73, 0.3)",
                color: bqStatus.available ? "#3fb950" : "#f85149",
              }}
            >
              <Database size={12} />
              <span>BigQuery</span>
              {bqStatus.available ? (
                <CircleCheck size={11} />
              ) : (
                <CircleAlert size={11} />
              )}
            </button>

            {showBQTooltip && (
              <div className="absolute right-0 top-full mt-1.5 z-50 w-72 bg-[#1c2333] border border-[#30363d] rounded-lg p-3 text-xs text-gray-300 shadow-xl">
                <p className="font-medium mb-1">
                  {bqStatus.available ? "✓ Connected" : "✗ Not connected"}
                </p>
                <p className="text-gray-500 leading-relaxed">{bqStatus.message}</p>
              </div>
            )}
          </div>
        )}

        {/* Refresh button */}
        <button
          onClick={() => {
            getBQStatus().then(setBqStatus).catch(() => setBqStatus({ available: false, message: "Backend unreachable" }));
            loadCanvas();
          }}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-[#30363d] bg-[#0f1117] hover:bg-[#1c2333] text-gray-300 transition-all disabled:opacity-50"
          title="Force sync with backend"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          Sync
        </button>

        {/* Add node button */}
        <button
          onClick={() => openAddNode()}
          className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white transition-all shadow-sm hover:shadow-green-900/30"
        >
          <Plus size={15} strokeWidth={2.5} />
          New Node
        </button>
      </div>
    </div>
  );
}

import { useState } from "react";
import { clsx } from "clsx";
import { Database, Wand2, X, FileSpreadsheet } from "lucide-react";
import { useNodeStore } from "@/store/nodeStore";
import { useCanvasStore } from "@/store/canvasStore";
import type { NodeType } from "@/types";

const NODE_TYPES: { type: NodeType; label: string; icon: React.ReactNode; description: string; color: string }[] = [
  {
    type: "source",
    label: "BigQuery",
    icon: <Database size={20} />,
    description: "Run SQL against BigQuery and cache local Parquet",
    color: "border-blue-500/40 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400",
  },
  {
    type: "csv",
    label: "CSV Source",
    icon: <FileSpreadsheet size={20} />,
    description: "Upload or specify local CSV files to load as Parquet",
    color: "border-emerald-500/40 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400",
  },
  {
    type: "transform",
    label: "Transform",
    icon: <Wand2 size={20} />,
    description: "Query and combine cached datasets using DuckDB SQL",
    color: "border-purple-500/40 bg-purple-500/5 hover:bg-purple-500/10 text-purple-400",
  },
];

export function AddNodeDialog() {
  const { isAddNodeOpen, addNodePosition, closeAddNode } = useCanvasStore();
  const { createNode, nodes } = useNodeStore();

  const [name, setName] = useState("");
  const [type, setType] = useState<NodeType>("source");
  const [isCreating, setIsCreating] = useState(false);

  if (!isAddNodeOpen) return null;

  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setIsCreating(true);
    setError(null);
    try {
      await createNode(name.trim(), type, addNodePosition);
      setName("");
      closeAddNode();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create node — is the backend running?');
    } finally {
      setIsCreating(false);
    }
  };


  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCreate();
    if (e.key === "Escape") closeAddNode();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl w-[400px] p-5 panel-slide-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Add Node</h2>
          <button
            onClick={closeAddNode}
            className="text-gray-500 hover:text-white transition-colors p-1 rounded hover:bg-white/5"
          >
            <X size={16} />
          </button>
        </div>

        {/* Node type selector */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {NODE_TYPES.map((nt) => (
            <button
              key={nt.type}
              onClick={() => setType(nt.type)}
              className={clsx(
                "flex flex-col items-center gap-2 p-3 rounded-xl border transition-all text-center",
                type === nt.type
                  ? nt.color + " ring-2 ring-offset-1 ring-offset-[#161b22]"
                  : "border-[#30363d] bg-[#0f1117] text-gray-400 hover:border-[#484f58]"
              )}
            >
              <div className={clsx(type === nt.type ? "" : "text-gray-500")}>
                {nt.icon}
              </div>
              <div>
                <div className="text-sm font-semibold">{nt.label}</div>
                <div className="text-[10px] text-gray-500 mt-0.5 leading-tight">
                  {nt.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Name input */}
        <div className="mb-5">
          <label className="text-xs font-medium text-gray-400 mb-1.5 block">
            Node Name
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full bg-[#0f1117] border border-[#30363d] rounded-lg text-sm text-white px-3 py-2 outline-none focus:border-blue-500 transition-colors placeholder:text-gray-600"
            placeholder={
              type === "source"
                ? "e.g. fact_orders, user_events…"
                : type === "csv"
                  ? "e.g. local_sales_data, imported_users…"
                  : "e.g. joined_dataset, daily_metrics…"
            }
          />
        </div>

        {/* Actions */}
        {error && (
          <div className="mb-4 px-3 py-2 rounded-lg bg-red-950/40 border border-red-800/50 text-xs text-red-400 font-mono">
            {error}
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={closeAddNode}
            className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-2 rounded-lg hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || isCreating}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreating ? "Creating…" : "Create Node"}
          </button>
        </div>
      </div>
    </div>
  );
}

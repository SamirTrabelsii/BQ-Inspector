import { useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ReactFlowProvider } from '@xyflow/react'
import { TopBar } from '@/components/Canvas/TopBar'
import { Canvas } from '@/components/Canvas/Canvas'
import { NodeEditorPanel } from '@/components/Panels/NodeEditorPanel'
import { ResultsPanel } from '@/components/Panels/ResultsPanel'
import { AddNodeDialog } from '@/components/Panels/AddNodeDialog'
import { useNodeStore } from '@/store/nodeStore'
import { useCanvasStore } from '@/store/canvasStore'

export default function App() {
  const loadCanvas    = useNodeStore((s) => s.loadCanvas)
  const isEditorOpen  = useCanvasStore((s) => s.isEditorOpen)
  const isResultsOpen = useCanvasStore((s) => s.isResultsOpen)
  const isAddNodeOpen = useCanvasStore((s) => s.isAddNodeOpen)

  useEffect(() => { loadCanvas() }, [loadCanvas])

  return (
    <div className="flex flex-col h-screen bg-canvas overflow-hidden">
      <TopBar />

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <PanelGroup direction="vertical" className="flex-1 min-w-0">

          {/* Top row: Canvas [+ Editor panel] */}
          <Panel defaultSize={isResultsOpen ? 65 : 100} minSize={30}>
            <PanelGroup direction="horizontal">
              <Panel defaultSize={isEditorOpen ? 65 : 100} minSize={40}>
                <ReactFlowProvider>
                  <Canvas />
                </ReactFlowProvider>
              </Panel>

              {isEditorOpen && (
                <>
                  <PanelResizeHandle className="w-1 bg-[#21262d] hover:bg-blue-500 transition-colors cursor-col-resize" />
                  <Panel defaultSize={35} minSize={25} maxSize={55}>
                    <NodeEditorPanel />
                  </Panel>
                </>
              )}
            </PanelGroup>
          </Panel>

          {/* Bottom row: Results panel */}
          {isResultsOpen && (
            <>
              <PanelResizeHandle className="h-1 bg-[#21262d] hover:bg-blue-500 transition-colors cursor-row-resize" />
              <Panel defaultSize={35} minSize={20} maxSize={60}>
                <ResultsPanel />
              </Panel>
            </>
          )}

        </PanelGroup>
      </div>

      {isAddNodeOpen && <AddNodeDialog />}
    </div>
  )
}

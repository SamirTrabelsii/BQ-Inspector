import { create } from 'zustand'
import type { NodePosition } from '../types'

interface CanvasStore {
  // Selection
  selectedNodeId: string | null
  // Panel visibility
  isEditorOpen: boolean
  isResultsOpen: boolean
  isCatalogOpen: boolean
  leftSidebarTab: 'catalog' | 'variables'
  // Add-node dialog
  isAddNodeOpen: boolean
  addNodePosition: NodePosition

  // Actions
  selectNode: (id: string | null) => void
  closeEditor: () => void
  openResults: () => void
  toggleResults: () => void
  openAddNode: (pos?: NodePosition) => void
  closeAddNode: () => void
  toggleCatalog: () => void
  setLeftSidebarTab: (tab: 'catalog' | 'variables') => void
}

const DEFAULT_POS: NodePosition = { x: 200, y: 150 }

export const useCanvasStore = create<CanvasStore>((set) => ({
  selectedNodeId: null,
  isEditorOpen: false,
  isResultsOpen: false,
  isAddNodeOpen: false,
  isCatalogOpen: false,
  leftSidebarTab: 'catalog',
  addNodePosition: DEFAULT_POS,

  selectNode: (id) =>
    set({ selectedNodeId: id, isEditorOpen: id !== null }),

  closeEditor: () =>
    set({ isEditorOpen: false, selectedNodeId: null }),

  openResults: () => set({ isResultsOpen: true }),
  toggleResults: () => set((s) => ({ isResultsOpen: !s.isResultsOpen })),

  openAddNode: (pos) =>
    set({ isAddNodeOpen: true, addNodePosition: pos ?? DEFAULT_POS }),

  closeAddNode: () => set({ isAddNodeOpen: false }),
  toggleCatalog: () => set((s) => ({ isCatalogOpen: !s.isCatalogOpen })),
  setLeftSidebarTab: (tab) => set({ leftSidebarTab: tab }),
}))

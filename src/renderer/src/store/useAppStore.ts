/**
 * useAppStore.ts — Global State Management with Zustand
 *
 * WHAT IS ZUSTAND?
 * A minimal state manager. Instead of passing props deep through components,
 * you store state here and any component can read/write it directly.
 *
 * HOW IT WORKS:
 * 1. `create()` builds a store with state + actions
 * 2. Components call `useAppStore(state => state.something)` to subscribe
 * 3. When state changes, only subscribed components re-render
 *
 * Think of it as a "shared memory" all components can access.
 */

import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type {
  Box, ImageFile, CanvasTransform, ContextMenuState,
  DragState, NotificationState
} from '../types'

// ─── State Shape ─────────────────────────────────────────────────────────────

interface AppState {
  // ── Data ────────────────────────────────────────────────────────────────────
  boxes: Map<string, Box>
  images: Map<string, ImageFile>
  isLoaded: boolean

  // ── Canvas ──────────────────────────────────────────────────────────────────
  canvasTransform: CanvasTransform
  isEditingBox: string | null      // Box ID being renamed right now

  // ── Selection ───────────────────────────────────────────────────────────────
  selectedImageIds: Set<string>
  selectedBoxId: string | null

  // ── UI State ────────────────────────────────────────────────────────────────
  contextMenu: ContextMenuState
  dragState: DragState
  previewImageId: string | null    // Currently previewing this image full-screen
  notifications: NotificationState[]
  searchQuery: string
  showUnassignedOnly: boolean

  // ── Actions: Data ────────────────────────────────────────────────────────────
  loadData: () => Promise<void>

  // Boxes
  addBox: (box: Box) => void
  updateBoxLocal: (id: string, updates: Partial<Box>) => void
  removeBox: (id: string) => void

  // Images
  addImages: (images: ImageFile[]) => void
  removeImage: (id: string) => void

  // Box ↔ Image assignments
  assignImagesToBox: (boxId: string, imageIds: string[]) => void
  unassignImagesFromBox: (boxId: string, imageIds: string[]) => void
  moveImageBetweenBoxes: (fromBoxId: string, toBoxId: string, imageIds: string[]) => void

  // ── Actions: Canvas ──────────────────────────────────────────────────────────
  setCanvasTransform: (transform: CanvasTransform) => void
  resetCanvas: () => void

  // ── Actions: Selection ───────────────────────────────────────────────────────
  selectImage: (id: string, multi: boolean) => void
  clearSelection: () => void
  selectBox: (id: string | null) => void
  setEditingBox: (id: string | null) => void

  // ── Actions: UI ──────────────────────────────────────────────────────────────
  showContextMenu: (menu: ContextMenuState) => void
  hideContextMenu: () => void
  setDragState: (state: DragState) => void
  clearDrag: () => void
  setPreviewImage: (id: string | null) => void
  notify: (type: NotificationState['type'], message: string) => void
  dismissNotification: (id: string) => void
  setSearchQuery: (q: string) => void
  setShowUnassigned: (v: boolean) => void

  // ── Computed helpers ─────────────────────────────────────────────────────────
  getUnassignedImages: () => ImageFile[]
  getBoxImages: (boxId: string) => ImageFile[]
  filteredImages: () => ImageFile[]
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>((set, get) => ({
  // ── Initial State ────────────────────────────────────────────────────────────
  boxes: new Map(),
  images: new Map(),
  isLoaded: false,

  canvasTransform: { x: 0, y: 0, scale: 1 },
  isEditingBox: null,

  selectedImageIds: new Set(),
  selectedBoxId: null,

  contextMenu: { visible: false, type: 'canvas', x: 0, y: 0 },
  dragState: { isDragging: false, imageIds: [] },
  previewImageId: null,
  notifications: [],
  searchQuery: '',
  showUnassignedOnly: true,

  // ── Load Data from Main Process ───────────────────────────────────────────────
  loadData: async () => {
    try {
      const data = await window.api.getData()

      const boxes = new Map<string, Box>()
      for (const box of data.boxes) boxes.set(box.id, box)

      const images = new Map<string, ImageFile>()
      for (const img of data.images) images.set(img.id, img)

      set({
        boxes,
        images,
        isLoaded: true,
        canvasTransform: {
          x: data.workspace.canvasX,
          y: data.workspace.canvasY,
          scale: data.workspace.canvasScale
        }
      })
    } catch (err) {
      console.error('Failed to load data:', err)
      set({ isLoaded: true })
    }
  },

  // ── Box Actions ───────────────────────────────────────────────────────────────
  addBox: (box) =>
    set(state => {
      const boxes = new Map(state.boxes)
      boxes.set(box.id, box)
      return { boxes }
    }),

  updateBoxLocal: (id, updates) =>
    set(state => {
      const boxes = new Map(state.boxes)
      const existing = boxes.get(id)
      if (!existing) return {}
      boxes.set(id, { ...existing, ...updates })
      return { boxes }
    }),

  removeBox: (id) =>
    set(state => {
      const boxes = new Map(state.boxes)
      boxes.delete(id)
      return { boxes, selectedBoxId: state.selectedBoxId === id ? null : state.selectedBoxId }
    }),

  // ── Image Actions ─────────────────────────────────────────────────────────────
  addImages: (newImages) =>
    set(state => {
      const images = new Map(state.images)
      for (const img of newImages) images.set(img.id, img)
      return { images }
    }),

  removeImage: (id) =>
    set(state => {
      const images = new Map(state.images)
      images.delete(id)

      // Also remove from all boxes
      const boxes = new Map(state.boxes)
      for (const [boxId, box] of boxes) {
        if (box.imageIds.includes(id)) {
          boxes.set(boxId, { ...box, imageIds: box.imageIds.filter(iid => iid !== id) })
        }
      }

      const sel = new Set(state.selectedImageIds)
      sel.delete(id)

      return { images, boxes, selectedImageIds: sel }
    }),

  // ── Box ↔ Image assignments ───────────────────────────────────────────────────
  assignImagesToBox: (boxId, imageIds) =>
    set(state => {
      const boxes = new Map(state.boxes)
      const box = boxes.get(boxId)
      if (!box) return {}
      const existing = new Set(box.imageIds)
      const newIds = imageIds.filter(id => !existing.has(id))
      boxes.set(boxId, { ...box, imageIds: [...box.imageIds, ...newIds] })
      return { boxes }
    }),

  unassignImagesFromBox: (boxId, imageIds) =>
    set(state => {
      const boxes = new Map(state.boxes)
      const box = boxes.get(boxId)
      if (!box) return {}
      const removeSet = new Set(imageIds)
      boxes.set(boxId, { ...box, imageIds: box.imageIds.filter(id => !removeSet.has(id)) })
      return { boxes }
    }),

  // Move images from one box to another (box-to-box drag)
  moveImageBetweenBoxes: (fromBoxId, toBoxId, imageIds) =>
    set(state => {
      if (fromBoxId === toBoxId) return {}
      const boxes = new Map(state.boxes)
      const fromBox = boxes.get(fromBoxId)
      const toBox = boxes.get(toBoxId)
      if (!fromBox || !toBox) return {}

      const moveSet = new Set(imageIds)
      // Remove from source
      boxes.set(fromBoxId, { ...fromBox, imageIds: fromBox.imageIds.filter(id => !moveSet.has(id)) })
      // Add to target (avoid duplicates)
      const existingInTarget = new Set(toBox.imageIds)
      const newIds = imageIds.filter(id => !existingInTarget.has(id))
      boxes.set(toBoxId, { ...toBox, imageIds: [...toBox.imageIds, ...newIds] })
      return { boxes }
    }),

  // ── Canvas ────────────────────────────────────────────────────────────────────
  setCanvasTransform: (transform) => set({ canvasTransform: transform }),

  resetCanvas: () => {
    const t = { x: 0, y: 0, scale: 1 }
    set({ canvasTransform: t })
    window.api.saveCanvasState(t.x, t.y, t.scale).catch(console.error)
  },

  // ── Selection ─────────────────────────────────────────────────────────────────
  selectImage: (id, multi) =>
    set(state => {
      if (multi) {
        const sel = new Set(state.selectedImageIds)
        if (sel.has(id)) sel.delete(id)
        else sel.add(id)
        return { selectedImageIds: sel }
      }
      return { selectedImageIds: new Set([id]) }
    }),

  clearSelection: () => set({ selectedImageIds: new Set() }),

  selectBox: (id) => set({ selectedBoxId: id }),

  setEditingBox: (id) => set({ isEditingBox: id }),

  // ── Context Menu ──────────────────────────────────────────────────────────────
  showContextMenu: (menu) => set({ contextMenu: { ...menu, visible: true } }),
  hideContextMenu: () => set(state => ({ contextMenu: { ...state.contextMenu, visible: false } })),

  // ── Drag & Drop ───────────────────────────────────────────────────────────────
  setDragState: (state) => set({ dragState: state }),
  clearDrag: () => set({ dragState: { isDragging: false, imageIds: [] } }),

  // ── Preview ───────────────────────────────────────────────────────────────────
  setPreviewImage: (id) => set({ previewImageId: id }),

  // ── Notifications ─────────────────────────────────────────────────────────────
  notify: (type, message) => {
    const id = uuidv4()
    set(state => ({
      notifications: [...state.notifications, { id, type, message }]
    }))
    // Auto-dismiss after 4 seconds
    setTimeout(() => {
      get().dismissNotification(id)
    }, 4000)
  },

  dismissNotification: (id) =>
    set(state => ({
      notifications: state.notifications.filter(n => n.id !== id)
    })),

  // ── Search / Filter ───────────────────────────────────────────────────────────
  setSearchQuery: (q) => set({ searchQuery: q }),
  setShowUnassigned: (v) => set({ showUnassignedOnly: v }),

  // ── Computed ──────────────────────────────────────────────────────────────────
  getUnassignedImages: () => {
    const { images, boxes } = get()
    const assignedIds = new Set<string>()
    for (const box of boxes.values()) {
      for (const id of box.imageIds) assignedIds.add(id)
    }
    return Array.from(images.values()).filter(img => !assignedIds.has(img.id))
  },

  getBoxImages: (boxId: string) => {
    const { boxes, images } = get()
    const box = boxes.get(boxId)
    if (!box) return []
    return box.imageIds
      .map(id => images.get(id))
      .filter(Boolean) as ImageFile[]
  },

  filteredImages: () => {
    const { images, searchQuery, showUnassignedOnly, boxes } = get()
    let imgs = Array.from(images.values())

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      imgs = imgs.filter(img => img.fileName.toLowerCase().includes(q))
    }

    if (showUnassignedOnly) {
      const assigned = new Set<string>()
      for (const box of boxes.values()) {
        for (const id of box.imageIds) assigned.add(id)
      }
      imgs = imgs.filter(img => !assigned.has(img.id))
    }

    return imgs
  }
}))

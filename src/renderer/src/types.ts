/**
 * types.ts — All shared TypeScript types for the React frontend
 *
 * These mirror the shapes from database.ts (main process)
 * but live separately so the renderer doesn't import Node.js code.
 */

// ─── Data Models ─────────────────────────────────────────────────────────────

export interface Box {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string
  notes: string
  collapsed: boolean
  imageIds: string[]
  createdAt: number
}

export interface ImageFile {
  id: string
  filePath: string
  fileName: string
  fileSize: number
  width?: number
  height?: number
  createdAt: number
}

export interface Workspace {
  id: string
  name: string
  canvasX: number
  canvasY: number
  canvasScale: number
}

export interface AppData {
  version: number
  workspace: Workspace
  boxes: Box[]
  images: ImageFile[]
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

export interface CanvasTransform {
  x: number
  y: number
  scale: number
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export type ContextMenuType = 'canvas' | 'box' | 'image'

export interface ContextMenuState {
  visible: boolean
  type: ContextMenuType
  x: number                  // Screen X
  y: number                  // Screen Y
  canvasX?: number           // Canvas-space X (for "create box here")
  canvasY?: number
  targetId?: string          // Box ID or Image ID
}

export interface NotificationState {
  id: string
  type: 'success' | 'error' | 'info'
  message: string
}

// ─── Drag & Drop ─────────────────────────────────────────────────────────────

export interface DragState {
  isDragging: boolean
  imageIds: string[]         // Which images are being dragged
  sourceBoxId?: string       // If dragging FROM a box (for move behavior)
}

// ─── Box color palette ────────────────────────────────────────────────────────

export const BOX_COLORS = [
  '#6366f1',  // Indigo
  '#8b5cf6',  // Violet
  '#ec4899',  // Pink
  '#f43f5e',  // Rose
  '#f97316',  // Orange
  '#eab308',  // Yellow
  '#22c55e',  // Green
  '#06b6d4',  // Cyan
  '#3b82f6',  // Blue
  '#64748b',  // Slate
] as const

// ─── Window API type (from preload) ───────────────────────────────────────────

declare global {
  interface Window {
    api: {
      openFileDialog: () => Promise<string[]>
      openFolderDialog: () => Promise<string[]>
      getData: () => Promise<AppData>
      saveCanvasState: (x: number, y: number, scale: number) => Promise<void>
      createBox: (name: string, x: number, y: number, width?: number, height?: number, color?: string) => Promise<Box>
      updateBox: (id: string, updates: Partial<Box>) => Promise<Box | null>
      deleteBox: (id: string) => Promise<boolean>
      addImages: (filePaths: string[]) => Promise<ImageFile[]>
      deleteImage: (id: string) => Promise<boolean>
      addImagesToBox: (boxId: string, imageIds: string[]) => Promise<boolean>
      removeImagesFromBox: (boxId: string, imageIds: string[]) => Promise<boolean>
      exportBox: (boxId: string) => Promise<{ success: boolean; exported?: number; skipped?: number; errors?: string[]; folder?: string; error?: string }>
      exportAll: () => Promise<{ success: boolean; totalExported?: number; results?: Array<{ boxName: string; count: number }>; folder?: string; error?: string }>
      exportZip: (boxId: string) => Promise<{ success: boolean; file?: string; size?: number; error?: string }>
      minimizeWindow: () => void
      maximizeWindow: () => void
      closeWindow: () => void
      getDataPath: () => Promise<string>
      openInExplorer: (folderPath: string) => Promise<void>
    }
  }
}

// ─── Utility: Convert file path to local-file:// src ─────────────────────────

/**
 * Convert an absolute file path to a local-file:// URL
 * so Electron can serve it to the renderer safely.
 *
 * Usage: <img src={toLocalFileUrl('/Users/foo/image.jpg')} />
 */
export function toLocalFileUrl(filePath: string): string {
  // Normalize backslashes on Windows
  const normalized = filePath.replace(/\\/g, '/')
  const encoded = encodeURIComponent(normalized).replace(/%2F/g, '/')
  return `local-file://${normalized.startsWith('/') ? '' : '/'}${encoded}`
}

/** Format bytes to human readable */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

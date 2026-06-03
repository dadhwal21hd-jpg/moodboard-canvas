/**
 * preload/index.ts — The Security Bridge
 *
 * This file runs in a SPECIAL context: it has access to both:
 *   - Node.js APIs (ipcRenderer from electron)
 *   - Browser DOM (window, document)
 *
 * contextBridge.exposeInMainWorld() safely passes a typed API object
 * to the renderer. The renderer never touches Node directly — only
 * the methods we explicitly allow here.
 *
 * Think of this as a "border checkpoint" between the Electron backend and React frontend.
 */

import { contextBridge, ipcRenderer } from 'electron'

// Build the API object — every method is a typed bridge to an IPC channel
const api = {
  // ── File Dialogs ─────────────────────────────────────────────────────────────
  openFileDialog: (): Promise<string[]> =>
    ipcRenderer.invoke('dialog:openFiles'),

  openFolderDialog: (): Promise<string[]> =>
    ipcRenderer.invoke('dialog:openFolder'),

  // ── Database ─────────────────────────────────────────────────────────────────
  getData: (): Promise<import('../main/database').AppData> =>
    ipcRenderer.invoke('db:getData'),

  saveCanvasState: (x: number, y: number, scale: number): Promise<void> =>
    ipcRenderer.invoke('db:saveCanvasState', x, y, scale),

  createBox: (
    name: string, x: number, y: number,
    width?: number, height?: number, color?: string
  ): Promise<import('../main/database').BoxData> =>
    ipcRenderer.invoke('db:createBox', name, x, y, width, height, color),

  updateBox: (
    id: string,
    updates: Partial<import('../main/database').BoxData>
  ): Promise<import('../main/database').BoxData | null> =>
    ipcRenderer.invoke('db:updateBox', id, updates),

  deleteBox: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('db:deleteBox', id),

  addImages: (filePaths: string[]): Promise<import('../main/database').ImageData[]> =>
    ipcRenderer.invoke('db:addImages', filePaths),

  deleteImage: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('db:deleteImage', id),

  addImagesToBox: (boxId: string, imageIds: string[]): Promise<boolean> =>
    ipcRenderer.invoke('db:addImagesToBox', boxId, imageIds),

  removeImagesFromBox: (boxId: string, imageIds: string[]): Promise<boolean> =>
    ipcRenderer.invoke('db:removeImagesFromBox', boxId, imageIds),

  // ── Export ───────────────────────────────────────────────────────────────────
  exportBox: (boxId: string): Promise<{
    success: boolean; exported?: number; skipped?: number;
    errors?: string[]; folder?: string; error?: string
  }> => ipcRenderer.invoke('export:box', boxId),

  exportAll: (): Promise<{
    success: boolean; totalExported?: number;
    results?: Array<{ boxName: string; count: number }>;
    folder?: string; error?: string
  }> => ipcRenderer.invoke('export:all'),

  exportZip: (boxId: string): Promise<{
    success: boolean; file?: string; size?: number; error?: string
  }> => ipcRenderer.invoke('export:zip', boxId),

  // ── Window Controls ──────────────────────────────────────────────────────────
  minimizeWindow: (): void => ipcRenderer.send('window:minimize'),
  maximizeWindow: (): void => ipcRenderer.send('window:maximize'),
  closeWindow: (): void => ipcRenderer.send('window:close'),

  // ── App Utils ────────────────────────────────────────────────────────────────
  getDataPath: (): Promise<string> => ipcRenderer.invoke('app:getDataPath'),
  openInExplorer: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke('app:openInExplorer', folderPath),
}

// Expose the API at window.api — renderer imports this via the global Window type
contextBridge.exposeInMainWorld('api', api)

// Export the type so renderer can use it for strong typing
export type AppAPI = typeof api

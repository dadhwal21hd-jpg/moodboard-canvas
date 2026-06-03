/**
 * database.ts — JSON persistence layer
 *
 * WHY JSON instead of SQLite?
 * - Zero native module compilation (better-sqlite3 needs node-gyp per Electron version)
 * - Just works on Windows/Mac/Linux out of the box
 * - For 5000 images, a JSON file is ~1-3MB — totally fine to load at startup
 * - We debounce saves so writes are batched efficiently
 *
 * All data lives in: {userData}/moodboard-data.json
 */

import { app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { v4 as uuidv4 } from 'uuid'
import logger from 'electron-log'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceData {
  id: string
  name: string
  canvasX: number
  canvasY: number
  canvasScale: number
  createdAt: number
  updatedAt: number
}

export interface BoxData {
  id: string
  name: string
  x: number
  y: number
  width: number
  height: number
  color: string           // Hex color for the header
  notes: string
  collapsed: boolean
  imageIds: string[]      // Ordered list of image IDs inside this box
  createdAt: number
}

export interface ImageData {
  id: string
  filePath: string        // Absolute path to original file
  fileName: string        // Original filename
  fileSize: number        // Bytes
  width?: number          // Image dimensions (loaded lazily)
  height?: number
  createdAt: number
}

export interface AppData {
  version: number
  workspace: WorkspaceData
  boxes: BoxData[]
  images: ImageData[]
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_VERSION = 1
const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.gif', '.bmp']

// ─── State ────────────────────────────────────────────────────────────────────

let dbPath: string
let data: AppData
let saveTimer: NodeJS.Timeout | null = null

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createDefaultWorkspace(): WorkspaceData {
  return {
    id: uuidv4(),
    name: 'My Workspace',
    canvasX: 0,
    canvasY: 0,
    canvasScale: 1,
    createdAt: Date.now(),
    updatedAt: Date.now()
  }
}

function createDefaultData(): AppData {
  return {
    version: DB_VERSION,
    workspace: createDefaultWorkspace(),
    boxes: [],
    images: []
  }
}

/** Debounce saves — batch writes within 1 second */
function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    persistToDisk()
    saveTimer = null
  }, 800)
}

function persistToDisk(): void {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    logger.error('Failed to save database:', err)
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function setupDatabase(): void {
  const userDataPath = app.getPath('userData')
  dbPath = path.join(userDataPath, 'moodboard-data.json')

  if (fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath, 'utf-8')
      const parsed = JSON.parse(raw) as AppData
      // Migration: ensure all fields exist (handles older versions)
      data = {
        version: parsed.version ?? DB_VERSION,
        workspace: parsed.workspace ?? createDefaultWorkspace(),
        boxes: (parsed.boxes ?? []).map(box => ({
          ...box,
          imageIds: box.imageIds ?? [],
          notes: box.notes ?? '',
          collapsed: box.collapsed ?? false
        })),
        images: parsed.images ?? []
      }
      logger.info(`Database loaded from ${dbPath} — ${data.boxes.length} boxes, ${data.images.length} images`)
    } catch (err) {
      logger.error('Failed to parse database, starting fresh:', err)
      data = createDefaultData()
    }
  } else {
    data = createDefaultData()
    persistToDisk()
    logger.info(`New database created at ${dbPath}`)
  }
}

// ─── Workspace ───────────────────────────────────────────────────────────────

export function getAppData(): AppData {
  return data
}

export function saveCanvasState(x: number, y: number, scale: number): void {
  data.workspace.canvasX = x
  data.workspace.canvasY = y
  data.workspace.canvasScale = scale
  data.workspace.updatedAt = Date.now()
  scheduleSave()
}

// ─── Boxes ────────────────────────────────────────────────────────────────────

export function createBox(
  name: string,
  x: number,
  y: number,
  width = 320,
  height = 280,
  color = '#6366f1'
): BoxData {
  const box: BoxData = {
    id: uuidv4(),
    name,
    x,
    y,
    width,
    height,
    color,
    notes: '',
    collapsed: false,
    imageIds: [],
    createdAt: Date.now()
  }
  data.boxes.push(box)
  scheduleSave()
  return box
}

export function updateBox(id: string, updates: Partial<Omit<BoxData, 'id' | 'createdAt'>>): BoxData | null {
  const idx = data.boxes.findIndex(b => b.id === id)
  if (idx === -1) return null
  data.boxes[idx] = { ...data.boxes[idx], ...updates }
  scheduleSave()
  return data.boxes[idx]
}

export function deleteBox(id: string): void {
  data.boxes = data.boxes.filter(b => b.id !== id)
  scheduleSave()
}

// ─── Images ───────────────────────────────────────────────────────────────────

export function addImages(filePaths: string[]): ImageData[] {
  const added: ImageData[] = []
  const existingPaths = new Set(data.images.map(i => i.filePath))

  for (const filePath of filePaths) {
    const ext = path.extname(filePath).toLowerCase()
    if (!SUPPORTED_EXTENSIONS.includes(ext)) continue
    if (existingPaths.has(filePath)) continue    // Skip duplicates

    let fileSize = 0
    try {
      const stat = fs.statSync(filePath)
      fileSize = stat.size
    } catch { /* file might be inaccessible */ }

    const img: ImageData = {
      id: uuidv4(),
      filePath,
      fileName: path.basename(filePath),
      fileSize,
      createdAt: Date.now()
    }
    data.images.push(img)
    existingPaths.add(filePath)
    added.push(img)
  }

  if (added.length > 0) scheduleSave()
  return added
}

export function deleteImage(id: string): void {
  // Remove from all boxes first
  data.boxes = data.boxes.map(box => ({
    ...box,
    imageIds: box.imageIds.filter(iid => iid !== id)
  }))
  data.images = data.images.filter(i => i.id !== id)
  scheduleSave()
}

export function addImagesToBox(boxId: string, imageIds: string[]): boolean {
  const box = data.boxes.find(b => b.id === boxId)
  if (!box) return false

  const existingSet = new Set(box.imageIds)
  for (const id of imageIds) {
    if (!existingSet.has(id)) {
      box.imageIds.push(id)
      existingSet.add(id)
    }
  }
  scheduleSave()
  return true
}

export function removeImagesFromBox(boxId: string, imageIds: string[]): boolean {
  const box = data.boxes.find(b => b.id === boxId)
  if (!box) return false

  const removeSet = new Set(imageIds)
  box.imageIds = box.imageIds.filter(id => !removeSet.has(id))
  scheduleSave()
  return true
}

// ─── Immediate save (for app quit) ───────────────────────────────────────────

export function flushSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persistToDisk()
}

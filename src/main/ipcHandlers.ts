/**
 * ipcHandlers.ts — All IPC communication between main ↔ renderer
 *
 * Pattern:
 *   Renderer calls:  window.api.someMethod(args)
 *   Preload bridges: ipcRenderer.invoke('channel', args)
 *   Main handles:    ipcMain.handle('channel', handler)
 *   Returns:         Promise resolves back to renderer
 */

import { ipcMain, dialog, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import archiver from 'archiver'
import logger from 'electron-log'
import {
  getAppData,
  saveCanvasState,
  createBox,
  updateBox,
  deleteBox,
  addImages,
  deleteImage,
  addImagesToBox,
  removeImagesFromBox,
  flushSave
} from './database'

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.tif', '.gif', '.bmp']

// ─── Recursive folder scanner ─────────────────────────────────────────────────

function scanFolderForImages(folderPath: string, depth = 0, maxDepth = 3): string[] {
  if (depth > maxDepth) return []
  const results: string[] = []

  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(folderPath, entry.name)
      if (entry.isDirectory()) {
        results.push(...scanFolderForImages(fullPath, depth + 1, maxDepth))
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase()
        if (SUPPORTED_EXTENSIONS.includes(ext)) {
          results.push(fullPath)
        }
      }
    }
  } catch (err) {
    logger.warn(`Could not scan folder ${folderPath}:`, err)
  }

  return results
}

// ─── Export utilities ─────────────────────────────────────────────────────────

/** Sanitize a string for use as a folder/file name */
function sanitizeFolderName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+$/, '')
    .substring(0, 100)
    .trim() || 'Unnamed Box'
}

/** Copy files to an export folder, returns { exported, skipped, errors } */
async function exportImagesToFolder(
  imagePaths: string[],
  destFolder: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ exported: number; skipped: number; errors: string[] }> {
  fs.mkdirSync(destFolder, { recursive: true })

  let exported = 0
  let skipped = 0
  const errors: string[] = []
  const usedNames = new Set<string>()

  for (let i = 0; i < imagePaths.length; i++) {
    const srcPath = imagePaths[i]
    let destName = path.basename(srcPath)

    // Handle duplicate filenames in destination
    if (usedNames.has(destName)) {
      const base = path.basename(destName, path.extname(destName))
      const ext = path.extname(destName)
      let counter = 1
      while (usedNames.has(`${base}_${counter}${ext}`)) counter++
      destName = `${base}_${counter}${ext}`
    }
    usedNames.add(destName)

    const destPath = path.join(destFolder, destName)

    try {
      if (!fs.existsSync(srcPath)) {
        skipped++
        errors.push(`Missing file: ${destName}`)
        continue
      }
      fs.copyFileSync(srcPath, destPath)
      exported++
    } catch (err) {
      errors.push(`Failed to copy ${destName}: ${(err as Error).message}`)
    }

    onProgress?.(i + 1, imagePaths.length)
  }

  return { exported, skipped, errors }
}

// ─── Register all handlers ────────────────────────────────────────────────────

export function registerIpcHandlers(): void {

  // ── File Dialogs ────────────────────────────────────────────────────────────

  /** Open multi-file picker for images */
  ipcMain.handle('dialog:openFiles', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Images',
      filters: [
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp', 'tiff', 'tif', 'gif', 'bmp'] }
      ],
      properties: ['openFile', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  })

  /** Open folder picker, returns all images in that folder (recursive) */
  ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Import Folder',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return []

    const folderPath = result.filePaths[0]
    const imagePaths = scanFolderForImages(folderPath)
    logger.info(`Folder import: found ${imagePaths.length} images in ${folderPath}`)
    return imagePaths
  })

  /** Choose export destination folder */
  ipcMain.handle('dialog:exportFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Export Destination',
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // ── Database: Read ───────────────────────────────────────────────────────────

  /** Load entire app state on startup */
  ipcMain.handle('db:getData', () => {
    return getAppData()
  })

  // ── Database: Canvas ─────────────────────────────────────────────────────────

  ipcMain.handle('db:saveCanvasState', (_event, x: number, y: number, scale: number) => {
    saveCanvasState(x, y, scale)
  })

  // ── Database: Boxes ──────────────────────────────────────────────────────────

  ipcMain.handle('db:createBox', (_event, name: string, x: number, y: number, width?: number, height?: number, color?: string) => {
    return createBox(name, x, y, width, height, color)
  })

  ipcMain.handle('db:updateBox', (_event, id: string, updates: Record<string, unknown>) => {
    return updateBox(id, updates as Parameters<typeof updateBox>[1])
  })

  ipcMain.handle('db:deleteBox', (_event, id: string) => {
    deleteBox(id)
    return true
  })

  // ── Database: Images ─────────────────────────────────────────────────────────

  ipcMain.handle('db:addImages', (_event, filePaths: string[]) => {
    return addImages(filePaths)
  })

  ipcMain.handle('db:deleteImage', (_event, id: string) => {
    deleteImage(id)
    return true
  })

  ipcMain.handle('db:addImagesToBox', (_event, boxId: string, imageIds: string[]) => {
    return addImagesToBox(boxId, imageIds)
  })

  ipcMain.handle('db:removeImagesFromBox', (_event, boxId: string, imageIds: string[]) => {
    return removeImagesFromBox(boxId, imageIds)
  })

  // ── Export ───────────────────────────────────────────────────────────────────

  /** Export a single box's images to a chosen folder */
  ipcMain.handle('export:box', async (_event, boxId: string) => {
    const appData = getAppData()
    const box = appData.boxes.find(b => b.id === boxId)
    if (!box) return { success: false, error: 'Box not found' }

    if (box.imageIds.length === 0) {
      return { success: false, error: 'Box has no images to export' }
    }

    // Ask user where to export
    const destResult = await dialog.showOpenDialog({
      title: `Export "${box.name}" — Choose Destination Folder`,
      properties: ['openDirectory', 'createDirectory']
    })
    if (destResult.canceled) return { success: false, error: 'Cancelled' }

    const destBase = destResult.filePaths[0]
    const boxFolder = path.join(destBase, sanitizeFolderName(box.name))

    // Resolve image paths
    const imageMap = new Map(appData.images.map(img => [img.id, img]))
    const imagePaths = box.imageIds
      .map(id => imageMap.get(id)?.filePath)
      .filter(Boolean) as string[]

    const result = await exportImagesToFolder(imagePaths, boxFolder)
    logger.info(`Export box "${box.name}": ${result.exported} exported, ${result.skipped} skipped`)

    return {
      success: true,
      exported: result.exported,
      skipped: result.skipped,
      errors: result.errors,
      folder: boxFolder
    }
  })

  /** Export ALL boxes, each to its own subfolder */
  ipcMain.handle('export:all', async () => {
    const appData = getAppData()
    const destResult = await dialog.showOpenDialog({
      title: 'Export All Boxes — Choose Destination Folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (destResult.canceled) return { success: false, error: 'Cancelled' }

    const destBase = destResult.filePaths[0]
    const exportFolder = path.join(destBase, `Moodboard Export ${new Date().toLocaleDateString('en-GB').replace(/\//g, '-')}`)
    const imageMap = new Map(appData.images.map(img => [img.id, img]))

    let totalExported = 0
    const results: Array<{ boxName: string; count: number }> = []

    for (const box of appData.boxes) {
      if (box.imageIds.length === 0) continue

      const boxFolder = path.join(exportFolder, sanitizeFolderName(box.name))
      const imagePaths = box.imageIds
        .map(id => imageMap.get(id)?.filePath)
        .filter(Boolean) as string[]

      const result = await exportImagesToFolder(imagePaths, boxFolder)
      totalExported += result.exported
      results.push({ boxName: box.name, count: result.exported })
    }

    logger.info(`Export all: ${totalExported} total images across ${results.length} boxes`)
    return { success: true, totalExported, results, folder: exportFolder }
  })

  /** Export a single box as a ZIP file */
  ipcMain.handle('export:zip', async (_event, boxId: string) => {
    const appData = getAppData()
    const box = appData.boxes.find(b => b.id === boxId)
    if (!box) return { success: false, error: 'Box not found' }
    if (box.imageIds.length === 0) return { success: false, error: 'Box has no images' }

    const defaultName = `${sanitizeFolderName(box.name)}.zip`
    const saveResult = await dialog.showSaveDialog({
      title: `Export "${box.name}" as ZIP`,
      defaultPath: path.join(os.homedir(), 'Downloads', defaultName),
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }]
    })
    if (saveResult.canceled || !saveResult.filePath) return { success: false, error: 'Cancelled' }

    const zipPath = saveResult.filePath
    const imageMap = new Map(appData.images.map(img => [img.id, img]))

    return new Promise((resolve) => {
      const output = fs.createWriteStream(zipPath)
      const archive = archiver('zip', { zlib: { level: 1 } }) // Level 1 = fast, images are already compressed

      output.on('close', () => {
        logger.info(`ZIP created: ${zipPath} (${archive.pointer()} bytes)`)
        resolve({ success: true, file: zipPath, size: archive.pointer() })
      })

      archive.on('error', (err) => {
        resolve({ success: false, error: err.message })
      })

      archive.pipe(output)

      const usedNames = new Set<string>()
      for (const imageId of box.imageIds) {
        const img = imageMap.get(imageId)
        if (!img || !fs.existsSync(img.filePath)) continue

        let name = img.fileName
        if (usedNames.has(name)) {
          const base = path.basename(name, path.extname(name))
          const ext = path.extname(name)
          let counter = 1
          while (usedNames.has(`${base}_${counter}${ext}`)) counter++
          name = `${base}_${counter}${ext}`
        }
        usedNames.add(name)
        archive.file(img.filePath, { name })
      }

      archive.finalize()
    })
  })

  // ── App Info ─────────────────────────────────────────────────────────────────

  ipcMain.handle('app:getDataPath', () => {
    return app.getPath('userData')
  })

  ipcMain.handle('app:openInExplorer', (_event, folderPath: string) => {
    const { shell } = require('electron')
    shell.openPath(folderPath)
  })

  // ── App quit: flush pending saves ────────────────────────────────────────────
  app.on('before-quit', () => {
    flushSave()
    logger.info('App quitting — data flushed')
  })
}

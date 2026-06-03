/**
 * Toolbar.tsx — Top navigation bar
 *
 * Contains:
 * - App logo/name
 * - Import buttons (quick access)
 * - Canvas zoom controls (zoom in, zoom out, fit/reset)
 * - Export all boxes button
 * - Window controls (min/max/close) — custom because we use frameless window
 *
 * WHY FRAMELESS WINDOW?
 * Electron apps can remove the OS title bar for a premium look.
 * We replace it with our own Toolbar that also has window controls.
 * The toolbar is draggable via CSS: -webkit-app-region: drag
 */

import React, { useCallback } from 'react'
import { useAppStore } from '../../store/useAppStore'

export function Toolbar(): React.JSX.Element {
  const { boxes, canvasTransform, setCanvasTransform, resetCanvas, notify } = useAppStore()

  // ── Import shortcut ────────────────────────────────────────────────────────
  const handleImportFiles = useCallback(async () => {
    try {
      const paths = await window.api.openFileDialog()
      if (paths.length === 0) return
      const newImages = await window.api.addImages(paths)
      if (newImages.length > 0) {
        useAppStore.getState().addImages(newImages)
        notify('success', `Imported ${newImages.length} image${newImages.length !== 1 ? 's' : ''}`)
      } else {
        notify('info', 'No new images (duplicates skipped)')
      }
    } catch {
      notify('error', 'Failed to import images')
    }
  }, [notify])

  // ── Zoom controls ──────────────────────────────────────────────────────────
  const zoomIn = useCallback(() => {
    const newScale = Math.min(canvasTransform.scale * 1.2, 5)
    setCanvasTransform({ ...canvasTransform, scale: newScale })
  }, [canvasTransform, setCanvasTransform])

  const zoomOut = useCallback(() => {
    const newScale = Math.max(canvasTransform.scale / 1.2, 0.1)
    setCanvasTransform({ ...canvasTransform, scale: newScale })
  }, [canvasTransform, setCanvasTransform])

  const zoomPercent = Math.round(canvasTransform.scale * 100)

  // ── Export All ────────────────────────────────────────────────────────────
  const handleExportAll = useCallback(async () => {
    if (boxes.size === 0) {
      notify('info', 'No boxes to export')
      return
    }
    try {
      notify('info', `Exporting ${boxes.size} boxes...`)
      const result = await window.api.exportAll()
      if (result.success && result.results) {
        const total = result.totalExported ?? 0
        notify('success', `Exported ${total} images to ${result.folder ?? 'output folder'}`)
      } else {
        notify('error', result.error ?? 'Export failed')
      }
    } catch {
      notify('error', 'Export failed')
    }
  }, [boxes.size, notify])

  // ── Window controls ───────────────────────────────────────────────────────
  const handleMinimize = useCallback(() => window.api.minimizeWindow(), [])
  const handleMaximize = useCallback(() => window.api.maximizeWindow(), [])
  const handleClose = useCallback(() => window.api.closeWindow(), [])

  return (
    <div className="toolbar">
      {/* Left: Logo + app name */}
      <div className="toolbar-logo" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <span className="toolbar-logo-icon">🎨</span>
        <span className="toolbar-logo-text">Moodboard</span>
      </div>

      {/* Center: Main actions */}
      <div className="toolbar-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Import */}
        <button
          className="btn btn-primary toolbar-btn"
          onClick={handleImportFiles}
          title="Import image files (or use sidebar for folders)"
        >
          <span>＋</span> Import
        </button>

        {/* Divider */}
        <div className="toolbar-divider" />

        {/* Zoom controls */}
        <div className="toolbar-zoom">
          <button className="btn btn-icon" onClick={zoomOut} title="Zoom out (scroll wheel also works)">
            −
          </button>
          <button
            className="btn btn-subtle toolbar-zoom-label"
            onClick={resetCanvas}
            title="Reset canvas to center (click to reset)"
          >
            {zoomPercent}%
          </button>
          <button className="btn btn-icon" onClick={zoomIn} title="Zoom in">
            ＋
          </button>
        </div>

        {/* Divider */}
        <div className="toolbar-divider" />

        {/* Box count */}
        <div className="toolbar-stat">
          <span className="toolbar-stat-value">{boxes.size}</span>
          <span className="toolbar-stat-label">boxes</span>
        </div>

        {/* Export all */}
        {boxes.size > 0 && (
          <button
            className="btn btn-export toolbar-btn"
            onClick={handleExportAll}
            title={`Export all ${boxes.size} boxes as folders`}
          >
            ↓ Export All
          </button>
        )}
      </div>

      {/* Right: Window controls */}
      <div
        className="toolbar-window-controls"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          className="window-btn window-btn-minimize"
          onClick={handleMinimize}
          title="Minimize"
        >
          −
        </button>
        <button
          className="window-btn window-btn-maximize"
          onClick={handleMaximize}
          title="Maximize / Restore"
        >
          □
        </button>
        <button
          className="window-btn window-btn-close"
          onClick={handleClose}
          title="Close"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

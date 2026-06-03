/**
 * App.tsx — Root component
 *
 * Handles:
 * - Overall layout (toolbar + sidebar + canvas)
 * - Global keyboard shortcuts
 * - Global file drop zone (drag images from OS onto app)
 * - Context menu portal
 * - Notifications
 * - Loading state
 */

import React, { useEffect, useCallback, useRef, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { InfiniteCanvas } from './components/Canvas/InfiniteCanvas'
import { ImageTray } from './components/Sidebar/ImageTray'
import { Toolbar } from './components/Toolbar/Toolbar'
import { ContextMenu } from './components/shared/ContextMenu'
import { ImagePreviewModal } from './components/shared/ImagePreviewModal'
import { Notifications } from './components/shared/Notifications'

export default function App(): React.JSX.Element {
  const { isLoaded, loadData, notify, hideContextMenu, contextMenu } = useAppStore()
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  // ── Load data on mount ────────────────────────────────────────────────────
  useEffect(() => {
    loadData()
  }, [loadData])

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Escape: close modals/menus
      if (e.key === 'Escape') {
        hideContextMenu()
        useAppStore.getState().setPreviewImage(null)
        useAppStore.getState().clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hideContextMenu])

  // ── Global file drag-and-drop (drag images from OS directly onto app) ─────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)

    const filePaths: string[] = []

    // Electron exposes file paths via a special property
    for (const file of Array.from(e.dataTransfer.files)) {
      const path = (file as File & { path?: string }).path
      if (path) filePaths.push(path)
    }

    if (filePaths.length === 0) return

    try {
      const images = await window.api.addImages(filePaths)
      if (images.length > 0) {
        useAppStore.getState().addImages(images)
        notify('success', `Imported ${images.length} image${images.length !== 1 ? 's' : ''}`)
      } else {
        notify('info', 'No supported images found in dropped files')
      }
    } catch (err) {
      notify('error', 'Failed to import dropped files')
    }
  }, [notify])

  // ── Close context menu on outside click ───────────────────────────────────
  const handleAppClick = useCallback(() => {
    if (contextMenu.visible) hideContextMenu()
  }, [contextMenu.visible, hideContextMenu])

  // ── Loading Screen ────────────────────────────────────────────────────────
  if (!isLoaded) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">🎨</div>
        <div className="loading-text">Loading workspace...</div>
      </div>
    )
  }

  return (
    <div
      className="app"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleAppClick}
    >
      {/* Top toolbar */}
      <Toolbar />

      {/* Main content: sidebar + canvas */}
      <div className="app-body">
        <ImageTray />
        <InfiniteCanvas />
      </div>

      {/* Overlays */}
      {contextMenu.visible && <ContextMenu />}
      <ImagePreviewModal />
      <Notifications />

      {/* OS file drop overlay */}
      {isDragOver && (
        <div className="drop-overlay">
          <div style={{ fontSize: 40 }}>📥</div>
          <div>Drop images to import</div>
          <div style={{ fontSize: 14, opacity: 0.6, fontWeight: 400 }}>
            JPG, PNG, WEBP, TIFF supported
          </div>
        </div>
      )}
    </div>
  )
}

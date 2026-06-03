/**
 * CanvasBox.tsx — Each visual group/category box on the canvas
 *
 * Features:
 * - Custom drag (header drag handle)
 * - Custom resize (bottom-right handle)
 * - Inline rename (click title)
 * - Drop target for images from tray
 * - Thumbnail grid of assigned images
 * - Collapse/expand
 * - Context menu
 */

import React, { useRef, useCallback, useState, useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { Box, ImageFile } from '../../types'
import { toLocalFileUrl } from '../../types'

interface CanvasBoxProps {
  box: Box
  canvasScale: number
  screenToCanvas: (x: number, y: number) => { x: number; y: number }
}

export function CanvasBox({ box, canvasScale, screenToCanvas }: CanvasBoxProps): React.JSX.Element {
  const {
    updateBoxLocal, removeBox, assignImagesToBox, unassignImagesFromBox,
    showContextMenu, setEditingBox, isEditingBox,
    dragState, clearDrag, getBoxImages, notify, selectedBoxId, selectBox
  } = useAppStore()

  const boxRef = useRef<HTMLDivElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  // ── Drag: move the box ──────────────────────────────────────────────────────
  const dragData = useRef({ startMouseX: 0, startMouseY: 0, startBoxX: 0, startBoxY: 0 })

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    if (e.target instanceof HTMLInputElement) return   // Don't drag when editing name
    if (e.target instanceof HTMLButtonElement) return  // Don't drag when clicking buttons
    e.stopPropagation()

    selectBox(box.id)
    dragData.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBoxX: box.x,
      startBoxY: box.y
    }

    const onMove = (e: MouseEvent): void => {
      // dx/dy in canvas space = screen delta / scale
      const dx = (e.clientX - dragData.current.startMouseX) / canvasScale
      const dy = (e.clientY - dragData.current.startMouseY) / canvasScale
      updateBoxLocal(box.id, {
        x: dragData.current.startBoxX + dx,
        y: dragData.current.startBoxY + dy
      })
    }

    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      // Persist final position
      const { boxes } = useAppStore.getState()
      const updated = boxes.get(box.id)
      if (updated) {
        window.api.updateBox(box.id, { x: updated.x, y: updated.y }).catch(console.error)
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [box.id, box.x, box.y, canvasScale, updateBoxLocal, selectBox])

  // ── Resize: bottom-right handle ─────────────────────────────────────────────
  const resizeData = useRef({ startMouseX: 0, startMouseY: 0, startW: 0, startH: 0 })

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    resizeData.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startW: box.width,
      startH: box.height
    }

    const onMove = (e: MouseEvent): void => {
      const dw = (e.clientX - resizeData.current.startMouseX) / canvasScale
      const dh = (e.clientY - resizeData.current.startMouseY) / canvasScale
      updateBoxLocal(box.id, {
        width: Math.max(200, resizeData.current.startW + dw),
        height: Math.max(140, resizeData.current.startH + dh)
      })
    }

    const onUp = (): void => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      const { boxes } = useAppStore.getState()
      const updated = boxes.get(box.id)
      if (updated) {
        window.api.updateBox(box.id, { width: updated.width, height: updated.height }).catch(console.error)
      }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [box.id, box.width, box.height, canvasScale, updateBoxLocal])

  // ── Inline Rename ────────────────────────────────────────────────────────────
  const isEditing = isEditingBox === box.id
  const [editValue, setEditValue] = useState(box.name)

  const startEditing = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditValue(box.name)
    setEditingBox(box.id)
  }, [box.name, box.id, setEditingBox])

  const commitRename = useCallback(() => {
    const newName = editValue.trim() || 'Untitled Box'
    setEditingBox(null)
    updateBoxLocal(box.id, { name: newName })
    window.api.updateBox(box.id, { name: newName }).catch(console.error)
  }, [editValue, box.id, setEditingBox, updateBoxLocal])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') {
      setEditValue(box.name)
      setEditingBox(null)
    }
  }, [commitRename, box.name, setEditingBox])

  // ── Collapse / Expand ────────────────────────────────────────────────────────
  const toggleCollapse = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const newVal = !box.collapsed
    updateBoxLocal(box.id, { collapsed: newVal })
    window.api.updateBox(box.id, { collapsed: newVal }).catch(console.error)
  }, [box.collapsed, box.id, updateBoxLocal])

  // ── Delete box ────────────────────────────────────────────────────────────────
  const handleDelete = useCallback(async () => {
    await window.api.deleteBox(box.id)
    removeBox(box.id)
  }, [box.id, removeBox])

  // ── Context Menu ─────────────────────────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    showContextMenu({
      visible: true,
      type: 'box',
      x: e.clientX,
      y: e.clientY,
      targetId: box.id
    })
  }, [box.id, showContextMenu])

  // ── Drop: accept images from tray ────────────────────────────────────────────
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('application/moodboard-images')) {
      setIsDragOver(true)
    }
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation()
    if (!boxRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.types.includes('application/moodboard-images')) {
      e.dataTransfer.dropEffect = 'link'
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const raw = e.dataTransfer.getData('application/moodboard-images')
    if (!raw) return

    const imageIds: string[] = JSON.parse(raw)
    if (imageIds.length === 0) return

    try {
      await window.api.addImagesToBox(box.id, imageIds)
      assignImagesToBox(box.id, imageIds)
      notify('success', `Added ${imageIds.length} image${imageIds.length !== 1 ? 's' : ''} to "${box.name}"`)
    } catch (err) {
      notify('error', 'Failed to add images to box')
    }

    clearDrag()
  }, [box.id, box.name, assignImagesToBox, notify, clearDrag])

  // ── Remove image from box ─────────────────────────────────────────────────────
  const handleRemoveImage = useCallback(async (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation()
    await window.api.removeImagesFromBox(box.id, [imageId])
    unassignImagesFromBox(box.id, [imageId])
  }, [box.id, unassignImagesFromBox])

  const boxImages = getBoxImages(box.id)
  const isSelected = selectedBoxId === box.id

  return (
    <div
      ref={boxRef}
      className={[
        'canvas-box',
        isSelected ? 'selected' : '',
        isDragOver ? 'drag-over' : '',
        box.collapsed ? 'collapsed' : ''
      ].filter(Boolean).join(' ')}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.collapsed ? 'auto' : box.height,
        position: 'absolute'    // Positioned in canvas-world space
      }}
      onContextMenu={handleContextMenu}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={(e) => { e.stopPropagation(); selectBox(box.id) }}
    >
      {/* Colored accent bar at top */}
      <div className="box-color-bar" style={{ background: box.color }} />

      {/* Header: drag handle + name + actions */}
      <div className="box-header" onMouseDown={handleHeaderMouseDown}>
        <span className="box-icon">📁</span>

        {isEditing ? (
          <input
            className="box-name-input"
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleNameKeyDown}
            autoFocus
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          />
        ) : (
          <span className="box-name" onDoubleClick={startEditing} title={box.name}>
            {box.name}
          </span>
        )}

        <span className="box-badge">{box.imageIds.length}</span>

        <div className="box-header-actions">
          <button
            className="btn-icon"
            onClick={toggleCollapse}
            title={box.collapsed ? 'Expand' : 'Collapse'}
            style={{ fontSize: 10 }}
          >
            {box.collapsed ? '▼' : '▲'}
          </button>
          <button
            className="btn-icon"
            onClick={handleDelete}
            title="Delete box"
            style={{ color: 'var(--error)', opacity: 0.6 }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0.6')}
          >
            ✕
          </button>
        </div>
      </div>

      {/* Body: images grid */}
      {!box.collapsed && (
        <div className="box-body">
          {boxImages.length > 0 ? (
            <div className="box-images">
              {boxImages.map(img => (
                <BoxImageThumb
                  key={img.id}
                  image={img}
                  onRemove={(e) => handleRemoveImage(e, img.id)}
                />
              ))}
            </div>
          ) : (
            <div className="box-drop-hint">
              <div style={{ fontSize: 20 }}>📸</div>
              <div>Drag images here</div>
            </div>
          )}
        </div>
      )}

      {/* Resize handle — bottom right corner */}
      {!box.collapsed && (
        <div className="box-resize-handle" onMouseDown={handleResizeMouseDown} />
      )}
    </div>
  )
}

// ── Thumbnail inside box ────────────────────────────────────────────────────────

interface BoxImageThumbProps {
  image: ImageFile
  onRemove: (e: React.MouseEvent) => void
}

function BoxImageThumb({ image, onRemove }: BoxImageThumbProps): React.JSX.Element {
  const { setPreviewImage } = useAppStore()

  return (
    <div
      className="box-image-thumb"
      onClick={() => setPreviewImage(image.id)}
      title={image.fileName}
    >
      <img
        src={toLocalFileUrl(image.filePath)}
        alt={image.fileName}
        loading="lazy"
        decoding="async"
      />
      <button className="box-image-remove" onClick={onRemove} title="Remove from box">
        ✕
      </button>
    </div>
  )
}

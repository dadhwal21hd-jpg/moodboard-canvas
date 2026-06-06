/**
 * ImageTray.tsx — Left sidebar showing all imported images
 *
 * Images here are the "staging area" — you drag them from here into boxes.
 *
 * HOW DRAG-AND-DROP WORKS:
 * 1. User starts dragging a thumbnail (onDragStart)
 * 2. We store the image IDs in dataTransfer (a web API for carrying drag data)
 * 3. The CanvasBox receives the drop (onDrop) and reads those IDs
 * 4. We call the API to save the assignment, then update local state
 *
 * DATA TRANSFER TYPE: "application/moodboard-images"
 * This custom type ensures we don't confuse our drags with OS file drags.
 */

import React, { useCallback, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { ImageFile } from '../../types'
import { toLocalFileUrl } from '../../types'

export function ImageTray(): React.JSX.Element {
  const {
    images, filteredImages, selectedImageIds,
    selectImage, clearSelection, setDragState, clearDrag,
    searchQuery, setSearchQuery, showUnassignedOnly, setShowUnassigned,
    removeImage, notify
  } = useAppStore()

  const displayImages = filteredImages()
  const totalCount = images.size

  // ── Import: open file dialog ─────────────────────────────────────────────────
  const handleImportFiles = useCallback(async () => {
    try {
      const paths = await window.api.openFileDialog()
      if (paths.length === 0) return

      const newImages = await window.api.addImages(paths)
      if (newImages.length > 0) {
        useAppStore.getState().addImages(newImages)
        notify('success', `Imported ${newImages.length} image${newImages.length !== 1 ? 's' : ''}`)
      } else {
        notify('info', 'No new images found (duplicates were skipped)')
      }
    } catch (err) {
      notify('error', 'Failed to import images')
    }
  }, [notify])

  // ── Import: open folder dialog ───────────────────────────────────────────────
  const handleImportFolder = useCallback(async () => {
    try {
      const paths = await window.api.openFolderDialog()
      if (paths.length === 0) {
        notify('info', 'No images found in selected folder')
        return
      }

      const newImages = await window.api.addImages(paths)
      if (newImages.length > 0) {
        useAppStore.getState().addImages(newImages)
        notify('success', `Imported ${newImages.length} images from folder`)
      } else {
        notify('info', 'All images in folder already imported')
      }
    } catch (err) {
      notify('error', 'Failed to import folder')
    }
  }, [notify])

  return (
    <aside className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title">
          <span>Image Library</span>
          <span className="sidebar-count">{totalCount}</span>
        </div>

        {/* Import buttons */}
        <div className="sidebar-actions">
          <button className="btn btn-primary" onClick={handleImportFiles} title="Import individual image files">
            + Files
          </button>
          <button className="btn btn-subtle" onClick={handleImportFolder} title="Import all images from a folder">
            + Folder
          </button>
        </div>

        {/* Search */}
        <div className="sidebar-search">
          <span className="sidebar-search-icon">🔍</span>
          <input
            type="text"
            placeholder="Search by filename..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Filter chips */}
      <div className="sidebar-filter-bar">
        <button
          className={`filter-chip ${!showUnassignedOnly ? 'active' : ''}`}
          onClick={() => setShowUnassigned(false)}
        >
          All
        </button>
        <button
          className={`filter-chip ${showUnassignedOnly ? 'active' : ''}`}
          onClick={() => setShowUnassigned(true)}
        >
          Unassigned
        </button>
        {selectedImageIds.size > 0 && (
          <button
            className="filter-chip"
            onClick={clearSelection}
            style={{ marginLeft: 'auto' }}
          >
            ✕ {selectedImageIds.size}
          </button>
        )}
      </div>

      {/* Image grid */}
      {displayImages.length === 0 ? (
        <TrayEmpty onImportFiles={handleImportFiles} onImportFolder={handleImportFolder} />
      ) : (
        <div className="image-tray">
          {displayImages.map(img => (
            <TrayImage
              key={img.id}
              image={img}
              isSelected={selectedImageIds.has(img.id)}
              selectedCount={selectedImageIds.size}
              allSelectedIds={selectedImageIds}
              onSelect={selectImage}
              onRemove={async (id) => {
                await window.api.deleteImage(id)
                removeImage(id)
              }}
              onDragStart={() => setDragState({ isDragging: true, imageIds: Array.from(selectedImageIds.has(img.id) ? selectedImageIds : new Set([img.id])) })}
              onDragEnd={clearDrag}
            />
          ))}
        </div>
      )}
    </aside>
  )
}

// ── Individual tray image ───────────────────────────────────────────────────────

interface TrayImageProps {
  image: ImageFile
  isSelected: boolean
  selectedCount: number
  allSelectedIds: Set<string>
  onSelect: (id: string, multi: boolean) => void
  onRemove: (id: string) => void
  onDragStart: () => void
  onDragEnd: () => void
}

function TrayImage({
  image, isSelected, selectedCount, allSelectedIds, onSelect, onRemove, onDragStart, onDragEnd
}: TrayImageProps): React.JSX.Element {
  const { setPreviewImage } = useAppStore()

  const handleClick = useCallback((e: React.MouseEvent) => {
    onSelect(image.id, e.ctrlKey || e.metaKey)
  }, [image.id, onSelect])

  const handleDoubleClick = useCallback(() => {
    setPreviewImage(image.id)
  }, [image.id, setPreviewImage])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    const dragIds = allSelectedIds.has(image.id)
      ? Array.from(allSelectedIds)
      : [image.id]

    // fromBoxId: null means coming from the tray
    e.dataTransfer.setData(
      'application/moodboard-images',
      JSON.stringify({ imageIds: dragIds, fromBoxId: null })
    )
    e.dataTransfer.effectAllowed = 'link'

    if (dragIds.length > 1) {
      const ghost = document.createElement('div')
      ghost.className = 'drag-ghost'
      ghost.textContent = `${dragIds.length} images`
      document.body.appendChild(ghost)
      e.dataTransfer.setDragImage(ghost, 40, 15)
      setTimeout(() => document.body.removeChild(ghost), 0)
    }

    onDragStart()
  }, [image.id, allSelectedIds, onDragStart])

  const handleRemove = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onRemove(image.id)
  }, [image.id, onRemove])

  return (
    <div
      className={`tray-image ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={onDragEnd}
      title={image.fileName}
    >
      <img
        src={toLocalFileUrl(image.filePath)}
        alt={image.fileName}
        loading="lazy"
        decoding="async"
      />
      <div className="tray-image-name">{image.fileName}</div>
      {/* Remove button — shows on hover via CSS */}
      <button
        className="tray-image-remove"
        onClick={handleRemove}
        title="Remove from library"
      >
        ✕
      </button>
    </div>
  )
}

// ── Empty state ────────────────────────────────────────────────────────────────

function TrayEmpty({
  onImportFiles, onImportFolder
}: { onImportFiles: () => void; onImportFolder: () => void }): React.JSX.Element {
  return (
    <div className="image-tray">
      <div className="tray-empty">
        <div className="tray-empty-icon">📸</div>
        <div>
          <p>No images yet.</p>
          <p>Click <strong>+ Files</strong> to import images</p>
          <p>or <strong>+ Folder</strong> for a whole folder.</p>
          <p style={{ marginTop: 6 }}>You can also drag & drop<br />image files onto this window.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button className="btn btn-primary" onClick={onImportFiles} style={{ fontSize: 11 }}>
            + Import Files
          </button>
          <button className="btn btn-subtle" onClick={onImportFolder} style={{ fontSize: 11 }}>
            + Import Folder
          </button>
        </div>
      </div>
    </div>
  )
}

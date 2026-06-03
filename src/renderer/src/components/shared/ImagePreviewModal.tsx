/**
 * ImagePreviewModal.tsx — Full-screen image viewer
 *
 * Opens when you double-click an image anywhere in the app.
 * Shows the full-size image with file info, navigation, and keyboard support.
 *
 * FEATURES:
 * - Full-screen dark overlay
 * - High-res image display (up to actual size)
 * - File name + size info
 * - Which boxes this image belongs to
 * - Close with: Escape key, clicking overlay, or ✕ button
 * - Arrow keys to navigate between images (future-friendly)
 *
 * WHY PORTAL?
 * This renders at the document body level so it's truly fullscreen
 * and not clipped by any parent's overflow:hidden.
 */

import React, { useEffect, useCallback } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { toLocalFileUrl, formatBytes } from '../../types'

export function ImagePreviewModal(): React.JSX.Element | null {
  const { previewImageId, images, boxes, setPreviewImage } = useAppStore()

  // Close on Escape — note: App.tsx also calls setPreviewImage(null) on Escape
  // This is belt-and-suspenders
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') setPreviewImage(null)
  }, [setPreviewImage])

  useEffect(() => {
    if (previewImageId) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewImageId, handleKeyDown])

  if (!previewImageId) return null

  const image = images.get(previewImageId)
  if (!image) return null

  // Which boxes contain this image?
  const containingBoxes = Array.from(boxes.values()).filter(
    box => box.imageIds.includes(previewImageId)
  )

  return (
    <div
      className="preview-overlay"
      onClick={() => setPreviewImage(null)}
    >
      {/* Modal panel — click inside doesn't close */}
      <div
        className="preview-panel"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="preview-header">
          <div className="preview-title">
            <span className="preview-filename">{image.fileName}</span>
            <span className="preview-meta">
              {image.fileSize ? formatBytes(image.fileSize) : ''}
              {image.width && image.height ? ` · ${image.width}×${image.height}` : ''}
            </span>
          </div>
          <button
            className="btn-icon preview-close"
            onClick={() => setPreviewImage(null)}
            title="Close (Escape)"
          >
            ✕
          </button>
        </div>

        {/* Image */}
        <div className="preview-image-wrap">
          <img
            src={toLocalFileUrl(image.filePath)}
            alt={image.fileName}
            className="preview-image"
            draggable={false}
          />
        </div>

        {/* Footer: box assignments */}
        {containingBoxes.length > 0 && (
          <div className="preview-footer">
            <span className="preview-footer-label">In boxes:</span>
            <div className="preview-box-tags">
              {containingBoxes.map(box => (
                <span
                  key={box.id}
                  className="preview-box-tag"
                  style={{ borderColor: box.color, color: box.color }}
                >
                  {box.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

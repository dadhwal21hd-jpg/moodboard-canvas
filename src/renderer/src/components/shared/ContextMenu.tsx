/**
 * ContextMenu.tsx — Right-click context menus
 *
 * There are 3 types of context menus:
 * 1. 'canvas'  — Right-click on empty canvas → "Create box here"
 * 2. 'box'     — Right-click on a box → rename, export, delete, color picker
 * 3. 'image'   — Right-click on an image in sidebar
 *
 * HOW CONTEXT MENUS WORK:
 * - User right-clicks anywhere in the app
 * - The component that was clicked calls `showContextMenu({ type, x, y, targetId })`
 * - This component reads those values and shows the right menu at (x, y)
 * - Clicking any item calls the action, then `hideContextMenu()`
 * - Clicking outside closes it (handled in App.tsx via onClick)
 *
 * Position: fixed to screen (not canvas) — so it always appears at cursor
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { BOX_COLORS } from '../../types'
import { v4 as uuidv4 } from 'uuid'

export function ContextMenu(): React.JSX.Element | null {
  const {
    contextMenu,
    hideContextMenu,
    boxes,
    images,
    canvasTransform,
    addBox,
    removeBox,
    setEditingBox,
    notify,
    removeImage
  } = useAppStore()

  const menuRef = useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState({ x: contextMenu.x, y: contextMenu.y })

  // Adjust position so menu doesn't go off-screen
  useEffect(() => {
    if (!menuRef.current) return
    const menu = menuRef.current
    const { width, height } = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    setAdjustedPos({
      x: Math.min(contextMenu.x, vw - width - 8),
      y: Math.min(contextMenu.y, vh - height - 8)
    })
  }, [contextMenu.x, contextMenu.y])

  if (!contextMenu.visible) return null

  // ─── Canvas Menu: right-click on empty canvas ─────────────────────────────
  if (contextMenu.type === 'canvas') {
    return (
      <ContextMenuWrapper ref={menuRef} x={adjustedPos.x} y={adjustedPos.y}>
        <MenuHeader>Canvas</MenuHeader>
        <MenuItem
          icon="📦"
          label="New Box Here"
          onClick={async () => {
            // Convert screen coords to canvas-space
            const canvasX = (contextMenu.x - canvasTransform.x) / canvasTransform.scale
            const canvasY = (contextMenu.y - canvasTransform.y) / canvasTransform.scale

            try {
              const box = await window.api.createBox('Untitled Box', canvasX - 150, canvasY - 30)
              addBox(box)
              // Immediately put it into rename mode
              setTimeout(() => setEditingBox(box.id), 50)
              hideContextMenu()
            } catch {
              notify('error', 'Failed to create box')
            }
          }}
        />
        <MenuItem
          icon="🎯"
          label="Reset Canvas View"
          onClick={() => {
            useAppStore.getState().resetCanvas()
            hideContextMenu()
          }}
        />
      </ContextMenuWrapper>
    )
  }

  // ─── Box Menu: right-click on a box ──────────────────────────────────────
  if (contextMenu.type === 'box' && contextMenu.targetId) {
    const box = boxes.get(contextMenu.targetId)
    if (!box) return null

    return (
      <ContextMenuWrapper ref={menuRef} x={adjustedPos.x} y={adjustedPos.y}>
        <MenuHeader>{box.name}</MenuHeader>

        <MenuItem
          icon="✏️"
          label="Rename"
          onClick={() => {
            setEditingBox(box.id)
            hideContextMenu()
          }}
        />

        {/* Color picker row */}
        <div className="context-color-row">
          <span className="context-color-label">Color:</span>
          <div className="context-color-swatches">
            {BOX_COLORS.map(color => (
              <button
                key={color}
                className="context-color-swatch"
                style={{
                  background: color,
                  outline: box.color === color ? `2px solid white` : 'none',
                  outlineOffset: 1
                }}
                onClick={async () => {
                  await window.api.updateBox(box.id, { color })
                  useAppStore.getState().updateBoxLocal(box.id, { color })
                  hideContextMenu()
                }}
                title={color}
              />
            ))}
          </div>
        </div>

        <MenuDivider />

        <MenuItem
          icon="📤"
          label={`Export Box (${box.imageIds.length} images)`}
          onClick={async () => {
            hideContextMenu()
            if (box.imageIds.length === 0) {
              notify('info', 'Box is empty — nothing to export')
              return
            }
            try {
              notify('info', `Exporting "${box.name}"...`)
              const result = await window.api.exportBox(box.id)
              if (result.success) {
                notify('success', `Exported ${result.exported ?? 0} images to "${box.name}" folder`)
              } else {
                notify('error', result.error ?? 'Export failed')
              }
            } catch {
              notify('error', 'Export failed')
            }
          }}
        />

        <MenuItem
          icon="🗜️"
          label="Export as ZIP"
          onClick={async () => {
            hideContextMenu()
            if (box.imageIds.length === 0) {
              notify('info', 'Box is empty — nothing to export')
              return
            }
            try {
              notify('info', `Creating ZIP for "${box.name}"...`)
              const result = await window.api.exportZip(box.id)
              if (result.success) {
                const sizeMb = ((result.size ?? 0) / (1024 * 1024)).toFixed(1)
                notify('success', `ZIP created: ${box.name}.zip (${sizeMb} MB)`)
              } else {
                notify('error', result.error ?? 'ZIP export failed')
              }
            } catch {
              notify('error', 'ZIP export failed')
            }
          }}
        />

        <MenuDivider />

        <MenuItem
          icon="🗑️"
          label="Delete Box"
          danger
          onClick={async () => {
            hideContextMenu()
            try {
              await window.api.deleteBox(box.id)
              removeBox(box.id)
              notify('info', `Deleted "${box.name}"`)
            } catch {
              notify('error', 'Failed to delete box')
            }
          }}
        />
      </ContextMenuWrapper>
    )
  }

  // ─── Image Menu: right-click on a tray image ─────────────────────────────
  if (contextMenu.type === 'image' && contextMenu.targetId) {
    const image = images.get(contextMenu.targetId)
    if (!image) return null

    return (
      <ContextMenuWrapper ref={menuRef} x={adjustedPos.x} y={adjustedPos.y}>
        <MenuHeader>{image.fileName}</MenuHeader>

        <MenuItem
          icon="🔍"
          label="Preview Full Size"
          onClick={() => {
            useAppStore.getState().setPreviewImage(image.id)
            hideContextMenu()
          }}
        />

        <MenuItem
          icon="📂"
          label="Show in Explorer"
          onClick={async () => {
            // Extract folder path from file path
            const folderPath = image.filePath.replace(/[/\\][^/\\]+$/, '')
            await window.api.openInExplorer(folderPath)
            hideContextMenu()
          }}
        />

        <MenuDivider />

        <MenuItem
          icon="🗑️"
          label="Remove from Library"
          danger
          onClick={async () => {
            hideContextMenu()
            try {
              await window.api.deleteImage(image.id)
              removeImage(image.id)
              notify('info', `Removed "${image.fileName}"`)
            } catch {
              notify('error', 'Failed to remove image')
            }
          }}
        />
      </ContextMenuWrapper>
    )
  }

  return null
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const ContextMenuWrapper = React.forwardRef<
  HTMLDivElement,
  { x: number; y: number; children: React.ReactNode }
>(function ContextMenuWrapper({ x, y, children }, ref) {
  return (
    <div
      ref={ref}
      className="context-menu"
      style={{ left: x, top: y }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>
  )
})

function MenuHeader({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <div className="context-menu-header">{children}</div>
}

function MenuDivider(): React.JSX.Element {
  return <div className="context-menu-divider" />
}

interface MenuItemProps {
  icon: string
  label: string
  onClick: () => void
  danger?: boolean
}

function MenuItem({ icon, label, onClick, danger }: MenuItemProps): React.JSX.Element {
  return (
    <button
      className={`context-menu-item ${danger ? 'danger' : ''}`}
      onClick={onClick}
    >
      <span className="context-menu-item-icon">{icon}</span>
      <span className="context-menu-item-label">{label}</span>
    </button>
  )
}

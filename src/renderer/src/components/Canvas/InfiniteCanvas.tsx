/**
 * InfiniteCanvas.tsx — The main canvas
 *
 * HOW THE INFINITE CANVAS WORKS (learn this, it's important):
 *
 * There are two coordinate spaces:
 * 1. SCREEN space  — pixel positions on your actual monitor
 * 2. CANVAS space  — logical positions in the infinite world
 *
 * The canvas-world div gets a CSS transform: translate(X,Y) scale(S)
 * - X, Y = pan offset (how much we've shifted the view)
 * - S    = zoom level (1.0 = 100%, 2.0 = 200%, etc.)
 *
 * Converting screen → canvas (for placing new boxes):
 *   canvasX = (screenX - offsetX) / scale
 *   canvasY = (screenY - offsetY) / scale
 *
 * Converting canvas → screen (for finding where to show menus):
 *   screenX = canvasX * scale + offsetX
 *   screenY = canvasY * scale + offsetY
 *
 * ZOOM TOWARD CURSOR formula:
 *   newOffset = mousePos - (mousePos - offset) * (newScale / oldScale)
 *
 * This keeps the point under the cursor fixed while scaling.
 */

import React, { useRef, useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { CanvasBox } from './CanvasBox'
import type { CanvasTransform } from '../../types'

const MIN_SCALE = 0.05
const MAX_SCALE = 8
const ZOOM_FACTOR = 0.1    // How much each scroll tick zooms

export function InfiniteCanvas(): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const transformRef = useRef<CanvasTransform>({ x: 0, y: 0, scale: 1 })

  // Separate refs for panning (avoids React re-render on every mousemove)
  const isPanning = useRef(false)
  const panStart = useRef({ mouseX: 0, mouseY: 0, tx: 0, ty: 0 })
  const isSpaceDown = useRef(false)

  const [, forceRender] = useState(0)  // Used to trigger re-render when transform changes

  const {
    canvasTransform, setCanvasTransform, boxes,
    showContextMenu, notify
  } = useAppStore()

  // Sync from store to ref on load
  useEffect(() => {
    transformRef.current = canvasTransform
    applyTransformDom(canvasTransform)
  }, []) // Only on mount — after that we manage ourselves

  // ── Apply transform directly to DOM (no React re-render during pan) ─────────
  function applyTransformDom(t: CanvasTransform): void {
    if (worldRef.current) {
      worldRef.current.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.scale})`
    }
  }

  // ── Save transform to store (triggers React re-render for boxes) ────────────
  const commitTransform = useCallback((t: CanvasTransform) => {
    setCanvasTransform(t)
    transformRef.current = t
    // Debounced save to disk
    const debouncedSave = (() => {
      let timer: NodeJS.Timeout | null = null
      return (transform: CanvasTransform) => {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          window.api.saveCanvasState(transform.x, transform.y, transform.scale).catch(() => {})
          timer = null
        }, 1000)
      }
    })()
    debouncedSave(t)
  }, [setCanvasTransform])

  // ── Coordinate conversions ───────────────────────────────────────────────────
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const rect = viewportRef.current!.getBoundingClientRect()
    const t = transformRef.current
    return {
      x: (screenX - rect.left - t.x) / t.scale,
      y: (screenY - rect.top  - t.y) / t.scale
    }
  }, [])

  // ── ZOOM ─────────────────────────────────────────────────────────────────────
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const t = transformRef.current
    const rect = viewportRef.current!.getBoundingClientRect()

    // Mouse position relative to viewport
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top

    // Calculate new scale
    const direction = e.deltaY < 0 ? 1 : -1
    const factor = 1 + direction * ZOOM_FACTOR
    const newScale = Math.min(Math.max(t.scale * factor, MIN_SCALE), MAX_SCALE)

    // Zoom toward cursor: keep the point under cursor fixed
    const newX = mouseX - (mouseX - t.x) * (newScale / t.scale)
    const newY = mouseY - (mouseY - t.y) * (newScale / t.scale)

    const newT = { x: newX, y: newY, scale: newScale }
    transformRef.current = newT
    applyTransformDom(newT)
    forceRender(n => n + 1)   // Trigger re-render so zoom % in toolbar updates
    commitTransform(newT)
  }, [commitTransform])

  // Attach wheel listener with { passive: false } so we can preventDefault
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [handleWheel])

  // ── PAN ───────────────────────────────────────────────────────────────────────
  const startPan = useCallback((e: MouseEvent) => {
    isPanning.current = true
    panStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      tx: transformRef.current.x,
      ty: transformRef.current.y
    }
    viewportRef.current?.classList.add('panning')
  }, [])

  // Global mouse handlers for panning (attached to document so panning works outside viewport)
  useEffect(() => {
    const onMouseMove = (e: MouseEvent): void => {
      if (!isPanning.current) return

      const dx = e.clientX - panStart.current.mouseX
      const dy = e.clientY - panStart.current.mouseY
      const newT = {
        ...transformRef.current,
        x: panStart.current.tx + dx,
        y: panStart.current.ty + dy
      }
      transformRef.current = newT
      applyTransformDom(newT)
    }

    const onMouseUp = (): void => {
      if (isPanning.current) {
        isPanning.current = false
        viewportRef.current?.classList.remove('panning')
        commitTransform(transformRef.current)
        forceRender(n => n + 1)
      }
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [commitTransform])

  // ── Spacebar pan mode ─────────────────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault()
        isSpaceDown.current = true
        viewportRef.current?.classList.add('pan-mode')
      }
    }
    const onKeyUp = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        isSpaceDown.current = false
        viewportRef.current?.classList.remove('pan-mode')
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  // ── Canvas mouse down ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Middle mouse button = pan
    if (e.button === 1) {
      e.preventDefault()
      startPan(e.nativeEvent)
      return
    }

    // Left mouse + spacebar = pan
    if (e.button === 0 && isSpaceDown.current) {
      startPan(e.nativeEvent)
      return
    }

    // Left click on background = deselect
    if (e.button === 0 && e.target === e.currentTarget) {
      useAppStore.getState().clearSelection()
      useAppStore.getState().selectBox(null)
    }
  }, [startPan])

  // ── Double click = create new box ────────────────────────────────────────────
  const handleDoubleClick = useCallback(async (e: React.MouseEvent) => {
    // Only trigger on canvas background (not on boxes)
    if (e.target !== e.currentTarget && e.target !== worldRef.current) return

    const canvasPos = screenToCanvas(e.clientX, e.clientY)
    const boxX = canvasPos.x - 160  // Center box on click
    const boxY = canvasPos.y - 140

    try {
      const box = await window.api.createBox('New Box', boxX, boxY, 320, 280)
      useAppStore.getState().addBox(box)
      // Auto-start renaming the new box
      setTimeout(() => useAppStore.getState().setEditingBox(box.id), 50)
    } catch (err) {
      notify('error', 'Failed to create box')
    }
  }, [screenToCanvas, notify])

  // ── Right click = canvas context menu ────────────────────────────────────────
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Only on empty canvas
    if (e.target !== e.currentTarget && e.target !== worldRef.current) return
    e.preventDefault()

    const canvasPos = screenToCanvas(e.clientX, e.clientY)
    showContextMenu({
      visible: true,
      type: 'canvas',
      x: e.clientX,
      y: e.clientY,
      canvasX: canvasPos.x,
      canvasY: canvasPos.y
    })
  }, [screenToCanvas, showContextMenu])

  const boxList = Array.from(boxes.values())

  return (
    <div
      ref={viewportRef}
      className="canvas-viewport"
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
      onContextMenu={handleContextMenu}
    >
      {/* Canvas world — all boxes positioned inside here */}
      <div ref={worldRef} className="canvas-world">
        {boxList.map(box => (
          <CanvasBox
            key={box.id}
            box={box}
            canvasScale={transformRef.current.scale}
            screenToCanvas={screenToCanvas}
          />
        ))}
      </div>

      {/* Zoom indicator bottom-left */}
      <ZoomIndicator />

      {/* Helper hint when canvas is empty */}
      {boxList.length === 0 && <EmptyCanvasHint />}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ZoomIndicator(): React.JSX.Element {
  const { canvasTransform, resetCanvas } = useAppStore()
  const zoomPct = Math.round(canvasTransform.scale * 100)

  return (
    <div
      className="zoom-display"
      style={{ position: 'absolute', bottom: 16, left: 16, zIndex: 30 }}
      onClick={resetCanvas}
      title="Click to reset view (100%)"
    >
      {zoomPct}%
    </div>
  )
}

function EmptyCanvasHint(): React.JSX.Element {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 10, pointerEvents: 'none', opacity: 0.35
    }}>
      <div style={{ fontSize: 48 }}>🎨</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)' }}>
        Double-click anywhere to create a box
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Import images from the left panel → drag them into boxes
      </div>
    </div>
  )
}

# 🎨 Moodboard Canvas

A premium infinite-canvas image organizer for fashion & creative professionals.
Built with Electron + React + TypeScript. Inspired by PureRef, Milanote, ComfyUI, and Miro.

---

## What It Does

- **Infinite canvas** — pan with middle mouse, zoom with scroll wheel
- **Visual boxes** — double-click canvas to create named category buckets
- **Image tray** — import thousands of images; drag them into boxes
- **Export** — export any box as a real folder with original-quality files, or as ZIP
- **Offline-first** — all data stays on your machine (JSON in AppData, images stay in place)
- **Dark, premium UI** — designed for creative-industry use

---

## Quick Start (Development)

### 1. Requirements
- **Node.js 18+** — download from https://nodejs.org
- **Git** — download from https://git-scm.com (or just extract the zip)

### 2. Install dependencies
```bash
cd moodboard-canvas
npm install
```

### 3. Run in development mode
```bash
npm run dev
```

The app window opens automatically. Hot-reload is enabled — save any file and the renderer refreshes instantly.

---

## Build for Production

### Build (compile all code)
```bash
npm run build
```

Output goes to `out/`:
- `out/main/` — Electron main process
- `out/preload/` — preload bridge
- `out/renderer/` — React frontend (bundled)

### Package as Windows Installer (.exe)
```bash
npm run package:win
```

Requires: Windows, or cross-compilation tools on Mac/Linux.
Output: `dist-app/Moodboard Canvas Setup 1.0.0.exe`

### Package as macOS (.dmg)
```bash
npm run package:mac
```

### Package as Linux (.AppImage)
```bash
npm run package:linux
```

---

## How to Use

### Creating Boxes
- **Double-click** anywhere on the empty canvas
- A new box appears — type to rename it, press **Enter** to confirm
- Right-click a box for: rename, color, export, delete

### Importing Images
- Click **+ Files** in the sidebar to select individual images
- Click **+ Folder** to import an entire folder
- Drag image files directly from Windows Explorer onto the app

### Assigning Images to Boxes
- Click an image in the sidebar to select it (Ctrl+click for multi-select)
- Drag selected images onto any box on the canvas
- The box highlights when you hover over it while dragging

### Exporting
- **Right-click a box → Export Box** — creates a folder with original images
- **Right-click a box → Export as ZIP** — creates a .zip file
- **Export All** button in the toolbar — exports all boxes at once

### Canvas Navigation
| Action | How |
|--------|-----|
| Pan | Middle mouse button drag |
| Zoom | Scroll wheel |
| Create box | Double-click empty canvas |
| Reset view | Click zoom % label in toolbar |
| Full-screen preview | Double-click any image |
| Close preview | Escape key or ✕ button |
| Multi-select images | Ctrl + click |
| Right-click menu | Right-click any box or image |

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Escape` | Close modal / deselect all |
| `Ctrl+Click` | Multi-select images in tray |
| `Enter` | Confirm box rename |

---

## Data & Storage

- **Image library** — your original files are **never moved or compressed**. The app just stores their paths.
- **Workspace data** — saved to:
  - Windows: `C:\Users\<you>\AppData\Roaming\moodboard-canvas\moodboard-data.json`
  - Mac: `~/Library/Application Support/moodboard-canvas/moodboard-data.json`
  - Linux: `~/.config/moodboard-canvas/moodboard-data.json`
- **Auto-save** — every action auto-saves. No manual save needed.
- **Crash recovery** — data is flushed to disk on every change (debounced 800ms) and on quit.

---

## Project Structure

```
moodboard-canvas/
├── src/
│   ├── main/                    ← Electron main process (Node.js)
│   │   ├── index.ts             ← Window creation, custom protocol
│   │   ├── database.ts          ← JSON file persistence
│   │   └── ipcHandlers.ts       ← All IPC channels (file dialogs, export, etc.)
│   ├── preload/
│   │   └── index.ts             ← contextBridge — exposes window.api
│   └── renderer/
│       └── src/                 ← React frontend
│           ├── types.ts         ← All TypeScript types
│           ├── App.tsx          ← Root layout, keyboard shortcuts
│           ├── index.css        ← All styles (CSS variables + components)
│           ├── store/
│           │   └── useAppStore.ts  ← Zustand global state
│           └── components/
│               ├── Canvas/
│               │   ├── InfiniteCanvas.tsx  ← Pan, zoom, double-click to create
│               │   └── CanvasBox.tsx       ← Draggable/resizable box nodes
│               ├── Sidebar/
│               │   └── ImageTray.tsx       ← Image library + import
│               ├── Toolbar/
│               │   └── Toolbar.tsx         ← Top bar with controls
│               └── shared/
│                   ├── ContextMenu.tsx     ← Right-click menus
│                   ├── ImagePreviewModal.tsx ← Full-screen image view
│                   └── Notifications.tsx   ← Toast notification system
├── package.json
├── electron.vite.config.ts
└── tsconfig*.json
```

---

## Architecture Notes (for future developers)

### Why Electron (not Tauri)?
Tauri is faster but requires Rust. Electron uses Node.js which is more learnable for a solo dev. Performance is excellent for this use case.

### Why JSON (not SQLite)?
SQLite requires native binaries (node-gyp), which breaks across machines and needs rebuild scripts. JSON is portable, readable, and sufficient for 10,000+ images.

### Why custom drag/resize (not react-rnd)?
react-rnd and similar libraries have bugs with CSS `scale()` transforms on the canvas. Custom implementation using `document.addEventListener` gives exact control over canvas-space coordinate math.

### Canvas Transform Math
```
Canvas position = (screenPos - panOffset) / zoomScale
Screen position = (canvasPos * zoomScale) + panOffset
```

### Adding AI features in the future
The `ImageFile` type has stub fields (`tags`, `embedding`) ready. The database already saves/loads them. To add CLIP or image similarity:
1. Add a Python sidecar process (Electron supports this)
2. Or call a local API (Ollama, etc.)
3. Populate `image.tags` and add a search filter in `useAppStore.filteredImages()`

---

## Troubleshooting

### "Electron not found" on npm run dev
```bash
ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install  # skip download
npm install electron --save-dev              # then install normally
```

### Images not loading (blank thumbnails)
Check that the image file still exists at its original path. The app tracks original locations; moving files will break thumbnails. Re-import to fix.

### App won't start after crash
Delete the workspace file and restart:
- Windows: `%APPDATA%\moodboard-canvas\moodboard-data.json`
- Mac: `~/Library/Application Support/moodboard-canvas/moodboard-data.json`

### Build fails on Windows
Make sure you have Visual Studio Build Tools installed (for native dependencies).
Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/

---

## Roadmap (Future Features)

- [ ] Minimap overlay
- [ ] Undo/Redo (Ctrl+Z)
- [ ] Workspace tabs
- [ ] Image rating / star system
- [ ] Tag system with filter bar
- [ ] Nested boxes
- [ ] Presentation fullscreen mode
- [ ] Duplicate image finder (hash-based)
- [ ] CLIP/AI image search
- [ ] Auto color clustering
- [ ] OCR text extraction
- [ ] Drag to reorder images within box

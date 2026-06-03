import { app, BrowserWindow, protocol, shell, ipcMain, dialog, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { setupDatabase } from './database'
import { registerIpcHandlers } from './ipcHandlers'
import logger from 'electron-log'

// Configure logger
logger.transports.file.level = 'info'
logger.transports.console.level = is.dev ? 'debug' : 'warn'

let mainWindow: BrowserWindow | null = null

/**
 * Register local-file:// protocol so renderer can load images from disk
 * This is the key bridge: React renders <img src="local-file:///path/to/image.jpg" />
 * and Electron serves the actual file from disk safely
 */
function registerLocalFileProtocol(): void {
  protocol.registerFileProtocol('local-file', (request, callback) => {
    try {
      let filePath = request.url.replace('local-file://', '')
      filePath = decodeURIComponent(filePath)

      // On Windows, the path comes as /C:/Users/... — strip the leading slash
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.slice(1)
      }

      callback({ path: filePath })
    } catch (err) {
      logger.error('Protocol handler error:', err)
      callback({ error: -6 }) // FILE_NOT_FOUND
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,          // Custom title bar
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0e0e0f',
      symbolColor: '#888888',
      height: 32
    },
    backgroundColor: '#0e0e0f',
    show: false,           // Show only after ready-to-show
    autoHideMenuBar: true,
    icon: nativeImage.createFromPath(join(__dirname, '../../resources/icon.png')),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,            // Needed for preload to work fully
      webSecurity: true,
      additionalArguments: []
    }
  })

  // Set CSP to allow our local-file:// protocol for images
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval'; img-src 'self' data: local-file: blob:; media-src local-file: blob:;"
        ]
      }
    })
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
    if (is.dev) {
      mainWindow!.webContents.openDevTools({ mode: 'detach' })
    }
    logger.info('Main window shown')
  })

  // Open external links in default browser, not Electron
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Window state IPC
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── App Lifecycle ──────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.moodboard.canvas')

  // Keyboard shortcut optimizations for dev
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // MUST register protocol before creating window
  registerLocalFileProtocol()

  // Initialize database (creates JSON store in userData)
  setupDatabase()

  // Register all IPC handlers
  registerIpcHandlers()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  logger.info(`App started. userData: ${app.getPath('userData')}`)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }

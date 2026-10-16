import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CopierEngine } from './copier-engine.js'
import type { FileItem, TransferOptions } from '../shared/types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | null = null
let currentEngine: CopierEngine | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 840,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f19',
    title: 'G1Copier',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('dialog:select-source-files', async () => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Source Files to Copy',
    properties: ['openFile', 'multiSelections']
  })
  return result.filePaths
})

ipcMain.handle('dialog:select-source-dir', async () => {
  if (!mainWindow) return []
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Source Directory',
    properties: ['openDirectory']
  })
  return result.filePaths
})

ipcMain.handle('dialog:select-target-dir', async () => {
  if (!mainWindow) return null
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Target Directory',
    properties: ['openDirectory', 'createDirectory']
  })
  return result.filePaths[0] || null
})

ipcMain.handle('copier:scan', async (_event, sourcePaths: string[], targetDir: string) => {
  const engine = new CopierEngine()
  return await engine.scanSources(sourcePaths, targetDir)
})

ipcMain.handle('copier:start', async (_event, items: FileItem[], options: TransferOptions) => {
  if (currentEngine) {
    currentEngine.cancel()
  }

  currentEngine = new CopierEngine()

  currentEngine.on('progress', (progress) => {
    mainWindow?.webContents.send('copier:progress', progress)
  })

  currentEngine.on('file-start', (item) => {
    mainWindow?.webContents.send('copier:file-start', item)
  })

  currentEngine.on('file-complete', (item) => {
    mainWindow?.webContents.send('copier:file-complete', item)
  })

  currentEngine.on('file-error', (item) => {
    mainWindow?.webContents.send('copier:file-error', item)
  })

  currentEngine.on('complete', (summary) => {
    mainWindow?.webContents.send('copier:complete', summary)
    if (options.autoOpenTargetOnComplete && summary.targetDirectory) {
      shell.openPath(summary.targetDirectory)
    }
  })

  return await currentEngine.copyFiles(items, options)
})

ipcMain.handle('copier:pause', () => {
  currentEngine?.pause()
  return true
})

ipcMain.handle('copier:resume', () => {
  currentEngine?.resume()
  return true
})

ipcMain.handle('copier:cancel', () => {
  currentEngine?.cancel()
  return true
})

ipcMain.handle('shell:open-path', async (_event, targetPath: string) => {
  return await shell.openPath(targetPath)
})

ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

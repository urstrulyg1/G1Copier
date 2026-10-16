import { contextBridge, ipcRenderer } from 'electron'
import type { FileItem, TransferOptions, TransferProgress, TransferSummary } from '../shared/types.js'

export const api = {
  selectSourceFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:select-source-files'),
  selectSourceDir: (): Promise<string[]> => ipcRenderer.invoke('dialog:select-source-dir'),
  selectTargetDir: (): Promise<string | null> => ipcRenderer.invoke('dialog:select-target-dir'),
  scan: (sourcePaths: string[], targetDir: string): Promise<FileItem[]> =>
    ipcRenderer.invoke('copier:scan', sourcePaths, targetDir),
  start: (items: FileItem[], options: TransferOptions): Promise<TransferSummary> =>
    ipcRenderer.invoke('copier:start', items, options),
  pause: (): Promise<boolean> => ipcRenderer.invoke('copier:pause'),
  resume: (): Promise<boolean> => ipcRenderer.invoke('copier:resume'),
  cancel: (): Promise<boolean> => ipcRenderer.invoke('copier:cancel'),
  openPath: (targetPath: string): Promise<string> => ipcRenderer.invoke('shell:open-path', targetPath),
  getVersion: (): Promise<string> => ipcRenderer.invoke('app:get-version'),

  onProgress: (callback: (progress: TransferProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: TransferProgress) => callback(progress)
    ipcRenderer.on('copier:progress', handler)
    return () => ipcRenderer.removeListener('copier:progress', handler)
  },
  onFileStart: (callback: (item: FileItem) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, item: FileItem) => callback(item)
    ipcRenderer.on('copier:file-start', handler)
    return () => ipcRenderer.removeListener('copier:file-start', handler)
  },
  onFileComplete: (callback: (item: FileItem) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, item: FileItem) => callback(item)
    ipcRenderer.on('copier:file-complete', handler)
    return () => ipcRenderer.removeListener('copier:file-complete', handler)
  },
  onFileError: (callback: (item: FileItem) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, item: FileItem) => callback(item)
    ipcRenderer.on('copier:file-error', handler)
    return () => ipcRenderer.removeListener('copier:file-error', handler)
  },
  onComplete: (callback: (summary: TransferSummary) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, summary: TransferSummary) => callback(summary)
    ipcRenderer.on('copier:complete', handler)
    return () => ipcRenderer.removeListener('copier:complete', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', api)
  } catch (error) {
    console.error('Failed to expose electronAPI via contextBridge:', error)
  }
} else {
  // @ts-ignore (fallback when context isolation is disabled)
  window.electronAPI = api
}

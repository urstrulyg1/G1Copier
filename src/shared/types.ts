export type CopyStatus = 'idle' | 'scanning' | 'copying' | 'verifying' | 'paused' | 'completed' | 'cancelled' | 'error'

export type FileItemStatus = 'pending' | 'copying' | 'verifying' | 'verified' | 'completed' | 'skipped' | 'failed'

export type ConflictResolution = 'overwrite' | 'skip' | 'rename'

export type TransferMode = 'fast' | 'verify' | 'mirror'

export interface FileItem {
  id: string
  sourcePath: string
  relativePath: string
  targetPath: string
  size: number
  copiedBytes: number
  status: FileItemStatus
  sourceHash?: string
  targetHash?: string
  error?: string
}

export interface TransferOptions {
  mode: TransferMode
  conflictResolution: ConflictResolution
  concurrency: number
  bufferSizeBytes: number
  autoOpenTargetOnComplete?: boolean
  preserveTimestamps?: boolean
}

export interface TransferProgress {
  status: CopyStatus
  totalFiles: number
  completedFiles: number
  totalBytes: number
  copiedBytes: number
  speedBps: number
  elapsedMs: number
  estimatedMsRemaining: number
  currentFile?: string
  currentFilePercent?: number
}

export interface TransferSummary {
  id: string
  timestamp: number
  sourcePaths: string[]
  targetDirectory: string
  totalFiles: number
  totalBytes: number
  durationMs: number
  averageSpeedBps: number
  verifiedFiles: number
  failedFiles: number
  skippedFiles: number
}

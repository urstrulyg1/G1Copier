import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import type {
  FileItem,
  TransferOptions,
  TransferProgress,
  TransferSummary,
  CopyStatus
} from '../shared/types.js'

export class CopierEngine extends EventEmitter {
  private isPaused = false
  private isCancelled = false
  private currentStatus: CopyStatus = 'idle'
  private startTime = 0
  private pauseTime = 0
  private totalPausedDuration = 0
  private totalBytes = 0
  private copiedBytes = 0
  private completedFilesCount = 0
  private activeStreams: { reader?: fs.ReadStream; writer?: fs.WriteStream; tempPath?: string }[] = []
  private speedSamples: { time: number; bytes: number }[] = []

  constructor() {
    super()
  }

  public getStatus(): CopyStatus {
    return this.currentStatus
  }

  public async scanSources(sourcePaths: string[], targetDir: string): Promise<FileItem[]> {
    this.currentStatus = 'scanning'
    const items: FileItem[] = []
    let idCounter = 0

    for (const sourcePath of sourcePaths) {
      if (!fs.existsSync(sourcePath)) continue

      const stat = fs.statSync(sourcePath)
      if (stat.isFile()) {
        const base = path.basename(sourcePath)
        items.push({
          id: `file-${++idCounter}`,
          sourcePath,
          relativePath: base,
          targetPath: path.join(targetDir, base),
          size: stat.size,
          copiedBytes: 0,
          status: 'pending'
        })
      } else if (stat.isDirectory()) {
        const baseFolderName = path.basename(sourcePath)
        const walk = (currentDir: string, relBase: string) => {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true })
          for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name)
            const itemRelPath = path.join(relBase, entry.name)
            if (entry.isDirectory()) {
              walk(fullPath, itemRelPath)
            } else if (entry.isFile()) {
              const fileStat = fs.statSync(fullPath)
              items.push({
                id: `file-${++idCounter}`,
                sourcePath: fullPath,
                relativePath: itemRelPath,
                targetPath: path.join(targetDir, itemRelPath),
                size: fileStat.size,
                copiedBytes: 0,
                status: 'pending'
              })
            }
          }
        }
        walk(sourcePath, baseFolderName)
      }
    }

    this.currentStatus = 'idle'
    return items
  }

  public pause(): void {
    if (this.currentStatus === 'copying') {
      this.isPaused = true
      this.pauseTime = Date.now()
      this.currentStatus = 'paused'
      this.emitProgress()
    }
  }

  public resume(): void {
    if (this.currentStatus === 'paused') {
      this.isPaused = false
      if (this.pauseTime > 0) {
        this.totalPausedDuration += Date.now() - this.pauseTime
        this.pauseTime = 0
      }
      this.currentStatus = 'copying'
      this.emitProgress()
    }
  }

  public cancel(): void {
    this.isCancelled = true
    this.currentStatus = 'cancelled'
    for (const active of this.activeStreams) {
      if (active.reader && !active.reader.destroyed) active.reader.destroy()
      if (active.writer && !active.writer.destroyed) active.writer.destroy()
      if (active.tempPath && fs.existsSync(active.tempPath)) {
        try {
          fs.unlinkSync(active.tempPath)
        } catch {
          // ignore cleanup errors during cancel
        }
      }
    }
    this.activeStreams = []
    this.emitProgress()
  }

  public async copyFiles(
    items: FileItem[],
    options: TransferOptions
  ): Promise<TransferSummary> {
    this.isPaused = false
    this.isCancelled = false
    this.currentStatus = 'copying'
    this.startTime = Date.now()
    this.totalPausedDuration = 0
    this.completedFilesCount = 0
    this.copiedBytes = 0
    this.totalBytes = items.reduce((acc, it) => acc + it.size, 0)
    this.speedSamples = [{ time: Date.now(), bytes: 0 }]

    const concurrency = Math.max(1, Math.min(options.concurrency || 4, 16))
    const queue = [...items]
    let verifiedCount = 0
    let failedCount = 0
    let skippedCount = 0

    const processItem = async (item: FileItem): Promise<void> => {
      while (this.isPaused && !this.isCancelled) {
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      if (this.isCancelled) return

      // Handle conflict resolution
      let finalTargetPath = item.targetPath
      if (fs.existsSync(finalTargetPath)) {
        const destStat = fs.statSync(finalTargetPath)
        if (options.conflictResolution === 'skip') {
          item.status = 'skipped'
          skippedCount++
          this.completedFilesCount++
          this.emit('file-complete', item)
          this.emitProgress(item.relativePath)
          return
        } else if (options.conflictResolution === 'rename') {
          const parsed = path.parse(finalTargetPath)
          let counter = 1
          while (fs.existsSync(finalTargetPath)) {
            finalTargetPath = path.join(parsed.dir, `${parsed.name} (${counter++})${parsed.ext}`)
          }
          item.targetPath = finalTargetPath
        }
      }

      // Ensure target directory exists
      const targetDir = path.dirname(finalTargetPath)
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }

      const tempTargetPath = `${finalTargetPath}.g1part`
      item.status = 'copying'
      this.emit('file-start', item)

      try {
        const hashResult = await this.streamCopyFile(item.sourcePath, tempTargetPath, item, options)
        if (this.isCancelled) return

        item.sourceHash = hashResult.sourceHash

        if (options.mode === 'verify') {
          item.status = 'verifying'
          this.emit('file-verify', item)
          const targetHash = await this.calculateFileHash(tempTargetPath)
          item.targetHash = targetHash
          if (targetHash !== hashResult.sourceHash) {
            throw new Error(`Checksum mismatch! Source: ${hashResult.sourceHash}, Target: ${targetHash}`)
          }
          verifiedCount++
          item.status = 'verified'
        } else {
          item.status = 'completed'
        }

        // Atomic rename of completed temp file to final target
        fs.renameSync(tempTargetPath, finalTargetPath)

        if (options.preserveTimestamps) {
          const sourceStat = fs.statSync(item.sourcePath)
          fs.utimesSync(finalTargetPath, sourceStat.atime, sourceStat.mtime)
        }

        this.completedFilesCount++
        this.emit('file-complete', item)
      } catch (err) {
        item.status = 'failed'
        item.error = (err as Error).message
        failedCount++
        if (fs.existsSync(tempTargetPath)) {
          try {
            fs.unlinkSync(tempTargetPath)
          } catch {
            // ignore
          }
        }
        this.emit('file-error', item)
      }

      this.emitProgress(item.relativePath)
    }

    const workers: Promise<void>[] = []
    for (let i = 0; i < concurrency; i++) {
      workers.push(
        (async () => {
          while (queue.length > 0 && !this.isCancelled) {
            const nextItem = queue.shift()
            if (nextItem) {
              await processItem(nextItem)
            }
          }
        })()
      )
    }

    await Promise.all(workers)

    const durationMs = Math.max(1, Date.now() - this.startTime - this.totalPausedDuration)
    const averageSpeedBps = Math.round((this.copiedBytes / durationMs) * 1000)

    if (this.isCancelled) {
      this.currentStatus = 'cancelled'
    } else if (failedCount > 0) {
      this.currentStatus = 'completed'
    } else {
      this.currentStatus = 'completed'
    }

    const summary: TransferSummary = {
      id: `transfer-${Date.now()}`,
      timestamp: Date.now(),
      sourcePaths: items.map((i) => i.sourcePath),
      targetDirectory: items[0] ? path.dirname(items[0].targetPath) : '',
      totalFiles: items.length,
      totalBytes: this.totalBytes,
      durationMs,
      averageSpeedBps,
      verifiedFiles: verifiedCount,
      failedFiles: failedCount,
      skippedFiles: skippedCount
    }

    this.emit('complete', summary)
    return summary
  }

  private streamCopyFile(
    sourcePath: string,
    tempTargetPath: string,
    item: FileItem,
    options: TransferOptions
  ): Promise<{ sourceHash: string }> {
    return new Promise((resolve, reject) => {
      const bufferSize = options.bufferSizeBytes || 256 * 1024
      const reader = fs.createReadStream(sourcePath, { highWaterMark: bufferSize })
      const writer = fs.createWriteStream(tempTargetPath, { highWaterMark: bufferSize })
      const hash = crypto.createHash('sha256')

      const streamEntry = { reader, writer, tempPath: tempTargetPath }
      this.activeStreams.push(streamEntry)

      const cleanup = () => {
        const idx = this.activeStreams.indexOf(streamEntry)
        if (idx !== -1) this.activeStreams.splice(idx, 1)
      }

      reader.on('data', (chunk: string | Buffer) => {
        if (this.isCancelled) {
          reader.destroy()
          writer.destroy()
          cleanup()
          return
        }

        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        hash.update(buf)
        item.copiedBytes += buf.length
        this.copiedBytes += buf.length

        this.recordSpeedSample(this.copiedBytes)
        this.emitProgress(item.relativePath, (item.copiedBytes / Math.max(1, item.size)) * 100)
      })

      reader.on('error', (err) => {
        cleanup()
        writer.destroy()
        reject(err)
      })

      writer.on('error', (err) => {
        cleanup()
        reader.destroy()
        reject(err)
      })

      writer.on('finish', () => {
        cleanup()
        resolve({ sourceHash: hash.digest('hex') })
      })

      reader.pipe(writer)
    })
  }

  private calculateFileHash(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath, { highWaterMark: 512 * 1024 })
      stream.on('data', (d) => hash.update(d))
      stream.on('error', reject)
      stream.on('end', () => resolve(hash.digest('hex')))
    })
  }

  private recordSpeedSample(totalCopied: number): void {
    const now = Date.now()
    this.speedSamples.push({ time: now, bytes: totalCopied })
    // Keep only last 2 seconds of samples for responsive speed calculation
    const cutoff = now - 2000
    this.speedSamples = this.speedSamples.filter((s) => s.time >= cutoff)
  }

  private calculateCurrentSpeed(): number {
    if (this.speedSamples.length < 2) return 0
    const oldest = this.speedSamples[0]
    const newest = this.speedSamples[this.speedSamples.length - 1]
    const durationSec = (newest.time - oldest.time) / 1000
    if (durationSec <= 0) return 0
    return Math.round((newest.bytes - oldest.bytes) / durationSec)
  }

  private emitProgress(currentFile?: string, currentFilePercent?: number): void {
    const elapsedMs = Math.max(0, Date.now() - this.startTime - this.totalPausedDuration)
    const speedBps = this.calculateCurrentSpeed()
    const remainingBytes = Math.max(0, this.totalBytes - this.copiedBytes)
    const estimatedMsRemaining = speedBps > 0 ? Math.round((remainingBytes / speedBps) * 1000) : 0

    const progress: TransferProgress = {
      status: this.currentStatus,
      totalFiles: this.completedFilesCount + (this.totalBytes > 0 ? 1 : 0),
      completedFiles: this.completedFilesCount,
      totalBytes: this.totalBytes,
      copiedBytes: this.copiedBytes,
      speedBps,
      elapsedMs,
      estimatedMsRemaining,
      currentFile,
      currentFilePercent
    }

    this.emit('progress', progress)
  }
}

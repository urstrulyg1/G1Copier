import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { CopierEngine } from './copier-engine.js'

describe('CopierEngine', () => {
  let tempDir: string
  let sourceDir: string
  let targetDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'g1copier-test-'))
    sourceDir = path.join(tempDir, 'source')
    targetDir = path.join(tempDir, 'target')
    fs.mkdirSync(sourceDir, { recursive: true })
    fs.mkdirSync(targetDir, { recursive: true })
  })

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // ignore cleanup error
    }
  })

  it('scans files and nested directories correctly', async () => {
    const file1 = path.join(sourceDir, 'test1.txt')
    const subDir = path.join(sourceDir, 'sub')
    const file2 = path.join(subDir, 'test2.bin')
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(file1, 'hello world')
    fs.writeFileSync(file2, Buffer.alloc(1024, 0x42))

    const engine = new CopierEngine()
    const items = await engine.scanSources([sourceDir], targetDir)

    expect(items.length).toBe(2)
    expect(items.map((i) => i.relativePath).sort()).toEqual([
      path.join('source', 'sub', 'test2.bin'),
      path.join('source', 'test1.txt')
    ].sort())
  })

  it('copies files with verified SHA-256 checksums', async () => {
    const fileContent = 'G1Copier verification test content: ' + crypto.randomBytes(32).toString('hex')
    const file1 = path.join(sourceDir, 'secure.txt')
    fs.writeFileSync(file1, fileContent)

    const engine = new CopierEngine()
    const items = await engine.scanSources([file1], targetDir)

    const summary = await engine.copyFiles(items, {
      mode: 'verify',
      conflictResolution: 'overwrite',
      concurrency: 2,
      bufferSizeBytes: 64 * 1024
    })

    const copiedPath = path.join(targetDir, 'secure.txt')
    expect(fs.existsSync(copiedPath)).toBe(true)
    expect(fs.readFileSync(copiedPath, 'utf8')).toBe(fileContent)
    expect(summary.verifiedFiles).toBe(1)
    expect(summary.failedFiles).toBe(0)
    expect(items[0].status).toBe('verified')
    expect(items[0].sourceHash).toBeDefined()
    expect(items[0].targetHash).toBe(items[0].sourceHash)
  })

  it('handles conflict resolution with rename', async () => {
    const file1 = path.join(sourceDir, 'duplicate.txt')
    fs.writeFileSync(file1, 'version 2')

    const existingTarget = path.join(targetDir, 'duplicate.txt')
    fs.writeFileSync(existingTarget, 'version 1')

    const engine = new CopierEngine()
    const items = await engine.scanSources([file1], targetDir)

    await engine.copyFiles(items, {
      mode: 'fast',
      conflictResolution: 'rename',
      concurrency: 1,
      bufferSizeBytes: 64 * 1024
    })

    expect(fs.existsSync(existingTarget)).toBe(true)
    expect(fs.readFileSync(existingTarget, 'utf8')).toBe('version 1')

    const renamedPath = path.join(targetDir, 'duplicate (1).txt')
    expect(fs.existsSync(renamedPath)).toBe(true)
    expect(fs.readFileSync(renamedPath, 'utf8')).toBe('version 2')
  })

  it('handles conflict resolution with skip', async () => {
    const file1 = path.join(sourceDir, 'file.txt')
    fs.writeFileSync(file1, 'source content')

    const existingTarget = path.join(targetDir, 'file.txt')
    fs.writeFileSync(existingTarget, 'target content')

    const engine = new CopierEngine()
    const items = await engine.scanSources([file1], targetDir)

    const summary = await engine.copyFiles(items, {
      mode: 'fast',
      conflictResolution: 'skip',
      concurrency: 1,
      bufferSizeBytes: 64 * 1024
    })

    expect(summary.skippedFiles).toBe(1)
    expect(fs.readFileSync(existingTarget, 'utf8')).toBe('target content')
  })

  it('cleans up partial files when cancelled', async () => {
    const largeFile = path.join(sourceDir, 'large.bin')
    fs.writeFileSync(largeFile, Buffer.alloc(5 * 1024 * 1024, 0xaa))

    const engine = new CopierEngine()
    const items = await engine.scanSources([largeFile], targetDir)

    // Trigger cancel shortly after start
    setTimeout(() => {
      engine.cancel()
    }, 10)

    await engine.copyFiles(items, {
      mode: 'fast',
      conflictResolution: 'overwrite',
      concurrency: 1,
      bufferSizeBytes: 1024
    })

    expect(engine.getStatus()).toBe('cancelled')
    const finalFile = path.join(targetDir, 'large.bin')
    const partFile = `${finalFile}.g1part`
    expect(fs.existsSync(partFile)).toBe(false)
  })
})

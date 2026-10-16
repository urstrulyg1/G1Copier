#!/usr/bin/env node
/**
 * G1Copier — Release & CI Package Deliverable Validator
 *
 * Strict requirements:
 * 1. Every supported OS/architecture produces its own individual installer/package.
 * 2. No ZIP archives are used or published in place of native installers.
 * 3. Binary headers, formats, minimum sizes, and non-empty status are verified.
 * 4. In aggregate mode, ensures all 6 deliverables exist before release publication.
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export const EXPECTED_DELIVERABLES = {
  'windows-x64': {
    filename: 'g1copier_x64.exe',
    platform: 'win32',
    arch: 'x64',
    ext: '.exe',
    minBytes: 25 * 1024 * 1024,
    checkMagic: (head) => head[0] === 0x4d && head[1] === 0x5a, // MZ (PE executable)
    desc: 'Windows x64 NSIS standalone installer'
  },
  'windows-arm64': {
    filename: 'g1copier_arm64.exe',
    platform: 'win32',
    arch: 'arm64',
    ext: '.exe',
    minBytes: 25 * 1024 * 1024,
    checkMagic: (head) => head[0] === 0x4d && head[1] === 0x5a, // MZ (PE executable)
    desc: 'Windows ARM64 NSIS standalone installer'
  },
  'macos-x64': {
    filename: 'g1copier_x64.dmg',
    platform: 'darwin',
    arch: 'x64',
    ext: '.dmg',
    minBytes: 40 * 1024 * 1024,
    checkMagic: (head, tail) => tail.includes('koly') || (head[0] === 0x78 && head[1] === 0xda), // UDIF koly trailer / zlib
    desc: 'macOS Intel x64 standalone disk image'
  },
  'macos-arm64': {
    filename: 'g1copier_arm64.dmg',
    platform: 'darwin',
    arch: 'arm64',
    ext: '.dmg',
    minBytes: 40 * 1024 * 1024,
    checkMagic: (head, tail) => tail.includes('koly') || (head[0] === 0x78 && head[1] === 0xda), // UDIF koly trailer / zlib
    desc: 'macOS Apple Silicon ARM64 standalone disk image'
  },
  'linux-x64-deb': {
    filename: 'g1copier_x64.deb',
    platform: 'linux',
    arch: 'x64',
    ext: '.deb',
    minBytes: 20 * 1024 * 1024,
    checkMagic: (head) => head.toString('ascii', 0, 7) === '!<arch>', // Debian ar archive
    desc: 'Linux Debian / Ubuntu standalone package (.deb)'
  },
  'linux-x64-appimage': {
    filename: 'g1copier_x64.AppImage',
    platform: 'linux',
    arch: 'x64',
    ext: '.AppImage',
    minBytes: 20 * 1024 * 1024,
    checkMagic: (head) => head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46, // ELF binary
    desc: 'Linux x64 standalone executable package (.AppImage)'
  }
}

function readMagicBuffers(filePath, stat) {
  const fd = fs.openSync(filePath, 'r')
  try {
    const head = Buffer.alloc(Math.min(64, stat.size))
    fs.readSync(fd, head, 0, head.length, 0)

    const tailLen = Math.min(1024, stat.size)
    const tail = Buffer.alloc(tailLen)
    fs.readSync(fd, tail, 0, tailLen, Math.max(0, stat.size - tailLen))

    return { head, tail }
  } finally {
    fs.closeSync(fd)
  }
}

function calculateSha256(filePath) {
  const hash = crypto.createHash('sha256')
  const buffer = fs.readFileSync(filePath)
  hash.update(buffer)
  return hash.digest('hex')
}

export function validateSingleDeliverable(targetId, targetDir = 'release') {
  const spec = EXPECTED_DELIVERABLES[targetId]
  if (!spec) {
    throw new Error(`Unknown target ID "${targetId}". Valid IDs: ${Object.keys(EXPECTED_DELIVERABLES).join(', ')}`)
  }

  const filePath = path.join(targetDir, spec.filename)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Deliverable missing for target "${targetId}": expected file ${filePath}`)
  }

  const stat = fs.statSync(filePath)
  if (stat.size === 0) {
    throw new Error(`Deliverable is empty (0 bytes): ${filePath}`)
  }

  if (stat.size < spec.minBytes) {
    throw new Error(
      `Deliverable size (${(stat.size / 1024 / 1024).toFixed(2)} MB) is below minimum expected threshold (${(
        spec.minBytes /
        1024 /
        1024
      ).toFixed(2)} MB): ${filePath}`
    )
  }

  const { head, tail } = readMagicBuffers(filePath, stat)
  if (!spec.checkMagic(head, tail)) {
    throw new Error(`Deliverable failed binary magic check for ${spec.desc}: ${filePath}`)
  }

  const sha256 = calculateSha256(filePath)
  console.log(`✓ [${targetId}] ${spec.filename} validated: ${(stat.size / 1024 / 1024).toFixed(2)} MB (SHA-256: ${sha256})`)
  return { targetId, filePath, filename: spec.filename, size: stat.size, sha256 }
}

export function validateAllDeliverables(assetsDir = 'release-assets') {
  console.log(`\n=== Validating All Standalone Deliverables in: ${assetsDir} ===\n`)
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Deliverables directory does not exist: ${assetsDir}`)
  }

  const entries = fs.readdirSync(assetsDir)
  const zipFiles = entries.filter((f) => f.toLowerCase().endsWith('.zip'))
  if (zipFiles.length > 0) {
    throw new Error(`Strict requirement violation: ZIP archive(s) found in release assets: ${zipFiles.join(', ')}`)
  }

  const results = []
  const missing = []

  for (const [targetId, spec] of Object.entries(EXPECTED_DELIVERABLES)) {
    const filePath = path.join(assetsDir, spec.filename)
    if (!fs.existsSync(filePath)) {
      missing.push(`${spec.filename} (${targetId})`)
      continue
    }

    const stat = fs.statSync(filePath)
    if (stat.size < spec.minBytes) {
      throw new Error(`File ${spec.filename} is too small: ${stat.size} bytes (min: ${spec.minBytes})`)
    }

    const { head, tail } = readMagicBuffers(filePath, stat)
    if (!spec.checkMagic(head, tail)) {
      throw new Error(`File ${spec.filename} failed binary magic check`)
    }

    const sha256 = calculateSha256(filePath)
    results.push({ targetId, filename: spec.filename, size: stat.size, sha256 })
    console.log(`✓ Verified ${spec.filename.padEnd(25)} | ${(stat.size / 1024 / 1024).toFixed(2).padStart(7)} MB | SHA-256: ${sha256}`)
  }

  if (missing.length > 0) {
    throw new Error(`Release deliverable validation failed! Missing required packages:\n  - ${missing.join('\n  - ')}`)
  }

  const checksumFile = path.join(assetsDir, 'SHA256SUMS.txt')
  const checksumContent = results.map((r) => `${r.sha256}  ${r.filename}`).join('\n') + '\n'
  fs.writeFileSync(checksumFile, checksumContent, 'utf8')
  console.log(`\n✓ Generated ${checksumFile} with ${results.length} checksum entries\n`)
  return results
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const args = process.argv.slice(2)
  try {
    if (args.includes('--all')) {
      const dirIndex = args.indexOf('--all') + 1
      const dir = args[dirIndex] && !args[dirIndex].startsWith('--') ? args[dirIndex] : 'release-assets'
      validateAllDeliverables(dir)
    } else if (args.includes('--target')) {
      const idx = args.indexOf('--target') + 1
      const target = args[idx]
      const dirIdx = args.indexOf('--dir')
      const dir = dirIdx !== -1 && args[dirIdx + 1] ? args[dirIdx + 1] : 'release'
      validateSingleDeliverable(target, dir)
    } else {
      console.log('Usage:')
      console.log('  node scripts/validate-release-assets.mjs --target <target-id> [--dir <dir>]')
      console.log('  node scripts/validate-release-assets.mjs --all [<assets-dir>]')
      process.exit(1)
    }
  } catch (err) {
    console.error(`\n❌ Deliverable validation failed: ${err.message}\n`)
    process.exit(1)
  }
}

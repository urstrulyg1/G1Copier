import React, { useState, useEffect } from 'react'
import {
  Copy,
  Zap,
  ShieldCheck,
  RefreshCw,
  Folder,
  File,
  Play,
  Pause,
  X,
  Settings,
  History,
  HardDrive,
  FolderOpen,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import type {
  FileItem,
  TransferOptions,
  TransferProgress,
  TransferSummary,
  TransferMode,
  ConflictResolution
} from '../../shared/types.js'

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes === 0) return `${remainingSeconds}s`
  return `${minutes}m ${remainingSeconds}s`
}

export function App(): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'transfer' | 'queue' | 'history' | 'settings'>('transfer')
  const [sourcePaths, setSourcePaths] = useState<string[]>([])
  const [targetDirectory, setTargetDirectory] = useState<string>('')
  const [items, setItems] = useState<FileItem[]>([])
  const [isScanning, setIsScanning] = useState<boolean>(false)
  const [options, setOptions] = useState<TransferOptions>({
    mode: 'verify',
    conflictResolution: 'rename',
    concurrency: 4,
    bufferSizeBytes: 256 * 1024,
    autoOpenTargetOnComplete: true,
    preserveTimestamps: true
  })

  const [progress, setProgress] = useState<TransferProgress>({
    status: 'idle',
    totalFiles: 0,
    completedFiles: 0,
    totalBytes: 0,
    copiedBytes: 0,
    speedBps: 0,
    elapsedMs: 0,
    estimatedMsRemaining: 0
  })

  const [history, setHistory] = useState<TransferSummary[]>([])

  useEffect(() => {
    if (!window.electronAPI) return

    const unsubProgress = window.electronAPI.onProgress((p) => {
      setProgress(p)
    })

    const unsubFileStart = window.electronAPI.onFileStart((fileItem) => {
      setItems((prev) =>
        prev.map((it) => (it.id === fileItem.id ? { ...it, status: fileItem.status } : it))
      )
    })

    const unsubFileComplete = window.electronAPI.onFileComplete((fileItem) => {
      setItems((prev) =>
        prev.map((it) => (it.id === fileItem.id ? fileItem : it))
      )
    })

    const unsubFileError = window.electronAPI.onFileError((fileItem) => {
      setItems((prev) =>
        prev.map((it) => (it.id === fileItem.id ? fileItem : it))
      )
    })

    const unsubComplete = window.electronAPI.onComplete((summary) => {
      setHistory((prev) => [summary, ...prev])
      setProgress((prev) => ({ ...prev, status: 'completed' }))
    })

    return () => {
      unsubProgress()
      unsubFileStart()
      unsubFileComplete()
      unsubFileError()
      unsubComplete()
    }
  }, [])

  const handleSelectFiles = async () => {
    if (!window.electronAPI) return
    const files = await window.electronAPI.selectSourceFiles()
    if (files.length > 0) {
      const merged = Array.from(new Set([...sourcePaths, ...files]))
      setSourcePaths(merged)
      scanAll(merged, targetDirectory)
    }
  }

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return
    const dirs = await window.electronAPI.selectSourceDir()
    if (dirs.length > 0) {
      const merged = Array.from(new Set([...sourcePaths, ...dirs]))
      setSourcePaths(merged)
      scanAll(merged, targetDirectory)
    }
  }

  const handleSelectTarget = async () => {
    if (!window.electronAPI) return
    const target = await window.electronAPI.selectTargetDir()
    if (target) {
      setTargetDirectory(target)
      scanAll(sourcePaths, target)
    }
  }

  const scanAll = async (sources: string[], target: string) => {
    if (!window.electronAPI || sources.length === 0 || !target) return
    setIsScanning(true)
    try {
      const scanned = await window.electronAPI.scan(sources, target)
      setItems(scanned)
    } finally {
      setIsScanning(false)
    }
  }

  const handleStartCopy = async () => {
    if (!window.electronAPI || items.length === 0) return
    setActiveTab('transfer')
    await window.electronAPI.start(items, options)
  }

  const handlePause = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.pause()
  }

  const handleResume = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.resume()
  }

  const handleCancel = async () => {
    if (!window.electronAPI) return
    await window.electronAPI.cancel()
  }

  const handleOpenPath = (path: string) => {
    if (window.electronAPI && path) {
      window.electronAPI.openPath(path)
    }
  }

  const overallPercent =
    progress.totalBytes > 0
      ? Math.min(100, Math.round((progress.copiedBytes / progress.totalBytes) * 100))
      : 0

  return (
    <div className="app-container">
      {/* Header */}
      <header className="app-header">
        <div className="brand-wrapper">
          <div className="brand-logo-icon">
            <Copy size={20} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="brand-title">G1Copier</span>
              <span className="brand-tag">v0.1.0</span>
            </div>
          </div>
        </div>

        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'transfer' ? 'active' : ''}`}
            onClick={() => setActiveTab('transfer')}
          >
            <Zap size={15} /> Transfer
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'queue' ? 'active' : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            <Folder size={15} /> Queue ({items.length})
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <History size={15} /> History ({history.length})
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <Settings size={15} /> Settings
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'transfer' && (
          <>
            {/* Progress Hero (when copying, paused, or completed) */}
            {(progress.status === 'copying' ||
              progress.status === 'paused' ||
              progress.status === 'completed' ||
              progress.status === 'cancelled') && (
              <div className="progress-hero">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                      {progress.status === 'copying' && <span style={{ color: 'var(--accent-cyan)' }}>⚡ Copying in Progress</span>}
                      {progress.status === 'paused' && <span style={{ color: 'var(--accent-amber)' }}>⏸️ Transfer Paused</span>}
                      {progress.status === 'completed' && <span style={{ color: 'var(--accent-emerald)' }}>✓ Transfer Complete</span>}
                      {progress.status === 'cancelled' && <span style={{ color: 'var(--accent-rose)' }}>✕ Transfer Cancelled</span>}
                    </h3>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                      {progress.currentFile ? `Current: ${progress.currentFile}` : 'All files processed'}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {progress.status === 'copying' && (
                      <button className="btn btn-secondary" onClick={handlePause}>
                        <Pause size={15} /> Pause
                      </button>
                    )}
                    {progress.status === 'paused' && (
                      <button className="btn btn-primary" onClick={handleResume}>
                        <Play size={15} /> Resume
                      </button>
                    )}
                    {(progress.status === 'copying' || progress.status === 'paused') && (
                      <button className="btn btn-danger" onClick={handleCancel}>
                        <X size={15} /> Cancel
                      </button>
                    )}
                    {progress.status === 'completed' && targetDirectory && (
                      <button className="btn btn-primary" onClick={() => handleOpenPath(targetDirectory)}>
                        <FolderOpen size={15} /> Open Target
                      </button>
                    )}
                  </div>
                </div>

                <div className="progress-bar-container">
                  <div className="progress-bar-fill" style={{ width: `${overallPercent}%` }}></div>
                </div>

                <div className="progress-stats-row">
                  <div className="stat-item">
                    <div className="stat-label">Progress</div>
                    <div className="stat-value">{overallPercent}%</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">Speed</div>
                    <div className="stat-value">{formatBytes(progress.speedBps)}/s</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">Copied</div>
                    <div className="stat-value">
                      {formatBytes(progress.copiedBytes)} / {formatBytes(progress.totalBytes)}
                    </div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-label">Remaining Time</div>
                    <div className="stat-value">
                      {progress.estimatedMsRemaining > 0 ? formatDuration(progress.estimatedMsRemaining) : '--'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Source & Destination Pickers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {/* Source Card */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <HardDrive size={18} color="var(--accent-cyan)" /> Source Selection
                  </div>
                  {sourcePaths.length > 0 && (
                    <button
                      style={{ background: 'none', border: 'none', color: 'var(--text-faint)', fontSize: 12, cursor: 'pointer' }}
                      onClick={() => {
                        setSourcePaths([])
                        setItems([])
                      }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="dropzone">
                  <div className="dropzone-icon">
                    <Folder size={32} />
                  </div>
                  <div className="dropzone-text">
                    {sourcePaths.length === 0
                      ? 'Select source files or folders'
                      : `${sourcePaths.length} source item(s) selected`}
                  </div>
                  <div className="dropzone-subtext">
                    {sourcePaths.length > 0
                      ? sourcePaths[0] + (sourcePaths.length > 1 ? ` (+${sourcePaths.length - 1} more)` : '')
                      : 'Choose individual files or an entire folder tree'}
                  </div>
                  <div className="dropzone-actions">
                    <button className="btn btn-secondary" onClick={handleSelectFiles} disabled={progress.status === 'copying'}>
                      <File size={15} /> Add Files
                    </button>
                    <button className="btn btn-secondary" onClick={handleSelectFolder} disabled={progress.status === 'copying'}>
                      <Folder size={15} /> Add Folder
                    </button>
                  </div>
                </div>
              </div>

              {/* Destination Card */}
              <div className="card">
                <div className="card-header">
                  <div className="card-title">
                    <FolderOpen size={18} color="var(--accent-violet)" /> Target Destination
                  </div>
                </div>

                <div className="dropzone">
                  <div className="dropzone-icon">
                    <FolderOpen size={32} color="var(--accent-violet)" />
                  </div>
                  <div className="dropzone-text">
                    {targetDirectory ? 'Destination Directory Selected' : 'Select Target Directory'}
                  </div>
                  <div className="dropzone-subtext">
                    {targetDirectory ? targetDirectory : 'Files will be transferred here with atomic renaming'}
                  </div>
                  <div className="dropzone-actions">
                    <button className="btn btn-secondary" onClick={handleSelectTarget} disabled={progress.status === 'copying'}>
                      <FolderOpen size={15} /> Select Target Folder
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Mode & Conflict Selection Card */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Zap size={18} color="var(--accent-amber)" /> Copying Mode & Verification
                </div>
              </div>

              <div className="mode-grid">
                <div
                  className={`mode-card ${options.mode === 'verify' ? 'active' : ''}`}
                  onClick={() => setOptions({ ...options, mode: 'verify' })}
                >
                  <div className="mode-title">
                    <ShieldCheck size={16} color="var(--accent-cyan)" /> Verified Sync (Recommended)
                  </div>
                  <div className="mode-desc">
                    Calculates on-the-fly SHA-256 checksums and performs bit-for-bit integrity validation.
                  </div>
                </div>

                <div
                  className={`mode-card ${options.mode === 'fast' ? 'active' : ''}`}
                  onClick={() => setOptions({ ...options, mode: 'fast' })}
                >
                  <div className="mode-title">
                    <Zap size={16} color="var(--accent-amber)" /> Ultra-Fast Mode
                  </div>
                  <div className="mode-desc">
                    Maximum copy throughput with buffered parallel streams and atomic rename safety.
                  </div>
                </div>

                <div
                  className={`mode-card ${options.mode === 'mirror' ? 'active' : ''}`}
                  onClick={() => setOptions({ ...options, mode: 'mirror' })}
                >
                  <div className="mode-title">
                    <RefreshCw size={16} color="var(--accent-violet)" /> Mirror Replica
                  </div>
                  <div className="mode-desc">
                    Duplicates source tree structure precisely, preserving relative directory hierarchy.
                  </div>
                </div>
              </div>

              {/* Start Copy Action Bar */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: 20,
                  paddingTop: 16,
                  borderTop: '1px solid var(--border-subtle)'
                }}
              >
                <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  {items.length > 0 ? (
                    <>
                      Ready to copy <strong style={{ color: '#fff' }}>{items.length}</strong> file(s) (
                      <strong style={{ color: 'var(--accent-cyan)' }}>
                        {formatBytes(items.reduce((a, b) => a + b.size, 0))}
                      </strong>
                      )
                    </>
                  ) : (
                    'Select source files and a destination folder to begin'
                  )}
                </div>

                <button
                  className="btn btn-primary"
                  style={{ padding: '10px 24px', fontSize: 14 }}
                  onClick={handleStartCopy}
                  disabled={items.length === 0 || !targetDirectory || progress.status === 'copying' || isScanning}
                >
                  <Play size={16} /> Start Transfer
                </button>
              </div>
            </div>
          </>
        )}

        {activeTab === 'queue' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Folder size={18} /> Queue Details ({items.length} files)
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Total Size: {formatBytes(items.reduce((a, b) => a + b.size, 0))}
              </div>
            </div>

            {items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)' }}>
                Queue is empty. Select source files on the Transfer tab.
              </div>
            ) : (
              <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                <table className="file-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>File Name / Relative Path</th>
                      <th>Size</th>
                      <th>Progress</th>
                      <th>SHA-256 Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          <span className={`badge badge-${it.status}`}>{it.status}</span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{it.relativePath}</td>
                        <td>{formatBytes(it.size)}</td>
                        <td>
                          {it.size > 0 ? `${Math.round((it.copiedBytes / it.size) * 100)}%` : '100%'}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>
                          {it.sourceHash ? it.sourceHash.slice(0, 12) + '...' : '--'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <History size={18} /> Transfer Audit Log
              </div>
            </div>

            {history.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-faint)' }}>
                No past transfers completed in this session yet.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {history.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      background: 'var(--bg-elevated)',
                      padding: 16,
                      borderRadius: 12,
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>
                        {h.totalFiles} files ({formatBytes(h.totalBytes)})
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        Target: {h.targetDirectory}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
                        {new Date(h.timestamp).toLocaleTimeString()} • Duration: {formatDuration(h.durationMs)} • Avg Speed: {formatBytes(h.averageSpeedBps)}/s • Verified: {h.verifiedFiles}
                      </div>
                    </div>
                    <button className="btn btn-secondary" onClick={() => handleOpenPath(h.targetDirectory)}>
                      <FolderOpen size={14} /> View Folder
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <Settings size={18} /> Transfer & Engine Preferences
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Parallel File Concurrency ({options.concurrency} threads)
                </label>
                <input
                  type="range"
                  min="1"
                  max="16"
                  value={options.concurrency}
                  onChange={(e) => setOptions({ ...options, concurrency: parseInt(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--accent-cyan)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  Conflict Resolution Policy
                </label>
                <select
                  value={options.conflictResolution}
                  onChange={(e) => setOptions({ ...options, conflictResolution: e.target.value as ConflictResolution })}
                  style={{
                    background: '#0f172a',
                    color: '#fff',
                    border: '1px solid var(--border-subtle)',
                    padding: '8px 12px',
                    borderRadius: 8,
                    width: '100%'
                  }}
                >
                  <option value="rename">Auto-Rename (keep both with duplicate suffix)</option>
                  <option value="overwrite">Overwrite Destination</option>
                  <option value="skip">Skip Identical / Existing Files</option>
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                <input
                  type="checkbox"
                  id="autoOpen"
                  checked={options.autoOpenTargetOnComplete}
                  onChange={(e) => setOptions({ ...options, autoOpenTargetOnComplete: e.target.checked })}
                  style={{ accentColor: 'var(--accent-cyan)', width: 16, height: 16 }}
                />
                <label htmlFor="autoOpen" style={{ fontSize: 13, color: 'var(--text-main)', cursor: 'pointer' }}>
                  Automatically open target directory in File Explorer / Finder upon completion
                </label>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

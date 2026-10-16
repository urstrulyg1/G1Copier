# G1Copier

<div align="center">

**Ultra-Fast, Consent-First Desktop File Copier, Synchronization, and Backup Platform**

Built with Electron, React 19, TypeScript, and Vite.

[![CI](https://github.com/urstrulyg1/G1Copier/actions/workflows/ci.yml/badge.svg)](https://github.com/urstrulyg1/G1Copier/actions/workflows/ci.yml)
[![Release](https://github.com/urstrulyg1/G1Copier/actions/workflows/release.yml/badge.svg)](https://github.com/urstrulyg1/G1Copier/actions/workflows/release.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

</div>

---

## Downloads

Direct, uncompressed installers and application packages are published on [GitHub Releases](https://github.com/urstrulyg1/G1Copier/releases/latest). These are standalone single-file packages that can be installed or run immediately—**no ZIP archives to extract and no account required**:

| Operating System | Architecture | Package Format | Direct 1-Click Download |
| :--- | :--- | :--- | :--- |
| **Windows** | 64-bit (`x64`) | NSIS Setup Installer (`.exe`) | [**g1copier_x64.exe**](https://github.com/urstrulyg1/G1Copier/releases/latest/download/g1copier_x64.exe) |
| **Windows** | ARM64 | NSIS Setup Installer (`.exe`) | [**g1copier_arm64.exe**](https://github.com/urstrulyg1/G1Copier/releases/latest/download/g1copier_arm64.exe) |
| **macOS** | Apple Silicon (`arm64`) | Drag-and-Drop Disk Image (`.dmg`) | [**g1copier_arm64.dmg**](https://github.com/urstrulyg1/G1Copier/releases/latest/download/g1copier_arm64.dmg) |
| **macOS** | Intel (`x64`) | Drag-and-Drop Disk Image (`.dmg`) | [**g1copier_x64.dmg**](https://github.com/urstrulyg1/G1Copier/releases/latest/download/g1copier_x64.dmg) |
| **Linux** | 64-bit (`x64`) | Standalone Executable (`.AppImage`) | [**g1copier_x64.AppImage**](https://github.com/urstrulyg1/G1Copier/releases/latest/download/g1copier_x64.AppImage) |
| **Linux** | 64-bit (`x64`) | Debian / Ubuntu Package (`.deb`) | [**g1copier_x64.deb**](https://github.com/urstrulyg1/G1Copier/releases/latest/download/g1copier_x64.deb) |

> [!TIP]
> **Getting the application directly:** Click the links above to download the raw `.exe`, `.dmg`, `.AppImage`, or `.deb` file directly.
> - Do not click the green GitHub `<> Code` -> "Download ZIP" button (which downloads raw project source code).
> - Do not download from the GitHub Actions "Artifacts" table (GitHub web UI force-compresses artifacts into `.zip` archives). Use the direct release links above.

SHA-256 checksums for verifying download integrity are available at [**SHA256SUMS.txt**](https://github.com/urstrulyg1/G1Copier/releases/latest/download/SHA256SUMS.txt).

---

## Key Features

- **⚡ High-Throughput Streaming Engine**: Parallel chunked transfers with configurable stream buffers (64 KB to 8 MB) and concurrency up to 16 threads.
- **🛡️ Bit-for-Bit SHA-256 Verification**: Computes real-time crypto hashes during transfer and performs post-copy integrity validation.
- **🔒 Atomic Safe Copying**: Writes to temporary `.g1part` files and renames only after stream completion, guaranteeing zero corrupted or truncated files.
- **⏸️ Pause, Resume & Cancel**: Pause large file copies at any time, resume without data corruption, or cancel with automatic temporary cleanup.
- **🔄 Intelligent Conflict Resolution**:
  - **Auto-Rename**: Safely preserves existing files using `(1), (2)` incremental naming.
  - **Overwrite**: Updates destination files directly.
  - **Skip**: Bypasses existing identical files.
- **📊 Real-Time Telemetry & Audit Log**: Live speedometers (MB/s), elapsed time, accurate time remaining (ETA), and searchable session audit logs with one-click folder reveal.
- **🎨 Obsidian Dark Glassmorphic Design**: Modern cyber-styled UI with high-contrast status badges and smooth CSS micro-animations.

---

## Development Quick Start

### Requirements
- Node.js 22.12 or later
- npm 10 or later

```sh
# Clone repository
git clone https://github.com/urstrulyg1/G1Copier.git
cd G1Copier

# Install dependencies
npm install

# Start local development with Hot Module Replacement
npm run dev
```

### Build & Test Commands

```sh
# Run typechecking
npm run typecheck

# Run unit tests
npm test

# Build production bundles
npm run build

# Generate branding icons suite
npm run icons
```

---

## Packaging & Cross-Platform Distribution

Individual, uncompressed platform deliverables are generated with discrete npm scripts:

- `npm run dist:win:x64` — Windows x64 NSIS setup installer (`.exe`)
- `npm run dist:win:arm64` — Windows ARM64 NSIS setup installer (`.exe`)
- `npm run dist:mac:arm64` — macOS Apple Silicon disk image (`.dmg`)
- `npm run dist:mac:x64` — macOS Intel disk image (`.dmg`)
- `npm run dist:linux:appimage` — Linux x64 standalone executable (`.AppImage`)
- `npm run dist:linux:deb` — Linux Debian / Ubuntu package (`.deb`)

### Automated Release Pipeline
Tagging any commit (`git tag v0.1.0 && git push origin v0.1.0`) triggers `.github/workflows/release.yml`, building all 6 targets in parallel, validating magic binary headers, and publishing individual uncompressed native installers to GitHub Releases.

---

## License

This project is licensed under the [MIT License](LICENSE).

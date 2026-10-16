/// <reference types="vite/client" />

import type { api } from '../../preload/index.js'

declare global {
  interface Window {
    electronAPI: typeof api
  }
}

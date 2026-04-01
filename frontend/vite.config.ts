/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { version } from './package.json'

const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 4910}`

const proxyPaths = ['/chat', '/stream', '/answers', '/sessions', '/health', '/config', '/session-status', '/admin/sessions', '/apps', '/admin/apps', '/api/environment']

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: Object.fromEntries(proxyPaths.map((path) => [path, backendUrl])),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    css: true,
  },
})

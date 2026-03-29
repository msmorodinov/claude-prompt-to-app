import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrl = `http://localhost:${process.env.BACKEND_PORT || 8000}`

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/chat': backendUrl,
      '/stream': backendUrl,
      '/answers': backendUrl,
      '/sessions': backendUrl,
      '/health': backendUrl,
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    css: true,
  },
})

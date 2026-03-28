import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/chat': 'http://localhost:8000',
      '/stream': 'http://localhost:8000',
      '/answers': 'http://localhost:8000',
      '/sessions': 'http://localhost:8000',
      '/health': 'http://localhost:8000',
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.ts',
    css: true,
  },
})

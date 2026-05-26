import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: 'http://nitinventory-backend:8000', changeOrigin: true },
      '/storage': { target: 'http://nitinventory-backend:8000', changeOrigin: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) return 'vendor-lucide';
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) return 'vendor-react-core';
            if (id.includes('@tanstack')) return 'vendor-tanstack';
            return 'vendor';
          }
        }
      }
    }
  }
})

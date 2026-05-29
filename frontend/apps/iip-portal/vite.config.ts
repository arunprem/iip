import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@api': path.resolve(__dirname, './src/api'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api/v1/auth': { target: 'http://localhost:8010', changeOrigin: true },
      '/api/v1/iam': { target: 'http://localhost:8010', changeOrigin: true },
      '/api/v1/intelligence': { target: 'http://localhost:8010', changeOrigin: true },
      '/api/v1/captcha': { target: 'http://localhost:8010', changeOrigin: true },
      '/api/v1/notifications': {
        target: 'http://localhost:8010',
        changeOrigin: true,
        ws: true,
      },
      '/api/v1/mobile': { target: 'http://localhost:8010', changeOrigin: true },
      '/api/v1/ml': { target: 'http://localhost:8020', changeOrigin: true },
    },
  },
})

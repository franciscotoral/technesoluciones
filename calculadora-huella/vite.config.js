import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/calculadora/',
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8100',
    },
  },
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' + HashRouter => works from any GitHub Pages sub-path
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2500,
    target: 'es2020',
  },
  server: { port: 5173 },
})

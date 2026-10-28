import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/dashboard/',
  build: {
    outDir: '../build/dashboard',
    emptyOutDir: true,
    rollupOptions : {
      output: {
        manualChunks(id) {
          if(id.includes('node_modules')) {
            return id.toString().split('node_modules/')[1].split('/')[0].toString();
          }
        },
      },
    },
  },
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
})
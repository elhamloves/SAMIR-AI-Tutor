import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Force resolve pdfjs-dist to v4 (prevent v5 from being bundled)
  resolve: {
    dedupe: ['pdfjs-dist'],
    alias: {
      'pdfjs-dist': 'pdfjs-dist/build/pdf.min.mjs'
    }
  },
  
  // Optimize worker file handling
  optimizeDeps: {
    exclude: ['pdfjs-dist']
  },
  
  // Ensure worker files are served as static assets (not processed by Vite)
  publicDir: 'public',
  
  // Copy worker file from node_modules to public during build
  build: {
    rollupOptions: {
      // Don't bundle worker files - serve them as static assets
      external: (id) => id.includes('pdf.worker')
    }
  },
  
  // Server proxy for Hugging Face API (using OpenAI-compatible router endpoint)
  server: {
    proxy: {
      '/hf-api': {
        target: 'https://router.huggingface.co',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => {
          // Convert /hf-api/chat/completions to /v1/chat/completions
          // New OpenAI-compatible format: router.huggingface.co/v1/chat/completions
          return path.replace(/^\/hf-api/, '/v1');
        },
      },
    },
  },
});
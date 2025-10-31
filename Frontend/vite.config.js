import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (_proxyReq, _req, _res) => {
            console.log('Sending Request to the Target:', _req.method, _req.url);
          });
          proxy.on('proxyRes', (_proxyRes, _req, _res) => {
            console.log('Received Response from the Target:', _proxyRes.statusCode, _req.url);
          });
        },
      },
    },
  },
  // adjust output directory when building an admin-only bundle
  build: {
    outDir: process.env.VITE_ONLY_ADMIN === '1' ? 'dist-admin' : 'dist'
  }
})

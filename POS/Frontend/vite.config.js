import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DEV_HOST = process.env.VITE_DEV_HOST || true;
const DEV_PORT = Number.parseInt(process.env.VITE_DEV_PORT || '5173', 10);
const ALLOWED_HOSTS = (process.env.VITE_ALLOWED_HOSTS ||
  'pos.itnvend.com,estore.itnvend.com,localhost,127.0.0.1').split(',').map((entry) => entry.trim()).filter(Boolean);
const HMR_HOST = process.env.VITE_HMR_HOST || (typeof DEV_HOST === 'string' ? DEV_HOST : undefined);

export default defineConfig({
  plugins: [react()],
  server: {
    host: DEV_HOST === 'true' ? true : DEV_HOST,
    port: DEV_PORT,
    strictPort: false,
    allowedHosts: ALLOWED_HOSTS,
    hmr: {
      host: HMR_HOST,
      port: DEV_PORT,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq) => {
            try { console.log('Sending Request to the Target:', proxyReq.method, proxyReq.path); } catch {}
          });
          proxy.on('proxyRes', (proxyRes) => {
            try { console.log('Received Response from the Target:', proxyRes.statusCode); } catch {}
          });
        },
      },
      '/uploads': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

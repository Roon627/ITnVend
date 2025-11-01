import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const DEV_HOST = process.env.VITE_DEV_HOST || true;
const DEV_PORT = Number.parseInt(process.env.VITE_DEV_PORT || '5174', 10);
const ALLOWED_HOSTS = (process.env.VITE_ALLOWED_HOSTS ||
  'estore.itnvend.com,localhost,127.0.0.1').split(',').map((entry) => entry.trim()).filter(Boolean);
const HMR_HOST = process.env.VITE_HMR_HOST || (typeof DEV_HOST === 'string' ? DEV_HOST : undefined);
const proxyTarget = process.env.VITE_POS_API_PROXY || 'http://localhost:4000';

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
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

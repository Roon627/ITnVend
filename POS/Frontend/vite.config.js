/* eslint-env node */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import process from 'node:process';

const DEV_HOST = process.env.VITE_DEV_HOST || true;
const DEV_PORT = Number.parseInt(process.env.VITE_DEV_PORT || '5173', 10);
const ALLOWED_HOSTS = (process.env.VITE_ALLOWED_HOSTS ||
  'pos.itnvend.com,estore.itnvend.com,localhost,127.0.0.1').split(',').map((entry) => entry.trim()).filter(Boolean);
const HMR_HOST = process.env.VITE_HMR_HOST || (typeof DEV_HOST === 'string' ? DEV_HOST : undefined);
const USE_HTTPS = process.env.VITE_DEV_HTTPS !== 'false';
const CERTS_DIR = path.resolve(process.cwd(), '../Backend/certs');
const CERT_PATH = path.join(CERTS_DIR, 'pos-itnvend-com.pem');
const KEY_PATH = path.join(CERTS_DIR, 'pos-itnvend-com-key.pem');

function loadHttpsOptions() {
  if (!USE_HTTPS) return undefined;
  try {
    return {
      cert: fs.readFileSync(CERT_PATH),
      key: fs.readFileSync(KEY_PATH),
    };
  } catch (err) {
    console.warn('Failed to read TLS certificates for Vite dev server. Falling back to HTTP.', err?.message || err);
    return undefined;
  }
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: DEV_HOST === 'true' ? true : DEV_HOST,
    port: DEV_PORT,
    strictPort: false,
    allowedHosts: ALLOWED_HOSTS,
    https: loadHttpsOptions(),
    hmr: {
      host: HMR_HOST,
      port: DEV_PORT,
    },
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'https://localhost:4000',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq) => {
            console.log('Sending Request to the Target:', proxyReq.method, proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes) => {
            console.log('Received Response from the Target:', proxyRes.statusCode);
          });
        },
      },
      '/uploads': {
        target: process.env.VITE_API_PROXY_TARGET || 'https://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

/* eslint-env node */
/* global process */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

const DEV_HOST = process.env.VITE_DEV_HOST || true;
const DEV_PORT = Number.parseInt(process.env.VITE_DEV_PORT || '5174', 10);
const ALLOWED_HOSTS = (process.env.VITE_ALLOWED_HOSTS ||
  'estore.itnvend.com,localhost,127.0.0.1').split(',').map((entry) => entry.trim()).filter(Boolean);
const HMR_HOST = process.env.VITE_HMR_HOST || (typeof DEV_HOST === 'string' ? DEV_HOST : undefined);
const proxyTarget = process.env.VITE_POS_API_PROXY || 'https://pos.itnvend.com/api';
const USE_HTTPS = process.env.VITE_DEV_HTTPS !== 'false';
const CERTS_DIR = path.resolve(process.cwd(), 'Backend', 'certs');
const CERT_PATH = path.join(CERTS_DIR, 'estore-itnvend-com.pem');
const KEY_PATH = path.join(CERTS_DIR, 'estore-itnvend-com-key.pem');

function loadHttpsOptions() {
  if (!USE_HTTPS) return undefined;
  try {
    return {
      cert: fs.readFileSync(CERT_PATH),
      key: fs.readFileSync(KEY_PATH),
    };
  } catch (error) {
    console.warn('Failed to load HTTPS certificates for Vite dev server. Falling back to HTTP.', error?.message || error);
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
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

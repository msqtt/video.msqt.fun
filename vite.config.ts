import { defineConfig } from 'vite';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Content-Security-Policy':
    "frame-ancestors 'self' http://localhost:* http://127.0.0.1:* https://recycle.msqt.fun; " +
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' blob:; worker-src 'self' blob:; " +
    "connect-src 'self' https: ws: blob:; media-src 'self' blob: data:; img-src 'self' blob: data:",
};

export default defineConfig({
  server: { headers },
  preview: { headers },
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'] },
});
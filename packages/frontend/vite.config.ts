import path from 'path';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  server: {
    // The backend listens on PORT (default 3000); see packages/backend.
    proxy: {
      '/chat': {
        target: process.env.BACKEND_URL ?? 'http://localhost:3000',
        // If the backend drops mid-stream, drop the browser connection too, so
        // the client sees a disconnect instead of a cleanly ended response.
        configure: (proxy) =>
          proxy.on('proxyRes', (proxyRes, _req, res) =>
            proxyRes.on('close', () => {
              if (!proxyRes.complete) res.destroy();
            }),
          ),
      },
    },
  },
});

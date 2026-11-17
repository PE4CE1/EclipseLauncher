import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import path from 'path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig(({ command }) => ({
  base: './',
  plugins: [
    {
      name: 'development-csp',
      apply: 'serve',
      transformIndexHtml: html => html.replace("script-src 'self';", "script-src 'self' 'unsafe-inline';"),
    },
    react(),
    electron([
      {
        // Main process
        entry: 'electron/main.ts',
        onstart(options) {
          options.startup()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            // A main-process watch rebuild must not delete the other preloads.
            emptyOutDir: command === 'build',
            sourcemap: true,
            rollupOptions: {
              external: ['electron', 'webtorrent', 'discord-rpc', 'uiohook-napi', 'original-fs', 'ffmpeg-static', '7zip-bin-full'],
            },
          },
        },
      },
      {
        // Preload script
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
            sourcemap: true,
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
  ],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, './src'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(projectRoot, 'index.html'),
        overlay: path.resolve(projectRoot, 'overlay.html'),
        stream: path.resolve(projectRoot, 'stream.html'),
      },
    },
  },
}))

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('../', import.meta.url)),
  plugins: [{name:'development-csp',transformIndexHtml:html=>html.replace("script-src 'self';","script-src 'self' 'unsafe-inline';")},react()],
  server: {host:'127.0.0.1',port:0},
})

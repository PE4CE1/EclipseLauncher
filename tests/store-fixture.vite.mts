import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
export default defineConfig({ root, base: './', plugins: [react()], build: { outDir: '.cache/store-polish/fixture', emptyOutDir: true, rollupOptions: { input: path.join(root, 'tests/store-fixture.html') } } })

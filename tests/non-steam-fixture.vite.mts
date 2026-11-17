import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
export default defineConfig({ root, base: './', plugins: [react()], build: { outDir: '.cache/nonsteam/fixture', emptyOutDir: true, rollupOptions: { input: path.join(root, 'tests/non-steam-fixture.html') } } })

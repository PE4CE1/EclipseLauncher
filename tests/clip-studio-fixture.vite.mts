import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root = fileURLToPath(new URL('../', import.meta.url))
export default defineConfig({ root, base:'./', plugins:[react()], resolve:{ alias:[{find:/^\.\/soundService$/,replacement:path.join(root,'tests/clip-sound-fixture.ts')},{find:/^(?:\.\/|\.\.\/\.\.\/services\/)microphoneStream$/,replacement:path.join(root,'tests/clip-capture-fixture.ts')},{find:/^\.\/desktopCapture$/,replacement:path.join(root,'tests/clip-capture-fixture.ts')}] }, build:{outDir:'.cache/clip-studio/fixture',emptyOutDir:true,rollupOptions:{input:path.join(root,'tests/clip-studio-fixture.html')}} })

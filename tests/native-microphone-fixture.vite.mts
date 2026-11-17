import {defineConfig} from 'vite'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
export default defineConfig({root,base:'./',build:{outDir:'.cache/native-microphone/fixture',emptyOutDir:true,rollupOptions:{input:fileURLToPath(new URL('./native-microphone-fixture.html',import.meta.url))}}})

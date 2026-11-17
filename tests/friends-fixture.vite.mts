import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url))
export default defineConfig({root,base:'./',plugins:[react()],resolve:{alias:[{find:'../../services/socialService',replacement:path.join(root,'tests/friends-social-fixture.ts')},{find:'../../services/notificationService',replacement:path.join(root,'tests/friends-social-fixture.ts')},{find:'../../services/steamService',replacement:path.join(root,'tests/friends-steam-fixture.ts')}]},build:{outDir:'.cache/friends-refine/fixture',emptyOutDir:true,rollupOptions:{input:path.join(root,'tests/friends-fixture.html')}}})

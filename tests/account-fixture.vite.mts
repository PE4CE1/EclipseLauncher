import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
const root=fileURLToPath(new URL('../',import.meta.url))
export default defineConfig({root,base:'./',plugins:[react()],resolve:{alias:[{find:'../../services/firebaseService',replacement:path.join(root,'tests/account-social-fixture.ts')}]},build:{outDir:'.cache/account/fixture',emptyOutDir:true,rollupOptions:{input:path.join(root,'tests/account-fixture.html')}}})

import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import {fileURLToPath} from 'node:url'
const root=fileURLToPath(new URL('../',import.meta.url)),control=process.env.ECLIPSE_REPLAY_CONTROL==='1'
export default defineConfig({root,base:'./',plugins:[{
  name:'recording-memory-control',enforce:'pre',transform(code,id){
    if(control&&id.replace(/\\/g,'/').endsWith('/src/services/clipEngine.ts'))return code.replace(/function hasDiskReplay\(\) \{[^\n]+\}/,'function hasDiskReplay() {return false}')
  },
},react()],resolve:{alias:[{find:/^(?:\.\/|\.\.\/\.\.\/services\/)microphoneStream$/,replacement:path.join(root,'tests/clip-capture-fixture.ts')},{find:'./desktopCapture',replacement:path.join(root,'tests/ram-capture-source.ts')},{find:'./notificationService',replacement:path.join(root,'tests/ram-notification-fixture.ts')},{find:'./soundService',replacement:path.join(root,'tests/ram-notification-fixture.ts')}]},build:{outDir:'.cache/ram-replay-20261108/'+(control?'control-fixture':'disk-fixture'),emptyOutDir:true,rollupOptions:{input:path.join(root,'tests/ram-replay-fixture.html')}}})

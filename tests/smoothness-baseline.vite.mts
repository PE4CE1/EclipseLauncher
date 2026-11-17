import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import projectConfig from '../vite.config.mts'

// Benchmark control only: identical production UI with the previous fully
// mounted library. No performance switch is shipped in the application.
export default defineConfig(async environment => {
  const config = await (typeof projectConfig === 'function' ? projectConfig(environment) : projectConfig)
  return {
    ...config,
    plugins: [{
      name: 'full-library-benchmark-control', enforce: 'pre',
      transform(_code, id) {
        if (id.replace(/\\/g, '/').endsWith('/src/components/shared/WindowedGrid.tsx')) {
          return 'export function WindowedGrid({items,className,children}) { return <div className={className} data-total-items={items.length}>{items.map(children)}</div> }'
        }
      },
    }, react()],
    build: {...config.build, outDir: '.cache/smoothness-20261108/baseline-app/dist', emptyOutDir: true},
  }
})

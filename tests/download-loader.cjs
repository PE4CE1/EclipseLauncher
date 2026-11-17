const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const ts = require('typescript')

module.exports = function createLoader(mocks = {}, options = {}) {
  const cache = new Map()
  function load(filename) {
    filename = path.resolve(__dirname, '..', filename)
    if (cache.has(filename)) return cache.get(filename).exports
    const module = { exports: {} }
    cache.set(filename, module)
    const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText
    const nativeRequire = createRequire(filename)
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      if (name.includes('?url')) return path.resolve(path.dirname(filename), name.split('?')[0])
      if (name.startsWith('node:') && Object.hasOwn(mocks, name.slice(5))) return mocks[name.slice(5)]
      if (/\.(?:png|jpe?g|webp|gif|svg)$/.test(name)) return name
      if (name.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filename), name)
        if (fs.existsSync(resolved + '.ts')) return load(resolved + '.ts')
      }
      return nativeRequire(name)
    }
    new Function('require', 'module', 'exports', '__filename', '__dirname', compiled)(localRequire, module, module.exports, filename, options.dirname || path.dirname(filename))
    return module.exports
  }
  return load
}

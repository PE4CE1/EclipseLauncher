const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { promisify } = require('node:util')
const loadTs = require('./download-loader.cjs')

test('manual memory cleaning only trims the launcher and reports its measured reduction', async () => {
  const calls = []
  const metrics = [420, 300]
  const service = loadTs({
    electron: {},
    child_process: { execFile: () => { throw new Error('must not launch a system-wide cleaner') } },
    os: { freemem: () => 8 * 1024 ** 3 },
    './memoryOptimizerService': {
      getEclipseMemoryMetrics: () => ({ totalWorkingSetMB: metrics.shift() }),
      trimMemoryNow: async force => calls.push(force),
    },
  })('electron/boostService.ts')
  assert.deepEqual(await service.flushSystemRam(), { freedMB: 120, currentFreeGB: '8.0' })
  assert.deepEqual(calls, [true])
})

test('priority adjustment rejects invalid PIDs and restores the previous priority when boost ends', async () => {
  const priorities = []
  const service = loadTs({
    electron: {}, child_process: { execFile: () => { throw new Error('priority must not use a shell command') } }, './memoryOptimizerService': {},
    os: {
      constants: { priority: { PRIORITY_ABOVE_NORMAL: -7 } },
      getPriority: () => 10,
      setPriority: (pid, priority) => priorities.push([pid, priority]),
    },
  })('electron/boostService.ts')
  for (const pid of [0, -1, 1.5, Infinity, NaN, '123 & command', 2 ** 40]) {
    assert.equal(await service.optimizeGamePriority(pid), false)
  }
  assert.deepEqual(priorities, [])
  await service.enableTrueBoostForGame('Test Game', 123, { trueBoostRamClean: false, trueBoostPowerPlan: false }, null)
  assert.deepEqual(priorities, [[123, -7]])
  await service.disableTrueBoost(null)
  assert.deepEqual(priorities, [[123, -7], [123, 10]])
})

test('repeated power-plan activation preserves the original localized scheme for restoration', async () => {
  const commands = []
  const original = '381b4222-f694-41f0-9685-ff5bb260df2e'
  const execFile = () => { throw new Error('promisified mock should be used') }
  execFile[promisify.custom] = async (executable, args, options) => {
    commands.push([executable, args, options])
    return { stdout: args[0] === '/getactivescheme' ? `GUID des Energieschemas: ${original} (Ausbalanciert)` : '' }
  }
  const service = loadTs({ electron: {}, os: {}, './memoryOptimizerService': {}, child_process: { execFile } })('electron/boostService.ts')
  assert.equal(await service.activateGamingPowerPlan(), true)
  assert.equal(await service.activateGamingPowerPlan(), true)
  await service.restorePowerPlan()
  assert.deepEqual(commands.map(command => command[1]), [
    ['/getactivescheme'],
    ['/setactive', 'e9a42b02-d5df-448d-aa00-03f14749eb61'],
    ['/setactive', original],
  ])
  assert.ok(commands.every(([executable, _args, options]) => executable === 'powercfg.exe' && options.windowsHide))
})

test('hardware queries coalesce, report physical display pixels, and isolate cached return values', async () => {
  let queries = 0
  const service = loadTs({
    electron: { screen: { getPrimaryDisplay: () => ({ size: { width: 2560, height: 1440 }, scaleFactor: 1.5 }) } },
    os: { cpus: () => [{ model: 'AMD Ryzen(TM) Processor' }], totalmem: () => 32 * 1024 ** 3, release: () => '10.0.26100' },
    child_process: { execFile: (executable, args, options, callback) => {
      queries++
      assert.equal(executable, 'powershell.exe')
      assert.equal(options.windowsHide, true)
      assert.ok(args.includes('-NonInteractive'))
      queueMicrotask(() => callback(null, 'Microsoft Basic Display Adapter, NVIDIA GeForce RTX 4080'))
    } },
  })('electron/hardwareService.ts')
  const [first, second] = await Promise.all([service.detectHardwareSpecs(), service.detectHardwareSpecs()])
  assert.equal(queries, 1)
  assert.equal(first.display, '3840x2160')
  assert.equal(first.gpu, 'NVIDIA GeForce RTX 4080')
  assert.equal(first.os, 'Windows 11')
  first.gpu = 'caller mutation'
  assert.equal(second.gpu, 'NVIDIA GeForce RTX 4080')
  assert.equal((await service.detectHardwareSpecs()).gpu, 'NVIDIA GeForce RTX 4080')
  assert.equal(queries, 1)
})

test('memory trimming launches the unpacked helper with only launcher process IDs', async () => {
  const commands = []
  const service = loadTs({
    electron: {
      app: { getPath: () => '/user', getAppPath: () => '/app.asar', getAppMetrics: () => [{ pid: 22, memory: { workingSetSize: 1024, privateBytes: 512 } }] },
      BrowserWindow: { getAllWindows: () => [] },
    },
    fs: { existsSync: () => true },
    child_process: { execFile: (executable, args, options, callback) => { commands.push([executable, args, options]); callback(null) } },
  })('electron/memoryOptimizerService.ts')
  await service.trimMemoryNow(true)
  assert.equal(commands.length, 1)
  assert.match(commands[0][0], /app\.asar\.unpacked/)
  assert.deepEqual(commands[0][1].sort(), [String(process.pid), '22'].sort())
  assert.equal(commands[0][2].windowsHide, true)
})

test('memory helper compilation uses a bounded argument list without invoking a shell', async () => {
  let compiled = false
  let compilation
  const target = path.join('C:/User Data/Eclipse', 'MemoryTrimmer.exe')
  const service = loadTs({
    electron: {
      app: { getPath: () => 'C:/User Data/Eclipse', getAppPath: () => '/app', getAppMetrics: () => [] },
      BrowserWindow: { getAllWindows: () => [] },
    },
    fs: { existsSync: file => file === target ? compiled : /MemoryTrimmer\.cs$|csc\.exe$/.test(file) },
    child_process: {
      execFileSync: (executable, args, options) => { compilation = { executable, args, options }; compiled = true },
      execFile: (_file, _args, _options, callback) => callback(null),
    },
  })('electron/memoryOptimizerService.ts')
  await service.trimMemoryNow(true)
  assert.ok(compilation)
  assert.ok(compilation.args.includes(`/out:${target}`))
  assert.equal(compilation.options.timeout, 15000)
  assert.equal(compilation.options.windowsHide, true)
})

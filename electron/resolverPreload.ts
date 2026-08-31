/**
 * Eclipse Resolver Stealth Preload
 * 
 * This script runs in the ISOLATED world BEFORE any page JavaScript executes.
 * It patches all browser fingerprinting APIs that Cloudflare Turnstile checks,
 * making Electron indistinguishable from a regular Chrome browser.
 * 
 * Injected via webPreferences.preload in resolveWithVisibleBrowser().
 */

// ── 1. Hide navigator.webdriver (most important CF check) ─────────────────────
Object.defineProperty(navigator, 'webdriver', {
  get: () => undefined,
  configurable: true
})

// ── 2. Remove Chrome DevTools Protocol automation markers ──────────────────────
// These variables are injected by CDP when automation is active
const propsToDelete = [
  'cdc_adoQpoasnfa76pfcZLmcfl_Array',
  'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
  'cdc_adoQpoasnfa76pfcZLmcfl_Symbol',
  '__driver_evaluate',
  '__webdriver_evaluate',
  '__selenium_evaluate',
  '__fxdriver_evaluate',
  '__driver_unwrapped',
  '__webdriver_unwrapped',
  '__selenium_unwrapped',
  '__fxdriver_unwrapped',
  '__webdriverFunc',
  '__webdriver_script_fn',
  '$chrome_asyncScriptInfo',
  '$cdc_asdjflasutopfhvcZLmcfl_',
]
propsToDelete.forEach(p => {
  try { delete (window as any)[p] } catch {}
})

// ── 3. Realistic navigator.plugins (empty = bot signal) ──────────────────────
if (navigator.plugins.length === 0) {
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const fakePlugin = {
        0: { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: null },
        name: 'Chrome PDF Plugin',
        description: 'Portable Document Format',
        filename: 'internal-pdf-viewer',
        length: 1
      }
      return [fakePlugin] as any
    }
  })
}

// ── 4. Realistic navigator.languages ─────────────────────────────────────────
Object.defineProperty(navigator, 'languages', {
  get: () => ['de-DE', 'de', 'en-US', 'en']
})

// ── 5. Hide Electron from User-Agent reported to JS ───────────────────────────
// navigator.userAgent is set by ses.setUserAgent() but verify it doesn't have "Electron"
const ua = navigator.userAgent
if (ua.includes('Electron')) {
  const cleanUA = ua.replace(/\s?Electron\/[\d.]+/g, '')
  Object.defineProperty(navigator, 'userAgent', { get: () => cleanUA })
  Object.defineProperty(navigator, 'appVersion', {
    get: () => cleanUA.replace('Mozilla/', '')
  })
}

// ── 6. Realistic screen / window dimensions (non-zero) ───────────────────────
// Headless browsers often report 0×0 which is a bot signal
if (screen.width === 0 || screen.height === 0) {
  Object.defineProperty(screen, 'width',       { get: () => 1920 })
  Object.defineProperty(screen, 'height',      { get: () => 1080 })
  Object.defineProperty(screen, 'availWidth',  { get: () => 1920 })
  Object.defineProperty(screen, 'availHeight', { get: () => 1040 })
  Object.defineProperty(screen, 'colorDepth',  { get: () => 24 })
  Object.defineProperty(screen, 'pixelDepth',  { get: () => 24 })
}

// ── 7. Override permission query to avoid Notification denied = bot signal ────
const origQuery = navigator.permissions?.query?.bind(navigator.permissions)
if (origQuery) {
  Object.defineProperty(navigator.permissions, 'query', {
    value: (params: any) => {
      if (params?.name === 'notifications') {
        return Promise.resolve({ state: 'prompt', onchange: null } as PermissionStatus)
      }
      return origQuery(params)
    }
  })
}

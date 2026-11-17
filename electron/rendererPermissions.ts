import type { Session } from 'electron'
import { isTrustedWebContents } from './ipcSecurity'

const allowed = (permission: string) => permission === 'media' || permission === 'display-capture' || permission === 'fullscreen'

function sameOrigin(contentsUrl: string, origin: string) {
  try {
    const page = new URL(contentsUrl)
    // Chromium reports file:/// for enumeration, while URL.origin serializes files as null.
    if (page.protocol === 'file:') return origin === 'null' || new URL(origin).protocol === 'file:'
    return new URL(origin).origin === page.origin
  } catch { return false }
}

export function initRendererPermissions(target: Session): void {
  target.setPermissionCheckHandler((contents, permission, origin, details) => {
    if (!allowed(permission) || !isTrustedWebContents(contents)) return false
    if (details.isMainFrame === false) return false
    return sameOrigin(contents!.getURL(), origin)
  })
  target.setPermissionRequestHandler((contents, permission, callback, details) => {
    let samePage = !details.requestingUrl
    try {
      const requested = new URL(details.requestingUrl || contents.getURL()), page = new URL(contents.getURL())
      requested.hash = ''; page.hash = ''; samePage = requested.href === page.href
    } catch {}
    callback(allowed(permission) && isTrustedWebContents(contents) && details.isMainFrame !== false && samePage)
  })
}

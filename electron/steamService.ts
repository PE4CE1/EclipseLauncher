import { net } from 'electron'

let cachedAvatarUrl: string | null = null
let lastProfileUrl: string = ''

export async function fetchSteamAvatar(profileUrl: string): Promise<string | null> {
  if (!profileUrl) return null
  if (profileUrl === lastProfileUrl && cachedAvatarUrl) {
    return cachedAvatarUrl
  }

  // Ensure it has https
  let url = profileUrl
  if (!url.startsWith('http')) {
    // If it's just an ID or custom URL, build the full URL
    if (url.match(/^\d{17}$/)) {
      url = `https://steamcommunity.com/profiles/${url}`
    } else {
      url = `https://steamcommunity.com/id/${url}`
    }
  }

  console.log(`[SteamService] Fetching profile: ${url}`)
  
  return new Promise((resolve) => {
    const request = net.request(url)
    request.on('response', (response) => {
      let body = ''
      response.on('data', (chunk) => { body += chunk.toString() })
      response.on('end', () => {
        // Regex to find the avatar image inside the HTML
        // Usually it's in a <div class="playerAvatarAutoSizeInner"> or <link rel="image_src" href="...">
        const match = body.match(/<link rel="image_src" href="([^"]+)">/i)
        if (match && match[1]) {
          cachedAvatarUrl = match[1].replace('_medium', '_full')
          lastProfileUrl = profileUrl
          console.log(`[SteamService] Found avatar: ${cachedAvatarUrl}`)
          resolve(cachedAvatarUrl)
        } else {
          console.log('[SteamService] Could not find avatar URL in HTML.')
          resolve(null)
        }
      })
    })
    request.on('error', (err) => {
      console.error('[SteamService] Failed to fetch Steam profile:', err)
      resolve(null)
    })
    request.end()
  })
}

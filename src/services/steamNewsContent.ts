import DOMPurify from 'dompurify'

const attribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const imageHosts = ['steamstatic.com', 'steamusercontent.com', 'steamcommunity.com', 'steamcommunity-a.akamaihd.net']
const unquote = (value: string) => value.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2')

export function steamNewsImageUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim().replace(/\{STEAM_CLAN_IMAGE\}/g, 'https://clan.fastly.steamstatic.com/images').replace(/^\/\//, 'https://'))
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !imageHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host))) return
    return url.href
  } catch { return }
}

function parseContents(contents: string): Document {
  const lists: Array<{ tag: string; item: boolean }> = []
  const html = contents.slice(0, 150_000)
    .replace(/\{STEAM_CLAN_IMAGE\}/g, 'https://clan.fastly.steamstatic.com/images')
    .replace(/\[img([^\]]*)\]([\s\S]*?)\[\/img\]/gi, (_all, options: string, body: string) => {
      const source = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))/i.exec(options)
      const url = steamNewsImageUrl(source ? source[1] ?? source[2] ?? source[3] : body)
      return url ? '<img src="' + attribute(url) + '" alt="">' : ''
    })
    .replace(/\[previewyoutube=([^\]]+)\]([\s\S]*?)\[\/previewyoutube\]/gi, (_all, options: string) => {
      const id = unquote(options).split(';')[0]
      return /^[\w-]{11}$/.test(id) ? '<p><a href="https://www.youtube.com/watch?v=' + id + '">YouTube ↗</a></p>' : ''
    })
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, (_all, url: string, label: string) => '<a href="' + attribute(unquote(url)) + '">' + label + '</a>')
    .replace(/\[url\]([^\[]+)\[\/url\]/gi, (_all, url: string) => '<a href="' + attribute(url.trim()) + '">' + attribute(url) + '</a>')
    // Steam emits both implicit list items and explicit [/*] endings, including nested lists.
    .replace(/\[(\/)?(list|olist|\*)\]/gi, (_all, close: string, name: string) => {
      const tag = name.toLowerCase()
      const current = lists[lists.length - 1]
      if (tag === '*') {
        if (!current) return ''
        if (close) { const ending = current.item ? '</li>' : ''; current.item = false; return ending }
        const ending = current.item ? '</li>' : ''; current.item = true; return ending + '<li>'
      }
      if (!close) { const list = { tag: tag === 'olist' ? 'ol' : 'ul', item: false }; lists.push(list); return '<' + list.tag + '>' }
      const list = lists.pop()
      return list ? (list.item ? '</li>' : '') + '</' + list.tag + '>' : ''
    })
    .replace(/\[(\/)?(h[1-3]|b|i|u|p|strike|quote|code|table|tr|th|td)\]/gi, (_all, close: string, name: string) => {
      const tag = name.toLowerCase()
      return '<' + (close || '') + (({ b: 'strong', i: 'em', strike: 's', quote: 'blockquote' } as Record<string, string>)[tag] || tag) + '>'
    })
    .replace(/\[hr\]/gi, '<hr>')
    .replace(/\r?\n/g, '<br>')
    .replace(/(?:<br>)*(<\/?(?:h[1-3]|p|ul|ol|li|blockquote|hr|pre|table|tr|th|td)(?:\s[^>]*)?>)(?:<br>)*/gi, '$1')
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'hr', 'a', 'img', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    ALLOWED_ATTR: ['href', 'src', 'alt'], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  for (const element of doc.querySelectorAll('a, img')) {
    const isImage = element.tagName === 'IMG'
    try {
      const value = element.getAttribute(isImage ? 'src' : 'href') || ''
      const url = new URL(isImage ? steamNewsImageUrl(value) || '' : value)
      if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Untrusted news URL')
      if (isImage) {
        element.setAttribute('src', url.href)
        element.setAttribute('loading', 'lazy'); element.setAttribute('decoding', 'async'); element.setAttribute('referrerpolicy', 'no-referrer')
      } else { element.setAttribute('target', '_blank'); element.setAttribute('rel', 'noopener noreferrer') }
    } catch { if (isImage) element.remove(); else element.removeAttribute('href') }
  }
  for (const element of doc.querySelectorAll('p,h1,h2,h3')) if (!element.textContent?.trim() && !element.querySelector('img')) element.remove()
  return doc
}

export function formatSteamNews(contents: string): string { return parseContents(contents).body.innerHTML }

export function prepareSteamNews(contents: string) {
  const doc = parseContents(contents)
  const fullHtml = doc.body.innerHTML
  const image = doc.querySelector('img')
  const previewImage = image?.getAttribute('src') || undefined
  const text = doc.body.textContent?.replace(/\s+/g, ' ').trim() || ''
  let leadImage: string | undefined
  if (image) {
    const before = doc.createRange(); before.selectNodeContents(doc.body); before.setEndBefore(image)
    // Only lift a leading image; images later in the article keep their original context.
    if (!before.toString().trim()) {
      leadImage = previewImage
      const parent = image.parentElement
      image.remove()
      if (parent?.tagName === 'P' && !parent.textContent?.trim() && !parent.querySelector('img')) parent.remove()
    }
  }
  return { html: doc.body.innerHTML, fullHtml, previewImage, leadImage, excerpt: text.slice(0, 180), searchText: text.toLocaleLowerCase(), minutes: Math.max(1, Math.ceil(text.split(/\s+/).filter(Boolean).length / 220)) }
}

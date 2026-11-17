/** The featured-category API uses type=0 for every app, including hardware.
 * Reject known invalid titles immediately; Store metadata later verifies type. */
export function isHomeGameCandidate(id: number, name: string): boolean {
  const title = name.trim()
  return Number.isSafeInteger(id) && id > 0 && id <= 0xffffffff && !!title
    && !/^(?:uninitiali[sz]ed|undefined|null|unknown(?:\s+(?:app|game))?|app\s*\d+)$/i.test(title)
    && !/^steam\s+(?:deck|frame|controller|machine|link)(?:$|[\s™®:])/i.test(title)
}

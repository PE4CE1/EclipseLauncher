export const MAX_CROSSHAIR_WEBP_BYTES = 768 * 1024
export const MAX_CROSSHAIR_WEBP_DATA_LENGTH = Math.ceil(MAX_CROSSHAIR_WEBP_BYTES / 3) * 4 + 23
export class CrosshairWebpError extends Error {
  constructor(public code: 'invalid' | 'limits') { super(code === 'limits' ? 'Crosshair image exceeds safe decoding limits' : 'Invalid WebP image') }
}
/** Animation frames can be small changed rectangles, not full canvas copies. */
export function inspectCrosshairWebp(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (bytes.length > 2 * 1024 * 1024) throw new CrosshairWebpError('limits')
  if (bytes.length < 30 || tag(0) !== 'RIFF' || tag(8) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) throw new CrosshairWebpError('invalid')
  let width = 0, height = 0, frames = 0, framePixels = 0, animated = false
  const uint24 = (offset: number) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = view.getUint32(offset + 4, true), data = offset + 8, kind = tag(offset)
    if (data + size > bytes.length) throw new CrosshairWebpError('invalid')
    if (kind === 'VP8X' && size >= 10) {
      animated = !!(bytes[data] & 2)
      width = 1 + bytes[data + 4] + bytes[data + 5] * 256 + bytes[data + 6] * 65536
      height = 1 + bytes[data + 7] + bytes[data + 8] * 256 + bytes[data + 9] * 65536
    } else if (!width && kind === 'VP8 ' && size >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 1 && bytes[data + 5] === 0x2a) {
      width = view.getUint16(data + 6, true) & 0x3fff; height = view.getUint16(data + 8, true) & 0x3fff
    } else if (!width && kind === 'VP8L' && size >= 5 && bytes[data] === 0x2f) {
      const packed = view.getUint32(data + 1, true)
      width = (packed & 0x3fff) + 1; height = ((packed >>> 14) & 0x3fff) + 1
    }
    if (kind === 'ANMF') {
      if (size < 16) throw new CrosshairWebpError('invalid')
      const fw = uint24(data + 6) + 1, fh = uint24(data + 9) + 1
      if (uint24(data) * 2 + fw > width || uint24(data + 3) * 2 + fh > height) throw new CrosshairWebpError('invalid')
      framePixels += fw * fh; frames++
    }
    offset = data + size + (size & 1)
  }
  if (!width || !height || (animated && !frames) || (!animated && frames)) throw new CrosshairWebpError('invalid')
  if (width > (animated ? 1024 : 2048) || height > (animated ? 1024 : 2048) || frames > 1500 || framePixels > 16_000_000 || (animated && (bytes.length > MAX_CROSSHAIR_WEBP_BYTES || width * height * frames > 32_000_000))) throw new CrosshairWebpError('limits')
  return { width, height, animated, frames }
}

export const clipDimensions: Record<string, readonly [number, number]> = {
  '360p':[640,360], '480p':[854,480], '720p':[1280,720], '1080p':[1920,1080], '1440p':[2560,1440], '4k':[3840,2160],
}
export function clipBitrateMbps(value: string | number | undefined, quality = '720p'): number {
  const automatic = ({ '360p':1.5, '480p':1.5, '720p':6, '1080p':10, '1440p':16, '4k':30 } as Record<string, number>)[quality] || 6
  const legacy = ({ low:1.5, medium:6, high:10, ultra:30 } as Record<string, number>)[String(value)]
  const parsed = typeof value === 'number' ? value : /^\d+(?:\.\d+)?M?$/i.test(value || '') ? parseFloat(value!) : legacy || automatic
  return Math.max(.5,Math.min(100,Number.isFinite(parsed)?parsed:automatic))
}

export function overlayStatus(count: number, language: string): string {
  if (count === 0) return language === 'de' ? 'Keine Overlays aktiv' : 'No overlays active'
  return language === 'de'
    ? `${count} Overlay${count === 1 ? '' : 's'} aktiv`
    : `${count} overlay${count === 1 ? '' : 's'} active`
}

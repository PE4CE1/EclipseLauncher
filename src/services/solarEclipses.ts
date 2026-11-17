export type SolarEclipseType = 'total' | 'annular' | 'partial' | 'hybrid'
export const ECLIPSE_CALENDAR_SOURCE = 'https://eclipse.gsfc.nasa.gov/SEdecade/SEdecade2021.html'
// NASA/GSFC decade tables, 2021–2030 and 2031–2040. Dates describe the global
// event, not visibility at the user's location; TD times are deliberately omitted.
const dates: [string, SolarEclipseType][] = [
  ['2026-02-17','annular'],['2026-08-12','total'],['2027-02-06','annular'],['2027-08-02','total'],
  ['2028-01-26','annular'],['2028-07-22','total'],['2029-01-14','partial'],['2029-06-12','partial'],
  ['2029-07-11','partial'],['2029-12-05','partial'],['2030-06-01','annular'],['2030-11-25','total'],
  ['2031-05-21','annular'],['2031-11-14','hybrid'],['2032-05-09','annular'],['2032-11-03','partial'],
  ['2033-03-30','total'],['2033-09-23','partial'],['2034-03-20','total'],['2034-09-12','annular'],
  ['2035-03-09','annular'],['2035-09-02','total'],['2036-02-27','partial'],['2036-07-23','partial'],
  ['2036-08-21','partial'],['2037-01-16','partial'],['2037-07-13','total'],['2038-01-05','annular'],
  ['2038-07-02','annular'],['2038-12-26','total'],['2039-06-21','annular'],['2039-12-15','total'],
  ['2040-05-11','partial'],['2040-11-04','partial'],
]

export function upcomingSolarEclipses(now = new Date()) {
  if (!Number.isFinite(now.getTime())) return { next: null, total: null }
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const upcoming = dates.filter(([date]) => Date.parse(date + 'T00:00:00Z') >= today)
  const describe = (event: typeof dates[number] | undefined) => {
    if (!event) return null
    const days = Math.round((Date.parse(event[0] + 'T00:00:00Z') - today) / 86_400_000)
    return { date: event[0], type: event[1], days, years: days / 365.2425 }
  }
  return { next: describe(upcoming[0]), total: describe(upcoming.find(([, type]) => type === 'total')) }
}

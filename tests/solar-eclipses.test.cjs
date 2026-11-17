const test = require('node:test'), assert = require('node:assert/strict')
const { upcomingSolarEclipses } = require('./download-loader.cjs')()('src/services/solarEclipses.ts')
test('the next global eclipse and next total eclipse follow the NASA calendar', () => {
  const result = upcomingSolarEclipses(new Date('2026-11-04T15:00:00Z'))
  assert.equal(result.next.date, '2027-02-06'); assert.equal(result.next.type, 'annular'); assert.equal(result.next.days, 94)
  assert.ok(result.next.years > .25 && result.next.years < .26)
  assert.equal(result.total.date, '2027-08-02'); assert.equal(result.total.type, 'total')
})
test('eclipse date rollover handles the event day, partial eclipses and leap years', () => {
  assert.equal(upcomingSolarEclipses(new Date('2027-02-06T23:59:00Z')).next.days, 0)
  assert.equal(upcomingSolarEclipses(new Date('2027-02-07T00:00:00Z')).next.date, '2027-08-02')
  assert.equal(upcomingSolarEclipses(new Date('2029-01-01T00:00:00Z')).next.type, 'partial')
  assert.equal(upcomingSolarEclipses(new Date('2028-02-29T12:00:00Z')).next.days, 144)
})
test('expired or invalid calendars do not invent future eclipse dates', () => {
  assert.deepEqual(upcomingSolarEclipses(new Date('2041-01-01')), { next: null, total: null })
  assert.deepEqual(upcomingSolarEclipses(new Date('invalid')), { next: null, total: null })
})

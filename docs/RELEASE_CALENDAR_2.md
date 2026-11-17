# Home release calendar

7 November 2026.

The former four-card Coming Soon section is now a weekly release calendar. Its Home shortcut is **Calendar / Kalender**. Seven real weekdays are retained, including weekend releases; dates are never moved to a different day to fill a column.

## Behavior

- Monday-to-Sunday columns, current-day marker, two landscape Steam covers per day and a `+N more` button that opens all selected games from that date.
- Previous/next week navigation covers two previous and four upcoming weeks. **This week** returns to the current week. Navigation reuses the loaded snapshot rather than making requests for each click.
- Games show **Released**, **Scheduled** or **Release pending**. A missed planned date does not imply that the game has launched; Steam's actual `is_coming_soon` flag controls its state.
- Clicking any game opens the existing game preview. The expanded day list uses the existing keyboard/focus-trapped collection dialog.
- Approximate dates (month, quarter, year), custom release messages and unknown dates stay under **Release date to be confirmed / Termin noch offen**. They never receive an arbitrary calendar day. Only publicly exact dates occupy a day.
- All controls, dates, counts, empty/error messages and accessibility labels follow the EN/DE language setting. Game titles, developer-authored release messages and the Early Access product term remain source content.
- Narrow layouts scroll within the calendar, leaving the page width unchanged. No automatic scrolling, animated background or continuous rendering loop was added. Loading cells are static.

## Source and performance

`src/services/releaseCalendar.ts` fetches the two public Steam search lists: popular new releases ordered by `Released_DESC`, and popular upcoming releases. Only app IDs are extracted from bounded search markup; HTML is never inserted into the renderer. Up to 240 unique candidate IDs (including already loaded Home release candidates) are resolved through batched `IStoreBrowseService/GetItems` requests with at most two concurrent metadata requests. Returned app IDs, type, success, visibility, timestamps, public date precision and asset URLs are validated.

The public `coming_soon_display` controls precision. Private timestamps behind an approximate date are not exposed as a precise day. Steam release semantics are described in Valve's [release-date documentation](https://partner.steamgames.com/doc/store/release_dates). This is a public Steam discovery selection, not Valve's authenticated personalized-calendar recommendations or an exhaustive list of every Steam release.

Calendar fetching starts only near the section, uses the DE store region and the chosen language, caches for 15 minutes, and has a 15-second combined cancellation/deadline. No request is made per visible card. Changing weeks is local. Midnight or returning after a day change updates the current-day key and refreshes the daily snapshot when visible. One unavailable list or batch yields a partial-data notice; total failure yields retry without fabricated dates.

A live check returned **200 games in four requests in approximately 0.9 seconds** on the test connection. This is a measurement, not a network guarantee. `tests/fixtures/release-calendar.json` contains the limited public snapshot used in reproducible tests; UI dates are shifted by whole weeks for repeatability.

## Verification

- `npm run check`: **461/461 tests passed**, TypeScript and production build passed. `.cache/release-calendar/check.log`.
- Date tests: Monday/Sunday boundaries, weekends, year changes, DST weeks, public precision, approximate dates, stale plans, future non-releases, grouping, parser bounds, invalid metadata/artwork, partial failures and cancellation.
- Real-component Electron Home test: lazy requests, all seven days, Today, week navigation, past/future states, expanded day collections, unknown-date list, game opening, failure/retry, English/German, widths 1380/1000/760/540 and no renderer errors. `.cache/home-preview/verification.json`.
- Visually inspected with actual Steam artwork: `.cache/home-preview/calendar-detail-live.png` and `calendar-next-detail-live.png`. Fixture dates/state are deterministic; the separate live feed is `.cache/release-calendar/live-feed.json`.

Main files: `HomeUpcoming.tsx`, `release-calendar.css`, `releaseCalendar.ts`, the Home integration in `HomePreview.tsx`, shared translations, `tests/release-calendar.test.cjs` and the updated Home Electron fixture. Old four-card styles were removed.

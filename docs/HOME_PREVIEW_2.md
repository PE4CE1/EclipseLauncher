# Home discovery

Updated 11 November 2026.

## Single Home layout

New Home is now the only Home layout. The Classic implementation and layout selector have been removed. The retired `homeLayout` preference is stripped during settings loading and saving; existing libraries, installed games and sources are preserved.

## Preview composition

1. Larger spotlight (490 px desktop, 470/480 px at smaller widths) with eight games and compact dot selectors inside a subtle bottom-right pill. Six recent, well-reviewed active games lead the selection, followed by current paid bestsellers and other verified popular games. Rotation advances after 6.5 seconds plus the completed crossfade. It pauses over interactive controls, on keyboard focus, loss of window focus, open game details, reduced motion and when scrolled offscreen. Hovering the artwork alone no longer stops rotation.
2. **New & popular / Neu & beliebt** directly below section navigation: released within 180 days, at least 100 current players, at least 100 Steam reviews, at least 70% positive. Dates, counts and reviews are validated; zero, unknown or failed player counts do not qualify. Older hits can appear in the highlights but are never relabeled as new releases.
3. Steam offers expanded with up to 60 additional search candidates, with returned prices, old prices and discounts.
4. Weekly release calendar directly after the offers, before updates and bestsellers. Seven days, two covers per day, expanded day lists, past/future weeks, Today and a separate list of unconfirmed dates. See `RELEASE_CALENDAR_2.md` for source validation and tests.
5. Six image-led official developer updates and announcements initially; **More updates / Weitere Updates** adds three at a time, up to twelve. Clicking a card opens the existing News & Updates reader at that exact announcement.
6. Up to 40 current Steam bestsellers.

“View all / Alle ansehen” opens an in-app collection of the received games. Game detail and library actions continue to use the existing components. The catalog shortcut opens the normal catalog. Home remains a store/discovery page rather than a recent-played list.

## Data and performance

The preview combines Steam `featuredcategories` with public Steam sale, bestseller and popular-new search lists. Search markup supplies app IDs only; it is never rendered as HTML. Offers and bestsellers are validated against actual Store app types in batches of at most 100. The raw categories classify Steam hardware as app entries, so their category type alone is insufficient. Hardware, software, DLC, unavailable items and placeholder names such as `Uninitialized` are excluded from the validated rows; the shared placeholder/hardware guard also protects updates and calendar items. A failed metadata batch never falls back to unverified cards.

Recommendations use the official concurrent-player chart, additional popular-new candidates and batched Store metadata (up to 200 candidate IDs in two requests); at most 24 promising releases outside the top 100 get individual player-count checks, with three concurrent workers and a four-second supplemental budget. Failed counts remain unknown. The complete recommendation request has a 15-second deadline and supports cancellation. A live end-to-end check on 7 November returned 24 verified releases, 60 offers, 40 bestsellers and eight highlights in about 2.4 seconds on the test connection; this is a measurement, not a network guarantee. `.cache/home-refine/live-report.json` records that check. Public 6 November snapshots remain in `tests/fixtures/home-store.json` and `home-recommendations.json`. Types, IDs, duplicated items, image URLs and monetary values are validated. A zero/missing upcoming price does not imply free to play; actual `is_free` is respected. English/German changes keep the same DE store country used by the existing detail pages; localization does not silently change currency.

Queries are cached for 15 minutes and do not refetch on every window focus. Known hash-based HD hero URLs are decoded directly. Optional logos load separately and never block a ready banner or appear halfway through a fade. Active slides and preloads share preparation work; canceling a preload does not cancel an active consumer. Adjacent slides load first, then the remaining compact set, with at most two preparations in flight. Preparation stops offscreen, unfocused or with game details open; the bounded cache holds at most sixteen entries. Manual cached selections commit immediately, including rapid repeated clicks during an existing transition. The old image stays opaque until the decoded incoming image crossfades over it.

Existing poster caches and lazy image loading remain in use. News starts only near the visible section, uses shared existing news query keys and is limited to two concurrent Home news requests. Upcoming detail metadata loads only near its section. No live background, canvas loop, trailer autoplay or continuous UI timer was added. Switching to Classic unmounts the preview. A failed recommendation request shows a localized retry state instead of filling the release row with unverified games.

All Home controls, headings, counts, empty/error states and accessibility labels use the shared EN/DE catalog. Live game descriptions are requested from Steam in the selected language. The curated offline fallback has German descriptions and translated genres. Game titles remain proper names; developer-authored news is supplied in the languages available from Steam. Additional static-label gaps in profiles, the clip editor, launch screen, controller editing and overlay settings were corrected.

The normal floating header retains its blur while focused. Unfocused/background modes use an opaque fallback without blur or the game-page gradient, preventing readable content from showing through. Window blur explicitly deactivates the scene rather than depending on the timing of `document.hasFocus()`.

Home update cards wait for news and event metadata before committing their content, avoiding a patch card being replaced by a major-update card halfway through loading. Missing announcement images fall back to the game's actual header, then a news icon if neither image is available. Only recent official articles are selected; future or older-than-90-day articles are excluded. If a feed fails, Home shows a retry state, retains usable highlights and offers feed retry. Public feed availability and image availability still depend on Steam.

## Verification

- 7 November Home refinement: **468/468 unit tests**, type check and production build passed. The real-component Home test covers automatic rotation, focus loss, immediate cached switching, six initial updates plus more, the higher calendar position, both languages and responsive widths; the Store regression fixture passed slow-image loading, rapid navigation, feed reordering, immediate Back and changing reduced-motion preference. Logs: `.cache/home-refine/check.log`, `build.log`, `ui-live.log`, `store-ui.log`; reports: `.cache/home-preview/verification.json`, `.cache/store-polish/verification.json`.
- Recommendation implementation: `npm run check`, **446/446 tests passed**, production build succeeded. `.cache/home-relevance-check.log`.
- 7 November cleanup: type check, 13 Home/translation unit tests and production build passed. Full Home and Settings Electron fixtures passed, including header focus fallback, removal of the banner/thumbnails, eight dot selectors, persisted layout changes and failed-save rollback. `.cache/home-clean-tests.log`, `.cache/home-clean-build.log`, `.cache/home-preview/verification.json`, `.cache/settings-ui/verification.json`.
- New parser tests cover malformed/duplicated/non-app items, prices, image hosts, unknown upcoming prices, bounded rows, recent official major-update selection, regional consistency and cancellation.
- Home refinement checks add expanded lists, metadata-batch failure, cancellation during validation, placeholder/hardware rejection, direct hashed artwork, non-blocking logos and shared preload cancellation. The Electron test exercises automatic rotation, focus-loss pause, immediate cached switching, larger artwork, six initial updates and loading further updates; its measured switch time is in `.cache/home-preview/verification.json`.
- Isolated real-component Electron Home: layout order, eight banner selectors, verified release selection, view-all collection, article selection, upcoming dates, classic restoration, saved preference after reload, failed-save rollback, feed failure and recommendation-source failure with recovery. Widths: 1380, 1000, 760 and 540 px; English/German descriptions and controls; no renderer errors. `.cache/home-preview/verification.json`.
- The existing store fixture was rebuilt with current code. It passed delayed-image transitions, rapid hero navigation, feed reordering, unclipped card hover, immediate removal of game details on Back and reduced-motion checks.
- The preview was also visually inspected with public Steam artwork and actual artwork metadata. Screenshots: `.cache/home-preview/preview-live-top.png`, `preview-540.png`, `preview-updates.png`, `classic.png`. News text in interaction tests is synthetic; these test screenshots are not evidence of live announcements or future release dates.

Tests use isolated user data; they do not alter the user's saved Home preference, install games or publish a release.

## Main implementation

Automatic refresh was added on 8 November: discovery and recommendations refresh after ten minutes, calendar/news feeds after fifteen. Checks pause while unfocused, offline, outside Home or covered by game details; return/focus/online events catch up overdue data. Cached content stays mounted while refetching. Newly listed games were verified entering the calendar automatically in the real-component fixture. See `KEYFORSTEAM_2.md` for the policy and test evidence.

- `src/components/home/HomeView.tsx`: sole Home entry; `src/services/retiredSettings.ts`: removal of retired layout/limit preferences.
- `HomePreview.tsx`, `home-preview.css`: new composition and scoped styling.
- `HomeUpdates.tsx`, `HomeUpcoming.tsx`, `HomeCollection.tsx`, `useHomeVisible.ts`: lazy secondary content and collections.
- `HeroSection.tsx`, `GameCarousel.tsx`, `GameCard.tsx`: opt-in compact hero, richer row headings and keyboard game access.
- `src/services/homeDiscovery.ts`: validated public feed and recent-news selection.
- `src/services/homeGameFilter.ts`: shared rejection of invalid IDs, placeholder names and known Steam hardware families; `heroArtwork.ts`: bounded decoded-artwork preparation and cache.
- `src/services/homeRecommendations.ts`: bounded live activity/metadata checks, recent-release and highlight selection.
- `src/i18n/interfaceTranslations.ts`, `gameContent.ts`: shared Home labels and localized fallback content.
- `src/components/shared/GameUpdates.tsx`: optional initial announcement ID.
- `tests/home-discovery.test.cjs`, `home-preview-fixture.*`, `home-preview-smoke.cjs`.

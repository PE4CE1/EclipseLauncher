# Keyforsteam comparison and discovery refresh

Updated 8 November 2026.

## Prices and links

The former implementation generated most shop prices from a single anchor, title-based multipliers, hardcoded coupons and a fixed EUR/USD exchange rate. Those calculations and the unused Instant Gaming IPC integration have been removed.

The new flow verifies the Steam app ID against a fresh regional Steam response, finds the exact PC product in Keyforsteam's public quick search and parses the comparison page's public offer JSON without executing scripts. Sequels, console listings, DLC, remasters and other editions are not accepted as substitutes. Page name and currency must match. USD uses the provider's actual USD page. Missing sources never generate invented prices.

Offers retain the provider's offer ID, merchant ID, edition, activation platform, region, product type and stock status. Links follow the provider's own redirection format with the same offer ID, currency, merchant and coupon. Card fees are selected by default; PayPal and prices before fees are separate options. Coupons are already included in provider prices and are not deducted a second time. Unknown fees are labeled. Steam references are fetched fresh in the same currency. Checkout prices can change at the merchant; the UI displays its check time and a source link.

The button preview selects only confirmed, in-stock base-edition Steam keys for Global/EU/Germany regions. Accounts, gifts, GOG/Epic products, restricted regions and other editions cannot supply that badge. The dialog lets the user deliberately change platform, edition, type and payment basis. Coupon copying uses the native clipboard bridge with real success/error feedback.

Badge and dialog share one cancellable query per app, currency, portal and language. Data is fresh for two minutes. The open, focused dialog refreshes every five minutes. Other-currency results cannot overwrite the visible query. Refreshing retains existing rows; source failures show a retry state or retain previously checked rows with a notice.

## Dialogs and media

The comparison uses a compact header, summary, filters and a row list rather than a stack of nested cards. Its backdrop is opaque immediately, with no blur or scale animation. Focus trapping and Escape close the comparison while retaining the game preview.

Fullscreen media is opaque from its first frame. Full-screen ambient blur and whole-layer fade/exit retention were removed. Decoded replacement images still retain the previous picture until the next is ready. The inline trailer is suspended while expanded media or the price comparison is open, and preserves the user's pause state.

## Automatic Home refresh

Home discovery and recommendations refresh after ten minutes. Calendar, developer news and classic Home feeds refresh after fifteen minutes. A single inexpensive minute check runs only while Home is focused, visible, online and uncovered. Leaving Home or tabbing out clears it. Returning to Home, focusing Eclipse or reconnecting checks overdue data immediately. In-flight requests are not restarted; errors back off and successful cached content remains visible during refetch.

The calendar rolls at local midnight and on foreground return. A new day's query retains prior data while fetching current lists. Each refresh discovers IDs again, allowing newly listed games to enter automatically. There is no fixed final date. Steam's popular-release lists remain a selection; unannounced or approximate release dates cannot be turned into guaranteed exact days.

## Verification

The compact follow-up keeps the quick actions on one row and shortens the game-page news button to **Updates** in both languages. A dedicated inline-size container measures the shortcut area's real available width, including narrower space beside the primary action buttons. At 640 px or below, playtime uses a short format and Steam/SteamDB use labeled, tooltip-backed icons. The full update-reader title is preserved. Geometry checks require a single row as well as visible, unbroken controls at all fourteen language/width combinations.

The comparison refinement adds aligned column headings, clearer type and contrast, quieter coupon chips, row highlighting and consistent action-button widths. Screenshots and geometry results are stored in `.cache/key-deals-refresh`. The Store fixture also checks stable title/action geometry and existing media transitions.

- `npm run check`: 475 unit tests, type check and production build passed. Unit cases cover exact identity, editions, fees, coupon handling, source URLs and offer IDs, wrong games/currencies, unavailable offers, failures and cancellation.
- Live public-source checks returned 109 EUR and 93 USD offers for Cyberpunk 2077, using distinct source-currency pages. These counts and prices are time-specific; `.cache/key-deals-refresh/live-EUR.json` and `live-USD.json` record the check.
- Real-component Home testing verifies newly discovered games entering the calendar automatically, no discovery requests while unfocused and preservation of the existing calendar node. `.cache/home-preview/verification.json`.
- The media fixture covers image/video fullscreen, decoded-image retention, single-player audio, pause restoration, stable header and Escape behavior. `.cache/game-media/verification.json`.
- Price-dialog testing uses isolated synthetic offers and intercepts shop links and clipboard writes. Logs and screenshots are in `.cache/key-deals-refresh`; `tests/deals-ui-smoke.cjs` documents the checks.

Main implementation: `src/services/keyforsteamData.ts`, `keyforsteamService.ts`, `discoveryRefresh.ts`; `src/hooks/useGamePriceComparison.ts`, `useDialogFocus.ts`; `src/components/shared/GameDealsModal.tsx`, `game-deals.css`, `GameDetailModal.tsx`; `src/components/home/useHomeAutoRefresh.ts`, `HomeUpcoming.tsx`.

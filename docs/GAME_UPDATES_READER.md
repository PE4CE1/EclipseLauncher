# Game news reader

The game preview's News & Updates dialog now has a thumbnail list, local search over titles and complete article text, a patch-notes filter and a separate reading pane. Desktop uses two independently scrolling columns; narrow windows use a horizontal article list above the reader. Search, filters, empty/error/loading states and reading-time labels support German and English. The publisher's article itself comes from Steam's requested-language feed.

## Images and formatting

- Modern Steam `[img src="..."][/img]`, legacy `[img]...[/img]` and safe HTML images all work. `{STEAM_CLAN_IMAGE}` resolves to Steam's clan image CDN.
- The first image becomes a title image only when it precedes all substantive text. It is then removed from the body to avoid duplication. Later images stay in context.
- List thumbnails use the first article image or the game's actual header artwork. Image failures fall back to that game artwork, then to a neutral image placeholder. Broken inline images are hidden.
- Native image dimensions are preserved in article content. Title images fit within their frame instead of cropping diagrams or text. Game-artwork fallbacks have a darker banner with the same reserved dimensions to avoid layout shifts.
- Explicit Steam `[/*]` list endings, implicit list items, nested lists, quoted links and basic tables render without leaking their formatting tokens. YouTube preview tokens become explicit external links; remote players are not embedded.
- HTML is sanitized with DOMPurify and a small tag/attribute allowlist. Images additionally require HTTPS on approved Steam domains, without credentials or custom ports. Links require HTTPS and use `noopener noreferrer`.

## Scope and performance

The dialog loads on demand and retains the existing newest-12-official-announcements request. Search filters those loaded posts, not Steam's entire news archive. Patch classification is a title-based convenience filter, not a publisher-provided event type. Content preparation is memoized for each feed response. Thumbnails and inline images load lazily; the active title image loads eagerly. Layout dimensions are reserved before images load. Transitions animate opacity only and respect reduced-motion settings.

The feed query retains its five-minute fresh cache and 30-minute garbage collection, with no refetch on window focus. No service, polling or animation continues after the reader is closed.

## Verification

- `npm test`: 190 passing tests, including official-feed selection, request cancellation and translation contracts.
- `npm run build:app`: successful typecheck and production build.
- `npx vite build --config tests/game-media-fixture.vite.mts` followed by `ECLIPSE_GAME_MEDIA=1 npm run test:electron`: real isolated Electron verification, including parser safety, modern/legacy image formats, nested list endings, tables, title-image deduplication, in-body search, filters, missing-image fallback, focus traversal, localization and widths 400/540/780/1150.
- Existing trailer pause/fullscreen, lightbox audio exclusivity and storage artwork checks still pass in the same native run.

Evidence: `.cache/game-media/verification.json`, `news-reader-de.png`, `news-reader-mobile.png`, and `tests/news-updates-*.log`.

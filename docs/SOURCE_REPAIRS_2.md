# Source catalog audit and repair — 2.0

Checked on 2026-11-08 against all 18 URLs in the current [Eclipse download catalog](https://eclipselauncher.pages.dev/#/downloads). This change updates the launcher; it does not deploy the website.

## Result

Nine original feeds returned valid catalogs. Seven failing HydraLinks feeds have matching, independently validated alternatives. Atmos has no verified alternative, and Kazumi currently returns HTTP 403. Alternatives are separate community catalogs and may differ in coverage and freshness. A valid catalog does not verify every game download or its contents.

| Original source | Observed result | Verified alternative |
| --- | --- | --- |
| [SteamGG](https://wkeynhk.online/steamgg.json) | HTTP 200, 6,752 valid entries | No verified replacement needed |
| [No-Intro](https://wkeynhk.online/no-intro.json) | HTTP 200, 20,051 valid entries | No verified replacement needed |
| [Shisuy's source](https://raw.githubusercontent.com/Shisuiicaro/source/refs/heads/main/shisuyssource.json) | HTTP 200, 25,627 valid entries | No verified replacement needed |
| [RuTracker & Rutor](https://wkeynhk.online/rutor.json) | HTTP 200, 67,833 valid entries | No verified replacement needed |
| [freetp by hydrasources.su](https://hydrasources.su/freetp_games.json) | HTTP 200, 3,146 valid entries | No verified replacement needed |
| [fontekazumi](https://davidkazumisource.com/fontekazumi.json) | HTTP 403 | No verified replacement found |
| [dodi](https://hydralinks.cloud/sources/dodi.json) | HTTPS connection failed | [DODI · ArnamentGames (Community)](https://raw.githubusercontent.com/ArnamentGames/HydraLinks/refs/heads/main/dodi.json), 2,637 entries |
| [fitgirl](https://hydralinks.cloud/sources/fitgirl.json) | HTTPS connection failed | [FitGirl · vinikjkkj (Community)](https://raw.githubusercontent.com/vinikjkkj/game-links-collection/refs/heads/master/jsons/fitgirl.json), 6,417 entries |
| [kaoskrew](https://hydralinks.cloud/sources/kaoskrew.json) | HTTPS connection failed | [KaOsKrew · HydraLinks Pages](https://hydralinks.pages.dev/sources/kaoskrew.json), 3,457 entries |
| [onlinefix](https://hydralinks.cloud/sources/onlinefix.json) | HTTPS connection failed | [OnlineFix · ArnamentGames (Community)](https://raw.githubusercontent.com/ArnamentGames/HydraLinks/refs/heads/main/onlinefix.json), 1,610 entries |
| [gog](https://hydralinks.cloud/sources/gog.json) | HTTPS connection failed | [GOG · HydraLinks Pages](https://hydralinks.pages.dev/sources/gog.json), 7,688 entries |
| [empress](https://hydralinks.cloud/sources/empress.json) | HTTPS connection failed | [EMPRESS · HydraLinks Pages](https://hydralinks.pages.dev/sources/empress.json), 40 entries |
| [xatab](https://hydralinks.cloud/sources/xatab.json) | HTTPS connection failed | [Xatab · ArnamentGames (Community)](https://raw.githubusercontent.com/ArnamentGames/HydraLinks/refs/heads/main/xatab.json), 7,321 entries |
| [atmos](https://hydralinks.cloud/sources/atmos.json) | HTTPS connection failed | No verified replacement found |
| [SkidrowReloaded](https://raw.githubusercontent.com/Altansar69/Hydra-Library/refs/heads/main/hydra-skidrowreloaded/skidrow_cleaned.json) | HTTP 200, 110,285 valid entries | No verified replacement needed |
| [Iris Hub](https://raw.githubusercontent.com/irisihrz/json/refs/heads/main/irishub.json) | HTTP 200, 72,288 valid entries | No verified replacement needed |
| [Skidrow (By Merabet4mine)](https://raw.githubusercontent.com/Merabet4mine/merabet4mine.github.io/refs/heads/master/assets/skidrow.json) | HTTP 200, 92,522 valid entries | No verified replacement needed |
| [Repack Igruha](https://raw.githubusercontent.com/sotik11/hydra-download-sources/main/data/repack-igruha.json) | HTTP 200, 12,727 valid entries | No verified replacement needed |

KaOsKrew, GOG and EMPRESS additionally have checked GitHub alternatives in [ArnamentGames/HydraLinks](https://github.com/ArnamentGames/HydraLinks), offered if their Pages feed later fails. No challenge, TLS check or HTTP access restriction is bypassed.

## Launcher behavior

In Settings → Downloads → Download sources, failing known feeds offer “Use alternative source”. All remote feeds also have a pencil button to change the address. Enter saves, Escape cancels. Eclipse fetches and validates a fresh, nonempty catalog before replacing the old row. Invalid URLs, stale caches, empty catalogs and failed requests leave the old source intact. Existing duplicate destinations are merged. Late results from removed sources or older destination refreshes cannot overwrite the validated replacement.

Sources are changed only when that button is used. The provider is shown before switching. Sources without a verified alternative offer address editing and the existing local JSON import instead of inventing a replacement.

## Verification

- All 18 published metadata URLs checked using HTTPS GET and the real catalog parser; long catalogs rechecked with separate 20-second header and 60-second body deadlines.
- All seven primary replacements plus three secondary alternatives fetched and cached through the actual Electron source service in an isolated profile: fresh, nonempty, readable cache, no interactive verification.
- Source reliability tests include failed replacement rollback, invalid/empty/stale data, duplicate merging, concurrent refreshes, deletion races, credential and scheme rejection, strict provider matching, TLS failures and cache retention.
- Isolated Electron UI test exercises both replacement paths, invalid URL rejection, failure recovery, focus, and narrow-window layout. Screenshots and audit JSON are stored in the local .cache directory.
- TypeScript checks, the complete automated suite and production build were run.

Recheck provider availability before a future release: these external services can change independently of Eclipse.

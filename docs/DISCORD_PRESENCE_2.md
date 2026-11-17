# Discord Rich Presence reliability — 2.0

Updated 6 November 2026.

## Version display and external downloads · 15 November 2026

`discordRpcShowVersion` is an opt-in setting in Discord integrations and Clips-mode Discord settings. It appends the package version to idle, game and download state text, reserves space within Discord's text limit and updates through the existing rate-limited connection. Turning it off removes the suffix without replacing the active game or timestamp.

Steam download detection now reads ACF state flags and available byte counters asynchronously. Paused, stopping, completed, queued-only and locked states are not inferred to be downloading from a leftover `downloading` directory. Downloading, installing/staging, verification and preallocation have distinct activity text. Percentages are shown only when the relevant counters are available. Steam's manifest fields are an observed client format, not a public realtime progress API; counters can lag the Steam UI. State-bit mapping reference: [steamlocate's maintained ACF source](https://docs.rs/steamlocate/latest/src/steamlocate/app.rs.html).

One nonpersistent filesystem watcher per Steam library invalidates only changed manifests. Change notifications are coalesced for 500 ms; an 8-second safety check covers missed events, and directory reconciliation is infrequent. There is no recursive scan of downloaded files. Reads are bounded and asynchronous, cached entries are reused, and pending work is invalidated on monitor shutdown. RPC writes still obey Discord's existing cadence. A game retains priority over downloads, and privacy mode hides the download title and artwork. No download was started or modified during verification.

The native process monitor now owns the desired Discord activity. The renderer only supplies the current Eclipse download name, including an explicit notification when the download ends. Legacy renderer activity calls request a native reconciliation; they cannot replace a detected game with an old title, timestamp, privacy setting or idle status.

## Settings and activity selection

- `discordRpc` is the master switch. Turning it off removes game, download and idle presence, cancels animation/reconnect work and closes the retired connection.
- Priority while enabled: a natively detected game, then an enabled active download, then enabled idle activity, otherwise no activity.
- Persisted and runtime setting names are normalized together. Changes to privacy, Playing/Clipping, animation, Roblox details, idle and downloads apply without waiting for the settings cache to expire.
- The Discord controls use the existing serialized settings persistence helper, including rollback on a failed save. Duplicate direct writes have been removed.
- The current game session timestamp survives refreshes, settings changes, bootstrap-to-game transitions and reconnects.
- Cached external downloads expire during long game sessions. Stopping a launcher cannot leave its cached download displayed indefinitely.

## Connection lifecycle

`electron/discordConnection.ts` holds one desired activity and at most one write in flight. Intermediate updates are coalesced and ordinary activity writes are spaced by at least four seconds. An unchanged active status is acknowledged again once per minute, allowing recovery after Discord silently drops it. New activity changes take precedence over that scheduled refresh. Optional text animation uses the same queue. A clear bypasses spacing and follows any pending write.

Disconnects, errors and connection closure trigger recovery. Failed connections retry after 5, 10, 20 and then at most 30 seconds; successful readiness resets the backoff. Login and activity requests have 12- and 8-second deadlines. Generation checks ignore callbacks from retired clients. Turning presence off cancels retries, including when Discord is not running. Re-enabling does not inherit an earlier failure delay.

`electron/discordIpcClient.ts` replaces the old library's runtime transport with a local, bounded IPC client. The old decoder shared a JSON accumulator between connections and assumed whole headers and single JSON messages per socket read. The replacement handles partial headers, split UTF-8, multiple frames per read, per-connection state, nonce acknowledgements and PING/PONG. Frames larger than 1 MiB are rejected. Pending requests and connecting sockets are cancelled when retired. No account token, OAuth, Discord client modification or game injection is involved.

Public game presence is associated with the actual, verified Windows game PID. Bootstrap-to-shipping changes update that association without restarting the session timer. Switching PID, returning to idle or disabling presence clears the previous association. Privacy mode retains the launcher PID. A validation error for optional artwork/buttons retries without those optional fields; a broken image cannot continually hide the whole activity. Network failures use the normal reconnect path.

## Game data and privacy

Roblox experience changes and a return to the base Roblox game update the same native activity. Re-enabling detailed detection waits for current experience data rather than restoring a stale experience. Removing the Discord tracker subscriber preserves subscribers used by other features. Late callbacks cannot restore a stopped Roblox session.

Privacy mode removes game/experience names, custom state, image captions and game-specific images, including animated updates. Artwork search selects an exact normalized Steam title instead of the first search result. Trademark suffixes do not break known artwork mappings. Lookups are shared while pending, bounded to 256 cached entries and protected against late results overwriting a newer activity or style.

Saved installed games with a local executable are registered at startup and when their identity changes. This includes user-added EXE games launched outside Eclipse; registration does not execute any files. Updates are debounced, bounded to 2,048 entries and ignore cover/playtime-only changes. Steam manifest IDs are passed directly to artwork selection. Games without a specific artwork profile still publish their name with Eclipse branding. Starting a registered game cannot replace its friendly title with its executable basename. This complements the existing Steam/Epic/Riot discovery and built-in game identities; it does not classify arbitrary unknown Windows applications as games.

## Verification

- Final check: `npm run check` passed: TypeScript, **406/406 tests**, production app build. Log: `.cache/discord-final-check.log`.
- Deterministic tests cover rapid off/on, pending login/write cancellation, failed clear, login/write deadlines, reconnect, unchanged status suppression, activity priority, live settings, privacy, late artwork and Roblox subscriber isolation.
- `tests/discord-ipc.test.cjs` exercises the native binary IPC transport against an isolated local named-pipe/socket server: reconnect, clear, cancellation, split headers/UTF-8, coalesced PING/ACK, PID handoff, rejected artwork and oversized frames. These tests never contact the user's actual Discord client.
- Registry and process-monitor tests cover saved custom games, friendly names, known Steam IDs and authoritative PIDs. Deterministic connection tests verify once-per-minute restoration, prioritization and removal of timers after disabling.
- The explicit opt-in `tests/discord-live-validation.cjs` briefly published the actually running Fortnite process, then cleared its test activity. Discord acknowledged `Fortnite with Eclipse`, status display type `0`, `Playing Fortnite` and the image. Evidence: `.cache/discord-live-validation.json`. This verifies protocol acceptance; final member-list rendering was not visually observed.

## Animated logo and game display names

Eclipse now supplies an explicit activity name: `Eclipse` in the launcher/downloads/private mode, and `<game or Roblox experience> with Eclipse` while playing. The compact member-list status explicitly uses the activity name. Long titles preserve the suffix within 128 Unicode code points. Switching games updates the same Discord application; separate per-game application IDs are no longer needed.

`electron/discordActivity.ts` maps the used fields, including `name` and `status_display_type`, to the documented `SET_ACTIVITY` payload. `discordClient.ts` submits it through the native local IPC transport. Reconnect, coalescing, clear and cancellation continue through the connection controller.

The public GIF at `https://raw.githubusercontent.com/PE4CE1/EclipseLauncher/main/public/eclipse-logo.gif` replaces static Eclipse branding. It is the large image in the launcher and the small Eclipse badge alongside game artwork. The existing local GIF contains 121 frames; its public endpoint returns HTTP 200 and `image/gif`. Roblox experiences retain their individual main image and now use the Eclipse badge too. Logo animation does not depend on the optional animated text setting or introduce another timer/RPC update loop.

A previous live test also acknowledged the animated Eclipse logo. Automated IPC tests verify serialized game names and the GIF URL. Final visual animation on the user's profile has not been observed.

Protocol references: [Discord RPC SET_ACTIVITY](https://docs.discord.com/developers/topics/rpc#setactivity), [custom activity names and external animated assets](https://docs.discord.com/developers/discord-social-sdk/development-guides/setting-rich-presence), [activity status display types](https://docs.discord.com/developers/events/gateway-events#activity-object-status-display-types).

A full Eclipse restart is needed to load the changed main process and preload. Native game detection still polls every three seconds and retains its existing brief process-exit grace period; normal RPC updates are deliberately coalesced, so the displayed status need not change in the same frame as a click or process exit.

Discord desktop must be running and the user's activity-sharing settings must allow display. The application cannot guarantee which activity Discord surfaces when the user hides activity or another integration takes priority.

## Game icons and links

All public/private game, idle and download payloads include `Download Eclipse` and `GitHub` buttons. The repository link is `https://github.com/PE4CE1/EclipseLauncher`.

Game and download artwork uses square application icons instead of wide headers, hero images or guessed `logo.png` paths. Common Steam games have verified community icon hashes for immediate display. Other Steam IDs resolve through the public `IStoreBrowseService/GetItems` assets (`community_icon`); unknown titles require an exact normalized store-search match before that lookup. Only the requested app ID and a hexadecimal icon hash can produce a Steam image URL. Requests share in-flight work, have a four-second deadline and a 2 MiB response limit, and use a bounded 256-entry cache (six hours on success, 30 seconds on failure). Failed lookups leave Eclipse branding. No lookup runs in privacy mode; revision checks prevent late replies from restoring an old game.

VALORANT uses Riot's [128px website icon](https://cmsassets.rgpub.io/sanity/images/dsfx7636/news/cbf4460132cdfeb2a97fad5f9dd25ba0bc058f76-128x128.png). Fortnite uses Epic's square app icon from its [official App Store listing](https://apps.apple.com/app/id6483539426). League of Legends uses the L application mark still served by its [Steam community page](https://steamcommunity.com/app/20590); this does not assign a Steam identity to the detected game. FiveM and Minecraft use their own official website icons. Roblox experience images retain priority. Remote artwork is fetched by Discord; Eclipse only resolves metadata and does not poll image files.

Validation: mocked IPC/presence tests cover both buttons across activity types, specific VALORANT/Dead by Daylight icons, explicit Steam ID resolution, custom experience images, privacy and stale replies. Resolver tests cover coalescing, caching, mismatched IDs, invalid hashes, failed/malformed/oversized responses and timeouts. Static image endpoints were checked for HTTP 200/image content; the resulting appearance on a live Discord profile has not been visually verified.

# Settings workspace redesign

6 November 2026.

The settings now share a navigation, type hierarchy and surface style. Navigation is grouped into Launcher, Experience, Account and Extensions, with a restrained orange marker for the current page. Each page has a short localized description. Clip settings are also reachable directly through this navigation.

Setting groups use matching transparent surfaces, quieter borders and consistent spacing. Forms, option rows and switches align across General, Downloads, Notifications, Integrations, System, Profile, Storage, Gameplay Overlay, Clips, Plugins and Add-ons. Embedded Storage no longer introduces another scroll container; duplicate headings are suppressed while actions and feedback remain available. The existing profile-menu styles are preserved.

The common checkbox component now uses a keyboard-accessible native checkbox with switch semantics, visible focus and a description association. Specialized switches use the same dimensions and stable thumb endpoints. Existing callbacks and automatic persistence remain in use. The sidebar becomes a horizontally scrollable navigation on small windows. Existing scene transitions and reduced-motion behavior are retained; the redesign adds no live background or per-card blur loops.

## Verification

- `npm run check`: TypeScript, **427/427 tests passed**, production build succeeded. Result log: `.cache/settings-design-check.log`.
- `npx vite build --config tests/settings-fixture.vite.mts`
- `$env:ECLIPSE_SETTINGS_UI='1'; node tests/run-electron-smoke.cjs`

The isolated Electron fixture uses the real components with synthetic settings and native API stubs. It blocks remote requests and does not edit the user's settings or launch installers. It checks all eleven tabs, active navigation, page overflow, keyboard switch interaction, autosave, failed-save rollback and English/German layouts. Every tab is checked at 1360, 800 and 620 px; General is also checked at 1000 px. Evidence and screenshots: `.cache/settings-ui/verification.json` and `.cache/settings-ui/*.png`.

Screenshots were visually inspected for General, Profile, Downloads, Gameplay Overlay, System, Plugins, Notifications, Storage and the narrow German layout. The full-suite run initially had an unrelated FFmpeg fixture process exit; that test passed on its isolated rerun, followed by the successful complete run.

## Implementation

- `src/components/settings/SettingsView.tsx`: shared navigation, page metadata, native switches and embedded Clips.
- `src/components/settings/settings-surfaces.css`: scoped surface, row, form, navigation and responsive styles.
- `src/components/settings/PluginsSettingsTab.tsx`, `AddonsSettingsTab.tsx`: embedded heading hooks that preserve action messages.
- `src/components/storage/StorageManagerView.tsx`: explicit root class for the embedded layout.
- `tests/settings-fixture.*`, `tests/settings-ui-smoke.cjs`: real-component visual and interaction verification.

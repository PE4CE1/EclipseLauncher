# Firebase usage optimizations

The launcher renderer owns the live profile, friend-presence and friend-request subscriptions in both Launcher and Clips mode. It also owns the shared chat inbox used for notifications. The detached Friends window receives social state and inbox previews over local Electron IPC. Firebase authentication, the active conversation and cooldown subscriptions remain in the Friends renderer; actions still use the authenticated user's existing transactions and security rules. The inbox remains active while Friends is closed so new messages can notify, with no polling or second inbox subscription when Friends opens.

The IPC relay accepts publications only from the main window and refresh requests only from its Friends window. It forwards an explicit settings allowlist, never API keys or account recovery credentials. A Friends renderer applies a snapshot only when its Firebase UID matches the snapshot UID. Reloading the owner invalidates the relay cache and releases pending refresh requests. No database snapshots are stored by the relay on disk.

Profile synchronization reuses the existing own-profile snapshot, writes only changed fields, coalesces overlapping calls and preserves edits arriving during a write. The profile update does not publish a new heartbeat. Legacy private fields are deleted when present. Deferred Steam enrichment uses the same synchronization path and respects current privacy settings. Local recovery identity backups are refreshed only when the identity changes.

Opening Friends reuses an initialized live list. Manual refresh still requests current data from Firestore, through the owner renderer, and retains healthy subscriptions instead of replacing them. Listeners that have failed may be restarted by refresh. Initial cache and server metadata events are distinguished so cached snapshots do not falsely mark initialization complete.

The 60-second heartbeat, 150-second offline expiry, immediate game/status transitions, chat delivery and five-second chat cooldown are unchanged. Chat history remains bounded and loads on demand. No backend deployment, rule relaxation or new Firebase service is required.

## Validation

- `node --test tests/firebase-usage.test.cjs tests/social-state-relay.test.cjs tests/friends-refresh.test.cjs tests/profile-security.test.cjs tests/frontend.test.cjs`
- `npm run build:app`
- Set `ECLIPSE_SOCIAL_STATE=1`, then run `node tests/run-electron-smoke.cjs` for real Electron IPC/preload tests with isolated profiles and network disabled.
- Set `ECLIPSE_FRIENDS_UI=1` and `ECLIPSE_FRIEND_CHAT_UI=1`, then run `node tests/run-electron-smoke.cjs` for the existing Friends/chat UI tests with fixtures.
- Run the existing chat, friend-request and account security emulator suites against `demo-eclipse-security`, never production.

The instrumented service tests verify that 100 unchanged profile syncs create no additional reads or writes after initialization, and that repeated automatic Friends opens reuse live state. These are isolated regression measurements, not production billing measurements. Actual savings depend on open windows, profile edits and user activity; compare equivalent user-hours before and after rollout.

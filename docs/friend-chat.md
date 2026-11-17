# Friends chat

The Friends window has a Messages tab and a conversation button beside each Eclipse friend's menu. Steam-only contacts cannot use Eclipse chat until they have an Eclipse friendship.

Messages use the existing Firebase identity and Firestore realtime connection. Both profiles must list each other as friends to send. Only the two conversation members can read their history. Removing a friend blocks further sends; previously shared history remains private to its original participants.

Each send atomically writes the message, conversation preview and sender cooldown. Security rules enforce one message per sender every five seconds across recipients and client windows. Messages are immutable, contain plain text only and are limited to 2,000 characters. This is not end-to-end encryption.

The launcher keeps one shared subscription to the latest 100 conversation previews, including while Friends is closed. It drives incoming-message notifications and forwards previews to the detached Friends window over local IPC. Opening Friends does not create another inbox query. The Friends UI subscribes to its own cooldown and only the visible conversation subscribes to messages (50 live messages, older pages loaded on demand, at most 500 displayed). Closing Friends releases those UI listeners. Read timestamps stay in local storage per account; message bodies are not added to launcher settings, persistent notification history or public profiles.

New incoming messages show a compact in-app popup while Eclipse is focused, or a Windows notification in the background. Reply opens the conversation. A single app sound follows the selected sound preset; Windows notifications are silent to prevent double sounds, and short bursts share one chime. The initial inbox, duplicate/reconnected snapshots, own messages, already-read messages and the focused conversation do not trigger alerts.

Friends can be muted from their three-dot menu, the conversation header or the message popup. Mutes suppress both notification channels and sound, without affecting delivery or unread indicators. They are stored locally per Eclipse account and synchronized across client windows, with no extra Firestore writes. Separate popup and sound toggles are available in Notifications settings and Clips-mode General settings; global notification preferences still apply. Unmuting does not replay older alerts.

Security tests run against isolated demo-project emulators:

```powershell
node .cache/firebase-security/node_modules/firebase-tools/lib/bin/firebase.js emulators:exec --only 'firestore,auth' --project demo-eclipse-security 'node --test --test-concurrency=1 tests/friend-chat.emulator.cjs tests/friend-requests.emulator.cjs tests/firebase-security.emulator.cjs'
```

`node scripts/deploy-friend-chat.cjs` checks that live rules match the expected prior version. Adding `--apply` creates the required inbox index, deploys the additive rules and verifies both. The script preserves a rules backup in `.cache/friend-chat/rules-before.json` and never sends test messages to real accounts.

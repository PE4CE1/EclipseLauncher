# Account security migration for Eclipse 2.0

**Production status (2026-11-03): completed and verified for `eclipse-launcher-d4cd3`.** The reviewed rules are deployed, Email/Password recovery is enabled, 9 profiles are sanitized, and 5 obsolete device records are removed. Encrypted backups were verified before changes. Live SDK checks confirmed same-UID recovery, blocked unauthenticated reads/foreign writes/private-field writes, and working friend connections. Temporary accounts and test profiles were removed. See [REVIEW_FIXES_2.md](REVIEW_FIXES_2.md).

The old client stored recovery keys in public `users` and `device_identities` documents. A client-side filter cannot protect those fields: Firestore grants access to whole documents. Treat every old key as compromised. The new client never authenticates using an old key or a hardware ID.

## Implemented locally

- A new 160-bit recovery key links an Email/Password credential to the existing Firebase Auth user. Account recovery signs in as that same UID. The credential is derived locally; keys and passwords never enter Firestore.
- A profile write requires the Firebase Auth UID to equal the canonical UID. Local identity files cannot grant cloud account ownership.
- Public profile payloads use an explicit field allowlist. Both immediate and deferred Steam updates respect the current privacy settings.
- `firestore.rules` restricts writes to their authenticated owner, blocks private fields, hides unsanitized legacy documents, and denies access to hardware identity records. Existing instant friend connections may change only the caller's own membership.
- Local recovery setup is serialized and reports failures. A failed restore compensates local writes and restores the previous Auth session.

## Required production rollout

These steps are **not applied by building the app**. The target project is `eclipse-launcher-d4cd3`. Use a verified project administrator; never commit service-account JSON or paste it into a chat.

1. Enable **Authentication → Sign-in method → Email/Password**. Keep Anonymous enabled for first-time setup. Synthetic recovery addresses do not send email.
2. Save an administrator-only Firestore backup. Deploy the reviewed `firestore.rules` first. This immediately prevents legacy profile/anchor reads and unsafe writes. Old clients will lose cloud sync until updated; their local libraries remain.
3. Authenticate the official Firebase CLI with an administrator account. The CLI-backed migration avoids creating an additional service-account key. Install test/admin tools separately if necessary:

   ```powershell
   npm install --prefix .cache/firebase-security firebase-tools@15.34.2 firebase-admin@14.5.0 @firebase/rules-unit-testing@6.0.0 --no-audit --no-fund
   .\.cache\firebase-security\node_modules\.bin\firebase.cmd login
   .\.cache\firebase-security\node_modules\.bin\firebase.cmd deploy --only firestore:rules --project eclipse-launcher-d4cd3
   node scripts/migrate-profile-security.cjs --project eclipse-launcher-d4cd3 --firebase-cli
   ```

4. Review the dry-run counts, then run the same migration with `--apply`. It removes nonpublic fields, clears hidden stats, marks sanitized profiles as schema 2, and deletes obsolete hardware identity records. Before writing, it creates and decrypts a local AES-GCM backup protected with Windows DPAPI. Commits are atomic in bounded batches, with update-time preconditions: concurrent changes skip a batch and require a rerun. Output contains counts and the encrypted backup path only, never keys. Re-run the dry run and inspect rules/tests before releasing the new client. For a separately configured Admin SDK/ADC environment the original migration mode without `--firebase-cli` remains available.
5. Start the updated client while its original Auth session still exists. It rotates old keys and links secure recovery automatically. Verify **Settings → Profile → Account Protection → Recovery ready**, save the new key privately, and test recovery in a separate test account/device before release.

If a stored canonical UID differs from the available Auth UID, do not automatically transfer ownership. Keep local data and use a new, already configured recovery key or a separately verified administrator-assisted migration. Possession of an old public key, a friend code, or a hardware hash is insufficient proof.

The client now resumes the original UID when a valid locally stored recovery credential authenticates as that UID. A different returned UID is rejected and the prior session restored. Legacy profiles with only an old key still require a verified project administrator. On 2026-11-04 the affected local account was migrated with the already authenticated project administrator: its existing Auth owner was retained, the new key was backed up and stored locally before credential binding, and a real sign-in confirmed the original UID. No client-accessible admin endpoint or friend-code login was added.

Recovery failures are stored with stable `recovery/*` codes; the account card translates them using the current language, including old stored German messages. After an administrator-assisted repair, restart the updated client fully so it can resume the repaired session and mark the key ready.

If profiles have already been exposed, remove credentials from accessible exports/backups too, restrict backup access, and assess any account changes. This migration cannot undo reads that already occurred.

## Local verification

No production access is needed for these checks:

```powershell
node --test tests/profile-security.test.cjs tests/settings-persistence.test.cjs tests/clip-queue.test.cjs
.\.cache\firebase-security\node_modules\.bin\firebase.cmd emulators:exec --project demo-eclipse-security --only auth,firestore --config firebase.json "node --test tests/firebase-security.emulator.cjs"
```

The emulator test explicitly requires both emulator endpoints and uses only `demo-eclipse-security`. It verifies blocked reads/writes, owner migration, friend compatibility, same-UID credential linking, rejected old/wrong keys, and Auth rollback.

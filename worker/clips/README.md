# Clip link service — local preparation

This service is separate from the legacy social Worker. **Nothing has been deployed.** Its D1 ID is a deliberately empty placeholder. Do not use the social database for clip storage.

The launcher exports the actual current edit as a fast-start H.264/AAC MP4, reserves an upload, streams the file, and returns a browser player link. The service verifies Firebase RS256 signatures and project/audience/issuer/expiry. Owner identity comes exclusively from the verified token. Each link has a random 256-bit capability; only its hash is stored in D1. Anyone with the link can watch without an Eclipse account. Links are unlisted, can be revoked, and expire after 1, 7 or 30 days.

Defaults: 100,000,000 bytes per clip, 500,000,000 active bytes per owner, 10 upload reservations per owner per day, and 5,000,000,000 bytes globally. Atomic conditional D1 inserts enforce concurrent reservations. These are application caps, not a guarantee about Cloudflare billing. Streaming uses a fixed-length stream and checks the stored size. Partial/failed uploads are removed. Expired and abandoned reservations are cleaned hourly.

The browser page has video controls and seeking through HTTP byte ranges, download, escaped titles, strict CSP, no third-party scripts, no referrers and no indexing. Discord's handling of link embeds depends on Discord; the browser player is the supported playback surface.

## Local development only

From `worker`, install dependencies with `npm ci`. Then:

```powershell
npx wrangler d1 migrations apply eclipse-clips --local --config clips/wrangler.jsonc --persist-to ../.cache/clip-sharing-state
npx wrangler dev --config clips/wrangler.jsonc --persist-to ../.cache/clip-sharing-state
```

The installed local runtime currently supports compatibility dates through `2026-10-30`. If needed, add `--compatibility-date 2026-10-30` to the local `dev` command. The deployment config retains `2026-11-01`.

Before starting the development launcher in the same PowerShell session:

```powershell
$env:ECLIPSE_CLIP_SHARE_URL = 'http://127.0.0.1:8787'
npm run dev
```

Loopback HTTP is accepted only in an unpackaged development app. Production endpoints must use HTTPS. There is no default remote endpoint and no automatic upload. Tokens never go into URLs or saved launcher settings. The editor obtains a fresh Firebase token only when creating or deleting a link.

For later hosting: provision a separate R2 bucket and D1 database, replace the placeholder database ID, apply migrations, review quotas/access and configure the production endpoint. No account or resource creation has been performed. Localhost links are test links and cannot be shared with other computers.

## Verification

From the repository root, `node --test tests/clip-sharing-worker.test.cjs tests/clip-sharing-client.test.cjs` exercises the real local Workers/D1/R2 runtime with test RSA keys and a mocked public JWKS response, and the native HTTP upload client with an isolated local server. It tests signature/expiry/audience failures, ownership, invisible unfinished uploads, exact byte ranges and HEAD, expiry, revocation, simultaneous quotas, export-state propagation, streaming upload, failed-upload cleanup and preservation of original files. The Windows filesystem sandbox may require running the local R2 test outside the sandbox.

`worker/clips/worker-configuration.d.ts` is generated with `wrangler types --config clips/wrangler.jsonc`. Typecheck with `npx tsc --noEmit -p clips/tsconfig.json` from `worker`. A dry-run bundle has been checked; it does not publish anything.

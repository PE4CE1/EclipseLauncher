# Eclipse 2.0.3 — update and GitHub release

The Windows release is built as version **2.0.3**, with the existing app ID `com.eclipse.launcher`, per-user NSIS installation and GitHub provider `PE4CE1/EclipseLauncher`. The existing updater cache name is preserved for installed clients.

## Fixes checked before packaging

- All packaged update downloads now use `electron-updater`, including requests from the startup screen that carry a direct asset URL. This keeps the release metadata and SHA-512 verification in the normal download path.
- Removed the separate temporary EXE download path and its outdated unversioned installer filename.
- A download rechecks whether a newer version is available. It does not replace the active update card with a checking screen or repeat the availability notification during that check.
- Incomplete or failed downloads cannot unlock installation. Duplicate download requests and repeated installation clicks are rejected.
- The NSIS handoff requests restarting Eclipse after installation. Development mode cannot pretend to perform an installation.

## Build and verification

From the workspace root:

```powershell
npm run check
node scripts/build-github-release.cjs
$env:ECLIPSE_UPDATER_TRANSFER='1'
node tests/run-electron-smoke.cjs --disable-gpu
```

`build-github-release.cjs` uses the configuration from `package.json`, writes to `release/github-<version>` and verifies the generated files. It does not publish them. The verifier checks installer size, SHA-512, version, PE header, compressed blockmap, internal `app-update.yml`, packaged entry points and required native files.

The native updater test uses the actual `NsisUpdater` and Electron HTTP client. It checks the live GitHub feed, then downloads the newly built installer from an isolated local feed to simulate updating from 2.0.0. It also tests a same-version client and an incorrect SHA-512. Only the final installer spawn is intercepted: the real NSIS arguments are checked, and the installer is not executed on this PC. Test profiles and download caches are isolated and removed by the runner.

The generated `release-verification.json` and `update-test-report.json` record the results. A complete public GitHub update to 2.0.3 can only be checked once that release is published.

## Upload these three assets together

Create a regular public release tagged **`v2.0.3`** in `PE4CE1/EclipseLauncher` and attach the files from `release/github-2.0.3`:

1. `Eclipse.Launcher.Setup.2.0.3.exe`
2. `Eclipse.Launcher.Setup.2.0.3.exe.blockmap`
3. `latest.yml`

Keep their names and contents unchanged. Mark the release as latest and do not mark it as a prerelease. Upload all three before publishing. Do not upload `win-unpacked`, the intermediate `.7z`, builder diagnostics or verification reports as update assets.

The build has no configured code-signing certificate. SHA-512 verification checks the downloaded file against the release metadata; it does not provide Authenticode publisher signing.

Reference: [electron-builder v26 auto-update documentation](https://www.electron.build/v26/docs/features/auto-update/).

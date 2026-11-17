<img width="1919" height="1079" alt="Screenshot 2026-08-15 195927" src="https://github.com/user-attachments/assets/22fbea14-a9a9-468c-b147-5eb58d201dc9" />
 🌑 Eclipse Launcher

Current release: **v2.0.3** · [Changelog](docs/CHANGELOG_2.0.3.md)

Native Windows clipping, a dedicated Clips mode, real-time friend chat,
customizable overlays and Quick Actions are included in this release.

## Development and verification

Use Node.js 24 (minimum 22.12) and npm 11.19 or newer. The lockfile and pinned
`allowScripts` entries install the Electron runtime, FFmpeg and WebRTC native
binary without approving unrelated dependency scripts.

```powershell
npm ci
npm run dev
```

Run the complete local verification before creating a release:

```powershell
npm run check
npm run test:electron
npm ci --prefix worker --ignore-scripts
npm --prefix worker run typecheck
```

`test:electron` uses temporary data, mocks privileged operations, and blocks
external account/network traffic. It checks five renderer windows, navigation,
the isolated controller iframe and native module loading. Some restricted
Windows automation environments require `npm run test:electron -- --no-sandbox`;
that option applies only to the isolated test process. The launcher enables its
renderer sandbox normally.

```powershell
npm run build:dir       # Unpacked Windows build
npm run electron:build  # NSIS installer; publishing is disabled
```

For a verified GitHub release, run `npm run build:app` followed by
`node scripts/build-github-release.cjs`. Upload the installer, its `.blockmap`
and `latest.yml` from `release/github-2.0.3` as release assets. See the
[release guide](docs/UPDATER_RELEASE_2.md) for details.

Build outputs, local recordings, test results and private environment files are
ignored by Git. Required native runtime helpers and their available sources are
versioned so a Windows checkout can build and run the launcher.

See [the rework report](docs/REWORK_REPORT.md) for fixes, verification and remaining
limitations, and [the performance report](docs/PERFORMANCE_REPORT.md) for startup
measurements and background service changes. The corrected Firebase account/recovery design and completed
[Eclipse 2.0 backend security rollout](docs/ACCOUNT_SECURITY_2.md) are documented separately; building the app does not deploy rules or sanitize server data in other environments. The unused
Cloudflare Worker is documented separately in [worker/README.md](worker/README.md).

The [Eclipse 2.0 loading screen](docs/LOADING_SCREEN_2.0.md) includes a
standalone live preview, one continuous CSS atmosphere, a bundled Oxanium wordmark
and visibility-aware animation. Startup prepares library artwork without decoding
the entire collection into full-size bitmaps.

> A clean, fast, and unified launcher for all your PC games — built by gamers, for gamers.

---

##  Why Eclipse Launcher?

If you play games on PC, you know the drill: opening five different launchers just to see what games you own, dealing with bloated interfaces, slow boot times, and store pages shoved in your face before you can even hit "Play".

**Eclipse Launcher** was created to fix that. 

It brings your entire game collection — from Steam, Epic, to standalone `.exe` files — into one lightweight, ultra-smooth interface. No clutter, no unnecessary background processes eating your RAM, just your library ready to launch.

---

##  Features at a Glance

###  Automated Game Detection
- **Multi-Platform Scanner**: Automatically detects installed games from Steam and Epic Games, plus any custom `.exe` added manually.
- **Smart Metadata Matching**: Dynamically fetches official logos, high-res hero banners, background screenshots, and video trailers directly from SteamDB & Steam Store APIs.

###  Custom Discord Rich Presence
- Shows your friends what you're actually playing in real time.
- Integrated **Idle State**: Automatically updates to *"Browsing Library"* when you're hanging out in the launcher menu.
- **Direct Download Button**: Friends viewing your status on Discord can click a direct link to download Eclipse Launcher for themselves.

###  Playtime & Session Tracking
- Accurately measures played time per game and updates your personal total play duration.
- Automatically handles background tracking — starts when a game opens and pauses the moment it closes.

###  Built-in Download Manager
- Integrated HTTP and WebTorrent download handlers for direct game files and updates without needing extra tools.

###  Clean, Fast UI
- Dark glassmorphism aesthetic built with smooth micro-animations.
- Fast startup and low memory footprint compared to traditional launchers.
- Convenient navigation history with full support for mouse side-buttons (Back/Forward).

<img width="1919" height="1079" alt="Screenshot 2026-08-15 200015" src="https://github.com/user-attachments/assets/35da278a-7b2f-47a0-b197-608b8f4b6efa" />

## 👤 About the Developer

Hey! I’m **PE4CE1**, a solo developer who got tired of fragmented game libraries and heavy desktop clients. 

Eclipse Launcher started as a personal passion project to build the ultimate, minimal PC launcher. Every feature in this app — from the smooth UI transitions to the custom Discord RPC — is built from scratch with focus on what actually improves the daily gaming experience.

Because this is a solo project, your feedback matters a lot. If you find bugs, have feature ideas, or want to contribute, feel free to open an issue or jump into discussions!

---

## 🛠️ Tech Stack

- **Desktop Core**: [Electron](https://www.electronjs.org/)
- **Frontend**: [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Styling & Motion**: [TailwindCSS](https://tailwindcss.com/) + [Framer Motion](https://www.framer.com/motion/)
- **Build System**: [Vite](https://vitejs.dev/) & [Electron Builder](https://www.electron.build/)

---

## 📦 Download & Installation

1. Go to the [Releases Page](https://github.com/PE4CE1/EclipseLauncher/releases).
2. Download the latest installer.
3. Run the installer and you're good to go!

---

##  Roadmap & Future Plans

- Weekly updates
- [ ] Custom community theme support
- [ ] Direct cloud save backup integration
- [✓] Game tagging and custom category filters
- [ ] Achievement sync support for additional platforms

---

## 🤝 Feedback & Support

Found a bug or have an idea? 
- Open an [Issue](https://github.com/PE4CE1/EclipseLauncher/issues) on GitHub.
- Contributions and PRs are always welcome!

---

<p center>Crafted with ❤️ by PE4CE1</p>
<img width="1919" height="1079" alt="Screenshot 2026-08-15 195905" src="https://github.com/user-attachments/assets/f1732f08-12fb-4075-9014-3237be50313f" />

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Tag, Calendar, RefreshCw, 
  CheckCircle2, Sparkles, ChevronDown, 
  ChevronUp, ArrowUpRight, Github, GitCommit
} from 'lucide-react'
import { useTranslation } from '../../hooks/useTranslation'
import { useUIStore } from '../../store/uiStore'
import { APP_VERSION } from '../../services/updateService'

interface GitHubRelease {
  id: number
  tag_name: string
  name: string
  body: string
  published_at: string
  html_url: string
  prerelease: boolean
}

// Fallback high-fidelity changelogs if offline or GitHub API rate-limited
const FALLBACK_RELEASES = [
  {
    id: 118,
    tag_name: 'v1.1.8',
    name: 'v1.1.8 - Real-Time Friend Requests, Bilateral Removal & Minimalist Toast',
    published_at: '2026-08-19T12:00:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.1.8',
    body: `### 👥 Live Friends & Presence System
* **Real-Time Requests:** Entering a friend code now sends an interactive request with 0ms accept/decline.
* **Presence Watchdog:** 25s keep-alive heartbeat & 60s timeout watchdog prevent stuck "In-Game" status.
* **Smart "Last Seen":** Localized relative time indicators (e.g. *Last seen 15 mins ago*, *Last seen yesterday*).
* **Bilateral Removal:** Removing a friend immediately unlinks both accounts with a sleek undo toast.

### 🌐 Cloud Profile Sync & Pre-Add Preview
* **Full Profile Sync:** Synchronized playtime, Steam level, badges, and top played games across all players.
* **Instant Profile Preview:** View full player profiles directly from the Add Friend menu before sending a request.

### 🔔 Notification Center
* **Persistent History:** TopBar notification bell with quick dropdown and one-click friend shortcuts.`,
    prerelease: false
  },
  {
    id: 117,
    tag_name: 'v1.1.7',
    name: 'v1.1.7 - Mandatory Startup Updater, Web Store Sources & Crisp Transitions',
    published_at: '2026-08-18T19:00:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.1.7',
    body: `### 🚀 Mandatory Startup Update Checker
* **Live Update-Erkennung:** Automatischer Versionsabgleich beim Starten im Splash Screen.
* **Sleek Update Modal:** Minimalistisches Versions-Badge (\`Aktuell\` ➔ \`Neu\`) ohne überladenen Schnickschnack.
* **1-Click Live Download & Install:** Nahtloser Installer-Download mit Echtzeit-Fortschrittsbalken und automatischer Ausführung.

### 🌐 Web Store Download Sources
* **Zero-Default Architecture:** Standardmäßig keine vorinstallierten Quellen für maximale Sicherheit und Benutzerkontrolle.
* **1-Click Web Store Integration:** Direkte Verknüpfung mit dem Eclipse Web Store (\`https://eclipse-launcher.netlify.app/#/downloads\`).
* **Intelligente Cloudflare & Mirror Fallbacks:** Robuste Synchronisation für alle Hydra-Quellen (DODI, FitGirl, SteamRIP etc.).

### ⚡ Splash Screen & UI Polish
* **Crisp Exit Animation:** Gestochen scharfer, schneller Fade-Out des Splash Screens ohne störenden Blur-Effekt.
* **Library Performance:** Sofortiges Öffnen der Bibliothek in 0.00s und smartes Preview-Banner-Fallback.`,
    prerelease: false
  },
  {
    id: 116,
    tag_name: 'v1.1.6',
    name: 'v1.1.6 - Custom Themes Store, Deep Linking & Fullscreen Lightbox Fix',
    published_at: '2026-08-17T18:00:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.1.6',
    body: `### 🎨 Custom Themes & 1-Click Import Engine
* **Themes Store & Deep Linking:** 1-Klick-Import von Themes direkt aus dem Web oder Discord per \`eclipse://install-theme\` Protokoll.
* **13 Handcrafted Community Themes:** Liquid Glass, Radiant, Miami Vice 84, Nordic Frost, Toxic Biohazard, Solar Flare, Phantom Gold, Cyberpunk Neon, Midnight OLED, Crimson Steel, Emerald Matrix, Frosted Sakura, Nebula Purple.
* **Live GitHub Synchronisation:** Dynamisches Laden der Theme-Kataloge und lokale Fallback-Unterstützung.

### 🖼️ Fullscreen Gallery Lightbox
* **Isolierte Vollbild-Anzeige:** TopBar wird im Vollbild-Modus automatisch ausgeblendet für maximale Immersion.
* **Portal-Rendering:** Höchste Z-Index-Ebene mit Escape-Support und dediziertem Schließen-Button.

### ⚡ Performance & Fixes
* **Lagfreier Tab-Wechsel:** VPN-Netzwerkabfragen in den Einstellungen komplett asynchron und gecacht (60 FPS).
* **Safe URL Decoder:** Keine URI-Fehler mehr bei Sonderzeichen oder Prozentwerten.`,
    prerelease: false
  },
  {
    id: 115,
    tag_name: 'v1.1.5',
    name: 'v1.1.5 - Standalone Friends Window, Live Pricing & Reworked Details',
    published_at: '2026-08-15T21:20:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.1.5',
    body: `### 🪟 Echtes externes Freunde-Fenster
* **Multi-Monitor Desktop Window:** Das Freunde-Fenster ist ein vollkommen unabhängiges, rahmenloses Desktop-Fenster, das frei über mehrere Monitore verschoben werden kann.
* **Add-Friend & Profil-Klicks:** „+ Add“-Button und Klicks auf Freundeskarten funktionieren nahtlos zwischen Desktop-Fenster und Hauptfenster.

### 🏷️ Echte Live-Preise, Deals & All-Time Low
* **Live Steam Pricing & Deals:** Anzeige des aktuellen Preises direkt von Steam mit Sale-Badges (z. B. -50%), durchgestrichener UVP und Angebotspreisen.
* **Originaler SteamDB All-Time Low:** Exakter historischer Tiefstpreis des Spiels inklusive realem Bestpreis-Rabatt.
* **1-Click Währungs-Umschalter (€ / $):** Sofortiges Wechseln zwischen Euro und Dollar.

### 🎨 Frosted-Glass, Dark Mode & UI-Polish
* **Library Frosted-Glass Header:** Fixierter Bibliotheks-Header mit weichem Glas-Unschärfeeffekt beim Scrollen.
* **Tiefschwarze OLED-Suchleisten:** Sattes Tiefschwarz ohne Farbstiche im gesamten Launcher.
* **Monochrome View-Icons:** Cleane weiße Raster- und Listenansicht-Schalter.`,
    prerelease: false
  },
  {
    id: 113,
    tag_name: 'v1.1.3',
    name: 'v1.1.3 - Safe Download & VPN Security Update',
    published_at: '2026-08-15T00:00:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.1.3',
    body: `### 🛡️ VPN-Erkennung & Auto-Connect
* **Smarte VPN-Erkennung:** Eclipse Launcher erkennt automatisch installierte VPN-Clients (CyberGhost, NordVPN, ProtonVPN, Mullvad, Surfshark, ExpressVPN, WireGuard, WARP, OpenVPN u.v.m.).
* **Auto-VPN vor Download:** Beim Starten eines Downloads verbindet der Launcher automatisch das VPN bzw. wartet zuverlässig auf den aktiven Tunnel, bevor Daten fließen.
* **1-Click VPN Connect:** Schnelles Verbinden und Status-Abfrage direkt in den Download-Einstellungen.

### ⚡ Downloads & Highspeed-Quellen
* **BitTorrent & P2P-Downloader:** Volle Unterstützung für Magnet-Links und P2P-Downloads inklusive Echtzeit-Geschwindigkeit, Peer-Statistiken und ETA.
* **Multihoster & Direct-Streams:** Umfassende Unterstützung für PixelDrain, Buzzheavier, Qiwi, Gofile, ViKiNG FiLE, DataNodes und Debrid-Dienste.
* **Neues Download-Badge:** Minimalistisches, schwarzes Badge mit Live-%-Anzeige und automatischem Entpack-Status in der Sidebar.

### 🤍 Minimalistisches Design & Bugfixes
* **Monochrome Scan-Meldung:** Neuer, minimalistischer Glassmorphic-Scan-Indikator in purem Weiß.
* **Cleane Sidebar:** Aufgeräumte Spielliste ohne ablenkende Punkte für maximale Übersicht.
* **100% Lokalisierung:** Vollständige und fehlerfreie Übersetzung aller neuen Features auf Deutsch und Englisch.`,
    prerelease: false
  },
  {
    id: 112,
    tag_name: 'v1.1.2',
    name: 'v1.1.2 - Quality of Life & Rockstar Update',
    published_at: '2026-08-14T00:00:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.1.2',
    body: `### 🎮 Rockstar Games & Game-Erkennung
* **Rockstar Games Scanner:** GTA V Enhanced, GTA V, Red Dead Redemption 2, GTA IV und die Definitive Edition werden jetzt direkt automatisch erkannt und importiert.
* **Prozess-Tracking:** Egal ob GTA V Enhanced, BattlEye oder FiveM – der Launcher erkennt laufende Spiele sofort und synchronisiert deinen Status live mit Discord RPC.

### 🔔 Benachrichtigungen & Sound-Presets
* **In-Client Toasts:** Elegante Benachrichtigungen unten rechts im Launcher. Sie zeigen dir direkt an, wenn Downloads fertig sind oder Updates bereitstehen.
* **Sound-Presets:** Du kannst in den Einstellungen jetzt deinen Lieblings-Sound auswählen (z. B. das entspannte Eclipse Calm, Cosmic Shimmer, Minimal Pop oder Soft Velvet).
* **Interaktives Schließen:** Benachrichtigungen gleiten beim Schließen weich zur Seite weg und lassen sich jetzt auch einfach per Wischgeste (Swipe) schließen.

### ⚡ Performance, Animationen & Layout
* **Kein Ruckeln beim Start:** Die Startanimation läuft jetzt butterweich ohne lästiges Fenster-Resizing oder Frame-Drops.
* **120 FPS Versions-Übersicht:** Das Aufklappen früherer Versionen wurde auf Hardware-Beschleunigung umgestellt und hakt nicht mehr.
* **Neues Layout:** Die Einstellungen und Downloads sind jetzt linksbündig angeordnet, damit auf breiten Bildschirmen kein unnötig leerer Platz entsteht.
* **Echtes OLED-Schwarz:** Der tiefe, edle Schwarzwert des Launchers wurde wiederhergestellt.
* **Zweisprachig (DE/EN):** Sämtliche Texte und Einstellungen passen sich jetzt sauber deiner ausgewählten Sprache an.`,
    prerelease: false
  },
  {
    id: 111,
    tag_name: 'v1.1.1',
    name: 'v1.1.1 - The Sound, System & UI Update',
    published_at: '2026-08-13T22:00:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.1.1',
    body: `### ✨ Features & Highlights
* **In-Client Notifications:** Elegante Benachrichtigungen unten rechts im Launcher mit Countdown-Bar.
* **Einstellbare Sound-Presets:** 7 Audio-Synthesen für UI-Feedback.
* **GPU Composite Scroll Isolation:** Ruckelfreies 120 FPS+ Scrolling in den Einstellungen.`,
    prerelease: false
  },
  {
    id: 110,
    tag_name: 'v1.1.0',
    name: 'v1.1.0 - Cinematic Eclipse & Overlay Engine',
    published_at: '2026-08-10T18:00:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.1.0',
    body: `### ✨ Features
* **Cinematic Eclipse:** Spektakuläre fotorealistische astronomische Sonnenfinsternis-Animation.
* **Rocket League Live Tracker:** Automatische Stat-Integration und In-Game HUD für Steam & Epic Games.
* **Custom Crosshair Suite:** Frei positionierbares Fadenkreuz mit anpassbarem Spacing, Dot und dynamischer Deckkraft.
* **GPU Hardware Acceleration Toggle:** System-Einstellung zum Ein-/Ausschalten des Direct3D 11 Renderers.`,
    prerelease: false
  },
  {
    id: 109,
    tag_name: 'v1.0.9',
    name: 'v1.0.9 - Torrent & Extraction Core',
    published_at: '2026-08-05T14:30:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.0.9',
    body: `### ⚡ Verbesserungen
* **High-Speed Torrent Downloader:** Integrierter P2P-Client mit Multi-Peer-Support und Live-Telemetrie.
* **Automatisches Entpacken:** Automatische Dekomprimierung von ZIP-, RAR- und 7z-Dateien nach Download-Abschluss.
* **Download Sources Manager:** Unterstützung für externe Repack- und Release-Quellen.`,
    prerelease: false
  },
  {
    id: 100,
    tag_name: 'v1.0.0',
    name: 'v1.0.0 - Genesis Release',
    published_at: '2026-07-20T12:00:00Z',
    html_url: 'https://github.com/PE4CE1/EclipseLauncher/releases/tag/v1.0.0',
    body: `### 🚀 Initial Release
* **Unified Game Library:** Automatischer Scan von Steam, Epic Games und Custom-Ordnern.
* **Discord Rich Presence:** Live-Status mit Spielzeit und Artwork.
* **Modern Dark Glass UI:** Hochmoderne Electron + React Architektur.`,
    prerelease: false
  }
]

/**
 * Cleanly renders markdown text, stripping raw HTML tags like <img> and formatting headings/bullets
 */
function renderChangelog(body: string) {
  if (!body) return null

  // Remove raw HTML tags (like <img> from github uploads)
  const cleaned = body
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  const lines = cleaned.split('\n')
  const elements: JSX.Element[] = []

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim()
    if (!line) {
      elements.push(<div key={idx} className="h-2" />)
      return
    }

    // Markdown Headers (### Header or ## Header)
    if (line.startsWith('###') || line.startsWith('##') || line.startsWith('#')) {
      const text = line.replace(/^#+\s*/, '').replace(/\*+/g, '').trim()
      elements.push(
        <h4 key={idx} className="text-xs font-bold text-white uppercase tracking-wider mt-4 mb-2 first:mt-0">
          {text}
        </h4>
      )
      return
    }

    // Bold section titles like **🌟 What's New** or ***🚀 Eclipse Launcher***
    if ((line.startsWith('**') && line.endsWith('**')) || (line.startsWith('***') && line.endsWith('***'))) {
      const text = line.replace(/\*+/g, '').trim()
      elements.push(
        <h4 key={idx} className="text-xs font-bold text-white uppercase tracking-wider mt-4 mb-2 first:mt-0">
          {text}
        </h4>
      )
      return
    }

    // Bullet points (starts with * or -)
    if (line.startsWith('*') || line.startsWith('-')) {
      const text = line.replace(/^[\*\-]\s*/, '').trim()
      // Detect bold prefix: e.g. **Feature:** details
      const boldMatch = text.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/)
      if (boldMatch) {
        elements.push(
          <div key={idx} className="flex items-start gap-2.5 text-xs text-white/70 leading-relaxed py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1.5 flex-shrink-0" />
            <div>
              <span className="text-white font-semibold">{boldMatch[1]}: </span>
              <span>{boldMatch[2].replace(/\*+/g, '')}</span>
            </div>
          </div>
        )
      } else {
        // Plain bullet
        elements.push(
          <div key={idx} className="flex items-start gap-2.5 text-xs text-white/70 leading-relaxed py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 mt-1.5 flex-shrink-0" />
            <span>{text.replace(/\*+/g, '')}</span>
          </div>
        )
      }
      return
    }

    // Regular paragraph text
    elements.push(
      <p key={idx} className="text-xs text-white/70 leading-relaxed">
        {line.replace(/\*+/g, '')}
      </p>
    )
  })

  return <div className="space-y-1">{elements}</div>
}

export function EclipseInfoView() {
  const { language } = useTranslation()
  const { showNotification } = useUIStore()

  const currentVersion = `v${APP_VERSION}`
  const [releases, setReleases] = useState<GitHubRelease[]>(FALLBACK_RELEASES)
  const [isLoading, setIsLoading] = useState(false)
  const [expandedReleases, setExpandedReleases] = useState<Record<string, boolean>>({
    [currentVersion]: true,
  })

  // Fetch live releases from GitHub
  useEffect(() => {
    async function fetchReleases() {
      setIsLoading(true)
      try {
        const res = await fetch('https://api.github.com/repos/PE4CE1/EclipseLauncher/releases?per_page=15')
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            setReleases(data)
          }
        }
      } catch (err) {
        // Smoothly fall back
      } finally {
        setIsLoading(false)
      }
    }
    fetchReleases()
  }, [])

  function toggleExpand(tagName: string) {
    setExpandedReleases(prev => ({
      ...prev,
      [tagName]: !prev[tagName]
    }))
  }

  function handleCheckUpdates() {
    if (window.electronAPI?.checkUpdate) {
      window.electronAPI.checkUpdate()
      showNotification(
        language === 'de' ? 'Suche nach Updates...' : 'Checking for updates...',
        'info'
      )
    } else {
      showNotification(
        language === 'de' ? 'Du verwendest die aktuellste Version (v1.1.4).' : 'You are running the latest version (v1.1.4).',
        'success'
      )
    }
  }

  function openExternal(url: string) {
    if (window.electronAPI?.openUrl) {
      window.electronAPI.openUrl(url)
    } else {
      window.open(url, '_blank')
    }
  }

  function formatDate(dateStr: string) {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  const latestRelease = releases[0] || FALLBACK_RELEASES[0]
  const olderReleases = releases.slice(1)

  return (
    <div className="h-full overflow-y-auto px-10 py-8 bg-transparent text-hub-text">
      {/* ─── Left-Aligned Clean Container ─── */}
      <div className="w-full max-w-5xl space-y-8 pb-32">
        
        {/* ─── Minimalist Header ─── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/[0.08]">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">Eclipse Launcher</h1>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-white font-mono text-xs font-semibold border border-white/15">
                {currentVersion}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium text-xs border border-emerald-500/20 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {language === 'de' ? 'Aktuell' : 'Up to Date'}
              </span>
            </div>
            <p className="text-xs text-white/50 mt-1">
              {language === 'de' 
                ? 'Offizielle Versionshistorie, Release-Notes und Changelogs von GitHub' 
                : 'Official release history, release notes and changelogs from GitHub'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={handleCheckUpdates}
              className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold transition-all border border-white/10 flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw size={13} className={isLoading ? "animate-spin" : ""} />
              {language === 'de' ? 'Nach Updates suchen' : 'Check for Updates'}
            </button>
            <button
              onClick={() => openExternal('https://github.com/PE4CE1/EclipseLauncher')}
              className="px-3.5 py-2 bg-white text-black hover:bg-white/90 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer shadow-sm"
            >
              <Github size={13} className="text-black" />
              <span>GitHub</span>
              <ArrowUpRight size={12} className="text-black/60" />
            </button>
          </div>
        </div>

        {/* ─── LATEST RELEASE CARD ─── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider uppercase text-white/50 flex items-center gap-2">
              <Sparkles size={13} className="text-white" />
              {language === 'de' ? 'Aktuellste Version' : 'Latest Release'}
            </h2>
            <span className="text-xs text-white/40 font-mono">
              {latestRelease.tag_name}
            </span>
          </div>

          <div className="bg-hub-surface/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/[0.08]">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="text-base font-bold text-white tracking-tight">
                    {latestRelease.name || latestRelease.tag_name}
                  </h3>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-white/10 text-white border border-white/15">
                    Latest
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-white/40">
                  <Calendar size={12} />
                  <span>{formatDate(latestRelease.published_at)}</span>
                  <span>•</span>
                  <Tag size={12} />
                  <span className="font-mono">{latestRelease.tag_name}</span>
                </div>
              </div>

              <button
                onClick={() => openExternal(latestRelease.html_url)}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white rounded-lg text-xs font-medium transition-all border border-white/10 flex items-center gap-1.5 cursor-pointer w-fit"
              >
                <span>{language === 'de' ? 'Auf GitHub ansehen' : 'View on GitHub'}</span>
                <ArrowUpRight size={12} />
              </button>
            </div>

            {/* Cleanly Formatted Changelog */}
            <div className="pt-1">
              {renderChangelog(latestRelease.body)}
            </div>
          </div>
        </section>

        {/* ─── PREVIOUS RELEASES HISTORY ACCORDION ─── */}
        <section className="space-y-3 pt-2">
          <h2 className="text-xs font-bold tracking-wider uppercase text-white/50 flex items-center gap-2">
            <GitCommit size={13} className="text-white/50" />
            {language === 'de' ? 'Frühere Versionen & Changelogs' : 'Previous Versions & Changelogs'}
          </h2>

          <div className="space-y-2.5">
            {olderReleases.map((rel) => {
              const isExpanded = !!expandedReleases[rel.tag_name]
              return (
                <div 
                  key={rel.tag_name}
                  style={{ transform: 'translateZ(0)', contain: 'layout paint' }}
                  className="bg-hub-surface/40 border border-white/10 hover:border-white/20 rounded-2xl overflow-hidden transition-colors duration-150"
                >
                  <button
                    onClick={() => toggleExpand(rel.tag_name)}
                    className="w-full p-4 px-5 flex items-center justify-between gap-4 text-left cursor-pointer hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3.5">
                      {/* Clean Minimal Icon */}
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/50 flex-shrink-0">
                        <Tag size={13} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white/90">{rel.name || rel.tag_name}</h4>
                        <span className="text-[11px] text-white/40 mt-0.5 block">{formatDate(rel.published_at)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-lg bg-white/5 flex items-center justify-center text-white/50">
                        <ChevronDown 
                          size={14} 
                          className={`transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                            isExpanded ? 'rotate-180 text-white' : 'text-white/50'
                          }`} 
                        />
                      </div>
                    </div>
                  </button>

                  {/* High-Performance 120 FPS CSS Grid Expansion (No layout thrashing reflows) */}
                  <div 
                    className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                    }`}
                  >
                    <div className="overflow-hidden min-h-0">
                      <div 
                        className={`border-t border-white/[0.08] px-5 py-4 bg-black/20 transition-all duration-300 ease-out ${
                          isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
                        }`}
                      >
                        <div className="pb-3">
                          {renderChangelog(rel.body)}
                        </div>
                        <div className="pt-3 border-t border-white/5 flex justify-end">
                          <button
                            onClick={() => openExternal(rel.html_url)}
                            className="text-[11px] text-white/50 hover:text-white flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <span>{language === 'de' ? 'Vollständiges Release auf GitHub ansehen' : 'View full release on GitHub'}</span>
                            <ArrowUpRight size={11} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

      </div>
    </div>
  )
}

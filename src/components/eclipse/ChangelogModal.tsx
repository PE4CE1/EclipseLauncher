import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  X, ExternalLink, History, Github, 
  Zap, Gamepad2, Cpu, ShieldCheck, Package, 
  Palette, Activity, CheckCircle2
} from 'lucide-react'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { APP_VERSION, GITHUB_REPO } from '../../services/updateService'

interface GitHubRelease {
  tag_name: string
  name: string
  body: string
  published_at: string
  html_url: string
}

const FALLBACK_LATEST: GitHubRelease = {
  tag_name: `v${APP_VERSION}`,
  name: `Eclipse Launcher v${APP_VERSION}`,
  published_at: '2026-09-09T17:00:00Z',
  html_url: `https://github.com/${GITHUB_REPO}/releases/tag/v${APP_VERSION}`,
  body: `# Eclipse Launcher v1.2.8

### What's Changed
* **Sidebar Active Game Indicator:** Installed games in the sidebar now highlight with a crisp active state and indicator bar when clicked.
* **Auto Performance Mode:** Performance mode is now enabled by default for all users for 0% FPS loss.
* **Roblox Platform Polish:** Removed Steam and SteamDB buttons for Roblox and added official website link.
* **Minimalist Release Notes:** Streamlined human-crafted changelog design directly synced with GitHub.
* **Bug Fixes:** Resolved sidebar selection tracking, theme layout alignments, and memory optimizations.`
}

interface ChangelogItem {
  id: string
  title: string
  description: string
  icon: any
  badge: string
}

/**
 * Contextual icon & badge mapping with zero color clutter.
 */
function getFeatureVisuals(title: string, isDe: boolean) {
  const t = title.toLowerCase()

  if (t.includes('roblox')) {
    return { icon: Gamepad2, badge: 'Roblox' }
  }
  if (t.includes('size') || t.includes('packaging') || t.includes('bundle') || t.includes('download') || t.includes('speicher')) {
    return { icon: Package, badge: isDe ? 'Optimierung' : 'Packaging' }
  }
  if (t.includes('redesign') || t.includes('ui') || t.includes('design') || t.includes('overview') || t.includes('header') || t.includes('layout')) {
    return { icon: Palette, badge: 'Design' }
  }
  if (t.includes('discord') || t.includes('openasar') || t.includes('plugin') || t.includes('mod') || t.includes('extension')) {
    return { icon: Cpu, badge: 'Plugin' }
  }
  if (t.includes('steamdb') || t.includes('tracker') || t.includes('media') || t.includes('stat') || t.includes('peak') || t.includes('banner')) {
    return { icon: Activity, badge: 'Analytics' }
  }
  if (t.includes('fix') || t.includes('bug') || t.includes('stability') || t.includes('patch') || t.includes('behebung')) {
    return { icon: CheckCircle2, badge: isDe ? 'Behebung' : 'Fix' }
  }
  if (t.includes('ram') || t.includes('speed') || t.includes('performance') || t.includes('boost') || t.includes('fps')) {
    return { icon: Zap, badge: 'Performance' }
  }
  if (t.includes('account') || t.includes('security') || t.includes('schutz') || t.includes('auth')) {
    return { icon: ShieldCheck, badge: isDe ? 'Sicherheit' : 'Security' }
  }

  return { icon: CheckCircle2, badge: isDe ? 'Update' : 'Update' }
}

/**
 * Transforms raw GitHub release markdown into clean, scannable items.
 */
function parseChangelogCards(body: string, isDe: boolean): ChangelogItem[] {
  if (!body) return []

  const cleaned = body
    .replace(/<img[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')

  const lines = cleaned.split('\n')
  const items: ChangelogItem[] = []

  lines.forEach((rawLine, idx) => {
    const line = rawLine.trim()
    if (!line) return

    // Parse bullet items (* or -)
    if (line.startsWith('*') || line.startsWith('-')) {
      const text = line.replace(/^[\*\-]\s*/, '').trim()
      const boldMatch = text.match(/^\*\*([^*]+)\*\*:?\s*(.*)$/)

      let title = ''
      let description = ''

      if (boldMatch) {
        title = boldMatch[1].trim()
        description = boldMatch[2].replace(/\*+/g, '').trim()
      } else if (text.includes(':')) {
        const colonIdx = text.indexOf(':')
        title = text.slice(0, colonIdx).replace(/\*+/g, '').trim()
        description = text.slice(colonIdx + 1).replace(/\*+/g, '').trim()
      } else {
        title = text.replace(/\*+/g, '').trim()
        description = ''
      }

      if (title) {
        const visuals = getFeatureVisuals(title, isDe)
        items.push({
          id: `item-${idx}`,
          title,
          description,
          icon: visuals.icon,
          badge: visuals.badge
        })
      }
    }
  })

  return items
}

export function ChangelogModal() {
  const { isChangelogOpen, setIsChangelogOpen, setActiveView } = useUIStore()
  const { language } = useTranslation()
  const isDe = language === 'de'

  const [release, setRelease] = useState<GitHubRelease>(FALLBACK_LATEST)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch real latest release from GitHub
  useEffect(() => {
    if (!isChangelogOpen) return

    let isMounted = true
    async function fetchLatest() {
      setIsLoading(true)
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=1`, {
          headers: { 'Accept': 'application/vnd.github.v3+json' }
        })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0 && isMounted) {
            setRelease(data[0])
          }
        }
      } catch {
        // Silently use fallback
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    fetchLatest()
    return () => {
      isMounted = false
    }
  }, [isChangelogOpen])

  const changelogCards = useMemo(() => {
    return parseChangelogCards(release.body, isDe)
  }, [release.body, isDe])

  const closeAndAcknowledge = () => {
    localStorage.setItem(`eclipse_changelog_seen_${APP_VERSION}`, 'true')
    setIsChangelogOpen(false)
  }

  const openFullHistory = () => {
    closeAndAcknowledge()
    setActiveView('eclipse-info')
  }

  const openGitHub = () => {
    const url = release.html_url || `https://github.com/${GITHUB_REPO}/releases`
    if ((window as any).electronAPI?.openUrl) {
      (window as any).electronAPI.openUrl(url)
    } else {
      window.open(url, '_blank')
    }
  }

  if (!isChangelogOpen) return null

  // Format release date cleanly
  const formattedDate = (() => {
    if (!release.published_at) return ''
    try {
      return new Date(release.published_at).toLocaleDateString(isDe ? 'de-DE' : 'en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    } catch {
      return ''
    }
  })()

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 sm:p-6 select-none">
        {/* Subtle Dark Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={closeAndAcknowledge}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Minimalist Modal Dialog */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: 6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative w-full max-w-lg bg-[#0a0b0e] border border-white/10 rounded-xl shadow-[0_24px_64px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[82vh]"
        >
          {/* Header */}
          <div className="p-5 pb-3.5 border-b border-white/[0.06] flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1 font-mono text-[11px] text-white/40">
                <span className="text-white/80 font-semibold">{release.tag_name || `v${APP_VERSION}`}</span>
                {formattedDate && (
                  <>
                    <span className="text-white/20">/</span>
                    <span>{formattedDate}</span>
                  </>
                )}
              </div>
              <h2 className="text-sm font-semibold text-white tracking-tight">
                {isDe ? 'Versionshinweise' : 'Release Notes'}
              </h2>
            </div>

            <button
              onClick={closeAndAcknowledge}
              className="p-1 rounded-md text-white/40 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
              title={isDe ? 'Schließen' : 'Close'}
            >
              <X size={15} />
            </button>
          </div>

          {/* List of Changes */}
          <div className="p-4 py-3 overflow-y-auto flex-1 custom-scrollbar space-y-1">
            {isLoading ? (
              <div className="space-y-3 py-3 animate-pulse">
                {[1, 2, 3, 4].map(i => (
                  <div key={i} className="p-3 space-y-1.5">
                    <div className="h-3 bg-white/10 rounded w-1/4" />
                    <div className="h-2.5 bg-white/5 rounded w-3/4" />
                  </div>
                ))}
              </div>
            ) : changelogCards.length > 0 ? (
              changelogCards.map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.id}
                    className="p-2.5 px-3 rounded-lg hover:bg-white/[0.025] transition-colors group"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-0.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <Icon size={13} className="text-white/40 group-hover:text-white/70 transition-colors shrink-0" />
                        <span className="text-xs font-semibold text-white/90 truncate">
                          {item.title}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-white/35 bg-white/[0.03] border border-white/[0.05] px-1.5 py-0.2 rounded shrink-0">
                        {item.badge}
                      </span>
                    </div>
                    {item.description && (
                      <p className="text-[11.5px] text-white/50 leading-relaxed pl-[21px]">
                        {item.description}
                      </p>
                    )}
                  </div>
                )
              })
            ) : (
              <p className="text-xs text-white/40 text-center py-6 font-mono">
                {isDe ? 'Keine Einträge vorhanden' : 'No entries available'}
              </p>
            )}
          </div>

          {/* Clean Engineering-Grade Footer */}
          <div className="p-3 px-5 border-t border-white/[0.06] bg-black/20 flex items-center justify-between">
            <button
              type="button"
              onClick={openFullHistory}
              className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <History size={12} />
              <span>{isDe ? 'Alle Versionen' : 'All Releases'}</span>
            </button>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={openGitHub}
                className="text-xs text-white/40 hover:text-white transition-colors flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 cursor-pointer"
              >
                <Github size={13} />
                <span>GitHub</span>
                <ExternalLink size={9} className="opacity-40" />
              </button>

              <button
                type="button"
                onClick={closeAndAcknowledge}
                className="px-3.5 py-1 rounded-md bg-white/[0.08] hover:bg-white/[0.14] text-white text-xs font-medium border border-white/10 transition-colors cursor-pointer"
              >
                {isDe ? 'Schließen' : 'Close'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

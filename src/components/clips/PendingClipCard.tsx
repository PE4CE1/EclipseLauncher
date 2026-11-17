import { Film, Loader2 } from 'lucide-react'
import type { PendingClip } from '../../store/clipStore'

export function PendingClipCard({ clip, de }: { clip: PendingClip; de: boolean }) {
  return <article className="clip-library-card clip-library-pending" data-clip-pending={clip.id} aria-busy="true">
    <div className="clip-library-art">
      {clip.thumbnailUrl ? <img className="clip-pending-thumbnail" src={clip.thumbnailUrl} alt="" /> : <Film size={26} strokeWidth={1.2} className="clip-pending-placeholder" />}
      <span className="clip-pending-label" role="status"><Loader2 size={13} className="animate-spin" />{clip.phase==='saving'?(de?'Wird gespeichert…':'Saving…'):(de ? 'Wird vorbereitet…' : 'Preparing…')}</span>
    </div>
    <div className="clip-library-info"><div className="clip-library-title-row"><span className="clip-library-title">{clip.title}</span></div>
      <div className="clip-library-game">{clip.gameTitle}</div><p className="clip-library-meta">{de ? 'Dein Moment wird gespeichert' : 'Saving your moment'}</p>
    </div>
  </article>
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'
import type { SteamGame } from '../../services/steamService'
import { calendarDate, calendarDayKey, calendarWeek, fetchReleaseCalendar, groupCalendarWeek, type ReleaseCalendarGame } from '../../services/releaseCalendar'
import { useUIStore } from '../../store/uiStore'
import { useTranslation } from '../../hooks/useTranslation'
import { useHomeVisible } from './useHomeVisible'
import { HomeCollection } from './HomeCollection'
import './release-calendar.css'

const FIRST_WEEK = -2, LAST_WEEK = 4

function CalendarCover({ game, today }: { game:ReleaseCalendarGame; today:string }) {
  const { t } = useTranslation()
  const open = useUIStore(state => state.openGameDetails)
  const [failedImage, setFailedImage] = useState<string>()
  const overdue = game.releaseState === 'upcoming' && !!game.releaseDay && game.releaseDay < today
  const status = game.releaseState === 'released' ? t('calendarReleased') : overdue ? t('calendarPending') : t('calendarUpcoming')
  return <button type="button" className="release-calendar-game" data-release-state={game.releaseState} onClick={() => open(game.steamId,game.name)} aria-label={`${game.name} · ${status}`}>
    <span className="release-calendar-art">
      {game.headerImage && game.headerImage !== failedImage ? <img src={game.headerImage} alt="" loading="lazy" decoding="async" onError={() => setFailedImage(game.headerImage)} /> : <span className="release-calendar-art-fallback"><CalendarDays size={20} /><span>{game.name}</span></span>}
      {game.earlyAccess && <span className="release-calendar-early">Early Access</span>}
    </span>
    <strong>{game.name}</strong><span className="release-calendar-status"><i />{status}</span>
  </button>
}

export function HomeUpcoming({ games, pending }: { games:SteamGame[]; pending:boolean }) {
  const { t, language, locale } = useTranslation()
  const { ref, visible } = useHomeVisible()
  const [today, setToday] = useState(() => calendarDayKey(new Date()))
  const [offset, setOffset] = useState(0)
  const [undatedOpen, setUndatedOpen] = useState(false)
  const [selectedDay, setSelectedDay] = useState<string|null>(null)
  const closeDay = useCallback(() => setSelectedDay(null),[])
  const {data,isPending,isError,isFetching,refetch} = useQuery({queryKey:['steam','release-calendar','v1',language,today],
    queryFn:({signal}) => fetchReleaseCalendar(language,games,signal),enabled:visible && !pending,
    staleTime:15*60_000,gcTime:60*60_000,placeholderData:keepPreviousData,refetchOnWindowFocus:false,retry:false})
  useEffect(() => {
    const check = () => setToday(calendarDayKey(new Date()))
    const next = new Date(); next.setHours(24,0,1,0)
    const timer = setTimeout(check,next.getTime()-Date.now())
    window.addEventListener('focus',check)
    return () => { clearTimeout(timer);window.removeEventListener('focus',check) }
  },[today])
  const days = useMemo(() => calendarWeek(calendarDate(today),offset),[today,offset])
  const entries = useMemo(() => groupCalendarWeek(data?.games || [],days),[data?.games,days])
  const undated = useMemo(() => (data?.games || []).filter(game => !game.releaseDay && game.releaseState === 'upcoming').sort((a,b) => a.priority-b.priority),[data?.games])
  const count = entries.reduce((sum,day) => sum+day.length,0)
  const range = `${days[0].toLocaleDateString(locale,{day:'numeric',month:'short'})} – ${days[6].toLocaleDateString(locale,{day:'numeric',month:'short',year:'numeric'})}`
  const loading = pending || isPending
  const fullDate = (key:string) => calendarDate(key).toLocaleDateString(locale,{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  return <section ref={ref} className="release-calendar home-upcoming" id="home-upcoming" aria-labelledby="release-calendar-title">
    <header className="release-calendar-heading">
      <div><span><CalendarDays size={13} />{t('calendarEyebrow')}</span><h3 id="release-calendar-title">{t('calendarTitle')}</h3><p>{t('calendarDescription')}</p></div>
      <div className="release-calendar-navigation">
        <button id="release-calendar-today" type="button" onClick={() => setOffset(0)} disabled={offset===0}>{t('calendarThisWeek')}</button>
        <div><button id="release-calendar-previous" type="button" aria-label={t('calendarPreviousWeek')} disabled={offset===FIRST_WEEK} onClick={() => setOffset(value => Math.max(FIRST_WEEK,value-1))}><ChevronLeft size={16} /></button><button id="release-calendar-next" type="button" aria-label={t('calendarNextWeek')} disabled={offset===LAST_WEEK} onClick={() => setOffset(value => Math.min(LAST_WEEK,value+1))}><ChevronRight size={16} /></button></div>
      </div>
    </header>
    <div className="release-calendar-weekline"><strong data-calendar-range aria-live="polite">{range}</strong><span>{loading ? t('calendarLoading') : t('calendarWeekCount',{count:count.toLocaleString(locale)})}</span></div>
    {isError && <div className="release-calendar-notice" role="status"><span>{t('calendarFailed')}</span><button type="button" disabled={isFetching} onClick={() => { void refetch() }}><RefreshCw size={12} />{t('homeRetry')}</button></div>}
    <div className="release-calendar-scroll" tabIndex={0} role="region" aria-label={t('calendarDays')} aria-busy={loading}>
      <div className="release-calendar-days">
        {days.map((date,index) => {
          const key = calendarDayKey(date), current = key===today
          return <section key={key} className="release-calendar-day" data-calendar-day={key} data-today={current || undefined} data-past={key<today || undefined} aria-label={fullDate(key)}>
            <header><time dateTime={key} aria-current={current ? 'date' : undefined}><span>{date.toLocaleDateString(locale,{weekday:'short'})}</span><strong>{date.toLocaleDateString(locale,{day:'numeric',month:'numeric'})}</strong></time>{current ? <span>{t('calendarToday')}</span> : null}</header>
            <div className="release-calendar-day-games">{loading ? [0,1].map(value => <div key={value} className="release-calendar-skeleton" />) : entries[index].length ? <>{entries[index].slice(0,2).map(game => <CalendarCover key={game.steamId} game={game} today={today} />)}{entries[index].length>2 && <button type="button" className="release-calendar-more" data-calendar-more={key} onClick={() => setSelectedDay(key)}>{t('calendarMore',{count:(entries[index].length-2).toLocaleString(locale)})}<ChevronRight size={12} /></button>}</> : <p className="release-calendar-empty">{isError ? '—' : t('calendarNoReleases')}</p>}</div>
          </section>
        })}
      </div>
    </div>
    <footer className="release-calendar-footer"><div><span><i data-state="released" />{t('calendarReleased')}</span><span><i data-state="upcoming" />{t('calendarUpcoming')}</span></div><p>{data?.partial ? t('calendarPartial') : t('calendarSource')}</p></footer>
    {!!undated.length && <div className="release-calendar-undated">
      <button type="button" className="release-calendar-undated-toggle" aria-expanded={undatedOpen} aria-controls="release-calendar-undated-list" onClick={() => setUndatedOpen(value => !value)}><span>{t('calendarUnscheduled')}<small>{undated.length.toLocaleString(locale)}</small></span><ChevronDown size={14} style={{transform:undatedOpen?'rotate(180deg)':undefined}} /></button>
      {undatedOpen && <div id="release-calendar-undated-list">{undated.slice(0,12).map(game => <div key={game.steamId}><CalendarCover game={game} today={today} /><p>{game.releaseWindow || t('homeDateUnknown')}</p></div>)}{undated.length>12 && <button type="button" className="release-calendar-more" onClick={() => setSelectedDay('undated')}>{t('homeViewAll')}</button>}</div>}
    </div>}
    {selectedDay && <HomeCollection title={selectedDay==='undated' ? t('calendarUnscheduled') : fullDate(selectedDay)} games={selectedDay==='undated' ? undated : data?.games.filter(game => game.releaseDay===selectedDay) || []} onClose={closeDay} />}
  </section>
}

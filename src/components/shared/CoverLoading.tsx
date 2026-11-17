import { memo, useEffect, useRef } from 'react'
import { observeCoverLoading } from '../../services/coverLoadingVisibility'
import './cover-loading.css'

export const CoverLoading = memo(function CoverLoading() {
  const element = useRef<HTMLSpanElement>(null)
  useEffect(() => element.current ? observeCoverLoading(element.current) : undefined, [])
  return <span ref={element} className="cover-loading" aria-hidden="true">
    <svg className="cover-loading-mark" width="24" height="28" viewBox="0 0 24 28" fill="none">
      <rect x="5.5" y="5.5" width="14" height="19" rx="2"/>
      <path d="M3 20V5a3 3 0 0 1 3-3h10M9 18l3-3 4 4M14.5 11.5h.01"/>
    </svg>
  </span>
})

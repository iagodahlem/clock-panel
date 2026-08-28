// The panel's only piece of chrome. The page is otherwise a bare canvas, so
// this fades out after a stretch of pointer inactivity and reappears on
// movement or focus, the same convention video players use for their
// controls, rather than sitting on screen permanently.

import { useEffect, useRef, useState, type RefObject } from 'react'
import { exitFullscreen, isFullscreen, onFullscreenChange, requestFullscreen } from './fullscreen'

const HIDE_DELAY_MS = 2500

interface FullscreenButtonProps {
  readonly containerRef: RefObject<HTMLElement | null>
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 3H5a2 2 0 0 0-2 2v3" />
        <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
        <path d="M3 16v3a2 2 0 0 0 2 2h3" />
        <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
      </g>
    </svg>
  )
}

function CompressIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8 3v3a2 2 0 0 1-2 2H3" />
        <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
        <path d="M3 16h3a2 2 0 0 1 2 2v3" />
        <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
      </g>
    </svg>
  )
}

export function FullscreenButton({ containerRef }: FullscreenButtonProps) {
  const [active, setActive] = useState(false)
  const [visible, setVisible] = useState(true)
  const [focused, setFocused] = useState(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => onFullscreenChange(() => setActive(isFullscreen())), [])

  // Reveal on any pointer activity, then fade back out after a quiet
  // stretch. Focus (keyboard navigation) is tracked separately below and
  // overrides this -- a focused control must never fade out from under the
  // user driving it with a keyboard, which has no "movement" of its own to
  // reveal it again.
  useEffect(() => {
    const scheduleHide = (): void => {
      if (hideTimeoutRef.current !== null) clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = setTimeout(() => setVisible(false), HIDE_DELAY_MS)
    }
    const reveal = (): void => {
      setVisible(true)
      scheduleHide()
    }
    reveal()
    window.addEventListener('pointermove', reveal)
    window.addEventListener('pointerdown', reveal)
    return () => {
      window.removeEventListener('pointermove', reveal)
      window.removeEventListener('pointerdown', reveal)
      if (hideTimeoutRef.current !== null) clearTimeout(hideTimeoutRef.current)
    }
  }, [])

  const shown = visible || focused

  function toggle(event: React.MouseEvent<HTMLButtonElement>): void {
    // Keeps this click from also reaching PanelCanvas's window-level
    // any-key/click QA trigger, which reads it as an unrelated gesture.
    event.stopPropagation()
    const container = containerRef.current
    if (!container) return
    if (isFullscreen()) {
      exitFullscreen()
    } else {
      requestFullscreen(container)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      aria-label={active ? 'Exit fullscreen' : 'Enter fullscreen'}
      style={{
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        width: '2.25rem',
        height: '2.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: '0.5rem',
        background: 'rgba(255, 255, 255, 0.08)',
        color: 'rgba(255, 255, 255, 0.72)',
        cursor: 'pointer',
        opacity: shown ? 1 : 0,
        pointerEvents: shown ? 'auto' : 'none',
        transition: 'opacity 300ms ease',
      }}
    >
      {active ? <CompressIcon /> : <ExpandIcon />}
    </button>
  )
}

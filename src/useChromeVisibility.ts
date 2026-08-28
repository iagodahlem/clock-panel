// Shared fade-with-inactivity behavior for on-canvas chrome (the fullscreen
// button, the control panel trigger): visible on pointer activity, fades
// out after a quiet stretch, and never fades out from under a control the
// user is driving with a keyboard, which has no "movement" of its own to
// reveal it again. Extracted from FullscreenButton so every piece of chrome
// on the page shares the exact same reveal/hide timing instead of each
// re-implementing its own copy.

import { useEffect, useRef, useState } from 'react'

const HIDE_DELAY_MS = 2500

export interface ChromeVisibility {
  readonly shown: boolean
  readonly onFocus: () => void
  readonly onBlur: () => void
}

export function useChromeVisibility(): ChromeVisibility {
  const [visible, setVisible] = useState(true)
  const [focused, setFocused] = useState(false)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  return {
    shown: visible || focused,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  }
}

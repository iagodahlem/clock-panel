// Fullscreen API wrapper. requestFullscreen/exitFullscreen/fullscreenElement
// are the standard surface every current browser implements except Safari,
// which as of this writing still only exposes the legacy webkit-prefixed
// names -- this is the one seam where that prefix leaks in, so nothing else
// in the app needs to know it exists.

interface PrefixedFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => void
}

interface PrefixedFullscreenDocument extends Document {
  webkitExitFullscreen?: () => void
  webkitFullscreenElement?: Element | null
}

export function isFullscreen(): boolean {
  const doc = document as PrefixedFullscreenDocument
  return (document.fullscreenElement ?? doc.webkitFullscreenElement ?? null) !== null
}

export function requestFullscreen(element: HTMLElement): void {
  const el = element as PrefixedFullscreenElement
  if (element.requestFullscreen) {
    void element.requestFullscreen()
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen()
  }
}

export function exitFullscreen(): void {
  const doc = document as PrefixedFullscreenDocument
  if (document.exitFullscreen) {
    void document.exitFullscreen()
  } else if (doc.webkitExitFullscreen) {
    doc.webkitExitFullscreen()
  }
}

/** Subscribes to both the standard and webkit-prefixed fullscreenchange events. Returns an unsubscribe function. */
export function onFullscreenChange(callback: () => void): () => void {
  document.addEventListener('fullscreenchange', callback)
  document.addEventListener('webkitfullscreenchange', callback)
  return () => {
    document.removeEventListener('fullscreenchange', callback)
    document.removeEventListener('webkitfullscreenchange', callback)
  }
}

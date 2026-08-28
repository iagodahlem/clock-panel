import * as React from 'react'

import { cn } from '@/lib/cn'
import { Button, type ButtonProps } from './button'

/**
 * A button that copies a string and morphs its label from "Copy" to
 * "Copied" for a moment — the clock panel mock's `.copy`
 * (`designs/mocks/2026-08-22-clock-config-panel.html`), which copies the
 * live URL readout. Wraps `button.tsx` rather than a bare `<button>`.
 *
 * `copyToClipboard` ports the mock's own copy logic verbatim: the
 * Clipboard API (`navigator.clipboard.writeText`) first, a hidden,
 * off-screen, `readonly` `<textarea>` + `document.execCommand("copy")` as
 * the fallback for browsers or contexts (non-HTTPS, permissions-denied)
 * where the Clipboard API isn't available. Exported standalone so it's
 * unit-testable without mounting the button.
 *
 * Two departures from the mock, both accessibility additions the mock's
 * own vanilla-JS version doesn't have: a visually-hidden `aria-live`
 * region announces the copy for screen-reader users who aren't watching
 * the button's text (the mock relies on sighted users seeing "Copy"
 * become "Copied"), and the visible label swap doubles as the button's
 * accessible name update — no `aria-hidden` trick needed since, unlike
 * the mock's two-span CSS-toggle (built to avoid a DOM reflow in vanilla
 * JS), React already swaps the single text node efficiently on its own.
 *
 * 1600ms reset delay matches the mock's own `copyTimer` timeout exactly.
 *
 * No `children` prop: the label comes from `copyLabel`/`copiedLabel`
 * (defaulting to "Copy"/"Copied") since the component owns the swap
 * between them — a `children` prop would leave it ambiguous which state
 * the caller's content was meant for. `onCopy` is also not the native
 * `ButtonProps["onCopy"]` clipboard event; it's this component's own
 * "the copy succeeded" callback, so the native one is omitted from the
 * inherited props to avoid the name colliding with a different signature.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Clipboard API can reject (denied permission, insecure context) —
      // fall through to the textarea fallback rather than surfacing an
      // error the caller has no good way to act on.
    }
  }
  return copyWithTextarea(text)
}

function copyWithTextarea(text: string): boolean {
  if (typeof document === 'undefined') return false

  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()

  let succeeded: boolean
  try {
    succeeded = document.execCommand('copy')
  } catch {
    succeeded = false
  }
  field.remove()
  return succeeded
}

export interface CopyButtonProps extends Omit<ButtonProps, 'children' | 'onCopy' | 'value'> {
  /** The string to copy, or a function producing it lazily at click time. Not the native button `value` (form submission value) — omitted from the inherited props for the same reason. */
  value: string | (() => string)
  /** Idle-state label. */
  copyLabel?: React.ReactNode
  /** Label shown for `resetDelay` ms after a successful copy. */
  copiedLabel?: React.ReactNode
  /** Text announced to screen readers once the copy succeeds. */
  announcement?: string
  /** How long the copied state holds before reverting, in ms. */
  resetDelay?: number
  /** Fires after a successful copy, with the string that was copied. Not the native clipboard `onCopy` event — that's omitted from `ButtonProps` here on purpose since this component's own `onCopy` means something different. */
  onCopy?: (value: string) => void
}

export function CopyButton({
  value,
  copyLabel = 'Copy',
  copiedLabel = 'Copied',
  announcement = 'Copied to clipboard',
  resetDelay = 1600,
  onCopy,
  onClick,
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false)
  const timeoutRef = React.useRef<number | undefined>(undefined)

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current)
    }
  }, [])

  async function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
    onClick?.(event)
    const text = typeof value === 'function' ? value() : value
    const succeeded = await copyToClipboard(text)
    if (!succeeded) return

    onCopy?.(text)
    if (timeoutRef.current !== undefined) window.clearTimeout(timeoutRef.current)
    setCopied(true)
    timeoutRef.current = window.setTimeout(() => setCopied(false), resetDelay)
  }

  return (
    <>
      <Button
        type="button"
        data-slot="copy-button"
        data-copied={copied}
        onClick={handleClick}
        className={cn(className)}
        {...props}
      >
        {copied ? copiedLabel : copyLabel}
      </Button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? announcement : ''}
      </span>
    </>
  )
}

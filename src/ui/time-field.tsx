'use client'

import * as React from 'react'

import { cn } from '@/lib/cn'
import { Input } from './input'

/**
 * A plain text field for a 24-hour time, not `<input type="time">` — the
 * clock panel mock's `.input-time`
 * (`designs/mocks/2026-08-22-clock-config-panel.html`). Wraps/specializes
 * `input.tsx` rather than a bare `<input>`, per the design inventory this
 * item was extracted from.
 *
 * Normalization logic (`normalizeTimeInput`) is a direct, deliberate port
 * of the mock's own `normalizeTime()`: strip everything but digits, take
 * the first four, and require exactly four — no partial-length parsing
 * (a lone "9" for "09" is not accepted), and no hour/minute range check
 * (the mock's own comment: "Any four digits render, including times that
 * do not exist" — the param intentionally accepts a time that does not
 * exist, since that is how the digit rendering gets exercised). A time
 * field with different semantics is a different component's job, not a
 * config option bolted onto this one.
 *
 * Validity re-checks on every keystroke, same as the mock's own `input`
 * listener — that is a live signal, not a delayed one, and a border-color
 * change carries it with no layout shift. Normalization only happens on
 * blur, and only when the current text is already valid: an incomplete
 * or malformed value is flagged (`data-valid="false"`) and left exactly
 * as typed, never rewritten into something the user didn't type.
 *
 * No `aria-invalid` here on purpose: `input.tsx` already styles
 * `aria-invalid` with a full-strength `border-destructive`, and this
 * field's invalid state wants the contract's destructive token at
 * reduced alpha instead (a live-typing signal, not a submitted-form
 * error) — setting both would fight over which one wins at equal CSS
 * specificity. `data-valid` is this component's own signal, matching the
 * mock's own precedent (it never sets `aria-invalid` either).
 */
export function normalizeTimeInput(raw: string): string | null {
  const digits = raw.replace(/[^0-9]/g, '').slice(0, 4)
  if (digits.length !== 4) return null
  return `${digits.slice(0, 2)}:${digits.slice(2)}`
}

export function isValidTimeInput(raw: string): boolean {
  return normalizeTimeInput(raw) !== null
}

export interface TimeFieldProps extends Omit<
  React.ComponentProps<'input'>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'aria-label' | 'aria-invalid'
> {
  /** Controlled value. Omit to let the field manage its own text. */
  value?: string
  /** Initial text for uncontrolled use. Ignored when `value` is set. */
  defaultValue?: string
  /** Fires on every change, and again on blur if the text gets normalized. */
  onValueChange?: (value: string, valid: boolean) => void
  'aria-label': string
}

export function TimeField({
  className,
  value,
  defaultValue,
  onValueChange,
  onBlur,
  'aria-label': ariaLabel,
  ...props
}: TimeFieldProps) {
  const isControlled = value !== undefined
  const [uncontrolledText, setUncontrolledText] = React.useState(defaultValue ?? '')
  const text = isControlled ? value : uncontrolledText
  const valid = isValidTimeInput(text)

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    if (!isControlled) setUncontrolledText(raw)
    onValueChange?.(raw, isValidTimeInput(raw))
  }

  function handleBlur(event: React.FocusEvent<HTMLInputElement>) {
    const normalized = normalizeTimeInput(text)
    if (normalized && normalized !== text) {
      if (!isControlled) setUncontrolledText(normalized)
      onValueChange?.(normalized, true)
    }
    onBlur?.(event)
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      maxLength={5}
      spellCheck={false}
      autoComplete="off"
      placeholder="HH:MM"
      data-slot="time-field"
      data-valid={valid}
      aria-label={ariaLabel}
      value={text}
      onChange={handleChange}
      onBlur={handleBlur}
      className={cn(
        'font-mono tabular-nums tracking-[0.06em]',
        !valid && 'border-[color-mix(in_oklch,var(--destructive)_55%,transparent)]',
        className,
      )}
      {...props}
    />
  )
}

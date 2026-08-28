import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * shadcn/ui's stock Input, pulled via `apps/www/components.json` and
 * restyled through theme-contract tokens.
 *
 * Three departures from the upstream source:
 *
 * 1. No `dark:` variant classes — see button.tsx's doc comment for why the
 *    `data-theme="dark"]` mechanism makes them redundant here.
 * 2. No `dark:bg-input/30` fill. The contract defines `--input` narrowly as
 *    "border color for form controls" (docs/theme-contract.md), not a
 *    general-purpose surface token, so this port keeps the input
 *    background transparent in both modes and lets `--input` do only the
 *    one job the contract gives it: the border.
 * 3. No `active:` treatment, unlike Button. A text input's "pressed" and
 *    "focused" states are the same click — there's no separate press
 *    affordance to show once focus-visible has already taken over the
 *    element, so adding one would just be motion for its own sake.
 *
 * `file:*` styling (the file-picker button shadcn's Input renders inside a
 * `type="file"` input via the `::file-selector-button` pseudo-element) and
 * the `text-base md:text-sm` pair (prevents iOS Safari's auto-zoom on any
 * input under 16px, a real shadcn a11y fix) were missing entirely before
 * this rebase — the showcase demos a file input, but it rendered as the
 * browser's unstyled default button.
 */
export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

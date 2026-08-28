import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

/**
 * Small dot indicating a live/active/running state — the clock panel
 * mock's `.status .dot` and the projects mock's `.pilot`
 * (`designs/mocks/2026-08-22-clock-config-panel.html`,
 * `2026-08-22-projects-page.html`). House addition, no shadcn/Radix
 * upstream.
 *
 * One size (7px) across every variant rather than the two sizes the two
 * source mocks each picked (6px, 7px) — both sit inside the "6 to 7px"
 * range the design calls for, and one fixed size reads more consistently
 * across the two contexts (a status row, a card title) this component
 * shows up in than switching size with variant would.
 *
 * Only `live` gets the soft ring and the pulse. `idle`/`active` are plain
 * solid dots, color-only — that mirrors the mocks themselves (their own
 * ring only ever appears on the "on" state) rather than inventing a ring
 * treatment neither source design has for the other two states.
 *
 * `live`'s color and ring both fall back through `var()` to a contract
 * token (`var(--live, var(--primary))`,
 * `var(--live-soft, color-mix(in oklch, var(--primary) 14%, transparent))`)
 * so this still renders a sensible highlighted dot under `theme-defaults`,
 * `sitegrade`, or `domainproof`, none of which declare theme-iagodahlem's
 * `--live`/`--live-soft` extension tokens. `idle` falls back the same way
 * onto `--muted-foreground` for `--text-faint`.
 *
 * The pulse keyframes (`status-dot-pulse`) live in
 * `registry/styles/tailwind.css`, not here — a registry item's own file
 * can't introduce global `@keyframes` for a consumer's Tailwind build, so
 * it's registered once in the shared Tailwind mapping layer every
 * consumer already installs. `motion-reduce:animate-none` (a stock
 * Tailwind v4 variant, no config needed) drops the loop under reduced
 * motion, matching the mocks' own `.pilot { animation: none; }` reduced-
 * motion override — the dot stays solid at full opacity, not paused
 * mid-cycle.
 */
const statusDotVariants = cva('inline-block size-[7px] shrink-0 rounded-full', {
  variants: {
    variant: {
      idle: 'bg-[var(--text-faint,var(--muted-foreground))]',
      live: cn(
        'bg-[var(--live,var(--primary))]',
        'shadow-[0_0_0_4px_var(--live-soft,color-mix(in_oklch,var(--primary)_14%,transparent))]',
        'animate-status-dot-pulse motion-reduce:animate-none',
      ),
      active: 'bg-foreground',
    },
  },
  defaultVariants: {
    variant: 'idle',
  },
})

export interface StatusDotProps
  extends React.ComponentProps<'span'>, VariantProps<typeof statusDotVariants> {}

export function StatusDot({ className, variant = 'idle', ...props }: StatusDotProps) {
  return (
    <span
      data-slot="status-dot"
      data-variant={variant}
      aria-hidden="true"
      className={cn(statusDotVariants({ variant, className }))}
      {...props}
    />
  )
}

export { statusDotVariants }

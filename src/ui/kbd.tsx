import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * Inline keyboard-hint chip — the small "c" shown inside the clock panel
 * mock's trigger button (`designs/mocks/2026-08-22-clock-config-panel.html`,
 * `.kbd`). House addition, no shadcn/Radix upstream, trivial enough that
 * it stays a styled `<kbd>` rather than a wrapped primitive.
 *
 * Token departure worth flagging: the mock's border and text color read
 * theme-iagodahlem's `--border-strong`/`--text-faint` extension tokens (a
 * crisper hairline and a third, dimmer text step than this contract's own
 * `--border`/`--muted-foreground`). Those extension tokens only exist on
 * theme-iagodahlem — under `theme-defaults`, `sitegrade`, or
 * `domainproof`, an undeclared custom property resolves to nothing (no
 * border, invisible text), so both are consumed through a `var()`
 * fallback chain (`var(--border-strong, var(--border))`) that lands on
 * the nearest real contract token when the extension isn't there. This
 * keeps `Kbd` correct under every theme in this registry, not just the
 * one it was designed against.
 */
export function Kbd({ className, ...props }: React.ComponentProps<'kbd'>) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        'inline-grid h-5 min-w-5 place-items-center rounded-sm border px-1 font-mono text-[0.6875rem] leading-none',
        'border-[var(--border-strong,var(--border))] bg-surface-2 text-[var(--text-faint,var(--muted-foreground))]',
        className,
      )}
      {...props}
    />
  )
}

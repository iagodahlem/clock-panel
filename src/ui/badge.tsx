import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

/**
 * Bordered label chip — the clock panel mock's `.param` (mono param-name,
 * next to a field label) and `.tag-proposed` ("not a param yet" dashed
 * tag), and the projects mock's `.stack` (technology tag on a project
 * card). Three visual takes on the same mono, small-caps-adjacent shape,
 * no shadcn/Radix upstream shipped in this registry yet.
 *
 * `stack` and `proposed` are boxed (border, padding, radius); `param` is
 * bare text with no box at all — that's a deliberate structural
 * difference, not an oversight, matching the mocks: `.param` is applied
 * straight to a `<code>`/`<label>` inline with a field label, while
 * `.stack`/`.tag-proposed` are standalone chips. See this component's
 * `.showcase.tsx` for the `<code>`/`<label>` usage pattern the mocks use
 * for `param` — that pairing is a text-level convention, not a second
 * component.
 *
 * `stack`'s border reads the contract's own `--border` (always defined).
 * `param` and `proposed` read `--text-faint` for their text color, and
 * `proposed` additionally reads `--border-strong` for its dashed border —
 * both are theme-iagodahlem extension tokens, consumed through a
 * `var()` fallback chain (`var(--text-faint, var(--muted-foreground))`,
 * `var(--border-strong, var(--border))`) so all three variants still
 * render correctly under `theme-defaults`, `sitegrade`, or `domainproof`.
 */
const badgeVariants = cva(
  'inline-flex w-fit items-center whitespace-nowrap font-mono text-[0.6875rem]',
  {
    variants: {
      variant: {
        stack:
          'gap-1 rounded-sm border border-border px-2 py-0.5 tracking-[0.04em] text-[var(--text-faint,var(--muted-foreground))]',
        param: 'text-[var(--text-faint,var(--muted-foreground))]',
        proposed:
          'rounded-sm border border-dashed border-[var(--border-strong,var(--border))] px-[0.3rem] py-[0.05rem] tracking-[0.03em] text-[var(--text-faint,var(--muted-foreground))]',
      },
    },
    defaultVariants: {
      variant: 'stack',
    },
  },
)

export interface BadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant = 'stack', ...props }: BadgeProps) {
  return (
    <span
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, className }))}
      {...props}
    />
  )
}

export { badgeVariants }

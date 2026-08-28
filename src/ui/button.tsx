import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/cn'

/**
 * shadcn/ui's stock Button (new-york style, Radix `Slot` for `asChild`),
 * pulled via `apps/www/components.json` and restyled entirely through
 * theme-contract v1.1 semantic utilities — bg-primary, text-foreground,
 * border-border, rounded-md, ... — never a raw Tailwind palette class or a
 * literal color. This is the base layer the rest of the styling sits on
 * top of: variants, sizes, `asChild`, and every interaction state below
 * (hover, focus-visible, active, disabled, aria-invalid) come from
 * upstream, not hand-written here.
 *
 * Three deliberate departures from the upstream source:
 *
 * 1. No `dark:` variant classes anywhere, because this registry's theming
 *    mechanism differs from stock shadcn's `.dark` class toggle.
 *    `:root[data-theme="dark"]` already swaps every semantic token's
 *    resolved value at the CSS custom property level (see
 *    docs/theme-contract.md), so `bg-primary` alone is correct in both
 *    modes — a `dark:bg-primary/80`-style override would fight the token
 *    instead of using it.
 * 2. `text-white` on the destructive variant's fill, not a
 *    `--destructive-foreground` token — the contract deliberately has no
 *    such token (see docs/theme-contract.md's semantic-colors section);
 *    literal white on `--destructive` is the documented, intentional
 *    exception to "no literal colors" here, matching current shadcn
 *    convention.
 * 3. `active:scale-95`, applied once at the base level rather than
 *    per-variant, is a house addition — upstream ships hover/focus-visible/
 *    disabled/aria-invalid but no pressed state. A uniform scale keeps
 *    every variant's press feedback consistent without duplicating it six
 *    times, and `transition-all` (replacing upstream's `transition-colors`)
 *    is what makes the press/release actually ease instead of snap.
 */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:scale-95 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:pointer-events-none disabled:opacity-50 disabled:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20',
        outline:
          'border border-border bg-background shadow-sm hover:bg-accent hover:text-foreground',
        secondary: 'bg-secondary text-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { buttonVariants }

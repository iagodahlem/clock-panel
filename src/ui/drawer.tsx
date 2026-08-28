import * as React from 'react'
import { XIcon } from 'lucide-react'
import { Drawer as DrawerPrimitive } from '@base-ui/react/drawer'
import { cva } from 'class-variance-authority'

import { cn } from '@/lib/cn'
import { Button, type ButtonProps } from './button'

/**
 * An edge-anchored sheet — Base UI's Drawer for the behavior (swipe to
 * dismiss, backdrop, scroll lock, focus trap, Escape, outside press,
 * snap points, modal and non-modal open state), one house-built surface
 * for the visual: which edge the popup enters from is `swipeDirection`,
 * the same prop Base UI already uses to pick the dismiss gesture, read
 * back through a small context so the popup and viewport parts can each
 * pick their own `cva` variant from it instead of the caller repeating a
 * side prop on every part. `down` and `right` are exercised by this
 * registry's own consumer (`registry/blocks/control-panel.tsx`, bottom
 * sheet under 48rem); `up` and `left` are the same mechanism, unexercised
 * here but not a special case to add later.
 *
 * `DrawerViewport` carries `pointer-events-none` with `pointer-events-auto`
 * put back on `DrawerPopup` — the viewport is a full-bleed positioning box
 * on every edge, and without this a non-modal drawer's empty space would
 * swallow clicks meant for the page behind it. A modal drawer still
 * dismisses correctly on an outside press: that's Base UI's own document-
 * level listener, not a click landing on `DrawerBackdrop`.
 *
 * `DrawerBackdrop` is a separate part the caller includes or omits — a
 * modal sheet wants it, a non-modal one (an inspector that stays open
 * beside what it configures) doesn't, and there is no correct default
 * that covers both, so this primitive doesn't pick one.
 *
 * Twin: none. The behavior is focus management, scroll locking, and
 * portalling, none of which a stylesheet can provide — same reasoning
 * `dialog.tsx` and `dropdown-menu.tsx` already document for themselves.
 */

export type DrawerSwipeDirection = NonNullable<DrawerPrimitive.Root.Props['swipeDirection']>
export type DrawerChangeEventDetails = DrawerPrimitive.Root.ChangeEventDetails

interface DrawerContextValue {
  swipeDirection: DrawerSwipeDirection
}

const DrawerContext = React.createContext<DrawerContextValue>({ swipeDirection: 'down' })

function useDrawerContext(): DrawerContextValue {
  return React.useContext(DrawerContext)
}

export type DrawerProps = Omit<DrawerPrimitive.Root.Props, 'children'> & {
  children?: React.ReactNode
}

export function Drawer({ swipeDirection = 'down', children, ...props }: DrawerProps) {
  const context = React.useMemo<DrawerContextValue>(() => ({ swipeDirection }), [swipeDirection])

  return (
    <DrawerContext.Provider value={context}>
      <DrawerPrimitive.Root data-slot="drawer" swipeDirection={swipeDirection} {...props}>
        {children}
      </DrawerPrimitive.Root>
    </DrawerContext.Provider>
  )
}

export type DrawerTriggerProps = DrawerPrimitive.Trigger.Props

export function DrawerTrigger({ ...props }: DrawerTriggerProps) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

export type DrawerPortalProps = DrawerPrimitive.Portal.Props

export function DrawerPortal({ ...props }: DrawerPortalProps) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

export type DrawerBackdropProps = DrawerPrimitive.Backdrop.Props

/** Never a literal overlay ink — the veil recedes toward the page's own base color, which dims in a dark theme and hazes in a light one. */
export function DrawerBackdrop({ className, ...props }: DrawerBackdropProps) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-backdrop"
      className={cn(
        'fixed inset-0 z-40 bg-[color-mix(in_oklch,var(--background)_55%,transparent)]',
        'transition-opacity duration-[var(--duration-base)] ease-standard',
        'data-starting-style:opacity-0 data-ending-style:opacity-0',
        'data-ending-style:duration-[var(--dur-exit,var(--duration-fast))]',
        className,
      )}
      {...props}
    />
  )
}

const drawerViewportVariants = cva('pointer-events-none fixed inset-0 z-50 flex', {
  variants: {
    swipeDirection: {
      down: 'items-end justify-center',
      up: 'items-start justify-center',
      right: 'items-stretch justify-end',
      left: 'items-stretch justify-start',
    },
  },
  defaultVariants: {
    swipeDirection: 'down',
  },
})

export type DrawerViewportProps = DrawerPrimitive.Viewport.Props

export function DrawerViewport({ className, ...props }: DrawerViewportProps) {
  const { swipeDirection } = useDrawerContext()
  return (
    <DrawerPrimitive.Viewport
      data-slot="drawer-viewport"
      className={cn(drawerViewportVariants({ swipeDirection }), className)}
      {...props}
    />
  )
}

const drawerPopupVariants = cva(
  cn(
    'flex flex-col border border-border bg-surface text-foreground shadow-lg outline-none',
    'pointer-events-auto transition-[translate] duration-[340ms] ease-[var(--ease-drawer,var(--ease-standard))]',
    'data-ending-style:duration-[var(--dur-exit,var(--duration-fast))]',
    'data-swiping:duration-0 data-swiping:select-none',
    'motion-reduce:transition-opacity',
    'motion-reduce:data-starting-style:opacity-0 motion-reduce:data-ending-style:opacity-0',
  ),
  {
    variants: {
      swipeDirection: {
        down: cn(
          'w-full max-h-[85svh] rounded-t-xl border-x-0 border-b-0',
          'translate-y-[var(--drawer-swipe-movement-y,0px)]',
          'data-starting-style:translate-y-full data-ending-style:translate-y-full',
          'motion-reduce:data-starting-style:translate-y-0 motion-reduce:data-ending-style:translate-y-0',
        ),
        up: cn(
          'w-full max-h-[85svh] rounded-b-xl border-x-0 border-t-0',
          'translate-y-[var(--drawer-swipe-movement-y,0px)]',
          'data-starting-style:-translate-y-full data-ending-style:-translate-y-full',
          'motion-reduce:data-starting-style:translate-y-0 motion-reduce:data-ending-style:translate-y-0',
        ),
        right: cn(
          'h-full w-full max-w-sm rounded-l-xl border-y-0 border-r-0',
          'translate-x-[var(--drawer-swipe-movement-x,0px)]',
          'data-starting-style:translate-x-full data-ending-style:translate-x-full',
          'motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-ending-style:translate-x-0',
        ),
        left: cn(
          'h-full w-full max-w-sm rounded-r-xl border-y-0 border-l-0',
          'translate-x-[var(--drawer-swipe-movement-x,0px)]',
          'data-starting-style:-translate-x-full data-ending-style:-translate-x-full',
          'motion-reduce:data-starting-style:translate-x-0 motion-reduce:data-ending-style:translate-x-0',
        ),
      },
    },
    defaultVariants: {
      swipeDirection: 'down',
    },
  },
)

export type DrawerPopupProps = DrawerPrimitive.Popup.Props

export function DrawerPopup({ className, ...props }: DrawerPopupProps) {
  const { swipeDirection } = useDrawerContext()
  return (
    <DrawerPrimitive.Popup
      data-slot="drawer-popup"
      className={cn(drawerPopupVariants({ swipeDirection }), className)}
      {...props}
    />
  )
}

export type DrawerContentProps = DrawerPrimitive.Content.Props

export function DrawerContent({ className, ...props }: DrawerContentProps) {
  return (
    <DrawerPrimitive.Content
      data-slot="drawer-content"
      className={cn('flex min-h-0 flex-1 flex-col', className)}
      {...props}
    />
  )
}

/** Title + close row, the shape every consumer of this primitive ends up hand-rolling otherwise — same spirit as dialog.tsx's DialogHeader. */
export function DrawerHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="drawer-header"
      className={cn('flex items-center justify-between gap-4', className)}
      {...props}
    />
  )
}

export type DrawerTitleProps = DrawerPrimitive.Title.Props

export function DrawerTitle({ className, ...props }: DrawerTitleProps) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn('m-0 text-base font-semibold text-foreground', className)}
      {...props}
    />
  )
}

export type DrawerDescriptionProps = DrawerPrimitive.Description.Props

export function DrawerDescription({ className, ...props }: DrawerDescriptionProps) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export interface DrawerCloseProps extends Omit<ButtonProps, 'asChild'> {
  /** Element substitution, same terms as every other part in this registry. */
  render?: React.ReactElement | undefined
  'data-slot'?: string | undefined
}

export function DrawerClose({
  className,
  children,
  render,
  variant = 'ghost',
  size = 'icon',
  'aria-label': ariaLabel = 'Close',
  'data-slot': dataSlot = 'drawer-close',
  ...props
}: DrawerCloseProps) {
  const element = render ?? (
    <Button type="button" variant={variant} size={size} aria-label={ariaLabel} {...props} />
  )
  return (
    <DrawerPrimitive.Close
      data-slot={dataSlot}
      className={cn('text-muted-foreground', className)}
      render={element}
    >
      {children ?? <XIcon className="size-4" />}
    </DrawerPrimitive.Close>
  )
}

export { drawerPopupVariants, drawerViewportVariants }

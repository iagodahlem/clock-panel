'use client'

import * as React from 'react'
import { XIcon } from 'lucide-react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'

import { cn } from '@/lib/cn'
import { Button, type ButtonProps } from './button'

/**
 * An anchored, floating panel — Base UI's Popover for the behavior
 * (anchor positioning, collision handling, non-modal dismissal by
 * default, focus management), one house-built surface for the visual:
 * scale-and-fade out of the anchor's own corner, using the
 * `--transform-origin` custom property `PopoverPositioner` already
 * publishes rather than a fixed direction guessed up front.
 *
 * Non-modal by default (`modal={false}`, matching the primitive's own
 * default): a popover is something you keep looking at what it's
 * anchored to while it's open, not something that should dim or lock the
 * page behind it — `registry/blocks/control-panel.tsx`'s desktop half is
 * exactly this, floating beside the thing it configures.
 *
 * Twin: none. Anchor positioning, portalling, and focus management are
 * not CSS-able — same reasoning `dialog.tsx` and `dropdown-menu.tsx`
 * already document for themselves.
 */

export type PopoverProps = Omit<PopoverPrimitive.Root.Props, 'children'> & {
  children?: React.ReactNode
}
export type PopoverChangeEventDetails = PopoverPrimitive.Root.ChangeEventDetails

export function Popover({ children, ...props }: PopoverProps) {
  return (
    <PopoverPrimitive.Root data-slot="popover" {...props}>
      {children}
    </PopoverPrimitive.Root>
  )
}

export type PopoverTriggerProps = PopoverPrimitive.Trigger.Props

export function PopoverTrigger({ ...props }: PopoverTriggerProps) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

export type PopoverPortalProps = PopoverPrimitive.Portal.Props

export function PopoverPortal({ ...props }: PopoverPortalProps) {
  return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />
}

export type PopoverPositionerProps = PopoverPrimitive.Positioner.Props

export function PopoverPositioner({
  className,
  side = 'bottom',
  align = 'center',
  sideOffset = 8,
  ...props
}: PopoverPositionerProps) {
  return (
    <PopoverPrimitive.Positioner
      data-slot="popover-positioner"
      side={side}
      align={align}
      sideOffset={sideOffset}
      className={cn('z-50', className)}
      {...props}
    />
  )
}

export type PopoverPopupProps = PopoverPrimitive.Popup.Props

export function PopoverPopup({ className, ...props }: PopoverPopupProps) {
  return (
    <PopoverPrimitive.Popup
      data-slot="popover-popup"
      className={cn(
        'w-72 rounded-lg border border-border bg-surface p-4 text-foreground shadow-lg outline-none',
        'origin-[var(--transform-origin)] transition-[translate,scale,opacity] duration-[var(--duration-base)] ease-standard',
        'data-starting-style:translate-y-1 data-starting-style:scale-[0.96] data-starting-style:opacity-0',
        'data-ending-style:translate-y-1 data-ending-style:scale-[0.96] data-ending-style:opacity-0',
        'data-ending-style:duration-[var(--dur-exit,var(--duration-fast))]',
        'motion-reduce:transition-opacity',
        'motion-reduce:data-starting-style:translate-y-0 motion-reduce:data-starting-style:scale-100',
        'motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-ending-style:scale-100',
        className,
      )}
      {...props}
    />
  )
}

export type PopoverTitleProps = PopoverPrimitive.Title.Props

export function PopoverTitle({ className, ...props }: PopoverTitleProps) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn('m-0 text-sm font-semibold text-foreground', className)}
      {...props}
    />
  )
}

export type PopoverDescriptionProps = PopoverPrimitive.Description.Props

export function PopoverDescription({ className, ...props }: PopoverDescriptionProps) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  )
}

export interface PopoverCloseProps extends Omit<ButtonProps, 'asChild'> {
  /** Element substitution, same terms as every other part in this registry. */
  render?: React.ReactElement | undefined
  'data-slot'?: string | undefined
}

export function PopoverClose({
  className,
  children,
  render,
  variant = 'ghost',
  size = 'icon',
  'aria-label': ariaLabel = 'Close',
  'data-slot': dataSlot = 'popover-close',
  ...props
}: PopoverCloseProps) {
  const element = render ?? (
    <Button type="button" variant={variant} size={size} aria-label={ariaLabel} {...props} />
  )
  return (
    <PopoverPrimitive.Close
      data-slot={dataSlot}
      className={cn('text-muted-foreground', className)}
      render={element}
    >
      {children ?? <XIcon className="size-4" />}
    </PopoverPrimitive.Close>
  )
}

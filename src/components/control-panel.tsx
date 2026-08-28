import * as React from 'react'
import { XIcon } from 'lucide-react'

import { cn } from '@/lib/cn'
import { Button, type ButtonProps } from '@/ui/button'
import {
  Drawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerPopup,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
  DrawerViewport,
  type DrawerChangeEventDetails,
  type DrawerPopupProps,
  type DrawerProps,
  type DrawerTitleProps,
} from '@/ui/drawer'
import {
  Popover,
  PopoverClose,
  PopoverPopup,
  PopoverPortal,
  PopoverPositioner,
  PopoverTitle,
  PopoverTrigger,
  type PopoverChangeEventDetails,
} from '@/ui/popover'

/**
 * One panel that reads as a bottom sheet on a phone and a corner
 * inspector on a desktop — the clock panel mock's trigger + scrim +
 * `.config` surface, entering and exiting along the path it came from.
 * Composed on top of this registry's own `drawer.tsx`/`popover.tsx`
 * primitives rather than Base UI directly: the primitives own the
 * behavior and the generic edge/surface mechanics, this block owns the
 * layout opinion (which primitive per breakpoint, the glass surface, the
 * corner trigger) and the field set a consumer actually drops in.
 *
 * Below 48rem the behavior comes from `drawer.tsx`: swipe to dismiss,
 * backdrop, scroll lock, focus trap, Escape, outside press, and the
 * open/closed state itself. Above it, from `popover.tsx`.
 *
 * Popover, not Drawer, for the desktop half: the inspector is anchored to
 * its trigger and deliberately non-modal (the mock renders it
 * `aria-modal="false"` with a transparent scrim, because you keep
 * watching the thing you are tuning while you tune it), and Popover is
 * the primitive that ships anchor positioning and non-modal dismissal —
 * `drawer.tsx`'s edge-anchored sheet has no anchor concept, it is fixed
 * to the viewport's own edge, which is right for the phone sheet and
 * wrong for a corner inspector that has to track its trigger.
 *
 * Which primitive renders is a JavaScript decision, not a style, so it is
 * the one place here a media query is read in JS rather than through a
 * CSS variant. Checked `@base-ui/react/unstable-use-media-query`, which
 * does exactly this: rejected because it is published behind an
 * `unstable-` entry point this registry would then be pinning every
 * consumer to, and its SSR mode resolves by rendering twice, which is the
 * hydration hazard `useSyncExternalStore`'s `getServerSnapshot` avoids
 * outright. `segmented-control.tsx` already established
 * `useSyncExternalStore` as this registry's answer for subscribing to a
 * browser API.
 *
 * The one behaviour this costs: crossing 48rem while the panel is open
 * swaps one primitive for the other, which remounts the panel closed. An
 * uncontrolled panel therefore closes on that resize, and a controlled
 * one reopens from the caller's own state. A single element that restyles
 * across the breakpoint is not available here, since the two halves are
 * different primitives with different behaviour, and a resize across a
 * breakpoint mid-session is not a path worth hand-rolling an overlay for.
 *
 * The trigger is positioned by the consumer, not by this component. The
 * mock pins it to the bottom-right corner of a full-bleed stage; a
 * documentation page or a toolbar wants it somewhere else, and the
 * inspector anchors to wherever it lands either way.
 *
 * Motion is the design's own vocabulary layered on top of each
 * primitive's own default: enter 220ms on desktop scaling out of the
 * trigger's corner (`popover.tsx`'s own default), 340ms on the drawer
 * curve for the sheet (`drawer.tsx`'s own default), 150ms exit on both,
 * 120ms press feedback. `--dur-press`, `--dur-exit` and `--ease-drawer`
 * are theme-iagodahlem extension tokens, each consumed through a `var()`
 * fallback onto the nearest real contract token so the motion still reads
 * correctly under a theme that does not declare them.
 *
 * Twin: none. `registry/styles/components.css` carries the trigger, and
 * the sheet/inspector is skipped there for the same reason Dialog and
 * Dropdown Menu are — the whole component is focus management, scroll
 * locking, portalling and a responsive primitive swap, none of which a
 * stylesheet can provide.
 */

/** The mock's own sheet/inspector breakpoint. */
const DESKTOP_QUERY = '(min-width: 48rem)'

function subscribeToDesktop(onStoreChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(DESKTOP_QUERY)
  query.addEventListener('change', onStoreChange)
  return () => query.removeEventListener('change', onStoreChange)
}

function getDesktopSnapshot(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(DESKTOP_QUERY).matches
}

/**
 * Phone-first on the server, so a server render and its hydration always
 * agree. Only the trigger renders while the panel is closed, and both
 * branches render the same button, so the correction costs nothing
 * visible.
 */
function getServerDesktopSnapshot(): boolean {
  return false
}

interface ControlPanelContextValue {
  desktop: boolean
}

const ControlPanelContext = React.createContext<ControlPanelContextValue>({ desktop: false })

function useControlPanelContext(): ControlPanelContextValue {
  return React.useContext(ControlPanelContext)
}

export type ControlPanelChangeEventDetails = DrawerChangeEventDetails | PopoverChangeEventDetails

export interface ControlPanelProps extends Omit<
  DrawerProps,
  'children' | 'handle' | 'onOpenChange' | 'onSnapPointChange'
> {
  children?: React.ReactNode
  /**
   * Fires on every open and close. The details object is the active
   * primitive's own, so `reason` carries `swipe` on a phone and
   * `triggerHover` on a desktop.
   */
  onOpenChange?: (open: boolean, eventDetails: ControlPanelChangeEventDetails) => void
  onSnapPointChange?: DrawerProps['onSnapPointChange']
}

export function ControlPanel({
  children,
  modal,
  swipeDirection = 'down',
  snapPoints,
  snapPoint,
  defaultSnapPoint,
  onSnapPointChange,
  snapToSequentialPoints,
  disablePointerDismissal,
  ...shared
}: ControlPanelProps) {
  const desktop = React.useSyncExternalStore(
    subscribeToDesktop,
    getDesktopSnapshot,
    getServerDesktopSnapshot,
  )
  const context = React.useMemo<ControlPanelContextValue>(() => ({ desktop }), [desktop])

  return (
    <ControlPanelContext.Provider value={context}>
      {desktop ? (
        // Non-modal by default: the inspector floats beside what it
        // controls and never dims or locks it.
        <Popover modal={modal ?? false} {...shared}>
          {children}
        </Popover>
      ) : (
        <Drawer
          modal={modal ?? true}
          swipeDirection={swipeDirection}
          snapPoints={snapPoints}
          snapPoint={snapPoint}
          defaultSnapPoint={defaultSnapPoint}
          onSnapPointChange={onSnapPointChange}
          snapToSequentialPoints={snapToSequentialPoints}
          disablePointerDismissal={disablePointerDismissal}
          {...shared}
        >
          {children}
        </Drawer>
      )}
    </ControlPanelContext.Provider>
  )
}

/**
 * Glass on both halves, and a solid fill wherever the viewer has asked
 * for less transparency — that is a paint-cost media query, not a token
 * swap, so it is answered per component rather than centrally.
 */
const surfaceClassName = cn(
  'flex flex-col text-foreground shadow-lg outline-none',
  'border border-[var(--border-strong,var(--border))]',
  'bg-[color-mix(in_oklab,var(--surface)_82%,transparent)] backdrop-blur-[22px] backdrop-saturate-[1.7]',
  '[@media(prefers-reduced-transparency:reduce)]:bg-surface [@media(prefers-reduced-transparency:reduce)]:backdrop-filter-none',
)

export interface ControlPanelTriggerProps extends Omit<ButtonProps, 'asChild'> {
  /**
   * Element substitution, the primitive's own mechanism. Replaces the
   * Button this part composes by default, so `variant` and `size` stop
   * applying — pass a fully styled element, or a `<Button>` of your own.
   */
  render?: React.ReactElement | undefined
}

/**
 * The corner button. Composes this registry's own Button so every
 * interaction state it already ships (focus-visible ring, disabled) comes
 * along, restyled into the mock's glass pill, and steps out of the way
 * while the panel it opened is up.
 */
export function ControlPanelTrigger({
  className,
  children,
  render,
  variant = 'outline',
  size = 'default',
  ...props
}: ControlPanelTriggerProps) {
  const { desktop } = useControlPanelContext()

  const triggerClassName = cn(
    'h-11 gap-2 rounded-full px-[0.85rem] text-sm font-medium',
    'border border-[var(--border-strong,var(--border))] text-muted-foreground shadow-lg',
    'bg-[color-mix(in_oklab,var(--surface)_82%,transparent)] backdrop-blur-[22px] backdrop-saturate-150',
    '[@media(prefers-reduced-transparency:reduce)]:bg-surface [@media(prefers-reduced-transparency:reduce)]:backdrop-filter-none',
    'hover:bg-[color-mix(in_oklab,var(--surface)_82%,transparent)] hover:text-foreground hover:border-[var(--text-faint,var(--muted-foreground))]',
    'transition-[color,border-color,opacity,scale] duration-[var(--dur-press,var(--duration-fast))] ease-standard',
    'active:scale-[0.95]',
    'data-popup-open:pointer-events-none data-popup-open:scale-90 data-popup-open:opacity-0',
    'motion-reduce:transition-[color,border-color,opacity] motion-reduce:active:scale-100 motion-reduce:data-popup-open:scale-100',
    className,
  )
  const element = render ?? <Button type="button" variant={variant} size={size} {...props} />

  return desktop ? (
    <PopoverTrigger data-slot="control-panel-trigger" className={triggerClassName} render={element}>
      {children}
    </PopoverTrigger>
  ) : (
    <DrawerTrigger data-slot="control-panel-trigger" className={triggerClassName} render={element}>
      {children}
    </DrawerTrigger>
  )
}

/**
 * Base UI lets `className`, `style` and `render` each take a function of
 * the rendering part's own state. This one part has two primitives with
 * two different state shapes, so it takes the plain forms only — a
 * state-driven className here would have to be written twice, once per
 * primitive, which is a component the caller should write instead. The
 * data attributes both primitives publish (`data-open`, `data-swiping`,
 * `data-starting-style`) cover the same ground from CSS.
 */
export interface ControlPanelContentProps extends Omit<
  DrawerPopupProps,
  'className' | 'render' | 'style'
> {
  className?: string | undefined
  style?: React.CSSProperties | undefined
  render?: React.ReactElement | undefined
}

/**
 * The surface itself, portalled and positioned. On a phone: a full-width
 * sheet on the bottom edge behind a scrim, entering from that edge —
 * `drawer.tsx`'s own bottom-edge default. On a desktop: a card in the
 * trigger's own corner, scaling out of it, with no scrim at all —
 * `popover.tsx`'s own default surface, restyled onto the glass treatment
 * here.
 *
 * The desktop placement is `side="top"` with a negative side offset of
 * exactly the anchor's height, which lands the card's bottom edge flush
 * with the trigger's — the card takes the corner the trigger was sitting
 * in, which is what the mock does with a matching pair of fixed insets.
 * Alignment may shift to stay on screen; the side never flips, because
 * "grows out of that corner" stops being true the moment it does.
 */
export function ControlPanelContent({ className, children, ...props }: ControlPanelContentProps) {
  const { desktop } = useControlPanelContext()

  if (desktop) {
    return (
      <PopoverPortal>
        <PopoverPositioner
          data-slot="control-panel-positioner"
          side="top"
          align="end"
          sideOffset={({ anchor }) => -anchor.height}
          collisionAvoidance={{ side: 'none', align: 'shift' }}
          className="z-50"
        >
          <PopoverPopup
            data-slot="control-panel-content"
            // p-0 clears popover.tsx's own default padding: Header/Body/Footer
            // below own their own edge-to-edge spacing, the footer's
            // border-t needs to span the full width. translate-y-2
            // overrides the primitive's smaller default entrance offset to
            // match this panel's own motion spec.
            className={cn(
              surfaceClassName,
              'w-96 max-h-[min(80svh,42rem)] rounded-lg p-0',
              'data-starting-style:translate-y-2 data-ending-style:translate-y-2',
              className,
            )}
            {...props}
          >
            {children}
          </PopoverPopup>
        </PopoverPositioner>
      </PopoverPortal>
    )
  }

  return (
    <DrawerPortal>
      {/*
        Scrim on the phone only, and never a literal black: this contract
        names no overlay ink, so the veil recedes toward the page's own
        base colour, which dims in a dark theme and hazes in a light one.
        A hard-coded black would only be right in one of the two.
      */}
      <DrawerBackdrop data-slot="control-panel-scrim" />
      <DrawerViewport data-slot="control-panel-viewport">
        <DrawerPopup
          data-slot="control-panel-content"
          // max-h overrides drawer.tsx's own generic 85svh default down to
          // the mock's own sheet proportions.
          className={cn(surfaceClassName, 'max-h-[72svh] border-x-0 border-b-0', className)}
          {...props}
        >
          <span
            aria-hidden="true"
            data-slot="control-panel-grip"
            className="mt-3 h-1 w-9 flex-none self-center rounded-full bg-[var(--border-strong,var(--border))]"
          />
          <DrawerContent data-slot="control-panel-body-wrapper">{children}</DrawerContent>
        </DrawerPopup>
      </DrawerViewport>
    </DrawerPortal>
  )
}

export function ControlPanelHeader({ className, ...props }: React.ComponentProps<'header'>) {
  return (
    <header
      data-slot="control-panel-header"
      className={cn('flex flex-none items-center justify-between gap-4 px-5 pt-4 pb-3', className)}
      {...props}
    />
  )
}

export type ControlPanelTitleProps = DrawerTitleProps

/**
 * Names the panel for assistive technology. Both primitives wire their
 * own popup's `aria-labelledby` to whatever this renders, which is why it
 * is a part rather than a plain heading the caller writes.
 */
export function ControlPanelTitle({ className, ...props }: ControlPanelTitleProps) {
  const { desktop } = useControlPanelContext()
  const titleClassName = cn(
    'm-0 font-mono text-[0.6875rem] font-medium tracking-[0.09em] uppercase',
    'text-[var(--text-faint,var(--muted-foreground))]',
    className,
  )

  return desktop ? (
    <PopoverTitle data-slot="control-panel-title" className={titleClassName} {...props} />
  ) : (
    <DrawerTitle data-slot="control-panel-title" className={titleClassName} {...props} />
  )
}

/** The scrolling middle. Scroll chaining is contained so a flick inside never drags the page behind it. */
export function ControlPanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="control-panel-body"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-5',
        className,
      )}
      {...props}
    />
  )
}

/** Docked, never scrolled away: it is the output of every control above it. */
export function ControlPanelFooter({ className, ...props }: React.ComponentProps<'footer'>) {
  return (
    <footer
      data-slot="control-panel-footer"
      className={cn(
        'flex-none border-t border-border px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]',
        'bg-[color-mix(in_oklab,var(--surface)_60%,transparent)]',
        className,
      )}
      {...props}
    />
  )
}

export interface ControlPanelCloseProps extends Omit<ButtonProps, 'asChild'> {
  /** Element substitution, same terms as the trigger's. */
  render?: React.ReactElement | undefined
}

export function ControlPanelClose({
  className,
  children,
  render,
  variant = 'ghost',
  size = 'icon',
  'aria-label': ariaLabel = 'Close',
  ...props
}: ControlPanelCloseProps) {
  const { desktop } = useControlPanelContext()

  const closeClassName = cn(
    'size-[1.9rem] rounded-full text-[var(--text-faint,var(--muted-foreground))]',
    'hover:bg-surface-2 hover:text-foreground',
    'transition-[color,background-color,scale] duration-[var(--dur-press,var(--duration-fast))] ease-standard',
    'active:scale-[0.92] motion-reduce:active:scale-100 motion-reduce:transition-[color,background-color]',
    className,
  )
  const element = render ?? (
    <Button type="button" variant={variant} size={size} aria-label={ariaLabel} {...props} />
  )
  const content = children ?? <XIcon className="size-[0.95rem]" />

  return desktop ? (
    <PopoverClose data-slot="control-panel-close" className={closeClassName} render={element}>
      {content}
    </PopoverClose>
  ) : (
    <DrawerClose data-slot="control-panel-close" className={closeClassName} render={element}>
      {content}
    </DrawerClose>
  )
}

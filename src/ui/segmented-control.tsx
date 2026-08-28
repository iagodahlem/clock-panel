import * as React from 'react'
import { Radio } from '@base-ui/react/radio'
import { RadioGroup } from '@base-ui/react/radio-group'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/cn'

/**
 * A single-selection segmented control: Base UI's Radio Group for the
 * behavior, one house-built sliding indicator for the visual.
 *
 * Base UI owns roving focus and arrow-key navigation (Home/End stay off,
 * matching a native radio group), `role="radiogroup"` + `role="radio"` +
 * `aria-checked`, disabled and read-only handling, controlled and
 * uncontrolled value, and the hidden inputs that let the group submit
 * inside a form. None of that is re-implemented here.
 *
 * House-built: the indicator that slides between items instead of each
 * item repainting its own background. Checked `Tabs.Indicator`, which
 * ships this measurement already: rejected because tab semantics
 * (tablist/tab, and the panels tabs expect to control) are wrong for a
 * group with no panels, and one mutually exclusive choice is the radio
 * group pattern. So the indicator is all that is left to build: two
 * custom properties on the root, written from the checked item's own
 * layout box.
 *
 * Twin: `registry/styles/components.css` has a plain-CSS version on
 * native `<input type="radio">` elements, with an instant background swap
 * instead of a slide.
 */

/** Matches the track's own `p-[3px]`, which the indicator is offset from. */
const INDICATOR_INSET_PX = 3

/**
 * `useLayoutEffect` on the client so the first measurement lands before
 * paint, `useEffect` on the server, where React warns about a layout
 * effect that can never run.
 */
const useIsomorphicLayoutEffect =
  typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect

// duration-160 mirrors --duration-fast (160ms) as a literal: Tailwind v4's
// transition-duration utility is a purely numeric functional utility that
// never consults a --duration-* theme key (see registry/styles/tailwind.css's
// own comment), so every call site in this registry matches the token's
// current value by number instead. The indicator below needs the token's
// live value, so it spells out var(--duration-base) as an arbitrary value.
const segmentedControlItemVariants = cva(
  'relative z-[1] inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full font-medium whitespace-nowrap text-[var(--text-faint,var(--muted-foreground))] outline-none transition-[color,transform] duration-160 ease-standard select-none active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring/50 data-checked:text-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
  {
    variants: {
      size: {
        sm: 'px-2.5 py-1 text-[0.6875rem]',
        md: 'px-3.5 py-1.5 text-xs',
      },
    },
    defaultVariants: {
      size: 'md',
    },
  },
)

type SegmentedControlSize = NonNullable<VariantProps<typeof segmentedControlItemVariants>['size']>

interface SegmentedControlContextValue {
  size: SegmentedControlSize
  fullWidth: boolean
}

/** Carries the root's layout choices down to items, the way shadcn's own multi-part components do. */
const SegmentedControlContext = React.createContext<SegmentedControlContextValue>({
  size: 'md',
  fullWidth: false,
})

export interface SegmentedControlProps<Value = string> extends RadioGroup.Props<Value> {
  /** Item padding and type scale. Overridable per item. */
  size?: SegmentedControlSize
  /** Equal-width columns filling the container, instead of hugging each label's own width. */
  fullWidth?: boolean
}

export function SegmentedControl<Value = string>({
  className,
  children,
  size = 'md',
  fullWidth = false,
  value,
  onValueChange,
  ...props
}: SegmentedControlProps<Value>) {
  const rootRef = React.useRef<HTMLDivElement>(null)
  const [selectionTick, setSelectionTick] = React.useState(0)

  // The selection lives in Base UI, controlled or not, so the indicator
  // reads the resolved value back out of the DOM instead of keeping a
  // second copy of it in React state.
  const measure = React.useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const checked = root.querySelector<HTMLElement>(
      '[data-slot="segmented-control-item"][data-checked]',
    )
    if (!checked) {
      root.style.removeProperty('--segmented-indicator-x')
      root.style.removeProperty('--segmented-indicator-w')
      return
    }
    root.style.setProperty(
      '--segmented-indicator-x',
      `${checked.offsetLeft - INDICATOR_INSET_PX}px`,
    )
    root.style.setProperty('--segmented-indicator-w', `${checked.offsetWidth}px`)
  }, [])

  // Syncs with layout, not with state: `value` re-runs it for a controlled
  // group, `selectionTick` for an uncontrolled one, where the selection
  // changes inside Base UI and this component would otherwise not re-render.
  useIsomorphicLayoutEffect(() => {
    measure()
  }, [measure, value, selectionTick])

  // Syncs with the track's own box: a responsive width change or a label
  // that wraps differently moves the checked item without any React update.
  React.useEffect(() => {
    const root = rootRef.current
    if (!root || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    return () => observer.disconnect()
  }, [measure])

  const context = React.useMemo(() => ({ size, fullWidth }), [size, fullWidth])

  return (
    <SegmentedControlContext.Provider value={context}>
      <RadioGroup
        ref={rootRef}
        data-slot="segmented-control"
        value={value}
        onValueChange={(next: Value, eventDetails) => {
          setSelectionTick((tick) => tick + 1)
          onValueChange?.(next, eventDetails)
        }}
        className={cn(
          'relative isolate flex items-stretch gap-0.5 rounded-full border border-border bg-surface-2 p-[3px]',
          fullWidth ? 'w-full' : 'inline-flex',
          className,
        )}
        {...props}
      >
        <span
          aria-hidden="true"
          data-slot="segmented-control-indicator"
          className="pointer-events-none absolute top-[3px] left-[3px] z-0 h-[calc(100%-6px)] rounded-full border border-[var(--border-strong,var(--border))] bg-surface transition-[transform,width] duration-[var(--duration-base)] ease-standard motion-reduce:transition-none"
          style={{
            width: 'var(--segmented-indicator-w, 0px)',
            transform: 'translateX(var(--segmented-indicator-x, 0px))',
          }}
        />
        {children}
      </RadioGroup>
    </SegmentedControlContext.Provider>
  )
}

export interface SegmentedControlItemProps<Value = string>
  extends Radio.Root.Props<Value>, VariantProps<typeof segmentedControlItemVariants> {}

export function SegmentedControlItem<Value = string>({
  className,
  size,
  ...props
}: SegmentedControlItemProps<Value>) {
  const context = React.useContext(SegmentedControlContext)
  return (
    <Radio.Root
      data-slot="segmented-control-item"
      className={cn(
        segmentedControlItemVariants({ size: size ?? context.size }),
        context.fullWidth && 'flex-1',
        className,
      )}
      {...props}
    />
  )
}

/** A trailing count inside an item's own children, e.g. `<SegmentedControlItem value="live">Live <SegmentedControlCount>3</SegmentedControlCount></SegmentedControlItem>`. */
export function SegmentedControlCount({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="segmented-control-count"
      className={cn('font-mono text-[0.625rem] tabular-nums opacity-70', className)}
      {...props}
    />
  )
}

export { segmentedControlItemVariants }

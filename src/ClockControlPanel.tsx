// The clock's real parameter surface, adopted from @ui/control-panel
// (registry/blocks/control-panel.demo.tsx is the structural reference this
// mirrors) and wired to the running controller instead of a stand-in
// state object. Every field below drives one of controller.ts's own public
// methods (setTime/transitionTo/playIdle/setIdleConfig) -- nothing here
// re-implements what the controller already owns.
//
// Two of the params the controller only reads at construction time (see
// PanelControllerOptions in controller.ts): lightForce has no live setter
// at all, and there is no way back to the live clock once setTime has
// pinned the panel to a fixed time (liveClock only ever goes true -> false
// -- see runTransition/setTime). Both cases update the shareable URL and
// say a reload is needed instead of pretending the change already applied.

import { useEffect, useState, type RefObject } from 'react'
import { SlidersHorizontalIcon } from 'lucide-react'

import {
  ControlPanel,
  ControlPanelBody,
  ControlPanelClose,
  ControlPanelContent,
  ControlPanelFooter,
  ControlPanelHeader,
  ControlPanelTitle,
  ControlPanelTrigger,
} from './components/control-panel'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { CopyButton } from './ui/copy-button'
import { SegmentedControl, SegmentedControlItem } from './ui/segmented-control'
import { StatusDot } from './ui/status-dot'
import { TimeField } from './ui/time-field'
import { useChromeVisibility } from './useChromeVisibility'
import { defaultIdleConfig, type IdleConfig, type IdlePattern } from './idle'
import { formatHHMM, parseHHMM, type DigitTuple, type PanelController } from './controller'

type TimeSource = 'live' | 'fixed'
type IdleSelection = 'auto' | IdlePattern

export interface ClockControlPanelProps {
  readonly controllerRef: RefObject<PanelController | null>
  /** Flips true once PanelCanvas has actually assigned controllerRef.current -- see PanelCanvas.tsx's own comment on why this exists (child effects run before the parent's, so the ref isn't there yet on first mount). */
  readonly controllerReady: boolean
  readonly initialTime: DigitTuple | null
  readonly initialTo: DigitTuple | null
  readonly initialIdle: IdlePattern | null
  readonly initialLightForce: boolean
}

function currentTimeString(): string {
  const now = new Date()
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

function digitsToTimeString(digits: DigitTuple): string {
  const hhmm = formatHHMM(digits)
  return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`
}

/** Default "transition to" target: one minute after `time`, wrapping past 23:59. Only ever a starting point -- the field is freely editable. */
function addOneMinute(time: string): string {
  const digits = parseHHMM(time)
  if (digits === null) return time
  const [h0, h1, m0, m1] = digits
  const totalMinutes = ((h0 * 10 + h1) * 60 + (m0 * 10 + m1) + 1 + 24 * 60) % (24 * 60)
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
  const mm = String(totalMinutes % 60).padStart(2, '0')
  return `${hh}:${mm}`
}

function idleConfigFor(selection: IdleSelection): IdleConfig {
  return selection === 'auto' ? defaultIdleConfig : { ...defaultIdleConfig, patterns: [selection] }
}

/** The URL that reproduces the panel's current state through the same ?time=/?to=/?idle=/?light= params PanelCanvas reads on load -- the footer's shareable link, and also where "reload to apply" points for the two params above with no live path. */
function buildShareUrl(params: {
  time: string | null
  to: string | null
  idle: IdleSelection
  lightForce: boolean
}): string {
  const url = new URL(window.location.href)
  url.search = ''
  if (params.time !== null) url.searchParams.set('time', params.time)
  if (params.time !== null && params.to !== null) url.searchParams.set('to', params.to)
  if (params.idle !== 'auto') url.searchParams.set('idle', params.idle)
  if (params.lightForce) url.searchParams.set('light', 'force')
  return url.toString()
}

export function ClockControlPanel({
  controllerRef,
  controllerReady,
  initialTime,
  initialTo,
  initialIdle,
  initialLightForce,
}: ClockControlPanelProps) {
  const [source, setSource] = useState<TimeSource>(initialTime !== null ? 'fixed' : 'live')
  const [time, setTime] = useState(
    initialTime !== null ? digitsToTimeString(initialTime) : currentTimeString(),
  )
  const [timeValid, setTimeValid] = useState(true)
  const [to, setTo] = useState(
    initialTo !== null ? digitsToTimeString(initialTo) : addOneMinute(time),
  )
  const [toValid, setToValid] = useState(true)
  const [idle, setIdle] = useState<IdleSelection>(initialIdle ?? 'auto')
  const [lightForce, setLightForce] = useState(initialLightForce)
  // There is no live path back to the running live clock once the
  // controller has been pinned to a fixed time (see the file header) --
  // this tracks whether that has happened yet this session, so picking
  // "Live" again can be told apart from having never left it.
  const [pinned, setPinned] = useState(initialTime !== null)
  const [activeIdlePattern, setActiveIdlePattern] = useState<IdlePattern | null>(null)

  const { shown, onFocus, onBlur } = useChromeVisibility()

  useEffect(() => {
    const controller = controllerRef.current
    if (!controller) return
    const offStart = controller.on('idle:start', (pattern) => setActiveIdlePattern(pattern))
    const offEnd = controller.on('idle:end', () => setActiveIdlePattern(null))
    return () => {
      offStart()
      offEnd()
    }
  }, [controllerRef, controllerReady])

  function applyFixedTime(next: string, valid: boolean): void {
    if (!valid) return
    controllerRef.current?.setTime(next)
    setPinned(true)
  }

  function handleSourceChange(next: TimeSource): void {
    setSource(next)
    if (next === 'fixed') applyFixedTime(time, timeValid)
    // Selecting "live" leaves the controller exactly as it is -- see the
    // `pinned` comment above. The reload notice below is the actual way
    // back to the live clock.
  }

  function handleTimeChange(next: string, valid: boolean): void {
    setTime(next)
    setTimeValid(valid)
    if (source === 'fixed') applyFixedTime(next, valid)
  }

  function handlePlayTransition(): void {
    if (source !== 'fixed' || !toValid) return
    controllerRef.current?.transitionTo(to)
  }

  function handleIdleChange(next: IdleSelection): void {
    setIdle(next)
    controllerRef.current?.setIdleConfig(idleConfigFor(next))
  }

  function handlePlayIdle(): void {
    if (idle === 'auto') return
    controllerRef.current?.playIdle(idle)
  }

  const returningToLive = source === 'live' && pinned
  const needsReload = returningToLive || lightForce !== initialLightForce
  const shareUrl = buildShareUrl({
    time: source === 'fixed' ? time : null,
    to: source === 'fixed' ? to : null,
    idle,
    lightForce,
  })

  return (
    <ControlPanel>
      <div
        // right-17 clears the fullscreen button's own right-4/size-11 box
        // (see FullscreenButton.tsx) with the same 0.5rem gap between the
        // two pieces of chrome this app already had before that button
        // grew to match this trigger's height.
        className="fixed right-17 bottom-4 z-40 transition-opacity duration-300"
        style={{ opacity: shown ? 1 : 0, pointerEvents: shown ? 'auto' : 'none' }}
      >
        <ControlPanelTrigger onFocus={onFocus} onBlur={onBlur}>
          <SlidersHorizontalIcon />
          Controls
        </ControlPanelTrigger>
      </div>

      <ControlPanelContent>
        <ControlPanelHeader>
          <ControlPanelTitle>Panel controls</ControlPanelTitle>
          <ControlPanelClose aria-label="Close controls" />
        </ControlPanelHeader>

        <ControlPanelBody>
          <Field
            label="Time"
            param="time"
            hint={
              source === 'fixed'
                ? 'Any four digits render, including times that do not exist.'
                : 'Follows the clock and ticks with the minute.'
            }
          >
            <SegmentedControl
              aria-label="Time source"
              fullWidth
              value={source}
              onValueChange={handleSourceChange}
            >
              <SegmentedControlItem value="live">Live</SegmentedControlItem>
              <SegmentedControlItem value="fixed">Fixed</SegmentedControlItem>
            </SegmentedControl>
            {source === 'fixed' ? (
              <TimeField
                value={time}
                onValueChange={handleTimeChange}
                aria-label="Fixed time, four digits"
              />
            ) : null}
          </Field>

          <Divider />

          <Field
            label="Transition to"
            param="to"
            disabled={source !== 'fixed'}
            hint="Needs a fixed time to transition from. In the panel itself any key or click swaps between the two."
          >
            <div className="flex items-center gap-2">
              <TimeField
                value={to}
                onValueChange={(next, valid) => {
                  setTo(next)
                  setToValid(valid)
                }}
                aria-label="Transition target time, four digits"
                disabled={source !== 'fixed'}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={source !== 'fixed'}
                onClick={handlePlayTransition}
              >
                Play
              </Button>
            </div>
          </Field>

          <Divider />

          <Field
            label="Idle pattern"
            param="idle"
            hint={
              idle === 'auto'
                ? 'Auto picks from all three on its own schedule. Naming one pins it and plays it on demand.'
                : `Pinned to ${idle}. Plays on demand and on its own schedule.`
            }
          >
            <SegmentedControl
              aria-label="Idle pattern"
              fullWidth
              size="sm"
              value={idle}
              onValueChange={handleIdleChange}
            >
              <SegmentedControlItem value="auto">Auto</SegmentedControlItem>
              <SegmentedControlItem value="wave">Wave</SegmentedControlItem>
              <SegmentedControlItem value="breathe">Breathe</SegmentedControlItem>
              <SegmentedControlItem value="cascade">Cascade</SegmentedControlItem>
            </SegmentedControl>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={idle === 'auto'}
              onClick={handlePlayIdle}
            >
              Play pattern once
            </Button>
          </Field>

          <Divider />

          <Field
            label="Light force"
            param="light"
            hint={
              lightForce
                ? 'Bypasses Reduce Motion for the pointer light only; every other reduced-motion behavior stays off.'
                : 'With Reduce Motion on, the pointer light stays off along with everything else.'
            }
          >
            <SegmentedControl
              aria-label="Light force"
              fullWidth
              value={lightForce ? 'forced' : 'off'}
              onValueChange={(next) => setLightForce(next === 'forced')}
            >
              <SegmentedControlItem value="off">Off</SegmentedControlItem>
              <SegmentedControlItem value="forced">Forced</SegmentedControlItem>
            </SegmentedControl>
          </Field>

          <Divider />

          <div className="flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
            <StatusDot
              variant={activeIdlePattern !== null ? 'live' : 'idle'}
              className="mt-[0.45em]"
            />
            <span>
              {activeIdlePattern !== null
                ? `Playing ${activeIdlePattern} now.`
                : source === 'fixed'
                  ? `Pinned at ${time}.`
                  : 'Live, ticking with the minute.'}
            </span>
          </div>

          {needsReload ? (
            <div className="flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3 text-xs leading-relaxed text-muted-foreground">
              <StatusDot variant="idle" className="mt-[0.45em]" />
              <span>
                {returningToLive ? 'Returning to the live clock' : 'The light force change'} needs a
                reload to take effect --{' '}
                <a href={shareUrl} className="text-foreground underline underline-offset-2">
                  reload now
                </a>
                .
              </span>
            </div>
          ) : null}
        </ControlPanelBody>

        <ControlPanelFooter>
          <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[0.6875rem] tracking-[0.09em] uppercase text-[var(--text-faint,var(--muted-foreground))]">
                Shareable URL
              </span>
              <CopyButton value={shareUrl} variant="outline" size="sm" />
            </div>
            <p className="m-0 font-mono text-xs leading-relaxed break-all text-foreground">
              {shareUrl}
            </p>
          </div>
        </ControlPanelFooter>
      </ControlPanelContent>
    </ControlPanel>
  )
}

function Field({
  label,
  param,
  hint,
  disabled = false,
  children,
}: {
  label: string
  param?: string
  hint?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={disabled ? 'flex flex-col gap-2 opacity-45' : 'flex flex-col gap-2'}>
      <span className="flex items-baseline gap-2 text-[0.8125rem] font-medium text-foreground">
        {label}
        {param ? <Badge variant="param">{param}</Badge> : null}
      </span>
      {children}
      {hint ? (
        <p className="m-0 text-xs leading-relaxed text-[var(--text-faint,var(--muted-foreground))]">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

function Divider() {
  return <div aria-hidden="true" className="h-px bg-border" />
}

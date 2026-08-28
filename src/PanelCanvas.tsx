// The entire React surface for now: mounts the canvas and creates the
// imperative controller in an effect (see controller.ts for why the render
// loop lives outside React entirely). URL params are read exactly once,
// into initial state, and handed to the controller at construction time --
// React never re-reads them and never reads the controller's live state
// back out during render. The any-key/click QA transition trigger is a
// plain handler registered alongside the controller, reading only the
// once-read initial params and the controller instance itself, so there is
// nothing here that can go stale the way an effect closing over changing
// state could.

import { useEffect, useRef, useState } from 'react'
import {
  createPanelController,
  formatHHMM,
  parseHHMM,
  type DigitTuple,
  type PanelController,
} from './controller'
import type { ClockHandAngles } from './clock'
import type { IdlePattern } from './idle'
import { FullscreenButton } from './FullscreenButton'
import { ClockControlPanel } from './ClockControlPanel'

interface InitialParams {
  readonly timeOverride: DigitTuple | null
  readonly toOverride: DigitTuple | null
  readonly idleOverride: IdlePattern | null
  readonly lightForce: boolean
  readonly handsOverride: ClockHandAngles | null
}

function parseIdleParam(raw: string | null): IdlePattern | null {
  return raw === 'wave' || raw === 'breathe' || raw === 'cascade' ? raw : null
}

/**
 * Parses `?hands=<hourDegrees>,<minuteDegrees>` into clock-convention
 * radians (0 = 12 o'clock, positive clockwise) -- e.g. `270,180` pins the
 * hour hand to 9 o'clock and the minute hand to 6 o'clock. Dev/demo tool
 * and the binding way to verify hand geometry against a static reference:
 * every clock on the panel snaps to this exact pose and holds it, instead
 * of the live clock or any choreography, so a single well can be
 * screenshotted at a known angle. Returns null for anything else.
 */
function parseHandsParam(raw: string | null): ClockHandAngles | null {
  if (raw === null) return null
  const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(raw)
  if (match === null) return null
  const [, hourDegrees, minuteDegrees] = match
  return {
    hourAngle: (Number(hourDegrees) * Math.PI) / 180,
    minuteAngle: (Number(minuteDegrees) * Math.PI) / 180,
  }
}

/**
 * Reads ?time=/?to=/?idle=/?light=/?hands= once. Matches main.ts's original
 * query contract exactly: ?to= only takes effect when ?time= is also
 * present and valid.
 */
function readInitialParams(search: string): InitialParams {
  const params = new URLSearchParams(search)
  const timeRaw = params.get('time')
  const timeOverride = timeRaw !== null ? parseHHMM(timeRaw) : null
  const toRaw = params.get('to')
  const toOverride = timeOverride !== null && toRaw !== null ? parseHHMM(toRaw) : null
  const idleOverride = parseIdleParam(params.get('idle'))
  const lightForce = params.get('light') === 'force'
  const handsOverride = parseHandsParam(params.get('hands'))
  return { timeOverride, toOverride, idleOverride, lightForce, handsOverride }
}

export function PanelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  // The control panel drives the controller imperatively too (setTime,
  // transitionTo, ...), same as the QA trigger below -- a ref, not state,
  // so wiring it up never re-renders or re-creates the loop. `controllerReady`
  // exists only so ClockControlPanel's own effect (subscribing to idle
  // events) knows when the ref has actually been assigned: child effects
  // run before their parent's in the same commit, so on first mount
  // controllerRef.current is still null when ClockControlPanel's effect
  // first runs -- this state flip is what gives it a second chance.
  const controllerRef = useRef<PanelController | null>(null)
  const [controllerReady, setControllerReady] = useState(false)
  const [initial] = useState(() => readInitialParams(window.location.search))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const controller = createPanelController(canvas, {
      initialDigits: initial.timeOverride ?? undefined,
      lightForce: initial.lightForce,
      handsForce: initial.handsOverride,
    })
    controllerRef.current = controller
    setControllerReady(true)

    // QA affordance: with both ?time= and ?to= set, any key press or click
    // transitions the panel between the two, toggling back and forth, so
    // the choreography can be watched on demand instead of waiting for a
    // real minute to roll over -- same contract main.ts's own listener had.
    let showingTarget = false
    const triggerToTransition = (): void => {
      if (initial.timeOverride === null || initial.toOverride === null) return
      showingTarget = !showingTarget
      controller.transitionTo(formatHHMM(showingTarget ? initial.toOverride : initial.timeOverride))
    }

    // QA affordance: ?idle=wave|breathe|cascade plays that pattern once on
    // demand instead of waiting out the randomized interval.
    const triggerIdle = (): void => {
      if (initial.idleOverride === null) return
      controller.playIdle(initial.idleOverride)
    }

    const handleTrigger = (): void => {
      triggerToTransition()
      triggerIdle()
    }

    window.addEventListener('keydown', handleTrigger)
    window.addEventListener('click', handleTrigger)

    controller.start()

    return () => {
      window.removeEventListener('keydown', handleTrigger)
      window.removeEventListener('click', handleTrigger)
      controllerRef.current = null
      controller.destroy()
    }
    // Mount-only: `initial` is read once via useState's lazy initializer
    // and never changes for the lifetime of this component, so there is no
    // changing prop this effect could close over stale.
  }, [])

  return (
    <div ref={containerRef} className="panel-container">
      <canvas ref={canvasRef} />
      <ClockControlPanel
        controllerRef={controllerRef}
        controllerReady={controllerReady}
        initialTime={initial.timeOverride}
        initialTo={initial.toOverride}
        initialIdle={initial.idleOverride}
        initialLightForce={initial.lightForce}
      />
      <FullscreenButton containerRef={containerRef} />
    </div>
  )
}

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
import { createPanelController, formatHHMM, parseHHMM, type DigitTuple } from './controller'
import type { IdlePattern } from './idle'

interface InitialParams {
  readonly timeOverride: DigitTuple | null
  readonly toOverride: DigitTuple | null
  readonly idleOverride: IdlePattern | null
  readonly lightForce: boolean
}

function parseIdleParam(raw: string | null): IdlePattern | null {
  return raw === 'wave' || raw === 'breathe' || raw === 'cascade' ? raw : null
}

/**
 * Reads ?time=/?to=/?idle=/?light= once. Matches main.ts's original query
 * contract exactly: ?to= only takes effect when ?time= is also present and
 * valid.
 */
function readInitialParams(search: string): InitialParams {
  const params = new URLSearchParams(search)
  const timeRaw = params.get('time')
  const timeOverride = timeRaw !== null ? parseHHMM(timeRaw) : null
  const toRaw = params.get('to')
  const toOverride = timeOverride !== null && toRaw !== null ? parseHHMM(toRaw) : null
  const idleOverride = parseIdleParam(params.get('idle'))
  const lightForce = params.get('light') === 'force'
  return { timeOverride, toOverride, idleOverride, lightForce }
}

export function PanelCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [initial] = useState(() => readInitialParams(window.location.search))

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const controller = createPanelController(canvas, {
      initialDigits: initial.timeOverride ?? undefined,
      lightForce: initial.lightForce,
    })

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
      controller.destroy()
    }
    // Mount-only: `initial` is read once via useState's lazy initializer
    // and never changes for the lifetime of this component, so there is no
    // changing prop this effect could close over stale.
  }, [])

  return <canvas ref={canvasRef} />
}

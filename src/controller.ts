// The imperative rendering engine: owns the canvas, the requestAnimationFrame
// loop, the spring-driven hand angles, the minute-change and idle
// choreography, and every direct browser API this needs (resize, reduced
// motion, the live-clock poll). None of this reads or writes React state and
// none of it re-renders anything -- createPanelController hands back a small
// imperative controller (setTime/transitionTo/playIdle/...) that a caller
// drives from the outside, the same way the original main.ts drove the
// canvas at module scope, just wrapped so more than one thing can own it and
// so it can be torn down cleanly. Keeping the loop out of React's render
// cycle entirely is deliberate: it is what avoids a stale-closure effect or
// a ref read during render ever reaching into a running animation.

import {
  drawPanel,
  computePanelFit,
  flatPanelCenters,
  panelDiagonal,
  lightAngleToward,
  type ClockLight,
  type PanelPointer,
  type PanelPose,
} from './panel'
import { digitPose, type Digit, type DigitPose } from './font'
import { RotationSpring, type SpringConfig } from './animate'
import { defaultClockStyle, type ClockHandAngles } from './clock'
import {
  planDigitTransition,
  defaultChoreography,
  TransitionScheduler,
  type ClockStep,
  type DigitStep,
  type ScheduledHand,
} from './choreography'
import {
  IdleChoreographer,
  defaultIdleConfig,
  type IdleClock,
  type IdleConfig,
  type IdlePattern,
} from './idle'

/** A time as 4 raw digits, HH:MM. See parseHHMM -- this does not imply the value is a valid clock time. */
export type DigitTuple = readonly [number, number, number, number]

const CHAR_CODE_ZERO = '0'.charCodeAt(0)

const CLOCKS_PER_PANEL = 24 // 4 digits * 6 clocks

/** Critically damped and quicker than the hands' own default response -- the light should feel like it has real mass without ever feeling sluggish, per the panel's restrained, physical motion language. */
const lightSpring: SpringConfig = { dampingRatio: 1, response: 0.28 }

/** Inside this many well radii of a clock's own center, the pointer light is at its closest -- full intensity. */
const LIGHT_NEAR_RADIUS_IN_WELL_RADII = 1.5
/** Beyond this fraction of the panel's own diagonal, the pointer light has faded all the way back to the resting look. */
const LIGHT_FAR_RADIUS_PANEL_DIAGONAL_FRACTION = 0.5

/** Cubic Hermite smoothstep, 0 at or before edge0, 1 at or past edge1, clamped between. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function assertDigit(value: number): Digit {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error(`invalid digit: ${value}`)
  }
  return value as Digit
}

/**
 * Parses an `HHMM` or `HH:MM` string into 4 raw digits. Pure and
 * non-throwing -- returns null for anything that is not exactly 4 digits
 * once an optional colon is stripped. Deliberately does not validate the
 * result as a real time (`89:06` parses fine): this is shared by the
 * ?time=/?to= URL override reader and the controller's own setTime/
 * transitionTo, both of which exist for reviewing the digit font and the
 * choreography, not only for displaying the real clock.
 */
export function parseHHMM(raw: string): DigitTuple | null {
  const digitsOnly = raw.replace(/:/g, '')
  if (!/^\d{4}$/.test(digitsOnly)) return null
  return [
    digitsOnly.charCodeAt(0) - CHAR_CODE_ZERO,
    digitsOnly.charCodeAt(1) - CHAR_CODE_ZERO,
    digitsOnly.charCodeAt(2) - CHAR_CODE_ZERO,
    digitsOnly.charCodeAt(3) - CHAR_CODE_ZERO,
  ]
}

/** Inverse of parseHHMM -- formats 4 digits back into a plain HHMM string. */
export function formatHHMM(digits: DigitTuple): string {
  return digits.join('')
}

function requireDigits(raw: string): DigitTuple {
  const parsed = parseHHMM(raw)
  if (parsed === null) {
    throw new Error(`invalid time "${raw}": expected 4 digits, HHMM or HH:MM`)
  }
  return parsed
}

/** The current local time as 4 digits, 24-hour HH:MM. */
function liveTimeDigits(now: Date): DigitTuple {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return requireDigits(`${hh}${mm}`)
}

// --- Spring state: 2 hands per clock, 6 clocks per digit, 4 digits. ---

interface ClockSprings {
  readonly hour: RotationSpring
  readonly minute: RotationSpring
}

type DigitSprings = readonly [
  ClockSprings,
  ClockSprings,
  ClockSprings,
  ClockSprings,
  ClockSprings,
  ClockSprings,
]

function digitSprings(pose: DigitPose): DigitSprings {
  const [p0, p1, p2, p3, p4, p5] = pose
  return [
    { hour: new RotationSpring(p0.hourAngle), minute: new RotationSpring(p0.minuteAngle) },
    { hour: new RotationSpring(p1.hourAngle), minute: new RotationSpring(p1.minuteAngle) },
    { hour: new RotationSpring(p2.hourAngle), minute: new RotationSpring(p2.minuteAngle) },
    { hour: new RotationSpring(p3.hourAngle), minute: new RotationSpring(p3.minuteAngle) },
    { hour: new RotationSpring(p4.hourAngle), minute: new RotationSpring(p4.minuteAngle) },
    { hour: new RotationSpring(p5.hourAngle), minute: new RotationSpring(p5.minuteAngle) },
  ]
}

function snapOne(spring: ClockSprings, angles: ClockHandAngles): void {
  spring.hour.snapTo(angles.hourAngle)
  spring.minute.snapTo(angles.minuteAngle)
}

function snapDigit(springs: DigitSprings, pose: DigitPose): void {
  const [s0, s1, s2, s3, s4, s5] = springs
  const [p0, p1, p2, p3, p4, p5] = pose
  snapOne(s0, p0)
  snapOne(s1, p1)
  snapOne(s2, p2)
  snapOne(s3, p3)
  snapOne(s4, p4)
  snapOne(s5, p5)
}

function digitSpringAngles(springs: DigitSprings): DigitPose {
  const [s0, s1, s2, s3, s4, s5] = springs
  const angles = (s: ClockSprings): ClockHandAngles => ({
    hourAngle: s.hour.currentAngle,
    minuteAngle: s.minute.currentAngle,
  })
  return [angles(s0), angles(s1), angles(s2), angles(s3), angles(s4), angles(s5)]
}

/** Flattens the per-digit spring grid into idle.ts's flat clock list, tagging each with its global panel column (0-7, left to right across all four digits) and row (0-2) -- the same coordinate convention planDigitTransition uses for its own column stagger. */
function flattenSpringsForIdle(
  panel: readonly [DigitSprings, DigitSprings, DigitSprings, DigitSprings],
): readonly IdleClock[] {
  const clocks: IdleClock[] = []
  panel.forEach((digit, digitIndex) => {
    digit.forEach((clock, clockIndex) => {
      clocks.push({
        hour: clock.hour,
        minute: clock.minute,
        column: digitIndex * 2 + (clockIndex % 2),
        row: Math.floor(clockIndex / 2),
      })
    })
  })
  return clocks
}

function handSteps(spring: ClockSprings, step: ClockStep): readonly [ScheduledHand, ScheduledHand] {
  return [
    {
      spring: spring.hour,
      desiredAngle: step.hour.desiredAngle,
      options: step.hour.options,
      delayMs: step.hour.delayMs,
    },
    {
      spring: spring.minute,
      desiredAngle: step.minute.desiredAngle,
      options: step.minute.options,
      delayMs: step.minute.delayMs,
    },
  ]
}

function collectDigitHands(springs: DigitSprings, plan: DigitStep): ScheduledHand[] {
  const [s0, s1, s2, s3, s4, s5] = springs
  const [p0, p1, p2, p3, p4, p5] = plan
  return [
    ...handSteps(s0, p0),
    ...handSteps(s1, p1),
    ...handSteps(s2, p2),
    ...handSteps(s3, p3),
    ...handSteps(s4, p4),
    ...handSteps(s5, p5),
  ]
}

// --- Public controller API ---

export interface PanelControllerOptions {
  /**
   * Initial 4-digit override. When set, the panel starts on this fixed
   * snapshot and never live-ticks, matching the original `?time=`
   * behavior. When omitted, the panel starts on the live clock and ticks
   * once a second until setTime pins it to something else.
   */
  readonly initialDigits?: DigitTuple
  /** Idle pattern tuning. Defaults to the same tuning idle.ts ships. */
  readonly idleConfig?: IdleConfig
  /**
   * Bypasses reduced motion for the pointer light only (`?light=force`), for
   * demoing the light on a device with Reduce Motion on at the OS level.
   * Every other reduced-motion behavior -- hand transition springs, idle
   * choreography -- stays gated exactly as it is when this is false.
   */
  readonly lightForce?: boolean
  /**
   * Pins every clock's hands to this exact pose every frame (`?hands=`),
   * overriding the live clock, springs and choreography entirely for the
   * whole panel -- a dev/demo tool for reviewing hand geometry against a
   * static reference at a known angle. The pointer light keeps running as
   * usual underneath it. Omit or pass null for the normal, time-driven pose.
   */
  readonly handsForce?: ClockHandAngles | null
}

export interface PanelControllerState {
  readonly digits: DigitTuple
  readonly reducedMotion: boolean
  readonly idlePattern: IdlePattern | null
  readonly liveClock: boolean
}

export interface PanelControllerEventMap {
  /** The new digits, whenever the live clock's own poll finds the displayed minute changed. Never fired for setTime/transitionTo calls. */
  minute: DigitTuple
  /** The pattern name, when an idle pattern starts playing (automatic or via playIdle). */
  'idle:start': IdlePattern
  /** The pattern name, when the active idle pattern finishes or is aborted. */
  'idle:end': IdlePattern
}

export type PanelControllerEvent = keyof PanelControllerEventMap

export interface PanelController {
  /** Instantly shows `hhmm` (HHMM or HH:MM) with no animation, and pins the panel off the live clock. Throws for anything that is not 4 digits. */
  setTime(hhmm: string): void
  /** Transitions to `hhmm` using the same staggered choreography a real minute change uses. Throws for anything that is not 4 digits. */
  transitionTo(hhmm: string): void
  /** Plays one idle pattern immediately, bypassing the automatic interval. No-ops under reduced motion. */
  playIdle(pattern: IdlePattern): void
  /** Replaces the idle tuning used for every automatic attempt and pattern started from now on. */
  setIdleConfig(config: IdleConfig): void
  /** Starts the render loop, and the live-clock poll if the panel is not pinned to a fixed time. Safe to call once; a second call before stop() is a no-op. */
  start(): void
  /** Pauses the render loop and the live-clock poll. Leaves springs and listeners intact -- start() resumes from exactly where this left off. */
  stop(): void
  /** Stops everything and removes every listener this controller attached. Call exactly once, when the canvas is going away. */
  destroy(): void
  /** A snapshot of the controller's current state. Not reactive -- call again for a fresh read. */
  getState(): PanelControllerState
  /** Subscribes to a controller event. Returns an unsubscribe function. */
  on(event: 'minute', callback: (digits: DigitTuple) => void): () => void
  on(event: 'idle:start' | 'idle:end', callback: (pattern: IdlePattern) => void): () => void
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2d context unavailable')
  return context
}

export function createPanelController(
  canvas: HTMLCanvasElement,
  options: PanelControllerOptions = {},
): PanelController {
  const ctx = requireContext(canvas)

  // --- Canvas sizing: a devicePixelRatio-aware full-viewport canvas. ---

  let logicalWidth = 0
  let logicalHeight = 0

  function resize(): void {
    const dpr = window.devicePixelRatio || 1
    logicalWidth = window.innerWidth
    logicalHeight = window.innerHeight
    canvas.width = Math.round(logicalWidth * dpr)
    canvas.height = Math.round(logicalHeight * dpr)
    canvas.style.width = `${logicalWidth}px`
    canvas.style.height = `${logicalHeight}px`
    // Draw in logical pixels from here on; this scale is what keeps the
    // panel crisp regardless of the display's device pixel ratio.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  resize()
  window.addEventListener('resize', resize)

  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  let reducedMotion = reducedMotionQuery.matches
  const onReducedMotionChange = (event: MediaQueryListEvent): void => {
    reducedMotion = event.matches
  }
  reducedMotionQuery.addEventListener('change', onReducedMotionChange)

  // --- Pointer: the panel's light source. Tracked at the window level, not
  // just the canvas, so the light exists across the whole page rather than
  // only while the cursor happens to be over it -- coordinates still
  // convert into canvas-local space below, the same as before. Kept as a
  // plain local the render loop reads, not state anything re-renders on: a
  // pointermove can fire several times per frame and the loop only needs
  // wherever it ended up. Null until the first move, or once the pointer
  // leaves the window entirely, which is also what a device that never
  // sends one keeps seeing -- see the light springs below for how that
  // resolves into the resting light angle rather than a hard cut. ---

  let pointer: PanelPointer | null = null

  const onPointerMove = (event: PointerEvent): void => {
    // Mouse only. A touch contact is a tap that happens to have
    // coordinates, not a light hovering over the panel, so phones stay on
    // the resting light angle and nothing about them changes.
    if (event.pointerType !== 'mouse') return
    const rect = canvas.getBoundingClientRect()
    pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  // mouseout fires on every element boundary the cursor crosses; a null
  // relatedTarget is the one case that means it left the browser window
  // entirely rather than moving onto another element inside it.
  const onPointerLeaveWindow = (event: MouseEvent): void => {
    if (event.relatedTarget === null) pointer = null
  }

  window.addEventListener('pointermove', onPointerMove)
  document.addEventListener('mouseout', onPointerLeaveWindow)

  // --- Light springs: one per clock, each chasing that clock's own target
  // light angle -- the direction from its center to the pointer, or the
  // style's resting angle when there is none -- with real mass, so the
  // shading visibly trails the cursor by a beat instead of snapping to it.
  // Reuses RotationSpring exactly as the hands do: unbounded tracking plus
  // a shortest-path retarget every frame is what keeps a light that circles
  // a clock from ever crossing its own wrap seam as a visible jump. Each
  // clock's distance to the pointer additionally sets its own intensity,
  // scaled smoothly between a near and a far radius -- see panel.ts's
  // styleWithLight for how angle and intensity combine into a style. ---

  const lightSprings: RotationSpring[] = Array.from(
    { length: CLOCKS_PER_PANEL },
    () => new RotationSpring(defaultClockStyle.lightAngle),
  )

  const lightForce = options.lightForce ?? false

  // --- Hands-force (`?hands=`): every clock, every digit, pinned to the
  // same angles for as long as this controller lives -- set once at
  // construction, same as lightForce, since this is a dev/demo override
  // rather than a live setting. When set, a constant DigitPose (all 6
  // clocks in a digit at the same forced angles) stands in for the
  // spring-driven pose the render loop would otherwise read every frame. ---

  const handsForce = options.handsForce ?? null
  const forcedDigitPose: DigitPose | null =
    handsForce === null
      ? null
      : [handsForce, handsForce, handsForce, handsForce, handsForce, handsForce]

  function updateLights(dt: number): readonly ClockLight[] | null {
    // Reduced motion opts out of the pointer-follow entirely, not only its
    // easing: every clock stays on the resting angle from the style, the
    // same as before a pointer ever moved. `lightForce` (`?light=force`)
    // bypasses this one gate for a demo-proof URL; every other
    // reduced-motion behavior below is untouched by it.
    if (reducedMotion && !lightForce) return null

    const fit = computePanelFit(logicalWidth, logicalHeight)
    const centers = flatPanelCenters(fit)
    const nearRadius = fit.radius * LIGHT_NEAR_RADIUS_IN_WELL_RADII
    const farRadius = panelDiagonal(fit) * LIGHT_FAR_RADIUS_PANEL_DIAGONAL_FRACTION

    const lights: ClockLight[] = []
    for (let i = 0; i < lightSprings.length; i++) {
      const center = centers[i]
      const spring = lightSprings[i]
      if (center === undefined || spring === undefined) continue

      let targetAngle = defaultClockStyle.lightAngle
      let intensity = 0

      if (pointer !== null) {
        targetAngle = lightAngleToward(center.x, center.y, pointer)
        const distance = Math.hypot(pointer.x - center.x, pointer.y - center.y)
        intensity = 1 - smoothstep(nearRadius, farRadius, distance)
      }

      spring.rotateTo(targetAngle, { direction: 'shortest', spring: lightSpring })
      spring.update(dt)
      lights.push({ lightAngle: spring.currentAngle, intensity })
    }
    return lights
  }

  // --- Time source and spring state. ---

  let liveClock = options.initialDigits === undefined
  let lastDigits: DigitTuple = options.initialDigits ?? liveTimeDigits(new Date())

  const [d0, d1, d2, d3] = lastDigits
  const springs: readonly [DigitSprings, DigitSprings, DigitSprings, DigitSprings] = [
    digitSprings(digitPose(assertDigit(d0))),
    digitSprings(digitPose(assertDigit(d1))),
    digitSprings(digitPose(assertDigit(d2))),
    digitSprings(digitPose(assertDigit(d3))),
  ]

  function retargetOne(spring: ClockSprings, angles: ClockHandAngles): void {
    spring.hour.rotateTo(angles.hourAngle, { reducedMotion })
    spring.minute.rotateTo(angles.minuteAngle, { reducedMotion })
  }

  function retargetDigit(springs: DigitSprings, pose: DigitPose): void {
    const [s0, s1, s2, s3, s4, s5] = springs
    const [p0, p1, p2, p3, p4, p5] = pose
    retargetOne(s0, p0)
    retargetOne(s1, p1)
    retargetOne(s2, p2)
    retargetOne(s3, p3)
    retargetOne(s4, p4)
    retargetOne(s5, p5)
  }

  // --- Idle choreography: ambient hand patterns during quiet stretches
  // between minute changes. Shares the same RotationSpring instances and
  // TransitionScheduler as the minute-change choreography below -- see
  // idle.ts for how that reuse also gives interruption for free. ---

  const scheduler = new TransitionScheduler()
  const idleChoreographer = new IdleChoreographer(
    scheduler,
    flattenSpringsForIdle(springs),
    performance.now(),
    options.idleConfig ?? defaultIdleConfig,
  )
  let lastIdlePattern: IdlePattern | null = null

  // --- Events ---

  const minuteListeners = new Set<(digits: DigitTuple) => void>()
  const idleStartListeners = new Set<(pattern: IdlePattern) => void>()
  const idleEndListeners = new Set<(pattern: IdlePattern) => void>()

  // --- Minute-change choreography: plans and stages the staggered sweep
  // for whichever digits actually changed, then hands it to the scheduler
  // to fire hand-by-hand against the rAF clock. See choreography.ts. ---

  function collectChangedHands(
    columnGroup: number,
    previousDigit: number,
    nextDigit: number,
    digitSprings: DigitSprings,
  ): ScheduledHand[] {
    if (previousDigit === nextDigit) return []
    const current = digitSpringAngles(digitSprings)
    const target = digitPose(assertDigit(nextDigit))
    const plan = planDigitTransition(current, target, columnGroup, defaultChoreography)
    return collectDigitHands(digitSprings, plan)
  }

  /**
   * Transitions the panel from whatever it is currently showing to
   * `nextDigits`, touching only the digits whose value actually changed.
   * Safe to call again before a previous transition has finished.
   */
  function runTransition(nextDigits: DigitTuple): void {
    const nowMs = performance.now()
    // A real transition always wins over ambient motion: fast-settle any
    // idle pattern in flight before staging this one.
    idleChoreographer.abort(nowMs)

    const previousDigits = lastDigits
    lastDigits = nextDigits
    const [p0, p1, p2, p3] = previousDigits
    const [n0, n1, n2, n3] = nextDigits
    const [s0, s1, s2, s3] = springs

    if (reducedMotion) {
      if (n0 !== p0) retargetDigit(s0, digitPose(assertDigit(n0)))
      if (n1 !== p1) retargetDigit(s1, digitPose(assertDigit(n1)))
      if (n2 !== p2) retargetDigit(s2, digitPose(assertDigit(n2)))
      if (n3 !== p3) retargetDigit(s3, digitPose(assertDigit(n3)))
      return
    }

    // Rank only the digits that changed, left to right -- the common case
    // (only the last digit ticks over) starts moving immediately instead
    // of waiting out a delay sized for columns it never occupied.
    let columnGroup = 0
    const hands: ScheduledHand[] = []
    if (n0 !== p0) {
      hands.push(...collectChangedHands(columnGroup, p0, n0, s0))
      columnGroup++
    }
    if (n1 !== p1) {
      hands.push(...collectChangedHands(columnGroup, p1, n1, s1))
      columnGroup++
    }
    if (n2 !== p2) {
      hands.push(...collectChangedHands(columnGroup, p2, n2, s2))
      columnGroup++
    }
    if (n3 !== p3) {
      hands.push(...collectChangedHands(columnGroup, p3, n3, s3))
    }
    scheduler.schedule(nowMs, hands)
  }

  // --- Live clock poll: re-check once a second and transition whenever
  // the displayed minute actually changes. Only runs while the panel is
  // not pinned to a fixed time (see setTime). ---

  let liveClockIntervalId: ReturnType<typeof setInterval> | null = null

  function startLiveClock(): void {
    if (liveClockIntervalId !== null || !liveClock) return
    liveClockIntervalId = setInterval(() => {
      const nextDigits = liveTimeDigits(new Date())
      if (nextDigits.every((digit, index) => digit === lastDigits[index])) return
      runTransition(nextDigits)
      for (const callback of minuteListeners) callback(nextDigits)
    }, 1000)
  }

  function stopLiveClock(): void {
    if (liveClockIntervalId !== null) {
      clearInterval(liveClockIntervalId)
      liveClockIntervalId = null
    }
  }

  // --- Render loop. ---

  let rafId: number | null = null
  let lastTime = performance.now()

  function frame(now: number): void {
    const dt = (now - lastTime) / 1000
    lastTime = now

    // Idle first: any pattern it stages this frame (or fast-settle from an
    // abort) goes into the same scheduler tick below, so a zero-delay hand
    // fires within this frame instead of waiting a whole extra one.
    idleChoreographer.tick(now, reducedMotion)
    scheduler.tick(now)

    const currentIdlePattern = idleChoreographer.current
    if (currentIdlePattern !== lastIdlePattern) {
      if (currentIdlePattern !== null) {
        for (const callback of idleStartListeners) callback(currentIdlePattern)
      } else if (lastIdlePattern !== null) {
        for (const callback of idleEndListeners) callback(lastIdlePattern)
      }
      lastIdlePattern = currentIdlePattern
    }

    for (const digit of springs) {
      for (const clock of digit) {
        clock.hour.update(dt)
        clock.minute.update(dt)
      }
    }

    ctx.clearRect(0, 0, logicalWidth, logicalHeight)
    const pose: PanelPose =
      forcedDigitPose !== null
        ? [forcedDigitPose, forcedDigitPose, forcedDigitPose, forcedDigitPose]
        : [
            digitSpringAngles(springs[0]),
            digitSpringAngles(springs[1]),
            digitSpringAngles(springs[2]),
            digitSpringAngles(springs[3]),
          ]
    // Reduced motion drops the pointer, not the lighting: the panel keeps
    // its wells, lit from the style's resting angle, and simply stops
    // having shading that chases the cursor -- the same call this makes for
    // the reduced-motion springs and idle patterns above.
    const lights = updateLights(dt)
    drawPanel(ctx, logicalWidth, logicalHeight, pose, defaultClockStyle, lights)

    rafId = requestAnimationFrame(frame)
  }

  // --- Lifecycle. ---

  let started = false
  let destroyed = false

  function doStart(): void {
    if (started || destroyed) return
    started = true
    lastTime = performance.now()
    startLiveClock()
    rafId = requestAnimationFrame(frame)
  }

  function doStop(): void {
    if (!started) return
    started = false
    stopLiveClock()
    if (rafId !== null) {
      cancelAnimationFrame(rafId)
      rafId = null
    }
  }

  function doDestroy(): void {
    if (destroyed) return
    destroyed = true
    doStop()
    window.removeEventListener('resize', resize)
    reducedMotionQuery.removeEventListener('change', onReducedMotionChange)
    window.removeEventListener('pointermove', onPointerMove)
    document.removeEventListener('mouseout', onPointerLeaveWindow)
  }

  return {
    setTime(hhmm) {
      const digits = requireDigits(hhmm)
      liveClock = false
      stopLiveClock()
      idleChoreographer.abort(performance.now())
      lastDigits = digits
      const [n0, n1, n2, n3] = digits
      snapDigit(springs[0], digitPose(assertDigit(n0)))
      snapDigit(springs[1], digitPose(assertDigit(n1)))
      snapDigit(springs[2], digitPose(assertDigit(n2)))
      snapDigit(springs[3], digitPose(assertDigit(n3)))
    },
    transitionTo(hhmm) {
      runTransition(requireDigits(hhmm))
    },
    playIdle(pattern) {
      if (reducedMotion) return
      idleChoreographer.triggerOnce(performance.now(), pattern)
    },
    setIdleConfig(config) {
      idleChoreographer.setConfig(config)
    },
    start: doStart,
    stop: doStop,
    destroy: doDestroy,
    getState() {
      return {
        digits: lastDigits,
        reducedMotion,
        idlePattern: idleChoreographer.current,
        liveClock,
      }
    },
    on(event: PanelControllerEvent, callback: (payload: never) => void): () => void {
      if (event === 'minute') {
        const cb = callback as (digits: DigitTuple) => void
        minuteListeners.add(cb)
        return () => minuteListeners.delete(cb)
      }
      if (event === 'idle:start') {
        const cb = callback as (pattern: IdlePattern) => void
        idleStartListeners.add(cb)
        return () => idleStartListeners.delete(cb)
      }
      const cb = callback as (pattern: IdlePattern) => void
      idleEndListeners.add(cb)
      return () => idleEndListeners.delete(cb)
    },
  }
}

// App shell: a devicePixelRatio-aware, full-viewport canvas that renders
// the 24-clock time panel. Drives 48 RotationSprings (2 hands x 6 clocks
// x 4 digits) -- one per hand. On load, springs jump straight to their
// initial pose (see the `springs` construction below). From then on, the
// panel keeps ticking on its own by polling the clock once a second and,
// whenever the displayed minute changes, running the digit-level
// choreography from choreography.ts on whichever digits actually changed
// -- direction, extra-turn padding, and panel-column stagger -- instead
// of snapping straight to the new pose. `prefers-reduced-motion` bypasses
// choreography entirely and retargets directly with `{ reducedMotion:
// true }`, which is what turns it into a short, direct move.

import { drawPanel, type PanelPose } from './panel'
import { digitPose, type Digit, type DigitPose } from './font'
import { RotationSpring } from './animate'
import type { ClockHandAngles } from './clock'
import {
  planDigitTransition,
  defaultChoreography,
  TransitionScheduler,
  type ClockStep,
  type DigitStep,
  type ScheduledHand,
} from './choreography'
import { IdleChoreographer, type IdleClock, type IdlePattern } from './idle'

function requireCanvas(): HTMLCanvasElement {
  const el = document.querySelector<HTMLCanvasElement>('#app')
  if (!el) throw new Error('missing #app canvas')
  return el
}

function requireContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = target.getContext('2d')
  if (!context) throw new Error('2d context unavailable')
  return context
}

const canvas = requireCanvas()
const ctx = requireContext(canvas)

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
reducedMotionQuery.addEventListener('change', (event) => {
  reducedMotion = event.matches
})

// --- Time source: either the ?time= query override, or the live clock. ---

type DigitTuple = readonly [number, number, number, number]

const CHAR_CODE_ZERO = '0'.charCodeAt(0)

function assertDigit(value: number): Digit {
  if (!Number.isInteger(value) || value < 0 || value > 9) {
    throw new Error(`invalid digit: ${value}`)
  }
  return value as Digit
}

/**
 * Parses a `?<name>=HHMM` or `?<name>=HH:MM` query param into 4 raw
 * digits. Deliberately does not validate the result as a real time --
 * this is a QA affordance for reviewing the digit font and the
 * choreography, so any 4 digits (`?time=89:06`) must render, not just
 * plausible clock times.
 */
function parseDigitsParam(name: string): DigitTuple | null {
  const raw = new URLSearchParams(window.location.search).get(name)
  if (raw === null) return null
  const digitsOnly = raw.replace(/:/g, '')
  if (!/^\d{4}$/.test(digitsOnly)) return null
  return [
    digitsOnly.charCodeAt(0) - CHAR_CODE_ZERO,
    digitsOnly.charCodeAt(1) - CHAR_CODE_ZERO,
    digitsOnly.charCodeAt(2) - CHAR_CODE_ZERO,
    digitsOnly.charCodeAt(3) - CHAR_CODE_ZERO,
  ]
}

/** `?time=HHMM` -- overrides the displayed time with a fixed snapshot; never ticks. */
function parseTimeOverride(): DigitTuple | null {
  return parseDigitsParam('time')
}

/**
 * `?to=HHMM` -- paired with `?time=`, gives the choreography a second
 * anchor to transition to on demand (see the key/click listener below),
 * so a transition can be watched without waiting for a real minute to
 * roll over. Ignored when `?time=` is absent.
 */
function parseToOverride(): DigitTuple | null {
  return parseDigitsParam('to')
}

/** The current local time as 4 digits, 24-hour HH:MM. */
function liveTimeDigits(now: Date): DigitTuple {
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return [
    hh.charCodeAt(0) - CHAR_CODE_ZERO,
    hh.charCodeAt(1) - CHAR_CODE_ZERO,
    mm.charCodeAt(0) - CHAR_CODE_ZERO,
    mm.charCodeAt(1) - CHAR_CODE_ZERO,
  ]
}

const timeOverride = parseTimeOverride()
const toOverride = timeOverride !== null ? parseToOverride() : null

function currentDigits(): DigitTuple {
  return timeOverride ?? liveTimeDigits(new Date())
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

function digitSpringAngles(springs: DigitSprings): DigitPose {
  const [s0, s1, s2, s3, s4, s5] = springs
  const angles = (s: ClockSprings): ClockHandAngles => ({
    hourAngle: s.hour.currentAngle,
    minuteAngle: s.minute.currentAngle,
  })
  return [angles(s0), angles(s1), angles(s2), angles(s3), angles(s4), angles(s5)]
}

let lastDigits = currentDigits()
const [d0, d1, d2, d3] = lastDigits
const springs: readonly [DigitSprings, DigitSprings, DigitSprings, DigitSprings] = [
  digitSprings(digitPose(assertDigit(d0))),
  digitSprings(digitPose(assertDigit(d1))),
  digitSprings(digitPose(assertDigit(d2))),
  digitSprings(digitPose(assertDigit(d3))),
]

// --- Idle choreography: ambient hand patterns during quiet stretches
// between minute changes. Shares the same RotationSpring instances and
// TransitionScheduler as the minute-change choreography above -- see
// idle.ts for how that reuse also gives interruption for free. ---

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

// --- Minute-change choreography: plans and stages the staggered sweep
// for whichever digits actually changed, then hands it to the scheduler
// to fire hand-by-hand against the rAF clock. See choreography.ts. ---

const scheduler = new TransitionScheduler()
const idleChoreographer = new IdleChoreographer(scheduler, flattenSpringsForIdle(springs), performance.now())

function handSteps(spring: ClockSprings, step: ClockStep): readonly [ScheduledHand, ScheduledHand] {
  return [
    { spring: spring.hour, desiredAngle: step.hour.desiredAngle, options: step.hour.options, delayMs: step.hour.delayMs },
    { spring: spring.minute, desiredAngle: step.minute.desiredAngle, options: step.minute.options, delayMs: step.minute.delayMs },
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

/**
 * Plans and collects one digit's hands, ranked at `columnGroup` among the
 * digits actually transitioning this run (see planDigitTransition), or
 * nothing if this digit's value did not change.
 */
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
 * Safe to call again before a previous transition has finished -- the
 * scheduler and the springs themselves are both interruption-safe, so a
 * transition that lands mid-flight retargets cleanly instead of snapping.
 */
function runTransition(nextDigits: DigitTuple): void {
  const nowMs = performance.now()
  // A real transition always wins over ambient motion: fast-settle any
  // idle pattern in flight before staging this one, so a minute change (or
  // a ?to= QA trigger) landing mid-pattern never races the idle sweep.
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

  // Rank only the digits that changed, left to right -- the stagger then
  // ripples across whichever digits are actually moving, so the common
  // case (only the last digit ticks over) starts moving immediately
  // instead of waiting out a delay sized for the panel columns it never
  // occupied.
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

// Live clock only: re-check once a second and transition whenever the
// displayed minute actually changes. The ?time= override is a fixed QA
// snapshot -- it never ticks on its own.
if (timeOverride === null) {
  setInterval(() => {
    const nextDigits = currentDigits()
    if (nextDigits.every((digit, index) => digit === lastDigits[index])) return
    runTransition(nextDigits)
  }, 1000)
}

// QA affordance: with both ?time= and ?to= set, any key press or click
// transitions the panel between the two, toggling back and forth, so the
// choreography can be watched on demand instead of waiting for a real
// minute to roll over.
if (timeOverride !== null && toOverride !== null) {
  let showingTarget = false
  const triggerTransition = (): void => {
    showingTarget = !showingTarget
    runTransition(showingTarget ? toOverride : timeOverride)
  }
  window.addEventListener('keydown', triggerTransition)
  window.addEventListener('click', triggerTransition)
}

/** `?idle=wave|breathe|cascade` -- a QA affordance for reviewing a single idle pattern on demand instead of waiting out the randomized interval. Any key press or click plays it once, mirroring the ?to= trigger above. Honors reduced motion like every other idle path -- no-ops if it is on. */
function parseIdleOverride(): IdlePattern | null {
  const raw = new URLSearchParams(window.location.search).get('idle')
  return raw === 'wave' || raw === 'breathe' || raw === 'cascade' ? raw : null
}

const idleOverride = parseIdleOverride()
if (idleOverride !== null) {
  const triggerIdle = (): void => {
    if (reducedMotion) return
    idleChoreographer.triggerOnce(performance.now(), idleOverride)
  }
  window.addEventListener('keydown', triggerIdle)
  window.addEventListener('click', triggerIdle)
}

let lastTime = performance.now()

function frame(now: number): void {
  const dt = (now - lastTime) / 1000
  lastTime = now

  // Idle first: any pattern it stages this frame (or fast-settle from an
  // abort) goes into the same scheduler tick below, so a zero-delay hand
  // fires within this frame instead of waiting a whole extra one.
  idleChoreographer.tick(now, reducedMotion)
  scheduler.tick(now)

  for (const digit of springs) {
    for (const clock of digit) {
      clock.hour.update(dt)
      clock.minute.update(dt)
    }
  }

  ctx.clearRect(0, 0, logicalWidth, logicalHeight)
  const pose: PanelPose = [
    digitSpringAngles(springs[0]),
    digitSpringAngles(springs[1]),
    digitSpringAngles(springs[2]),
    digitSpringAngles(springs[3]),
  ]
  drawPanel(ctx, logicalWidth, logicalHeight, pose)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

// Minute-change choreography: given a digit's current (live spring) hand
// angles and the next digit value's target angles, plans every hand's
// rotateTo call -- which rotational sense to sweep, whether to pad the
// sweep with a full extra turn so a tiny move still reads as deliberate
// motion, and how long to delay before the hand starts, so the panel
// ripples through its columns instead of every hand snapping at once.
//
// Planning is pure (angles in, a plan out) and knows nothing about
// RotationSpring or timers. TransitionScheduler is the other half: it
// takes a plan paired with the actual RotationSpring instances driving
// the panel and fires each hand's rotateTo at its staggered start time,
// measured against the same monotonic clock the rAF loop already runs
// on -- never setTimeout, so a backgrounded tab can't pile up timers that
// all fire at once when it regains focus.
//
// Reduced motion bypasses this module entirely -- main.ts retargets
// directly with `{ reducedMotion: true }` instead, which is what turns
// every sweep into RotationSpring's own short, direct crossfade move.

import {
  resolveDelta,
  type Direction,
  type RotateToOptions,
  type RotationSpring,
  type SpringConfig,
} from './animate'
import type { ClockHandAngles } from './clock'
import type { DigitPose } from './font'

/**
 * uniform -- every hand in the digit sweeps the same rotational sense.
 * alternate-column -- the sense alternates by panel column (0-7, left to
 * right across all four digits), so adjacent columns sweep opposite ways
 * and the panel reads as fanning open rather than marching in lockstep.
 */
export type SweepStrategy = 'uniform' | 'alternate-column'

type BaseDirection = Extract<Direction, 'clockwise' | 'counterclockwise'>

export interface ChoreographyConfig {
  readonly strategy: SweepStrategy
  /**
   * The rotational sense `uniform` always uses, and the sense
   * `alternate-column` uses for even panel columns (odd columns get the
   * opposite sense).
   */
  readonly baseDirection: BaseDirection
  readonly spring: SpringConfig
  /**
   * Below this resolved sweep angle (radians), extraTurns is added so the
   * move still reads as deliberate motion instead of a flick.
   */
  readonly minSweepAngle: number
  /** Full extra rotations added when a hand's resolved sweep is below minSweepAngle. */
  readonly extraTurns: number
  /** ms delay between adjacent panel columns (0-7, left to right across all four digits) -- the ripple step. */
  readonly columnStaggerMs: number
  /** ms delay between adjacent rows (0-2, top to bottom within a digit), layered on top of column stagger. */
  readonly rowStaggerMs: number
}

/** Tuned by watching real transitions -- see the PR for the frame sequences this was picked against. */
export const defaultChoreography: ChoreographyConfig = {
  strategy: 'alternate-column',
  baseDirection: 'clockwise',
  spring: { dampingRatio: 1, response: 0.85 },
  minSweepAngle: (35 * Math.PI) / 180,
  extraTurns: 1,
  columnStaggerMs: 110,
  rowStaggerMs: 45,
}

export interface HandStep {
  readonly desiredAngle: number
  readonly options: RotateToOptions
  readonly delayMs: number
}

export interface ClockStep {
  readonly hour: HandStep
  readonly minute: HandStep
}

/** The 6 clock steps of one digit, in the same fixed order as font.ts's DigitPose. */
export type DigitStep = readonly [ClockStep, ClockStep, ClockStep, ClockStep, ClockStep, ClockStep]

function directionFor(config: ChoreographyConfig, globalColumn: number): Direction {
  if (config.strategy === 'uniform') return config.baseDirection
  const opposite: BaseDirection = config.baseDirection === 'clockwise' ? 'counterclockwise' : 'clockwise'
  return globalColumn % 2 === 0 ? config.baseDirection : opposite
}

function planHand(
  current: number,
  desired: number,
  direction: Direction,
  config: ChoreographyConfig,
  delayMs: number,
): HandStep {
  const sweep = Math.abs(resolveDelta(current, desired, direction))
  const extraTurns = sweep < config.minSweepAngle ? config.extraTurns : 0
  return {
    desiredAngle: desired,
    options: { direction, extraTurns, spring: config.spring },
    delayMs,
  }
}

function planClock(
  current: ClockHandAngles,
  target: ClockHandAngles,
  globalColumn: number,
  row: number,
  config: ChoreographyConfig,
): ClockStep {
  const direction = directionFor(config, globalColumn)
  const delayMs = globalColumn * config.columnStaggerMs + row * config.rowStaggerMs
  return {
    hour: planHand(current.hourAngle, target.hourAngle, direction, config, delayMs),
    minute: planHand(current.minuteAngle, target.minuteAngle, direction, config, delayMs),
  }
}

/**
 * Plans one digit's transition from its current (live) hand angles to the
 * target digit's font pose. `columnGroup` anchors the pair of stagger
 * columns this digit sweeps in (its left and right clock columns) and the
 * alternate-column strategy's parity -- it is the digit's rank among the
 * digits actually transitioning this run (0, 1, 2...), left to right, not
 * its fixed HH:MM position. Ranking by participation rather than panel
 * position is what keeps the common case -- only the last digit ticking
 * over -- starting immediately instead of waiting out a stagger delay
 * sized for columns further digits never occupy.
 */
export function planDigitTransition(
  current: DigitPose,
  target: DigitPose,
  columnGroup: number,
  config: ChoreographyConfig = defaultChoreography,
): DigitStep {
  const [c0, c1, c2, c3, c4, c5] = current
  const [t0, t1, t2, t3, t4, t5] = target
  const leftColumn = columnGroup * 2
  const rightColumn = leftColumn + 1
  return [
    planClock(c0, t0, leftColumn, 0, config), // top-left
    planClock(c1, t1, rightColumn, 0, config), // top-right
    planClock(c2, t2, leftColumn, 1, config), // mid-left
    planClock(c3, t3, rightColumn, 1, config), // mid-right
    planClock(c4, t4, leftColumn, 2, config), // bottom-left
    planClock(c5, t5, rightColumn, 2, config), // bottom-right
  ]
}

// --- Scheduler: fires each hand's rotateTo at its staggered start time. ---

export interface ScheduledHand {
  readonly spring: RotationSpring
  readonly desiredAngle: number
  readonly options: RotateToOptions
  readonly delayMs: number
}

interface PendingHand {
  readonly spring: RotationSpring
  readonly desiredAngle: number
  readonly options: RotateToOptions
  readonly fireAt: number
}

/**
 * Drives the staggered start of a batch of hand rotations against a
 * monotonic clock supplied by the caller (the rAF timestamp), never its
 * own timers.
 *
 * `schedule` is additive-with-override: hands not named in a batch keep
 * whatever pending start time they already had, so a transition that only
 * touches some digits -- the common case, most minute changes move one or
 * two -- never disturbs a still-rippling transition on the others. Hands
 * that *are* named replace their previous entry outright, which is what
 * makes an interrupting transition retarget cleanly instead of racing the
 * old one: the RotationSpring itself is always safe to retarget mid-flight,
 * this just makes sure it is only ever told to do one thing at a time.
 */
export class TransitionScheduler {
  private pending: PendingHand[] = []

  schedule(nowMs: number, hands: readonly ScheduledHand[]): void {
    if (hands.length === 0) return
    const incoming = new Set(hands.map((hand) => hand.spring))
    const preserved = this.pending.filter((pending) => !incoming.has(pending.spring))
    const added = hands.map((hand) => ({
      spring: hand.spring,
      desiredAngle: hand.desiredAngle,
      options: hand.options,
      fireAt: nowMs + hand.delayMs,
    }))
    this.pending = [...preserved, ...added]
  }

  /**
   * Advances the schedule: fires any hand whose delay has elapsed as of
   * `nowMs`. Call once per animation frame, passing the same rAF
   * timestamp driving the rest of the frame -- that is what keeps this
   * setTimeout-free and immune to tab-switch desync, since a paused rAF
   * loop simply stops calling tick rather than a pile of timers firing
   * all at once on return.
   */
  tick(nowMs: number): void {
    if (this.pending.length === 0) return
    const remaining: PendingHand[] = []
    for (const hand of this.pending) {
      if (nowMs >= hand.fireAt) {
        hand.spring.rotateTo(hand.desiredAngle, hand.options)
      } else {
        remaining.push(hand)
      }
    }
    this.pending = remaining
  }
}

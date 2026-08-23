// Idle choreography: between minute changes, the panel is otherwise frozen.
// This plays short, ambient hand patterns during quiet stretches so the
// panel keeps a bit of life without ever breaking time legibility -- every
// pattern returns each hand to exactly the digit pose angle it started
// from.
//
// Deliberately reuses RotationSpring and TransitionScheduler rather than
// building a second animation path: a pattern is just a batch of
// `rotateTo` calls staggered through the same scheduler the minute-change
// choreography uses (see choreography.ts). That reuse is also what makes
// interruption free -- `abort` fast-settles every hand a pattern touched
// by scheduling one more override batch, and TransitionScheduler.schedule
// is already additive-with-override, so a real transition landing on the
// same springs a moment later cleanly takes precedence with no special
// casing on either side.

import type { Direction, RotationSpring, SpringConfig } from './animate'
import { TransitionScheduler, type ScheduledHand } from './choreography'

export type IdlePattern = 'wave' | 'breathe' | 'cascade'

/** One clock's pair of hand springs plus its position in the panel's global grid (columns 0-7 left to right across all four digits, rows 0-2 top to bottom) -- the same coordinate convention choreography.ts uses for its column stagger. */
export interface IdleClock {
  readonly hour: RotationSpring
  readonly minute: RotationSpring
  readonly column: number
  readonly row: number
}

type BaseDirection = Extract<Direction, 'clockwise' | 'counterclockwise'>

/** Shared shape for the two "full rotation, staggered by rank" patterns (wave and cascade) -- they differ only in what ranks a clock for stagger purposes. */
export interface RotationPatternConfig {
  readonly direction: BaseDirection
  readonly spring: SpringConfig
  /** ms delay between adjacent stagger ranks. */
  readonly staggerMs: number
}

export interface BreathePatternConfig {
  readonly outSpring: SpringConfig
  readonly returnSpring: SpringConfig
  /** Minimum/maximum drift-out amplitude, radians. Randomized per hand so the drift reads as organic rather than mechanical. */
  readonly minAmplitude: number
  readonly maxAmplitude: number
  /** ms from drift-out start to the return leg firing. */
  readonly outDurationMs: number
  /** Max random per-hand start delay, ms -- keeps the panel-wide drift from reading as one hard synchronized flash. */
  readonly jitterMs: number
}

export interface IdleConfig {
  readonly minIntervalMs: number
  readonly maxIntervalMs: number
  /** Never start a pattern within this many ms of the next wall-clock minute boundary. */
  readonly minuteGuardMs: number
  /** Pool the automatic scheduler picks from. `triggerOnce` bypasses this. */
  readonly patterns: readonly IdlePattern[]
  readonly wave: RotationPatternConfig
  readonly cascade: RotationPatternConfig
  readonly breathe: BreathePatternConfig
  /** Spring used to fast-settle a hand back to pose when a pattern is aborted mid-flight. */
  readonly fastSettleSpring: SpringConfig
}

/** Tuned by watching frame sequences -- see the PR for the captures this was picked against. */
export const defaultIdleConfig: IdleConfig = {
  minIntervalMs: 20_000,
  maxIntervalMs: 40_000,
  minuteGuardMs: 8_000,
  patterns: ['wave', 'breathe', 'cascade'],
  wave: {
    direction: 'clockwise',
    spring: { dampingRatio: 1, response: 0.75 },
    staggerMs: 70,
  },
  cascade: {
    direction: 'clockwise',
    spring: { dampingRatio: 1, response: 0.75 },
    staggerMs: 60,
  },
  breathe: {
    outSpring: { dampingRatio: 1, response: 1.1 },
    returnSpring: { dampingRatio: 1, response: 1.1 },
    minAmplitude: (3 * Math.PI) / 180,
    maxAmplitude: (7 * Math.PI) / 180,
    outDurationMs: 700,
    jitterMs: 90,
  },
  fastSettleSpring: { dampingRatio: 1, response: 0.22 },
}

/** Roughly how many spring time-constants a critically damped spring needs to cross a large displacement (a full turn, in wave/cascade) and settle -- used only to estimate when a pattern has finished, so the scheduler knows when it is safe to consider a new one. Generous on purpose: a slight overestimate just delays the next attempt by a beat, an underestimate could let two patterns overlap. */
const SPRING_SETTLE_FACTOR = 5

interface ActivePattern {
  readonly pattern: IdlePattern
  readonly restAngles: ReadonlyMap<RotationSpring, number>
  readonly endsAt: number
}

function rankByColumn(clock: IdleClock): number {
  return clock.column
}

function rankByDiagonal(clock: IdleClock): number {
  return clock.column + clock.row
}

/** Builds a "full rotation back to the same pose" batch (wave or cascade): every hand's desiredAngle is its own current (rest) angle, padded with one extra turn so a zero-delta retarget still sweeps all the way around instead of sitting still. */
function buildRotationHands(
  clocks: readonly IdleClock[],
  config: RotationPatternConfig,
  rank: (clock: IdleClock) => number,
  restAngles: Map<RotationSpring, number>,
): ScheduledHand[] {
  const hands: ScheduledHand[] = []
  for (const clock of clocks) {
    const delayMs = rank(clock) * config.staggerMs
    for (const spring of [clock.hour, clock.minute]) {
      const desiredAngle = spring.currentAngle
      restAngles.set(spring, desiredAngle)
      hands.push({
        spring,
        desiredAngle,
        options: { direction: config.direction, extraTurns: 1, spring: config.spring },
        delayMs,
      })
    }
  }
  return hands
}

/** Builds the "breathe" batch: two scheduled moves per hand, a small drift off pose and then a return to it, both timed off the same jittered start so the pair reads as one soft in-and-out rather than two unrelated moves. */
function buildBreatheHands(
  clocks: readonly IdleClock[],
  config: BreathePatternConfig,
  random: () => number,
  restAngles: Map<RotationSpring, number>,
): ScheduledHand[] {
  const hands: ScheduledHand[] = []
  for (const clock of clocks) {
    for (const spring of [clock.hour, clock.minute]) {
      const restAngle = spring.currentAngle
      restAngles.set(spring, restAngle)
      const amplitude = config.minAmplitude + random() * (config.maxAmplitude - config.minAmplitude)
      const sign = random() < 0.5 ? -1 : 1
      const startDelayMs = random() * config.jitterMs
      hands.push({
        spring,
        desiredAngle: restAngle + sign * amplitude,
        options: { direction: 'shortest', spring: config.outSpring },
        delayMs: startDelayMs,
      })
      hands.push({
        spring,
        desiredAngle: restAngle,
        options: { direction: 'shortest', spring: config.returnSpring },
        delayMs: startDelayMs + config.outDurationMs,
      })
    }
  }
  return hands
}

function maxRank(clocks: readonly IdleClock[], rank: (clock: IdleClock) => number): number {
  let max = 0
  for (const clock of clocks) max = Math.max(max, rank(clock))
  return max
}

/**
 * Drives the idle choreography: on a randomized interval, if the panel is
 * quiet (no pending or in-flight transition) and not too close to the next
 * wall-clock minute boundary, plays one ambient pattern across every clock
 * in `clocks`, staged through the shared TransitionScheduler. `tick` must
 * be called once per animation frame, alongside the scheduler's own tick.
 */
export class IdleChoreographer {
  private nextAttemptAt: number
  private activePattern: ActivePattern | null = null

  constructor(
    private readonly scheduler: TransitionScheduler,
    private readonly clocks: readonly IdleClock[],
    nowMs: number,
    private config: IdleConfig = defaultIdleConfig,
    private readonly random: () => number = Math.random,
  ) {
    this.nextAttemptAt = nowMs + this.randomInterval()
  }

  /** The pattern currently mid-flight, if any -- exposed for QA/debugging, not required for normal operation. */
  get current(): IdlePattern | null {
    return this.activePattern?.pattern ?? null
  }

  /**
   * Replaces the tuning used for every automatic attempt and pattern
   * started from now on. Does not touch a pattern already mid-flight --
   * that one finishes out under the config it started with.
   */
  setConfig(config: IdleConfig): void {
    this.config = config
  }

  private randomInterval(): number {
    const { minIntervalMs, maxIntervalMs } = this.config
    return minIntervalMs + this.random() * (maxIntervalMs - minIntervalMs)
  }

  private pickPattern(): IdlePattern {
    const { patterns } = this.config
    const index = Math.min(patterns.length - 1, Math.floor(this.random() * patterns.length))
    return patterns[index] ?? 'wave'
  }

  private isQuiet(): boolean {
    if (!this.scheduler.isIdle) return false
    return this.clocks.every((clock) => clock.hour.isSettled && clock.minute.isSettled)
  }

  /** True when the next wall-clock minute boundary is closer than the configured guard -- computed off the wall clock, not the rAF timeline, since that is what actually drives minute changes in main.ts. */
  private withinMinuteGuard(): boolean {
    const wall = new Date()
    const msUntilNextMinute = 60_000 - (wall.getSeconds() * 1000 + wall.getMilliseconds())
    return msUntilNextMinute < this.config.minuteGuardMs
  }

  private start(nowMs: number, pattern: IdlePattern): void {
    const restAngles = new Map<RotationSpring, number>()
    let hands: ScheduledHand[]
    let delaySpanMs: number
    let settleSpring: SpringConfig

    switch (pattern) {
      case 'wave':
        hands = buildRotationHands(this.clocks, this.config.wave, rankByColumn, restAngles)
        delaySpanMs = maxRank(this.clocks, rankByColumn) * this.config.wave.staggerMs
        settleSpring = this.config.wave.spring
        break
      case 'cascade':
        hands = buildRotationHands(this.clocks, this.config.cascade, rankByDiagonal, restAngles)
        delaySpanMs = maxRank(this.clocks, rankByDiagonal) * this.config.cascade.staggerMs
        settleSpring = this.config.cascade.spring
        break
      case 'breathe':
        hands = buildBreatheHands(this.clocks, this.config.breathe, this.random, restAngles)
        delaySpanMs = this.config.breathe.jitterMs + this.config.breathe.outDurationMs
        settleSpring = this.config.breathe.returnSpring
        break
    }

    this.scheduler.schedule(nowMs, hands)
    const settleMs = settleSpring.response * 1000 * SPRING_SETTLE_FACTOR
    this.activePattern = { pattern, restAngles, endsAt: nowMs + delaySpanMs + settleMs }
  }

  /**
   * Fast-settles every hand the active pattern touched back to the exact
   * angle it started from, and clears the active pattern. Safe to call
   * with no pattern active (no-op). main.ts calls this before staging any
   * real transition, so a minute change or a `?to=` QA trigger landing
   * mid-pattern always wins cleanly instead of racing the ambient motion.
   */
  abort(nowMs: number): void {
    if (!this.activePattern) return
    const hands: ScheduledHand[] = []
    for (const [spring, angle] of this.activePattern.restAngles) {
      hands.push({
        spring,
        desiredAngle: angle,
        options: { direction: 'shortest', spring: this.config.fastSettleSpring },
        delayMs: 0,
      })
    }
    this.scheduler.schedule(nowMs, hands)
    this.activePattern = null
  }

  /**
   * Forces `pattern` to play once, regardless of the automatic interval --
   * the `?idle=` QA affordance in main.ts. Aborts whatever pattern is
   * already running first, then pushes the next automatic attempt out so
   * it does not immediately overlap the forced one.
   */
  triggerOnce(nowMs: number, pattern: IdlePattern): void {
    if (this.activePattern) this.abort(nowMs)
    this.start(nowMs, pattern)
    this.nextAttemptAt = nowMs + this.randomInterval()
  }

  /** Advances the idle schedule. Call once per animation frame with the same rAF timestamp driving the rest of the frame, alongside TransitionScheduler.tick. */
  tick(nowMs: number, reducedMotion: boolean): void {
    if (reducedMotion) {
      if (this.activePattern) this.abort(nowMs)
      return
    }

    if (this.activePattern && nowMs >= this.activePattern.endsAt) {
      this.activePattern = null
    }

    if (nowMs < this.nextAttemptAt) return
    this.nextAttemptAt = nowMs + this.randomInterval()

    if (this.activePattern) return
    if (!this.isQuiet()) return
    if (this.withinMinuteGuard()) return

    this.start(nowMs, this.pickPattern())
  }
}

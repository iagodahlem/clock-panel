// The rotation primitive: animates a hand angle (radians) toward a target
// with explicit direction control, multi-turn sweeps, spring easing, and
// mid-flight interruption that never jumps.
//
// Angles are tracked unbounded (not wrapped to a single turn). That is what
// makes multi-turn sweeps trivial to represent -- "two extra clockwise
// turns" is just a bigger target angle -- and it is also what makes
// interruption smooth: retargeting only ever changes where the spring is
// steering, never the position or velocity it is steering from.

const TAU = Math.PI * 2

export type Direction = 'clockwise' | 'counterclockwise' | 'shortest'

export interface SpringConfig {
  /** 1.0 = critically damped (no overshoot). Below 1.0 overshoots and settles with a bit of bounce. */
  dampingRatio: number
  /** Seconds for the spring to reach the target. Not a fixed duration -- the spring settles on its own schedule, this only scales how quickly it responds. */
  response: number
}

/** Graceful, no-overshoot default -- fits a clock hand better than any bounce. */
export const defaultSpring: SpringConfig = {
  dampingRatio: 1,
  response: 0.55,
}

export interface RotateToOptions {
  /** Which way to sweep. Defaults to the shortest path. */
  direction?: Direction
  /** Extra full rotations to add on top of the resolved sweep, in the same rotational sense. */
  extraTurns?: number
  spring?: SpringConfig
  /** When true, skips the sweep and multi-turn flourish for a short, near-instant move instead. */
  reducedMotion?: boolean
}

const SETTLE_ANGLE_EPSILON = 0.0005 // radians
const SETTLE_VELOCITY_EPSILON = 0.01 // radians/sec
const REDUCED_MOTION_DURATION = 0.14 // seconds
const MAX_STEP = 1 / 30 // seconds -- clamp huge dt spikes (tab switches, devtools pauses)

/** Wraps an angle into (-PI, PI]. */
function wrapPi(angle: number): number {
  const wrapped = ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI
  return wrapped === -Math.PI ? Math.PI : wrapped
}

function resolveDelta(current: number, desired: number, direction: Direction): number {
  if (direction === 'shortest') return wrapPi(desired - current)

  // Positive-going (clockwise) distance, normalized into [0, TAU).
  const clockwiseDelta = (((desired - current) % TAU) + TAU) % TAU
  if (direction === 'clockwise') return clockwiseDelta

  // counterclockwise: the negative-going distance, in (-TAU, 0].
  return clockwiseDelta === 0 ? 0 : clockwiseDelta - TAU
}

/**
 * Resolves an absolute, unbounded target angle from the current unbounded
 * angle, a desired visual angle, an explicit sweep direction, and a number
 * of extra full turns in that same rotational sense.
 */
export function resolveTargetAngle(
  current: number,
  desiredAngle: number,
  direction: Direction = 'shortest',
  extraTurns = 0,
): number {
  const delta = resolveDelta(current, desiredAngle, direction)
  // A zero delta (already at the desired visual angle) carries no sign of
  // its own, so extraTurns would otherwise always sweep clockwise -- fall
  // back to the explicit direction instead, defaulting to clockwise only
  // for 'shortest'/'clockwise' where there is no counterclockwise ask.
  const turnSign = delta !== 0 ? Math.sign(delta) : direction === 'counterclockwise' ? -1 : 1
  return current + delta + extraTurns * TAU * turnSign
}

/**
 * A single spring-driven rotation. Tracks an unbounded angle and its
 * angular velocity, so retargeting mid-flight blends into the motion
 * already in progress instead of restarting it.
 */
export class RotationSpring {
  private angle: number
  private velocity = 0
  private target: number
  private spring: SpringConfig = defaultSpring
  private reducedMotionElapsed: number | null = null
  private reducedMotionFrom = 0

  constructor(initialAngle: number) {
    this.angle = initialAngle
    this.target = initialAngle
  }

  get currentAngle(): number {
    return this.angle
  }

  get currentVelocity(): number {
    return this.velocity
  }

  get isSettled(): boolean {
    return (
      this.reducedMotionElapsed === null &&
      Math.abs(this.target - this.angle) < SETTLE_ANGLE_EPSILON &&
      Math.abs(this.velocity) < SETTLE_VELOCITY_EPSILON
    )
  }

  /**
   * Retargets toward `desiredAngle`. Safe to call mid-flight: the spring
   * keeps its current position and velocity and steers toward the new
   * target from there, so motion stays continuous instead of snapping.
   */
  rotateTo(desiredAngle: number, options: RotateToOptions = {}): void {
    const reducedMotion = options.reducedMotion ?? false
    const direction = options.direction ?? 'shortest'
    const extraTurns = reducedMotion ? 0 : (options.extraTurns ?? 0)

    this.target = resolveTargetAngle(this.angle, desiredAngle, direction, extraTurns)
    this.spring = options.spring ?? defaultSpring

    if (reducedMotion) {
      // A short, direct crossfade-style move -- no sweeping, no flourish.
      this.reducedMotionFrom = this.angle
      this.reducedMotionElapsed = 0
      this.velocity = 0
    } else {
      this.reducedMotionElapsed = null
    }
  }

  /** Advances the spring by `dt` seconds (typically the delta between two rAF callbacks). */
  update(dt: number): void {
    const step = Math.min(Math.max(dt, 0), MAX_STEP)

    if (this.reducedMotionElapsed !== null) {
      this.reducedMotionElapsed += step
      const t = Math.min(1, this.reducedMotionElapsed / REDUCED_MOTION_DURATION)
      const eased = 1 - Math.pow(1 - t, 3) // ease-out cubic
      this.angle = this.reducedMotionFrom + (this.target - this.reducedMotionFrom) * eased
      if (t >= 1) {
        this.angle = this.target
        this.reducedMotionElapsed = null
      }
      return
    }

    if (this.isSettled) {
      this.angle = this.target
      this.velocity = 0
      return
    }

    // Critically/under-damped spring, normalized to unit mass. `response`
    // is converted to an angular frequency the way Apple's UIKit spring
    // sample code does it, so "response" reads as a friendly knob instead
    // of raw stiffness/damping constants.
    const angularFrequency = TAU / Math.max(this.spring.response, 0.001)
    const stiffness = angularFrequency * angularFrequency
    const damping = 2 * this.spring.dampingRatio * angularFrequency

    const displacement = this.angle - this.target
    const acceleration = -stiffness * displacement - damping * this.velocity

    // Semi-implicit (symplectic) Euler: stable for spring integration and
    // cheap enough to run per hand, per frame, across a whole panel.
    this.velocity += acceleration * step
    this.angle += this.velocity * step
  }
}

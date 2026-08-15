// App shell: a devicePixelRatio-aware canvas and a requestAnimationFrame
// loop. The demo below drives one large clock to show off the rotation
// primitive in src/animate.ts -- varied directions, multi-turn sweeps, and
// mid-flight interruption on click.

import { drawClock, type ClockHandAngles } from './clock'
import { RotationSpring, type Direction } from './animate'

// Resolved through functions with explicit return types (rather than a
// narrowed `const` at module scope) so the non-null guarantee survives
// being captured by the closures below -- TypeScript's narrowing doesn't
// carry into nested function bodies, but a declared return type does.
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

const SIZE = 360 // logical (CSS) pixels

function resize(): void {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(SIZE * dpr)
  canvas.height = Math.round(SIZE * dpr)
  canvas.style.width = `${SIZE}px`
  canvas.style.height = `${SIZE}px`
  // Draw in logical pixels from here on; this scale is what keeps the
  // clock crisp regardless of the display's device pixel ratio.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
}

resize()
window.addEventListener('resize', resize)

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
let reducedMotion = reducedMotionQuery.matches
reducedMotionQuery.addEventListener('change', (event) => {
  reducedMotion = event.matches
})

function pickRandom<T>(items: readonly T[]): T {
  const item = items[Math.floor(Math.random() * items.length)]
  if (item === undefined) throw new Error('pickRandom: empty array')
  return item
}

const DIRECTIONS: readonly Direction[] = ['clockwise', 'counterclockwise', 'shortest']

const hourHand = new RotationSpring(Math.random() * Math.PI * 2)
const minuteHand = new RotationSpring(Math.random() * Math.PI * 2)

/** Sends both hands to a new random pose, using a varied direction and an occasional multi-turn sweep so the primitive's range is visible. */
function randomPose(): void {
  hourHand.rotateTo(Math.random() * Math.PI * 2, {
    direction: pickRandom(DIRECTIONS),
    extraTurns: Math.floor(Math.random() * 2),
    spring: { dampingRatio: 1, response: 0.6 },
    reducedMotion,
  })
  minuteHand.rotateTo(Math.random() * Math.PI * 2, {
    direction: pickRandom(DIRECTIONS),
    extraTurns: Math.floor(Math.random() * 3),
    spring: { dampingRatio: 0.86, response: 0.5 },
    reducedMotion,
  })
}

const POSE_INTERVAL_MS = 3000
let poseTimer: ReturnType<typeof setTimeout> | undefined

function scheduleNextPose(): void {
  clearTimeout(poseTimer)
  poseTimer = setTimeout(triggerPose, POSE_INTERVAL_MS)
}

function triggerPose(): void {
  randomPose()
  scheduleNextPose()
}

// Clicking retargets immediately -- the spring reads its current angle and
// velocity, so the hands redirect smoothly mid-flight instead of jumping.
canvas.addEventListener('click', triggerPose)

triggerPose()

let lastTime = performance.now()

function frame(now: number): void {
  const dt = (now - lastTime) / 1000
  lastTime = now

  hourHand.update(dt)
  minuteHand.update(dt)

  ctx.clearRect(0, 0, SIZE, SIZE)
  const angles: ClockHandAngles = {
    hourAngle: hourHand.currentAngle,
    minuteAngle: minuteHand.currentAngle,
  }
  drawClock(ctx, SIZE / 2, SIZE / 2, SIZE / 2 - 8, angles)

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

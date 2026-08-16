// App shell: a devicePixelRatio-aware, full-viewport canvas that renders
// the 24-clock time panel. Drives 48 RotationSprings (2 hands x 6 clocks
// x 4 digits) -- one per hand -- so a future minute-change choreography
// pass has springs already in place to retarget, but for now there is no
// choreography: on load, and on every retarget, springs jump straight to
// their new pose (see `initialPoseSprings` and the reduced-motion default
// below). The panel keeps ticking on its own by polling the clock once a
// second and retargeting whenever the displayed minute changes.

import { drawPanel, type ClockRenderer, type PanelPose } from './panel'
import { digitPose, type Digit, type DigitPose } from './font'
import { RotationSpring } from './animate'
import type { ClockHandAngles } from './clock'
import { drawClockPixel, DRIFT_PALETTE, PIXEL_LIT_PALETTE, PIXEL_PALETTE } from './clock-pixel'

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

// --- Style exploration: `?style=` picks a rendering variant. -------------
// Design exploration only (see clock-pixel.ts) -- not part of the panel's
// real feature surface yet, so it lives entirely in main.ts's wiring.

type StyleId = 'default' | 'pixel' | 'pixel-lit' | 'drift'

function parseStyleParam(): StyleId {
  const raw = new URLSearchParams(window.location.search).get('style')
  if (raw === 'pixel' || raw === 'pixel-lit' || raw === 'drift') return raw
  return 'default'
}

const styleId = parseStyleParam()

/** Same light angle as clock.ts's defaultClockStyle, so the lit pixel variants stay comparable to the original's directional light. */
const LIGHT_ANGLE = -0.4

const pixelRenderer: ClockRenderer | null =
  styleId === 'pixel'
    ? (ctx, cx, cy, radius, angles) =>
        drawClockPixel(ctx, cx, cy, radius, angles, PIXEL_PALETTE, {
          lit: false,
          lightAngle: LIGHT_ANGLE,
        })
    : styleId === 'pixel-lit'
      ? (ctx, cx, cy, radius, angles) =>
          drawClockPixel(ctx, cx, cy, radius, angles, PIXEL_LIT_PALETTE, {
            lit: true,
            lightAngle: LIGHT_ANGLE,
          })
      : styleId === 'drift'
        ? (ctx, cx, cy, radius, angles) =>
            drawClockPixel(ctx, cx, cy, radius, angles, DRIFT_PALETTE, {
              lit: true,
              lightAngle: LIGHT_ANGLE,
            })
        : null

/**
 * Offscreen render scale for the pixel styles: the panel draws at 1/6 of its
 * native size onto `pixelCanvas`, then main.ts's frame loop blits it back up
 * with `imageSmoothingEnabled = false` -- the same crisp-upscale technique
 * pixel-drift's own Renderer uses (`imageRendering: 'pixelated'` +
 * `imageSmoothingEnabled = false`, see `packages/engine/src/render/renderer.ts`)
 * -- so every edge in the final image is a hard square pixel, not an
 * anti-aliased curve shrunk down.
 */
const PIXEL_SCALE_DIVISOR = 6

const pixelCanvas: HTMLCanvasElement | null = pixelRenderer !== null ? document.createElement('canvas') : null
const pixelCtx: CanvasRenderingContext2D | null = pixelCanvas !== null ? requireContext(pixelCanvas) : null

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

  // The offscreen pixel canvas is deliberately low-res and untransformed --
  // no dpr scaling -- since its whole job is to BE the coarse pixel grid
  // that gets upscaled, not to be crisp on its own.
  if (pixelCanvas !== null) {
    pixelCanvas.width = Math.max(1, Math.round(logicalWidth / PIXEL_SCALE_DIVISOR))
    pixelCanvas.height = Math.max(1, Math.round(logicalHeight / PIXEL_SCALE_DIVISOR))
  }
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
 * Parses a `?time=HHMM` or `?time=HH:MM` query override into 4 raw
 * digits. Deliberately does not validate the result as a real time --
 * this is a QA affordance for reviewing the digit font, so any 4 digits
 * (`?time=89:06`) must render, not just plausible clock times.
 */
function parseTimeOverride(): DigitTuple | null {
  const raw = new URLSearchParams(window.location.search).get('time')
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

// Live clock only: re-check once a second and retarget whenever the
// displayed minute actually changes. The ?time= override is a fixed QA
// snapshot -- it never ticks.
if (timeOverride === null) {
  setInterval(() => {
    const nextDigits = currentDigits()
    if (nextDigits.every((digit, index) => digit === lastDigits[index])) return
    lastDigits = nextDigits
    const [n0, n1, n2, n3] = nextDigits
    retargetDigit(springs[0], digitPose(assertDigit(n0)))
    retargetDigit(springs[1], digitPose(assertDigit(n1)))
    retargetDigit(springs[2], digitPose(assertDigit(n2)))
    retargetDigit(springs[3], digitPose(assertDigit(n3)))
  }, 1000)
}

let lastTime = performance.now()

function frame(now: number): void {
  const dt = (now - lastTime) / 1000
  lastTime = now

  for (const digit of springs) {
    for (const clock of digit) {
      clock.hour.update(dt)
      clock.minute.update(dt)
    }
  }

  const pose: PanelPose = [
    digitSpringAngles(springs[0]),
    digitSpringAngles(springs[1]),
    digitSpringAngles(springs[2]),
    digitSpringAngles(springs[3]),
  ]

  if (pixelRenderer !== null && pixelCanvas !== null && pixelCtx !== null) {
    // Draw the panel at low res onto the offscreen canvas, then blit it back
    // up onto the real (dpr-scaled) canvas with smoothing off, so the
    // upscale stays hard-edged instead of blurring back into a soft shape.
    pixelCtx.clearRect(0, 0, pixelCanvas.width, pixelCanvas.height)
    drawPanel(pixelCtx, pixelCanvas.width, pixelCanvas.height, pose, pixelRenderer)

    ctx.clearRect(0, 0, logicalWidth, logicalHeight)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(
      pixelCanvas,
      0,
      0,
      pixelCanvas.width,
      pixelCanvas.height,
      0,
      0,
      logicalWidth,
      logicalHeight,
    )
  } else {
    ctx.clearRect(0, 0, logicalWidth, logicalHeight)
    drawPanel(ctx, logicalWidth, logicalHeight, pose)
  }

  requestAnimationFrame(frame)
}

requestAnimationFrame(frame)

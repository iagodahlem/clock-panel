// Pixel-art clock renderers -- design exploration, alternates to clock.ts's
// soft-lit gradient face. These draw FLAT: no gradients, no soft rim-light
// stroke. Definition comes from a solid outline (pixel-drift's `outline()`
// convention: `pixels.ts` in the pixel-drift repo) and, for the "lit"
// variants, a quantized rim-highlight band plus a hard offset drop shadow --
// pixel art's native way of doing directional light, translated from
// clock.ts's `buildFaceGradient`/`buildRimLightGradient` continuous blend.
//
// The actual chunky pixelation (visible square pixels, not just flat fills)
// comes from main.ts drawing through these renderers onto a small offscreen
// canvas and upscaling with `imageSmoothingEnabled = false` -- see main.ts's
// PIXEL_SCALE_DIVISOR. These renderers only need to draw FLAT and CHUNKY
// (square hand caps, no anti-aliasing-dependent softness); the downscale
// does the rest.

import type { ClockHandAngles } from './clock'

const TAU = Math.PI * 2

export interface PixelClockPalette {
  /** Flat face fill -- no gradient. */
  readonly face: string
  /** 1px-style outline stroked around the disc's edge. */
  readonly outline: string
  readonly hourHand: string
  readonly minuteHand: string
  /**
   * Flat rim-highlight band on the light-facing side. Omit (with `lit:
   * false`) for the plain "pixel" variant -- no light cue at all, just the
   * outline.
   */
  readonly lightEdge?: string
  /**
   * Hard offset drop-shadow fill (may carry alpha, e.g. `#rrggbbaa`).
   * Drawn as a silhouette offset by a few pixels before the face, the same
   * technique as pixel-drift's `withShadow()` -- an offset blob, not a blur.
   */
  readonly shadowEdge?: string
}

export interface PixelClockOptions {
  /** Whether to draw the quantized rim-highlight + offset shadow. */
  readonly lit: boolean
  /** Same convention as ClockStyle.lightAngle: radians, 0 = 12 o'clock, positive clockwise. */
  readonly lightAngle: number
}

/** Flat, no-light "pixel" preset -- same base colors as clock.ts's defaultClockStyle, so the comparison is about rendering TECHNIQUE, not palette. */
export const PIXEL_PALETTE: PixelClockPalette = {
  face: '#161616',
  outline: '#454545',
  hourHand: '#f5f5f5',
  minuteHand: '#f5f5f5',
}

/** Same base colors as PIXEL_PALETTE, plus the quantized light/shadow cue for the "pixel-lit" variant. */
export const PIXEL_LIT_PALETTE: PixelClockPalette = {
  ...PIXEL_PALETTE,
  lightEdge: '#8c8c8c',
  shadowEdge: 'rgba(0, 0, 0, 0.55)',
}

/**
 * "drift" preset -- the worker's proposed personal-touch variant. Every
 * color here is lifted VERBATIM from the pixel-drift repo, not a generic
 * 8-bit palette:
 *  - face: the reflective-glass "DK" tone from
 *    `packages/engine/src/art/model/cars/ae86-paint.ts`'s
 *    `reflectiveGlassPainter` (`#23262e`).
 *  - lightEdge: that same painter's "HI" tone (`#39404c`).
 *  - outline: `pixels.ts`'s exact `BLACK_OUTLINE` constant (`#181225`).
 *  - shadowEdge: `pixels.ts`'s exact `DEFAULT_SHADOW` constant (`#1a142855`).
 *  - hourHand / minuteHand: the car-red sprite's R2/Y1 accents
 *    (`car-red.ts`) -- red body, yellow headlight, the same two-color trick
 *    the sprite itself uses so the hands read apart at a glance.
 */
export const DRIFT_PALETTE: PixelClockPalette = {
  face: '#23262e',
  outline: '#181225',
  hourHand: '#DE4A48',
  minuteHand: '#F6E056',
  lightEdge: '#39404c',
  shadowEdge: '#1a142855',
}

function drawHandPixel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  length: number,
  width: number,
  color: string,
): void {
  const x = cx + Math.sin(angle) * length
  const y = cy - Math.cos(angle) * length

  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(x, y)
  // Square (not round) caps -- the chunky, blocky hand-end pixel art calls for.
  ctx.lineCap = 'square'
  ctx.lineWidth = Math.max(1, width)
  ctx.strokeStyle = color
  ctx.stroke()
}

/**
 * Draws one clock, flat pixel-art style: solid face, 1px-style outline, and
 * -- when `options.lit` -- a quantized rim-highlight band plus a hard offset
 * drop shadow standing in for clock.ts's soft gradient + conic rim light.
 * Hand geometry (length/width ratios) is chunkier than clock.ts's defaults
 * so the strokes survive a 6x downscale without vanishing to sub-pixel width.
 */
export function drawClockPixel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angles: ClockHandAngles,
  palette: PixelClockPalette,
  options: PixelClockOptions,
): void {
  ctx.save()

  if (options.lit && palette.shadowEdge !== undefined) {
    // Hard offset drop shadow: an offset silhouette drawn BEFORE the face,
    // pixel-drift's withShadow() technique -- an offset blob, never a blur.
    const shadowOffset = Math.max(1, radius * 0.14)
    ctx.beginPath()
    ctx.arc(cx + shadowOffset, cy + shadowOffset, radius, 0, TAU)
    ctx.fillStyle = palette.shadowEdge
    ctx.fill()
  }

  // Flat face -- no gradient.
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, TAU)
  ctx.fillStyle = palette.face
  ctx.fill()

  if (options.lit && palette.lightEdge !== undefined) {
    // Quantized rim: a flat, hard-edged band on the light-facing arc only --
    // no falloff gradient, just on/off, the pixel-art way of doing a rim
    // catch-light.
    const rimWidth = Math.max(1, radius * 0.18)
    const bandArc = Math.PI * 0.55
    const lightCanvasAngle = options.lightAngle - Math.PI / 2
    ctx.beginPath()
    ctx.arc(
      cx,
      cy,
      radius - rimWidth / 2,
      lightCanvasAngle - bandArc / 2,
      lightCanvasAngle + bandArc / 2,
    )
    ctx.lineWidth = rimWidth
    ctx.strokeStyle = palette.lightEdge
    ctx.stroke()
  }

  // 1px-style outline around the disc -- the definition cue that replaces
  // the soft rim light entirely in the un-lit "pixel" variant, and frames
  // the lit variants' rim band too.
  const outlineWidth = Math.max(1, radius * 0.09)
  ctx.beginPath()
  ctx.arc(cx, cy, radius - outlineWidth / 2, 0, TAU)
  ctx.lineWidth = outlineWidth
  ctx.strokeStyle = palette.outline
  ctx.stroke()

  drawHandPixel(ctx, cx, cy, angles.hourAngle, radius * 0.5, radius * 0.16, palette.hourHand)
  drawHandPixel(ctx, cx, cy, angles.minuteAngle, radius * 0.78, radius * 0.11, palette.minuteHand)

  ctx.restore()
}

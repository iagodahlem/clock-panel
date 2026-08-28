// Panel layout and rendering: arranges 24 clocks (4 digits x a 2x3 grid
// each) into the ClockClock-24-style time display, fit to and centered
// within a canvas of any size or devicePixelRatio.
//
// Layout is computed in an abstract "unit" space where the pitch between
// adjacent clock centers is 1, independent of pixels entirely. Only at
// draw time is a single fit scale -- canvas size vs. the panel's
// unit-space bounding box -- applied to convert unit coordinates into
// real, logical-pixel positions and a real pixel clock radius. That last
// part matters: drawClock's internal minimum-stroke-width clamps
// (`Math.max(1, ...)`) are written in real pixel terms. Wrapping the draw
// calls in a canvas scale transform instead -- drawing at the tiny
// unit-space radius and letting the transform blow it up -- would trip
// those clamps at their 1px floor and produce oversized strokes once
// scaled. Multiplying through to real pixels before calling drawClock
// keeps the clamps meaningful at every canvas size.

import { drawClock, defaultClockStyle, type ClockHandAngles, type ClockStyle } from './clock'
import type { DigitPose } from './font'

const DIGIT_COUNT = 4 // HH:MM

/** Center-to-center distance between adjacent clocks within a digit, in unit space. */
const NODE_PITCH = 1
/** Clock radius, in unit space -- a bit under half the pitch, so neighboring clocks stay visually separate. */
const CLOCK_RADIUS_UNITS = 0.42
/**
 * Extra gap between digit groups, beyond the node pitch, in unit space.
 * Must clear 2 * CLOCK_RADIUS_UNITS with room to spare, or the nearest
 * clocks of adjacent digits end up closer together than clocks within
 * the same digit -- the opposite of reading as separate groups.
 */
const DIGIT_GAP_UNITS = 1.3
/** The panel fills this fraction of the fitted bounding box, leaving a small margin on every side. */
const FIT_MARGIN = 0.92

export interface ClockCenter {
  readonly x: number
  readonly y: number
}

/** A pointer position over the canvas, in the same logical (CSS) pixel space as canvasWidth/canvasHeight. */
export interface PanelPointer {
  readonly x: number
  readonly y: number
}

/**
 * The resolved light one clock draws with, computed once per frame in
 * controller.ts from that clock's own spring-eased angle and its distance
 * to the pointer. `intensity` is 0-1: 0 leaves the style's resting look
 * untouched, 1 is as close as the near/far radii let it get. See
 * styleWithLight for how the two combine.
 */
export interface ClockLight {
  readonly lightAngle: number
  readonly intensity: number
}

/** One center per digit node, in the same fixed order as font.ts's DigitPose: top-left, top-right, mid-left, mid-right, bottom-left, bottom-right. */
type DigitCenters = readonly [
  ClockCenter,
  ClockCenter,
  ClockCenter,
  ClockCenter,
  ClockCenter,
  ClockCenter,
]

/** Hand angles for all 24 clocks, grouped the same way as font.ts: one 6-tuple per digit, HH:MM order. Typically the live, spring-animated angles from main.ts rather than the font table's resting targets directly, so hands can be mid-transition. */
export type PanelPose = readonly [DigitPose, DigitPose, DigitPose, DigitPose]

const PANEL_WIDTH_UNITS = DIGIT_COUNT * NODE_PITCH + (DIGIT_COUNT - 1) * DIGIT_GAP_UNITS
const PANEL_HEIGHT_UNITS = 2 * NODE_PITCH // 3 rows -> 2 gaps
const PANEL_VISUAL_WIDTH_UNITS = PANEL_WIDTH_UNITS + 2 * CLOCK_RADIUS_UNITS
const PANEL_VISUAL_HEIGHT_UNITS = PANEL_HEIGHT_UNITS + 2 * CLOCK_RADIUS_UNITS

function node(digitIndex: number, col: number, row: number): ClockCenter {
  const digitOriginX = digitIndex * (NODE_PITCH + DIGIT_GAP_UNITS)
  return {
    x: digitOriginX + col * NODE_PITCH - PANEL_WIDTH_UNITS / 2,
    y: row * NODE_PITCH - PANEL_HEIGHT_UNITS / 2,
  }
}

function digitCenters(digitIndex: number): DigitCenters {
  return [
    node(digitIndex, 0, 0), // top-left
    node(digitIndex, 1, 0), // top-right
    node(digitIndex, 0, 1), // mid-left
    node(digitIndex, 1, 1), // mid-right
    node(digitIndex, 0, 2), // bottom-left
    node(digitIndex, 1, 2), // bottom-right
  ]
}

const PANEL_CENTERS: readonly [DigitCenters, DigitCenters, DigitCenters, DigitCenters] = [
  digitCenters(0),
  digitCenters(1),
  digitCenters(2),
  digitCenters(3),
]

export interface Fit {
  readonly scale: number
  readonly radius: number
  readonly originX: number
  readonly originY: number
}

function computeFit(canvasWidth: number, canvasHeight: number): Fit {
  const scale =
    Math.min(canvasWidth / PANEL_VISUAL_WIDTH_UNITS, canvasHeight / PANEL_VISUAL_HEIGHT_UNITS) *
    FIT_MARGIN
  return {
    scale,
    radius: CLOCK_RADIUS_UNITS * scale,
    originX: canvasWidth / 2,
    originY: canvasHeight / 2,
  }
}

/** Public entry point for computeFit -- controller.ts needs the same fit drawPanel itself resolves, to place its light springs' targets at the same clock centers drawPanel will actually draw at. */
export function computePanelFit(canvasWidth: number, canvasHeight: number): Fit {
  return computeFit(canvasWidth, canvasHeight)
}

/** Every clock's center in real pixel space for a given fit, flattened in the same digit-major, TL/TR/ML/MR/BL/BR order drawPanel iterates -- index i here is the clock drawPanel's own `lights[i]` applies to. */
export function flatPanelCenters(fit: Fit): readonly ClockCenter[] {
  const centers: ClockCenter[] = []
  for (const digitCenters of PANEL_CENTERS) {
    for (const center of digitCenters) {
      centers.push({
        x: fit.originX + center.x * fit.scale,
        y: fit.originY + center.y * fit.scale,
      })
    }
  }
  return centers
}

/** The panel's own visual bounding box diagonal, in real pixels, for a given fit -- controller.ts sizes the far edge of the pointer-light falloff off this rather than the canvas, so the ramp scales with the panel itself and not with empty margin around it. */
export function panelDiagonal(fit: Fit): number {
  return Math.hypot(PANEL_VISUAL_WIDTH_UNITS * fit.scale, PANEL_VISUAL_HEIGHT_UNITS * fit.scale)
}

/**
 * The clock-angle from one clock's own center toward the pointer: radians,
 * 0 = 12 o'clock, positive clockwise -- the same convention the hands and
 * ClockStyle.lightAngle use, so this can be handed straight to lightAngle.
 *
 * Per clock, not per panel, on purpose: a single shared direction would
 * swing all 24 faces in lockstep, which reads as one big rotating gradient.
 * Measuring from each disc's own center is what makes the panel read as 24
 * separate wells catching one light that moves -- the clock the pointer sits
 * on is lit from a different side than the one across the panel from it.
 */
export function lightAngleToward(cx: number, cy: number, pointer: PanelPointer): number {
  return Math.atan2(pointer.x - cx, cy - pointer.y)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/**
 * The style one clock draws with: the shared style untouched when this
 * clock has no light of its own (null -- the resting look, same as before a
 * pointer ever moved), or a copy with its angle aimed per `light.lightAngle`
 * and, as `light.intensity` climbs toward 1, blended toward the style's
 * "Near" fields -- a harder, deeper look for a light that has closed in.
 * Direction and depth are the same physical thing changing together as a
 * point light approaches a well, hence the one function for both.
 */
function styleWithLight(style: ClockStyle, light: ClockLight | null): ClockStyle {
  if (light === null) return style
  const mix = Math.min(1, Math.max(0, light.intensity))
  if (mix === 0) return { ...style, lightAngle: light.lightAngle }
  return {
    ...style,
    lightAngle: light.lightAngle,
    wellShadowGain: lerp(style.wellShadowGain, style.wellShadowGainNear, mix),
    wellShadowWidthRatio: lerp(style.wellShadowWidthRatio, style.wellShadowWidthRatioNear, mix),
    rimLightMaxAlpha: lerp(style.rimLightMaxAlpha, style.rimLightMaxAlphaNear, mix),
  }
}

function drawOne(
  ctx: CanvasRenderingContext2D,
  fit: Fit,
  center: ClockCenter,
  angles: ClockHandAngles,
  style: ClockStyle,
  light: ClockLight | null,
): void {
  const cx = fit.originX + center.x * fit.scale
  const cy = fit.originY + center.y * fit.scale
  drawClock(ctx, cx, cy, fit.radius, angles, styleWithLight(style, light))
}

function drawDigit(
  ctx: CanvasRenderingContext2D,
  fit: Fit,
  centers: DigitCenters,
  angles: DigitPose,
  style: ClockStyle,
  lights: readonly ClockLight[] | null,
  baseIndex: number,
): void {
  const [centerTL, centerTR, centerML, centerMR, centerBL, centerBR] = centers
  const [poseTL, poseTR, poseML, poseMR, poseBL, poseBR] = angles
  const at = (offset: number): ClockLight | null => lights?.[baseIndex + offset] ?? null
  drawOne(ctx, fit, centerTL, poseTL, style, at(0))
  drawOne(ctx, fit, centerTR, poseTR, style, at(1))
  drawOne(ctx, fit, centerML, poseML, style, at(2))
  drawOne(ctx, fit, centerMR, poseMR, style, at(3))
  drawOne(ctx, fit, centerBL, poseBL, style, at(4))
  drawOne(ctx, fit, centerBR, poseBR, style, at(5))
}

/**
 * Draws the full 24-clock time panel, fit to and centered within a canvas
 * of the given logical (CSS) pixel size.
 *
 * `lights`, when given, is one ClockLight per clock (see flatPanelCenters
 * for the index order) -- each clock's own spring-eased angle and pointer-
 * distance intensity, computed once per frame in controller.ts. Pass null
 * (the default) for the resting look: every clock lit from the shared
 * style's own lightAngle with no intensity boost, which is what a device
 * that never sends a pointer, or a panel under reduced motion, keeps seeing.
 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  pose: PanelPose,
  style: ClockStyle = defaultClockStyle,
  lights: readonly ClockLight[] | null = null,
): void {
  const fit = computeFit(canvasWidth, canvasHeight)
  const [centers0, centers1, centers2, centers3] = PANEL_CENTERS
  const [pose0, pose1, pose2, pose3] = pose
  drawDigit(ctx, fit, centers0, pose0, style, lights, 0)
  drawDigit(ctx, fit, centers1, pose1, style, lights, 6)
  drawDigit(ctx, fit, centers2, pose2, style, lights, 12)
  drawDigit(ctx, fit, centers3, pose3, style, lights, 18)
}

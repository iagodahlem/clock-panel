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

interface ClockCenter {
  readonly x: number
  readonly y: number
}

/** A pointer position over the canvas, in the same logical (CSS) pixel space as canvasWidth/canvasHeight. */
export interface PanelPointer {
  readonly x: number
  readonly y: number
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

interface Fit {
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

/**
 * The style one clock draws with: the shared style untouched when no pointer
 * is on the canvas, or a copy with its light aimed at the pointer when there
 * is one. One field, because one field is the whole lighting model -- the
 * inner shadow, the bright crescent and the hand shadows are all derived
 * from lightAngle inside drawClock, so they can never drift apart.
 */
function styleLitToward(
  style: ClockStyle,
  cx: number,
  cy: number,
  pointer: PanelPointer | null,
): ClockStyle {
  if (pointer === null) return style
  return { ...style, lightAngle: lightAngleToward(cx, cy, pointer) }
}

function drawOne(
  ctx: CanvasRenderingContext2D,
  fit: Fit,
  center: ClockCenter,
  angles: ClockHandAngles,
  style: ClockStyle,
  pointer: PanelPointer | null,
): void {
  const cx = fit.originX + center.x * fit.scale
  const cy = fit.originY + center.y * fit.scale
  drawClock(ctx, cx, cy, fit.radius, angles, styleLitToward(style, cx, cy, pointer))
}

function drawDigit(
  ctx: CanvasRenderingContext2D,
  fit: Fit,
  centers: DigitCenters,
  angles: DigitPose,
  style: ClockStyle,
  pointer: PanelPointer | null,
): void {
  const [centerTL, centerTR, centerML, centerMR, centerBL, centerBR] = centers
  const [poseTL, poseTR, poseML, poseMR, poseBL, poseBR] = angles
  drawOne(ctx, fit, centerTL, poseTL, style, pointer)
  drawOne(ctx, fit, centerTR, poseTR, style, pointer)
  drawOne(ctx, fit, centerML, poseML, style, pointer)
  drawOne(ctx, fit, centerMR, poseMR, style, pointer)
  drawOne(ctx, fit, centerBL, poseBL, style, pointer)
  drawOne(ctx, fit, centerBR, poseBR, style, pointer)
}

/**
 * Draws the full 24-clock time panel, fit to and centered within a canvas
 * of the given logical (CSS) pixel size.
 *
 * `pointer`, when given, makes that position the panel's light source: every
 * clock takes the direction from its own center to the pointer as its light
 * angle, so the shading of all 24 turns together as it moves. Pass null (the
 * default) for the resting look: every clock lit from the shared style's own
 * lightAngle, which is what a device that never sends a pointer keeps seeing.
 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  pose: PanelPose,
  style: ClockStyle = defaultClockStyle,
  pointer: PanelPointer | null = null,
): void {
  const fit = computeFit(canvasWidth, canvasHeight)
  const [centers0, centers1, centers2, centers3] = PANEL_CENTERS
  const [pose0, pose1, pose2, pose3] = pose
  drawDigit(ctx, fit, centers0, pose0, style, pointer)
  drawDigit(ctx, fit, centers1, pose1, style, pointer)
  drawDigit(ctx, fit, centers2, pose2, style, pointer)
  drawDigit(ctx, fit, centers3, pose3, style, pointer)
}

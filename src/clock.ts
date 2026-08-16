// Renders one analog clock face: a subtly filled disc lifted off the
// background with a soft drop shadow, and two hands as rounded line
// segments from the center. Draws in logical (CSS) pixels -- the caller is
// responsible for scaling the canvas context to devicePixelRatio once, up
// front, so the face stays crisp on any display.

const TAU = Math.PI * 2

export interface ClockHandAngles {
  /** Radians. 0 points to 12 o'clock, positive rotates clockwise. */
  hourAngle: number
  /** Radians. 0 points to 12 o'clock, positive rotates clockwise. */
  minuteAngle: number
}

export interface ClockStyle {
  faceColor: string
  /** Shadow color under the face. Keep low-opacity -- this is what reads as depth, not a hard edge. */
  faceShadowColor: string
  /** Shadow blur radius, as a ratio of the clock radius. */
  faceShadowBlurRatio: number
  /** Downward shadow offset, as a ratio of the clock radius. */
  faceShadowOffsetYRatio: number
  hourHandColor: string
  hourHandLengthRatio: number
  hourHandWidthRatio: number
  minuteHandColor: string
  minuteHandLengthRatio: number
  minuteHandWidthRatio: number
}

export const defaultClockStyle: ClockStyle = {
  faceColor: '#161616',
  faceShadowColor: 'rgba(0, 0, 0, 0.6)',
  faceShadowBlurRatio: 0.14,
  faceShadowOffsetYRatio: 0.09,
  hourHandColor: '#f5f5f5',
  hourHandLengthRatio: 0.5,
  hourHandWidthRatio: 0.05,
  minuteHandColor: '#f5f5f5',
  minuteHandLengthRatio: 0.78,
  minuteHandWidthRatio: 0.032,
}

function drawHand(
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
  ctx.lineCap = 'round'
  ctx.lineWidth = Math.max(1, width)
  ctx.strokeStyle = color
  ctx.stroke()
}

/**
 * Draws a single clock centered at (cx, cy) with the given radius, in the
 * given hand pose. Angles are unbounded radians -- only their value modulo
 * a full turn affects where the hand points, so the animation primitive is
 * free to hand in angles that have wound through several full rotations.
 */
export function drawClock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angles: ClockHandAngles,
  style: ClockStyle = defaultClockStyle,
): void {
  ctx.save()

  // Face: a subtle fill lifted off the background by a soft drop shadow --
  // no stroked rim, so the depth reads as physical rather than drawn on.
  // shadowBlur/shadowOffset are specified here in the same logical (CSS)
  // pixel space as everything else; canvas shadows are subject to the
  // current transform, so they stay proportionally correct at any
  // devicePixelRatio without extra scaling.
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, TAU)
  ctx.shadowColor = style.faceShadowColor
  ctx.shadowBlur = radius * style.faceShadowBlurRatio
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = radius * style.faceShadowOffsetYRatio
  ctx.fillStyle = style.faceColor
  ctx.fill()

  // Shadow state is sticky on the context -- clear it so it doesn't bleed
  // onto the hands, which stay crisp with no shadow of their own.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  drawHand(
    ctx,
    cx,
    cy,
    angles.hourAngle,
    radius * style.hourHandLengthRatio,
    radius * style.hourHandWidthRatio,
    style.hourHandColor,
  )
  drawHand(
    ctx,
    cx,
    cy,
    angles.minuteAngle,
    radius * style.minuteHandLengthRatio,
    radius * style.minuteHandWidthRatio,
    style.minuteHandColor,
  )

  ctx.restore()
}

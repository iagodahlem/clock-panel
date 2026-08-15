// Renders one analog clock face: a subtle rim and two hands as rounded
// line segments from the center. Draws in logical (CSS) pixels -- the
// caller is responsible for scaling the canvas context to devicePixelRatio
// once, up front, so the face stays crisp on any display.

const TAU = Math.PI * 2

export interface ClockHandAngles {
  /** Radians. 0 points to 12 o'clock, positive rotates clockwise. */
  hourAngle: number
  /** Radians. 0 points to 12 o'clock, positive rotates clockwise. */
  minuteAngle: number
}

export interface ClockStyle {
  rimColor: string
  rimWidthRatio: number
  hourHandColor: string
  hourHandLengthRatio: number
  hourHandWidthRatio: number
  minuteHandColor: string
  minuteHandLengthRatio: number
  minuteHandWidthRatio: number
}

export const defaultClockStyle: ClockStyle = {
  rimColor: 'rgba(255, 255, 255, 0.16)',
  rimWidthRatio: 0.018,
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

  const rimWidth = Math.max(1, radius * style.rimWidthRatio)
  ctx.beginPath()
  ctx.arc(cx, cy, radius - rimWidth / 2, 0, TAU)
  ctx.lineWidth = rimWidth
  ctx.strokeStyle = style.rimColor
  ctx.stroke()

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

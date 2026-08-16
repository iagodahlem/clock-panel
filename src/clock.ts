// Renders one analog clock face: a disc with a directional rim light and a
// whisper of interior shading -- the two cues that read as a physical,
// lit object rather than a flat sticker -- plus two hands as rounded line
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
  /** Face fill tint on the side facing the light -- a whisper lighter than faceColor, not a bevel. */
  faceHighlightColor: string
  /** Face fill tint on the side facing away from the light -- a whisper darker than faceColor. */
  faceRecessColor: string
  /**
   * Where the light comes from, in the same convention as hand angles:
   * radians, 0 = straight above (12 o'clock), positive rotates clockwise.
   * Drives both the rim light and the interior shading, so re-pointing the
   * light moves both together. Kept as a plain angle (not yet animated) so
   * a future "dynamic light" pass has a single knob to drive.
   */
  lightAngle: number
  /** Peak alpha of the rim light stroke, right at the light angle. */
  rimLightMaxAlpha: number
  /** Rim light stroke width, as a ratio of the clock radius. */
  rimLightWidthRatio: number
  /**
   * How tightly the rim light hugs the light angle. 1 is a plain cosine
   * falloff (bright across a full quarter turn either side); higher values
   * concentrate the highlight closer to the light and fade it out faster,
   * closer to a real edge catching a single light source than a broad glow.
   */
  rimLightFalloffPower: number
  /** Shadow color under the face. Keep low-opacity -- this is a hint of lift, not a hard edge. */
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
  faceHighlightColor: '#242424',
  faceRecessColor: '#0d0d0d',
  lightAngle: -0.4,
  rimLightMaxAlpha: 0.5,
  rimLightWidthRatio: 0.018,
  rimLightFalloffPower: 0.6,
  faceShadowColor: 'rgba(0, 0, 0, 0.4)',
  faceShadowBlurRatio: 0.065,
  faceShadowOffsetYRatio: 0.04,
  hourHandColor: '#f5f5f5',
  hourHandLengthRatio: 0.5,
  hourHandWidthRatio: 0.12,
  minuteHandColor: '#f5f5f5',
  minuteHandLengthRatio: 0.78,
  minuteHandWidthRatio: 0.12,
}

/**
 * A unit vector pointing from the disc's center toward the given clock
 * angle (0 = 12 o'clock, positive clockwise) -- the same mapping drawHand
 * uses, so the light direction and the hands agree on what "angle" means.
 */
function directionForAngle(angle: number): { x: number; y: number } {
  return { x: Math.sin(angle), y: -Math.cos(angle) }
}

/**
 * Builds the interior shading: a linear gradient across the face, a shade
 * lighter on the side facing the light and a shade darker on the far side,
 * with the plain face color at the midpoint. Deliberately subtle -- this is
 * meant to read as a soft dome or recess, not a button bevel.
 */
function buildFaceGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  style: ClockStyle,
): CanvasGradient {
  const dir = directionForAngle(style.lightAngle)
  const gradient = ctx.createLinearGradient(
    cx + dir.x * radius,
    cy + dir.y * radius,
    cx - dir.x * radius,
    cy - dir.y * radius,
  )
  gradient.addColorStop(0, style.faceHighlightColor)
  gradient.addColorStop(0.5, style.faceColor)
  gradient.addColorStop(1, style.faceRecessColor)
  return gradient
}

/**
 * Builds the rim light: a conic gradient stroked along the circle so its
 * alpha varies with angle -- full (subtle) white right at the light angle,
 * fading to fully transparent by the far side. This is the "border only on
 * top, gone by the bottom" feel of a real edge catching a light source,
 * rather than a uniform drawn-on ring.
 *
 * The gradient's seam (seed at offset 0/1) is anchored directly opposite
 * the light, where alpha is already zero, so the wrap-around is invisible.
 * The light itself lands at the gradient's midpoint, offset 0.5.
 */
function buildRimLightGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  style: ClockStyle,
): CanvasGradient {
  // Canvas angle convention (used by createConicGradient and ctx.arc): 0 =
  // 3 o'clock, increasing clockwise. Clock angle convention (lightAngle):
  // 0 = 12 o'clock, increasing clockwise. The two are a quarter turn apart.
  const lightCanvasAngle = style.lightAngle - Math.PI / 2
  const gradient = ctx.createConicGradient(lightCanvasAngle + Math.PI, cx, cy)

  const steps = 48
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // Angular distance from the light: 0 at the light (t = 0.5), PI at the
    // seam (t = 0 and t = 1).
    const delta = Math.PI * Math.abs(1 - 2 * t)
    const falloff = Math.max(0, Math.cos(delta)) ** style.rimLightFalloffPower
    const alpha = style.rimLightMaxAlpha * falloff
    gradient.addColorStop(t, `rgba(255, 255, 255, ${alpha.toFixed(3)})`)
  }

  return gradient
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

  // Face: interior shading gradient, lifted off the background by a faint
  // drop shadow. shadowBlur/shadowOffset are specified here in the same
  // logical (CSS) pixel space as everything else; canvas shadows are
  // subject to the current transform, so they stay proportionally correct
  // at any devicePixelRatio without extra scaling.
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, TAU)
  ctx.shadowColor = style.faceShadowColor
  ctx.shadowBlur = radius * style.faceShadowBlurRatio
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = radius * style.faceShadowOffsetYRatio
  ctx.fillStyle = buildFaceGradient(ctx, cx, cy, radius, style)
  ctx.fill()

  // Shadow state is sticky on the context -- clear it so it doesn't bleed
  // onto the rim light or the hands.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Rim light: stroked just inside the true edge (centered at
  // radius - lineWidth / 2) so its outer edge lands flush with the disc's
  // boundary and none of it bleeds into the background.
  const rimLightWidth = Math.max(1, radius * style.rimLightWidthRatio)
  ctx.beginPath()
  ctx.arc(cx, cy, radius - rimLightWidth / 2, 0, TAU)
  ctx.lineWidth = rimLightWidth
  ctx.strokeStyle = buildRimLightGradient(ctx, cx, cy, style)
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

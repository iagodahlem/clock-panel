// Renders one analog clock face: a disc filled at the page's own background
// color, so the only thing that separates it from the page is its border --
// a wide two-tone rim that is lit on the side the light comes from and dark
// on the opposite side, which is what makes the disc read as a physical,
// bevelled object rather than a flat sticker. Plus two hands as line
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
  /**
   * Flat disc fill. Meant to sit at, or within a hair of, the page's own
   * background color: the face is not what makes the clock visible, the
   * rim is. Kept as a style field rather than hard-coded to the page so
   * the face stays a style decision.
   */
  faceColor: string
  /**
   * Where the light comes from, in the same convention as hand angles:
   * radians, 0 = straight above (12 o'clock), positive rotates clockwise.
   * Drives the rim's lit and shadowed sides. The panel overrides this
   * per clock when a pointer is on the canvas (see drawPanel), so this
   * value is the resting direction used before the first pointer move and
   * on devices that never send one.
   */
  lightAngle: number
  /** The rim's own color, before the lit and shadowed arcs are blended over it. */
  rimBaseColor: string
  /** Peak strength of the lit arc, 0-1: white blended over rimBaseColor right at the light angle. */
  rimLightMaxAlpha: number
  /** Peak strength of the shadowed arc, 0-1: black blended over rimBaseColor directly opposite the light. */
  rimShadowMaxAlpha: number
  /** Rim stroke width, as a ratio of the clock radius. This is the whole depth cue, so it is a real border, not a hairline. */
  rimLightWidthRatio: number
  /**
   * How tightly the lit and shadowed arcs hug their own sides. 1 is a
   * plain cosine falloff (each arc spreading across a full quarter turn
   * either side of its peak); higher values concentrate both closer to
   * their peak and fade them out faster; lower values spread them wider,
   * so more of the ring is either lit or shadowed and less of it sits at
   * the plain base color.
   */
  rimLightFalloffPower: number
  hourHandColor: string
  hourHandLengthRatio: number
  hourHandWidthRatio: number
  minuteHandColor: string
  minuteHandLengthRatio: number
  minuteHandWidthRatio: number
}

export const defaultClockStyle: ClockStyle = {
  faceColor: '#0b0b0b',
  lightAngle: -0.4,
  rimBaseColor: '#2b2b2b',
  rimLightMaxAlpha: 0.62,
  rimShadowMaxAlpha: 1,
  rimLightWidthRatio: 0.06,
  rimLightFalloffPower: 0.6,
  hourHandColor: '#f5f5f5',
  hourHandLengthRatio: 0.5,
  hourHandWidthRatio: 0.12,
  minuteHandColor: '#f5f5f5',
  minuteHandLengthRatio: 0.78,
  minuteHandWidthRatio: 0.12,
}

/**
 * Builds the rim's light and shadow pass: a conic gradient stroked along the
 * ring so its color varies with angle -- white fading in toward the light
 * angle, black fading in toward the opposite side, and fully transparent at
 * the two quarter-turn points between them, where the ring shows its plain
 * base color. Painted over an already-stroked base ring, that is the bevel:
 * a lit arc, a dark arc opposite it, and a neutral band between.
 *
 * The gradient's seam (seed at offset 0/1) is anchored directly opposite the
 * light. Both ends of the gradient hold the same fully-shadowed color there,
 * so the wrap-around is continuous. The light itself lands at the gradient's
 * midpoint, offset 0.5.
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
    const towardLight = Math.cos(delta)
    if (towardLight >= 0) {
      const alpha = style.rimLightMaxAlpha * towardLight ** style.rimLightFalloffPower
      gradient.addColorStop(t, `rgba(255, 255, 255, ${alpha.toFixed(3)})`)
    } else {
      const alpha = style.rimShadowMaxAlpha * (-towardLight) ** style.rimLightFalloffPower
      gradient.addColorStop(t, `rgba(0, 0, 0, ${alpha.toFixed(3)})`)
    }
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

  // Face: a flat fill at the page's background color. It carries no shading
  // of its own -- with the face and the page at the same value, everything
  // that makes the disc read as a disc comes from the rim below.
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, TAU)
  ctx.fillStyle = style.faceColor
  ctx.fill()

  // Rim: stroked just inside the true edge (centered at
  // radius - rimWidth / 2) so its outer edge lands flush with the disc's
  // boundary and none of it bleeds into the background. Two passes over the
  // same ring -- the flat base color, then the light/shadow gradient over
  // it -- so the ring is never fully transparent anywhere and the disc's
  // outline holds all the way around even where the bevel is neutral.
  const rimWidth = Math.max(1, radius * style.rimLightWidthRatio)
  const rimRadius = radius - rimWidth / 2
  ctx.lineWidth = rimWidth
  ctx.beginPath()
  ctx.arc(cx, cy, rimRadius, 0, TAU)
  ctx.strokeStyle = style.rimBaseColor
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx, cy, rimRadius, 0, TAU)
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

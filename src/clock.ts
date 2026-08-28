// Renders one analog clock face as a shallow well pressed *into* the page,
// not a disc raised off it. The face fills at the page's own background
// color, so nothing about the fill makes a clock visible; everything that
// reads as depth is lighting, and all of it comes from one direction:
//
//   - the wall on the side toward the light falls into a soft, wide inner
//     shadow that bleeds onto the face,
//   - the wall half a turn away turns its surface toward the light and
//     catches it as a thin bright crescent,
//   - the raised hands drop soft shadows onto the face, away from the light.
//
// Those three are driven by one `lightAngle`, so when the panel aims that
// angle at the cursor (see panel.ts) all three move together and the light
// reads as a real object passing over the panel.
//
// Which side gets which is the whole difference between a well and a
// button, and it is easy to get backwards: on a recess it is the *far*
// wall whose surface faces the light, so the bright crescent sits opposite
// the light and the shadow sits under it. Flip those two and the same code
// draws a disc sitting on top of the page.
//
// Draws in logical (CSS) pixels -- the caller is responsible for scaling
// the canvas context to devicePixelRatio once, up front, so the face stays
// crisp on any display.

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
   * lighting is. Kept as a style field rather than hard-coded to the page
   * so the face stays a style decision.
   */
  faceColor: string
  /**
   * Where the light comes from, in the same convention as hand angles:
   * radians, 0 = straight above (12 o'clock), positive rotates clockwise.
   * Drives the inner shadow, the bright crescent and the hand shadows
   * together. The panel overrides this per clock, spring-eased toward the
   * pointer whenever one is anywhere in the window (see panel.ts's
   * styleWithLight and controller.ts's light springs), so this value is the
   * resting direction used before the first pointer move, once it leaves
   * the window, and on devices that never send one at all.
   */
  lightAngle: number

  /**
   * How far the well's inner shadow reaches in from the rim at its
   * deepest, as a ratio of the radius. Wide on purpose: this is the shadow
   * of a wall falling across the floor next to it, not an outline.
   */
  wellShadowWidthRatio: number
  /** Peak strength of the inner shadow, 0-1: black blended over the face on the wall toward the light. */
  wellShadowMaxAlpha: number
  /**
   * Angular over-drive on the inner shadow, deliberately above 1. The
   * shadow's angular profile is `gain * cos(angle from the light)`, clamped
   * at 1, so the whole light-facing half saturates to solid and the falloff
   * happens in a fast shoulder near a quarter turn out, which is how the
   * shadow measures on a real recessed panel. Dropping this to 1 gives a
   * gentle cosine that is spread too evenly to read as a wall.
   */
  wellShadowGain: number
  /** Exponent on that cosine. Below 1 broadens the shoulder, above 1 tightens it. */
  wellShadowFalloffPower: number
  /**
   * Floor under the angular profile, so a faint occlusion ring survives all
   * the way around. Without it the two arcs a quarter turn off the light
   * carry no edge cue at all and the disc reads as a pair of loose arcs
   * rather than a circle.
   */
  wellShadowAmbient: number

  /** Bright crescent width, as a ratio of the radius. A hairline: the depth is inside the circle, so the rim itself is only the glint along the far wall. */
  rimLightWidthRatio: number
  /** Peak strength of the crescent, 0-1: white blended over the face at its brightest point. */
  rimLightMaxAlpha: number
  /**
   * How tightly the crescent hugs the point opposite the light. High on
   * purpose: a low exponent spreads the highlight over most of the ring,
   * which is what made an earlier version's highlight look static when the
   * light moved -- there was no edge to watch travel.
   */
  rimLightFalloffPower: number

  /** Peak strength of a hand's shadow on the face, 0-1. */
  handShadowMaxAlpha: number
  /** How far a hand's shadow is displaced away from the light, as a ratio of the radius. */
  handShadowOffsetRatio: number
  /** How far the shadow's softness extends past the hand's own outline, as a ratio of the radius. */
  handShadowBlurRatio: number
  /**
   * Corner radius on each hand's own 4 corners, as a ratio of that hand's
   * width. Small on purpose -- a bar with a rounded-rect end, not a pill:
   * the reference clock's hands are flat bars with a barely-there chamfer,
   * not semicircular round caps.
   */
  handCornerRadiusRatio: number
  /**
   * Radius of a true semicircular cap on the minute hand's pivot-side end
   * only, as a ratio of the minute hand's own width -- 0.5 is a full round
   * cap. Unlike handCornerRadiusRatio's chamfer, this also pushes the bar's
   * near edge back past the pivot by the same radius (the way a round line
   * cap extends past its endpoint), which is what lets the cap read as a
   * soft nub peeking past the hour hand's square corner in the reference
   * rather than sitting flush with it. The hour hand, and the minute hand's
   * own tip, keep the flat chamfer above instead.
   */
  minuteHandPivotCapRadiusRatio: number

  /**
   * The following three fields are only read by panel.ts's styleWithLight,
   * never by drawClock directly: they are the far end of an interpolation
   * range whose near end is the field of the same base name above. As a
   * pointer-driven light closes in on a clock, panel.ts blends from the
   * resting value toward these, so the well reads as harder and deeper the
   * closer the light gets rather than only rotating the same resting look.
   * At zero intensity (no pointer, or one too far away to matter) the blend
   * lands exactly on the resting value, so these three change nothing about
   * how the panel looks before a pointer ever moves.
   */
  /** Upper end of wellShadowGain's range at closest approach: tightens the shadow's falloff shoulder further than the resting value already does. */
  wellShadowGainNear: number
  /** Upper end of wellShadowWidthRatio's range at closest approach: the shadow reaches further in from the rim. */
  wellShadowWidthRatioNear: number
  /** Upper end of rimLightMaxAlpha's range at closest approach: the crescent brightens past its resting peak. */
  rimLightMaxAlphaNear: number

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

  wellShadowWidthRatio: 0.42,
  wellShadowMaxAlpha: 1,
  wellShadowGain: 1.8,
  wellShadowFalloffPower: 0.6,
  wellShadowAmbient: 0.22,

  rimLightWidthRatio: 0.018,
  rimLightMaxAlpha: 0.5,
  rimLightFalloffPower: 10,

  handShadowMaxAlpha: 0.22,
  handShadowOffsetRatio: 0.018,
  handShadowBlurRatio: 0.016,
  handCornerRadiusRatio: 0.08,
  minuteHandPivotCapRadiusRatio: 0.5,

  wellShadowGainNear: 1.9,
  wellShadowWidthRatioNear: 0.46,
  rimLightMaxAlphaNear: 0.65,

  hourHandColor: '#f5f5f5',
  hourHandLengthRatio: 0.831,
  hourHandWidthRatio: 0.214,
  minuteHandColor: '#f5f5f5',
  minuteHandLengthRatio: 0.957,
  minuteHandWidthRatio: 0.214,
}

/** Concentric passes the inner shadow's radial falloff is built from. Capped down on small clocks so no pass lands thinner than about a pixel. */
const WELL_SHADOW_MAX_STEPS = 10
/** Fraction of the shadow's width the alpha ramps across before it saturates. The rest of the band, nearest the rim, sits at full strength. */
const WELL_SHADOW_RAMP = 0.6
/** Exponent on that ramp. Above 1 keeps the shadow's inner edge from ending in a visible line. */
const WELL_SHADOW_RAMP_POWER = 1.4
/** Color stops per conic gradient. High enough that the tight crescent is not flattened by the linear interpolation between stops. */
const ANGULAR_GRADIENT_STOPS = 64
/** Stacked passes a hand shadow's softness is built from, widest and faintest first. */
const HAND_SHADOW_STEPS = 4

/**
 * The unit vector, in canvas coordinates, pointing from a clock's center
 * toward the light. Clock angles are 0 = 12 o'clock and positive
 * clockwise, which is a quarter turn off the canvas's own convention --
 * hence sin for x and negative cos for y, the same pair drawHand uses.
 */
export function lightDirection(lightAngle: number): { readonly x: number; readonly y: number } {
  return { x: Math.sin(lightAngle), y: -Math.cos(lightAngle) }
}

/**
 * How far a hand's shadow is displaced from the hand itself: straight away
 * from the light, scaled to the clock. This is the one piece of the model
 * whose direction is checkable without rendering anything, and getting its
 * sign wrong is the difference between hands that float above the face and
 * hands that look glued to it, so it is pinned by a unit test.
 */
export function handShadowOffset(
  lightAngle: number,
  radius: number,
  style: ClockStyle = defaultClockStyle,
): { readonly x: number; readonly y: number } {
  const light = lightDirection(lightAngle)
  const distance = radius * style.handShadowOffsetRatio
  return { x: -light.x * distance, y: -light.y * distance }
}

/**
 * Strength of the well's inner shadow, 0-1, `delta` radians around the rim
 * from the light. Peaks at the light (delta 0) because that is the wall
 * turned away from it, holds solid across most of that half, then drops
 * through a fast shoulder to the ambient floor.
 */
export function wellShadowStrength(delta: number, style: ClockStyle = defaultClockStyle): number {
  const facing = Math.cos(delta)
  const lit =
    facing <= 0 ? 0 : Math.min(1, style.wellShadowGain * facing ** style.wellShadowFalloffPower)
  return Math.max(style.wellShadowAmbient, lit)
}

/**
 * Strength of the bright crescent, 0-1, `delta` radians around the rim from
 * the light. Peaks half a turn away, at the far wall -- the only part of a
 * recess whose surface is turned toward the light.
 */
export function rimHighlightStrength(delta: number, style: ClockStyle = defaultClockStyle): number {
  const facing = -Math.cos(delta)
  return facing <= 0 ? 0 : facing ** style.rimLightFalloffPower
}

/**
 * Radial profile of the inner shadow, 0-1, at `depth` through the band --
 * 0 at the band's inner edge, 1 at the rim. Ramps in over the inner part
 * and saturates before the rim, so the wall's own darkness is solid and
 * only its spill onto the face is graded.
 */
function wellShadowDepth(depth: number): number {
  return Math.min(1, depth / WELL_SHADOW_RAMP) ** WELL_SHADOW_RAMP_POWER
}

/**
 * A conic gradient carrying one of the angular profiles above, anchored so
 * the light lands at the gradient's midpoint (offset 0.5) and the seam --
 * where the gradient wraps from offset 1 back to 0 -- lands half a turn
 * away. Both ends of the gradient hold the same value there, so the wrap is
 * continuous no matter which profile is passed in.
 */
function buildAngularGradient(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  lightAngle: number,
  rgb: string,
  strength: (delta: number) => number,
): CanvasGradient {
  // Canvas angle convention (used by createConicGradient and ctx.arc): 0 =
  // 3 o'clock, increasing clockwise. Clock angle convention (lightAngle):
  // 0 = 12 o'clock, increasing clockwise. The two are a quarter turn apart.
  const lightCanvasAngle = lightAngle - Math.PI / 2
  const gradient = ctx.createConicGradient(lightCanvasAngle + Math.PI, cx, cy)

  for (let i = 0; i <= ANGULAR_GRADIENT_STOPS; i++) {
    const t = i / ANGULAR_GRADIENT_STOPS
    // Angular distance from the light: 0 at the light (t = 0.5), PI at the
    // seam (t = 0 and t = 1).
    const delta = Math.PI * Math.abs(1 - 2 * t)
    gradient.addColorStop(t, `rgba(${rgb}, ${strength(delta).toFixed(3)})`)
  }

  return gradient
}

/**
 * The wall shadow: the same angular gradient stroked over a stack of
 * concentric rings filling the band, each at the radial profile's strength
 * for its own depth. One gradient, reused for every ring -- the radial
 * falloff rides on globalAlpha rather than on a second gradient per ring,
 * which is what keeps a soft, wide shadow down to one gradient per clock.
 */
function drawWellShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  style: ClockStyle,
): void {
  const band = radius * style.wellShadowWidthRatio
  if (band <= 0 || style.wellShadowMaxAlpha <= 0) return

  // One ring per pixel of band at most: below that the rings are thinner
  // than a pixel and the extra passes buy nothing but fill rate.
  const steps = Math.max(1, Math.min(WELL_SHADOW_MAX_STEPS, Math.round(band)))
  const stepWidth = band / steps

  ctx.strokeStyle = buildAngularGradient(ctx, cx, cy, style.lightAngle, '0, 0, 0', (delta) =>
    wellShadowStrength(delta, style),
  )
  ctx.lineWidth = stepWidth

  for (let i = 0; i < steps; i++) {
    // Ring centers walk out from the band's inner edge; the last one's
    // outer edge lands flush with the disc's own boundary.
    const ringRadius = radius - band + (i + 0.5) * stepWidth
    ctx.globalAlpha = style.wellShadowMaxAlpha * wellShadowDepth((i + 0.5) / steps)
    ctx.beginPath()
    ctx.arc(cx, cy, ringRadius, 0, TAU)
    ctx.stroke()
  }

  ctx.globalAlpha = 1
}

/** The glint along the far wall: a hairline ring, stroked flush inside the disc's edge, carrying the crescent's angular profile. */
function drawRimHighlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  style: ClockStyle,
): void {
  const rimWidth = Math.max(1, radius * style.rimLightWidthRatio)
  ctx.lineWidth = rimWidth
  ctx.globalAlpha = style.rimLightMaxAlpha
  ctx.strokeStyle = buildAngularGradient(ctx, cx, cy, style.lightAngle, '255, 255, 255', (delta) =>
    rimHighlightStrength(delta, style),
  )
  ctx.beginPath()
  ctx.arc(cx, cy, radius - rimWidth / 2, 0, TAU)
  ctx.stroke()
  ctx.globalAlpha = 1
}

/**
 * One hand's shadow: the hand's own segment redrawn at the shadow offset,
 * as a stack of strokes from widest and faintest to the hand's own width,
 * which is what stands in for a blur. Built out of plain strokes rather
 * than the canvas shadow properties on purpose -- shadowBlur and
 * shadowOffset are specified in device pixels and ignore the current
 * transform, so on a 2x display they would come out half the size the rest
 * of the face is drawn at.
 *
 * Round caps and joins, unlike the hands themselves: a blurred square tip
 * has rounded corners, and a butt-capped stack reads as a stack.
 */
function drawHandShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  length: number,
  width: number,
  blur: number,
  layerAlpha: number,
): void {
  const x = cx + Math.sin(angle) * length
  const y = cy - Math.cos(angle) * length

  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = `rgba(0, 0, 0, ${layerAlpha.toFixed(3)})`

  for (let i = 0; i < HAND_SHADOW_STEPS; i++) {
    const spread = (blur * (HAND_SHADOW_STEPS - 1 - i)) / (HAND_SHADOW_STEPS - 1)
    ctx.lineWidth = width + 2 * spread
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
}

/** A point in canvas space. */
interface Point {
  readonly x: number
  readonly y: number
}

/**
 * The 4 corners of a hand's own bar, in canvas space: a `width`-wide
 * rectangle running from `nearDistance` to `farDistance` along `angle`,
 * wound so consecutive points are edges of the rectangle (near/+side,
 * far/+side, far/-side, near/-side) -- the order tracePolygon needs to
 * round every corner correctly. `nearDistance` is normally 0 (the bar
 * starts at the pivot) but goes negative for the minute hand's pivot-side
 * cap, which extends back past the pivot. Uses the same sin/cos pair as
 * the rest of this module for the along-hand direction, and its
 * perpendicular (rotate a quarter turn: (dx, dy) -> (-dy, dx)) for the
 * width direction.
 */
function handCorners(
  cx: number,
  cy: number,
  angle: number,
  nearDistance: number,
  farDistance: number,
  width: number,
): readonly [Point, Point, Point, Point] {
  const dx = Math.sin(angle)
  const dy = -Math.cos(angle)
  const px = -dy
  const py = dx
  const half = width / 2
  return [
    { x: cx + dx * nearDistance + px * half, y: cy + dy * nearDistance + py * half },
    { x: cx + dx * farDistance + px * half, y: cy + dy * farDistance + py * half },
    { x: cx + dx * farDistance - px * half, y: cy + dy * farDistance - py * half },
    { x: cx + dx * nearDistance - px * half, y: cy + dy * nearDistance - py * half },
  ]
}

/**
 * Traces a rounded polygon through `points` on `ctx`'s current path, one
 * corner radius per vertex (matching `points`' own order), via the standard
 * arcTo trick: start at the midpoint of the closing edge (so the first
 * corner rounds the same as every other one, with no special case) and
 * arcTo each vertex in turn -- arcTo draws the line up to where the
 * rounding starts and the arc itself, tangent to the two segments meeting
 * at that vertex. Per-corner radii (rather than one radius for the whole
 * polygon) are what let the minute hand's pivot-side corners round to a
 * full semicircle while its tip stays a small chamfer. Takes fixed
 * 4-tuples rather than arbitrary arrays so every point and radius is
 * known-defined without a runtime check -- this only ever traces a hand's
 * own 4 corners.
 */
function tracePolygon(
  ctx: CanvasRenderingContext2D,
  points: readonly [Point, Point, Point, Point],
  radii: readonly [number, number, number, number],
): void {
  const [p0, p1, p2, p3] = points
  const last = p3
  const first = p0
  ctx.beginPath()
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2)
  for (const [point, next, radius] of [
    [p0, p1, radii[0]],
    [p1, p2, radii[1]],
    [p2, p3, radii[2]],
    [p3, p0, radii[3]],
  ] as const) {
    ctx.arcTo(point.x, point.y, next.x, next.y, radius)
  }
  ctx.closePath()
}

/**
 * One hand, as a flat bar from `nearDistance` (0 for the hour hand, a
 * negative pivot overhang for the minute hand's round cap) out to `length`,
 * with `cornerRadii` chamfering each of its 4 corners individually. Two
 * hands of this shape simply overlap at the center (the near-pivot corners
 * are always covered by whichever hand is drawn on top of them), which is
 * what stands in for a hub: no separate joint piece is drawn.
 */
function drawHand(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  angle: number,
  nearDistance: number,
  length: number,
  width: number,
  cornerRadii: readonly [number, number, number, number],
  color: string,
): void {
  tracePolygon(ctx, handCorners(cx, cy, angle, nearDistance, length, width), cornerRadii)
  ctx.fillStyle = color
  ctx.fill()
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
  // that makes the disc read as a well comes from the lighting below.
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, TAU)
  ctx.fillStyle = style.faceColor
  ctx.fill()

  drawWellShadow(ctx, cx, cy, radius, style)
  drawRimHighlight(ctx, cx, cy, radius, style)

  const hourWidth = Math.max(1, radius * style.hourHandWidthRatio)
  const minuteWidth = Math.max(1, radius * style.minuteHandWidthRatio)
  const hourLength = radius * style.hourHandLengthRatio
  const minuteLength = radius * style.minuteHandLengthRatio
  const hourCornerRadius = hourWidth * style.handCornerRadiusRatio
  const minuteCornerRadius = minuteWidth * style.handCornerRadiusRatio
  const minutePivotCapRadius = minuteWidth * style.minuteHandPivotCapRadiusRatio

  // Each hand's shadow is drawn immediately before that hand, not both
  // shadows before both hands: the minute hand sits in front of the hour
  // hand, so its shadow has to fall across the hour hand too, the same way
  // it falls across the face. Drawing hour-shadow, hour-hand, then
  // minute-shadow, minute-hand is what lets the minute shadow paint over
  // the now-opaque hour hand and read as one hand raised above the other,
  // rather than two independent shadows that never interact. Each shadow
  // pass is translucent, so it would darken a hand drawn before it -- which
  // is exactly the effect wanted for the hour hand, and exactly why the
  // hour shadow has nothing to fall across yet.
  //
  // Both passes clip to the face, and only here: a hand pointing away from
  // the light throws its shadow into the far wall, and without the clip the
  // tail of it would land outside the disc as a smudge on the page.
  // Everything else on the face is stroked flush to the edge already, so
  // keeping the clip off those passes keeps the crescent's outer edge
  // antialiased by the stroke rather than cut by a clip path.
  const offset = handShadowOffset(style.lightAngle, radius, style)
  const blur = radius * style.handShadowBlurRatio
  const layerAlpha = 1 - (1 - style.handShadowMaxAlpha) ** (1 / HAND_SHADOW_STEPS)
  const shadowX = cx + offset.x
  const shadowY = cy + offset.y

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, TAU)
  ctx.clip()
  drawHandShadow(ctx, shadowX, shadowY, angles.hourAngle, hourLength, hourWidth, blur, layerAlpha)
  ctx.restore()

  drawHand(
    ctx,
    cx,
    cy,
    angles.hourAngle,
    0,
    hourLength,
    hourWidth,
    [hourCornerRadius, hourCornerRadius, hourCornerRadius, hourCornerRadius],
    style.hourHandColor,
  )

  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, radius, 0, TAU)
  ctx.clip()
  drawHandShadow(
    ctx,
    shadowX,
    shadowY,
    angles.minuteAngle,
    minuteLength,
    minuteWidth,
    blur,
    layerAlpha,
  )
  ctx.restore()

  drawHand(
    ctx,
    cx,
    cy,
    angles.minuteAngle,
    -minutePivotCapRadius,
    minuteLength,
    minuteWidth,
    [minutePivotCapRadius, minuteCornerRadius, minuteCornerRadius, minutePivotCapRadius],
    style.minuteHandColor,
  )

  ctx.restore()
}

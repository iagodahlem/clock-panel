import { describe, expect, it } from 'vitest'
import { formatHHMM, parseHHMM } from './controller'
import { TransitionScheduler } from './choreography'
import { RotationSpring } from './animate'
import { lightAngleToward } from './panel'
import {
  defaultClockStyle,
  handShadowOffset,
  lightDirection,
  rimHighlightStrength,
  wellShadowStrength,
} from './clock'

describe('parseHHMM', () => {
  it('parses both HHMM and HH:MM the same way, and round-trips with formatHHMM', () => {
    expect(parseHHMM('1345')).toEqual([1, 3, 4, 5])
    expect(parseHHMM('13:45')).toEqual([1, 3, 4, 5])
    expect(formatHHMM(parseHHMM('0930')!)).toBe('0930')
  })

  it('does not validate the result as a real time -- any 4 digits parse', () => {
    expect(parseHHMM('89:06')).toEqual([8, 9, 0, 6])
  })

  it('returns null for anything that is not exactly 4 digits', () => {
    expect(parseHHMM('134')).toBeNull()
    expect(parseHHMM('13456')).toBeNull()
    expect(parseHHMM('ab:cd')).toBeNull()
  })
})

describe('TransitionScheduler', () => {
  it('fires a hand only once its delay has elapsed', () => {
    const spring = new RotationSpring(0)
    const scheduler = new TransitionScheduler()
    scheduler.schedule(0, [{ spring, desiredAngle: Math.PI, options: {}, delayMs: 100 }])

    scheduler.tick(50)
    expect(spring.isSettled).toBe(true) // not fired yet -- spring is still at rest

    scheduler.tick(100)
    expect(spring.isSettled).toBe(false) // fired -- now steering toward the new target
    expect(scheduler.isIdle).toBe(true)
  })

  it('is additive-with-override: re-scheduling one hand never disturbs another still-pending hand', () => {
    const springA = new RotationSpring(0)
    const springB = new RotationSpring(0)
    const scheduler = new TransitionScheduler()
    scheduler.schedule(0, [
      { spring: springA, desiredAngle: 1, options: {}, delayMs: 100 },
      { spring: springB, desiredAngle: 1, options: {}, delayMs: 200 },
    ])

    // Re-schedule only springA -- springB's pending entry must survive.
    scheduler.schedule(0, [{ spring: springA, desiredAngle: 2, options: {}, delayMs: 10 }])

    scheduler.tick(10)
    expect(scheduler.isIdle).toBe(false) // springB is still pending

    scheduler.tick(200)
    expect(scheduler.isIdle).toBe(true)
  })
})

describe('lightAngleToward', () => {
  // The clock-angle convention, the one thing here that is easy to get
  // subtly wrong: 0 = 12 o'clock, positive clockwise, matching the hands.
  it('maps a pointer around a clock onto the same angles the hands use', () => {
    const cx = 100
    const cy = 100
    expect(lightAngleToward(cx, cy, { x: 100, y: 20 })).toBeCloseTo(0)
    expect(lightAngleToward(cx, cy, { x: 180, y: 100 })).toBeCloseTo(Math.PI / 2)
    expect(lightAngleToward(cx, cy, { x: 100, y: 180 })).toBeCloseTo(Math.PI)
    expect(lightAngleToward(cx, cy, { x: 20, y: 100 })).toBeCloseTo(-Math.PI / 2)
  })

  it('measures from each clock, so one pointer lights neighbors from different sides', () => {
    const pointer = { x: 100, y: 100 }
    // A clock to the pointer's left is lit on its right, and one to the
    // pointer's right is lit on its left -- the whole point of measuring
    // per clock rather than sharing one panel-wide direction.
    expect(lightAngleToward(40, 100, pointer)).toBeCloseTo(Math.PI / 2)
    expect(lightAngleToward(160, 100, pointer)).toBeCloseTo(-Math.PI / 2)
  })
})

describe('well lighting', () => {
  const style = defaultClockStyle

  // The one thing about a recess that is easy to draw backwards: on a well
  // it is the far wall whose surface turns toward the light, so the bright
  // crescent sits opposite the light and the shadow sits under it. Swapping
  // these two draws a button instead, and it still looks lit.
  it('shadows the wall toward the light and brightens the wall opposite it', () => {
    expect(wellShadowStrength(0, style)).toBe(1)
    expect(rimHighlightStrength(0, style)).toBe(0)

    expect(rimHighlightStrength(Math.PI, style)).toBe(1)
    expect(wellShadowStrength(Math.PI, style)).toBe(style.wellShadowAmbient)
  })

  it('saturates the shadow across the light-facing half and drops it in a shoulder', () => {
    // Solid out to well past a sixth of a turn, then most of the way down
    // by a quarter turn -- a plain cosine would still be at half strength
    // there, which is what makes a spread-out highlight look static.
    expect(wellShadowStrength(Math.PI / 6, style)).toBe(1)
    expect(wellShadowStrength(Math.PI / 3, style)).toBe(1)
    expect(wellShadowStrength(Math.PI / 2.2, style)).toBeLessThan(0.7)
    expect(wellShadowStrength(Math.PI / 2, style)).toBe(style.wellShadowAmbient)
  })

  it('keeps a faint occlusion floor all the way around, so the disc still closes', () => {
    for (const delta of [Math.PI / 2, (2 * Math.PI) / 3, Math.PI]) {
      expect(wellShadowStrength(delta, style)).toBeGreaterThanOrEqual(style.wellShadowAmbient)
    }
  })

  it('keeps the crescent a crescent rather than half the ring', () => {
    // Down to a third of peak a sixth of a turn off, and effectively gone
    // by a third of a turn: there has to be an edge to watch travel.
    expect(rimHighlightStrength(Math.PI * (5 / 6), style)).toBeLessThan(0.35)
    expect(rimHighlightStrength(Math.PI * (2 / 3), style)).toBeLessThan(0.01)
    expect(rimHighlightStrength(Math.PI / 2, style)).toBe(0)
  })
})

describe('lightDirection', () => {
  it("uses the same convention as the hands: 0 is 12 o'clock, positive clockwise", () => {
    expect(lightDirection(0).x).toBeCloseTo(0)
    expect(lightDirection(0).y).toBeCloseTo(-1) // up the canvas
    expect(lightDirection(Math.PI / 2).x).toBeCloseTo(1) // 3 o'clock, to the right
    expect(lightDirection(Math.PI / 2).y).toBeCloseTo(0)
  })
})

describe('handShadowOffset', () => {
  // The sign here is the difference between hands that float above the face
  // and hands that look glued to it, and both versions render something
  // plausible, so it is pinned rather than eyeballed.
  it('displaces a hand shadow directly away from the light', () => {
    const radius = 100
    const distance = radius * defaultClockStyle.handShadowOffsetRatio

    // Light at 3 o'clock -> shadow to the left.
    const fromRight = handShadowOffset(Math.PI / 2, radius)
    expect(fromRight.x).toBeCloseTo(-distance)
    expect(fromRight.y).toBeCloseTo(0)

    // Light at 12 o'clock -> shadow down the canvas.
    const fromAbove = handShadowOffset(0, radius)
    expect(fromAbove.x).toBeCloseTo(0)
    expect(fromAbove.y).toBeCloseTo(distance)
  })

  it('points opposite the light direction at every angle, and scales with the clock', () => {
    for (const lightAngle of [-2.4, -0.4, 0, 0.9, 2.7]) {
      const light = lightDirection(lightAngle)
      const offset = handShadowOffset(lightAngle, 50)
      // Dot product of the two unit directions is -1: exactly opposite.
      const length = Math.hypot(offset.x, offset.y)
      expect((offset.x * light.x + offset.y * light.y) / length).toBeCloseTo(-1)
      expect(length).toBeCloseTo(50 * defaultClockStyle.handShadowOffsetRatio)
    }
  })
})

describe('one light, three cues', () => {
  // The round-1 version measured a light angle that tracked the pointer and
  // still read as static, because only one thin arc moved. What makes the
  // light legible is that all three cues are derived from the same angle,
  // so they can never disagree about where it is.
  it('puts the crescent, the shadow and the hand offset on one direction', () => {
    const cx = 200
    const cy = 200
    const pointer = { x: 400, y: 200 } // due right of this clock
    const lightAngle = lightAngleToward(cx, cy, pointer)

    const light = lightDirection(lightAngle)
    expect(light.x).toBeCloseTo(1)

    // Shadow strongest on the wall the pointer is on...
    expect(wellShadowStrength(0, defaultClockStyle)).toBe(1)
    // ...crescent brightest on the wall across from it...
    expect(rimHighlightStrength(Math.PI, defaultClockStyle)).toBe(1)
    // ...and the hands throwing their shadows the same way as the crescent.
    expect(handShadowOffset(lightAngle, 100).x).toBeLessThan(0)
  })
})

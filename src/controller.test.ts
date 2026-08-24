import { describe, expect, it } from 'vitest'
import { formatHHMM, parseHHMM } from './controller'
import { TransitionScheduler } from './choreography'
import { RotationSpring } from './animate'
import { lightAngleToward } from './panel'

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

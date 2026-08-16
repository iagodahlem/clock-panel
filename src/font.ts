// The digit font: a lookup table from digit (0-9) to the hand angles of
// the 6 clocks that draw it. Each digit occupies a 2-column x 3-row grid
// of clocks -- top-left, top-right, mid-left, mid-right, bottom-left,
// bottom-right, in that order -- and every clock sits at a *junction* of
// a seven-segment-style digit outline, not on a segment itself. A clock's
// two hands point toward whichever of its neighboring junctions the
// digit's outline actually reaches:
//
//   - a corner (e.g. top-left, where the top bar meets the left stroke)
//     points its two hands at a right angle, one along each edge
//   - a straight run (e.g. the middle of an untouched left or right
//     stroke) points both hands along the same line, one up/down or
//     left/right and the other opposite
//   - a dead end (only one neighboring edge lit) points both hands the
//     same direction, so the shorter hour hand disappears inside the
//     longer minute hand and it reads as a single stroke
//   - a junction with no lit edges at all (e.g. the untouched middle of
//     a "1" or "7") parks both hands together on a down-right diagonal --
//     visibly different from every "in use" pose, so blanks read as
//     deliberate rather than broken
//
// A few junctions want three neighbors lit at once (the waist of an "8",
// the crook of a "6", "9", "3", "4"), which two rays can't represent.
// Those are resolved by keeping the pair that most defines the digit's
// silhouette and dropping the third -- the dropped edge is never fully
// lost, since the *other* end of that edge still shows its own stub
// reaching toward the junction that dropped it. See the per-digit notes
// below for which edge was cut and why.
//
// Angle convention matches clock.ts: radians, 0 = 12 o'clock, positive
// clockwise.

import type { ClockHandAngles } from './clock'

const UP = 0
const RIGHT = Math.PI / 2
const DOWN = Math.PI
const LEFT = (3 * Math.PI) / 2
/** Parked "off" pose for junctions the digit's outline never reaches -- both hands together on a down-right diagonal (the 4:30/7:30 clock-shop display angle), clearly distinct from every angle used by an active junction. */
const REST = (3 * Math.PI) / 4

function pair(hourAngle: number, minuteAngle: number): Readonly<ClockHandAngles> {
  return { hourAngle, minuteAngle }
}

/** One clock's hand angles, readonly. */
type Pose = Readonly<ClockHandAngles>

/** The 6 clocks of one digit, in fixed order: top-left, top-right, mid-left, mid-right, bottom-left, bottom-right. */
export type DigitPose = readonly [Pose, Pose, Pose, Pose, Pose, Pose]

/** A single decimal digit -- the only valid indices into DIGIT_FONT. */
export type Digit = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

// prettier-ignore
export const DIGIT_FONT: readonly [
  DigitPose, DigitPose, DigitPose, DigitPose, DigitPose,
  DigitPose, DigitPose, DigitPose, DigitPose, DigitPose,
] = [
  // 0 -- plain outline, all four corners, both verticals straight through.
  [pair(RIGHT, DOWN), pair(LEFT, DOWN), pair(UP, DOWN), pair(UP, DOWN), pair(UP, RIGHT), pair(UP, LEFT)],

  // 1 -- a single vertical stroke down the right column; the left column
  // and the untouched middle-right notch (mid-left has no edges) rest.
  [pair(REST, REST), pair(DOWN, DOWN), pair(REST, REST), pair(UP, DOWN), pair(REST, REST), pair(UP, UP)],

  // 2 -- top bar, right upper stroke, middle bar, left lower stroke, bottom bar.
  [pair(RIGHT, RIGHT), pair(LEFT, DOWN), pair(RIGHT, DOWN), pair(UP, LEFT), pair(UP, RIGHT), pair(LEFT, LEFT)],

  // 3 -- top and bottom bars stub off the left column (open on the left);
  // mid-right wants up+down+left at once (the pinch between the two
  // humps) -- kept as an inward waist stub (left, left), same convention
  // as 8's waist, so the pinch reads as visually distinct from the
  // corners above and below it instead of repeating top-right's pose.
  [pair(RIGHT, RIGHT), pair(LEFT, DOWN), pair(RIGHT, RIGHT), pair(LEFT, LEFT), pair(RIGHT, RIGHT), pair(UP, LEFT)],

  // 4 -- top-left and top-right both stub straight down into the
  // crossbar; mid-right wants up+down+right at once (the crossbar meeting
  // the right stroke) -- kept as a clean straight vertical (up+down),
  // since mid-left's own right-hand already implies the crossbar.
  [pair(DOWN, DOWN), pair(DOWN, DOWN), pair(UP, RIGHT), pair(UP, DOWN), pair(REST, REST), pair(UP, UP)],

  // 5 -- mirror of 2's top half, open on the right at top and left at bottom.
  [pair(RIGHT, DOWN), pair(LEFT, LEFT), pair(UP, RIGHT), pair(LEFT, DOWN), pair(RIGHT, RIGHT), pair(UP, LEFT)],

  // 6 -- open top-right (no upper-right stroke); mid-left wants
  // up+down+right at once (tail meeting the belly) -- kept down+right to
  // preserve the belly loop's corner, since top-left's own down-hand
  // already implies the tail stub above it.
  [pair(RIGHT, DOWN), pair(LEFT, LEFT), pair(DOWN, RIGHT), pair(LEFT, DOWN), pair(UP, RIGHT), pair(UP, LEFT)],

  // 7 -- top bar dropping into a single right-column stroke; the left
  // column and the untouched middle-left notch rest.
  [pair(RIGHT, RIGHT), pair(LEFT, DOWN), pair(REST, REST), pair(UP, DOWN), pair(REST, REST), pair(UP, UP)],

  // 8 -- full outline; both middle junctions want up+down+sideways at
  // once (the figure-eight waist) -- kept as the inward-pointing waist
  // stub alone, since the top and bottom corners' own hands already imply
  // the vertical continuity through this point.
  [pair(RIGHT, DOWN), pair(LEFT, DOWN), pair(RIGHT, RIGHT), pair(LEFT, LEFT), pair(UP, RIGHT), pair(UP, LEFT)],

  // 9 -- mirror of 6, loop on top instead of the belly on the bottom;
  // mid-right wants up+down+left at once -- kept up+left to preserve the
  // loop's corner, since bottom-right's own up-hand already implies the tail.
  [pair(RIGHT, DOWN), pair(LEFT, DOWN), pair(UP, RIGHT), pair(UP, LEFT), pair(RIGHT, RIGHT), pair(UP, LEFT)],
]

/** Looks up the 6-clock hand pose for a single decimal digit. */
export function digitPose(digit: Digit): DigitPose {
  return DIGIT_FONT[digit]
}

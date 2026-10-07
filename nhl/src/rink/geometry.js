// NHL rink geometry in feet (official 200 × 85). x: 0 → 200 (left end boards → right end boards), y: 0 → 85.
export const RINK = {
  L: 200, W: 85, cornerR: 28,
  goalLine: 11, blueLine: 75, center: 100,       // distances from the left end boards
  circleR: 15, dotFromGoal: 20, dotY: 22,         // end-zone faceoff circles: 20 ft out from the goal line, ±22 ft
  neutralDotFromBlue: 5,
  creaseR: 6, netW: 6, netD: 3.33,
};
export const MIDY = RINK.W / 2;
export const goalX = side => (side < 0 ? RINK.goalLine : RINK.L - RINK.goalLine); // side -1 = left net, +1 = right net
export const FACEOFF_DOTS = [
  { x: RINK.center, y: MIDY, kind: 'center' },
  ...[RINK.goalLine + RINK.dotFromGoal, RINK.L - RINK.goalLine - RINK.dotFromGoal].flatMap(x => [{ x, y: MIDY - RINK.dotY, kind: 'end' }, { x, y: MIDY + RINK.dotY, kind: 'end' }]),
  ...[RINK.blueLine + RINK.neutralDotFromBlue, RINK.L - RINK.blueLine - RINK.neutralDotFromBlue].flatMap(x => [{ x, y: MIDY - RINK.dotY, kind: 'neutral' }, { x, y: MIDY + RINK.dotY, kind: 'neutral' }]),
];
// Is (x,y) inside the rounded-rectangle boards?
export function insideRink(x, y, pad = 0) {
  const { L, W, cornerR: r } = RINK;
  if (x < pad || x > L - pad || y < pad || y > W - pad) return false;
  const cx = x < r ? r : x > L - r ? L - r : x, cy = y < r ? r : y > W - r ? W - r : y;
  return Math.hypot(x - cx, y - cy) <= r - pad;
}

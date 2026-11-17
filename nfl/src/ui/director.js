// Camera director (presentation only): picks one of the existing camera presets from the state of the play, with a minimum hold time so the
// picture never flickers. Pure + unit-tested; the game view applies the result and turns the director off when the user picks a camera.
//   huddle / pre-snap → TACTICAL (see the whole formation)      QB reads / handoff → QB (behind the quarterback)
//   ball in the air / carrier running → BROADCAST               replay → ENDZONE for scores and turnovers, BROADCAST otherwise
export const MIN_HOLD = 1.6;   // seconds a shot stays before a non-forced change
export function wantedShot({ phase, huddle = false, simPhase = null, scoring = false } = {}) {
  if (phase === 'REPLAY') return scoring ? 'ENDZONE' : 'BROADCAST';
  if (phase === 'AWAIT') return 'BROADCAST';
  if (huddle) return 'TACTICAL';
  if (simPhase === 'PRE_THROW' || simPhase === 'HANDOFF' || simPhase === 'SCRAMBLE') return 'QB';
  return 'BROADCAST';
}
export function createDirector() {
  let shot = 'BROADCAST', since = -Infinity, lastPhase = null, lastHuddle = false;
  return {
    pick(input, now) {
      const want = wantedShot(input), forced = input.phase !== lastPhase && (input.phase === 'REPLAY' || lastPhase === 'REPLAY') || (input.huddle && !lastHuddle);
      lastPhase = input.phase; lastHuddle = !!input.huddle;
      if (want !== shot && (forced || now - since >= MIN_HOLD)) { shot = want; since = now; }
      return shot;
    },
    get shot() { return shot; },
  };
}

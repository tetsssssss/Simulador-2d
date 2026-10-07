// Simulation ratings (0..1) from the MLB fixed attributes. The engine reads only these compact numbers.
const v = (m, ...names) => names.reduce((a, n) => a + (m[n] ?? 60), 0) / names.length / 100;

export function simRatings(attrs) {
  const m = Object.fromEntries((attrs || []).map(a => [a.name, a.value]));
  return {
    // hitting
    contactR: v(m, 'Contact vs R'), contactL: v(m, 'Contact vs L'), powerR: v(m, 'Power vs R'), powerL: v(m, 'Power vs L'),
    eye: v(m, 'Plate Vision', 'Plate Discipline'), batSpeed: v(m, 'Bat Speed'), timing: v(m, 'Timing'), clutch: v(m, 'Clutch Hitting'),
    // running
    speed: v(m, 'Running Speed', 'Acceleration'), runIQ: v(m, 'Baserunning IQ'), steal: v(m, 'Stealing', 'Jump'),
    // defense
    reaction: v(m, 'Reaction', 'Jump'), range: v(m, 'Range'), hands: v(m, 'Hands', 'Fielding'), arm: v(m, 'Arm Strength'), armAcc: v(m, 'Arm Accuracy'),
    transfer: v(m, 'Transfer Speed'), framing: v(m, 'Catcher Framing', 'Catcher Blocking'),
    // pitching
    velo: v(m, 'Pitch Velocity'), fb: v(m, 'Fastball Quality'), brk: v(m, 'Breaking Ball Quality'), off: v(m, 'Offspeed Quality'),
    command: v(m, 'Pitch Command'), control: v(m, 'Pitch Control'), movement: v(m, 'Pitch Movement'), stamina: v(m, 'Pitch Stamina'),
    pClutch: v(m, 'Pitching Clutch'), hold: v(m, 'Hold Runners'),
    // extras: bunting, baseball IQ, pickoff
    bunt: v(m, 'Bunt', 'Drag Bunt'), iq: v(m, 'Baseball IQ'), pickoff: v(m, 'Pickoff'),
  };
}

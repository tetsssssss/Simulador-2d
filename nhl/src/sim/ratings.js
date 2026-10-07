// Simulation ratings (0..1) derived from the 35 NHL attributes (already calibrated with real stats in nhlData).
// The engine only reads these compact numbers; the attribute names stay a data-layer concern.
const v = (m, ...names) => names.reduce((a, n) => a + (m[n] ?? 65), 0) / names.length / 100;

export function simRatings(attrs, goalie = false) {
  const m = Object.fromEntries((attrs || []).map(a => [a.name, a.value]));
  if (goalie) {
    return {
      reflex: v(m, 'Reflexos', 'Glove High', 'Glove Low', 'Blocker High', 'Blocker Low', 'Five-Hole', 'Pad Save', 'Stick Save'),
      positioning: v(m, 'Positioning', 'Angles', 'Depth', 'Post Integration'),
      lateral: v(m, 'Lateral Movement', 'Recovery', 'Agility', 'Butterfly'),
      rebound: v(m, 'Rebound Control', 'Puck Tracking'),
      screen: v(m, 'Screen Reading', 'Traffic Control', 'Anticipation'),
      breakaway: v(m, 'Breakaway', 'Composure'),
      handling: v(m, 'Puck Handling', 'Passing'),
    };
  }
  return {
    speed: v(m, 'Velocidade'), accel: v(m, 'Aceleração'), agility: v(m, 'Agilidade', 'Edge Control'), balance: v(m, 'Equilíbrio', 'Força'),
    stamina: v(m, 'Resistência'), handling: v(m, 'Controle de Puck', 'Hand-Eye'), deke: v(m, 'Deking', 'Agilidade'),
    pass: v(m, 'Passe'), vision: v(m, 'Visão', 'Offensive Awareness'), wristP: v(m, 'Wrist Power'), wristA: v(m, 'Wrist Accuracy'),
    slapP: v(m, 'Slap Power'), slapA: v(m, 'Slap Accuracy'), oneTimer: v(m, 'One-Timer'), offIQ: v(m, 'Offensive Awareness', 'Composure'),
    defIQ: v(m, 'Defensive Awareness', 'Positioning', 'Antecipação'), gap: v(m, 'Gap Control'), stick: v(m, 'Stick Check'),
    body: v(m, 'Body Check', 'Força'), block: v(m, 'Shot Block'), faceoff: v(m, 'Faceoffs'), discipline: v(m, 'Disciplina'),
    clutch: v(m, 'Clutch'),
  };
}

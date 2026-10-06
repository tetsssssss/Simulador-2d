// GameplaySettings: the single place where user sliders live. Sliders never touch results directly; they map to
// known engine parameters through engineTuning() (rating influence, turnover chance, fatigue drain) or to
// game-flow parameters (quarter length, injury rolls). Display preferences are kept apart (DISPLAY_DEFAULTS).

// influence sliders scale how far ratings sit from the league midpoint for the listed rating keys (attributes.js).
export const GAMEPLAY_SLIDERS = [
  { key: 'qbAccuracy', label: 'QB Accuracy Influence', min: 0.5, max: 1.5, step: 0.05, def: 1, kind: 'influence',
    ratings: ['shortAccuracy', 'mediumAccuracy', 'deepAccuracy', 'throwOnRun'], help: 'Peso das notas de precisão do QB no lançamento.' },
  { key: 'passRush', label: 'Pass Rush Influence', min: 0.5, max: 1.5, step: 0.05, def: 1, kind: 'influence',
    ratings: ['passRush', 'passBlock'], help: 'Peso de Pass Rush × Pass Block no duelo da linha.' },
  { key: 'coverage', label: 'Coverage Influence', min: 0.5, max: 1.5, step: 0.05, def: 1, kind: 'influence',
    ratings: ['manCoverage', 'zoneCoverage', 'pressCoverage'], help: 'Peso das notas de cobertura.' },
  { key: 'runBlocking', label: 'Run Blocking Influence', min: 0.5, max: 1.5, step: 0.05, def: 1, kind: 'influence',
    ratings: ['runBlock', 'runDefense'], help: 'Peso de Run Block × Run Defense nos bloqueios de corrida.' },
  { key: 'tackling', label: 'Tackling Influence', min: 0.5, max: 1.5, step: 0.05, def: 1, kind: 'influence',
    ratings: ['tackling', 'hitPower', 'breakTackle'], help: 'Peso de Tackling/Hit Power × Break Tackle no contato.' },
  { key: 'turnover', label: 'Turnover Frequency', min: 0, max: 2, step: 0.05, def: 1, kind: 'engine',
    help: 'Multiplica a chance de INT (bola disputada/tocada) e de fumble no contato.' },
  { key: 'fatigue', label: 'Fatigue Effect', min: 0, max: 2, step: 0.05, def: 1, kind: 'engine',
    help: 'Taxa de desgaste de energia durante a jogada.' },
  { key: 'injury', label: 'Injury Frequency', min: 0, max: 2, step: 0.05, def: 1, kind: 'flow',
    help: 'Chance de lesões na carreira (avanço de semana).' },
  { key: 'quarterMin', label: 'Quarter Length (min)', min: 3, max: 15, step: 1, def: 15, kind: 'flow',
    help: 'Duração de cada quarto (partidas mais rápidas).' },
  { key: 'penalty', label: 'Penalty Frequency', min: 0, max: 2, step: 0.05, def: 1, kind: 'reserved',
    help: 'Reservado: pênaltis ainda não implementados no motor.' },
];

export const PRESETS = {
  SIMULATION: { label: 'Simulation', desc: 'Calibração do motor (padrão).', values: {} },
  BALANCED: { label: 'Balanced', desc: 'Um pouco mais permissivo para o ataque, menos lesões.',
    values: { coverage: 0.9, passRush: 0.9, tackling: 0.9, qbAccuracy: 1.1, turnover: 0.85, injury: 0.6, fatigue: 0.8 } },
  CHAOTIC: { label: 'Chaotic', desc: 'Mais variância: diferenças de talento ampliadas e mais turnovers.',
    values: { qbAccuracy: 1.4, passRush: 1.4, coverage: 1.35, runBlocking: 1.4, tackling: 1.3, turnover: 1.6, fatigue: 1.3, injury: 1.4 } },
};

export const DISPLAY_DEFAULTS = { photos: true, debug: false, cameraFollow: true, animSpeed: 1, hudDensity: 'full', autoAdvance: true };

export function defaultGameplay() { return Object.fromEntries(GAMEPLAY_SLIDERS.map(s => [s.key, s.def])); }

export function presetValues(name) { return { ...defaultGameplay(), ...(PRESETS[name]?.values || {}) }; }

export function sanitizeGameplay(g = {}) {
  const out = defaultGameplay();
  for (const s of GAMEPLAY_SLIDERS) {
    const v = Number(g[s.key]);
    if (Number.isFinite(v)) out[s.key] = Math.min(s.max, Math.max(s.min, v));
  }
  return out;
}

export const SAVE_DEFAULTS = { autosave: true };
export function defaultSettings() { return { preset: 'SIMULATION', gameplay: defaultGameplay(), display: { ...DISPLAY_DEFAULTS }, save: { ...SAVE_DEFAULTS } }; }

export function sanitizeSettings(s = {}) {
  return {
    preset: PRESETS[s.preset] ? s.preset : 'CUSTOM',
    gameplay: sanitizeGameplay(s.gameplay),
    display: { ...DISPLAY_DEFAULTS, ...(s.display || {}) },
    save: { ...SAVE_DEFAULTS, ...(s.save || {}) },
  };
}

// Which preset (if any) the current values match.
export function matchPreset(gameplay) {
  for (const name in PRESETS) {
    const p = presetValues(name);
    if (GAMEPLAY_SLIDERS.every(s => Math.abs(p[s.key] - gameplay[s.key]) < 1e-9)) return name;
  }
  return 'CUSTOM';
}

// Engine tuning passed to createPlay({ tuning }). Returns null when everything is at the calibrated default,
// so the simulation runs exactly the calibrated code path.
export function engineTuning(gameplay) {
  const g = sanitizeGameplay(gameplay);
  const influence = {};
  let custom = false;
  for (const s of GAMEPLAY_SLIDERS) {
    if (s.kind !== 'influence' || g[s.key] === 1) continue;
    custom = true;
    for (const k of s.ratings) influence[k] = g[s.key];
  }
  if (g.turnover !== 1 || g.fatigue !== 1) custom = true;
  return custom ? { influence, turnover: g.turnover, fatigue: g.fatigue } : null;
}

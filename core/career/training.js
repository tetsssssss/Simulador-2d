// Weekly training plans. Every calendar day the user's squad earns XP from the plan; XP becomes OVR when it reaches the
// threshold (bounded by potential, age and growth curve). Intensity/fatigue feed the injury rate, tactical drills build familiarity.
import { clamp, round1, round2 } from './kit.js';
import { curveMods } from './curves.js';
import { staffFx } from './staff.js';

export const FOCI = {
  balanced: { label: 'Equilibrado', xp: 1.0, load: 0, fam: 0.15 },
  physical: { label: 'Preparação física', xp: 1.05, load: 1.6, fam: 0, inj: 0.9 },
  technical: { label: 'Fundamentos técnicos', xp: 1.25, load: 0.6, fam: 0.05 },
  tactical: { label: 'Tática e jogadas ensaiadas', xp: 0.8, load: 0.2, fam: 0.55 },
  youth: { label: 'Desenvolvimento de jovens', xp: 1.1, load: 0.4, fam: 0.05, youth: 1.5 },
  recovery: { label: 'Recuperação', xp: 0.4, load: -5, fam: 0.05 },
};
export const GROUP_MODES = { normal: 1, extra: 1.35, light: 0.7 };

export function setTraining(spec, c, plan = {}) {
  const x = c.x, cur = x.training.plan, errors = [];
  if (c.role === 'PLAYER') return { ok: false, text: 'Use setPlayerTraining para o seu atleta.', errors: [] };
  const next = { ...cur, groups: { ...cur.groups } };
  if (plan.focus != null) { if (!FOCI[plan.focus]) errors.push(`Foco inválido "${plan.focus}" (${Object.keys(FOCI).join(', ')})`); else next.focus = plan.focus; }
  if (plan.intensity != null) { const v = +plan.intensity; if (!Number.isFinite(v) || v < 0.5 || v > 2) errors.push('Intensidade fora de 0.5..2'); else next.intensity = round2(v); }
  if (plan.groups) for (const [g, m] of Object.entries(plan.groups)) { if (!GROUP_MODES[m]) errors.push(`Modo inválido para ${g}: ${m}`); else next.groups[g] = m; }
  if (plan.matchPrep != null) next.matchPrep = !!plan.matchPrep;
  if (errors.length) return { ok: false, text: errors[0], errors };
  x.training.plan = next; c.training.intensity = next.intensity;
  return { ok: true, text: `Treino: ${FOCI[next.focus].label}, intensidade ${next.intensity}.`, plan: next };
}
export const injuryMultFromTraining = c => {
  const t = c.x.training, f = FOCI[t.plan.focus] || FOCI.balanced;
  return round2((1 + Math.max(0, t.load - 55) / 90) * (f.inj ?? 1) * (0.9 + 0.1 * t.plan.intensity));
};
export const xpNeed = p => 130 + Math.max(0, p.ovr - 60) * 5;
export const teamFamiliarityBonus = c => round2(((c.x.training?.fam ?? 50) - 50) / 50 * 0.5);

// One calendar day of training for the user's squad (game days train lighter).
export function trainingDay(spec, c, { gameDay = false } = {}) {
  const x = c.x, t = x.training, plan = t.plan, f = FOCI[plan.focus] || FOCI.balanced, abbr = c.userTeam;
  if (!abbr || c.role === 'PLAYER') return;
  const fx = staffFx(spec, c, abbr), scale = gameDay ? 0.5 : 1;
  for (const p of Object.values(c.players)) {
    if (p.t !== abbr || p.st === 'RET') continue;
    const cm = curveMods(spec, p.cv || 'NORMAL', p.age), a = cm.ageCurve;
    const phase = p.age <= a.growthEnd ? 1 : p.age <= a.peakEnd ? 0.42 : 0.18;
    const room = p.pot - p.ovr;
    if (room <= 0) continue;
    const grp = spec.posGroup(p.pos), gm = GROUP_MODES[plan.groups[grp]] ?? 1;
    const inj = p.inj ? 0.25 : 1;
    const young = f.youth && p.age <= 24 ? f.youth : f.youth ? 0.8 : 1;
    const gain = 0.55 * plan.intensity * f.xp * fx.dev * phase * (1 + room / 30) * gm * inj * young * scale * (0.85 + 0.3 * ((p.pers?.work ?? 50) / 100));
    p.xp = (p.xp || 0) + gain;
    if (p.xp >= xpNeed(p) && p.age <= a.growthEnd + 4) {
      p.xp -= xpNeed(p); p.ovr = Math.min(p.pot, p.ovr + 1); p.dv = (p.dv || 0) + 1;
      t.gains.unshift({ d: x.cal.day, s: c.season, id: p.id, n: p.n, ovr: p.ovr }); if (t.gains.length > 40) t.gains.length = 40;
    }
  }
  t.load = clamp(t.load + (plan.intensity * 1.5 + (f.load || 0)) * scale - 1.4, 0, 100);
  t.fam = clamp(t.fam + (f.fam || 0) * (plan.matchPrep ? 1 : 0.5) * scale - 0.1, 0, 100);
  if (x.cal.day % 7 === 0) t.week++;
}
export function noteTacticsChanged(c, severity = 1) { if (c.x?.training) c.x.training.fam = clamp(c.x.training.fam - 6 * severity, 0, 100); }

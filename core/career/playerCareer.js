// Player career (role PLAYER): creation (name, position, height, weight, archetype, appearance compatible with core/render/avatars.js,
// photo URL, attributes with a point budget), pathways, development (XP, training, form, confidence, coach trust, role, potential),
// growth curves and the four relationships. Pure functions over the save.
import { SKINS, HAIR_COLORS, HAIR_STYLES, BEARDS, ACCESSORIES, BUILDS, GEAR } from '../render/avatars.js';
import { createRng, hashSeed } from '../rng/rng.js';
import { CURVES, CURVE_KEYS, pickCurve, curveMods } from './curves.js';
import { ovrFromAttrs, attrBudget, autoAttrs, shiftAttrs, AMATEUR_ATTR } from './rulesKit.js';
import { clamp, round1, xr, hash01 } from './kit.js';
import { bumpPrel, prelSnapshot } from './prel.js';
import { teamPlayers, teamOf, news } from './careerCore.js';
import { staffFx } from './staff.js';
import { progressSeason } from './people.js';

export const APPEARANCE_RANGES = { skin: SKINS.length, hairStyle: HAIR_STYLES.length, hairColor: HAIR_COLORS.length, beard: BEARDS.length, accessory: ACCESSORIES.length, build: BUILDS.length, gear: GEAR.length };
export const TALENTS = [{ key: 'medio', label: 'Promissor' }, { key: 'alto', label: 'Talento' }, { key: 'raro', label: 'Geracional' }];
const setFor = (spec, pos) => spec.v3.attrSets[spec.v3.attrGroup(spec, pos)];

export function getCreatePlayerOptions(spec) {
  const positions = spec.positions.filter(p => !(spec.sport === 'nfl' && p === 'P')).map(pos => {
    const set = setFor(spec, pos);
    return { pos, archetypes: spec.archetypes[pos] || spec.archetypes[spec.posGroup(pos)] || [], attrs: Object.entries(set).map(([key, d]) => ({ key, label: d.label, weight: d.w })) };
  });
  return {
    sport: spec.sport, positions, talents: TALENTS, pathways: spec.v3.pathways,
    height: spec.v3.heightRange, weight: spec.v3.weightRange, ages: { min: spec.draft.ageMin - 1, max: spec.draft.ageMin + 1 },
    appearance: { ranges: APPEARANCE_RANGES, labels: { skin: SKINS, hairStyle: HAIR_STYLES, hairColor: HAIR_COLORS, beard: BEARDS, accessory: ACCESSORIES, build: BUILDS, gear: GEAR } },
    attributes: { min: AMATEUR_ATTR.min, max: AMATEUR_ATTR.max, budgetByTalent: Object.fromEntries(TALENTS.map(t => [t.key, 0])), note: 'budget = nº de atributos × 50 + bônus do talento' },
    curves: CURVE_KEYS.map(k => ({ key: k, label: CURVES[k].label })),
    photo: { note: 'URL http(s) opcional (máx. 500 caracteres) ou data:image pequeno (máx. 20 mil caracteres)' },
  };
}
export const attributeBudget = (spec, pos, talent = 'alto') => attrBudget(setFor(spec, pos), talent);

// Normalizes and validates the creation form. Never throws: { ok, errors[], player }.
export function validatePlayerInput(spec, input = {}) {
  const errors = [], pos = input.pos || spec.positions[0];
  if (!spec.positions.includes(pos)) errors.push(`Posição inválida: ${pos}`);
  const name = String(input.name || '').trim().slice(0, 40);
  if (!name) errors.push('Informe o nome do atleta.');
  const talent = TALENTS.some(t => t.key === input.talent) ? input.talent : 'alto';
  const hr = spec.v3.heightRange, wr = spec.v3.weightRange;
  const height = Math.round(input.height ?? (hr.min + hr.max) / 2), weight = Math.round(input.weight ?? (wr.min + wr.max) / 2);
  if (height < hr.min || height > hr.max) errors.push(`Altura fora de ${hr.min}-${hr.max} cm`);
  if (weight < wr.min || weight > wr.max) errors.push(`Peso fora de ${wr.min}-${wr.max} kg`);
  const ap = {};
  for (const [k, n] of Object.entries(APPEARANCE_RANGES)) { const v = input.appearance?.[k]; if (v == null) { ap[k] = null; continue; } if (!Number.isInteger(v) || v < 0 || v >= n) { errors.push(`Aparência.${k} fora de 0..${n - 1}`); ap[k] = 0; } else ap[k] = v; }
  let photo = null;
  if (input.photoUrl) { const u = String(input.photoUrl); if (/^https?:\/\//i.test(u) && u.length <= 500) photo = u; else if (/^data:image\//i.test(u) && u.length <= 20000) photo = u; else errors.push('Foto inválida (URL http(s) até 500 caracteres ou data:image até 20 mil).'); }
  const age = clamp(Math.round(input.age ?? spec.draft.ageMin - 1), spec.draft.ageMin - 1, spec.draft.ageMin + 1);
  let attrs = null;
  const set = spec.positions.includes(pos) ? setFor(spec, pos) : null;
  if (set) {
    const budget = attrBudget(set, talent);
    if (input.attrs) {
      attrs = {};
      for (const k of Object.keys(set)) { const v = input.attrs[k]; if (!Number.isFinite(v)) { errors.push(`Atributo ${k} ausente`); attrs[k] = 50; continue; } if (v < AMATEUR_ATTR.min || v > AMATEUR_ATTR.max) errors.push(`Atributo ${k} fora de ${AMATEUR_ATTR.min}-${AMATEUR_ATTR.max}`); attrs[k] = Math.round(v); }
      const sum = Object.values(attrs).reduce((a, b) => a + b, 0);
      if (sum > budget) errors.push(`Pontos de atributo (${sum}) acima do orçamento (${budget})`);
    } else attrs = autoAttrs(set, budget, input.emphasis || []);
  }
  const curve = input.curve == null ? null : CURVES[input.curve] ? input.curve : (errors.push(`Curva inválida: ${input.curve}`), null);
  const pathway = input.pathway ? (spec.v3.pathways.some(p => p.key === input.pathway) ? input.pathway : (errors.push(`Caminho inválido: ${input.pathway}`), null)) : spec.v3.pathways[0].key;
  return { ok: errors.length === 0, errors, player: { name, pos, talent, height, weight, age, archetype: input.archetype || (spec.archetypes[pos] || spec.archetypes[spec.posGroup(pos)] || [])[0], num: input.num, appearance: ap, photoUrl: photo, attrs, curve, pathway } };
}

// Called by createCareer after spec.createPlayer: applies the profile to the created athlete and the pathway to the save.
export function applyPlayerProfile(spec, c, me, input) {
  const v = validatePlayerInput(spec, input);
  if (!v.ok) throw new Error(`Jogador inválido: ${v.errors[0]}`);
  const P = v.player, set = setFor(spec, me.pos);
  me.attrs = P.attrs; me.ovr = ovrFromAttrs(P.attrs, set); if (me.pot < me.ovr + 8) me.pot = me.ovr + 8;
  me.height = P.height; me.weight = P.weight; me.photoUrl = P.photoUrl; me.appearance = Object.fromEntries(Object.entries(P.appearance).filter(([, x]) => x != null));
  me.cv = P.curve || pickCurve(hash01(`${c.seed}|me|cv`)); me.xp = 0; me.fm = 0; me.conf = 55;
  me.talent = P.talent; me.mine = true;
  c.me.path = P.pathway; c.me.sub = null; c.me.training = { focus: Object.keys(set)[0], intensity: 1 };
  // pathway → starting stage
  const pw = spec.v3.pathways.find(p => p.key === P.pathway), stage = spec.roadToPro.find(s => s.key === pw.stage) || spec.roadToPro[0];
  c.me.stage = stage.key; c.me.stageYear = 1;
  c.x.prel = { coachTrust: 55, teammates: 55, management: 55, fans: 45, log: [] };
  c.x.pstate = { role: null };
  return me;
}

// ---------- development ----------
export function setPlayerTraining(spec, c, { focus, intensity } = {}) {
  if (c.role !== 'PLAYER') return { ok: false, text: 'Somente na carreira de jogador.' };
  const me = c.players[c.me.id], set = setFor(spec, me.pos), t = c.me.training ||= { focus: Object.keys(set)[0], intensity: 1 };
  if (focus != null) { if (!set[focus]) return { ok: false, text: `Atributo inválido (${Object.keys(set).join(', ')})` }; t.focus = focus; }
  if (intensity != null) { if (!(intensity >= 0.5 && intensity <= 2)) return { ok: false, text: 'Intensidade fora de 0.5..2' }; t.intensity = intensity; }
  c.me.focus = 'balanced';
  return { ok: true, text: `Treino individual: ${set[t.focus].label}, intensidade ${t.intensity}.`, training: { ...t } };
}
export const attrCost = (v, pot) => 8 + Math.floor(Math.max(0, v - 45) / 5) * 2 + (v > pot ? 6 : 0);
// Spends XP to raise one attribute by 1 (ovr follows through the attribute weights).
export function spendXP(spec, c, key, points = 1) {
  if (c.role !== 'PLAYER') return { ok: false, text: 'Somente na carreira de jogador.' };
  const me = c.players[c.me.id], set = setFor(spec, me.pos);
  if (!set[key]) return { ok: false, text: 'Atributo inválido.' };
  let n = 0;
  for (let i = 0; i < Math.max(1, Math.min(10, points)); i++) {
    const cost = attrCost(me.attrs[key], me.pot);
    if ((me.xp || 0) < cost) { if (!n) return { ok: false, text: `XP insuficiente (${Math.floor(me.xp || 0)}/${cost}).` }; break; }
    if (me.attrs[key] >= 99) break;
    me.xp -= cost; me.attrs[key]++; n++;
    me.ovrFrac = (me.ovrFrac || 0) + set[key].w;
    if (me.ovrFrac >= 1 && me.ovr < me.pot) { me.ovr++; me.ovrFrac -= 1; }
  }
  return { ok: true, text: `${set[key].label} +${n}`, xp: Math.round(me.xp), ovr: me.ovr, value: me.attrs[key] };
}
// One calendar day of individual training.
export function playerTrainingDay(spec, c, { gameDay = false } = {}) {
  const me = c.players[c.me?.id]; if (!me || me.st === 'RET') return;
  const t = c.me.training || { intensity: 1 }, cm = curveMods(spec, me.cv || 'NORMAL', me.age), a = cm.ageCurve;
  const phase = me.age <= a.growthEnd ? 1 : me.age <= a.peakEnd ? 0.5 : 0.25;
  const squad = !['AMATEUR', 'DRAFT', 'FA'].includes(me.t) ? staffFx(spec, c, me.t).dev : 1;
  const gain = 1.1 * (t.intensity || 1) * phase * squad * (me.inj ? 0.3 : 1) * (gameDay ? 0.5 : 1) * (0.8 + 0.4 * ((me.pers?.work ?? 70) / 100));
  me.xp = (me.xp || 0) + gain;
  me.fm = Math.abs(me.fm || 0) < 0.15 ? 0 : (me.fm || 0) * 0.97;
}
// Natural progression → attributes follow the ovr change.
export function afterProgression(spec, c, p, d) { if (p.attrs && d) shiftAttrs(p.attrs, setFor(spec, p.pos), d); }
export function progressionMods(spec, c, p) {
  if (c.role === 'PLAYER' && p.mine) { const w = (p.pers?.work ?? 70) / 100; return { growth: 0.95 + 0.2 * w, decline: 1 - 0.15 * w }; }
  if (p.t !== c.userTeam || c.role === 'PLAYER') return {};
  const fx = staffFx(spec, c, c.userTeam), plan = c.x.training.plan;
  return { growth: fx.dev * (plan.focus === 'youth' && p.age <= 24 ? 1.1 : 1), decline: clamp(1 - fx.med * 0.25 - (plan.focus === 'recovery' ? 0.05 : 0), 0.7, 1.15) };
}
// Projects the growth curve (for charts): expected ovr by age, deterministic.
export function projectCurve(spec, { ovr, pot, age, curve = 'NORMAL', seed = 'proj', years = 14, runs = 30 }) {
  const out = []; const sums = new Array(years + 1).fill(0);
  for (let r = 0; r < runs; r++) {
    const rng = createRng(hashSeed(`${seed}|${curve}|${r}`)), p = { ovr, pot, age, cv: curve };
    sums[0] += p.ovr;
    for (let i = 1; i <= years; i++) { p.age++; progressSeason(spec, p, rng, { pt: 0.8, focus: 0.5 }); sums[i] += p.ovr; }
  }
  for (let i = 0; i <= years; i++) out.push({ age: age + i, ovr: round1(sums[i] / runs) });
  const peak = out.reduce((b, o) => (o.ovr > b.ovr ? o : b), out[0]);
  return { curve, label: CURVES[curve].label, points: out, peakAge: peak.age, peakOvr: peak.ovr };
}

// ---------- per-game hook for the player ----------
export function playerGameUpdate(spec, c, { line, played, won, h, a }) {
  const me = c.players[c.me?.id]; if (!me) return;
  const gp = me.ps?.gp || 0, avg = gp ? spec.v3.prodOf(me) / gp : 0, prod = line && Object.keys(line).length ? spec.v3.prodOf({ ...me, ps: line }) : 0;
  const exp = Math.max(3, avg), perf = played ? clamp((prod - exp) / (exp + 3), -1, 1) : 0;
  me.fm = clamp(Math.round(((me.fm || 0) * 0.85 + perf * 3) * 10) / 10, -10, 10);
  me.conf = clamp(Math.round(((me.conf ?? 55) + perf * 2.2 + (won ? 0.6 : -0.6)) * 10) / 10, 0, 100);
  me.xp = (me.xp || 0) + (played ? 7 + Math.max(0, perf) * 8 : 2);
  const starter = me.role === 'S';
  bumpPrel(c, 'coachTrust', played ? (perf > 0.2 ? 0.8 : perf < -0.4 ? -0.8 : 0.1) + (starter ? 0.15 : -0.15) : -0.35, played ? (perf > 0.2 ? 'Boa atuação' : perf < -0.4 ? 'Atuação fraca' : '') : 'Sem minutos');
  bumpPrel(c, 'teammates', won ? 0.3 : -0.15, won ? 'Vitória do time' : 'Derrota do time');
  bumpPrel(c, 'fans', (perf > 0.3 ? 0.7 : perf < -0.5 ? -0.5 : 0) + (won ? 0.2 : -0.2), perf > 0.3 ? 'Destaque' : '');
  bumpPrel(c, 'management', won ? 0.15 : -0.05, '');
  return perf;
}

// ---------- pathway helpers ----------
export function pathwayView(spec, c) {
  const me = c.players[c.me?.id]; if (!me) return null;
  const stage = spec.roadToPro.find(s => s.key === c.me.stage), pw = spec.v3.pathways.find(p => p.key === c.me.path) || spec.v3.pathways[0];
  const chain = spec.sport === 'nfl' ? ['COLLEGE', 'DRAFT', 'ROOKIE_CAMP', 'DEPTH_CHART', 'NFL'] : spec.sport === 'nhl' ? [pw.stage === 'EUROPE' ? 'EUROPE' : pw.stage, 'DRAFT', 'DEVELOPMENT', 'NHL'] : c.me.path === 'INTERNATIONAL' ? ['AMATEUR', 'SIGNING', 'MINORS', 'MLB'] : ['AMATEUR', 'DRAFT', 'MINORS', 'MLB'];
  const labels = { COLLEGE: 'College', DRAFT: 'Draft', ROOKIE_CAMP: 'Rookie Camp', DEPTH_CHART: 'Depth Chart', NFL: 'NFL', JUNIOR: 'Junior (CHL)', EUROPE: 'Europa', DEVELOPMENT: 'Desenvolvimento (Junior/AHL)', NHL: 'NHL', AMATEUR: pw.label, SIGNING: 'Assinatura internacional', MINORS: 'Ligas menores (R/A/AA/AAA)', MLB: 'MLB' };
  let cur = 0;
  const pro = me.st === 'ACT' || me.st === 'IR', drafted = !!me.drafted, signed = !!me.signed || (c.me.path === 'INTERNATIONAL' && me.t !== 'AMATEUR');
  if (spec.sport === 'nfl') cur = pro ? (c.me.sub === 'DEPTH_CHART' ? 3 : c.me.sub === 'ROOKIE_CAMP' ? 2 : 4) : drafted ? 2 : me.st === 'PROSPECT' ? 1 : 0;
  else if (spec.sport === 'nhl') cur = pro ? 3 : drafted ? 2 : me.st === 'PROSPECT' ? 1 : 0;
  else cur = pro ? 3 : (drafted || signed) ? 2 : me.st === 'PROSPECT' ? 1 : 0;
  return { path: pw.key, label: pw.label, stage: stage?.label || c.me.stage, steps: chain.map((k, i) => ({ key: k, label: labels[k] || k, state: i < cur ? 'done' : i === cur ? 'current' : 'todo' })) };
}
// NFL: rookie camp → depth chart competition (at the end of camp) decides the first role.
export function rookieCamp(spec, c) {
  if (spec.sport !== 'nfl' || c.role !== 'PLAYER') return null;
  const me = c.players[c.me?.id]; if (!me || !me.drafted || (me.svc || 0) > 0 || !me.t || ['FA', 'AMATEUR', 'DRAFT'].includes(me.t)) return null;
  const g = spec.posGroup(me.pos), mates = teamPlayers(c, me.t).filter(p => spec.posGroup(p.pos) === g && p.id !== me.id), better = mates.filter(p => p.ovr > me.ovr).length;
  const starters = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, DL: 4, LB: 3, DB: 4, K: 1, P: 1 }[g] || 1;
  c.me.sub = better < starters ? 'DEPTH_CHART' : 'ROOKIE_CAMP';
  return { depthRank: better + 1, starters, role: better < starters ? 'S' : better < starters + 2 ? 'R' : 'B' };
}
// MLB international path: signs with the team that offers the most (called when the amateur stage ends).
export function intlSignMe(spec, c) {
  const me = c.players[c.me.id], teams = c.teams.filter(t => spec.teamNeeds(teamPlayers(c, t.abbr))[spec.posGroup(me.pos)] || true);
  const rng = xr(c, 'intl-me'), t = rng.pick(teams.slice(0, 12).length ? c.teams : teams);
  const bonus = round1(0.2 + Math.pow(Math.max(0, me.pot - 55) / 40, 2) * 5);
  Object.assign(me, { t: t.abbr, st: 'MIN', lvl: 'R', on40: false, opt: 3, svc: 0, c: { sal: spec.salary.min, yrs: 5, kind: 'MINOR', bonus }, signed: { year: c.season, bonus } });
  me.rel = { tr: 55, rs: 50, mo: 70, sat: 60 };
  c.me.stage = 'A'; c.me.sub = 'MINORS';
  c.history.transactions.push({ s: c.season, kind: 'SIGN', text: `${t.abbr} assina o prospecto internacional ${me.n} (bônus ${bonus}M)`, teams: [t.abbr], players: [me.id] });
  news(c, `${me.n} assina com ${teamOf(c, t.abbr)?.name} pelo período internacional (bônus ${bonus}M).`, 'big');
  return t.abbr;
}
export { prelSnapshot, ovrFromAttrs };

// Penalty presentation: every foul maps to existing clips, a referee placement inside the field and a flag→signal chain.
import test from 'node:test';
import assert from 'node:assert/strict';
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const { FOULS, FOUL_KEYS, buildPenalty, REF_ID } = await import('../nfl/src/ui/penalties.js');
const { getClip } = await import('../core/anim/registry.js');

const slots = { off: ['QB', 'RB', 'TE', 'X', 'Z', 'SLOT', 'LT', 'LG', 'C', 'RG', 'RT'], def: ['LDE', 'LDT', 'RDT', 'RDE', 'SAM', 'MIKE', 'WILL', 'CBL', 'CBR', 'FS', 'SS'] };
const sim = { losX: 30, ents: Object.entries(slots).flatMap(([side, list]) => list.map((slot, i) => ({ id: side + slot, slot, side, pos: { x: 30 + (side === 'off' ? -3 : 2) + i * 0.2, y: 10 + i * 3.2 } }))) };
sim.qb = sim.ents.find(e => e.slot === 'QB');

test('there are 12 fouls and each maps to real offender / reaction / referee clips', () => {
  assert.equal(FOUL_KEYS.length, 12);
  for (const k of FOUL_KEYS) { const F = FOULS[k]; assert.ok(getClip(F.offender), k + ' offender'); assert.ok(getClip(F.ref), k + ' ref'); if (F.reaction) assert.ok(getClip(F.reaction), k + ' reaction'); assert.ok(F.yards > 0 && F.label); }
});
test('buildPenalty: offender on the right side, referee inside the field, flag→signal chain, wall-clock timing', () => {
  for (const k of FOUL_KEYS) {
    const pn = buildPenalty(k, sim, { now: 100 }); assert.ok(pn, k);
    const off = sim.ents.find(e => e.id === pn.offender); assert.equal(off.side, FOULS[k].side, `${k}: offender side`);
    assert.ok(pn.ref.pos.y >= 3 && pn.ref.pos.y <= 50.3 && Number.isFinite(pn.ref.facing), `${k}: referee inside the field`);
    const flag = pn.actions.find(a => a.who === REF_ID); assert.equal(flag.type, 'clip:rf_flag_throw'); assert.equal(flag.next.type, 'clip:' + FOULS[k].ref);
    assert.ok(pn.actions.every(a => a.wall && a.t0 >= 100 && a.dur > 0), k + ' wall clock'); assert.ok(pn.until > 100 + flag.dur, k + ' until');
    assert.match(pn.label, /FALTA/); 
  }
});
test('role-specific picks: holding → lineman, DPI → defensive back with a receiver victim, roughing → QB victim, grounding → the QB', () => {
  const slot = (k, key) => sim.ents.find(e => e.id === buildPenalty(k, sim, { now: 0 })[key]).slot;
  assert.match(slot('HOLDING_OFFENSE', 'offender'), /^(LT|LG|C|RG|RT)$/); assert.match(slot('DPI', 'offender'), /^(CBL|CBR|FS|SS)$/); assert.match(slot('DPI', 'victim'), /^(X|Z|SLOT|TE)$/);
  assert.equal(slot('ROUGHING_PASSER', 'victim'), 'QB'); assert.equal(slot('INTENTIONAL_GROUNDING', 'offender'), 'QB'); assert.match(slot('OFFSIDE', 'offender'), /^(LDE|LDT|RDT|RDE)$/);
});
test('named offender/victim from a PENALTY event are respected; unknown foul or empty field → null', () => {
  const pn = buildPenalty('HOLDING_OFFENSE', sim, { by: 'offRT', on: 'defLDE', now: 0 }); assert.equal(pn.offender, 'offRT'); assert.equal(pn.victim, 'defLDE');
  assert.equal(buildPenalty('NOPE', sim), null); assert.equal(buildPenalty('DPI', { ents: [] }), null);
});

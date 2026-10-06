// Run game: blocking schemes (assignments, double team -> climb), RunningBackDecisionEngine and carrier moves.
// Tests check mechanisms and possibilities, not scripted results.
import test from 'node:test';
import assert from 'node:assert/strict';
import { lineups } from './fixtures.mjs';
import { createPlay, step, runToEnd } from '../src/sim/playSim.js';
import { PLAYBOOK, DEF_CALLS } from '../src/sim/formation.js';
import { decideRun, RB_DECISIONS } from '../src/sim/rbVision.js';

const ls = lineups('SEA', 'NE');
const make = (seed, extra = {}) => createPlay({ offense: ls.offense, defense: ls.defense, ballOn: 30, playType: 'run', seed, ...extra });
const BLOCK_TECHS = ['REACH', 'DRIVE', 'DOUBLE', 'COMBO', 'PULL', 'SEAL', 'CLIMB', 'KICK'];

test('every run concept gives each blocker an explicit technique; gap schemes pull', () => {
  for (const concept of Object.keys(PLAYBOOK.run)) {
    const sim = make(`ASSIGN-${concept}`, { concept });
    for (const s of ['LT', 'LG', 'C', 'RG', 'RT', 'TE']) {
      const a = sim.off[s].assignment;
      assert.equal(a.type, 'RUN_BLOCK', `${concept} ${s}`);
      assert.ok(BLOCK_TECHS.includes(a.tech), `${concept} ${s} tech ${a.tech}`);
      assert.ok(a.label.startsWith(a.tech), 'label shows the technique');
    }
    const techs = ['LT', 'LG', 'C', 'RG', 'RT', 'TE'].map(s => sim.off[s].assignment.tech);
    if (PLAYBOOK.run[concept].pull) assert.ok(techs.includes('PULL'), `${concept} has a puller`);
    if (PLAYBOOK.run[concept].scheme === 'DUO') assert.ok(techs.filter(t => t === 'DOUBLE').length >= 2, 'duo = double teams');
    if (PLAYBOOK.run[concept].reach) assert.ok(techs.includes('REACH'), 'outside zone reaches');
  }
});

test('double team: two linemen engage the same down lineman (real 2-on-1 engagement)', () => {
  let doubles = 0;
  for (let i = 0; i < 30; i++) {
    const sim = make(`DBL-${i}`, { concept: i % 2 ? 'DUO_R' : 'INSIDE_ZONE_L' });
    let seen = false;
    while (step(sim)) {
      for (const eng of sim.engagements) {
        if (eng.blockers.length !== 2 || eng.mode !== 'RUN') continue;
        assert.equal(eng.def.prof.group, 'DL', 'doubles are on down linemen');
        assert.notEqual(eng.blockers[0], eng.blockers[1]);
        for (const b of eng.blockers) assert.equal(b.engagedWith, eng.def);
        seen = true;
      }
    }
    if (seen) { doubles++; assert.ok(sim.debugEvents.some(e => e.type === 'DOUBLE_TEAM')); }
  }
  assert.ok(doubles >= 20, `double teams in ${doubles}/30 plays`);
});

test('climb: DOUBLE -> CONTROL -> CLIMB, and the climber reaches the second level', () => {
  let climbs = 0, onBacker = 0;
  for (let i = 0; i < 40; i++) {
    const sim = make(`CLIMB-${i}`, { concept: ['INSIDE_ZONE_R', 'DUO_L', 'POWER_R', 'INSIDE_ZONE_L'][i % 4] });
    let climber = null, reached = false;
    while (step(sim)) {
      if (!climber) { const ev = sim.debugEvents.find(e => e.type === 'CLIMB'); if (ev) climber = sim.ents.find(e => e.id === ev.by); }
      if (climber && climber.engagedWith && climber.engagedWith.prof.group !== 'DL') reached = true;
    }
    const ctl = sim.debugEvents.find(e => e.type === 'DOUBLE_CONTROL'), cl = sim.debugEvents.find(e => e.type === 'CLIMB');
    if (cl) {
      climbs++;
      assert.ok(ctl && ctl.t <= cl.t, 'a climb only happens after the double controlled the defender');
      assert.equal(climber.assignment.tech, 'CLIMB');
      if (reached) onBacker++;
    }
  }
  assert.ok(climbs >= 25, `climbs ${climbs}/40`);
  assert.ok(onBacker >= climbs * 0.3, `climber engaged a second-level defender ${onBacker}/${climbs}`);
});

test('RB never teleports (moves, cuts and collisions included)', () => {
  for (let i = 0; i < 40; i++) {
    const sim = make(`TELE-${i}`);
    const rb = sim.off.RB;
    while (step(sim)) {
      const d = Math.hypot(rb.pos.x - rb.prev.x, rb.pos.y - rb.prev.y);
      assert.ok(d < 0.5, `RB moved ${d.toFixed(2)} yd in one tick`); // 15 yd/s ceiling
      for (const e of sim.ents) assert.ok(Math.hypot(e.pos.x - e.prev.x, e.pos.y - e.prev.y) < 0.75, `${e.slot} jumped`);
    }
  }
});

test('same seed => same run (blocks, RB reads, moves, result)', () => {
  for (const concept of ['INSIDE_ZONE_R', 'COUNTER_L', 'TRAP_R']) {
    const a = make(`SAME-${concept}`, { concept }), b = make(`SAME-${concept}`, { concept });
    runToEnd(a); runToEnd(b);
    assert.equal(JSON.stringify(a.events), JSON.stringify(b.events));
    assert.equal(JSON.stringify(a.debugEvents), JSON.stringify(b.debugEvents));
    assert.deepEqual(a.off.RB.run.history, b.off.RB.run.history);
    assert.equal(a.result.yards, b.result.yards);
  }
});

// Crafted read: the whole front over-pursues to the play side (outside zone right), the backside is empty.
function overpursuit(seed, rbRatings) {
  const sim = make(seed, { concept: 'OUTSIDE_ZONE_R', defCall: 'COVER_3', overrides: rbRatings ? { RB: { ratings: rbRatings } } : undefined });
  while (!sim.carrier && step(sim));
  const rb = sim.off.RB;
  rb.pos = { x: sim.losX - 3.5, y: sim.by + 2 }; rb.vel = { x: 5, y: 2 };
  rb.hist = [{ x: rb.pos.x, y: rb.pos.y, vx: rb.vel.x, vy: rb.vel.y }];
  let k = 0;
  for (const e of sim.ents) if (e !== rb && e !== sim.qb) {
    // Everybody (both teams) piled from the ball to the play-side sideline, defenders flowing hard to it.
    const y = sim.by - 0.5 + 0.65 * k++;
    const x = sim.losX + (e.side === 'def' ? 1.2 + (k % 3) * 0.9 : -0.5);
    e.pos = { x, y }; e.prev = { ...e.pos };
    e.vel = e.side === 'def' ? { x: 0, y: 6 } : { x: 0, y: 0 };
    e.hist = [{ x, y, vx: e.vel.x, vy: e.vel.y }];
  }
  rb.run.phase = 'READ';
  decideRun(sim, rb);
  return { sim, decision: rb.run.decision, lane: rb.run.lane };
}

test('cutback: an over-pursuing front opens the backside and the RB cuts back (deterministic)', () => {
  const vision = { vision: 195, awareness: 190, agility: 170 };
  const a = overpursuit('CUTBACK-1', vision), b = overpursuit('CUTBACK-1', vision);
  assert.equal(a.decision, 'CUTBACK', `decision ${a.decision}`);
  assert.equal(a.lane.type, 'CUTBACK');
  assert.ok((a.lane.y - a.sim.by) * a.sim.runSide < 0, 'lane is on the backside');
  assert.equal(b.decision, a.decision);
  assert.equal(b.lane.y, a.lane.y);
  assert.ok(RB_DECISIONS.includes(a.decision));
});

test('attributes drive decisions: vision finds the cutback, elusive backs juke, power backs truck', () => {
  // Vision/awareness: decision quality = how far the chosen lane is from the best lane by true (noise-free) score.
  const regret = r => {
    let sum = 0, n = 0;
    for (let i = 0; i < 60; i++) {
      const sim = make(`VIS-${i}`, { overrides: { RB: { ratings: r } } });
      let last = null;
      while (step(sim)) {
        const rd = sim.runDebug;
        if (!rd || rd === last || !rd.chosen) continue;
        last = rd;
        sum += Math.max(...rd.lanes.map(l => l.trueScore)) - rd.chosen.trueScore; n++;
      }
    }
    return sum / Math.max(1, n);
  };
  const hiR = regret({ vision: 195, awareness: 190 }), loR = regret({ vision: 15, awareness: 15 });
  assert.ok(hiR < loR, `lane-choice regret: high vision ${hiR.toFixed(2)} vs low vision ${loR.toFixed(2)}`);

  const elusive = { elusiveness: 195, agility: 195, changeOfDirection: 195, trucking: 10, strength: 40, stiffArm: 10 };
  const power = { elusiveness: 10, agility: 40, changeOfDirection: 30, trucking: 198, strength: 195, stiffArm: 195 };
  const moves = r => {
    const m = {};
    for (let i = 0; i < 80; i++) {
      const sim = make(`MOVE-${i}`, { overrides: { RB: { ratings: r } } });
      runToEnd(sim);
      for (const e of sim.debugEvents) if (e.type === 'RB_MOVE' && e.by === sim.off.RB.id) m[e.move] = (m[e.move] || 0) + 1;
    }
    return m;
  };
  const me = moves(elusive), mp = moves(power);
  assert.ok((me.JUKE || 0) > (mp.JUKE || 0), `jukes elusive ${me.JUKE} vs power ${mp.JUKE}`);
  assert.ok((mp.TRUCK || 0) + (mp.STIFF_ARM || 0) > (me.TRUCK || 0) + (me.STIFF_ARM || 0), `truck/stiff arm power ${JSON.stringify(mp)} vs elusive ${JSON.stringify(me)}`);
});

test('no NaN anywhere: every concept x coverage, every tick', () => {
  const fin = v => Number.isFinite(v);
  let n = 0;
  for (const concept of Object.keys(PLAYBOOK.run)) for (const defCall of Object.keys(DEF_CALLS)) for (let k = 0; k < 2; k++) {
    const sim = make(`NAN-${concept}-${defCall}-${k}`, { concept, defCall, ballOn: [3, 30, 96][k % 3] });
    while (step(sim)) {
      for (const e of sim.ents) assert.ok(fin(e.pos.x) && fin(e.pos.y) && fin(e.vel.x) && fin(e.vel.y) && fin(e.energy), `${concept} ${e.slot} NaN`);
      for (const eng of sim.engagements) assert.ok(fin(eng.lev), 'leverage NaN');
      if (sim.runDebug) for (const l of sim.runDebug.lanes) assert.ok(fin(l.score) && fin(l.y), 'lane score NaN');
    }
    const r = sim.result;
    assert.ok(fin(r.yards) && fin(r.spotX) && fin(r.duration), 'result NaN');
    n++;
  }
  assert.equal(n, Object.keys(PLAYBOOK.run).length * Object.keys(DEF_CALLS).length * 2);
});

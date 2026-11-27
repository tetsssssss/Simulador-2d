// The 3D models must carry every clip the game can ask for, with the zone materials in the order athletes.js expects.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODELS, ZONES, zoneColors, buildClipIndex, modelUrl, worldFromSim, yawFromFacing } from '../core/render3d/athletes.js';
const plan = JSON.parse(readFileSync(new URL('../tools/blender/atlas_plan.json', import.meta.url), 'utf8'));
const glb = f => { const b = readFileSync(new URL('../' + f, import.meta.url)), n = b.readUInt32LE(12); return JSON.parse(b.toString('utf8', 20, 20 + n)); };
const PLAN_KIT = { football: ['football', 'football_hd'], hockey: ['hockey', 'hockey_hd'], goalie: ['hockey_goalie'], ref: ['ref'], baseball: ['baseball', 'baseball_bat'] };

test('every 3D model file exists, is skinned (11 joints), has the team-colour zone materials and carries every clip its 2D atlas uses', () => {
  for (const [kit, files] of Object.entries(MODELS)) for (const [lod, path] of Object.entries(files)) {
    const j = glb(path), names = new Set(j.animations.map(a => a.name)), joints = j.skins[0].joints.length;
    assert.equal(joints, 11, `${path} joints`); assert.ok(j.animations.length >= 147, `${path}: ${j.animations.length} animations`);
    const mats = j.materials.map(m => m.name); assert.ok(mats.includes('asu_jersey') && mats.includes('asu_pants'), `${path} lacks the team-colour zones`); assert.ok(mats.every(n => ZONES.includes(n) || ['asu_metal', 'asu_leather', 'asu_bat'].includes(n)), `${path} unexpected material ${mats}`);
    for (const k of PLAN_KIT[kit]) for (const pg of plan.kits[k].pages) for (const c of pg.clips) assert.ok(names.has(c), `${path} lacks clip "${c}" used by atlas ${k}`);
  }
});
test('zoneColors: jersey = helmet, pants follow the 2D rules, accent = secondary, referees are never tinted, goalies use the hockey pants rule', () => {
  const z = zoneColors('football', '#0a2870', '#ffd23f'); assert.deepEqual(z.asu_jersey, z.asu_helmet); assert.equal(z.asu_accent[0].toFixed(3), (255 / 255).toFixed(3));
  assert.ok(z.asu_jersey.every(v => v >= 0 && v <= 1)); assert.deepEqual(zoneColors('ref', '#f00'), {});
  const h = zoneColors('hockey', '#c8c8c8', '#fff'); assert.equal(Math.round(h.asu_pants[0] * 255), 124); assert.deepEqual(zoneColors('goalie', '#c8c8c8', '#fff').asu_pants, h.asu_pants);
});
test('clip index uses the track name (the game clip id) and ignores duplicates / junk; modelUrl prefers HD and rejects unknown kits', () => {
  const idx = buildClipIndex([{ name: 'f.glb/animation/0', resource: { name: 'mv_run' } }, { name: 'f.glb/animation/1', resource: { name: 'mv_run' } }, { name: 'plain' }, null, {}]);
  assert.deepEqual([...idx.keys()].sort(), ['mv_run', 'plain']); assert.equal(buildClipIndex(null).size, 0);
  assert.match(modelUrl('football'), /football_hd\.glb$/); assert.match(modelUrl('football', false), /football\.glb$/); assert.match(modelUrl('goalie'), /goalie_hd\.glb$/); assert.throws(() => modelUrl('golf'));
});
test('world mapping: yards/feet to metres, sim +y -> world -Z, facing in degrees', () => {
  assert.deepEqual(worldFromSim('nfl', 10, 5, 2).map(v => +v.toFixed(3)), [9.144, 2, -4.572]); assert.deepEqual(worldFromSim('nhl', 100, 42.5).map(v => +v.toFixed(3)), [30.48, 0, -12.954]);
  assert.equal(yawFromFacing(Math.PI / 2), 90);
});

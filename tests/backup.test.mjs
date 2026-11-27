import test from 'node:test';
import assert from 'node:assert/strict';
import { collectBackup, validateBackup, restoreBackup, checksum, isBackupKey, protectStorage, BACKUP_VERSION } from '../core/saves/backup.js';
class Mem { constructor(o = {}) { this.m = new Map(Object.entries(o)); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } }
const seed = () => new Mem({ asu_career_c1: '{"a":1}', asu_career_c1_auto: '{"a":0}', asu_nfl_save_1: '{"q":1}', asu_audio: '{"master":0.5}', asu_roster_2026: 'HUGE', asu_perf: '1', other_app: 'x', asu_backup_tmp: 'no' });

test('collectBackup: takes asu_* data, leaves caches / diagnostics / foreign keys out, and validates', () => {
  const b = collectBackup(seed(), new Date('2026-11-17T12:00:00Z'));
  assert.deepEqual(Object.keys(b.keys).sort(), ['asu_audio', 'asu_career_c1', 'asu_career_c1_auto', 'asu_nfl_save_1']); assert.equal(b.count, 4); assert.equal(b.createdAt, '2026-11-17T12:00:00.000Z');
  assert.deepEqual(validateBackup(b), { ok: true }); assert.ok(!isBackupKey('other_app') && !isBackupKey('asu_roster_2026') && isBackupKey('asu_nfl_save_3'));
});
test('validateBackup: rejects foreign files, newer versions, tampering and unexpected keys', () => {
  const b = collectBackup(seed());
  assert.equal(validateBackup(null).ok, false); assert.equal(validateBackup({ format: 'x' }).ok, false); assert.equal(validateBackup({ ...b, version: BACKUP_VERSION + 1 }).ok, false);
  assert.match(validateBackup({ ...b, keys: { ...b.keys, asu_career_c1: '{"a":2}' } }).error, /soma de verificação/);
  const evil = { ...b.keys, 'evil_key': 'x' }; assert.match(validateBackup({ ...b, keys: evil, checksum: checksum(evil) }).error, /inesperada/);
  const bad = { ...b.keys, asu_x: 5 }; assert.match(validateBackup({ ...b, keys: bad, checksum: checksum(bad) }).error, /inválido/);
});
test('restoreBackup: writes new keys, skips identical, protects conflicts unless overwrite, survives a full storage', () => {
  const doc = collectBackup(seed()), dst = new Mem({ asu_career_c1: '{"a":99}', asu_audio: '{"master":0.5}' });
  const r = restoreBackup(dst, doc); assert.ok(r.ok);
  assert.deepEqual(r.conflicts, ['asu_career_c1']); assert.deepEqual(r.skipped, ['asu_audio']); assert.deepEqual(r.written.sort(), ['asu_career_c1_auto', 'asu_nfl_save_1']);
  assert.equal(dst.getItem('asu_career_c1'), '{"a":99}');                               // local data untouched
  const o = restoreBackup(dst, doc, { overwrite: true }); assert.deepEqual(o.written, ['asu_career_c1']); assert.equal(dst.getItem('asu_career_c1'), '{"a":1}');
  const full = new Mem(); full.setItem = () => { throw new Error('QuotaExceededError'); }; const f = restoreBackup(full, doc); assert.equal(f.ok, false); assert.match(f.error, /espaço/);
  assert.equal(restoreBackup(new Mem(), { format: 'nope' }).ok, false);
});
test('protectStorage: true when granted, false when refused, null when unsupported', async () => {
  assert.equal(await protectStorage({ storage: { persist: async () => true } }), true); assert.equal(await protectStorage({ storage: { persist: async () => false } }), false);
  assert.equal(await protectStorage({ storage: { persisted: async () => true, persist: async () => false } }), true); assert.equal(await protectStorage({}), null); assert.equal(await protectStorage(null), null);
});

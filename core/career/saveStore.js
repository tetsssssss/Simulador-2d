// Career saves for the whole universe (any sport, any role, many careers). Pure infrastructure: no sport rules.
// - SaveVersion: CAREER_SAVE_VERSION; every save is { saveVersion, id, sport, role, name, createdAt, updatedAt, metadata, career }.
// - MigrationManager: step migrations (vN → vN+1). Before an old save is upgraded its raw text is copied to a backup key,
//   so migration is never destructive. Saves from a future version are refused (not overwritten).
// - Manual save, autosave (separate rolling key per career — a bad autosave never overwrites the manual save),
//   export / import JSON, corrupted saves kept aside, index of careers, active career.
// - NFL v0.5 slots (asu_nfl_save_N, version 1) can be imported as hub careers (copy; the NFL slots are untouched).
export const CAREER_SAVE_VERSION = 3;
const INDEX = 'asu_careers_index', ACTIVE = 'asu_careers_active';
const KEY = id => `asu_career_${id}`, AUTO = id => `asu_career_${id}_auto`, AUTO2 = id => `asu_career_${id}_auto2`, BACKUP = (id, v) => `asu_career_${id}_backup_v${v}`;

export function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), key: i => [...m.keys()][i] ?? null, get length() { return m.size; }, _m: m };
}
export function safeStorage() {
  try { const s = globalThis.localStorage; s.setItem('__asu_t', '1'); s.removeItem('__asu_t'); return s; } catch { return memoryStorage(); }
}

export function createMigrationManager() {
  const steps = new Map();
  return {
    register(from, fn) { steps.set(from, fn); return this; },
    needs: obj => (obj?.saveVersion ?? 1) !== CAREER_SAVE_VERSION,
    migrate(obj) {
      let o = JSON.parse(JSON.stringify(obj));
      if (o.saveVersion == null) o.saveVersion = 1;
      if (o.saveVersion > CAREER_SAVE_VERSION) throw new Error(`Save de versão futura (v${o.saveVersion}); atualize o jogo.`);
      while (o.saveVersion < CAREER_SAVE_VERSION) {
        const fn = steps.get(o.saveVersion);
        if (!fn) throw new Error(`Sem migração v${o.saveVersion} → v${o.saveVersion + 1}`);
        o = fn(o); o.saveVersion = (o.saveVersion ?? 1) + 1;
      }
      return o;
    },
  };
}

// v1 → v2: the NFL v0.5 slot envelope { version:1, career:{team, week, wins…}, settings, metadata } becomes a hub
// career shell flagged `legacyNfl` (sport adapters rebuild the league around it on first load).
export const migrations = createMigrationManager().register(1, o => {
  if (o.sport) return o; // already hub-shaped v1
  const c = o.career || {};
  return {
    saveVersion: 1, id: o.id || `nfl-legacy-${(c.seed || c.team || 'x')}`.toLowerCase().replace(/[^a-z0-9-]/g, ''),
    sport: 'nfl', role: 'GM', name: c.name || `Carreira ${c.team}`, createdAt: o.createdAt || new Date().toISOString(),
    career: { legacyNfl: c, sport: 'nfl', role: 'GM', name: c.name || `Carreira ${c.team}`, userTeam: c.team, season: c.season || 2026, seed: c.seed || `LEG-${c.team}` },
  };
});

// v2 → v3: adds the "career 3.0" extension state (career.x). Only spec-independent defaults are written here; the sport
// layer finishes the job (ensureV3) the first time the save is attached to its spec. Nothing from v2 is removed or rewritten.
migrations.register(2, o => {
  const c = o.career;
  if (c && typeof c === 'object' && !c.legacyNfl) {
    c.saveVersion = 3;
    if (!c.x) c.x = { v: 3, ready: false, migratedFrom: 2, cal: { day: 0, offDay: 0 }, feed: [], newsCur: { tx: 0, news: 0 } };
  }
  return o;
});

// Structural sanity check (a parseable but broken save is treated as corrupt). Legacy NFL shells are exempt.
export function integrityCheck(career) {
  if (!career || typeof career !== 'object') return 'sem carreira';
  if (career.legacyNfl && !career.players) return null;
  if (!career.teams && !career.players && !career.phase) return null; // empty shell: the sport adapter rebuilds the league
  if (!Array.isArray(career.teams) || !career.teams.length) return 'times ausentes';
  if (!career.players || typeof career.players !== 'object') return 'jogadores ausentes';
  if (!career.standings || typeof career.standings !== 'object') return 'tabela ausente';
  if (!Number.isFinite(career.season)) return 'temporada inválida';
  if (!['PRESEASON', 'REGULAR', 'PLAYOFFS', 'OFFSEASON'].includes(career.phase)) return 'fase inválida';
  if (!Number.isFinite(career.slate)) return 'rodada inválida';
  return null;
}

export function metadataOf(career) {
  if (!career) return {};
  const st = career.standings?.[career.userTeam], me = career.me && career.players?.[career.me.id];
  return {
    sport: career.sport, role: career.role, name: career.name, team: career.userTeam || me?.t || null, season: career.season, phase: career.phase,
    record: st ? [st.w, st.l, st.otl ? st.otl : st.t].filter((x, i) => i < 2 || x).join('-') : '', player: me ? `${me.n} (${me.pos}, ${me.ovr})` : null,
  };
}

export function createCareerStore(storage = safeStorage()) {
  const readRaw = k => storage.getItem(k);
  const index = () => { try { const v = JSON.parse(readRaw(INDEX) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };
  const writeIndex = list => storage.setItem(INDEX, JSON.stringify(list));
  const touchIndex = env => { const list = index().filter(e => e.id !== env.id); list.unshift({ id: env.id, sport: env.sport, role: env.role, name: env.name, updatedAt: env.updatedAt, metadata: env.metadata }); writeIndex(list); };
  const envelope = (career, prev) => {
    const now = new Date().toISOString();
    return { saveVersion: CAREER_SAVE_VERSION, id: career.id, sport: career.sport, role: career.role, name: career.name, createdAt: prev?.createdAt || career.createdAt || now, updatedAt: now, metadata: metadataOf(career), career };
  };
  function parseAndMigrate(id, raw) {
    const obj = JSON.parse(raw);
    if (!migrations.needs(obj)) return { env: obj, migrated: false };
    storage.setItem(BACKUP(id, obj.saveVersion ?? 1), raw);
    const env = migrations.migrate(obj);
    storage.setItem(KEY(env.id), JSON.stringify(env));
    return { env, migrated: true };
  }
  function validate(env) {
    if (!env || typeof env !== 'object') return 'vazio';
    if (!['nfl', 'nhl', 'mlb'].includes(env.sport)) return 'esporte inválido';
    if (!env.career || typeof env.career !== 'object') return 'sem carreira';
    return integrityCheck(env.career);
  }
  const api = {
    list: () => index(),
    load(id, { preferAuto = true, slot } = {}) {
      const keys = slot === 'manual' ? [KEY(id)] : slot === 'auto' ? [AUTO(id)] : slot === 'auto2' ? [AUTO2(id)] : preferAuto ? [AUTO(id), AUTO2(id), KEY(id)] : [KEY(id)];
      const found = keys.map(k => ({ k, raw: readRaw(k) })).filter(x => x.raw !== null);
      if (!found.length) return { status: 'missing' };
      // newest valid copy wins (autosave vs manual)
      let best = null, lastErr = null;
      for (const f of found) {
        try {
          const { env, migrated } = parseAndMigrate(id, f.raw);
          const err = validate(env); if (err) throw new Error(err);
          if (!best || env.updatedAt > best.env.updatedAt) best = { env, migrated, from: f.k === AUTO(id) ? 'auto' : f.k === AUTO2(id) ? 'auto2' : 'manual' };
        } catch (e) { lastErr = e; storage.setItem(`${f.k}_corrupt`, f.raw); }
      }
      if (!best) return { status: 'corrupt', error: lastErr?.message || 'save ilegível' };
      return { status: 'ok', save: best.env, migrated: best.migrated, from: best.from };
    },
    // Manual save (clears the autosave ring) or autosave (rolling ring of 2 slots: auto = newest, auto2 = previous).
    // Storage-full (localStorage ~5 MB) is handled: the oldest ring slot is dropped and the write retried; if it still
    // fails an Error with code 'QUOTA' is thrown and every existing slot is left intact.
    save(career, { manual = true } = {}) {
      if (!career?.id) throw new Error('carreira sem id');
      const prev = api.load(career.id);
      const env = envelope(career, prev.status === 'ok' ? prev.save : null);
      const text = JSON.stringify(env);
      const put = (k, v) => {
        try { storage.setItem(k, v); return; } catch (e) { /* quota: free the oldest rolling slot and retry once */ }
        storage.removeItem(AUTO2(career.id));
        try { storage.setItem(k, v); } catch (e) { const err = new Error('Armazenamento cheio: exporte e apague carreiras antigas.'); err.code = 'QUOTA'; throw err; }
      };
      if (manual) { put(KEY(career.id), text); storage.removeItem(AUTO(career.id)); storage.removeItem(AUTO2(career.id)); }
      else {
        const cur = readRaw(AUTO(career.id));
        if (cur !== null) { try { storage.setItem(AUTO2(career.id), cur); } catch { storage.removeItem(AUTO2(career.id)); } }
        put(AUTO(career.id), text);
      }
      touchIndex(env); storage.setItem(ACTIVE, career.id);
      return { env, bytes: text.length };
    },
    slots(id) {
      return [['manual', KEY(id)], ['auto', AUTO(id)], ['auto2', AUTO2(id)]].map(([slot, k]) => ({ slot, raw: readRaw(k) })).filter(x => x.raw !== null).map(({ slot, raw }) => {
        try { const o = JSON.parse(raw); return { slot, bytes: raw.length, updatedAt: o.updatedAt, saveVersion: o.saveVersion, metadata: o.metadata, ok: true }; } catch { return { slot, bytes: raw.length, ok: false }; }
      });
    },
    autosave(career) { return api.save(career, { manual: false }); },
    remove(id) {
      for (const k of [KEY(id), AUTO(id), AUTO2(id), `${KEY(id)}_corrupt`, `${AUTO(id)}_corrupt`, `${AUTO2(id)}_corrupt`]) storage.removeItem(k);
      writeIndex(index().filter(e => e.id !== id));
      if (storage.getItem(ACTIVE) === id) storage.removeItem(ACTIVE);
    },
    get activeId() { return storage.getItem(ACTIVE); },
    setActive(id) { if (id) storage.setItem(ACTIVE, id); else storage.removeItem(ACTIVE); },
    exportJSON(id) { const s = api.load(id); return s.status === 'ok' ? JSON.stringify(s.save) : null; },
    importJSON(text) {
      let obj; try { obj = JSON.parse(text); } catch { throw new Error('Arquivo não é JSON válido'); }
      const env = migrations.needs(obj) ? migrations.migrate(obj) : obj;
      const err = validate(env); if (err) throw new Error(`Save inválido: ${err}`);
      if (index().some(e => e.id === env.id)) { env.id = `${env.id}-imp${Date.now().toString(36)}`; env.career.id = env.id; }
      env.updatedAt = new Date().toISOString(); env.metadata = metadataOf(env.career);
      storage.setItem(KEY(env.id), JSON.stringify(env)); touchIndex(env);
      return env;
    },
    // Copies NFL v0.5 slots (version 1) into hub careers once. The original slots are never modified.
    importNflSlots(count = 5) {
      const done = new Set(index().map(e => e.importedFrom).filter(Boolean)), out = [];
      for (let i = 1; i <= count; i++) {
        const raw = readRaw(`asu_nfl_save_${i}`); if (!raw || done.has(`nfl-slot-${i}`)) continue;
        try {
          const obj = JSON.parse(raw); if (!obj?.career?.team) continue;
          const env = migrations.migrate({ ...obj, id: `nfl-slot${i}-${(obj.career.seed || obj.career.team).toString().toLowerCase().replace(/[^a-z0-9]/g, '')}` });
          if (index().some(e => e.id === env.id)) continue;
          env.career.id = env.id; env.updatedAt = new Date().toISOString(); env.metadata = metadataOf(env.career);
          storage.setItem(KEY(env.id), JSON.stringify(env));
          const list = index(); list.unshift({ id: env.id, sport: 'nfl', role: env.role, name: env.name, updatedAt: env.updatedAt, metadata: env.metadata, importedFrom: `nfl-slot-${i}` }); writeIndex(list);
          out.push(env.id);
        } catch { /* unreadable slot: leave it alone */ }
      }
      return out;
    },
    usage() { let n = 0; for (let i = 0; i < (storage.length || 0); i++) { const k = storage.key(i); if (k && k.startsWith('asu_career')) n += (storage.getItem(k) || '').length; } return n; },
  };
  return api;
}

// Names used by the career 3.0 docs.
export const SaveVersion = CAREER_SAVE_VERSION;
export const MigrationManager = migrations;
export const createSaveManager = createCareerStore;

// SaveManager: versioned local saves (slots), settings persistence, legacy migration, JSON export/import.
// Envelope: { version, createdAt, updatedAt, career, settings, metadata }. Storage defaults to localStorage;
// an in-memory storage can be injected (tests / private mode).
export const SAVE_VERSION = 1;
export const SLOT_COUNT = 5;
export const LEGACY_KEY = 'asu_career';
const SLOT_KEY = i => `asu_nfl_save_${i}`;
const ACTIVE_KEY = 'asu_nfl_active_slot';
const SETTINGS_KEY = 'asu_nfl_settings';

export function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m };
}

function safeStorage() {
  try { const s = globalThis.localStorage; s.setItem('__asu_t', '1'); s.removeItem('__asu_t'); return s; } catch { return memoryStorage(); }
}

export function metadataOf(career) {
  if (!career) return {};
  return { name: career.name || `Carreira ${career.team}`, team: career.team, season: career.season || 2026, week: career.week || 1,
    record: `${career.wins || 0}-${career.losses || 0}${career.ties ? '-' + career.ties : ''}` };
}

export function envelope(career, settings, prev = null) {
  const now = new Date().toISOString();
  return { version: SAVE_VERSION, createdAt: prev?.createdAt || now, updatedAt: now, career, settings: settings || null, metadata: metadataOf(career) };
}

// Legacy save = bare career object { team, week, wins, losses, injuries, trades } (pre-v0.5).
export function isLegacy(obj) { return obj && typeof obj === 'object' && !('version' in obj) && typeof obj.team === 'string'; }

export function migrateLegacySave(legacy) {
  const career = { ...legacy, migratedFrom: 'asu_career' };
  if (!career.name) career.name = `Carreira ${career.team} (importada)`;
  return envelope(career, null);
}

// Upgrades older envelopes to SAVE_VERSION (one step per version). v1 is the first versioned format.
export function migrate(obj) {
  if (isLegacy(obj)) return migrateLegacySave(obj);
  if (!obj || typeof obj !== 'object' || typeof obj.version !== 'number') throw new Error('Formato de save desconhecido');
  if (obj.version > SAVE_VERSION) throw new Error(`Save de versão futura (${obj.version})`);
  // (future: if (obj.version === 1) obj = v1to2(obj); ...)
  return obj;
}

export function validate(env) {
  if (!env || typeof env !== 'object') return 'vazio';
  if (!env.career || typeof env.career !== 'object') return 'sem carreira';
  if (typeof env.career.team !== 'string') return 'time inválido';
  return null;
}

export function createSaveManager(storage = safeStorage()) {
  const read = key => { const raw = storage.getItem(key); if (raw === null) return { raw: null, obj: null }; try { return { raw, obj: JSON.parse(raw) }; } catch { return { raw, obj: undefined }; } };

  function loadSlot(i) {
    const { raw, obj } = read(SLOT_KEY(i));
    if (raw === null) return { status: 'empty' };
    try {
      if (obj === undefined) throw new Error('JSON inválido');
      const env = migrate(obj);
      const err = validate(env);
      if (err) throw new Error(err);
      if (env !== obj) storage.setItem(SLOT_KEY(i), JSON.stringify(env));
      return { status: 'ok', save: env };
    } catch (e) {
      // Corrupted: keep the raw text aside (never silently discard), report it.
      storage.setItem(`${SLOT_KEY(i)}_corrupt`, raw);
      return { status: 'corrupt', error: e.message };
    }
  }

  const api = {
    slots: () => Array.from({ length: SLOT_COUNT }, (_, i) => ({ slot: i + 1, ...loadSlot(i + 1) })),
    load: i => loadSlot(i),
    save(i, career, settings) {
      const prev = loadSlot(i);
      const env = envelope(career, settings, prev.status === 'ok' ? prev.save : null);
      storage.setItem(SLOT_KEY(i), JSON.stringify(env));
      storage.setItem(ACTIVE_KEY, String(i));
      return env;
    },
    remove(i) { storage.removeItem(SLOT_KEY(i)); storage.removeItem(`${SLOT_KEY(i)}_corrupt`); if (api.activeSlot() === i) storage.removeItem(ACTIVE_KEY); },
    activeSlot() { const v = Number(storage.getItem(ACTIVE_KEY)); return v >= 1 && v <= SLOT_COUNT ? v : null; },
    setActive(i) { if (i) storage.setItem(ACTIVE_KEY, String(i)); else storage.removeItem(ACTIVE_KEY); },
    firstFreeSlot() { return api.slots().find(s => s.status === 'empty')?.slot || null; },
    // Autosave into the active slot (no-op without one).
    autosave(career, settings) { const i = api.activeSlot(); return i ? api.save(i, career, settings) : null; },
    exportSlot(i) { const s = loadSlot(i); return s.status === 'ok' ? JSON.stringify(s.save, null, 2) : null; },
    importInto(i, text) {
      let obj;
      try { obj = JSON.parse(text); } catch { throw new Error('Arquivo não é JSON válido'); }
      const env = migrate(obj);
      const err = validate(env);
      if (err) throw new Error(`Save inválido: ${err}`);
      env.updatedAt = new Date().toISOString(); env.metadata = metadataOf(env.career);
      storage.setItem(SLOT_KEY(i), JSON.stringify(env));
      return env;
    },
    // One-time legacy migration: asu_career → first free slot. The legacy key is kept as a backup copy.
    migrateLegacy() {
      const { raw, obj } = read(LEGACY_KEY);
      if (raw === null || storage.getItem('asu_nfl_legacy_migrated')) return null;
      if (!isLegacy(obj)) { storage.setItem('asu_nfl_legacy_migrated', 'invalid'); return null; }
      const slot = api.firstFreeSlot();
      if (!slot) return null;
      const env = migrateLegacySave(obj);
      storage.setItem(SLOT_KEY(slot), JSON.stringify(env));
      storage.setItem('asu_career_legacy_backup', raw);
      storage.setItem('asu_nfl_legacy_migrated', String(slot));
      if (!api.activeSlot()) storage.setItem(ACTIVE_KEY, String(slot));
      return { slot, save: env };
    },
    loadSettings() { const { obj } = read(SETTINGS_KEY); return obj && typeof obj === 'object' ? obj : null; },
    saveSettings(s) { storage.setItem(SETTINGS_KEY, JSON.stringify(s)); },
  };
  return api;
}

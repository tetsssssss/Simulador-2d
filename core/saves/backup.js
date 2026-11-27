// Whole-app backup: every `asu_*` key (careers, slots, quick-game saves, settings, avatar edits) in ONE json file, so saves can move between phone and PC
// or survive a browser data wipe. Re-downloadable caches (roster snapshots) and diagnostics are left out. Pure functions over a Storage-like object.
export const BACKUP_FORMAT = 'asu-backup', BACKUP_VERSION = 1;
const EXCLUDE = [/^asu_roster_/, /^asu_perf$/, /^asu_backup_/];
export const isBackupKey = k => typeof k === 'string' && k.startsWith('asu_') && !EXCLUDE.some(r => r.test(k));

// FNV-1a 32-bit over the sorted "key=value" lines: detects truncated / hand-edited files (not a security feature).
export function checksum(keys) {
  let h = 0x811c9dc5;
  for (const k of Object.keys(keys).sort()) { const s = `${k}=${keys[k]}\n`; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } }
  return h.toString(16).padStart(8, '0');
}
const allKeys = st => { const out = []; for (let i = 0; i < st.length; i++) out.push(st.key(i)); return out; };

export function collectBackup(st, now = new Date()) {
  const keys = {}; let bytes = 0;
  for (const k of allKeys(st)) if (isBackupKey(k)) { const v = st.getItem(k); if (typeof v === 'string') { keys[k] = v; bytes += k.length + v.length; } }
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, app: 'American Sports Universe 2D', createdAt: now.toISOString(), count: Object.keys(keys).length, bytes, checksum: checksum(keys), keys };
}

export function validateBackup(doc) {
  if (!doc || typeof doc !== 'object' || doc.format !== BACKUP_FORMAT) return { ok: false, error: 'Não é um backup do American Sports Universe.' };
  if (!Number.isInteger(doc.version) || doc.version > BACKUP_VERSION) return { ok: false, error: `Backup de uma versão mais nova (${doc.version}). Atualize o jogo.` };
  if (!doc.keys || typeof doc.keys !== 'object' || Array.isArray(doc.keys)) return { ok: false, error: 'Backup sem dados.' };
  for (const [k, v] of Object.entries(doc.keys)) { if (!isBackupKey(k)) return { ok: false, error: `Chave inesperada no backup: ${String(k).slice(0, 40)}` }; if (typeof v !== 'string') return { ok: false, error: `Valor inválido em ${k}` }; }
  if (doc.checksum !== checksum(doc.keys)) return { ok: false, error: 'O arquivo está incompleto ou foi alterado (soma de verificação não confere).' };
  return { ok: true };
}

// overwrite=false: keys that already exist with DIFFERENT content are kept as they are (reported in `conflicts`), identical ones are skipped, new ones are written.
export function restoreBackup(st, doc, { overwrite = false } = {}) {
  const v = validateBackup(doc); if (!v.ok) return { ok: false, error: v.error, written: [], skipped: [], conflicts: [] };
  const written = [], skipped = [], conflicts = [];
  for (const [k, val] of Object.entries(doc.keys)) {
    const cur = st.getItem(k);
    if (cur === val) { skipped.push(k); continue; }
    if (cur != null && !overwrite) { conflicts.push(k); continue; }
    try { st.setItem(k, val); written.push(k); } catch (e) { return { ok: false, error: 'Sem espaço no armazenamento do navegador. Libere espaço (apague saves antigos) e tente de novo.', written, skipped, conflicts }; }
  }
  return { ok: true, written, skipped, conflicts };
}

// Ask the browser not to evict our data under storage pressure (Android Chrome / installed PWA). Resolves to true / false / null (unsupported).
export async function protectStorage(nav = typeof navigator !== 'undefined' ? navigator : null) {
  try { if (!nav?.storage?.persist) return null; if (await nav.storage.persisted?.()) return true; return !!(await nav.storage.persist()); } catch { return null; }
}

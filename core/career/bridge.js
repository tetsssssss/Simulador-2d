// Career ↔ Partida 2D bridge (localStorage, same origin). The Career Hub writes the user's next game with the
// career rosters; the sport's 2D view plays it with its real engine and writes the result back; the hub applies it
// to the right game (matched by key). No engine or sport rule here.
const PENDING = 'asu_career_pending', RESULT = 'asu_career_result';
const get = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full / private */ } };

export function setPending(p) { set(PENDING, { ...p, createdAt: Date.now() }); set(RESULT, null); }
export function readPending(sport) { const p = get(PENDING); return p && p.sport === sport && !p.done ? p : null; }
export function clearPending() { set(PENDING, null); }
export function writeResult(r) { set(RESULT, r); const p = get(PENDING); if (p) set(PENDING, { ...p, done: true }); }
export function takeResult(careerId) { const r = get(RESULT); if (!r || r.careerId !== careerId) return null; set(RESULT, null); set(PENDING, null); return r; }
export function peekPending() { return get(PENDING); }
// Navigate the universe shell (parent document) to a sport / the hub.
export function goTo(target, inner) {
  try { if (inner) localStorage.setItem(`asu_inner_${target}`, inner); } catch { /* ignore */ }
  try { (window.top || window).location.hash = `#${target}`; } catch { window.location.hash = `#${target}`; }
}

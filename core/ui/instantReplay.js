// Instant replay for sports whose view reads a LIVE state object (NHL, MLB). A ring buffer keeps the last seconds of entity snapshots; on a big
// moment (goal, home run) — or on demand — it plays them back at half speed by rendering a COPY of the state, so the simulation is never touched
// (the view just stops advancing the engine while the replay is active). Pure logic here; each sport supplies an adapter:
//   snap(state)  → { t, lists: { name: [entities with id, x, y] }, objs: { name: object|null } }
//   build(state, lists, objs, t) → the state object handed to the renderer during the replay
export function createInstantReplay({ adapter, every = 1 / 30, seconds = 8, after = 0.9, speed = 0.5, max = 420 } = {}) {
  let buf = [], lastT = -Infinity, pending = null, play = null;
  const clone = o => (o ? { ...o } : null);
  const blend = (f0, f1, u) => {
    const lists = {}, objs = {};
    for (const k of Object.keys(f1.lists)) {
      const prev = new Map((f0.lists[k] || []).map(e => [e.id, e]));
      lists[k] = f1.lists[k].map(e => { const p = prev.get(e.id) || e; return { ...e, px: p.x, py: p.y }; });
    }
    for (const k of Object.keys(f1.objs)) { const o = f1.objs[k], p = f0.objs[k] || o; objs[k] = o ? { ...o, px: p?.x ?? o.x, py: p?.y ?? o.y, pz: p?.z ?? o.z } : null; }
    return { lists, objs, alpha: Math.max(0, Math.min(1, u)) };
  };
  return {
    get active() { return !!play; },
    get buffered() { return buf.length; },
    // call every frame while the engine runs
    record(state) {
      if (play || !state) return;
      const s = adapter.snap(state); if (s.t - lastT < every - 1e-9 && s.t >= lastT) return;
      if (s.t < lastT) { buf = []; pending = null; }       // new game / clock reset
      lastT = s.t;
      buf.push({ t: s.t, lists: Object.fromEntries(Object.entries(s.lists).map(([k, l]) => [k, l.map(clone)])), objs: Object.fromEntries(Object.entries(s.objs).map(([k, o]) => [k, clone(o)])) });
      if (buf.length > max) buf.shift();
    },
    // schedule a replay of the last `seconds`, starting `after` sim-seconds from now (so the aftermath is in the buffer)
    trigger(state, { lead = seconds, delay = after } = {}) { if (play || !state) return false; const t = adapter.snap(state).t; pending = { from: t - lead, at: t + delay }; return true; },
    // call every frame with real dt (seconds). Returns { state, alpha } while a replay is on screen, else null.
    step(dt, state) {
      if (!play && pending && state && adapter.snap(state).t >= pending.at) {
        const frames = buf.filter(f => f.t >= pending.from); pending = null;
        if (frames.length > 8) play = { frames, i: 0 };
      }
      if (!play) return null;
      play.i += dt * 30 * speed;
      if (play.i >= play.frames.length - 1) { play = null; return null; }
      const k = Math.floor(play.i), b = blend(play.frames[k], play.frames[k + 1], play.i - k), f = play.frames[k + 1];
      return { state: adapter.build(state, b.lists, b.objs, f.t), alpha: b.alpha, progress: play.i / (play.frames.length - 1) };
    },
    skip() { play = null; pending = null; },
    now(state) { return this.trigger(state, { delay: 0 }); },
  };
}

// Small overlay (tag + button) inside the sport's canvas wrapper. Returns { sync(active, canReplay) , dispose() }.
export function mountReplayControls(wrap, { onReplay, onSkip, label = '⏪ Replay' } = {}) {
  if (!wrap) return { sync() {}, dispose() {} };
  const box = wrap.ownerDocument.createElement('div'); box.className = 'inst-replay';
  box.style.cssText = 'position:absolute;right:10px;top:10px;z-index:6;display:flex;gap:8px;align-items:center;font:600 12px Inter,system-ui,sans-serif';
  box.innerHTML = `<span class="ir-tag" style="display:none;background:#e8453c;color:#fff;border-radius:6px;padding:3px 8px">⏪ REPLAY · 1/2 velocidade</span><button class="ir-btn" style="background:#0f1824;color:#e9f0f7;border:1px solid #2a3a4e;border-radius:8px;padding:5px 10px;cursor:pointer">${label}</button>`;
  if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
  wrap.appendChild(box);
  const tag = box.querySelector('.ir-tag'), btn = box.querySelector('.ir-btn'); let on = false;
  btn.onclick = () => (on ? onSkip?.() : onReplay?.());
  return { sync(active, can = true) { on = active; tag.style.display = active ? '' : 'none'; btn.textContent = active ? '⏭ Skip' : label; btn.disabled = !active && !can; }, dispose() { box.remove(); } };
}

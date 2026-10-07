// Speed / pause / simulate / new game controls for a sport view driven by a fixed-step engine.
// The engine must expose: speed, setSpeed(v), simulate(seconds) and state.over. `view.paused` / `view.simming`
// are read by the view's frame loop. Simulation runs in chunks (setTimeout 0) so the page never freezes.
export function mountEngineControls(el, { engine, view, storeKey, chunkSeconds = 90, periodKey = null, labels = {}, onChunk = () => {}, onNewGame = () => {} }) {
  if (!el) return () => {};
  const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };
  const saved = +store.get(storeKey); if (saved && engine.setSpeed) engine.setSpeed(saved);
  let timer = 0, alive = true;
  const speeds = [1, 2, 4, 8, 16];
  function draw() {
    el.innerHTML = `<div class="seg">${speeds.map(v => `<button data-spd="${v}" class="${engine.speed === v ? 'on' : ''}">${v}x</button>`).join('')}</div>
      <button data-act="pause" title="Pausar / continuar">${view.paused ? '▶' : '❚❚'}</button>
      ${periodKey ? `<button data-act="period" ${view.simming || engine.state.over ? 'disabled' : ''}>${labels.period || 'Sim período'} ⏭</button>` : ''}
      <button data-act="end" ${view.simming || engine.state.over ? 'disabled' : ''}>${labels.end || 'Sim to end'} ⏭⏭</button>
      <button data-act="new" class="ghost" title="Nova partida (nova seed)">↻</button>`;
  }
  function sim(untilChange) {
    if (view.simming || engine.state.over) return;
    view.simming = true; draw();
    const k0 = periodKey ? periodKey(engine.state) : null;
    const chunk = () => {
      if (!alive) return;
      engine.simulate(chunkSeconds);
      onChunk();
      if (engine.state.over || (untilChange && periodKey(engine.state) !== k0)) { view.simming = false; draw(); return; }
      timer = setTimeout(chunk, 0);
    };
    chunk();
  }
  el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.spd) { engine.setSpeed(+b.dataset.spd); store.set(storeKey, b.dataset.spd); draw(); return; }
    const a = b.dataset.act;
    if (a === 'pause') { view.paused = !view.paused; draw(); }
    else if (a === 'period') sim(true);
    else if (a === 'end') sim(false);
    else if (a === 'new') onNewGame();
  };
  draw();
  return () => { alive = false; clearTimeout(timer); el.onclick = null; view.simming = false; };
}

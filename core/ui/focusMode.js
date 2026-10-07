// "Modo 2D": enlarges the match canvas to the full viewport (CSS overlay + optional real fullscreen) so only the 2D is followed.
// mountFocus(root, { button, onChange }) → dispose. `root` = the match view root (gets .asu-focus), `button` toggles it.
// Keys: F toggles · Esc leaves · P toggles the side panel (commentary / lineups) as an overlay. Needs core/ui/focus.css.
export function mountFocus(root, { button = null, onChange = () => {} } = {}) {
  const doc = root.ownerDocument, win = doc.defaultView;
  const bar = doc.createElement('div'); bar.className = 'asu-exit';
  bar.innerHTML = '<button data-a="side" title="Painel de narração/escalações (P)">☰ Painel</button><button data-a="exit" title="Sair do Modo 2D (Esc)">✕ Sair</button>';
  const host = root.querySelector('.mlb-field-wrap2, .nhl-ice-wrap, .field-wrap') || root; host.appendChild(bar);
  let on = false, usedFs = false;
  function notifyParent() { try { win.parent !== win && win.parent.postMessage({ asu: 'focus', on }, '*'); } catch { /* cross-origin */ } }
  function set(v) {
    if (v === on) return; on = v;
    root.classList.toggle('asu-focus', on); if (!on) root.classList.remove('asu-side');
    if (button) button.classList.toggle('on', on);
    if (on) { try { const p = doc.documentElement.requestFullscreen?.(); usedFs = !!p; p?.catch?.(() => { usedFs = false; }); } catch { usedFs = false; } }
    else if (doc.fullscreenElement) { try { doc.exitFullscreen?.(); } catch { /* ignore */ } }
    notifyParent(); win.dispatchEvent(new Event('resize')); onChange(on);
  }
  const onFs = () => { if (on && usedFs && !doc.fullscreenElement) set(false); };
  const onKey = e => {
    if (/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName || '') || doc.getElementById('asuAvatarEd')) return;
    if (e.key === 'Escape' && on) set(false);
    else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey && !e.altKey) { set(!on); e.preventDefault(); }
    else if ((e.key === 'p' || e.key === 'P') && on) root.classList.toggle('asu-side');
  };
  const onBtn = () => set(!on);
  bar.addEventListener('click', e => { const a = e.target.closest('button')?.dataset.a; if (a === 'exit') set(false); else if (a === 'side') root.classList.toggle('asu-side'); });
  button?.addEventListener('click', onBtn);
  doc.addEventListener('keydown', onKey); doc.addEventListener('fullscreenchange', onFs);
  return () => { if (on) set(false); button?.removeEventListener('click', onBtn); doc.removeEventListener('keydown', onKey); doc.removeEventListener('fullscreenchange', onFs); bar.remove(); };
}

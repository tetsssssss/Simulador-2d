// LIVE COMMENTARY panel (shared UI). Collapsible, newest line on top, optional voice (SpeechAdapter).
// mount(container, commentary, { sport }) → dispose(). No global listeners; state remembered per sport.
import { createWebSpeech, NullSpeech } from './commentaryEngine.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
const store = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private */ } } };

export function mountCommentaryPanel(container, commentary, { sport = 'sport', voiceVolume = () => 1 } = {}) {
  const key = `asu_${sport}_commentary`;
  let collapsed = store.get(key + '_collapsed') === '1';
  let voice = store.get(key + '_voice') === '1';
  container.classList.add('panel', 'live-comm');
  container.innerHTML = `<div class="panel-h lc-head"><b>Live commentary</b><span class="grow"></span>
    <label class="chk lc-voice" title="Narração por voz (vozes locais do navegador)"><input type="checkbox" ${voice ? 'checked' : ''}> Voz</label>
    <button class="ghost lc-toggle" title="Recolher / expandir">${collapsed ? '▸' : '▾'}</button></div><div class="lc-list"></div>`;
  const list = container.querySelector('.lc-list');
  const apply = () => { container.classList.toggle('collapsed', collapsed); container.querySelector('.lc-toggle').textContent = collapsed ? '▸' : '▾'; };
  const row = l => `<div class="lc-line tone-${esc(l.tone)} p${l.priority}">${l.clock ? `<span class="lc-t">${esc(l.clock)}</span>` : ''}<span class="lc-x">${esc(l.text)}</span></div>`;
  const redraw = () => { list.innerHTML = commentary.lines.slice(0, 60).map(row).join('') || '<p class="muted small">A narração aparece aqui durante a partida.</p>'; };
  container.querySelector('.lc-toggle').onclick = () => { collapsed = !collapsed; store.set(key + '_collapsed', collapsed ? '1' : '0'); apply(); };
  const setVoice = on => { voice = on; store.set(key + '_voice', on ? '1' : '0'); commentary.setSpeech(on ? createWebSpeech({ volume: voiceVolume }) : NullSpeech); };
  container.querySelector('.lc-voice input').onchange = e => setVoice(e.target.checked);
  setVoice(voice);
  apply(); redraw();
  const unsub = commentary.subscribe(l => { list.insertAdjacentHTML('afterbegin', row(l)); while (list.children.length > 60) list.lastElementChild.remove(); list.querySelector('p.muted')?.remove(); });
  return () => { unsub(); commentary.setSpeech(NullSpeech); };
}

// Settings: GAMEPLAY (presets + sliders), DISPLAY (visual prefs), SIMULATION (engine info), SAVE (slots, export/import).
import { esc } from '../components.js';
import { GAMEPLAY_SLIDERS, PRESETS, presetValues, defaultGameplay, matchPreset, DISPLAY_DEFAULTS, engineTuning } from '../../core/gameplaySettings.js';
import { SIM_HZ } from '../../sim/playSim.js';
import { SAVE_VERSION } from '../../core/saveManager.js';
import { savesPanel, bindSaves } from './career.js';

const TABS = ['gameplay', 'display', 'simulation', 'save'];

export function settingsView(ctx, tab) {
  const { state, content } = ctx;
  tab = TABS.includes(tab) ? tab : 'gameplay';
  ctx.setTitle('Settings', 'Gameplay, exibição, simulação e saves');
  const S = state.settings;
  const nav = `<div class="tabs big">${TABS.map(t => `<a href="#settings/${t}" class="${t === tab ? 'on' : ''}">${t.toUpperCase()}</a>`).join('')}</div>`;
  let body = '';
  if (tab === 'gameplay') {
    const cur = matchPreset(S.gameplay);
    body = `<div class="preset-row">${Object.entries(PRESETS).map(([k, p]) => `<button class="preset ${cur === k ? 'on' : ''}" data-preset="${k}"><b>${p.label}</b><small>${esc(p.desc)}</small></button>`).join('')}<div class="preset ${cur === 'CUSTOM' ? 'on' : ''} static"><b>Custom</b><small>Valores ajustados manualmente.</small></div></div>
      <div class="panel"><div class="panel-h"><b>Sliders</b><button id="resetDefaults">RESET DEFAULTS</button></div>
      <div class="sliders">${GAMEPLAY_SLIDERS.map(s => { const v = S.gameplay[s.key]; const reserved = s.kind === 'reserved';
        return `<div class="slider ${reserved ? 'reserved' : ''} ${v !== s.def ? 'changed' : ''}"><div class="sl-h"><b>${esc(s.label)}</b><span class="sl-v" id="v-${s.key}">${fmt(s, v)}</span></div>
          <input type="range" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}" data-slider="${s.key}" ${reserved ? 'disabled' : ''}>
          <div class="sl-f"><small>${fmt(s, s.min)}</small><small>default ${fmt(s, s.def)}</small><small>${fmt(s, s.max)}</small></div><small class="muted">${esc(s.help)}</small></div>`; }).join('')}</div>
      <p class="muted small">Influence = quanto as diferenças de nota pesam (1.00 = calibração do motor). Turnover/Fatigue multiplicam parâmetros conhecidos do motor. Em <b>Simulation</b> o motor roda exatamente o caminho calibrado.</p></div>`;
  } else if (tab === 'display') {
    const D = S.display;
    const row = (k, label, help) => `<label class="opt"><input type="checkbox" data-disp="${k}" ${D[k] ? 'checked' : ''}><span><b>${label}</b><small>${help}</small></span></label>`;
    body = `<div class="panel"><div class="opts">
      ${row('photos', 'Fotos dos jogadores', 'Headshots no roster, perfil e no campo (zoom Close). Desligado = silhuetas.')}
      ${row('debug', 'Debug view por padrão', 'Abre a partida já com o overlay técnico (assignments, lanes, leituras).')}
      ${row('cameraFollow', 'Câmera segue a bola', 'Desligado = câmera fixa na linha de scrimmage.')}
      ${row('autoAdvance', 'Avançar resultado automaticamente', 'Esconde o card de resultado após alguns segundos.')}
      <label class="opt"><span><b>Velocidade de animação padrão</b><small>Só a apresentação; a matemática da jogada é a mesma.</small></span><select data-disp-sel="animSpeed">${[0.5, 1, 2, 4].map(v => `<option value="${v}" ${D.animSpeed === v ? 'selected' : ''}>${v}x</option>`).join('')}</select></label>
      <label class="opt"><span><b>Densidade do HUD</b><small>Compact esconde detalhes secundários da partida.</small></span><select data-disp-sel="hudDensity"><option value="full" ${D.hudDensity === 'full' ? 'selected' : ''}>Full</option><option value="compact" ${D.hudDensity === 'compact' ? 'selected' : ''}>Compact</option></select></label>
      </div><button id="resetDisplay">Restaurar exibição padrão</button></div>`;
  } else if (tab === 'simulation') {
    const t = engineTuning(S.gameplay);
    body = `<div class="panel"><div class="kv">
      <div><small>Motor</small><b>NFLPlay · 22 jogadores + bola · passo fixo ${SIM_HZ} Hz · RNG seedado</b></div>
      <div><small>Tuning ativo</small><b>${t ? 'Custom (sliders alterados)' : 'Nenhum — caminho calibrado'}</b></div>
      <div><small>Calibração de referência (liga, Simulation)</small><b>Passe ~65% · 7,1 YPA · 5,4% sacks · Corrida ~4,7 YPC, mediana 3, ~15% stuff</b></div>
      <div><small>Duração do quarto</small><b>${S.gameplay.quarterMin} min</b></div>
      <div><small>Não implementado (não aparece nos menus)</small><b>Special teams (punt/FG/kickoff), pênaltis, timeouts, 2-minute drill</b></div>
      <div><small>Jogos fora do seu time (carreira)</small><b>Placar por força média dos titulares + ruído seedado (seus jogos usam o motor 2D)</b></div>
    </div></div>`;
  } else {
    body = `<div class="panel"><label class="opt"><input type="checkbox" id="autosaveChk" ${S.save.autosave ? 'checked' : ''}><span><b>Autosave</b><small>Salva no slot ativo a cada semana concluída e ao mudar settings.</small></span></label>
      <p class="muted small">Formato versionado (version ${SAVE_VERSION}). Saves antigos (<code>asu_career</code>) são migrados automaticamente; o original fica como backup.</p></div>${savesPanel(ctx)}`;
  }
  content.innerHTML = nav + body;
  const $$ = s => content.querySelectorAll(s);
  const commit = () => { S.preset = matchPreset(S.gameplay); ctx.saveSettings(); };
  $$('[data-preset]').forEach(b => b.onclick = () => { S.gameplay = presetValues(b.dataset.preset); commit(); settingsView(ctx, tab); ctx.toast(`Preset ${PRESETS[b.dataset.preset].label}`); });
  $$('[data-slider]').forEach(inp => {
    const s = GAMEPLAY_SLIDERS.find(x => x.key === inp.dataset.slider);
    inp.oninput = () => { content.querySelector(`#v-${s.key}`).textContent = fmt(s, +inp.value); };
    inp.onchange = () => { S.gameplay[s.key] = +inp.value; commit(); settingsView(ctx, tab); };
  });
  const rd = content.querySelector('#resetDefaults');
  if (rd) rd.onclick = () => { S.gameplay = defaultGameplay(); commit(); settingsView(ctx, tab); ctx.toast('Defaults restaurados (Simulation)'); };
  $$('[data-disp]').forEach(i => i.onchange = () => { S.display[i.dataset.disp] = i.checked; ctx.saveSettings(); });
  $$('[data-disp-sel]').forEach(i => i.onchange = () => { const k = i.dataset.dispSel; S.display[k] = k === 'animSpeed' ? +i.value : i.value; ctx.saveSettings(); });
  const rdisp = content.querySelector('#resetDisplay');
  if (rdisp) rdisp.onclick = () => { S.display = { ...DISPLAY_DEFAULTS }; ctx.saveSettings(); settingsView(ctx, tab); };
  const asv = content.querySelector('#autosaveChk');
  if (asv) asv.onchange = () => { S.save.autosave = asv.checked; ctx.saveSettings(); };
  if (tab === 'save') bindSaves(ctx, () => settingsView(ctx, tab));
}

function fmt(s, v) { return s.key === 'quarterMin' ? `${v} min` : s.kind === 'influence' ? `${(+v).toFixed(2)}×` : `${Math.round(v * 100)}%`; }

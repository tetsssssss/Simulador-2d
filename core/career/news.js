// CareerNewsEngine: news items generated from REAL save state (results, injuries, trades, signings, milestones, standings,
// rumors tied to real contract / trade-block / dissatisfaction states, firing watch, awards). Headline / body templates in pt-BR,
// importance 1..5, team and player references, deduplication by key, and a feed API (latest N, by team, by player).
// The legacy c.news list (plain text) is untouched; this feed lives in c.x.feed.
import { teamOf, teamPlayers } from './careerCore.js';
import { winPct } from './league.js';
import { fill, pickT, dateOfDay, fmtDate, clamp } from './kit.js';

export const NEWS_KINDS = ['RESULT', 'INJURY', 'TRADE', 'SIGNING', 'CONTRACT', 'MILESTONE', 'STANDINGS', 'RUMOR', 'FIRING_WATCH', 'AWARD', 'DRAFT', 'COACH', 'EVENT', 'FINANCE', 'PLAYER', 'LEAGUE'];
const T = {
  RESULT_WIN: [['{team} vence {opp} por {sc}', '{team} ({rec}) venceu {opp} {sc} {where}. {star}'], ['Vitória sobre o {opp}', 'Com {sc} {where}, o {team} chega a {rec}. {star}']],
  RESULT_LOSS: [['{team} cai diante do {opp}', 'Derrota por {sc} {where}; o {team} fica em {rec}. {star}'], ['Tropeço contra o {opp}', 'O {team} perdeu por {sc} {where} e soma {rec}. {star}']],
  RESULT_UPSET: [['Surpresa: {team} derruba {opp}', 'Zebra da rodada: {team} venceu {opp} por {sc}.']],
  SERIES: [['{team} avança nos playoffs', '{team} eliminou {opp} ({sc}) e segue vivo na disputa pelo título.'], ['{opp} é eliminado', '{team} fechou a série contra {opp} por {sc}.']],
  CHAMPION: [['{team} é campeão {season}!', 'Fim de temporada: {team} conquista o título de {season}.']],
  INJURY: [['{player} se lesiona', '{player} ({team}, {pos}) sofreu {type} e deve ficar fora por {games} jogos.'], ['Má notícia no {team}', '{type} tira {player} por cerca de {games} jogos.']],
  TRADE: [['Troca fechada: {teams}', '{text}'], ['Movimento de mercado', '{text}']],
  SIGNING: [['{team} anuncia contratação', '{text}']],
  CONTRACT: [['Contrato: {player}', '{text}']],
  MILESTONE: [['{player} atinge marca: {label}', '{player} ({team}) alcançou {label} em {season}.']],
  STREAK_W: [['{team} embala: {n} vitórias seguidas', 'Sequência de {n} vitórias coloca o {team} em {rec}.']],
  STREAK_L: [['{team} afunda: {n} derrotas seguidas', 'A crise se aprofunda: {n} derrotas consecutivas e campanha de {rec}.']],
  LEADER: [['{team} lidera a conferência', 'Com {rec}, o {team} ocupa a ponta da tabela após {gp} jogos.']],
  BUBBLE: [['{team} na briga por vaga', 'Com {rec} após {gp} jogos, o {team} está a {gap} da zona de classificação.']],
  RUMOR_SHOP: [['Rumor: {player} está no mercado', 'Fontes dizem que o {team} escuta propostas por {player} ({reason}).']],
  RUMOR_EXPIRING: [['Rumor: {player} pode sair', 'O contrato de {player} vence em {year} e as conversas travaram; outros clubes acompanham.']],
  RUMOR_UNHAPPY: [['Vestiário: {player} insatisfeito', '{player} está descontente com o papel no {team} e pode pedir troca.']],
  RUMOR_DEADLINE: [['Prazo final: {team} deve vender', '{team} está fora da briga e pode negociar {player} antes do prazo.']],
  FIRING_WATCH: [['Pressão sobre o comando do {team}', 'A diretoria monitora os resultados ({rec}); a confiança está em {trust}.']],
  FIRING_AI: [['Técnico do {team} na corda bamba', '{coach} tem apoio em queda no {team} após {rec}.']],
  AWARD: [['{award}: {player}', '{player} ({team}) é o vencedor de {award}.']],
  COACH: [['{text}', '{text}']],
  EVENT: [['{title}', '{text}']],
  DRAFT: [['Draft: {text}', '{text}']],
  FINANCE: [['Balanço da temporada', 'Receita {rev}M, despesa {exp}M, lucro {profit}M. Caixa em {cash}M.']],
  LEAGUE: [['{text}', '{text}']],
};
const KEY_CAP = 2500;

export function pushNews(c, it) {
  const x = c.x; if (!x) return null;
  x.newsKeys ||= {};
  if (it.key && x.newsKeys[it.key] != null) return null;
  x.nseq = (x.nseq || 0) + 1;
  const spec = c._spec, date = spec ? fmtDate(dateOfDay(spec, c.season, x.cal.day)) : '';
  const item = { id: `n${x.nseq}`, d: x.cal.day, s: c.season, ph: c.phase, date: c.phase === 'OFFSEASON' ? `Offseason ${c.season}` : date, kind: it.kind, imp: clamp(it.imp ?? 2, 1, 5), h: it.h, b: it.b || '', teams: it.teams || [], players: it.players || [], key: it.key || null, src: it.src || null };
  x.feed.unshift(item);
  if (it.key) x.newsKeys[it.key] = x.cal.day;
  if (x.feed.length > 240) { // keep the important ones: drop the oldest of the lowest importance
    const drop = [...x.feed].map((n, i) => ({ n, i })).filter(o => o.i > 120).sort((a, b) => a.n.imp - b.n.imp || b.i - a.i)[0];
    x.feed.splice(drop ? drop.i : x.feed.length - 1, 1);
  }
  const keys = Object.keys(x.newsKeys); if (keys.length > KEY_CAP) for (const k of keys.slice(0, keys.length - KEY_CAP + 200)) delete x.newsKeys[k];
  return item;
}
const make = (c, kind, tpl, vars, imp, extra = {}) => {
  const [h, b] = pickT(T[tpl], extra.key || JSON.stringify(vars));
  return pushNews(c, { kind, imp, h: fill(h, vars), b: fill(b, vars), ...extra });
};

// ---------- feed API ----------
export function getFeed(c, { n = 20, team, player, kinds, minImp = 1 } = {}) {
  let l = c.x?.feed || [];
  if (team) l = l.filter(i => i.teams.includes(team));
  if (player) l = l.filter(i => i.players.includes(player));
  if (kinds) l = l.filter(i => kinds.includes(i.kind));
  if (minImp > 1) l = l.filter(i => i.imp >= minImp);
  return l.slice(0, n);
}
export const latestNews = (c, n = 20) => getFeed(c, { n });
export const newsByTeam = (c, team, n = 20) => getFeed(c, { n, team });
export const newsByPlayer = (c, player, n = 20) => getFeed(c, { n, player });
export const CareerNewsEngine = { push: pushNews, collect: (...a) => collectNews(...a), latest: latestNews, byTeam: newsByTeam, byPlayer: newsByPlayer, feed: getFeed, kinds: NEWS_KINDS };

const rec = st => `${st.w}-${st.l}${st.otl ? '-' + st.otl : st.t ? '-' + st.t : ''}`;
const nm = (c, a) => teamOf(c, a)?.name || a;
const short = (c, a) => teamOf(c, a)?.name?.split(' ').slice(-1)[0] || a;
const involved = (c, a) => a === c.userTeam || (c.role === 'PLAYER' && c.players[c.me?.id]?.t === a);

// Reads the save and emits the items that are new since the last call. Cheap enough to run every day.
export function collectNews(spec, c) {
  const x = c.x, cur = x.newsCur; let n = 0;
  const add = r => { if (r) n++; };
  // a) transactions
  const tx = c.history.transactions;
  for (let i = cur.tx; i < tx.length; i++) {
    const t = tx[i]; if (t.silent) continue;
    const star = (t.players || []).some(id => (c.players[id]?.ovr ?? 0) >= spec.starOvr - 4);
    const mine = (t.teams || []).some(a => involved(c, a));
    const imp = clamp(2 + (mine ? 2 : 0) + (star ? 1 : 0), 1, 5);
    const base = { teams: t.teams || [], players: t.players || [], key: `tx:${c.season}:${i}:${t.kind}`, src: { tx: i } };
    if (t.kind === 'TRADE') { if (mine || star || t.ai !== true) add(make(c, 'TRADE', 'TRADE', { teams: (t.teams || []).join(' ↔ '), text: t.text }, imp, base)); }
    else if (t.kind === 'SIGN') { if (mine || star) add(make(c, 'SIGNING', 'SIGNING', { team: (t.teams || [])[0] || '', text: t.text }, imp, base)); }
    else if (t.kind === 'EXTEND') add(make(c, 'CONTRACT', 'CONTRACT', { player: playerNameOf(c, t), text: t.text }, imp, base));
    else if (t.kind === 'DRAFT') { if (mine || /^[1-3]º:/.test(t.text)) add(make(c, 'DRAFT', 'DRAFT', { text: t.text }, mine ? 4 : 3, base)); }
    else if (t.kind === 'FIRED' || t.kind === 'JOB') add(make(c, 'COACH', 'COACH', { text: t.text }, mine ? 5 : 3, base));
    else if (t.kind === 'STAFF' && mine) add(make(c, 'COACH', 'COACH', { text: t.text }, 2, base));
    else if (t.kind === 'RELEASE' && mine) add(make(c, 'CONTRACT', 'CONTRACT', { player: playerNameOf(c, t), text: t.text }, 2, base));
    else if (t.kind === 'FA' && star) add(make(c, 'LEAGUE', 'LEAGUE', { text: t.text }, 3, base));
  }
  cur.tx = tx.length;
  // b) results since the last collect
  {
    const upto = c.phase === 'REGULAR' ? c.slate : c.phase === 'PRESEASON' ? 0 : c.slates;
    for (let sl = cur.slate; sl < upto; sl++) for (const g of c.schedule) if (g.s === sl && g.r && (involved(c, g.h) || involved(c, g.a))) add(resultItem(spec, c, g));
    cur.slate = Math.max(cur.slate, upto);
    if (c.phase === 'REGULAR') add(standingsItems(spec, c));
  }
  if (c.phase === 'PLAYOFFS' || (c.phase === 'OFFSEASON' && c.playoffs)) add(playoffItems(spec, c));
  // c) injuries
  cur.inj ||= {};
  for (const p of Object.values(c.players)) {
    if (p.inj) {
      if (cur.inj[p.id] == null && p.t !== 'FA') { cur.inj[p.id] = c.x.cal.day; if (involved(c, p.t) || p.ovr >= spec.starOvr) add(make(c, 'INJURY', 'INJURY', { player: p.n, team: p.t, pos: p.pos, type: p.inj.type, games: p.inj.games }, involved(c, p.t) ? (p.ovr >= spec.starOvr - 6 ? 4 : 3) : 3, { teams: [p.t], players: [p.id], key: `inj:${p.id}:${c.season}:${c.x.cal.day}`, src: { injury: p.inj.type } })); }
    } else if (cur.inj[p.id] != null) delete cur.inj[p.id];
  }
  // d) milestones (user's squad + stars)
  cur.ms ||= {};
  for (const m of spec.v3.milestones || []) for (const p of Object.values(c.players)) {
    if (!p.ps || (p.ps[m.stat] || 0) < m.thr) continue;
    const k = `${p.id}:${c.season}:${m.key}`; if (cur.ms[k]) continue;
    if (!(involved(c, p.t) || p.ovr >= spec.starOvr - 6 || p.mine)) { continue; }
    cur.ms[k] = 1; add(make(c, 'MILESTONE', 'MILESTONE', { player: p.n, team: p.t, label: m.label, season: c.season }, p.mine ? 5 : involved(c, p.t) ? 4 : 3, { teams: [p.t], players: [p.id], key: `ms:${k}`, src: { stat: m.stat, value: p.ps[m.stat] } }));
  }
  // e) awards
  const aw = c.history.awards; for (let i = cur.awards; i < aw.length; i++) { const a = aw[i]; add(make(c, 'AWARD', 'AWARD', { award: a.award, player: a.name, team: a.team }, involved(c, a.team) ? 5 : 3, { teams: [a.team], players: a.id ? [a.id] : [], key: `aw:${a.s}:${a.award}:${a.id || a.name}`, src: { award: a.award } })); }
  cur.awards = aw.length;
  // f) rumors tied to real states + firing watch (weekly)
  if (x.cal.day % 7 === 0) add(rumors(spec, c));
  return n;
}
const playerNameOf = (c, t) => c.players[(t.players || [])[0]]?.n || 'Jogador';
function resultItem(spec, c, g) {
  const me = involved(c, g.h) ? g.h : g.a, opp = me === g.h ? g.a : g.h, ms = me === g.h ? g.r[0] : g.r[1], os = me === g.h ? g.r[1] : g.r[0];
  const st = c.standings[me], won = ms > os, tie = ms === os;
  const star = [...teamPlayers(c, me)].filter(p => p.ps?.gp).sort((a, b) => b.ovr - a.ovr)[0];
  const upset = won && teamsRating(spec, c, me) + 4 < teamsRating(spec, c, opp);
  const vars = { team: short(c, me), opp: short(c, opp), sc: `${Math.max(ms, os)}–${Math.min(ms, os)}${g.ot ? ' (prorrogação)' : ''}`, where: me === g.h ? 'em casa' : 'fora', rec: rec(st), star: '' };
  return make(c, 'RESULT', tie ? 'RESULT_LOSS' : won ? (upset ? 'RESULT_UPSET' : 'RESULT_WIN') : 'RESULT_LOSS', vars, upset ? 4 : Math.abs(ms - os) >= (spec.sport === 'nfl' ? 21 : spec.sport === 'nhl' ? 4 : 7) ? 3 : 3, { teams: [g.h, g.a], players: [], key: `res:${c.season}:${g.s}:${g.h}:${g.a}`, src: { slate: g.s, h: g.h, a: g.a, r: g.r } });
}
function teamsRating(spec, c, abbr) { return spec.teamRating(teamPlayers(c, abbr, { active: true }), c); }
function standingsItems(spec, c) {
  const me = c.userTeam || c.players[c.me?.id]?.t; if (!me || !c.standings[me] || c.phase !== 'REGULAR') return 0;
  const st = c.standings[me], gp = st.w + st.l + st.t + (st.otl || 0), step = spec.sport === 'mlb' ? 20 : spec.sport === 'nhl' ? 10 : 4; let n = 0;
  const r = rec(st), m = /^([WL])(\d+)$/.exec(st.streak || '');
  if (m && +m[2] >= (spec.sport === 'nfl' ? 4 : 5) && (+m[2]) % (spec.sport === 'nfl' ? 2 : 5) === (spec.sport === 'nfl' ? 0 : 0)) { if (make(c, 'STANDINGS', m[1] === 'W' ? 'STREAK_W' : 'STREAK_L', { team: short(c, me), n: m[2], rec: r }, 3, { teams: [me], key: `streak:${me}:${c.season}:${m[1]}${m[2]}` })) n++; }
  if (gp > 0 && gp % step === 0) {
    const conf = teamOf(c, me).conf, list = c.teams.filter(t => t.conf === conf).sort((a, b) => winPct(c.standings[b.abbr]) - winPct(c.standings[a.abbr]));
    const rank = list.findIndex(t => t.abbr === me) + 1;
    if (rank === 1) { if (make(c, 'STANDINGS', 'LEADER', { team: short(c, me), rec: r, gp }, 3, { teams: [me], key: `lead:${me}:${c.season}:${gp}` })) n++; }
    else if (Math.abs(rank - spec.playoffs.perConf) <= 2) { if (make(c, 'STANDINGS', 'BUBBLE', { team: short(c, me), rec: r, gp, gap: rank <= spec.playoffs.perConf ? 'ficar fora' : `${rank - spec.playoffs.perConf} posição(ões)` }, 2, { teams: [me], key: `bub:${me}:${c.season}:${gp}` })) n++; }
  }
  return n;
}
function playoffItems(spec, c) {
  const po = c.playoffs; if (!po) return 0; let n = 0;
  po.rounds.forEach((r, i) => r.series.forEach((s, j) => {
    if (!s.winner || s.bye) return;
    const loser = s.winner === s.a ? s.b : s.a, mine = involved(c, s.a) || involved(c, s.b);
    if (make(c, 'RESULT', 'SERIES', { team: short(c, s.winner), opp: short(c, loser), sc: `${Math.max(s.wa, s.wb)}–${Math.min(s.wa, s.wb)}` }, mine ? 4 : 3, { teams: [s.a, s.b], key: `ser:${c.season}:${i}:${j}`, src: { round: i } })) n++;
  }));
  if (po.champion && make(c, 'RESULT', 'CHAMPION', { team: nm(c, po.champion), season: c.season }, 5, { teams: [po.champion], key: `champ:${c.season}` })) n++;
  return n;
}
function rumors(spec, c) {
  let n = 0; const x = c.x, mine0 = c.userTeam || c.players[c.me?.id]?.t, mine = c.standings[mine0] ? mine0 : null;
  for (const id of x.block.user || []) { const p = c.players[id]; if (p && p.t === c.userTeam) { if (make(c, 'RUMOR', 'RUMOR_SHOP', { player: p.n, team: short(c, p.t), reason: 'a diretoria aceita ofertas' }, 3, { teams: [p.t], players: [id], key: `ru:shop:${id}:${c.season}`, src: { tradeBlock: true } })) n++; } }
  if (mine) for (const p of teamPlayers(c, mine)) {
    if (p.rel && p.rel.sat < 30 && p.rel.mo < 45 && p.ovr >= 60 && (p.role === 'B' || p.role === 'R')) { if (make(c, 'RUMOR', 'RUMOR_UNHAPPY', { player: p.n, team: short(c, mine) }, 3, { teams: [mine], players: [p.id], key: `ru:unh:${p.id}:${c.season}:${Math.floor(x.cal.day / 60)}`, src: { sat: Math.round(p.rel.sat), mo: Math.round(p.rel.mo) } })) n++; }
    if (p.c && p.c.yrs <= 1 && p.ovr >= spec.starOvr - 8 && (p.refuses || p.rel?.tr < 40)) { if (make(c, 'RUMOR', 'RUMOR_EXPIRING', { player: p.n, year: c.season + p.c.yrs }, 4, { teams: [mine], players: [p.id], key: `ru:exp:${p.id}:${c.season}`, src: { yrs: p.c.yrs, tr: Math.round(p.rel?.tr ?? 0) } })) n++; }
  }
  if (c.phase === 'REGULAR' && x.cal.day > 0) { // deadline rumors: eliminated clubs shopping their best veteran
    const half = c.slate > c.slates * 0.45 && c.slate < c.slates * 0.62;
    if (half) for (const t of c.teams) {
      if (t.abbr === mine || t.mode !== 'rebuild') continue;
      const st = c.standings[t.abbr]; if (winPct(st) > 0.4) continue;
      const v = teamPlayers(c, t.abbr).filter(p => p.age >= spec.ageCurve.peakEnd - 2 && p.ovr >= spec.starOvr - 10).sort((a, b) => b.ovr - a.ovr)[0];
      if (v && make(c, 'RUMOR', 'RUMOR_DEADLINE', { team: short(c, t.abbr), player: v.n }, 3, { teams: [t.abbr], players: [v.id], key: `ru:dl:${t.abbr}:${c.season}`, src: { win: Math.round(winPct(st) * 100) } })) n++;
    }
  }
  if (c.role !== 'PLAYER' && c.userTeam && x.coach && x.coach.fireWatch !== 'SAFE' && c.phase === 'REGULAR') { const st = c.standings[c.userTeam]; if (make(c, 'FIRING_WATCH', 'FIRING_WATCH', { team: short(c, c.userTeam), rec: rec(st), trust: Math.round(c.board.confidence) }, x.coach.fireWatch === 'HOT' ? 5 : 3, { teams: [c.userTeam], key: `fw:${c.season}:${x.coach.fireWatch}:${Math.floor(x.cal.day / 28)}`, src: { level: x.coach.fireWatch, trust: Math.round(c.board.confidence) } })) n++; }
  if (c.phase === 'REGULAR') for (const t of c.teams) { // AI coaches on the hot seat
    if (t.abbr === c.userTeam) continue; const m = x.meta[t.abbr].coach, st = c.standings[t.abbr]; const gp = st.w + st.l + st.t + (st.otl || 0);
    if (gp > spec.calendar.games * 0.4 && winPct(st) < 0.3 && m.trust < 45 && make(c, 'FIRING_WATCH', 'FIRING_AI', { team: short(c, t.abbr), coach: m.name, rec: rec(st) }, 2, { teams: [t.abbr], key: `fwa:${t.abbr}:${c.season}`, src: { rec: rec(st) } })) n++;
  }
  return n;
}
export function seasonFinanceNews(c, sum) { if (sum) make(c, 'FINANCE', 'FINANCE', { rev: sum.rev, exp: sum.exp, profit: sum.profit, cash: sum.cash }, 2, { key: `fin:${c.season}` }); }

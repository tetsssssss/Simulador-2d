// Pronunciation layer for the VOICE only (the text on screen is never changed). A pt-BR voice reads English sports
// terms and foreign names with Portuguese rules, so we respell them phonetically before handing the text to speech.
// Terms below are common loanwords with well-known pronunciations. NAMES are a starter set: NOT verified by ear — tune them
// (or add more) from the browser console:  localStorage.asu_pron = JSON.stringify({ 'Sobrenome': 'respelling' })
const TERMS_PT = {
  'touchdown': 'tátchdáun', 'touchdowns': 'tátchdáuns', 'home run': 'hôm ran', 'walk-off': 'uóc-óf', 'strikeout': 'estráique-áut', 'strikeouts': 'estráique-áuts', 'strike': 'estráique', 'strikes': 'estráiques', 'sacks': 'saques', 'hits': 'rits', 'hit': 'rít',
  'faceoff': 'fêiss-óf', 'power play': 'páuer plêi', 'slapshot': 'eslép-chót', 'one-timer': 'uan-táimer', 'hat trick': 'rét trík', 'breakaway': 'brêique-auêi', 'icing': 'áissin',
  'sack': 'saque', 'blitz': 'blítz', 'pickoff': 'pic-óf', 'double play': 'dábol plêi', 'field goal': 'fíld gôl', 'red zone': 'réd zôn', 'quarterback': 'cuórterbéc', 'pocket': 'póquet',
  'fumble': 'fâmbol', 'snap': 'esnép', 'punt': 'pânt', 'kickoff': 'quíc-óf', 'inning': 'ínin', 'bullpen': 'búlpén', 'grand slam': 'grénd eslém', 'bunt': 'bânt', 'foul': 'fául', 'mph': 'milhas por hora', 'rpm': 'rotações por minuto',
};
const NAMES_PT = { 'Ovechkin': 'Ovétchkin', 'Pastrnak': 'Pastrnák', 'Mahomes': 'Maromz', 'Kelce': 'Kélss', 'Gerrit Cole': 'Gérrit Côl' };   // unverified starter set

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cache = new Map();
function compile(dict) {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);       // longest first ("home run" before "run")
  return keys.length ? { re: new RegExp(`(?<![\\p{L}-])(${keys.map(esc).join('|')})(?![\\p{L}-])`, 'giu'), map: new Map(keys.map(k => [k.toLowerCase(), dict[k]])) } : null;
}
export function userOverrides() { try { return JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem('asu_pron')) || '{}') || {}; } catch { return {}; } }

// speakable('Touchdown de Kelce!', 'pt-BR') → 'tátchdáun de Kélss!'
export function speakable(text, lang = 'pt-BR', extra = userOverrides()) {
  if (!text) return text;
  const base = String(lang).slice(0, 2);
  text = text.replace(/#(\d+)/g, base === 'pt' ? 'camisa $1' : base === 'es' ? 'número $1' : 'number $1');   // '#16 Mitch Marner' is spoken as 'camisa 16 …'
  const dict = base === 'pt' ? { ...TERMS_PT, ...NAMES_PT, ...extra } : { ...extra };
  const key = base + JSON.stringify(extra); let c = cache.get(key); if (c === undefined) { c = compile(dict); cache.set(key, c); }
  return c ? text.replace(c.re, m => c.map.get(m.toLowerCase()) ?? m) : text;
}

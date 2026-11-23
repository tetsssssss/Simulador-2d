// Primary team colors (presentation only: scorebug, hero banners, accents).
export const TEAM_COLORS = {
  ARI: '#97233F', ATL: '#A71930', BAL: '#241773', BUF: '#00338D', CAR: '#0085CA', CHI: '#0B162A', CIN: '#FB4F14', CLE: '#311D00',
  DAL: '#003594', DEN: '#FB4F14', DET: '#0076B6', GB: '#203731', HOU: '#03202F', IND: '#002C5F', JAX: '#006778', KC: '#E31837',
  LV: '#A5ACAF', LAC: '#0080C6', LA: '#003594', MIA: '#008E97', MIN: '#4F2683', NE: '#002244', NO: '#D3BC8D', NYG: '#0B2265',
  NYJ: '#125740', PHI: '#004C54', PIT: '#FFB612', SF: '#AA0000', SEA: '#002244', TB: '#D50A0A', TEN: '#0C2340', WAS: '#5A1414',
};

// Jersey / pants colours for the two sides of a play ([jersey, secondary]); the defence goes light when both teams are too similar.
export function sideColors(off, def) {
  const o = TEAM_COLORS[off] || '#1d4ed8', d = TEAM_COLORS[def] || '#b91c1c';
  const rgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [a, b] = [rgb(o), rgb(d)];
  const close = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 90;
  return { off: [o, '#ffffff'], def: close ? ['#f2f4f7', d] : [d, '#ffffff'] };
}

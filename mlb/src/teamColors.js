// MLB team colors (presentation only): [primary, secondary]. Used by sprites, HUD, dugouts.
export const MLB_COLORS = {
  ARI: ['#A71930', '#E3D4AD'], ATH: ['#003831', '#EFB21E'], ATL: ['#CE1141', '#13274F'], BAL: ['#DF4601', '#111111'],
  BOS: ['#BD3039', '#0C2340'], CHC: ['#0E3386', '#CC3433'], CWS: ['#27251F', '#C4CED4'], CIN: ['#C6011F', '#111111'],
  CLE: ['#00385D', '#E50022'], COL: ['#33006F', '#C4CED4'], DET: ['#0C2340', '#FA4616'], HOU: ['#002D62', '#EB6E1F'],
  KC: ['#004687', '#BD9B60'], LAA: ['#BA0021', '#003263'], LAD: ['#005A9C', '#EF3E42'], MIA: ['#00A3E0', '#EF3340'],
  MIL: ['#12284B', '#FFC52F'], MIN: ['#002B5C', '#D31145'], NYM: ['#002D72', '#FF5910'], NYY: ['#0C2340', '#C4CED3'],
  PHI: ['#E81828', '#002D72'], PIT: ['#27251F', '#FDB827'], SD: ['#2F241D', '#FFC425'], SEA: ['#0C2C56', '#005C5C'],
  SF: ['#FD5A1E', '#27251F'], STL: ['#C41E3A', '#0C2340'], TB: ['#092C5C', '#8FBCE6'], TEX: ['#003278', '#C0111F'],
  TOR: ['#134A8E', '#1D2D5C'], WSH: ['#AB0003', '#14225A'],
};
export const mlbColor = (abbr, i = 0) => (MLB_COLORS[abbr] || ['#2a4a6b', '#ffffff'])[i];

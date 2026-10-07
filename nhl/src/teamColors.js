// NHL team colors (presentation only): [primary, secondary]. Used by sprites, HUD, benches.
export const NHL_COLORS = {
  ANA: ['#F47A38', '#111111'], BOS: ['#111111', '#FFB81C'], BUF: ['#003087', '#FFB81C'], CGY: ['#C8102E', '#F1BE48'],
  CAR: ['#CC0000', '#111111'], CHI: ['#CF0A2C', '#111111'], COL: ['#6F263D', '#236192'], CBJ: ['#002654', '#CE1126'],
  DAL: ['#006847', '#8F8F8C'], DET: ['#CE1126', '#FFFFFF'], EDM: ['#041E42', '#FF4C00'], FLA: ['#C8102E', '#041E42'],
  LAK: ['#111111', '#A2AAAD'], MIN: ['#154734', '#A6192E'], MTL: ['#AF1E2D', '#192168'], NSH: ['#FFB81C', '#041E42'],
  NJD: ['#CE1126', '#111111'], NYI: ['#00539B', '#F47D30'], NYR: ['#0038A8', '#CE1126'], OTT: ['#C52032', '#C2912C'],
  PHI: ['#F74902', '#111111'], PIT: ['#111111', '#FCB514'], SJS: ['#006D75', '#EA7200'], SEA: ['#001628', '#99D9D9'],
  STL: ['#002F87', '#FCB514'], TBL: ['#002868', '#FFFFFF'], TOR: ['#00205B', '#FFFFFF'], UTA: ['#71AFE5', '#090909'],
  VAN: ['#00205B', '#00843D'], VGK: ['#B4975A', '#333F42'], WSH: ['#C8102E', '#041E42'], WPG: ['#041E42', '#AC162C'],
};
export const nhlColor = (abbr, i = 0) => (NHL_COLORS[abbr] || ['#2a4a6b', '#ffffff'])[i];

// Identity decals for the athletes: back number + name, chest number and a face / helmet-cage plate. The athlete meshes have NO UVs (position/normal/skin only),
// so nothing can be painted on them; instead small quads are parented to the 'spine' and 'head' bones and follow every animation.
// The rig's bone axes equal the model axes (athlete faces +X, Y up), so offsets below are in metres in the bone frame (spine origin = hip height 0.92, head origin = neck 1.52).
export const DECAL_SPECS = {
  football: { back: { bone: 'spine', pos: [-0.153, 0.29, 0], yaw: -90, size: [0.27, 0.23] }, front: { bone: 'spine', pos: [0.153, 0.34, 0], yaw: 90, size: [0.13, 0.115] }, face: null },
  hockey:   { back: { bone: 'spine', pos: [-0.153, 0.27, 0], yaw: -90, size: [0.28, 0.24] }, front: { bone: 'spine', pos: [0.153, 0.34, 0], yaw: 90, size: [0.13, 0.115] }, face: null },
  baseball: { back: { bone: 'spine', pos: [-0.22, 0.32, 0], yaw: -90, size: [0.38, 0.32] }, front: { bone: 'spine', pos: [0.22, 0.36, 0], yaw: 90, size: [0.16, 0.14] }, face: null },
  goalie_hd: { back: { bone: 'spine', pos: [-0.197, 0.30, 0], yaw: -90, size: [0.30, 0.26] }, front: { bone: 'spine', pos: [0.197, 0.36, 0], yaw: 90, size: [0.12, 0.10] }, face: null },
  goalie:   { back: { bone: 'spine', pos: [-0.27, 0.30, 0], yaw: -90, size: [0.44, 0.38] }, front: { bone: 'spine', pos: [0.27, 0.36, 0], yaw: 90, size: [0.17, 0.15] }, face: null },
  ref:      { back: null, front: null, face: null },
};
// Pure: readable text colours for a jersey colour (css hex or rgb array 0-255): returns { fg, stroke }.
export function textColors(jersey) {
  const rgb = Array.isArray(jersey) ? jersey : (/^#?([0-9a-f]{6})$/i.exec(String(jersey || ''))?.[1].match(/../g) || ['20', '20', '30']).map(h => parseInt(h, 16));
  const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
  return lum > 0.55 ? { fg: '#101216', stroke: '#ffffff' } : { fg: '#ffffff', stroke: '#101216' };
}
export const cleanNumber = n => String(n ?? '').replace(/[^0-9]/g, '').slice(0, 2);
export const shortName = (name, max = 11) => { const last = String(name || '').trim().split(/\s+/).filter(w => !/^(jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).pop() || ''; return last.toUpperCase().slice(0, max); };

export function drawBack(cv, { number, name, jersey }) {
  cv.width = 256; cv.height = 216; const c = cv.getContext('2d'), { fg, stroke } = textColors(jersey); c.clearRect(0, 0, 256, 216); c.textAlign = 'center'; c.lineJoin = 'round';
  const nm = shortName(name), num = cleanNumber(number);
  if (nm) { c.font = '800 40px Arial, sans-serif'; c.lineWidth = 7; c.strokeStyle = stroke; c.strokeText(nm, 128, 44); c.fillStyle = fg; c.fillText(nm, 128, 44); }
  if (num) { c.font = '900 150px Arial, sans-serif'; c.lineWidth = 12; c.strokeStyle = stroke; c.strokeText(num, 128, 190); c.fillStyle = fg; c.fillText(num, 128, 190); }
}
export function drawFront(cv, { number, jersey }) {
  cv.width = 128; cv.height = 112; const c = cv.getContext('2d'), { fg, stroke } = textColors(jersey); c.clearRect(0, 0, 128, 112); c.textAlign = 'center'; c.lineJoin = 'round';
  const num = cleanNumber(number); if (num) { c.font = '900 92px Arial, sans-serif'; c.lineWidth = 9; c.strokeStyle = stroke; c.strokeText(num, 64, 92); c.fillStyle = fg; c.fillText(num, 64, 92); }
}
// Face plate: football = steel face-mask bars, hockey = clear visor / cage. Transparent background.
export function drawFace(cv, kit = 'football') {
  cv.width = 192; cv.height = 140; const c = cv.getContext('2d'); c.clearRect(0, 0, 192, 140);
  if (kit === 'hockey') { c.fillStyle = 'rgba(190,220,255,.22)'; c.fillRect(8, 20, 176, 78); c.strokeStyle = 'rgba(230,240,255,.55)'; c.lineWidth = 3; c.strokeRect(8, 20, 176, 78); return; }
  c.strokeStyle = '#c9ced6'; c.lineCap = 'round'; c.lineWidth = 9;
  for (const y of [34, 70, 106]) { c.beginPath(); c.moveTo(14, y); c.lineTo(178, y); c.stroke(); }          // horizontal bars
  c.lineWidth = 7; for (const x of [34, 96, 158]) { c.beginPath(); c.moveTo(x, 22); c.lineTo(x, 122); c.stroke(); }
  c.fillStyle = 'rgba(10,12,16,.35)'; c.fillRect(14, 22, 164, 100);                                              // dark gap behind the bars (face in shadow)
}

// Game props for the PlayCanvas stage, all procedural (no assets): NFL ball with laces and stripes, hockey puck with bevel, baseball with stitched seams, home plate (pentagon),
// pitcher's rubber, hockey net with real mesh, end-zone pylons and sideline down / first-down markers. World metres; PlayCanvas engine passed in as `pc`.
const rgb = (r, g, b) => [r, g, b, 255];
function smoothNormals(P, I) { const N = new Float32Array(P.length); for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3, ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2], nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; for (const o of [a, b, c]) { N[o] += nx; N[o + 1] += ny; N[o + 2] += nz; } } for (let i = 0; i < N.length; i += 3) { const l = Math.hypot(N[i], N[i + 1], N[i + 2]) || 1; N[i] /= l; N[i + 1] /= l; N[i + 2] /= l; } return N; }
// Lathe around the X axis (axis='x') or Y axis: profile = [{ a: position along axis, r: radius, c: [r,g,b,a] }]. Pure data -> tested.
export function latheData(profile, seg = 20, axis = 'y') {
  const P = [], C = [], I = [], n = profile.length;
  for (let i = 0; i < n; i++) for (let s = 0; s <= seg; s++) { const th = (s / seg) * Math.PI * 2, { a, r } = profile[i], u = r * Math.cos(th), v = r * Math.sin(th); if (axis === 'x') P.push(a, u, v); else P.push(u, a, v); C.push(...profile[i].c); }
  for (let i = 0; i < n - 1; i++) for (let s = 0; s < seg; s++) { const a = i * (seg + 1) + s, b = a + 1, c = a + seg + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  return { P: new Float32Array(P), C: new Uint8Array(C), I: new Uint16Array(I), N: smoothNormals(P, I) };
}
// NFL ball profile: prolate spheroid, 0.28 m long, with two white stripes near each end. Pure data -> tested.
export function footballProfile(L = 0.28, R = 0.085, steps = 28) {
  const out = [], brown = rgb(105, 50, 22), white = rgb(235, 232, 225);
  for (let i = 0; i <= steps; i++) { const x = -L / 2 + (L * i) / steps, t = Math.abs(x) / (L / 2), r = Math.max(0.004, R * Math.pow(Math.max(0, 1 - t * t), 0.62)), band = (Math.abs(x) > 0.062 && Math.abs(x) < 0.074) || (Math.abs(x) > 0.082 && Math.abs(x) < 0.094); out.push({ a: x, r, c: band ? white : brown }); }
  return out;
}
// Puck profile: 7.6 cm wide, bevelled edge, drawn 2.6x for the broadcast view (the caller scales).
export function puckProfile() { const k = [30, 30, 33, 255], t = [46, 46, 52, 255]; return [{ a: -0.5, r: 0, c: k }, { a: -0.5, r: 0.44, c: k }, { a: -0.42, r: 0.5, c: k }, { a: 0.42, r: 0.5, c: t }, { a: 0.5, r: 0.44, c: t }, { a: 0.5, r: 0, c: t }]; }
// Home plate: 17 in front edge toward the pitcher (-z), point toward the catcher (+z); returns flat-shaded top + sides. Pure data -> tested.
export function plateData(h = 0.03) {
  const pts = [[-0.216, -0.216], [0.216, -0.216], [0.216, 0], [0, 0.216], [-0.216, 0]], P = [], I = [], N = [];
  const v = (x, y, z, nx, ny, nz) => { P.push(x, y, z); N.push(nx, ny, nz); return P.length / 3 - 1; };
  const top = pts.map(([x, z]) => v(x, h, z, 0, 1, 0)); for (let i = 1; i < 4; i++) I.push(top[0], top[i + 1], top[i]);
  for (let i = 0; i < 5; i++) { const [x0, z0] = pts[i], [x1, z1] = pts[(i + 1) % 5], dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz), nx = dz / l, nz = -dx / l; const a = v(x0, 0, z0, nx, 0, nz), b = v(x1, 0, z1, nx, 0, nz), c = v(x1, h, z1, nx, 0, nz), d = v(x0, h, z0, nx, 0, nz); I.push(a, b, c, a, c, d); }
  return { P: new Float32Array(P), N: new Float32Array(N), I: new Uint16Array(I) };
}
// Hockey net: side/back/top panels as one mesh with tiled UVs. dir = +1 / -1: direction from the goal line toward the boards. hw = half mouth width, h = height, d = depth.
export function netData(hw, h, d, dir) {
  const bh = h * 0.5, bw = hw * 0.8, P = [], UV = [], I = [], push = (q, uvs) => { const o = P.length / 3; for (const p of q) P.push(...p); UV.push(...uvs); I.push(o, o + 1, o + 2, o, o + 2, o + 3, o, o + 2, o + 1, o, o + 3, o + 2); };
  const F0 = [0, 0, -hw], F1 = [0, 0, hw], T0 = [0, h, -hw], T1 = [0, h, hw], B0 = [dir * d, 0, -bw], B1 = [dir * d, 0, bw], U0 = [dir * d, bh, -bw], U1 = [dir * d, bh, bw];
  push([B0, B1, U1, U0], [0, 0, 6, 0, 6, 3, 0, 3]);        // back
  push([F0, B0, U0, T0], [0, 0, 3, 0, 3, 5, 0, 5]);       // left side (trapezoid)
  push([F1, B1, U1, T1], [0, 0, 3, 0, 3, 5, 0, 5]);       // right side
  push([T0, U0, U1, T1], [0, 0, 3, 0, 3, 6, 0, 6]);       // sloped top
  return { P: new Float32Array(P), UV: new Float32Array(UV), I: new Uint16Array(I) };
}
// Everything below needs a stage ({ pc, app, root }).
export function createProps(stage) {
  const { pc, app, root } = stage, dev = app.graphicsDevice, owned = [], ents = [];
  const material = fn => { const m = new pc.StandardMaterial(); fn(m); m.update(); owned.push(m); return m; };
  const meshEnt = (name, d, mat, { shadow = true, uv = null } = {}) => { const m = new pc.Mesh(dev); m.setPositions(d.P); m.setNormals(d.N || smoothNormals(d.P, d.I)); if (d.C) m.setColors32(d.C); if (uv) m.setUvs(0, uv); m.setIndices(d.I); m.update(); const e = new pc.Entity(name); e.addComponent('render', { meshInstances: [new pc.MeshInstance(m, mat)], castShadows: shadow, receiveShadows: true }); ents.push(e); return e; };
  const prim = (name, type, mat, s, p, parent = root, shadow = true) => { const e = new pc.Entity(name); e.addComponent('render', { type, material: mat, castShadows: shadow, receiveShadows: true }); e.setLocalScale(...s); e.setLocalPosition(...p); parent.addChild(e); ents.push(e); return e; };
  const api = {
    // ---- NFL ball: lathe with stripes + laces. Long axis = X (same as the old stand-in).
    football() {
      const vm = material(m => { m.diffuse = new pc.Color(1, 1, 1); m.diffuseVertexColor = true; m.gloss = 0.45; m.useMetalness = true; m.metalness = 0; });
      const e = meshEnt('ball', latheData(footballProfile(), 18, 'x'), vm), lace = material(m => { m.diffuse = new pc.Color(0.95, 0.94, 0.9); m.gloss = 0.2; });
      prim('lace_bar', 'box', lace, [0.1, 0.006, 0.006], [0, 0.0845, 0], e, false);
      for (let i = -2; i <= 2; i++) prim('lace', 'box', lace, [0.006, 0.005, 0.03], [i * 0.0185, 0.0835, 0], e, false);
      return e;
    },
    // ---- hockey puck (enlarged for the broadcast view; real = 7.6 x 2.5 cm).
    puck() { const e = meshEnt('puck', latheData(puckProfile(), 20, 'y'), material(m => { m.diffuse = new pc.Color(1, 1, 1); m.diffuseVertexColor = true; m.gloss = 0.55; m.useMetalness = true; m.metalness = 0.1; })); e.setLocalScale(0.2, 0.05, 0.2); return e; },
    // ---- baseball: white leather + red stitched figure-8 seam texture.
    baseball() {
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const c = cv.getContext('2d'); c.fillStyle = '#f3efe6'; c.fillRect(0, 0, 512, 256); c.strokeStyle = '#c1272d'; c.lineWidth = 2.2;
      for (const ph of [0, Math.PI]) { c.beginPath(); for (let x = 0; x <= 512; x += 4) { const y = 128 + 70 * Math.sin((x / 512) * Math.PI * 2 + ph); x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
        for (let x = 0; x <= 512; x += 9) { const y = 128 + 70 * Math.sin((x / 512) * Math.PI * 2 + ph), s = Math.cos((x / 512) * Math.PI * 2 + ph) * 70 * Math.PI * 2 / 512, l = Math.hypot(1, s), nx = -s / l, ny = 1 / l; c.beginPath(); c.moveTo(x - nx * 5, y - ny * 5); c.lineTo(x + nx * 5, y + ny * 5); c.stroke(); } }
      const tex = new pc.Texture(dev, { width: 512, height: 256, format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR }); tex.setSource(cv); owned.push({ destroy: () => tex.destroy() });
      const m = material(m2 => { m2.diffuse = new pc.Color(1, 1, 1); m2.diffuseMap = tex; m2.gloss = 0.3; m2.useMetalness = true; m2.metalness = 0; });
      const e = new pc.Entity('ball'); e.addComponent('render', { type: 'sphere', material: m, castShadows: true }); e.setLocalScale(0.16, 0.16, 0.16); ents.push(e); return e;
    },
    homePlate(parent = root) { const e = meshEnt('plate', plateData(0.03), material(m => { m.diffuse = new pc.Color(0.97, 0.97, 0.97); m.gloss = 0.3; }), { shadow: false }); parent.addChild(e); return e; },
    pitcherRubber(parent, y) { const m = material(q => { q.diffuse = new pc.Color(0.97, 0.97, 0.97); q.gloss = 0.3; }); return prim('rubber', 'box', m, [0.61, 0.035, 0.15], [0, y, 0], parent, false); },
    // ---- hockey net (frame pipes are added by the caller's red posts; this adds the mesh netting + back frame).
    hockeyNet(gx, z0, hw, h, d, dir, parent = root) {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const c = cv.getContext('2d'); c.clearRect(0, 0, 64, 64); c.strokeStyle = 'rgba(245,245,250,.95)'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, 0); c.lineTo(64, 0); c.moveTo(0, 0); c.lineTo(0, 64); c.moveTo(0, 0); c.lineTo(64, 64); c.stroke();
      const tex = new pc.Texture(dev, { width: 64, height: 64, format: pc.PIXELFORMAT_SRGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_REPEAT, addressV: pc.ADDRESS_REPEAT }); tex.setSource(cv); owned.push({ destroy: () => tex.destroy() });
      const nm = material(m => { m.diffuse = new pc.Color(1, 1, 1); m.emissive = new pc.Color(0.5, 0.5, 0.52); m.opacityMap = tex; m.opacityMapChannel = 'a'; m.diffuseMap = tex; m.alphaTest = 0; m.blendType = pc.BLEND_NORMAL; m.cull = pc.CULLFACE_NONE; m.depthWrite = false; });
      const nd = netData(hw, h, d, dir), e = meshEnt('net', nd, nm, { shadow: false, uv: nd.UV }); e.setLocalPosition(gx, 0, z0); parent.addChild(e);
      const pipe = material(m => { m.diffuse = new pc.Color(0.9, 0.9, 0.93); m.gloss = 0.4; });
      const bw = hw * 0.8, bh = h * 0.5;
      prim('netpipe', 'box', pipe, [0.04, 0.04, bw * 2], [gx + dir * d, 0.02, z0], parent, false); prim('netpipe', 'box', pipe, [0.04, 0.04, bw * 2], [gx + dir * d, bh, z0], parent, false);
      return e;
    },
    // ---- football: orange pylons at the 4 corners of both end zones (goal line and end line) and the chain crew's markers on the far sideline.
    pylons(L, Wd, yd) {
      const orange = material(m => { m.diffuse = new pc.Color(1, 0.4, 0.05); m.emissive = new pc.Color(0.25, 0.08, 0.0); m.gloss = 0.3; });
      for (const x of [0, 10 * yd, L - 10 * yd, L]) for (const z of [0, -Wd]) prim('pylon', 'box', orange, [0.12, 0.46, 0.12], [x, 0.23, z], root);
    },
    chainMarkers() {
      const pole = material(m => { m.diffuse = new pc.Color(0.9, 0.9, 0.9); }), orange = material(m => { m.diffuse = new pc.Color(1, 0.45, 0.05); m.emissive = new pc.Color(0.3, 0.1, 0); }), yel = material(m => { m.diffuse = new pc.Color(1, 0.85, 0.1); m.emissive = new pc.Color(0.3, 0.25, 0); });
      const mk = (name, head) => { const g = new pc.Entity(name); root.addChild(g); ents.push(g); prim('pole', 'cylinder', pole, [0.05, 2.0, 0.05], [0, 1.0, 0], g); prim('head', 'box', head, [0.3, 0.3, 0.08], [0, 2.1, 0], g); g.enabled = false; return g; };
      const down = mk('down_marker', orange), first = mk('first_down_marker', yel);
      return { down, first, set(losX, fdX, z) { for (const [g, x] of [[down, losX], [first, fdX]]) { g.enabled = Number.isFinite(x); if (g.enabled) g.setPosition(x, 0, z); } } };
    },
    dispose() { ents.forEach(e => { if (e.root) e.destroy(); }); owned.forEach(m => m.destroy()); ents.length = 0; owned.length = 0; },
  };
  return api;
}

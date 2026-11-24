// Stadium bowl for the NFL field (world metres, field x 0..109.7, z 0..-48.8): stepped stands + a crowd built as ONE vertex-coloured mesh (1 draw call),
// plus 4 floodlight spots. The crowd "cheers" by bobbing the whole mesh slightly (cheap) and its colour mix follows the home team.
export const STAND = { rows: 14, rowH: 0.8, rowD: 0.95, seat: 0.85, gapSide: 9, gapEnd: 8 };
// Pure: seat positions for the four stands. Returns [{x,y,z,row}] (heads) — deterministic for a seed.
export function seatLayout(len = 109.7, wid = 48.8, S = STAND, density = 1) {
  const out = [], step = S.seat / Math.max(0.2, density);
  const side = (z0, dir) => { for (let r = 0; r < S.rows; r++) for (let x = -2; x < len + 2; x += step) out.push({ x, y: r * S.rowH + 1.1, z: z0 + dir * r * S.rowD, row: r }); };
  side(S.gapSide, 1); side(-wid - S.gapSide, -1);
  const end = (x0, dir) => { for (let r = 0; r < S.rows; r++) for (let z = -wid; z < 0; z += step) out.push({ x: x0 + dir * r * S.rowD, y: r * S.rowH + 1.1, z, row: r }); };
  end(-S.gapEnd, -1); end(len + S.gapEnd, 1);
  return out;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function createStadium(stage, { density = 1, home = [0.1, 0.25, 0.6], away = [0.85, 0.85, 0.9], seed = 7 } = {}) {
  const { pc, app, root } = stage, rnd = rng(seed), seats = seatLayout(109.7, 48.8, STAND, density);
  const hs = 0.26, P = [], N = [], Cc = [], I = [];
  const faces = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0]];   // bottom face skipped
  for (const s of seats) {
    const t = rnd(), col = t < 0.55 ? home : t < 0.75 ? away : [0.2 + rnd() * 0.7, 0.2 + rnd() * 0.6, 0.2 + rnd() * 0.6], k = 0.7 + rnd() * 0.3;
    const base = P.length / 3, h = hs * (0.8 + rnd() * 0.5);
    const c = [s.x, s.y + h, s.z];
    for (const n of faces) {
      const u = n[0] ? [0, 1, 0] : n[1] ? [1, 0, 0] : [0, 1, 0], v = n[0] ? [0, 0, 1] : n[1] ? [0, 0, 1] : [1, 0, 0], b = P.length / 3;
      for (const [a, d] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(c[0] + (n[0] * hs + u[0] * a * hs + v[0] * d * hs), c[1] + (n[1] * h + u[1] * a * h + v[1] * d * hs), c[2] + (n[2] * hs + u[2] * a * hs + v[2] * d * hs)); N.push(...n); Cc.push(col[0] * k * 255, col[1] * k * 255, col[2] * k * 255, 255); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    void base;
  }
  const mesh = new pc.Mesh(app.graphicsDevice); mesh.setPositions(P); mesh.setNormals(N); mesh.setColors32(Cc); mesh.setIndices(I); mesh.update();
  const mat = new pc.StandardMaterial(); mat.diffuse = new pc.Color(1, 1, 1); mat.diffuseVertexColor = true; mat.gloss = 0.1; mat.useMetalness = true; mat.metalness = 0; mat.update();
  const crowd = new pc.Entity('crowd'); crowd.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: false, receiveShadows: false }); root.addChild(crowd);

  // concrete bowl under the crowd: ALL stepped slabs merged into one mesh (1 draw call instead of 56)
  const conc = new pc.StandardMaterial(); conc.diffuse = new pc.Color(0.42, 0.43, 0.46); conc.gloss = 0.05; conc.update();
  const CP = [], CN = [], CI = [];
  const pushBox = (cx, cy, cz, sx, sy, sz) => {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    for (const [n, u, v] of [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]]) {
      const b0 = CP.length / 3;
      for (const [a1, d1] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) CP.push(cx + n[0] * hx + (u[0] ? u[0] * a1 * hx : 0) + (v[0] ? v[0] * d1 * hx : 0), cy + n[1] * hy + (u[1] ? u[1] * a1 * hy : 0) + (v[1] ? v[1] * d1 * hy : 0), cz + n[2] * hz + (u[2] ? u[2] * a1 * hz : 0) + (v[2] ? v[2] * d1 * hz : 0)), CN.push(...n);
      CI.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    }
  };
  const R = STAND.rows, RH = STAND.rowH, RD = STAND.rowD;
  for (let r = 0; r < R; r++) {
    const h = (r + 1) * RH, off = STAND.gapSide + r * RD + RD / 2, offE = STAND.gapEnd + r * RD + RD / 2;
    pushBox(54.85, h / 2, off, 120, h, RD); pushBox(54.85, h / 2, -48.8 - off, 120, h, RD);
    pushBox(-offE, h / 2, -24.4, RD, h, 50); pushBox(109.7 + offE, h / 2, -24.4, RD, h, 50);
  }
  const cmesh = new pc.Mesh(app.graphicsDevice); cmesh.setPositions(CP); cmesh.setNormals(CN); cmesh.setIndices(CI); cmesh.update();
  const bowl = new pc.Entity('bowl'); bowl.addComponent('render', { meshInstances: [new pc.MeshInstance(cmesh, conc)], castShadows: false, receiveShadows: true }); root.addChild(bowl); const parts = [bowl];

  // floodlights: 4 spots at the corners (enabled by the look)
  const floods = [];
  for (const [x, z] of [[-6, 16], [116, 16], [-6, -65], [116, -65]]) { const f = new pc.Entity('flood'); f.addComponent('light', { type: 'spot', color: new pc.Color(1, 0.97, 0.9), intensity: 0, range: 220, innerConeAngle: 40, outerConeAngle: 70, castShadows: false }); f.setPosition(x, 38, z); f.lookAt(54.85, 0, -24.4); f.enabled = false; root.addChild(f); floods.push(f); }

  // video board above the far stand: a self-lit canvas texture with the score, quarter and clock (redrawn only when the text changes)
  const bcv = document.createElement('canvas'); bcv.width = 768; bcv.height = 288;
  const btex = new pc.Texture(app.graphicsDevice, { width: 768, height: 288, format: pc.PIXELFORMAT_SRGBA8, mipmaps: false, minFilter: pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR }); btex.setSource(bcv);
  const bmat = new pc.StandardMaterial(); bmat.diffuse = new pc.Color(0, 0, 0); bmat.emissive = new pc.Color(1, 1, 1); bmat.emissiveMap = btex; bmat.emissiveIntensity = 1.1; bmat.update();
  const frame = new pc.Entity('boardFrame'); frame.addComponent('render', { type: 'box', material: conc, castShadows: false }); frame.setLocalScale(19, 8, 0.5);
  const board = new pc.Entity('board'); board.addComponent('render', { type: 'plane', material: bmat, castShadows: false, receiveShadows: false });
  const bz = -48.8 - STAND.gapSide - STAND.rows * STAND.rowD - 0.6, by = STAND.rows * STAND.rowH + 6;
  frame.setPosition(54.85, by, bz); board.setLocalScale(18, 1, 7); board.setPosition(54.85, by, bz + 0.3); board.setEulerAngles(90, 0, 0); root.addChild(frame); root.addChild(board); parts.push(frame, board);
  let boardKey = '';
  function setBoard(info) {   // info: { home, away, homeScore, awayScore, quarter, clock, over }
    if (!info) return; const key = `${info.home}|${info.away}|${info.homeScore}|${info.awayScore}|${info.quarter}|${info.clock}|${info.over}`; if (key === boardKey) return; boardKey = key;
    const c = bcv.getContext('2d'), W = bcv.width, H = bcv.height; c.fillStyle = '#06080d'; c.fillRect(0, 0, W, H);
    c.textAlign = 'center'; c.fillStyle = '#f5c542'; c.font = '800 46px Arial, sans-serif'; c.fillText(info.over ? 'FINAL' : `Q${info.quarter}  ${info.clock}`, W / 2, 62);
    c.fillStyle = '#fff'; c.font = '800 54px Arial, sans-serif'; c.fillText(info.away || 'AWAY', W * 0.2, 170); c.fillText(info.home || 'HOME', W * 0.8, 170);
    c.font = '900 110px Arial, sans-serif'; c.fillText(String(info.awayScore ?? 0), W * 0.2, 262); c.fillText(String(info.homeScore ?? 0), W * 0.8, 262);
    c.fillStyle = '#3a4252'; c.fillRect(W / 2 - 2, 90, 4, 180); btex.upload();
  }
  let cheer = 0;
  return {
    floods, seats: seats.length, crowd, setBoard, boardKey: () => boardKey,
    cheer(v = 1) { cheer = Math.max(cheer, v); },
    update(dt, t) { cheer = Math.max(0, cheer - dt * 0.7); crowd.setLocalPosition(0, Math.abs(Math.sin(t * 9)) * 0.22 * cheer, 0); },
    dispose() { crowd.destroy(); parts.forEach(p => p.destroy()); floods.forEach(f => f.destroy()); mesh.destroy(); cmesh.destroy(); btex.destroy(); bmat.destroy(); mat.destroy(); conc.destroy(); },
  };
}

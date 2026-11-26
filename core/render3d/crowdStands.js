// Generic stands + crowd for the rink and the ballpark (world metres). Layouts are pure (unit-tested); createCrowdStands() builds ONE crowd mesh
// (vertex-coloured heads) and ONE concrete mesh (stepped slabs) = 2 draw calls, and exposes cheer(v) / update(dt,t) like the NFL stadium.
import { fencePoint } from '../../mlb/src/field/geometry.js';
const FT = 0.3048;
export const S_RINK = { rows: 9, rowH: 0.75, rowD: 0.9, seat: 0.85, gap: 3.5 };
export const S_PARK = { rows: 11, rowH: 0.8, rowD: 0.95, seat: 0.9, gap: 4 };
// Slab = [cx, cy, cz, sx, sy, sz, yawDeg]. Seat = {x, y, z}.
// Rink (x 0..len, z 0..-wid): far side and both ends. The near side stays open: the broadcast camera stands there.
export function rinkStands(len = 60.96, wid = 25.908, S = S_RINK, density = 1) {
  const seats = [], slabs = [], step = S.seat / Math.max(0.2, density);
  for (let r = 0; r < S.rows; r++) {
    const h = (r + 1) * S.rowH, y = r * S.rowH + 1.5, zf = -wid - S.gap - r * S.rowD - 0.35, xl = -S.gap - r * S.rowD - 0.35, xr = len + S.gap + r * S.rowD + 0.35;   // seats sit toward the middle of each step and a bit higher: seen from the camera side they stay above the next riser
    for (let x = -S.gap; x < len + S.gap; x += step) seats.push({ x, y, z: zf });
    for (let z = -wid; z < 0; z += step) { seats.push({ x: xl, y, z }); seats.push({ x: xr, y, z }); }
    slabs.push([len / 2, h / 2, zf - S.rowD / 2, len + 2 * S.gap + 2 * S.rows * S.rowD * 0 + 4, h, S.rowD, 0]);
    slabs.push([xl - S.rowD / 2, h / 2, -wid / 2, S.rowD, h, wid + 2, 0]); slabs.push([xr + S.rowD / 2, h / 2, -wid / 2, S.rowD, h, wid + 2, 0]);
  }
  return { seats, slabs };
}
// Ballpark: terraces in an arc behind the outfield fence (feet geometry -> metres), rows rising outward.
export function arcStands(S = S_PARK, density = 1, segs = 40) {
  const seats = [], slabs = [], step = S.seat / Math.max(0.2, density);
  for (let r = 0; r < S.rows; r++) {
    const off = -(S.gap + r * S.rowD) / FT, h = (r + 1) * S.rowH, y = r * S.rowH + 1.1;   // negative inset = outward (feet)
    const pts = []; for (let i = 0; i <= segs; i++) { const q = fencePoint(((-45 + (90 * i) / segs) * Math.PI) / 180, off); pts.push({ x: q.x * FT, z: -q.y * FT }); }
    for (let i = 0; i < segs; i++) {
      const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz), n = Math.max(1, Math.floor(len / step));
      for (let k = 0; k < n; k++) seats.push({ x: a.x + (dx * (k + 0.5)) / n, y, z: a.z + (dz * (k + 0.5)) / n });
      slabs.push([(a.x + b.x) / 2, h / 2, (a.z + b.z) / 2, len + 0.05, h, S.rowD, (Math.atan2(-dz, dx) * 180) / Math.PI]);
    }
  }
  return { seats, slabs };
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const rotY = (x, z, c, s) => [x * c + z * s, -x * s + z * c];   // rotation about Y by yaw (PlayCanvas: positive yaw turns +X toward -Z)

export function createCrowdStands(stage, { seats, slabs, home = [0.1, 0.25, 0.6], away = [0.85, 0.85, 0.9], seed = 11, concrete = [0.42, 0.43, 0.46] }) {
  const { pc, app, root } = stage, rnd = rng(seed), hs = 0.3;
  const P = [], N = [], C = [], I = [], faces = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0]];
  for (const s of seats) {
    const t = rnd(), col = t < 0.55 ? home : t < 0.75 ? away : [0.2 + rnd() * 0.7, 0.2 + rnd() * 0.6, 0.2 + rnd() * 0.6], k = 0.85 + rnd() * 0.15, h = hs * (0.8 + rnd() * 0.5), lift = c => c + (1 - c) * 0.12;   // lifted toward white so dark team colours still read against a dark arena
    for (const n of faces) {
      const u = n[0] ? [0, 1, 0] : n[1] ? [1, 0, 0] : [0, 1, 0], v = n[0] ? [0, 0, 1] : n[1] ? [0, 0, 1] : [1, 0, 0], b = P.length / 3;
      for (const [a, d] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { P.push(s.x + n[0] * hs + u[0] * a * hs + v[0] * d * hs, s.y + h + n[1] * h + u[1] * a * h + v[1] * d * hs, s.z + n[2] * hs + u[2] * a * hs + v[2] * d * hs); N.push(...n); C.push(lift(col[0]) * k * 255, lift(col[1]) * k * 255, lift(col[2]) * k * 255, 255); }
      I.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const mesh = new pc.Mesh(app.graphicsDevice); mesh.setPositions(P); mesh.setNormals(N); mesh.setColors32(C); mesh.setIndices(I); mesh.update();
  const mat = new pc.StandardMaterial(); mat.diffuse = new pc.Color(1, 1, 1); mat.diffuseVertexColor = true; mat.cull = pc.CULLFACE_NONE;   /* the head boxes' front (+z) / -x faces had the wrong winding and were culled: only the side faces showed (thin "ticks") */ mat.emissive = new pc.Color(1, 1, 1); mat.emissiveVertexColor = true; mat.emissiveIntensity = 0.45;   // self-lit shirts: the colour reads on the shaded front faces too (before: only the lit sides showed, as thin ticks)
  mat.gloss = 0.1; mat.useMetalness = true; mat.metalness = 0; mat.update();
  const crowd = new pc.Entity('crowd'); crowd.addComponent('render', { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: false, receiveShadows: false }); root.addChild(crowd);
  const CP = [], CN = [], CI = [];
  for (const [cx, cy, cz, sx, sy, sz, yaw] of slabs) {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2, c = Math.cos(((yaw || 0) * Math.PI) / 180), sn = Math.sin(((yaw || 0) * Math.PI) / 180);
    for (const [n, u, v] of [[[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]], [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]]]) {
      const b = CP.length / 3;
      for (const [a1, d1] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const lx = n[0] * hx + (u[0] ? u[0] * a1 * hx : 0) + (v[0] ? v[0] * d1 * hx : 0), ly = n[1] * hy + (u[1] ? u[1] * a1 * hy : 0) + (v[1] ? v[1] * d1 * hy : 0), lz = n[2] * hz + (u[2] ? u[2] * a1 * hz : 0) + (v[2] ? v[2] * d1 * hz : 0);
        const [rx, rz] = rotY(lx, lz, c, sn); CP.push(cx + rx, cy + ly, cz + rz); const [nx, nz] = rotY(n[0], n[2], c, sn); CN.push(nx, n[1], nz);
      }
      CI.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
  }
  const cmesh = new pc.Mesh(app.graphicsDevice); cmesh.setPositions(CP); cmesh.setNormals(CN); cmesh.setIndices(CI); cmesh.update();
  const conc = new pc.StandardMaterial(); conc.diffuse = new pc.Color(...concrete); conc.gloss = 0.05; conc.update();
  const bowl = new pc.Entity('bowl'); bowl.addComponent('render', { meshInstances: [new pc.MeshInstance(cmesh, conc)], castShadows: false, receiveShadows: true }); root.addChild(bowl);
  let cheer = 0;
  return {
    seats: seats.length, crowd, bowl,
    cheer(v = 1) { cheer = Math.max(cheer, v); },
    update(dt, t) { cheer = Math.max(0, cheer - dt * 0.7); crowd.setLocalPosition(0, Math.abs(Math.sin(t * 9)) * 0.2 * cheer, 0); },
    dispose() { crowd.destroy(); bowl.destroy(); mesh.destroy(); cmesh.destroy(); mat.destroy(); conc.destroy(); },
  };
}

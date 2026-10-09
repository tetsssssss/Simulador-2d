// NHL 2.5D: presentation-only Three.js renderer. The hockey engine remains the source of truth.
// No extra simulation loop, no asset downloads beyond the pinned Three.js ES module.
// This is deliberately procedural so the first playable slice has no GLTF/texture dependencies.
import { RINK, MIDY, FACEOFF_DOTS } from './geometry.js';

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const pos = (x, z, h = 0) => [x - RINK.center, h, z - MIDY];

export async function createRinkThreeRenderer(canvas, { onContextLost } = {}) {
  const THREE = await import(THREE_URL);
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  gl.setClearColor(0x080f19, 1);
  gl.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#080f19');
  scene.fog = new THREE.Fog('#080f19', 235, 410);
  scene.add(new THREE.HemisphereLight(0xe7f6ff, 0x1b2a3e, 2.1));
  const light = new THREE.DirectionalLight(0xffffff, 2.2);
  light.position.set(-40, 130, 80);
  scene.add(light);
  const fill = new THREE.DirectionalLight(0x9dcfff, 0.65);
  fill.position.set(90, 65, -70);
  scene.add(fill);

  const camera = new THREE.OrthographicCamera(-100, 100, 70, -70, 0.1, 650);
  const focus = new THREE.Vector3(0, 0, 0);
  const cameraOffset = new THREE.Vector3(85, 155, 150);
  let width = 0, height = 0, currentTeams = '', destroyed = false;
  const actors = new Map(), screen = new Map();
  const rink = new THREE.Group();
  scene.add(rink);

  const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.02, ...opts });
  const white = mat('#f5fbff'), red = mat('#cb3044'), blue = mat('#2562b5');
  const dark = mat('#101a28'), yellow = mat('#f7c632');
  const iceMat = mat('#e8f6ff', { roughness: 0.31, metalness: 0.08, side: THREE.DoubleSide });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 185), mat('#111d2c'));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.4;
  rink.add(floor);

  // The actual rink is a 200x85 ft rounded rectangle, not a square placeholder.
  const x0 = -RINK.L / 2, x1 = RINK.L / 2, z0 = -RINK.W / 2, z1 = RINK.W / 2, r = RINK.cornerR;
  const outline = new THREE.Shape();
  outline.moveTo(x0 + r, z0);
  outline.lineTo(x1 - r, z0);
  outline.quadraticCurveTo(x1, z0, x1, z0 + r);
  outline.lineTo(x1, z1 - r);
  outline.quadraticCurveTo(x1, z1, x1 - r, z1);
  outline.lineTo(x0 + r, z1);
  outline.quadraticCurveTo(x0, z1, x0, z1 - r);
  outline.lineTo(x0, z0 + r);
  outline.quadraticCurveTo(x0, z0, x0 + r, z0);
  outline.closePath();
  const ice = new THREE.Mesh(new THREE.ShapeGeometry(outline, 14), iceMat);
  ice.rotation.x = -Math.PI / 2;
  ice.position.y = 0.02;
  rink.add(ice);
  const perimeter = outline.getPoints(14);

  function wall(y0, y1, material) {
    const verts = [];
    for (let i = 0; i < perimeter.length - 1; i++) {
      const a = perimeter[i], b = perimeter[i + 1];
      verts.push(a.x, y0, -a.y, b.x, y0, -b.y, a.x, y1, -a.y);
      verts.push(b.x, y0, -b.y, b.x, y1, -b.y, a.x, y1, -a.y);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    rink.add(new THREE.Mesh(geo, material));
  }
  wall(0.05, 1.35, mat('#f2f7fa', { side: THREE.DoubleSide }));
  wall(0.05, 0.28, mat('#edc032', { side: THREE.DoubleSide }));
  wall(1.35, 4.9, mat('#b6dcf4', { transparent: true, opacity: 0.17, depthWrite: false, side: THREE.DoubleSide }));

  function stripe(x, w, color) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.018, RINK.W - 0.4), color);
    m.position.set(x - RINK.center, 0.07, 0);
    rink.add(m);
  }
  stripe(RINK.goalLine, 0.19, red);
  stripe(RINK.L - RINK.goalLine, 0.19, red);
  stripe(RINK.blueLine, 1.0, blue);
  stripe(RINK.L - RINK.blueLine, 1.0, blue);
  stripe(RINK.center, 0.95, red);

  function ring(cx, cz, radius, color, h = 0.105) {
    const pts = [];
    for (let i = 0; i < 64; i++) {
      const a = i * Math.PI * 2 / 64;
      pts.push(new THREE.Vector3(cx + Math.cos(a) * radius, h, cz + Math.sin(a) * radius));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    rink.add(new THREE.LineLoop(geo, new THREE.LineBasicMaterial({ color })));
  }
  for (const d of FACEOFF_DOTS) {
    const [cx, , cz] = pos(d.x, d.y);
    if (d.kind !== 'neutral') ring(cx, cz, RINK.circleR, d.kind === 'center' ? '#2868bd' : '#d33a49');
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(d.kind === 'center' ? 0.65 : 0.9, d.kind === 'center' ? 0.65 : 0.9, 0.02, 16), d.kind === 'center' ? blue : red);
    dot.position.set(cx, 0.09, cz);
    rink.add(dot);
  }

  function rod(a, b, radius, material) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
    const d = new THREE.Vector3().subVectors(B, A);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, d.length(), 7), material);
    mesh.position.copy(A).add(B).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return mesh;
  }
  for (const sign of [-1, 1]) {
    const gx = sign < 0 ? RINK.goalLine : RINK.L - RINK.goalLine;
    const [X] = pos(gx, MIDY), back = X + sign * RINK.netD;
    const crease = new THREE.Mesh(new THREE.CircleGeometry(RINK.creaseR, 36), mat('#8ecbfa', { transparent: true, opacity: 0.33, side: THREE.DoubleSide }));
    crease.rotation.x = -Math.PI / 2;
    crease.position.set(X - sign * 2, 0.085, 0);
    rink.add(crease);
    ring(X - sign * 2, 0, RINK.creaseR, '#d13b4b', 0.12);
    for (const z of [-3, 3]) {
      rink.add(rod([X, 0.15, z], [X, 3, z], 0.24, red));
      rink.add(rod([X, 3, z], [back, 2.7, z], 0.14, white));
    }
    rink.add(rod([X, 3, -3], [X, 3, 3], 0.22, red));
    rink.add(rod([back, 2.7, -3], [back, 2.7, 3], 0.12, white));
    const net = new THREE.Mesh(new THREE.BoxGeometry(RINK.netD, 2.65, 6), new THREE.MeshBasicMaterial({ color: 0xeaf5ff, wireframe: true, transparent: true, opacity: 0.3 }));
    net.position.set((X + back) / 2, 1.42, 0);
    rink.add(net);
  }

  // Static stands and benches are instanced to keep draw calls low on mobile.
  const seatGeo = new THREE.BoxGeometry(2.4, 1.5, 1.8);
  const seats = new THREE.InstancedMesh(seatGeo, mat('#28415a'), 520);
  const dummy = new THREE.Object3D();
  const colors = ['#23364b', '#3d5067', '#2c5870', '#526477', '#1e2e42'];
  let n = 0;
  for (const sign of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      for (let i = 0; i < 50; i++) {
        dummy.position.set(-119 + i * 4.8, 1 + row * 2.1, sign * (52 + row * 3.5));
        dummy.updateMatrix(); seats.setMatrixAt(n, dummy.matrix);
        seats.setColorAt(n, new THREE.Color(colors[(i * 7 + row * 3) % colors.length])); n++;
      }
    }
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 20; i++) {
        dummy.position.set(sign * (112 + row * 3.5), 1 + row * 2.1, -44 + i * 4.6);
        dummy.updateMatrix(); seats.setMatrixAt(n, dummy.matrix);
        seats.setColorAt(n, new THREE.Color(colors[(i * 3 + row) % colors.length])); n++;
      }
    }
  }
  seats.count = n;
  seats.instanceMatrix.needsUpdate = true;
  if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
  rink.add(seats);
  for (const bx of [-32, 32]) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(32, 2, 6), dark);
    bench.position.set(bx, 1, 47.5);
    rink.add(bench);
  }

  const puck = new THREE.Group();
  const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.83, 0.83, 0.28, 16), mat('#0a1019', { roughness: 0.85 }));
  puck.add(disk);
  const puckHalo = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.55, 32), new THREE.MeshBasicMaterial({ color: '#ffcd58', transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
  puckHalo.rotation.x = -Math.PI / 2;
  puckHalo.position.y = -0.11;
  puck.add(puckHalo);
  scene.add(puck);

  function labelSprite(text) {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 64;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = 'rgba(5,13,23,0.82)'; ctx.fillRect(1, 5, 254, 54);
    ctx.strokeStyle = '#9fb8ca'; ctx.strokeRect(1, 5, 254, 54);
    ctx.fillStyle = '#ffffff'; ctx.font = 'bold 31px Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(text || '').slice(0, 16), 128, 32, 242);
    const texture = new THREE.CanvasTexture(cv);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(10.5, 2.6, 1);
    sprite.position.y = 8.1;
    return sprite;
  }

  function playerModel(p, state) {
    const team = state[p.team] || {};
    const jersey = mat(team.color || '#487ca5');
    const trim = mat(team.color2 || '#e4edf7');
    const pants = mat('#172337'), helmet = mat(team.color || '#487ca5', { roughness: 0.35 });
    const blade = mat('#242a31'), skin = mat('#bd8e6b');
    const root = new THREE.Group(), body = new THREE.Group();
    root.add(body);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(p.goalie ? 2.4 : 1.8, 20), new THREE.MeshBasicMaterial({ color: 0x09131d, transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.12; root.add(shadow);
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(p.goalie ? 1.45 : 1.12, p.goalie ? 1.5 : 1.28, 2.4, 9), jersey);
    torso.position.y = 3.7; body.add(torso);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(p.goalie ? 1.5 : 1.17, p.goalie ? 1.5 : 1.3, 0.36, 9), trim);
    band.position.y = 3.0; body.add(band);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.73, 10, 8), skin);
    head.position.y = 5.25; body.add(head);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(0.92, 10, 8), helmet);
    lid.position.y = 5.66; lid.scale.y = 0.7; body.add(lid);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.37, 1.05), trim);
    visor.position.set(0.76, 5.44, 0); body.add(visor);
    const legs = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.position.set(0, 2.6, side * 0.64);
      const leg = new THREE.Mesh(p.goalie ? new THREE.BoxGeometry(0.94, 2.05, 0.82) : new THREE.CylinderGeometry(0.42, 0.5, 2.05, 7), p.goalie ? trim : pants);
      leg.position.y = -1.04; pivot.add(leg);
      const skate = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.34, 0.57), blade);
      skate.position.set(0.43, -2.12, 0); pivot.add(skate);
      body.add(pivot); legs.push(pivot);
    }
    for (const side of [-1, 1]) {
      body.add(rod([0, 4.55, side * 1.12], [0.9, 3.1, side * 1.45], 0.34, jersey));
    }
    const stick = new THREE.Group();
    stick.add(rod([0.6, 3.2, -1.25], [2.65, 0.42, -1.25], 0.12, blade));
    stick.add(rod([2.65, 0.42, -1.25], [3.1, 0.34, -0.25], 0.19, blade));
    body.add(stick);
    const halo = new THREE.Mesh(new THREE.RingGeometry(2.05, 2.43, 32), new THREE.MeshBasicMaterial({ color: '#ffd35c', side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.18; halo.visible = false; root.add(halo);
    const label = labelSprite(p.last || p.num || p.pos);
    root.add(label);
    scene.add(root);
    return { root, body, legs, stick, halo, label };
  }

  function releaseActor(actor) {
    actor.root.traverse(o => {
      o.geometry?.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { m.map?.dispose(); m.dispose(); }
      }
    });
    scene.remove(actor.root);
  }
  function resetActors() {
    for (const actor of actors.values()) releaseActor(actor);
    actors.clear();
  }

  function resize() {
    const w = Math.max(1, Math.round(canvas.clientWidth));
    const h = Math.max(1, Math.round(canvas.clientHeight));
    if (w === width && h === height) return;
    width = w; height = h;
    gl.setSize(w, h, false);
    const aspect = w / h;
    camera.position.copy(cameraOffset);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    let extentX = 0, extentY = 0;
    for (const x of [-125, 125]) for (const z of [-69, 69]) {
      const v = new THREE.Vector3(x, 7, z);
      extentX = Math.max(extentX, Math.abs(v.dot(right)));
      extentY = Math.max(extentY, Math.abs(v.dot(up)));
    }
    const halfH = Math.max(extentY + 8, (extentX + 8) / aspect);
    camera.left = -halfH * aspect; camera.right = halfH * aspect;
    camera.top = halfH; camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }

  function render(state, alpha = 1, options = {}) {
    if (destroyed || !state?.players || !state.puck) return;
    resize();
    const teams = (state.home?.abbr || '') + '/' + (state.away?.abbr || '');
    if (teams !== currentTeams) { resetActors(); currentTeams = teams; }
    const live = new Set();
    screen.clear();
    const time = state.t || 0;
    for (const p of state.players) {
      live.add(p.id);
      let actor = actors.get(p.id);
      if (!actor) { actor = playerModel(p, state); actors.set(p.id, actor); }
      const a = clamp(alpha, 0, 1);
      const x = (p.px ?? p.x) + (p.x - (p.px ?? p.x)) * a;
      const z = (p.py ?? p.y) + (p.y - (p.py ?? p.y)) * a;
      actor.root.position.set(x - RINK.center, 0, z - MIDY);
      actor.root.rotation.y = -(p.facing || 0);
      actor.root.visible = !p.onBench;
      actor.label.visible = options.showNames !== false && !p.onBench;
      actor.halo.visible = (options.selected === p.id || state.puck.owner === p.id) && !p.onBench;
      actor.halo.material.color.set(options.selected === p.id ? '#73e8ff' : '#ffd35c');
      const speed = Math.hypot(p.vx || 0, p.vy || 0);
      const stride = Math.sin(time * 9 + Number(p.num || 0)) * Math.min(0.38, speed / 65);
      actor.legs[0].rotation.z = p.goalie ? 0 : stride;
      actor.legs[1].rotation.z = p.goalie ? 0 : -stride;
      if (p.goalie && ['BUTTERFLY', 'PAD_SAVE', 'SLIDE'].includes(p.state)) {
        actor.legs[0].rotation.x = -0.7; actor.legs[1].rotation.x = 0.7;
        actor.body.position.y = -0.45;
      } else {
        actor.legs[0].rotation.x = actor.legs[1].rotation.x = 0;
        actor.body.position.y = 0;
      }
      actor.body.rotation.z = p.goalie ? 0 : clamp(speed / 150, 0, 0.17);
      actor.stick.rotation.z = p.wind ? -0.5 : 0;
      if (!p.onBench) screen.set(p.id, p);
    }
    for (const [id, actor] of actors) if (!live.has(id)) { releaseActor(actor); actors.delete(id); }
    puck.position.set(state.puck.x - RINK.center, 0.28 + Math.max(0, state.puck.z || 0), state.puck.y - MIDY);
    puck.rotation.y = (state.puck.spin || 0) * time * 0.01;

    const mode = options.camera || 'BROADCAST';
    const targetX = mode === 'PUCK' ? state.puck.x - RINK.center : mode === 'BROADCAST' ? (state.puck.x - RINK.center) * 0.22 : 0;
    const targetZ = mode === 'PUCK' ? state.puck.y - MIDY : mode === 'BROADCAST' ? (state.puck.y - MIDY) * 0.22 : 0;
    focus.lerp(new THREE.Vector3(targetX, 0, targetZ), 0.09);
    camera.position.copy(cameraOffset).add(focus);
    camera.lookAt(focus);
    camera.zoom = mode === 'PUCK' ? 1.75 : mode === 'BROADCAST' ? 1.13 : mode === 'TACTICAL' ? 1.02 : 0.95;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    gl.render(scene, camera);
  }

  function pick(x, y) {
    if (!width || !height) return null;
    let found = null, best = 25 * 25;
    for (const p of screen.values()) {
      const a = actors.get(p.id);
      if (!a || !a.root.visible) continue;
      const v = a.root.position.clone().add(new THREE.Vector3(0, 3.5, 0)).project(camera);
      const px = (v.x + 1) * width / 2, py = (1 - v.y) * height / 2;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < best) { best = d; found = p; }
    }
    return found;
  }

  const lost = e => { e.preventDefault(); onContextLost?.(); };
  canvas.addEventListener('webglcontextlost', lost);
  function dispose() {
    if (destroyed) return;
    destroyed = true;
    canvas.removeEventListener('webglcontextlost', lost);
    resetActors();
    scene.traverse(o => {
      o.geometry?.dispose();
      if (o.material) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) { m.map?.dispose(); m.dispose(); }
      }
    });
    gl.dispose();
  }
  return { render, pick, dispose };
}

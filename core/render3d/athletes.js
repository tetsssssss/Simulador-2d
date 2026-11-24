// 3D athletes on the PlayCanvas engine. One glTF per kit (skinned, 11 bones, 147 clips named exactly like the 2D game's clips: mv_run, ag_wrap_tackle, hk_slap…),
// instanced per player; team colours are applied by ZONE material (asu_jersey / asu_helmet / asu_pants / asu_accent), not by texture; clips switch with a cross-fade.
// Pure helpers (zoneColors, buildClipIndex, modelUrl, worldFromSim) are unit-tested without WebGL.
import { parseColor, pantsColorFor } from '../render/spriteSheet.js';
import { DECAL_SPECS, drawBack, drawFront, drawFace } from './decals.js';

// kit -> glTF. "hd" = skinned Meshy models (football, hockey skaters), "lo" = the low-poly athletes (also the fallback / far LOD).
export const MODELS = Object.freeze({
  football: { hd: 'assets/models3d/football_hd.glb', lo: 'assets/models3d/football.glb' },
  hockey: { hd: 'assets/models3d/hockey_hd.glb', lo: 'assets/models3d/hockey.glb' },
  goalie: { lo: 'assets/models3d/goalie.glb' },
  ref: { lo: 'assets/models3d/ref.glb' },
  baseball: { hd: 'assets/models3d/baseball_hd.glb', lo: 'assets/models3d/baseball.glb' },
});
export const ZONES = ['asu_jersey', 'asu_pants', 'asu_skin', 'asu_boots', 'asu_helmet', 'asu_trim', 'asu_accent', 'asu_dark'];   // zones are matched by material NAME (guarded by tests/models3d.test.mjs)
export const modelUrl = (kit, hd = true, base = '/') => { const m = MODELS[kit]; if (!m) throw new Error(`unknown 3D kit "${kit}"`); return base + ((hd && m.hd) || m.lo); };

// Team colours per zone, 0..1 RGB. Same rules as the 2D sprite sheets: helmet = jersey colour, pants = pantsColorFor(kit), accent = secondary colour; referees are never tinted.
export function zoneColors(kit, color = '#1d4ed8', color2 = '#ffffff') {
  if (kit === 'ref') return {};
  const n = c => parseColor(c).map(v => v / 255), kk = kit === 'goalie' ? 'hockey' : kit;
  return { asu_jersey: n(color), asu_helmet: n(color), asu_pants: n(pantsColorFor(kk, color, color2)), asu_accent: n(color2) };
}
// Animation tracks by clip id. PlayCanvas names glTF animations "<file>/animation/<n>"; the game's id is the track's own name (resource.name).
export function buildClipIndex(animations) {
  const m = new Map();
  for (const a of animations || []) { const id = a?.resource?.name || a?.name; if (id && !m.has(id)) m.set(id, a.resource || a); }
  return m;
}
// Simulation coordinates -> world (metres, Y up). NFL: x downfield, y across, in YARDS; NHL / MLB: feet. World +X = sim +x; world -Z = sim +y so a model facing +X turns toward sim +y with a positive rotation about Y.
const UNIT = { nfl: 0.9144, nhl: 0.3048, mlb: 0.3048 };
export const worldFromSim = (sport, x, y, h = 0) => { const u = UNIT[sport] ?? 1; return [x * u, h, -y * u]; };
export const yawFromFacing = f => (f * 180) / Math.PI;

export function createAthleteFactory(stage, { base = '/' } = {}) {
  const { pc, app } = stage; const containers = new Map(), teamMats = new Map(), clones = [];
  const load = (kit, hd = true) => {
    const url = modelUrl(kit, hd, base); if (containers.has(url)) return containers.get(url);
    const p = new Promise((res, rej) => app.assets.loadFromUrl(url, 'container', (err, asset) => (err ? rej(new Error(`${url}: ${err}`)) : res({ asset, clips: buildClipIndex(asset.resource.animations), url }))));
    containers.set(url, p); return p;
  };
  const tinted = (mat, zone, rgb) => {
    const key = `${zone}|${rgb.map(v => v.toFixed(3)).join(',')}`; let m = teamMats.get(key);
    if (!m) { m = mat.clone(); m.diffuse = new pc.Color(rgb[0], rgb[1], rgb[2]); m.update(); teamMats.set(key, m); clones.push(m); }
    return m;
  };
  async function spawn(kit, { hd = true, color, color2, parent = stage.root, name = kit } = {}) {
    let model; try { model = await load(kit, hd); } catch (e) { if (!hd || !MODELS[kit].hd) throw e; model = await load(kit, false); }   // HD failed -> low-poly
    const entity = model.asset.resource.instantiateRenderEntity({ castShadows: true, receiveShadows: true }); entity.name = name; parent.addChild(entity);
    entity.addComponent('anim', { activate: true });
    const zc = zoneColors(kit, color, color2);
    entity.findComponents('render').forEach(r => r.meshInstances.forEach(mi => { const z = mi.material?.name; if (zc[z]) mi.material = tinted(mi.material, z, zc[z]); }));
    const states = new Set(); let current = null;
    // Identity decals (back number + name, chest number, face plate), created on the first setIdentity() call; the rig has no UVs so they are quads on the bones.
    let dec = null, decKey = '', jerseyCss = color;
    const spec = DECAL_SPECS[kit] || {};
    function makeDecal(def, cv, order) {
      const bone = entity.findByName(def.bone); if (!bone) return null;
      const tex = new pc.Texture(stage.app.graphicsDevice, { width: 8, height: 8, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
      const mat = new pc.StandardMaterial(); mat.diffuse = new pc.Color(1, 1, 1); mat.diffuseMap = tex; mat.opacityMap = tex; mat.opacityMapChannel = 'a'; mat.blendType = pc.BLEND_NORMAL; mat.depthWrite = false; mat.gloss = 0.1; mat.useMetalness = true; mat.metalness = 0; mat.update();
      const e = new pc.Entity('decal'); e.addComponent('render', { type: 'plane', material: mat, castShadows: false, receiveShadows: false }); bone.addChild(e);
      e.setLocalPosition(...def.pos); e.setLocalScale(def.size[0], 1, def.size[1]);
      const q = new pc.Quat().setFromEulerAngles(0, def.yaw, 0), qx = new pc.Quat().setFromEulerAngles(90, 0, 0); e.setLocalRotation(q.mul(qx));
      return { e, tex, mat, cv, def };
    }
    const upload = d => { d.tex.resize(d.cv.width, d.cv.height); d.tex.setSource(d.cv); d.tex.upload(); };
    const api = {

      entity, kit, clips: model.clips, get clip() { return current; },
      has: id => model.clips.has(id),
      // play(id, { loop, blend (s), speed }): cross-fades from the current clip; replays a finished one-shot; unknown ids are ignored (returns false).
      play(id, { loop = true, blend = 0.15, speed = 1 } = {}) {
        const track = model.clips.get(id); if (!track) return false;
        if (!states.has(id)) { entity.anim.assignAnimation(id, track, undefined, speed, loop); states.add(id); if (current === null) { current = id; return true; } }
        if (current === id) { if (!loop) entity.anim.baseLayer.play(id); return true; }
        entity.anim.baseLayer.transition(id, blend); current = id; return true;
      },
      setPosition(sport, x, y, h = 0) { entity.setPosition(...worldFromSim(sport, x, y, h)); },
      setFacing(f) { entity.setEulerAngles(0, yawFromFacing(f), 0); },
      // number / name on the jersey, chest number, face plate. Cheap no-op when nothing changed or when the kit has no decal spec.
      setIdentity({ number = '', name = '', jersey = jerseyCss } = {}) {
        if (!spec.back && !spec.front && !spec.face) return false;
        const key = `${number}|${name}|${jersey}`; if (key === decKey && dec) return true; decKey = key;
        if (!dec) { dec = { back: spec.back && makeDecal(spec.back, document.createElement('canvas')), front: spec.front && makeDecal(spec.front, document.createElement('canvas')), face: spec.face && makeDecal(spec.face, document.createElement('canvas')) }; if (dec.face) { drawFace(dec.face.cv, kit); upload(dec.face); } }
        if (dec.back) { drawBack(dec.back.cv, { number, name, jersey }); upload(dec.back); } if (dec.front) { drawFront(dec.front.cv, { number, jersey }); upload(dec.front); }
        return true;
      },
      get decals() { return !!dec; },
      // show / hide the mesh parts that use a given material (e.g. the bat 'asu_bat': only the batter holds it). Returns how many parts were found.
      setPartVisible(materialName, visible) { let n = 0; entity.findComponents('render').forEach(r => r.meshInstances.forEach(mi => { if (mi.material?.name === materialName) { mi.visible = !!visible; n++; } })); return n; },
      setTeam(color, color2) { jerseyCss = color; if (dec) { decKey = ''; } const z = zoneColors(kit, color, color2); entity.findComponents('render').forEach(r => r.meshInstances.forEach(mi => { const n = mi.material?.name; /* clones keep the zone name */ if (z[n]) mi.material = tinted(mi.material, n, z[n]); })); },
      dispose() { if (dec) for (const d of Object.values(dec)) if (d) { d.tex.destroy(); d.mat.destroy(); } entity.destroy(); },
    };
    return api;
  }
  return { load, spawn, dispose() { clones.splice(0).forEach(m => m.destroy()); teamMats.clear(); for (const p of containers.values()) p.then(c => c.asset.unload?.()).catch(() => {}); containers.clear(); } };
}

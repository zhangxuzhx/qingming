// 陈设：器物的小像，以及在家中“看向哪里、摆在哪里”的布置逻辑
import * as THREE from 'three';
import { Batch } from '../engine/batch.js';
import { inkMat, cloneInk } from '../engine/ink.js';
import { mkCanvas, toTex, paintLandscape, paintCalligraphy } from '../engine/textures.js';
import { DECOR } from './data.js';
import * as P from '../world/parts.js';
import { clamp } from '../util.js';

const W_ = P.W_;
// 占地半径 r 与高度 h（用于避让与拾取）
export const DIM = {
  orchid: { r: 0.2, h: 0.5 }, blossom: { r: 0.2, h: 0.8 }, bonsai: { r: 0.26, h: 0.5 }, rock: { r: 0.5, h: 1.5 },
  teaset: { r: 0.3, h: 0.2 }, meiping: { r: 0.16, h: 0.7 }, basin: { r: 0.22, h: 0.14 }, bigvase: { r: 0.28, h: 1.1 },
  callig: { r: 0.36, h: 1.3 }, censer: { r: 0.14, h: 0.7 }, landscape: { r: 0.42, h: 1.6 }, guqin: { r: 0.75, h: 0.75 }, screen: { r: 1.1, h: 1.9 },
};

function lathe(b, prof, color, seg = 10, id = b.nextId(), mat = 'flat') {
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
    b.cyl(mat, 0, y0, 0, r1, r0, y1 - y0, seg, { color, id });
  }
}

// 画心图集：立轴山水 / 行书 / 屏风长卷
const ART = {};
function artTexture() {
  const c = mkCanvas(2048, 1024), ctx = c.getContext('2d');
  const mount = (x, w, h, ix, iy, iw, ih) => {
    ctx.fillStyle = '#dde3e2';
    ctx.fillRect(x, 0, w, h);
    ctx.fillStyle = '#c3cdd0';
    ctx.fillRect(x, 0, w, iy - 26);
    ctx.fillRect(x, iy + ih + 26, w, h - (iy + ih + 26));
    ctx.strokeStyle = 'rgba(40,32,26,0.8)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + ix - 2, iy - 2, iw + 4, ih + 4);
  };
  mount(0, 512, 1024, 56, 150, 400, 700);
  paintLandscape(ctx, 56, 150, 400, 700, 5);
  mount(512, 512, 1024, 86, 140, 340, 740);
  paintCalligraphy(ctx, 512 + 86, 140, 340, 740, '清风明月本无价近水遥山皆有情', { cols: 2 });
  paintLandscape(ctx, 1024, 0, 1024, 512, 12);
  const r = (x, y, w, h) => ({ u0: x / 2048, u1: (x + w) / 2048, v0: 1 - (y + h) / 1024, v1: 1 - y / 1024 });
  ART.landscape = r(0, 0, 512, 1024);
  ART.callig = r(512, 0, 512, 1024);
  ART.screen = [0, 1, 2].map((i) => r(1024 + (i * 1024) / 3, 0, 1024 / 3, 512));
  return toTex(c, { repeat: false, aniso: 8 });
}

function hanging(b, rect, w, h) {
  const id = b.nextId();
  b.quad('art', [-w / 2, -h / 2, 0.02], [w / 2, -h / 2, 0.02], [w / 2, h / 2, 0.02], [-w / 2, h / 2, 0.02], { rect, id, lw: 0.8 });
  b.box('wood', 0, h / 2 + 0.012, 0.02, w + 0.02, 0.025, 0.02, { color: W_.dark, id });
  b.rod('wood', [-w / 2 - 0.05, -h / 2, 0.03], [w / 2 + 0.05, -h / 2, 0.03], 0.022, 0.022, 6, { color: W_.deep, id });
  for (const sx of [-1, 1]) b.rod('flat', [sx * w * 0.42, h / 2 + 0.02, 0.02], [0, h / 2 + 0.2, 0.01], 0.004, 0.004, 3, { color: [0.4, 0.34, 0.3], lw: 0.5, id });
}

const BUILD = {
  orchid(b) {
    lathe(b, [[0.07, 0], [0.1, 0.12], [0.11, 0.15]], [0.64, 0.52, 0.48]);
    const id = b.nextId();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + (i % 2) * 0.3, r = 0.2 + (i % 3) * 0.06, hgt = 0.26 + (i % 4) * 0.05;
      const mid = [Math.cos(a) * r * 0.5, 0.15 + hgt, Math.sin(a) * r * 0.5];
      b.rod('flat', [0, 0.14, 0], mid, 0.012, 0.01, 3, { color: [0.5, 0.68, 0.52], id, lw: 0.6 });
      b.rod('flat', mid, [Math.cos(a) * r, 0.15 + hgt * 0.72, Math.sin(a) * r], 0.01, 0.003, 3, { color: [0.5, 0.68, 0.52], id, lw: 0.6 });
    }
    for (const [x, y, z] of [[0.03, 0.4, 0.02], [-0.04, 0.34, 0.05], [0.05, 0.3, -0.04]]) {
      b.rod('flat', [0, 0.14, 0], [x, y, z], 0.005, 0.004, 3, { color: [0.6, 0.72, 0.5], id, lw: 0.5 });
      b.sphere('flat', x, y + 0.012, z, 0.03, 0.02, 0.03, { color: [0.93, 0.93, 0.74], ws: 6, hs: 5, lw: 0.6 });
    }
  },
  blossom(b) {
    lathe(b, [[0.045, 0], [0.075, 0.08], [0.062, 0.2], [0.03, 0.27], [0.042, 0.3]], [0.95, 0.95, 0.93]);
    const id = b.nextId();
    const twig = (p, q, r) => b.rod('flat', p, q, r, r * 0.6, 4, { color: [0.34, 0.28, 0.25], id, lw: 0.7 });
    const tips = [[0.12, 0.72, 0.03], [-0.14, 0.6, -0.05], [0.02, 0.82, -0.08], [0.2, 0.52, 0.1], [-0.05, 0.68, 0.12]];
    const mid = [0.02, 0.46, 0];
    twig([0, 0.28, 0], mid, 0.012);
    for (const t of tips) twig(mid, t, 0.008);
    let k = 0;
    for (const t of tips)
      for (let i = 0; i < 4; i++) {
        const f = 0.45 + i * 0.18;
        const x = mid[0] + (t[0] - mid[0]) * f, y = mid[1] + (t[1] - mid[1]) * f, z = mid[2] + (t[2] - mid[2]) * f;
        b.sphere('flat', x + ((k % 3) - 1) * 0.02, y + 0.012, z + ((k % 2) - 0.5) * 0.03, 0.026, 0.024, 0.026, { color: k % 3 ? [0.96, 0.76, 0.74] : [0.98, 0.9, 0.88], ws: 6, hs: 5, lw: 0.55 });
        k++;
      }
  },
  bonsai(b) {
    const id = b.nextId();
    b.box('flat', 0, 0.035, 0, 0.42, 0.07, 0.26, { color: [0.62, 0.52, 0.47], id });
    b.box('flat', 0, 0.075, 0, 0.38, 0.012, 0.22, { color: [0.5, 0.56, 0.44], id, lw: 0.5 });
    const tid = b.nextId();
    const pts = [[-0.08, 0.07, 0], [-0.03, 0.2, 0.02], [0.07, 0.28, -0.01], [0.04, 0.4, 0.02]];
    for (let i = 0; i < pts.length - 1; i++) b.rod('bark', pts[i], pts[i + 1], 0.028 - i * 0.006, 0.022 - i * 0.006, 5, { id: tid });
    b.rod('bark', pts[1], [-0.16, 0.26, 0.03], 0.012, 0.008, 4, { id: tid });
    for (const [x, y, z, r] of [[0.05, 0.44, 0.02, 0.13], [-0.17, 0.29, 0.03, 0.1], [0.13, 0.32, -0.02, 0.09], [-0.02, 0.36, -0.05, 0.08]])
      b.sphere('flat', x, y, z, r, r * 0.42, r * 0.85, { color: [0.5, 0.67, 0.52], lw: 0.7 });
    b.sphere('stone', 0.12, 0.1, 0.05, 0.05, 0.04, 0.04, {});
  },
  rock(b) {
    b.box('stone', 0, 0.07, 0, 0.8, 0.14, 0.56, {});
    const c = [0.82, 0.84, 0.84], d = [0.42, 0.45, 0.47];
    const blobs = [[0, 0.36, 0, 0.3, 0.26, 0.22], [0.12, 0.66, 0.02, 0.24, 0.24, 0.18], [-0.1, 0.84, -0.02, 0.2, 0.2, 0.17], [0.08, 1.08, 0, 0.22, 0.2, 0.16], [-0.04, 1.32, 0.02, 0.15, 0.2, 0.13], [0.24, 0.42, 0.04, 0.16, 0.2, 0.14], [-0.22, 0.5, -0.03, 0.14, 0.22, 0.13]];
    for (const [x, y, z, rx, ry, rz] of blobs) b.sphere('flat', x, y, z, rx, ry, rz, { color: c, ws: 9, hs: 7 });
    for (const [x, y, z, r] of [[0.03, 0.5, 0.2, 0.07], [0.12, 0.92, 0.15, 0.06], [-0.1, 0.72, 0.16, 0.05], [0.04, 1.2, 0.14, 0.05], [-0.16, 0.42, 0.12, 0.045]])
      b.sphere('flat', x, y, z, r, r * 1.3, 0.03, { color: d, ws: 7, hs: 5, lw: 0.8 });
  },
  teaset(b) {
    const id = b.nextId(), wh = [0.96, 0.96, 0.94];
    b.box('wood', 0, 0.012, 0, 0.54, 0.024, 0.34, { color: W_.dark, id });
    b.place(-0.1, 0.024, 0, 0, () => {
      lathe(b, [[0.05, 0], [0.078, 0.05], [0.072, 0.11], [0.034, 0.14], [0.012, 0.165]], wh, 10);
      b.rod('flat', [0.07, 0.07, 0], [0.14, 0.12, 0], 0.014, 0.008, 5, { color: wh });
      b.rod('flat', [-0.07, 0.11, 0], [-0.12, 0.07, 0], 0.008, 0.008, 4, { color: wh });
      b.rod('flat', [-0.12, 0.07, 0], [-0.075, 0.04, 0], 0.008, 0.008, 4, { color: wh });
    });
    for (const [x, z] of [[0.12, -0.09], [0.2, 0.0], [0.12, 0.09], [0.04, 0.11]]) b.cyl('flat', x, 0.024, z, 0.032, 0.02, 0.036, 8, { color: wh, lw: 0.7 });
  },
  meiping(b) {
    b.push(new THREE.Matrix4().makeScale(1.25, 1.25, 1.25));
    lathe(b, [[0.055, 0], [0.078, 0.05], [0.118, 0.2], [0.108, 0.3], [0.042, 0.37], [0.03, 0.4], [0.05, 0.43]], [0.7, 0.84, 0.82]);
    const id = b.nextId();
    b.rod('flat', [0, 0.42, 0], [0.05, 0.6, 0.02], 0.007, 0.005, 4, { color: [0.34, 0.28, 0.25], id, lw: 0.6 });
    b.rod('flat', [0.05, 0.6, 0.02], [-0.03, 0.72, 0], 0.005, 0.003, 4, { color: [0.34, 0.28, 0.25], id, lw: 0.6 });
    for (const [x, y, z] of [[0.05, 0.6, 0.02], [0.0, 0.67, 0.01], [-0.03, 0.73, 0], [0.03, 0.53, 0.015]]) b.sphere('flat', x, y, z, 0.02, 0.02, 0.02, { color: [0.86, 0.36, 0.36], ws: 6, hs: 5, lw: 0.5 });
    b.pop();
  },
  basin(b) {
    const id = b.nextId();
    lathe(b, [[0.12, 0.025], [0.2, 0.07], [0.215, 0.13]], [0.66, 0.6, 0.8], 12, id);
    b.cyl('flat', 0, 0.118, 0, 0.2, 0.2, 0.012, 12, { color: [0.72, 0.84, 0.86], id, lw: 0.5 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.cyl('flat', Math.cos(a) * 0.11, 0, Math.sin(a) * 0.11, 0.025, 0.02, 0.03, 6, { color: [0.6, 0.54, 0.74], id });
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      b.sphere('flat', Math.cos(a) * 0.212, 0.1, Math.sin(a) * 0.212, 0.012, 0.012, 0.012, { color: [0.74, 0.68, 0.86], id, ws: 5, hs: 4, lw: 0.4 });
    }
  },
  bigvase(b) {
    const id = b.nextId();
    b.box('wood', 0, 0.05, 0, 0.4, 0.1, 0.4, { color: W_.red, id });
    b.box('wood', 0, 0.11, 0, 0.32, 0.03, 0.32, { color: W_.red, id });
    lathe(b, [[0.09, 0.125], [0.14, 0.24], [0.2, 0.5], [0.18, 0.68], [0.075, 0.84], [0.068, 0.97], [0.11, 1.03]], [0.66, 0.83, 0.75], 12);
  },
  censer(b) {
    const br = [0.6, 0.55, 0.42];
    const id = b.nextId();
    lathe(b, [[0.085, 0], [0.1, 0.015], [0.03, 0.03], [0.026, 0.09], [0.088, 0.13], [0.092, 0.17]], br, 10, id);
    b.cyl('flat', 0, 0.17, 0, 0.012, 0.088, 0.13, 10, { color: br.map((c) => c * 0.92), id });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      b.cyl('flat', Math.cos(a) * 0.05, 0.19, Math.sin(a) * 0.05, 0.004, 0.022, 0.06, 5, { color: br, id, lw: 0.6 });
    }
    // 一缕烟
    let p = [0, 0.3, 0];
    for (let i = 0; i < 7; i++) {
      const q = [Math.sin(i * 1.3) * 0.035 * (1 + i * 0.3), 0.3 + (i + 1) * 0.062, Math.cos(i * 1.7) * 0.025 * (1 + i * 0.3)];
      b.rod('flat', p, q, 0.006 + i * 0.002, 0.008 + i * 0.002, 4, { color: [0.86, 0.87, 0.87], lw: 0.25, id: 0.5 });
      p = q;
    }
  },
  guqin(b) {
    P.table(b, 0, 0, 1.38, 0.44, 0.62, W_.red);
    const id = b.nextId(), lac = [0.36, 0.27, 0.25];
    b.box('flat', 0, 0.685, 0, 1.2, 0.05, 0.19, { color: lac, id });
    b.box('flat', -0.52, 0.685, 0, 0.18, 0.054, 0.16, { color: lac, id });
    b.box('flat', 0.5, 0.715, 0, 0.02, 0.014, 0.17, { color: [0.2, 0.17, 0.16], id, lw: 0.5 });
    for (let i = 0; i < 7; i++) b.box('flat', 0, 0.714, -0.066 + i * 0.022, 1.1, 0.003, 0.003, { color: [0.92, 0.9, 0.82], id, lw: 0.25 });
    for (let i = 0; i < 13; i++) b.box('flat', -0.5 + i * 0.082, 0.712, -0.084, 0.012, 0.002, 0.012, { color: [0.95, 0.93, 0.85], id, lw: 0.2 });
    b.place(0, 0, 0.55, 0, () => {
      const sid = b.nextId();
      b.box('wood', 0, 0.4, 0, 0.4, 0.05, 0.3, { color: W_.red, id: sid });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('wood', sx * 0.17, 0.2, sz * 0.12, 0.04, 0.4, 0.04, { color: W_.red, id: sid });
    });
  },
  screen(b) {
    const pw = 0.82, ph = 1.72, base = 0.12, ang = 0.42;
    const panel = (cx, cz, ry, i) =>
      b.place(cx, 0, cz, ry, () => {
        const id = b.nextId();
        b.box('wood', 0, base + ph / 2, 0, pw, ph, 0.04, { color: W_.red, id });
        b.quad('art', [-pw / 2 + 0.06, base + 0.34, 0.025], [pw / 2 - 0.06, base + 0.34, 0.025], [pw / 2 - 0.06, base + ph - 0.08, 0.025], [-pw / 2 + 0.06, base + ph - 0.08, 0.025], { rect: ART.screen[i], id, lw: 0.8 });
        b.box('wood', 0, base + 0.2, 0.022, pw - 0.14, 0.18, 0.012, { color: W_.dark, id, lw: 0.6 });
        for (const sx of [-1, 1]) b.box('wood', sx * (pw / 2 - 0.08), base / 2, 0, 0.1, base, 0.26, { color: W_.red, id });
      });
    panel(0, 0, 0, 1);
    panel(-pw / 2 - (Math.cos(ang) * pw) / 2, (Math.sin(ang) * pw) / 2, ang, 0);
    panel(pw / 2 + (Math.cos(ang) * pw) / 2, (Math.sin(ang) * pw) / 2, -ang, 2);
  },
  landscape: (b) => hanging(b, ART.landscape, 0.78, 1.56),
  callig: (b) => hanging(b, ART.callig, 0.62, 1.24),
};

const KINDS = { table: { top: true, floor: true }, floor: { floor: true }, wall: { wall: true } };
const _o = new THREE.Vector3(), _d = new THREE.Vector3();

export class DecorSystem {
  constructor(scene, mats, home) {
    this.scene = scene;
    this.home = home;
    this.mats = { ...mats, art: inkMat({ map: artTexture(), side: THREE.DoubleSide, wash: 0.05, shade: 0.04 }) };
    this.items = new Map(); // uid → { group, rec }
    this.ghost = null;
    this.ghostId = null;
    this.rot = 0;
    this.aimHit = null;
    this.valid = false;
  }
  make(id, ghost = false) {
    const b = new Batch();
    BUILD[id](b);
    const g = new THREE.Group();
    b.build(this.mats, g);
    if (ghost)
      g.traverse((m) => {
        if (m.isMesh) {
          m.material = cloneInk(m.material);
          m.material.uniforms.uGhost.value = 1;
        }
      });
    return g;
  }
  // 依据存档重建已摆放的陈设
  sync(list) {
    const seen = new Set();
    for (const rec of list) {
      if (!rec.placed) continue;
      seen.add(rec.uid);
      let it = this.items.get(rec.uid);
      if (!it) {
        it = { group: this.make(rec.id), rec };
        this.scene.add(it.group);
        this.items.set(rec.uid, it);
      }
      it.rec = rec;
      it.group.position.set(rec.placed.x, rec.placed.y, rec.placed.z);
      it.group.rotation.y = rec.placed.ry;
    }
    for (const [uid, it] of this.items)
      if (!seen.has(uid)) {
        this.scene.remove(it.group);
        this.items.delete(uid);
      }
  }
  setGhost(id) {
    this.clearGhost();
    if (!id) return;
    this.ghost = this.make(id, true);
    this.ghostId = id;
    this.ghost.visible = false;
    this.scene.add(this.ghost);
  }
  clearGhost() {
    if (this.ghost) this.scene.remove(this.ghost);
    this.ghost = null;
    this.ghostId = null;
    this.aimHit = null;
  }
  _cast(camera, kinds) {
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    let best = null;
    for (const s of this.home.surfaces) {
      if (s.kind === 'wall') {
        if (!kinds.wall) continue;
        const oc = s.axis === 'z' ? _o.z : _o.x, dc = s.axis === 'z' ? _d.z : _d.x;
        if (dc * s.n >= -1e-4) continue;
        const t = (s.pos - oc) / dc;
        if (t <= 0.2 || t > 8) continue;
        const a = s.axis === 'z' ? _o.x + _d.x * t : _o.z + _d.z * t, y = _o.y + _d.y * t;
        if (a < s.a0 || a > s.a1 || y < s.y0 - 0.9 || y > s.y1 + 0.9) continue;
        if (!best || t < best.t) best = { t, s, x: s.axis === 'z' ? a : s.pos, z: s.axis === 'z' ? s.pos : a, y };
      } else {
        if (!kinds[s.kind]) continue;
        if (_d.y >= -1e-4) continue;
        const t = (s.y - _o.y) / _d.y;
        if (t <= 0.2 || t > 8) continue;
        const x = _o.x + _d.x * t, z = _o.z + _d.z * t;
        if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
        if (!best || t < best.t) best = { t, s, x, y: s.y, z };
      }
    }
    return best;
  }
  // 每帧：把虚影对到准星所指之处
  aim(camera, yaw) {
    if (!this.ghost) return;
    const def = DECOR[this.ghostId], dim = DIM[this.ghostId];
    const hit = this._cast(camera, KINDS[def.kind]);
    this.aimHit = null;
    this.valid = false;
    if (!hit) {
      this.ghost.visible = false;
      return;
    }
    const s = hit.s;
    let ry, y = hit.y;
    if (s.kind === 'wall') {
      ry = s.axis === 'z' ? (s.n > 0 ? 0 : Math.PI) : s.n > 0 ? Math.PI / 2 : -Math.PI / 2;
      y = clamp(y, s.y0 + dim.h / 2 - 0.35, s.y1 - dim.h / 2 + 0.25);
      if (s.axis === 'z') hit.x = clamp(hit.x, s.a0 + dim.r, s.a1 - dim.r);
      else hit.z = clamp(hit.z, s.a0 + dim.r, s.a1 - dim.r);
    } else ry = yaw + this.rot;
    let ok = true;
    // 与已有陈设保持间距
    for (const it of this.items.values()) {
      const p = it.rec.placed, od = DIM[it.rec.id];
      const wallA = DECOR[it.rec.id].kind === 'wall', wallB = s.kind === 'wall';
      if (wallA !== wallB) continue;
      const dist = Math.hypot(p.x - hit.x, p.z - hit.z);
      if (wallB ? dist < od.r + dim.r && Math.abs(p.y - y) < (od.h + dim.h) / 2 : dist < (od.r + dim.r) * 0.9 && Math.abs(p.y - y) < 0.3) ok = false;
    }
    // 落地之物不可穿案而过
    if (s.kind === 'floor') {
      for (const t of this.home.surfaces) {
        if (t.kind !== 'top') continue;
        if (hit.x > t.x0 - dim.r && hit.x < t.x1 + dim.r && hit.z > t.z0 - dim.r && hit.z < t.z1 + dim.r) ok = false;
      }
    } else if (s.kind === 'top') {
      if (hit.x - dim.r * 0.6 < s.x0 || hit.x + dim.r * 0.6 > s.x1 || hit.z - dim.r * 0.5 < s.z0 - 0.05 || hit.z + dim.r * 0.5 > s.z1 + 0.05) ok = false;
    }
    this.ghost.visible = true;
    this.ghost.position.set(hit.x, y, hit.z);
    this.ghost.rotation.y = ry;
    const gv = ok ? 1 : 2;
    this.ghost.traverse((m) => {
      if (m.isMesh) m.material.uniforms.uGhost.value = gv;
    });
    this.valid = ok;
    this.aimHit = { x: hit.x, y, z: hit.z, ry };
  }
  // 准星所指的已摆放陈设
  pick(camera) {
    camera.getWorldPosition(_o);
    camera.getWorldDirection(_d);
    let best = null, bt = 7;
    for (const it of this.items.values()) {
      const p = it.rec.placed, dim = DIM[it.rec.id], wall = DECOR[it.rec.id].kind === 'wall';
      const cx = p.x - _o.x, cy = p.y + (wall ? 0 : dim.h / 2) - _o.y, cz = p.z - _o.z;
      const t = cx * _d.x + cy * _d.y + cz * _d.z;
      if (t < 0.3 || t > bt) continue;
      const dx = cx - _d.x * t, dy = cy - _d.y * t, dz = cz - _d.z * t;
      const rad = Math.max(dim.r, dim.h / 2) * 0.85 + 0.08;
      if (dx * dx + dy * dy + dz * dz < rad * rad) {
        bt = t;
        best = it;
      }
    }
    return best;
  }
}

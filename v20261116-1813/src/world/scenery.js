// 景致与陈设：把放大后的天地填满，再添几处“景”——
// 风景的：卷首春郊（杏花、菜花、溪亭、纸鸢）、隋堤烟柳（汴河南岸的柳堤桃岸）、水边芦苇白鹭、远处的寺塔；
// 人文的：牧童指路、秋千、清明上坟、寺院钟亭香炉、扳罾打鱼、街上的灯彩与三三两两的活计。
// 原画里没有、此番入画所添的，都放在主街走向之外，不动原画的布局。
import { RNG } from '../util.js';
import { RV, riverSD, CHANNELS } from './river.js';
import { ROAD_HW, EAST_Z, BRIDGE, PLANK, DYKE, onRoad, colliders, register } from './layout.js';
import * as P from './parts.js';
import { column } from './timber.js';
import { buildObject } from '../engine/batch.js';
import { figure, randomLook } from './figures.js';
import { FACE } from '../engine/textures.js';
import { meadow, vnoise } from './cover.js';
import { addBoat, rider } from './sections.js';

const PI = Math.PI;
const WHITE = [1.14, 1.14, 1.1];
const RAPE = [1.3, 1.14, 0.34], PINK = [1.22, 0.86, 0.9], PALE = [1.2, 1.18, 1.1];
const MONK = { robe: [0.84, 0.7, 0.5], trim: [0.5, 0.4, 0.3], face: FACE.man3, hat: 'none', arms: 'tuck', prop: null };
// 岸坡上某处的地面高（水线以下顺坡而下）
const bankY = (x, z) => {
  const sd = riverSD(x, z);
  return sd < 0 ? (RV.WATER_Y - 0.4) * Math.min(1, -sd / 1.25) : 0;
};

// ───────────────────────── 小件 ─────────────────────────
// 亭：四柱，攒尖或歇山顶，三面坐凳；上得去
function pavilion(c, x, z, rot, o = {}) {
  const { b, W_ } = c, w = o.w || 4.4, d = o.d || w, base = o.base ?? 0.3, h = o.h || 2.9, hw = w / 2, hd = d / 2, col = o.color || W_.red;
  c.at(x, z, rot, () => {
    b.box('stone', 0, base / 2, 0, w + 1.1, base, d + 1.1, {});
    const id = b.nextId();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) column(b, sx * hw, base, sz * hd, h, 0.13, col, id);
    for (const sz of [-1, 1]) b.box('wood', 0, base + h - 0.16, sz * hd, w + 0.3, 0.26, 0.18, { color: col, id });
    for (const sx of [-1, 1]) b.box('wood', sx * hw, base + h - 0.16, 0, 0.18, 0.26, d + 0.3, { color: col, id });
    P.roof(b, { hw: hw + 0.2, hd: hd + 0.2, y: base + h, hip: 1, pitch: o.pitch || 0.72, oe: 1.0, lift: 0.3, mat: o.thatch ? 'thatch' : 'tile', ridge: Math.abs(w - d) > 0.5 });
    // 坐凳：背面与两侧
    const sid = b.nextId(), so = { color: W_.wood, id: sid };
    b.box('wood', 0, base + 0.44, -hd + 0.06, w - 0.3, 0.07, 0.36, so);
    for (const sx of [-1, 1]) b.box('wood', sx * (hw - 0.06), base + 0.44, 0.1, 0.36, 0.07, d - 0.5, so);
    for (const sx of [-1, 0, 1]) b.box('wood', sx * (hw - 0.3), base + 0.22, -hd + 0.06, 0.08, 0.44, 0.3, so);
    if (o.inside) o.inside(base);
  });
  const solids = [[-hw + 0.15, -hd - 0.12, hw - 0.15, -hd + 0.26, 0, base + 0.6]];
  for (const sx of [-1, 1]) {
    solids.push([sx * hw - 0.24, -hd + 0.2, sx * hw + 0.24, hd - 0.3, 0, base + 0.6]);
    for (const sz of [-1, 1]) solids.push([sx * hw - 0.16, sz * hd - 0.16, sx * hw + 0.16, sz * hd + 0.16, 0, base + h]);
  }
  register({ solids, decks: [[-hw - 0.55, -hd - 0.55, hw + 0.55, hd + 0.55, base]] }, x, z, rot);
  return base;
}
// 白鹭：立在浅水里
function egret(b) {
  const id = b.nextId(), o = { color: WHITE, id, lw: 0.5 };
  for (const sz of [-0.03, 0.03]) b.rod('flat', [0.02, -0.25, sz], [0.0, 0.44, sz], 0.008, 0.01, 4, { color: [0.3, 0.3, 0.28], lw: 0.4 });
  b.sphere('flat', 0, 0.53, 0, 0.2, 0.1, 0.085, { ...o, ws: 8, hs: 6 });
  b.tube('flat', [[0.13, 0.56, 0, 0.04], [0.22, 0.7, 0, 0.024], [0.17, 0.85, 0, 0.02], [0.23, 0.95, 0, 0.028]], { ...o, seg: 5 });
  b.sphere('flat', 0.25, 0.965, 0, 0.05, 0.04, 0.036, { ...o, ws: 6, hs: 5 });
  b.rod('flat', [0.28, 0.96, 0], [0.45, 0.93, 0], 0.013, 0.003, 4, { color: [0.95, 0.8, 0.42], lw: 0.4 });
  b.beam('flat', [-0.14, 0.55, 0], [-0.34, 0.47, 0], 0.07, 0.03, o);
}
// 一群鸭：在水面上慢悠悠兜着圈
function ducks(c, x, z, n = 5, R = 2.2) {
  const { rng } = c;
  const grp = buildObject(c.mats, (bb) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 6.283 + rng.f(-0.3, 0.3), r = R * rng.f(0.55, 1.1), wh = rng.chance(0.6), col = wh ? WHITE : [0.62, 0.5, 0.38], id = bb.nextId();
      bb.place(Math.cos(a) * r, 0, -Math.sin(a) * r, a + PI / 2 + rng.f(-0.3, 0.3), () => {
        bb.sphere('flat', 0, 0.07, 0, 0.21, 0.11, 0.13, { color: col, id, ws: 8, hs: 6, lw: 0.5 });
        bb.rod('flat', [0.13, 0.1, 0], [0.19, 0.25, 0], 0.045, 0.04, 5, { color: col, id, lw: 0.5 });
        bb.sphere('flat', 0.21, 0.28, 0, 0.065, 0.06, 0.055, { color: wh ? WHITE : [0.3, 0.42, 0.36], id, ws: 6, hs: 5, lw: 0.5 });
        bb.box('flat', 0.29, 0.27, 0, 0.08, 0.022, 0.05, { color: [0.98, 0.72, 0.36], lw: 0.4 });
        bb.beam('flat', [-0.16, 0.12, 0], [-0.27, 0.19, 0], 0.09, 0.03, { color: col, id, lw: 0.5 });
      });
    }
  });
  grp.position.set(x, RV.WATER_Y - 0.01, z);
  c.scene.add(grp);
  const ph = rng.f(6.28), w = rng.f(0.035, 0.06) * rng.sign();
  c.dynamic.push((t) => {
    grp.rotation.y = ph + t * w;
    grp.position.y = RV.WATER_Y - 0.01 + Math.sin(t * 1.3 + ph) * 0.012;
  });
}
// 纸鸢：线头在放风筝的孩子手里，鸢在高处随风摆
function kite(c, x, z, dir, L, H, cols) {
  const { rng } = c;
  const grp = buildObject(c.mats, (bb) => {
    const T = [Math.cos(dir) * L, H, -Math.sin(dir) * L], len = Math.hypot(L, H);
    const s = [T[0] / len, T[1] / len, T[2] / len], u = [-Math.sin(dir), 0, -Math.cos(dir)];
    const v = [-(u[1] * s[2] - u[2] * s[1]), -(u[2] * s[0] - u[0] * s[2]), -(u[0] * s[1] - u[1] * s[0])]; // 鸢面上朝上的方向
    const at = (a, bq) => [T[0] + u[0] * a + v[0] * bq, T[1] + u[1] * a + v[1] * bq, T[2] + u[2] * a + v[2] * bq];
    // 线：略带弧度
    let prev = [0, 0, 0];
    for (let k = 1; k <= 6; k++) {
      const t = k / 6, p = [T[0] * t, T[1] * t - 2.2 * 4 * t * (1 - t) * 0.25, T[2] * t];
      bb.rod('flat', prev, p, 0.008, 0.008, 3, { color: [0.82, 0.8, 0.74], lw: 0.3 });
      prev = p;
    }
    const top = at(0, 0.85), bot = at(0, -1.15), l = at(-0.8, 0.1), r = at(0.8, 0.1);
    bb.raw('cloth', [...top, ...l, ...bot], null, [0, 1, 2], { color: cols[0], double: true, lw: 0.6 });
    bb.raw('cloth', [...top, ...bot, ...r], null, [0, 1, 2], { color: cols[1], double: true, lw: 0.6 });
    bb.rod('wood', top, bot, 0.012, 0.012, 3, { color: [0.5, 0.4, 0.3], lw: 0.3 });
    bb.rod('wood', l, r, 0.012, 0.012, 3, { color: [0.5, 0.4, 0.3], lw: 0.3 });
    // 两条长尾
    for (const sg of [-1, 1]) {
      const a0 = at(sg * 0.1, -1.1), a1 = at(sg * 0.1 + 0.14, -1.1), e = [a0[0] + s[0] * 1.4 + sg * 0.3, a0[1] - 3.4, a0[2] + s[2] * 1.4];
      bb.quad('flag', a0, a1, [e[0] + 0.14, e[1], e[2]], e, { color: cols[2] || cols[0], windV: [0, 0, 1, 1], double: true, lw: 0.4 });
    }
  });
  grp.position.set(x, 1.3, z);
  c.scene.add(grp);
  const ph = rng.f(6.28);
  c.dynamic.push((t) => {
    grp.rotation.y = Math.sin(t * 0.31 + ph) * 0.13 + Math.sin(t * 0.83 + ph * 2) * 0.03;
    grp.rotation.z = Math.sin(t * 0.47 + ph) * 0.03;
  });
}
// 秋千：清明的旧俗。架子是静物，荡着的座与人单成一组
function swing(c, x, z, rot) {
  const { b, rng, W_ } = c;
  c.at(x, z, rot, () => {
    const id = b.nextId();
    for (const sx of [-1.3, 1.3]) for (const sz of [-1.0, 1.0]) b.rod('wood', [sx, 0, sz], [sx * 0.96, 3.2, 0], 0.065, 0.05, 6, { color: W_.wood, id });
    b.rod('wood', [-1.55, 3.16, 0], [1.55, 3.16, 0], 0.06, 0.06, 6, { color: W_.dark, id });
    for (const sx of [-1.5, 1.5]) b.quad('flag', [sx, 3.1, 0], [sx + 0.12, 3.1, 0], [sx + 0.12, 2.2, 0.1], [sx, 2.2, 0.1], { color: [0.9, 0.42, 0.36], windV: [0, 0, 0.8, 0.8], double: true, lw: 0.4 });
  });
  for (const sx of [-1.3, 1.3]) colliders.add(x + sx - 0.2, z - 1.1, x + sx + 0.2, z + 1.1, -1e9, 3.4);
  const grp = buildObject(c.mats, (bb) => {
    for (const sx of [-0.3, 0.3]) bb.rod('flat', [sx, 0, 0], [sx, -2.55, 0], 0.012, 0.012, 3, { color: [0.5, 0.42, 0.32], lw: 0.4 });
    bb.box('wood', 0, -2.57, 0, 0.74, 0.05, 0.28, { color: W_.wood });
    bb.place(0, -3.0, -0.04, 0, () => figure(bb, { ...randomLook(rng, 'woman'), robe: [0.96, 0.68, 0.66], pose: 'sit', prop: null, arms: 'reach' }));
  });
  grp.rotation.order = 'YXZ';
  grp.position.set(x, 3.16, z);
  grp.rotation.y = rot;
  c.scene.add(grp);
  c.dynamic.push((t) => {
    grp.rotation.x = Math.sin(t * 1.95) * 0.42;
  });
}
// 一方油菜（或菜畦）：地上先记一块田，再一垄一垄种上
function cropField(c, x, z, w, d, col, o = {}) {
  const { b, rng } = c, rows = Math.floor(d / (o.row || 1.15));
  c.MAP.fields.push({ x, z, w: w + 1.5, d: d + 1.5, rot: 0 });
  colliders.addLot(x - w / 2, z - d / 2, x + w / 2, z + d / 2);
  for (let j = 0; j < rows; j++) {
    const pz = z - d / 2 + ((j + 0.5) * d) / rows;
    for (let px = x - w / 2 + 0.5; px < x + w / 2 - 0.3; px += rng.f(0.75, 1.05)) {
      if (colliders.hit(px, pz, 0.5, 0)) continue;
      c.chunk(px);
      b.place(px, 0, pz + rng.f(-0.12, 0.12), 0, () => (col ? P.flowers(b, rng, [col[0] * rng.f(0.92, 1.05), col[1] * rng.f(0.92, 1.05), col[2]], o.s || rng.f(1, 1.3), 'crop') : P.grassTuft(b, rng, rng.f(0.7, 0.95), rng.f(0.86, 0.98))));
    }
  }
}
// 一个人坐在矮凳、石头上
function sitter(c, x, z, yaw, look, seat = true) {
  const { b, W_ } = c;
  if (seat) c.at(x, z, yaw, () => b.box('wood', 0, 0.2, 0, 0.42, 0.4, 0.34, { color: W_.wood }));
  c.person(x, z, yaw, { ...look, pose: 'sit', prop: null, arms: look.arms || 'tuck' });
}

// ───────────────────────── 卷首春郊 ─────────────────────────
function springCountry(c) {
  const { b, rng, W_, atlas } = c;
  // 杏花：溪东一片，村口溪西几株——“牧童遥指杏花村”
  for (const [x, z, s] of [[388, -47.5, 1.6], [394.5, -50, 1.85], [400.5, -47, 1.5], [390, -56.5, 1.75], [397, -58.5, 1.9], [402, -54, 1.5], [386, -63, 1.6], [393.5, -66, 1.8], [400, -67, 1.65],
    [362, -47, 1.6], [367.5, -51, 1.75], [358.5, -33.5, 1.5], [364.5, -31.5, 1.65], [352.5, -40, 1.4], [343, -49.5, 1.5], [334, -62, 1.6], [356, -59, 1.5], [345, -73, 1.7], [322, -55, 1.5]])
    c.treeAt(x, z, 'blossom', s);
  // 界碑、柴垛、路边的篱笆
  c.at(398.6, -42.2, 0.2, () => {
    b.box('stone', 0, 0.2, 0, 0.9, 0.4, 0.5, {});
    b.box('stone', 0, 1.15, 0, 0.62, 1.6, 0.2, { id: b.nextId() });
    const r = atlas.vertical('汴京东郊', { bg: '#d6cfbe', fg: '#3a2a22', border: '#d6cfbe' });
    b.quad('sign', [-0.2, 0.5, 0.11], [0.2, 0.5, 0.11], [0.2, 1.85, 0.11], [-0.2, 1.85, 0.11], { rect: r, lw: 0.4 });
  });
  colliders.add(398.1, -42.5, 399.1, -41.9);
  c.fence([[404, -43.4], [394, -43], [386.5, -42]]);
  c.fence([[404, -32.6], [392, -31.4], [385.4, -30.6]]);
  c.at(383.6, -45.6, 0.3, () => {
    const id = b.nextId();
    for (let k = 0; k < 14; k++) b.rod('wood', [-0.9, 0.12 + (k % 5) * 0.2, -0.5 + Math.floor(k / 5) * 0.4 + (k % 2) * 0.1], [0.9, 0.12 + (k % 5) * 0.2, -0.5 + Math.floor(k / 5) * 0.4], 0.09, 0.08, 5, { color: k % 3 ? W_.wood : W_.pale, id, lw: 0.5 });
  });
  colliders.add(382.6, -46.4, 384.6, -44.8);
  // 溪东路南一方油菜花，西南再一大方
  cropField(c, 394.5, -13, 17, 32, RAPE);
  cropField(c, 322, 22, 28, 22, RAPE);
  // 村南的菜畦，畦边一架桔槔
  cropField(c, 330, -19.5, 17, 13, null, { row: 1.3 });
  c.at(341.4, -15.6, 0.6, () => {
    const id = b.nextId();
    P.well(b);
    b.rod('wood', [1.6, 0, 0], [1.6, 3.3, 0], 0.07, 0.05, 6, { color: W_.dark, id });
    b.rod('wood', [3.5, 2.1, 0], [-0.4, 4.3, 0], 0.05, 0.04, 6, { color: W_.wood, id });
    b.box('stone', 3.4, 2.0, 0, 0.36, 0.36, 0.36, {});
    b.rod('flat', [-0.4, 4.3, 0], [-0.1, 1.4, 0], 0.01, 0.01, 3, { color: [0.5, 0.42, 0.32], lw: 0.4 });
  });
  colliders.add(340.3, -16.8, 343.6, -14.4);
  c.person(339.6, -17.4, 0.8, { ...randomLook(rng, 'labor'), prop: null, arms: 'reach', hat: 'douli', lean: 0.3 });
  c.person(334.4, -22.2, -0.6, { ...randomLook(rng, 'woman'), prop: 'basket' });
  // 牧童骑牛，遥指杏花村；路上问路的行客
  c.at(353.4, -13.6, 2.5, () => {
    P.ox(b);
    b.place(-0.1, 1.14, 0, PI / 2, () => figure(b, { ...randomLook(rng, 'kid'), robe: [0.74, 0.8, 0.82], pose: 'ride', arms: 'hail', hat: 'none' }));
  });
  colliders.add(352.1, -14.9, 354.7, -12.3);
  c.person(350.4, -15.6, 0.95, { robe: [1.04, 1.02, 0.96], trim: [0.5, 0.52, 0.56], face: FACE.scholar, hat: 'douli', prop: 'staff', arms: 'down' });
  c.criers.push({ x: 352, z: -14.6, lines: ['借问酒家何处有？', '喏——前头杏花开处便是。', '清明时节，路上行人多哩。'] });
  // 溪亭：板桥南边，临水一座茅亭
  pavilion(c, 369.4, -24.2, -PI / 2, { thatch: true, color: W_.dark, w: 4.2, base: 0.26, h: 2.7 });
  c.person(367.2, -20.4, 2.2, { ...randomLook(rng, 'scholar'), prop: 'fan', arms: 'chat' });
  // 放纸鸢的孩子
  for (const [x, z, dir, L, H, cols] of [[347, -2.5, 2.6, 16, 24, [[0.92, 0.36, 0.3], [1.1, 1.06, 0.96], [0.92, 0.36, 0.3]]], [338.5, 5.5, 2.2, 22, 33, [[0.5, 0.64, 0.8], [0.96, 0.82, 0.46], [1.1, 1.06, 0.96]]], [356.5, 6.5, 2.9, 12, 17, [[0.96, 0.8, 0.4], [0.9, 0.42, 0.36], [0.6, 0.74, 0.56]]]]) {
    c.person(x - Math.cos(dir) * 0.2, z + Math.sin(dir) * 0.2 + 0.25, dir + PI / 2, { ...randomLook(rng, 'kid'), prop: null, arms: 'hail' });
    kite(c, x, z, dir, L, H, cols);
  }
  c.person(344.6, -0.2, 2.4, { ...randomLook(rng, 'kid'), prop: null, arms: 'hail' });
  c.person(349.6, 1.8, -2.4, { ...randomLook(rng, 'woman'), prop: null, arms: 'tuck' });
  c.criers.push({ x: 346, z: 2, lines: ['飞起来了！飞起来了！', '放线——再放些！', '我的比你的高！'] });
  // 村口的秋千
  swing(c, 331, -45.6, 0);
  c.person(333.9, -44.4, -PI / 2 - 0.3, { ...randomLook(rng, 'kid'), prop: null, arms: 'hail' });
  c.person(328.2, -46.8, PI / 2, { ...randomLook(rng, 'woman'), prop: null, arms: 'tuck' });
  c.criers.push({ x: 331, z: -45.6, lines: ['再高些！再高些！', '该我了，该我了——'] });
  // 清明上坟：小路尽头几座坟，坟头挂纸，一家人在祭扫（那一行轿马便是从这里回城的）
  const mound = (x, z, r, paper) => {
    c.at(x, z, rng.f(6), () => {
      b.sphere('earth', 0, 0.05, 0, r, r * 0.62, r, { color: [0.76, 0.82, 0.58], ws: 10, hs: 6, lw: 0.7 });
      for (let k = 0; k < 7; k++) { const ga = rng.f(6.28), gr = r * rng.f(0.5, 1.0); b.place(Math.cos(ga) * gr, r * 0.62 * Math.sqrt(Math.max(0, 1 - (gr / r) ** 2)) - 0.05, Math.sin(ga) * gr, 0, () => P.grassTuft(b, rng, 0.8, 0.95)); }
      b.box('stone', r + 0.25, 0.4, 0, 0.16, 0.8, 0.5, { id: b.nextId() });
      if (paper) {
        b.rod('wood', [0, r * 0.5, 0], [0.2, r * 0.6 + 1.9, 0], 0.018, 0.012, 4, { color: W_.pale });
        for (let k = 0; k < 3; k++) b.quad('flag', [0.2, r * 0.6 + 1.9 - k * 0.1, 0], [0.34, r * 0.6 + 1.9 - k * 0.1, 0], [0.5 + k * 0.1, r * 0.6 + 0.7, 0.1 * k], [0.36 + k * 0.1, r * 0.6 + 0.7, 0.1 * k], { color: PALE, windV: [0, 0, 1, 1], double: true, lw: 0.3 });
      }
    });
    colliders.add(x - r * 0.8, z - r * 0.8, x + r * 0.8, z + r * 0.8, -1e9, 2);
  };
  mound(326, -103, 2.1, true); mound(332.5, -105.5, 1.7, true); mound(319.5, -105, 1.8, false); mound(337, -100.5, 1.5, true); mound(314, -100, 1.4, false);
  c.at(328.6, -99.2, 0, () => {
    P.table(b, 0, 0, 1.1, 0.6, 0.5);
    for (let i = 0; i < 3; i++) b.cyl('flat', -0.3 + i * 0.3, 0.54, 0, 0.07, 0.05, 0.08, 6, { color: [0.93, 0.92, 0.88], lw: 0.5 });
    P.basket(b, 1.0, 0, 0.2, 1, [0.92, 0.9, 0.84]);
  });
  colliders.add(328, -99.6, 329.2, -98.8);
  c.person(328.5, -97.8, PI, { ...randomLook(rng, 'man'), prop: null, arms: 'tuck', lean: 0.42 });
  c.person(330.2, -97.4, PI + 0.3, { ...randomLook(rng, 'woman'), prop: null, arms: 'tuck', lean: 0.2 });
  c.person(326.6, -97.2, PI - 0.3, { ...randomLook(rng, 'kid'), prop: null });
  c.person(331.8, -95.6, PI + 0.5, { ...randomLook(rng, 'elder') });
  c.treeAt(321.5, -98.5, 'willow', 1.3);
  c.treeAt(335.5, -108.5, 'leaf', 1.4);
  c.criers.push({ x: 328.6, z: -98, lines: ['清明时节，祭扫先茔。', '给太公添把土。', '纸灰飞作白蝴蝶……'] });
  // 溪里一群鸭，浅水里两只白鹭
  ducks(c, 377.6, -22, 5, 1.5);
  for (const [x, z, r] of [[376.2, -10.5, 0.4], [373.6, -2.5, 2.2], [372.2, -1.2, 3.4]]) c.at(x, z, r, () => egret(b), bankY(x, z) + 0.2);
}

// ───────────────────────── 隋堤烟柳：汴河南岸的柳堤 ─────────────────────────
function dyke(c) {
  const { b, rng, W_, atlas } = c;
  // 沿堤：靠水一侧桃柳相间，靠里一侧疏疏几株杂树
  let k = 0;
  for (let i = 0; i < DYKE.length - 1; i++) {
    const [ax, az] = DYKE[i], [bx, bz] = DYKE[i + 1], len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    for (let s = i ? 2 : 6; s < len; s += rng.f(7.6, 9.6), k++) {
      const px = ax + ux * s, pz = az + uz * s;
      // 朝河心的一侧
      let nx = uz, nz = -ux;
      if (riverSD(px + nx * 4, pz + nz * 4) > riverSD(px - nx * 4, pz - nz * 4)) { nx = -nx; nz = -nz; }
      const off = rng.f(3.4, 4.6);
      if (k % 2) c.treeAt(px + nx * off, pz + nz * off, 'blossom', rng.f(1.7, 2.1));
      else c.treeAt(px + nx * off, pz + nz * off, 'willow', rng.f(1.3, 1.6));
      if (k % 3 === 0) c.treeAt(px - nx * rng.f(4.5, 8), pz - nz * rng.f(4.5, 8) + rng.f(-2, 2), rng.pick(['leaf', 'dark', 'blossom']), rng.f(1.2, 1.6));
    }
  }
  // 水榭：伸到岸边的一座亭子，隔河正对码头
  pavilion(c, 96, 43.4, PI, { w: 6.2, d: 4.4, base: 0.42, h: 3.1, pitch: 0.62 });
  c.at(96, 45.9, 0, () => P.plaque(b, atlas, '隋堤烟柳', 0, 3.25, 0, 2.4));
  c.person(94.4, 42.2, PI, { ...randomLook(rng, 'scholar'), prop: 'fan', arms: 'chat' }, 0.42);
  c.person(97.5, 42.0, PI + 0.4, { ...randomLook(rng, 'man'), prop: null, arms: 'back' }, 0.42);
  c.person(99.0, 43.5, -PI / 2, { ...randomLook(rng, 'woman'), pose: 'sit', prop: null, arms: 'tuck' }, 0.42);
  c.criers.push({ x: 96, z: 43, lines: ['你看那船，一条挨着一条。', '好一派春水。', '隋堤烟柳，名不虚传。'] });
  // 扳罾：岸边支起的大网，渔人压竿起网
  c.at(128, 40.4, PI, () => {
    const id = b.nextId(), o = { color: W_.pale, id };
    for (const [sx, sz] of [[-0.7, -0.9], [0.7, -0.9], [0, 0.8]]) b.rod('wood', [sx, 0, sz - 1.4], [0, 2.6, -1.4], 0.05, 0.04, 5, o);
    b.rod('wood', [0, 1.5, -3.6], [0, 4.6, 4.4], 0.06, 0.035, 6, o);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const cx = sx * 2.6, cz = 4.6 + sz * 2.6;
      b.rod('wood', [0, 4.6, 4.4], [cx * 0.6, 3.6, 4.6 + sz * 1.5], 0.025, 0.02, 4, o);
      b.rod('wood', [cx * 0.6, 3.6, 4.6 + sz * 1.5], [cx, 0.5, cz], 0.02, 0.014, 4, o);
    }
    // 网：兜着水的一方
    for (let q = 0; q <= 6; q++) {
      const t = q / 6 - 0.5, sag = -0.5 - 0.55 * (1 - 4 * t * t);
      b.rod('flat', [-2.6, 0.5, 4.6 + t * 5.2], [0, sag, 4.6 + t * 5.2], 0.008, 0.008, 3, { color: [0.6, 0.56, 0.48], lw: 0.3 });
      b.rod('flat', [0, sag, 4.6 + t * 5.2], [2.6, 0.5, 4.6 + t * 5.2], 0.008, 0.008, 3, { color: [0.6, 0.56, 0.48], lw: 0.3 });
      b.rod('flat', [t * 5.2, 0.5, 2.0], [t * 5.2, sag, 4.6], 0.008, 0.008, 3, { color: [0.6, 0.56, 0.48], lw: 0.3 });
      b.rod('flat', [t * 5.2, sag, 4.6], [t * 5.2, 0.5, 7.2], 0.008, 0.008, 3, { color: [0.6, 0.56, 0.48], lw: 0.3 });
    }
    P.basket(b, 1.4, 0, -2.2, 1.1, [0.8, 0.84, 0.86]);
  });
  colliders.add(126.8, 41, 129.2, 43.4);
  c.person(128, 44.4, PI, { ...randomLook(rng, 'labor'), prop: null, arms: 'reach', hat: 'douli', lean: -0.12 });
  c.person(130.6, 42.6, PI - 0.5, { ...randomLook(rng, 'kid'), prop: null });
  // 垂钓的、踏青的
  for (const [x, yaw] of [[64, PI], [171, PI - 0.2], [22, PI + 0.7]]) {
    let z = 60;
    while (riverSD(x, z) > 1.3 && z > -40) z -= 0.25;
    sitter(c, x, z, yaw, { ...randomLook(rng, 'elder'), hat: 'douli', arms: 'reach' });
    c.at(x, z, yaw, () => b.rod('wood', [0.2, 0.9, 0.3], [0.5, 2.3, 3.6], 0.014, 0.006, 4, { color: [0.62, 0.56, 0.36], lw: 0.4 }));
  }
  for (const [x, z, yaw, cls, o] of [[40, 46.2, -PI / 2, 'scholar', { prop: 'fan', arms: 'chat' }], [41.6, 47, PI / 2 + 0.3, 'man', { prop: null, arms: 'back' }], [112, 46.4, PI / 2, 'woman', { prop: 'basket' }], [113.2, 47.5, PI / 2 - 0.2, 'kid', { prop: null }],
    [158, 47.6, -PI / 2, 'elder', {}], [186, 50.4, PI / 2 + 0.2, 'woman', { prop: null }], [187.3, 49.4, PI / 2 + 0.3, 'woman', { prop: 'basket' }], [224, 60.6, -2.2, 'scholar', { prop: null, arms: 'back' }], [2, 34.5, -0.9, 'man', { prop: null, arms: 'hip' }]])
    c.person(x, z, yaw, { ...randomLook(rng, cls), ...o });
  // 堤尾：河湾处一座茅亭
  pavilion(c, 258.5, 78, PI / 2, { thatch: true, color: W_.dark, w: 4.2, base: 0.26, h: 2.7 });
  // 浅水里的白鹭、泊在柳下的小船
  for (const [x, n] of [[74, 3], [142, 2], [196, 3], [-2, 2]]) {
    let z = 62;
    while (riverSD(x, z) > -0.7 && z > -40) z -= 0.25;
    for (let i = 0; i < n; i++) {
      const ex = x + i * rng.f(1.2, 2.4), ez = z + rng.f(-0.5, 0.3);
      c.at(ex, ez, rng.f(6.28), () => egret(b), bankY(ex, ez) + 0.22);
    }
  }
  addBoat(c, 84, 36.2, 0.1, { small: true });
  addBoat(c, 152, 35.6, PI - 0.08, { small: true });
  ducks(c, 110, 36.5, 6, 2.4);
}

// ───────────────────────── 寺院与远塔 ─────────────────────────
function temple(c) {
  const { b, rng, W_, atlas } = c;
  const TX = -188;
  // 香炉
  c.at(TX, -17.4, 0, () => {
    const br = [0.56, 0.52, 0.42], id = b.nextId();
    b.box('stone', 0, 0.22, 0, 1.5, 0.44, 1.5, {});
    for (let k = 0; k < 3; k++) b.rod('flat', [Math.cos(k * 2.094) * 0.42, 0.44, Math.sin(k * 2.094) * 0.42], [Math.cos(k * 2.094) * 0.34, 0.95, Math.sin(k * 2.094) * 0.34], 0.09, 0.07, 6, { color: br, id });
    b.cyl('flat', 0, 0.9, 0, 0.62, 0.46, 0.5, 12, { color: br, id });
    b.cyl('flat', 0, 1.4, 0, 0.68, 0.64, 0.08, 12, { color: br.map((v) => v * 1.1), id });
    for (const sx of [-1, 1]) b.box('flat', sx * 0.66, 1.5, 0, 0.07, 0.36, 0.3, { color: br, id });
    for (let k = 0; k < 5; k++) b.rod('flat', [rng.f(-0.3, 0.3), 1.44, rng.f(-0.3, 0.3)], [rng.f(-0.3, 0.3), 2.0, rng.f(-0.3, 0.3)], 0.008, 0.008, 3, { color: [0.6, 0.4, 0.3], lw: 0.3 });
  });
  colliders.add(TX - 0.8, -18.2, TX + 0.8, -16.6);
  // 钟亭：悬一口大钟
  pavilion(c, TX - 8.2, -17.6, 0, { w: 3.4, base: 0.4, h: 3.2, pitch: 0.8, inside: (base) => {
    const br = [0.5, 0.5, 0.42], id = b.nextId();
    b.cyl('flat', 0, base + 1.15, 0, 0.42, 0.62, 1.15, 12, { color: br, id });
    b.sphere('flat', 0, base + 2.3, 0, 0.42, 0.26, 0.42, { color: br, id, ws: 10, hs: 5 });
    b.rod('wood', [0, base + 2.5, 0], [0, base + 3.1, 0], 0.05, 0.05, 5, { color: W_.dark });
    b.rod('wood', [0.75, base + 1.6, -0.9], [0.75, base + 1.6, 0.9], 0.08, 0.08, 6, { color: W_.wood });
  } });
  colliders.add(TX - 8.9, -18.3, TX - 7.5, -16.9, -1e9, 3);
  // 碑
  c.at(TX + 8.4, -17, 0, () => {
    b.box('stone', 0, 0.25, 0, 1.3, 0.5, 0.8, {});
    b.box('stone', 0, 1.7, 0, 0.95, 2.4, 0.24, { id: b.nextId() });
    b.box('stone', 0, 3.02, 0, 1.1, 0.34, 0.3, { id: b.nextId() });
    const r = atlas.vertical('南无阿弥陀佛', { bg: '#d2ccbc', fg: '#3a2c24', border: '#d2ccbc' });
    b.quad('sign', [-0.3, 0.6, 0.13], [0.3, 0.6, 0.13], [0.3, 2.8, 0.13], [-0.3, 2.8, 0.13], { rect: r, lw: 0.4 });
  });
  colliders.add(TX + 7.7, -17.5, TX + 9.1, -16.5);
  c.at(TX, -26.2, 0, () => P.plaque(b, atlas, '大雄宝殿', 0, 4.95, 0, 3.2));
  // 山门两侧的幡竿
  for (const sx of [-1, 1]) {
    c.at(TX + sx * 5.6, -ROAD_HW - 2.0, 0, () => {
      b.cyl('wood', 0, 0, 0, 0.05, 0.09, 9.2, 6, { color: W_.red });
      b.box('stone', 0, 0.3, 0, 0.5, 0.6, 0.5, {});
      b.rod('wood', [0, 8.9, 0], [0.9, 8.9, 0], 0.03, 0.03, 4, { color: W_.red });
      b.quad('flag', [0.2, 4.4, 0], [0.78, 4.4, 0], [0.78, 8.8, 0], [0.2, 8.8, 0], { color: sx < 0 ? [1.0, 0.82, 0.42] : [0.9, 0.44, 0.38], windV: [1, 1, 0, 0], double: true, lw: 0.5 });
    });
    colliders.add(TX + sx * 5.6 - 0.25, -ROAD_HW - 2.25, TX + sx * 5.6 + 0.25, -ROAD_HW - 1.75);
  }
  // 院里两株老松，僧人洒扫、上香的香客
  c.treeAt(TX - 11.6, -21.6, 'pine', 0.95, true, { keep: true, clear: 2.0 });
  c.treeAt(TX + 11.4, -21, 'pine', 1.05, true, { keep: true, clear: 2.0 });
  c.person(TX + 2.2, -14.6, PI + 0.4, { ...MONK, prop: 'staff', arms: 'down' });
  c.person(TX - 1.4, -19.6, 0, { ...MONK });
  c.person(TX + 1.5, -19.2, -0.3, { ...randomLook(rng, 'woman'), prop: null, arms: 'tuck', lean: 0.2 });
  c.person(TX - 4.6, -14.4, 2.0, { ...randomLook(rng, 'elder') });
  c.criers.push({ x: TX, z: -15, lines: ['阿弥陀佛。', '施主请进，殿里上香。', '当——（钟声悠长）'] });
  // 远塔：城北天际一座砖塔（铁塔行云），只可远观
  c.at(-330, -158, 0.3, () => P.pagoda(b, 13));
  c.MAP.houses.push({ x: -330, z: -158, w: 13, d: 13, rot: 0.78, big: true });
  colliders.addLot(-340, -168, -320, -148);
}

// ───────────────────────── 城里的灯彩 ─────────────────────────
// 横跨街面的一串灯笼：两头立竿
function lanternSpan(c, ax, az, bx, bz, n = 6, h = 5.6) {
  const { b, W_ } = c, dx = bx - ax, dz = bz - az;
  c.at(ax, az, 0, () => {
    const id = b.nextId();
    for (const t of [0, 1]) {
      b.cyl('wood', dx * t, 0, dz * t, 0.05, 0.08, h + 0.3, 6, { color: W_.red, id });
      b.box('stone', dx * t, 0.2, dz * t, 0.4, 0.4, 0.4, {});
    }
    let prev = null;
    for (let k = 0; k <= n * 2; k++) {
      const t = k / (n * 2), p = [dx * t, h - 0.9 * 4 * t * (1 - t), dz * t];
      if (prev) b.rod('flat', prev, p, 0.012, 0.012, 3, { color: [0.4, 0.34, 0.28], lw: 0.3 });
      if (k % 2 === 1) P.lantern(b, p[0], p[1], p[2], 1.25);
      prev = p;
    }
  });
  for (const [x, z] of [[ax, az], [bx, bz]]) colliders.add(x - 0.22, z - 0.22, x + 0.22, z + 0.22);
}
function cityLights(c) {
  const E = ROAD_HW - 0.35;
  for (const x of [-296.5, -302, -328.5, -334, -347.5, -357.4, -366, -378.5, -387]) lanternSpan(c, x, -E, x, E, 6);
  for (const z of [-21, -29.5]) lanternSpan(c, -346.2, z, -337.8, z, 4, 5.2);
  // 十千脚店门前也挂两串
  for (const x of [-45.5, -66.5]) lanternSpan(c, x, -E, x, E, 6);
}

// ───────────────────────── 护城河 ─────────────────────────
function moat(c) {
  const { b, rng } = c;
  ducks(c, RV.MOAT_X + 1, 26, 6, 2.6);
  ducks(c, RV.MOAT_X - 1.5, -38, 5, 2.2);
  for (const [z, side, n] of [[34, 1, 2], [-22, -1, 2], [-58, 1, 3], [62, -1, 2]])
    for (let i = 0; i < n; i++) {
      const x = RV.MOAT_X + side * (RV.MOAT_HW - 0.55), ez = z + i * rng.f(1.3, 2.2);
      c.at(x, ez, rng.f(6.28), () => egret(b), bankY(x, ez) + 0.22);
    }
  addBoat(c, RV.MOAT_X + 2.2, 52, PI / 2 + 0.1, { small: true });
  addBoat(c, RV.MOAT_X - 2, -70, -PI / 2, { small: true });
}

// ───────────────────────── 掠水的白鹭 ─────────────────────────
function flyingEgrets(c) {
  const { rng } = c;
  const birds = [];
  for (let i = 0; i < 6; i++) {
    const g = buildObject(c.mats, (bb) => {
      const id = bb.nextId(), o = { color: WHITE, id, lw: 0.4 };
      bb.rod('flat', [-0.34, 0, 0], [0.3, 0, 0], 0.05, 0.045, 5, o);
      bb.rod('flat', [0.3, 0, 0], [0.52, 0.02, 0], 0.025, 0.01, 4, o);
      bb.rod('flat', [-0.34, 0, 0], [-0.7, -0.01, 0], 0.008, 0.006, 3, { color: [0.3, 0.3, 0.28], lw: 0.3 });
      for (const sz of [-1, 1]) bb.raw('flat', [0.12, 0, 0, -0.16, 0, 0, -0.1, 0.34, sz * 0.86, 0.06, 0.3, sz * 0.8], null, [0, 1, 2, 0, 2, 3], { ...o, double: true });
    });
    c.scene.add(g);
    birds.push({ g, a: (i / 6) * 0.5 + rng.f(-0.03, 0.03), dy: rng.f(-1.2, 1.2), dr: rng.f(-5, 5), ph: rng.f(6.28) });
  }
  c.dynamic.push((t) => {
    for (const q of birds) {
      // 沿汴河上空兜一个长圈：自码头掠过虹桥，再折回来
      const a = q.a + t * 0.034, ca = Math.cos(a), sa = Math.sin(a);
      q.g.position.set(70 + ca * (150 + q.dr), 9 + q.dy + Math.sin(a * 3 + q.ph) * 2.5, 14 + sa * (34 + q.dr * 0.5));
      q.g.rotation.y = Math.atan2(-ca * 34, -sa * 150);
      const fl = Math.sin(t * 5.2 + q.ph);
      q.g.scale.y = fl >= 0 ? Math.max(0.16, fl) : Math.min(-0.16, fl);
    }
  });
}

// ───────────────────────── 街上的零碎活计 ─────────────────────────
// 沿街两侧（离屋檐两三步、让开当中的路）隔几步摆一处：闲谈的、歇担的、地摊、货堆、拴着的驴……
function streetLife(c) {
  const { b, rng, W_ } = c;
  const face = (sd) => (sd > 0 ? 0 : PI);
  const V = {
    chat(x, z) {
      const n = rng.i(2, 3), a0 = rng.f(6.28);
      for (let i = 0; i < n; i++) {
        const a = a0 + (i / n) * 6.283, px = x + Math.cos(a) * 0.62, pz = z + Math.sin(a) * 0.62;
        c.person(px, pz, Math.atan2(x - px, z - pz), { ...randomLook(rng, rng.pick(['man', 'scholar', 'man', 'woman', 'elder', 'labor'])), prop: i === 0 && rng.chance(0.3) ? 'fan' : null, arms: rng.pick(['chat', 'tuck', 'back', 'hip', 'chat']) });
      }
    },
    goods(x, z, sd) {
      const k = rng.i(0, 3);
      c.at(x, z, rng.f(-0.3, 0.3), () => {
        if (k === 0) P.sackPile(b, 0, 0, rng, rng.i(5, 9));
        else if (k === 1) { P.crate(b, 0, 0, 0); P.crate(b, 0.8, 0, 0.1, 0.9); P.crate(b, 0.3, 0.58, 0, 0.8); }
        else if (k === 2) for (let i = 0; i < 5; i++) P.jar(b, (i % 3) * 0.55 - 0.5, 0, Math.floor(i / 3) * 0.55 - 0.2, rng.f(1.0, 1.4), rng.pick([[0.66, 0.54, 0.44], [0.6, 0.62, 0.6], [0.72, 0.6, 0.5]]));
        else { P.basket(b, -0.45, 0, 0, 1.2, [0.76, 0.82, 0.6]); P.basket(b, 0.4, 0, 0.1, 1.1, [0.92, 0.6, 0.45]); P.basket(b, 0, 0, -0.6, 1.1, [0.95, 0.9, 0.7]); }
      });
      colliders.add(x - 0.95, z - 0.8, x + 0.95, z + 0.8);
      if (rng.chance(0.6)) c.person(x + rng.sign() * 1.35, z + sd * 0.3, face(sd) + rng.f(-0.5, 0.5), { ...randomLook(rng, 'labor'), prop: null, arms: rng.pick(['hip', 'down', 'tuck']), hat: rng.pick(['scarf', 'none']) });
    },
    vendor(x, z, sd) {
      // 地摊：一领席子，货摆在地上，摊主坐在后头
      c.at(x, z, face(sd), () => {
        b.box('mat', 0, 0.02, 0, 1.9, 0.03, 1.2, { lw: 0.5 });
        P.wares(b, 0, 0.04, 0, 1.6, 0.9, rng);
        P.wares(b, 0, 0.04, 0, 1.6, 0.9, rng);
      });
      colliders.add(x - 0.95, z - 0.6, x + 0.95, z + 0.6, -1e9, 0.9);
      sitter(c, x + rng.f(-0.3, 0.3), z - sd * 0.95, face(sd), randomLook(rng, rng.pick(['man', 'woman', 'elder'])));
      if (rng.chance(0.55)) c.person(x + rng.f(-0.5, 0.5), z + sd * 1.05, face(-sd), { ...randomLook(rng), prop: null, arms: 'reach', lean: 0.26 });
    },
    stall(x, z, sd) {
      c.at(x, z, face(sd), () => P.parasolStall(b, rng));
      c.person(x + (sd > 0 ? 0.5 : -0.5), z - sd * 0.62, face(sd), { ...randomLook(rng, rng.pick(['man', 'woman'])), prop: null, arms: 'tuck' });
      colliders.add(x - 0.9, z - 0.7, x + 0.9, z + 0.7);
      if (rng.chance(0.5)) c.person(x + rng.f(-0.2, 0.9), z + sd * 1.15, face(-sd), { ...randomLook(rng), prop: null, arms: rng.pick(['reach', 'tuck']) });
    },
    kids(x, z) {
      const n = rng.i(2, 3);
      for (let i = 0; i < n; i++) c.person(x + rng.f(-0.9, 0.9), z + rng.f(-0.6, 0.6), rng.f(6.28), { ...randomLook(rng, 'kid'), prop: null, arms: rng.pick(['hail', 'down', 'reach']) });
    },
    donkey(x, z, sd) {
      const r = rng.chance(0.5) ? 0 : PI;
      c.at(x, z, r, () => {
        P.donkey(b, rng.pick([[0.9, 0.86, 0.74], [0.34, 0.33, 0.32], null]));
        b.cyl('wood', 1.3, 0, 0, 0.05, 0.06, 1.2, 5, { color: W_.dark });
      });
      colliders.add(x - 1.45, z - 0.5, x + 1.45, z + 0.5);
      c.person(x + rng.f(-0.4, 0.4), z + sd * 0.95, face(-sd) + rng.f(-0.4, 0.4), { ...randomLook(rng, 'labor'), prop: 'staff', arms: 'down', hat: 'scarf' });
    },
    barrow(x, z, sd) {
      c.at(x, z, rng.f(-0.3, 0.3), () => P.barrow(b, rng));
      colliders.add(x - 1.4, z - 0.6, x + 1.4, z + 0.6);
      c.person(x - 1.9, z + sd * 0.2, PI / 2, { ...randomLook(rng, 'labor'), prop: null, arms: 'hip', hat: 'scarf' });
    },
    porters(x, z, sd) {
      c.person(x, z, rng.chance(0.5) ? PI / 2 : -PI / 2, { ...randomLook(rng, 'labor'), prop: 'pole', arms: 'carry' });
      if (rng.chance(0.6)) c.person(x + rng.f(1.1, 1.6), z + rng.f(-0.4, 0.4), rng.chance(0.5) ? PI / 2 : -PI / 2, { ...randomLook(rng, 'labor'), prop: 'sack', arms: 'carry' });
    },
    vats(x, z) {
      c.at(x, z, 0, () => {
        for (const dx of [-0.55, 0.55]) {
          const id = b.nextId();
          b.cyl('flat', dx, 0, 0, 0.5, 0.36, 0.78, 12, { color: [0.5, 0.46, 0.42], id });
          b.cyl('flat', dx, 0.74, 0, 0.44, 0.44, 0.03, 12, { color: [0.4, 0.5, 0.52], lw: 0.3 });
        }
      });
      colliders.add(x - 1.1, z - 0.55, x + 1.1, z + 0.55);
    },
    sedan(x, z, sd) {
      c.at(x, z, 0, () => P.sedan(b));
      colliders.add(x - 1.7, z - 0.9, x + 1.7, z + 0.9);
      for (const dx of [-2.2, 2.3]) c.person(x + dx, z + sd * rng.f(0, 0.5), face(sd) + rng.f(-0.6, 0.6), { ...randomLook(rng, 'labor'), prop: null, arms: rng.pick(['hip', 'down']), hat: 'scarf' });
    },
  };
  const BAG = ['chat', 'chat', 'chat', 'goods', 'goods', 'vendor', 'vendor', 'stall', 'stall', 'kids', 'donkey', 'barrow', 'porters', 'porters', 'vats', 'sedan'];
  const nearNpc = (x, z) => c.npcs.some((n) => Math.hypot(n.x - x, n.z - z) < 3.4);
  // 沿东西向的街
  const alongX = (x0, x1, zc, hw, skip, step = 8.2) => {
    for (const sg of [-1, 1])
      for (let x = x0 - rng.f(2, 6); x > x1; x -= rng.f(step * 0.7, step * 1.35)) {
        const z = zc + sg * (hw - rng.f(1.3, 2.5));
        if (skip(x, sg) || nearNpc(x, z) || colliders.hit(x, z, 1.7, 0) || riverSD(x, z) < 3) continue;
        V[rng.pick(BAG)](x, z, -sg);
      }
  };
  alongX(206, 46, EAST_Z, ROAD_HW, (x) => Math.abs(x - 152) < 7 || Math.abs(x - 102) < 7);
  alongX(-42, -212, 0, ROAD_HW, (x, sg) => Math.abs(x + 119) < 9 || (sg > 0 && Math.abs(x + 56) < 9) || (sg < 0 && Math.abs(x + 188) < 7));
  alongX(-284, -398, 0, ROAD_HW, (x, sg) => Math.abs(x + 342) < 7 || (sg < 0 && Math.abs(x + 317) < 11) || (sg > 0 && Math.abs(x + 351) < 6));
  // 码头：岸边再添几处
  alongX(204, 40, -10, 4.4, (x) => Math.abs(x - 152) < 5 || Math.abs(x - 102) < 5, 13);
  // 街心：隔一段有站着说话的、挑担歇脚的、骑驴过路的——偏在路心一侧，另一侧留给人走
  const mid = (x0, x1, zc, skip) => {
    for (let x = x0 - rng.f(6, 12); x > x1; x -= rng.f(13, 21)) {
      const z = zc + rng.sign() * rng.f(1.2, 2.8), west = rng.chance(0.6);
      if (skip(x) || nearNpc(x, z) || colliders.hit(x, z, 2.2, 0)) continue;
      const k = rng.i(0, 5);
      if (k <= 1) V.chat(x, z);
      else if (k === 2) V.porters(x, z, 1);
      else if (k === 3) rider(c, x, z, west ? PI : 0, { ...randomLook(rng, rng.pick(['man', 'scholar'])), hat: rng.pick(['douli', 'futou']) }, rng.chance(0.3) ? 'horse' : 'donkey');
      else if (k === 4) {
        // 并肩走的两三个人（一个回头说话）
        const yw = west ? -PI / 2 : PI / 2;
        c.person(x, z, yw, { ...randomLook(rng), prop: null, arms: 'back' });
        c.person(x + (west ? 0.3 : -0.3), z + 0.8, yw + rng.f(-0.3, 0.3), { ...randomLook(rng), prop: rng.chance(0.3) ? 'basket' : null });
        if (rng.chance(0.5)) c.person(x + (west ? -0.9 : 0.9), z + 0.4, yw + PI + rng.f(-0.5, 0.5), { ...randomLook(rng, 'kid'), prop: null });
      } else V.kids(x, z);
    }
  };
  // 当街的车马：让在路心一侧，行人自会绕开
  const train = (x, z, dir, n) => {
    for (let i = 0; i < n; i++) {
      const px = x - dir * i * 2.6;
      c.at(px, z + rng.f(-0.2, 0.2), dir > 0 ? 0 : PI, () => P.donkey(b, rng.pick([[0.9, 0.86, 0.74], [0.8, 0.74, 0.6]])));
      colliders.add(px - 0.9, z - 0.5, px + 0.9, z + 0.5);
    }
    c.person(x - dir * (n * 2.6 + 0.2), z + 0.5, dir > 0 ? PI / 2 : -PI / 2, { ...randomLook(rng, 'labor'), prop: 'staff', arms: 'down', hat: 'douli' });
  };
  train(-86, 2.3, -1, 3);
  train(182, EAST_Z - 1.8, -1, 4);
  const carried = (x, z) => {
    c.at(x, z, 0, () => P.sedan(b));
    colliders.add(x - 1.7, z - 0.9, x + 1.7, z + 0.9);
    for (const dx of [-1.95, 1.95]) c.person(x + dx, z, -PI / 2, { ...randomLook(rng, 'labor'), prop: null, arms: 'down', hat: 'scarf' });
    c.person(x + 3.4, z + 0.9, -PI / 2, { ...randomLook(rng, 'kid'), prop: null });
  };
  carried(-373, -2.4);
  carried(68, EAST_Z + 2.2);
  mid(204, 48, EAST_Z, (x) => Math.abs(x - 152) < 6 || Math.abs(x - 102) < 6 || Math.abs(x - 84) < 8);
  mid(-44, -210, 0, (x) => Math.abs(x + 119) < 12 || Math.abs(x + 148) < 12);
  mid(-286, -396, 0, (x) => Math.abs(x + 342) < 8 || Math.abs(x + 331) < 7);
}

// ───────────────────────── 草、芦苇、野花 ─────────────────────────
export function groundCover(c) {
  const { b } = c, rng = new RNG(7771);
  const STEP = 1.25;
  for (let gx = -412; gx < 416; gx += STEP)
    for (let gz = -120; gz < 110; gz += STEP) {
      const x = gx + rng.f(-0.6, 0.6), z = gz + rng.f(-0.6, 0.6);
      const m = meadow(x, z);
      if (m < 0.42 || rng.r() > (m - 0.3) * 2.4) continue;
      // 离路远的地方人不常到，草丛疏些（地上那层草色照旧）
      if (!onRoad(x, z, 24) && rng.r() > 0.4) continue;
      if (riverSD(x, z) < 0.7 || onRoad(x, z, 0.4) || colliders.hit(x, z, 0.5)) continue;
      c.chunk(x);
      const r = rng.r();
      if (r < 0.035 && m > 0.6) b.place(x, 0, z, 0, () => P.flowers(b, rng, rng.pick([PINK, PALE, PALE, [1.26, 1.1, 0.5]]), rng.f(0.6, 0.85)));
      else b.place(x, 0, z, 0, () => P.grassTuft(b, rng, r > 0.92 ? rng.f(1.3, 1.8) : rng.f(0.8, 1.15), 0.9 + 0.14 * m));
    }
  // 芦苇：沿水边一段一段地长，码头、桥头、渡口让开
  CHANNELS.forEach((ch, ci) => {
    const pts = ch.pts;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], q = pts[i], len = Math.hypot(q[0] - a[0], q[1] - a[1]) || 1, ux = (q[0] - a[0]) / len, uz = (q[1] - a[1]) / len;
      for (let s = 0; s < len; s += 1.25, acc += 1.25) {
        const cx = a[0] + ux * s, cz = a[1] + uz * s;
        if (cx < -430 || cx > 440 || cz < -150 || cz > 140) continue;
        for (const side of [-1, 1]) {
          if (vnoise(acc / 19 + side * 31.7 + ci * 5.3, 0.5 + ci) < 0.47) continue;
          const off = ch.hw + rng.f(-1.0, 0.6), x = cx - uz * side * off + rng.f(-0.3, 0.3), z = cz + ux * side * off + rng.f(-0.3, 0.3);
          if (x > 30 && x < 214 && z < 12 && z > -12) continue; // 码头泊船的一岸
          if (Math.hypot(x - BRIDGE.xc, z - BRIDGE.zc) < 42) continue;
          if (Math.abs(x - PLANK.x) < 7.5 && Math.abs(z - PLANK.z) < 4.5) continue;
          if (ch.id === 'moat' && Math.abs(z) < 11) continue; // 护城河平桥
          if (onRoad(x, z, 1.2) || colliders.hit(x, z, 1.1)) continue;
          c.chunk(x);
          b.place(x, bankY(x, z), z, 0, () => P.reed(b, rng, rng.f(0.8, 1.2) * (ch.hw < 5 ? 0.78 : 1)));
        }
      }
    }
  });
}

export function buildScenery(c) {
  springCountry(c);
  dyke(c);
  temple(c);
  cityLights(c);
  moat(c);
  flyingEgrets(c);
  streetLife(c);
}

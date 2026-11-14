// 大木作与小木作的细部：柱与柱础、斗拱铺作、勾栏、竹帘。
// 都在批处理器的当前局部坐标系里作画。
const BRACKET = [1.0, 0.86, 0.7];
const DARK = [0.68, 0.6, 0.56];

// 柱：覆盆柱础 + 略带收分的圆柱
export function column(b, x, y, z, h, r = 0.125, color = [1, 1, 1], id) {
  b.cyl('stone', x, y, z, r * 1.2, r * 1.8, 0.1, 6, { id, lw: 0.6 });
  b.cyl('wood', x, y + 0.1, z, r * 0.88, r, h - 0.1, 7, { color, id, open: true }); // 柱身两端都埋在础石与梁里，不必封口
}

// 铺作的总高与出跳（未乘比例）
export const DG = { 1: { h: 0.73, out: 0.46 }, 2: { h: 0.99, out: 0.84 } };

// 一朵斗拱：原点在柱头（普拍枋上皮），出跳方向 +Z。steps：出跳数（1 = 四铺作，2 = 五铺作）
export function dougong(b, s = 1, steps = 2, color = BRACKET) {
  const o = { color, id: b.nextId(), lw: 0.55 };
  const B = (x, y, z, sx, sy, sz) => b.box('wood', x * s, y * s, z * s, sx * s, sy * s, sz * s, o);
  B(0, 0.1, 0, 0.36, 0.2, 0.36); // 栌斗
  B(0, 0.29, 0, 0.92, 0.17, 0.13); // 泥道拱
  B(0, 0.29, 0.2, 0.13, 0.17, 0.66); // 华拱
  for (const sx of [-1, 1]) B(sx * 0.38, 0.42, 0, 0.17, 0.1, 0.17); // 散斗
  B(0, 0.42, 0.46, 0.17, 0.1, 0.17); // 交互斗
  if (steps === 1) {
    B(0, 0.55, 0, 1.3, 0.16, 0.12); // 慢拱
    B(0, 0.55, 0.46, 0.82, 0.16, 0.13); // 令拱
    for (const sx of [-1, 0, 1]) B(sx * 0.34, 0.68, 0.46, 0.16, 0.1, 0.16);
    B(0, 0.55, 0.15, 0.12, 0.16, 0.94); // 耍头
    return;
  }
  B(0, 0.55, 0, 1.36, 0.17, 0.13); // 慢拱
  B(0, 0.55, 0.46, 0.82, 0.17, 0.13); // 瓜子拱
  B(0, 0.55, 0.37, 0.13, 0.17, 1.02); // 第二跳华拱
  for (const sx of [-1, 1]) {
    B(sx * 0.6, 0.68, 0, 0.17, 0.1, 0.17);
    B(sx * 0.34, 0.68, 0.46, 0.16, 0.1, 0.16);
  }
  B(0, 0.68, 0.84, 0.17, 0.1, 0.17);
  B(0, 0.81, 0.84, 0.82, 0.16, 0.13); // 令拱
  for (const sx of [-1, 0, 1]) B(sx * 0.34, 0.94, 0.84, 0.16, 0.1, 0.16);
  B(0, 0.81, 0.5, 0.12, 0.16, 1.14); // 耍头
}

// 绕屋一周的铺作层。hw / hd：柱中线的半宽、半深；y：柱头高；
// xs / zs：前后檐与两山各朵的位置（沿檐方向的坐标，含柱头与补间）。返回 { h, out }：层高与出跳
export function dougongRing(b, hw, hd, y, xs, zs, s = 1, steps = 2, color = BRACKET) {
  const d = DG[steps], out = d.out * s, h = d.h * s;
  const beam = { color, id: b.nextId(), lw: 0.6 };
  // 普拍枋
  for (const sz of [-1, 1]) b.box('wood', 0, y - 0.05 * s, sz * hd, hw * 2 + 0.4 * s, 0.1 * s, 0.34 * s, beam);
  for (const sx of [-1, 1]) b.box('wood', sx * hw, y - 0.05 * s, 0, 0.34 * s, 0.1 * s, hd * 2 + 0.4 * s, beam);
  for (const p of xs) {
    b.place(p, y, hd, 0, () => dougong(b, s, steps, color));
    b.place(p, y, -hd, Math.PI, () => dougong(b, s, steps, color));
  }
  for (const p of zs) {
    b.place(hw, y, p, Math.PI / 2, () => dougong(b, s, steps, color));
    b.place(-hw, y, p, -Math.PI / 2, () => dougong(b, s, steps, color));
  }
  // 转角铺作：沿 45° 出角华拱
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.place(sx * hw, y, sz * hd, Math.atan2(sx, sz), () => dougong(b, s * 1.3, steps, color));
  // 柱头枋（贴壁）与橑檐枋（挑出在外）
  const yw = y + (steps === 2 ? 0.81 : 0.68) * s, yo = y + h + 0.07 * s;
  for (const sz of [-1, 1]) {
    b.box('wood', 0, yw, sz * hd, hw * 2, 0.16 * s, 0.12 * s, beam);
    b.box('wood', 0, yo, sz * (hd + out), (hw + out) * 2 + 0.2 * s, 0.2 * s, 0.15 * s, beam);
  }
  for (const sx of [-1, 1]) {
    b.box('wood', sx * hw, yw, 0, 0.12 * s, 0.16 * s, hd * 2, beam);
    b.box('wood', sx * (hw + out), yo, 0, 0.15 * s, 0.2 * s, (hd + out) * 2 + 0.2 * s, beam);
  }
  return { h: h + 0.17 * s, out };
}

// 沿一边均布各朵的位置：柱头各一朵，每间再补 per 朵
export function bracketSpots(half, bays, per = 1) {
  const out = [], bw = (half * 2) / bays;
  for (let i = 1; i < bays; i++) out.push(-half + i * bw);
  for (let i = 0; i < bays; i++) for (let k = 1; k <= per; k++) out.push(-half + (i + k / (per + 1)) * bw);
  return out;
}

// 勾栏：望柱（莲苞柱头）、寻杖、盆唇、地栿，中间卧棂与蜀柱
export function railing(b, pts, h = 0.95, color = [1.02, 0.63, 0.5], mat = 'wood') {
  const id = b.nextId(), o = { color, id }, thin = { color, id, lw: 0.5 };
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    b.box(mat, p[0], p[1] + h / 2 + 0.06, p[2], 0.11, h + 0.12, 0.11, o);
    b.sphere(mat, p[0], p[1] + h + 0.2, p[2], 0.065, 0.09, 0.065, { color, id, ws: 5, hs: 3, lw: 0.6 });
    if (i === pts.length - 1) break;
    const q = pts[i + 1];
    const L = (t, y) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t + y, p[2] + (q[2] - p[2]) * t];
    b.rod(mat, L(0, h), L(1, h), 0.034, 0.034, 6, o);
    b.beam(mat, L(0, h * 0.62), L(1, h * 0.62), 0.05, 0.05, o);
    b.beam(mat, L(0, 0.09), L(1, 0.09), 0.06, 0.06, o);
    b.beam(mat, L(0, h * 0.36), L(1, h * 0.36), 0.03, 0.03, thin);
    b.beam(mat, L(0.5, h * 0.62), L(0.5, h), 0.05, 0.05, thin);
  }
}

// 竹帘：自额下垂落，下端卷起一截。板面法线沿局部 Z
export function blind(b, cx, yTop, z, w, drop, color = [0.86, 0.82, 0.62]) {
  const id = b.nextId();
  b.quad('mat', [cx - w / 2, yTop - drop, z], [cx + w / 2, yTop - drop, z], [cx + w / 2, yTop, z], [cx - w / 2, yTop, z], { id, color, double: true, lw: 0.6 });
  b.rod('mat', [cx - w / 2 - 0.03, yTop - drop - 0.04, z], [cx + w / 2 + 0.03, yTop - drop - 0.04, z], 0.055, 0.055, 7, { color, id });
  b.box('wood', cx, yTop + 0.02, z, w + 0.06, 0.05, 0.05, { color: DARK, id, lw: 0.5 });
}

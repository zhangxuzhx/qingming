// 构件生成器：屋顶、房屋、酒楼、欢门、摊棚、草木、漕船、虹桥、城门、牲畜车轿……
// 所有函数都在批处理器的“当前局部坐标系”中作画：正面朝 +Z，地面 y=0。
import { BRIDGE, bridgeProfile, bridgeSoffit, GATE } from './layout.js';
import { column, dougongRing, bracketSpots, blind, railing } from './timber.js';

export { railing };

export const W_ = {
  wood: [1, 1, 1],
  dark: [0.68, 0.6, 0.56],
  deep: [0.5, 0.44, 0.42],
  red: [1.02, 0.63, 0.5],
  pale: [1.14, 1.12, 1.06],
};
const SHADE = [0.8, 0.78, 0.74];
const RIDGE = [0.4, 0.43, 0.46];
const JAR_COLORS = [[0.72, 0.82, 0.76], [0.93, 0.92, 0.88], [0.62, 0.5, 0.4], [0.8, 0.62, 0.5], [0.55, 0.62, 0.66], [0.85, 0.78, 0.6]];
export const CLOTH_COLORS = [[1.08, 1.06, 1.0], [0.76, 0.81, 0.84], [0.94, 0.87, 0.7], [0.9, 0.7, 0.62], [0.82, 0.87, 0.78], [1.0, 0.97, 0.9]];

// ───────────────────────── 屋顶 ─────────────────────────
// hw/hd：墙体半宽/半深；y：墙顶高；hip：0 悬山、1 庑殿（四阿）、0~1 歇山；sFrom>0 时只做外圈（腰檐）
export function roof(b, o) {
  const { hw, hd, y, pitch = 0.55, oe = 0.95, og = 0.6, hip = 0, mat = 'tile', thick = 0.12, under = 'rafter', underColor = [1, 1, 1], ridge = true, sFrom = 0, gable = 'plaster', gableColor = [1, 1, 1] } = o;
  const lift = o.lift ?? (hip > 0 ? 0.32 : 0.1);
  const W = hw + (hip > 0 ? oe : og), D = hd + oe;
  const f = (s) => 0.6 * s + 0.4 * (1 - (1 - s) * (1 - s));
  const sw = hd / D;
  const rise = pitch * hd;
  const total = rise / f(sw);
  const top = y + rise;
  const prof = (s) => top - total * f(s);
  const sB = 1 - hip;
  const xAt = (s) => (hip > 0 ? W - D * (1 - Math.max(s, sB)) : W);
  const liftAt = (t, s) => (hip > 0 ? lift * Math.abs(t) ** 3 * s * s : lift * t * t);
  const nP = 6, nL = 8, k0 = Math.round(sFrom * nP);
  const us = 1 / 2.3, vs = 1 / 2.6;
  const idTop = b.nextId(), idUnder = b.nextId();

  // 前后坡
  for (const sgn of [1, -1]) {
    const P = [], UV = [], IDX = [];
    let slope = 0;
    for (let k = k0; k <= nP; k++) {
      const s = k / nP;
      if (k > k0) {
        const s0 = (k - 1) / nP;
        slope += Math.hypot(D * (s - s0), prof(s) - prof(s0));
      }
      for (let i = 0; i <= nL; i++) {
        const t = (i / nL) * 2 - 1, x = xAt(s) * t;
        P.push(x, prof(s) + liftAt(t, s), sgn * D * s);
        UV.push(x * us, slope * vs);
      }
    }
    const rows = nP - k0;
    for (let r = 0; r < rows; r++)
      for (let i = 0; i < nL; i++) {
        const a = r * (nL + 1) + i, c = a + nL + 1;
        IDX.push(a, c, a + 1, a + 1, c, c + 1);
      }
    b.raw(mat, P, UV, IDX, { flip: sgn < 0, id: idTop, color: o.color });
    b.raw(under, P.map((v, j) => (j % 3 === 1 ? v - thick : v)), UV, IDX, { flip: sgn > 0, color: underColor, id: idUnder, lw: 0.7 });
    // 檐口
    const E = [], EU = [], EI = [];
    const base = rows * (nL + 1);
    for (let i = 0; i <= nL; i++) {
      const j = (base + i) * 3;
      E.push(P[j], P[j + 1] + 0.03, P[j + 2], P[j], P[j + 1] - thick - 0.13, P[j + 2]);
      EU.push(P[j] * us, 1, P[j] * us, 0);
      if (i < nL) EI.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
    }
    b.raw(mat === 'tile' ? 'eave' : 'wood', E, EU, EI, { color: mat === 'tile' ? [1, 1, 1] : W_.deep, double: true, id: idUnder, lw: 0.8 });
  }
  // 两山：庑殿/歇山的侧坡
  if (hip > 0) {
    const kB = Math.max(k0, Math.round(sB * nP)), nS = 6;
    for (const sgn of [1, -1]) {
      const P = [], UV = [], IDX = [];
      let slope = 0;
      for (let k = kB; k <= nP; k++) {
        const s = k / nP;
        if (k > kB) {
          const s0 = (k - 1) / nP;
          slope += Math.hypot(D * (s - s0), prof(s) - prof(s0));
        }
        for (let j = 0; j <= nS; j++) {
          const t = (j / nS) * 2 - 1, z = D * s * t;
          P.push(sgn * xAt(s), prof(s) + liftAt(t, s), z);
          UV.push(z * us, slope * vs);
        }
      }
      const rows = nP - kB;
      for (let r = 0; r < rows; r++)
        for (let j = 0; j < nS; j++) {
          const a = r * (nS + 1) + j, c = a + nS + 1;
          IDX.push(a, a + 1, c, a + 1, c + 1, c);
        }
      b.raw(mat, P, UV, IDX, { flip: sgn < 0, id: idTop, color: o.color });
      b.raw(under, P.map((v, j) => (j % 3 === 1 ? v - thick : v)), UV, IDX, { flip: sgn > 0, color: underColor, id: idUnder, lw: 0.7 });
      const E = [], EU = [], EI = [];
      const base = rows * (nS + 1);
      for (let j = 0; j <= nS; j++) {
        const q = (base + j) * 3;
        E.push(P[q], P[q + 1] + 0.03, P[q + 2], P[q], P[q + 1] - thick - 0.13, P[q + 2]);
        EU.push(P[q + 2] * us, 1, P[q + 2] * us, 0);
        if (j < nS) EI.push(j * 2, j * 2 + 1, j * 2 + 2, j * 2 + 2, j * 2 + 1, j * 2 + 3);
      }
      b.raw(mat === 'tile' ? 'eave' : 'wood', E, EU, EI, { color: mat === 'tile' ? [1, 1, 1] : W_.deep, double: true, id: idUnder, lw: 0.8 });
    }
  }
  // 山面封板
  if (hip < 1 && k0 === 0) {
    const sEnd = hip > 0 ? sB : sw, xg = hip > 0 ? xAt(0) - 0.06 : hw, m = 5;
    for (const sgn of [1, -1]) {
      const P = [], IDX = [];
      for (let j = 0; j <= m; j++) {
        const s = (sEnd * j) / m, yy = prof(s) - (hip > 0 ? 0.03 : thick);
        P.push(sgn * xg, yy, D * s, sgn * xg, yy, -D * s);
        if (j < m) IDX.push(j * 2, j * 2 + 2, j * 2 + 1, j * 2 + 1, j * 2 + 2, j * 2 + 3);
      }
      b.raw(gable, P, null, IDX, { flip: sgn < 0, color: gableColor });
      // 悬山博风板
      if (hip === 0) {
        for (const sz of [1, -1]) {
          const BP = [], BI = [];
          for (let k = 0; k <= nP; k++) {
            const s = k / nP, yy = prof(s) + liftAt(1, s);
            BP.push(sgn * W, yy + 0.05, sz * D * s, sgn * W, yy - 0.3, sz * D * s);
            if (k < nP) BI.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 2, k * 2 + 1, k * 2 + 3);
          }
          b.raw('wood', BP, null, BI, { color: W_.dark, double: true });
        }
        // 出际的檩头
        const fid = b.nextId(), wd = { color: W_.dark, id: fid, lw: 0.6 };
        for (const s of [0, sw * 0.5, sw])
          for (const sz of s ? [1, -1] : [1]) b.box('wood', (sgn * (hw + W)) / 2, prof(s) - thick - 0.12, sz * D * s, W - hw + 0.04, 0.16, 0.16, wd);
        // 山面梁架：平梁、蜀柱、叉手
        if (o.gableFrame !== false && rise > 1.1) {
          const yb = y + rise * 0.5;
          let sb = 0;
          while (sb < sw && prof(sb) - thick - 0.16 > yb) sb += 0.02;
          const zb = D * sb, xw = sgn * (hw + 0.05), tc = { color: o.frameColor || W_.dark, id: fid, lw: 0.6 };
          b.box('wood', xw, yb, 0, 0.1, 0.18, zb * 2, tc);
          b.box('wood', xw, (yb + top - thick) / 2, 0, 0.1, top - thick - yb, 0.15, tc);
          for (const sz of [1, -1]) b.beam('wood', [xw, yb + 0.08, sz * zb * 0.82], [xw, top - thick - 0.2, sz * 0.06], 0.1, 0.1, tc);
        }
        // 悬鱼
        if (mat === 'tile' && o.xuanyu !== false) {
          const xx = sgn * (W + 0.035), ya = top + liftAt(1, 0) - 0.04;
          b.raw('wood', [xx, ya, 0, xx, ya - 0.3, -0.17, xx, ya - 0.82, 0, xx, ya - 0.3, 0.17], null, [0, 1, 2, 0, 2, 3], { color: W_.deep, double: true, lw: 0.7 });
        }
      }
    }
  }
  // 正脊与垂脊。ridgeEnd：chiwei 鸱尾（殿阁）/ tip 翘头（寻常瓦屋）/ plain（茅屋）
  if (ridge && k0 === 0) {
    const rl = xAt(0), rc = o.ridgeColor || RIDGE, rm = o.ridgeMat || 'flat';
    const end = o.ridgeEnd || (mat === 'tile' ? 'tip' : 'plain'), rs = o.ridgeScale || (end === 'chiwei' ? 1.5 : 1);
    const rid = b.nextId(), ro = { color: rc, id: rid }, cap = { color: rc.map((c) => c * 1.3), id: rid, lw: 0.6 };
    // 脊线两端微微生起
    const yR = (t) => top + 0.08 * rs + (hip > 0 ? 0 : lift * t * t) + 0.1 * rs * t ** 4;
    let prev = null;
    for (let i = 0; i <= 8; i++) {
      const t = i / 4 - 1, p = [rl * t, yR(t), 0];
      if (prev) {
        b.beam(rm, prev, p, 0.34 * rs, 0.26 * rs, ro);
        if (mat === 'tile') b.beam(rm, [prev[0], prev[1] + 0.2 * rs, 0], [p[0], p[1] + 0.2 * rs, 0], 0.07 * rs, 0.32 * rs, cap);
      }
      prev = p;
    }
    for (const sgn of [1, -1]) {
      const ye = yR(1);
      if (end === 'chiwei') b.tube(rm, [[sgn * (rl - 0.42 * rs), ye - 0.05, 0, 0.16 * rs, 0.3 * rs], [sgn * (rl - 0.02 * rs), ye + 0.36 * rs, 0, 0.15 * rs, 0.32 * rs], [sgn * (rl - 0.04 * rs), ye + 0.74 * rs, 0, 0.12 * rs, 0.24 * rs], [sgn * (rl - 0.26 * rs), ye + 0.98 * rs, 0, 0.08 * rs, 0.14 * rs], [sgn * (rl - 0.46 * rs), ye + 1.0 * rs, 0, 0.02, 0.04]], { color: rc, id: rid, side: [0, 0, 1], seg: 8 });
      else if (end === 'tip') b.tube(rm, [[sgn * (rl - 0.5), ye, 0, 0.13, 0.17], [sgn * (rl - 0.08), ye + 0.14, 0, 0.12, 0.15], [sgn * (rl + 0.14), ye + 0.42, 0, 0.07, 0.09], [sgn * (rl + 0.18), ye + 0.56, 0, 0.02, 0.03]], { color: rc, id: rid, side: [0, 0, 1], seg: 7 });
    }
    // 茅屋：脊上压一排交叉的木棍
    if (mat === 'thatch') {
      const sid = b.nextId();
      for (let x = -rl + 0.5; x <= rl - 0.4; x += 1.25) for (const sz of [1, -1]) b.rod('wood', [x, top - 0.3, sz * 0.5], [x, top + 0.5, -sz * 0.2], 0.03, 0.025, 4, { color: W_.dark, id: sid, lw: 0.6 });
    }
    if (mat === 'tile') {
      const kA = hip > 0 ? Math.round(sB * nP) : 0;
      for (const sx of [1, -1])
        for (const sz of [1, -1]) {
          let q = null;
          for (let k = kA; k <= nP; k++) {
            const s = Math.min(k / nP, hip > 0 ? 1 : 0.95);
            const xx = hip > 0 ? xAt(s) : W - 0.2, tt = xx / W;
            const p = [sx * xx, prof(s) + (hip > 0 ? liftAt(1, s) : liftAt(tt, s)) + 0.08, sz * D * s];
            if (q) b.beam(rm, q, p, 0.2, 0.18, ro);
            q = p;
          }
          // 脊端翘起，蹲一只小兽
          const tip = [q[0] + (hip > 0 ? sx * 0.16 : 0), q[1] + 0.2, q[2] + sz * 0.2];
          b.beam(rm, q, tip, 0.15, 0.14, ro);
          if (hip > 0) b.box(rm, q[0] - sx * 0.3, q[1] + 0.14, q[2] - sz * 0.3, 0.12, 0.2, 0.12, ro);
        }
    }
  }
  return { top, eaveY: prof(1), W, D };
}

// ───────────────────────── 器物小件 ─────────────────────────
export function shelf(b, x, y, z, w, rng) {
  b.box('wood', x, y + 0.9, z, w, 1.8, 0.34, { color: W_.deep });
  for (const lvl of [0.4, 0.95, 1.5]) {
    b.box('wood', x, y + lvl, z + 0.04, w + 0.04, 0.05, 0.4, { color: W_.wood, lw: 0.6 });
    const n = Math.floor(w / 0.34);
    for (let i = 0; i < n; i++) {
      if (!rng.chance(0.78)) continue;
      const jx = x - w / 2 + 0.2 + i * 0.34, hgt = rng.f(0.16, 0.3);
      if (rng.chance(0.3)) b.box('flat', jx, y + lvl + 0.03 + hgt / 2, z + 0.1, 0.2, hgt, 0.16, { color: rng.pick(JAR_COLORS), lw: 0.6 });
      else b.cyl('flat', jx, y + lvl + 0.03, z + 0.1, 0.05, 0.09, hgt, 6, { color: rng.pick(JAR_COLORS), lw: 0.6 });
    }
  }
}

export function table(b, x, z, w, d, h = 0.78, color = W_.wood, ry = 0) {
  b.place(x, 0, z, ry, () => {
    const id = b.nextId();
    b.box('wood', 0, h, 0, w, 0.07, d, { color, id });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('wood', sx * (w / 2 - 0.07), h / 2, sz * (d / 2 - 0.07), 0.07, h, 0.07, { color, id });
  });
}
export const bench = (b, x, z, w, ry = 0) => table(b, x, z, w, 0.28, 0.42, W_.dark, ry);

export function sack(b, x, y, z, rng, s = 1) {
  const c = rng.pick([[0.9, 0.86, 0.74], [0.86, 0.8, 0.66], [0.92, 0.9, 0.82]]);
  b.sphere('flat', x, y + 0.2 * s, z, 0.42 * s, 0.22 * s, 0.3 * s, { color: c, ry: rng.f(3), ws: 8, hs: 5 });
}
export function sackPile(b, x, z, rng, n = 6) {
  for (let i = 0; i < n; i++) {
    const lvl = i < n * 0.6 ? 0 : 1;
    sack(b, x + rng.f(-0.7, 0.7) * (lvl ? 0.5 : 1), lvl * 0.36, z + rng.f(-0.6, 0.6) * (lvl ? 0.5 : 1), rng);
  }
}
export function jar(b, x, y, z, s = 1, color = [0.62, 0.5, 0.4]) {
  const id = b.nextId();
  b.cyl('flat', x, y, z, 0.26 * s, 0.16 * s, 0.34 * s, 8, { color, id });
  b.cyl('flat', x, y + 0.34 * s, z, 0.13 * s, 0.26 * s, 0.24 * s, 8, { color, id });
  b.cyl('flat', x, y + 0.58 * s, z, 0.15 * s, 0.13 * s, 0.07 * s, 8, { color: [0.75, 0.42, 0.36], id });
}
export function basket(b, x, y, z, s = 1, fill) {
  b.cyl('mat', x, y, z, 0.3 * s, 0.22 * s, 0.3 * s, 8, { color: [0.95, 0.9, 0.8] });
  if (fill) b.sphere('flat', x, y + 0.3 * s, z, 0.26 * s, 0.1 * s, 0.26 * s, { color: fill, lw: 0.5 });
}
export function crate(b, x, y, z, s = 1) {
  b.box('wood', x, y + 0.3 * s, z, 0.7 * s, 0.6 * s, 0.5 * s, { color: W_.pale });
}
export function lantern(b, x, y, z, s = 1) {
  const id = b.nextId();
  b.cyl('lamp', x, y - 0.5 * s, z, 0.16 * s, 0.1 * s, 0.14 * s, 8, { color: [1.08, 0.36, 0.27], id });
  b.cyl('lamp', x, y - 0.36 * s, z, 0.1 * s, 0.16 * s, 0.14 * s, 8, { color: [1.2, 0.5, 0.33], id });
  b.box('flat', x, y - 0.11 * s, z, 0.02, 0.22 * s, 0.02, { color: [0.3, 0.25, 0.2], lw: 0.5 });
}

// ───────────────────────── 招牌 ─────────────────────────
// 竖牌：以 (x,y,z) 为中心，板面法线沿局部 Z
export function vSign(b, atlas, text, x, y, z, hgt, ry = 0, o) {
  const r = atlas.vertical(text, o), wd = hgt * 0.25;
  b.place(x, y, z, ry, () => {
    const id = b.nextId();
    b.box('wood', 0, 0, 0, wd + 0.08, hgt + 0.08, 0.05, { color: W_.deep, id });
    b.quad('sign', [-wd / 2, -hgt / 2, 0.035], [wd / 2, -hgt / 2, 0.035], [wd / 2, hgt / 2, 0.035], [-wd / 2, hgt / 2, 0.035], { rect: r, id, lw: 0.5 });
    b.quad('sign', [wd / 2, -hgt / 2, -0.035], [-wd / 2, -hgt / 2, -0.035], [-wd / 2, hgt / 2, -0.035], [wd / 2, hgt / 2, -0.035], { rect: r, id, lw: 0.5 });
  });
}
// 横匾
export function plaque(b, atlas, text, x, y, z, wd, ry = 0, o) {
  const r = atlas.horizontal(text, o), hgt = wd / 3;
  b.place(x, y, z, ry, () => {
    const id = b.nextId();
    b.box('wood', 0, 0, -0.03, wd + 0.1, hgt + 0.1, 0.06, { color: W_.deep, id });
    b.quad('sign', [-wd / 2, -hgt / 2, 0.01], [wd / 2, -hgt / 2, 0.01], [wd / 2, hgt / 2, 0.01], [-wd / 2, hgt / 2, 0.01], { rect: r, id, lw: 0.5 });
  });
}
// 酒旗/幌子：立竿挑出，布幅随风
export function banner(b, atlas, text, x, z, ry = 0, o = {}) {
  const hgt = o.h || 5.6, bw = o.bw || 0.72, bh = o.bh || 2.7;
  const r = atlas.vertical(text, o.style);
  b.place(x, 0, z, ry, () => {
    const id = b.nextId();
    b.cyl('wood', 0, 0, 0, 0.045, 0.07, hgt, 6, { color: W_.dark, id });
    b.beam('wood', [0, hgt - 0.25, 0], [1.05, hgt - 0.1, 0], 0.05, 0.05, { color: W_.dark, id });
    const x0 = 0.25, x1 = x0 + bw, yT = hgt - 0.3, yB = yT - bh;
    // 正反各一面：只做一面的话，从背后看字是反的
    b.quad('signWind', [x0, yB, 0.006], [x1, yB, 0.006], [x1, yT, 0.006], [x0, yT, 0.006], { rect: r, windV: [0.75, 0.9, 0, 0], lw: 0.6 });
    b.quad('signWind', [x1, yB, -0.006], [x0, yB, -0.006], [x0, yT, -0.006], [x1, yT, -0.006], { rect: r, windV: [0.9, 0.75, 0, 0], lw: 0.6 });
  });
}

// ───────────────────────── 房屋 ─────────────────────────
// 室内的陈设另归一类分块（按所在的 36 米方格）：离远了不画，也不进投影
export function interior(b, fn) {
  const e = b.M.elements, prev = b.chunk;
  b.chunk = 'in:' + Math.floor(e[12] / 36) + ':' + Math.floor(e[14] / 36);
  fn();
  b.chunk = prev;
}
// 屋内陈设（民居、货栈、茅舍）。在屋内地面的坐标系里作画；S() 登记挡路的大件
function furnish(b, kind, hw, hd, rng, S) {
  if (kind === 'store') {
    // 塌房：麻包、货箱、成排的瓮
    sackPile(b, -hw + 1.3, -hd + 1.2, rng, 7);
    S(-hw + 0.3, -hd + 0.3, -hw + 2.3, -hd + 2.1);
    sackPile(b, hw - 1.3, -hd + 1.3, rng, 6);
    S(hw - 2.3, -hd + 0.3, hw - 0.3, -hd + 2.2);
    for (let i = 0; i < 3; i++) crate(b, -0.5 + i * 0.78, 0, -hd + 0.62);
    crate(b, 0.1, 0.6, -hd + 0.62, 0.9);
    S(-0.95, -hd + 0.3, 1.5, -hd + 0.95);
    const n = Math.max(1, Math.min(4, Math.floor((hd - 0.9) / 0.56)));
    for (let i = 0; i < n; i++) jar(b, hw - 0.52, 0, 0.1 + i * 0.56, 1.15, [0.66, 0.52, 0.42]);
    S(hw - 0.9, -0.2, hw - 0.15, 0.1 + n * 0.56);
    return;
  }
  if (kind === 'cottage') {
    // 茅舍：土炕、灶、矮桌、筐与锄
    const id = b.nextId(), kx = -hw + 1.2, kz = -hd + 0.82;
    b.box('earth', kx, 0.26, kz, 2.0, 0.52, 1.2, { color: [0.95, 0.92, 0.86], id });
    b.box('mat', kx, 0.54, kz, 1.9, 0.04, 1.1, { color: [0.98, 0.95, 0.86], id });
    b.box('cloth', kx - 0.6, 0.64, kz - 0.15, 0.6, 0.16, 0.7, { color: rng.pick(CLOTH_COLORS), lw: 0.6 });
    S(kx - 1.05, kz - 0.65, kx + 1.05, kz + 0.65);
    const zx = hw - 0.78, zz = -hd + 0.78, zid = b.nextId();
    b.box('earth', zx, 0.36, zz, 1.0, 0.72, 1.0, { color: [0.9, 0.86, 0.8], id: zid });
    b.sphere('flat', zx, 0.74, zz, 0.3, 0.12, 0.3, { color: [0.32, 0.32, 0.34], id: zid });
    b.box('flat', zx, 0.2, zz + 0.51, 0.3, 0.26, 0.02, { color: [0.3, 0.27, 0.25], lw: 0.5 });
    for (let i = 0; i < 4; i++) b.rod('wood', [zx - 0.9, 0.06 + (i % 2) * 0.1, zz - 0.3 + i * 0.12], [zx - 0.9, 0.06 + (i % 2) * 0.1, zz + 0.5 + i * 0.05], 0.04, 0.035, 5, { color: W_.dark, lw: 0.6 });
    S(zx - 0.55, zz - 0.55, zx + 0.55, zz + 0.55);
    table(b, 0.2, 0.1, 0.9, 0.6, 0.45);
    S(-0.25, -0.2, 0.65, 0.4, 0.5);
    basket(b, -hw + 0.6, 0, hd - 0.85, 1, [0.74, 0.82, 0.6]);
    b.rod('wood', [hw - 0.3, 0, hd - 0.6], [hw - 0.22, 1.5, hd - 0.95], 0.02, 0.02, 4, { color: W_.dark });
    b.box('flat', hw - 0.3, 0.06, hd - 0.52, 0.16, 0.03, 0.22, { color: [0.4, 0.4, 0.42], lw: 0.5 });
    return;
  }
  // 民居：床榻、桌凳、箱笼、衣桁
  const id = b.nextId(), bx = -hw + 1.3, bz = -hd + 0.85;
  b.box('wood', bx, 0.24, bz, 2.1, 0.48, 1.1, { color: W_.wood, id });
  b.box('wood', bx, 0.72, bz - 0.52, 2.1, 0.5, 0.06, { color: W_.wood, id });
  b.box('wood', bx - 1.02, 0.66, bz, 0.06, 0.38, 1.1, { color: W_.wood, id });
  b.box('mat', bx, 0.5, bz + 0.02, 1.96, 0.04, 0.96, { color: [0.98, 0.95, 0.88], id });
  // 枕在床头（有挡板的那一头），横着放；被子叠在床尾
  b.box('flat', bx - 0.8, 0.58, bz, 0.2, 0.12, 0.5, { color: [0.72, 0.8, 0.82], lw: 0.5 });
  b.box('cloth', bx + 0.5, 0.6, bz - 0.04, 0.8, 0.16, 0.8, { color: rng.pick(CLOTH_COLORS), lw: 0.6 });
  S(bx - 1.1, bz - 0.6, bx + 1.1, bz + 0.6);
  const tx = hw * 0.35, tz = -hd * 0.1;
  table(b, tx, tz, 1.1, 0.75);
  for (const sx of [-1, 1]) b.box('wood', tx + sx * 0.85, 0.22, tz, 0.34, 0.44, 0.34, { color: W_.dark });
  b.cyl('flat', tx - 0.12, 0.82, tz, 0.05, 0.08, 0.14, 6, { color: [0.93, 0.92, 0.88], lw: 0.6 });
  for (const dx of [0.12, 0.26]) b.cyl('flat', tx + dx, 0.82, tz + 0.1, 0.035, 0.028, 0.05, 6, { color: [0.93, 0.92, 0.88], lw: 0.5 });
  S(tx - 0.6, tz - 0.42, tx + 0.6, tz + 0.42, 0.9);
  const cx = hw - 0.55;
  b.box('wood', cx, 0.28, -hd + 0.95, 0.6, 0.56, 1.0, { color: W_.deep });
  b.box('wood', cx, 0.58, -hd + 0.95, 0.64, 0.05, 1.04, { color: W_.dark, lw: 0.6 });
  jar(b, cx - 0.05, 0, -hd + 2.0, 1.1);
  S(cx - 0.35, -hd + 0.4, cx + 0.35, -hd + 2.35);
  const rx = -hw + 0.45, rz = hd * 0.2;
  for (const dz of [-0.55, 0.55]) b.cyl('wood', rx, 0, rz + dz, 0.025, 0.03, 1.5, 5, { color: W_.dark });
  b.rod('wood', [rx, 1.48, rz - 0.7], [rx, 1.48, rz + 0.7], 0.022, 0.022, 5, { color: W_.dark });
  b.box('cloth', rx, 1.12, rz, 0.05, 0.72, 0.8, { color: rng.pick(CLOTH_COLORS), lw: 0.6 });
}

// kind：shop 铺面 / tea 茶坊 / house 民居 / store 塌房(货栈) / cottage 茅舍
// 所有屋子都进得去：返回的 solids / decks / ceils 是墙、地面与顶棚（局部坐标），由 layout.register 登记
export function house(b, o) {
  const rng = o.rng;
  const { w, d, h = 3.3, kind = 'shop', roofMat = 'tile', hip = 0, base = 0.25, tint = W_.wood } = o;
  const hw = w / 2, hd = d / 2, y0 = base, y1 = base + h;
  const bays = Math.max(1, Math.round(w / 3.3)), bw = w / bays;
  const wallMat = o.wall || 'plaster', wallC = o.wallColor || [1, 1, 1];
  const cottage = kind === 'cottage', open = kind === 'shop' || kind === 'tea';
  const T = 0.16, solids = [[-hw - T, -hd - T, hw + T, -hd + T], [-hw - T, -hd, -hw + T, hd], [hw - T, -hd, hw + T, hd]];
  const decks = [[-hw - 0.3, -hd - 0.3, hw + 0.3, hd + 0.3, y0]], ceils = [[-hw, -hd, hw, hd, open ? y1 : y1 + 0.6]];
  const S = (x0, z0, x1, z1, top = 1.4) => solids.push([x0, z0, x1, z1, 0, y0 + top]);
  b.box(cottage ? 'earth' : 'stone', 0, base / 2, 0, w + 0.6, base, d + 0.6, { color: cottage ? [0.95, 0.92, 0.86] : [1, 1, 1] });
  const frameId = b.nextId();
  for (let i = 0; i <= bays; i++) {
    for (const z of [-hd, hd]) column(b, -hw + i * bw, y0, z, h, cottage ? 0.105 : 0.13, tint, frameId);
    solids.push([-hw + i * bw - 0.15, hd - 0.15, -hw + i * bw + 0.15, hd + 0.15]);
  }
  for (const z of [-hd, hd]) b.box('wood', 0, y1 - 0.17, z, w + 0.34, 0.3, 0.2, { color: tint, id: frameId });
  for (const x of [-hw, hw]) b.box('wood', x, y1 - 0.17, 0, 0.2, 0.3, d + 0.34, { color: tint, id: frameId });
  // 后墙、山墙
  b.box(wallMat, 0, y0 + h / 2, -hd, w, h, 0.14, { color: wallC });
  for (const sx of [-1, 1]) {
    const x = sx * hw;
    b.box(wallMat, x, y0 + h / 2, 0, 0.14, h, d, { color: wallC });
    if (!cottage) b.box('wood', x + sx * 0.02, y0 + 1.12, 0, 0.16, 0.12, d, { color: tint, id: frameId });
    if (d > 5 && rng.chance(0.6)) b.box('lattice', x + sx * 0.04, y0 + 1.95, rng.f(-0.8, 0.8), 0.14, 1.1, 1.5);
  }
  // 正面各间
  const front = (i, type) => {
    const cx = -hw + (i + 0.5) * bw, fw = bw - 0.24, x0 = cx - bw / 2, x1 = cx + bw / 2;
    if (type === 'lattice') {
      b.box(wallMat, cx, y0 + 0.5, hd, fw, 1.0, 0.12, { color: wallC });
      b.box('lattice', cx, y0 + 1.75, hd, fw, 1.5, 0.1);
      b.box(wallMat, cx, y0 + (2.5 + h) / 2, hd, fw, h - 2.5, 0.12, { color: wallC });
      b.box('wood', cx, y0 + 1.0, hd + 0.03, fw, 0.1, 0.16, { color: tint, id: frameId });
      b.box('wood', cx, y0 + 2.5, hd + 0.03, fw, 0.1, 0.16, { color: tint, id: frameId });
      solids.push([x0, hd - T, x1, hd + T]);
    } else if (type === 'door') {
      const dw = Math.min(1.5, fw * 0.62), sw = (fw - dw) / 2, dh = Math.min(2.2, h - 0.5);
      for (const sx of [-1, 1]) b.box(wallMat, cx + sx * (dw / 2 + sw / 2), y0 + h / 2, hd, sw, h, 0.12, { color: wallC });
      b.box(wallMat, cx, y0 + (dh + h) / 2, hd, dw, h - dh, 0.12, { color: wallC });
      b.box('wood', cx, y0 + dh + 0.05, hd + 0.03, dw + 0.3, 0.12, 0.18, { color: tint, id: frameId });
      b.box('wood', cx, y0 + 0.04, hd, dw + 0.1, 0.08, 0.14, { color: tint, id: frameId }); // 门槛
      for (const sx of [-1, 1]) b.box('wood', cx + sx * (dw / 2 + 0.05), y0 + dh / 2, hd + 0.02, 0.1, dh, 0.16, { color: tint, id: frameId });
      // 两扇版门都向里敞着
      const th = 1.36, l = dw / 2;
      for (const sx of [-1, 1]) b.box('wood', cx + sx * (dw / 2 - (Math.cos(th) * l) / 2), y0 + dh / 2, hd - (Math.sin(th) * l) / 2 - 0.05, l, dh, 0.06, { color: W_.dark, ry: sx < 0 ? th : Math.PI - th });
      solids.push([x0, hd - T, cx - dw / 2, hd + T], [cx + dw / 2, hd - T, x1, hd + T]);
    } else if (type === 'boards') {
      b.box('wood', cx, y0 + h / 2, hd, fw, h, 0.1, { color: W_.dark });
      b.box('wood', cx, y0 + h * 0.5, hd + 0.04, fw, 0.1, 0.1, { color: tint, id: frameId });
      solids.push([x0, hd - T, x1, hd + T]);
    } else if (type === 'counter') {
      // 只有一间的小铺，柜台让出半边好进人
      const cw = bays === 1 ? fw * 0.56 : fw, ccx = bays === 1 ? cx - (fw - cw) / 2 : cx, id = b.nextId();
      b.box('wood', ccx, y0 + 0.48, hd - 0.4, cw, 0.96, 0.5, { color: tint, id });
      b.box('wood', ccx, y0 + 0.99, hd - 0.4, cw + 0.1, 0.06, 0.62, { color: W_.pale, id });
      const n = bays === 1 ? 2 : rng.i(2, 4);
      for (let k = 0; k < n; k++) {
        const jx = ccx - cw / 2 + 0.3 + (k * (cw - 0.6)) / Math.max(1, n - 1);
        if (rng.chance(0.5)) b.cyl('flat', jx, y0 + 1.02, hd - 0.4, 0.06, 0.1, rng.f(0.18, 0.3), 6, { color: rng.pick(JAR_COLORS), lw: 0.6 });
        else b.box('flat', jx, y0 + 1.1, hd - 0.4, 0.26, 0.16, 0.2, { color: rng.pick(JAR_COLORS), lw: 0.6 });
      }
      S(ccx - cw / 2 - 0.05, hd - 0.7, ccx + cw / 2 + 0.05, hd - 0.1, 1.05);
    } else if (type === 'wall') {
      b.box(wallMat, cx, y0 + h / 2, hd, fw, h, 0.12, { color: wallC });
      solids.push([x0, hd - T, x1, hd + T]);
    }
  };
  let types = [];
  for (let i = 0; i < bays; i++) {
    const mid = i === Math.floor(bays / 2);
    if (kind === 'shop') types.push(bays > 1 && mid ? 'open' : 'counter');
    else if (kind === 'tea') types.push('open');
    else if (kind === 'store') types.push(mid ? 'door' : 'boards');
    else if (kind === 'cottage') types.push(mid ? 'door' : rng.chance(0.5) ? 'lattice' : 'wall');
    else types.push(mid ? 'door' : 'lattice');
  }
  if (bays === 1 && kind === 'shop') types[0] = 'counter';
  if (o.fronts) types = o.fronts(bays);
  const tables = [];
  types.forEach((t, i) => {
    front(i, t);
    if ((t === 'open' || t === 'counter') && h > 3 && rng.chance(0.38)) blind(b, -hw + (i + 0.5) * bw, y1 - 0.36, hd + 0.03, bw - 0.34, rng.f(0.45, 1.05));
  });
  // 室内
  if (open) {
    b.box(wallMat, 0, y0 + h / 2, -hd + 0.11, w - 0.3, h, 0.04, { color: SHADE, lw: 0.5 });
    for (const sx of [-1, 1]) b.box(wallMat, sx * (hw - 0.11), y0 + h / 2, 0, 0.04, h, d - 0.3, { color: SHADE, lw: 0.5 });
    b.box('wood', 0, y1 - 0.03, 0, w - 0.3, 0.06, d - 0.3, { color: W_.deep, lw: 0.5 });
    const outer = b.chunk;
    b.chunk = 'in:' + Math.floor(b.M.elements[12] / 36) + ':' + Math.floor(b.M.elements[14] / 36);
    if (kind === 'shop') {
      for (let i = 0; i < bays; i++) if (rng.chance(0.85)) shelf(b, -hw + (i + 0.5) * bw, y0, -hd + 0.34, bw - 0.7, rng);
      solids.push([-hw, -hd, hw, -hd + 0.6]);
    } else {
      const n = Math.max(1, Math.round(w / 3.6));
      for (let i = 0; i < n; i++) {
        const tx = -hw + ((i + 0.5) * w) / n, tz = rng.f(-hd * 0.4, hd * 0.2);
        tables.push([tx, tz]);
        b.place(0, y0, 0, 0, () => {
          table(b, tx, tz, 1.2, 0.8);
          bench(b, tx, tz - 0.68, 1.1);
          bench(b, tx, tz + 0.68, 1.1);
        });
        if (rng.chance(0.7)) b.cyl('flat', tx + 0.2, y0 + 0.82, tz, 0.05, 0.08, 0.16, 6, { color: [0.93, 0.92, 0.88], lw: 0.6 });
        S(tx - 0.62, tz - 0.88, tx + 0.62, tz + 0.88, 0.95);
      }
      // 茶炉
      b.cyl('stone', -hw + 0.9, y0, -hd + 0.8, 0.34, 0.4, 0.7, 8, {});
      b.cyl('flat', -hw + 0.9, y0 + 0.7, -hd + 0.8, 0.16, 0.24, 0.26, 8, { color: [0.4, 0.38, 0.36] });
      S(-hw + 0.45, -hd + 0.35, -hw + 1.35, -hd + 1.25);
    }
    b.chunk = outer;
  } else interior(b, () => b.place(0, y0, 0, 0, () => furnish(b, kind, hw - 0.1, hd - 0.1, rng, S)));
  // 屋顶
  const r = roof(b, {
    hw, hd, y: y1, hip, mat: roofMat,
    pitch: o.pitch ?? (roofMat === 'thatch' ? 0.82 : 0.56),
    oe: o.oe ?? (roofMat === 'thatch' ? 0.75 : 0.95),
    og: roofMat === 'thatch' ? 0.5 : 0.6,
    thick: roofMat === 'thatch' ? 0.28 : 0.12,
    lift: roofMat === 'thatch' ? 0 : undefined,
    ridgeMat: roofMat === 'thatch' ? 'thatch' : 'flat',
    ridgeColor: roofMat === 'thatch' ? [0.86, 0.8, 0.72] : RIDGE,
    gable: wallMat, gableColor: wallC,
    under: roofMat === 'thatch' ? 'wood' : 'rafter',
    underColor: roofMat === 'thatch' ? [0.9, 0.82, 0.7] : [1, 1, 1],
  });
  // 凉棚
  if (o.awning) {
    const aw = w * 0.92, ad = o.awning, yA = y1 - 0.5, yB = yA - 0.55, zA = hd + 0.2, zB = hd + ad;
    const id = b.nextId();
    b.quad('mat', [-aw / 2, yB, zB], [aw / 2, yB, zB], [aw / 2, yA, zA], [-aw / 2, yA, zA], { id, us: aw / 2, vs: ad / 2 });
    for (const sx of [-1, 1]) {
      b.cyl('wood', sx * (aw / 2 - 0.1), 0, zB - 0.1, 0.045, 0.055, yB, 5, { color: W_.dark, id });
      b.beam('wood', [sx * (aw / 2 - 0.1), yB, zB - 0.1], [sx * (aw / 2 - 0.1), yA, zA], 0.05, 0.05, { color: W_.dark, id });
    }
    b.beam('wood', [-aw / 2, yB, zB - 0.02], [aw / 2, yB, zB - 0.02], 0.05, 0.05, { color: W_.dark, id });
  }
  return { y0, y1, top: r.top, bays, bw, tables, types, solids, decks, ceils };
}

// 正店/脚店：两层酒楼，都进得去、上得去。底层檐下四铺作托腰檐，楼梯贴后壁而上，
// 平坐斗拱托二层回廊，上覆歇山顶、鸱尾。返回 solids / decks / ramps / ceils 与座位 seats
export function restaurant(b, o) {
  const rng = o.rng, { w, d } = o;
  const base = 0.4, h1 = 3.9, hw = w / 2, hd = d / 2, y0 = base, y1 = base + h1, tint = W_.red, T = 0.16;
  const solids = [[-hw - T, -hd - T, hw + T, -hd + T, 0, y1 + 1.2], [-hw - T, -hd, -hw + T, hd, 0, y1 + 1.2], [hw - T, -hd, hw + T, hd, 0, y1 + 1.2]];
  const sw0 = Math.min(3, w * 0.2);
  const decks = [[-hw - 0.5, -hd - 0.5, hw + 0.5, hd + 0.5, y0], [-sw0, hd + 0.4, sw0, hd + 1.2, base / 2]], ramps = [], ceils = [[-hw, -hd, hw, hd, y1]], seats = [];
  b.box('stone', 0, base / 2, 0, w + 1, base, d + 1, {});
  b.box('stone', 0, base / 4, hd + 0.8, sw0 * 2, base / 2, 0.8, {});
  const bays = Math.round(w / 3.4), bw = w / bays, zb = Math.max(2, Math.round(d / 3.6));
  const fid = b.nextId();
  for (let i = 0; i <= bays; i++) {
    for (const z of [-hd, hd]) column(b, -hw + i * bw, y0, z, h1, 0.17, tint, fid);
    solids.push([-hw + i * bw - 0.2, hd - 0.2, -hw + i * bw + 0.2, hd + 0.2, 0, y1]);
  }
  for (const z of [-hd, hd]) b.box('wood', 0, y1 - 0.2, z, w + 0.36, 0.34, 0.22, { color: tint, id: fid });
  for (const x of [-hw, hw]) b.box('wood', x, y1 - 0.2, 0, 0.22, 0.34, d + 0.36, { color: tint, id: fid });
  b.box('plaster', 0, y0 + h1 / 2, -hd, w, h1, 0.14, {});
  for (const sx of [-1, 1]) {
    b.box('plaster', sx * hw, y0 + h1 / 2, 0, 0.14, h1, d, {});
    b.box('lattice', sx * (hw + 0.04), y0 + 2.0, 0, 0.14, 1.3, d * 0.6);
  }
  // 正面：当中敞开迎客，两侧格子窗
  for (let i = 0; i < bays; i++) {
    const cx = -hw + (i + 0.5) * bw, fw = bw - 0.3;
    const mid = Math.abs(i - (bays - 1) / 2) < 1;
    if (!mid) {
      b.box('plaster', cx, y0 + 0.5, hd, fw, 1.0, 0.12, {});
      b.box('lattice', cx, y0 + 1.9, hd, fw, 1.8, 0.1);
      for (const yy of [1.0, 2.8]) b.box('wood', cx, y0 + yy, hd + 0.03, fw, 0.1, 0.16, { color: tint, id: fid });
      solids.push([cx - bw / 2, hd - T, cx + bw / 2, hd + T, 0, y1]);
    }
    b.box('lattice', cx, y1 - 0.75, hd, fw, 0.6, 0.08);
  }
  b.box('plaster', 0, y0 + h1 / 2, -hd + 0.11, w - 0.3, h1, 0.04, { color: SHADE, lw: 0.5 });
  // 二层与楼梯的尺寸
  const w2 = w - 3.2, d2 = d - 3.2, hw2 = w2 / 2, hd2 = d2 / 2, y2 = y1 + 1.75, h2 = 2.9, y3 = y2 + h2;
  const bays2 = Math.round(w2 / 3.2), bw2 = w2 / bays2, zb2 = Math.max(2, Math.round(d2 / 3.4));
  const SL = 0.84, rise = y2 - y0, run = rise / SL; // 楼梯约 40°
  const sz0 = -hd2 + 0.2, sz1 = sz0 + 1.3, sxb = Math.min(hw2 - 1.6, run / 2 + 0.6), sxa = sxb - run;
  const xc1 = sxa + (h1 - 2.1) / SL, xc2 = sxa + (rise - 2.3) / SL; // 一层顶棚、二层楼板各自开洞的起点
  const outer = b.chunk;
  b.chunk = 'in:' + Math.floor(b.M.elements[12] / 36) + ':' + Math.floor(b.M.elements[14] / 36);
  // 底层：酒桌
  const n1 = w > 16 ? 5 : 3;
  for (let i = 0; i < n1; i++) {
    const tx = -hw + 1.9 + i * ((w - 3.8) / (n1 - 1)), tz = rng.f(sz1 + 1.9, hd - 2.0);
    b.place(0, y0, 0, 0, () => {
      table(b, tx, tz, 1.2, 0.9);
      bench(b, tx, tz - 0.7, 1.1);
      bench(b, tx, tz + 0.7, 1.1);
    });
    b.cyl('flat', tx + 0.2, y0 + 0.82, tz, 0.05, 0.08, 0.16, 6, { color: [0.93, 0.92, 0.88], lw: 0.6 });
    solids.push([tx - 0.62, tz - 0.9, tx + 0.62, tz + 0.9, 0, y0 + 0.95]);
    seats.push([tx, y0, tz - 0.7, 0], [tx, y0, tz + 0.7, Math.PI]);
  }
  // 酒柜：一排酒瓮
  for (let i = 0; i < 4; i++) jar(b, -hw + 0.6, y0, -hd + 0.7 + i * 0.6, 1.25, [0.66, 0.52, 0.42]);
  solids.push([-hw, -hd, -hw + 1.05, -hd + 2.9, 0, y0 + 1.2]);
  // 楼梯：两根斜梁、踏板、扶手
  const sid = b.nextId(), so = { color: W_.wood, id: sid };
  for (const z of [sz0 + 0.07, sz1 - 0.07]) b.beam('wood', [sxa, y0 + 0.02, z], [sxb, y2 - 0.1, z], 0.26, 0.09, so);
  const nst = Math.round(rise / 0.235);
  for (let k = 1; k <= nst; k++) b.box('wood', sxa + ((k - 0.5) * run) / nst, y0 + (k * rise) / nst - 0.03, (sz0 + sz1) / 2, run / nst + 0.04, 0.05, 1.16, { color: W_.pale, id: sid, lw: 0.6 });
  for (const z of [sz0 + 0.05, sz1 - 0.05]) {
    const pts = [];
    for (let k = 0; k <= 4; k++) pts.push([sxa + (run * k) / 4, y0 + (rise * k) / 4, z]);
    railing(b, pts, 0.9, tint);
  }
  b.box('wood', sxb + 0.05, (y0 + y1) / 2, (sz0 + sz1) / 2, 0.06, h1, 1.3, { color: W_.dark }); // 梯下隔板
  for (const z of [sz0 - 0.04, sz1 + 0.04]) b.box('wood', (xc1 + sxb) / 2, (y1 + y2) / 2 - 0.1, z, sxb - xc1, y2 - y1 - 0.2, 0.05, { color: W_.dark, lw: 0.6 }); // 梯井两壁
  b.chunk = outer;
  ramps.push([sxa, sz0, sxb, sz1, 'x', y0, y2]);
  solids.push([sxa, sz0 - 0.1, sxb, sz0, y0, y2 + 1.0], [sxa, sz1, xc2, sz1 + 0.1, y0, y1], [xc2, sz1, sxb, sz1 + 0.1, y0, y2 + 1.0], [sxb, sz0, sxb + 0.1, sz1, y0, y2 - 0.5]);
  // 开了梯洞的板：rects 拼出洞外的部分
  const slab = (X, Z, x0, yy, th, opt) => {
    for (const [a0, c0, a1, c1] of [[-X, sz1, X, Z], [-X, -Z, X, sz0], [-X, sz0, x0, sz1], [sxb, sz0, X, sz1]]) b.box('wood', (a0 + a1) / 2, yy, (c0 + c1) / 2, a1 - a0, th, c1 - c0, opt);
  };
  slab(hw - 0.15, hd - 0.15, xc1, y1 - 0.03, 0.06, { color: W_.deep, lw: 0.5 });
  // 底层檐下斗拱与腰檐
  const r1 = dougongRing(b, hw, hd, y1, bracketSpots(hw, bays, 1), bracketSpots(hd, zb, 1), 0.62, 1);
  roof(b, { hw: hw + r1.out, hd: hd + r1.out, y: y1 + r1.h, hip: 1, sFrom: 0.5, pitch: 0.5, oe: 1.1, lift: 0.3, ridge: false });
  // 平坐：斗拱托起二层回廊
  // 回廊出挑 1.6 米：墙与栏杆之间净宽一米二有余，人走得开（原先只七十厘米，正好卡住）
  dougongRing(b, hw2 + 0.95, hd2 + 0.95, y2 - 0.65, bracketSpots(hw2 + 0.95, bays2, 1), bracketSpots(hd2 + 0.95, zb2, 1), 0.5, 1);
  const X2 = hw2 + 1.6, Z2 = hd2 + 1.6;
  slab(X2, Z2, xc2, y2 - 0.1, 0.2, { color: tint });
  decks.push([-X2, sz1, X2, Z2, y2], [-X2, -Z2, X2, sz0, y2], [-X2, sz0, xc2, sz1, y2], [sxb, sz0, X2, sz1, y2]);
  ceils.push([-hw2, -hd2, hw2, hd2, y3 + 0.5]);
  const rp = [];
  const rx = hw2 + 1.5, rz = hd2 + 1.5, nrx = Math.round((rx * 2) / 1.6), nrz = Math.round((rz * 2) / 1.6);
  for (let i = 0; i <= nrx; i++) rp.push([-rx + (i * 2 * rx) / nrx, y2, rz]);
  for (let i = 1; i <= nrz; i++) rp.push([rx, y2, rz - (i * 2 * rz) / nrz]);
  for (let i = 1; i <= nrx; i++) rp.push([rx - (i * 2 * rx) / nrx, y2, -rz]);
  for (let i = 1; i <= nrz; i++) rp.push([-rx, y2, -rz + (i * 2 * rz) / nrz]);
  railing(b, rp, 0.85, tint);
  for (const sg of [-1, 1]) solids.push([-rx, sg * rz - 0.08, rx, sg * rz + 0.08, y2, y2 + 0.95], [sg * rx - 0.08, -rz, sg * rx + 0.08, rz, y2, y2 + 0.95]);
  // 二层：柱、格子窗；临街当中一间开门通回廊
  const fid2 = b.nextId(), door2 = Math.floor(bays2 / 2), W2 = [y2, y3 + 2.5];
  for (let i = 0; i <= bays2; i++) for (const z of [-hd2, hd2]) column(b, -hw2 + i * bw2, y2, z, h2, 0.14, tint, fid2);
  for (const z of [-hd2, hd2]) b.box('wood', 0, y3 - 0.18, z, w2 + 0.3, 0.3, 0.2, { color: tint, id: fid2 });
  for (const x of [-hw2, hw2]) b.box('wood', x, y3 - 0.18, 0, 0.2, 0.3, d2 + 0.3, { color: tint, id: fid2 });
  for (let i = 0; i < bays2; i++) {
    const cx = -hw2 + (i + 0.5) * bw2;
    for (const sz of [-1, 1]) {
      if (sz > 0 && i === door2) {
        b.box('lattice', cx, y3 - 0.6, hd2, bw2 - 0.26, 0.5, 0.08);
        solids.push([cx - bw2 / 2 - 0.15, hd2 - T, cx - bw2 / 2 + 0.2, hd2 + T, ...W2], [cx + bw2 / 2 - 0.2, hd2 - T, cx + bw2 / 2 + 0.15, hd2 + T, ...W2]);
        continue;
      }
      b.box('lattice', cx, y2 + 1.55, sz * hd2, bw2 - 0.26, 1.9, 0.1);
      b.box('plaster', cx, y2 + 0.3, sz * hd2, bw2 - 0.26, 0.6, 0.1, {});
      b.box('wood', cx, y2 + 0.62, sz * (hd2 + 0.03), bw2 - 0.26, 0.09, 0.16, { color: tint, id: fid2 });
      solids.push([cx - bw2 / 2, sz * hd2 - T, cx + bw2 / 2, sz * hd2 + T, ...W2]);
      // 阁上垂帘
      if (sz > 0 && rng.chance(0.6)) blind(b, cx, y3 - 0.36, hd2 + 0.09, bw2 - 0.4, rng.f(0.3, 0.75));
    }
  }
  for (const sx of [-1, 1]) {
    b.box('lattice', sx * hw2, y2 + 1.55, 0, 0.1, 1.9, d2 - 0.3);
    b.box('plaster', sx * hw2, y2 + 0.3, 0, 0.1, 0.6, d2 - 0.3, {});
    solids.push([sx * hw2 - T, -hd2, sx * hw2 + T, hd2, ...W2]);
  }
  // 楼上雅座
  b.chunk = 'in:' + Math.floor(b.M.elements[12] / 36) + ':' + Math.floor(b.M.elements[14] / 36);
  const n2 = w > 16 ? 4 : 3;
  for (let i = 0; i < n2; i++) {
    const tx = -hw2 + 1.6 + i * ((w2 - 3.2) / (n2 - 1)), tz = rng.f(sz1 + 1.7, hd2 - 1.5);
    b.place(0, y2, 0, 0, () => {
      table(b, tx, tz, 1.2, 0.9);
      bench(b, tx, tz - 0.7, 1.1);
      bench(b, tx, tz + 0.7, 1.1);
    });
    b.cyl('flat', tx - 0.2, y2 + 0.82, tz, 0.05, 0.08, 0.16, 6, { color: [0.93, 0.92, 0.88], lw: 0.6 });
    solids.push([tx - 0.62, tz - 0.9, tx + 0.62, tz + 0.9, y2, y2 + 0.95]);
    seats.push([tx, y2, tz - 0.7, 0], [tx, y2, tz + 0.7, Math.PI]);
  }
  b.chunk = outer;
  // 上檐五铺作，歇山顶
  const r2 = dougongRing(b, hw2, hd2, y3, bracketSpots(hw2, bays2, 1), bracketSpots(hd2, zb2, 1), 0.6, 2);
  const r = roof(b, { hw: hw2 + r2.out, hd: hd2 + r2.out, y: y3 + r2.h, hip: 0.55, pitch: 0.62, oe: 1.15, lift: 0.36, gableColor: [0.92, 0.86, 0.78], ridgeEnd: 'chiwei', ridgeScale: 1.25, gableFrame: false });
  return { y0, y1, y2, top: r.top, solids, decks, ramps, ceils, seats };
}

// 彩楼欢门：酒楼门前迎客的彩楼——朱漆的竿扎成三间，层层蒙彩帛、扎花格，顶上攒尖的山花挑着绣球小旗，
// 门楣下垂横帔、挂栀子灯。立在街沿上，不贴着屋檐；当中一间走人，立柱挡人。
export function huanmen(b, w, h, rng) {
  const D = 1.2, id = b.nextId(), red = W_.red, pole = { color: red, id };
  const xs = [-w / 2, -w * 0.2, w * 0.2, w / 2];
  const Y0 = 3.25, DY = 1.2, tops = [h * 0.72, h, h * 0.72];
  // 彩帛只用四色：朱、白、藤黄、青；一层两色相间，不做成百衲布
  const SILK = [[0.9, 0.45, 0.38], [1.07, 1.03, 0.95], [0.96, 0.82, 0.52], [0.62, 0.72, 0.8]];
  const ROWS = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 1]];
  const FLOWER = [[0.88, 0.38, 0.34], [0.97, 0.68, 0.62], [1.1, 1.06, 0.98], [0.94, 0.78, 0.42]];
  const solids = [];
  // 立柱前后两排，柱脚垫石
  xs.forEach((x, i) => {
    const t = Math.max(tops[Math.max(0, i - 1)], tops[Math.min(2, i)]);
    for (const z of [0, -D]) {
      b.cyl('wood', x, 0, z, 0.075, 0.1, t + 0.3, 7, pole);
      b.box('stone', x, 0.13, z, 0.36, 0.26, 0.36, { lw: 0.6 });
    }
    for (let y = Y0; y <= t + 0.01; y += DY * 2) b.rod('wood', [x, y, 0], [x, y, -D], 0.04, 0.04, 5, pole);
    solids.push([x - 0.2, -D - 0.2, x + 0.2, 0.2, 0, 4.6]);
  });
  for (let i = 0; i < 3; i++) {
    const x0 = xs[i], x1 = xs[i + 1], top = tops[i], bw = x1 - x0, cx = (x0 + x1) / 2;
    const nl = Math.max(1, Math.round((top - Y0) / DY)), dy = (top - Y0) / nl;
    for (const z of [0, -D]) for (let k = 0; k <= nl; k++) b.rod('wood', [x0 - 0.22, Y0 + k * dy, z], [x1 + 0.22, Y0 + k * dy, z], 0.05, 0.05, 5, pole);
    // 每层分若干格：一格蒙彩帛，一格扎交叉细竿、当心缀一朵花
    const nc = Math.max(2, Math.round(bw / 1.25)), cw = bw / nc;
    for (let k = 0; k < nl; k++) {
      const ya = Y0 + k * dy, yb = ya + dy;
      for (let j = 0; j < nc; j++) {
        const xa = x0 + j * cw, xb = xa + cw;
        if (j) b.rod('wood', [xa, ya, 0], [xa, yb, 0], 0.03, 0.03, 4, pole);
        if (k % 2 === 0 && (j + i) % 2 === 0) {
          b.quad('cloth', [xa + 0.07, ya + 0.08, 0.02], [xb - 0.07, ya + 0.08, 0.02], [xb - 0.07, yb - 0.08, 0.02], [xa + 0.07, yb - 0.08, 0.02], { color: SILK[ROWS[(k >> 1) % ROWS.length][(j >> 1) % 2]], lw: 0.5, double: true });
        } else {
          b.rod('wood', [xa, ya, 0], [xb, yb, 0], 0.022, 0.022, 4, pole);
          b.rod('wood', [xb, ya, 0], [xa, yb, 0], 0.022, 0.022, 4, pole);
          b.sphere('flat', (xa + xb) / 2, (ya + yb) / 2, 0.07, 0.17, 0.17, 0.1, { color: rng.pick(FLOWER), ws: 7, hs: 5, lw: 0.5 });
        }
      }
      // 层间垂彩：绸带兜成弧
      if (k) {
        const col = rng.pick(SILK), rid = b.nextId();
        let prev = null;
        for (let q = 0; q <= 8; q++) {
          const t = q / 8, pnt = [x0 + bw * t, ya - 0.34 * 4 * t * (1 - t), 0.09];
          if (prev) b.beam('flat', prev, pnt, 0.15, 0.02, { color: col, id: rid, lw: 0.5 });
          prev = pnt;
        }
      }
    }
    // 山花：攒尖的三角彩帛，尖上一颗绣球、一面小旗
    const ah = bw * 0.44, apex = [cx, top + ah, -D / 2];
    for (const z of [0, -D]) for (const xe of [x0 - 0.22, x1 + 0.22]) b.rod('wood', [xe, top, z], apex, 0.04, 0.03, 5, pole);
    b.raw('cloth', [x0, top + 0.06, 0.01, x1, top + 0.06, 0.01, cx, top + ah - 0.3, -D / 2 + 0.1], [0, 0, 1, 0, 0.5, 1], [0, 1, 2], { color: rng.pick(SILK), lw: 0.5, double: true });
    for (let q = 1; q < 4; q++) for (const sg of [-1, 1]) b.sphere('flat', cx + sg * (bw / 2) * (1 - q / 4), top + ah * (q / 4), -(D / 2) * (q / 4) + 0.06, 0.13, 0.13, 0.1, { color: rng.pick(FLOWER), ws: 6, hs: 5, lw: 0.5 });
    b.sphere('flat', apex[0], apex[1] + 0.2, apex[2], 0.27, 0.27, 0.27, { color: [0.9, 0.36, 0.3], ws: 8, hs: 6 });
    b.rod('wood', [apex[0], apex[1] + 0.3, apex[2]], [apex[0], apex[1] + 2.1, apex[2]], 0.025, 0.02, 4, pole);
    b.quad('flag', [apex[0], apex[1] + 1.3, apex[2]], [apex[0] + 1.15, apex[1] + 1.42, apex[2]], [apex[0] + 1.15, apex[1] + 2.0, apex[2]], [apex[0], apex[1] + 2.0, apex[2]], { color: rng.pick(SILK), windV: [0, 0.8, 0.8, 0], lw: 0.5, double: true });
    // 门楣下一道横帔：红白相间的布条
    const n = Math.max(4, Math.round(bw / 0.36)), sw = bw / n, vid = b.nextId();
    for (let k = 0; k < n; k++) {
      const xa = x0 + k * sw, drop = 0.42 + 0.16 * Math.sin((k / (n - 1)) * Math.PI);
      b.quad('flat', [xa, Y0 - drop, 0.05], [xa + sw, Y0 - drop, 0.05], [xa + sw, Y0, 0.05], [xa, Y0, 0.05], { color: k % 2 ? [1.08, 1.04, 0.96] : [0.88, 0.44, 0.38], id: vid, lw: 0.4, double: true });
    }
  }
  // 栀子灯：门两侧各一对
  for (const x of [xs[0] + 0.55, xs[1] - 0.55, xs[2] + 0.55, xs[3] - 0.55]) lantern(b, x, Y0 - 0.5, 0.16, 1.6);
  return { solids, lot: false };
}

// ───────────────────────── 摊棚 ─────────────────────────
export function wares(b, x, y, z, w, d, rng) {
  const n = rng.i(4, 8);
  for (let i = 0; i < n; i++) {
    const px = x + rng.f(-w / 2, w / 2), pz = z + rng.f(-d / 2, d / 2);
    const k = rng.i(0, 3);
    if (k === 0) b.sphere('flat', px, y + 0.07, pz, 0.08, 0.07, 0.08, { color: rng.pick([[0.9, 0.55, 0.4], [0.95, 0.85, 0.55], [0.94, 0.93, 0.9], [0.75, 0.82, 0.6]]), lw: 0.5, ws: 6, hs: 5 });
    else if (k === 1) b.cyl('flat', px, y, pz, 0.05, 0.08, rng.f(0.12, 0.24), 6, { color: rng.pick(JAR_COLORS), lw: 0.6 });
    else b.box('flat', px, y + 0.05, pz, 0.22, 0.1, 0.16, { color: rng.pick(JAR_COLORS), lw: 0.6, ry: rng.f(3) });
  }
}
export function parasolStall(b, rng, o = {}) {
  const col = o.color || rng.pick(CLOTH_COLORS);
  const id = b.nextId();
  b.cyl('wood', 0, 0, 0, 0.04, 0.05, 2.55, 5, { color: W_.dark, id });
  b.cyl('cloth', 0, 2.3, 0, 0.06, o.r || 1.55, 0.5, 12, { color: col, open: true, id });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, r = (o.r || 1.55) * 0.98;
    b.rod('wood', [0, 2.72, 0], [Math.cos(a) * r, 2.31, Math.sin(a) * r], 0.015, 0.015, 3, { color: W_.deep, id, lw: 0.5 });
  }
  if (o.bare) return;
  table(b, 0.45, 0.25, 1.3, 0.75, 0.74);
  wares(b, 0.45, 0.78, 0.25, 1.0, 0.5, rng);
}
export function shedStall(b, rng, w = 2.6) {
  const id = b.nextId();
  for (const sx of [-1, 1]) {
    b.cyl('wood', sx * (w / 2), 0, -0.7, 0.04, 0.05, 2.5, 5, { color: W_.dark, id });
    b.cyl('wood', sx * (w / 2), 0, 0.8, 0.04, 0.05, 2.1, 5, { color: W_.dark, id });
  }
  b.quad('mat', [-w / 2 - 0.2, 2.05, 1.0], [w / 2 + 0.2, 2.05, 1.0], [w / 2 + 0.2, 2.52, -0.85], [-w / 2 - 0.2, 2.52, -0.85], { us: w / 2, vs: 1 });
  table(b, 0, 0.1, w - 0.4, 0.8, 0.76);
  wares(b, 0, 0.8, 0.1, w - 0.8, 0.5, rng);
}

// ───────────────────────── 草木 ─────────────────────────
function card(b, key, cx, cy, cz, w, h, yaw, o) {
  const dx = (Math.cos(yaw) * w) / 2, dz = (Math.sin(yaw) * w) / 2;
  b.quad(key, [cx - dx, cy - h / 2, cz - dz], [cx + dx, cy - h / 2, cz + dz], [cx + dx, cy + h / 2, cz + dz], [cx - dx, cy + h / 2, cz - dz], o);
}
// 一片叶：法线取自树冠中心向外（略偏上），整棵树冠才有统一的明暗
function leafCard(b, key, c, w, h, yaw, tilt, center, o) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
  const rx = (cy * w) / 2, rz = (sy * w) / 2, ux = (-sy * st * h) / 2, uy = (ct * h) / 2, uz = (cy * st * h) / 2;
  const P = [c[0] - rx - ux, c[1] - uy, c[2] - rz - uz, c[0] + rx - ux, c[1] - uy, c[2] + rz - uz, c[0] + rx + ux, c[1] + uy, c[2] + rz + uz, c[0] - rx + ux, c[1] + uy, c[2] - rz + uz];
  const N = [];
  for (let i = 0; i < 4; i++) {
    const nx = P[i * 3] - center[0], ny = P[i * 3 + 1] - center[1] + 0.6, nz = P[i * 3 + 2] - center[2], l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
  }
  b.raw(key, P, [0, 0, 1, 0, 1, 1, 0, 1], [0, 1, 2, 0, 2, 3], { ...o, normals: N });
}
// 一条柳丝：自 base 垂下的窄带，越往梢头越随风
function willowStrand(b, base, L, w, yaw, out, center, o) {
  const dx = (Math.cos(yaw) * w) / 2, dz = (Math.sin(yaw) * w) / 2;
  const P = [], N = [], UV = [], IDX = [], WV = [];
  for (let k = 0; k <= 3; k++) {
    const f = k / 3, x = base[0] + out[0] * f * f, y = base[1] - L * f, z = base[2] + out[1] * f * f;
    P.push(x - dx, y, z - dz, x + dx, y, z + dz);
    UV.push(0, 1 - f, 1, 1 - f);
    const wv = [0.04, 0.3, 0.68, 1.0][k];
    WV.push(wv, wv);
    for (let j = 0; j < 2; j++) {
      const nx = x - center[0], ny = y - center[1] + 1.4, nz = z - center[2], l = Math.hypot(nx, ny, nz) || 1;
      N.push(nx / l, ny / l, nz / l);
    }
    if (k < 3) IDX.push(k * 2, k * 2 + 1, k * 2 + 3, k * 2, k * 2 + 3, k * 2 + 2);
  }
  b.raw('willow', P, UV, IDX, { ...o, normals: N, windV: WV });
}
// 弯曲的枝：a→c，中段朝 bend 拱出；返回路径上的点
function bough(b, a, c, bend, r0, r1, n, o) {
  const pts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, w = 4 * t * (1 - t);
    pts.push([a[0] + (c[0] - a[0]) * t + bend[0] * w, a[1] + (c[1] - a[1]) * t + bend[1] * w, a[2] + (c[2] - a[2]) * t + bend[2] * w, r0 + (r1 - r0) * Math.sqrt(t)]);
  }
  b.tube('bark', pts, { seg: o.seg || 5, capA: false, capB: false, id: o.id, lw: o.lw ?? 0.45, color: o.color });
  return pts;
}
// 树干：自地面到分杈处，根部鼓出，略带歪扭
function trunk(b, H, r, lean, rng, o) {
  const pts = [], n = o.n || 5, ph = rng.f(6.28);
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push([lean[0] * t * t + Math.sin(t * 4.2 + ph) * r * 0.5 * t, -0.2 + (H + 0.2) * t, lean[1] * t * t + Math.cos(t * 3.3 + ph) * r * 0.5 * t, r * (1 + 0.55 * Math.max(0, 1 - t * n * 0.7)) * (1 - (o.taper ?? 0.28) * t)]);
  }
  b.tube('bark', pts, { seg: o.seg || 7, capA: false, id: o.id, lw: 0.75, color: o.color });
  return pts;
}
const along = (pts, f) => {
  const x = Math.min(pts.length - 1.001, Math.max(0, f * (pts.length - 1))), i = Math.floor(x), t = x - i, a = pts[i], c = pts[i + 1];
  return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
};

// 柳：大枝先扬后垂，沿枝挂下一条条柳丝，垂到离地不远
function willowTree(b, rng, s, fid, tid) {
  const H = rng.f(3.0, 3.9) * s, r = rng.f(0.34, 0.46) * s;
  const tp = trunk(b, H, r, [rng.f(-0.6, 0.6) * s, rng.f(-0.6, 0.6) * s], rng, { id: tid });
  const p = tp[tp.length - 1];
  b.sphere('bark', p[0], p[1], p[2], r * 0.95, r * 0.8, r * 0.95, { id: tid, ws: 7, hs: 5, lw: 0.6 });
  const center = [p[0], p[1] + 1.2 * s, p[2]];
  const hang = (base, L, rad, dir) => {
    // 里层的暗，外层的亮
    const k = (0.78 + 0.3 * Math.min(1, rad)) * rng.f(0.93, 1.07), y = rng.f(0.95, 1.06), bend = rng.f(0.1, 0.55) * s;
    willowStrand(b, base, L, rng.f(0.42, 0.62) * s, rng.f(Math.PI), [dir[0] * bend, dir[1] * bend], center, { color: [k * y, k, k * (2 - y) * 0.95], lw: 0.18, id: fid });
  };
  const strands = (pts, n, f0, ca, sa, len) => {
    for (let j = 0; j < n; j++) {
      const f = rng.f(f0, 1.03), q = along(pts, Math.min(1, f));
      const base = [q[0] + rng.f(-0.35, 0.35) * s, q[1] + rng.f(-0.12, 0.2) * s, q[2] + rng.f(-0.35, 0.35) * s];
      const L = Math.min(rng.f(2.4, 4.3) * s * (0.68 + 0.32 * f), base[1] - rng.f(0.5, 1.4));
      if (L < 0.9) continue;
      hang(base, L, Math.hypot(base[0] - p[0], base[2] - p[2]) / len, [ca, sa]);
    }
  };
  const nb = rng.i(6, 8);
  for (let k = 0; k < nb; k++) {
    const ang = (k / nb) * Math.PI * 2 + rng.f(0.7), len = rng.f(2.6, 3.9) * s, rise = rng.f(1.7, 2.9) * s, ca = Math.cos(ang), sa = Math.sin(ang);
    const tip = [p[0] + ca * len, p[1] + rise * rng.f(0.1, 0.45), p[2] + sa * len];
    const pts = bough(b, p, tip, [ca * len * 0.06, rise * 0.72, sa * len * 0.06], r * 0.32, r * 0.04, 6, { id: tid, lw: 0.4, seg: 4 });
    strands(pts, rng.i(15, 20), 0.22, ca, sa, len);
    // 旁出的细枝
    const a2 = ang + rng.pick([-1, 1]) * rng.f(0.5, 0.95), l2 = len * rng.f(0.4, 0.62), o = along(pts, rng.f(0.35, 0.55)), c2 = Math.cos(a2), s2 = Math.sin(a2);
    const twig = bough(b, o, [o[0] + c2 * l2, o[1] - rng.f(0.0, 0.5) * s, o[2] + s2 * l2], [0, l2 * 0.22, 0], r * 0.12, r * 0.03, 3, { id: tid, lw: 0.3, seg: 3 });
    strands(twig, rng.i(6, 9), 0.2, c2, s2, len);
  }
  // 树顶补几条，把枝杈遮一遮
  for (let j = 0; j < 10; j++) {
    const a = rng.f(6.283), rr = rng.f(0.15, 1.3) * s, base = [p[0] + Math.cos(a) * rr, p[1] + rng.f(1.5, 2.6) * s, p[2] + Math.sin(a) * rr];
    hang(base, rng.f(2.2, 3.4) * s, 0.5, [Math.cos(a), Math.sin(a)]);
  }
  return { r, R: 3.6 * s };
}

// 松：一干挺出，层层松盖平伸
function pineTree(b, rng, s, fid, tid) {
  const H = rng.f(7.5, 10.5) * s, r = rng.f(0.26, 0.34) * s, ph = rng.f(6.28);
  const sw = [rng.f(-0.9, 0.9) * s, rng.f(-0.9, 0.9) * s];
  const at = (t) => [sw[0] * t * t + Math.sin(t * 5 + ph) * 0.3 * s * t, -0.2 + (H + 0.2) * t, sw[1] * t * t + Math.cos(t * 4.2 + ph) * 0.3 * s * t];
  const pts = [];
  for (let k = 0; k <= 9; k++) {
    const t = k / 9, q = at(t);
    pts.push([q[0], q[1], q[2], r * (1 + 0.5 * Math.max(0, 1 - t * 7)) * (1 - 0.72 * t)]);
  }
  b.tube('bark', pts, { seg: 7, capA: false, id: tid, lw: 0.75, color: [1.22, 0.96, 0.82] });
  const tiers = rng.i(6, 9);
  for (let k = 0; k < tiers; k++) {
    const last = k === tiers - 1, t = last ? 1 : 0.36 + 0.6 * (k / (tiers - 1)) + rng.f(-0.03, 0.03), o = at(t);
    const ang = k * 2.4 + rng.f(0.9), len = last ? 0.2 * s : rng.f(1.5, 3.1) * s * (1.15 - 0.6 * t), ca = Math.cos(ang), sa = Math.sin(ang);
    const c = [o[0] + ca * len, o[1] + (last ? 0.3 : rng.f(0.0, 0.5)) * s, o[2] + sa * len];
    if (!last) bough(b, o, c, [0, -len * 0.1, 0], r * 0.3 * (1.1 - 0.6 * t), r * 0.06, 3, { id: tid, seg: 4, color: [1.15, 0.95, 0.84] });
    const w = rng.f(3.5, 4.9) * s * (1.1 - 0.42 * t), kk = 0.82 + 0.26 * t, hue = rng.f(0.96, 1.05);
    const opt = { color: [kk * hue, kk, kk * (2 - hue)], windV: [0.03, 0.03, 0.08, 0.08], lw: 0.22, id: fid };
    const yaw = rng.f(Math.PI), below = [c[0], c[1] - 2, c[2]];
    // 一盖：竖着交叉两片，再平铺两片——从哪边看都成一盘
    for (let j = 0; j < 2; j++) {
      leafCard(b, 'pine', [c[0], c[1] + w * 0.07, c[2]], w, w, yaw + j * 1.5708 + rng.f(-0.2, 0.2), rng.f(-0.12, 0.12), below, opt);
      leafCard(b, 'pine', [c[0], c[1] + w * 0.05 + j * 0.12, c[2]], w, w, yaw + j * 1.5708 + 0.6, 1.5708 + rng.f(-0.1, 0.1), below, opt);
    }
  }
  return { r, R: 2.6 * s };
}

// 杂树与花树：几条大枝撑开，枝梢各挑一团叶
const LEAF_KEY = { leaf: 'leafA', dark: 'leafB', rust: 'leafC', blossom: 'blossom' };
function leafTree(b, rng, type, s, fid, tid) {
  const bl = type === 'blossom', key = LEAF_KEY[type] || 'leafA';
  const H = (bl ? rng.f(1.3, 1.8) : rng.f(2.7, 3.7)) * s, r = (bl ? 0.15 : rng.f(0.26, 0.34)) * s;
  const R = (bl ? rng.f(1.7, 2.3) : rng.f(2.5, 3.5)) * s;
  const tp = trunk(b, H, r, [rng.f(-0.45, 0.45) * s, rng.f(-0.45, 0.45) * s], rng, { id: tid, color: bl ? [0.8, 0.74, 0.72] : undefined });
  const p = tp[tp.length - 1], tips = [];
  const nl = rng.i(4, 6);
  for (let k = 0; k < nl; k++) {
    const ang = (k / nl) * Math.PI * 2 + rng.f(0.9), el = rng.f(0.45, 1.1), len = R * rng.f(0.8, 1.1), ca = Math.cos(ang), sa = Math.sin(ang), ce = Math.cos(el);
    const tip = [p[0] + ca * ce * len, p[1] + Math.sin(el) * len, p[2] + sa * ce * len];
    const pts = bough(b, p, tip, [-ca * len * 0.1, len * 0.1, -sa * len * 0.1], r * 0.5, r * 0.09, 4, { id: tid, seg: 5 });
    tips.push(tip, along(pts, rng.f(0.5, 0.7)));
    for (const sg of [-1, 1]) {
      const a2 = ang + sg * rng.f(0.55, 1.1), l2 = len * rng.f(0.4, 0.62), o = along(pts, rng.f(0.4, 0.65));
      const t2 = [o[0] + Math.cos(a2) * l2 * 0.85, o[1] + l2 * rng.f(0.15, 0.6), o[2] + Math.sin(a2) * l2 * 0.85];
      b.rod('bark', o, t2, r * 0.17, r * 0.05, 4, { id: tid, lw: 0.3 });
      tips.push(t2);
    }
  }
  // 主梢
  const top = [p[0] + rng.f(-0.4, 0.4) * s, p[1] + R * rng.f(0.75, 1.0), p[2] + rng.f(-0.4, 0.4) * s];
  bough(b, p, top, [rng.f(-0.3, 0.3) * s, 0, rng.f(-0.3, 0.3) * s], r * 0.6, r * 0.1, 3, { id: tid, seg: 5 });
  tips.push(top, [top[0] + rng.f(-0.8, 0.8) * s, top[1] - rng.f(0.3, 0.9) * s, top[2] + rng.f(-0.8, 0.8) * s]);
  let y0 = 1e9, y1 = -1e9;
  const C = [0, 0, 0];
  for (const t of tips) {
    y0 = Math.min(y0, t[1]);
    y1 = Math.max(y1, t[1]);
    for (let i = 0; i < 3; i++) C[i] += t[i] / tips.length;
  }
  const size = (bl ? rng.f(1.3, 1.65) : rng.f(1.9, 2.4)) * s;
  const put = (c, w, k) => {
    const hue = rng.f(0.95, 1.06);
    leafCard(b, key, c, w, w, rng.f(Math.PI), rng.f(-0.45, 0.45), C, { color: [k * hue, k, k * (2 - hue) * 0.97], windV: [0.1, 0.1, 0.34, 0.34], lw: 0.2, id: fid });
  };
  // 树心垫几片暗的：叶簇之间透出来的是深处的叶，不是天
  if (!bl) for (let k = 0; k < 4; k++) put([C[0] + rng.f(-0.5, 0.5) * s, C[1] + rng.f(-0.3, 0.5) * s, C[2] + rng.f(-0.5, 0.5) * s], size * 1.5, 0.64);
  for (const t of tips) {
    const k = 0.78 + 0.34 * ((t[1] - y0) / Math.max(0.1, y1 - y0));
    put(t, size * rng.f(0.9, 1.15), k);
    put(t, size * rng.f(0.9, 1.15), k);
    const n = rng.i(1, 2);
    for (let j = 0; j < n; j++) put([t[0] + rng.f(-0.55, 0.55) * size, t[1] + rng.f(-0.3, 0.4) * size, t[2] + rng.f(-0.55, 0.55) * size], size * rng.f(0.7, 1), k * rng.f(0.92, 1.05));
  }
  return { r, R };
}

export function tree(b, rng, type = 'willow', s = 1) {
  const fid = b.nextId(), tid = b.nextId();
  if (type === 'willow') return willowTree(b, rng, s, fid, tid);
  if (type === 'pine') return pineTree(b, rng, s, fid, tid);
  return leafTree(b, rng, type, s, fid, tid);
}
const UP4 = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
// 贴地短草：三片草叶自根向外斜铺成一丛（不是竖着交叉的两片——那样从高处看是一个个十字），
// 颜色贴着地上那层石绿走，远看融成一片
const rosette = (b, key, n, w, h, tilts, rng, o, col) => {
  const a0 = rng.f(6.283), id = b.nextId();
  for (let k = 0; k < n; k++) {
    const yaw = a0 + (k * 6.283) / n + rng.f(-0.4, 0.4), t = tilts[k % tilts.length] * rng.f(0.8, 1.2), hh = h * rng.f(0.85, 1.15), st = Math.sin(t), ct = Math.cos(t);
    const cx = -Math.sin(yaw) * st * hh * 0.5 + rng.f(-0.12, 0.12), cz = Math.cos(yaw) * st * hh * 0.5 + rng.f(-0.12, 0.12);
    leafCard(b, key, [cx, ct * hh * 0.5 - 0.03, cz], w * rng.f(0.85, 1.15), hh, yaw, t, [cx, -4, cz], { ...o, id, color: col(k) });
  }
};
// 一丛里有立着的、有斜铺的：平视有高矮，俯看是一摊而不是十字
export function grassTuft(b, rng, s = 1, tone = 1) {
  rosette(b, 'grassLow', 3, 1.7 * (0.6 + 0.4 * s), 0.6 * s, [0.36, 0.95, 0.7], rng, { windV: [0, 0, 0.1, 0.1], lw: 0.05 }, () => {
    const g = rng.f(0.86, 1.02) * tone, y = rng.f(0.95, 1.07);
    return [0.68 * g * y, 0.81 * g, 0.51 * g * (2 - y)];
  });
}
// 芦苇、蒲草：水边一丛丛高出人膝，梢头随风
export function reed(b, rng, s = 1) {
  const id = b.nextId(), n = rng.i(2, 3), yaw = rng.f(Math.PI);
  for (let k = 0; k < n; k++) {
    const g = rng.f(0.84, 1.04), y = rng.f(0.96, 1.1), h = rng.f(1.1, 1.75) * s, w = h * rng.f(0.9, 1.25);
    card(b, 'grass', rng.f(-0.3, 0.3), h / 2 - 0.05, rng.f(-0.3, 0.3), w, h, yaw + (k * Math.PI) / n + rng.f(-0.3, 0.3), { windV: [0, 0, 0.3, 0.3], lw: 0.1, id, color: [g * y * 1.02, g, g * (2 - y) * 0.86], normals: UP4 });
  }
}
// 花丛：col 是花色（油菜的黄、野花的粉与白）
export function flowers(b, rng, col, s = 1, key = 'flower') {
  rosette(b, key, 3, 1.25 * s, 0.7 * s, [0.42], rng, { windV: [0, 0, 0.14, 0.14], lw: 0.05 }, () => col);
}

// ───────────────────────── 漕船 ─────────────────────────
export function boat(b, o) {
  const { L = 22, B = 5, mast = 'up', rng } = o;
  const N = 12, id = b.nextId();
  const sec = (t) => {
    const a = Math.abs(t);
    return { hb: (B / 2) * (1 - 0.5 * a * a * a), yd: 0.55 + 0.8 * a ** 2.2 + (t > 0 ? 0.3 * t * t : 0), yk: -0.75 + 0.8 * a ** 2.5 };
  };
  const P = [], UV = [], IDX = [], DP = [], DI = [];
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * 2 - 1, x = (t * L) / 2, { hb, yd, yk } = sec(t);
    const ym = yk + 0.45 * (yd - yk);
    const pts = [[-hb, yd], [-hb * 0.97, ym], [-hb * 0.62, yk], [hb * 0.62, yk], [hb * 0.97, ym], [hb, yd]];
    pts.forEach((q, j) => {
      P.push(x, q[1], q[0]);
      UV.push(x / 3, j * 0.16);
    });
    DP.push(x, yd - 0.16, -hb * 0.96, x, yd - 0.16, hb * 0.96);
    if (i < N) {
      for (let j = 0; j < 5; j++) {
        const a = i * 6 + j, c = a + 1, bb = a + 6, d = bb + 1;
        IDX.push(a, bb, c, bb, d, c);
      }
      DI.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
    }
  }
  b.raw('plank', P, UV, IDX, { id });
  b.raw('wood', DP, null, DI, { color: W_.pale, id: b.nextId(), lw: 0.6 });
  for (const i of [0, N]) {
    const a = i * 6;
    const TP = [], TU = [];
    for (let j = 0; j < 6; j++) {
      TP.push(P[(a + j) * 3], P[(a + j) * 3 + 1], P[(a + j) * 3 + 2]);
      TU.push(P[(a + j) * 3 + 2] / 3, P[(a + j) * 3 + 1] / 2);
    }
    b.raw('plank', TP, TU, [0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5], { id });
  }
  // 舷缘
  for (const sz of [-1, 1])
    for (let i = 0; i < N; i++) {
      const t0 = (i / N) * 2 - 1, t1 = ((i + 1) / N) * 2 - 1, s0 = sec(t0), s1 = sec(t1);
      b.beam('wood', [(t0 * L) / 2, s0.yd + 0.04, sz * s0.hb], [(t1 * L) / 2, s1.yd + 0.04, sz * s1.hb], 0.14, 0.12, { color: W_.dark, id });
    }
  const deck = 0.5;
  if (o.cabin !== false) {
    // 篷舱：拱形竹篷
    const x0 = -L * 0.12, x1 = L * 0.27, cr = B * 0.37;
    const cid = b.nextId();
    b.rod('mat', [x0, deck + 0.2, 0], [x1, deck + 0.2, 0], cr, cr, 12, { id: cid, color: [0.96, 0.92, 0.84] });
    for (const x of [x0 - 0.02, x1 + 0.02]) b.box('flat', x, deck + 0.9, 0, 0.06, 1.3, 0.9, { color: [0.38, 0.34, 0.32], lw: 0.5 });
    for (let x = x0 + 1; x < x1; x += 1.6) b.rod('wood', [x, deck + 0.2, 0], [x + 0.01, deck + 0.2, 0], cr + 0.03, cr + 0.03, 12, { color: W_.dark, id: cid, lw: 0.6 });
    // 舵楼
    const sx = L * 0.36, sw = L * 0.13;
    const sid = b.nextId();
    b.box('wood', sx, deck + 1.05, 0, sw, 1.5, B * 0.62, { color: W_.wood, id: sid });
    b.box('lattice', sx, deck + 1.25, 0, sw * 0.7, 0.7, B * 0.62 + 0.06);
    b.box('wood', sx, deck + 1.86, 0, sw + 0.5, 0.1, B * 0.62 + 0.5, { color: W_.dark, id: sid });
    railing(b, [[sx - sw / 2 - 0.2, deck + 1.9, -B * 0.31 - 0.2], [sx + sw / 2 + 0.2, deck + 1.9, -B * 0.31 - 0.2], [sx + sw / 2 + 0.2, deck + 1.9, B * 0.31 + 0.2], [sx - sw / 2 - 0.2, deck + 1.9, B * 0.31 + 0.2]], 0.6, W_.dark);
  }
  // 舵
  b.box('wood', L / 2 + 0.5, -0.1, 0, 1.7, 2.3, 0.12, { color: W_.dark });
  b.beam('wood', [L / 2 + 0.2, 1.5, 0], [L / 2 - 2.4, 2.5, 0], 0.1, 0.1, { color: W_.dark });
  // 桅
  const mx = -L * 0.2;
  if (mast === 'up') {
    const mh = o.mastH || 11.5, mid = b.nextId();
    b.rod('wood', [mx, deck, 0], [mx, deck + mh, 0], 0.16, 0.08, 7, { color: W_.wood, id: mid });
    for (const sz of [-1, 1]) b.rod('wood', [mx, deck, sz * 0.9], [mx, deck + 3, 0], 0.08, 0.07, 5, { color: W_.wood, id: mid });
    b.rod('wood', [mx, deck + mh - 0.4, 0], [-L / 2 + 0.6, 1.4, 0], 0.016, 0.016, 3, { color: W_.deep, id: mid, lw: 0.55 });
    b.rod('wood', [mx, deck + mh - 0.4, 0], [L * 0.3, deck + 2.2, 0], 0.016, 0.016, 3, { color: W_.deep, id: mid, lw: 0.55 });
    for (const sz of [-1, 1]) b.rod('wood', [mx, deck + mh - 1, 0], [mx + 1.5, deck + 0.3, (sz * B) / 2], 0.014, 0.014, 3, { color: W_.deep, id: mid, lw: 0.5 });
    // 席帆：张着的，或收拢横在桅前的
    if (o.sail) {
      // 张起的席帆：一道道竹条撑着，吃着风微微鼓起；帆脚索归到船尾
      const sw = o.sailW || L * 0.3, sh = mh - 3.6, y0 = deck + 2.3, sa = o.sailYaw ?? 0.42, sid = b.nextId();
      const NU = 6, NV = Math.max(5, Math.round(sh / 1.05));
      const ax = Math.sin(sa), az = Math.cos(sa), nx = -az, nz = ax;
      const SP = [], SI = [];
      const at = (u, v) => {
        const w = (u - 0.42) * sw * (0.9 + 0.1 * v), bulge = Math.sin(u * Math.PI) * (0.55 + 0.3 * Math.sin(v * Math.PI)) * sw * 0.07;
        return [mx - 0.26 + ax * w + nx * bulge, y0 + v * (sh + (u - 0.3) * sw * 0.2) + (u - 0.42) * 0.25, az * w + nz * bulge];
      };
      for (let j = 0; j <= NV; j++)
        for (let i = 0; i <= NU; i++) {
          SP.push(...at(i / NU, j / NV));
          if (i < NU && j < NV) {
            const a = j * (NU + 1) + i, c = a + 1, d = a + NU + 1, e = d + 1;
            SI.push(a, c, d, c, e, d);
          }
        }
      b.raw('sail', SP, null, SI, { color: [1.0, 0.97, 0.9], id: sid, lw: 0.7 });
      for (let j = 0; j <= NV; j++) {
        const v = j / NV;
        for (let i = 0; i < 3; i++) b.rod('wood', at(i / 3, v), at((i + 1) / 3, v), 0.045, 0.045, 4, { color: W_.dark, id: sid, lw: 0.5 });
        if (j > 0 && j % 2 === 0) b.rod('wood', at(1, v), [L * 0.34, deck + 2.3, 0], 0.012, 0.012, 3, { color: W_.deep, id: mid, lw: 0.45 });
      }
      b.rod('wood', at(0.42, 1), [mx, deck + mh - 0.2, 0], 0.016, 0.016, 3, { color: W_.deep, id: mid, lw: 0.5 });
    } else b.rod('mat', [mx + 0.35, deck + 2.6, -B * 0.55], [mx + 0.35, deck + 2.9, B * 0.55], 0.26, 0.26, 7, { color: [0.95, 0.9, 0.8] });
  } else if (mast === 'down') {
    const mid = b.nextId();
    b.rod('wood', [mx, deck + 0.5, 0], [mx + 10, deck + 3.3, 0], 0.16, 0.08, 7, { color: W_.wood, id: mid });
    for (const sz of [-1, 1]) b.rod('wood', [mx + 5.2, deck + 0.2, sz * 0.9], [mx + 5.2, deck + 2.2, 0], 0.07, 0.07, 5, { color: W_.wood, id: mid });
  }
  // 船头货物
  if (o.cargo !== false && rng) {
    for (let i = 0; i < 7; i++) sack(b, -L * 0.36 + rng.f(-1.4, 1.4), deck + (i > 4 ? 0.35 : 0), rng.f(-B * 0.25, B * 0.25), rng);
  }
  // 篙
  b.rod('wood', [-L * 0.42, deck + 1.9, B * 0.4], [-L * 0.1, deck + 0.3, B * 0.45], 0.03, 0.03, 4, { color: W_.pale, lw: 0.6 });
}
export function skiff(b, rng) {
  boat(b, { L: 8.5, B: 2.1, mast: 'none', cabin: false, cargo: false, rng });
  b.rod('mat', [-0.6, 0.55, 0], [1.9, 0.55, 0], 0.72, 0.72, 9, { color: [0.95, 0.9, 0.8] });
}

// ───────────────────────── 远塔 ─────────────────────────
// 八角十三层的砖塔，立在城外寺中；只作远景，不设碰撞
export function pagoda(b, tiers = 13) {
  const id = b.nextId(), body = [0.82, 0.68, 0.58], tile = [0.46, 0.48, 0.5];
  let y = 1.2, r = 4.6;
  b.cyl('stone', 0, 0, 0, r + 1.4, r + 1.9, 1.2, 8, { id: b.nextId() });
  for (let i = 0; i < tiers; i++) {
    const h = i === 0 ? 5.6 : 3.5 - i * 0.07, r1 = r * 0.955, ap = ((r + r1) / 2) * 0.924;
    b.cyl('brick', 0, y, 0, r1, r, h, 8, { id, color: body });
    // 券门与盲窗：隔层错开
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 8 + ((k * 2 + (i % 2)) * Math.PI) / 4;
      b.box('flat', Math.sin(a) * ap, y + h * (i === 0 ? 0.3 : 0.45), Math.cos(a) * ap, i === 0 ? 1.5 : 0.85, i === 0 ? 2.8 : 1.4, 0.3, { ry: a, color: [0.24, 0.21, 0.2], lw: 0.5 });
    }
    // 叠涩出檐
    b.cyl('flat', 0, y + h - 0.24, 0, r1 + 1.5, r1 + 0.3, 0.16, 8, { color: [0.56, 0.45, 0.4], lw: 0.6 });
    b.cyl('flat', 0, y + h - 0.08, 0, r1 + 0.25, r1 + 1.6, 0.55, 8, { color: tile, lw: 0.8 });
    y += h + 0.42;
    r = r1 * 0.985;
  }
  b.cyl('flat', 0, y - 0.1, 0, 0.35, r + 1.3, 2.3, 8, { color: tile });
  b.rod('flat', [0, y + 2.1, 0], [0, y + 7.2, 0], 0.24, 0.05, 6, { color: [0.72, 0.6, 0.38], lw: 0.6 });
  for (let j = 0; j < 5; j++) b.cyl('flat', 0, y + 2.7 + j * 0.72, 0, 0.5 - j * 0.07, 0.62 - j * 0.07, 0.22, 8, { color: [0.72, 0.6, 0.38], lw: 0.5 });
  b.sphere('flat', 0, y + 7.2, 0, 0.26, 0.34, 0.26, { color: [0.8, 0.66, 0.4], ws: 6, hs: 5 });
}

// ───────────────────────── 虹桥 ─────────────────────────
export function rainbowBridge(b) {
  // 局部坐标：桥轴沿 X，原点在桥心（由调用处摆到位、转到向）
  const { L, hw, span } = BRIDGE, xc = 0, N = 56;
  const deckId = b.nextId(), sideId = b.nextId();
  const TP = [], TI = [], TU = [];
  for (let i = 0; i <= N; i++) {
    const x = xc - L + (i / N) * 2 * L, y = bridgeProfile(x);
    TP.push(x, y + 0.02, -hw, x, y + 0.02, hw);
    TU.push(x / 2, 0, x / 2, 4);
    if (i < N) TI.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
  }
  b.raw('plank', TP, TU, TI, { id: deckId, color: W_.pale, lw: 0.8 });
  // 侧面与拱腹
  for (const sz of [-1, 1]) {
    const SP = [], SU = [], SI = [], BP = [], BU = [], BI = [];
    let n = 0;
    for (let i = 0; i <= N; i++) {
      const x = xc - L + (i / N) * 2 * L, y = bridgeProfile(x) + 0.02;
      const inSpan = Math.abs(x - xc) <= span;
      const yb = inSpan ? Math.min(bridgeSoffit(x), y - 0.35) : -0.3;
      SP.push(x, y, sz * hw, x, yb, sz * hw);
      SU.push(x / 2.4, 1.0, x / 2.4, 1.0 - Math.max(0.2, (y - yb) / 3.2));
      if (i < N) SI.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
      n += 2;
    }
    b.raw('plank', SP, SU, SI, { id: sideId, color: W_.red, double: true });
    // 栏杆
    const pts = [];
    for (let i = 1; i < N; i += 2) {
      const x = xc - L + (i / N) * 2 * L;
      pts.push([x, bridgeProfile(x), sz * (hw - 0.22)]);
    }
    railing(b, pts, 1.05, W_.red);
    // 拱肋线（侧面的叠梁）
    for (let k = 1; k <= 2; k++) {
      let prev = null;
      for (let i = 0; i <= 36; i++) {
        const x = xc - span + (i / 36) * 2 * span, yy = bridgeSoffit(x) + k * 0.34 - 0.05;
        const p = [x, Math.min(yy, bridgeProfile(x) - 0.12), sz * (hw + 0.03)];
        if (prev) b.beam('wood', prev, p, 0.1, 0.1, { color: W_.dark, id: sideId, lw: 0.8 });
        prev = p;
      }
    }
  }
  // 拱腹
  const UP = [], UI = [], UU = [];
  const M = 36;
  for (let i = 0; i <= M; i++) {
    const x = xc - span + (i / M) * 2 * span, y = Math.min(bridgeSoffit(x), bridgeProfile(x) - 0.33);
    UP.push(x, y, -hw, x, y, hw);
    UU.push(x / 2, 0, x / 2, 4);
    if (i < M) UI.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
  }
  b.raw('plank', UP, UU, UI, { id: sideId, color: W_.dark, double: true });
  // 桥台（石砌）
  for (const sx of [-1, 1]) {
    const x0 = xc + sx * span, x1 = xc + sx * (span + 2.6);
    b.box('stone', (x0 + x1) / 2, -0.55, 0, Math.abs(x1 - x0) + 1.4, 1.5, hw * 2 + 2.4, {});
  }
  // 桥头表木（立鹤）
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = xc + sx * (L - 3.5), z = sz * (hw + 1.5), id = b.nextId();
      b.cyl('wood', x, 0, z, 0.09, 0.14, 11, 6, { color: W_.wood, id });
      b.box('wood', x, 10.6, z, 1.4, 0.08, 0.08, { color: W_.wood, id });
      b.box('wood', x, 10.6, z, 0.08, 0.08, 1.4, { color: W_.wood, id });
      b.sphere('flat', x, 11.25, z, 0.28, 0.18, 0.15, { color: [0.95, 0.95, 0.93], id });
      b.rod('flat', [x + 0.15, 11.3, z], [x + 0.46, 11.58, z], 0.045, 0.025, 4, { color: [0.95, 0.95, 0.93], id });
    }
}

export function flatBridge(b, x0, x1, hw, y) {
  const len = x1 - x0, xc = (x0 + x1) / 2, id = b.nextId();
  b.box('wood', xc, y - 0.1, 0, len, 0.22, hw * 2, { color: W_.pale, id });
  for (let x = x0 + 1.2; x < x1; x += 2.6) for (const sz of [-1, 1]) b.cyl('wood', x, -2, sz * (hw - 0.3), 0.14, 0.14, 2 + y - 0.2, 6, { color: W_.dark, id });
  for (const sz of [-1, 1]) {
    const pts = [];
    for (let x = x0 + 0.3; x <= x1 - 0.2; x += 1.7) pts.push([x, y, sz * (hw - 0.15)]);
    railing(b, pts, 0.95, W_.red);
  }
}

// ───────────────────────── 城门与城墙 ─────────────────────────
// 局部坐标：城墙沿 Z 延伸，门道沿 X 贯通；原点在门道中心，-X 一侧是城里。
// 城里一侧有马道上墙头，墙头可走到城台，再登平坐、入城楼。返回 solids / decks / ramps / ceils
export function cityGate(b, zMin, zMax) {
  const { pass, halfZ, halfX, wallH, blockH } = GATE.base || GATE;
  const solids = [], decks = [], ramps = [], ceils = [];
  const top = blockH + 0.12, wy = wallH + 0.08, WALK = 62;
  // 夯土城墙（梯形断面）
  const wall = (z0, z1) => {
    const bt = 5.2, tp = 3.4;
    const P = [-bt, 0, z0, -tp, wallH, z0, tp, wallH, z0, bt, 0, z0, -bt, 0, z1, -tp, wallH, z1, tp, wallH, z1, bt, 0, z1];
    b.raw('earth', P, null, [0, 4, 1, 1, 4, 5, 3, 2, 7, 2, 6, 7, 1, 5, 2, 2, 5, 6, 0, 1, 3, 1, 2, 3, 4, 7, 5, 5, 7, 6], { color: [0.97, 0.94, 0.88] });
    b.box('earth', 0, wallH + 0.04, (z0 + z1) / 2, tp * 2 + 0.1, 0.08, Math.abs(z1 - z0), { color: [0.9, 0.93, 0.8], lw: 0.6 });
  };
  wall(zMin, -halfZ + 0.5);
  wall(halfZ - 0.5, zMax);
  solids.push([-5.2, zMin, 5.2, -halfZ + 0.5, -1e9, wallH], [-5.2, halfZ - 0.5, 5.2, zMax, -1e9, wallH]);
  // 墙头可走一段，尽头立栅
  decks.push([-3.4, -WALK, 3.4, -halfZ + 0.3, wy], [-3.4, halfZ - 0.3, 3.4, WALK, wy]);
  for (const sg of [-1, 1]) {
    solids.push([-4, sg * WALK - 0.2, 4, sg * WALK + 0.2, wallH - 0.5, wallH + 3]);
    const fid = b.nextId();
    for (let x = -3.2; x <= 3.21; x += 0.8) b.box('wood', x, wy + 0.75, sg * WALK, 0.09, 1.5, 0.09, { color: W_.dark, id: fid });
    for (const yy of [0.5, 1.2]) b.box('wood', 0, wy + yy, sg * WALK, 6.6, 0.08, 0.07, { color: W_.dark, id: fid });
  }
  // 城台（砖砌），留出门道
  const bid = b.nextId();
  const sideW = halfZ - pass;
  for (const sz of [-1, 1]) b.box('brick', 0, blockH / 2, sz * (pass + sideW / 2), halfX * 2, blockH, sideW, { id: bid });
  const passH = 6.2;
  b.box('brick', 0, (passH + blockH) / 2, 0, halfX * 2, blockH - passH, pass * 2, { id: bid });
  solids.push([-halfX, -halfZ, halfX, -pass, -1e9, blockH], [-halfX, pass, halfX, halfZ, -1e9, blockH]);
  decks.push([-halfX - 0.25, -halfZ - 0.25, halfX + 0.25, halfZ + 0.25, top]);
  ceils.push([-halfX, -pass, halfX, pass, passH - 0.2]);
  // 门道排叉柱与过梁
  const pid = b.nextId();
  for (let x = -halfX + 0.6; x <= halfX - 0.5; x += 1.6)
    for (const sz of [-1, 1]) b.box('wood', x, passH / 2, sz * (pass - 0.14), 0.26, passH, 0.26, { color: W_.red, id: pid });
  for (let x = -halfX + 0.6; x <= halfX - 0.5; x += 1.6) b.box('wood', x, passH - 0.16, 0, 0.3, 0.3, pass * 2, { color: W_.red, id: pid });
  // 城门扇（敞开）
  for (const sz of [-1, 1]) {
    b.box('wood', halfX - 2.2, 2.7, sz * (pass - 0.34), 3.0, 5.4, 0.14, { color: [0.95, 0.6, 0.52] });
    for (let yy = 0.8; yy < 5.2; yy += 0.9)
      for (let xx = -1.2; xx <= 1.2; xx += 0.6) b.sphere('flat', halfX - 2.2 + xx, yy, sz * (pass - 0.44), 0.05, 0.05, 0.05, { color: [0.85, 0.72, 0.4], lw: 0.3, ws: 5, hs: 4 });
  }
  // 城台顶面；勾栏在两头接墙处留口
  b.box('stone', 0, blockH + 0.06, 0, halfX * 2 + 0.5, 0.14, halfZ * 2 + 0.5, {});
  const rx = halfX + 0.1, rz = halfZ + 0.1;
  const rail = (x0, z0, x1, z1, y, h = 1.0) => {
    const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.9)), pts = [];
    for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, y, z0 + ((z1 - z0) * i) / n]);
    railing(b, pts, h, W_.red);
    return [Math.min(x0, x1) - 0.08, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, Math.max(z0, z1) + 0.08, y, y + h];
  };
  for (const sx of [-1, 1]) solids.push(rail(sx * rx, -rz, sx * rx, rz, top));
  for (const sz of [-1, 1]) for (const sx of [-1, 1]) solids.push(rail(sx * rx, sz * rz, sx * 3.7, sz * rz, top));
  // 墙头登城台的几级踏道
  for (const sg of [-1, 1]) {
    ramps.push(sg < 0 ? [-3.4, -halfZ - 2.0, 3.4, -halfZ - 0.25, 'z', wy, top] : [-3.4, halfZ + 0.25, 3.4, halfZ + 2.0, 'z', top, wy]);
    for (let k = 0; k < 5; k++) {
      const hh = ((k + 1) * (top - wy)) / 5;
      b.box('stone', 0, wy + hh / 2, sg * (halfZ + 2.0 - (k + 0.5) * 0.35), 6.8, hh, 0.35, { lw: 0.6 });
    }
  }
  // 马道：城里一侧贴墙斜上（礓䃰）
  const mx0 = -8.2, mx1 = -3.4, mzb = -halfZ - 2.4, mza = mzb - wy * 3, mid = b.nextId();
  b.quad('brick', [mx0, 0, mza], [mx0, wy, mzb], [mx1, wy, mzb], [mx1, 0, mza], { id: mid });
  b.raw('brick', [mx0, 0, mza, mx0, 0, mzb, mx0, wy, mzb], null, [0, 1, 2], { id: mid });
  // 坡顶一方平台，与墙头相平
  b.box('brick', (mx0 + mx1) / 2, wy / 2, mzb + 1.1, mx1 - mx0, wy, 2.2, { id: mid });
  decks.push([mx0, mzb, mx1, mzb + 2.2, wy]);
  solids.push([mx0, mzb, -5.2, mzb + 2.2, -1e9, wy - 0.1]);
  for (let z = mza + 0.5; z < mzb - 0.2; z += 0.55) b.box('stone', (mx0 - 4.6) / 2, ((z - mza) / (mzb - mza)) * wy + 0.02, z, -4.6 - mx0, 0.07, 0.14, { id: mid, lw: 0.45 });
  const mp = [];
  for (let k = 0; k <= 8; k++) mp.push([mx0 + 0.12, (wy * k) / 8, mza + ((mzb - mza) * k) / 8]);
  mp.push([mx0 + 0.12, wy, mzb + 2.08], [mx1 - 0.16, wy, mzb + 2.08]); // 绕过坡顶平台
  railing(b, mp, 0.95, W_.dark);
  ramps.push([mx0, mza, mx1, mzb, 'z', 0, wy]);
  // 栏杆也是障碍：不能从坡侧穿栏而上，也不会从坡上、平台上踩空
  for (let k = 0; k < 16; k++) solids.push([mx0 - 0.06, mza + ((mzb - mza) * k) / 16, mx0 + 0.26, mza + ((mzb - mza) * (k + 1)) / 16, (wy * k) / 16 - 0.35, (wy * (k + 1)) / 16 + 1.0]);
  solids.push([mx0 - 0.06, mzb, mx0 + 0.26, mzb + 2.2, wy - 0.35, wy + 1.0], [mx0, mzb + 1.94, mx1 - 0.05, mzb + 2.26, wy - 0.35, wy + 1.0]);
  for (let k = 1; k < 10; k++) solids.push([mx0, mza + ((mzb - mza) * k) / 10, -5.2, mza + ((mzb - mza) * (k + 1)) / 10, -1e9, (wy * k) / 10 - 0.1]);
  // 墙头两侧的垛墙：城外一侧是带垛口的雉堞，城里一侧是矮女墙（马道上来的地方留口）
  {
    const pid = b.nextId(), tp = 3.4, oh = 1.0, ih = 0.95, g0 = mzb - 0.15, g1 = mzb + 2.35;
    const seg = (z0, z1) => {
      b.box('brick', tp - 0.2, wy + oh / 2, (z0 + z1) / 2, 0.42, oh, z1 - z0, { id: pid });
      for (let z = z0 + 0.7; z < z1 - 0.5; z += 1.7) b.box('brick', tp - 0.2, wy + oh + 0.3, z, 0.42, 0.6, 1.0, { id: pid });
      if (z0 < WALK && z1 > -WALK) solids.push([tp - 0.42, Math.max(z0, -WALK), tp + 0.1, Math.min(z1, WALK), wy - 0.3, wy + oh + 1.2]);
      for (const [a, c] of z0 < g1 && z1 > g0 ? [[z0, g0], [g1, z1]] : [[z0, z1]]) {
        if (c - a < 0.3) continue;
        b.box('brick', -tp + 0.18, wy + ih / 2, (a + c) / 2, 0.36, ih, c - a, { id: pid });
        if (a < WALK && c > -WALK) solids.push([-tp - 0.1, Math.max(a, -WALK), -tp + 0.4, Math.min(c, WALK), wy - 0.3, wy + ih + 1.2]);
      }
    };
    seg(zMin, -halfZ + 0.3);
    seg(halfZ - 0.3, zMax);
  }
  // 城楼：面阔五间（沿 Z），立在平坐上；单檐庑殿顶，檐下五铺作，正脊两端鸱尾
  const TW = (x0, z0, x1, z1, ...rest) => [Math.min(z0, z1), Math.min(-x0, -x1), Math.max(z0, z1), Math.max(-x0, -x1), ...rest]; // 楼的局部 → 城门局部
  b.place(0, top, 0, Math.PI / 2, () => {
    const tw = 20, td = 8, th = 4.2, hw = tw / 2, hd = td / 2, bays = 5, bw = tw / bays, red = W_.red, T = 0.16;
    // 平坐：一圈斗拱托着木台，四周勾栏，前后当中设踏道
    b.box('stone', 0, 0.1, 0, tw + 2.4, 0.2, td + 2.4, {});
    const pz = dougongRing(b, hw + 0.7, hd + 0.7, 0.3, bracketSpots(hw + 0.7, bays, 2), bracketSpots(hd + 0.7, 2, 2), 0.6, 1);
    const yd = 0.3 + pz.h + 0.16, ex = hw + 0.7 + pz.out + 0.25, ez = hd + 0.7 + pz.out + 0.25, Y = top + yd;
    b.box('wood', 0, yd - 0.08, 0, ex * 2, 0.16, ez * 2, { color: [0.97, 0.86, 0.72] });
    decks.push(TW(-ex, -ez, ex, ez, Y));
    solids.push(TW(-ex, -ez, ex, ez, top - 1, Y - 0.08));
    const gx = ex - 0.12, gz = ez - 0.12, R2 = (x0, z0, x1, z1) => {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 1.7)), pts = [];
      for (let i = 0; i <= n; i++) pts.push([x0 + ((x1 - x0) * i) / n, yd, z0 + ((z1 - z0) * i) / n]);
      railing(b, pts, 0.9, red);
      solids.push(TW(Math.min(x0, x1) - 0.08, Math.min(z0, z1) - 0.08, Math.max(x0, x1) + 0.08, Math.max(z0, z1) + 0.08, Y, Y + 0.9));
    };
    for (const sx of [-1, 1]) R2(sx * gx, -gz, sx * gx, gz);
    for (const sz of [-1, 1]) for (const sx of [-1, 1]) R2(sx * gx, sz * gz, sx * 1.5, sz * gz);
    for (const sz of [-1, 1]) {
      // 踏道
      const lo = sz * (ez + 1.5), hi = sz * ez;
      ramps.push(sz > 0 ? TW(-1.3, hi, 1.3, lo, 'x', Y, top) : TW(-1.3, lo, 1.3, hi, 'x', top, Y));
      for (let k = 0; k < 5; k++) {
        const hh = ((5 - k) * yd) / 5;
        b.box('stone', 0, hh / 2, sz * (ez + (k + 0.5) * 0.3), 2.6, hh, 0.3, { lw: 0.6 });
      }
    }
    // 殿身：柱、阑额
    const cid = b.nextId(), fo = { color: red, id: cid }, WY = [Y, Y + th + 2.5];
    for (let i = 0; i <= bays; i++) for (const z of [-hd, hd]) column(b, -hw + i * bw, yd, z, th, 0.21, red, cid);
    for (const x of [-hw, hw]) column(b, x, yd, 0, th, 0.21, red, cid);
    for (const z of [-hd, hd]) b.box('wood', 0, yd + th - 0.2, z, tw + 0.4, 0.36, 0.26, fo);
    for (const x of [-hw, hw]) b.box('wood', x, yd + th - 0.2, 0, 0.26, 0.36, td + 0.4, fo);
    // 柱间：当心间开版门，余为直棂窗，上下施槛
    for (let i = 0; i < bays; i++) {
      const cx = -hw + (i + 0.5) * bw, fw = bw - 0.42;
      for (const sz of [-1, 1]) {
        const z = sz * hd;
        if (i === 2) {
          for (const sx of [-1, 1]) b.box('wood', cx + sx * (fw / 2 - 0.2), yd + 1.45, z - sz * 0.5, 1.1, 2.9, 0.07, { color: [0.95, 0.6, 0.52], ry: sx * sz * 1.25 });
          solids.push(TW(cx - bw / 2 - 0.2, z - T, cx - fw / 2 + 0.1, z + T, ...WY), TW(cx + fw / 2 - 0.1, z - T, cx + bw / 2 + 0.2, z + T, ...WY));
        } else {
          b.box('plaster', cx, yd + 0.45, z, fw, 0.9, 0.12, {});
          b.box('lattice', cx, yd + 1.9, z, fw, 2.0, 0.1);
          for (const yy of [0.9]) b.box('wood', cx, yd + yy, z + sz * 0.03, fw, 0.12, 0.18, fo);
          solids.push(TW(cx - bw / 2, z - T, cx + bw / 2, z + T, ...WY));
        }
        b.box('plaster', cx, yd + (2.9 + th) / 2 - 0.2, z, fw, th - 2.9 - 0.4, 0.12, {});
        b.box('wood', cx, yd + 2.9, z + sz * 0.03, fw, 0.12, 0.18, fo);
      }
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const cz = sz * hd * 0.5, fd = hd - 0.42;
        b.box('plaster', sx * hw, yd + 0.45, cz, 0.12, 0.9, fd, {});
        b.box('lattice', sx * hw, yd + 1.9, cz, 0.1, 2.0, fd);
        b.box('plaster', sx * hw, yd + (2.9 + th) / 2 - 0.2, cz, 0.12, th - 2.9 - 0.4, fd, {});
        for (const yy of [0.9, 2.9]) b.box('wood', sx * (hw + 0.03), yd + yy, cz, 0.18, 0.12, fd, fo);
      }
      solids.push(TW(sx * hw - T, -hd, sx * hw + T, hd, ...WY));
    }
    ceils.push(TW(-hw, -hd, hw, hd, Y + th + 0.6));
    // 楼内：更鼓一面、条案一张
    const did = b.nextId(), dx = -hw + 2.4;
    b.rod('wood', [dx, yd + 1.45, -0.5], [dx, yd + 1.45, 0.5], 0.78, 0.78, 16, { color: [0.95, 0.6, 0.52], id: did });
    for (const sz of [-1, 1]) b.rod('flat', [dx, yd + 1.45, sz * 0.5], [dx, yd + 1.45, sz * 0.53], 0.74, 0.74, 16, { color: [1.06, 1.0, 0.88], id: did, lw: 0.6 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.beam('wood', [dx + sx * 0.75, yd, sz * 0.42], [dx + sx * 0.3, yd + 0.95, sz * 0.36], 0.09, 0.09, { color: W_.dark, id: did });
    solids.push(TW(dx - 0.9, -0.65, dx + 0.9, 0.65, Y, Y + 2.3));
    b.place(hw - 2.6, yd, -hd + 1.0, 0, () => table(b, 0, 0, 2.2, 0.7, 0.8, W_.dark));
    solids.push(TW(hw - 3.8, -hd + 0.6, hw - 1.4, -hd + 1.4, Y, Y + 0.95));
    // 檐下斗拱与屋顶
    const rg = dougongRing(b, hw, hd, yd + th, bracketSpots(hw, bays, 1), bracketSpots(hd, 2, 1), 0.82, 2);
    roof(b, { hw: hw + rg.out, hd: hd + rg.out, y: yd + th + rg.h, hip: 1, pitch: 0.74, oe: 1.6, lift: 0.6, ridgeColor: [0.42, 0.44, 0.45], ridgeEnd: 'chiwei', ridgeScale: 1.4 });
  });
  return { solids, decks, ramps, ceils };
}

// ───────────────────────── 牲畜、车、轿、井 ─────────────────────────
export { donkey, camel, ox, horse, HORSE_SEAT } from './animals.js';

export function wheel(b, x, y, z, r, color = W_.dark) {
  const id = b.nextId();
  b.rod('wood', [x, y, z - 0.05], [x, y, z + 0.05], r, r, 14, { color, id });
  b.rod('wood', [x, y, z - 0.09], [x, y, z + 0.09], r * 0.18, r * 0.18, 8, { color: W_.wood, id });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI;
    b.beam('wood', [x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, z + 0.06], [x - Math.cos(a) * r * 0.95, y - Math.sin(a) * r * 0.95, z + 0.06], 0.04, 0.02, { color: W_.pale, id, lw: 0.6 });
    b.beam('wood', [x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95, z - 0.06], [x - Math.cos(a) * r * 0.95, y - Math.sin(a) * r * 0.95, z - 0.06], 0.04, 0.02, { color: W_.pale, id, lw: 0.6 });
  }
}
// 独轮串车
export function barrow(b, rng) {
  wheel(b, 0, 0.5, 0, 0.5);
  const id = b.nextId();
  for (const sz of [-1, 1]) b.beam('wood', [-1.5, 0.95, sz * 0.36], [0.9, 0.62, sz * 0.2], 0.07, 0.07, { color: W_.wood, id });
  b.box('wood', -0.25, 0.86, 0, 1.5, 0.06, 0.8, { color: W_.wood, id });
  for (const sz of [-1, 1]) b.box('wood', -1.35, 0.45, sz * 0.36, 0.06, 0.9, 0.06, { color: W_.wood, id });
  for (let i = 0; i < 4; i++) sack(b, -0.3 + rng.f(-0.4, 0.4), 0.9 + (i > 1 ? 0.34 : 0), rng.f(-0.18, 0.18), rng);
}
// 平头车（牛车），带席篷
export function oxCart(b) {
  for (const sz of [-1, 1]) wheel(b, 0, 0.85, sz * 0.95, 0.85);
  const id = b.nextId();
  b.box('wood', 0, 1.05, 0, 3.2, 0.14, 1.6, { color: W_.wood, id });
  b.rod('mat', [-1.4, 1.2, 0], [1.4, 1.2, 0], 0.85, 0.85, 10, { color: [0.95, 0.9, 0.8] });
  // 两根辕木伸到牛颈的轭下
  for (const sz of [-1, 1]) b.beam('wood', [1.5, 1.05, sz * 0.52], [5.25, 1.1, sz * 0.37], 0.08, 0.08, { color: W_.wood, id });
}
// 轿子
export function sedan(b) {
  const id = b.nextId();
  b.box('wood', 0, 1.05, 0, 0.95, 1.25, 0.9, { color: W_.wood, id });
  b.box('lattice', 0, 1.2, 0, 0.6, 0.6, 0.94);
  b.cyl('mat', 0, 1.68, 0, 0.1, 0.78, 0.36, 4, { color: [0.95, 0.9, 0.8], ry: Math.PI / 4 });
  for (const sz of [-1, 1]) b.beam('wood', [-1.8, 0.78, sz * 0.5], [1.8, 0.78, sz * 0.5], 0.06, 0.06, { color: W_.dark, id });
  // 清明归来：轿顶插柳
  b.sphere('flat', 0, 2.1, 0, 0.5, 0.25, 0.5, { color: [0.74, 0.82, 0.6], lw: 0.4 });
}
export function well(b) {
  const id = b.nextId();
  for (const [x, z, sx, sz] of [[0, 0.75, 1.9, 0.4], [0, -0.75, 1.9, 0.4], [0.75, 0, 0.4, 1.1], [-0.75, 0, 0.4, 1.1]]) b.box('stone', x, 0.3, z, sx, 0.6, sz, { id });
  b.box('flat', 0, 0.2, 0, 1.1, 0.1, 1.1, { color: [0.35, 0.4, 0.42], lw: 0.3 });
  for (const sx of [-1, 1]) b.cyl('wood', sx * 0.85, 0, 0, 0.05, 0.06, 2.1, 5, { color: W_.dark, id });
  b.rod('wood', [-0.95, 2.0, 0], [0.95, 2.0, 0], 0.06, 0.06, 6, { color: W_.dark, id });
  b.cyl('wood', 0.5, 0.6, 0.6, 0.16, 0.13, 0.3, 8, { color: W_.wood });
}
export function fence(b, pts, h = 0.95) {
  const id = b.nextId();
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i], q = pts[i + 1], len = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.round(len / 1.4));
    for (let k = 0; k <= n; k++) {
      const x = p[0] + ((q[0] - p[0]) * k) / n, z = p[1] + ((q[1] - p[1]) * k) / n;
      b.cyl('wood', x, 0, z, 0.03, 0.045, h + (k % 2) * 0.1, 4, { color: W_.dark, id });
    }
    for (const yy of [h * 0.4, h * 0.8]) b.beam('wood', [p[0], yy, p[1]], [q[0], yy, q[1]], 0.04, 0.04, { color: W_.wood, id });
  }
}
export function haystack(b) {
  b.cyl('thatch', 0, 0, 0, 1.1, 1.25, 1.5, 9, { color: [0.98, 0.95, 0.88] });
  b.cyl('thatch', 0, 1.5, 0, 0.05, 1.3, 1.2, 9, { color: [0.95, 0.9, 0.8] });
}

// 人物：照《清明上河图》里的样子来——短褐束腰的脚夫、圆领长袍的士商、褙子长裙的妇人；幞头、裹巾、椎髻、斗笠。
// 身量按真人比例（约七头身）。头有额、颧、颏，有鼻有耳，面相画在贴图上；衣身、衣袖是放样出来的，
// 衣褶是真的起伏——褶线处法线一折，勾线自然落在褶上。站着的人各有一点小动作：歪头、侧身、欠身。
import * as THREE from 'three';
import { Batch } from '../engine/batch.js';
import { FACE, FACE_DEFS, faceUV, headU, HAIRLINE, hairlineAt, HEAD_Y0, HEAD_Y1 } from '../engine/textures.js';
import { NODES, adjacency, edgeWidth, groundY, colliders } from './layout.js';
import { angDiff } from '../util.js';
import { shared, lifeMotion } from '../engine/ink.js';

export const ROBES = [[1.12, 1.1, 1.05], [1.06, 1.04, 0.99], [0.8, 0.84, 0.86], [0.92, 0.87, 0.76], [0.85, 0.89, 0.83], [0.78, 0.76, 0.73], [1.0, 0.96, 0.88], [0.72, 0.78, 0.82], [1.1, 1.08, 1.02], [0.88, 0.8, 0.74]];
export const ROBES_W = [[0.95, 0.74, 0.7], [1.06, 0.96, 0.93], [0.84, 0.9, 0.8], [0.88, 0.84, 0.92], [1.08, 1.03, 0.9], [0.78, 0.87, 0.9]];
const PALE = [[1.1, 1.08, 1.02], [1.04, 1.01, 0.94], [0.94, 0.9, 0.8], [0.86, 0.84, 0.78], [0.8, 0.82, 0.8], [0.9, 0.84, 0.74]];
const HAIR = [0.17, 0.165, 0.17], GAUZE = [0.21, 0.21, 0.23], SHOE = [0.29, 0.27, 0.26], JIN = [0.23, 0.23, 0.25];
const STRAW = [0.95, 0.88, 0.68], WHITE = [1.14, 1.13, 1.1], GOLD = [0.92, 0.78, 0.42], CORD = [0.4, 0.36, 0.3];
const M = 'robe'; // 衣料、冠巾、鞋履都用这一种材质；不画衣纹的部件取贴图顶上的留白
const BL = [0, 0, 0.5, 1.5], BLV = [0.5, 1.5];
const TAU = Math.PI * 2, X_AXIS = [1, 0, 0], Z_AXIS = [0, 0, 1];
// 身量（米，立姿）：头心、肩、腰、胯、膝
const HY = 1.548, SHY = 1.335, WAIST = 1.0, HIP = 0.86, KNEE = 0.47;
const _sc = new THREE.Matrix4(), _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _e = new THREE.Euler();
const _up = new THREE.Matrix4(), _hd = new THREE.Matrix4(), _v1 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), Y_AXIS = new THREE.Vector3(0, 1, 0);
// 最近立的那个人：头的坐标系（相对其脚下）与活气的节拍——给单独成组的头用
const HEAD_FRAME = new THREE.Matrix4();
let LAST_K = 2;

// LOD = 1：画进场景的静态小像（远观为主），截面边数、衣褶、手指都减省；能动的人物用 0
let LOD = 0;
// 当前这个人的面相与肤色；CLOTH_SKIN 为真时皮肉也用衣料那种材质（活动的肢体少占一件网格）
let FACE_ID = 0, SKIN = [1, 0.9, 0.78], CLOTH_SKIN = false;
const skinOf = (face) => {
  const h = (FACE_DEFS[face] || FACE_DEFS[0]).skin;
  return [(1.12 * parseInt(h.slice(1, 3), 16)) / 255, (1.1 * parseInt(h.slice(3, 5), 16)) / 255, (1.06 * parseInt(h.slice(5, 7), 16)) / 255];
};
const skinUV = () => faceUV(FACE_ID, 0.6528, 0.683); // 面相图上一处不着笔墨的额角
const segs = (n) => (LOD ? Math.max(5, Math.round(n * 0.66)) : n);
const sph = (b, x, y, z, rx, ry, rz, color, id, o = {}) => b.sphere(M, x, y, z, rx, ry, rz, { color, id, uv: BL, ...o, ws: LOD ? Math.max(5, Math.round((o.ws || 10) * 0.6)) : o.ws, hs: LOD ? Math.max(4, Math.round((o.hs || 7) * 0.6)) : o.hs });
const bar = (b, a, c, w, h, color, id, lw = 0.5) => b.beam(M, a, c, w, h, { color, id, uv: BL, lw });
const stick = (b, a, c, r0, r1, color, id, seg = 5, lw = 0.6) => b.rod(M, a, c, r0, r1, seg, { color, id, uv: BL, lw });
const plain = (b, pts, color, id, o = {}) => b.tube(M, pts, { color, id, uvAt: BLV, ...o, seg: segs(o.seg || 7) });
const cloth = (b, pts, color, id, o = {}) => b.tube(M, pts, { color, id, ...o, seg: segs(o.seg || 8) });
const flesh = (b, pts, id, o = {}) => (CLOTH_SKIN ? plain(b, pts, SKIN, id, { lw: 0.5, ...o }) : b.tube('face', pts, { id, uvAt: skinUV(), lw: 0.5, ...o, seg: segs(o.seg || 7) }));
const mix3 = (a, c, t) => [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t];
const add3 = (a, d, k) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];
const nrm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]];
const sstep = (a, c, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (c - a)));
  return t * t * (3 - 2 * t);
};

// ───────────────────────── 放样 ─────────────────────────
// 一圈圈椭圆截面连成衣身、衣袖。ring = { c 圆心, u/w 截面两轴, ru/rw 两向半径, amp 衣褶深浅, k 明暗 }。
// folds = [[方位角, 深, 宽, 向], ...]：褶的一侧缓缓鼓起，到褶线处陡然落下；落差处另起顶点，法线不连续。
function loft(b, key, rings, o = {}) {
  const N = segs(o.seg || 20);
  const folds = (o.folds || []).filter((_, i) => !LOD || i % 2 === 0).map((f) => [((f[0] % TAU) + TAU) % TAU, f[1], f[2], f[3]]);
  const cols = [];
  for (let i = 0; i < N; i++) cols.push({ a: ((i + 0.5) / N) * TAU, k: -1, hi: 0 });
  folds.forEach((f, k) => cols.push({ a: f[0], k, hi: 1 }, { a: f[0], k, hi: 0 }));
  cols.sort((p, q) => p.a - q.a || (p.k >= 0 && p.k === q.k ? (folds[p.k][3] > 0 ? q.hi - p.hi : p.hi - q.hi) : 0));
  const F = cols.map((c) => {
    let s = 0;
    folds.forEach((f, k) => {
      if (c.k === k) {
        s += c.hi ? f[1] : 0;
        return;
      }
      let d = c.a - f[0];
      d -= Math.round(d / TAU) * TAU;
      const x = (-d * f[3]) / f[2];
      if (x > 0 && x < 1) s += f[1] * (1 - x) * (1 - x);
    });
    return s;
  });
  const MC = cols.length, R = rings.length, P = [], UV = [], COL = [], IDX = [];
  const uv = o.uvAt || BLV, c0 = o.color || [1, 1, 1];
  for (const g of rings) {
    const u = g.u || X_AXIS, w = g.w || Z_AXIS, amp = g.amp || 0, kc = g.k ?? 1;
    for (let j = 0; j < MC; j++) {
      const f = 1 + amp * F[j], ca = Math.cos(cols[j].a) * g.ru * f, sa = Math.sin(cols[j].a) * g.rw * f;
      P.push(g.c[0] + u[0] * ca + w[0] * sa, g.c[1] + u[1] * ca + w[1] * sa, g.c[2] + u[2] * ca + w[2] * sa);
      UV.push(uv[0], uv[1]);
      COL.push(c0[0] * kc, c0[1] * kc, c0[2] * kc);
    }
  }
  const WP = [], WUV = [], WC = [], WI = [];
  for (let r = 0; r < R - 1; r++)
    for (let j = 0; j < MC; j++) {
      const j2 = (j + 1) % MC, a = r * MC + j, c = r * MC + j2, d = a + MC, e = c + MC;
      if (cols[j].k >= 0 && cols[j].k === cols[j2].k) {
        const n = WP.length / 3;
        for (const q of [a, c, d, e]) {
          WP.push(P[q * 3], P[q * 3 + 1], P[q * 3 + 2]);
          WUV.push(uv[0], uv[1]);
          WC.push(COL[q * 3] * 0.86, COL[q * 3 + 1] * 0.86, COL[q * 3 + 2] * 0.88);
        }
        WI.push(n, n + 2, n + 1, n + 1, n + 2, n + 3);
        continue;
      }
      IDX.push(a, d, c, c, d, e);
    }
  for (const [on, r] of [[o.capA, 0], [o.capB, R - 1]]) {
    if (!on) continue;
    const g = rings[r], ci = P.length / 3, kc = g.k ?? 1;
    P.push(g.c[0], g.c[1], g.c[2]);
    UV.push(uv[0], uv[1]);
    COL.push(c0[0] * kc, c0[1] * kc, c0[2] * kc);
    for (let j = 0; j < MC; j++) IDX.push(ci, r * MC + j, r * MC + ((j + 1) % MC));
  }
  b.raw(key, P, UV, IDX, { colors: COL, id: o.id, lw: o.lw ?? 1 });
  if (WP.length) b.raw(key, WP, WUV, WI, { colors: WC, id: o.id, lw: o.lw ?? 1 });
}
// 衣身的一圈：[高, 半宽, 半厚, 前后偏移, 褶深, 明暗]
const ringOf = (dy) => ([y, rx, rz, cz = 0, amp = 0, k = 1]) => ({ c: [0, y + dy, cz], ru: rx, rw: rz, amp, k });
// 躯干轮廓在某一高度处的截面
function ringAt(prof, y) {
  if (y <= prof[0][0]) return prof[0];
  for (let i = 1; i < prof.length; i++) {
    if (y <= prof[i][0]) {
      const a = prof[i - 1], c = prof[i], t = (y - a[0]) / (c[0] - a[0]);
      return [y, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t, (a[3] || 0) + ((c[3] || 0) - (a[3] || 0)) * t];
    }
  }
  return prof[prof.length - 1];
}
function surfZ(prof, x, y, lift = 0.008) {
  const r = ringAt(prof, y);
  return (r[3] || 0) + r[2] * Math.sqrt(Math.max(0.04, 1 - (x / r[1]) ** 2)) + lift;
}
// 贴着身前的一条带子：衣领、对襟、绦带
function strip(b, prof, pts, w, color, id, dy, lift) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    bar(b, [x0, y0 + dy, surfZ(prof, x0, y0, lift)], [x1, y1 + dy, surfZ(prof, x1, y1, lift)], w, 0.012, color, id, 0.45);
  }
}

// ───────────────────────── 头 ─────────────────────────
// 头的轮廓：[高, 半宽, 面前, 脑后]（米，相对头心；面朝 +z）
const HEAD = [
  [-0.112, 0.016, 0.064, -0.036], [-0.1, 0.034, 0.079, -0.01], [-0.082, 0.049, 0.086, 0.016], [-0.06, 0.06, 0.09, 0.04], [-0.036, 0.068, 0.091, 0.06],
  [-0.01, 0.073, 0.09, 0.076], [0.016, 0.075, 0.088, 0.088], [0.042, 0.076, 0.089, 0.095], [0.068, 0.075, 0.086, 0.098], [0.09, 0.069, 0.076, 0.094],
  [0.106, 0.056, 0.058, 0.078], [0.117, 0.036, 0.034, 0.05], [0.123, 0.012, 0.01, 0.016],
];
const HEAD_TOP = 0.123;
function skull(alpha, y, k = 1, jaw = 1) {
  let r = HEAD[HEAD.length - 1];
  if (y <= HEAD[0][0]) r = HEAD[0];
  else
    for (let i = 1; i < HEAD.length; i++)
      if (y <= HEAD[i][0]) {
        const a = HEAD[i - 1], c = HEAD[i], t = (y - a[0]) / (c[0] - a[0]);
        r = [y, a[1] + (c[1] - a[1]) * t, a[2] + (c[2] - a[2]) * t, a[3] + (c[3] - a[3]) * t];
        break;
      }
  const cz = (r[2] - r[3]) / 2, rz = (r[2] + r[3]) / 2, s = Math.sin(alpha), c = Math.cos(alpha);
  // 面前略方（颧与颏有个转折），脑后浑圆
  const e = 1 - 0.17 * Math.max(0, Math.min(1, c * 2 + 0.4));
  const jw = y < -0.03 ? 1 + (jaw - 1) * Math.min(1, (-0.03 - y) / 0.05) : 1;
  return [r[1] * jw * k * Math.sign(s) * Math.abs(s) ** e, y, cz + rz * k * Math.sign(c) * Math.abs(c) ** e];
}
function headMesh(b, face, id, jaw) {
  const NA = LOD ? 12 : 20, P = [], UV = [], IDX = [];
  const ys = HEAD.map((r) => r[0]).filter((_, i) => !LOD || i % 2 === 0);
  ys.forEach((y, r) => {
    for (let i = 0; i <= NA; i++) {
      const a = -Math.PI + (i / NA) * TAU;
      P.push(...skull(a, y, 1, jaw));
      UV.push(...faceUV(face, headU(a), (y - HEAD_Y0) / (HEAD_Y1 - HEAD_Y0)));
      if (r < ys.length - 1 && i < NA) {
        const q = r * (NA + 1) + i;
        IDX.push(q, q + 1, q + NA + 1, q + 1, q + NA + 2, q + NA + 1);
      }
    }
  });
  b.raw('face', P, UV, IDX, { id, lw: 0.9 });
}
// 贴着头形的一层：发、巾、帽。line 是下缘的高度（方位角 → 高），k 是比头大出的一圈
function cap(b, color, id, line, k, drop = 0) {
  const NA = LOD ? 12 : 20, T = LOD ? 3 : 5, P = [], UV = [], IDX = [];
  for (let i = 0; i <= NA; i++) {
    const a = -Math.PI + (i / NA) * TAU, y0 = hairlineAt(line, a) + drop;
    for (let t = 0; t <= T; t++) {
      const f = t / T, y = y0 + (HEAD_TOP - 0.002 - y0) * (1 - (1 - f) ** 1.5), p = skull(a, y, k);
      P.push(p[0], y + (k - 1) * 0.11 * sstep(-0.02, HEAD_TOP, y), p[2]);
      UV.push(BLV[0], BLV[1]);
      if (i < NA && t < T) {
        const q = i * (T + 1) + t;
        IDX.push(q, q + T + 1, q + 1, q + 1, q + T + 1, q + T + 2);
      }
    }
  }
  const top = P.length / 3;
  P.push(0, HEAD_TOP + (k - 1) * 0.11 + 0.001, -0.004);
  UV.push(BLV[0], BLV[1]);
  for (let i = 0; i < NA; i++) IDX.push(top, i * (T + 1) + T, (i + 1) * (T + 1) + T);
  b.raw(M, P, UV, IDX, { color, id, lw: 0.8 });
}
const FUTOU_LINE = [[0, 0.064], [0.8, 0.062], [1.2, 0.05], [1.6, 0.03], [2.3, -0.012], [3.1416, -0.022]];
const SCARF_LINE = [[0, 0.07], [0.9, 0.066], [1.3, 0.046], [1.7, 0.016], [2.4, -0.03], [3.1416, -0.044]];

// 冠巾发髻（坐标相对头心）
function headwear(b, kind, o, woman, child) {
  const kid = b.nextId();
  const hairC = FACE_DEFS[FACE_ID].old ? [0.72, 0.71, 0.7] : HAIR;
  cap(b, hairC, kid, woman ? HAIRLINE.woman : HAIRLINE.man, 1.03);
  if (kind === 'futou' || kind === 'official') {
    // 幞头：一顶贴头的皂纱巾，脑后隆起一道“山”，垂下两脚
    const fid = b.nextId();
    cap(b, GAUZE, fid, FUTOU_LINE, 1.075);
    plain(b, [[0, 0.086, -0.036, 0.064, 0.05], [0, 0.136, -0.046, 0.061, 0.047], [0, 0.164, -0.05, 0.046, 0.036], [0, 0.175, -0.05, 0.018, 0.014]], GAUZE, fid, { seg: 10, capA: false, lw: 0.8 });
    stick(b, [-0.07, 0.07, 0.035], [0.07, 0.07, 0.035], 0.006, 0.006, [0.14, 0.14, 0.15], fid, 4, 0.4);
    if (kind === 'official') b.box(M, 0, 0.04, -0.112, 0.72, 0.022, 0.034, { color: GAUZE, id: fid, uv: BL, lw: 0.6 });
    else if (!o.noTails)
      for (const sx of [-1, 1]) {
        bar(b, [sx * 0.028, 0.03, -0.106], [sx * 0.07, -0.1, -0.15], 0.034, 0.008, GAUZE, fid);
        bar(b, [sx * 0.07, -0.1, -0.15], [sx * 0.084, -0.2, -0.136], 0.03, 0.008, GAUZE, fid);
      }
  } else if (kind === 'scarf') {
    // 裹巾：脑后一结，两角垂下
    const c = o.scarf || JIN, fid = b.nextId();
    cap(b, c, fid, SCARF_LINE, 1.065);
    sph(b, 0, 0.1, -0.082, 0.04, 0.034, 0.036, c, fid, { ws: 7, hs: 5 });
    for (const sx of [-1, 1]) bar(b, [sx * 0.018, 0.09, -0.105], [sx * 0.06, -0.01, -0.15], 0.03, 0.008, c, fid);
  } else if (kind === 'bun' || kind === 'highbun') {
    // 妇人：脑后垂髻、顶上高髻，簪钗与一朵绢花
    sph(b, 0, -0.01, -0.092, 0.07, 0.064, 0.046, hairC, kid);
    sph(b, 0, 0.128, -0.032, 0.062, 0.044, 0.06, hairC, kid);
    if (kind === 'highbun') {
      sph(b, 0, 0.19, -0.028, 0.046, 0.058, 0.044, hairC, kid);
      b.box(M, 0, 0.14, 0.034, 0.09, 0.034, 0.012, { color: GOLD, id: kid, uv: BL, lw: 0.5 });
    }
    stick(b, [-0.105, 0.138, -0.034], [0.105, 0.15, -0.034], 0.006, 0.006, GOLD, kid, 4, 0.5);
    sph(b, 0.066, 0.118, 0.03, 0.024, 0.024, 0.02, [0.86, 0.4, 0.38], kid, { ws: 6, hs: 5, lw: 0.4 });
    sph(b, 0.05, 0.132, 0.036, 0.014, 0.014, 0.012, [1.1, 0.9, 0.86], kid, { ws: 5, hs: 4, lw: 0.3 });
  } else if (kind === 'douli') {
    // 斗笠：竹篾编的尖顶大笠，颔下系带
    const did = b.nextId();
    plain(b, [[0, 0.072, 0, 0.36, 0.36], [0, 0.118, 0, 0.2, 0.2], [0, 0.172, 0, 0.076, 0.076], [0, 0.198, 0, 0.02, 0.02]], STRAW, did, { seg: 14, capA: false });
    plain(b, [[0, 0.07, 0, 0.36, 0.36], [0, 0.084, 0, 0.3, 0.3]], [0.8, 0.72, 0.52], did, { seg: 14, capA: false, capB: false, lw: 0.4 });
    for (const sx of [-1, 1]) stick(b, [sx * 0.08, 0.08, 0.01], [sx * 0.05, -0.1, 0.06], 0.004, 0.004, CORD, did, 3, 0.4);
  } else if (kind === 'kid' || child) {
    // 总角：两个小髻，扎红头绳
    for (const sx of [-1, 1]) {
      sph(b, sx * 0.07, 0.112, -0.012, 0.036, 0.036, 0.036, hairC, kid, { ws: 7, hs: 5 });
      sph(b, sx * 0.06, 0.092, -0.01, 0.016, 0.014, 0.016, [0.86, 0.4, 0.36], kid, { ws: 5, hs: 4, lw: 0.4 });
    }
  } else {
    // 椎髻：光着头，顶上一个髻，束一道布条
    sph(b, 0, 0.15, -0.03, 0.038, 0.04, 0.038, hairC, kid, { ws: 7, hs: 6 });
    b.cyl(M, 0, 0.118, -0.03, 0.028, 0.032, 0.016, 8, { color: [0.8, 0.76, 0.66], id: kid, uv: BL, lw: 0.4 });
  }
}
// 颈以上：头、鼻、耳、须、冠巾。坐标系原点在头心
function head(b, o, face, woman, hid) {
  const def = FACE_DEFS[face], child = !!def.child;
  headMesh(b, face, hid, woman ? 0.93 : child || def.round ? 1.08 : 1);
  // 鼻：一道窄梁，鼻头略圆
  const nk = child ? 0.75 : woman ? 0.86 : 1;
  flesh(b, [[0, 0.03, 0.08, 0.008, 0.008], [0, 0.0, 0.089 + 0.005 * nk, 0.0095, 0.009], [0, -0.024, 0.092 + 0.0125 * nk, 0.0125 * nk + 0.001, 0.0105], [0, -0.0345, 0.09, 0.011, 0.006]], hid, { seg: 6, lw: 0.34, capA: false, side: [1, 0, 0] });
  if (!LOD && !woman) {
    const uv = skinUV();
    for (const sx of [-1, 1]) b.sphere('face', sx * 0.0755, -0.006, -0.004, 0.009, 0.029, 0.019, { uv: [0, 0, uv[0], uv[1]], id: hid, lw: 0.4, ws: 6, hs: 5, ry: sx * 0.35 });
  }
  if (def.beard === 'long') {
    // 长髯垂胸
    const bc = [0.92, 0.91, 0.87];
    plain(b, [[0, -0.096, 0.07, 0.03, 0.014], [0, -0.15, 0.074, 0.028, 0.012], [0, -0.21, 0.07, 0.018, 0.008], [0, -0.245, 0.066, 0.005, 0.004]], bc, b.nextId(), { seg: 6, side: [1, 0, 0], lw: 0.5 });
  }
  headwear(b, o.hat || (woman ? 'bun' : child ? 'kid' : 'futou'), o, woman, child);
}

// ───────────────────────── 四肢 ─────────────────────────
// 臂的姿势：肘、腕相对肩的位置（sx 为哪一侧，shx 为肩的半宽）
const ARM = {
  down: (sx) => [[sx * 0.045, -0.265, -0.012], [sx * 0.058, -0.51, 0.04]],
  tuck: (sx, shx) => [[sx * 0.075, -0.24, 0.02], [sx * (0.03 - shx), -0.335, 0.2]],
  reach: (sx) => [[sx * 0.05, -0.22, 0.09], [sx * 0.02, -0.25, 0.34]],
  up: (sx) => [[sx * 0.12, -0.2, 0.13], [sx * 0.03, 0.03, 0.2]],
  hail: (sx) => [[sx * 0.1, -0.1, 0.22], [sx * 0.07, 0.12, 0.32]],
  back: (sx, shx) => [[sx * 0.06, -0.25, -0.06], [sx * (0.04 - shx), -0.42, -0.17]],
  hip: (sx) => [[sx * 0.13, -0.21, -0.05], [sx * 0.0, -0.33, 0.085]],
  chat: (sx) => [[sx * 0.05, -0.24, 0.05], [-sx * 0.01, -0.14, 0.25]],
};
// 两臂各取哪个姿势
function armPoses(arms) {
  if (arms === 'carry') return ['down', 'up'];
  if (arms === 'hail') return ['down', 'hail'];
  if (arms === 'hip') return ['down', 'hip'];
  if (arms === 'chat') return ['down', 'chat'];
  return [arms, arms];
}
const SLEEVE_FOLDS = [[0.9, 0.13, 0.7, 1], [4.4, 0.12, 0.7, -1], [2.6, 0.1, 0.6, -1]];
// 一条胳膊：肩 S、肘 E、腕 W。kind：wide 宽袖 / narrow 窄袖 / rolled 挽袖露臂
function arm(b, sx, S, E, W, kind, robe, id, withHand = true) {
  const t1 = nrm([E[0] - S[0], E[1] - S[1], E[2] - S[2]]), t2 = nrm([W[0] - E[0], W[1] - E[1], W[2] - E[2]]), tm = nrm([t1[0] + t2[0], t1[1] + t2[1], t1[2] + t2[2]]);
  // 袖子往下坠：坠的方向是“朝地”在垂直于臂的平面上的那一份；臂直垂时就朝里、朝后
  const frame = (t) => {
    const gd = [t[1] * t[0], t[1] * t[1] - 1, t[1] * t[2]], h = Math.hypot(gd[0], gd[1], gd[2]);
    const f0 = [-sx * 0.7, 0, -0.7], d = f0[0] * t[0] + f0[1] * t[1] + f0[2] * t[2], fb = nrm([f0[0] - d * t[0], f0[1] - d * t[1], f0[2] - d * t[2]]);
    const k = sstep(0.2, 0.65, h), g = nrm([(gd[0] / (h || 1)) * k + fb[0] * (1 - k), (gd[1] / (h || 1)) * k + fb[1] * (1 - k), (gd[2] / (h || 1)) * k + fb[2] * (1 - k)]);
    return { g, w: nrm(cross(t, g)), h: k };
  };
  const f1 = frame(t1), fm = frame(tm), f2 = frame(t2);
  const pt = (p, f, ru, rw, off, amp, k = 1) => ({ c: add3(p, f.g, off), u: f.g, w: f.w, ru, rw, amp, k });
  const capR = { c: [S[0] - sx * 0.03, S[1] + 0.042, S[2]], u: f1.g, w: f1.w, ru: 0.03, rw: 0.03 };
  const opt = { color: robe, id, folds: SLEEVE_FOLDS, seg: 12, capA: true };
  if (kind === 'rolled') {
    loft(b, M, [capR, pt(S, f1, 0.068, 0.066, 0, 0), pt(mix3(S, E, 0.5), f1, 0.064, 0.062, 0, 0.3), pt(E, fm, 0.062, 0.06, 0, 0.5), pt(add3(E, t2, 0.045), f2, 0.066, 0.063, 0, 0.4, 0.92)], opt);
    flesh(b, [[...add3(E, t2, 0.02), 0.043], [...mix3(E, W, 0.45), 0.042], [...W, 0.03]], id, { lw: 0.6, capA: false });
  } else if (kind === 'narrow') {
    loft(b, M, [capR, pt(S, f1, 0.061, 0.06, 0, 0), pt(mix3(S, E, 0.5), f1, 0.06, 0.058, 0, 0.3), pt(E, fm, 0.057, 0.055, 0, 0.5), pt(mix3(E, W, 0.55), f2, 0.052, 0.05, 0, 0.6), pt(add3(W, t2, -0.005), f2, 0.047, 0.044, 0, 0.6, 0.94)], opt);
  } else {
    // 臂横着时袖子往下坠成一只袋；臂垂着时多出的布料贴向身侧，外沿不往外张
    const h1 = f1.h, hm = fm.h, h2 = f2.h;
    const off = (ru, h, oh) => oh * h + Math.max(0, ru - 0.066) * 0.9 * (1 - h);
    const r1 = 0.074 + 0.012 * h1, r2 = 0.078 + 0.018 * hm, r3 = 0.082 + 0.04 * h2, r4 = 0.086 + 0.065 * h2, r5 = 0.088 + 0.082 * h2;
    loft(b, M, [
      capR,
      pt(S, f1, 0.068, 0.066, 0, 0),
      pt(mix3(S, E, 0.5), f1, r1, 0.066, off(r1, h1, 0.012), 0.3),
      pt(E, fm, r2, 0.064, off(r2, hm, 0.02), 0.5),
      pt(mix3(E, W, 0.5), f2, r3, 0.06, off(r3, h2, 0.04), 0.8),
      pt(W, f2, r4, 0.056 - 0.012 * h2, off(r4, h2, 0.06), 1),
      pt(add3(W, t2, 0.075), f2, r5, 0.052 - 0.014 * h2, off(r5, h2, 0.075), 1, 0.9),
    ], opt);
  }
  if (withHand) hand(b, W, t2, sx, id);
}
// 手：掌扁指并，拇指另出
function hand(b, W, t, sx, id) {
  const p = (d, ...r) => [W[0] + t[0] * d, W[1] + t[1] * d, W[2] + t[2] * d, ...r];
  const d = sx * t[0], sv = nrm([sx - d * t[0], -d * t[1], -d * t[2] + 1e-4]);
  flesh(b, [p(-0.014, 0.024, 0.026), p(0.034, 0.016, 0.035), p(0.078, 0.012, 0.032), p(0.106, 0.006, 0.018)], id, { seg: 6, side: sv, lw: 0.5, capA: false });
  if (!LOD) {
    const wd = cross(sv, t).map((v) => -v * sx), a = add3(p(0.02), wd, 0.024), c = add3(p(0.062), wd, 0.046);
    flesh(b, [[...a, 0.0115], [...c, 0.0075]], id, { seg: 5, lw: 0.4 });
  }
}
// 布鞋：鞋头微翘（原点在脚跟下的地面，脚尖朝 +z）
function shoe(b, color, id) {
  plain(b, [[0, 0.036, -0.07, 0.026, 0.03], [0, 0.042, -0.02, 0.04, 0.042], [0, 0.03, 0.07, 0.044, 0.03], [0, 0.03, 0.136, 0.032, 0.02], [0, 0.046, 0.16, 0.012, 0.01]], color, id, { seg: 7, side: [1, 0, 0], lw: 0.55 });
}
// 腿分两截：股以胯为原点，胫以膝为原点。bare：裤脚挽到膝下，赤胫草鞋
function thigh(b, pants, id) {
  cloth(b, [[0, 0.04, 0, 0.1], [0, -0.2, 0.008, 0.092], [0, -(HIP - KNEE) - 0.03, 0.012, 0.08]], pants, id, { us: 0.5, vs: [1, 0.7, 0.45], seg: 8 });
}
function shin(b, bare, pants, skin, id) {
  if (bare) {
    cloth(b, [[0, 0.04, 0.012, 0.082], [0, -0.075, 0.012, 0.076]], pants, id, { us: 0.5, vs: [0.45, 0.3], seg: 8 });
    plain(b, [[0, -0.05, 0.01, 0.05], [0, -0.16, 0.0, 0.053], [0, -0.3, 0.006, 0.037], [0, -(KNEE - 0.075), 0.01, 0.031]], skin, id, { lw: 0.6, capA: false });
    plain(b, [[0, -KNEE + 0.052, -0.05, 0.027, 0.03], [0, -KNEE + 0.044, 0.02, 0.04, 0.03], [0, -KNEE + 0.03, 0.11, 0.043, 0.018], [0, -KNEE + 0.026, 0.145, 0.03, 0.012]], skin, id, { seg: 6, side: [1, 0, 0], lw: 0.5 });
    b.box(M, 0, -KNEE + 0.009, 0.045, 0.092, 0.018, 0.23, { color: STRAW, id, uv: BL, lw: 0.5 });
    bar(b, [-0.045, -KNEE + 0.02, 0.07], [0.045, -KNEE + 0.02, 0.07], 0.012, 0.05, CORD, id, 0.3);
  } else {
    cloth(b, [[0, 0.04, 0.012, 0.082], [0, -0.18, 0.006, 0.072], [0, -(KNEE - 0.1), 0.004, 0.056]], pants, id, { us: 0.5, vs: [0.45, 0.2, 0], seg: 8 });
    b.push(_m1.makeTranslation(0, -KNEE, 0));
    shoe(b, SHOE, id);
    b.pop();
  }
}

// 由形象描述推出衣着的各项
function resolve(o) {
  const face = o.face ?? FACE.man, def = FACE_DEFS[face] || FACE_DEFS[0];
  const woman = o.woman ?? !!def.woman;
  const dress = o.dress || (woman ? 'beizi' : o.long === false ? 'jacket' : 'robe');
  const robe = o.robe || ROBES[0];
  const w = o.build || 1;
  return {
    face, def, woman, dress, robe, w,
    trim: o.trim || robe.map((c) => c * 0.72),
    skin: skinOf(face),
    pants: o.pants || [0.98, 0.96, 0.9],
    sleeve: o.sleeve || (dress === 'jacket' ? (o.rolled === false ? 'narrow' : 'rolled') : dress === 'beizi' ? 'narrow' : 'wide'),
    shx: woman ? 0.14 : 0.158 * w,
  };
}
// 由形象给出一组不变的小随机数：同一个人每回都一样，人与人各不相同
function quirks(o) {
  const r = o.robe || ROBES[0];
  return (n) => {
    const v = Math.sin(r[0] * 127.1 + r[1] * 311.7 + r[2] * 74.7 + (o.face || 0) * 19.3 + (o.s || 1) * 53.1 + n * 37.7) * 43758.5453;
    return v - Math.floor(v);
  };
}
function mkFolds(q, n, d0, d1, w0, w1, seed, avoid) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.15 + q(seed + i) * 0.7) / n) * TAU;
    if (avoid && Math.abs(angDiff(a, Math.PI / 2)) < avoid) continue;
    out.push([a, d0 + (d1 - d0) * q(seed + i + 20), w0 + (w1 - w0) * q(seed + i + 40), q(seed + i + 60) > 0.5 ? 1 : -1]);
  }
  return out;
}

// 在批处理器当前坐标系原点立一个人，面朝 +Z
export function figure(b, o = {}) {
  LOD = o.lod ?? 1;
  const s = o.s || 1;
  const { face, def, woman, dress, robe, trim, skin, pants, sleeve, shx, w } = resolve(o);
  FACE_ID = face;
  SKIN = skin;
  const beizi = dress === 'beizi', jacket = dress === 'jacket';
  const pose = o.pose || 'stand', seated = pose === 'sit' || pose === 'ride';
  const dy = seated ? -0.38 : 0; // 坐下时上身落低
  const hem = o.hem ?? 0.06;
  const child = !!def.child, old = !!def.old;
  const q = quirks(o), still = !o.neutral;
  // 小动作：欠身、侧身、转头、俯仰、歪头
  const lean = o.lean ?? (o.prop === 'pole' || o.prop === 'sack' ? 0.1 : old ? 0.13 : seated ? 0.04 : woman ? 0.02 : 0.035);
  const sway = o.sway ?? (still && !seated ? (q(1) - 0.5) * 0.09 : 0);
  const turn = o.turn ?? (still ? (q(2) - 0.5) * 0.9 : 0);
  const nod = o.nod ?? (old ? -0.1 : still ? (q(3) - 0.5) * 0.16 : 0);
  const tilt = o.tilt ?? (still ? (q(4) - 0.5) * 0.14 : 0);
  // 活气：站着、坐着的人会呼吸、挪重心、偶尔转头（由顶点着色器驱动，见 ink.js）
  const live = o.life ?? !o.neutral;
  const m0 = [b.mark(M), b.mark('face')], base = _v1.set(0, 0, 0).applyMatrix4(b.M).toArray();
  b.push(_sc.makeScale(s, s, s));
  const rid = b.nextId(), hid = b.nextId(), lid = b.nextId();
  const ring = ringOf(dy), ring0 = ringOf(0);
  const skirtCol = o.skirt || o.inner || WHITE;

  // ── 下裳 ──
  if (!seated && !o.noSkirt) {
    if (beizi) {
      // 长裙曳地，褶子细密；褙子直身垂到小腿
      loft(b, M, [[0.04, 0.205, 0.19, 0, 0.7, 0.9], [0.3, 0.184, 0.168, 0, 0.9, 0.96], [0.52, 0.166, 0.148, 0, 0.6]].map(ring0), { color: skirtCol, id: lid, folds: mkFolds(q, 12, 0.06, 0.12, 0.2, 0.4, 9), seg: 22 });
      loft(b, M, [[0.42, 0.178, 0.156, 0, 0.45, 0.93], [0.56, 0.169, 0.146, 0.001, 0.62, 0.95], [0.72, 0.158, 0.134, 0.002, 0.5, 0.97], [WAIST, 0.136, 0.108, 0.004, 0.1]].map(ring0), { color: robe, id: rid, folds: mkFolds(q, 7, 0.07, 0.13, 0.3, 0.55, 3, 0.5), seg: 20 });
    } else if (jacket) {
      loft(b, M, [[0.64, 0.196 * w, 0.156, 0, 0.55, 0.93], [0.72, 0.19 * w, 0.149, 0.001, 0.75, 0.95], [0.82, 0.182 * w, 0.14, 0.002, 0.62, 0.97], [WAIST, 0.154 * w, 0.116, 0.004, 0.1]].map(ring0), { color: robe, id: rid, folds: mkFolds(q, 7, 0.08, 0.15, 0.35, 0.6, 3), seg: 20 });
    } else {
      loft(b, M, [[hem, 0.216 * w, 0.19, 0, 0.66, 0.9], [hem + 0.2, 0.208 * w, 0.18, 0.002, 0.95, 0.95], [0.62, 0.188 * w, 0.158, 0.004, 0.62, 0.98], [0.86, 0.168 * w, 0.134, 0.004, 0.3], [WAIST, 0.152 * w, 0.114, 0.004, 0.06]].map(ring0), { color: robe, id: rid, folds: mkFolds(q, 8, 0.07, 0.15, 0.3, 0.62, 3), seg: 22 });
    }
  }
  // ── 腿脚 ──
  if (pose === 'sit') {
    if (jacket) {
      for (const sx of [-1, 1]) {
        cloth(b, [[sx * 0.09, 0.46, -0.02, 0.096], [sx * 0.1, 0.49, 0.32, 0.08], [sx * 0.1, 0.42, 0.4, 0.072]], pants, lid, { us: 0.5, vs: [1, 0.5, 0.35], seg: 8 });
        cloth(b, [[sx * 0.1, 0.47, 0.38, 0.072], [sx * 0.1, 0.1, 0.4, 0.058]], pants, lid, { us: 0.5, vs: [0.5, 0], seg: 8 });
        b.push(_m1.makeTranslation(sx * 0.1, 0, 0.36));
        shoe(b, SHOE, lid);
        b.pop();
      }
    } else {
      // 袍裙盖膝垂下
      cloth(b, [[0, 0.52, -0.03, 0.18, 0.13], [0, 0.49, 0.14, 0.2, 0.135], [0, 0.48, 0.34, 0.2, 0.12], [0, 0.3, 0.42, 0.205, 0.11], [0, 0.05, 0.44, 0.22, 0.13]], beizi ? skirtCol : robe, beizi ? lid : rid, { vs: [1, 0.8, 0.6, 0.35, 0], seg: 12 });
      for (const sx of [-1, 1]) {
        b.push(_m1.makeTranslation(sx * 0.075, 0, 0.47));
        shoe(b, beizi ? trim : SHOE, lid);
        b.pop();
      }
    }
  } else if (pose === 'ride') {
    const lc = jacket ? pants : robe;
    plain(b, [[0, 0.62, 0, 0.18, 0.14], [0, 0.46, 0, 0.21, 0.19], [0, 0.4, 0, 0.12, 0.1]], lc, lid, { seg: 10 });
    for (const sx of [-1, 1]) {
      cloth(b, [[sx * 0.1, 0.47, -0.02, 0.1], [sx * 0.27, 0.27, 0.12, 0.084], [sx * 0.3, -0.1, 0.08, 0.066]], lc, lid, { us: 0.5, vs: [1, 0.5, 0], seg: 8 });
      plain(b, [[sx * 0.3, -0.06, 0.08, 0.061], [sx * 0.3, -0.25, 0.09, 0.052]], SHOE, lid);
      b.push(_m1.makeTranslation(sx * 0.3, -0.32, 0.06));
      shoe(b, SHOE, lid);
      b.pop();
    }
  } else if (o.staticLegs !== false) {
    if (jacket) {
      // 两腿一前一后，膝微屈
      for (const sx of [-1, 1]) {
        const st = sx * (o.stride ?? (still ? 0.04 + q(5) * 0.07 : 0)), a = Math.atan2(st, 0.84);
        b.push(_m1.makeTranslation(sx * 0.085, HIP, 0).multiply(_m2.makeRotationX(-a)));
        thigh(b, pants, lid);
        b.push(_m1.makeTranslation(0, -(HIP - KNEE), 0.012).multiply(_m2.makeRotationX(a > 0 ? a : -a * 0.3)));
        shin(b, o.bare, pants, skin, lid);
        b.pop();
        b.pop();
      }
    } else if (hem < 0.2) {
      // 袍裙底下露出的鞋尖：微微外撇，一前一后
      for (const sx of [-1, 1]) {
        b.push(_m1.makeTranslation(sx * 0.078, 0, 0.02 + sx * (still ? (q(5) - 0.5) * 0.07 : 0)).multiply(_m2.makeRotationY(sx * 0.16)));
        shoe(b, beizi ? trim : SHOE, lid);
        b.pop();
      }
    }
  }

  // ── 腰以上：略前倾、微侧 ──
  _up.makeTranslation(0, WAIST + dy, 0).multiply(_m2.makeRotationFromEuler(_e.set(lean, 0, sway, 'YXZ'))).multiply(_m2.makeTranslation(0, -(WAIST + dy), 0));
  b.push(_up);
  const up = woman
    ? [[WAIST, 0.134, 0.106, 0.004, 0.12], [1.08, 0.138, 0.11, 0.008, 0.3], [1.19, 0.148, 0.118, 0.014, 0.12], [1.28, 0.15, 0.108, 0.004, 0], [1.335, 0.14, 0.096, 0, 0], [1.378, 0.104, 0.082, -0.004, 0], [1.406, 0.066, 0.062, -0.008, 0], [1.43, 0.05, 0.05, -0.008, 0]]
    : [[WAIST, 0.152 * w, 0.114, 0.004, 0.12], [1.07, 0.16 * w, 0.12, 0.006, 0.42], [1.17, 0.174 * w, 0.126, 0.008, 0.22], [1.27, 0.178 * w, 0.123, 0.004, 0.06], [1.33, 0.168 * w, 0.11, 0, 0], [1.376, 0.126 * w, 0.092, -0.004, 0], [1.406, 0.078, 0.07, -0.008, 0], [1.43, 0.056, 0.056, -0.008, 0]];
  const low = seated ? [[0.84, up[0][1] + 0.022, up[0][2] + 0.02, 0, 0.3]] : [];
  loft(b, M, [...low, ...up].map(ring), { color: robe, id: rid, folds: mkFolds(q, 6, 0.08, 0.16, 0.35, 0.6, 30, jacket || beizi ? 0.75 : 0), seg: 20, capA: seated });

  // ── 腰带 ──
  if (!beizi) {
    const bc = o.belt || (jacket ? trim : [0.3, 0.29, 0.3]), bid = b.nextId();
    const r0 = ringAt(up, 0.978), r1 = ringAt(up, 1.03);
    plain(b, [[0, 0.978 + dy, r0[3], r0[1] * 1.03 + 0.008, r0[2] * 1.03 + 0.008], [0, 1.03 + dy, r1[3], r1[1] * 1.04 + 0.008, r1[2] * 1.04 + 0.008]], bc, bid, { seg: 14, capA: false, capB: false, lw: 0.5 });
    if (jacket) {
      // 布带在腰间打个结，垂下两绺
      sph(b, -0.05, 1.004 + dy, surfZ(up, -0.05, 1.004, 0.024), 0.032, 0.027, 0.02, bc, bid, { ws: 6, hs: 5 });
      strip(b, up.concat([[0.6, 0.2, 0.15, 0]]).sort((a, c) => a[0] - c[0]), [[-0.062, 0.99], [-0.082, 0.86], [-0.088, 0.74]], 0.03, bc, bid, dy, 0.022);
      strip(b, up.concat([[0.6, 0.2, 0.15, 0]]).sort((a, c) => a[0] - c[0]), [[-0.04, 0.99], [-0.034, 0.87], [-0.03, 0.79]], 0.028, bc, bid, dy, 0.022);
    } else {
      // 革带：当腰一方带銙，带尾垂在一侧
      b.box(M, 0, 1.004 + dy, surfZ(up, 0, 1.004, 0.016), 0.05, 0.04, 0.012, { color: [0.62, 0.56, 0.42], id: bid, uv: BL, lw: 0.4 });
      if (!seated) strip(b, up.concat([[0.6, 0.2, 0.17, 0]]).sort((a, c) => a[0] - c[0]), [[0.1, 0.99], [0.112, 0.86]], 0.03, bc, bid, dy, 0.022);
    }
  }

  // ── 衣领 ──
  const cid = b.nextId();
  if (beizi) {
    // 褙子对襟：当中露出里衣，两道领抹直贯到底
    const inner = o.inner || WHITE;
    strip(b, up, [[0, WAIST], [0, 1.2], [0, 1.37]], 0.05, inner, cid, dy, 0.007);
    for (const sx of [-1, 1]) strip(b, up, [[sx * 0.035, WAIST], [sx * 0.035, 1.2], [sx * 0.04, 1.37], [sx * 0.05, 1.41]], 0.02, trim, cid, dy, 0.011);
    if (!seated) {
      const lowP = [[0.42, 0.178, 0.156, 0], [0.7, 0.16, 0.136, 0.002], [WAIST, 0.136, 0.108, 0.004]];
      b.pop(); // 下半截的领抹不随上身倾侧
      strip(b, lowP, [[0, 0.44], [0, 0.72], [0, WAIST]], 0.05, inner, cid, 0, 0.007);
      for (const sx of [-1, 1]) strip(b, lowP, [[sx * 0.036, 0.43], [sx * 0.036, 0.72], [sx * 0.035, WAIST]], 0.02, trim, cid, 0, 0.011);
      b.push(_up);
    }
  } else if (jacket) {
    // 交领右衽
    strip(b, up, [[-0.056, 1.41], [-0.02, 1.31], [0.035, 1.21], [0.082, 1.11], [0.105, 1.03]], 0.036, trim, cid, dy, 0.012);
    strip(b, up, [[0.056, 1.41], [0.03, 1.335], [0.002, 1.275]], 0.034, trim, cid, dy, 0.01);
  } else plain(b, [[0, 1.392 + dy, -0.006, 0.108 * w, 0.09], [0, 1.43 + dy, -0.008, 0.07, 0.068]], trim, cid, { seg: 12, capA: false, capB: false, lw: 0.5 }); // 圆领
  plain(b, [[0, 1.414 + dy, -0.008, 0.066, 0.064], [0, 1.452 + dy, -0.005, 0.053, 0.054]], WHITE, cid, { seg: 10, capA: false, capB: false, lw: 0.4 }); // 中单白领

  // ── 臂 ──
  const arms = o.arms || 'tuck';
  if (arms !== 'none' && o.staticArms !== false) {
    const poses = armPoses(arms);
    [-1, 1].forEach((sx, i) => {
      // 右手做事（面朝 +z 时右手在 -x 一侧）
      const ap = poses[sx < 0 ? 1 : 0], S = [sx * shx, SHY + dy, 0];
      const [e, wr] = (ARM[ap] || ARM.down)(sx, shx), E = [S[0] + e[0], S[1] + e[1], S[2] + e[2]], W = [S[0] + wr[0], S[1] + wr[1], S[2] + wr[2]];
      arm(b, sx, S, E, W, sleeve, robe, rid, !(ap === 'tuck' && sleeve === 'wide'));
    });
  }

  // ── 颈、首 ──
  flesh(b, [[0, 1.385 + dy, -0.014, woman ? 0.041 : 0.047, woman ? 0.044 : 0.05], [0, 1.48 + dy, -0.002, woman ? 0.038 : 0.043, woman ? 0.042 : 0.047]], hid, { lw: 0.4, capA: false, capB: false });
  const hs = o.headS || (child ? 1.3 : 1);
  // 头的坐标系：原点在颈上的轴心（转头绕它转）
  _hd.makeTranslation(0, HY + dy - 0.09, -0.008).multiply(_m2.makeRotationFromEuler(_e.set(nod - lean * 0.7, turn, tilt - sway, 'YXZ'))).multiply(_m2.makeScale(hs, hs, hs));
  HEAD_FRAME.makeScale(s, s, s).multiply(_up).multiply(_hd);
  let hm = null, he = null, pivot = null;
  if (!o.noHead) {
    b.push(_hd);
    pivot = _v1.set(0, 0, 0).applyMatrix4(b.M).toArray();
    b.push(_m1.makeTranslation(0, 0.09, 0.008));
    hm = [b.mark(M), b.mark('face')];
    head(b, o, face, woman, hid);
    he = [b.mark(M), b.mark('face')];
    b.pop();
    b.pop();
  }

  // ── 肩上、手里的物件 ──
  const prop = o.prop;
  if (prop === 'pole') {
    // 扁担两头各挑一只筐
    const pid = b.nextId(), px = -shx - 0.012, py = SHY + 0.066 + dy;
    for (const sz of [-1, 1]) {
      stick(b, [px, py, 0], [px, py - 0.03, sz * 0.98], 0.019, 0.016, [0.78, 0.72, 0.56], pid);
      const by = 0.46 + dy, bz = sz * 0.92;
      for (const [ox, oz] of [[0.15, 0], [-0.1, 0.12], [-0.1, -0.12]]) stick(b, [px, py - 0.03, bz], [px + ox, by + 0.24, bz + oz], 0.005, 0.005, CORD, pid, 3, 0.4);
      b.cyl(M, px, by, bz, 0.2, 0.15, 0.24, 9, { color: [0.86, 0.76, 0.52], id: pid, uv: BL });
      sph(b, px, by + 0.25, bz, 0.185, 0.085, 0.185, o.load || [0.74, 0.82, 0.6], pid, { lw: 0.5 });
    }
  } else if (prop === 'sack') {
    // 麻包搭在肩上：前头攥着袋口，大半截垂在背后
    const pid = b.nextId(), px = -shx;
    plain(b, [[px, SHY + 0.03 + dy, 0.27, 0.04, 0.04], [px, SHY + 0.1 + dy, 0.16, 0.1, 0.085], [px, SHY + 0.15 + dy, -0.04, 0.16, 0.125], [px + 0.01, SHY + 0.07 + dy, -0.26, 0.17, 0.14], [px + 0.01, SHY - 0.05 + dy, -0.36, 0.1, 0.09]], [0.9, 0.86, 0.74], pid, { seg: 10, side: [1, 0, 0] });
  } else if (prop === 'fan') {
    // 团扇
    const pid = b.nextId(), [fx, fy, fz] = arms === 'reach' ? [-shx - 0.02, 1.16 + dy, 0.47] : [-0.06, 1.14 + dy, 0.31];
    sph(b, fx, fy + 0.08, fz, 0.1, 0.12, 0.008, WHITE, pid, { ws: 12, hs: 6, lw: 0.6 });
    stick(b, [fx, fy - 0.16, fz - 0.01], [fx, fy + 0.18, fz], 0.008, 0.006, [0.56, 0.44, 0.34], pid, 4, 0.4);
  }
  b.pop();
  if (prop === 'staff') stick(b, [-shx - 0.1, 0, 0.16], [-shx - 0.08, 1.46 + dy, 0.04], 0.017, 0.014, [0.6, 0.48, 0.36], b.nextId());
  else if (prop === 'basket') {
    const pid = b.nextId(), x = shx + 0.09;
    b.cyl(M, x, 0.56 + dy, 0.06, 0.15, 0.12, 0.17, 9, { color: [0.86, 0.76, 0.52], id: pid, uv: BL });
    sph(b, x, 0.73 + dy, 0.06, 0.13, 0.05, 0.13, [0.78, 0.84, 0.66], pid, { lw: 0.5 });
    for (const sz of [-1, 1]) stick(b, [x, 0.73 + dy, 0.06 + sz * 0.14], [x - 0.02, 0.86 + dy, 0.05], 0.007, 0.007, CORD, pid, 3, 0.4);
  }
  b.pop();
  LAST_K = 2 + Math.floor(q(7) * 60) + (child ? 128 : seated ? 64 : 0);
  if (live)
    [M, 'face'].forEach((key, i) => {
      b.tag(key, m0[i], b.mark(key), base[0], base[1], base[2], LAST_K);
      if (hm) b.tag(key, hm[i], he[i], pivot[0], pivot[1], pivot[2], LAST_K + Math.max(0.005, Math.min(0.99, (pivot[1] - base[1]) / 4)));
    });
  LOD = 0;
}

// 随机路人形象
export function randomLook(rng, cls) {
  const c = cls || rng.pick(['man', 'man', 'man', 'labor', 'labor', 'labor', 'woman', 'elder', 'kid', 'scholar']);
  const dim = (col, k) => col.map((v) => v * k);
  switch (c) {
    case 'woman': {
      const robe = rng.pick(ROBES_W);
      return { robe, trim: dim(robe, 0.62), skirt: rng.pick([[1.08, 1.05, 0.98], [0.95, 0.9, 0.8], [0.86, 0.9, 0.86], [1.02, 0.9, 0.86]]), inner: [1.1, 1.06, 1.0], face: robe[0] > 0.9 ? FACE.woman : FACE.woman2, woman: true, hat: 'bun', arms: rng.pick(['tuck', 'tuck', 'down']), prop: rng.chance(0.25) ? 'basket' : null, s: rng.f(0.92, 0.98) };
    }
    case 'labor': {
      const robe = rng.pick(PALE), prop = rng.pick(['pole', 'pole', 'sack', null, null]);
      return { robe, trim: dim(robe, 0.66), pants: rng.pick(PALE), face: rng.pick([FACE.tanned, FACE.tanned2, FACE.man2]), hat: rng.pick(['douli', 'scarf', 'scarf', 'knot', 'knot']), long: false, bare: rng.chance(0.6), arms: prop ? 'carry' : 'down', prop, build: rng.f(0.98, 1.06), s: rng.f(0.95, 1.03) };
    }
    case 'elder':
      return { robe: rng.pick(ROBES), face: FACE.elder, hat: rng.pick(['futou', 'scarf']), arms: 'down', prop: 'staff', s: rng.f(0.93, 0.98) };
    case 'kid': {
      const robe = rng.pick([[0.9, 0.7, 0.62], [0.74, 0.82, 0.7], [0.92, 0.86, 0.66]]);
      return { robe, trim: dim(robe, 0.7), face: FACE.child, hat: 'kid', long: false, rolled: false, arms: 'down', s: rng.f(0.6, 0.7) };
    }
    case 'scholar': {
      const robe = rng.pick([[1.08, 1.07, 1.02], [0.8, 0.84, 0.86], [0.92, 0.9, 0.82]]);
      return { robe, trim: dim(robe, 0.78), face: rng.pick([FACE.man, FACE.scholar]), hat: 'futou', arms: 'tuck', prop: rng.chance(0.3) ? 'fan' : null, s: rng.f(0.98, 1.05) };
    }
    default: {
      // 街上的男子：一半长袍，一半短衣
      if (rng.chance(0.5)) return { robe: rng.pick(ROBES), face: rng.pick([FACE.man, FACE.man2, FACE.man3, FACE.scholar]), hat: rng.pick(['futou', 'futou', 'scarf']), arms: rng.pick(['tuck', 'down', 'back', 'chat', 'hip']), s: rng.f(0.95, 1.04) };
      const robe = rng.pick(PALE);
      return { robe, trim: dim(robe, 0.66), pants: rng.pick(PALE), face: rng.pick([FACE.man, FACE.man3, FACE.tanned, FACE.tanned2]), hat: rng.pick(['scarf', 'scarf', 'knot', 'futou']), long: false, rolled: rng.chance(0.4), arms: rng.pick(['tuck', 'down', 'hip', 'down']), s: rng.f(0.95, 1.04) };
    }
  }
}

// ───────────────────────── 可活动的人物 ─────────────────────────
function part(mats, fn) {
  const b = new Batch();
  fn(b);
  return b.build(mats);
}
function buildFigure(mats, look, walk, far, liveHead) {
  if (far) {
    // 远景：手脚都并进身子，只剩衣身与面两件
    const g = new THREE.Group();
    for (const m of part(mats, (b) => figure(b, { ...look, lod: 1, neutral: true }))) g.add(m);
    return g;
  }
  const { woman, dress, robe, trim, skin, pants, sleeve, shx, face } = resolve(look);
  const s = look.s || 1;
  const seated = look.pose === 'sit' || look.pose === 'ride';
  const dynLegs = walk && dress === 'jacket' && !seated, dynFeet = walk && !dynLegs && !seated;
  const swing = walk && look.arms === 'down' && !look.prop;
  const grp = new THREE.Group();
  for (const m of part(mats, (b) => figure(b, { ...look, lod: 0, neutral: walk || look.neutral, staticLegs: !(dynLegs || dynFeet), staticArms: !swing, noHead: liveHead }))) grp.add(m);
  if (liveHead) {
    // 头单独成组：身子的起伏由着色器驱动，头在逻辑里跟上，并可朝人转过去
    const hg = new THREE.Group();
    hg.name = 'head';
    HEAD_FRAME.decompose(hg.position, hg.quaternion, hg.scale);
    hg.userData = { p0: hg.position.toArray(), q0: hg.quaternion.toArray(), K: LAST_K, yaw: 0 };
    FACE_ID = face;
    SKIN = skin;
    for (const m of part(mats, (b) => {
      b.push(_m1.makeTranslation(0, 0.09, 0.008));
      head(b, look, face, woman, b.nextId());
      b.pop();
    })) hg.add(m);
    grp.add(hg);
  }
  // 活动的肢体：皮肉也用衣料材质，一截肢体只占一件网格
  const limb = (parent, name, x, y, z, sc, fn) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x, y, z);
    g.scale.setScalar(sc);
    FACE_ID = face;
    SKIN = skin;
    CLOTH_SKIN = true;
    for (const m of part(mats, fn)) g.add(m);
    CLOTH_SKIN = false;
    parent.add(g);
    return g;
  };
  for (const sx of [-1, 1]) {
    if (dynLegs) {
      const t = limb(grp, 'leg', sx * 0.085 * s, HIP * s, 0, s, (b) => thigh(b, pants, b.nextId()));
      limb(t, 'shin', 0, -(HIP - KNEE), 0.012, 1, (b) => shin(b, look.bare, pants, skin, b.nextId()));
    }
    if (dynFeet) limb(grp, 'foot', sx * 0.078 * s, 0, 0.02 * s, s, (b) => shoe(b, woman ? trim : SHOE, b.nextId()));
    if (swing)
      limb(grp, 'arm', sx * shx * s, SHY * s, 0, s, (b) => {
        const [e, wr] = ARM.down(sx, shx);
        arm(b, sx, [0, 0, 0], e, wr, sleeve, robe, b.nextId());
      });
  }
  return grp;
}
// 同一形象只建一次，再取用时共享几何体
const TEMPLATES = new WeakMap();
export function makeFigure(mats, look, opt = {}) {
  let t = TEMPLATES.get(look);
  if (!t) TEMPLATES.set(look, (t = {}));
  const key = opt.far ? 'far' : opt.walk ? 'walk' : opt.head ? 'npc' : 'stand';
  if (!t[key]) t[key] = buildFigure(mats, look, !!opt.walk, !!opt.far, key === 'npc');
  const grp = t[key].clone(true);
  const pick = (n) => {
    const a = [];
    grp.traverse((c) => c.name === n && a.push(c));
    return a.length ? a : null;
  };
  const hd = pick('head');
  grp.userData = { legs: pick('leg'), shins: pick('shin'), feet: pick('foot'), arms: pick('arm'), head: hd && hd[0], s: look.s || 1 };
  return grp;
}
// 单独成组的头：跟上身子的呼吸与挪动（与着色器同式），再叠上转头。track 为要转去的角度；不给则自己随意张望
export function poseHead(hd, track, dt) {
  const u = hd.userData, m = lifeMotion(shared.uTime.value, u.K, u.p0[1]);
  u.yaw += ((track ?? m.glance) - u.yaw) * Math.min(1, dt * (track === null || track === undefined ? 3 : 6));
  hd.position.set(u.p0[0] + m.x, u.p0[1] + m.y, u.p0[2] + m.z);
  hd.quaternion.setFromAxisAngle(Y_AXIS, u.yaw).multiply(_q1.fromArray(u.q0));
}

// 主角：圆领窄摆的长袍、乌靴、幞头。上身、袍摆、两臂两腿各带关节，行走、跃起、泅水时可动
export function makePlayerAvatar(mats) {
  const ROBE = [0.8, 0.86, 0.9], PANTS = [1.04, 1.02, 0.96], HEM = 0.3, PY = 1.15, SHX = 0.158;
  const look = { robe: ROBE, trim: [0.56, 0.62, 0.68], belt: [0.26, 0.25, 0.27], face: FACE.man, hat: 'futou', arms: 'none', noSkirt: true, noTails: true, staticLegs: false, lod: 0, neutral: true, lean: 0 };
  const q = quirks(look);
  const pivot = new THREE.Group(); // 以胸口为轴：泅水时前倾
  pivot.position.y = PY;
  const add = (parent, x, y, z, fn) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    LOD = 0;
    FACE_ID = FACE.man;
    SKIN = skinOf(FACE.man);
    for (const m of part(mats, fn)) g.add(m);
    parent.add(g);
    return g;
  };
  const upper = add(pivot, 0, -PY, 0, (b) => figure(b, look));
  // 袍摆自腰带垂下，另成一件，迈步时随之张合
  const skirt = add(pivot, 0, WAIST - PY, 0, (b) =>
    loft(b, M, [[HEM - WAIST, 0.2, 0.172, 0, 0.62, 0.9], [(HEM - WAIST) * 0.72, 0.193, 0.163, 0.002, 0.9, 0.94], [(HEM - WAIST) * 0.42, 0.178, 0.146, 0.004, 0.6, 0.97], [0.012, 0.154, 0.116, 0.004, 0.08]].map(ringOf(0)), { color: ROBE, id: b.nextId(), folds: mkFolds(q, 8, 0.07, 0.15, 0.3, 0.6, 3), seg: 22 })
  );
  // 幞头垂脚
  const tails = add(pivot, 0, HY + 0.03 - PY, -0.114, (b) => {
    const id = b.nextId();
    for (const sx of [-1, 1]) {
      bar(b, [sx * 0.028, 0, 0], [sx * 0.07, -0.13, -0.044], 0.034, 0.008, GAUZE, id);
      bar(b, [sx * 0.07, -0.13, -0.044], [sx * 0.084, -0.23, -0.03], 0.03, 0.008, GAUZE, id);
    }
  });
  const mkArm = (sx) => {
    // 袖子越往下越宽，多出的布料贴向身侧（圆心往里挪），外沿不往外张
    const rg = (y, ru, rw, amp = 0, k = 1) => ({ c: [-sx * Math.max(0, ru - 0.066) * 0.9, y, 0], u: [-sx, 0, 0], w: [0, 0, -sx], ru, rw, amp, k });
    const a = add(pivot, sx * SHX, SHY - PY, 0, (b) => loft(b, M, [{ ...rg(0.042, 0.03, 0.03), c: [-sx * 0.03, 0.042, 0] }, rg(0, 0.068, 0.066), rg(-0.14, 0.074, 0.066, 0.3), rg(-0.285, 0.078, 0.064, 0.45)], { color: ROBE, id: b.nextId(), folds: SLEEVE_FOLDS, seg: 12, capA: true }));
    const f = add(a, 0, -0.265, 0, (b) => {
      const id = b.nextId();
      loft(b, M, [rg(0.03, 0.078, 0.064, 0.45), rg(-0.1, 0.082, 0.06, 0.7), rg(-0.245, 0.088, 0.056, 1), rg(-0.32, 0.092, 0.052, 1, 0.9)], { color: ROBE, id, folds: SLEEVE_FOLDS, seg: 12 });
      hand(b, [0, -0.25, 0.012], [0, -1, 0], sx, id);
    });
    return [a, f];
  };
  const mkLeg = (sx) => {
    const t = add(pivot, sx * 0.085, HIP - PY, 0, (b) => thigh(b, PANTS, b.nextId()));
    const sh = add(t, 0, -(HIP - KNEE), 0.012, (b) => {
      const id = b.nextId();
      cloth(b, [[0, 0.04, 0, 0.08], [0, -0.14, 0, 0.07]], PANTS, id, { us: 0.5, vs: [0.45, 0.25], seg: 8 });
      plain(b, [[0, -0.1, 0, 0.068], [0, -0.26, 0, 0.06], [0, -(KNEE - 0.09), 0.004, 0.052]], SHOE, id); // 乌靴
      b.push(_m1.makeTranslation(0, -KNEE, -0.004));
      shoe(b, SHOE, id);
      b.pop();
    });
    return [t, sh];
  };
  const [armL, foreL] = mkArm(-1), [armR, foreR] = mkArm(1);
  const [legL, shinL] = mkLeg(-1), [legR, shinR] = mkLeg(1);
  const grp = new THREE.Group();
  grp.add(pivot);
  grp.userData = { pivot, upper, skirt, tails, armL, foreL, armR, foreR, legL, shinL, legR, shinR };
  return grp;
}

// ───────────────────────── 街上行人 ─────────────────────────
export class Crowd {
  constructor(scene, mats, rng) {
    this.scene = scene;
    this.mats = mats;
    this.rng = rng;
    this.walkers = [];
    this.variants = [];
    for (let i = 0; i < 30; i++) this.variants.push(randomLook(rng));
    this.edgeKeys = [];
    for (const a in adjacency) for (const b of adjacency[a]) if (a !== 'h' && b !== 'h') this.edgeKeys.push([a, b]);
  }
  spawn(n) {
    const rng = this.rng;
    // 城内与桥头更热闹
    const weight = ([a, b]) => {
      const x = (NODES[a][0] + NODES[b][0]) / 2;
      const len = Math.hypot(NODES[a][0] - NODES[b][0], NODES[a][1] - NODES[b][1]);
      return len * (x < -20 ? 1.5 : x < 170 ? 1.0 : 0.35);
    };
    const total = this.edgeKeys.reduce((s, e) => s + weight(e), 0);
    for (let i = 0; i < n; i++) {
      let r = rng.f(total), e = this.edgeKeys[0];
      for (const k of this.edgeKeys) {
        r -= weight(k);
        if (r <= 0) { e = k; break; }
      }
      const look = this.variants[i % this.variants.length];
      const grp = makeFigure(this.mats, look, { walk: true }), far = makeFigure(this.mats, look, { far: true });
      far.visible = false;
      this.scene.add(far);
      let t = rng.f(0.05, 0.95);
      const [ax, az] = NODES[e[0]], [bx, bz] = NODES[e[1]];
      const slow = look.face === FACE.elder || look.prop === 'pole' ? 0.82 : 1;
      const ud = grp.userData;
      const w = { grp, far, a: e[0], b: e[1], x: ax + (bx - ax) * t, z: az + (bz - az) * t, yaw: 0, off: 0, speed: rng.f(0.95, 1.5) * slow * ((look.s || 1) < 0.8 ? 1.25 : 1), phase: rng.f(6), s: look.s || 1, legs: ud.legs, shins: ud.shins, feet: ud.feet, arms: ud.arms, pause: 0, tx: 0, tz: 0 };
      this._aim(w);
      w.x += (w.tx - bx) ;
      w.z += (w.tz - bz);
      // 别一出场就站在摊子、车马里：换几处试试
      for (let k = 0; k < 14 && colliders.hit(w.x, w.z, 0.4, groundY(w.x, w.z)); k++) {
        t = rng.f(0.05, 0.95);
        w.x = ax + (bx - ax) * t + (w.tx - bx);
        w.z = az + (bz - az) * t + (w.tz - bz);
      }
      w.yaw = Math.atan2(w.tx - w.x, w.tz - w.z);
      grp.position.set(w.x, groundY(w.x, w.z), w.z);
      grp.rotation.y = w.yaw;
      this.scene.add(grp);
      this.walkers.push(w);
    }
  }
  _aim(w) {
    const [ax, az] = NODES[w.a], [bx, bz] = NODES[w.b];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1;
    const hw = edgeWidth(w.a, w.b) / 2;
    w.off = this.rng.f(0.5, Math.max(0.8, hw - 1.3));
    // 靠右行：右手方向 = (-dz, dx)/l
    w.tx = bx + (-dz / l) * w.off;
    w.tz = bz + (dx / l) * w.off;
  }
  update(dt, px, pz) {
    for (const w of this.walkers) {
      const dx = w.tx - w.x, dz = w.tz - w.z, d = Math.hypot(dx, dz);
      if (d < 1.2) {
        const opts = adjacency[w.b].filter((k) => k !== w.a && k !== 'h');
        const next = opts.length ? this.rng.pick(opts) : w.a;
        w.a = w.b;
        w.b = next;
        this._aim(w);
        continue;
      }
      const pd = Math.hypot(px - w.x, pz - w.z);
      // 视野之外的不画，但照样绕障（免得走近了才发现它嵌在摊子里）；四十来步开外换成合并的小像，不必摆手摆脚
      const gone = pd > 150, isFar = pd > 40;
      w.grp.visible = !isFar;
      w.far.visible = isFar && !gone;
      // 前头有东西（摊子、车马、站着的人）就往旁边绕；实在绕不开先停一停，久了换条路走
      let want = Math.atan2(dx, dz), jam = false, esc = false;
      const gy = groundY(w.x, w.z), LOOK = 1.05;
      if (colliders.hit(w.x, w.z, 0.16, gy)) {
        // 已经嵌在什么东西里了：先朝最近的空处挪出去
        for (let k = 0; k < 8 && !esc; k++) {
          const h = want + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.785;
          if (!colliders.hit(w.x + Math.sin(h) * 0.8, w.z + Math.cos(h) * 0.8, 0.2, gy)) {
            want = h;
            esc = true;
          }
        }
      }
      if (!esc && colliders.hit(w.x + Math.sin(want) * LOOK, w.z + Math.cos(want) * LOOK, 0.3, gy)) {
        jam = true;
        for (const a of [0.7, -0.7, 1.3, -1.3, 1.9, -1.9]) {
          const h = want + a;
          if (!colliders.hit(w.x + Math.sin(h) * LOOK, w.z + Math.cos(h) * LOOK, 0.3, gy)) {
            want = h;
            jam = false;
            break;
          }
        }
      }
      w.yaw += angDiff(want, w.yaw) * Math.min(1, dt * 6);
      if (esc) w.yaw = want;
      let moving = esc || (!jam && !colliders.hit(w.x + Math.sin(w.yaw) * 0.42, w.z + Math.cos(w.yaw) * 0.42, 0.24, gy));
      w.stuck = moving ? Math.max(0, (w.stuck || 0) - dt) : (w.stuck || 0) + dt;
      if (w.stuck > 2.4) {
        // 堵死了：当作已经走到，换下一段路
        w.stuck = 0;
        const opts = adjacency[w.b].filter((k) => k !== 'h');
        const next = this.rng.pick(opts);
        w.a = w.b;
        w.b = next;
        this._aim(w);
      }
      if (pd < 1.25) {
        // 礼让：迎面遇人则驻足
        const toP = Math.atan2(px - w.x, pz - w.z);
        if (Math.abs(angDiff(toP, w.yaw)) < 1.2) moving = false;
      }
      if (moving) {
        w.x += Math.sin(w.yaw) * w.speed * dt;
        w.z += Math.cos(w.yaw) * w.speed * dt;
        w.phase += dt * w.speed * 4.6;
      }
      if (gone) continue;
      if (isFar) {
        w.far.position.set(w.x, groundY(w.x, w.z), w.z);
        w.far.rotation.y = w.yaw;
        continue;
      }
      // 步态：两腿交替，回摆的那条腿屈膝；臂与腿反向摆；身子随步子起落、微微左右晃、肩略拧
      const k = Math.min(1, dt * 10);
      w.amp = (w.amp || 0) + ((moving ? 1 : 0) - (w.amp || 0)) * k;
      const sw = Math.sin(w.phase) * w.amp, cw = Math.cos(w.phase) * w.amp, g = w.grp;
      g.position.set(w.x, groundY(w.x, w.z) + Math.abs(Math.cos(w.phase)) * 0.026 * w.amp * w.s, w.z);
      g.rotation.y = w.yaw + sw * 0.045;
      g.rotation.z = sw * 0.022;
      if (w.legs) {
        w.legs[0].rotation.x = sw * 0.44;
        w.legs[1].rotation.x = -sw * 0.44;
        if (w.shins) {
          w.shins[0].rotation.x = Math.max(0, -cw) * 0.8 + 0.06 * w.amp;
          w.shins[1].rotation.x = Math.max(0, cw) * 0.8 + 0.06 * w.amp;
        }
      }
      if (w.feet) {
        w.feet[0].position.z = (0.02 - sw * 0.14) * w.s;
        w.feet[1].position.z = (0.02 + sw * 0.14) * w.s;
        w.feet[0].position.y = Math.max(0, -cw) * 0.035 * w.s;
        w.feet[1].position.y = Math.max(0, cw) * 0.035 * w.s;
      }
      if (w.arms) {
        w.arms[0].rotation.x = -sw * 0.4;
        w.arms[1].rotation.x = sw * 0.4;
      }
    }
    // 行人彼此留出身位，不叠在一起走
    const near = this.walkers.filter((w) => w.grp.visible);
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++) {
        const a = near[i], c = near[j], ex = c.x - a.x, ez = c.z - a.z, d2 = ex * ex + ez * ez;
        if (d2 > 0.42 || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), k = ((0.65 - d) * 0.5) / d * Math.min(1, dt * 6);
        a.x -= ex * k;
        a.z -= ez * k;
        c.x += ex * k;
        c.z += ez * k;
      }
  }
}

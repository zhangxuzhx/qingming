// 地形：街市、码头、城里、桥头、水边都是平的（高 0，建筑与路都按平地造）；
// 郊野缓缓起伏，村舍、农家各垫一块平台；可行走范围之外四周是一圈低冈，把远处收住。
// 高度先算成一张 2 米一格的表，地表网格的顶点就取自这张表，行走、摆放再从表里插值——两边对得上。
import { riverSD } from './river.js';

export const T_RECT = { x0: -470, z0: -200, x1: 490, z1: 220 }; // 与 layout.js 的 WORLD 一致
export const T_STEP = 2;
const PLAY = { x0: -402, x1: 405, z0: -112, z1: 104 }; // 可行走范围（与 BOUNDS 一致）

const hash = (i, j) => {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
function vn(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const sm = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// 矩形内为 1，出了边界 f 米内渐降到 0
const inRect = (x, z, x0, z0, x1, z1, f) => sm(0, 1, Math.min(x - x0, x1 - x, z - z0, z1 - z) / f + 1);

// 0…1：这一处该有多平
function flatness(x, z) {
  let F = Math.max(
    inRect(x, z, 24, -110, 216, -2, 34), // 码头街及街北的人家
    inRect(x, z, -222, -112, -22, 104, 34), // 城外街市
    inRect(x, z, -520, -260, -222, 260, 34) // 护城河以西：城门、城墙、城里
  );
  F = Math.max(F, 1 - sm(52, 88, Math.hypot(x + 3, z + 17))); // 虹桥两头
  F = Math.max(F, 1 - sm(5, 30, riverSD(x, z))); // 水边
  return F;
}
// 没有垫平之前的起伏
function rolling(x, z) {
  let h = (vn(x / 95 + 3.7, z / 95 + 8.2) - 0.5) * 3.6 + (vn(x / 41 + 11.3, z / 41 + 5.9) - 0.5) * 1.3 + 0.75;
  // 可行走范围里压在两米半以内（寻常物件的碰撞盒只到五米高）
  h = Math.max(-0.35, h > 1.9 ? 1.9 + (h - 1.9) * 0.45 : h);
  // 范围之外渐高成冈
  const out = Math.max(PLAY.x0 - x, x - PLAY.x1, PLAY.z0 - z, z - PLAY.z1, 0);
  h += sm(0, 60, out) * (3.2 + 5.5 * vn(x / 62 + 1.3, z / 62 + 7.7));
  return h * (1 - flatness(x, z));
}
// 平台：[x, z, 内半径, 外半径, 高（不给则取那里原本的高）]
const PADS = [
  [340, -61, 25, 42], // 杏花村：四座茅舍、打麦场、秋千
  [266, -22, 12, 24], // 路南带篱笆的农家
  [221, -47, 12, 24], // 茶棚
  [334, -19, 12, 22], // 菜畦与桔槔
  [326, -102, 12, 26, 2.1], // 坟冈
  [258.5, 78, 6, 16, 0], // 堤尾茅亭
];
for (const p of PADS) if (p[4] === undefined) p[4] = rolling(p[0], p[1]);
function rawH(x, z) {
  let h = rolling(x, z);
  for (const [px, pz, r0, r1, ph] of PADS) {
    const d = Math.hypot(x - px, z - pz);
    if (d < r1) h += (ph - h) * (1 - sm(r0, r1, d));
  }
  // 到地表网格的边上收回 0，与外头的平地接上
  const edge = Math.min(x - T_RECT.x0, T_RECT.x1 - x, z - T_RECT.z0, T_RECT.z1 - z);
  return h * sm(0, 36, edge);
}

export const T_NX = Math.round((T_RECT.x1 - T_RECT.x0) / T_STEP), T_NZ = Math.round((T_RECT.z1 - T_RECT.z0) / T_STEP);
export const T_GRID = new Float32Array((T_NX + 1) * (T_NZ + 1));
for (let j = 0; j <= T_NZ; j++) for (let i = 0; i <= T_NX; i++) T_GRID[j * (T_NX + 1) + i] = rawH(T_RECT.x0 + i * T_STEP, T_RECT.z0 + j * T_STEP);

// 地面的高（米）。表外是平地
export function terrainH(x, z) {
  const gx = (x - T_RECT.x0) / T_STEP, gz = (z - T_RECT.z0) / T_STEP;
  if (gx <= 0 || gz <= 0 || gx >= T_NX || gz >= T_NZ) return 0;
  const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, W = T_NX + 1, k = j * W + i;
  // 与网格的三角剖分一致：每格沿 (i,j)-(i+1,j+1) 对角分成两片
  const a = T_GRID[k], b = T_GRID[k + 1], c = T_GRID[k + W], d = T_GRID[k + W + 1];
  return fx > fz ? a + (b - a) * fx + (d - b) * fz : a + (c - a) * fz + (d - c) * fx;
}

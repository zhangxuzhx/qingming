// 草色的分布：哪里成片长草、哪里是踩秃的土。地表的石绿罩染与贴地的草丛都照这一张图来，
// 草才是“这一片、那一片”，而不是东一簇西一簇。
import { riverSD } from './river.js';
import { HOME } from './layout.js';

const hash = (i, j) => {
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
// 值噪声，0~1
export function vnoise(x, z) {
  const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v;
}
const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
// 矩形内为 1，向外 f 米内渐降到 0
const feather = (x, z, x0, z0, x1, z1, f) => Math.max(0, Math.min(1, Math.min(x - x0, x1 - x, z - z0, z1 - z) / f + 0.5));

// 街市、城里：人来人往，草少
export function townAt(x, z) {
  return Math.max(feather(x, z, 30, -66, 214, -2, 16), feather(x, z, -214, -58, -30, 62, 16), feather(x, z, -420, -112, -274, 96, 16));
}
// 0…1：这一处长草的多少
export function meadow(x, z) {
  const n = vnoise(x / 33 + 7.3, z / 33 + 2.1) * 0.6 + vnoise(x / 12 + 1.7, z / 12 + 9.4) * 0.3 + vnoise(x / 4.6 + 3.1, z / 4.6 + 5.2) * 0.1;
  let m = smooth(0.27, 0.5, n); // 春郊大半是绿的，秃处只是零星几块
  // 水边润，草长得满
  const sd = riverSD(x, z);
  m = Math.max(m, 0.95 * (1 - smooth(2.5, 10, sd)));
  m *= 1 - 0.82 * townAt(x, z);
  m *= 1 - 0.9 * feather(x, z, HOME.x - HOME.w / 2, HOME.z - HOME.d / 2, HOME.x + HOME.w / 2, HOME.z + HOME.d / 2, 3);
  return m;
}

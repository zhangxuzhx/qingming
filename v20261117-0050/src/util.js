// 通用小工具：可复现随机数、插值等
export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.r = mulberry32(seed);
  }
  // f() → [0,1)；f(a) → [0,a)；f(a,b) → [a,b)
  f(a = 1, b) {
    if (b === undefined) {
      b = a;
      a = 0;
    }
    return a + (b - a) * this.r();
  }
  i(a, b) {
    return Math.floor(this.f(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.r() * arr.length)];
  }
  chance(p) {
    return this.r() < p;
  }
  sign() {
    return this.r() < 0.5 ? -1 : 1;
  }
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// 角度差归一到 [-PI, PI]
export function angDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

const CN_NUM = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export function cnNum(n) {
  n = Math.round(n);
  if (n < 0) return '负' + cnNum(-n);
  if (n < 10) return CN_NUM[n];
  if (n < 20) return '十' + (n % 10 ? CN_NUM[n % 10] : '');
  if (n < 100) return CN_NUM[Math.floor(n / 10)] + '十' + (n % 10 ? CN_NUM[n % 10] : '');
  return String(n);
}

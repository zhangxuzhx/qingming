// 汴河、护城河与卷首的小溪。
// 每条河道是一串控制点连成的光滑曲线；载入时把“到岸的有向距离、流向、半宽”烘成一张网格：
// 逻辑里查这张网格，着色器里取同一张贴图，岸线两边严丝合缝。
// 约定：+X 为东（画卷右端），+Z 为南（画卷下方）。
//
// 汴河的走向照原画：卷首的郊野看不见大河，它自东南斜着进来，贴着码头向西，
// 到虹桥处折向西北，从桥下穿过后绕到城外街的背后，往北出画。
import * as THREE from 'three';

export const RV = {
  HW: 22, // 汴河半宽（河面四十多米：虹桥才有气势，漕船才转得开身）
  MOAT_X: -228, // 护城河中心线
  MOAT_HW: 7,
  BROOK_HW: 3.2, // 卷首小溪
  WATER_Y: -0.9,
};

// 过控制点的光滑曲线（向心 Catmull-Rom），每隔 step 米取一点
function smooth(P, step = 3) {
  const out = [];
  const at = (i) => P[Math.max(0, Math.min(P.length - 1, i))];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(P[P.length - 1].slice());
  return out;
}

// 河道（控制点自上游到下游）
export const CHANNELS = [
  {
    id: 'main', hw: RV.HW,
    pts: smooth([[620, 244], [520, 190], [430, 140], [330, 84], [250, 40], [205, 22], [150, 18], [90, 18], [50, 18], [26, 14], [9.5, 4.6], [-3, -17], [-15.5, -38.6], [-34, -58], [-62, -70], [-92, -82], [-112, -104], [-120, -140], [-124, -230], [-126, -340]]),
  },
  { id: 'moat', hw: RV.MOAT_HW, pts: [[RV.MOAT_X, -340], [RV.MOAT_X, 340]] },
  { id: 'brook', hw: RV.BROOK_HW, pts: smooth([[402, -210], [396, -120], [387, -64], [381, -36], [374, -8], [360, 30], [346, 62], [332, 84]], 2) },
];
export const channel = (id) => CHANNELS.find((c) => c.id === id);

// ── 网格：每格一米 ──
export const RIVER_RECT = { x0: -480, z0: -230, w: 1000, h: 470 };
const GW = RIVER_RECT.w, GH = RIVER_RECT.h, FAR = 60;
const SD = new Float32Array(GW * GH).fill(FAR), DX = new Float32Array(GW * GH), DZ = new Float32Array(GW * GH), HWV = new Float32Array(GW * GH).fill(RV.HW);
for (const ch of CHANNELS) {
  const R = ch.hw + 44;
  for (let k = 0; k < ch.pts.length - 1; k++) {
    const [ax, az] = ch.pts[k], [bx, bz] = ch.pts[k + 1];
    const ux = bx - ax, uz = bz - az, len2 = ux * ux + uz * uz, len = Math.sqrt(len2) || 1;
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - R - RIVER_RECT.x0)), i1 = Math.min(GW - 1, Math.ceil(Math.max(ax, bx) + R - RIVER_RECT.x0));
    const j0 = Math.max(0, Math.floor(Math.min(az, bz) - R - RIVER_RECT.z0)), j1 = Math.min(GH - 1, Math.ceil(Math.max(az, bz) + R - RIVER_RECT.z0));
    for (let j = j0; j <= j1; j++) {
      const pz = RIVER_RECT.z0 + j + 0.5;
      for (let i = i0; i <= i1; i++) {
        const px = RIVER_RECT.x0 + i + 0.5;
        const t = Math.max(0, Math.min(1, ((px - ax) * ux + (pz - az) * uz) / len2));
        const d = Math.hypot(px - ax - ux * t, pz - az - uz * t) - ch.hw, q = j * GW + i;
        if (d < SD[q]) {
          SD[q] = d;
          DX[q] = ux / len;
          DZ[q] = uz / len;
          HWV[q] = ch.hw;
        }
      }
    }
  }
}
function sample(A, x, z) {
  const fx = Math.max(0, Math.min(GW - 1.001, x - RIVER_RECT.x0 - 0.5)), fz = Math.max(0, Math.min(GH - 1.001, z - RIVER_RECT.z0 - 0.5));
  const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, q = j * GW + i;
  return (A[q] * (1 - u) + A[q + 1] * u) * (1 - v) + (A[q + GW] * (1 - u) + A[q + GW + 1] * u) * v;
}
// 到最近一条河岸的有向距离（<0 在水中）
export const riverSD = (x, z) => sample(SD, x, z);
// 该处水流的方向（单位向量，指向下游）
export function flowAt(x, z) {
  const dx = sample(DX, x, z), dz = sample(DZ, x, z), l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
}
// 只算汴河（远近决定水声）
export function mainRiverSD(x, z) {
  const P = CHANNELS[0].pts;
  let best = 1e9;
  for (let k = 0; k < P.length - 1; k += 2) {
    const a = P[k], b = P[Math.min(P.length - 1, k + 2)];
    const ux = b[0] - a[0], uz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ux + (z - a[1]) * uz) / (ux * ux + uz * uz || 1)));
    const d = Math.hypot(x - a[0] - ux * t, z - a[1] - uz * t);
    if (d < best) best = d;
  }
  return best - RV.HW;
}
// 河道上离 (x,z) 最近的一点及该处流向：泊船、撒芦苇时用
export function nearestOn(id, x, z) {
  const P = channel(id).pts;
  let best = 1e9, out = null;
  for (let k = 0; k < P.length - 1; k++) {
    const a = P[k], b = P[k + 1], ux = b[0] - a[0], uz = b[1] - a[1], l2 = ux * ux + uz * uz || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * ux + (z - a[1]) * uz) / l2)), qx = a[0] + ux * t, qz = a[1] + uz * t, d = Math.hypot(x - qx, z - qz);
    if (d < best) {
      best = d;
      const l = Math.sqrt(l2);
      out = { x: qx, z: qz, tx: ux / l, tz: uz / l, d };
    }
  }
  return out;
}

// 着色器用的贴图：R 有向距离、GB 流向、A 半宽（半精度浮点，线性过滤）
let _tex = null;
export function riverTexture() {
  if (_tex) return _tex;
  const data = new Uint16Array(GW * GH * 4), H = THREE.DataUtils.toHalfFloat;
  for (let q = 0; q < GW * GH; q++) {
    data[q * 4] = H(SD[q]);
    data[q * 4 + 1] = H(DX[q]);
    data[q * 4 + 2] = H(DZ[q]);
    data[q * 4 + 3] = H(HWV[q]);
  }
  _tex = new THREE.DataTexture(data, GW, GH, THREE.RGBAFormat, THREE.HalfFloatType);
  _tex.minFilter = _tex.magFilter = THREE.LinearFilter;
  _tex.wrapS = _tex.wrapT = THREE.ClampToEdgeWrapping;
  _tex.needsUpdate = true;
  return _tex;
}

export const RIVER_GLSL = /* glsl */ `
uniform highp sampler2D tRiver;
uniform vec4 uRiverRect;
vec4 riverField(vec2 p){ return texture(tRiver, (p - uRiverRect.xy) / uRiverRect.zw); }
float riverSD(vec2 p){ return riverField(p).r; }
// 河道坐标：x 顺流、y 横向、z 半宽
vec3 riverST(vec2 p){
  vec4 f = riverField(p);
  vec2 d = normalize(f.gb + vec2(1.0e-4, 0.0));
  return vec3(dot(p, d), dot(p, vec2(-d.y, d.x)), f.a);
}
`;

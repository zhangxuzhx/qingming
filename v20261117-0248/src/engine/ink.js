// 水墨渲染管线（三维的光影是实的，国画留在表面）：
//  0) 日照投影：自日光方向渲染一张深度图
//  1) 水面倒影：把镜头翻到水下再画一遍（半幅），供水面取用
//  2) 场景以“纸上的颜料”写入 G-Buffer（颜色 + 法线/线重/部件编号 + 深度）；
//     受光处带日色，背光与影中罩一层天光与地面返照调出的淡墨
//  3) 合成：烘染（环境遮蔽）、勾线、天色与墨云、乘上纸色与纸纹
//  4) 收尾：朝日头方向的光柱、高光的晕、抗锯齿
// 颜料值 1.0 = 纸本底色；>1 为白粉（比纸更亮），故颜色缓冲按 0.8 压缩存放。
import * as THREE from 'three';
import { RIVER_GLSL, RV, RIVER_RECT, riverTexture } from '../world/river.js';

export const SHADOW_SIZE = 2048;
const V3 = (x, y, z) => ({ value: new THREE.Vector3(x, y, z) });
export const shared = {
  uTime: { value: 0 },
  tNoise: { value: null },
  uResY: { value: 1080 },
  // 日照与烟霭（随时辰而变，见 setDayTime）
  uSun: { value: new THREE.Vector3(0.78, 0.47, 0.42).normalize() },
  uSunCol: V3(1.13, 1.065, 0.95),
  uShadeTint: V3(0.57, 0.605, 0.72),
  uFogK: { value: 1 / (175 * 175) },
  uFogCol: V3(1.085, 1.06, 1.015),
  // 天
  uSkyHor: V3(1.1, 1.065, 1.0),
  uSkyZen: V3(0.67, 0.825, 1.05),
  uSunGlow: V3(0.07, 0.05, 0.02),
  uCloudLit: V3(1.2, 1.185, 1.14),
  uCloudShade: V3(0.78, 0.83, 0.93),
  uDisc: { value: 1 },
  uStar: { value: 0 },
  // 入夜亮灯的人家占几成
  uNight: { value: 0 },
  // 辅图（见 world.js 的 makeAux）：R 灯笼的光晕，G 墙根，B 树下
  tAux: { value: null },
  uAuxRect: { value: new THREE.Vector4(0, 0, 1, 1) },
  uLamp: { value: 0 }, // 灯光映地的强弱（夜里才有）
  uCloudSh: { value: 0.5 }, // 云影的深浅
  uMist: { value: 0.2 }, // 贴地的雾
  // 水上的波纹：x z 起点、起始时刻、强弱
  uRip: { value: Array.from({ length: 6 }, () => new THREE.Vector4(0, 0, -100, 0)) },
  // 投影
  tShadow: { value: null },
  uShadowMat: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowPass: { value: 0 },
  // 近处另有一张投影：只罩住镜头跟前十几步，纹素细得多，影子的边才利落
  tShadow2: { value: null },
  uShadowMat2: { value: new THREE.Matrix4() },
  uShadow2On: { value: 0 },
  // 倒影
  uReflPass: { value: 0 },
  uWaterY: { value: RV.WATER_Y },
  tRefl: { value: null },
  uReflMat: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
  // 跨帧累积时整幅画面每帧的微移（裁剪坐标）；自己会动的东西在顶点着色器里把它减回去
  uJit: { value: new THREE.Vector2() },
  // 行船的航迹：每条船的位置、朝向（弧度）、半长
  uWake: { value: Array.from({ length: 5 }, () => new THREE.Vector4(1e5, 1e5, 0, 14)) },
  uWakeK: { value: [1, 1, 1, 1, 1] }, // 各条航迹的浓淡（船隐入烟水时跟着淡掉）
  // 河道：到岸距离、流向、半宽（见 river.js）
  tRiver: { value: riverTexture() },
  uRiverRect: { value: new THREE.Vector4(RIVER_RECT.x0, RIVER_RECT.z0, RIVER_RECT.w, RIVER_RECT.h) },
};

// ───────────────────────── 时辰 ─────────────────────────
// 一昼夜的光色：按钟点（0~24，0 为半夜子正）给出若干关键时刻，其间线性过渡。
// sunCol 受光的色（夜里是月色）；shade 影里的色；其余依次是烟霭、天色、云色、纸色、光柱与辉光；
// disc 日月的轮廓显不显；star 星；night 窗里亮灯的人家占几成。
// 日出日落前后各有一刻 sunCol 与 shade 相同（没有投影），日头与月亮就在那一刻换班。
const NIGHT = {
  sunCol: [0.7, 0.77, 0.97], shade: [0.38, 0.43, 0.61], fogD: 140, fogCol: [0.47, 0.53, 0.72],
  skyHor: [0.52, 0.58, 0.77], skyZen: [0.21, 0.27, 0.5], sunGlow: [0.04, 0.05, 0.08], cloudLit: [0.64, 0.7, 0.87], cloudShade: [0.31, 0.36, 0.55],
  paper: [0.83, 0.89, 1.0], ray: [0.02, 0.03, 0.05], bloom: 0.62, disc: 0.9, star: 1,
};
const DAY = [
  { h: 0, ...NIGHT, night: 0.5 },
  { h: 4, ...NIGHT, night: 0.3 },
  { // 寅末：天将明未明，一片青灰
    h: 5.1, sunCol: [0.47, 0.51, 0.67], shade: [0.47, 0.51, 0.67], fogD: 112, fogCol: [0.63, 0.67, 0.8],
    skyHor: [0.76, 0.73, 0.82], skyZen: [0.31, 0.39, 0.63], sunGlow: [0.02, 0.02, 0.03], cloudLit: [0.69, 0.7, 0.84], cloudShade: [0.42, 0.46, 0.62],
    paper: [0.88, 0.91, 1.0], ray: [0, 0, 0], bloom: 0.45, disc: 0, star: 0.3, night: 0.2,
  },
  { // 卯正：日出，晨雾带着暖色
    h: 6.1, sunCol: [1.12, 0.9, 0.7], shade: [0.5, 0.5, 0.68], fogD: 112, fogCol: [1.14, 0.98, 0.84],
    skyHor: [1.2, 0.96, 0.76], skyZen: [0.6, 0.68, 0.94], sunGlow: [0.26, 0.14, 0.05], cloudLit: [1.24, 1.02, 0.84], cloudShade: [0.64, 0.62, 0.78],
    paper: [1.0, 0.97, 0.92], ray: [0.3, 0.2, 0.1], bloom: 0.44, disc: 1, star: 0, night: 0,
  },
  { // 辰正：上午
    h: 8, sunCol: [1.13, 1.065, 0.95], shade: [0.57, 0.605, 0.72], fogD: 175, fogCol: [1.085, 1.06, 1.015],
    skyHor: [1.1, 1.065, 1.0], skyZen: [0.67, 0.825, 1.05], sunGlow: [0.07, 0.05, 0.02], cloudLit: [1.2, 1.185, 1.14], cloudShade: [0.78, 0.83, 0.93],
    paper: [1, 1, 1], ray: [0.14, 0.115, 0.07], bloom: 0.3, disc: 1, star: 0, night: 0,
  },
  { // 午正
    h: 12, sunCol: [1.1, 1.07, 1.0], shade: [0.6, 0.65, 0.76], fogD: 200, fogCol: [1.07, 1.07, 1.05],
    skyHor: [1.08, 1.075, 1.05], skyZen: [0.6, 0.79, 1.07], sunGlow: [0.03, 0.03, 0.02], cloudLit: [1.22, 1.21, 1.18], cloudShade: [0.8, 0.86, 0.95],
    paper: [1, 1, 1.01], ray: [0.05, 0.05, 0.04], bloom: 0.26, disc: 1, star: 0, night: 0,
  },
  { // 申：午后，光色渐暖
    h: 15.5, sunCol: [1.13, 1.05, 0.92], shade: [0.58, 0.61, 0.73], fogD: 185, fogCol: [1.09, 1.05, 0.99],
    skyHor: [1.11, 1.05, 0.97], skyZen: [0.63, 0.79, 1.04], sunGlow: [0.08, 0.05, 0.02], cloudLit: [1.21, 1.17, 1.1], cloudShade: [0.78, 0.8, 0.9],
    paper: [1, 0.995, 0.98], ray: [0.14, 0.11, 0.07], bloom: 0.3, disc: 1, star: 0, night: 0,
  },
  { // 酉正：黄昏
    h: 17.6, sunCol: [1.22, 0.98, 0.7], shade: [0.5, 0.49, 0.67], fogD: 130, fogCol: [1.16, 0.96, 0.76],
    skyHor: [1.22, 0.93, 0.66], skyZen: [0.62, 0.66, 0.92], sunGlow: [0.28, 0.15, 0.04], cloudLit: [1.25, 1.0, 0.76], cloudShade: [0.62, 0.58, 0.74],
    paper: [1.0, 0.955, 0.88], ray: [0.32, 0.2, 0.09], bloom: 0.48, disc: 1, star: 0, night: 0.12,
  },
  { // 戌初：日落后的余晖，华灯初上
    h: 18.7, sunCol: [0.51, 0.49, 0.67], shade: [0.51, 0.49, 0.67], fogD: 120, fogCol: [0.79, 0.67, 0.73],
    skyHor: [0.96, 0.69, 0.63], skyZen: [0.37, 0.41, 0.69], sunGlow: [0.1, 0.05, 0.03], cloudLit: [0.87, 0.67, 0.67], cloudShade: [0.46, 0.44, 0.62],
    paper: [0.91, 0.91, 0.97], ray: [0, 0, 0], bloom: 0.6, disc: 0, star: 0.3, night: 0.75,
  },
  { h: 20, ...NIGHT, night: 1 },
  { h: 22, ...NIGHT, night: 0.9 },
  { h: 24, ...NIGHT, night: 0.5 },
];
// 钟点 → 灯光映地、云影深浅、贴地的雾
const ATMOS = [[0, 1, 0.18, 0.28], [4, 1, 0.18, 0.34], [5.1, 0.6, 0.1, 0.55], [6.1, 0, 0.3, 0.6], [8, 0, 0.45, 0.2], [12, 0, 0.45, 0.04], [15.5, 0, 0.45, 0.05], [17.6, 0.3, 0.35, 0.28], [18.7, 0.95, 0.1, 0.4], [20, 1, 0.18, 0.3], [24, 1, 0.18, 0.28]];
const post = { paper: new THREE.Vector3(1, 1, 1), ray: new THREE.Vector3(0.13, 0.11, 0.07), bloom: 0.3 };
// 把光色设到某个钟点
export function setDayTime(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < DAY.length - 2 && h >= DAY[i + 1].h) i++;
  const a = DAY[i], b = DAY[i + 1], t = Math.min(1, Math.max(0, (h - a.h) / (b.h - a.h)));
  const L = (k) => a[k] + (b[k] - a[k]) * t;
  const V = (u, k) => u.set(a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t, a[k][2] + (b[k][2] - a[k][2]) * t);
  // 日月的方位：日头卯时自东升、午时在南、酉时西沉；入夜换月亮照旧自东而西
  let x, y, z;
  if (h >= 5.1 && h < 18.7) {
    const ang = ((h - 5.6) / 12.8) * Math.PI;
    x = Math.cos(ang); y = Math.sin(ang) * 0.95 - 0.04; z = 0.42;
  } else {
    const ang = (((h - 18.7 + 24) % 24) / 10.4) * Math.PI;
    x = Math.cos(ang) * 0.9; y = Math.sin(ang) * 0.8 - 0.02; z = 0.5;
  }
  shared.uSun.value.set(x, Math.max(0.06, y), z).normalize();
  V(shared.uSunCol.value, 'sunCol');
  V(shared.uShadeTint.value, 'shade');
  const fogD = L('fogD');
  shared.uFogK.value = 1 / (fogD * fogD);
  V(shared.uFogCol.value, 'fogCol');
  V(shared.uSkyHor.value, 'skyHor');
  V(shared.uSkyZen.value, 'skyZen');
  V(shared.uSunGlow.value, 'sunGlow');
  V(shared.uCloudLit.value, 'cloudLit');
  V(shared.uCloudShade.value, 'cloudShade');
  V(post.paper, 'paper');
  V(post.ray, 'ray');
  post.bloom = L('bloom');
  shared.uDisc.value = L('disc');
  shared.uStar.value = L('star');
  shared.uNight.value = L('night');
  let j = 0;
  while (j < ATMOS.length - 2 && h >= ATMOS[j + 1][0]) j++;
  const p = ATMOS[j], q = ATMOS[j + 1], u = Math.min(1, Math.max(0, (h - p[0]) / (q[0] - p[0])));
  shared.uLamp.value = p[1] + (q[1] - p[1]) * u;
  shared.uCloudSh.value = p[2] + (q[2] - p[2]) * u;
  shared.uMist.value = p[3] + (q[3] - p[3]) * u;
}

// ───────────────────────── 活气 ─────────────────────────
// 站着、坐着的人：呼吸时胸口起伏、肩头微提；站久了重心左右挪一挪；偶尔转头朝一侧看看。
// aLife = (基点.xyz, K)：身上的顶点带脚下的基点；头上的顶点带颈上的轴心，K 的小数部分记轴心离地的高度 ÷ 4。
// K 的整数部分：各人不同的节拍；÷64 的商记身量（0 立着的成人，1 坐着，2 孩童）。K < 2 即无此数据，不动。
const LIFE_GLSL = /* glsl */ `
  if(aLife.w >= 2.0){
    float K = floor(aLife.w + 0.0005), hf = aLife.w - K;
    float kind = floor(K / 64.0);
    float ph = K * 2.39996 + aLife.x * 0.37 + aLife.z * 0.53;
    bool isHead = hf > 0.003;
    float h = isHead ? hf * 4.0 : pos.y - aLife.y;
    float hr = kind > 1.5 ? h / 0.66 : (kind > 0.5 ? h + 0.38 : h);
    if(isHead){
      float th = sin(uTime * 0.31 + ph) * smoothstep(0.35, 0.9, sin(uTime * 0.13 + ph * 1.7)) * 0.42;
      float c = cos(th), s = sin(th);
      vec3 d = pos - aLife.xyz;
      pos = aLife.xyz + vec3(c*d.x + s*d.z, d.y, c*d.z - s*d.x);
      nor = vec3(c*nor.x + s*nor.z, nor.y, c*nor.z - s*nor.x);
    }
    float br = sin(uTime * 1.45 + ph * 3.1);
    pos.y += 0.0035 * br * smoothstep(1.0, 1.3, hr);
    if(!isHead) pos += nor * (0.004 * (br * 0.5 + 0.5) * smoothstep(1.02, 1.16, hr) * (1.0 - smoothstep(1.26, 1.38, hr)));
    float sw = sin(uTime * 0.42 + ph * 5.3) + 0.4 * sin(uTime * 0.97 + ph * 2.1);
    float hh = clamp(h, 0.0, 2.2);
    pos.xz += vec2(cos(ph * 4.7), sin(ph * 4.7)) * (sw * 0.0055 * hh * hh);
  }
`;
// 与上面同式：供单独成组的头（有名有姓的人物）跟上身子的起伏。基点在原点，h 为轴心离地的高
export function lifeMotion(t, K, h) {
  const kind = Math.floor(K / 64), ph = K * 2.39996;
  const hr = kind > 1.5 ? h / 0.66 : kind > 0.5 ? h + 0.38 : h;
  const ss = (a, b, x) => {
    const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const sw = Math.sin(t * 0.42 + ph * 5.3) + 0.4 * Math.sin(t * 0.97 + ph * 2.1), hh = Math.min(2.2, Math.max(0, h)), k = sw * 0.0055 * hh * hh;
  return {
    x: Math.cos(ph * 4.7) * k,
    y: 0.0035 * Math.sin(t * 1.45 + ph * 3.1) * ss(1.0, 1.3, hr),
    z: Math.sin(ph * 4.7) * k,
    glance: Math.sin(t * 0.31 + ph) * ss(0.35, 0.9, Math.sin(t * 0.13 + ph * 1.7)) * 0.42,
  };
}

const VS = /* glsl */ `
attribute vec4 aCol;
attribute vec2 aInk;
#ifdef LIFE
attribute vec4 aLife;
#endif
uniform float uTime;
uniform vec2 uJit;
varying vec3 vWorld;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vNv;
varying vec2 vUv;
varying vec3 vCol;
varying vec2 vInk;
varying float vZ;
varying float vWw;
void main(){
  mat4 mm = modelMatrix;
  vObj = position;
  #ifdef USE_INSTANCING
  mm = mm * instanceMatrix;
  #endif
  vec3 pos = position, nor = normal;
  #ifdef LIFE
  ${LIFE_GLSL}
  #endif
  vec4 wp = mm * vec4(pos, 1.0);
  vWw = 0.0;
  #ifdef WIND
  float ph = wp.x*0.37 + wp.z*0.29;
  float ww = aCol.a;
  vWw = ww;
  wp.x += (sin(uTime*1.25+ph) + 0.5*sin(uTime*2.7+ph*1.7)) * 0.17 * ww;
  wp.z += cos(uTime*1.05+ph*1.3) * 0.13 * ww;
  #endif
  vWorld = wp.xyz;
  vNw = normalize(mat3(mm) * nor);
  vNv = mat3(viewMatrix) * vNw;
  vec4 mv = viewMatrix * wp;
  vZ = -mv.z;
  vUv = uv;
  vCol = aCol.rgb;
  vInk = aInk;
  gl_Position = projectionMatrix * mv;
  #ifdef DYN
  // 自己会走会飞的（行人、飞鸟、秋千）不参加跨帧累积，也就不跟着画面逐帧微移——否则只会原地发抖
  gl_Position.xy -= uJit * gl_Position.w;
  #endif
}
`;

// 天色（颜料值，1 = 纸色）：近地平一抹亮雾，向上罩淡彩；一轮日；云有向光与背光
const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyHor;
uniform vec3 uSkyZen;
uniform vec3 uSunGlow;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uDisc;
uniform float uStar;
float cloudN(vec2 cu, float tt){
  return texture(tNoise, cu * 0.16 + vec2(tt, tt*0.3)).r * 0.66 + texture(tNoise, cu * 0.47 + vec2(-tt*1.6, 0.31)).g * 0.3 + texture(tNoise, cu * 1.3 + 0.7).b * 0.04;
}
vec3 skyColor(vec3 D){
  float up = D.y;
  vec2 cu = D.xz / (max(up, 0.0) + 0.16);
  // 花青自上而下罩染，一笔深一笔浅
  float wv = texture(tNoise, cu * 0.045 + 0.31).g;
  float blue = smoothstep(0.02, 0.5, up) * (0.62 + 0.62 * wv);
  vec3 col = mix(uSkyHor, uSkyZen, clamp(blue, 0.0, 1.0));
  float sdn = dot(D, uSun);
  col += uSunGlow * (smoothstep(0.72, 1.0, sdn) * 0.7 + pow(max(sdn, 0.0), 40.0) * 0.9);
  // 星：夜里天上疏疏几点（云后面的被云遮住）
  if(uStar > 0.01 && up > 0.0){
    vec2 sg = cu * 46.0, sid = floor(sg);
    float sh = fract(sin(dot(sid, vec2(12.9898, 78.233))) * 43758.5453);
    vec2 sp = fract(sg) - 0.5 - (vec2(fract(sh * 7.13), fract(sh * 13.7)) - 0.5) * 0.6;
    col += vec3(0.5, 0.52, 0.46) * uStar * step(0.972, sh) * (1.0 - smoothstep(0.0, 0.09, length(sp))) * smoothstep(0.04, 0.3, up);
  }
  // 日（夜里是月）的轮廓
  col = mix(col, vec3(1.22, 1.2, 1.12), smoothstep(0.9976, 0.9989, sdn) * 0.92 * uDisc);
  float tt = uTime * 0.003;
  float n = cloudN(cu, tt);
  // 朝日头一侧偏移再取一次：密度向日头递减的一面即向光面
  float n2 = cloudN(cu + normalize(uSun.xz + 1e-4) * 0.22, tt);
  float lit = clamp((n - n2) * 5.0 + 0.5, 0.0, 1.0);
  float body = smoothstep(0.53, 0.66, n), core = smoothstep(0.6, 0.74, n);
  float fadeH = smoothstep(0.02, 0.2, up);
  vec3 cloud = mix(uCloudShade, uCloudLit, clamp(lit * 0.7 + core * 0.4, 0.0, 1.0));
  col *= 1.0 - 0.12 * smoothstep(0.47, 0.54, n) * (1.0 - body) * fadeH;
  col = mix(col, cloud, body * fadeH * 0.94);
  return col;
}
`;

const FS_COMMON = /* glsl */ `
layout(location = 0) out highp vec4 gColor;
layout(location = 1) out highp vec4 gNormal;
uniform sampler2D tNoise;
uniform highp sampler2D tShadow;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform highp sampler2D tShadow2;
uniform mat4 uShadowMat2;
uniform float uShadow2On;
uniform float uShadowPass;
uniform float uReflPass;
uniform float uWaterY;
uniform vec3 uShadeTint;
uniform vec3 uSunCol;
uniform vec3 uFogCol;
uniform float uNight;
uniform sampler2D tAux;
uniform vec4 uAuxRect;
uniform float uLamp;
uniform float uCloudSh;
uniform float uMist;
uniform float uTime;
uniform float uFogK;
uniform vec3 uSun;
varying vec3 vWorld;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vNv;
varying vec2 vUv;
varying vec3 vCol;
varying vec2 vInk;
varying float vZ;
varying float vWw;
const float PIG = 0.8;
// 烟霭：远处化入一层薄雾，高处淡些
vec3 applyFog(vec3 col){
  float fog = 1.0 - exp(-vZ*vZ*uFogK);
  fog *= mix(1.0, 0.55, smoothstep(3.0, 42.0, vWorld.y));
  // 晨昏的低雾：贴着地面、水面的一层，浓淡不匀，随风慢慢挪
  float mist = uMist * exp(-max(vWorld.y, 0.0) * 0.3) * (1.0 - exp(-vZ * 0.022)) * (0.45 + 1.1 * texture(tNoise, vWorld.xz * 0.0045 + uTime * vec2(0.0035, 0.0012)).g);
  fog = 1.0 - (1.0 - fog) * (1.0 - clamp(mist, 0.0, 0.85));
  return mix(col, uFogCol, fog);
}
// 投影（0 受光 … 1 全在影中）。两级：镜头跟前十几步用近处那张（细），再远用大的那张；两张交界处过渡
float shadowTaps(highp sampler2D t, vec3 p, float r0, float rot){
  float s = 0.0;
  for(int i = 0; i < 8; i++){
    float a = float(i)*2.39996 + rot;
    float r = sqrt((float(i) + 0.5) / 8.0) * r0;
    s += step(texture(t, p.xy + vec2(cos(a), sin(a)) * r).r + 0.0003, p.z);
  }
  return s * 0.125;
}
float shadowAt(vec3 wp, vec3 n){
  if(uShadowOn < 0.5) return 0.0;
  float ndl = max(dot(n, uSun), 0.0);
  float rot = texture(tNoise, vObj.xz*0.71 + vObj.y*0.37).b * 6.2831;
  const float TX = 1.0 / ${SHADOW_SIZE}.0;
  float s2 = 0.0, w2 = 0.0;
  if(uShadow2On > 0.5){
    vec3 q = (uShadowMat2 * vec4(wp + n * (0.012 + 0.04*(1.0 - ndl)), 1.0)).xyz;
    vec2 e2 = smoothstep(vec2(0.0), vec2(0.1), min(q.xy, 1.0 - q.xy));
    w2 = e2.x * e2.y * step(q.z, 1.0);
    if(w2 > 0.0) s2 = shadowTaps(tShadow2, q, 1.7 * TX, rot);
  }
  if(w2 > 0.999) return s2;
  vec3 p = (uShadowMat * vec4(wp + n * (0.05 + 0.12*(1.0 - ndl)), 1.0)).xyz;
  float s1 = 0.0;
  if(!(p.x < 0.005 || p.x > 0.995 || p.y < 0.005 || p.y > 0.995 || p.z > 1.0)){
    vec2 e = smoothstep(vec2(0.0), vec2(0.07), min(p.xy, 1.0 - p.xy));
    s1 = shadowTaps(tShadow, p, 2.8 * TX, rot) * e.x * e.y;
  }
  return mix(s1, s2, w2);
}
// 光影：受光处带日色；影里也分上下——朝天的面得天光，偏冷偏亮；朝地的面得地面返照，偏暖偏暗
vec3 lightWash(vec3 col, vec3 n, float amount){
  float ndl = dot(n, uSun);
  float lit = smoothstep(-0.1, 0.35, ndl) * (1.0 - shadowAt(vWorld, n));
  // 云影：大块的明暗慢慢从地上移过
  lit *= 1.0 - uCloudSh * smoothstep(0.57, 0.74, texture(tNoise, vWorld.xz * 0.0021 + uTime * vec2(0.0016, 0.0007)).r);
  // 明暗交界不取齐整的一线：用世界空间的噪声揉碎，像一笔淡墨扫出来的影
  float nz = texture(tNoise, vObj.xz*0.21 + vObj.y*0.13).g;
  lit = smoothstep(0.2, 0.8, lit + (nz - 0.5) * 0.34 * (1.0 - abs(lit*2.0 - 1.0)));
  vec3 amb = uShadeTint * mix(vec3(0.9, 0.86, 0.8), vec3(1.07, 1.08, 1.1), n.y*0.5 + 0.5);
  vec3 L = mix(mix(vec3(1.0), amb, amount), mix(vec3(1.0), uSunCol, amount), lit);
  // 夜里灯笼的光：暖色，映在近处的地面和墙上
  if(uLamp > 0.01){
    float g = texture(tAux, (vWorld.xz - uAuxRect.xy) / uAuxRect.zw).r;
    L += vec3(1.0, 0.56, 0.24) * (g * uLamp * 0.85 * amount * (1.0 - smoothstep(3.0, 9.0, vWorld.y)));
  }
  col *= L;
  // 受光面随朝向略分深浅，显出体积
  col *= 1.0 - 0.13 * amount * lit * (1.0 - clamp(ndl, 0.0, 1.0));
  return col;
}
// 带起伏的受光：n 是加了凹凸的法线，ng 是这个面本来的法线。朝日的小坡亮一点、背日的暗一点。
// 原先凹凸只挪动“受光 / 背光”的分界，正对着日头的墙面、地面上看不出起伏，近看一片平
vec3 lightWash(vec3 col, vec3 n, vec3 ng, float amount){
  col = lightWash(col, n, amount);
  return col * (1.0 + clamp((dot(n, uSun) - dot(ng, uSun)) * 1.15, -0.3, 0.22) * amount);
}
// 由高度的屏幕空间变化率推出起伏的法线（瓦垄、木纹、墙面的凹凸）
vec3 perturb(vec3 pos, vec3 n, float h){
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - grad);
}
`;

const FS = /* glsl */ `
${FS_COMMON}
uniform sampler2D map;
uniform vec3 uTint;
uniform float uScale;
uniform float uShade;
uniform float uGhost;
uniform float uWash;
uniform float uBump;
uniform vec2 uFadeD;
uniform vec2 uInkD;
#ifdef VEIL
uniform float uVeil;
#endif
void main(){
  if(uReflPass > 0.5 && vWorld.y < uWaterY - 0.04) discard;
  vec3 n = normalize(vNw);
  vec3 nv = normalize(vNv);
  // 叶片的法线是树冠整体的朝向，背面不翻
  #if defined(DOUBLE_SIDED) && !defined(LEAF)
  if(!gl_FrontFacing){ n = -n; nv = -nv; }
  #endif
  vec3 an = abs(n);
  vec2 wuv = an.y > 0.55 ? vWorld.xz : (an.x > an.z ? vWorld.zy : vWorld.xy);
  vec4 tex = vec4(1.0);
  #ifdef MAP_UV
  tex = texture(map, vUv);
  #endif
  #ifdef MAP_WORLD
  tex = texture(map, wuv * uScale);
  #endif
  #ifdef ALPHATEST
  if(tex.a < 0.42) discard;
  #endif
  #ifdef FADE
  // 远处的草丛一丛一丛地隐去（按世界里的格子取散列，镜头移动时不会忽隐忽现）：
  // 远了每丛只剩几个像素，留着只会随镜头移动闪个不停；地上那层草色照旧
  if(fract(sin(dot(floor(vObj.xz / 1.3), vec2(12.9898, 78.233))) * 43758.5453) < smoothstep(uFadeD.x, uFadeD.y, vZ)) discard;
  #endif
  #ifdef VEIL
  // 隐入烟水（行船在河的尽头显出来、隐进去）：先是线淡了、颜色化进雾色，末了按屏幕上的网点一点点透掉
  if(uVeil > 0.0){
    ivec2 vc = ivec2(gl_FragCoord.xy) & 3;
    const float BAY[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
    if((BAY[vc.y * 4 + vc.x] + 0.5) / 16.0 < smoothstep(0.4, 1.0, uVeil)) discard;
  }
  #endif
  if(uShadowPass > 0.5){
    gColor = vec4(1.0);
    gNormal = vec4(0.0);
    return;
  }
  if(uGhost > 0.5){
    ivec2 fc = ivec2(gl_FragCoord.xy);
    if(((fc.x + fc.y) & 1) == 0) discard;
  }
  vec3 col = tex.rgb * vCol * uTint;
  // 近处才看得见的细节按远近淡出：远了每个纹理只剩几个像素，留着只会闪
  float nearK = 1.0 - smoothstep(7.0, 20.0, vZ);
  #ifndef NO_FOG
  vec3 nl = n;
  #ifdef BUMP
  float hgt = dot(tex.rgb, vec3(0.3333)) * uBump;
  // 表面的细颗粒（灰泥的砂眼、木头的毛孔、石面的麻点）
  float tooth = texture(tNoise, wuv * 3.1).r - 0.5;
  hgt += tooth * (0.002 + uBump * 0.3) * nearK;
  col *= 1.0 + tooth * 0.07 * nearK;
  #ifdef TILE
  // 瓦垄：一垄一垄隆起，垄间成沟
  hgt += cos(vUv.x * 50.2655) * 0.03;
  #endif
  nl = perturb(vWorld, n, hgt);
  #endif
  col = lightWash(col, nl, n, uShade);
  #ifdef WEATHER
  if(an.y < 0.5){
    // 墙是旧的。檐下淌的雨痕：宽的几道远看也在
    float st = texture(tNoise, vec2(wuv.x*0.33, wuv.y*0.035)).r;
    float st2 = texture(tNoise, vec2(wuv.x*1.1 + 0.4, wuv.y*0.09)).g;
    col *= 1.0 - 0.19 * smoothstep(0.5, 0.78, st*0.65 + st2*0.35);
    // 细的水渍一道一道往下淌，近看才见
    float drip = smoothstep(0.6, 0.8, texture(tNoise, vec2(wuv.x*2.7, wuv.y*0.12 + 0.7)).b);
    col *= 1.0 - 0.11 * drip * nearK;
    // 大片的旧色、霉斑
    float blot = texture(tNoise, wuv * 0.045 + 0.19).g;
    col *= 1.0 - 0.1 * smoothstep(0.48, 0.74, blot);
    // 墙根：溅上来的泥、返潮生的青苔，上沿高高低低
    float base = 1.0 - smoothstep(0.0, 0.45 + 0.85 * st2, vWorld.y);
    col *= 1.0 - 0.25 * base * (0.5 + st2);
    col = mix(col, col * vec3(0.84, 0.94, 0.78), base * 0.55 * smoothstep(0.38, 0.66, blot));
    // 发丝一样的裂纹：只在几片地方有
    // 发丝一样的裂纹：自上而下弯弯折折的几道，隔两三步一道，有的墙段没有（等值线画出来是一圈圈的，像虫蛀，不用）
    float strip = floor(wuv.x / 2.3);
    float wob = texture(tNoise, vec2(wuv.y * 0.09, strip * 0.37 + 0.11)).r;
    float cx = wuv.x / 2.3 + (wob - 0.5) * 0.62 + (texture(tNoise, wuv * 0.9).g - 0.5) * 0.02;
    float ck = abs(fract(cx) - 0.5), cw = fwidth(cx) * 1.2;
    float seg = smoothstep(0.5, 0.62, texture(tNoise, vec2(strip * 0.173 + 0.31, wuv.y * 0.045)).g);
    float crack = (1.0 - smoothstep(0.0025, 0.0025 + cw, ck)) * seg;
    col *= 1.0 - 0.34 * crack * (1.0 - smoothstep(10.0, 30.0, vZ));
  }
  #else
  col *= 1.0 - 0.1 * (1.0 - smoothstep(0.0, 1.3, vWorld.y)) * step(an.y, 0.5);
  #endif
  #ifdef LEAF
  // 逆光看叶：透出一层暖亮
  float back = pow(max(dot(normalize(vWorld - cameraPosition), uSun), 0.0), 5.0);
  col = mix(col, col * vec3(1.3, 1.25, 0.92) + vec3(0.04, 0.035, 0.0), back * 0.7);
  #endif
  #endif
  #ifdef NIGHTGLOW
  {
    // 入夜窗里透出灯火：一户一户地亮起来，夜深了又一户一户地熄
    float hsh = fract(sin(dot(floor(vObj.xz / 6.5), vec2(127.1, 311.7))) * 43758.5453);
    float lit = smoothstep(hsh - 0.05, hsh + 0.05, uNight * 1.1) * step(0.01, uNight);
    col = mix(col, tex.rgb * vec3(1.46, 1.1, 0.6), lit * 0.86);
  }
  #endif
  // 晕染：颜料浓淡随世界空间低频噪声起伏
  float nz = texture(tNoise, wuv * 0.06).r;
  col = mix(vec3(1.0), col, 1.0 - uWash*0.5 + uWash*nz);
  #ifndef NO_FOG
  col = applyFog(col);
  #else
  // 远山不受日照，只随天色与烟霭变调
  col *= uFogCol / vec3(1.085, 1.06, 1.015);
  #endif
  if(uGhost > 0.5) col = mix(col, uGhost > 1.5 ? vec3(0.9,0.4,0.32) : vec3(0.6,0.85,0.55), 0.4);
  #ifdef VEIL
  col = mix(col, uFogCol, smoothstep(0.0, 0.75, uVeil));
  #endif
  // 透明度一栏留给跨帧累积：0 = 自己会动的，不累积；其余 = 1 − 0.9×随风摆动的幅度（据此推算上一帧它在哪儿）
  // （画倒影那一遍例外：水面拿透明度当“这里有没有倒影”用，照旧写 1）
  #ifdef DYN
  gColor = vec4(clamp(col * PIG, 0.0, 1.0), uReflPass > 0.5 ? 1.0 : 0.0);
  #else
  gColor = vec4(clamp(col * PIG, 0.0, 1.0), uReflPass > 0.5 ? 1.0 : 1.0 - 0.9 * clamp(vWw, 0.0, 1.0));
  #endif
  #ifdef UP_N
  // 勾线时只当它是朝天的面：与地面相接处不出折线。河岸的上沿是一条又长又直的线，镜头一动就在像素格子上一跳一跳
  nv = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  #endif
  #ifdef FLAT_N
  gNormal = vec4(0.5, 0.5, vInk.y, vInk.x);
  #else
  float lw = vInk.y;
  #ifdef INKFADE
  // 细碎的东西远了不勾线
  lw *= 1.0 - smoothstep(uInkD.x, uInkD.y, vZ);
  #endif
  #ifdef VEIL
  lw *= 1.0 - smoothstep(0.0, 0.5, uVeil);
  #endif
  gNormal = vec4(nv.xy*0.5+0.5, lw, vInk.x);
  #endif
}
`;

const FS_GROUND = /* glsl */ `
${FS_COMMON}
${RIVER_GLSL}
uniform sampler2D tSplat;
uniform sampler2D tDetail;
uniform vec4 uRect;
void main(){
  vec2 p = vWorld.xz;
  float sd = riverSD(p);
  if(sd < 0.0) discard;
  // 路沿、田边不取直线：取样位置按噪声挪一点，边缘就有进有出
  vec2 pw = p + (texture(tNoise, p * 0.085).rg - 0.5) * 2.4;
  vec4 sp = texture(tSplat, (pw - uRect.xy) / uRect.zw);
  vec3 det = texture(tDetail, p * 0.085).rgb;
  float nz = texture(tNoise, p * 0.013).r;
  float nz2 = texture(tNoise, p * 0.11 + 0.3).g;
  float nz3 = texture(tNoise, p * 0.47 + 0.7).b;
  // 土地：深浅不匀的黄土，草色是薄薄一层石绿
  float mac = texture(tNoise, p * 0.0047 + 0.37).g;
  vec3 col = vec3(0.975, 0.935, 0.86) * (0.88 + 0.18*nz) * (0.95 + 0.1*nz3);
  col *= 1.0 - 0.13 * smoothstep(0.46, 0.72, mac);
  // 草色：一层石绿薄薄罩在土色上，成片而有浓淡；片里再点几笔深的苔点
  vec3 grass = mix(vec3(0.76, 0.83, 0.57), vec3(0.58, 0.7, 0.45), nz * 0.6 + nz2 * 0.4);
  float moss = smoothstep(0.6, 0.78, texture(tNoise, p * 0.9 + 0.13).r) * (1.0 - smoothstep(18.0, 70.0, vZ));
  grass = mix(grass, vec3(0.46, 0.59, 0.39), moss * 0.5);
  float gm = clamp(sp.b * (0.86 + 0.34 * nz3) + (nz2 - 0.5) * 0.24 * sp.b * (1.0 - sp.b) * 4.0, 0.0, 1.0);
  col = mix(col, grass, gm * 0.9);
  float fu = p.x*0.9 + sin(p.y*0.25)*0.6;
  float fur = abs(fract(fu) - 0.5);
  float fl = 1.0 - smoothstep(0.03, 0.03 + fwidth(fu)*1.5 + 0.04, fur);
  vec3 field = mix(vec3(0.86, 0.915, 0.8), vec3(0.74, 0.85, 0.72), nz2);
  field = mix(field, vec3(0.4, 0.5, 0.42), fl * 0.5 * (1.0 - smoothstep(30.0, 90.0, vZ)));
  col = mix(col, field, sp.g);
  // 路面：行人踏得发白，辙痕略深
  vec3 road = vec3(1.04, 1.015, 0.955) * (0.93 + 0.11*nz2);
  // 土路不匀：踏实处发白，低洼处泥色深些，近看有零星碎石草屑
  float damp = smoothstep(0.5, 0.8, texture(tNoise, p * 0.043 + 0.61).r);
  road *= 1.0 - 0.2 * damp * (0.6 + 0.8 * nz3);
  // 码头街是土街：车辙顺街压出几道深色的沟
  float rz = p.y + 34.0 + sin(p.x * 0.11) * 0.5 + (nz2 - 0.5) * 0.5;
  float rut = max(1.0 - smoothstep(0.05, 0.16, abs(abs(rz) - 1.05)), 1.0 - smoothstep(0.05, 0.16, abs(abs(rz) - 2.75)));
  rut *= smoothstep(30.0, 46.0, p.x) * (1.0 - smoothstep(200.0, 214.0, p.x)) * step(abs(rz), 5.0) * (0.45 + 0.55 * smoothstep(0.3, 0.6, nz));
  road *= 1.0 - 0.2 * rut;
  road *= 1.0 - 0.1 * smoothstep(0.7, 0.9, texture(tNoise, p * 1.9).g) * (1.0 - smoothstep(14.0, 50.0, vZ));
  col = mix(col, road, sp.r * 0.9);
  float re = 1.0 - abs(sp.r * 2.0 - 1.0);
  col *= 1.0 - 0.13 * re * re * (0.4 + nz2);
  // 街面铺条石：错缝，缝里积墨，块块深浅不一；出了虹桥往东渐成土路
  float pave = sp.r * (1.0 - smoothstep(-30.0, 40.0, p.x));
  vec2 sg = vec2(p.x / 1.24, p.y / 0.62);
  vec2 aw = fwidth(sg) * 1.3;
  float hgt = nz3 * 0.003;
  if(pave > 0.01){
    sg.x += 0.5 * mod(floor(sg.y), 2.0);
    vec2 sf = abs(fract(sg) - 0.5), sid = floor(sg);
    float tone = fract(sin(dot(sid, vec2(12.9898, 78.233))) * 43758.5453);
    float joint = max(smoothstep(0.47 - aw.x, 0.5 - aw.x*0.2, sf.x), smoothstep(0.455 - aw.y, 0.5 - aw.y*0.2, sf.y));
    joint *= 1.0 - smoothstep(35.0, 85.0, vZ);
    vec3 stone = vec3(0.975, 0.955, 0.915) * (0.86 + 0.2*tone) * (0.9 + 0.16*nz2);
    stone *= 1.0 - 0.1 * smoothstep(0.5, 0.75, mac);
    stone = mix(stone, vec3(0.44, 0.42, 0.4), joint * 0.72);
    col = mix(col, stone, pave * 0.92);
    hgt -= joint * 0.02 * pave;
  }
  // ── 近处的细节（二十来步之内）：土粒、碎石、干裂的细纹。远了只剩几个像素，不画 ──
  float nearK = 1.0 - smoothstep(9.0, 24.0, vZ);
  float grit = texture(tNoise, p * 5.3).r - 0.5;
  float ckM2 = texture(tNoise, p * 0.071 + 0.83).g;
  float ckN = abs(texture(tNoise, p * 0.1 + 0.31).g + (texture(tNoise, p * 1.1).r - 0.5) * 0.04 - 0.5), ckM = texture(tNoise, p * 0.037 + 0.4).r;
  if(nearK > 0.01){
    col *= 1.0 + grit * 0.1 * nearK;
    hgt += grit * 0.003 * nearK;
    // 碎石：一格里至多一粒，大小、形状、深浅各异。路心踏实处少，路边、荒地上多；铺了条石的街面上几乎没有
    vec2 sdir = normalize(uSun.xz + vec2(1.0e-4));
    for(int o = 0; o < 2; o++){
      float cs = o == 0 ? 0.42 : 0.19;
      vec2 gp = p / cs + float(o) * 17.3, id = floor(gp), f = fract(gp) - 0.5;
      vec3 h = fract(sin(vec3(dot(id, vec2(127.1, 311.7)), dot(id, vec2(269.5, 183.3)), dot(id, vec2(419.2, 371.9)))) * 43758.5453);
      // 成堆成片地有：这里一小滩，那里一粒没有（处处匀匀地撒像印花）
      float dens = mix(0.5, 0.3, sp.r) * (1.0 - pave * 0.85) * (1.0 - gm * 0.82) * smoothstep(0.38, 0.62, ckM2);
      if(h.z < dens){
        vec2 c = (h.xy - 0.5) * 0.5;
        float rad = 0.09 + 0.2 * fract(h.z * 37.0);
        vec2 q = (f - c) * vec2(1.0, 0.75 + 0.5 * h.x);
        float d = length(q) / rad, body = 1.0 - smoothstep(0.72, 1.0, d);
        // 顶上亮些、边上深一圈；背日的一侧在地上留一弯影
        float sh = (1.0 - smoothstep(0.75, 1.3, length(q + sdir * rad * 0.5) / rad)) * (1.0 - body);
        // 朝日的一面亮、背日的一面暗：看得出是鼓起来的一粒，不是地上一个圈
        float face = dot(q / max(rad, 1.0e-4), sdir);
        vec3 stone = mix(vec3(0.78, 0.76, 0.71), vec3(0.98, 0.96, 0.9), h.y) * (0.92 + 0.2 * face) * (1.0 - 0.12 * smoothstep(0.6, 0.98, d));
        col = mix(col, stone, body * 0.9 * nearK);
        col *= 1.0 - 0.3 * sh * nearK;
        hgt += body * (1.0 - d * d) * 0.014 * nearK;
      }
    }
    // 干裂的细纹：土路上、几片地方才有
    float crack = (1.0 - smoothstep(0.0015, 0.006, ckN)) * smoothstep(0.5, 0.68, ckM);
    col *= 1.0 - 0.26 * crack * sp.r * (1.0 - pave) * nearK;
    hgt -= crack * 0.004 * sp.r * (1.0 - pave) * nearK;
  }
  col *= mix(vec3(1.0), det, 0.95);
  // 墙根、树下：常年不见日头的地方色深些、带点苔色，房子和树才像是长在地上的
  vec4 aux = texture(tAux, (p - uAuxRect.xy) / uAuxRect.zw);
  float wallAO = smoothstep(0.04, 0.75, aux.g);
  col *= 1.0 - 0.3 * wallAO;
  col = mix(col, col * vec3(0.86, 0.93, 0.8), wallAO * 0.5 * (1.0 - sp.r));
  col *= 1.0 - 0.17 * aux.b * (0.6 + 0.8 * nz3);
  // 水边一线是湿的
  col *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.8, sd));
  float bank = 1.0 - smoothstep(0.0, 4.5, sd);
  col *= 1.0 - 0.24 * bank * (0.5 + nz2);
  vec3 ng = normalize(vNw), nl = perturb(vWorld, ng, hgt * (1.0 - smoothstep(20.0, 60.0, vZ)));
  col = lightWash(col, nl, ng, 1.0);
  col = applyFog(col);
  gColor = vec4(clamp(col * PIG, 0.0, 1.0), 1.0);
  vec3 nv = normalize(vNv);
  gNormal = vec4(nv.xy*0.5+0.5, 1.0, 0.012);
}
`;

const FS_WATER = /* glsl */ `
${FS_COMMON}
${RIVER_GLSL}
${SKY_GLSL}
uniform sampler2D tRefl;
uniform mat4 uReflMat;
uniform float uReflOn;
uniform vec4 uRip[6];
uniform vec4 uWake[5];
uniform float uWakeK[5];
void main(){
  vec2 p = vWorld.xz;
  vec3 st = riverST(p);
  float e = clamp(1.0 + riverSD(p) / max(st.z, 1.0), 0.0, 1.2);
  float sf = st.x - uTime * 1.1;
  float n1 = texture(tNoise, vec2(sf*0.011, st.y*0.045)).r;
  float n2 = texture(tNoise, vec2(sf*0.047 + 0.4, st.y*0.2)).g;
  // 波面：两层随流而动的细浪
  vec2 q1 = vec2(sf*0.06, st.y*0.19), q2 = vec2(sf*0.17 + 0.3, st.y*0.52 - uTime*0.03);
  vec2 g = (texture(tNoise, q1).rg - 0.5) + (texture(tNoise, q2).gb - 0.5) * 0.7;
  // 离岸多远（自岸壁入水处算起，米）。贴着岸的一段水是静的：浪若一直晃到岸根，远看分不清是水在动还是岸线在抖
  float off = -riverSD(p) - (st.z < 5.0 ? 0.95 : 0.42);
  float still = 0.12 + 0.88 * smoothstep(0.1, 3.0, off);
  g *= still;
  float calm = 1.0 - smoothstep(30.0, 160.0, vZ) * 0.6;
  vec3 N = normalize(vec3(g.x * 0.3 * calm, 1.0, g.y * 0.3 * calm));
  vec3 V = normalize(cameraPosition - vWorld);
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  // 水色：河心清，近岸沉
  vec3 body = mix(vec3(0.56, 0.74, 0.8), vec3(0.38, 0.55, 0.6), smoothstep(0.3, 1.0, e));
  body *= 0.95 + 0.1*n1;
  // 倒影：岸上屋舟取自倒影图，其余映天
  vec3 R = reflect(-V, N);
  R.y = abs(R.y);
  vec3 refl = skyColor(R);
  if(uReflOn > 0.5){
    vec4 rp = uReflMat * vec4(vWorld, 1.0);
    vec2 ruv = rp.xy / rp.w + g * (0.004 + 0.55 / (vZ + 12.0));
    vec4 rf = texture(tRefl, ruv);
    refl = mix(refl, rf.rgb / PIG, rf.a);
  }
  vec3 col = mix(body, refl, clamp(fres * 0.95 + 0.3, 0.0, 0.94));
  // 日光碎金
  vec3 H = normalize(uSun + V);
  float glit = pow(max(dot(N, H), 0.0), 220.0) * smoothstep(0.35, 0.65, texture(tNoise, q2 * 3.1).r);
  // 水纹：细而疏的墨线
  float w = st.y*1.1 + sin(sf*0.2 + n1*6.2831)*0.9 + n2*2.2;
  float lv = abs(fract(w) - 0.5);
  float line = 1.0 - smoothstep(0.02, 0.03 + fwidth(w)*1.2, lv);
  line *= smoothstep(0.42, 0.66, texture(tNoise, vec2(sf*0.019 + 0.7, st.y*0.055 + 0.2)).r) * (1.0 - smoothstep(25.0, 140.0, vZ)) * smoothstep(0.5, 2.6, off);
  col = mix(col, col * vec3(0.5, 0.56, 0.6), line * 0.4);
  // 岸根的水：压一层沉着的暗色（岸的影与倒影），越贴岸越深，纹丝不动——这一带把“岸”与“水”分开
  float shore = 1.0 - smoothstep(0.0, 2.6, off);
  col *= mix(vec3(1.0), vec3(0.6, 0.68, 0.71), shore * shore * 0.85 + (1.0 - smoothstep(0.0, 0.45, off)) * 0.15);
  // 涉水荡开的波纹：两三道细细的墨圈往外走，越走越淡（和水面上别的水纹一个笔调）
  float rip = 0.0;
  for(int i = 0; i < 6; i++){
    vec4 rr = uRip[i];
    float age = uTime - rr.z;
    if(rr.w <= 0.0 || age < 0.0 || age > 6.0) continue;
    float d = distance(p, rr.xy), front = 0.3 + age * 1.4;
    float env = exp(-abs(d - front) * 1.1) * exp(-age * 0.6) * rr.w * smoothstep(0.0, 0.2, age);
    float ph = (d - front) * 3.4;
    rip += env * (1.0 - smoothstep(0.1, 0.1 + fwidth(ph) * 1.5 + 0.12, abs(sin(ph))));
  }
  col = mix(col, col * vec3(0.52, 0.58, 0.62), clamp(rip, 0.0, 1.0) * 0.5);
  // 行船的航迹：船头分开两道浪（浪头一线亮、外沿一道墨线），船尾又拖出两道，当中夹着一带搅白的水和一道道往后弯的横纹；越往后越开、越淡
  float wk = 0.0, wash = 0.0;
  float wpx = (fwidth(p.x) + fwidth(p.y)) * 0.9; // 这一处一个像素合多少米（线再细也不细过它）
  float wtx = smoothstep(0.3, 0.62, texture(tNoise, p * 0.13 + vec2(uTime * 0.01, 0.0)).r); // 取样放在循环外头：循环里取不到可靠的导数
  for(int i = 0; i < 5; i++){
    vec4 wb = uWake[i];
    vec2 d = p - wb.xy;
    if(abs(d.x) + abs(d.y) > 120.0) continue;
    vec2 dir = vec2(-cos(wb.z), sin(wb.z));
    float a = dot(d, dir), c = abs(d.x * dir.y - d.y * dir.x);
    float u = wb.w - a; // 自船头往后多远
    if(u < -1.0 || u > 90.0) continue;
    float wob = sin(u * 0.5 + n1 * 5.0) * 0.22 + sin(u * 1.9 + c) * 0.06;
    float us = u - 2.0 * wb.w + 2.0; // 自船尾往后多远
    float l1 = c - (0.6 + u * 0.34) + wob;
    float f1 = smoothstep(-0.5, 2.5, u) * (1.0 - smoothstep(20.0, 70.0, u)) * uWakeK[i];
    wk += (1.0 - smoothstep(0.1, 0.2 + wpx, abs(l1 - 0.5))) * f1;
    wk += (1.0 - smoothstep(0.07, 0.14 + wpx, abs(l1 + 0.85))) * f1 * 0.5 * smoothstep(6.0, 12.0, u);
    wash += exp(-l1 * l1 * 5.0) * f1 * 0.75;
    float l2 = c - (1.3 + us * 0.2) + wob * 0.8;
    float f2 = smoothstep(0.0, 2.0, us) * (1.0 - smoothstep(16.0, 56.0, us)) * uWakeK[i];
    float inside = 1.0 - smoothstep(-0.6, -0.1, l2);
    wk += (1.0 - smoothstep(0.09, 0.18 + wpx, abs(l2))) * f2 * 0.85;
    float ch = us * 0.4 + c * c * 0.06 + n1 * 1.5;
    wk += (1.0 - smoothstep(0.04, 0.07 + wpx * 0.4, abs(fract(ch) - 0.5))) * f2 * inside * 0.55 * smoothstep(0.3, 0.6, n2);
    wash += uWakeK[i] * smoothstep(0.0, 2.0, us) * (1.0 - smoothstep(4.0, 34.0, us)) * inside * wtx;
  }
  col = mix(col, col * vec3(0.4, 0.47, 0.53), clamp(wk, 0.0, 1.0) * 0.72);
  col = mix(col, vec3(0.95, 0.97, 0.95), clamp(wash, 0.0, 1.0) * 0.55);
  float sh = shadowAt(vWorld, vec3(0.0, 1.0, 0.0));
  col *= mix(vec3(1.0), uShadeTint * 1.12, sh * 0.6);
  col += uSunCol * glit * 0.9 * (1.0 - sh);
  col = applyFog(col);
  gColor = vec4(clamp(col * PIG, 0.0, 1.0), 1.0);
  vec3 nv = normalize(vNv);
  gNormal = vec4(nv.xy*0.5+0.5, 0.75, 5.0/255.0);
}
`;

const common = () => ({
  tNoise: shared.tNoise,
  uTime: shared.uTime,
  uFogK: shared.uFogK,
  uFogCol: shared.uFogCol,
  uSun: shared.uSun,
  uSunCol: shared.uSunCol,
  tShadow: shared.tShadow,
  uShadowMat: shared.uShadowMat,
  uShadowOn: shared.uShadowOn,
  uShadowPass: shared.uShadowPass,
  tShadow2: shared.tShadow2,
  uShadowMat2: shared.uShadowMat2,
  uShadow2On: shared.uShadow2On,
  uReflPass: shared.uReflPass,
  uWaterY: shared.uWaterY,
  uShadeTint: shared.uShadeTint,
  uNight: shared.uNight,
  tAux: shared.tAux,
  uAuxRect: shared.uAuxRect,
  uLamp: shared.uLamp,
  uCloudSh: shared.uCloudSh,
  uMist: shared.uMist,
  uJit: shared.uJit,
});
const skyUniforms = () => ({
  uSkyHor: shared.uSkyHor,
  uSkyZen: shared.uSkyZen,
  uSunGlow: shared.uSunGlow,
  uCloudLit: shared.uCloudLit,
  uCloudShade: shared.uCloudShade,
  uDisc: shared.uDisc,
  uStar: shared.uStar,
});

// 选项：bump 由贴图明暗推出的凹凸（米）；tile 瓦垄；weather 墙面雨痕；leaf 逆光透亮；life 人物的呼吸与小动作
export function inkMat(o = {}) {
  const defines = {};
  if (o.map) defines[o.world ? 'MAP_WORLD' : 'MAP_UV'] = '';
  if (o.alphaTest) defines.ALPHATEST = '';
  if (o.wind) defines.WIND = '';
  if (o.noFog) defines.NO_FOG = '';
  if (o.flatN) defines.FLAT_N = '';
  if (o.bump || o.tile) defines.BUMP = '';
  if (o.tile) defines.TILE = '';
  if (o.weather) defines.WEATHER = '';
  if (o.leaf) defines.LEAF = '';
  if (o.life) defines.LIFE = '';
  if (o.fade) defines.FADE = '';
  if (o.inkFade) defines.INKFADE = '';
  if (o.nightGlow) defines.NIGHTGLOW = '';
  if (o.upN) defines.UP_N = '';
  if (o.dyn) defines.DYN = '';
  const m = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines,
    uniforms: {
      ...common(),
      map: { value: o.map || null },
      uTint: { value: new THREE.Color().setRGB(...(o.tint || [1, 1, 1])) },
      uScale: { value: o.scale ?? 0.25 },
      uShade: { value: o.shade ?? 1 },
      uGhost: { value: 0 },
      uWash: { value: o.wash ?? 0.3 },
      uBump: { value: o.bump ?? 0 },
      uFadeD: { value: new THREE.Vector2(...(o.fade || [1e6, 2e6])) },
      uInkD: { value: new THREE.Vector2(...(o.inkFade || [1e6, 2e6])) },
    },
    vertexShader: VS,
    fragmentShader: FS,
    side: o.side ?? THREE.FrontSide,
  });
  // 没带活气数据的网格（行人的手脚、主角）取全零：不动
  if (o.life) m.defaultAttributeValues.aLife = [0, 0, 0, 0];
  if (o.depthTest === false) {
    m.depthTest = false;
    m.depthWrite = false;
  }
  return m;
}

export function cloneInk(mat) {
  const m = mat.clone();
  Object.assign(m.uniforms, common());
  m.uniforms.map = { value: mat.uniforms.map.value };
  m.defaultAttributeValues = { ...mat.defaultAttributeValues };
  return m;
}

// 把一组东西标成“自己会动的”：行人、主角、飞鸟、秋千。它们不参加跨帧累积（没有逐物的位移记录，累积了会拖影），
// 仍按老办法一帧一帧地画。做法是换用带 DYN 记号的同款材质（每种材质只多一份）
const _dynMats = new Map();
export function markDynamic(root) {
  root.traverse((o) => {
    const m = o.material;
    if (!m || !m.isShaderMaterial || !m.uniforms || !m.uniforms.map || (m.defines && m.defines.DYN !== undefined)) return;
    let d = _dynMats.get(m);
    if (!d) {
      d = cloneInk(m);
      d.defines = { ...m.defines, DYN: '' };
      _dynMats.set(m, d);
    }
    o.material = d;
  });
  return root;
}

// 给一件东西配上“隐入烟水”的开关：它的材质各换成自己的一份（带 VEIL 记号），共用返回的那个量——0 全显，1 全隐
export function veiled(root) {
  const u = { value: 0 }, own = new Map();
  root.traverse((o) => {
    const m = o.material;
    if (!m || !m.isShaderMaterial || !m.uniforms || !m.uniforms.map) return;
    let d = own.get(m);
    if (!d) {
      d = cloneInk(m);
      d.defines = { ...m.defines, VEIL: '' };
      d.uniforms.uVeil = u;
      own.set(m, d);
    }
    o.material = d;
  });
  return u;
}

function specialMat(fs, uniforms) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...common(), tRiver: shared.tRiver, uRiverRect: shared.uRiverRect, ...uniforms }, vertexShader: VS, fragmentShader: fs });
}
export const groundMat = (splat, detail, rect) =>
  specialMat(FS_GROUND, { tSplat: { value: splat }, tDetail: { value: detail }, uRect: { value: new THREE.Vector4(...rect) } });
export const waterMat = () => specialMat(FS_WATER, { ...skyUniforms(), tRefl: shared.tRefl, uReflMat: shared.uReflMat, uReflOn: shared.uReflOn, uRip: shared.uRip, uWake: shared.uWake, uWakeK: shared.uWakeK });
// 在水面某处荡开一圈波纹（涉水、泅水时由游戏调用）
let ripN = 0;
export function addRipple(x, z, amp = 1) {
  shared.uRip.value[ripN++ % 6].set(x, z, shared.uTime.value, amp);
}

// ───────────────────────── 后期 ─────────────────────────
// 上纸：颜料落在纸上的那一步。景深要在这之前做（虚的是画上的景，纸纹不能跟着糊），所以单拎出来两处共用
const PAPER_GLSL = /* glsl */ `
uniform sampler2D tPaper;
uniform vec3 uPaper;
uniform vec3 uPaperEdge;
uniform vec3 uPaperTint;
uniform vec3 uInk;
uniform float uFade;
// col：颜料值；suv：屏幕坐标 0~1；pc：纸纹坐标；pp：该处纸纹
vec3 onPaper(vec3 col, vec2 suv, vec2 pc, vec4 pp){
  vec2 c = (suv - 0.5) * vec2(1.05, 1.18);
  float vign = smoothstep(0.95, 0.28, length(c));
  float grain = pp.r;
  vec3 paper = mix(uPaperEdge, uPaper, vign) * (0.9 + 0.2*grain) * uPaperTint;
  // 旧纸：四角与边缘不匀地发暗
  float blot = texture2D(tPaper, suv * vec2(0.9, 0.55) + 0.21).g;
  paper = mix(paper, uPaperEdge * uPaperTint * 0.84, smoothstep(0.62, 1.08, length(c) + (blot - 0.5) * 0.4) * 0.6);
  vec3 pig = pow(max(col, 0.0), vec3(1.0 + (0.5 - grain)*0.5));
  // 浓处更浓：颜料的深浅拉开
  vec3 pn = clamp(pig / 1.25, 0.0, 1.0);
  pig = mix(pig, pn*pn*(3.0 - 2.0*pn) * 1.25, 0.5);
  vec3 outc = paper * pig;
  float lum = dot(outc, vec3(0.3, 0.59, 0.11));
  outc = mix(vec3(lum), outc, 1.1);
  outc *= mix(vec3(0.95, 0.985, 1.05), vec3(1.025, 1.0, 0.97), smoothstep(0.12, 0.7, lum));
  // 零星几点墨渍
  float fleck = smoothstep(0.84, 0.92, texture2D(tPaper, pc * 0.47 + 0.37).r) * smoothstep(0.5, 0.72, texture2D(tPaper, pc * 0.11 + 0.6).b);
  outc = mix(outc, uInk, fleck * 0.3);
  return mix(outc, paper, uFade);
}
`;

const POST_VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// 合成：烘染、勾线、天色、纸。alpha 里记下“此处是天”（供光柱取用）
const POST_FS = /* glsl */ `
precision highp float;
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform sampler2D tNoise;
uniform mat3 uCamRot;
uniform vec3 uSun;
uniform vec2 uRes;
uniform vec2 uProj;
uniform vec3 uUpView;
uniform float uNear;
uniform float uFar;
uniform float uLine;
uniform float uFogK;
uniform float uTime;
uniform float uAO;
uniform float uAoTaps;
uniform float uSSR;
uniform float uOpaque;
uniform float uExpose;
uniform float uRaw;
uniform float uTaa;
uniform float uSpin;
varying vec2 vUv;
${PAPER_GLSL}
${SKY_GLSL}
float zOf(float d){ return uNear*uFar / (uFar - d*(uFar - uNear)); }
vec3 viewPos(vec2 uv, float z){ return vec3((uv*2.0 - 1.0) * uProj * z, -z); }
void main(){
  vec2 frag = vUv * uRes;
  float sc = uRes.y / 1080.0;
  vec2 pc = frag / (1024.0 * max(sc, 0.75));
  vec4 pp = texture2D(tPaper, pc);
  vec2 wn = texture2D(tPaper, pc*0.31 + 0.13).gb - 0.5;
  float press = 0.7 + 0.9*texture2D(tPaper, pc*0.17 + 0.5).b;
  vec2 px = 1.0 / uRes;
  vec2 uv = vUv + wn * px * 2.6 * sc;
  // 以整像素对称取样：平面上的深度二阶差分严格为零，不受掠射角影响
  ivec2 res = ivec2(uRes);
  ivec2 ip = clamp(ivec2(uv * uRes), ivec2(0), res - 1);
  // 线宽取定值：若随纸上的“笔压”一块粗一块细，景物一动，线过了分界就突然变粗变细，看着像在抖。
  // 提按改由墨色浓淡来表现（见下）
  int r = max(1, int(uLine * sc + 0.5));
  ivec2 oA = ivec2(r, r), oC = ivec2(-r, r);
  #define FD(o) texelFetch(tDepth, clamp(ip + (o), ivec2(0), res - 1), 0).x
  #define FN(o) texelFetch(tNormal, clamp(ip + (o), ivec2(0), res - 1), 0)
  float d0 = FD(ivec2(0));
  float dA = FD(oA), dB = FD(-oA), dC = FD(oC), dD = FD(-oC);
  vec4 g0 = FN(ivec2(0));
  vec4 gA = FN(oA), gB = FN(-oA), gC = FN(oC), gD = FN(-oC);
  float z0 = zOf(d0);
  bool sky = d0 > 0.99999;

  float dn = d0; float lw = g0.b;
  if(dA < dn){ dn = dA; lw = gA.b; }
  if(dB < dn){ dn = dB; lw = gB.b; }
  if(dC < dn){ dn = dC; lw = gC.b; }
  if(dD < dn){ dn = dD; lw = gD.b; }
  float zMin = zOf(dn);

  float lap = abs(dA + dB - 2.0*d0) + abs(dC + dD - 2.0*d0);
  float gap = lap * zMin * zMin * (uFar - uNear) / (uNear * uFar);
  float thr = 0.07 + 0.03 * zMin;
  float eD = smoothstep(thr, thr*2.2, gap);
  float eN = length(gA.xy - gB.xy) + length(gC.xy - gD.xy);
  eN = smoothstep(0.22, 0.55, eN);
  float eI = min(1.0, step(0.002, abs(gA.a - gB.a)) + step(0.002, abs(gC.a - gD.a)));
  eI *= 1.0 - smoothstep(30.0, 90.0, zMin);

  // 轮廓浓，折角与部件间的线淡——有提按、有浓淡
  float edge = max(eD, max(eN * 0.72, eI * 0.55));
  float fogZ = exp(-zMin*zMin*uFogK);
  float ink = edge * lw * mix(0.08, 1.0, fogZ);
  // 纸纹颗粒是钉在屏幕上的：开着跨帧累积时不在这里乘（景物一动它就被抹匀，一停又浮出来），留给上纸那一步
  ink *= mix(0.5 + 0.7*pp.r, 0.85, uTaa);
  ink *= mix(0.5, 1.0, smoothstep(0.75, 1.35, press));
  ink = clamp(ink, 0.0, 1.0);

  // 进了屋，眼睛适应暗处：屋里提亮偏暖，门窗外头的天光就白了
  vec3 col = texture2D(tColor, uv).rgb * 1.25 * mix(vec3(1.0), vec3(1.04, 1.0, 0.94), uExpose - 1.0) * uExpose;
  vec3 V = normalize(viewPos(vUv, 1.0));
  if(sky) col = skyColor(normalize(uCamRot * V));

  // 水面倒影（屏幕空间步进）：没有倒影图时的替补
  if(uSSR > 0.5 && !sky && abs(g0.a*255.0 - 5.0) < 0.6){
    vec3 P = viewPos(uv, z0);
    vec2 wob = texture2D(tPaper, vec2(uv.x*2.0, uv.y*7.0) + vec2(uTime*0.013, uTime*0.031)).gb - 0.5;
    vec3 R = normalize(reflect(normalize(P), uUpView) + vec3(wob.x*0.07, wob.y*0.03, 0.0));
    float t = 0.5;
    for(int i = 0; i < 14; i++){
      vec3 Q = P + R * t;
      if(Q.z > -uNear) break;
      vec2 q = (Q.xy / (-Q.z)) / uProj * 0.5 + 0.5;
      if(q.x < 0.0 || q.x > 1.0 || q.y < 0.0 || q.y > 1.0) break;
      float zs = zOf(texture2D(tDepth, q).x);
      float dz = -Q.z - zs;
      if(dz > 0.0 && dz < 1.5 + t*0.7){
        vec3 hit = texture2D(tColor, q).rgb * 1.25;
        float a = (1.0 - smoothstep(0.8, 1.0, q.y)) * (1.0 - smoothstep(30.0, 75.0, t));
        col = mix(col, hit, a * 0.66);
        break;
      }
      t *= 1.42;
    }
  }

  // 烘染：转角、檐下、物与地相接处积一层淡墨
  if(uAO > 0.5 && !sky){
    vec3 P = viewPos(uv, z0);
    vec3 N = vec3(g0.xy*2.0 - 1.0, 0.0);
    N.z = sqrt(max(0.0, 1.0 - dot(N.xy, N.xy)));
    float rw = 0.85;
    float ruv = min(0.08, rw / (z0 * uProj.y * 2.0));
    float rot = fract(fract(sin(dot(frag, vec2(12.9898, 78.233))) * 43758.5453) + uSpin) * 6.2831;
    float ao = 0.0;
    for(int i = 0; i < 8; i++){
      if(float(i) >= uAoTaps) break;
      float a = float(i)*2.39996 + rot;
      float rr = sqrt((float(i) + 0.5) / uAoTaps) * ruv;
      vec2 su = uv + vec2(cos(a) * uProj.y / uProj.x, sin(a)) * rr;
      vec3 S = viewPos(su, zOf(texture2D(tDepth, su).x));
      vec3 v = S - P;
      float d2 = dot(v, v);
      ao += max(0.0, dot(N, v) - 0.04 - 0.004*z0) / (d2 + 0.06) * step(d2, rw*rw*3.0);
    }
    ao = clamp(ao * 1.68 / uAoTaps, 0.0, 1.0) * (1.0 - smoothstep(45.0, 100.0, z0));
    col *= mix(vec3(1.0), vec3(0.56, 0.6, 0.67), ao * 0.9);
  }

  col = mix(col, uInk, ink * 0.95);

  if(uRaw > 0.5){
    // 后面还有景深那一遍：先不上纸，把颜料值压进 0~1 存下（带一点纸纹抖动，免得天色成带）
    gl_FragColor = vec4(clamp(col * 0.8 + (pp.r - 0.5) / 255.0, 0.0, 1.0), 1.0);
    return;
  }
  // 直接上屏时（不走收尾那几遍）透明度必须是 1，否则画布会透出网页底色
  gl_FragColor = vec4(onPaper(col, vUv, pc, pp), sky ? 1.0 : uOpaque);
}
`;

// 景深：焦点前后一段是清楚的，远处渐渐虚成一片淡彩，贴到镜头跟前的枝叶也虚。虚化之后再上纸。
// uDof：x 焦点距离（米）  y 最大弥散半径（1080 线下的像素）  z 远景开始虚的门槛  w 近景开始虚的门槛
const DOF_FS = /* glsl */ `
precision highp float;
uniform sampler2D tA;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform vec4 uDof;
uniform float uNearK;
uniform float uZa;
uniform float uSharp;
varying vec2 vUv;
${PAPER_GLSL}
float zOf(float d){ return uNear*uFar / (uFar - d*(uFar - uNear)); }
float cocOf(float z){
  float far = smoothstep(uDof.z, 1.0, 1.0 - uDof.x / z);
  float near = smoothstep(uDof.w, uDof.w * 2.5 + 0.6, uDof.x / z - 1.0);
  return uDof.y * max(far, near * uNearK);
}
void main(){
  float sc = uRes.y / 1080.0;
  vec2 frag = vUv * uRes;
  vec2 pc = frag / (1024.0 * max(sc, 0.75));
  vec4 pp = texture2D(tPaper, pc);
  vec2 px = 1.0 / uRes;
  vec4 s0 = texture2D(tA, vUv);
  vec3 c0 = s0.rgb;
  if(uSharp > 0.0){
    // 叠过若干帧的画面略软：把与四邻的差放大一点补回来，但不许超出四邻的明暗范围（不出白边黑边）
    vec3 n1 = texture2D(tA, vUv + vec2(px.x, 0.0)).rgb, n2 = texture2D(tA, vUv - vec2(px.x, 0.0)).rgb;
    vec3 n3 = texture2D(tA, vUv + vec2(0.0, px.y)).rgb, n4 = texture2D(tA, vUv - vec2(0.0, px.y)).rgb;
    vec3 lo = min(c0, min(min(n1, n2), min(n3, n4))), hi = max(c0, max(max(n1, n2), max(n3, n4)));
    c0 = clamp(c0 + (c0 - (n1 + n2 + n3 + n4) * 0.25) * uSharp, lo, hi);
  }
  vec3 col = c0;
  if(uDof.y > 0.01){
    // 开着跨帧累积时深度取叠匀了的那份（存在透明度里）：逐帧微移的原始深度在物体边上忽前忽后，虚实会跟着跳
    float z0 = uZa > 0.5 ? s0.a : zOf(texture2D(tDepth, vUv).x);
    float coc0 = cocOf(z0), R = coc0;
    // 逐像素把取样的圆盘转一个角度：用交错梯度噪声，颗粒比白噪声匀净
    float rot = fract(52.9829189 * fract(dot(floor(frag), vec2(0.06711056, 0.00583715)))) * 6.2831;
    // 近处虚掉的东西要漫到后面清楚的景上：先探一圈，看附近有没有更近、更虚的
    if(uNearK > 0.0){
      float probe = uDof.y * uNearK * sc * 0.7;
      for(int i = 0; i < 6; i++){
        float a = float(i) * 1.0472 + rot;
        vec2 pu = vUv + vec2(cos(a), sin(a)) * probe * px;
        float zs = uZa > 0.5 ? texture2D(tA, pu).a : zOf(texture2D(tDepth, pu).x);
        if(zs < z0) R = max(R, cocOf(zs) * 0.8);
      }
    }
    if(R > 0.35){
      vec3 acc = c0;
      float wsum = 1.0;
      for(int i = 0; i < 24; i++){
        float fi = float(i) + 0.5;
        float rr = sqrt(fi / 24.0) * R;
        float a = fi * 2.39996 + rot;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * rr * sc * px;
        vec4 sm = texture2D(tA, uv);
        float zs = uZa > 0.5 ? sm.a : zOf(texture2D(tDepth, uv).x);
        // 比这里近的：它自己虚到这么远才漫得过来；不比这里近的：这里自己得虚到这么远才取它
        float w = zs < z0 * 0.98 ? clamp(cocOf(zs) - rr + 1.0, 0.0, 1.0) : clamp(coc0 - rr + 1.0, 0.0, 1.0);
        acc += sm.rgb * w;
        wsum += w;
      }
      col = acc / wsum;
    }
  }
  gl_FragColor = vec4(onPaper(col / 0.8, vUv, pc, pp), 1.0);
}
`;

// 跨帧累积（TAA）：整幅画面每帧挪不到半个像素地画，再把这一帧与前面若干帧叠在一起——前面的帧按“景物上一帧在屏幕上哪儿”取回来。
// 墨线是贴着像素格子勾的，单看一帧只能落在整格上；叠起来之后才能停在半格、小半格上，镜头慢慢移动时不再一格一格地跳。
// 景物上一帧在哪儿：不动的东西由深度与两帧的镜头位置算出；随风摆的枝叶再减去这一帧里风吹出的那点位移；
// 自己会走会飞的不叠（见 markDynamic）。透明度里顺带叠一份深度，给景深用。
const TAA_FS = /* glsl */ `
precision highp float;
uniform sampler2D tA;
uniform highp sampler2D tHist;
uniform sampler2D tDepth;
uniform sampler2D tColor;
uniform vec2 uRes;
uniform vec2 uProj;
uniform vec2 uPrevProj;
uniform mat3 uCamRot;
uniform mat3 uPrevRotInv;
uniform vec3 uCamPos;
uniform vec3 uCamMove;
uniform float uNear;
uniform float uFar;
uniform float uTime;
uniform float uDt;
uniform float uBlend;
uniform int uTap;
varying vec2 vUv;
const ivec2 OFF[8] = ivec2[8](ivec2(-1, -1), ivec2(1, -1), ivec2(-1, 1), ivec2(1, 1), ivec2(-1, 0), ivec2(1, 0), ivec2(0, -1), ivec2(0, 1));
float zOf(float d){ return uNear*uFar / (uFar - d*(uFar - uNear)); }
// 与顶点着色器里的风一致
vec3 windAt(vec3 wp, float t){
  float ph = wp.x*0.37 + wp.z*0.29;
  return vec3((sin(t*1.25+ph) + 0.5*sin(t*2.7+ph*1.7)) * 0.17, 0.0, cos(t*1.05+ph*1.3) * 0.13);
}
// 取上一帧：五点的 Catmull-Rom，比双线性清楚——镜头一直在动时不至于越叠越糊
vec4 histAt(vec2 uv){
  vec2 sp = uv * uRes;
  vec2 t1 = floor(sp - 0.5) + 0.5;
  vec2 f = sp - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5*f));
  vec2 w1 = 1.0 + f*f * (-2.5 + 1.5*f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5*f));
  vec2 w3 = f*f * (-0.5 + 0.5*f);
  vec2 w12 = w1 + w2;
  vec2 t0 = (t1 - 1.0) / uRes, t3 = (t1 + 2.0) / uRes, t12 = (t1 + w2 / w12) / uRes;
  float a = w12.x*w0.y, b = w0.x*w12.y, c = w12.x*w12.y, d = w3.x*w12.y, e = w12.x*w3.y;
  vec4 s = texture2D(tHist, vec2(t12.x, t0.y)) * a + texture2D(tHist, vec2(t0.x, t12.y)) * b + texture2D(tHist, t12) * c
         + texture2D(tHist, vec2(t3.x, t12.y)) * d + texture2D(tHist, vec2(t12.x, t3.y)) * e;
  return s / (a + b + c + d + e);
}
void main(){
  ivec2 res = ivec2(uRes);
  ivec2 ip = clamp(ivec2(vUv * uRes), ivec2(0), res - 1);
  vec4 cur = texelFetch(tA, ip, 0);
  float dC = texelFetch(tDepth, ip, 0).x;
  float aC = texelFetch(tColor, ip, 0).a;
  // 在勾线够得着的范围里找最靠前的那一处：物体边上的线有一半画在背景上，得跟着前面的物体走
  float dn = dC, an = aC, dlo = dC, dhi = dC;
  bool dyn = aC < 0.05;
  vec3 lo = cur.rgb, hi = cur.rgb;
  for(int i = 0; i < 8; i++){
    ivec2 q = clamp(ip + OFF[i] * uTap, ivec2(0), res - 1);
    float d = texelFetch(tDepth, q, 0).x;
    float a = texelFetch(tColor, q, 0).a;
    if(a < 0.05 && d <= dC) dyn = true;
    if(d < dn){ dn = d; an = a; }
    dlo = min(dlo, d);
    dhi = max(dhi, d);
    vec3 c = texelFetch(tA, clamp(ip + OFF[i], ivec2(0), res - 1), 0).rgb;
    lo = min(lo, c);
    hi = max(hi, c);
  }
  float zC = zOf(dC);
  if(dyn || uBlend > 0.99){ gl_FragColor = vec4(cur.rgb, zC); return; }
  float z = zOf(dn);
  // 以镜头为原点、按世界方向摆的位置
  vec3 rel = uCamRot * vec3((vUv*2.0 - 1.0) * uProj * z, -z);
  vec3 was = rel + uCamMove;
  float ww = (1.0 - an) / 0.9;
  if(ww > 0.004){
    vec3 wp = rel + uCamPos;
    was -= (windAt(wp, uTime) - windAt(wp, uTime - uDt)) * ww;
  }
  vec3 pv = uPrevRotInv * was;
  vec2 puv = (pv.xy / max(-pv.z, 1e-4)) / uPrevProj * 0.5 + 0.5;
  if(pv.z > -uNear || puv.x < 0.0 || puv.x > 1.0 || puv.y < 0.0 || puv.y > 1.0){ gl_FragColor = vec4(cur.rgb, zC); return; }
  vec4 h = histAt(puv);
  // 上一帧取回来的颜色若落在这一帧周围八格的范围之外，就是取错了（那里上一帧被别的东西挡着），拉回范围里
  vec3 hc = clamp(h.rgb, lo, hi);
  float hz = clamp(h.a, zOf(dlo), zOf(dhi));
  gl_FragColor = vec4(mix(hc, cur.rgb, uBlend), mix(hz, zC, uBlend));
}
`;

// 光柱：自各处朝日头的屏幕位置取样，天光漏下来的地方连成一道道
const RAYS_FS = /* glsl */ `
precision highp float;
uniform sampler2D tA;
uniform vec2 uSunUV;
uniform float uAspect;
varying vec2 vUv;
void main(){
  vec2 d = uSunUV - vUv;
  float jit = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  float acc = 0.0, ws = 0.0;
  for(int i = 0; i < 28; i++){
    float t = (float(i) + jit) / 28.0;
    vec2 q = vUv + d * t * 0.94;
    float m = texture2D(tA, q).a;
    m *= 1.0 - smoothstep(0.05, 0.8, length((q - uSunUV) * vec2(uAspect, 1.0)));
    float w = 1.0 - t * 0.55;
    acc += m * w;
    ws += w;
  }
  gl_FragColor = vec4(vec3(acc / ws), 1.0);
}
`;
// 取亮部并缩到四分之一
const BRIGHT_FS = /* glsl */ `
precision highp float;
uniform sampler2D tA;
uniform vec2 uPx;
varying vec2 vUv;
void main(){
  vec3 c = (texture2D(tA, vUv + uPx*vec2(-1.0, -1.0)).rgb + texture2D(tA, vUv + uPx*vec2(1.0, -1.0)).rgb + texture2D(tA, vUv + uPx*vec2(-1.0, 1.0)).rgb + texture2D(tA, vUv + uPx*vec2(1.0, 1.0)).rgb) * 0.25;
  float l = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(c * smoothstep(0.7, 0.98, l), 1.0);
}
`;
const BLUR_FS = /* glsl */ `
precision highp float;
uniform sampler2D tA;
uniform vec2 uDir;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tA, vUv).rgb * 0.2270;
  c += (texture2D(tA, vUv + uDir*1.385).rgb + texture2D(tA, vUv - uDir*1.385).rgb) * 0.3162;
  c += (texture2D(tA, vUv + uDir*3.231).rgb + texture2D(tA, vUv - uDir*3.231).rgb) * 0.0703;
  gl_FragColor = vec4(c, 1.0);
}
`;
// 收尾：抗锯齿 + 高光的晕 + 光柱
const FINAL_FS = /* glsl */ `
precision highp float;
uniform sampler2D tA;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform vec2 uPx;
uniform vec3 uRayCol;
uniform float uBloom;
uniform sampler2D tColor;
uniform float uTaa;
varying vec2 vUv;
void main(){
  vec3 L = vec3(0.299, 0.587, 0.114);
  vec3 cM = texture2D(tA, vUv).rgb;
  float lNW = dot(texture2D(tA, vUv + vec2(-1.0, -1.0)*uPx).rgb, L), lNE = dot(texture2D(tA, vUv + vec2(1.0, -1.0)*uPx).rgb, L);
  float lSW = dot(texture2D(tA, vUv + vec2(-1.0, 1.0)*uPx).rgb, L), lSE = dot(texture2D(tA, vUv + vec2(1.0, 1.0)*uPx).rgb, L);
  float lM = dot(cM, L);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + red), -8.0, 8.0) * uPx;
  vec3 A = 0.5 * (texture2D(tA, vUv + dir*(1.0/3.0 - 0.5)).rgb + texture2D(tA, vUv + dir*(2.0/3.0 - 0.5)).rgb);
  vec3 B = A*0.5 + 0.25 * (texture2D(tA, vUv - dir*0.5).rgb + texture2D(tA, vUv + dir*0.5).rgb);
  float lB = dot(B, L);
  vec3 col = (lB < lMin || lB > lMax) ? A : B;
  if(uTaa > 0.5){
    // 跨帧累积过的地方边缘已经是匀的，再抹一遍只会糊；只有不参加累积的（行人、飞鸟……）还靠这一遍
    float dynA = min(texture2D(tColor, vUv).a, min(min(texture2D(tColor, vUv + uPx*vec2(-1.5, -1.5)).a, texture2D(tColor, vUv + uPx*vec2(1.5, -1.5)).a), min(texture2D(tColor, vUv + uPx*vec2(-1.5, 1.5)).a, texture2D(tColor, vUv + uPx*vec2(1.5, 1.5)).a)));
    if(dynA > 0.05) col = cM;
  }
  // 滤色叠加：亮处不过曝，暗处被邻近的亮光晕开
  col += texture2D(tBloom, vUv).rgb * uBloom * (1.0 - col);
  col += uRayCol * texture2D(tRays, vUv).r * (1.0 - col * 0.6);
  gl_FragColor = vec4(col, 1.0);
}
`;

// 画面逐帧微移的八个位置（Halton 2、3 序列，单位：像素，-0.5~0.5）
const JITTER = [[0, -1 / 6], [-0.25, 1 / 6], [0.25, -7 / 18], [-0.375, -1 / 18], [0.125, 5 / 18], [-0.125, -5 / 18], [0.375, 1 / 18], [-0.4375, 7 / 18]];
const _m = new THREE.Matrix4(), _bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const _t = new THREE.Vector3(), _up = new THREE.Vector3(), _d = new THREE.Vector3(), _v4 = new THREE.Vector4();

export class InkRenderer {
  // shadows 日照投影；ssr 屏幕空间倒影（没有倒影图时用）；ao 烘染；reflect 水面倒影图；fx 光柱、辉光与抗锯齿
  constructor(canvas, textures, { shadows = true, ssr = true, ao = true, reflect = true, fx = true } = {}) {
    THREE.ColorManagement.enabled = false;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }));
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.autoClear = false;
    // 像素倍率：见下面“跨帧累积”——开得了就照屏幕原生的分辨率画，开不了才多画一半像素来压锯齿
    this.pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
    this.maxPixels = 6.2e6; // 画面像素上限，超大屏幕上自动降一点渲染分辨率
    this.reflect = reflect;
    this.fx = fx;
    const depthTexture = new THREE.DepthTexture(4, 4);
    this.rt = new THREE.WebGLRenderTarget(4, 4, {
      count: 2, depthBuffer: true, depthTexture, type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
    this.rt.textures[1].minFilter = this.rt.textures[1].magFilter = THREE.NearestFilter;
    const plain = () => new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.rtA = plain();
    this.rtB = plain();
    this.rtQ1 = plain();
    this.rtQ2 = plain();
    this.rtRays = plain();
    // 跨帧累积：两张半浮点的图轮流当“上一帧”与“这一帧”（八位的存不住一成一成叠上去的细微变化）。显卡不支持就不开
    this.taa = fx;
    this.taaBlend = 0.1; // 每帧新画面占的份量
    this.taaSharp = 0.5; // 叠完之后补回的清晰度
    this.hist = null;
    if (fx && (r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float'))) {
      const hf = () => new THREE.WebGLRenderTarget(4, 4, { depthBuffer: false, type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
      this.hist = [hf(), hf()];
      // 线的平滑交给累积去做，比多画像素省得多：2K、4K 的大屏上少画一半以上的像素，帧率才稳
      this.pixelRatio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    }
    this._hi = 0;
    this._jit = 0;
    this._taaReset = true;
    this._prev = { rot: new THREE.Matrix3(), pos: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, -1), proj: new THREE.Vector2(1, 1), time: 0 };
    // 倒影
    this.reflRT = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, type: THREE.UnsignedByteType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflCam.layers.set(0);
    this.reflCam.layers.enable(3); // 第 3 层：不投影但要入倒影的（河岸、台基、远山）
    // 日照投影
    this.shadows = shadows;
    this.shadowRange = 72;
    this.shadowCenter = new THREE.Vector3();
    this.shadowEvery = 1; // 每帧都更新投影：隔帧更新时，跑动的人身上的影与地上的影会一前一后地抖
    this._frame = 0;
    if (shadows) {
      const sd = new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE);
      sd.type = THREE.UnsignedIntType;
      this.shadowRT = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthBuffer: true, depthTexture: sd, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.shadowCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 420);
      this.shadowCam.layers.enable(2); // 第 2 层：只投影、不入画（第一人称时自己的身影）
      // 近处的那张：shadowNear 是它罩住的半径（米），0 即不用；shadowCenter2 是中心
      const sd2 = new THREE.DepthTexture(SHADOW_SIZE, SHADOW_SIZE);
      sd2.type = THREE.UnsignedIntType;
      this.shadowRT2 = new THREE.WebGLRenderTarget(SHADOW_SIZE, SHADOW_SIZE, { depthBuffer: true, depthTexture: sd2, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
      this.shadowNear = 0;
      this.shadowCenter2 = new THREE.Vector3();
    }
    const mat = (fs, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: POST_VS, fragmentShader: fs, depthTest: false, depthWrite: false });
    // 纸的那几样：合成与景深两遍共用同一份
    const paperU = {
      tPaper: { value: textures.paper },
      // 纸色比绢本原色提亮、偏暖白，好让粉墙亮得起来、墨色沉得下去
      uPaper: { value: new THREE.Color().setRGB(0.925, 0.868, 0.742) },
      uPaperEdge: { value: new THREE.Color().setRGB(0.76, 0.675, 0.53) },
      uPaperTint: { value: post.paper },
      uInk: { value: new THREE.Color().setRGB(0.105, 0.09, 0.085) },
      uFade: { value: 0 },
    };
    this.postMat = mat(POST_FS, {
      tColor: { value: this.rt.textures[0] },
      tNormal: { value: this.rt.textures[1] },
      tDepth: { value: depthTexture },
      ...paperU,
      uRaw: { value: 0 },
      tNoise: shared.tNoise,
      uCamRot: { value: new THREE.Matrix3() },
      uSun: shared.uSun,
      ...skyUniforms(),
      uRes: { value: new THREE.Vector2(4, 4) },
      uProj: { value: new THREE.Vector2(1, 1) },
      uUpView: { value: new THREE.Vector3(0, 1, 0) },
      uNear: { value: 0.1 },
      uFar: { value: 1000 },
      uLine: { value: 1.12 },
      uFogK: shared.uFogK,
      uTime: shared.uTime,
      uAO: { value: ao ? 1 : 0 },
      uAoTaps: { value: 8 },
      uSSR: { value: ssr && !reflect ? 1 : 0 },
      uOpaque: { value: 0 },
      uExpose: { value: 1 },
      uTaa: { value: 0 },
      uSpin: { value: 0 },
    });
    // 景深：focus 焦点距离（米）；aper 最大弥散半径（1080 线下的像素，0 即关）；tol / nearTol 远、近景开始虚的门槛；nearK 近景虚化的倍数
    this.dof = { focus: 9, aper: 3.2, tol: 0.6, nearTol: 3.2, nearK: 1.2 };
    const pu = this.postMat.uniforms;
    this.dofMat = mat(DOF_FS, {
      tA: { value: this.rtA.texture }, tDepth: { value: depthTexture }, ...paperU,
      uRes: pu.uRes, uNear: pu.uNear, uFar: pu.uFar, uDof: { value: new THREE.Vector4(9, 0, 0.6, 3.2) }, uNearK: { value: 1 }, uZa: { value: 0 }, uSharp: { value: 0 },
    });
    this.taaMat = mat(TAA_FS, {
      tA: { value: this.rtA.texture }, tHist: { value: null }, tDepth: { value: depthTexture }, tColor: { value: this.rt.textures[0] },
      uRes: pu.uRes, uProj: pu.uProj, uPrevProj: { value: new THREE.Vector2(1, 1) }, uCamRot: pu.uCamRot, uPrevRotInv: { value: new THREE.Matrix3() },
      uCamPos: { value: new THREE.Vector3() }, uCamMove: { value: new THREE.Vector3() }, uNear: pu.uNear, uFar: pu.uFar,
      uTime: { value: 0 }, uDt: { value: 0 }, uBlend: { value: 1 }, uTap: { value: 2 },
    });
    this.raysMat = mat(RAYS_FS, { tA: { value: this.rtB.texture }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 } });
    this.brightMat = mat(BRIGHT_FS, { tA: { value: this.rtB.texture }, uPx: { value: new THREE.Vector2() } });
    this.blurMat = mat(BLUR_FS, { tA: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.finalMat = mat(FINAL_FS, {
      tA: { value: this.rtB.texture }, tBloom: { value: this.rtQ1.texture }, tRays: { value: this.rtRays.texture },
      uPx: { value: new THREE.Vector2() }, uRayCol: { value: new THREE.Vector3() }, uBloom: { value: 0.3 }, tColor: { value: this.rt.textures[0] }, uTaa: { value: 0 },
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.postScene = new THREE.Scene();
    this.quad = new THREE.Mesh(tri, this.postMat);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.resize();
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(this.pixelRatio, Math.sqrt(this.maxPixels / Math.max(1, w * h)));
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    const pw = Math.max(2, Math.floor(w * pr)), ph = Math.max(2, Math.floor(h * pr));
    this.rt.setSize(pw, ph);
    this.rtA.setSize(pw, ph);
    this.rtB.setSize(pw, ph);
    const qw = Math.max(2, pw >> 2), qh = Math.max(2, ph >> 2);
    this.rtQ1.setSize(qw, qh);
    this.rtQ2.setSize(qw, qh);
    this.rtRays.setSize(qw, qh);
    this.reflRT.setSize(Math.max(2, pw >> 1), Math.max(2, ph >> 1));
    if (this.hist) {
      for (const h of this.hist) h.setSize(pw, ph);
      this._taaReset = true; // 尺寸变了，前面叠的作废
    }
    this.postMat.uniforms.uRes.value.set(pw, ph);
    this.finalMat.uniforms.uPx.value.set(1 / pw, 1 / ph);
    this.brightMat.uniforms.uPx.value.set(1 / pw, 1 / ph);
    this._q = [qw, qh];
    shared.uResY.value = ph;
  }
  set fade(v) {
    this.postMat.uniforms.uFade.value = v;
  }
  // 曝光：1 为户外；进屋后调高
  get expose() {
    return this.postMat.uniforms.uExpose.value;
  }
  set expose(v) {
    this.postMat.uniforms.uExpose.value = v;
  }
  // 烘染的取样数（1~8）：手机上取少些
  set aoTaps(v) {
    this.postMat.uniforms.uAoTaps.value = Math.max(1, Math.min(8, v));
  }
  renderShadow(scene) {
    this._shadowPass(scene, this.shadowRange, this.shadowCenter, this.shadowRT, shared.tShadow, shared.uShadowMat);
    shared.uShadowOn.value = 1;
    if (this.shadowNear > 0) {
      this._shadowPass(scene, this.shadowNear, this.shadowCenter2, this.shadowRT2, shared.tShadow2, shared.uShadowMat2);
      shared.uShadow2On.value = 1;
    } else shared.uShadow2On.value = 0;
  }
  _shadowPass(scene, R, center, rt, uTex, uMat) {
    const cam = this.shadowCam, sun = shared.uSun.value;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
    cam.updateProjectionMatrix();
    // 贴齐纹素网格，行走时影子不闪
    cam.position.set(0, 0, 0);
    cam.lookAt(-sun.x, -sun.y, -sun.z);
    cam.updateMatrixWorld();
    _m.copy(cam.matrixWorld).invert();
    _t.copy(center).applyMatrix4(_m);
    const tx = (2 * R) / SHADOW_SIZE;
    _t.x = Math.round(_t.x / tx) * tx;
    _t.y = Math.round(_t.y / tx) * tx;
    _t.applyMatrix4(cam.matrixWorld);
    cam.position.copy(_t).addScaledVector(sun, 200);
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const r = this.renderer, was = uTex.value;
    // 画投影的这一遍里两张投影图都不能当贴图用（正往其中一张里画）
    shared.tShadow.value = null;
    shared.tShadow2.value = null;
    shared.uShadowPass.value = 1;
    r.setRenderTarget(rt);
    r.clear(true, true, false);
    r.render(scene, cam);
    shared.uShadowPass.value = 0;
    uTex.value = rt.depthTexture;
    if (uTex !== shared.tShadow) shared.tShadow.value = this.shadowRT.depthTexture;
    uMat.value.multiplyMatrices(_bias, _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  }
  // 倒影：把镜头翻到水面之下再画一遍
  renderReflection(scene, camera) {
    const v = this.reflCam, y0 = shared.uWaterY.value, r = this.renderer;
    if (camera.position.y <= y0 + 0.05) {
      shared.uReflOn.value = 0;
      return;
    }
    v.fov = camera.fov;
    v.aspect = camera.aspect;
    v.near = camera.near;
    v.far = camera.far;
    v.updateProjectionMatrix();
    v.position.set(camera.position.x, 2 * y0 - camera.position.y, camera.position.z);
    camera.getWorldDirection(_d);
    _up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    v.up.set(_up.x, -_up.y, _up.z);
    v.lookAt(v.position.x + _d.x, v.position.y - _d.y, v.position.z + _d.z);
    v.updateMatrixWorld();
    v.matrixWorldInverse.copy(v.matrixWorld).invert();
    shared.tRefl.value = null;
    shared.uReflPass.value = 1;
    r.setRenderTarget(this.reflRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, v);
    shared.uReflPass.value = 0;
    shared.tRefl.value = this.reflRT.texture;
    shared.uReflMat.value.multiplyMatrices(_bias, _m.multiplyMatrices(v.projectionMatrix, v.matrixWorldInverse));
    shared.uReflOn.value = 1;
  }
  _pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCam);
  }
  // blend：这一帧新画面占的份量，不给则用 taaBlend（留影时逐帧给 1/2、1/3……，等于把几帧取平均）
  render(scene, camera, blend) {
    const r = this.renderer, u = this.postMat.uniforms;
    if (this.shadows && this._frame++ % this.shadowEvery === 0) this.renderShadow(scene);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    if (this.reflect) this.renderReflection(scene, camera);
    u.uNear.value = camera.near;
    u.uFar.value = camera.far;
    const t = Math.tan((camera.fov * Math.PI) / 360);
    u.uProj.value.set(t * camera.aspect, t);
    u.uUpView.value.copy(_up.set(0, 1, 0)).transformDirection(camera.matrixWorldInverse);
    u.uCamRot.value.setFromMatrix4(camera.matrixWorld);
    r.setRenderTarget(this.rt);
    r.setClearColor(0xffffff, 1);
    r.clear(true, true, false);
    const taa = this.fx && this.taa && !!this.hist;
    if (taa) {
      // 整幅画面挪不到半个像素：八帧一轮，各帧落在一个像素里的不同位置
      const j = JITTER[(this._jit = (this._jit + 1) % JITTER.length)], e = camera.projectionMatrix.elements;
      const sx = (2 * j[0]) / this.rt.width, sy = (2 * j[1]) / this.rt.height;
      e[8] -= sx;
      e[9] -= sy;
      shared.uJit.value.set(sx, sy);
      r.render(scene, camera);
      e[8] += sx;
      e[9] += sy;
      shared.uJit.value.set(0, 0);
    } else r.render(scene, camera);
    u.uOpaque.value = this.fx ? 0 : 1;
    u.uRaw.value = this.fx ? 1 : 0;
    u.uTaa.value = taa ? 1 : 0;
    u.uSpin.value = taa ? (this._frame * 0.6180339887) % 1 : 0;
    if (!this.fx) return this._pass(this.postMat, null);
    this._pass(this.postMat, this.rtA);
    // 跨帧累积
    const PV = this._prev, DU = this.dofMat.uniforms;
    camera.getWorldDirection(_d);
    if (taa) {
      const q = this.taaMat.uniforms, pos = camera.position;
      // 镜头一下子换了地方（进出片头、传送、急转）：前面叠的不作数，从这一帧重新叠
      const cut = this._taaReset || pos.distanceToSquared(PV.pos) > 36 || _d.dot(PV.dir) < 0.86;
      q.uBlend.value = cut ? 1 : blend ?? this.taaBlend;
      q.uPrevRotInv.value.copy(PV.rot).transpose();
      q.uPrevProj.value.copy(PV.proj);
      q.uCamPos.value.copy(pos);
      q.uCamMove.value.subVectors(pos, PV.pos);
      q.uTime.value = shared.uTime.value;
      q.uDt.value = cut ? 0 : shared.uTime.value - PV.time;
      q.uTap.value = Math.max(1, Math.floor((u.uLine.value * this.rt.height) / 1080 + 0.5)) + 1;
      q.tHist.value = this.hist[this._hi].texture;
      this._hi = 1 - this._hi;
      this._pass(this.taaMat, this.hist[this._hi]);
      DU.tA.value = this.hist[this._hi].texture;
      DU.uZa.value = 1;
      DU.uSharp.value = this.taaSharp;
      this._taaReset = false;
    } else {
      DU.tA.value = this.rtA.texture;
      DU.uZa.value = 0;
      DU.uSharp.value = 0;
      this._taaReset = true;
    }
    PV.rot.copy(u.uCamRot.value);
    PV.pos.copy(camera.position);
    PV.dir.copy(_d);
    PV.proj.copy(u.uProj.value);
    PV.time = shared.uTime.value;
    // 景深，然后上纸
    const D = this.dof, dq = this.dofMat.uniforms;
    dq.uDof.value.set(Math.max(0.3, D.focus), D.aper, D.tol, D.nearTol);
    dq.uNearK.value = D.nearK;
    this._pass(this.dofMat, this.rtB);
    // 日头在屏幕上的位置；在身后就没有光柱
    const f = this.finalMat.uniforms;
    _v4.set(camera.position.x + shared.uSun.value.x * 800, camera.position.y + shared.uSun.value.y * 800, camera.position.z + shared.uSun.value.z * 800, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    let rays = 0;
    if (_v4.w > 0) {
      const sx = _v4.x / _v4.w, sy = _v4.y / _v4.w;
      rays = 1 - Math.min(1, Math.max(0, (Math.max(Math.abs(sx), Math.abs(sy)) - 1.0) / 0.9));
      this.raysMat.uniforms.uSunUV.value.set(sx * 0.5 + 0.5, sy * 0.5 + 0.5);
      this.raysMat.uniforms.uAspect.value = camera.aspect;
    }
    if (rays > 0.01) this._pass(this.raysMat, this.rtRays);
    f.uRayCol.value.copy(post.ray).multiplyScalar(rays);
    // 高光的晕
    this._pass(this.brightMat, this.rtQ1);
    const b = this.blurMat.uniforms, [qw, qh] = this._q;
    for (let i = 0; i < 2; i++) {
      b.tA.value = this.rtQ1.texture;
      b.uDir.value.set((1 + i) / qw, 0);
      this._pass(this.blurMat, this.rtQ2);
      b.tA.value = this.rtQ2.texture;
      b.uDir.value.set(0, (1 + i) / qh);
      this._pass(this.blurMat, this.rtQ1);
    }
    f.uBloom.value = post.bloom;
    f.uTaa.value = taa ? 1 : 0;
    this._pass(this.finalMat, null);
  }
}

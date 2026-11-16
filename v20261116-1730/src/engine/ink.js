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
  // 日照与烟霭（随时辰而变，见 setTimeOfDay）
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
  // 投影
  tShadow: { value: null },
  uShadowMat: { value: new THREE.Matrix4() },
  uShadowOn: { value: 0 },
  uShadowPass: { value: 0 },
  // 倒影
  uReflPass: { value: 0 },
  uWaterY: { value: RV.WATER_Y },
  tRefl: { value: null },
  uReflMat: { value: new THREE.Matrix4() },
  uReflOn: { value: 0 },
  // 河道：到岸距离、流向、半宽（见 river.js）
  tRiver: { value: riverTexture() },
  uRiverRect: { value: new THREE.Vector4(RIVER_RECT.x0, RIVER_RECT.z0, RIVER_RECT.w, RIVER_RECT.h) },
};

// ───────────────────────── 时辰 ─────────────────────────
// sun 日头方向；sunCol 受光的色；shade 影里的色；其余依次是烟霭、天色、云色、纸色、光柱与辉光
export const TIMES = {
  morning: {
    label: '上午', sun: [0.78, 0.47, 0.42], sunCol: [1.13, 1.065, 0.95], shade: [0.57, 0.605, 0.72], fogD: 175, fogCol: [1.085, 1.06, 1.015],
    skyHor: [1.1, 1.065, 1.0], skyZen: [0.67, 0.825, 1.05], sunGlow: [0.07, 0.05, 0.02], cloudLit: [1.2, 1.185, 1.14], cloudShade: [0.78, 0.83, 0.93],
    paper: [1, 1, 1], ray: [0.14, 0.115, 0.07], bloom: 0.3,
  },
  noon: {
    label: '正午', sun: [0.3, 0.88, 0.36], sunCol: [1.1, 1.07, 1.0], shade: [0.6, 0.65, 0.76], fogD: 200, fogCol: [1.07, 1.07, 1.05],
    skyHor: [1.08, 1.075, 1.05], skyZen: [0.6, 0.79, 1.07], sunGlow: [0.03, 0.03, 0.02], cloudLit: [1.22, 1.21, 1.18], cloudShade: [0.8, 0.86, 0.95],
    paper: [1, 1, 1.01], ray: [0.05, 0.05, 0.04], bloom: 0.26,
  },
  dusk: {
    label: '黄昏', sun: [-0.9, 0.21, 0.38], sunCol: [1.22, 0.98, 0.7], shade: [0.5, 0.49, 0.67], fogD: 130, fogCol: [1.16, 0.96, 0.76],
    skyHor: [1.22, 0.93, 0.66], skyZen: [0.62, 0.66, 0.92], sunGlow: [0.28, 0.15, 0.04], cloudLit: [1.25, 1.0, 0.76], cloudShade: [0.62, 0.58, 0.74],
    paper: [1.0, 0.955, 0.88], ray: [0.32, 0.2, 0.09], bloom: 0.48,
  },
};
const post = { paper: new THREE.Vector3(1, 1, 1), ray: new THREE.Vector3(0.13, 0.11, 0.07), bloom: 0.3 };
export function setTimeOfDay(name) {
  const t = TIMES[name] || TIMES.morning;
  shared.uSun.value.set(...t.sun).normalize();
  shared.uSunCol.value.set(...t.sunCol);
  shared.uShadeTint.value.set(...t.shade);
  shared.uFogK.value = 1 / (t.fogD * t.fogD);
  shared.uFogCol.value.set(...t.fogCol);
  shared.uSkyHor.value.set(...t.skyHor);
  shared.uSkyZen.value.set(...t.skyZen);
  shared.uSunGlow.value.set(...t.sunGlow);
  shared.uCloudLit.value.set(...t.cloudLit);
  shared.uCloudShade.value.set(...t.cloudShade);
  post.paper.set(...t.paper);
  post.ray.set(...t.ray);
  post.bloom = t.bloom;
  return t;
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
varying vec3 vWorld;
varying vec3 vObj;
varying vec3 vNw;
varying vec3 vNv;
varying vec2 vUv;
varying vec3 vCol;
varying vec2 vInk;
varying float vZ;
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
  #ifdef WIND
  float ph = wp.x*0.37 + wp.z*0.29;
  float ww = aCol.a;
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
}
`;

// 天色（颜料值，1 = 纸色）：近地平一抹亮雾，向上罩淡彩；一轮日；云有向光与背光
const SKY_GLSL = /* glsl */ `
uniform vec3 uSkyHor;
uniform vec3 uSkyZen;
uniform vec3 uSunGlow;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
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
  col = mix(col, vec3(1.22, 1.2, 1.12), smoothstep(0.9976, 0.9989, sdn) * 0.92);
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
uniform float uShadowPass;
uniform float uReflPass;
uniform float uWaterY;
uniform vec3 uShadeTint;
uniform vec3 uSunCol;
uniform vec3 uFogCol;
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
const float PIG = 0.8;
// 烟霭：远处化入一层薄雾，高处淡些
vec3 applyFog(vec3 col){
  float fog = 1.0 - exp(-vZ*vZ*uFogK);
  fog *= mix(1.0, 0.55, smoothstep(3.0, 42.0, vWorld.y));
  return mix(col, uFogCol, fog);
}
// 投影（0 受光 … 1 全在影中）
float shadowAt(vec3 wp, vec3 n){
  if(uShadowOn < 0.5) return 0.0;
  float ndl = max(dot(n, uSun), 0.0);
  vec3 p = (uShadowMat * vec4(wp + n * (0.05 + 0.12*(1.0 - ndl)), 1.0)).xyz;
  if(p.x < 0.005 || p.x > 0.995 || p.y < 0.005 || p.y > 0.995 || p.z > 1.0) return 0.0;
  float rot = texture(tNoise, vObj.xz*0.71 + vObj.y*0.37).b * 6.2831;
  float s = 0.0;
  const float TX = 1.0 / ${SHADOW_SIZE}.0;
  for(int i = 0; i < 8; i++){
    float a = float(i)*2.39996 + rot;
    float r = sqrt((float(i) + 0.5) / 8.0) * 2.8 * TX;
    float d = texture(tShadow, p.xy + vec2(cos(a), sin(a)) * r).r;
    s += step(d + 0.0003, p.z);
  }
  vec2 e = smoothstep(vec2(0.0), vec2(0.07), min(p.xy, 1.0 - p.xy));
  return s * 0.125 * e.x * e.y;
}
// 光影：受光处带日色；影里也分上下——朝天的面得天光，偏冷偏亮；朝地的面得地面返照，偏暖偏暗
vec3 lightWash(vec3 col, vec3 n, float amount){
  float ndl = dot(n, uSun);
  float lit = smoothstep(-0.1, 0.35, ndl) * (1.0 - shadowAt(vWorld, n));
  // 明暗交界不取齐整的一线：用世界空间的噪声揉碎，像一笔淡墨扫出来的影
  float nz = texture(tNoise, vObj.xz*0.21 + vObj.y*0.13).g;
  lit = smoothstep(0.2, 0.8, lit + (nz - 0.5) * 0.34 * (1.0 - abs(lit*2.0 - 1.0)));
  vec3 amb = uShadeTint * mix(vec3(0.9, 0.86, 0.8), vec3(1.07, 1.08, 1.1), n.y*0.5 + 0.5);
  col *= mix(mix(vec3(1.0), amb, amount), mix(vec3(1.0), uSunCol, amount), lit);
  // 受光面随朝向略分深浅，显出体积
  col *= 1.0 - 0.13 * amount * lit * (1.0 - clamp(ndl, 0.0, 1.0));
  return col;
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
  #ifndef NO_FOG
  vec3 nl = n;
  #ifdef BUMP
  float hgt = dot(tex.rgb, vec3(0.3333)) * uBump;
  #ifdef TILE
  // 瓦垄：一垄一垄隆起，垄间成沟
  hgt += cos(vUv.x * 50.2655) * 0.03;
  #endif
  nl = perturb(vWorld, n, hgt);
  #endif
  col = lightWash(col, nl, uShade);
  #ifdef WEATHER
  if(an.y < 0.5){
    // 檐下淌的雨痕、墙根溅的泥
    float st = texture(tNoise, vec2(wuv.x*0.33, wuv.y*0.035)).r;
    float st2 = texture(tNoise, vec2(wuv.x*1.1 + 0.4, wuv.y*0.09)).g;
    col *= 1.0 - 0.17 * smoothstep(0.5, 0.78, st*0.65 + st2*0.35);
    col *= 1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.95, vWorld.y)) * (0.5 + st2);
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
  gColor = vec4(clamp(col * PIG, 0.0, 1.0), 1.0);
  #ifdef FLAT_N
  gNormal = vec4(0.5, 0.5, vInk.y, vInk.x);
  #else
  float lw = vInk.y;
  #ifdef INKFADE
  // 细碎的东西远了不勾线
  lw *= 1.0 - smoothstep(uInkD.x, uInkD.y, vZ);
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
  vec4 sp = texture(tSplat, (p - uRect.xy) / uRect.zw);
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
  col *= mix(vec3(1.0), det, 0.95);
  float bank = 1.0 - smoothstep(0.0, 4.5, sd);
  col *= 1.0 - 0.24 * bank * (0.5 + nz2);
  vec3 nl = perturb(vWorld, vec3(0.0, 1.0, 0.0), hgt * (1.0 - smoothstep(20.0, 60.0, vZ)));
  col = lightWash(col, nl, 1.0);
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
    vec2 ruv = rp.xy / rp.w + g * (0.02 + 0.5 / (vZ + 12.0));
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
  line *= smoothstep(0.42, 0.66, texture(tNoise, vec2(sf*0.019 + 0.7, st.y*0.055 + 0.2)).r) * (1.0 - smoothstep(25.0, 140.0, vZ));
  col = mix(col, col * vec3(0.5, 0.56, 0.6), line * 0.4);
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
  uReflPass: shared.uReflPass,
  uWaterY: shared.uWaterY,
  uShadeTint: shared.uShadeTint,
});
const skyUniforms = () => ({
  uSkyHor: shared.uSkyHor,
  uSkyZen: shared.uSkyZen,
  uSunGlow: shared.uSunGlow,
  uCloudLit: shared.uCloudLit,
  uCloudShade: shared.uCloudShade,
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
  return m;
}

function specialMat(fs, uniforms) {
  return new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms: { ...common(), tRiver: shared.tRiver, uRiverRect: shared.uRiverRect, ...uniforms }, vertexShader: VS, fragmentShader: fs });
}
export const groundMat = (splat, detail, rect) =>
  specialMat(FS_GROUND, { tSplat: { value: splat }, tDetail: { value: detail }, uRect: { value: new THREE.Vector4(...rect) } });
export const waterMat = () => specialMat(FS_WATER, { ...skyUniforms(), tRefl: shared.tRefl, uReflMat: shared.uReflMat, uReflOn: shared.uReflOn });

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
  ink *= 0.5 + 0.7*pp.r;
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
    float rot = fract(sin(dot(frag, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
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
  vec3 c0 = texture2D(tA, vUv).rgb;
  vec3 col = c0;
  if(uDof.y > 0.01){
    float z0 = zOf(texture2D(tDepth, vUv).x);
    float coc0 = cocOf(z0), R = coc0;
    // 逐像素把取样的圆盘转一个角度：用交错梯度噪声，颗粒比白噪声匀净
    float rot = fract(52.9829189 * fract(dot(floor(frag), vec2(0.06711056, 0.00583715)))) * 6.2831;
    // 近处虚掉的东西要漫到后面清楚的景上：先探一圈，看附近有没有更近、更虚的
    if(uNearK > 0.0){
      float probe = uDof.y * uNearK * sc * 0.7;
      for(int i = 0; i < 6; i++){
        float a = float(i) * 1.0472 + rot;
        float zs = zOf(texture2D(tDepth, vUv + vec2(cos(a), sin(a)) * probe * px).x);
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
        float zs = zOf(texture2D(tDepth, uv).x);
        // 比这里近的：它自己虚到这么远才漫得过来；不比这里近的：这里自己得虚到这么远才取它
        float w = zs < z0 * 0.98 ? clamp(cocOf(zs) - rr + 1.0, 0.0, 1.0) : clamp(coc0 - rr + 1.0, 0.0, 1.0);
        acc += texture2D(tA, uv).rgb * w;
        wsum += w;
      }
      col = acc / wsum;
    }
  }
  gl_FragColor = vec4(onPaper(col / 0.8, vUv, pc, pp), 1.0);
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
  // 滤色叠加：亮处不过曝，暗处被邻近的亮光晕开
  col += texture2D(tBloom, vUv).rgb * uBloom * (1.0 - col);
  col += uRayCol * texture2D(tRays, vUv).r * (1.0 - col * 0.6);
  gl_FragColor = vec4(col, 1.0);
}
`;

const _m = new THREE.Matrix4(), _bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
const _t = new THREE.Vector3(), _up = new THREE.Vector3(), _d = new THREE.Vector3(), _v4 = new THREE.Vector4();

export class InkRenderer {
  // shadows 日照投影；ssr 屏幕空间倒影（没有倒影图时用）；ao 烘染；reflect 水面倒影图；fx 光柱、辉光与抗锯齿
  constructor(canvas, textures, { shadows = true, ssr = true, ao = true, reflect = true, fx = true } = {}) {
    THREE.ColorManagement.enabled = false;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }));
    r.outputColorSpace = THREE.LinearSRGBColorSpace;
    r.autoClear = false;
    // 至少按 1.5 倍像素来画，再由浏览器缩回去：墨线是贴着像素格子走的，格子细了，线随镜头移动时一跳才半个像素，也不那么硬
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
    });
    // 景深：focus 焦点距离（米）；aper 最大弥散半径（1080 线下的像素，0 即关）；tol / nearTol 远、近景开始虚的门槛；nearK 近景虚化的倍数
    this.dof = { focus: 9, aper: 3.2, tol: 0.6, nearTol: 3.2, nearK: 1.2 };
    const pu = this.postMat.uniforms;
    this.dofMat = mat(DOF_FS, {
      tA: { value: this.rtA.texture }, tDepth: { value: depthTexture }, ...paperU,
      uRes: pu.uRes, uNear: pu.uNear, uFar: pu.uFar, uDof: { value: new THREE.Vector4(9, 0, 0.6, 3.2) }, uNearK: { value: 1 },
    });
    this.raysMat = mat(RAYS_FS, { tA: { value: this.rtB.texture }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 } });
    this.brightMat = mat(BRIGHT_FS, { tA: { value: this.rtB.texture }, uPx: { value: new THREE.Vector2() } });
    this.blurMat = mat(BLUR_FS, { tA: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.finalMat = mat(FINAL_FS, {
      tA: { value: this.rtB.texture }, tBloom: { value: this.rtQ1.texture }, tRays: { value: this.rtRays.texture },
      uPx: { value: new THREE.Vector2() }, uRayCol: { value: new THREE.Vector3() }, uBloom: { value: 0.3 },
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
    const cam = this.shadowCam, R = this.shadowRange, sun = shared.uSun.value;
    cam.left = -R; cam.right = R; cam.top = R; cam.bottom = -R;
    cam.updateProjectionMatrix();
    // 贴齐纹素网格，行走时影子不闪
    cam.position.set(0, 0, 0);
    cam.lookAt(-sun.x, -sun.y, -sun.z);
    cam.updateMatrixWorld();
    _m.copy(cam.matrixWorld).invert();
    _t.copy(this.shadowCenter).applyMatrix4(_m);
    const tx = (2 * R) / SHADOW_SIZE;
    _t.x = Math.round(_t.x / tx) * tx;
    _t.y = Math.round(_t.y / tx) * tx;
    _t.applyMatrix4(cam.matrixWorld);
    cam.position.copy(_t).addScaledVector(sun, 200);
    cam.updateMatrixWorld();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const r = this.renderer;
    shared.tShadow.value = null;
    shared.uShadowPass.value = 1;
    r.setRenderTarget(this.shadowRT);
    r.clear(true, true, false);
    r.render(scene, cam);
    shared.uShadowPass.value = 0;
    shared.tShadow.value = this.shadowRT.depthTexture;
    shared.uShadowMat.value.multiplyMatrices(_bias, _m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
    shared.uShadowOn.value = 1;
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
  render(scene, camera) {
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
    r.render(scene, camera);
    u.uOpaque.value = this.fx ? 0 : 1;
    u.uRaw.value = this.fx ? 1 : 0;
    if (!this.fx) return this._pass(this.postMat, null);
    this._pass(this.postMat, this.rtA);
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
    this._pass(this.finalMat, null);
  }
}

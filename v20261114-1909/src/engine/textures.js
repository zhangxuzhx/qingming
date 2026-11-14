// 程序化“手绘”贴图：所有颜色都按“白纸上的颜料”来画（白 = 留白），
// 后期合成时再整体乘上绢本底色。
import * as THREE from 'three';
import { RNG } from '../util.js';

export const FONT_KAI = '"STKaiti","KaiTi","楷体","Kaiti SC","FangSong","仿宋",serif';
export const FONT_XING = '"STXingkai","华文行楷","STKaiti","KaiTi","楷体",serif';
export const FONT_LI = '"STLiti","LiSu","隶书","STKaiti","KaiTi","楷体",serif';

export function mkCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTex(c, { repeat = true, mip = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = mip;
  t.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = aniso;
  return t;
}

// ───────────────────────── 基础笔触 ─────────────────────────
function wash(ctx, S, base, rng, { blots = 36, amp = 0.08, minR = 0.1, maxR = 0.4, dark = '70,50,30', light = '255,252,240' } = {}) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < blots; i++) {
    const x = rng.f(S), y = rng.f(S), r = rng.f(minR, maxR) * S;
    const c = rng.chance(0.5) ? dark : light;
    const a = rng.f(amp * 0.3, amp);
    for (const ox of [-S, 0, S])
      for (const oy of [-S, 0, S]) {
        const cx = x + ox, cy = y + oy;
        if (cx + r < 0 || cx - r > S || cy + r < 0 || cy - r > S) continue;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, `rgba(${c},${a})`);
        g.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, 2 * r, 2 * r);
      }
  }
}

function speckle(ctx, S, rng, n, alpha, rgb = '50,38,25') {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${rgb},${rng.f(alpha * 0.3, alpha)})`;
    const s = rng.f(0.6, 1.9);
    ctx.fillRect(rng.f(S), rng.f(S), s, s);
  }
}

// 一笔：带粗细与浓淡变化的折线
function brush(ctx, x0, y0, x1, y1, w, rgb, a, rng, wob = 1) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(2, Math.ceil(len / 7));
  let px = x0, py = y0;
  ctx.lineCap = 'round';
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const e = i === n ? 0 : 1;
    const x = x0 + (x1 - x0) * t + rng.f(-wob, wob) * e;
    const y = y0 + (y1 - y0) * t + rng.f(-wob, wob) * e;
    ctx.strokeStyle = `rgba(${rgb},${a * rng.f(0.55, 1)})`;
    ctx.lineWidth = w * rng.f(0.6, 1.25);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(x, y);
    ctx.stroke();
    px = x;
    py = y;
  }
}

// 跨边界时在平铺偏移处重复绘制，保证四方连续
function wrapDraw(S, fn) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
}

// ───────────────────────── 噪声 / 纸 ─────────────────────────
function periodicNoise(S, cells, rng) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = rng.r();
  const out = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const fy0 = (y / S) * cells;
    const yi = Math.floor(fy0), fy = fy0 - yi;
    const sy = fy * fy * (3 - 2 * fy);
    const y0 = (yi % cells) * cells, y1 = ((yi + 1) % cells) * cells;
    for (let x = 0; x < S; x++) {
      const fx0 = (x / S) * cells;
      const xi = Math.floor(fx0), fx = fx0 - xi;
      const sx = fx * fx * (3 - 2 * fx);
      const x0 = xi % cells, x1 = (xi + 1) % cells;
      const a = g[y0 + x0], b = g[y0 + x1], c = g[y1 + x0], d = g[y1 + x1];
      out[y * S + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

export function noiseTexture() {
  const S = 256, rng = new RNG(11);
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  const o = [periodicNoise(S, 4, rng), periodicNoise(S, 9, rng), periodicNoise(S, 21, rng), periodicNoise(S, 55, rng)];
  const o2 = [periodicNoise(S, 5, rng), periodicNoise(S, 13, rng), periodicNoise(S, 34, rng)];
  for (let i = 0; i < S * S; i++) {
    const v = o[0][i] * 0.48 + o[1][i] * 0.27 + o[2][i] * 0.16 + o[3][i] * 0.09;
    const w = o2[0][i] * 0.55 + o2[1][i] * 0.3 + o2[2][i] * 0.15;
    d[i * 4] = Math.round(v * 255);
    d[i * 4 + 1] = Math.round(w * 255);
    d[i * 4 + 2] = Math.round(o[3][i] * 255);
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { aniso: 4 });
}

// R：纸纹颗粒；G/B：两路低频噪声（用于线条抖动与笔压）
export function paperTexture() {
  const S = 1024, rng = new RNG(7);
  const c = mkCanvas(S), ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S), d = img.data;
  const n1 = periodicNoise(S, 5, rng), n2 = periodicNoise(S, 14, rng), n3 = periodicNoise(S, 46, rng), n4 = periodicNoise(S, 170, rng);
  const g1 = periodicNoise(S, 9, rng), g2 = periodicNoise(S, 27, rng);
  const b1 = periodicNoise(S, 7, rng), b2 = periodicNoise(S, 22, rng);
  const R = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const large = n1[i] * 0.5 + n2[i] * 0.3 + n3[i] * 0.2;
      // 绢丝经纬
      const weave = Math.sin((x * Math.PI * 2) / 3.2) * 0.5 + Math.sin((y * Math.PI * 2) / 2.56) * 0.5;
      R[i] = 0.5 + (large - 0.5) * 0.62 + (n4[i] - 0.5) * 0.3 + weave * 0.05 + (rng.r() - 0.5) * 0.1;
    }
  // 纸筋纤维
  for (let k = 0; k < 900; k++) {
    let x = rng.f(S), y = rng.f(S);
    const ang = rng.f(Math.PI * 2), len = rng.f(8, 46), dv = rng.chance(0.6) ? -rng.f(0.05, 0.14) : rng.f(0.04, 0.1);
    let a = ang;
    for (let s = 0; s < len; s++) {
      const xi = ((Math.round(x) % S) + S) % S, yi = ((Math.round(y) % S) + S) % S;
      R[yi * S + xi] += dv;
      a += rng.f(-0.25, 0.25);
      x += Math.cos(a);
      y += Math.sin(a);
    }
  }
  for (let i = 0; i < S * S; i++) {
    d[i * 4] = Math.max(0, Math.min(255, Math.round(R[i] * 255)));
    d[i * 4 + 1] = Math.round((g1[i] * 0.65 + g2[i] * 0.35) * 255);
    d[i * 4 + 2] = Math.round((b1[i] * 0.65 + b2[i] * 0.35) * 255);
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { mip: false, aniso: 1 });
}

// ───────────────────────── 建筑 / 地表材质 ─────────────────────────
function texTile() {
  const S = 256, rng = new RNG(21), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#6d7982', rng, { amp: 0.13, dark: '24,30,38' });
  for (let i = 0; i < 8; i++) {
    const x = 16 + i * 32;
    const g = ctx.createLinearGradient(x - 9, 0, x + 9, 0);
    g.addColorStop(0, 'rgba(40,46,52,0)');
    g.addColorStop(0.5, 'rgba(40,46,52,0.22)');
    g.addColorStop(1, 'rgba(40,46,52,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 9, 0, 18, S);
    brush(ctx, x, 0, x, S, 2.6, '38,40,44', 0.9, rng, 0.7);
    // 瓦垄之间的高光
    ctx.fillStyle = 'rgba(255,255,250,0.13)';
    ctx.fillRect(x + 12, 0, 6, S);
    brush(ctx, x + 16, 0, x + 16, S, 1.1, '38,40,44', 0.42, rng, 0.6);
  }
  for (let i = 0; i < 8; i++)
    for (let j = 0; j < 6; j++) {
      const x = i * 32, y = j * (S / 6) + (i % 2 ? 12 : 30);
      ctx.strokeStyle = `rgba(36,40,44,${rng.f(0.34, 0.6)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 3, y);
      ctx.quadraticCurveTo(x + 16, y + 7, x + 29, y);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(36,40,44,0.1)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 5, y + 4);
      ctx.quadraticCurveTo(x + 16, y + 10, x + 27, y + 4);
      ctx.stroke();
    }
  speckle(ctx, S, rng, 500, 0.16);
  return toTex(c);
}

function texThatch() {
  const S = 256, rng = new RNG(22), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#d3c8a8', rng, { amp: 0.12, dark: '100,80,40' });
  for (let i = 0; i < 620; i++) {
    const x = rng.f(S), y = rng.f(S), len = rng.f(12, 44), sl = rng.f(-4, 4);
    const lightS = rng.chance(0.25);
    const rgb = lightS ? '255,246,210' : rng.chance(0.3) ? '70,52,26' : '120,92,48';
    const a = lightS ? rng.f(0.2, 0.45) : rng.f(0.2, 0.6);
    wrapDraw(S, (ox, oy) => {
      if (y + oy > S + 2 || y + oy + len < -2 || x + ox < -8 || x + ox > S + 8) return;
      ctx.strokeStyle = `rgba(${rgb},${a})`;
      ctx.lineWidth = rng.f(0.8, 1.8);
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.lineTo(x + ox + sl, y + oy + len);
      ctx.stroke();
    });
  }
  return toTex(c);
}

function texPlaster() {
  const S = 256, rng = new RNG(23), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#f3eee0', rng, { amp: 0.05, blots: 30 });
  for (let i = 0; i < 26; i++) {
    const x = rng.f(S), y = rng.f(S);
    brush(ctx, x, y, x + rng.f(-14, 14), y + rng.f(8, 30), 1, '120,100,80', 0.1, rng, 1.2);
  }
  speckle(ctx, S, rng, 260, 0.1);
  return toTex(c);
}

function texEarthWall() {
  const S = 256, rng = new RNG(24), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#eae1cc', rng, { amp: 0.1, dark: '120,90,40' });
  for (let j = 0; j < 8; j++) {
    const y = j * 32 + 10;
    brush(ctx, 0, y, S, y, 1.4, '110,85,50', 0.3, rng, 1.5);
  }
  for (let i = 0; i < 80; i++) {
    const x = rng.f(S), y = rng.f(S);
    brush(ctx, x, y, x + rng.f(-3, 3), y + rng.f(5, 16), 1, '110,85,50', 0.22, rng, 0.8);
  }
  speckle(ctx, S, rng, 700, 0.2);
  return toTex(c);
}

function texWood(seed, base) {
  const S = 256, rng = new RNG(seed), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, base, rng, { amp: 0.1, dark: '70,40,20' });
  for (let i = 0; i < 44; i++) {
    const x = rng.f(S);
    wrapDraw(S, (ox) => {
      if (x + ox < -6 || x + ox > S + 6) return;
    });
    brush(ctx, x, 0, x, S, rng.f(0.8, 1.7), '80,52,30', rng.f(0.12, 0.34), rng, 0.9);
  }
  speckle(ctx, S, rng, 300, 0.14);
  return toTex(c);
}

function texPlank() {
  const S = 256, rng = new RNG(26), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#bba68e', rng, { amp: 0.11, dark: '70,45,25' });
  for (let i = 0; i < 46; i++) {
    const y = rng.f(S);
    brush(ctx, 0, y, S, y, rng.f(0.7, 1.4), '80,52,30', rng.f(0.1, 0.26), rng, 0.8);
  }
  for (let j = 0; j < 8; j++) {
    const y = j * 32 + 16;
    brush(ctx, 0, y, S, y, 2.2, '52,34,22', 0.8, rng, 0.6);
    const off = j % 2 ? 0 : 64;
    for (let k = 0; k < 2; k++) {
      const x = off + k * 128 + 20;
      brush(ctx, x, y - 32, x, y, 1.5, '52,34,22', 0.55, rng, 0.5);
      ctx.fillStyle = 'rgba(40,26,18,0.7)';
      ctx.fillRect(x - 6, y - 18, 2.4, 2.4);
      ctx.fillRect(x + 4, y - 18, 2.4, 2.4);
    }
  }
  return toTex(c);
}

function texLattice() {
  const S = 128, rng = new RNG(27), c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#5e5852';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 8; i++) {
    const x = i * 16 + 4;
    ctx.fillStyle = '#cdbda3';
    ctx.fillRect(x, 0, 8, S);
    ctx.fillStyle = 'rgba(40,28,18,0.75)';
    ctx.fillRect(x - 0.6, 0, 1.4, S);
    ctx.fillRect(x + 7.4, 0, 1.4, S);
  }
  ctx.fillStyle = '#c0af94';
  ctx.fillRect(0, 0, S, 9);
  ctx.fillRect(0, 60, S, 7);
  ctx.fillStyle = 'rgba(40,28,18,0.8)';
  for (const y of [9, 60, 67]) ctx.fillRect(0, y - 0.7, S, 1.5);
  ctx.fillRect(0, 0, S, 1.2);
  speckle(ctx, S, rng, 120, 0.15);
  return toTex(c);
}

function texBrick() {
  const S = 256, rng = new RNG(28), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#bfc0bf', rng, { amp: 0.1, dark: '50,55,60' });
  const rows = 12, rh = S / rows;
  for (let j = 0; j < rows; j++) {
    const y = j * rh;
    brush(ctx, 0, y, S, y, 1.3, '50,48,46', 0.5, rng, 0.5);
    const off = j % 2 ? 32 : 0;
    for (let i = 0; i < 4; i++) {
      const x = off + i * 64;
      brush(ctx, x, y, x, y + rh, 1.2, '50,48,46', 0.42, rng, 0.4);
      if (rng.chance(0.2)) {
        ctx.fillStyle = `rgba(60,60,64,${rng.f(0.05, 0.14)})`;
        ctx.fillRect(x, y, 64, rh);
      }
    }
  }
  speckle(ctx, S, rng, 400, 0.14);
  return toTex(c);
}

function texStone() {
  const S = 256, rng = new RNG(29), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#dcdad4', rng, { amp: 0.08, dark: '70,70,70' });
  for (let j = 0; j < 4; j++) {
    const y = j * 64;
    brush(ctx, 0, y, S, y, 1.5, '60,55,50', 0.5, rng, 0.9);
    let x = (j % 2) * 40;
    while (x < S) {
      brush(ctx, x, y, x + rng.f(-3, 3), y + 64, 1.3, '60,55,50', 0.42, rng, 0.8);
      x += rng.f(60, 110);
    }
  }
  for (let i = 0; i < 60; i++) {
    const x = rng.f(S), y = rng.f(S);
    brush(ctx, x, y, x + rng.f(6, 14), y + rng.f(3, 8), 1, '80,75,70', 0.2, rng, 0.6);
  }
  speckle(ctx, S, rng, 500, 0.16);
  return toTex(c);
}

function texMat() {
  const S = 256, rng = new RNG(30), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#e2d6b2', rng, { amp: 0.09, dark: '110,80,30' });
  ctx.lineWidth = 1.2;
  for (let k = -S; k < S * 2; k += 16) {
    ctx.strokeStyle = `rgba(95,70,32,${rng.f(0.22, 0.42)})`;
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + S, S);
    ctx.stroke();
    ctx.strokeStyle = `rgba(95,70,32,${rng.f(0.18, 0.36)})`;
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k - S, S);
    ctx.stroke();
  }
  speckle(ctx, S, rng, 300, 0.14);
  return toTex(c);
}

function texBank() {
  const S = 256, rng = new RNG(31), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#cdc6b2', rng, { amp: 0.12, dark: '80,65,40' });
  for (let i = 0; i < 260; i++) {
    const x = rng.f(S), y = rng.f(S), l = rng.f(8, 28);
    brush(ctx, x, y, x + l * 0.5, y + l, rng.f(0.8, 1.8), '75,60,40', rng.f(0.15, 0.4), rng, 1);
  }
  speckle(ctx, S, rng, 600, 0.25);
  return toTex(c);
}

function texGroundDetail() {
  const S = 512, rng = new RNG(32), c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 150; i++) {
    const x = rng.f(S), y = rng.f(S), l = rng.f(16, 70);
    brush(ctx, x, y, x + l, y + rng.f(-4, 4), rng.f(0.8, 2.2), '120,98,66', rng.f(0.05, 0.15), rng, 1);
  }
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(90,72,48,${rng.f(0.1, 0.32)})`;
    ctx.beginPath();
    ctx.ellipse(rng.f(S), rng.f(S), rng.f(0.7, 2.2), rng.f(0.6, 1.6), rng.f(3), 0, 7);
    ctx.fill();
  }
  for (let i = 0; i < 46; i++) {
    const x = rng.f(S), y = rng.f(S);
    for (let k = 0; k < 3; k++) brush(ctx, x, y, x + rng.f(-5, 5), y - rng.f(4, 9), 1, '86,104,62', 0.32, rng, 0.4);
  }
  return toTex(c);
}

function texBark() {
  const S = 256, rng = new RNG(33), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#8a8078', rng, { amp: 0.2, dark: '30,22,16' });
  for (let i = 0; i < 90; i++) {
    const x = rng.f(S), y = rng.f(S), l = rng.f(20, 90);
    const lightS = rng.chance(0.3);
    brush(ctx, x, y, x + rng.f(-5, 5), y + l, rng.f(1, 3), lightS ? '215,200,165' : '36,26,18', lightS ? 0.22 : rng.f(0.3, 0.65), rng, 1.6);
  }
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = 'rgba(30,22,14,0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(rng.f(S), rng.f(S), rng.f(4, 9), rng.f(6, 13), 0, 0, 7);
    ctx.stroke();
  }
  return toTex(c);
}

// 檐底：一根根椽子，u 向排列
function texRafter() {
  const S = 256, rng = new RNG(35), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#8f8376', rng, { amp: 0.1, dark: '40,30,20' });
  for (let i = 0; i < 8; i++) {
    const x = i * 32 + 6;
    ctx.fillStyle = '#c9b89f';
    ctx.fillRect(x, 0, 20, S);
    ctx.fillStyle = 'rgba(255,250,235,0.18)';
    ctx.fillRect(x + 3, 0, 5, S);
    brush(ctx, x, 0, x, S, 1.4, '40,30,22', 0.75, rng, 0.4);
    brush(ctx, x + 20, 0, x + 20, S, 1.4, '40,30,22', 0.75, rng, 0.4);
  }
  for (let j = 0; j < 3; j++) brush(ctx, 0, 40 + j * 86, S, 40 + j * 86, 1.2, '60,46,34', 0.3, rng, 0.8);
  return toTex(c);
}
// 檐口：封檐板上一排瓦当与滴水
function texEave() {
  const W = 256, H = 64, rng = new RNG(36), c = mkCanvas(W, H), ctx = c.getContext('2d');
  ctx.fillStyle = '#7d766c';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#a9998a';
  ctx.fillRect(0, 0, W, 20);
  brush(ctx, 0, 20, W, 20, 1.6, '36,28,22', 0.8, rng, 0.4);
  for (let i = 0; i < 8; i++) {
    const x = 16 + i * 32;
    ctx.fillStyle = '#727e87';
    ctx.beginPath();
    ctx.arc(x, 34, 10, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,34,0.9)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, 34, 4.5, 0, 7);
    ctx.lineWidth = 1.1;
    ctx.stroke();
    ctx.fillStyle = '#69757e';
    ctx.beginPath();
    ctx.moveTo(x + 9, 30);
    ctx.lineTo(x + 23, 30);
    ctx.lineTo(x + 16, 54);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }
  return toTex(c);
}

function texCloth() {
  const S = 128, rng = new RNG(34), c = mkCanvas(S), ctx = c.getContext('2d');
  wash(ctx, S, '#f1ecdf', rng, { amp: 0.06, blots: 20 });
  for (let i = 0; i < S; i += 4) {
    ctx.fillStyle = 'rgba(120,105,85,0.05)';
    ctx.fillRect(i, 0, 1, S);
    ctx.fillRect(0, i, S, 1);
  }
  return toTex(c);
}

// 衣纹：白描的“钉头鼠尾”——起笔一顿，行笔渐细。u 向四方连续，v=1 为束腰/肩头，v=0 为下摆
function texRobe() {
  const S = 512, rng = new RNG(52), c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 26; i++) {
    const x = rng.f(S), y = rng.f(S), r = rng.f(40, 120);
    for (const ox of [-S, 0, S]) {
      const g = ctx.createRadialGradient(x + ox, y, 0, x + ox, y, r);
      g.addColorStop(0, `rgba(96,80,62,${rng.f(0.02, 0.05)})`);
      g.addColorStop(1, 'rgba(96,80,62,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y - r, r * 2, r * 2);
    }
  }
  ctx.lineCap = 'round';
  const fold = (x0, y0, len, bend, w, a) => {
    const n = Math.max(4, Math.ceil(Math.abs(len) / 7));
    for (const ox of [-S, 0, S]) {
      // 衣褶旁一抹淡墨
      const g = ctx.createLinearGradient(x0 + ox - 16, 0, x0 + ox + 16, 0);
      g.addColorStop(0, 'rgba(90,76,60,0)');
      g.addColorStop(0.5, `rgba(90,76,60,${a * 0.1})`);
      g.addColorStop(1, 'rgba(90,76,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0 + ox - 16, Math.min(y0, y0 + len), 32, Math.abs(len) * 0.8);
      let px = x0 + ox, py = y0;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        const x = x0 + ox + bend * t * t + Math.sin(t * 5 + x0) * 1.6, y = y0 + len * t;
        ctx.strokeStyle = `rgba(52,42,34,${a * (1 - t * 0.55)})`;
        ctx.lineWidth = i === 1 ? w * 2.1 : w * (1.12 - t * 0.95);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
        px = x;
        py = y;
      }
    }
  };
  // 顶上留一条白边：皮肉、冠巾等不画衣纹的部件都取这里的颜色
  for (let i = 0; i < 9; i++) fold(((i + rng.f(0.2, 0.8)) / 9) * S, rng.f(12, 34), rng.f(0.34, 0.9) * S, rng.f(-34, 34), rng.f(2.3, 3.3), rng.f(0.5, 0.82));
  for (let i = 0; i < 5; i++) fold(rng.f(S), rng.f(0.3, 0.55) * S, rng.f(0.14, 0.3) * S, rng.f(-18, 18), rng.f(1.8, 2.5), rng.f(0.35, 0.6));
  for (let i = 0; i < 6; i++) fold(((i + rng.f(0.1, 0.9)) / 6) * S, S * 0.965, -rng.f(0.08, 0.2) * S, rng.f(-14, 14), rng.f(1.8, 2.6), rng.f(0.4, 0.65));
  // 下摆一线
  ctx.strokeStyle = 'rgba(52,42,34,0.62)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = -8; x <= S + 8; x += 8) ctx.lineTo(x, S * 0.972 + Math.sin((x / S) * Math.PI * 6) * 2.2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, S, 9);
  const t = toTex(c);
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ───────────────────────── 草木（带透明通道） ─────────────────────────
// 一条柳丝：细梗两侧互生的披针小叶，新柳的嫩绿里带一点鹅黄
function texWillow() {
  const W = 128, H = 512, rng = new RNG(41), c = mkCanvas(W, H), ctx = c.getContext('2d');
  const greens = ['#8eac5c', '#7c9c50', '#a0ba68', '#6c8c46', '#b2c476', '#5e7c40'];
  ctx.lineCap = 'round';
  const strand = (x0, y0, len, sway, scale) => {
    const ph = rng.f(6);
    const pt = (t) => [x0 + sway * t * t + Math.sin(t * 6 + ph) * 3.5 * scale, y0 + len * t];
    ctx.strokeStyle = 'rgba(86,94,50,0.95)';
    ctx.lineWidth = 2.2 * scale;
    ctx.beginPath();
    for (let k = 0; k <= 30; k++) {
      const [x, y] = pt(k / 30);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const n = Math.round(len / 10);
    for (let k = 0; k < n; k++) {
      const t = (k + rng.f(0.2, 0.8)) / n, [x, y] = pt(t), side = k % 2 ? 1 : -1;
      const l = rng.f(22, 32) * scale * (1 - t * 0.35), w = rng.f(4.2, 6) * scale, a = side * rng.f(0.38, 0.7);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-a);
      ctx.fillStyle = rng.pick(greens);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(w, l * 0.4, 0, l);
      ctx.quadraticCurveTo(-w, l * 0.4, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(78,98,54,0.55)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.lineTo(0, l - 2);
      ctx.stroke();
      ctx.restore();
    }
  };
  strand(W * 0.5, 0, H * 0.985, rng.f(-10, 10), 1);
  strand(W * 0.24, 0, H * 0.74, rng.f(-6, 4), 0.82);
  strand(W * 0.76, 0, H * 0.86, rng.f(-4, 6), 0.86);
  strand(W * 0.38, 0, H * 0.56, rng.f(-6, 6), 0.74);
  strand(W * 0.64, 0, H * 0.66, rng.f(-6, 6), 0.78);
  return toTex(c, { repeat: false, aniso: 4 });
}

// 一片叶：两头尖的小笔触
function leafDab(ctx, x, y, l, w, a, fill, ink) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, -l / 2);
  ctx.quadraticCurveTo(w, 0, 0, l / 2);
  ctx.quadraticCurveTo(-w, 0, 0, -l / 2);
  ctx.fill();
  if (ink) {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -l / 2 + 2);
    ctx.lineTo(0, l / 2 - 2);
    ctx.stroke();
  }
  ctx.restore();
}

// 叶簇：几团疏密不一的叶。先铺深色，再叠中间色，末了在朝上的一侧点亮色——每一团自带明暗，
// 团与团之间留出透空，许多片交叠起来才像树冠而不是一个球
function texFoliage(seed, pal, o = {}) {
  const S = 512, rng = new RNG(seed), c = mkCanvas(S), ctx = c.getContext('2d');
  const { groups = 7, leafL = 30, leafW = 10, twigs = false, ink = '40,52,34', round = false } = o;
  const G = [[S * 0.5, S * 0.52, S * 0.2]];
  for (let i = 0; i < groups; i++) {
    const a = (i / groups) * Math.PI * 2 + rng.f(0.6), d = rng.f(0.21, 0.33) * S;
    G.push([S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d * 0.9, rng.f(0.1, 0.16) * S]);
  }
  if (twigs) {
    ctx.lineCap = 'round';
    for (const [gx, gy] of G.slice(1)) {
      ctx.strokeStyle = 'rgba(58,44,34,1)';
      ctx.lineWidth = rng.f(3.5, 6);
      ctx.beginPath();
      ctx.moveTo(S / 2 + rng.f(-20, 20), S * 0.62);
      ctx.quadraticCurveTo((S / 2 + gx) / 2 + rng.f(-30, 30), (S * 0.62 + gy) / 2 + rng.f(-30, 30), gx, gy);
      ctx.stroke();
    }
  }
  const layer = (cols, n, off, spread, lmul, inkP) => {
    for (const [gx, gy, gr] of G) {
      const m = Math.round(n * (gr / (S * 0.15)) ** 2);
      for (let k = 0; k < m; k++) {
        const a = rng.f(Math.PI * 2), r = Math.sqrt(rng.r()) * gr * spread;
        const x = gx + Math.cos(a) * r, y = gy + Math.sin(a) * r * 0.86 + off * gr;
        // 叶尖朝外、略往下垂
        const dir = Math.atan2(Math.sin(a) * 0.86 + 0.4, Math.cos(a)) - Math.PI / 2 + rng.f(-0.7, 0.7);
        const l = leafL * lmul * rng.f(0.75, 1.2);
        leafDab(ctx, x, y, l, round ? l * 0.5 : leafW * rng.f(0.8, 1.2), dir, rng.pick(cols), rng.chance(inkP) ? 'rgba(' + ink + ',0.55)' : null);
      }
    }
  };
  layer(pal.dark, 46, 0.1, 1.0, 1, 0.3);
  layer(pal.mid, 40, -0.05, 0.9, 1, 0.3);
  layer(pal.light, 20, -0.32, 0.62, 0.92, 0.15);
  layer(pal.hi, 7, -0.48, 0.45, 0.85, 0);
  return toTex(c, { repeat: false, aniso: 4 });
}

// 松盖：扁扁的一盘，针叶自一点向上攒射
function texPine() {
  const S = 512, rng = new RNG(46), c = mkCanvas(S), ctx = c.getContext('2d');
  const tufts = [];
  for (let i = 0; i < 30; i++) {
    const a = rng.f(Math.PI * 2), r = Math.sqrt(rng.r());
    tufts.push([S / 2 + Math.cos(a) * r * 196, S * 0.52 + Math.sin(a) * r * 84 - 6, rng.f(36, 54)]);
  }
  tufts.sort((p, q) => q[1] - p[1]);
  for (const [x, y, r] of tufts) {
    ctx.fillStyle = rng.pick(['#3c5a46', '#44624a', '#365240', '#4a6a4e']);
    ctx.beginPath();
    ctx.ellipse(x, y, r * 0.95, r * 0.6, 0, 0, 7);
    ctx.fill();
  }
  ctx.lineCap = 'round';
  for (const [x, y, r] of tufts) {
    const n = rng.i(24, 32);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + rng.f(-1.4, 1.4), l = r * rng.f(0.8, 1.2);
      ctx.strokeStyle = rng.chance(0.32) ? 'rgba(126,156,100,0.95)' : 'rgba(28,46,38,0.92)';
      ctx.lineWidth = rng.f(1.8, 2.8);
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.36);
      ctx.lineTo(x + Math.cos(a) * l, y + r * 0.36 + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  return toTex(c, { repeat: false, aniso: 4 });
}

// 贴地的短草：一丛草叶自根部向四下撇开（底边只在当中一点着地，卡片斜铺时不露出一条直边）
function texGrassLow() {
  const W = 256, H = 128, rng = new RNG(451), c = mkCanvas(W, H), ctx = c.getContext('2d');
  const cols = ['#eef2dc', '#dbe6c2', '#c9d8ac', '#f4f5e4', '#b9cc9c', '#e6e2c0'];
  ctx.lineCap = 'round';
  for (let i = 0; i < 64; i++) {
    const a = rng.f(-1.12, 1.12), L = H * rng.f(0.5, 0.98) * (1 - 0.18 * Math.abs(a)), x0 = W / 2 + rng.f(-20, 20) + a * 10;
    const tx = x0 + Math.sin(a) * L * 1.1, ty = H - Math.cos(a) * L, mx = x0 + Math.sin(a * 0.45) * L * 0.55, my = H - L * 0.62;
    ctx.strokeStyle = rng.pick(cols);
    // 一笔撇出去：根粗梢细
    const q = (t) => [(1 - t) * (1 - t) * x0 + 2 * t * (1 - t) * mx + t * t * tx, (1 - t) * (1 - t) * (H + 2) + 2 * t * (1 - t) * my + t * t * ty];
    for (let k = 0; k < 4; k++) {
      ctx.lineWidth = rng.f(3.6, 5.4) * (1 - 0.22 * k);
      ctx.beginPath();
      ctx.moveTo(...q(k / 4));
      ctx.lineTo(...q((k + 1) / 4));
      ctx.stroke();
    }
  }
  return toTex(c, { repeat: false, aniso: 2 });
}
// 野花、菜花：细茎上点点碎花（花点近白，颜色由顶点色罩上去）
function texFlower() {
  const S = 256, rng = new RNG(452), c = mkCanvas(S), ctx = c.getContext('2d');
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x0 = rng.f(8, S - 8), h = rng.f(110, 236), lean = rng.f(-22, 22), x1 = x0 + lean;
    ctx.strokeStyle = rng.pick(['#7f9a5c', '#6c8a50', '#93a868']);
    ctx.lineWidth = rng.f(2.4, 3.4);
    ctx.beginPath();
    ctx.moveTo(x0, S);
    ctx.quadraticCurveTo(x0, S - h * 0.6, x1, S - h);
    ctx.stroke();
    for (let k = 0; k < 2; k++) {
      ctx.beginPath();
      ctx.moveTo(x0 + lean * 0.2, S - h * rng.f(0.2, 0.5));
      ctx.lineTo(x0 + rng.f(-16, 16), S - h * rng.f(0.5, 0.7));
      ctx.stroke();
    }
    ctx.fillStyle = rng.pick(['#ffffff', '#fbf7ee', '#f6f0e2']);
    for (let k = 0; k < 7; k++) {
      ctx.beginPath();
      ctx.arc(x1 + rng.f(-11, 11), S - h + rng.f(-12, 20), rng.f(4, 7), 0, 6.283);
      ctx.fill();
    }
  }
  return toTex(c, { repeat: false, aniso: 2 });
}
function texGrass() {
  const S = 256, rng = new RNG(45), c = mkCanvas(S), ctx = c.getContext('2d');
  const cols = ['#6f8a50', '#587444', '#8ea25e', '#4c6640', '#9aa862', '#a89c62'];
  ctx.lineCap = 'round';
  for (let g = 0; g < 6; g++) {
    const bx = 24 + g * 41 + rng.f(-8, 8), tall = rng.f(0.55, 1);
    for (let i = 0; i < 13; i++) {
      const lean = rng.f(-40, 40), h = rng.f(60, 215) * tall, x0 = bx + rng.f(-9, 9);
      ctx.strokeStyle = rng.pick(cols);
      // 一笔撇出去：根粗梢细
      for (let k = 0; k < 3; k++) {
        const t0 = k / 3, t1 = (k + 1) / 3;
        const q = (t) => [x0 + lean * t * t, S - h * t];
        ctx.lineWidth = rng.f(3.4, 5.2) * (1 - 0.3 * k);
        ctx.beginPath();
        ctx.moveTo(...q(t0));
        ctx.lineTo(...q(t1));
        ctx.stroke();
      }
    }
  }
  return toTex(c, { repeat: false, aniso: 2 });
}

// ───────────────────────── 人物面部图集 ─────────────────────────
// 每格是一张头面的展开图。横向：正面半圈占中间八成（两侧各一成是脑后）；纵向：自颏底到头顶均匀展开。
// 五官照工笔人物的画法：眉一笔、上睑浓、下睑淡、唇点朱；鼻子另有形体，这里只勾鼻翼。
export const FACE = { man: 0, man2: 1, woman: 2, wife: 3, elder: 4, granny: 5, child: 6, tanned: 7, man3: 8, scholar: 9, woman2: 10, tanned2: 11 };
export const FACE_COLS = 4, FACE_ROWS = 3;
export const HEAD_Y0 = -0.118, HEAD_Y1 = 0.128; // 贴图纵向所覆盖的头高（米，相对头心）
export const FACE_DEFS = [
  { skin: '#f3dfc8', hair: '#2b2622' },
  { skin: '#efd8be', hair: '#2b2622', beard: 'mustache' },
  { skin: '#f7e8d6', hair: '#231e1c', woman: true },
  { skin: '#f8ebdb', hair: '#1f1a19', woman: true, dot: true },
  { skin: '#eed8c0', hair: '#a09c94', beard: 'long', beardColor: '#cfcbc2', old: true },
  { skin: '#f0dcc6', hair: '#a8a49c', woman: true, old: true },
  { skin: '#f8e6d2', hair: '#2b2622', child: true },
  { skin: '#dfbe9c', hair: '#2b2622', beard: 'mustache' },
  { skin: '#f1dcc4', hair: '#2b2622', round: true },
  { skin: '#f4e2cc', hair: '#2b2622', beard: 'goatee' },
  { skin: '#f6e6d2', hair: '#262120', woman: true, soft: true },
  { skin: '#d9b794', hair: '#2b2622', beard: 'stubble' },
];
// 头面展开图上的坐标：alpha 自正面起算的方位角（+x 一侧为正），返回格内 0~1
export const headU = (alpha) => {
  const a = Math.abs(alpha), h = Math.PI / 2;
  return 0.5 + Math.sign(alpha) * (a <= h ? (a / h) * 0.4 : 0.4 + ((a - h) / h) * 0.1);
};
export const faceUV = (face, u, v) => [((face % FACE_COLS) + u) / FACE_COLS, 1 - (Math.floor(face / FACE_COLS) + 1 - v) / FACE_ROWS];
// 发际：自正面到脑后（方位角的绝对值 → 高度）。男子束发，鬓角到耳前；妇人鬓发掩耳
export const HAIRLINE = {
  man: [[0, 0.09], [0.75, 0.082], [1.1, 0.05], [1.36, 0.016], [1.7, -0.02], [2.4, -0.056], [3.1416, -0.066]],
  woman: [[0, 0.087], [0.6, 0.078], [0.95, 0.036], [1.22, -0.022], [1.7, -0.052], [3.1416, -0.076]],
};
export function hairlineAt(line, alpha) {
  const a = Math.min(Math.abs(alpha), Math.PI);
  for (let i = 1; i < line.length; i++)
    if (a <= line[i][0]) {
      const p = line[i - 1], q = line[i];
      return p[1] + ((q[1] - p[1]) * (a - p[0])) / (q[0] - p[0]);
    }
  return line[line.length - 1][1];
}

function drawFace(ctx, ox, oy, W, H, o) {
  const X = (xm) => ox + W * (0.5 + (Math.asin(Math.max(-1, Math.min(1, xm / 0.088))) / (Math.PI / 2)) * 0.4);
  const Y = (ym) => oy + H * (1 - (ym - HEAD_Y0) / (HEAD_Y1 - HEAD_Y0));
  const k = W / 640; // 笔触粗细随格子大小
  const ink = o.old ? '#4a4038' : '#2a1f18';
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, W, H);
  ctx.clip();
  ctx.fillStyle = o.skin;
  ctx.fillRect(ox, oy, W, H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const soft = (xm, ym, rx, ry, rgba0, rgba1) => {
    const cx = X(xm), cy = Y(ym), r = Math.max(rx, ry);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx / r, ry / r);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba0);
    g.addColorStop(1, rgba1);
    ctx.fillStyle = g;
    ctx.fillRect(-r, -r, 2 * r, 2 * r);
    ctx.restore();
  };
  // ── 淡染：两颊、眼窝、鼻侧、唇下、颏 ──
  for (const s of [-1, 1]) {
    soft(s * 0.031, 0.022, 44 * k, 30 * k, 'rgba(150,104,72,0.2)', 'rgba(150,104,72,0)');
    soft(s * 0.014, -0.012, 16 * k, 46 * k, 'rgba(150,104,72,0.13)', 'rgba(150,104,72,0)');
    soft(s * 0.07, -0.03, 60 * k, 150 * k, 'rgba(140,96,66,0.2)', 'rgba(140,96,66,0)');
    const blush = o.woman || o.child ? 0.34 : o.old ? 0.1 : 0.16;
    soft(s * 0.042, -0.024, 44 * k, 40 * k, `rgba(226,120,104,${blush})`, 'rgba(226,120,104,0)');
  }
  soft(0, -0.071, 30 * k, 12 * k, 'rgba(150,104,72,0.2)', 'rgba(150,104,72,0)');
  soft(0, 0.075, 90 * k, 40 * k, 'rgba(255,250,240,0.2)', 'rgba(255,250,240,0)');

  // ── 发 ──
  const line = o.woman ? HAIRLINE.woman : HAIRLINE.man;
  ctx.fillStyle = o.hair;
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  for (let i = 0; i <= 80; i++) {
    const a = -Math.PI + (i / 80) * Math.PI * 2;
    ctx.lineTo(ox + W * headU(a), Y(hairlineAt(line, a)));
  }
  ctx.lineTo(ox + W, oy);
  ctx.closePath();
  ctx.fill();
  // 发际处扫几笔细的，免得一刀切
  ctx.strokeStyle = o.hair;
  ctx.lineWidth = 1.4 * k;
  for (let i = 0; i < 70; i++) {
    const a = -1.5 + (i / 69) * 3 + Math.sin(i * 12.9898) * 0.02, hy = hairlineAt(line, a);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(ox + W * headU(a), Y(hy) - 2);
    ctx.lineTo(ox + W * headU(a * 0.985), Y(hy - 0.004 - 0.004 * Math.abs(Math.sin(i * 78.233))));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // 一笔有粗细的弧：自 a 经 c 到 b，中段最粗
  const taper = (ax, ay, cx, cy, bx, by, w0, w1, color, alpha = 1) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(X(ax), Y(ay));
    ctx.quadraticCurveTo(X(cx), Y(cy) - w0 * k, X(bx), Y(by));
    ctx.quadraticCurveTo(X(cx), Y(cy) + w1 * k, X(ax), Y(ay));
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  const stroke = (pts, w, color, alpha = 1) => {
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = w * k;
    ctx.beginPath();
    ctx.moveTo(X(pts[0][0]), Y(pts[0][1]));
    if (pts.length === 3) ctx.quadraticCurveTo(X(pts[1][0]), Y(pts[1][1]), X(pts[2][0]), Y(pts[2][1]));
    else for (let i = 1; i < pts.length; i++) ctx.lineTo(X(pts[i][0]), Y(pts[i][1]));
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const eyeY = o.child ? 0.006 : 0.014, eyeX = o.child ? 0.03 : 0.031;
  const ew = o.child ? 0.0135 : o.woman ? 0.0148 : 0.014, eh = o.child ? 0.0066 : o.old ? 0.0034 : o.woman ? 0.0046 : 0.0042;
  const browC = o.old ? (o.beardColor || '#8a867e') : ink;
  for (const s of [-1, 1]) {
    // 眉
    if (o.woman) taper(s * 0.014, eyeY + 0.0195, s * 0.03, eyeY + 0.0275, s * 0.049, eyeY + 0.019, 5.5, 0.4, browC, 0.92);
    else if (o.child) taper(s * 0.016, eyeY + 0.02, s * 0.029, eyeY + 0.025, s * 0.043, eyeY + 0.0205, 5, 1.5, browC, 0.8);
    else taper(s * 0.011, eyeY + 0.018, s * 0.03, eyeY + 0.0265, s * 0.05, eyeY + 0.0195, 12, 4, browC, 0.95);
    // 眼：眼白、眸子、上睑一笔浓墨（眼尾微挑）、下睑淡淡一线
    const cx = s * eyeX, tail = o.child ? 0.0006 : 0.0022;
    const path = () => {
      ctx.beginPath();
      ctx.moveTo(X(cx - s * ew), Y(eyeY - 0.0008));
      ctx.quadraticCurveTo(X(cx - s * ew * 0.1), Y(eyeY + eh * 1.55), X(cx + s * ew), Y(eyeY + tail));
      ctx.quadraticCurveTo(X(cx + s * ew * 0.1), Y(eyeY - eh * 1.25), X(cx - s * ew), Y(eyeY - 0.0008));
    };
    ctx.fillStyle = '#fbf7f0';
    path();
    ctx.fill();
    ctx.save();
    path();
    ctx.clip();
    ctx.fillStyle = '#231710';
    ctx.beginPath();
    ctx.ellipse(X(cx - s * 0.0006), Y(eyeY + eh * 0.12), 0.0052 * (W * 2.9) * (o.child ? 1.12 : 1), (eh * 1.25 + 0.0012) * (H / (HEAD_Y1 - HEAD_Y0)), 0, 0, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(X(cx - s * 0.0006) - 3 * k, Y(eyeY + eh * 0.55), 1.9 * k, 0, 7);
    ctx.fill();
    ctx.restore();
    taper(cx - s * ew * 1.04, eyeY - 0.001, cx - s * ew * 0.1, eyeY + eh * 1.6, cx + s * (ew + 0.004), eyeY + tail + 0.0012, o.woman ? 7.5 : 6.5, 0.4, ink);
    stroke([[cx - s * ew * 0.55, eyeY - eh * 0.72], [cx + s * ew * 0.15, eyeY - eh * 1.08], [cx + s * ew * 0.98, eyeY + tail * 0.4]], 1.3, '#6a4a38', 0.55);
    if (!o.child) stroke([[cx - s * ew * 0.85, eyeY + eh * 1.75], [cx, eyeY + eh * 2.5], [cx + s * ew * 0.8, eyeY + eh * 1.9]], 1.5, '#7a5440', o.woman ? 0.4 : 0.3);
    // 鼻翼
    stroke([[s * 0.0118, -0.024], [s * 0.0165, -0.031], [s * 0.011, -0.0355]], 2.3, '#8a5a44', 0.62);
    if (o.old) {
      // 鱼尾纹、法令纹、眼袋
      stroke([[s * 0.05, eyeY + 0.002], [s * 0.056, eyeY + 0.004], [s * 0.061, eyeY + 0.008]], 1.2, '#7a5440', 0.5);
      stroke([[s * 0.05, eyeY - 0.002], [s * 0.057, eyeY - 0.003], [s * 0.062, eyeY - 0.002]], 1.2, '#7a5440', 0.45);
      stroke([[s * 0.017, -0.03], [s * 0.028, -0.046], [s * 0.027, -0.064]], 1.5, '#7a5440', 0.5);
      stroke([[s * 0.018, eyeY - 0.011], [s * 0.031, eyeY - 0.015], [s * 0.044, eyeY - 0.01]], 1.2, '#7a5440', 0.4);
    }
  }
  if (o.old)
    for (let i = 0; i < 3; i++) stroke([[-0.034 + i * 0.004, 0.058 + i * 0.011], [0, 0.062 + i * 0.011], [0.034 - i * 0.004, 0.058 + i * 0.011]], 1.2, '#7a5440', 0.34);
  // 人中
  stroke([[0, -0.041], [0, -0.049]], 1.2, '#8a5a44', 0.25);
  // 口
  const my = o.child ? -0.058 : -0.0585;
  if (o.woman || o.child) {
    const mw = o.child ? 0.0095 : 0.0115, red = o.old ? '#a85a50' : '#b9382f';
    ctx.fillStyle = red;
    ctx.beginPath();
    ctx.moveTo(X(-mw), Y(my));
    ctx.quadraticCurveTo(X(-mw * 0.45), Y(my + 0.0052), X(0), Y(my + 0.003));
    ctx.quadraticCurveTo(X(mw * 0.45), Y(my + 0.0052), X(mw), Y(my));
    ctx.quadraticCurveTo(X(0), Y(my - 0.0012), X(-mw), Y(my));
    ctx.fill();
    ctx.fillStyle = o.old ? '#b8706a' : '#cc5248';
    ctx.beginPath();
    ctx.moveTo(X(-mw * 0.82), Y(my - 0.0006));
    ctx.quadraticCurveTo(X(0), Y(my - 0.0078), X(mw * 0.82), Y(my - 0.0006));
    ctx.quadraticCurveTo(X(0), Y(my - 0.0018), X(-mw * 0.82), Y(my - 0.0006));
    ctx.fill();
  } else {
    stroke([[-0.0165, my + 0.0006], [0, my - 0.0018], [0.0165, my + 0.0006]], 2.5, '#7c4634', 0.95);
    taper(-0.0105, my - 0.0015, 0, my - 0.0075, 0.0105, my - 0.0015, 0, 14, '#b06a58', 0.5);
    stroke([[-0.0105, my + 0.0026], [-0.004, my + 0.0048], [0, my + 0.0032]], 1.2, '#8a5440', 0.45);
    stroke([[0.0105, my + 0.0026], [0.004, my + 0.0048], [0, my + 0.0032]], 1.2, '#8a5440', 0.45);
  }
  if (o.dot) {
    // 额间花钿
    ctx.fillStyle = '#b8352c';
    ctx.beginPath();
    ctx.ellipse(X(0), Y(0.05), 3.6 * k, 5.4 * k, 0, 0, 7);
    ctx.fill();
  }
  // ── 须 ──
  const bc = o.beardColor || '#2d2520';
  if (o.beard === 'mustache' || o.beard === 'goatee' || o.beard === 'long') {
    for (const s of [-1, 1]) {
      // 八字须
      taper(s * 0.0015, my + 0.0085, s * 0.014, my + 0.0075, s * (o.beard === 'mustache' ? 0.024 : 0.028), my - (o.beard === 'mustache' ? 0.004 : 0.014), 3, 11, bc, 0.9);
    }
    // 颏下一绺
    const len = o.beard === 'mustache' ? 0.016 : 0.05;
    ctx.fillStyle = bc;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(X(-0.008), Y(my - 0.014));
    ctx.quadraticCurveTo(X(0), Y(my - 0.011), X(0.008), Y(my - 0.014));
    ctx.quadraticCurveTo(X(0.006), Y(my - 0.014 - len * 0.7), X(0), Y(my - 0.014 - len));
    ctx.quadraticCurveTo(X(-0.006), Y(my - 0.014 - len * 0.7), X(-0.008), Y(my - 0.014));
    ctx.fill();
    ctx.globalAlpha = 1;
    if (o.beard !== 'mustache')
      for (const s of [-1, 1]) {
        // 两腮的长髯
        ctx.fillStyle = bc;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(X(s * 0.03), Y(my + 0.002));
        ctx.quadraticCurveTo(X(s * 0.05), Y(my - 0.01), X(s * 0.058), Y(my + 0.012));
        ctx.quadraticCurveTo(X(s * 0.055), Y(my - 0.03), X(s * 0.03), Y(my - 0.056));
        ctx.quadraticCurveTo(X(s * 0.034), Y(my - 0.03), X(s * 0.03), Y(my + 0.002));
        ctx.fill();
        ctx.globalAlpha = 1;
      }
  } else if (o.beard === 'stubble') {
    ctx.fillStyle = bc;
    for (let i = 0; i < 260; i++) {
      const r1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1, r2 = Math.abs(Math.sin(i * 78.233) * 12543.123) % 1;
      const x = (r1 * 2 - 1) * 0.05, y = -0.04 - r2 * 0.066;
      if (Math.abs(x) < 0.02 && y > my - 0.01 && y < my + 0.008) continue;
      if (Math.abs(x) > 0.05 - (-0.04 - y) * 0.5) continue;
      ctx.globalAlpha = 0.34;
      ctx.fillRect(X(x), Y(y), 1.6 * k, 2.2 * k);
    }
    ctx.globalAlpha = 1;
    for (const s of [-1, 1]) taper(s * 0.002, my + 0.008, s * 0.012, my + 0.0078, s * 0.021, my + 0.001, 2.5, 8, bc, 0.6);
  }
  ctx.restore();
}

export function faceAtlas() {
  const W = 640, H = 640, c = mkCanvas(W * FACE_COLS, H * FACE_ROWS), ctx = c.getContext('2d');
  FACE_DEFS.forEach((d, i) => drawFace(ctx, (i % FACE_COLS) * W, Math.floor(i / FACE_COLS) * H, W, H, d));
  return toTex(c, { repeat: false, aniso: 8 });
}

// ───────────────────────── 招牌图集 ─────────────────────────
export class SignAtlas {
  constructor() {
    this.W = 2048;
    this.H = 4096;
    this.c = mkCanvas(this.W, this.H);
    this.ctx = this.c.getContext('2d');
    this.ctx.fillStyle = '#efe6d0';
    this.ctx.fillRect(0, 0, this.W, this.H);
    this.vi = 0;
    this.hi = 0;
    this.cache = new Map();
    this.tex = toTex(this.c, { repeat: false, aniso: 8 });
  }
  _rect(x, y, w, h) {
    const pad = 1.5;
    return { u0: (x + pad) / this.W, u1: (x + w - pad) / this.W, v0: 1 - (y + h - pad) / this.H, v1: 1 - (y + pad) / this.H };
  }
  // 画片：占一格竖招位（128×512），由 draw(ctx,x,y,w,h) 自行绘制
  picture(key, draw) {
    if (this.cache.has('p' + key)) return this.cache.get('p' + key);
    const i = this.vi++ % 96;
    const x = (i % 16) * 128, y = Math.floor(i / 16) * 512;
    draw(this.ctx, x, y, 128, 512);
    const r = this._rect(x, y, 128, 512);
    this.cache.set('p' + key, r);
    this.tex.needsUpdate = true;
    return r;
  }
  // 竖招：128×512
  vertical(text, o = {}) {
    const key = 'v' + text + JSON.stringify(o);
    if (this.cache.has(key)) return this.cache.get(key);
    const i = this.vi++ % 96;
    const x = (i % 16) * 128, y = Math.floor(i / 16) * 512, w = 128, h = 512, ctx = this.ctx;
    const bg = o.bg || '#f0e7d2', fg = o.fg || '#231a14';
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = o.border || 'rgba(50,36,26,0.85)';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
    const n = text.length, pad = 22;
    const fs = Math.min(w * 0.72, (h - pad * 2) / n);
    ctx.font = `bold ${fs}px ${FONT_KAI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    const step = (h - pad * 2) / n;
    for (let k = 0; k < n; k++) ctx.fillText(text[k], x + w / 2, y + pad + step * (k + 0.5) + fs * 0.04);
    const r = this._rect(x, y, w, h);
    this.cache.set(key, r);
    this.tex.needsUpdate = true;
    return r;
  }
  // 横匾：512×170
  horizontal(text, o = {}) {
    const key = 'h' + text + JSON.stringify(o);
    if (this.cache.has(key)) return this.cache.get(key);
    const i = this.hi++ % 24;
    const w = 512, h = 170, x = (i % 4) * w, y = 3072 + Math.floor(i / 4) * h, ctx = this.ctx;
    ctx.fillStyle = o.bg || '#3a2c22';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = o.border || '#c9a25e';
    ctx.lineWidth = 6;
    ctx.strokeRect(x + 7, y + 7, w - 14, h - 14);
    const n = text.length;
    const fs = Math.min(h * 0.7, (w - 50) / n);
    ctx.font = `bold ${fs}px ${FONT_KAI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = o.fg || '#e9d6a4';
    const step = (w - 50) / n;
    // 自右向左书写
    for (let k = 0; k < n; k++) ctx.fillText(text[k], x + w - 25 - step * (k + 0.5), y + h / 2 + fs * 0.04);
    const r = this._rect(x, y, w, h);
    this.cache.set(key, r);
    this.tex.needsUpdate = true;
    return r;
  }
}

// ───────────────────────── 画中画：小幅山水 / 书法 ─────────────────────────
export function paintLandscape(ctx, x, y, w, h, seed = 1) {
  const rng = new RNG(seed);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#f2e9d5';
  ctx.fillRect(x, y, w, h);
  const layers = 4;
  for (let L = 0; L < layers; L++) {
    const baseY = y + h * (0.2 + L * 0.17), amp = h * (0.16 - L * 0.02);
    const dark = 0.28 + L * 0.14;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    let py = baseY;
    const steps = 40;
    const ph = rng.f(10), ph2 = rng.f(10);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      py = baseY - amp * (Math.pow(Math.abs(Math.sin(t * (2.2 + L) + ph)), 1.6) * 0.8 + Math.sin(t * 9 + ph2) * 0.12) + rng.f(-1.5, 1.5);
      ctx.lineTo(x + t * w, py);
    }
    ctx.lineTo(x + w, y + h);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, baseY - amp, 0, baseY + h * 0.2);
    g.addColorStop(0, `rgba(58,74,78,${dark})`);
    g.addColorStop(0.5, `rgba(90,108,104,${dark * 0.45})`);
    g.addColorStop(1, 'rgba(242,233,213,0)');
    ctx.fillStyle = g;
    ctx.fill();
  }
  // 近坡与杂树
  ctx.fillStyle = 'rgba(52,58,50,0.55)';
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.quadraticCurveTo(x + w * 0.3, y + h * 0.8, x + w * 0.62, y + h * 0.93);
  ctx.lineTo(x + w * 0.62, y + h);
  ctx.fill();
  for (let i = 0; i < 9; i++) {
    const tx = x + rng.f(w * 0.06, w * 0.5), ty = y + h * rng.f(0.8, 0.9);
    ctx.strokeStyle = 'rgba(30,26,22,0.85)';
    ctx.lineWidth = Math.max(1, w * 0.006);
    ctx.beginPath();
    ctx.moveTo(tx, ty + h * 0.05);
    ctx.lineTo(tx + rng.f(-2, 2), ty - h * 0.04);
    ctx.stroke();
    ctx.fillStyle = `rgba(40,56,44,${rng.f(0.5, 0.8)})`;
    ctx.beginPath();
    ctx.ellipse(tx, ty - h * 0.05, w * rng.f(0.02, 0.04), h * rng.f(0.015, 0.03), 0, 0, 7);
    ctx.fill();
  }
  // 小亭
  const px = x + w * 0.72, py2 = y + h * 0.83;
  ctx.strokeStyle = 'rgba(30,26,22,0.9)';
  ctx.lineWidth = Math.max(1, w * 0.005);
  ctx.beginPath();
  ctx.moveTo(px - w * 0.05, py2);
  ctx.lineTo(px, py2 - h * 0.03);
  ctx.lineTo(px + w * 0.05, py2);
  ctx.moveTo(px - w * 0.032, py2);
  ctx.lineTo(px - w * 0.032, py2 + h * 0.04);
  ctx.moveTo(px + w * 0.032, py2);
  ctx.lineTo(px + w * 0.032, py2 + h * 0.04);
  ctx.stroke();
  // 钤印
  ctx.fillStyle = '#b5352a';
  ctx.fillRect(x + w * 0.84, y + h * 0.1, w * 0.07, w * 0.07);
  ctx.restore();
}

export function paintCalligraphy(ctx, x, y, w, h, text, { cols = 2, font = FONT_XING, seal = true } = {}) {
  ctx.save();
  ctx.fillStyle = '#f3ebd8';
  ctx.fillRect(x, y, w, h);
  const per = Math.ceil(text.length / cols);
  const colW = w / (cols + 0.4);
  const fs = Math.min(colW * 0.86, (h * 0.88) / per);
  ctx.font = `${fs}px ${font}`;
  ctx.fillStyle = '#1f1915';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < text.length; i++) {
    const col = Math.floor(i / per), row = i % per;
    const cx = x + w - colW * (col + 0.7), cy = y + h * 0.06 + fs * (row + 0.5) * 1.04;
    ctx.fillText(text[i], cx, cy);
  }
  if (seal) {
    ctx.fillStyle = '#b5352a';
    ctx.fillRect(x + w * 0.1, y + h * 0.86, w * 0.13, w * 0.13);
  }
  ctx.restore();
}

// ───────────────────────── 汇总 ─────────────────────────
export function buildTextures() {
  return {
    noise: noiseTexture(),
    paper: paperTexture(),
    tile: texTile(),
    thatch: texThatch(),
    plaster: texPlaster(),
    earthWall: texEarthWall(),
    wood: texWood(25, '#c6b49c'),
    rafter: texRafter(),
    eave: texEave(),
    plank: texPlank(),
    lattice: texLattice(),
    brick: texBrick(),
    stone: texStone(),
    mat: texMat(),
    bank: texBank(),
    groundDetail: texGroundDetail(),
    bark: texBark(),
    cloth: texCloth(),
    robe: texRobe(),
    willow: texWillow(),
    leafA: texFoliage(42, { dark: ['#4e6a38', '#58743c'], mid: ['#6c8a46', '#779650', '#628240'], light: ['#94ac5a', '#a2b864'], hi: ['#c0cc7a', '#d0d68c'] }),
    leafB: texFoliage(43, { dark: ['#2f4a36', '#37523a'], mid: ['#456648', '#4e7050', '#3e5e44'], light: ['#648658', '#709262'], hi: ['#8eaa70', '#9ab67a'] }, { leafL: 26, leafW: 9, ink: '24,40,30' }),
    leafC: texFoliage(47, { dark: ['#7c4428', '#8a4e2c'], mid: ['#aa6236', '#b86e3c', '#9c5830'], light: ['#d08a48', '#d89652'], hi: ['#e8b468', '#f0c47c'] }, { ink: '74,36,22' }),
    blossom: texFoliage(44, { dark: ['#d88e98', '#e09aa2'], mid: ['#f0b4b8', '#f6c4c6', '#eaa6ae'], light: ['#fbdcdc', '#fde8e6'], hi: ['#ffffff', '#fff6f2'] }, { leafL: 19, round: true, twigs: true, groups: 8, ink: '190,104,112' }),
    pine: texPine(),
    grass: texGrass(),
    grassLow: texGrassLow(),
    flower: texFlower(),
    face: faceAtlas(),
  };
}

// 界面的墨迹素材：飞白的笔触、墨团、墨圈、印章的残破。
// 都用画布现画，转成图片后挂到样式变量上（--stroke-a、--blot-a、--ring、--seal-mask……），样式表按需取用。
import { RNG } from '../util.js';

const INK = '31,25,21', RED = '182,42,32';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// 一笔横扫：起笔一顿墨浓，行笔带出飞白，收笔散开成须
function stroke(w, h, seed, color = INK) {
  const c = canvas(w, h), g = c.getContext('2d'), r = new RNG(seed);
  const n = Math.round(h * 0.95);
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y0 = h * (0.09 + 0.82 * t), edge = Math.abs(t - 0.5) * 2;
    const x0 = w * (0.012 + r.f(0.02) + edge * edge * r.f(0.04));
    const x1 = w * (0.988 - r.f(0.04) - edge * edge * r.f(0.15) - (r.chance(0.18) ? r.f(0.1) : 0));
    const wob = r.f(-1.3, 1.3), ph = r.f(6);
    g.strokeStyle = `rgba(${color},${(0.6 + r.f(0.4)) * (1 - edge * 0.3)})`;
    g.lineWidth = r.f(1.0, 2.4);
    let x = x0;
    while (x < x1) {
      const xe = Math.min(x1, x + r.f(0.07, 0.42) * w);
      g.beginPath();
      for (let xx = x; xx <= xe + 1; xx += 5) g.lineTo(xx, y0 + Math.sin(xx * 0.013 + ph) * wob);
      g.stroke();
      // 越往笔尾、越靠边毛，越容易断出飞白
      const gap = 0.05 + 0.5 * (xe / w) ** 2 * (0.35 + edge);
      x = xe + (r.chance(gap) ? r.f(0.012, 0.07) * w : 0);
    }
  }
  const gr = g.createRadialGradient(h * 0.55, h * 0.5, 0, h * 0.55, h * 0.5, h * 0.7);
  gr.addColorStop(0, `rgba(${color},0.95)`);
  gr.addColorStop(0.65, `rgba(${color},0.55)`);
  gr.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, h * 1.4, h);
  for (let i = 0; i < 10; i++) {
    g.fillStyle = `rgba(${color},${r.f(0.4, 0.9)})`;
    g.beginPath();
    g.arc(r.f(w), r.chance(0.5) ? r.f(h * 0.09) : h - r.f(h * 0.09), r.f(0.5, 1.8), 0, 7);
    g.fill();
  }
  return c.toDataURL();
}

// 一团墨：边缘不圆，甩出几点，带几丝飞毛
function blot(S, seed, color = INK) {
  const c = canvas(S, S), g = c.getContext('2d'), r = new RNG(seed), cx = S / 2, cy = S / 2, R = S * 0.39;
  const k = [r.f(6), r.f(6), r.f(6)];
  g.fillStyle = `rgba(${color},0.96)`;
  g.beginPath();
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    const rr = R * (1 + 0.05 * Math.sin(a * 3 + k[0]) + 0.035 * Math.sin(a * 7 + k[1]) + 0.02 * Math.sin(a * 13 + k[2]));
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.fill();
  for (let i = 0; i < 16; i++) {
    const a = r.f(6.283), d = R * r.f(1.04, 1.24);
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, r.f(0.005, 0.02) * S, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 8; i++) {
    const a = r.f(6.283);
    g.strokeStyle = `rgba(${color},${r.f(0.5, 0.9)})`;
    g.lineWidth = r.f(1, 3);
    g.beginPath();
    g.arc(cx, cy, R * r.f(1.01, 1.1), a, a + r.f(0.3, 0.9));
    g.stroke();
  }
  // 墨里略见浓淡
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 46; i++) {
    g.fillStyle = `rgba(0,0,0,${r.f(0.04, 0.13)})`;
    g.beginPath();
    g.arc(cx + r.f(-R, R), cy + r.f(-R, R), r.f(0.01, 0.05) * S, 0, 7);
    g.fill();
  }
  return c.toDataURL();
}

// 一笔圈成的墨环（小地图、摇杆的边）
function ring(S, seed, color = INK) {
  const c = canvas(S, S), g = c.getContext('2d'), r = new RNG(seed), cx = S / 2, cy = S / 2, R = S * 0.452;
  g.lineCap = 'round';
  for (let i = 0; i < 44; i++) {
    const t = i / 43, edge = Math.abs(t - 0.5) * 2, rr = R + (t - 0.5) * S * 0.052;
    const a0 = -0.9 + r.f(-0.12, 0.12), len = Math.PI * 2 - r.f(0.02, 0.3) - edge * edge * r.f(1.3);
    g.strokeStyle = `rgba(${color},${r.f(0.55, 0.95)})`;
    g.lineWidth = r.f(0.9, 2.5);
    let a = a0;
    const end = a0 + len;
    while (a < end) {
      const seg = r.f(0.3, 1.7);
      g.beginPath();
      g.arc(cx, cy, rr + Math.sin(a * 2 + i) * 0.7, a, Math.min(end, a + seg));
      g.stroke();
      a += seg + (r.chance(0.12 + 0.5 * ((a - a0) / len) * (0.4 + edge)) ? r.f(0.02, 0.12) : 0);
    }
  }
  return c.toDataURL();
}

// 印章的残破：四边不齐，印面有砂眼与崩口（作遮罩用）
function sealMask(S, seed) {
  const c = canvas(S, S), g = c.getContext('2d'), r = new RNG(seed), m = S * 0.035;
  g.fillStyle = '#000';
  g.beginPath();
  const side = (x0, y0, x1, y1, nx, ny) => {
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, j = r.f(m) * (r.chance(0.2) ? 2.2 : 1);
      g.lineTo(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j);
    }
  };
  side(0, 0, S, 0, 0, 1);
  side(S, 0, S, S, -1, 0);
  side(S, S, 0, S, 0, -1);
  side(0, S, 0, 0, 1, 0);
  g.fill();
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 110; i++) {
    g.fillStyle = `rgba(0,0,0,${r.f(0.35, 1)})`;
    g.beginPath();
    g.arc(r.f(S), r.f(S), r.f(0.004, 0.02) * S, 0, 7);
    g.fill();
  }
  for (let i = 0; i < 5; i++) {
    g.strokeStyle = `rgba(0,0,0,${r.f(0.4, 0.9)})`;
    g.lineWidth = r.f(0.6, 1.6);
    g.beginPath();
    const x = r.f(S), y = r.f(S);
    g.moveTo(x, y);
    g.lineTo(x + r.f(-0.25, 0.25) * S, y + r.f(-0.25, 0.25) * S);
    g.stroke();
  }
  return c.toDataURL();
}

export function installInkArt(root) {
  const set = (k, url) => root.style.setProperty(k, `url(${url})`);
  set('--stroke-a', stroke(680, 100, 3));
  set('--stroke-b', stroke(560, 84, 17));
  set('--stroke-c', stroke(620, 88, 29));
  set('--stroke-red', stroke(560, 84, 41, RED));
  set('--stroke-line', stroke(520, 18, 53));
  set('--stroke-line-red', stroke(520, 18, 59, RED));
  set('--blot-a', blot(240, 5));
  set('--blot-b', blot(240, 11));
  set('--blot-red', blot(280, 23, RED));
  set('--ring', ring(520, 7));
  set('--seal-mask', sealMask(160, 13));
}

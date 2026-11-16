// 舆图：把搭建世界时登记的房屋、河道、道路画成一张俯瞰的墨线小图（小地图与大地图共用）
import { CHANNELS } from '../world/river.js';
import { NODES, EDGES, EXTRA_ROADS, edgeWidth, BRIDGE, MOAT_BRIDGE, GATE, PLANK } from '../world/layout.js';
import { RNG } from '../util.js';

export const MAPRECT = { minX: -414, maxX: 416, minZ: -122, maxZ: 112 };

export function renderWorldMap(MAP, s) {
  const W = Math.round((MAPRECT.maxX - MAPRECT.minX) * s), H = Math.round((MAPRECT.maxZ - MAPRECT.minZ) * s);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d'), rng = new RNG(5);
  const X = (x) => (x - MAPRECT.minX) * s, Z = (z) => (z - MAPRECT.minZ) * s;
  const INK = '#3a3028';
  ctx.fillStyle = '#e6d8b6';
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) {
    const x = rng.f(W), y = rng.f(H), r = rng.f(40, 160) * (s / 3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng.chance(0.5);
    g.addColorStop(0, dark ? 'rgba(150,120,70,0.10)' : 'rgba(255,250,232,0.16)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  // 田畴
  for (const f of MAP.fields) {
    ctx.save();
    ctx.translate(X(f.x), Z(f.z));
    ctx.rotate(f.rot || 0);
    ctx.fillStyle = 'rgba(150,178,128,0.34)';
    ctx.fillRect((-f.w / 2) * s, (-f.d / 2) * s, f.w * s, f.d * s);
    ctx.strokeStyle = 'rgba(90,110,78,0.35)';
    ctx.lineWidth = Math.max(0.6, s * 0.18);
    for (let x = -f.w / 2 + 1.5; x < f.w / 2; x += 3) {
      ctx.beginPath();
      ctx.moveTo(x * s, (-f.d / 2) * s);
      ctx.lineTo(x * s, (f.d / 2) * s);
      ctx.stroke();
    }
    ctx.restore();
  }
  // 道路
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const roads = [...EDGES.map(([a, b]) => [NODES[a], NODES[b], edgeWidth(a, b)]), ...EXTRA_ROADS];
  for (const pass of [0, 1])
    for (const [p, q, w] of roads) {
      ctx.strokeStyle = pass ? '#f6eed8' : 'rgba(90,76,60,0.55)';
      ctx.lineWidth = (w + 1) * s + (pass ? 0 : Math.max(1.2, s * 0.35));
      ctx.beginPath();
      ctx.moveTo(X(p[0]), Z(p[1]));
      ctx.lineTo(X(q[0]), Z(q[1]));
      ctx.stroke();
    }
  // 河
  ctx.lineCap = 'butt';
  const trace = (pts) => {
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
  };
  ctx.lineJoin = 'round';
  for (const pass of [0, 1])
    for (const ch of CHANNELS) {
      trace(ch.pts);
      ctx.lineWidth = 2 * ch.hw * s + (pass ? 0 : Math.max(2, s * 0.7));
      ctx.strokeStyle = pass ? '#bfd0cb' : INK;
      ctx.stroke();
    }
  // 水纹
  ctx.strokeStyle = 'rgba(70,95,100,0.5)';
  ctx.lineWidth = Math.max(0.7, s * 0.2);
  const wave = (x, z, a) => {
    ctx.save();
    ctx.translate(X(x), Z(z));
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(-3 * s, 0);
    ctx.quadraticCurveTo(-1.5 * s, -0.9 * s, 0, 0);
    ctx.quadraticCurveTo(1.5 * s, 0.9 * s, 3 * s, 0);
    ctx.stroke();
    ctx.restore();
  };
  const mp = CHANNELS[0].pts;
  for (let i = 4; i < mp.length - 1; i += 4) {
    const a = mp[i], c2 = mp[i + 1], ang = Math.atan2(c2[1] - a[1], c2[0] - a[0]), off = rng.f(-15, 15);
    wave(a[0] - Math.sin(ang) * off, a[1] + Math.cos(ang) * off, ang);
  }
  // 船
  for (const bt of MAP.boats) {
    ctx.save();
    ctx.translate(X(bt.x), Z(bt.z));
    ctx.rotate(-bt.rot);
    ctx.fillStyle = '#b48a62';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(0.8, s * 0.25);
    ctx.beginPath();
    ctx.ellipse(0, 0, (bt.L / 2) * s, (bt.B / 2) * s, 0, 0, 7);
    ctx.fill();
    ctx.stroke();
    if (bt.L > 12) {
      ctx.fillStyle = '#dccb9c';
      ctx.fillRect(-bt.L * 0.12 * s, -bt.B * 0.3 * s, bt.L * 0.4 * s, bt.B * 0.6 * s);
    }
    ctx.restore();
  }
  // 虹桥、平桥
  ctx.fillStyle = '#b0765a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = Math.max(1, s * 0.35);
  ctx.save();
  ctx.translate(X(BRIDGE.xc), Z(BRIDGE.zc));
  ctx.rotate(-BRIDGE.ang);
  ctx.fillRect(-BRIDGE.L * s, -BRIDGE.hw * s, 2 * BRIDGE.L * s, 2 * BRIDGE.hw * s);
  ctx.strokeRect(-BRIDGE.L * s, -BRIDGE.hw * s, 2 * BRIDGE.L * s, 2 * BRIDGE.hw * s);
  ctx.globalAlpha = 0.35;
  for (let x = -BRIDGE.L + 3; x < BRIDGE.L; x += 3) {
    ctx.beginPath();
    ctx.moveTo(x * s, -BRIDGE.hw * s);
    ctx.lineTo(x * s, BRIDGE.hw * s);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  // 卷首溪上的小板桥
  ctx.fillStyle = '#c9a678';
  ctx.fillRect(X(PLANK.x - PLANK.len / 2), Z(PLANK.z - PLANK.hw), PLANK.len * s, 2 * PLANK.hw * s);
  ctx.strokeRect(X(PLANK.x - PLANK.len / 2), Z(PLANK.z - PLANK.hw), PLANK.len * s, 2 * PLANK.hw * s);
  ctx.fillStyle = '#c9a678';
  ctx.fillRect(X(MOAT_BRIDGE.x0), Z(-MOAT_BRIDGE.hw), (MOAT_BRIDGE.x1 - MOAT_BRIDGE.x0) * s, 2 * MOAT_BRIDGE.hw * s);
  ctx.strokeRect(X(MOAT_BRIDGE.x0), Z(-MOAT_BRIDGE.hw), (MOAT_BRIDGE.x1 - MOAT_BRIDGE.x0) * s, 2 * MOAT_BRIDGE.hw * s);
  // 城墙
  for (const w of MAP.walls) {
    if (w.lot) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = Math.max(1, s * 0.4);
      ctx.strokeRect(X(w.lot[0]), Z(w.lot[1]), (w.lot[2] - w.lot[0]) * s, (w.lot[3] - w.lot[1]) * s);
      ctx.fillStyle = 'rgba(246,238,216,0.6)';
      ctx.fillRect(X(w.lot[0]), Z(w.lot[1]), (w.lot[2] - w.lot[0]) * s, (w.lot[3] - w.lot[1]) * s);
      continue;
    }
    for (const [z0, z1] of [[w.z0, -GATE.halfZ], [GATE.halfZ, w.z1]]) {
      ctx.fillStyle = '#c8b185';
      ctx.fillRect(X(w.x - 4.6 * GATE.K), Z(z0), 9.2 * GATE.K * s, (z1 - z0) * s);
      ctx.strokeRect(X(w.x - 4.6 * GATE.K), Z(z0), 9.2 * GATE.K * s, (z1 - z0) * s);
    }
    ctx.fillStyle = '#a9a69c';
    for (const [z0, z1] of [[-GATE.halfZ, -GATE.pass], [GATE.pass, GATE.halfZ]]) {
      ctx.fillRect(X(w.x - GATE.halfX), Z(z0), 2 * GATE.halfX * s, (z1 - z0) * s);
      ctx.strokeRect(X(w.x - GATE.halfX), Z(z0), 2 * GATE.halfX * s, (z1 - z0) * s);
    }
    ctx.fillStyle = '#8e9896';
    ctx.fillRect(X(w.x - 5 * GATE.K), Z(-11 * GATE.K), 10 * GATE.K * s, 22 * GATE.K * s);
    ctx.strokeRect(X(w.x - 5 * GATE.K), Z(-11 * GATE.K), 10 * GATE.K * s, 22 * GATE.K * s);
  }
  // 房屋
  for (const h of MAP.houses) {
    ctx.save();
    ctx.translate(X(h.x), Z(h.z));
    ctx.rotate(-h.rot);
    ctx.fillStyle = h.home ? '#c98f7c' : h.thatch ? '#d2bd88' : h.big ? '#8e9896' : '#a3acaa';
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(0.9, s * 0.3);
    ctx.fillRect((-h.w / 2) * s, (-h.d / 2) * s, h.w * s, h.d * s);
    ctx.strokeRect((-h.w / 2) * s, (-h.d / 2) * s, h.w * s, h.d * s);
    ctx.beginPath();
    ctx.moveTo((-h.w / 2) * s, 0);
    ctx.lineTo((h.w / 2) * s, 0);
    ctx.globalAlpha = 0.6;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // 树
  for (const t of MAP.trees) {
    const r = (t.type === 'blossom' ? 1.5 : 2.3) * t.s * s;
    ctx.fillStyle = t.type === 'blossom' ? 'rgba(226,150,150,0.62)' : t.type === 'willow' ? 'rgba(134,164,126,0.58)' : 'rgba(104,138,112,0.6)';
    ctx.beginPath();
    ctx.arc(X(t.x), Z(t.z), r, 0, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(58,72,54,0.5)';
    ctx.lineWidth = Math.max(0.5, s * 0.15);
    ctx.stroke();
  }
  return c;
}

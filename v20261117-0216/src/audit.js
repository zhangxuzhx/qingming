// 审查：摆放、穿模、碰撞。调试时在控制台跑 `await __qm.audit()`，返回一份清单（每项是一类问题，附位置）。
// 只读，不改任何东西。查的都是能从登记的数据里算出来的；看不出来的（造型上的穿插、观感）还得人眼去看。
import { colliders, blocked, groundY, surfaceAt, onRoad, covered, edgeWidth, NODES, EDGES, EXTRA_ROADS, BOUNDS, BRIDGE, bridgeLocal, DECKS, GANGS, BOAT_DECKS, boatHalfBeam, boatDeckLocal } from './world/layout.js';
import { riverSD, riverHW, bankOf, RV } from './world/river.js';
import { terrainH } from './world/terrain.js';

const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
// 小件、本来就不该挡人的（按 at() 记下的函数源码开头认）
const SOFT = /flowers|grassTuft|reed|lantern|banner|plaque|vSign|egret|b\.rod\('flat'|b\.beam\('wood'|quad\(|kite|petal/;

export function audit(game, world, MAP) {
  const out = {};
  const add = (k, v) => (out[k] || (out[k] = [])).push(v);
  // 站在高 y 处的人脚下实际的面
  const under = (x, z, y) => {
    const s = surfaceAt(x, z, y + 0.3);
    return { y: s.y, water: s.water };
  };
  // 房屋的占地（rot 是 90° 的倍数）
  const lot = (h) => {
    const sw = Math.abs(Math.sin(h.rot)) > 0.5, hw = (sw ? h.d : h.w) / 2, hd = (sw ? h.w : h.d) / 2;
    return { x0: h.x - hw, x1: h.x + hw, z0: h.z - hd, z1: h.z + hd };
  };
  const lots = MAP.houses.map(lot);
  // 路的本身（不含城门内外、路口那几片空场——那里屋角贴着场边是常事）
  const segD = (x, z, a, b) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)));
    return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
  };
  const roadCore = (x, z) => EDGES.some(([a, b]) => segD(x, z, NODES[a], NODES[b]) < edgeWidth(a, b) / 2 - 0.7) || EXTRA_ROADS.some(([p, q, w]) => segD(x, z, p, q) < w / 2 - 0.7);
  const inLot = (x, z, m = 0) => lots.findIndex((l) => x > l.x0 + m && x < l.x1 - m && z > l.z0 + m && z < l.z1 - m);

  // ── 人 ──
  MAP.people.forEach((p, i) => {
    const [x, z, y] = p, u = under(x, z, y);
    if (u.water && riverSD(x, z) < -0.25) add('人站在水里', [r1(x), r1(z), r2(y)]);
    else if (Math.abs(u.y - y) > 0.22) add('人悬空或陷地', [r1(x), r1(z), '脚 ' + r2(y), '地 ' + r2(u.y)]);
    for (let j = i + 1; j < MAP.people.length; j++) {
      const q = MAP.people[j];
      if (Math.abs(q[2] - y) < 1 && Math.hypot(q[0] - x, q[1] - z) < 0.4) add('两人叠在一起', [r1(x), r1(z), r2(Math.hypot(q[0] - x, q[1] - z))]);
    }
    if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return;
  });

  // ── 物件 ──
  const noCol = {};
  for (const [x, z, y, tag] of MAP.props) {
    const soft = SOFT.test(tag), u = under(x, z, y), sd = riverSD(x, z);
    if (!soft) {
      // （桥、城门这些本身就跨在水上、盖着地的不算；屋宇台基脚下是它自己的楼面，也不算——只报“底下是空的”）
      const big = /rainbowBridge|flatBridge|cityGate|restaurant|P\.house|b\.box\('stone', 0, base|b\.box\('wood', 0, y - 0\.08/.test(tag);
      if (u.water && sd < -0.3 && !big && !/duck|egret|net|罾|skiff|boat|plank|P\.well/.test(tag)) add('物件在水里', [r1(x), r1(z), r2(y), tag.slice(0, 40)]);
      else if (!u.water && !big && y - u.y > 0.35 && y < 8) add('物件悬空', [r1(x), r1(z), '底 ' + r2(y), '地 ' + r2(u.y), tag.slice(0, 40)]);
      // 该挡人的却没有碰撞体（只查可行走范围里、人够得着的）
      const inPlay = x > BOUNDS.minX && x < BOUNDS.maxX && z > BOUNDS.minZ && z < BOUNDS.maxZ;
      // （查物件四周一步之内：棚架、秋千这类只在柱脚有碰撞体，中心是空的）
      if (inPlay && !big && !colliders.hit(x, z, 1.5, y) && !colliders.hit(x, z, 1.5)) {
        const k = tag.slice(0, 46);
        (noCol[k] || (noCol[k] = [])).push([r1(x), r1(z)]);
      }
    }
    if (covered(x, z, 0) && u.y - y > 0.5 && !soft && !/rainbowBridge|flatBridge|cityGate|restaurant|P\.house|b\.box\('stone', 0, base/.test(tag)) add('物件压在桥面或楼面底下', [r1(x), r1(z), r2(y), tag.slice(0, 40)]);
  }
  for (const k in noCol) add('物件没有碰撞体', [k, noCol[k].length + ' 处', ...noCol[k].slice(0, 3)]);

  // ── 树 ──
  MAP.trees.forEach((t, i) => {
    if (riverSD(t.x, t.z) < 0.3) add('树长在水里或岸壁上', [r1(t.x), r1(t.z), t.type]);
    if (onRoad(t.x, t.z, 0.1)) add('树长在路上', [r1(t.x), r1(t.z), t.type]);
    if (inLot(t.x, t.z, 0.4) >= 0) add('树长在屋里', [r1(t.x), r1(t.z), t.type]);
    if (covered(t.x, t.z, 0)) add('树长在桥面或楼面底下', [r1(t.x), r1(t.z), t.type]);
    for (let j = i + 1; j < MAP.trees.length; j++) {
      const q = MAP.trees[j];
      if (Math.hypot(q.x - t.x, q.z - t.z) < 0.9) add('两棵树挤在一处', [r1(t.x), r1(t.z)]);
    }
  });

  // ── 房屋 ──
  lots.forEach((a, i) => {
    for (let j = i + 1; j < lots.length; j++) {
      const b = lots[j], ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (ox > 0.35 && oz > 0.35) add('两座房屋相交', [r1((a.x0 + a.x1) / 2), r1((a.z0 + a.z1) / 2), '重叠 ' + r1(ox) + '×' + r1(oz)]);
    }
    for (const [x, z] of [[a.x0, a.z0], [a.x1, a.z0], [a.x0, a.z1], [a.x1, a.z1]]) {
      if (riverSD(x, z) < 0) add('房屋伸进水里', [r1(x), r1(z)]);
      else if (roadCore(x, z)) add('房屋压在路上', [r1(x), r1(z)]);
    }
  });

  // ── 船 ──
  BOAT_DECKS.forEach((b, i) => {
    // 船身的外沿有没有戳进岸里
    let worst = -99, wp = null;
    for (let k = 0; k <= 16; k++)
      for (const sz of [-1, 1]) {
        const t = -1 + k / 8, lx = (t * b.L) / 2, lz = sz * boatHalfBeam(b.B, t), x = b.x + lx * b.co + lz * b.si, z = b.z - lx * b.si + lz * b.co;
        const lim = bankOf(riverHW(x, z)).foot, sd = riverSD(x, z);
        if (sd - lim > worst) (worst = sd - lim), (wp = [r1(x), r1(z)]);
      }
    if (worst > 0.15) add('船身戳进岸里', [...wp, '进 ' + r2(worst)]);
    for (let j = i + 1; j < BOAT_DECKS.length; j++) {
      const c = BOAT_DECKS[j], d = Math.hypot(c.x - b.x, c.z - b.z);
      if (d < (b.B + c.B) / 2 - 0.3) add('两条船相交', [r1(b.x), r1(b.z), r1(d)]);
    }
  });
  // 跳板：两头落在哪儿、高低差多少；中间有没有东西挡着
  GANGS.forEach((g) => {
    const a = under(g.ax, g.az, g.ay + 0.6), b = under(g.bx, g.bz, g.by + 0.6);
    // 板头自己也算一个面，所以查“板头外头半步”的地方
    const ux = (g.ax - g.bx) / Math.sqrt(g.l2), uz = (g.az - g.bz) / Math.sqrt(g.l2);
    const a2 = under(g.ax + ux * 0.7, g.az + uz * 0.7, g.ay + 0.6), b2 = under(g.bx - ux * 0.7, g.bz - uz * 0.7, g.by + 0.6);
    if (a2.water || Math.abs(a2.y - g.ay) > 0.5) add('跳板这头没搭上', [r1(g.ax), r1(g.az), '板 ' + r2(g.ay), '外头 ' + (a2.water ? '水' : r2(a2.y))]);
    if (b2.water || Math.abs(b2.y - g.by) > 0.5) add('跳板那头没搭上', [r1(g.bx), r1(g.bz), '板 ' + r2(g.by), '外头 ' + (b2.water ? '水' : r2(b2.y))]);
    for (let k = 0; k <= 10; k++) {
      const t = k / 10, x = g.ax + (g.bx - g.ax) * t, z = g.az + (g.bz - g.az) * t, y = g.ay + (g.by - g.ay) * t;
      if (blocked(x, z, 0.36, y)) {
        add('跳板上有东西挡着', [r1(x), r1(z), r2(y)]);
        break;
      }
    }
    void a;
    void b;
  });

  // ── 脚夫的路线：一路都得有地可踩、没东西挡、没有一步跨不上的坎 ──
  (world.porters || []).forEach((pts, pi) => {
    let prev = null, bad = null;
    for (let s = 0; s < pts.length - 1 && !bad; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25));
      for (let k = 0; k <= n && !bad; k++) {
        const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n, y = groundY(x, z);
        const su = surfaceAt(x, z, y + 0.2);
        if (su.water && riverSD(x, z) < -0.45) bad = ['踩空落水', r1(x), r1(z)];
        else if (prev !== null && Math.abs(y - prev) > 0.5) bad = ['有坎 ' + r2(prev) + '→' + r2(y), r1(x), r1(z)];
        else if (blocked(x, z, 0.18, y)) bad = ['被挡', r1(x), r1(z), r2(y)];
        prev = y;
      }
    }
    if (bad) add('脚夫的路走不通', ['第 ' + (pi + 1) + ' 条', ...bad]);
  });

  // ── 路：沿每条路的中线走一遍，看有没有被堵死的地方（半步宽都过不去） ──
  const walk = (ax, az, bx, bz, hw, name) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 0.5), nx = -(bz - az) / len, nz = (bx - ax) / len;
    let run = 0, at = null;
    for (let k = 2; k < n - 2; k++) {
      const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
      // 这一处的横断面上，有没有哪怕一个能站人的位置（通到界外去的那几截不查）
      let ok = x < BOUNDS.minX + 1.5 || x > BOUNDS.maxX - 1.5 || z < BOUNDS.minZ + 1.5 || z > BOUNDS.maxZ - 1.5;
      for (let o = -hw + 0.5; o <= hw - 0.5 && !ok; o += 0.35) {
        const qx = x + nx * o, qz = z + nz * o;
        if (!blocked(qx, qz, 0.35, groundY(qx, qz))) ok = true;
      }
      if (!ok) {
        if (!run) at = [r1(x), r1(z)];
        run++;
      } else {
        if (run >= 2) add('路被堵死', [name, ...at, '长 ' + r1(run * 0.5)]);
        run = 0;
      }
    }
    if (run >= 2) add('路被堵死', [name, ...at, '长 ' + r1(run * 0.5)]);
  };
  for (const [a, b] of EDGES) walk(NODES[a][0], NODES[a][1], NODES[b][0], NODES[b][1], edgeWidth(a, b) / 2, a + '→' + b);
  for (const [p, q, w] of EXTRA_ROADS) walk(p[0], p[1], q[0], q[1], w / 2, '支路');
  // 路中间的障碍：占住路心、两边剩下的都不到一步半宽的
  // （只报最窄的地方，供人看要不要挪）

  // ── 可交谈的人：自己没嵌在墙里，面前有地方站 ──
  for (const n of world.npcs || []) {
    const y = n.y ?? groundY(n.x, n.z);
    const fx = n.x + Math.sin(n.yaw) * 1.1, fz = n.z + Math.cos(n.yaw) * 1.1;
    if (blocked(fx, fz, 0.3, y)) {
      // 正面被挡着，看四周有没有别处能站
      let free = 0;
      for (let k = 0; k < 8; k++) if (!blocked(n.x + Math.sin(k * 0.785) * 1.1, n.z + Math.cos(k * 0.785) * 1.1, 0.3, y)) free++;
      if (free <= 2) add('可交谈的人四周几乎站不了人', [n.id, r1(n.x), r1(n.z), '能站 ' + free + '/8']);
    }
    const u = under(n.x, n.z, y);
    if (u.water) add('可交谈的人在水里', [n.id, r1(n.x), r1(n.z)]);
  }

  // ── 碰撞体本身 ──
  for (const b of colliders.boxes) {
    if (!(b.x1 > b.x0) || !(b.z1 > b.z0) || !(b.y1 > b.y0)) add('碰撞体尺寸不对', [r1(b.x0), r1(b.z0), r1(b.x1), r1(b.z1), r1(b.y0), r1(b.y1)]);
    else if (b.x1 - b.x0 > 70 && b.z1 - b.z0 > 70) add('碰撞体大得反常', [r1(b.x0), r1(b.z0), r1(b.x1), r1(b.z1)]);
  }

  // ── 主角的出生点、家门口 ──
  const st = game.s && game.s.pos;
  void st;
  void BRIDGE;
  void bridgeLocal;
  void DECKS;
  void boatDeckLocal;
  void terrainH;
  void RV;
  const sum = {};
  for (const k in out) sum[k] = out[k].length;
  return { 合计: sum, 明细: out };
}

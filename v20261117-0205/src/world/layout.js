// 汴京世界的布局数据：范围、虹桥、城门、路网、地点、碰撞与可行走判定
// 约定：+X 为东（画卷右端），-Z 为北（画卷上方）。
// 走向照原画：郊野小路与码头街在汴河北岸（z = EAST_Z）；虹桥斜跨，过桥落到西南岸；
// 自桥头向西是城外街、护城河平桥、城门、城内大街（沿 z = 0），到赵太丞家卷尾而止。
import { RV, riverSD } from './river.js';
import { terrainH } from './terrain.js';

export const WORLD = { minX: -470, maxX: 490, minZ: -200, maxZ: 220 }; // 地表铺设范围
export const BOUNDS = { minX: -402, maxX: 405, minZ: -112, maxZ: 104 }; // 可行走范围
export const ROAD_HW = 6.4; // 主街半宽
export const EAST_Z = -34; // 河北岸那条街（码头街、郊野小路的西端）

// 虹桥：木构叠梁拱，斜跨汴河。局部坐标 s 沿桥轴（西南端为负、东北端为正），t 横向
export const BRIDGE = { xc: -3, zc: -17, ang: Math.PI / 6, L: 34, H: 7.6, hw: 5.2, span: RV.HW + 1 };
const BC = Math.cos(BRIDGE.ang), BS = Math.sin(BRIDGE.ang);
export const bridgeLocal = (x, z) => {
  const dx = x - BRIDGE.xc, dz = z - BRIDGE.zc;
  return [dx * BC - dz * BS, dx * BS + dz * BC];
};
export const bridgeWorld = (s, t = 0) => [BRIDGE.xc + s * BC + t * BS, BRIDGE.zc - s * BS + t * BC];
// 桥面、拱腹在桥轴上某处的高度
export function bridgeProfile(s) {
  const t = s / BRIDGE.L;
  if (Math.abs(t) >= 1) return 0;
  const k = 1 - t * t;
  return BRIDGE.H * k * k;
}
export function bridgeSoffit(s) {
  const u = s / BRIDGE.span;
  return -0.2 + (BRIDGE.H - 1.2 + 0.2) * (1 - u * u);
}
export function bridgeDeckY(x, z) {
  const [s, t] = bridgeLocal(x, z);
  return Math.abs(t) <= BRIDGE.hw + 0.8 ? bridgeProfile(s) : 0;
}

export const MOAT_BRIDGE = { x0: RV.MOAT_X - 11, x1: RV.MOAT_X + 11, hw: 6.6, y: 0.16 };
// 城门：构件按 base 的尺寸搭，再整体放大 K 倍
const GK = 1.3, G0 = { pass: 3.3, halfZ: 14, halfX: 7, wallH: 8.5, blockH: 9.5 };
export const GATE = { x: -262, K: GK, base: G0, pass: G0.pass * GK, halfZ: G0.halfZ * GK, halfX: G0.halfX * GK, wallH: G0.wallH * GK, blockH: G0.blockH * GK };
export const HOME = { x: -372, z: -64, w: 24, d: 26, hallZ: -6.5, hallW: 13, hallD: 7.5, floorY: 0.45 };
// 卷首溪上的小板桥
export const PLANK = { x: 381, z: -36, len: 11, hw: 1.7, y: 0.22 };

// ───────────────────────── 路网 ─────────────────────────
export const NODES = {
  // 郊野小路：自卷首蜿蜒向西
  r0: [403, -38], rb: [381, -36], r1: [346, -45], r2: [306, -31], r3: [264, -43], r4: [228, -36],
  // 码头街（河北岸）与下河的岔口
  s1: [200, -34], s2: [152, -34], d2: [152, -11], s3: [102, -34], d3: [102, -11], s4: [58, -34],
  // 虹桥两头
  bn: [28, -35], bs: [-34, 1],
  // 城外街
  w0: [-72, 0], w1: [-119, 0], w1n: [-119, -62], w1s: [-119, 60], w2: [-172, 0],
  m1: [-212, 0], m2: [-244, 0], g: [-278, 0],
  // 城内
  c1: [-310, 0], c2: [-342, 0], c2n: [-342, -46], c2nn: [-342, -92], c2s: [-342, 58],
  a1: [-372, -46], h: [-372, -56],
  c3: [-372, 0], c4: [-398, 0],
};
export const EDGES = [
  ['r0', 'rb'], ['rb', 'r1'], ['r1', 'r2'], ['r2', 'r3'], ['r3', 'r4'], ['r4', 's1'],
  ['s1', 's2'], ['s2', 'd2'], ['s2', 's3'], ['s3', 'd3'], ['s3', 's4'], ['s4', 'bn'], ['bn', 'bs'], ['bs', 'w0'],
  ['w0', 'w1'], ['w1', 'w1n'], ['w1', 'w1s'], ['w1', 'w2'], ['w2', 'm1'], ['m1', 'm2'], ['m2', 'g'],
  ['g', 'c1'], ['c1', 'c2'], ['c2', 'c2n'], ['c2n', 'c2nn'], ['c2', 'c2s'], ['c2n', 'a1'], ['a1', 'h'], ['c2', 'c3'], ['c3', 'c4'],
];
// 道路宽度（用于地表绘制与行人偏移）
export const EDGE_W = {
  'r0-rb': 3.4, 'rb-r1': 5.4, 'r1-r2': 5.4, 'r2-r3': 5.4, 'r3-r4': 5.8, 'r4-s1': 7,
  's2-d2': 8, 's3-d3': 8, 's4-bn': 10, 'bn-bs': 8.6, 'bs-w0': 11,
  'w1-w1n': 9, 'w1-w1s': 9, 'c2-c2n': 9, 'c2n-c2nn': 9, 'c2-c2s': 9, 'c2n-a1': 6, 'a1-h': 3,
};
export const edgeWidth = (a, b) => EDGE_W[`${a}-${b}`] || EDGE_W[`${b}-${a}`] || ROAD_HW * 2;
// 画在地上、舆图上，但行人不走的路：出画的那几截、河边的纤道与卸货的埠头
export const EXTRA_ROADS = [
  [[403, -38], [480, -30], 5.4], [[-398, 0], [-470, 0], ROAD_HW * 2],
  [[-119, 60], [-119, 150], 7], [[-342, -92], [-342, -190], 7], [[-342, 58], [-342, 150], 7], [[-372, -46], [-396, -46], 5],
  [[206, -10], [36, -10], 9], [[-119, -62], [-116, -76], 9],
  [[326, -91], [246, -66], 3.6], [[246, -66], [230, -40], 3.6],
];
// 汴河南岸的柳堤（隋堤烟柳）：自虹桥西南桥堍沿岸向东
export const DYKE = [[-26, 11], [-16, 22], [10, 40], [50, 48.5], [150, 48.5], [200, 53], [236, 66], [262, 82]];
for (let i = 0; i < DYKE.length - 1; i++) EXTRA_ROADS.push([DYKE[i], DYKE[i + 1], 3.2]);

function segDist(x, z, a, b) {
  const ux = b[0] - a[0], uz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ux + (z - a[1]) * uz) / (ux * ux + uz * uz || 1)));
  return Math.hypot(x - a[0] - ux * t, z - a[1] - uz * t);
}
// (x,z) 是否在路上（m：路沿外再让出的距离）
export function onRoad(x, z, m = 1.6) {
  for (const [a, b] of EDGES) if (segDist(x, z, NODES[a], NODES[b]) < edgeWidth(a, b) / 2 + m) return true;
  for (const [p, q, w] of EXTRA_ROADS) if (segDist(x, z, p, q) < w / 2 + m) return true;
  // 城门内外的空场、车轮作坊路口
  if (Math.abs(z) < 14 + m && ((x > GATE.x - 36 - m && x < GATE.x + 34 + m) || Math.abs(x + 119) < 13 + m)) return true;
  return false;
}

const ADJ = {};
for (const [a, b] of EDGES) {
  (ADJ[a] ||= []).push(b);
  (ADJ[b] ||= []).push(a);
}
export const adjacency = ADJ;

export function nearestNode(x, z, filter) {
  let best = null, bd = 1e9;
  for (const k in NODES) {
    if (filter && !filter(k)) continue;
    const d = Math.hypot(NODES[k][0] - x, NODES[k][1] - z);
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

// 自 (x,z) 至目标节点的路线（节点序列）；起点取“到节点距离 + 节点到终点路程”最小者
export function route(x, z, target) {
  const dist = {}, prev = {};
  for (const k in NODES) dist[k] = 1e9;
  dist[target] = 0;
  const open = new Set(Object.keys(NODES));
  while (open.size) {
    let u = null;
    for (const k of open) if (u === null || dist[k] < dist[u]) u = k;
    open.delete(u);
    for (const v of ADJ[u] || []) {
      const d = dist[u] + Math.hypot(NODES[u][0] - NODES[v][0], NODES[u][1] - NODES[v][1]);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  let start = null, bd = 1e9;
  for (const k in NODES) {
    const d = Math.hypot(NODES[k][0] - x, NODES[k][1] - z) * 1.25 + dist[k];
    if (d < bd) { bd = d; start = k; }
  }
  const path = [start];
  let cur = start;
  while (cur !== target && prev[cur]) { cur = prev[cur]; path.push(cur); }
  // 若已越过起点节点（下一节点更顺路），则略去它
  if (path.length > 1) {
    const [ax, az] = NODES[path[0]], [bx, bz] = NODES[path[1]];
    const t = ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2);
    if (t > 0.02) path.shift();
  }
  return { path, length: bd };
}

// ───────────────────────── 地点 ─────────────────────────
// x/z：在这个世界里的位置（方位照原画：街的哪一侧、路口的哪一角）。
// pu/pv：在《清明上河图》原画画心上的位置（0~1，自左而右、自上而下），逐一放大原画核对过招牌所在。
export const POIS = [
  { id: 'home', name: '沈宅', sub: '甜水巷 · 自家宅院', x: -372, z: -53, node: 'h', pu: 0.03, pv: 0.07, own: true },
  { id: 'zhao', name: '赵太丞家', sub: '医铺 · 卷尾街北', x: -383, z: -8, node: 'c3', pu: 0.021, pv: 0.4 },
  { id: 'antique', name: '墨缘斋', sub: '字画古玩', x: -386, z: 8, node: 'c4', pu: 0.012, pv: 0.86, own: true },
  { id: 'xiang', name: '刘家上色沉檀拣香', sub: '香药铺 · 路口西北角', x: -353, z: -8, node: 'c2', pu: 0.063, pv: 0.45 },
  { id: 'silk', name: '王家罗锦匹帛铺', sub: '收绸缎 · 北横街里', x: -333, z: -34, node: 'c2n', pu: 0.071, pv: 0.07 },
  { id: 'inn', name: '久住王员外家', sub: '客店 · 路口东南', x: -329, z: 8, node: 'c2', pu: 0.078, pv: 0.8 },
  { id: 'sunyang', name: '孙羊正店', sub: '酒楼 · 收米炭鲜货', x: -309, z: -8, node: 'c1', pu: 0.112, pv: 0.25 },
  { id: 'gate', name: '城门楼', sub: '入城', x: -262, z: 0, node: 'g', pu: 0.17, pv: 0.34 },
  { id: 'flower', name: '花木担', sub: '盆景花卉', x: -190, z: 9, node: 'w2', pu: 0.262, pv: 0.72, own: true },
  { id: 'cross', name: '十字街口', sub: '城外街市 · 车轮作坊', x: -119, z: 0, node: 'w1', pu: 0.347, pv: 0.5 },
  { id: 'porcelain', name: '汝州瓷器铺', sub: '瓷器茶具', x: -92, z: -8, node: 'w0', pu: 0.38, pv: 0.42, own: true },
  { id: 'shiqian', name: '十千脚店', sub: '酒店 · 天之美禄', x: -56, z: 9, node: 'bs', pu: 0.441, pv: 0.62 },
  { id: 'bridge', name: '虹桥', sub: '汴河飞虹', x: -3, z: -17, node: 'bs', pu: 0.49, pv: 0.4 },
  { id: 'dock', name: '汴河码头', sub: '纲船收货处', x: 152, z: -12, node: 'd2', pu: 0.68, pv: 0.3 },
  { id: 'farm', name: '郊野村舍', sub: '炭与春笋', x: 338, z: -52, node: 'r1', pu: 0.905, pv: 0.42 },
];
export const poi = (id) => POIS.find((p) => p.id === id);

// 分区（进入时显示地名）
export function districtAt(x, z) {
  if (Math.abs(x - HOME.x) < HOME.w / 2 && Math.abs(z - HOME.z) < HOME.d / 2) return '沈宅';
  if (x > 316) return '杏花村';
  if (x > 214) return '郊野';
  if (x > -24 && x < 268 && z > 20) {
    const sd = riverSD(x, z);
    if (sd > 0 && sd < 20) return '隋堤烟柳';
  }
  const [bs, bt] = bridgeLocal(x, z);
  if (Math.abs(bs) < 58 && Math.abs(bt) < 46) return '虹桥';
  if (x > 0) return '汴河码头';
  if (x > -214) return '城外街市';
  if (x > -284) return '城门';
  if (z < -39 && z > -52 && x < -347) return '甜水巷';
  return '城内街市';
}

// 世界 X → 原画横向位置（分段线性）
const X2U = [[-402, 0.0], [-383, 0.021], [-353, 0.063], [-342, 0.073], [-309, 0.112], [-262, 0.17], [-228, 0.213], [-119, 0.347], [-56, 0.441], [-3, 0.49], [102, 0.62], [200, 0.74], [250, 0.8], [338, 0.905], [381, 0.965], [405, 0.992]];
export function worldToScrollU(x) {
  if (x <= X2U[0][0]) return X2U[0][1];
  for (let i = 1; i < X2U.length; i++) {
    if (x <= X2U[i][0]) {
      const [x0, u0] = X2U[i - 1], [x1, u1] = X2U[i];
      return u0 + ((x - x0) / (x1 - x0)) * (u1 - u0);
    }
  }
  return X2U[X2U.length - 1][1];
}

// ───────────────────────── 碰撞 ─────────────────────────
// 每个碰撞盒带高度段 [y0, y1]：墙只挡站在它那一层的人，楼上的栏杆不碍楼下行走。
class Colliders {
  constructor(cell = 12) {
    this.cell = cell;
    this.map = new Map();
    this.boxes = [];
    this.lots = [];
  }
  // 宅基：屋里虽能走人，种树、撒房子时仍要整块避开
  addLot(x0, z0, x1, z1) {
    this.lots.push({ x0, z0, x1, z1 });
  }
  // 不写高度的，按地面上的寻常物件算（树干、摊子、车马）：只占到 5 米高，不碍城头与楼上
  // “自地面起”的盒子（没给下沿的）：上沿按所在处的地面算，坡上的篱笆、柴垛才挡得住人。abs 为真则上沿是绝对高度（建筑登记时用）
  add(x0, z0, x1, z1, y0 = -1e9, y1 = 5, abs = false) {
    if (x0 > x1) [x0, x1] = [x1, x0];
    if (z0 > z1) [z0, z1] = [z1, z0];
    if (!abs && y0 === -1e9 && y1 < 1e8) y1 += terrainH((x0 + x1) / 2, (z0 + z1) / 2);
    const b = { x0, z0, x1, z1, y0, y1 };
    this.boxes.push(b);
    const c = this.cell;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const k = i + ',' + j;
        let l = this.map.get(k);
        if (!l) this.map.set(k, (l = []));
        l.push(b);
      }
    return b;
  }
  // 以中心、尺寸、朝向（90° 的倍数）登记
  addRect(x, z, w, d, rot = 0, y0, y1) {
    const sw = Math.abs(Math.sin(rot)) > 0.5;
    const hw = (sw ? d : w) / 2, hd = (sw ? w : d) / 2;
    return this.add(x - hw, z - hd, x + hw, z + hd, y0, y1);
  }
  // 斜放的盒子（船上的篷舱、舵楼、船身）：中心、半长半宽、朝向（弧度，与 Object3D.rotation.y 同向）、上下沿（绝对高度）
  addOBB(cx, cz, hx, hz, rot, y0, y1) {
    const co = Math.cos(rot), si = Math.sin(rot), ex = Math.abs(co) * hx + Math.abs(si) * hz, ez = Math.abs(si) * hx + Math.abs(co) * hz;
    const b = this.add(cx - ex, cz - ez, cx + ex, cz + ez, y0, y1, true);
    Object.assign(b, { cx, cz, hx, hz, co, si });
    return b;
  }
  // py：脚底高度（不给则不论高低）。身高 h 的人，自脚上 0.35（可迈过的门槛）到头顶这一段与盒子相交才算撞上
  hit(x, z, r, py, h = 1.7) {
    if (py === undefined) for (const t of this.lots) if (x > t.x0 - r && x < t.x1 + r && z > t.z0 - r && z < t.z1 + r) return true;
    const c = this.cell;
    for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++)
      for (let j = Math.floor((z - r) / c); j <= Math.floor((z + r) / c); j++) {
        const l = this.map.get(i + ',' + j);
        if (!l) continue;
        for (const b of l) {
          if (py !== undefined && (py + 0.35 >= b.y1 || py + h <= b.y0)) continue;
          if (b.hx !== undefined) {
            // 斜放的：换到盒子自己的坐标里比
            const dx = x - b.cx, dz = z - b.cz, lx = dx * b.co - dz * b.si, lz = dx * b.si + dz * b.co;
            const qx = Math.max(-b.hx, Math.min(lx, b.hx)), qz = Math.max(-b.hz, Math.min(lz, b.hz));
            if ((lx - qx) ** 2 + (lz - qz) ** 2 < r * r) return true;
            continue;
          }
          const nx = Math.max(b.x0, Math.min(x, b.x1)), nz = Math.max(b.z0, Math.min(z, b.z1));
          if ((x - nx) ** 2 + (z - nz) ** 2 < r * r) return true;
        }
      }
    return false;
  }
}
export const colliders = new Colliders();

// ───────────────────────── 可行走的面 ─────────────────────────
// 平面（屋内地面、楼面、栈桥、城头）与斜面（楼梯、马道）；可以上下叠层
export const DECKS = [];
const DCELL = 16, deckGrid = new Map();
function putDeck(d) {
  DECKS.push(d);
  for (let i = Math.floor(d.x0 / DCELL); i <= Math.floor(d.x1 / DCELL); i++)
    for (let j = Math.floor(d.z0 / DCELL); j <= Math.floor(d.z1 / DCELL); j++) {
      const k = i + ',' + j;
      let l = deckGrid.get(k);
      if (!l) deckGrid.set(k, (l = []));
      l.push(d);
    }
}
export function addDeck(x0, z0, x1, z1, y) {
  putDeck({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y, yb: y, ax: 0 });
}
// 斜面：沿 axis（'x' / 'z'）自坐标小的一端 ya 升（降）到大的一端 yb
export function addRamp(x0, z0, x1, z1, axis, ya, yb) {
  putDeck({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y: ya, yb, ax: axis === 'x' ? 1 : 2 });
}
// ── 船：甲板是能走的。船身随水流斜着泊，甲板中间低、两头翘，不是一块平的矩形，所以单算 ──
// 断面与 parts.js 的 boat() 一致：t = 船长方向 -1（船头）…1（船尾）
export const boatHalfBeam = (B, t) => (B / 2) * (1 - 0.5 * Math.abs(t) ** 3);
export const boatDeckLocal = (t) => 0.39 + 0.8 * Math.abs(t) ** 2.2 + (t > 0 ? 0.3 * t * t : 0);
export const BOAT_DECKS = [];
export function addBoatDeck(x, z, rot, L, B, y) {
  BOAT_DECKS.push({ x, z, L, B, y, co: Math.cos(rot), si: Math.sin(rot), R: L / 2 + 1 });
}
// 跳板（搭在岸与船、船与船之间的斜板）：两端的位置与高度、半宽
export const GANGS = [];
export function addGang(ax, ay, az, bx, by, bz, hw = 0.5) {
  GANGS.push({ ax, ay, az, bx, by, bz, hw, l2: (bx - ax) ** 2 + (bz - az) ** 2 });
}
// (x,z) 处船的甲板或跳板的高；不在其上则 null。脚底高 py 的人迈不上去的（高出一步以上）不算
function boatAt(x, z, py) {
  let best = null;
  for (const g of GANGS) {
    const u = Math.max(0, Math.min(1, ((x - g.ax) * (g.bx - g.ax) + (z - g.az) * (g.bz - g.az)) / g.l2));
    const dx = x - (g.ax + (g.bx - g.ax) * u), dz = z - (g.az + (g.bz - g.az) * u);
    if (dx * dx + dz * dz > g.hw * g.hw) continue;
    const h = g.ay + (g.by - g.ay) * u;
    if (h <= py + STEP && (best === null || h > best)) best = h;
  }
  for (const b of BOAT_DECKS) {
    const dx = x - b.x, dz = z - b.z;
    if (Math.abs(dx) > b.R || Math.abs(dz) > b.R) continue;
    const lx = dx * b.co - dz * b.si, lz = dx * b.si + dz * b.co, t = (2 * lx) / b.L;
    if (Math.abs(t) > 0.97 || Math.abs(lz) > boatHalfBeam(b.B, t) - 0.1) continue;
    const h = b.y + boatDeckLocal(t);
    if (h <= py + STEP && (best === null || h > best)) best = h;
  }
  return best;
}
const deckH = (d, x, z) => (d.ax === 0 ? d.y : d.ax === 1 ? d.y + ((d.yb - d.y) * (x - d.x0)) / (d.x1 - d.x0) : d.y + ((d.yb - d.y) * (z - d.z0)) / (d.z1 - d.z0));

// 这一处上头有没有桥面、楼面、栈台、亭台盖着（长草、落花、灌木都要让开：它们是按地面的高度种的，
// 盖得低的地方会从板缝里钻出来）。m：四周多让出的距离
export function covered(x, z, m = 0.5) {
  const [bs, bt] = bridgeLocal(x, z);
  if (Math.abs(bs) < BRIDGE.L + 2 + m && Math.abs(bt) <= BRIDGE.hw + 0.9 + m) return true;
  for (let i = Math.floor((x - m) / DCELL); i <= Math.floor((x + m) / DCELL); i++)
    for (let j = Math.floor((z - m) / DCELL); j <= Math.floor((z + m) / DCELL); j++) {
      const l = deckGrid.get(i + ',' + j);
      if (l) for (const d of l) if (x > d.x0 - m && x < d.x1 + m && z > d.z0 - m && z < d.z1 + m) return true;
    }
  return false;
}

const BLOCK = -999, STEP = 0.82;
function bridgeAt(x, z) {
  const [bs, bt] = bridgeLocal(x, z);
  if (Math.abs(bs) < BRIDGE.L) {
    const at = Math.abs(bt), y = bridgeProfile(bs);
    if (at <= BRIDGE.hw - 0.45) return y;
    if (at <= BRIDGE.hw + 0.7 && y > 0.3) return BLOCK;
  }
  return null;
}
// 脚底高 py 的人在 (x,z) 处能踏上的最高的面（高出脚底不超过一步）
function deckAt(x, z, py) {
  let best = null;
  const l = deckGrid.get(Math.floor(x / DCELL) + ',' + Math.floor(z / DCELL));
  if (l)
    for (const d of l) {
      if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue;
      const h = deckH(d, x, z);
      if (h <= py + STEP && (best === null || h > best)) best = h;
    }
  // 船与跳板（在水上，只在近水处才查）
  if (BOAT_DECKS.length && riverSD(x, z) < 3) {
    const h = boatAt(x, z, py);
    if (h !== null && (best === null || h > best)) best = h;
  }
  return best;
}

// 贴地的高度（给行人、摆设用）：虹桥桥面，或一步可及的低台
export function groundY(x, z) {
  const br = bridgeAt(x, z);
  if (br !== null && br !== BLOCK) return br;
  const t = terrainH(x, z), d = deckAt(x, z, t + 0.45);
  // 水面上（船的甲板、跳板）没有地面可言，甲板多高就是多高
  return d === null ? t : riverSD(x, z) < 0 ? d : Math.max(d, t);
}

// py：脚底高度。栏杆只挡与桥面齐平的人——跃起可越，泅水可自桥下过；河水不是墙。
export function blocked(x, z, r = 0.35, py = 0) {
  if (x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ) return true;
  if (bridgeAt(x, z) === BLOCK) {
    const dy = py - bridgeProfile(bridgeLocal(x, z)[0]);
    if (dy < 0.8 && dy > -1.3) return true;
  }
  return colliders.hit(x, z, r, py);
}
export function inRailZone(x, z) {
  return bridgeAt(x, z) === BLOCK;
}
// 脚下是什么：{ y 高度, water 是否水面 }
const _surf = { y: 0, water: false };
export function surfaceAt(x, z, py) {
  const br = bridgeAt(x, z);
  let d = deckAt(x, z, py);
  if (br !== null && br !== BLOCK && py >= br - STEP && (d === null || br > d)) d = br;
  _surf.water = false;
  if (d !== null) _surf.y = riverSD(x, z) < 0 ? d : Math.max(d, terrainH(x, z));
  else if (riverSD(x, z) < 0) {
    _surf.y = RV.WATER_Y;
    _surf.water = true;
  } else _surf.y = terrainH(x, z);
  return _surf;
}
export const outOfBounds = (x, z) => x < BOUNDS.minX || x > BOUNDS.maxX || z < BOUNDS.minZ || z > BOUNDS.maxZ;

// 顶棚：镜头在屋内时不得高过它
export const CEILS = [];
export function addCeil(x0, z0, x1, z1, y) {
  CEILS.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y });
}
export function ceilAt(x, z, py) {
  let best = Infinity;
  for (const c of CEILS) if (x >= c.x0 && x <= c.x1 && z >= c.z0 && z <= c.z1 && c.y > py + 1.9 && c.y < best) best = c.y;
  return best;
}

// 登记一座建筑的墙、楼面、楼梯与顶棚。info 由构件函数给出，用的是 b.place(x, 0, z, rot) 的局部坐标（rot 为 90° 的倍数）：
//   solids [x0, z0, x1, z1, y0?, y1?]   decks [x0, z0, x1, z1, y]
//   ramps  [x0, z0, x1, z1, 'x'|'z', 小端高, 大端高]   ceils [x0, z0, x1, z1, y]
// yOff：建筑所在处的地面高（起伏的地形上，墙、楼面、顶棚都跟着抬）
export function register(info, x, z, rot = 0, yOff = 0) {
  const Y = (v) => (v === undefined || Math.abs(v) > 1e8 ? v : v + yOff);
  const c = Math.round(Math.cos(rot)), s = Math.round(Math.sin(rot));
  const W = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
  const R = (r) => {
    const a = W(r[0], r[1]), b = W(r[2], r[3]);
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])];
  };
  let lot = null;
  for (const r of info.solids || []) {
    const q = R(r);
    colliders.add(q[0], q[1], q[2], q[3], Y(r[4]) ?? -1e9, Y(r[5]) ?? 1e9, true);
    lot = lot ? [Math.min(lot[0], q[0]), Math.min(lot[1], q[1]), Math.max(lot[2], q[2]), Math.max(lot[3], q[3])] : q;
  }
  if (lot && info.lot !== false) colliders.addLot(lot[0], lot[1], lot[2], lot[3]);
  for (const r of info.decks || []) {
    const q = R(r);
    addDeck(q[0], q[1], q[2], q[3], r[4] + yOff);
  }
  for (const r of info.ramps || []) {
    const q = R(r), lo = W(r[0], r[1]), hi = r[4] === 'x' ? W(r[2], r[1]) : W(r[0], r[3]);
    const ax = Math.abs(hi[0] - lo[0]) > Math.abs(hi[1] - lo[1]) ? 'x' : 'z';
    const asc = ax === 'x' ? hi[0] > lo[0] : hi[1] > lo[1];
    addRamp(q[0], q[1], q[2], q[3], ax, (asc ? r[5] : r[6]) + yOff, (asc ? r[6] : r[5]) + yOff);
  }
  for (const r of info.ceils || []) {
    const q = R(r);
    addCeil(q[0], q[1], q[2], q[3], r[4] + yOff);
  }
}

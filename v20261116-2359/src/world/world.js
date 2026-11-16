// 组装整座汴京：材质、地表、河道、远山，以及各分区的建造上下文
import * as THREE from 'three';
import { RNG } from '../util.js';
import { Batch, buildObject } from '../engine/batch.js';
import { inkMat, groundMat, waterMat, shared, markDynamic } from '../engine/ink.js';
import { SignAtlas, mkCanvas, toTex } from '../engine/textures.js';
import { RV, riverSD, CHANNELS, bankOf } from './river.js';
import { meadow, vnoise } from './cover.js';
import { terrainH, T_RECT, T_STEP, T_NX, T_NZ, T_GRID } from './terrain.js';
import { WORLD, ROAD_HW, EAST_Z, NODES, EDGES, EXTRA_ROADS, BRIDGE, edgeWidth, onRoad, colliders, groundY, HOME, GATE, register } from './layout.js';
import * as P from './parts.js';
import { figure, randomLook } from './figures.js';
import { buildSections } from './sections.js';

const W_ = P.W_;
// 供小地图/舆图绘制的记录
// people / props：每个站着的人、每件摆设落在哪（审查位置与碰撞用）
export const MAP = { houses: [], trees: [], piers: [], fields: [], boats: [], walls: [], people: [], props: [] };

function makeMaterials(tex, atlas) {
  const D = THREE.DoubleSide;
  const leaf = (map, x) => inkMat({ map, alphaTest: true, wind: true, side: D, shade: 0.82, wash: 0.16, leaf: true, ...x });
  return {
    flat: inkMat({ side: D }),
    plaster: inkMat({ map: tex.plaster, world: true, scale: 0.22, side: D, tint: [1.23, 1.22, 1.18], weather: true, bump: 0.004 }),
    earth: inkMat({ map: tex.earthWall, world: true, scale: 0.2, side: D, weather: true, bump: 0.012 }),
    wood: inkMat({ map: tex.wood, world: true, scale: 0.32, side: D, bump: 0.01 }),
    brick: inkMat({ map: tex.brick, world: true, scale: 0.42, side: D, weather: true, bump: 0.014 }),
    stone: inkMat({ map: tex.stone, world: true, scale: 0.3, side: D, bump: 0.012 }),
    mat: inkMat({ map: tex.mat, world: true, scale: 0.55, side: D }),
    bank: inkMat({ map: tex.bank, world: true, scale: 0.2, side: D, upN: true }),
    bankFace: inkMat({ map: tex.bank, world: true, scale: 0.2, side: D }), // 岸壁：法线照实，沿口、水线处才勾得出线
    bark: inkMat({ map: tex.bark, world: true, scale: 0.4, side: D, bump: 0.03 }),
    lattice: inkMat({ map: tex.lattice, world: true, scale: 1.1, side: D, nightGlow: true }),
    cloth: inkMat({ map: tex.cloth, world: true, scale: 0.9, side: D, tint: [1.06, 1.06, 1.04] }),
    sail: inkMat({ map: tex.cloth, world: true, scale: 0.5, side: D, shade: 0.5, tint: [1.12, 1.07, 0.96] }),
    flag: inkMat({ map: tex.cloth, world: true, scale: 0.9, side: D, wind: true, tint: [1.06, 1.06, 1.04] }),
    rafter: inkMat({ map: tex.rafter, side: D }),
    eave: inkMat({ map: tex.eave, side: D }),
    tile: inkMat({ map: tex.tile, side: D, tile: true, bump: 0.01 }),
    thatch: inkMat({ map: tex.thatch, side: D, bump: 0.03 }),
    plank: inkMat({ map: tex.plank, side: D, bump: 0.012 }),
    sign: inkMat({ map: atlas.tex, side: D, wash: 0.1, shade: 0.8, tint: [1.1, 1.09, 1.05] }),
    signWind: inkMat({ map: atlas.tex, side: D, wind: true, wash: 0.1, shade: 0.8, tint: [1.1, 1.09, 1.05] }),
    face: inkMat({ map: tex.face, side: D, shade: 0.6, wash: 0.06, tint: [1.12, 1.1, 1.06], life: true }),
    // 人物、牲畜：晕染压低（世界空间的浓淡不该在走动的人身上“游”）
    fig: inkMat({ side: D, wash: 0.07, shade: 0.85 }),
    robe: inkMat({ map: tex.robe, side: D, wash: 0.07, shade: 0.85, life: true }),
    willow: leaf(tex.willow),
    leafA: leaf(tex.leafA),
    leafB: leaf(tex.leafB),
    leafC: leaf(tex.leafC),
    blossom: leaf(tex.blossom),
    pine: leaf(tex.pine),
    // 草、花：远了整丛隐去、不勾线（fade / inkFade 是起止距离，米）；成片的菜花留到很远
    grass: leaf(tex.grass, { fade: [75, 135], inkFade: [22, 60] }),
    grassLow: leaf(tex.grassLow, { fade: [34, 74], inkFade: [9, 28] }),
    flower: leaf(tex.flower, { fade: [38, 82], inkFade: [9, 28] }),
    crop: leaf(tex.flower, { inkFade: [12, 36] }),
    // 灯笼：自己发亮，不随日照明暗——黄昏里是一点暖色
    lamp: inkMat({ side: D, shade: 0, wash: 0 }),
    far: inkMat({ noFog: true, flatN: true, side: D, shade: 0, wash: 0.15 }),
    sky: inkMat({ noFog: true, flatN: true, side: THREE.BackSide, shade: 0, wash: 0, depthTest: false }),
    water: waterMat(),
  };
}

// 地表分布图：R 路面 / G 田畴 / B 草色
function makeSplat() {
  const Wp = 2048, sx = Wp / (WORLD.maxX - WORLD.minX), Hp = Math.round((WORLD.maxZ - WORLD.minZ) * sx);
  const c = mkCanvas(Wp, Hp), ctx = c.getContext('2d');
  const X = (x) => (x - WORLD.minX) * sx, Z = (z) => (z - WORLD.minZ) * sx;
  // 草色：照 cover.js 的分布逐点填（半分辨率算，再放大抹匀）
  {
    const w2 = Wp >> 1, h2 = Hp >> 1, lo = mkCanvas(w2, h2), lx = lo.getContext('2d'), img = lx.createImageData(w2, h2), d = img.data;
    for (let j = 0, k = 0; j < h2; j++) {
      const z = WORLD.minZ + ((j + 0.5) * 2) / sx;
      for (let i = 0; i < w2; i++, k += 4) {
        d[k + 2] = Math.round(255 * meadow(WORLD.minX + ((i + 0.5) * 2) / sx, z));
        d[k + 3] = 255;
      }
    }
    lx.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lo, 0, 0, Wp, Hp);
  }
  const hasFilter = 'filter' in ctx;
  ctx.globalCompositeOperation = 'lighter';
  if (hasFilter) ctx.filter = 'blur(1.5px)';
  for (const f of MAP.fields) {
    ctx.save();
    ctx.translate(X(f.x), Z(f.z));
    ctx.rotate(f.rot || 0);
    ctx.fillStyle = 'rgb(0,235,0)';
    ctx.fillRect((-f.w / 2) * sx, (-f.d / 2) * sx, f.w * sx, f.d * sx);
    ctx.restore();
  }
  if (hasFilter) ctx.filter = 'blur(3px)';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgb(255,0,0)';
  const line = (pts, w) => {
    ctx.lineWidth = w * sx;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))));
    ctx.stroke();
  };
  for (const [a, bn] of EDGES) line([NODES[a], NODES[bn]], edgeWidth(a, bn) + 1.6);
  for (const [p, q, w] of EXTRA_ROADS) line([p, q], w + 1.4);
  ctx.fillStyle = 'rgb(255,0,0)';
  ctx.fillRect(X(GATE.x - 34), Z(-13), 24 * sx, 26 * sx); // 城门内广场
  ctx.fillRect(X(-131), Z(-12), 24 * sx, 24 * sx); // 车轮作坊路口
  ctx.fillRect(X(HOME.x - 1.6), Z(HOME.z - 3), 3.2 * sx, 16 * sx); // 宅内甬路
  const t = toTex(c, { repeat: false, mip: true, aniso: 4 });
  t.flipY = false;
  return t;
}

// 辅图：R 灯笼的光晕（夜里映在地上墙上），G 墙根（屋基外一圈），B 树下
function makeAux() {
  const Wp = 1024, sx = Wp / (WORLD.maxX - WORLD.minX), Hp = Math.round((WORLD.maxZ - WORLD.minZ) * sx);
  const c = mkCanvas(Wp, Hp), ctx = c.getContext('2d');
  const X = (x) => (x - WORLD.minX) * sx, Z = (z) => (z - WORLD.minZ) * sx;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, Wp, Hp);
  ctx.globalCompositeOperation = 'lighter';
  if ('filter' in ctx) ctx.filter = 'blur(2.2px)';
  ctx.fillStyle = 'rgb(0,215,0)';
  for (const h of MAP.houses) {
    ctx.save();
    ctx.translate(X(h.x), Z(h.z));
    ctx.rotate(-(h.rot || 0));
    ctx.fillRect((-h.w / 2 - 0.5) * sx, (-h.d / 2 - 0.5) * sx, (h.w + 1) * sx, (h.d + 1) * sx);
    ctx.restore();
  }
  if ('filter' in ctx) ctx.filter = 'none';
  const blob = (x, z, r, col, a) => {
    const g = ctx.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * sx);
    g.addColorStop(0, `rgba(${col},${a})`);
    g.addColorStop(0.55, `rgba(${col},${a * 0.45})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(X(x - r), Z(z - r), 2 * r * sx, 2 * r * sx);
  };
  for (const t of MAP.trees) blob(t.x, t.z, (t.type === 'blossom' ? 2.6 : t.type === 'willow' ? 3.6 : 3.2) * t.s, '0,0,255', 0.8);
  for (const [x, z, s] of P.LAMPS) blob(x, z, 4.0 + 1.8 * s, '255,0,0', 0.3);
  const t = toTex(c, { repeat: false, mip: true });
  t.flipY = false;
  return t;
}

export function buildWorld(scene, tex) {
  const atlas = new SignAtlas();
  const mats = makeMaterials(tex, atlas);
  const b = new Batch();
  const rng = new RNG(20240405);
  const dynamic = []; // 需要逐帧更新的物件（船只起伏等）

  const chunk = (x) => {
    b.chunk = 'c' + Math.floor((x - WORLD.minX) / 75);
  };
  const SHOP_SIGNS = ['茶', '酒', '香饮子', '饮子', '羊肉', '彩帛', '粮', '果子', '馒头', '熟食', '生药', '纸马', '漆器', '杂货', '刀剪', '梳篦', '针铺', '汤饼', '新酒', '小酒', '麻油', '盐', '炊饼'];

  const ctx = {
    scene, tex, mats, atlas, b, rng, dynamic, MAP, chunk, W_,
    npcs: [], // 可交谈的人物
    home: null,
    criers: [], // 吆喝点
    at(x, z, rot, fn, y = 0) {
      if (x || z) MAP.props.push([x, z, y + terrainH(x, z), String(fn).replace(/\s+/g, ' ').slice(0, 64)]);
      chunk(x);
      b.place(x, y + terrainH(x, z), z, rot, fn);
    },
    person(x, z, yaw, look, y) {
      chunk(x);
      const py = y ?? groundY(x, z);
      for (let k = 0; k < 8; k++) {
        const q = MAP.people.find((o) => Math.abs(o[2] - py) < 1 && Math.hypot(o[0] - x, o[1] - z) < 0.5);
        if (!q) break;
        const a = Math.hypot(x - q[0], z - q[1]) > 0.02 ? Math.atan2(z - q[1], x - q[0]) : k * 2.4;
        x = q[0] + Math.cos(a) * 0.58;
        z = q[1] + Math.sin(a) * 0.58;
      }
      MAP.people.push([x, z, py]);
      b.place(x, py, z, yaw, () => figure(b, look || randomLook(rng)));
      // 站着的人也是障碍：主角与行人都得绕着走，不从人身上穿过去
      colliders.add(x - 0.23, z - 0.23, x + 0.23, z + 0.23, py - 0.2, py + 1.7);
    },
    // o.keep：保留松（寺观里用）；o.clear：树干离墙、离物件至少多远
    treeAt(x, z, type = 'willow', s = 1, solid = true, o = {}) {
      if (!o.keep && (type === 'pine' || type === 'rust')) type = 'leaf';
      if (onRoad(x, z, 1.3)) return false; // 路上、空场上不长树
      if (riverSD(x, z) < 1.4) return false;
      // 枝条不往屋里、墙里长：柳丝垂得开，离得要更远些
      if (colliders.hit(x, z, o.clear ?? (type === 'willow' ? 2.9 : type === 'blossom' ? 1.5 : 2.0) * s)) return false;
      chunk(x);
      const tr = new RNG(rng.i(1, 999999999));
      let dim;
      b.place(x, terrainH(x, z), z, tr.f(6.28), () => (dim = P.tree(b, tr, type, s)));
      // 碰撞盒照着看得见的树干来（根部鼓出的那一截）
      const cr = Math.max(0.24, dim.r * 1.12);
      if (solid) colliders.add(x - cr, z - cr, x + cr, z + cr);
      MAP.trees.push({ x, z, type, s });
      return true;
    },
    grassAt(x, z, s = 1) {
      if (riverSD(x, z) < 0.3 || onRoad(x, z, 0.3)) return;
      chunk(x);
      const tr = new RNG(rng.i(1, 999999999));
      b.place(x, terrainH(x, z), z, 0, () => P.grassTuft(b, tr, s));
    },
    // 灌木：只种在墙根、篱边、树下这些不碍走路的地方；也挡人（膝盖高，跳得过去）
    bushAt(x, z, s = 1, key) {
      if (onRoad(x, z, 0.9) || riverSD(x, z) < 1.0 || colliders.hit(x, z, 0.5 * s, 0)) return false;
      chunk(x);
      const tr = new RNG(rng.i(1, 999999999));
      b.place(x, terrainH(x, z), z, tr.f(6.28), () => P.bush(b, tr, s, key || tr.pick(['leafA', 'leafB', 'leafA'])));
      colliders.add(x - 0.42 * s, z - 0.42 * s, x + 0.42 * s, z + 0.42 * s, -1e9, 1.05 * s);
      return true;
    },
    // 竹丛：在一个椭圆里插 n 竿
    bambooAt(x, z, rx, rz, n) {
      const tr = new RNG(rng.i(1, 999999999));
      for (let i = 0; i < n; i++) {
        const a = tr.f(6.283), d = Math.sqrt(tr.r()), px = x + Math.cos(a) * rx * d, pz = z + Math.sin(a) * rz * d;
        if (onRoad(px, pz, 1.0) || riverSD(px, pz) < 1.2 || colliders.hit(px, pz, 0.3, 0)) continue;
        chunk(px);
        b.place(px, terrainH(px, pz), pz, 0, () => P.bamboo(b, tr, tr.f(0.85, 1.15)));
        colliders.add(px - 0.1, pz - 0.1, px + 0.1, pz + 0.1);
      }
    },
    // 篱笆：画出来，也挡人
    fence(pts, h) {
      chunk(pts[0][0]);
      b.place(0, 0, 0, 0, () => P.fence(b, pts, h, terrainH));
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5));
        for (let k = 0; k <= n; k++) {
          const x = ax + ((bx - ax) * k) / n, z = az + ((bz - az) * k) / n;
          colliders.add(x - 0.14, z - 0.14, x + 0.14, z + 0.14, -1e9, 1.3);
        }
      }
    },
    // 院墙：街面上两屋之间的一段矮墙（墙头压瓦），墙后可以出一棵树
    yardWall(x0, z0, x1, z1, h = 1.9) {
      chunk((x0 + x1) / 2);
      const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0);
      b.place((x0 + x1) / 2, 0, (z0 + z1) / 2, ry, () => {
        const id = b.nextId();
        b.box('plaster', 0, h / 2, 0, len, h, 0.3, { id });
        b.box('flat', 0, h + 0.06, 0, len + 0.1, 0.12, 0.56, { color: [0.44, 0.46, 0.48], id: b.nextId() });
        b.box('flat', 0, h + 0.17, 0, len + 0.1, 0.1, 0.2, { color: [0.4, 0.42, 0.44], lw: 0.6 });
      });
      colliders.add(Math.min(x0, x1) - 0.15, Math.min(z0, z1) - 0.15, Math.max(x0, x1) + 0.15, Math.max(z0, z1) + 0.15, -1e9, h + 0.3);
    },
    // 酒楼里的座上客（须在酒楼的局部坐标系里调用）
    patrons(info, p = 0.5) {
      for (const [sx, sy, sz, ry] of info.seats) if (rng.chance(p)) P.interior(b, () => b.place(sx + rng.f(-0.25, 0.25), sy, sz, ry, () => figure(b, { ...randomLook(rng, rng.pick(['man', 'scholar', 'man', 'elder'])), pose: 'sit', prop: null, arms: rng.pick(['tuck', 'reach']) })));
    },
    // 沿街房屋；rot=0 时正面朝南(+Z)
    houseAt(x, z, rot, o) {
      chunk(x);
      let info;
      const hy = terrainH(x, z);
      b.place(x, hy, z, rot, () => {
        // 不在平地上的房子：屋基往下接一截，低的那一头不悬空
        const sw = Math.abs(Math.sin(rot)) > 0.5, ex = (sw ? o.d : o.w) / 2, ez = (sw ? o.w : o.d) / 2;
        if (Math.max(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([i, j]) => Math.abs(terrainH(x + i * ex, z + j * ez) - hy))) > 0.06) b.box('stone', 0, -0.75, 0, o.w + 0.9, 1.5, o.d + 0.9, {});
        info = P.house(b, { rng, ...o });
        const y0 = info.y0, hd = o.d / 2;
        if (o.keeper !== false && (o.kind === 'shop' || o.keeper)) {
          const i = info.types.indexOf('counter');
          if (i >= 0 && (o.keeper || rng.chance(0.7))) {
            const kx = -o.w / 2 + (i + 0.5) * info.bw;
            if (o.keeper !== 'npc') b.place(kx, y0, hd - 1.15, 0, () => figure(b, { ...randomLook(rng, rng.pick(['man', 'man', 'woman', 'scholar'])), prop: null, arms: 'tuck' }));
            info.keeperLocal = [kx, hd - 1.15];
          }
        }
        P.interior(b, () => {
        for (const [tx, tz] of info.tables) {
          if (rng.chance(0.7)) b.place(tx + rng.f(-0.25, 0.25), y0, tz - 0.68, 0, () => figure(b, { ...randomLook(rng, rng.pick(['man', 'scholar', 'elder', 'man'])), pose: 'sit', prop: null, arms: 'tuck' }));
          if (rng.chance(0.6)) b.place(tx + rng.f(-0.25, 0.25), y0, tz + 0.68, Math.PI, () => figure(b, { ...randomLook(rng, rng.pick(['man', 'scholar', 'man'])), pose: 'sit', prop: null, arms: 'tuck' }));
        }
        });
      });
      // 墙、地面、顶棚逐件登记：屋子进得去
      if (info.keeperLocal && o.keeper !== 'npc') info.solids.push([info.keeperLocal[0] - 0.28, info.keeperLocal[1] - 0.28, info.keeperLocal[0] + 0.28, info.keeperLocal[1] + 0.28]);
      register(info, x, z, rot, hy);
      MAP.houses.push({ x, z, w: o.w + 1.3, d: o.d + 1.9, rot, thatch: o.roofMat === 'thatch' });
      // 把掌柜位置换算为世界坐标
      if (info.keeperLocal) {
        const [lx, lz] = info.keeperLocal, c = Math.cos(rot), s = Math.sin(rot);
        info.keeper = { x: x + lx * c + lz * s, z: z - lx * s + lz * c, yaw: rot, y: info.y0 + hy };
      }
      return info;
    },
    // 沿主街排屋：side 'N'/'S'，自 x0（东）向 x1（西）铺排
    row(side, x0, x1, o = {}) {
      const sgn = side === 'N' ? -1 : 1;
      const zFront = (o.z ?? 0) + sgn * ((o.hw ?? ROAD_HW) + (o.setback ?? 1.0));
      let x = x0;
      while (x - 7.5 >= x1) {
        const kind = rng.pick(o.kinds || ['shop', 'shop', 'tea', 'house', 'shop']);
        let w = rng.f(10, 15.5);
        if (x - w < x1 + 7.5) w = x - x1;
        const d = rng.f(o.dMin ?? 8.5, o.dMax ?? 12);
        const cx = x - w / 2, cz = zFront + (sgn * d) / 2;
        const thatch = rng.chance(o.thatch ?? 0.08);
        const awn = kind !== 'house' && kind !== 'store' && rng.chance(0.62) ? rng.f(2.0, 2.7) : 0;
        ctx.houseAt(cx, cz, side === 'N' ? 0 : Math.PI, {
          w: w - 1.1, d, kind, h: rng.f(3.6, 4.3), base: 0.35, roofMat: thatch ? 'thatch' : 'tile', awning: awn,
          tint: rng.pick([W_.wood, W_.wood, W_.dark, W_.pale]), wall: thatch ? 'earth' : 'plaster',
        });
        ctx.dressFront(cx, zFront, -sgn, w - 1.1, kind, awn);
        x -= w;
        if (o.yards !== false && x - 24 > x1 && rng.chance(0.24)) {
          // 小院：一截矮墙，墙里一棵树探出头来——街面不至于全是一排到底的屋檐
          const g = rng.f(6.2, 7.6);
          ctx.yardWall(x + 0.55, zFront + sgn * 0.4, x - g - 0.55, zFront + sgn * 0.4);
          ctx.treeAt(x - g / 2, zFront + sgn * rng.f(3.6, 4.6), rng.pick(['leaf', 'dark', 'leaf', 'blossom']), rng.f(1.1, 1.3), true, { clear: 2.4 });
          x -= g;
        } else if (rng.chance(0.25)) x -= rng.f(1, 2.6);
      }
    },
    // 沿南北向街排屋：side 'W'/'E'，自 z0 向 z1（z0<z1）
    rowNS(side, xs, z0, z1, o = {}) {
      const sgn = side === 'W' ? -1 : 1, hwS = (o.streetW ?? 9) / 2 + 0.9;
      let z = z0;
      while (z + 7.5 <= z1) {
        let w = rng.f(9.5, 14);
        if (z + w > z1 - 7.5) w = z1 - z;
        const d = rng.f(o.dMin ?? 8, o.dMax ?? 11);
        const kind = rng.pick(o.kinds || ['house', 'house', 'shop', 'tea']);
        ctx.houseAt(xs + sgn * (hwS + d / 2), z + w / 2, side === 'W' ? Math.PI / 2 : -Math.PI / 2, {
          w: w - 1.1, d, kind, h: rng.f(3.5, 4.1), base: 0.35, roofMat: rng.chance(o.thatch ?? 0.1) ? 'thatch' : 'tile',
          tint: rng.pick([W_.wood, W_.dark, W_.wood]), awning: kind === 'tea' ? 2.2 : 0,
        });
        z += w + (rng.chance(0.3) ? rng.f(1, 2.5) : 0);
      }
    },
    // 铺面门前的幌子、摊子、杂物；sdir：自铺面指向街心的 z 方向
    dressFront(cx, zFront, sdir, w, kind, awn) {
      if (kind === 'shop' || kind === 'tea') {
        const text = kind === 'tea' ? rng.pick(['茶', '茶坊', '分茶', '香饮子']) : rng.pick(SHOP_SIGNS);
        const sx = cx + rng.sign() * (w / 2 - 0.4);
        if (rng.chance(0.5)) {
          const zb = zFront + sdir * (awn ? awn + 0.3 : 0.9);
          ctx.at(sx, zb, (-sdir * Math.PI) / 2, () => P.banner(b, atlas, text, 0, 0, 0, { h: rng.f(5.6, 7) }));
          colliders.add(sx - 0.13, zb - 0.13, sx + 0.13, zb + 0.13); // 幌竿也挡人
        }
        else ctx.at(sx, zFront + sdir * 0.75, Math.PI / 2, () => P.vSign(b, atlas, text, 0, 2.9, 0, Math.min(2.2, 0.6 + text.length * 0.5)));
      }
      if ((kind === 'shop' || kind === 'tea') && rng.chance(0.55)) {
        // 檐角挂一对红灯笼
        for (const sx of rng.chance(0.6) ? [-1, 1] : [rng.sign()]) ctx.at(cx + sx * (w / 2 - 0.35), zFront + sdir * (awn ? awn + 0.15 : 1.05), 0, () => P.lantern(b, 0, 3.5, 0, 1.3));
      }
      if (kind === 'tea' && awn) {
        const tx = cx + rng.f(-w / 4, w / 4), tz = zFront + sdir * 1.3;
        ctx.at(tx, tz, 0, () => {
          P.table(b, 0, 0, 1.2, 0.8);
          P.bench(b, 0, -0.68, 1.1);
          P.bench(b, 0, 0.68, 1.1);
        });
        ctx.person(tx + 0.1, tz - 0.68, 0, { ...randomLook(rng, 'man'), pose: 'sit', prop: null, arms: 'tuck' });
        colliders.add(tx - 0.7, tz - 0.9, tx + 0.7, tz + 0.9);
      }
      if (!awn && rng.chance(0.3)) {
        // 门前小摊
        const px = cx + rng.f(-w / 3, w / 3), pz = zFront + sdir * 1.25;
        ctx.at(px, pz, sdir > 0 ? 0 : Math.PI, () => (rng.chance(0.6) ? P.parasolStall(b, rng) : P.shedStall(b, rng)));
        ctx.person(px + (sdir > 0 ? 0.5 : -0.5), pz - sdir * 0.55, sdir > 0 ? 0 : Math.PI, { ...randomLook(rng, rng.pick(['man', 'woman', 'labor'])), prop: null, arms: 'tuck' });
        colliders.add(px - 0.9, pz - 0.75, px + 0.9, pz + 0.75);
      }
      if (rng.chance(0.4)) {
        const jx = cx + rng.sign() * (w / 2 - 0.9), jz = zFront + sdir * 0.5;
        colliders.add(jx - 0.8, jz - 0.42, jx + 0.8, jz + 0.42, -1e9, 1.2); // 门前的瓮、麻包、筐
        ctx.at(jx, jz, 0, () => {
          const k = rng.i(0, 2);
          if (k === 0) for (let i = 0; i < 3; i++) P.jar(b, i * 0.5 - 0.5, 0, rng.f(-0.1, 0.1), rng.f(0.9, 1.2));
          else if (k === 1) P.sackPile(b, 0, 0, rng, 4);
          else {
            P.basket(b, -0.3, 0, 0, 1.1, [0.76, 0.82, 0.6]);
            P.basket(b, 0.4, 0, 0.1, 1, [0.92, 0.6, 0.45]);
          }
        });
      }
    },
  };

  // ── 各分区 ──
  buildSections(ctx);

  // ── 河岸 ──
  {
    chunk(0);
    b.chunk = 'river';
    for (const ch of CHANNELS) {
      const P0 = ch.pts, n = P0.length, BANK = bankOf(ch.hw);
      // 码头街一岸、虹桥两头、护城河是石砌的驳岸；其余是土岸
      const quay = (x, z) => ch.id === 'moat' || (ch.id === 'main' && ((x > 22 && x < 216 && z < 12) || Math.hypot(x - BRIDGE.xc, z - BRIDGE.zc) < 36));
      [1, -1].forEach((side, si) => {
        // 三条带子各自成面（不共用顶点），交接处才是硬折：岸顶 → 沿口的一道深边 → 陡立的岸壁
        const TOP = [], TC = [], EDGE = [], EC = [], FACE = [], FC = [], I2 = [], IE = [], IS = [], Q = [];
        for (let i = 0; i < n; i++) {
          const a = P0[Math.max(0, i - 1)], c2 = P0[Math.min(n - 1, i + 1)], l = Math.hypot(c2[0] - a[0], c2[1] - a[1]) || 1;
          const nx = (-(c2[1] - a[1]) / l) * side, nz = ((c2[0] - a[0]) / l) * side, c = P0[i];
          const q = quay(c[0] + nx * ch.hw, c[1] + nz * ch.hw);
          Q.push(q);
          // 土岸不取直：沿口进进出出一拃来宽，颜色也深浅不匀；石岸是砌的，取直
          const k1 = vnoise(i * 0.43 + si * 17.3, ch.hw), k2 = vnoise(i * 0.19 + 5.1, si * 7.7 + ch.hw);
          const wob = q ? 0 : (k1 - 0.5) * 0.24, tone = q ? 1 : 0.86 + 0.26 * k2;
          const at = (arr, d, y) => arr.push(c[0] + nx * (ch.hw + d + wob), y, c[1] + nz * (ch.hw + d + wob));
          // 岸顶取岸上地面的颜色（长草处偏绿、街市处是土色）：岸与地之间不留硬边
          const gm = meadow(c[0] + nx * (ch.hw + 1.5), c[1] + nz * (ch.hw + 1.5));
          const gr = 0.9 - 0.22 * gm, gg = 0.88 - 0.1 * gm, gb = 0.8 - 0.24 * gm;
          at(TOP, BANK.top, 0.02);
          at(TOP, BANK.lip, 0);
          if (q) TC.push(gr, gg, gb, 0.9, 0.89, 0.85); // 压顶石
          else TC.push(gr, gg, gb, gr * 0.9, gg * 0.88, gb * 0.84);
          // 沿口：一道淡墨的边。朝镜头的那岸它压在岸壁上头，背着镜头的那岸看不见岸壁，就靠它把岸与水分开
          at(EDGE, BANK.lip, 0);
          at(EDGE, BANK.edge, -0.05);
          if (q) EC.push(0.68, 0.67, 0.64, 0.5, 0.49, 0.47);
          else EC.push(0.62 * tone, 0.56 * tone, 0.46 * tone, 0.47, 0.43, 0.38);
          // 岸壁：上头是干的，越往水线越湿越深
          at(FACE, BANK.edge, -0.05);
          at(FACE, BANK.foot, RV.WATER_Y);
          at(FACE, BANK.under, RV.WATER_Y - 0.35);
          if (q) FC.push(0.92, 0.91, 0.86, 0.66, 0.66, 0.64, 0.48, 0.5, 0.5);
          else FC.push(0.82 * tone, 0.75 * tone, 0.63 * tone, 0.58, 0.55, 0.5, 0.46, 0.47, 0.47);
          if (i < n - 1) I2.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
        }
        for (let i = 0; i < n - 1; i++) (Q[i] && Q[i + 1] ? IS : IE).push(i * 3, i * 3 + 1, i * 3 + 3, i * 3 + 3, i * 3 + 1, i * 3 + 4, i * 3 + 1, i * 3 + 2, i * 3 + 4, i * 3 + 4, i * 3 + 2, i * 3 + 5);
        // 岸顶、沿口与地面同一个勾线编号（不出线）；岸壁另算，与岸顶、与水面相接处各出一道线
        b.raw('bank', TOP, null, I2, { lw: 0.85, colors: TC, id: 0.012, double: true });
        b.raw('bank', EDGE, null, I2, { lw: 0.85, colors: EC, id: 0.012, double: true });
        if (IE.length) b.raw('bankFace', FACE, null, IE, { lw: 0.8, colors: FC, id: 0.031, double: true });
        if (IS.length) b.raw('stone', FACE, null, IS, { lw: 0.8, colors: FC, id: 0.031, double: true });
      });
    }
  }

  // ── 静态网格 ──
  const statics = b.build(mats, scene);
  const chunks = [], rooms = [];
  const NO_SHADOW = new Set(['rafter', 'eave', 'lattice', 'sign', 'signWind', 'stone', 'grass', 'grassLow', 'flower', 'crop', 'bank', 'bankFace']);
  for (const m of statics) {
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    // 檐底、檐口、窗棂、招牌、台基、草丛这些影子无足轻重的，不进投影那一遍（第 1 层只入画）
    if (NO_SHADOW.has(m.userData.matKey)) {
      m.layers.set(1);
      m.layers.enable(3); // 第 3 层：倒影里要有
    }
    // 按东西向分块：远在烟霭之外的整块不必绘制
    const k = /^c(-?[0-9]+)$/.exec(m.userData.chunk || '');
    if (k) chunks.push({ m, cx: WORLD.minX + (Number(k[1]) + 0.5) * 75 });
    else if (m.userData.chunk === 'home') chunks.push({ m, cx: HOME.x });
    else {
      // 室内陈设：只在走近时画，且不入投影（第 1 层）
      const q = /^in:(-?[0-9]+):(-?[0-9]+)$/.exec(m.userData.chunk || '');
      if (q) {
        rooms.push({ m, x: (Number(q[1]) + 0.5) * 36, z: (Number(q[2]) + 0.5) * 36 });
        m.layers.set(1);
      }
    }
  }

  // ── 地表与水面 ──
  const splat = makeSplat();
  shared.tAux.value = makeAux();
  shared.uAuxRect.value.set(WORLD.minX, WORLD.minZ, WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ);
  mats.ground = groundMat(splat, tex.groundDetail, [WORLD.minX, WORLD.minZ, WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ]);
  const gb = new Batch();
  const E = 5000;
  // 地表：地形表覆盖的范围里是随地势起伏的网格（顶点高度取自同一张表），范围外四块平地接出去
  {
    const W1 = T_NX + 1, ROWS = 30;
    for (let j0 = 0; j0 < T_NZ; j0 += ROWS) {
      const j1 = Math.min(T_NZ, j0 + ROWS), P0 = [], N0 = [], I0 = [];
      for (let j = j0; j <= j1; j++)
        for (let i = 0; i <= T_NX; i++) {
          const k = j * W1 + i, h = T_GRID[k];
          const hx = (T_GRID[j * W1 + Math.min(T_NX, i + 1)] - T_GRID[j * W1 + Math.max(0, i - 1)]) / (2 * T_STEP);
          const hz = (T_GRID[Math.min(T_NZ, j + 1) * W1 + i] - T_GRID[Math.max(0, j - 1) * W1 + i]) / (2 * T_STEP);
          const l = Math.hypot(hx, 1, hz);
          P0.push(T_RECT.x0 + i * T_STEP, h, T_RECT.z0 + j * T_STEP);
          N0.push(-hx / l, 1 / l, -hz / l);
        }
      for (let j = 0; j < j1 - j0; j++)
        for (let i = 0; i < T_NX; i++) {
          const a = j * W1 + i, bq = a + 1, c = a + W1, d = c + 1;
          I0.push(a, c, d, a, d, bq);
        }
      gb.raw('ground', P0, null, I0, { normals: N0 });
    }
    const { x0, z0, x1, z1 } = T_RECT;
    for (const [ax, az, bx, bz] of [[-E, -E, E, z0], [-E, z1, E, E], [-E, z0, x0, z1], [x1, z0, E, z1]]) gb.quad('ground', [ax, 0, bz], [bx, 0, bz], [bx, 0, az], [ax, 0, az]);
  }
  gb.quad('water', [-E, RV.WATER_Y, E], [E, RV.WATER_Y, E], [E, RV.WATER_Y, -E], [-E, RV.WATER_Y, -E]);
  for (const m of gb.build(mats, scene)) {
    m.frustumCulled = false;
    m.layers.set(1); // 第 1 层：入画但不投影
  }

  // ── 天与远山（随镜头平移） ──
  const farGroup = new THREE.Group();
  const fb = new Batch();
  fb.sphere('sky', 0, 0, 0, 2600, 2600, 2600, { color: [1, 1, 1], lw: 0, id: 0 });
  const mrng = new RNG(99);
  for (const m of fb.build(mats, farGroup)) {
    m.frustumCulled = false;
    m.layers.set(1);
    if (m.userData.matKey === 'sky') m.renderOrder = -100;
    else m.layers.enable(3); // 远山也映在水里
  }
  scene.add(farGroup);

  // 飞鸟：几只远雁
  const birds = buildObject(mats, (bb) => {
    for (let i = 0; i < 9; i++) {
      const bx = (i - 4) * 9 + mrng.f(-2, 2), bz = Math.abs(i - 4) * 7 + mrng.f(-2, 2), by = mrng.f(-2, 2);
      bb.beam('far', [bx, by, bz], [bx - 2.6, by + 0.9, bz + 1.2], 0.5, 0.12, { color: [0.3, 0.3, 0.32], lw: 0, id: 0.004 });
      bb.beam('far', [bx, by, bz], [bx + 2.6, by + 0.9, bz + 1.2], 0.5, 0.12, { color: [0.3, 0.3, 0.32], lw: 0, id: 0.004 });
    }
  });
  birds.traverse((o) => {
    o.frustumCulled = false;
    o.layers.set(1);
  });
  scene.add(markDynamic(birds));

  // ── 柳絮与落花：清明时节，随风飘在眼前 ──
  const NC = 200, seeds = new Float32Array(NC * 3), crng = new RNG(303);
  for (let i = 0; i < NC * 3; i++) seeds[i] = crng.r();
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  const catkinMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uTime: shared.uTime, uResY: shared.uResY, uJit: shared.uJit, uCam: { value: new THREE.Vector3() }, uShow: { value: 1 }, uFly: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uResY;
      uniform vec3 uCam;
      uniform float uShow;
      uniform float uFly;
      uniform vec2 uJit;
      varying float vK;
      varying float vB;
      void main(){
        vec3 box = vec3(44.0, 13.0, 44.0), s = position;
        vec3 p = s * box;
        p.x -= uTime * (0.7 + s.y*0.6) + sin(uTime*0.6 + s.z*40.0) * 0.9;
        p.z -= uTime * 0.3 + cos(uTime*0.5 + s.x*37.0) * 0.9;
        p.xz = mod(p.xz - uCam.xz + box.xz*0.5, box.xz) - box.xz*0.5 + uCam.xz;
        p.y = 0.2 + mod(s.y*box.y - uTime*(0.22 + s.x*0.2) + sin(uTime*0.9 + s.y*50.0)*0.25, box.y);
        // 入夜换成萤火：贴着草尖飞，一明一灭
        p.y = mix(p.y, 0.3 + mod(s.y*2.4 + sin(uTime*0.5 + s.x*31.0)*0.5, 2.4), uFly);
        vB = smoothstep(0.1, 0.5, sin(uTime*(1.3 + s.z*1.6) + s.x*50.0));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.xy -= uJit * gl_Position.w; // 飘着的东西不参加跨帧累积（见 ink.js 的 markDynamic）
        gl_PointSize = uShow * mix(1.0, 1.5, uFly) * clamp(mix(0.035, 0.075, s.z) * projectionMatrix[1][1] * uResY * 0.5 / max(0.3, -mv.z), 1.2, uResY * 0.006);
        vK = s.x;
      }`,
    fragmentShader: /* glsl */ `
      layout(location = 0) out highp vec4 gColor;
      layout(location = 1) out highp vec4 gNormal;
      varying float vK;
      varying float vB;
      uniform float uFly;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        if(dot(d, d) > 0.2) discard;
        if(uFly > 0.5 && (vB < 0.05 || vK > 0.45)) discard;
        // 落花粉白，柳絮雪白；夜里是萤火的黄绿
        vec3 col = vK > 0.72 ? vec3(1.2, 0.97, 0.97) : vec3(1.22, 1.21, 1.17);
        col = mix(col, vec3(1.25, 1.25, 0.55) * vB, uFly);
        gColor = vec4(col * 0.8, 0.0);
        gNormal = vec4(0.5, 0.5, 0.0, 0.0);
      }`,
  });
  const catkins = new THREE.Points(cgeo, catkinMat);
  catkins.frustumCulled = false;
  catkins.layers.set(1);
  scene.add(catkins);

  let t = 0;
  return {
    viewDist: 470,
    indoor: false, // 主角是否在屋内（由游戏逻辑告知）
    mats, atlas,
    npcs: ctx.npcs,
    home: ctx.home,
    criers: ctx.criers,
    update(dt, cam) {
      t += dt;
      farGroup.position.set(cam.position.x, 0, cam.position.z);
      catkinMat.uniforms.uCam.value.copy(cam.position);
      catkinMat.uniforms.uFly.value += ((shared.uLamp.value > 0.7 ? 1 : 0) - catkinMat.uniforms.uFly.value) * Math.min(1, dt * 0.8);
      // 柳絮只在人眼的高度看得见；镜头升到高处（卷首俯瞰、留影）就收起来，否则成了地上一片乱闪的白点
      catkinMat.uniforms.uShow.value += ((this.indoor || cam.position.y > 16 ? 0 : 1) - catkinMat.uniforms.uShow.value) * Math.min(1, dt * 3);
      for (const c of chunks) c.m.visible = Math.abs(c.cx - cam.position.x) < this.viewDist;
      for (const c of rooms) c.m.visible = Math.abs(c.x - cam.position.x) < 82 && Math.abs(c.z - cam.position.z) < 82;
      for (const d of dynamic) d(t, dt);
      const ba = t * 0.012;
      birds.position.set(cam.position.x + Math.cos(ba) * 520, 150 + Math.sin(t * 0.2) * 6, cam.position.z - 380 + Math.sin(ba) * 160);
      birds.rotation.y = -ba;
    },
  };
}

// 组装整座汴京：材质、地表、河道、远山，以及各分区的建造上下文
import * as THREE from 'three';
import { RNG } from '../util.js';
import { Batch, buildObject } from '../engine/batch.js';
import { inkMat, groundMat, waterMat, shared } from '../engine/ink.js';
import { SignAtlas, mkCanvas, toTex } from '../engine/textures.js';
import { RV, riverSD, CHANNELS } from './river.js';
import { meadow } from './cover.js';
import { WORLD, ROAD_HW, EAST_Z, NODES, EDGES, EXTRA_ROADS, edgeWidth, onRoad, colliders, groundY, HOME, GATE, register } from './layout.js';
import * as P from './parts.js';
import { figure, randomLook } from './figures.js';
import { buildSections } from './sections.js';

const W_ = P.W_;
// 供小地图/舆图绘制的记录
export const MAP = { houses: [], trees: [], piers: [], fields: [], boats: [], walls: [] };

function makeMaterials(tex, atlas) {
  const D = THREE.DoubleSide;
  const leaf = (map) => inkMat({ map, alphaTest: true, wind: true, side: D, shade: 0.82, wash: 0.16, leaf: true });
  return {
    flat: inkMat({ side: D }),
    plaster: inkMat({ map: tex.plaster, world: true, scale: 0.22, side: D, tint: [1.23, 1.22, 1.18], weather: true, bump: 0.004 }),
    earth: inkMat({ map: tex.earthWall, world: true, scale: 0.2, side: D, weather: true, bump: 0.012 }),
    wood: inkMat({ map: tex.wood, world: true, scale: 0.32, side: D, bump: 0.01 }),
    brick: inkMat({ map: tex.brick, world: true, scale: 0.42, side: D, weather: true, bump: 0.014 }),
    stone: inkMat({ map: tex.stone, world: true, scale: 0.3, side: D, bump: 0.012 }),
    mat: inkMat({ map: tex.mat, world: true, scale: 0.55, side: D }),
    bank: inkMat({ map: tex.bank, world: true, scale: 0.2, side: D }),
    bark: inkMat({ map: tex.bark, world: true, scale: 0.4, side: D, bump: 0.03 }),
    lattice: inkMat({ map: tex.lattice, world: true, scale: 1.1, side: D }),
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
    grass: leaf(tex.grass),
    grassLow: leaf(tex.grassLow),
    flower: leaf(tex.flower),
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
      chunk(x);
      b.place(x, y, z, rot, fn);
    },
    person(x, z, yaw, look, y) {
      chunk(x);
      const py = y ?? groundY(x, z);
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
      b.place(x, 0, z, tr.f(6.28), () => (dim = P.tree(b, tr, type, s)));
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
      b.place(x, 0, z, 0, () => P.grassTuft(b, tr, s));
    },
    // 篱笆：画出来，也挡人
    fence(pts, h) {
      chunk(pts[0][0]);
      b.place(0, 0, 0, 0, () => P.fence(b, pts, h));
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
      b.place(x, 0, z, rot, () => {
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
      register(info, x, z, rot);
      MAP.houses.push({ x, z, w: o.w + 1.3, d: o.d + 1.9, rot, thatch: o.roofMat === 'thatch' });
      // 把掌柜位置换算为世界坐标
      if (info.keeperLocal) {
        const [lx, lz] = info.keeperLocal, c = Math.cos(rot), s = Math.sin(rot);
        info.keeper = { x: x + lx * c + lz * s, z: z - lx * s + lz * c, yaw: rot, y: info.y0 };
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
        if (rng.chance(0.5)) ctx.at(sx, zFront + sdir * (awn ? awn + 0.3 : 0.9), (-sdir * Math.PI) / 2, () => P.banner(b, atlas, text, 0, 0, 0, { h: rng.f(5.6, 7) }));
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
      const P0 = ch.pts, n = P0.length, slope = Math.min(1.25, ch.hw * 0.4);
      for (const side of [1, -1]) {
        const PP = [], IDX = [];
        for (let i = 0; i < n; i++) {
          const a = P0[Math.max(0, i - 1)], c2 = P0[Math.min(n - 1, i + 1)], l = Math.hypot(c2[0] - a[0], c2[1] - a[1]) || 1;
          const nx = (-(c2[1] - a[1]) / l) * side, nz = ((c2[0] - a[0]) / l) * side, c = P0[i];
          PP.push(c[0] + nx * (ch.hw + 0.08), 0.02, c[1] + nz * (ch.hw + 0.08), c[0] + nx * (ch.hw - slope), RV.WATER_Y - 0.4, c[1] + nz * (ch.hw - slope));
          if (i < n - 1) IDX.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
        }
        b.raw('bank', PP, null, IDX, { lw: 0.85, color: [0.9, 0.89, 0.87], double: true });
      }
    }
  }

  // ── 静态网格 ──
  const statics = b.build(mats, scene);
  const chunks = [], rooms = [];
  const NO_SHADOW = new Set(['rafter', 'eave', 'lattice', 'sign', 'signWind', 'stone', 'grass', 'grassLow', 'flower', 'bank']);
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
  mats.ground = groundMat(splat, tex.groundDetail, [WORLD.minX, WORLD.minZ, WORLD.maxX - WORLD.minX, WORLD.maxZ - WORLD.minZ]);
  const gb = new Batch();
  const E = 5000;
  gb.quad('ground', [-E, 0, E], [E, 0, E], [E, 0, -E], [-E, 0, -E]);
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
  scene.add(birds);

  // ── 柳絮与落花：清明时节，随风飘在眼前 ──
  const NC = 200, seeds = new Float32Array(NC * 3), crng = new RNG(303);
  for (let i = 0; i < NC * 3; i++) seeds[i] = crng.r();
  const cgeo = new THREE.BufferGeometry();
  cgeo.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
  const catkinMat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uTime: shared.uTime, uResY: shared.uResY, uCam: { value: new THREE.Vector3() }, uShow: { value: 1 } },
    vertexShader: /* glsl */ `
      uniform float uTime;
      uniform float uResY;
      uniform vec3 uCam;
      uniform float uShow;
      varying float vK;
      void main(){
        vec3 box = vec3(44.0, 13.0, 44.0), s = position;
        vec3 p = s * box;
        p.x -= uTime * (0.7 + s.y*0.6) + sin(uTime*0.6 + s.z*40.0) * 0.9;
        p.z -= uTime * 0.3 + cos(uTime*0.5 + s.x*37.0) * 0.9;
        p.xz = mod(p.xz - uCam.xz + box.xz*0.5, box.xz) - box.xz*0.5 + uCam.xz;
        p.y = 0.2 + mod(s.y*box.y - uTime*(0.22 + s.x*0.2) + sin(uTime*0.9 + s.y*50.0)*0.25, box.y);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uShow * clamp(mix(0.035, 0.075, s.z) * projectionMatrix[1][1] * uResY * 0.5 / max(0.3, -mv.z), 1.2, uResY * 0.006);
        vK = s.x;
      }`,
    fragmentShader: /* glsl */ `
      layout(location = 0) out highp vec4 gColor;
      layout(location = 1) out highp vec4 gNormal;
      varying float vK;
      void main(){
        vec2 d = gl_PointCoord - 0.5;
        if(dot(d, d) > 0.2) discard;
        // 落花粉白，柳絮雪白
        vec3 col = vK > 0.72 ? vec3(1.2, 0.97, 0.97) : vec3(1.22, 1.21, 1.17);
        gColor = vec4(col * 0.8, 1.0);
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
      catkinMat.uniforms.uShow.value += ((this.indoor ? 0 : 1) - catkinMat.uniforms.uShow.value) * Math.min(1, dt * 3);
      for (const c of chunks) c.m.visible = Math.abs(c.cx - cam.position.x) < this.viewDist;
      for (const c of rooms) c.m.visible = Math.abs(c.x - cam.position.x) < 82 && Math.abs(c.z - cam.position.z) < 82;
      for (const d of dynamic) d(t, dt);
      const ba = t * 0.012;
      birds.position.set(cam.position.x + Math.cos(ba) * 520, 150 + Math.sin(t * 0.2) * 6, cam.position.z - 380 + Math.sin(ba) * 160);
      birds.rotation.y = -ba;
    },
  };
}

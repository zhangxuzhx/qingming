// 各分区的布置：照《清明上河图》原画自右向左——
// 郊野（溪桥驮炭、村舍打麦场、惊马、茶棚卧牛）→ 汴河码头（北岸泊船卸货）→ 虹桥（斜跨，桥下放桅）
// → 城外街（十千脚店、车轮作坊路口、平桥）→ 城门 → 城内（孙羊正店、路口、赵太丞家卷尾）。
// 方位以原画为准：画面上方为北（-Z），地标在街的哪一侧、路口的哪一角都逐一对过。
import * as THREE from 'three';
import { RV, riverSD, CHANNELS } from './river.js';
import { ROAD_HW, EAST_Z, BRIDGE, bridgeWorld, bridgeProfile, MOAT_BRIDGE, GATE, HOME, BOUNDS, PLANK, NODES, EDGES, EXTRA_ROADS, edgeWidth, onRoad, colliders, addDeck, register } from './layout.js';
import * as P from './parts.js';
import { buildObject } from '../engine/batch.js';
import { figure, randomLook, ROBES } from './figures.js';
import { buildScenery, groundCover } from './scenery.js';
import { FACE, paintLandscape, paintCalligraphy } from '../engine/textures.js';

const PI = Math.PI;
// 城那边的街（z = 0）与码头街（z = EAST_Z）两侧铺面的中心线
const zN = (d) => -ROAD_HW - 1 - d / 2, zS = (d) => ROAD_HW + 1 + d / 2;
const zEN = (d) => EAST_Z - ROAD_HW - 1 - d / 2, zES = (d) => EAST_Z + ROAD_HW + 1 + d / 2;

const inHome = (x, z, m = 1) => Math.abs(x - HOME.x) < HOME.w / 2 + m && Math.abs(z - HOME.z) < HOME.d / 2 + m;

export function buildSections(c) {
  fields(c);
  home(c);
  rural(c);
  docks(c);
  bridge(c);
  outside(c);
  gate(c);
  city(c);
  buildScenery(c);
  backdrop(c);
  groundCover(c);
}

function fields(c) {
  const f = (x, z, w, d, rot = 0) => c.MAP.fields.push({ x, z, w, d, rot });
  // 郊野上方的菜畦（原画茶棚后面那几方）与远处的田
  f(236, -92, 40, 26, 0.03); f(190, -96, 36, 24, -0.04); f(288, -98, 44, 22); f(142, -94, 44, 22, 0.02); f(92, -96, 40, 22);
  f(356, -96, 34, 24, 0.05); f(300, 44, 50, 26, 0.5); f(238, 78, 60, 24, 0.42);
  f(-40, 70, 44, 22); f(-170, 78, 50, 20); f(-70, -100, 30, 16, 0.3); f(-176, -92, 44, 20);
}

// 小物件：石碾、四眼方井、小板桥
function stoneRoller(b, W_) {
  const id = b.nextId();
  b.rod('stone', [-0.62, 0.46, 0], [0.62, 0.46, 0], 0.46, 0.42, 12, { id });
  for (const sz of [-1, 1]) b.beam('wood', [-0.8, 0.46, sz * 0.02], [0.8, 0.46, sz * 0.02], 0.06, 0.06, { color: W_.dark, id });
  for (const sx of [-1, 1]) b.beam('wood', [sx * 0.74, 0.46, 0], [sx * 0.74, 0.5, 1.9], 0.07, 0.07, { color: W_.wood, id });
  b.beam('wood', [-0.78, 0.5, 1.9], [0.78, 0.5, 1.9], 0.07, 0.07, { color: W_.wood, id });
}
function squareWell(b, W_) {
  const id = b.nextId();
  b.box('stone', 0, 0.05, 0, 5, 0.1, 4.4, { id: b.nextId() });
  for (const [x, z, sx, sz] of [[0, 1.2, 2.8, 0.4], [0, -1.2, 2.8, 0.4], [1.2, 0, 0.4, 2.0], [-1.2, 0, 0.4, 2.0], [0, 0, 0.32, 2.0], [0, 0, 2.0, 0.32]]) b.box('stone', x, 0.36, z, sx, 0.56, sz, { id });
  b.box('flat', 0, 0.2, 0, 2.1, 0.1, 2.1, { color: [0.3, 0.36, 0.38], lw: 0.3 });
  for (const [x, z] of [[1.9, 0.5], [2.1, -0.3], [-1.9, 0.2]]) b.cyl('wood', x, 0.1, z, 0.21, 0.17, 0.38, 8, { color: W_.wood });
}
function plankBridge(c) {
  const { b, W_ } = c, { x, z, len, hw, y } = PLANK;
  c.at(x, z, 0, () => {
    const id = b.nextId();
    b.box('wood', 0, y - 0.08, 0, len, 0.16, hw * 2, { color: W_.pale, id });
    for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) b.cyl('wood', sx * (len / 2 - 0.5), -1.7, sz * (hw - 0.2), 0.11, 0.13, 1.8 + y, 6, { color: W_.dark, id });
    for (let i = 0; i < 9; i++) b.box('wood', -len / 2 + 0.7 + (i * (len - 1.4)) / 8, y + 0.02, 0, 0.9, 0.05, hw * 2 + 0.12, { color: i % 2 ? W_.wood : W_.pale, id, lw: 0.5 });
  });
  addDeck(x - len / 2 - 0.5, z - hw + 0.12, x + len / 2 + 0.5, z + hw - 0.12, y);
}
// 骑驴（马）的人：坐骑与骑者一并立在当前位置
export function rider(c, x, z, rot, look, mount = 'donkey') {
  const { b } = c;
  c.at(x, z, rot, () => {
    if (mount === 'horse') P.horse(b);
    else P.donkey(b, null);
    b.place(-0.05, mount === 'horse' ? P.HORSE_SEAT : 0.9, 0, PI / 2, () => figure(b, { ...look, pose: 'ride', arms: 'reach' }));
  });
  colliders.add(x - 0.9, z - 0.9, x + 0.9, z + 0.9);
}

// ───────────────────────── 郊野 ─────────────────────────
function rural(c) {
  const { b, rng, W_ } = c;
  const cot = (x, z, rot, w = 10, d = 7) => c.houseAt(x, z, rot, { w, d, h: 3.0, kind: 'cottage', roofMat: 'thatch', hip: rng.chance(0.5) ? 1 : 0, wall: 'earth', base: 0.14, tint: W_.dark, wallColor: [0.98, 0.95, 0.9] });
  // 卷首：薄雾疏林，一道小溪自北而南，溪上一座小板桥；驮炭的驴队正过桥往城里去
  plankBridge(c);
  for (const [x, dz] of [[396.5, -1.2], [392.6, -1.6], [388.4, -1.0], [374.2, 0.2], [370.4, -0.4]]) {
    const dz2 = PLANK.z - 0.85 + dz * 0.15;
    c.at(x, dz2, PI + rng.f(-0.1, 0.1), () => P.donkey(b, [0.34, 0.33, 0.32]));
    colliders.add(x - 0.9, dz2 - 0.5, x + 0.9, dz2 + 0.5);
  }
  c.npcs.push({ id: 'ding', name: '丁老汉', title: '炭翁', x: 366.6, z: -38.6, yaw: PI / 2, look: { robe: [0.8, 0.78, 0.7], face: FACE.elder, hat: 'douli', long: false, arms: 'down' } });
  c.person(399.6, -36.6, -PI / 2, { ...randomLook(rng, 'labor'), prop: 'staff', arms: 'down', hat: 'scarf' });
  c.at(364.8, -39.6, 0, () => {
    P.basket(b, 0, 0, 0, 1.2, [0.36, 0.35, 0.34]);
    P.basket(b, -0.75, 0, 0.2, 1.2, [0.86, 0.8, 0.62]);
  });
  c.criers.push({ x: 366.6, z: -38.6, lines: ['上好的木炭——', '带泥的春笋，今晨才掘的！'] });
  // 掩在高树间的几座茅舍，当中一片打麦场，场上搁着石碾
  cot(350, -66, 0); cot(337, -70, 0, 11, 7.4); cot(326, -58, PI / 2, 9, 6.6); cot(352, -52, -PI / 2, 9, 6.4);
  c.at(339.5, -57, 0.5, () => stoneRoller(b, W_));
  colliders.add(338.6, -57.8, 340.8, -55.6);
  c.at(346, -59.5, 0, () => P.haystack(b));
  colliders.add(344.9, -60.6, 347.1, -58.4);
  c.fence([[322, -49], [332, -48.4]]);
  c.fence([[357, -47], [357, -58]]);
  for (const [x, z, s] of [[331, -76, 1.5], [344, -78, 1.6], [356, -74, 1.45], [361, -62, 1.4], [320, -66, 1.5], [329, -50, 1.3], [348, -47, 1.25], [315, -78, 1.4], [366, -80, 1.5]]) c.treeAt(x, z, 'leaf', s);
  // 一排老柳：树身粗，截过头，新条细密
  for (const [x, z, s] of [[314, -22], [305, -12], [297, -20], [288, -9], [300, -40], [290, -52], [281, -24], [309, -3]].map((p) => [...p, rng.f(1.35, 1.7)])) c.treeAt(x, z, 'willow', s);
  // 清明归来的一行：远处另一条小路上，轿顶插满柳枝杂花，前有人开道，后有骑马的与挑担的
  const PX = (t) => [322 - 76 * t, -90 + 24 * t];
  {
    const [sx, sz] = PX(0.5);
    c.at(sx, sz, -0.3, () => {
      P.sedan(b);
      for (let i = 0; i < 7; i++) b.sphere('flat', rng.f(-0.5, 0.5), 1.74 + rng.f(0, 0.3), rng.f(-0.45, 0.45), 0.22, 0.2, 0.22, { color: rng.pick([[0.62, 0.78, 0.5], [0.7, 0.82, 0.54], [0.98, 0.8, 0.8]]), lw: 0.4, ws: 6, hs: 5 });
    });
    colliders.add(sx - 1.7, sz - 0.9, sx + 1.7, sz + 0.9);
    for (const dx of [-1.95, 1.95]) c.person(sx + dx * 0.95, sz + dx * 0.3, -PI / 2 - 0.3, { ...randomLook(rng, 'labor'), prop: null, arms: 'down', hat: 'scarf' });
    for (const [t, cls, o] of [[0.36, 'labor', { prop: 'staff', arms: 'down' }], [0.4, 'man', { prop: null }], [0.6, 'woman', {}], [0.68, 'labor', { prop: 'pole', arms: 'carry' }], [0.74, 'labor', { prop: 'sack', arms: 'carry' }], [0.3, 'kid', {}]]) {
      const [x, z] = PX(t);
      c.person(x + rng.f(-0.5, 0.5), z + rng.f(-0.7, 0.7), -PI / 2 - 0.3, { ...randomLook(rng, cls), ...o });
    }
    const [hx, hz] = PX(0.62);
    rider(c, hx + 1.5, hz - 1.8, 0.3 + PI, { robe: [0.86, 0.84, 0.78], face: FACE.man2, hat: 'futou' }, 'horse');
  }
  // 惊马：一匹脱缰的马沿路狂奔，行人惊避，妇人忙唤住小儿，老者拄杖回望
  c.at(256, -44.5, PI + 0.12, () => P.horse(b));
  colliders.add(254.8, -45.2, 257.2, -43.8);
  c.person(262.5, -43, -PI / 2, { ...randomLook(rng, 'labor'), prop: null, arms: 'hail', hat: 'scarf', lean: 0.2 });
  c.person(265.5, -44.6, -PI / 2, { ...randomLook(rng, 'man'), prop: null, arms: 'hail', lean: 0.16 });
  c.person(247.4, -39.6, 0.9, { ...randomLook(rng, 'woman'), prop: null, arms: 'reach' });
  c.person(246.2, -41.2, 0.4, { ...randomLook(rng, 'kid') });
  c.person(250.8, -49.6, 2.6, { ...randomLook(rng, 'elder') });
  c.criers.push({ x: 256, z: -44.5, lines: ['马惊了——快闪开！', '拦住它！拦住它！', '孩子——回来！'] });
  // 路南一户带篱笆的人家；近处一队骑驴戴笠的行旅与随从
  cot(266, -22, PI, 11, 7.2);
  c.fence([[258, -29], [258, -16], [274, -15.4]]);
  c.fence([[274, -28.6], [274, -20]]);
  c.treeAt(277, -24, 'willow', 1.5);
  c.treeAt(255, -20, 'leaf', 1.4);
  rider(c, 246, -8, PI, { robe: [1.06, 1.04, 0.99], face: FACE.scholar, hat: 'douli' });
  rider(c, 240.6, -5.4, PI + 0.1, { robe: [0.8, 0.84, 0.86], face: FACE.man2, hat: 'douli' });
  c.person(249.6, -6.6, -PI / 2, { ...randomLook(rng, 'labor'), prop: 'pole', arms: 'carry' });
  c.person(243.2, -9.4, -PI / 2, { ...randomLook(rng, 'labor'), prop: 'staff', arms: 'down', hat: 'scarf' });
  c.person(236.8, -7.2, -PI / 2, { ...randomLook(rng, 'labor'), prop: 'sack', arms: 'carry' });
  // 路边茅檐茶棚，棚下有人歇脚张望；棚边卧着两三头牛
  c.houseAt(220, zEN(8) - 2, 0, { w: 13, d: 8, h: 3.2, kind: 'tea', roofMat: 'thatch', wall: 'earth', base: 0.14, tint: W_.dark, awning: 2.6 });
  c.at(227.6, EAST_Z - ROAD_HW - 1.2, PI / 2, () => P.banner(b, c.atlas, '茶', 0, 0, 0, { h: 5.4 }));
  for (const [x, z, r] of [[231.5, -50, 0.6], [235.4, -53.4, 2.2], [229.6, -55.6, -0.5]]) {
    c.at(x, z, r, () => P.ox(b));
    colliders.add(x - 1.3, z - 1.3, x + 1.3, z + 1.3);
  }
  // 高台上的望亭
  c.houseAt(206, -74, 0, { w: 5.4, d: 5.4, h: 2.9, base: 3.4, kind: 'tea', hip: 1, tint: W_.red, roofMat: 'tile' });
  // 小路两旁的疏树，近水处的芦草
  for (const [x, z, t, s] of [[372, -57, 'leaf', 1.4], [361, -22, 'willow', 1.4], [341, -28.5, 'willow', 1.3], [322, -36, 'leaf', 1.3], [270, -58, 'leaf', 1.45], [236, -26, 'willow', 1.4], [226, -18, 'leaf', 1.3], [284, -72, 'leaf', 1.5], [246, -62, 'leaf', 1.4]]) c.treeAt(x, z, t, s);
}

// ───────────────────────── 船 ─────────────────────────
export function addBoat(c, x, z, rot, o = {}) {
  const { rng } = c;
  const L = o.small ? 9.5 : o.L || 28, B = o.small ? 2.4 : o.B || 6.4;
  const grp = buildObject(c.mats, (bb) => {
    if (o.small) {
      P.skiff(bb, rng);
      bb.place(-2.6, 0.5, 0, PI / 2, () => figure(bb, { ...randomLook(rng, 'labor'), hat: 'douli', prop: null, arms: 'reach', staticLegs: true }));
      return;
    }
    P.boat(bb, { rng, L, B, ...o });
    const crew = o.crew ?? 4;
    for (let i = 0; i < crew; i++) {
      const onRoof = i === 0;
      const px = onRoof ? L * 0.36 : rng.f(-L * 0.42, -L * 0.16), pz = rng.f(-B * 0.3, B * 0.3);
      bb.place(px, onRoof ? 2.42 : 0.42, pz, rng.f(6.28), () => figure(bb, { ...randomLook(rng, 'labor'), prop: null, arms: rng.pick(['reach', 'down', 'carry']), staticLegs: true }));
    }
    if (o.mast === 'down') {
      // 过桥时众人在篷顶呼喝
      for (let i = 0; i < 4; i++) bb.place(-1 + i * 2.2, 0.2 + B * 0.37 + 0.4, rng.f(-0.5, 0.5), -PI / 2 + rng.f(-0.5, 0.5), () => figure(bb, { ...randomLook(rng, 'labor'), prop: null, arms: rng.pick(['reach', 'hail']), staticLegs: true }));
    }
  });
  grp.position.set(x, -0.75, z);
  grp.rotation.y = rot;
  c.scene.add(grp);
  const ph = rng.f(6);
  c.dynamic.push((t) => {
    grp.position.y = -0.75 + Math.sin(t * 0.9 + ph) * 0.045;
    grp.rotation.z = Math.sin(t * 0.7 + ph) * 0.011;
  });
  c.MAP.boats.push({ x, z, rot, L, B });
  const n = Math.max(2, Math.round(L / (B * 0.9)));
  for (let k = 0; k < n; k++) {
    const t = ((k + 0.5) / n - 0.5) * L * 0.9, cx = x + Math.cos(rot) * t, cz = z - Math.sin(rot) * t, h = B * 0.42;
    colliders.add(cx - h, cz - h, cx + h, cz + h);
  }
}

// ───────────────────────── 汴河码头（北岸） ─────────────────────────
function docks(c) {
  const { b, rng, W_ } = c;
  const BANK = 18 - RV.HW; // 北岸岸线 z
  // 码头街两侧：街北一排铺面，街南一排背河的酒楼饭铺，留出两处下河的岔口
  c.row('N', 208, 44, { z: EAST_Z, kinds: ['shop', 'tea', 'shop', 'house', 'tea', 'store'], thatch: 0.2 });
  c.row('S', 208, 158, { z: EAST_Z, dMax: 9.6, kinds: ['tea', 'shop', 'store', 'tea'], thatch: 0.18 });
  c.row('S', 146, 108, { z: EAST_Z, dMax: 9.6, kinds: ['tea', 'shop', 'store', 'tea'], thatch: 0.12 });
  c.row('S', 96, 62, { z: EAST_Z, dMax: 9.6, kinds: ['tea', 'shop', 'tea'], thatch: 0.12 });
  // 泊船：大漕船一条挨一条靠在土岸边，有的并排两层；没有栈桥，搭跳板上下
  const moor = [[190, 3.6, 0.2, 28], [161, 3.2, 0.06, 30], [162, 11.4, 0.08, 27], [129, 3.4, -0.1, 28], [100, 3.4, 0.12, 30], [99, 11.6, 0.14, 26], [70, 4.0, -0.06, 28], [44, 7.4, 0.34, 26]];
  for (const [x, z, rot, L] of moor) addBoat(c, x, BANK + z, rot, { mast: rng.chance(0.6) ? 'up' : 'none', L, B: 6.4 });
  c.at(0, 0, 0, () => {
    for (const [x, z] of [[186, 3.6], [158, 3.2], [126, 3.4], [97, 3.4], [68, 4]]) b.beam('wood', [x, 0.06, BANK - 1.6], [x + 0.4, -0.2, BANK + z - 2.2], 0.7, 0.07, { color: W_.pale });
  });
  // 河心：一条摇橹的，一条由岸上纤夫拉着逆水上行的
  addBoat(c, 142, BANK + 27, 0.04, { mast: 'none', L: 26, crew: 5 });
  addBoat(c, 74, BANK + 21, PI + 0.05, { mast: 'up', L: 27, crew: 3 });
  for (let i = 0; i < 6; i++) c.person(106 + i * 1.6, BANK - 2.4 - (i % 2) * 0.6, PI / 2, { ...randomLook(rng, 'labor'), prop: null, arms: 'reach', hat: rng.pick(['scarf', 'douli']), lean: 0.34 });
  c.at(0, 0, 0, () => b.rod('flat', [105, 1.25, BANK - 2.6], [79.4, 10.6, BANK + 21], 0.014, 0.014, 3, { color: [0.4, 0.36, 0.3], lw: 0.5 }));
  addBoat(c, 226, BANK + 34, 0.5, { small: true });
  addBoat(c, 118, BANK + 36, -0.1, { small: true });
  // 纲船周老大在岸边点货
  c.npcs.push({ id: 'zhou', name: '周老大', title: '纲船船主', x: 150.6, z: BANK - 5.2, yaw: PI, look: { robe: [0.62, 0.7, 0.76], trim: [0.4, 0.45, 0.5], face: FACE.tanned, hat: 'scarf', arms: 'tuck', s: 1.03 } });
  // 岸上堆货：麻包、箱笼、酒瓮
  const pile = (x, z, kind) => {
    c.at(x, z, rng.f(3), () => {
      if (kind === 0) P.sackPile(b, 0, 0, rng, rng.i(7, 11));
      else if (kind === 1) { P.crate(b, 0, 0, 0); P.crate(b, 0.8, 0, 0.1, 0.9); P.crate(b, 0.3, 0.58, 0, 0.8); }
      else for (let i = 0; i < 4; i++) P.jar(b, (i % 2) * 0.6, 0, Math.floor(i / 2) * 0.6, rng.f(1.1, 1.4), [0.66, 0.54, 0.44]);
    });
    colliders.add(x - 0.9, z - 0.8, x + 0.9, z + 0.8);
  };
  for (const [x, dz, k] of [[194, -5, 0], [188.5, -7.4, 0], [176, -6, 1], [166, -4.6, 0], [156.5, -6.6, 2], [146, -5.4, 0], [140.6, -7.2, 1], [128, -5.2, 0], [117, -6.4, 0], [108.6, -4.8, 2], [94, -6, 0], [88, -4.6, 1], [76, -5.8, 0], [64, -5, 0]]) pile(x, BANK + dz, k);
  // 脚夫扛包上岸
  for (const [x, dz, yaw] of [[185, -2.6, PI], [180.6, -5.6, -PI / 2], [158, -2.8, PI], [152.6, -8, PI], [148, -3, 0], [126, -2.4, PI], [121.4, -6.6, PI / 2], [98, -2.8, PI], [92.4, -7.4, -PI / 2], [72, -3, PI], [66.5, -6.8, PI]])
    c.person(x, BANK + dz, yaw, { ...randomLook(rng, 'labor'), prop: 'sack', arms: 'carry', hat: rng.pick(['scarf', 'none']) });
  c.person(148.4, BANK - 5.8, PI / 2, { ...randomLook(rng, 'scholar'), prop: null });
  c.at(170, BANK - 9, 0.4, () => P.barrow(b, rng));
  colliders.add(168.6, BANK - 9.6, 171.4, BANK - 8.4);
  c.at(112, BANK - 9.4, -0.2, () => P.barrow(b, rng));
  colliders.add(110.6, BANK - 10, 113.4, BANK - 8.8);
  // 街上：驴与赶脚的、牛车
  c.at(132, EAST_Z + 3.6, PI, () => P.donkey(b, [0.9, 0.86, 0.74]));
  colliders.add(131.2, EAST_Z + 3.2, 132.8, EAST_Z + 4.0);
  c.person(130.4, EAST_Z + 3.9, -PI / 2, { ...randomLook(rng, 'labor'), prop: 'staff', arms: 'down' });
  c.at(84, EAST_Z - 2.6, 0, () => { P.oxCart(b); b.place(-4.3, 0, 0, PI, () => P.ox(b)); });
  colliders.add(78.6, EAST_Z - 3.8, 86, EAST_Z - 1.4);
  // 岸柳与岸边的草
  for (let x = 206; x > 34; x -= rng.f(13, 20)) if (Math.abs(x - 152) > 8 && Math.abs(x - 102) > 8) c.treeAt(x, BANK - 1.4 - rng.f(0, 1.2), 'willow', rng.f(1.2, 1.6));
  c.criers.push({ x: 152, z: BANK - 3, lines: ['让一让！让一让！', '轻些放——那是蜀锦！', '嘿哟——嘿哟——'] }, { x: 100, z: BANK - 5, lines: ['江南新米到喽——', '当心脚下！'] });
}

// ───────────────────────── 虹桥 ─────────────────────────
function bridge(c) {
  const { b, rng } = c;
  c.at(BRIDGE.xc, BRIDGE.zc, BRIDGE.ang, () => P.rainbowBridge(b));
  const A = BRIDGE.ang, hw = BRIDGE.hw;
  // 桥上摊贩：两侧支着伞棚，把桥面挤得只剩当中一条道
  const cries = [];
  for (const [s, sd] of [[-25, 1], [-23, -1], [-17, 1], [-15.5, -1], [16, 1], [18, -1], [24, 1], [26, -1], [-9.5, -1], [10, 1]]) {
    const t = sd * (hw - 1.9), [x, z] = bridgeWorld(s, t), y = bridgeProfile(s);
    c.at(x, z, A + (sd > 0 ? PI : 0), () => P.parasolStall(b, rng, { r: 1.25 }), y);
    const [px, pz] = bridgeWorld(s + sd * 0.5, t + sd * 0.45);
    c.person(px, pz, A + (sd > 0 ? PI : 0), { ...randomLook(rng, rng.pick(['man', 'woman', 'labor'])), prop: null, arms: 'tuck' }, y);
    colliders.add(x - 0.8, z - 0.8, x + 0.8, z + 0.8);
    cries.push([x, z]);
  }
  c.criers.push({ x: cries[0][0], z: cries[0][1], lines: ['炊饼——热炊饼！', '香饮子，解渴的香饮子！'] }, { x: cries[5][0], z: cries[5][1], lines: ['果子！时新果子！', '刀剪——磨得快的刀剪！'] });
  // 凭栏看船的人：朝上游一侧（东南）挤得最密
  for (let i = 0; i < 16; i++) {
    const s = -11 + i * 1.45 + rng.f(-0.3, 0.3), y = bridgeProfile(s);
    if (rng.chance(0.9)) {
      const [x, z] = bridgeWorld(s, hw - 0.8);
      c.person(x, z, A, { ...randomLook(rng), prop: null, arms: rng.pick(['reach', 'reach', 'hail', 'tuck']) }, y);
    }
    if (rng.chance(0.45)) {
      const [x, z] = bridgeWorld(s + 0.5, -hw + 0.8);
      c.person(x, z, A + PI, { ...randomLook(rng), prop: null, arms: rng.pick(['reach', 'tuck']) }, y);
    }
  }
  // 桥顶轿马相争：一乘轿子与一骑迎头撞上，两边的仆从各不相让
  {
    const [x, z] = bridgeWorld(3.6, 1.2), y = bridgeProfile(3.6);
    c.at(x, z, A, () => P.sedan(b), y);
    colliders.add(x - 1.6, z - 1.2, x + 1.6, z + 1.2);
    for (const ds of [-1.95, 1.95]) {
      const [px, pz] = bridgeWorld(3.6 + ds, 1.2);
      c.person(px, pz, A - PI / 2, { ...randomLook(rng, 'labor'), prop: null, arms: 'down', hat: 'scarf' }, bridgeProfile(3.6 + ds));
    }
    const [hx, hz] = bridgeWorld(-4.6, -0.9);
    c.at(hx, hz, A + PI, () => { P.horse(b); b.place(-0.05, P.HORSE_SEAT, 0, PI / 2, () => figure(b, { robe: [0.74, 0.46, 0.42], trim: [0.5, 0.3, 0.28], face: FACE.man2, hat: 'official', arms: 'reach', pose: 'ride' })); }, bridgeProfile(-4.6));
    colliders.add(hx - 1.2, hz - 1.2, hx + 1.2, hz + 1.2);
    const [ax, az] = bridgeWorld(-1.6, 0.2), [bx, bz] = bridgeWorld(0.6, -0.4);
    c.person(ax, az, A + PI / 2, { ...randomLook(rng, 'labor'), prop: null, arms: 'hail' }, bridgeProfile(-1.6));
    c.person(bx, bz, A - PI / 2, { ...randomLook(rng, 'labor'), prop: null, arms: 'hail', hat: 'scarf' }, bridgeProfile(0.6));
  }
  c.criers.push({ x: BRIDGE.xc, z: BRIDGE.zc, lines: ['快放桅！要撞上了！', '往左！往左撑！', '让轿！让轿！', '好险——'] });
  // 桥下：一条大船正放倒桅杆抢过桥洞；桥北还有几条靠岸的
  addBoat(c, 16, 15.8, -PI / 3, { mast: 'down', L: 30, B: 6.8, crew: 6 });
  addBoat(c, -30.5, -43.5, -0.72, { mast: 'none', L: 27 });
  addBoat(c, -58, -56, -0.32, { mast: 'up', L: 26 });
  addBoat(c, -98, -69, 0.5, { mast: 'none', L: 24, crew: 3 });
  addBoat(c, -22, -64, 2.3, { small: true });
  // 两头桥堍：伞摊、柳树
  for (const [s, t] of [[44, 9], [42, -10], [-45, 10], [-42, -11], [52, -6]]) {
    const [x, z] = bridgeWorld(s, t);
    c.treeAt(x, z, 'willow', rng.f(1.3, 1.6));
  }
  for (const [s, t, r] of [[38, 4.6, PI], [40.5, -4.8, 0], [-38.5, 4.6, PI], [-41, -5, 0], [34, -7.4, 0]]) {
    const [x, z] = bridgeWorld(s, t);
    c.at(x, z, A + r, () => P.parasolStall(b, rng));
    const [px, pz] = bridgeWorld(s + (r ? -0.5 : 0.5), t + (r ? 0.6 : -0.6));
    c.person(px, pz, A + r, { ...randomLook(rng, 'man'), prop: null, arms: 'tuck' });
    colliders.add(x - 0.9, z - 0.9, x + 0.9, z + 0.9);
  }
}

// ───────────────────────── 城外街市（虹桥西南岸至护城河） ─────────────────────────
function pot(b, rng, x, z, kind) {
  const id = b.nextId();
  b.cyl('flat', x, 0, z, 0.2, 0.14, 0.24, 8, { color: rng.pick([[0.76, 0.6, 0.5], [0.72, 0.82, 0.76], [0.6, 0.62, 0.64]]), id });
  if (kind === 0) {
    b.rod('bark', [x, 0.2, z], [x + 0.08, 0.62, z], 0.035, 0.02, 4, { id });
    b.sphere('flat', x + 0.1, 0.72, z, 0.26, 0.14, 0.24, { color: [0.6, 0.72, 0.52], lw: 0.5 });
    b.sphere('flat', x - 0.12, 0.6, z + 0.05, 0.16, 0.1, 0.16, { color: [0.66, 0.76, 0.56], lw: 0.5 });
  } else if (kind === 1) {
    b.sphere('flat', x, 0.42, z, 0.24, 0.2, 0.24, { color: rng.pick([[0.95, 0.74, 0.72], [0.96, 0.9, 0.86], [0.92, 0.62, 0.56]]), lw: 0.5 });
  } else {
    for (let k = 0; k < 5; k++) b.rod('flat', [x, 0.22, z], [x + rng.f(-0.25, 0.25), 0.62 + rng.f(0.15), z + rng.f(-0.25, 0.25)], 0.018, 0.006, 3, { color: [0.56, 0.7, 0.48], lw: 0.5, id });
  }
}
// 伞摊连同摊主
function stalls(c, list) {
  const { b, rng } = c;
  for (const [x, z, rot] of list) {
    c.at(x, z, rot, () => P.parasolStall(b, rng));
    c.person(x + (rot ? -0.5 : 0.5), z + (rot ? 0.62 : -0.62), rot, { ...randomLook(rng, rng.pick(['man', 'woman'])), prop: null, arms: 'tuck' });
    colliders.add(x - 0.9, z - 0.7, x + 0.9, z + 0.7);
  }
}

function outside(c) {
  const { b, rng, W_, atlas } = c;
  const midCounter = (n) => Array.from({ length: n }, (_, i) => (i === Math.floor(n / 2) ? 'counter' : 'open'));
  // 十千脚店：紧贴虹桥西南桥堍，彩楼欢门正对下桥的人流
  let jd;
  c.at(-56, zS(14) + 0.6, PI, () => {
    jd = P.restaurant(b, { w: 20, d: 14, rng });
    c.patrons(jd);
  });
  register(jd, -56, zS(14) + 0.6, PI);
  c.MAP.houses.push({ x: -56, z: zS(14) + 0.6, w: 22, d: 16.6, rot: PI, big: true });
  let hm;
  c.at(-56, ROAD_HW - 1.3, PI, () => {
    hm = P.huanmen(b, 12, 11.6, rng);
    P.plaque(b, atlas, '十千脚店', 0, 3.25 + 0.62, 0.14, 3.4);
  });
  register(hm, -56, ROAD_HW - 1.3, PI);
  c.at(-44.4, ROAD_HW + 0.4, PI / 2, () => P.banner(b, atlas, '十千脚店', 0, 0, 0, { h: 7.4, bw: 0.9, bh: 3.6 }));
  c.at(-67.4, ROAD_HW + 0.5, PI / 2, () => P.banner(b, atlas, '新酒', 0, 0, 0, { h: 6 }));
  c.at(-62.2, ROAD_HW + 1.0, 0, () => P.vSign(b, atlas, '天之美禄', 0, 2.0, 0, 2.5, PI));
  c.at(-49.8, ROAD_HW + 1.0, 0, () => P.vSign(b, atlas, '十千', 0, 1.7, 0, 1.8, PI));
  c.at(-47.6, ROAD_HW + 0.5, 0, () => { for (let i = 0; i < 6; i++) P.jar(b, (i % 3) * 0.6, 0, Math.floor(i / 3) * 0.6, 1.4, [0.66, 0.52, 0.42]); });
  colliders.add(-48.1, ROAD_HW + 0.1, -45.9, ROAD_HW + 1.5);
  c.person(-52.6, ROAD_HW - 2.2, PI, { robe: [0.8, 0.84, 0.86], face: FACE.man2, hat: 'scarf', arms: 'reach' });
  c.criers.push({ x: -52.6, z: ROAD_HW - 2.2, lines: ['新酒开坛喽——', '客官里边请！楼上有雅座！'] });
  // 街北：一排背河的铺面；汝州瓷器铺（此番入画所添）
  c.row('N', -46, -84);
  const po = c.houseAt(-92, zN(10), 0, { w: 11, d: 10, h: 4, base: 0.35, kind: 'shop', keeper: 'npc', fronts: midCounter, tint: W_.dark });
  c.npcs.push({ id: 'porcelain', name: '柴掌柜', title: '汝州瓷器铺', ...po.keeper, look: { robe: [0.78, 0.84, 0.8], face: FACE.man2, hat: 'futou', arms: 'tuck' } });
  c.at(-85.8, -ROAD_HW - 0.5, PI / 2, () => P.vSign(b, atlas, '汝州瓷器', 0, 2.8, 0, 2.4));
  c.at(-96.4, -ROAD_HW - 0.4, 0, () => {
    P.table(b, 0, 0, 2, 0.7, 0.6);
    for (let i = 0; i < 5; i++) P.jar(b, -0.8 + i * 0.4, 0.64, rng.f(-0.1, 0.1), rng.f(0.55, 0.8), rng.pick([[0.72, 0.84, 0.78], [0.93, 0.93, 0.9], [0.66, 0.8, 0.8]]));
  });
  colliders.add(-97.5, -ROAD_HW - 0.9, -95.3, -ROAD_HW + 0.1);
  c.row('N', -99, -112.5);
  c.row('S', -70, -112.5);
  // 路口：南北向的横街，北头通到河边
  c.rowNS('W', -119, -58, -20);
  c.rowNS('E', -119, -52, -20);
  c.rowNS('W', -119, 20, 58);
  c.rowNS('E', -119, 22, 58);
  // 车轮作坊：就在路口当中干活——一只轮子架在凳上修，地上散着辐条、辋木
  c.at(-116.4, -2.6, 0.3, () => {
    P.wheel(b, 0, 0.72, 0, 0.72);
    b.box('wood', 0, 0.3, 0.5, 0.9, 0.6, 0.3, { color: W_.wood });
    for (let i = 0; i < 6; i++) b.beam('wood', [1.2 + i * 0.16, 0.05, -0.6], [1.5 + i * 0.16, 0.05, 0.7], 0.07, 0.07, { color: W_.pale, lw: 0.5 });
    b.rod('wood', [-1.5, 0.12, -0.5], [-1.5, 0.12, 0.9], 0.12, 0.12, 6, { color: W_.wood });
  });
  c.at(-121.6, 2.4, 1.2, () => {
    b.push(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.12));
    P.wheel(b, 0, 0, -0.1, 0.7);
    b.pop();
  });
  colliders.add(-117.4, -3.4, -115.2, -1.6);
  c.person(-115.2, -1.4, -2.2, { ...randomLook(rng, 'labor'), prop: null, arms: 'reach', hat: 'scarf', lean: 0.3 });
  c.person(-118.4, -3.6, 0.9, { ...randomLook(rng, 'labor'), prop: null, arms: 'reach', lean: 0.26 });
  c.criers.push({ x: -116.4, z: -2.6, lines: ['修车轮——换辐条——', '这辋木是枣木的，结实！'] });
  // 路口以西
  c.row('N', -126, -170);
  c.row('S', -126, -138);
  // 茅顶饭铺，门前歇着两辆牛拉的棚车和一乘轿子
  c.houseAt(-148, zS(9.4), PI, { w: 15, d: 9.4, h: 3.5, base: 0.2, kind: 'tea', roofMat: 'thatch', wall: 'earth', tint: W_.dark, awning: 2.8 });
  c.at(-144, 3.4, 0.14, () => { P.oxCart(b); b.place(-4.3, 0, 0, PI, () => P.ox(b)); });
  colliders.add(-149.6, 2.2, -142, 4.6);
  c.at(-153, -2.8, PI - 0.1, () => { P.oxCart(b); b.place(-4.3, 0, 0, PI, () => P.ox(b)); });
  colliders.add(-155, -4, -147.4, -1.6);
  c.at(-158.6, 4.8, 0.2, () => P.sedan(b));
  colliders.add(-160.2, 4, -157, 5.6);
  // 算命摊：席棚下三块招子——神课 · 看命 · 决疑
  c.at(-166, ROAD_HW + 2.2, PI, () => {
    P.shedStall(b, rng, 3.4);
    ['神课', '看命', '决疑'].forEach((t, i) => P.vSign(b, atlas, t, -1.15 + i * 1.15, 1.8, 1.05, 0.95, 0));
  });
  colliders.add(-167.9, ROAD_HW + 1.2, -164.1, ROAD_HW + 3);
  c.npcs.push({ id: 'fortune', name: '李铁口', title: '算命先生', x: -166, z: ROAD_HW + 3, yaw: PI, look: { robe: [0.72, 0.74, 0.72], face: FACE.elder, hat: 'futou', arms: 'tuck' } });
  c.criers.push({ x: -166, z: ROAD_HW + 2.2, lines: ['看命——决疑——', '一卦知行情，不准不要钱！'] });
  c.row('S', -172, -182);
  // 街北一座带门楼的院落（寺院）：山门临街，殿宇在后
  c.houseAt(-188, zN(5), 0, { w: 8, d: 5, h: 3.8, base: 0.45, kind: 'house', tint: W_.red, hip: 0 });
  c.houseAt(-188, -32, 0, { w: 19, d: 11, h: 4.8, base: 0.7, kind: 'house', tint: W_.red, hip: 1 });
  c.at(0, 0, 0, () => {
    for (const sx of [-1, 1]) b.box('plaster', -188 + sx * 9.4, 1.3, -ROAD_HW - 3.5, 10.6, 2.6, 0.4, { color: [1.0, 0.86, 0.78] });
    for (const sx of [-1, 1]) b.box('plaster', -188 + sx * 14.6, 1.3, -27.2, 0.4, 2.6, 35, { color: [1.0, 0.86, 0.78] });
    b.box('plaster', -188, 1.3, -44.5, 29.6, 2.6, 0.4, { color: [1.0, 0.86, 0.78] });
    // 墙头压瓦
    const cap = { color: [0.44, 0.46, 0.48], id: b.nextId() };
    for (const sx of [-1, 1]) {
      b.box('flat', -188 + sx * 9.4, 2.68, -ROAD_HW - 3.5, 10.8, 0.16, 0.7, cap);
      b.box('flat', -188 + sx * 14.6, 2.68, -27.2, 0.7, 0.16, 35.2, cap);
    }
    b.box('flat', -188, 2.68, -44.5, 29.8, 0.16, 0.7, cap);
  });
  colliders.add(-202.8, -ROAD_HW - 3.8, -192.2, -ROAD_HW - 3.2);
  colliders.add(-183.8, -ROAD_HW - 3.8, -173.2, -ROAD_HW - 3.2);
  colliders.add(-202.9, -44.5, -202.3, -ROAD_HW - 3.2);
  colliders.add(-173.7, -44.5, -173.1, -ROAD_HW - 3.2);
  colliders.add(-202.9, -44.8, -173.1, -44.2);
  c.person(-186.4, -ROAD_HW - 0.4, 0.3, { robe: [0.78, 0.74, 0.6], face: FACE.man3, hat: 'none', arms: 'tuck' });
  c.row('N', -204, -214);
  // 花木担（此番入画所添）
  c.at(-190, ROAD_HW + 2.6, PI, () => {
    P.shedStall(b, rng, 3.6);
    for (let i = 0; i < 14; i++) pot(b, rng, -3 + (i % 7) * 1.0, 1.5 + Math.floor(i / 7) * 0.8 + rng.f(-0.1, 0.1), i % 3);
    for (let i = 0; i < 4; i++) pot(b, rng, -2.6 + i * 0.5, -1.4, 1);
  });
  colliders.add(-193.6, ROAD_HW + 0.2, -186.4, ROAD_HW + 3.6);
  c.npcs.push({ id: 'flower', name: '花婆婆', title: '花木担', x: -190, z: ROAD_HW + 4, yaw: PI, look: { robe: [0.78, 0.84, 0.74], face: FACE.granny, hat: 'bun', arms: 'tuck', s: 0.92 } });
  c.row('S', -197, -213);
  stalls(c, [[-78, -5.6, 0], [-134, 5.4, PI], [-104, -5.6, 0], [-176, -5.4, 0], [-207, 5.5, PI]]);
  c.at(-40, -4.2, 0.3, () => P.barrow(b, rng));
  colliders.add(-41.4, -4.8, -38.6, -3.6);
  // 护城河：两岸的老柳；平桥上凭栏看水的人
  for (let z = -104; z <= 100; z += rng.f(11, 17)) {
    if (Math.abs(z) < 12) continue;
    if (rng.chance(0.85)) c.treeAt(RV.MOAT_X + RV.MOAT_HW + rng.f(1.6, 3.4), z + rng.f(-2, 2), 'willow', rng.f(1.35, 1.75));
    if (rng.chance(0.7)) c.treeAt(RV.MOAT_X - RV.MOAT_HW - rng.f(1.6, 3), z + rng.f(-2, 2), 'willow', rng.f(1.3, 1.6));
  }
}

// ───────────────────────── 城门 ─────────────────────────
function scaleInfo(info, k) {
  const sc = (v) => (v === undefined || Math.abs(v) > 1e8 ? v : v * k);
  return {
    ...info,
    solids: (info.solids || []).map((r) => [r[0] * k, r[1] * k, r[2] * k, r[3] * k, sc(r[4]), sc(r[5])]),
    decks: (info.decks || []).map((r) => r.map((v) => v * k)),
    ramps: (info.ramps || []).map((r) => [r[0] * k, r[1] * k, r[2] * k, r[3] * k, r[4], r[5] * k, r[6] * k]),
    ceils: (info.ceils || []).map((r) => r.map((v) => v * k)),
  };
}
function gate(c) {
  const { b, rng, W_ } = c;
  const K = GATE.K, ZW = 210;
  // 城墙、城台、马道、城楼：墙头与城楼都上得去（整体放大 K 倍）
  let gi;
  c.at(GATE.x, 0, 0, () => {
    b.push(new THREE.Matrix4().makeScale(K, K, K));
    gi = P.cityGate(b, -ZW / K, ZW / K);
    b.pop();
  });
  gi = scaleInfo(gi, K);
  gi.lot = false;
  register(gi, GATE.x, 0, 0);
  colliders.addLot(GATE.x - 8.6 * K, -ZW - 20, GATE.x + 5.4 * K, ZW + 20);
  c.MAP.walls.push({ x: GATE.x, z0: -ZW, z1: ZW });
  // 平桥：与街同宽，两侧栏杆上趴满了看水的人
  c.at(0, 0, 0, () => P.flatBridge(b, MOAT_BRIDGE.x0, MOAT_BRIDGE.x1, MOAT_BRIDGE.hw, MOAT_BRIDGE.y));
  addDeck(MOAT_BRIDGE.x0 - 0.6, -MOAT_BRIDGE.hw + 0.35, MOAT_BRIDGE.x1 + 0.6, MOAT_BRIDGE.hw - 0.35, MOAT_BRIDGE.y);
  for (const sz of [-1, 1])
    for (let x = MOAT_BRIDGE.x0 + 2; x < MOAT_BRIDGE.x1 - 1; x += rng.f(1.5, 2.4)) {
      if (rng.chance(0.3)) continue;
      c.person(x, sz * (MOAT_BRIDGE.hw - 0.75), sz > 0 ? 0 : PI, { ...randomLook(rng), prop: null, arms: rng.pick(['reach', 'reach', 'tuck']), lean: 0.22 }, MOAT_BRIDGE.y);
    }
  // 出城的驼队：头驼已探出门洞
  for (const x of [GATE.x + 8, GATE.x + 1.2, GATE.x - 5.8]) {
    c.at(x, -1.7, 0, () => P.camel(b, [0.9, 0.84, 0.7]));
    colliders.add(x - 1.2, -2.3, x + 1.4, -1.1);
  }
  c.person(GATE.x + 12.4, -1.1, PI / 2, { robe: [0.82, 0.74, 0.6], face: FACE.tanned, hat: 'scarf', long: false, arms: 'down', prop: 'staff' });
  c.criers.push({ x: GATE.x + 8, z: -1, lines: ['驼铃叮当——', '让路，骆驼出城！'] });
  // 税务所：紧挨城门里头的街北，门前堆着货包，税吏正验货
  const tx = c.houseAt(-285, zN(8), 0, { w: 11, d: 8, h: 3.8, base: 0.35, kind: 'shop', keeper: false, fronts: (n) => Array(n).fill('open') });
  c.at(-285, -ROAD_HW - 3.2, 0, () => P.table(b, 0, 0, 1.8, 0.8));
  c.npcs.push({ id: 'tax', name: '税吏', title: '税务所', x: -285, z: -ROAD_HW - 4, y: tx.y0, yaw: 0, look: { robe: [0.66, 0.74, 0.8], face: FACE.man2, hat: 'official', arms: 'tuck' } });
  c.at(-280.4, -ROAD_HW + 0.6, 0, () => P.sackPile(b, 0, 0, rng, 10));
  colliders.add(-281.5, -ROAD_HW - 0.2, -279.3, -ROAD_HW + 1.3);
  c.person(-282.4, -ROAD_HW + 0.2, PI / 2, { ...randomLook(rng, 'labor'), prop: null, arms: 'reach' });
  c.person(-287, -ROAD_HW + 0.4, PI / 2 + 0.6, { ...randomLook(rng, 'scholar'), prop: null, arms: 'chat' });
  // 城门里头街南：一间小铺
  c.houseAt(-284, zS(7), PI, { w: 9, d: 7, h: 3.5, base: 0.3, kind: 'shop', tint: W_.dark });
  // 城墙是颓了的土墙，墙根墙头长满了树
  for (let z = -ZW + 8; z <= ZW - 8; z += rng.f(9, 15)) {
    if (Math.abs(z) < GATE.halfZ + 5) continue;
    c.treeAt(GATE.x + 5.4 * K + rng.f(3.6, 7), z, rng.pick(['leaf', 'dark', 'leaf']), rng.f(1.2, 1.6));
    if (rng.chance(0.6)) c.treeAt(GATE.x - 8.6 * K - rng.f(3.6, 7), z + rng.f(-3, 3), rng.pick(['leaf', 'dark']), rng.f(1.1, 1.5));
  }
}

// ───────────────────────── 城内 ─────────────────────────
function city(c) {
  const { b, rng, W_, atlas } = c;
  const midCounter = (n) => Array.from({ length: n }, (_, i) => (i === Math.floor(n / 2) ? 'counter' : 'open'));
  const CX = -342; // 城内横街
  // ── 街北，自东向西：税务所（见城门）→ 肉铺 → 孙羊正店 → [横街] → 刘家香铺 → 柳与井 → 赵太丞家 → 深宅大门 ──
  c.houseAt(-296, zN(9), 0, { w: 8.4, d: 9, h: 3.8, base: 0.35, kind: 'shop', tint: W_.wood, awning: 2.4 });
  c.at(-292.6, -ROAD_HW - 0.5, PI / 2, () => P.vSign(b, atlas, '孙羊店', 0, 2.9, 0, 2.2));
  // 孙羊正店：街北，占着路口东北角；彩楼欢门朝南临街
  let zd;
  const ZDX = -317, ZDZ = zN(16) - 0.6;
  c.at(ZDX, ZDZ, 0, () => {
    zd = P.restaurant(b, { w: 26, d: 16, rng });
    c.patrons(zd, 0.6);
  });
  register(zd, ZDX, ZDZ, 0);
  c.MAP.houses.push({ x: ZDX, z: ZDZ, w: 28, d: 18.6, rot: 0, big: true });
  let hm;
  c.at(ZDX, -ROAD_HW + 1.3, 0, () => {
    hm = P.huanmen(b, 16, 14.2, rng);
    P.plaque(b, atlas, '孙羊正店', 0, 3.25 + 0.62, 0.14, 3.8);
  });
  register(hm, ZDX, -ROAD_HW + 1.3, 0);
  c.at(ZDX + 14.6, -ROAD_HW - 0.4, PI / 2, () => P.banner(b, atlas, '孙羊店', 0, 0, 0, { h: 7.6, bw: 0.95, bh: 3.4 }));
  c.at(ZDX - 14.4, -ROAD_HW - 0.4, PI / 2, () => P.banner(b, atlas, '香醪', 0, 0, 0, { h: 6.4 }));
  c.at(ZDX - 5.2, -ROAD_HW - 1.0, 0, () => P.vSign(b, atlas, '正店', 0, 1.9, 0, 1.9, 0));
  c.at(ZDX + 5.2, -ROAD_HW - 1.0, 0, () => P.vSign(b, atlas, '孙羊', 0, 1.9, 0, 1.9, 0));
  c.at(ZDX + 9.6, -ROAD_HW - 0.9, 0, () => { for (let i = 0; i < 8; i++) P.jar(b, (i % 4) * 0.6, i > 3 ? 0.66 : 0, 0, 1.4, [0.66, 0.52, 0.42]); });
  colliders.add(ZDX + 9.1, -ROAD_HW - 1.4, ZDX + 12, -ROAD_HW - 0.4);
  c.npcs.push({ id: 'sun', name: '孙掌柜', title: '孙羊正店', x: ZDX + 6.4, z: -ROAD_HW + 2.4, yaw: 0, look: { robe: [0.9, 0.86, 0.72], trim: [0.6, 0.5, 0.36], face: FACE.man2, hat: 'futou', arms: 'tuck', s: 1.04 } });
  c.criers.push({ x: ZDX, z: -ROAD_HW - 2, lines: ['正店新酿，香飘十里——', '楼上临街雅座三位！'] });
  // 刘家上色沉檀拣香：路口西北角
  const xi = c.houseAt(-353.5, zN(10), 0, { w: 11.4, d: 10, h: 4.1, base: 0.35, kind: 'shop', keeper: 'npc', fronts: midCounter, tint: W_.red, awning: 2.4 });
  c.npcs.push({ id: 'xiang', name: '刘掌柜', title: '刘家香药铺', ...xi.keeper, look: { robe: [0.86, 0.8, 0.66], face: FACE.man2, hat: 'futou', arms: 'tuck' } });
  c.at(-347.2, -ROAD_HW - 0.4, PI / 2, () => {
    P.vSign(b, atlas, '刘家上色沉檀拣香', 0, 2.6, 0, 4.2);
    b.box('wood', 0, 0.25, 0, 0.5, 0.5, 0.2, { color: W_.dark });
  });
  colliders.add(-347.4, -ROAD_HW - 0.7, -347, -ROAD_HW - 0.1);
  // 大柳树下一口四眼方井，汲水的人
  c.at(-366, -ROAD_HW - 4.6, 0, () => squareWell(b, W_));
  colliders.add(-367.5, -ROAD_HW - 6.1, -364.5, -ROAD_HW - 3.1);
  c.treeAt(-361.4, -ROAD_HW - 7.6, 'willow', 1.7);
  c.person(-364, -ROAD_HW - 3.2, -PI / 2 - 0.5, { ...randomLook(rng, 'labor'), prop: null, arms: 'reach', lean: 0.32 });
  c.person(-367.6, -ROAD_HW - 2.6, 0.5, { ...randomLook(rng, 'labor'), prop: 'pole', arms: 'carry' });
  c.person(-368.4, -ROAD_HW - 5.6, PI / 2, { ...randomLook(rng, 'woman'), prop: 'basket' });
  // 赵太丞家：卷尾街北
  const zh = c.houseAt(-381, zN(11), 0, { w: 13, d: 11, h: 4.2, base: 0.4, kind: 'shop', keeper: 'npc', fronts: midCounter, tint: W_.dark });
  c.npcs.push({ id: 'zhao', name: '赵太丞', title: '赵太丞家 · 医铺', ...zh.keeper, look: { robe: [0.93, 0.92, 0.88], face: FACE.elder, hat: 'futou', arms: 'tuck' } });
  c.at(-381, -ROAD_HW - 0.9, 0, () => P.plaque(b, atlas, '赵太丞家', 0, 3.8, 0, 3));
  c.at(-387.6, -ROAD_HW - 0.4, PI / 2, () => P.vSign(b, atlas, '治酒所伤真方集香丸', 0, 2.5, 0, 4.2));
  c.at(-374.4, -ROAD_HW - 0.4, PI / 2, () => P.vSign(b, atlas, '大理中丸医肠胃冷', 0, 2.5, 0, 4.2));
  // 西邻一座深宅：门屋临街，门前有人闲坐
  c.houseAt(-395.4, zN(7), 0, { w: 9, d: 7, h: 4.2, base: 0.5, kind: 'house', tint: W_.red });
  c.person(-393.2, -ROAD_HW - 0.2, 0.4, { ...randomLook(rng, 'man'), pose: 'sit', prop: null, arms: 'tuck' });
  // ── 街南，自东向西：小铺（见城门）→ 一排铺面 → 久住王员外家 → [横街] →“解”字铺与说书棚 → 墨缘斋 ──
  c.row('S', -291, -320.5);
  c.houseAt(-329, zS(11), PI, { w: 13.4, d: 11, h: 4.5, base: 0.4, kind: 'house', tint: W_.red });
  c.at(-321.6, ROAD_HW + 0.4, PI / 2, () => {
    P.vSign(b, atlas, '久住王员外家', 0, 2.5, 0, 3.9);
    b.box('wood', 0, 0.25, 0, 0.5, 0.5, 0.2, { color: W_.dark });
  });
  colliders.add(-321.8, ROAD_HW + 0.1, -321.4, ROAD_HW + 0.7);
  // 两辆满载大木桶的牛车正拐过路口
  c.at(-331, 3.2, 0.1, () => {
    P.oxCart(b);
    for (const sx of [-0.8, 0.8]) b.rod('wood', [sx, 1.14, 0], [sx, 2.24, 0], 0.62, 0.56, 12, { color: W_.wood });
    b.place(-4.3, 0, 0, PI, () => P.ox(b));
  });
  colliders.add(-336.6, 2, -329, 4.4);
  // “解”字铺：路口西南角；檐下搭着席棚，棚里说书的霍四究和一圈听众
  c.houseAt(-355, zS(10), PI, { w: 12.6, d: 10, h: 4.1, base: 0.35, kind: 'store', tint: W_.dark });
  c.at(-353, ROAD_HW + 0.5, PI, () => P.plaque(b, atlas, '解', 0, 3.2, 0, 1.5, 0, { bg: '#efe6d0', fg: '#231a14', border: '#3a2c22' }));
  c.at(-350.6, ROAD_HW - 1.2, PI, () => {
    const id = b.nextId();
    for (const sx of [-2.6, 2.6]) for (const sz of [-1.5, 1.5]) b.cyl('wood', sx, 0, sz, 0.05, 0.06, 2.9, 5, { color: W_.dark, id });
    b.box('mat', 0, 2.96, 0, 5.8, 0.08, 3.6, { color: [0.96, 0.9, 0.78], id: b.nextId(), lw: 0.7 });
    P.table(b, 0, 1.0, 1.0, 0.5, 0.8);
  });
  c.npcs.push({ id: 'story', name: '霍四究', title: '说书人', x: -350.6, z: ROAD_HW - 0.2, yaw: PI, look: { robe: [0.86, 0.82, 0.7], face: FACE.man2, hat: 'futou', arms: 'chat', prop: 'fan' } });
  colliders.add(-351.2, ROAD_HW - 2.5, -350, ROAD_HW - 1.9);
  for (let i = 0; i < 11; i++) {
    const a = PI + 0.25 + (i / 10) * (PI - 0.5), r = 2.6 + (i % 2) * 1.0;
    const x = -350.6 + Math.cos(a) * r * 1.25, z = ROAD_HW - 1.6 + Math.sin(a) * r;
    if (z > ROAD_HW - 2.6 && Math.abs(x + 350.6) < 2) continue;
    c.person(x, z, Math.atan2(-350.6 - x, ROAD_HW - 0.2 - z), { ...randomLook(rng), prop: null, arms: 'tuck' });
  }
  c.criers.push({ x: -350.6, z: ROAD_HW - 0.2, lines: ['话说那汉末三分……', '欲知后事如何——', '列位，且听我慢慢道来。'] });
  c.row('S', -362.5, -379);
  // 墨缘斋字画铺（此番入画所添）
  const an = c.houseAt(-386, zS(9), PI, { w: 11, d: 9, h: 4, base: 0.35, kind: 'shop', keeper: 'npc', fronts: midCounter, tint: W_.dark });
  c.npcs.push({ id: 'antique', name: '米先生', title: '墨缘斋', ...an.keeper, look: { robe: [0.93, 0.92, 0.88], inner: [0.6, 0.66, 0.72], face: FACE.man, hat: 'futou', arms: 'tuck', prop: 'fan' } });
  c.at(-386, ROAD_HW + 0.9, PI, () => P.plaque(b, atlas, '墨缘斋', 0, 3.6, 0, 2.5));
  c.at(-391, ROAD_HW + 0.4, 0, () => {
    // 门外晾挂的字画
    const id = b.nextId();
    for (const sx of [-1, 1]) b.cyl('wood', sx * 1.1, 0, 0, 0.04, 0.05, 2.5, 5, { color: W_.dark, id });
    b.rod('wood', [-1.2, 2.45, 0], [1.2, 2.45, 0], 0.03, 0.03, 4, { color: W_.dark, id });
    for (let i = 0; i < 3; i++) {
      const r = atlas.picture('scroll' + i, (ctx, x, y, w, h) => (i === 1 ? paintCalligraphy(ctx, x, y, w, h, '清风明月本无价', { cols: 1 }) : paintLandscape(ctx, x, y, w, h, 31 + i)));
      const px = -0.72 + i * 0.72;
      for (const s of [1, -1]) b.quad('sign', [px - s * 0.26, 0.5, s * 0.01], [px + s * 0.26, 0.5, s * 0.01], [px + s * 0.26, 2.4, s * 0.01], [px - s * 0.26, 2.4, s * 0.01], { rect: r, lw: 0.7 });
    }
  });
  colliders.add(-392.3, ROAD_HW + 0.2, -389.7, ROAD_HW + 0.6);
  // ── 横街：北头里有王家罗锦匹帛铺 ──
  const sk = c.houseAt(CX + 5.4 + 5.2, -32, -PI / 2, { w: 12.4, d: 10.4, h: 4.1, base: 0.35, kind: 'shop', keeper: 'npc', fronts: midCounter, tint: W_.wood });
  c.npcs.push({ id: 'silk', name: '王掌柜', title: '王家罗锦匹帛铺', ...sk.keeper, look: { robe: [0.72, 0.78, 0.84], face: FACE.man, hat: 'futou', arms: 'tuck' } });
  c.at(CX + 5, -25.2, 0, () => P.vSign(b, atlas, '王家罗锦匹帛铺', 0, 2.6, 0, 3.8));
  c.at(CX + 4.6, -36, PI / 2, () => {
    P.table(b, 0, 0, 2, 0.7, 0.62);
    const cols = [[0.84, 0.5, 0.44], [0.6, 0.7, 0.78], [0.9, 0.82, 0.56], [0.76, 0.84, 0.7], [0.93, 0.92, 0.88], [0.8, 0.66, 0.8]];
    for (let i = 0; i < 6; i++) b.rod('flat', [-0.75 + i * 0.3, 0.74, -0.25], [-0.75 + i * 0.3, 0.74, 0.25], 0.08, 0.08, 6, { color: cols[i], lw: 0.6 });
  });
  colliders.add(CX + 4.1, -37.1, CX + 5.1, -34.9);
  c.rowNS('E', CX, -90, -43);
  c.rowNS('W', CX, -90, -53);
  c.rowNS('W', CX, -39, -22);
  c.rowNS('W', CX, 22, 58);
  c.rowNS('E', CX, 24, 58);
  // 甜水巷南侧与沈宅左右的人家
  for (let x = CX - 8; x > -398; ) {
    const w = rng.f(10, 13.5);
    if (x - w < -399) break;
    c.houseAt(x - w / 2, -46 + 3.6 + 3.4, PI, { w: w - 1, d: 6.8, kind: 'house', h: 3.5, base: 0.3, tint: rng.pick([W_.wood, W_.dark]) });
    x -= w;
  }
  c.houseAt(-394, -62, -PI / 2, { w: 11, d: 8, kind: 'house', h: 3.6, base: 0.3, tint: W_.dark });
  for (const [x, z, t] of [[-388, -52, 'leaf'], [-357.4, -52, 'willow'], [-390, -76, 'leaf'], [-354, -80, 'leaf'], [-368, -30, 'leaf']]) c.treeAt(x, z, t, rng.f(1.2, 1.5));
  // 路口的行人车马：卷尾一位戴笠骑驴的官人带着随从；伞摊
  rider(c, -390, 2.6, PI, { robe: [1.08, 1.07, 1.02], face: FACE.scholar, hat: 'douli' }, 'horse');
  c.person(-387.2, 3.6, -PI / 2, { ...randomLook(rng, 'labor'), prop: 'pole', arms: 'carry' });
  c.person(-392.6, 1.4, -PI / 2, { ...randomLook(rng, 'man'), prop: null, arms: 'back' });
  stalls(c, [[-359.6, -ROAD_HW + 0.9, 0], [-304, 5.6, PI], [-372.4, 5.5, PI], [-336.4, -5.7, 0]]);
  c.criers.push({ x: -304, z: 5.6, lines: ['胡饼——刚出炉的胡饼！', '汤饼一碗，热乎的！'] }, { x: -359.6, z: -5.5, lines: ['饮子——香饮子——', '梳篦、针线、胭脂水粉——'] });
}

// ───────────────────────── 沈宅 ─────────────────────────
function chair(b, x, z, ry, W_) {
  b.place(x, 0, z, ry, () => {
    const id = b.nextId();
    b.box('wood', 0, 0.45, 0, 0.52, 0.05, 0.46, { color: W_.red, id });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box('wood', sx * 0.23, 0.225, sz * 0.2, 0.05, 0.45, 0.05, { color: W_.red, id });
    b.box('wood', 0, 0.78, -0.21, 0.5, 0.6, 0.04, { color: W_.red, id });
  });
}

function home(c) {
  const { b, rng, W_, atlas } = c;
  const { x: hx, z: hz, w, d, hallZ, hallW, hallD, floorY } = HOME;
  const hw = w / 2, hd = d / 2, wallH = 2.5;
  const surfaces = [];
  c.chunk(hx);
  b.chunk = 'home';
  const wall = (x0, z0, x1, z1) => {
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, sx = Math.abs(x1 - x0) + 0.36, sz = Math.abs(z1 - z0) + 0.36;
    const id = b.nextId();
    b.box('plaster', cx, wallH / 2, cz, sx, wallH, sz, { id });
    b.box('flat', cx, wallH + 0.07, cz, sx + 0.3, 0.14, sz + 0.3, { color: [0.6, 0.63, 0.64], id });
    b.box('flat', cx, wallH + 0.2, cz, sx + 0.04, 0.12, sz + 0.04, { color: [0.5, 0.52, 0.53], id });
    colliders.add(hx + cx - sx / 2, hz + cz - sz / 2, hx + cx + sx / 2, hz + cz + sz / 2);
  };
  b.place(hx, 0, hz, 0, () => {
    wall(-hw, -hd, hw, -hd);
    wall(hw, -hd, hw, hd);
    wall(-hw, -hd, -hw, hd);
    wall(-hw, hd, -1.55, hd);
    wall(1.55, hd, hw, hd);
    // 门楼
    const gid = b.nextId();
    for (const sx of [-1, 1]) b.box('wood', sx * 1.45, 1.55, hd, 0.26, 3.1, 0.4, { color: W_.red, id: gid });
    b.box('wood', 0, 3.0, hd, 3.3, 0.26, 0.42, { color: W_.red, id: gid });
    b.box('stone', 0, 0.06, hd, 2.7, 0.12, 0.7, {});
    b.place(0, 0, hd, 0, () => P.roof(b, { hw: 1.75, hd: 0.55, y: 3.15, pitch: 0.75, oe: 0.6, og: 0.4 }));
    P.plaque(b, atlas, '沈宅', 0, 2.52, hd + 0.24, 1.35);
    // 敞开的门扇
    b.box('wood', -1.3 + 0.1, 1.2, hd - 0.62, 0.07, 2.4, 1.2, { color: [0.95, 0.6, 0.52], ry: 0.12 });
    b.box('wood', 1.3 - 0.1, 1.2, hd - 0.62, 0.07, 2.4, 1.2, { color: [0.95, 0.6, 0.52], ry: -0.12 });
    P.lantern(b, -1.9, 2.9, hd + 0.5, 1.4);
    P.lantern(b, 1.9, 2.9, hd + 0.5, 1.4);
    // 甬路
    b.box('stone', 0, 0.02, (hd + hallZ + hallD / 2) / 2 + 0.6, 2.4, 0.04, hd - (hallZ + hallD / 2) - 1.2, { lw: 0.6 });

    // ── 正堂 ──
    const hwH = hallW / 2, hdH = hallD / 2, fz = hallZ + hdH, bz = hallZ - hdH, y0 = floorY, h = 3.7, y1 = y0 + h;
    b.box('stone', 0, y0 / 2, hallZ, hallW + 1.4, y0, hallD + 1.4, {});
    b.box('stone', 0, y0 * 0.33, fz + 0.95, 4.2, y0 * 0.66, 0.5, {});
    b.box('stone', 0, y0 * 0.16, fz + 1.35, 4.2, y0 * 0.33, 0.5, {});
    b.box('brick', 0, y0 + 0.015, hallZ, hallW - 0.3, 0.03, hallD - 0.3, { color: [1.05, 1.04, 1.0], lw: 0.5 });
    const fid = b.nextId(), bays = 3, bw = hallW / bays;
    for (let i = 0; i <= bays; i++) for (const z of [bz, fz]) b.cyl('wood', -hwH + i * bw, y0, z, 0.14, 0.15, h, 8, { color: W_.red, id: fid });
    for (const z of [bz, fz]) b.box('wood', 0, y1 - 0.18, z, hallW + 0.36, 0.32, 0.22, { color: W_.red, id: fid });
    for (const x of [-hwH, hwH]) b.box('wood', x, y1 - 0.18, hallZ, 0.22, 0.32, hallD + 0.36, { color: W_.red, id: fid });
    b.box('plaster', 0, y0 + h / 2, bz, hallW, h, 0.16, {});
    for (const sx of [-1, 1]) b.box('plaster', sx * hwH, y0 + h / 2, hallZ, 0.16, h, hallD, {});
    for (let i = 0; i < bays; i++) {
      const cx = -hwH + (i + 0.5) * bw;
      b.box('lattice', cx, y1 - 0.72, fz, bw - 0.3, 0.62, 0.08);
      // 折叠敞开的槅扇
      for (const sx of [-1, 1]) b.box('lattice', cx + sx * (bw / 2 - 0.2), y0 + 1.45, fz - 0.42, 0.07, 2.7, 0.8, { ry: sx * 0.12 });
    }
    b.box('wood', 0, y1 - 0.02, hallZ, hallW - 0.3, 0.06, hallD - 0.3, { color: W_.dark, lw: 0.5 });
    b.place(0, 0, hallZ, 0, () => P.roof(b, { hw: hwH, hd: hdH, y: y1, pitch: 0.6, oe: 1.25, og: 0.7 }));
    // 家具
    b.place(0, y0, 0, 0, () => {
      P.table(b, 0, bz + 0.5, 2.6, 0.5, 1.0, W_.red);
      P.table(b, 0, bz + 1.75, 1.05, 1.05, 0.8, W_.red);
      chair(b, -1.15, bz + 1.75, PI / 2, W_);
      chair(b, 1.15, bz + 1.75, -PI / 2, W_);
      P.table(b, 4.3, bz + 1.0, 1.8, 0.75, 0.78, W_.wood);
      chair(b, 4.3, bz + 1.85, PI, W_);
      // 榻
      const id = b.nextId();
      b.box('wood', -4.3, 0.24, bz + 0.85, 2.2, 0.48, 1.05, { color: W_.wood, id });
      b.box('wood', -4.3, 0.72, bz + 0.36, 2.2, 0.5, 0.06, { color: W_.wood, id });
      b.box('mat', -4.3, 0.5, bz + 0.88, 2.0, 0.04, 0.9, { color: [0.98, 0.95, 0.88], id });
    });
    const col = (x0, z0, x1, z1) => colliders.add(hx + x0, hz + z0, hx + x1, hz + z1);
    col(-hwH, bz - 0.1, hwH, bz + 0.12);
    col(-hwH - 0.1, bz, -hwH + 0.1, fz);
    col(hwH - 0.1, bz, hwH + 0.1, fz);
    col(-1.3, bz + 0.2, 1.3, bz + 0.8);
    col(-0.55, bz + 1.2, 0.55, bz + 2.3);
    col(-1.45, bz + 1.5, -0.9, bz + 2.0);
    col(0.9, bz + 1.5, 1.45, bz + 2.0);
    col(3.4, bz + 0.6, 5.2, bz + 1.4);
    col(-5.4, bz + 0.3, -3.2, bz + 1.4);
    for (let i = 0; i <= bays; i++) col(-hwH + i * bw - 0.16, fz - 0.16, -hwH + i * bw + 0.16, fz + 0.16);

    // 可摆放陈设的面（世界坐标）
    const F = (x0, z0, x1, z1, y, kind = 'floor') => surfaces.push({ kind, x0: hx + x0, z0: hz + z0, x1: hx + x1, z1: hz + z1, y });
    F(-hwH + 0.3, bz + 0.25, hwH - 0.3, fz - 0.2, y0 + 0.03);
    F(-hw + 0.5, fz + 1.7, hw - 0.5, hd - 0.5, 0);
    F(-1.25, bz + 0.3, 1.25, bz + 0.7, y0 + 1.035, 'top');
    F(-0.48, bz + 1.27, 0.48, bz + 2.23, y0 + 0.835, 'top');
    F(3.45, bz + 0.68, 5.15, bz + 1.32, y0 + 0.815, 'top');
    surfaces.push({ kind: 'wall', axis: 'z', pos: hz + bz + 0.09, n: 1, a0: hx - hwH + 0.5, a1: hx + hwH - 0.5, y0: y0 + 1.3, y1: y0 + 3.2 });
    surfaces.push({ kind: 'wall', axis: 'x', pos: hx - hwH + 0.09, n: 1, a0: hz + bz + 0.5, a1: hz + fz - 0.9, y0: y0 + 1.3, y1: y0 + 3.2 });
    surfaces.push({ kind: 'wall', axis: 'x', pos: hx + hwH - 0.09, n: -1, a0: hz + bz + 0.5, a1: hz + fz - 0.9, y0: y0 + 1.3, y1: y0 + 3.2 });
    addDeck(hx - hwH - 0.7, hz + bz - 0.7, hx + hwH + 0.7, hz + fz + 1.1, y0);
    addDeck(hx - 2.1, hz + fz + 1.1, hx + 2.1, hz + fz + 1.6, y0 * 0.5);

    // 院中
    P.jar(b, 4.4, 0, fz + 2.2, 2.2, [0.6, 0.56, 0.5]);
    col(3.9, fz + 1.7, 4.9, fz + 2.7);
    b.cyl('stone', -3.4, 0, 8.6, 0.55, 0.5, 0.62, 8, {});
    for (const [sx, sz] of [[0.95, 0], [-0.95, 0], [0, 0.95], [0, -0.95]]) b.cyl('stone', -3.4 + sx, 0, 8.6 + sz, 0.2, 0.2, 0.42, 7, {});
    col(-4.6, 7.4, -2.2, 9.8);
  });
  // 厢房与货棚
  c.chunk(hx);
  b.chunk = 'home';
  let wing;
  b.place(hx - 8.6, 0, hz + 7.4, PI / 2, () => (wing = P.house(b, { rng, w: 7.4, d: 5, h: 3.0, kind: 'house', tint: W_.red })));
  register(wing, hx - 8.6, hz + 7.4, PI / 2);
  let shed;
  b.place(hx + 8.8, 0, hz + 8, -PI / 2, () => {
    shed = P.house(b, { rng, w: 6.4, d: 4.6, h: 2.9, kind: 'store', tint: W_.dark });
    P.sackPile(b, -1.2, 3.6, rng, 6);
    P.crate(b, 1.3, 0, 3.3);
    b.place(-0.2, 0, 4.9, 0.5, () => P.barrow(b, rng));
  });
  register(shed, hx + 8.8, hz + 8, -PI / 2);
  colliders.add(hx + 4.6, hz + 6.2, hx + 6.6, hz + 9.6);
  c.MAP.houses.push({ x: hx, z: hz + hallZ, w: hallW + 2.4, d: hallD + 2.6, rot: 0, home: true });
  c.MAP.houses.push({ x: hx - 8.6, z: hz + 7.4, w: 8.4, d: 6.4, rot: PI / 2, home: true });
  c.MAP.houses.push({ x: hx + 8.8, z: hz + 8, w: 7.4, d: 6, rot: PI / 2, home: true });
  c.MAP.walls.push({ lot: [hx - hw, hz - hd, hx + hw, hz + hd] });
  c.treeAt(hx + 6.4, hz + 1.2, 'blossom', 1.5);
  c.treeAt(hx - 9.8, hz - 6.5, 'leaf', 1.3);
  c.treeAt(hx + 9.6, hz - 8.5, 'dark', 1.2);
  // 夫人
  c.npcs.push({ id: 'wife', name: '芸娘', title: '夫人', x: hx + 2.3, z: hz + hallZ + hallD / 2 + 2.6, yaw: 0, look: { robe: [0.9, 0.63, 0.6], trim: [0.66, 0.4, 0.4], inner: [0.97, 0.95, 0.9], face: FACE.wife, hat: 'highbun', arms: 'tuck', s: 0.95 } });
  c.home = { surfaces, floorY, gate: { x: hx, z: hz + hd }, center: { x: hx, z: hz } };
}

// ───────────────────────── 远近陪衬 ─────────────────────────
function backdrop(c) {
  const { rng, W_ } = c;
  const scatter = (n, x0, x1, z0, z1, types, sMin = 1.1, sMax = 1.5) => {
    for (let i = 0; i < n; i++) {
      const x = rng.f(x0, x1), z = rng.f(z0, z1);
      if (onRoad(x, z) || inHome(x, z)) continue;
      c.treeAt(x, z, rng.pick(types), rng.f(sMin, sMax));
    }
  };
  const fillHouses = (n, x0, x1, z0, z1, o = {}) => {
    for (let i = 0; i < n; i++) {
      const x = rng.f(x0, x1), z = rng.f(z0, z1), w = rng.f(9.5, 13.5), d = rng.f(7.5, 10);
      if (onRoad(x, z, 6) || inHome(x, z, 9) || riverSD(x, z) < 10 || colliders.hit(x, z, 11)) continue;
      c.houseAt(x, z, rng.pick([0, PI, PI / 2, -PI / 2]), { w, d, h: rng.f(3.3, 3.9), base: 0.3, kind: 'house', roofMat: rng.chance(o.thatch ?? 0.15) ? 'thatch' : 'tile', tint: rng.pick([W_.wood, W_.dark]), wall: o.wall });
    }
  };
  // 城内坊巷
  fillHouses(46, -400, -288, -108, -58);
  fillHouses(50, -400, -288, 24, 98);
  // 城外街市背后
  fillHouses(26, -214, -130, 24, 96, { thatch: 0.3 });
  fillHouses(14, -170, -128, -60, -24, { thatch: 0.3 });
  fillHouses(16, -108, -40, 26, 96, { thatch: 0.3 });
  // 码头街北
  fillHouses(26, 44, 208, -104, -56, { thatch: 0.45 });
  // 树：原画是早春，杂树与柳为主
  scatter(46, 30, 214, -106, -52, ['leaf', 'dark', 'willow', 'leaf']);
  scatter(30, -214, -40, 22, 98, ['leaf', 'dark', 'willow']);
  scatter(18, -212, -130, -104, -40, ['leaf', 'willow', 'dark']);
  scatter(30, -400, -286, -108, -58, ['leaf', 'dark', 'leaf']);
  scatter(30, -400, -286, 22, 98, ['leaf', 'dark', 'willow']);
  scatter(40, 216, 404, -108, -58, ['leaf', 'leaf', 'dark', 'willow']);
  scatter(30, 216, 404, 0, 90, ['willow', 'leaf', 'willow']);
  scatter(22, -30, 200, 46, 98, ['willow', 'leaf', 'dark']);
  // 汴河南岸的柳
  const mp = CHANNELS[0].pts;
  for (let i = 6; i < mp.length - 4; i += 5) {
    const [x, z] = mp[i], a = mp[i - 1], q = mp[i + 1], l = Math.hypot(q[0] - a[0], q[1] - a[1]) || 1;
    for (const sd of [1, -1]) {
      const gx = x - ((q[1] - a[1]) / l) * sd * (RV.HW + rng.f(2.5, 5)), gz = z + ((q[0] - a[0]) / l) * sd * (RV.HW + rng.f(2.5, 5));
      if (gx > 410 || gx < -140 || gz < -112 || gz > 104 || onRoad(gx, gz, 4)) continue;
      if (Math.hypot(gx - BRIDGE.xc, gz - BRIDGE.zc) < 50) continue;
      if (gx > 34 && gx < 212 && gz < 0) continue; // 码头那一侧另种
      if (rng.chance(0.6)) c.treeAt(gx, gz, 'willow', rng.f(1.2, 1.6));
    }
  }
  // 界外远景（不可达）
  const far = (n, x0, x1, z0, z1) => {
    for (let i = 0; i < n; i++) {
      const x = rng.f(x0, x1), z = rng.f(z0, z1);
      if (riverSD(x, z) < 3 || onRoad(x, z, 3)) continue;
      if (rng.chance(0.14) && Math.abs(x - GATE.x) > 20) c.houseAt(x, z, rng.pick([0, PI]), { w: rng.f(9, 12), d: rng.f(7, 9), h: 3.3, kind: 'house', roofMat: rng.chance(0.5) ? 'thatch' : 'tile', tint: W_.dark, wall: 'earth' });
      else c.treeAt(x, z, rng.pick(['leaf', 'dark', 'willow', 'leaf']), rng.f(1.2, 1.7), false);
    }
  };
  far(120, -450, 460, BOUNDS.minZ - 40, BOUNDS.minZ - 3);
  far(100, -450, 460, BOUNDS.maxZ + 3, BOUNDS.maxZ + 34);
  far(26, BOUNDS.maxX + 3, BOUNDS.maxX + 44, -110, 60);
  far(36, BOUNDS.minX - 44, BOUNDS.minX - 3, -110, 100);
}

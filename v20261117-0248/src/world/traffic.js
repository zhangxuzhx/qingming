// 河上行船：几条漕船顺水而下，自东边天际进画，从泊着的船之间穿过码头，放倒桅杆、正对桥洞过虹桥，再沿河北去出画，
// 出了画从头再来。原画最有名的一幕就是这条正要过桥的船——桅杆刚放倒，船工有的撑篙、有的在篷顶呼喝。
//
// 航线：河心线上按弧长定一条“偏左偏右多少”的线（LANE），让开泊着的船：码头一段从里外两排泊船之间穿过，
// 过桥时回到正中（桥洞正中最高），桥西靠右岸泊着三条，略往左让。改动泊船的位置之后要回来核这条线（审查脚本会查）。
import * as P from './parts.js';
import { CHANNELS } from './river.js';
import { colliders, BRIDGE, hullReach } from './layout.js';
import { buildObject } from '../engine/batch.js';
import { figure, randomLook } from './figures.js';
import { markDynamic, veiled, shared } from '../engine/ink.js';
import { RNG } from '../util.js';

const PI = Math.PI;
// [沿河心线的弧长（自东端起，米）, 偏离河心多少（面朝下游，左手为正）]
const LANE = [[0, 0], [420, 0], [470, 0.5], [545, 0.5], [590, 9], [622, 9], [668, 0], [2000, 0]];
// 进画、出画处：东头是河道数据的边（再往东没有水面），西头是汴河北去的尽头。两头从岸上都望得见，所以船不是凭空冒出来——
// 头尾各 FADE 米是从烟水里慢慢显出来、隐进去的
const S0 = 118, S1 = 1070, FADE = 55;
const LOWER = [-115, 60], MAST_T = 14, MAST_DOWN = 1.36; // 离桥多远开始放桅、过桥多远再竖起；放、竖各用多少秒；放倒的角度（弧度）
export const TRAFFIC = { boats: [], poseAt: null, S0, S1, LOWER, MAST_T, MAST_DOWN };

// 河心线：位置与弧长
const PTS = CHANNELS[0].pts, ARC = [0];
for (let i = 1; i < PTS.length; i++) ARC.push(ARC[i - 1] + Math.hypot(PTS[i][0] - PTS[i - 1][0], PTS[i][1] - PTS[i - 1][1]));
function centre(s) {
  // 二分找所在的那一段
  let lo = 0, hi = ARC.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ARC[m] <= s) lo = m;
    else hi = m;
  }
  const i = hi;
  const t = Math.max(0, Math.min(1, (s - ARC[i - 1]) / (ARC[i] - ARC[i - 1] || 1)));
  const dx = PTS[i][0] - PTS[i - 1][0], dz = PTS[i][1] - PTS[i - 1][1], l = Math.hypot(dx, dz) || 1;
  return [PTS[i - 1][0] + dx * t, PTS[i - 1][1] + dz * t, dx / l, dz / l];
}
function lane(s) {
  for (let i = 1; i < LANE.length; i++)
    if (s <= LANE[i][0]) {
      const t = (s - LANE[i - 1][0]) / (LANE[i][0] - LANE[i - 1][0]), e = t * t * (3 - 2 * t);
      return LANE[i - 1][1] + (LANE[i][1] - LANE[i - 1][1]) * e;
    }
  return 0;
}
// 航线上弧长 s 处的位置
function point(s) {
  const [x, z, tx, tz] = centre(s), o = lane(s);
  return [x + tz * o, z - tx * o];
}
// 船在航线上 s 处的位置与朝向（朝向取船头船尾两处的连线，长船拐弯才顺）
export function poseAt(s) {
  const a = point(s + 7), b = point(s - 7), m = point(s), dx = a[0] - b[0], dz = a[1] - b[1];
  // 船身坐标的 +x 是船尾：船头朝 (dx, dz)
  return { x: m[0], z: m[1], rot: Math.atan2(dz, -dx), dx: dx / Math.hypot(dx, dz), dz: dz / Math.hypot(dx, dz) };
}
TRAFFIC.poseAt = poseAt;
// 虹桥在航线上的弧长
let SB = 0;
{
  let best = 1e9;
  for (let s = 600; s < 800; s += 0.5) {
    const [x, z] = centre(s), d = Math.hypot(x - BRIDGE.xc, z - BRIDGE.zc);
    if (d < best) (best = d), (SB = s);
  }
}

// 水里的人碰上行船：船头像犁一样把人往两边分开（船头前两三步水就把人推开了），贴着船舷的顺着滑过去——
// 不会被船身吞进去，也不会被船头一路顶着走。返回该挪到哪儿（世界坐标），不碍事则 null
export function shove(x, z, y, r = 0.35) {
  for (const b of TRAFFIC.boats) {
    const p = b.pose;
    if (!p) continue;
    const dx = x - p.x, dz = z - p.z, h = b.L / 2;
    if (Math.abs(dx) + Math.abs(dz) > b.L || y + 0.35 >= b.geom.Y + 0.9 || y + 1.7 <= b.geom.Y - 3) continue;
    const co = Math.cos(p.rot), si = Math.sin(p.rot), lx = dx * co - dz * si, lz = dx * si + dz * co;
    const need = hullReach(h, b.B, lx, r) + 0.004;
    if (need < 0.01 || Math.abs(lz) >= need) continue;
    const nl = lz >= 0 ? need : -need;
    return [p.x + lx * co + nl * si, p.z - lx * si + nl * co];
  }
  return null;
}

export function riverTraffic(c) {
  // 自己一串随机数：不动 c.rng，免得打乱别处的摆放
  const { W_ } = c, rng = new RNG(60516), Y = -0.75;
  const SPECS = [{ L: 30, B: 6.8, crew: 5 }, { L: 26, B: 6.0, crew: 4 }, { L: 28, B: 6.4, crew: 4 }, { L: 27, B: 6.2, crew: 3 }, { L: 29, B: 6.6, crew: 5 }];
  const boats = [];
  SPECS.forEach((sp, bi) => {
    // 桅轴的高度：放倒的桅要正好从篷顶上头掠过去。桅高按船长
    const { L, B } = sp, mx = -L * 0.2, cr = B * 0.37, PIV = 0.45 + cr, MH = L * 0.28, HEEL = PIV - 0.55;
    const grp = buildObject(c.mats, (bb) => {
      P.boat(bb, { rng, L, B, mast: 'none' });
      // 桅夹：桅杆夹在一副立柱当中，绕柱顶的横栓转
      for (const sz of [-1, 1]) bb.rod('wood', [mx, 0.5, sz * 0.78], [mx, PIV + 0.16, sz * 0.3], 0.09, 0.07, 5, { color: W_.dark });
      bb.rod('wood', [mx, PIV, -0.42], [mx, PIV, 0.42], 0.05, 0.05, 5, { color: W_.deep });
      // 甲板上的船工；篷顶上还有几个，过桥时在上头呼喝、撑持
      for (let i = 0; i < sp.crew; i++) {
        const px = rng.f(-L * 0.42, -L * 0.24), pz = rng.f(-B * 0.3, B * 0.3);
        bb.place(px, 0.42, pz, rng.f(6.28), () => figure(bb, { ...randomLook(rng, 'labor'), prop: null, arms: rng.pick(['reach', 'down', 'carry', 'hail']), staticLegs: true }));
      }
      // 站在篷脊两侧，给放倒的桅让出当中一条
      for (let i = 0; i < 4; i++) {
        const pz = (i % 2 ? 1 : -1) * rng.f(0.95, 1.35);
        bb.place(-1 + i * 2.2, 0.7 + Math.sqrt(cr * cr - pz * pz) - 0.06, pz, -PI / 2 + rng.f(-0.5, 0.5), () => figure(bb, { ...randomLook(rng, 'labor'), prop: null, arms: rng.pick(['reach', 'hail']), staticLegs: true }));
      }
      // 船尾摇橹的
      bb.place(L * 0.36, 2.42, 0.5, PI / 2, () => figure(bb, { ...randomLook(rng, 'labor'), prop: null, arms: 'reach', staticLegs: true }));
    });
    // 桅：单成一件，绕桅夹上的轴放倒、竖起
    const mast = buildObject(c.mats, (bb) => {
      const id = bb.nextId();
      bb.rod('wood', [0, -HEEL, 0], [0, MH, 0], 0.16, 0.08, 7, { color: W_.wood, id });
      // 收拢的席帆横在桅前（桅放倒后它在上头，不压篷）
      bb.rod('mat', [-0.38, 2.3, -B * 0.5], [-0.38, 2.5, B * 0.5], 0.24, 0.24, 7, { color: [0.95, 0.9, 0.8] });
      bb.rod('wood', [-0.2, 2.3, -B * 0.52], [-0.2, 2.5, B * 0.52], 0.05, 0.05, 4, { color: W_.dark, id });
    });
    mast.position.set(mx, PIV, 0);
    grp.add(mast);
    // 橹：船尾一支长橹，左右摇
    const sweep = buildObject(c.mats, (bb) => {
      bb.rod('wood', [-2.4, 0.5, 0], [5.6, -2.2, 0], 0.05, 0.06, 5, { color: W_.pale });
      bb.box('wood', 5.9, -2.3, 0, 1.3, 0.05, 0.34, { color: W_.pale, lw: 0.6 });
    });
    sweep.position.set(L * 0.5 - 1.4, 2.0, 0.9);
    grp.add(sweep);
    c.scene.add(markDynamic(grp)); // 船在走：不参加跨帧累积，否则拖影
    const veil = veiled(grp); // 河的两头：从烟水里显出来，又隐进去
    // 船身、篷舱的碰撞盒跟着船走：水里的人会被船身推开，镜头也不钻进船里
    const hull = [{ lx: 0, box: colliders.addDynHull(L, B, Y - 3, Y + 0.9) }, { lx: L * 0.075, box: colliders.addDyn(L * 0.195, B * 0.37, Y + 0.3, Y + 3.4) }];
    // 船上的号子：河心离岸远，听得见的范围放大些；字浮在篷顶的人头上
    const FAR = ['嘿哟——嘿哟——', '顺水，稳着些。', '前头就是虹桥了。'], NEAR = ['落桅——落桅——', '往左！往左打橹！', '当心桥——', '稳住！稳住！'];
    const crier = { x: 1e5, z: 1e5, y: Y + 0.7 + cr, r: 34, lines: FAR };
    c.criers.push(crier);
    const boat = { s: S0 + ((S1 - S0) * bi) / SPECS.length + 40, speed: 2.2, L, B, grp, mast: null, geom: { Y, mx, PIV, MH, cr } };
    boats.push(boat);
    TRAFFIC.boats.push(boat);
    const ph = rng.f(6);
    c.dynamic.push((t, dt = 0.016) => {
      boat.s += boat.speed * dt;
      if (boat.s > S1) boat.s = S0;
      const p = (boat.pose = poseAt(boat.s));
      veil.value = Math.max(0, 1 - (boat.s - S0) / FADE, 1 - (S1 - boat.s) / FADE);
      shared.uWakeK.value[bi] = 1 - veil.value;
      grp.position.set(p.x, Y + Math.sin(t * 0.9 + ph) * 0.04, p.z);
      grp.rotation.set(Math.sin(t * 0.6 + ph) * 0.006, p.rot, Math.sin(t * 0.7 + ph) * 0.012);
      // 离桥还有百十步就放桅，过了桥再竖起来
      const d = boat.s - SB, down = d > LOWER[0] && d < LOWER[1] ? 1 : 0;
      if (boat.mast === null) boat.mast = down;
      boat.mast = Math.max(0, Math.min(1, boat.mast + (down ? dt : -dt) / MAST_T));
      const e = boat.mast * boat.mast * (3 - 2 * boat.mast);
      mast.rotation.z = -e * MAST_DOWN;
      sweep.rotation.y = Math.sin(t * 2.1 + ph) * 0.26;
      const co = Math.cos(p.rot), si = Math.sin(p.rot);
      for (const h of hull) {
        h.box.cx = p.x + h.lx * co;
        h.box.cz = p.z - h.lx * si;
        h.box.co = co;
        h.box.si = si;
      }
      shared.uWake.value[bi].set(p.x, p.z, p.rot, L / 2);
      crier.x = p.x;
      crier.z = p.z;
      crier.lines = d > -90 && d < 20 ? NEAR : FAR;
    });
  });
  // 桥上的人：有船逼近桥洞时冲着船喊，平时仍是轿马相争
  if (c.bridgeCrier) {
    const IDLE = c.bridgeCrier.lines, HOT = ['快放桅！要撞上了！', '往左！往左撑！', '好险——', '让轿！让轿！'];
    c.dynamic.push(() => {
      c.bridgeCrier.lines = boats.some((b) => b.s - SB > -80 && b.s - SB < 18) ? HOT : IDLE;
    });
  }
  TRAFFIC.SB = SB;
}

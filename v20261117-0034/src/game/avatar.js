// 主角的动作。原先是“按步频摆正弦”：腿前后摆多大、摆多快与实际走多快对不上，脚在地上打滑，整个人像一块板子前倾着平移。
// 现在按人走路、跑步的道理来：
//   · 步幅、步频、脚着地的时间占比都由速度定；着地的那只脚相对身子正好以行进的速度往后退——也就是钉在地上不滑；
//     脚该在哪儿先定好，再反解出大腿、膝盖的角度（两段腿的反解）。
//   · 走：身子架在支撑腿上，过腿时最高、换脚时最低（倒摆）；跑：两脚有腾空，落地屈膝最低、腾空最高。
//   · 身子有惯性：起步前倾、急停后仰再回正、转弯往里侧倾、落地一蹲——都是带阻尼的弹簧，受加速度驱动。
//   · 头单独转：身子怎么倾，头都大致端平；朝镜头看的方向（或正在交谈的人）转过去。
//   · 幞头的垂脚、袍摆、袖子跟着身子的加速度甩，不是照固定的节拍摆。
import * as THREE from 'three';
import { clamp, angDiff } from '../util.js';
import { RIG } from '../world/figures.js';

const L1 = RIG.HIP - RIG.KNEE, L2 = RIG.KNEE, LEG = L1 + L2, TAU = Math.PI * 2;
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mix = (a, b, t) => a + (b - a) * t;
const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _e = new THREE.Euler(), _q = new THREE.Quaternion();

// 带阻尼的弹簧：w 越大越硬；z 是阻尼比（1 不回弹，小于 1 会冲过头再回正）
class Spring {
  constructor(w, z, x = 0) {
    this.w = w;
    this.z = z;
    this.x = x;
    this.v = 0;
  }
  step(target, dt) {
    const n = Math.max(1, Math.ceil((dt * this.w) / 0.4)), h = dt / n;
    for (let i = 0; i < n; i++) {
      this.v += (this.w * this.w * (target - this.x) - 2 * this.z * this.w * this.v) * h;
      this.x += this.v * h;
    }
    return this.x;
  }
}

export class AvatarAnim {
  constructor(avatar) {
    this.av = avatar;
    this.j = avatar.userData;
    this.phase = 0; // 一个周期 = 左右各一步
    this.amp = 0; // 0 站定 … 1 走起来了
    this.idleT = 0;
    this.pvx = 0;
    this.pvz = 0;
    this.ax = 0;
    this.az = 0;
    this.hh = LEG * 0.996; // 胯离地多高
    this.air = 0;
    this.swim = 0;
    this.fallV = 0;
    this.wasGround = true;
    this.footG = [0, 0]; // 两脚各自脚下的地面相对身子脚下的高差（上台阶时）
    this.stride = 0; // 两脚前后拉开多远（给袍摆用）
    this.lean = new Spring(13, 0.5);
    this.bank = new Spring(11, 0.65);
    this.squash = new Spring(15, 0.4);
    this.tail = new Spring(9, 0.28, 0.06);
    this.skirt = new Spring(10, 0.4);
    this.sleeve = new Spring(8, 0.35);
    this.hy = new Spring(9, 0.85);
    this.hp = new Spring(9, 0.85);
    this.step = 0; // 落脚的计数（每落一脚加一，给脚步声用）
  }

  // p：主角（位置、朝向 face、速度、ground、swim、swimT）；o.yaw / o.pitch 镜头方向；o.look 要看的一点（世界坐标）；
  // o.groundAt(x, z) 那一处地面的高；o.tp 是否第三人称
  update(dt, p, o) {
    dt = Math.min(dt, 0.05);
    const j = this.j, sp = Math.hypot(p.vx, p.vz), ground = p.ground && !p.swim;
    const k12 = Math.min(1, dt * 12);
    // 加速度，换到身子的前后、左右
    this.ax += ((p.vx - this.pvx) / Math.max(dt, 1e-3) - this.ax) * k12;
    this.az += ((p.vz - this.pvz) / Math.max(dt, 1e-3) - this.az) * k12;
    this.pvx = p.vx;
    this.pvz = p.vz;
    const sf = Math.sin(p.face), cf = Math.cos(p.face);
    const aF = this.ax * sf + this.az * cf, aS = this.ax * cf - this.az * sf;

    // 腾空、落地
    if (!ground && !p.swim) this.fallV = p.vy;
    if (ground && !this.wasGround) {
      this.squash.v -= clamp(-this.fallV, 0, 10) * 0.36; // 落地一蹲
      this.tail.v += 3;
      this.fallV = 0;
    }
    if (!ground && this.wasGround && !p.swim && p.vy > 1) this.squash.v += 0.9; // 起跳时身子一挺
    this.wasGround = ground;
    this.air += ((!ground && !p.swim ? 1 : 0) - this.air) * Math.min(1, dt * 14);
    this.swim += ((p.swim ? 1 : 0) - this.swim) * Math.min(1, dt * 6);

    // ── 步态 ──
    const moving = ground && sp > 0.25;
    this.amp += ((moving ? 1 : 0) - this.amp) * Math.min(1, dt * (moving ? 9 : 7));
    this.idleT += dt;
    const amp = this.amp, jog = sstep(1.8, 3.4, sp), spr = sstep(4.6, 7.2, sp);
    const stepLen = Math.min(2, 0.42 + 0.26 * sp), freq = sp / (2 * stepLen);
    const duty = clamp(0.68 - 0.08 * sp, 0.3, 0.64);
    if (moving) {
      const before = this.phase;
      this.phase = (this.phase + freq * dt) % 1;
      if ((before < 0.5 && this.phase >= 0.5) || this.phase < before) this.step++;
    }
    const cyc = TAU * this.phase;
    // 着地期里脚踝相对身子后退的距离：身子走过的路减去脚掌从脚跟滚到脚尖的那一截
    const A0 = Math.max(0, 2 * stepLen * duty - 0.16), endLift = 0.035 + 0.035 * jog;
    const crouchRun = 0.075 + 0.02 * spr, Ls = LEG * 0.99;
    const capRun = 2 * Math.sqrt(Math.max(0.01, Ls * Ls - (RIG.HIP - crouchRun - endLift) ** 2)) * 0.97;
    const A = mix(Math.min(A0, 0.74), Math.min(A0, capRun), jog) * amp;
    // 抬脚的高度：穿着长袍，膝抬不了太高
    const liftSw = (0.05 + 0.13 * jog + 0.03 * spr) * amp, bias = -(0.02 + 0.05 * jog) * amp;
    const foot = [null, null];
    let support = 1e9;
    for (let i = 0; i < 2; i++) {
      const ph = (this.phase + i * 0.5) % 1;
      let z, y;
      if (ph < duty) {
        const u = ph / duty;
        z = A * (0.5 - u);
        y = endLift * amp * (sstep(0.7, 1, u) + 0.5 * (1 - sstep(0, 0.22, u)));
        support = Math.min(support, Math.sqrt(Math.max(0.2, Ls * Ls - (z + bias) ** 2)) + y); // 支撑腿撑得起的胯高
      } else {
        const u = (ph - duty) / (1 - duty), e = u * u * (3 - 2 * u);
        z = A * (e - 0.5);
        y = endLift * amp * mix(1, 0.5, u) + liftSw * Math.sin(Math.PI * Math.pow(u, 0.85));
      }
      foot[i] = [z + bias, y];
    }
    this.stride = Math.abs(foot[0][0] - foot[1][0]);
    // 胯高：站着腿近乎直；走是倒摆（架在支撑腿上）；跑是落地最低、腾空最高
    const hWalk = support < 1e8 ? support : Ls;
    const hRun = RIG.HIP - crouchRun - (0.022 + 0.012 * spr) * Math.cos(TAU * (2 * this.phase - duty));
    let hT = mix(mix(LEG * 0.996, hWalk, amp), hRun, jog * amp);
    this.squash.step(0, dt);
    hT += clamp(this.squash.x, -0.3, 0.08);
    this.hh += (hT - this.hh) * Math.min(1, dt * 24);
    const bodyY = mix(this.hh - RIG.HIP, 0.02, this.air * 0.5);

    // ── 身子 ──
    const leanT = p.swim ? 1.08 : this.air * 0.06 + (0.03 + 0.09 * jog + 0.07 * spr) * amp + (ground ? clamp(aF * 0.009, -0.13, 0.15) : 0);
    this.lean.step(leanT, dt);
    this.bank.step(ground ? -clamp(aS * 0.014, -0.17, 0.17) : 0, dt);
    const idle = 1 - amp;
    const twist = -Math.sin(cyc) * (0.055 + 0.03 * spr) * amp + Math.sin(this.idleT * 0.37) * 0.035 * idle;
    j.pivot.position.y = RIG.PY + bodyY;
    j.pivot.rotation.set(this.lean.x, twist, this.bank.x + Math.sin(this.idleT * 0.46) * 0.012 * idle + Math.sin(cyc) * 0.02 * amp * (1 - jog));
    j.upper.scale.y = 1 + Math.sin(this.idleT * 1.5) * 0.003 * idle;

    // ── 腿 ──
    const kk = Math.min(1, dt * 16), to = (obj, ax, v) => (obj.rotation[ax] += (v - obj.rotation[ax]) * kk);
    if (p.swim) {
      // 泅水：两腿上下打水
      const q = Math.sin(p.swimT * 7);
      to(j.legL, 'x', q * 0.3);
      to(j.legR, 'x', -q * 0.3);
      to(j.shinL, 'x', 0.2 + Math.max(0, -q) * 0.4);
      to(j.shinR, 'x', 0.2 + Math.max(0, q) * 0.4);
      to(j.legL, 'z', 0);
      to(j.legR, 'z', 0);
    } else {
      j.pivot.updateMatrix();
      _m.copy(j.pivot.matrix).invert();
      const up = p.vy > 0 ? 1 : 0.45, kIK = Math.min(1, dt * 34);
      [[j.legL, j.shinL, -1], [j.legR, j.shinR, 1]].forEach(([leg, shin, sx], i) => {
        // 脚下的地面（台阶、坡）
        let g = 0;
        if (o.groundAt && amp > 0.05 && this.air < 0.5) {
          const fz = foot[i][0], fx = sx * RIG.HIPX;
          g = clamp(o.groundAt(p.x + fx * cf + fz * sf, p.z - fx * sf + fz * cf) - p.y, -0.3, 0.3);
        }
        this.footG[i] += (g - this.footG[i]) * Math.min(1, dt * 16);
        // 腾空：一腿提膝在前，一腿拖在后
        const az = i === 0 ? 0.16 * up : -0.2, ay = (i === 0 ? 0.12 + 0.24 * up : 0.1) - bodyY;
        const tx = sx * (RIG.HIPX - 0.03 * jog * amp);
        _v.set(tx, mix(foot[i][1] + this.footG[i], ay, this.air), mix(foot[i][0], az, this.air)).applyMatrix4(_m);
        const dy = _v.y - leg.position.y, dz = _v.z - leg.position.z, dx = _v.x - leg.position.x;
        const D = clamp(Math.hypot(dy, dz), 0.14, LEG - 0.003);
        const knee = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2), -1, 1));
        const th = Math.atan2(-dz, -dy) - Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
        leg.rotation.x += (th - leg.rotation.x) * kIK;
        shin.rotation.x += (knee - shin.rotation.x) * kIK;
        leg.rotation.z += (clamp(Math.atan2(dx, -dy), -0.25, 0.25) - leg.rotation.z) * kIK;
      });
    }

    // ── 臂 ──
    this.sleeve.step(ground ? -clamp(aF * 0.006, -0.25, 0.25) : 0, dt);
    if (p.swim) {
      // 两臂轮番前划
      const a = Math.sin(p.swimT * 4.2);
      to(j.armL, 'x', -2.55 + a * 0.75);
      to(j.armR, 'x', -2.55 - a * 0.75);
      to(j.armL, 'z', -0.3);
      to(j.armR, 'z', 0.3);
      to(j.foreL, 'x', -0.2 - Math.max(0, a) * 0.5);
      to(j.foreR, 'x', -0.2 - Math.max(0, -a) * 0.5);
    } else if (this.air > 0.5) {
      // 跃起：两臂张开
      const up = p.vy > 0 ? 1 : 0.4;
      to(j.armL, 'x', -0.5 - up * 0.5);
      to(j.armR, 'x', -0.3 - up * 0.3);
      to(j.armL, 'z', -0.55);
      to(j.armR, 'z', 0.55);
      to(j.foreL, 'x', -0.6);
      to(j.foreR, 'x', -0.5);
    } else {
      // 臂与同侧的腿反着摆，慢半拍；跑起来肘弯到近直角，往前摆时弯得更深
      const B = (0.3 + 0.16 * jog + 0.26 * spr) * amp, sw = Math.cos(cyc - 0.25), swF = Math.cos(cyc - 0.55);
      const base = 0.14 * jog * amp + this.sleeve.x + Math.sin(this.idleT * 1.5) * 0.02 * idle;
      const bend = 0.14 + (0.8 * jog + 0.3 * spr) * amp, flare = clamp(-this.squash.x * 2.2, 0, 0.5);
      to(j.armL, 'x', base + sw * B);
      to(j.armR, 'x', base - sw * B);
      to(j.armL, 'z', -0.09 - 0.07 * jog * amp - flare);
      to(j.armR, 'z', 0.09 + 0.07 * jog * amp + flare);
      to(j.foreL, 'x', -(bend + Math.max(0, -swF) * (0.2 + 0.15 * jog) * amp));
      to(j.foreR, 'x', -(bend + Math.max(0, swF) * (0.2 + 0.15 * jog) * amp));
    }

    // ── 头 ──
    let ly = 0, lp = 0;
    if (!p.swim) {
      if (o.look) {
        const dx = o.look.x - p.x, dz = o.look.z - p.z, d = Math.hypot(dx, dz);
        ly = clamp(angDiff(Math.atan2(dx, dz), p.face), -1.1, 1.1) * 0.85;
        lp = clamp(Math.atan2(o.look.y - (p.y + 1.55), Math.max(0.3, d)), -0.4, 0.4);
      } else if (o.tp) {
        // 朝镜头看的方向转头；人迎着镜头走的时候不回头
        const dl = angDiff(o.yaw + Math.PI, p.face), w = (1 - sstep(1.2, 2.1, Math.abs(dl))) * (1 - 0.5 * spr);
        ly = clamp(dl, -0.95, 0.95) * 0.7 * w + Math.sin(this.idleT * 0.31) * 0.16 * idle * (1 - Math.min(1, Math.abs(dl)));
        lp = clamp(o.pitch * 0.4, -0.25, 0.3) * w;
      }
    }
    this.hy.step(ly, dt);
    this.hp.step(lp, dt);
    if (j.head) {
      // 身子前倾、侧倾、拧转，头大致端平
      _e.set(-this.lean.x * (p.swim ? 0.55 : 0.75) - this.hp.x, this.hy.x - twist * 0.8, -j.pivot.rotation.z * 0.7, 'YXZ');
      j.head.quaternion.copy(j.head.userData.q0).multiply(_q.setFromEuler(_e));
    }

    // ── 垂脚、袍摆 ──
    const tailT = p.swim ? 0.5 : this.air > 0.5 ? (p.vy > 0 ? -0.3 : 0.9) : 0.06 + (0.12 * jog + 0.4 * spr) * amp - clamp(aF * 0.02, -0.5, 0.5) + Math.sin(2 * cyc) * 0.05 * amp;
    j.tails.rotation.x = clamp(this.tail.step(tailT, dt), -0.7, 1.3);
    const skT = p.swim ? 0 : (0.02 + 0.06 * jog + 0.05 * spr) * amp - clamp(aF * 0.007, -0.14, 0.14);
    j.skirt.rotation.x = clamp(this.skirt.step(skT, dt), -0.2, 0.3);
    j.skirt.rotation.z = -this.bank.x * 0.6 + Math.sin(cyc) * 0.025 * amp;
    // 袍摆要罩得住两膝：前抬的大腿把前襟顶出去，后蹬的腿把后摆带起来——按两膝前后的位置把袍摆撑开、挪过去
    const kL = j.legL.position.z - L1 * Math.sin(j.legL.rotation.x), kR = j.legR.position.z - L1 * Math.sin(j.legR.rotation.x);
    const kMax = Math.max(kL, kR, 0.06), kMin = Math.min(kL, kR, -0.06);
    const skZ = p.swim ? 1.2 : clamp(((kMax - kMin) / 2 + 0.09) / 0.165, 1, 2);
    j.skirt.scale.z += (skZ - j.skirt.scale.z) * kk;
    j.skirt.position.z += ((p.swim ? 0 : (kMax + kMin) * 0.5) - j.skirt.position.z) * kk;
  }
}

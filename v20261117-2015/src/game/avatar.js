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
// 量袍摆外包用的一圈方向
const ND = 48, DIRS = Array.from({ length: ND }, (_, i) => [Math.sin((i / ND) * TAU), Math.cos((i / ND) * TAU)]);

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
    // 袍摆的网格：记下原形，每帧按两条腿的位置把它撑开（见 _drape）
    this.skBase = this.j.skirt.position.clone();
    this.sk = [];
    this.j.skirt.traverse((o) => {
      if (!o.isMesh) return;
      const P = o.geometry.attributes.position, p0 = Float32Array.from(P.array), ys = [];
      for (let i = 0; i < P.count; i++) if (!ys.some((y) => Math.abs(y - p0[i * 3 + 1]) < 0.004)) ys.push(p0[i * 3 + 1]);
      ys.sort((a, b) => b - a); // 自腰往下
      const rows = ys.map((y) => ({ y, zf: 0.05, zb: -0.05 })), rowOf = new Uint8Array(P.count);
      for (let i = 0; i < P.count; i++) {
        let k = 0;
        for (let r = 1; r < ys.length; r++) if (Math.abs(ys[r] - p0[i * 3 + 1]) < Math.abs(ys[k] - p0[i * 3 + 1])) k = r;
        rowOf[i] = k;
        rows[k].zf = Math.max(rows[k].zf, p0[i * 3 + 2]);
        rows[k].zb = Math.min(rows[k].zb, p0[i * 3 + 2]);
      }
      o.frustumCulled = false;
      const vr = rows.map(() => []);
      for (let i = 0; i < P.count; i++) vr[rowOf[i]].push(i);
      this.sk.push({ P, p0, rows, rowOf, vr, hs: new Float32Array(ND), zs: new Float32Array(P.count), F: rows.map(() => [1, 1]), B: rows.map(() => [1, 1]), off: rows.map(() => 0) });
    });
  }

  // 袍摆是罩在腿外面的：前抬的大腿把前襟顶出去，后蹬的小腿把后摆带起来。
  // 袍摆的网格自腰到下摆有几圈；每一圈按“这一段高度里左右两条腿各自伸到多前、多后”把前半、后半分别撑开，
  // 左右两侧各管各的腿，中间平滑过渡。lag：下摆因惯性拖后的距离（米）
  _drape(rest, lag) {
    const j = this.j, legs = [];
    if (!rest)
      for (const [leg, shin] of [[j.legL, j.shinL], [j.legR, j.shinR]]) {
        // 胯 → 膝 → 踝，各取几点（连同腿的粗细）。腿往外撇（rotation.z）时膝、踝也跟着往外去，一并算上
        const th = leg.rotation.x, kn = th + shin.rotation.x, hy = leg.position.y, hz = leg.position.z, hx = leg.position.x;
        const cs = Math.cos(leg.rotation.z), sn = Math.sin(leg.rotation.z);
        const ky = hy - L1 * Math.cos(th) * cs, kz = hz - L1 * Math.sin(th) * cs, kx = hx + L1 * sn, pts = [];
        for (let t = 0; t <= 1.001; t += 0.125) pts.push([mix(hy + 0.04, ky, t), mix(hz, kz, t), mix(0.088, 0.08, t), mix(hx, kx, t)]);
        for (let t = 0.2; t <= 1.001; t += 0.2) pts.push([ky - L2 * Math.cos(kn) * cs * t, kz - L2 * Math.sin(kn) * cs * t, mix(0.082, 0.07, t), kx + L2 * sn * t]);
        legs.push(pts);
      }
    for (const m of this.sk) {
      const { rows, F, B, off } = m, n = rows.length;
      const near = rows.map(() => []); // 每一圈近旁的腿上各点：[左右位置, 前后位置, 粗细]
      for (let k = 0; k < n; k++) {
        const y = this.skBase.y + rows[k].y, hi = k ? this.skBase.y + rows[k - 1].y : y + 0.1, lo = k < n - 1 ? this.skBase.y + rows[k + 1].y : y - 0.07;
        const t = k / Math.max(1, n - 1);
        off[k] = rest ? 0 : -lag * t * t;
        for (let i = 0; i < 2; i++) {
          let f = 1, b = 1;
          if (!rest)
            for (const [py, pz, R, px] of legs[i]) {
              if (py < lo || py > hi) continue;
              const z = pz - this.skBase.z - off[k];
              f = Math.max(f, (z + R) / (0.9 * rows[k].zf));
              b = Math.max(b, (z - R) / (0.9 * rows[k].zb));
              // 留一点余量；离中轴远的（甩出去的小腿）余量大些：一圈上相邻两个顶点之间是直的，离得越远兜得越不严
              near[k].push([px, z, R + 0.012 + 0.035 * Math.hypot(px, z)]);
            }
          // 整片只撑开一半，余下的靠下面“就地顶出去”补足：不然疾行时前襟会鼓成一口钟
          F[k][i] = 1 + (Math.min(f, 2.8) - 1) * 0.5;
          B[k][i] = 1 + (Math.min(b, 2.8) - 1) * 0.5;
        }
      }
      // 整片撑开之后再让袍摆正好罩住腿。这一圈的轮廓取“原来的一圈”与“这一段高度里腿上各点（每点是个圆）”合起来的外包：
      // 像布搭在腿上绷出来的样子——前襟、后摆、两侧一并管。原先只往前、往后顶：两侧的顶点被分别推到腿的前头和后头，
      // 当中没有顶点兜着，大腿的外侧就从袍子两边露了出来。
      // 做法：朝一圈方向各量一次“最远伸到哪儿”（hs），顶点沿自己的方向退到这个外包上（比原处近则不动，衣褶照旧）
      const a = m.P.array, p0 = m.p0, hs = m.hs, zs = m.zs;
      for (let k = 0; k < n; k++) {
        const idx = m.vr[k], C = near[k], wrap = k > 0 && C.length > 0; // 腰带那一圈不动
        for (const i of idx) {
          const z0 = p0[i * 3 + 2], w = sstep(-0.1, 0.1, p0[i * 3]);
          zs[i] = z0 * (z0 >= 0 ? mix(F[k][0], F[k][1], w) : mix(B[k][0], B[k][1], w));
        }
        if (wrap)
          for (let d = 0; d < ND; d++) {
            const vx = DIRS[d][0], vz = DIRS[d][1];
            let h = 0;
            for (const i of idx) h = Math.max(h, 0.93 * (p0[i * 3] * vx + zs[i] * vz));
            for (const [sx, sz, R] of C) h = Math.max(h, sx * vx + sz * vz + R);
            hs[d] = h;
          }
        for (const i of idx) {
          let x = p0[i * 3], z = zs[i];
          if (wrap) {
            const r0 = Math.hypot(x, z) || 1e-6, ux = x / r0, uz = z / r0;
            let rh = 1e9;
            for (let d = 0; d < ND; d++) {
              const c = ux * DIRS[d][0] + uz * DIRS[d][1];
              if (c > 0.25) rh = Math.min(rh, hs[d] / c);
            }
            if (rh > r0 && rh < 1e8) {
              x = ux * rh;
              z = uz * rh;
            }
          }
          a[i * 3] = x;
          a[i * 3 + 2] = z + off[k];
        }
      }
      m.P.needsUpdate = true;
    }
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
    // 下摆因惯性拖在后头：跑起来往后飘一点，起步、急停时甩一下
    const skT = p.swim ? 0 : (0.02 + 0.05 * jog + 0.04 * spr) * amp - clamp(aF * 0.006, -0.12, 0.12);
    this.skirt.step(skT, dt);
    j.skirt.rotation.set(0, 0, 0);
    j.skirt.scale.z = 1;
    j.skirt.position.copy(this.skBase);
    this._drape(this.swim > 0.5, clamp(this.skirt.x, -0.2, 0.3) * 0.7);
  }
}

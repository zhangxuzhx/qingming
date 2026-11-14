// 几何批处理：把成千上万个小部件（梁、柱、瓦面、摊棚……）按材质合并成少量网格。
// 每个顶点携带：位置、法线、UV、aCol(rgb 染色 + a 风摆权重)、aInk(部件编号, 线重)
import * as THREE from 'three';

class FBuf {
  constructor(n = 2048) {
    this.a = new Float32Array(n);
    this.n = 0;
  }
  need(k) {
    if (this.n + k > this.a.length) {
      let m = this.a.length * 2;
      while (m < this.n + k) m *= 2;
      const b = new Float32Array(m);
      b.set(this.a.subarray(0, this.n));
      this.a = b;
    }
  }
}
class IBuf {
  constructor(n = 2048) {
    this.a = new Uint32Array(n);
    this.n = 0;
  }
  need(k) {
    if (this.n + k > this.a.length) {
      let m = this.a.length * 2;
      while (m < this.n + k) m *= 2;
      const b = new Uint32Array(m);
      b.set(this.a.subarray(0, this.n));
      this.a = b;
    }
  }
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const cylCache = new Map();
function cylGeo(ratio, seg, open) {
  const k = `${ratio.toFixed(3)}_${seg}_${open ? 1 : 0}`;
  let g = cylCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(ratio, 1, 1, seg, 1, !!open);
    cylCache.set(k, g);
  }
  return g;
}
const sphCache = new Map();
function sphGeo(ws, hs) {
  const k = `${ws}_${hs}`;
  let g = sphCache.get(k);
  if (!g) {
    g = new THREE.SphereGeometry(1, ws, hs);
    sphCache.set(k, g);
  }
  return g;
}

const WHITE = [1, 1, 1];
const Y = new THREE.Vector3(0, 1, 0);
const _l = new THREE.Matrix4(), _m = new THREE.Matrix4(), _n3 = new THREE.Matrix3();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();

export class Batch {
  constructor() {
    this.groups = new Map();
    this.stack = [new THREE.Matrix4()];
    this.M = this.stack[0];
    this.chunk = '';
    this._id = 7;
  }
  push(m) {
    const n = this.M.clone().multiply(m);
    this.stack.push(n);
    this.M = n;
  }
  pop() {
    this.stack.pop();
    this.M = this.stack[this.stack.length - 1];
  }
  // 在 (x,y,z) 处、绕 Y 旋转 ry 的局部坐标系中执行 fn
  place(x, y, z, ry, fn) {
    this.push(new THREE.Matrix4().makeRotationY(ry || 0).setPosition(x, y, z));
    fn();
    this.pop();
  }
  // 某材质组眼下的顶点数；与 tag() 配合，圈出一段顶点
  mark(key) {
    return this._grp(key).count;
  }
  // 给 [start, end) 这段顶点附上一组数据（aLife）：人物的呼吸、挪重心、转头由顶点着色器据此驱动
  tag(key, start, end, x, y, z, w) {
    if (end <= start) return;
    const g = this._grp(key);
    if (!g.life || g.life.length < g.count * 4) {
      const nb = new Float32Array(Math.max(4096, g.count * 8));
      if (g.life) nb.set(g.life);
      g.life = nb;
    }
    for (let i = start; i < end; i++) {
      g.life[i * 4] = x;
      g.life[i * 4 + 1] = y;
      g.life[i * 4 + 2] = z;
      g.life[i * 4 + 3] = w;
    }
  }
  nextId() {
    this._id = (this._id * 37 + 11) % 251;
    return (this._id + 3) / 255;
  }
  _grp(key) {
    const k = key + '|' + this.chunk;
    let g = this.groups.get(k);
    if (!g) {
      g = { key, chunk: this.chunk, pos: new FBuf(), nor: new FBuf(), uv: new FBuf(), col: new FBuf(), ink: new FBuf(), idx: new IBuf(), count: 0 };
      this.groups.set(k, g);
    }
    return g;
  }

  // 追加一份 three 几何体（local 为相对当前坐标系的矩阵）
  add(key, geo, local, opt = {}) {
    const g = this._grp(key);
    const m = local ? _m.multiplyMatrices(this.M, local) : this.M;
    _n3.getNormalMatrix(m);
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, I = geo.index;
    const c = opt.color || WHITE, id = opt.id ?? this.nextId(), lw = opt.lw ?? 1, wind = opt.wind ?? 0;
    const uvS = opt.uv;
    const n = P.count, base = g.count;
    g.pos.need(n * 3);
    g.nor.need(n * 3);
    g.uv.need(n * 2);
    g.col.need(n * 4);
    g.ink.need(n * 2);
    const pa = g.pos.a, na = g.nor.a, ua = g.uv.a, ca = g.col.a, ia = g.ink.a;
    let pn = g.pos.n, un = g.uv.n, cn = g.col.n, inn = g.ink.n;
    for (let i = 0; i < n; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(m);
      _n.fromBufferAttribute(N, i).applyMatrix3(_n3).normalize();
      pa[pn] = _v.x; pa[pn + 1] = _v.y; pa[pn + 2] = _v.z;
      na[pn] = _n.x; na[pn + 1] = _n.y; na[pn + 2] = _n.z;
      pn += 3;
      let u = U ? U.getX(i) : 0, v = U ? U.getY(i) : 0;
      if (uvS) { u = u * uvS[0] + uvS[2]; v = v * uvS[1] + uvS[3]; }
      ua[un++] = u; ua[un++] = v;
      ca[cn++] = c[0]; ca[cn++] = c[1]; ca[cn++] = c[2]; ca[cn++] = wind;
      ia[inn++] = id; ia[inn++] = lw;
    }
    g.pos.n = g.nor.n = pn; g.uv.n = un; g.col.n = cn; g.ink.n = inn;
    if (I) {
      g.idx.need(I.count);
      for (let i = 0; i < I.count; i++) g.idx.a[g.idx.n++] = base + I.getX(i);
    } else {
      g.idx.need(n);
      for (let i = 0; i < n; i++) g.idx.a[g.idx.n++] = base + i;
    }
    g.count += n;
  }

  // 以中心定位的方盒
  box(key, x, y, z, sx, sy, sz, opt) {
    if (opt && (opt.ry || opt.rx || opt.rz)) _q.setFromEuler(new THREE.Euler(opt.rx || 0, opt.ry || 0, opt.rz || 0, 'YXZ'));
    else _q.identity();
    _l.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    this.add(key, UNIT_BOX, _l, opt);
  }
  // 圆柱/圆台：y 为底面高度
  cyl(key, x, y, z, rTop, rBot, h, seg = 8, opt = {}) {
    const rb = Math.max(rBot, 1e-4);
    _q.identity();
    if (opt.ry) _q.setFromAxisAngle(Y, opt.ry);
    _l.compose(_p.set(x, y + h / 2, z), _q, _s.set(rb * (opt.sx || 1), h, rb * (opt.sz || 1)));
    this.add(key, cylGeo(rTop / rb, seg, opt.open), _l, opt);
  }
  sphere(key, x, y, z, rx, ry, rz, opt = {}) {
    _q.identity();
    if (opt.ry) _q.setFromAxisAngle(Y, opt.ry);
    _l.compose(_p.set(x, y, z), _q, _s.set(rx, ry, rz));
    this.add(key, sphGeo(opt.ws || 10, opt.hs || 7), _l, opt);
  }
  // 两点之间的方梁
  beam(key, a, b, w, h, opt) {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    _c.subVectors(_b, _a);
    const len = _c.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(Y, _c.multiplyScalar(1 / len));
    if (opt && opt.twist) _q.multiply(_q2.setFromAxisAngle(Y, opt.twist));
    _l.compose(_p.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(w, len, h));
    this.add(key, UNIT_BOX, _l, opt);
  }
  // 两点之间的圆杆
  rod(key, a, b, r0, r1, seg = 6, opt) {
    _a.set(a[0], a[1], a[2]);
    _b.set(b[0], b[1], b[2]);
    _c.subVectors(_b, _a);
    const len = _c.length();
    if (len < 1e-5) return;
    _q.setFromUnitVectors(Y, _c.multiplyScalar(1 / len));
    const rb = Math.max(r0, 1e-4);
    _l.compose(_p.addVectors(_a, _b).multiplyScalar(0.5), _q, _s.set(rb, len, rb));
    this.add(key, cylGeo(r1 / rb, seg, false), _l, opt);
  }

  // 任意三角网：P/UV 为扁平数组；自动求平滑法线
  raw(key, P, UV, IDX, opt = {}) {
    const g = this._grp(key);
    const n = P.length / 3, base = g.count, m = this.M;
    const c = opt.color || WHITE, id = opt.id ?? this.nextId(), lw = opt.lw ?? 1;
    const windV = opt.windV, wind = opt.wind ?? 0, cols = opt.colors;
    g.pos.need(n * 3);
    g.nor.need(n * 3);
    g.uv.need(n * 2);
    g.col.need(n * 4);
    g.ink.need(n * 2);
    const pa = g.pos.a, na = g.nor.a;
    const p0 = g.pos.n;
    for (let i = 0; i < n; i++) {
      _v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(m);
      pa[p0 + i * 3] = _v.x; pa[p0 + i * 3 + 1] = _v.y; pa[p0 + i * 3 + 2] = _v.z;
      na[p0 + i * 3] = 0; na[p0 + i * 3 + 1] = 0; na[p0 + i * 3 + 2] = 0;
      g.uv.a[g.uv.n++] = UV ? UV[i * 2] : 0;
      g.uv.a[g.uv.n++] = UV ? UV[i * 2 + 1] : 0;
      if (cols) { g.col.a[g.col.n++] = cols[i * 3]; g.col.a[g.col.n++] = cols[i * 3 + 1]; g.col.a[g.col.n++] = cols[i * 3 + 2]; }
      else { g.col.a[g.col.n++] = c[0]; g.col.a[g.col.n++] = c[1]; g.col.a[g.col.n++] = c[2]; }
      g.col.a[g.col.n++] = windV ? windV[i] : wind;
      g.ink.a[g.ink.n++] = id; g.ink.a[g.ink.n++] = lw;
    }
    const flip = opt.flip ? -1 : 1;
    const NR = opt.normals; // 可直接给出法线（局部坐标），不再由三角面累加
    if (NR) {
      _n3.getNormalMatrix(m);
      for (let i = 0; i < n; i++) {
        _n.set(NR[i * 3], NR[i * 3 + 1], NR[i * 3 + 2]).applyMatrix3(_n3);
        na[p0 + i * 3] = _n.x; na[p0 + i * 3 + 1] = _n.y; na[p0 + i * 3 + 2] = _n.z;
      }
    }
    for (let t = 0; t < IDX.length; t += 3) {
      const i0 = IDX[t], i1 = IDX[t + (flip < 0 ? 2 : 1)], i2 = IDX[t + (flip < 0 ? 1 : 2)];
      if (!NR) {
        _a.set(pa[p0 + i0 * 3], pa[p0 + i0 * 3 + 1], pa[p0 + i0 * 3 + 2]);
        _b.set(pa[p0 + i1 * 3], pa[p0 + i1 * 3 + 1], pa[p0 + i1 * 3 + 2]);
        _c.set(pa[p0 + i2 * 3], pa[p0 + i2 * 3 + 1], pa[p0 + i2 * 3 + 2]);
        _b.sub(_a);
        _c.sub(_a);
        _n.crossVectors(_b, _c);
        for (const i of [i0, i1, i2]) {
          na[p0 + i * 3] += _n.x; na[p0 + i * 3 + 1] += _n.y; na[p0 + i * 3 + 2] += _n.z;
        }
      }
      g.idx.need(3);
      g.idx.a[g.idx.n++] = base + i0;
      g.idx.a[g.idx.n++] = base + i1;
      g.idx.a[g.idx.n++] = base + i2;
    }
    for (let i = 0; i < n; i++) {
      const x = na[p0 + i * 3], y = na[p0 + i * 3 + 1], z = na[p0 + i * 3 + 2];
      const l = Math.hypot(x, y, z) || 1;
      na[p0 + i * 3] = x / l; na[p0 + i * 3 + 1] = y / l; na[p0 + i * 3 + 2] = z / l;
    }
    g.pos.n += n * 3;
    g.nor.n += n * 3;
    g.count += n;
    if (opt.double) this.raw(key, P, UV, IDX, { ...opt, double: false, flip: !opt.flip, id });
  }

  // 沿路径放样的软管：人物的躯干、衣袖、裤管，牲畜的身、颈、腿……
  // pts: [[x, y, z, ra, rb], ...]；ra 是沿 side 方向的半径，rb 是与之垂直方向的半径（缺省同 ra）。
  // 截面坐标系沿路径做最小扭转传递；两端以扇面封口，法线平滑过渡。
  // opt：seg 截面边数；side 起始截面的“横向”；color / color2（rb 正向一侧→反向一侧渐变）；
  //      vs 各截面的贴图 v；us/u0 贴图 u 的倍数与偏移；capA/capB = false 时不封口。
  tube(key, pts, opt = {}) {
    const n = pts.length;
    if (n < 2) return;
    const seg = opt.seg || 10, ring = seg + 1;
    const P = [], NR = [], UV = [], IDX = [], COL = opt.color2 ? [] : null;
    const c1 = opt.color || WHITE, c2 = opt.color2;
    const T = [], S = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
      T.push(new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2]).normalize());
    }
    const sd = opt.side || [1, 0, 0];
    let s = new THREE.Vector3(sd[0], sd[1], sd[2]);
    s.addScaledVector(T[0], -s.dot(T[0]));
    if (s.lengthSq() < 1e-4) s.set(0, 0, 1).addScaledVector(T[0], -T[0].z);
    s.normalize();
    S.push(s);
    for (let i = 1; i < n; i++) {
      _q.setFromUnitVectors(T[i - 1], T[i]);
      s = S[i - 1].clone().applyQuaternion(_q);
      s.addScaledVector(T[i], -s.dot(T[i])).normalize();
      S.push(s);
    }
    let total = 0;
    const L = [0];
    for (let i = 1; i < n; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]);
      L.push(total);
    }
    const us = opt.us ?? 1, u0 = opt.u0 ?? 0, vs = opt.vs, uvAt = opt.uvAt;
    for (let i = 0; i < n; i++) {
      const p = pts[i], t = T[i], sv = S[i];
      _c.crossVectors(sv, t); // 截面的另一轴
      const ra = Math.max(p[3], 1e-4), rb = Math.max(p[4] ?? p[3], 1e-4);
      const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
      const dl = Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]) || 1;
      const dra = (c[3] - a[3]) / dl, drb = ((c[4] ?? c[3]) - (a[4] ?? a[3])) / dl;
      const v = vs ? vs[i] : total ? L[i] / total : 0;
      for (let k = 0; k <= seg; k++) {
        const ang = (k / seg) * Math.PI * 2, cs = Math.cos(ang), sn = Math.sin(ang);
        P.push(p[0] + sv.x * cs * ra + _c.x * sn * rb, p[1] + sv.y * cs * ra + _c.y * sn * rb, p[2] + sv.z * cs * ra + _c.z * sn * rb);
        _n.set(0, 0, 0).addScaledVector(sv, cs * rb).addScaledVector(_c, sn * ra).normalize();
        _n.addScaledVector(t, -(cs * cs * dra + sn * sn * drb)).normalize();
        NR.push(_n.x, _n.y, _n.z);
        if (uvAt) UV.push(uvAt[0], uvAt[1]);
        else UV.push(u0 + (k / seg) * us, v);
        if (COL) {
          const w = 0.5 - 0.5 * sn;
          COL.push(c1[0] + (c2[0] - c1[0]) * w, c1[1] + (c2[1] - c1[1]) * w, c1[2] + (c2[2] - c1[2]) * w);
        }
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let k = 0; k < seg; k++) {
        const a = i * ring + k, b = a + 1, c = a + ring, d = c + 1;
        IDX.push(a, c, b, b, c, d);
      }
    const cap = (i, sign) => {
      const p = pts[i], t = T[i], base = i * ring, ci = P.length / 3;
      P.push(p[0], p[1], p[2]);
      NR.push(t.x * sign, t.y * sign, t.z * sign);
      if (uvAt) UV.push(uvAt[0], uvAt[1]);
      else UV.push(u0 + 0.5 * us, vs ? vs[i] : i ? 1 : 0);
      if (COL) COL.push((c1[0] + c2[0]) / 2, (c1[1] + c2[1]) / 2, (c1[2] + c2[2]) / 2);
      for (let k = 0; k < seg; k++) sign < 0 ? IDX.push(ci, base + k, base + k + 1) : IDX.push(ci, base + k + 1, base + k);
    };
    if (opt.capA !== false) cap(0, -1);
    if (opt.capB !== false) cap(n - 1, 1);
    this.raw(key, P, UV, IDX, { ...opt, normals: NR, colors: COL || undefined, double: false, flip: false });
  }

  // 四边形 a→b→c→d（正面看逆时针）；rect 为图集 UV
  quad(key, a, b, c, d, opt = {}) {
    const r = opt.rect || { u0: 0, v0: 0, u1: opt.us ?? 1, v1: opt.vs ?? 1 };
    this.raw(key, [...a, ...b, ...c, ...d], [r.u0, r.v0, r.u1, r.v0, r.u1, r.v1, r.u0, r.v1], [0, 1, 2, 0, 2, 3], opt);
  }

  // 产出网格
  build(mats, parent) {
    const meshes = [];
    for (const g of this.groups.values()) {
      if (!g.count) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(g.pos.a.slice(0, g.pos.n), 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(g.nor.a.slice(0, g.nor.n), 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(g.uv.a.slice(0, g.uv.n), 2));
      geo.setAttribute('aCol', new THREE.BufferAttribute(g.col.a.slice(0, g.col.n), 4));
      geo.setAttribute('aInk', new THREE.BufferAttribute(g.ink.a.slice(0, g.ink.n), 2));
      if (g.life) {
        const la = new Float32Array(g.count * 4);
        la.set(g.life.subarray(0, Math.min(g.life.length, g.count * 4)));
        geo.setAttribute('aLife', new THREE.BufferAttribute(la, 4));
      }
      geo.setIndex(new THREE.BufferAttribute(g.idx.a.slice(0, g.idx.n), 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mat = mats[g.key];
      if (!mat) {
        console.warn('缺少材质', g.key);
        continue;
      }
      const mesh = new THREE.Mesh(geo, mat);
      mesh.userData.matKey = g.key;
      mesh.userData.chunk = g.chunk;
      if (parent) parent.add(mesh);
      meshes.push(mesh);
    }
    this.groups.clear();
    return meshes;
  }
}

// 便捷：用一个临时批处理器构造独立物件（可整体移动/旋转）
export function buildObject(mats, fn) {
  const b = new Batch();
  fn(b);
  const grp = new THREE.Group();
  b.build(mats, grp);
  return grp;
}

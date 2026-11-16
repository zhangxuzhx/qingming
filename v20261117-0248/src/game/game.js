// 玩法主体：存档、行走、交谈、任务、贩货、添置与布置
import * as THREE from 'three';
import { CAPACITY, SELL_MARKUP, START_CAPITAL, GOODS, DECOR, QUESTS, TALK } from './data.js';
import { DecorSystem } from './decor.js';
import { AvatarAnim } from './avatar.js';
import { makeFigure, makePlayerAvatar, Crowd, poseHead } from '../world/figures.js';
import { HOME, GATE, NODES, POIS, poi, route, nearestNode, groundY, blocked, inRailZone, surfaceAt, outOfBounds, districtAt, colliders, ceilAt } from '../world/layout.js';
import { mainRiverSD, riverSD, riverHW, bankOf, bankHeight, RV } from '../world/river.js';
import { terrainH } from '../world/terrain.js';
import { addRipple, markDynamic } from '../engine/ink.js';
import { shove } from '../world/traffic.js';
import { RNG, mulberry32, clamp, angDiff } from '../util.js';

const SAVE_KEY = 'qingming.save.v1';
const _p1 = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _eu = new THREE.Euler(), _mt = new THREE.Matrix4(), _UP = new THREE.Vector3(0, 1, 0);
const mixN = (a, b, t) => a + (b - a) * t;
const START = { x: 401, z: -38, yaw: 1.5 };
// 存档第 2 版：世界按原画重排并放大，坐标与旧档不通
const HOME_SHIFT = [-138, -14];
const fresh = () => ({ v: 2, role: 'merchant', money: 0, goods: {}, decor: [], quest: 0, pos: null, epoch: 1, playtime: 0, sold: {}, flags: {}, met: {}, guide: null, uid: 1 });
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
const NPC_POI = { zhou: 'dock', ding: 'farm', sun: 'sunyang', xiang: 'xiang', silk: 'silk', porcelain: 'porcelain', antique: 'antique', flower: 'flower', zhao: 'zhao' };
const DISTRICT_SUB = { 杏花村: '牧童遥指 · 卷首', 隋堤烟柳: '桃红柳绿 · 汴河南岸', 郊野: '杨柳堆烟', 汴河码头: '舳舻相接 · 百货云集', 虹桥: '飞虹卧波', 城外街市: '百肆杂陈', 城门: '驼铃出城', 城内街市: '正店脚店 · 珠帘绣额', 甜水巷: '深巷人家', 沈宅: '吾家' };
const KIND_LABEL = { table: '案头', floor: '落地', wall: '壁挂' };
const _v = new THREE.Vector3();

export class Game {
  constructor({ scene, camera, world, ui, sound, crowd = 64 }) {
    Object.assign(this, { scene, camera, world, ui, sound });
    this.move = null; // 触屏摇杆：{x,y}∈[-1,1]
    this.s = fresh();
    this.mode = 'title';
    this.player = { x: START.x, z: START.z, y: 0, yaw: START.yaw, pitch: 0, vx: 0, vz: 0, vy: 0, step: 0, ground: true, swim: false, face: START.yaw + Math.PI, swimT: 0 };
    this.view = 'tp'; // tp 第三人称 / fp 第一人称
    this.camDist = 4.6;
    this.avatar = makePlayerAvatar(world.mats);
    scene.add(markDynamic(this.avatar));
    this.anim = new AvatarAnim(this.avatar);
    this.keys = {};
    this.npcs = new Map();
    for (const spec of world.npcs) {
      const grp = makeFigure(world.mats, spec.look, { head: true });
      grp.position.set(spec.x, spec.y ?? groundY(spec.x, spec.z), spec.z);
      grp.rotation.y = spec.yaw;
      scene.add(markDynamic(grp)); // 见人走近会转身转头
      this.npcs.set(spec.id, { spec, grp, yaw: spec.yaw, node: spec.id === 'wife' ? 'h' : nearestNode(spec.x, spec.z, (k) => k !== 'h'), t: Math.random() * 6 });
    }
    for (const [nid, pid] of Object.entries(NPC_POI)) {
      const n = this.npcs.get(nid), p = poi(pid);
      if (n && p) {
        p.x = n.spec.x;
        p.z = n.spec.z;
      }
    }
    this.crowd = new Crowd(scene, world.mats, new RNG(77));
    this.crowd.spawn(crowd);
    this.crowd.addPorters(crowd < 80 ? world.porters.filter((_, i) => i % 2 === 0) : world.porters); // 手机上脚夫减半
    this.decor = new DecorSystem(scene, world.mats, world.home);
    this.decorMode = false;
    this.decorSel = 0;
    this.routeT = 0;
    this.routePts = null;
    this.routeLen = 0;
    this.target = null;
    this.saveT = 0;
    this.boundT = 0;
    this.district = '';
    this.cine = 330;
    this.crierT = world.criers.map(() => Math.random() * 6);
    window.addEventListener('beforeunload', () => this.mode === 'play' && this.save());
  }

  // ───────────── 存档 ─────────────
  static hasSave() {
    try {
      return !!localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (d && (d.v === 1 || d.v === 2)) {
        this.s = { ...fresh(), ...d, v: 2 };
        if (d.v === 1) {
          // 旧档：人回到卷首；家里摆好的陈设随宅子一起搬过来
          this.s.pos = null;
          for (const it of this.s.decor) if (it.placed && typeof it.placed.x === 'number') it.placed = { ...it.placed, x: it.placed.x + HOME_SHIFT[0], z: it.placed.z + HOME_SHIFT[1] };
        }
      }
    } catch {
      /* 存档损坏则从头开始 */
    }
  }
  save() {
    const p = this.player;
    this.s.pos = { x: p.x, z: p.z, yaw: p.yaw };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.s));
    } catch {
      /* 无痕模式等情况下忽略 */
    }
  }
  reset() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      /* 忽略 */
    }
    this.s = fresh();
  }

  // ───────────── 进入画中 ─────────────
  enter(isNew) {
    if (isNew) this.reset();
    else this.load();
    const p = this.player, pos = this.s.pos || START;
    Object.assign(p, { x: pos.x, z: pos.z, yaw: pos.yaw, pitch: 0, vx: 0, vz: 0, vy: 0, y: groundY(pos.x, pos.z), ground: true, swim: false, face: pos.yaw + Math.PI });
    this.view = this.s.flags.view || 'tp';
    this.mode = 'play';
    // 入画的头一个镜头：自身后高处摇下来，落到平常的机位（见 update 里“镜头”一节）
    this._crane = { t: 0, T: 3.4 };
    this._ct = null;
    this._cd = undefined;
    this._tk = 0;
    this._tp = null;
    this.decor.sync(this.s.decor);
    this.district = '';
    this.refreshHud();
    this.ui.showHud(true);
    this.routeT = 0;
  }
  toTitle() {
    this.save();
    this.exitDecor();
    this.mode = 'title';
    this.ui.showHud(false);
  }

  // ───────────── 数值 ─────────────
  carried() {
    return Object.values(this.s.goods).reduce((a, b) => a + b, 0);
  }
  factor(g) {
    const r = mulberry32((this.s.epoch * 7919 + hash(g)) | 0);
    r();
    return 0.86 + r() * 0.34;
  }
  buyPrice(g) {
    const r = mulberry32((this.s.epoch * 104729 + hash(g) * 3) | 0);
    r();
    return Math.round(GOODS[g].base * (0.94 + r() * 0.12));
  }
  sellPrice(g) {
    const sat = Math.max(0.72, 1 - 0.03 * (this.s.sold[g] || 0));
    return Math.max(1, Math.round(GOODS[g].base * SELL_MARKUP * this.factor(g) * sat));
  }
  addMoney(n, quiet) {
    this.s.money += n;
    this.ui.setMoney(this.s.money);
    if (!quiet) {
      this.ui.toast(n >= 0 ? `得钱 ${n} 文` : `付钱 ${-n} 文`, n >= 0 ? 'gain' : '');
      this.sound.sfx('coin');
    }
  }
  refreshHud() {
    const q = QUESTS[this.s.quest];
    let extra = '';
    if (this.s.quest === 7) {
      const placed = new Set(this.s.decor.filter((d) => d.placed).map((d) => d.id)).size;
      extra = `家中陈设 ${placed} / ${Object.keys(DECOR).length}${this.s.guide ? `　·　指引：${poi(this.s.guide)?.name || ''}` : ''}`;
    }
    this.ui.setQuest(q, extra);
    this.ui.setMoney(this.s.money);
    this.ui.setLoad(this.carried(), CAPACITY);
  }
  setQuest(i) {
    if (i <= this.s.quest) return;
    this.s.quest = i;
    this.refreshHud();
    this.ui.toast(`新的去处：${QUESTS[i].title}`, 'gain');
    this.sound.sfx('quest');
    this.routeT = 0;
    this.save();
  }

  // ───────────── 指引 ─────────────
  resolveTarget() {
    let id = QUESTS[this.s.quest].target;
    if (!id) {
      if (!this.s.guide) return null;
      const p = poi(this.s.guide);
      return p ? { x: p.x, z: p.z, name: p.name, node: p.node, ch: p.name[0], poi: p.id } : null;
    }
    if (id === 'home') {
      const p = poi('home');
      return { x: p.x, z: p.z, name: p.name, node: 'h', ch: '家', poi: 'home' };
    }
    if (id === 'buyer') {
      const g = Object.keys(this.s.goods).find((k) => this.s.goods[k] > 0);
      id = g ? GOODS[g].buyer : 'sun';
    }
    if (id === 'decorshop') {
      const p = this.player;
      id = ['porcelain', 'antique', 'flower'].sort((a, b) => this.dist(this.npcs.get(a)) - this.dist(this.npcs.get(b)))[0];
      void p;
    }
    const n = this.npcs.get(id);
    return n ? { x: n.spec.x, z: n.spec.z, name: n.spec.title === '夫人' ? '娘子' : n.spec.title, node: n.node, ch: (n.spec.title === '夫人' ? '妻' : n.spec.title[0]), poi: NPC_POI[id] || (id === 'wife' ? 'home' : null) } : null;
  }
  dist(n) {
    return Math.hypot(n.spec.x - this.player.x, n.spec.z - this.player.z);
  }
  updateRoute() {
    const t = (this.target = this.resolveTarget());
    if (!t) {
      this.routePts = null;
      return;
    }
    const p = this.player;
    const direct = Math.hypot(t.x - p.x, t.z - p.z);
    if (direct < 14) {
      this.routePts = [[t.x, t.z]];
      this.routeLen = direct;
      return;
    }
    const r = route(p.x, p.z, t.node);
    const pts = r.path.map((k) => NODES[k]);
    pts.push([t.x, t.z]);
    this.routePts = pts;
    let len = 0, px = p.x, pz = p.z;
    for (const q of pts) {
      len += Math.hypot(q[0] - px, q[1] - pz);
      px = q[0];
      pz = q[1];
    }
    this.routeLen = len;
  }

  // ───────────── 输入 ─────────────
  look(dx, dy) {
    if (this.mode !== 'play' || this.ui.modal) return;
    const p = this.player;
    p.yaw -= dx * 0.0023;
    p.pitch = clamp(p.pitch - dy * 0.0023, -1.35, 1.35);
  }
  wheel(dy) {
    if (this.ui.modal) return;
    if (!this.decorMode) {
      if (this.view === 'tp' && this.mode === 'play') this.camDist = clamp(this.camDist + (dy > 0 ? 0.6 : -0.6), 2.4, 9);
      return;
    }
    const list = this.unplaced();
    if (!list.length) return;
    this.decorSel = (this.decorSel + (dy > 0 ? 1 : -1) + list.length) % list.length;
    this.decor.setGhost(list[this.decorSel].id);
    this.sound.sfx('page');
  }
  click() {
    if (this.mode !== 'play' || this.ui.modal) return;
    if (this.decorMode) this.placeDecor();
  }
  keyDown(code) {
    const ui = this.ui;
    if (this.mode !== 'play') {
      if (ui._introGo && (code === 'Enter' || code === 'Space')) ui._introGo();
      return;
    }
    if (ui.dialogueOpen) {
      if (code === 'KeyE' || code === 'Space' || code === 'Enter') ui.advanceDialogue();
      return;
    }
    if (ui.pieOpen) {
      if (code === 'KeyE' || code === 'Escape') ui.closePie();
      else if (/^Digit[1-9]$/.test(code)) ui.pickPieIndex(Number(code.slice(5)) - 1);
      return;
    }
    if (ui.panelOpen) {
      if (code === 'KeyE' || code === 'Escape' || code === 'Tab') ui.closePanel();
      return;
    }
    if (ui.mapOpen) {
      if (code === 'KeyM' || code === 'Escape') ui.closeMap();
      return;
    }
    if (ui.pauseOpen) {
      if (code === 'Escape') this.resume();
      return;
    }
    if (code === 'Escape') {
      if (this.decorMode) this.exitDecor();
      else this.pause();
    } else if (code === 'KeyM') this.openMap();
    else if (code === 'Tab') this.openBag();
    else if (code === 'KeyB') this.toggleDecor();
    else if (code === 'KeyV') this.toggleView();
    else if (code === 'Space') this.jump();
    else if (this.decorMode) {
      if (code === 'KeyR') this.decor.rot += Math.PI / 6;
      else if (code === 'KeyF') this.pickupDecor();
      else if (code === 'KeyE') this.placeDecor();
    } else if (code === 'KeyE' && this.focus) this.openPie(this.focus);
    else if (code === 'KeyE' && this.focusObj) this.openObjPie(this.focusObj);
  }
  toggleView() {
    if (this.decorMode) return this.ui.toast('布置时用第一人称看得真切');
    this.view = this.view === 'fp' ? 'tp' : 'fp';
    this.s.flags.view = this.view;
    this.ui.toast(this.view === 'tp' ? '第三人称 · 滚轮可远近' : '第一人称');
    this.sound.sfx('page');
  }
  jump() {
    const p = this.player;
    if (this.decorMode || p.swim || !p.ground) return;
    p.vy = 6.6;
    p.ground = false;
  }
  pause() {
    this.save();
    this.ui.showPause({
      muted: this.sound.muted,
      onResume: () => this.resume(),
      onMute: () => {
        this.sound.setMuted(!this.sound.muted);
        return this.sound.muted;
      },
      onTitle: () => {
        this.ui.hidePause();
        this.onTitle && this.onTitle();
      },
      onReset: () => {
        this.ui.hidePause();
        this.reset();
        this.onTitle && this.onTitle();
      },
    });
    this.onModal && this.onModal(true);
  }
  resume() {
    this.ui.hidePause();
    this.onModal && this.onModal(false);
  }

  // ───────────── 交谈 ─────────────
  say(lines, then) {
    this.onModal && this.onModal(true);
    this.ui.playDialogue(lines, {
      onLine: (l) => {
        this.sound.sfx('page');
        if (l.give) this.addMoney(l.give, true), this.sound.sfx('coin');
      },
      onDone: () => {
        if (then) then();
        if (!this.ui.modal) this.onModal && this.onModal(false);
      },
    });
  }
  // 对着人：先出一圈可做之事（仿《模拟人生》的互动方式）
  openPie(id) {
    const n = this.npcs.get(id).spec, s = this.s, o = [];
    if (id === 'wife') {
      o.push({ key: 'talk', label: '说话' });
      if (s.decor.length) o.push({ key: 'decor', label: '布置家宅' });
      o.push({ key: 'bag', label: '看行囊' });
    } else if (id === 'zhou' || id === 'ding') o.push({ key: 'trade', label: '收货' }, { key: 'chat', label: '寒暄' });
    else if (id === 'sun' || id === 'xiang' || id === 'silk') o.push({ key: 'trade', label: '出货' }, { key: 'chat', label: '寒暄' });
    else if (id === 'porcelain' || id === 'antique' || id === 'flower') o.push({ key: 'shop', label: '看陈设' }, { key: 'chat', label: '寒暄' });
    else if (id === 'fortune') o.push({ key: 'talk', label: '问行情' }, { key: 'bow', label: '作揖' });
    else o.push({ key: 'talk', label: '攀谈' }, { key: 'bow', label: '作揖' });
    this.onModal && this.onModal(true);
    this.sound.sfx('page');
    this.ui.openPie({ title: n.name, sub: n.title, options: o }, (k) => this.pieAct(id, k), () => this.onModal && this.onModal(false));
  }
  pieAct(id, k) {
    const s = this.s;
    s.met[id] = 1;
    if (k === 'trade') return this.openTrade(id, id === 'zhou' || id === 'ding' ? 'buy' : 'sell');
    if (k === 'shop') return this.openShop(id);
    if (k === 'bag') return this.openBag();
    if (k === 'chat') return this.say(TALK[id]);
    if (k === 'decor') {
      this.onModal && this.onModal(false);
      return this.toggleDecor();
    }
    if (k === 'bow') {
      this.onModal && this.onModal(false);
      return this.ui.toast('你拱手一揖，对方含笑还礼');
    }
    if (id === 'wife') return this.talkWife();
    if (id === 'fortune') return this.say(this.fortune());
    const pool = TALK[id];
    if (pool) return this.say(pool[Math.floor(Math.random() * pool.length)]);
    this.onModal && this.onModal(false);
  }
  // 对着家中陈设
  openObjPie(it) {
    const d = DECOR[it.rec.id];
    this.onModal && this.onModal(true);
    this.ui.openPie(
      { title: d.name.length > 4 ? d.name.slice(-2) : d.name, sub: d.name, options: [{ key: 'look', label: '端详' }, { key: 'move', label: '挪动' }, { key: 'store', label: '收起' }] },
      (k) => {
        if (k === 'look') return this.say([{ who: '你', text: d.desc }]);
        this.onModal && this.onModal(false);
        it.rec.placed = null;
        this.decor.sync(this.s.decor);
        this.refreshHud();
        if (k === 'store') return this.ui.toast(`「${d.name}」已收起`);
        this.toggleDecor();
        const list = this.unplaced();
        this.decorSel = Math.max(0, list.indexOf(it.rec));
        this.decor.setGhost(it.rec.id);
      },
      () => this.onModal && this.onModal(false)
    );
  }
  // 交谈时的机位：站到主角身后偏一侧、略高过肩，看对方的脸（稍稍带向两人之间）。哪一侧没有遮挡用哪一侧；
  // 两侧都被墙、柱挡着就不换机位。返回 0~1 的过渡量
  _talkCam(dt) {
    const p = this.player, on = this.ui.dialogueOpen && this._talkId ? this.npcs.get(this._talkId) : null;
    if (!this.ui.dialogueOpen) this._talkId = null;
    if (on && !this._tp) {
      const n = on.spec, ny = n.y ?? groundY(n.x, n.z), d = Math.hypot(p.x - n.x, p.z - n.z) || 1, ux = (p.x - n.x) / d, uz = (p.z - n.z) / d;
      const L = new THREE.Vector3(n.x + ux * d * 0.2, ny + 1.4 * ((n.look && n.look.s) || 1), n.z + uz * d * 0.2);
      this._tp = { none: true };
      for (const sd of [1, -1]) {
        const C = new THREE.Vector3(p.x + ux * 1.3 - uz * 0.85 * sd, Math.max(p.y, ny) + 1.62, p.z + uz * 1.3 + ux * 0.85 * sd);
        let ok = !outOfBounds(C.x, C.z) && C.y < ceilAt(C.x, C.z, p.y) - 0.25 && C.y > terrainH(C.x, C.z) + 0.3;
        for (let i = 1; ok && i <= 8; i++) {
          const t = i / 8;
          if (colliders.hit(mixN(L.x, C.x, t), mixN(L.z, C.z, t), 0.22, mixN(L.y, C.y, t) - 0.25, 0.5)) ok = false;
        }
        if (ok) {
          this._tp = { C, L, d: C.distanceTo(L) };
          break;
        }
      }
    }
    const active = on && this._tp && !this._tp.none;
    this._tk = clamp((this._tk || 0) + dt * (active ? 1.5 : -2.4), 0, 1);
    if (!on && this._tk <= 0) this._tp = null;
    if (!this._tp || this._tp.none) return 0;
    const u = this._tk;
    return u * u * (3 - 2 * u);
  }
  talk(id) {
    this._talkId = id;
    const s = this.s, first = !s.met[id];
    s.met[id] = 1;
    if (id === 'wife') return this.talkWife();
    if (id === 'zhou' || id === 'ding') return first ? this.say(TALK[id], () => this.openTrade(id, 'buy')) : this.openTrade(id, 'buy');
    if (id === 'sun' || id === 'xiang' || id === 'silk') return first ? this.say(TALK[id], () => this.openTrade(id, 'sell')) : this.openTrade(id, 'sell');
    if (id === 'porcelain' || id === 'antique' || id === 'flower') return first ? this.say(TALK[id], () => this.openShop(id)) : this.openShop(id);
    if (id === 'fortune') return this.say(this.fortune());
    const pool = TALK[id];
    if (pool) this.say(pool[Math.floor(Math.random() * pool.length)]);
  }
  talkWife() {
    const s = this.s;
    if (s.quest <= 1) {
      return this.say(TALK.wifeFirst, () => {
        this.ui.setMoney(s.money);
        this.ui.toast(`得本钱 ${START_CAPITAL} 文`, 'gain');
        this.setQuest(2);
      });
    }
    const worth = s.money + Object.keys(s.goods).reduce((a, g) => a + s.goods[g] * GOODS[g].base, 0);
    if (worth < 40 && s.playtime - (s.flags.aid || -999) > 200) {
      s.flags.aid = s.playtime;
      return this.say(TALK.wifeBroke, () => this.refreshHud());
    }
    if (s.quest === 6) return this.say(TALK.wifeDecorDone, () => this.setQuest(7));
    if (s.quest === 5) return this.say(TALK.wifeDecorBought);
    if (s.quest === 2) return this.say(TALK.wifeWaiting);
    if (s.quest < 7) return this.say(TALK.wifeTrading);
    const kinds = new Set(s.decor.filter((d) => d.placed).map((d) => d.id)).size;
    if (kinds >= Object.keys(DECOR).length) return this.say(TALK.wifeRich);
    const pool = TALK.wifeFree;
    this.say(pool[Math.floor(Math.random() * pool.length)]);
  }
  fortune() {
    const ids = Object.keys(GOODS).sort((a, b) => this.factor(b) - this.factor(a));
    const up = GOODS[ids[0]], down = GOODS[ids[ids.length - 1]];
    return [
      { who: '李铁口', text: '员外请坐。问行情？容老朽起一课……' },
      { who: '李铁口', text: `卦象已明：今日「${up.name}」财星高照，行情看涨；「${down.name}」却是水逆之相，不宜多囤。` },
      { who: '李铁口', text: '行情几盏茶的工夫便要变一变，员外见机行事。卦金随喜，随喜。' },
    ];
  }

  // ───────────── 买卖 ─────────────
  openTrade(id, mode) {
    const s = this.s, n = this.npcs.get(id).spec;
    const ids = Object.keys(GOODS).filter((g) => (mode === 'buy' ? GOODS[g].src === id : GOODS[g].buyer === id));
    const arrow = (g) => {
      const f = this.factor(g);
      return f > 1.08 ? '<span class="up">▲ 城中看涨</span>' : f < 0.94 ? '<span class="down">▼ 城中看跌</span>' : '';
    };
    const render = () => {
      const cap = this.carried();
      const rows = ids
        .map((g) => {
          const d = GOODS[g], have = s.goods[g] || 0;
          if (mode === 'buy') {
            const pr = this.buyPrice(g), can = s.money >= pr && cap < CAPACITY;
            return `<div class="row"><div><div class="nm">${d.name}</div><div class="ds">${d.desc}　${arrow(g)}</div></div>
              <div class="pr">${pr}<small> 文/${d.unit}</small></div><div class="hv">已持 <b>${have}</b></div>
              <div class="ops"><button class="btn small" data-act="buy1" data-id="${g}" ${can ? '' : 'disabled'}>买一${d.unit}</button><button class="btn small" data-act="buyMax" data-id="${g}" ${can ? '' : 'disabled'}>买满</button></div></div>`;
          }
          const pr = this.sellPrice(g);
          return `<div class="row ${have ? '' : 'dim'}"><div><div class="nm">${d.name}</div><div class="ds">${arrow(g) || '行情平稳'}${(s.sold[g] || 0) > 3 ? '　·　铺中存货渐满，价钱走低' : ''}</div></div>
            <div class="pr">${pr}<small> 文/${d.unit}</small></div><div class="hv">持有 <b>${have}</b></div>
            <div class="ops"><button class="btn small" data-act="sell1" data-id="${g}" ${have ? '' : 'disabled'}>卖一${d.unit}</button><button class="btn small" data-act="sellAll" data-id="${g}" ${have ? '' : 'disabled'}>全卖</button></div></div>`;
        })
        .join('');
      const none = mode === 'sell' && !ids.some((g) => s.goods[g]) ? `<div class="note">${TALK.nothingToSell}</div>` : '';
      return `<div class="head"><h2>${n.title}</h2><div class="sub">${n.name}　·　${mode === 'buy' ? '收货' : '出货'}</div><div class="cash">钱 <b>${s.money}</b> 文</div></div>
        <div class="body">${rows}${none}</div>
        <div class="foot"><span>行囊 ${cap} / ${CAPACITY}　·　${mode === 'buy' ? '货价随行就市，卖价见各铺' : '同一样货卖得多了，价钱便会走低'}</span><button class="btn small" data-act="close">离开</button></div>`;
    };
    const act = (a, g) => {
      const d = GOODS[g];
      if (a === 'buy1' || a === 'buyMax') {
        const pr = this.buyPrice(g);
        let n2 = a === 'buy1' ? 1 : Math.min(CAPACITY - this.carried(), Math.floor(s.money / pr));
        n2 = Math.min(n2, CAPACITY - this.carried(), Math.floor(s.money / pr));
        if (n2 <= 0) return this.sound.sfx('deny');
        s.goods[g] = (s.goods[g] || 0) + n2;
        this.addMoney(-pr * n2, true);
        this.sound.sfx('coin');
        this.ui.toast(`购入${d.name} ${n2} ${d.unit}`);
        if (s.quest === 2) this.setQuest(3);
      } else {
        const have = s.goods[g] || 0;
        const n2 = a === 'sell1' ? Math.min(1, have) : have;
        if (n2 <= 0) return this.sound.sfx('deny');
        let total = 0;
        for (let i = 0; i < n2; i++) {
          total += this.sellPrice(g);
          s.sold[g] = (s.sold[g] || 0) + 1;
        }
        s.goods[g] = have - n2;
        this.addMoney(total, true);
        this.sound.sfx('coin');
        this.ui.toast(`售出${d.name} ${n2} ${d.unit}，得 ${total} 文`, 'gain');
        s.flags.sold = 1;
        if (s.quest === 3) this.setQuest(4);
      }
      this.ui.setLoad(this.carried(), CAPACITY);
      this.routeT = 0;
    };
    this.onModal && this.onModal(true);
    this.ui.openPanel(render, act, () => {
      this.save();
      this.onModal && this.onModal(false);
    });
  }
  openShop(id) {
    const s = this.s, n = this.npcs.get(id).spec;
    const ids = Object.keys(DECOR).filter((k) => DECOR[k].shop === id);
    const render = () => `<div class="head"><h2>${n.title}</h2><div class="sub">${n.name}　·　陈设器玩</div><div class="cash">钱 <b>${s.money}</b> 文</div></div>
      <div class="body"><div class="cards2">${ids
        .map((k) => {
          const d = DECOR[k], own = s.decor.filter((x) => x.id === k).length;
          return `<div class="dcard"><div class="t"><span class="nm">${d.name}</span><span class="kd">${KIND_LABEL[d.kind]}</span></div><div class="ds">${d.desc}</div>
            <div class="b"><span class="pr">${d.price} 文</span><span class="own">${own ? `已有 ${own} 件` : ''}</span><button class="btn small red" data-act="buy" data-id="${k}" ${s.money >= d.price ? '' : 'disabled'}>购置</button></div></div>`;
        })
        .join('')}</div></div>
      <div class="foot"><span>买下的陈设，回家后按 B 布置</span><button class="btn small" data-act="close">离开</button></div>`;
    const act = (a, k) => {
      const d = DECOR[k];
      if (s.money < d.price) return this.sound.sfx('deny');
      this.addMoney(-d.price, true);
      this.sound.sfx('coin');
      s.decor.push({ uid: s.uid++, id: k, placed: null });
      this.ui.toast(`购得「${d.name}」`, 'gain');
      if (s.quest === 4) this.setQuest(5);
    };
    this.onModal && this.onModal(true);
    this.ui.openPanel(render, act, () => {
      this.save();
      this.onModal && this.onModal(false);
    });
  }
  openBag() {
    const s = this.s;
    const render = () => {
      const goods = Object.keys(s.goods).filter((g) => s.goods[g] > 0);
      const gl = goods.length ? goods.map((g) => `<div class="li"><span>${GOODS[g].name} × ${s.goods[g]}</span><span>可售与 ${this.npcs.get(GOODS[g].buyer).spec.title}　现价 ${this.sellPrice(g)} 文</span></div>`).join('') : '<div class="note">行囊空空。去汴河码头或郊野收些货罢。</div>';
      const dl = s.decor.length ? s.decor.map((d) => `<div class="li"><span>${DECOR[d.id].name}</span><span>${d.placed ? '已摆在家中' : '待摆放'}</span></div>`).join('') : '<div class="note">尚未添置陈设。</div>';
      return `<div class="head"><h2>行　囊</h2><div class="sub">货物 ${this.carried()} / ${CAPACITY}</div><div class="cash">钱 <b>${s.money}</b> 文</div></div>
        <div class="body bag"><h3>货物</h3>${gl}<h3>陈设</h3>${dl}</div><div class="foot"><span>Tab / Esc 合上</span><button class="btn small" data-act="close">合上</button></div>`;
    };
    this.onModal && this.onModal(true);
    this.ui.openPanel(render, null, () => this.onModal && this.onModal(false));
  }
  openMap() {
    const p = this.player;
    this.onModal && this.onModal(true);
    this.sound.sfx('page');
    this.ui.openMap(
      { x: p.x, z: p.z, targetId: this.target?.poi || null },
      (id) => {
        if (QUESTS[this.s.quest].target) return this.ui.toast('眼下还有要紧事，办完再随意走动罢');
        this.s.guide = id;
        this.routeT = 0;
        this.refreshHud();
        this.ui.toast(`已设指引：${poi(id).name}`);
      },
      () => this.onModal && this.onModal(false)
    );
  }

  // ───────────── 布置 ─────────────
  inHome() {
    const p = this.player;
    return Math.abs(p.x - HOME.x) < HOME.w / 2 - 0.4 && Math.abs(p.z - HOME.z) < HOME.d / 2 - 0.3;
  }
  unplaced() {
    return this.s.decor.filter((d) => !d.placed);
  }
  toggleDecor() {
    if (this.decorMode) return this.exitDecor();
    if (!this.inHome()) return this.ui.toast('陈设须在自家院中、堂上布置');
    this.decorMode = true;
    this._viewBefore = this.view;
    this.view = 'fp';
    this.decorSel = 0;
    const list = this.unplaced();
    this.decor.rot = 0;
    this.decor.setGhost(list.length ? list[0].id : null);
    this.sound.sfx('page');
  }
  exitDecor() {
    if (!this.decorMode) return;
    this.decorMode = false;
    if (this._viewBefore) this.view = this._viewBefore;
    this.decor.clearGhost();
    this.ui.decorBar(null);
  }
  placeDecor() {
    const list = this.unplaced();
    if (!list.length || !this.decor.ghost) return;
    if (!this.decor.valid || !this.decor.aimHit) return this.sound.sfx('deny');
    const rec = list[this.decorSel];
    rec.placed = { ...this.decor.aimHit };
    this.decor.sync(this.s.decor);
    this.sound.sfx('place');
    this.ui.toast(`「${DECOR[rec.id].name}」已摆好`);
    const rest = this.unplaced();
    this.decorSel = Math.min(this.decorSel, Math.max(0, rest.length - 1));
    this.decor.setGhost(rest.length ? rest[this.decorSel].id : null);
    if (this.s.quest === 5) this.setQuest(6);
    this.refreshHud();
    this.save();
  }
  pickupDecor() {
    const it = this.decor.pick(this.camera);
    if (!it) return;
    it.rec.placed = null;
    this.decor.sync(this.s.decor);
    const list = this.unplaced();
    this.decorSel = list.indexOf(it.rec);
    this.decor.setGhost(it.rec.id);
    this.sound.sfx('page');
    this.refreshHud();
  }

  // ───────────── 每帧 ─────────────
  update(dt) {
    const p = this.player, ui = this.ui, cam = this.camera;
    if (this.mode !== 'play') {
      // 卷首：自右向左缓缓展卷的俯瞰
      this.cine -= dt * 1.5; // 展卷要慢：走快了，枝叶细线一帧挪好几个像素，满眼都在闪
      if (this.cine < -372) this.cine = 372;
      cam.fov = 34;
      cam.position.set(this.cine, 52, 96);
      cam.lookAt(this.cine - 10, 2, -12);
      cam.updateProjectionMatrix();
      this.crowd.update(dt, this.cine, 0);
      return;
    }
    {
      const k = this.keys, running = (k.ShiftLeft || k.ShiftRight || (this.move && Math.hypot(this.move.x, this.move.y) > 0.93)) && Math.hypot(p.vx, p.vz) > 5;
      this._fov = (this._fov || 62) + ((running ? 67 : 62) - (this._fov || 62)) * Math.min(1, dt * 4);
    }
    this._landV = 0;
    const s = this.s;
    s.playtime += dt;
    // 行情更替、货价回稳
    const ep = Math.floor(s.playtime / 300) + 1;
    if (ep !== s.epoch) {
      s.epoch = ep;
      ui.toast('市面行情有变');
    }
    for (const g in s.sold) s.sold[g] = Math.max(0, s.sold[g] - dt / 14);

    // 行走
    const k = this.keys, free = !ui.modal;
    let f = 0, r = 0, run = k.ShiftLeft || k.ShiftRight;
    if (free) {
      f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
      r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
      if (this.move) {
        f += this.move.y;
        r += this.move.x;
        if (Math.hypot(this.move.x, this.move.y) > 0.93) run = true; // 摇杆推到底即疾行
      }
    } else this.move = null;
    const mag = Math.hypot(f, r);
    const speed = (p.swim ? (run ? 3.3 : 2.3) : run ? 7.4 : 4.1) * (mag > 1 ? 1 / mag : 1);
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
    const tvx = (fx * f + rx * r) * speed, tvz = (fz * f + rz * r) * speed;
    // 起步稍缓、收步稍快：有点分量，又不拖泥带水
    const acc = Math.min(1, dt * (p.swim ? 4 : p.ground ? (mag > 0 ? 9 : 12) : 3));
    p.vx += (tvx - p.vx) * acc;
    p.vz += (tvz - p.vz) * acc;
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    if (outOfBounds(nx, nz) && this.boundT <= 0 && (f || r)) {
      ui.toast('前路烟霭迷蒙——画卷至此而尽');
      this.boundT = 6;
    }
    this.boundT -= dt;
    // 在船上、跳板上走，不会一脚踩空掉进水里（甲板没有栏杆，舷边的走道又窄）；要下水得跳
    const aboard = p.ground && !p.swim && riverSD(p.x, p.z) < -0.45 && !surfaceAt(p.x, p.z, p.y).water;
    const drop = (x, z) => aboard && riverSD(x, z) < -0.45 && surfaceAt(x, z, p.y).water;
    // 走不动时往旁边让一点再试：船是斜着泊的，贴着船身、沿着舷边走（游）要能顺着滑过去，不能卡住
    const clear = (x, z) => !blocked(x, z, 0.35, p.y) && !drop(x, z);
    const ex = Math.abs(nx - p.x) * 0.5, ez = Math.abs(nz - p.z) * 0.5;
    if (clear(nx, p.z)) p.x = nx;
    else if (ex > 1e-5 && clear(nx, p.z + ex)) (p.x = nx), (p.z += ex);
    else if (ex > 1e-5 && clear(nx, p.z - ex)) (p.x = nx), (p.z -= ex);
    else p.vx = 0;
    if (clear(p.x, nz)) p.z = nz;
    else if (ez > 1e-5 && clear(p.x + ez, nz)) (p.z = nz), (p.x += ez);
    else if (ez > 1e-5 && clear(p.x - ez, nz)) (p.z = nz), (p.x -= ez);
    else p.vz = 0;
    // 行船开过来：把水里的人往旁边分开（挪过去的地方若有别的东西挡着就不挪，交给下面那一步）
    const sv = shove(p.x, p.z, p.y);
    if (sv && !blocked(sv[0], sv[1], 0.35, p.y, false)) {
      p.x = sv[0];
      p.z = sv[1];
    }
    if (blocked(p.x, p.z, 0.35, p.y, !sv)) {
      // 已经嵌在什么东西里了（比如从船边跳下水，正落在船身边上）：朝最近的空处挪出去，免得卡死
      out: for (const d of [0.2, 0.4, 0.7, 1.1, 1.6])
        for (let k = 0; k < 8; k++) {
          const qx = p.x + Math.sin(k * 0.7854) * d, qz = p.z + Math.cos(k * 0.7854) * d;
          if (!blocked(qx, qz, 0.35, p.y)) {
            p.x = qx;
            p.z = qz;
            break out;
          }
        }
    }
    // 也不从行人身上穿过去
    for (const w of this.crowd.walkers) {
      if (!w.grp.visible) continue;
      const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
      if (d < 0.52 && d > 1e-3 && Math.abs(p.y - groundY(w.x, w.z)) < 1.2) {
        const qx = w.x + (dx / d) * 0.52, qz = w.z + (dz / d) * 0.52;
        if (!blocked(qx, qz, 0.35, p.y) && !drop(qx, qz)) {
          p.x = qx;
          p.z = qz;
        }
      }
    }
    // 落在栏杆上则滑向桥外
    if (inRailZone(p.x, p.z) && !blocked(p.x, p.z + Math.sign(p.z) * 0.1, 0.35, p.y + 2)) p.z += Math.sign(p.z) * dt * 2.5;
    // 不与人撞个满怀
    for (const n of this.npcs.values()) {
      const dx = p.x - n.spec.x, dz = p.z - n.spec.z, d = Math.hypot(dx, dz);
      if (d < 0.62 && d > 1e-3) {
        const qx = n.spec.x + (dx / d) * 0.62, qz = n.spec.z + (dz / d) * 0.62;
        if (!blocked(qx, qz, 0.35, p.y)) {
          p.x = qx;
          p.z = qz;
        }
      }
    }
    const sp = Math.hypot(p.vx, p.vz);
    this.world.indoor = Math.abs(p.x - GATE.x) > GATE.halfX + 1 && ceilAt(p.x, p.z, p.y) < 1e8;
    // 头一回进屋，提一句换视角
    if (!s.flags.indoor && Math.abs(p.x - GATE.x) > GATE.halfX + 1 && ceilAt(p.x, p.z, p.y) < 1e8) {
      s.flags.indoor = 1;
      ui.toast(ui.touch ? '进屋了——屋里逼仄，点「视」换第一人称更好看' : '进屋了——屋里逼仄，按 V 换第一人称更好看');
    }
    // 起落与泅水
    const surf = surfaceAt(p.x, p.z, p.y);
    // 近岸：脚下的高照岸的断面走（与画出来的岸一致）——岸顶是平的，过了沿口顺着岸壁下到水面，再往里一米是没膝的浅滩，
    // 踩得到底；再远才是深水。下水是蹚下去的，上岸是踩着岸壁走上来的，不是从岸里“钻”出来
    if (surf.water) {
      const sdw = riverSD(p.x, p.z), hw = riverHW(p.x, p.z);
      if (sdw > bankOf(hw).foot - 1) {
        surf.water = false;
        surf.y = bankHeight(sdw, hw);
      }
    }
    // 人在水里走动、泅水：隔一会儿荡开一圈波纹
    if (riverSD(p.x, p.z) < -0.15 && p.y < RV.WATER_Y + 0.05) {
      this._ripT = (this._ripT || 0) - dt * (Math.hypot(p.vx || 0, p.vz || 0) > 0.3 ? 1 : 0.25);
      if (this._ripT <= 0) {
        this._ripT = 0.42;
        addRipple(p.x, p.z, Math.hypot(p.vx || 0, p.vz || 0) > 0.3 ? 1 : 0.5);
      }
    }
    const floatY = RV.WATER_Y - 1.08; // 泅水时脚底的高度：只露头肩
    if (surf.water) {
      if (p.y <= floatY + 0.05 || p.swim) {
        if (!p.swim) {
          p.swim = true;
          this.sound.sfx('place');
          if (!s.flags.swam) {
            s.flags.swam = 1;
            ui.toast('入水了——游到岸边自会上岸');
          }
        }
        p.vy = 0;
        p.ground = false;
        p.y += (floatY + Math.sin(p.swimT * 2.2) * 0.04 - p.y) * Math.min(1, dt * 6);
        p.swimT += dt * (0.6 + sp * 0.5);
      } else {
        p.ground = false;
        p.vy -= 22 * dt;
        p.y += p.vy * dt;
      }
    } else {
      if (p.swim) {
        p.swim = false; // 上岸
        p.ground = true;
      }
      if (p.ground) {
        if (surf.y < p.y - 0.6) p.ground = false; // 踏空
        else p.y += (surf.y - p.y) * Math.min(1, dt * 12);
      }
      if (!p.ground) {
        p.vy -= 22 * dt;
        p.y += p.vy * dt;
        if (p.y <= surf.y) {
          this._landV = -p.vy;
          p.y = surf.y;
          p.vy = 0;
          p.ground = true;
        }
      }
    }
    p.step += sp * dt * 1.9;
    const bob = p.ground ? Math.sin(p.step * Math.PI) * 0.028 * Math.min(1, sp / 4) : 0;

    // 主角小像（动作见 avatar.js）
    const av = this.avatar;
    if (this.view === 'tp') {
      if (sp > 0.4) p.face += angDiff(Math.atan2(p.vx, p.vz), p.face) * Math.min(1, dt * 10);
    } else p.face = p.yaw + Math.PI;
    const talkN = this.ui.dialogueOpen && this._talkId ? this.npcs.get(this._talkId) : null;
    if (talkN && this.view === 'tp') p.face += angDiff(Math.atan2(talkN.spec.x - p.x, talkN.spec.z - p.z), p.face) * Math.min(1, dt * 6);
    av.position.set(p.x, p.y, p.z);
    av.rotation.y = p.face;
    {
      const fn = talkN || (this.focus && this.npcs.get(this.focus));
      this.anim.update(dt, p, {
        yaw: p.yaw,
        pitch: p.pitch,
        tp: this.view === 'tp',
        look: fn ? { x: fn.spec.x, y: (fn.spec.y ?? groundY(fn.spec.x, fn.spec.z)) + 1.5, z: fn.spec.z } : null,
        // 脚下那一处的地面（上台阶、上坡时脚各踩各的高度）
        groundAt: (x, z) => {
          const q = surfaceAt(x, z, p.y + 0.3);
          return q.water ? p.y : q.y;
        },
      });
    }
    // 第一人称时小像只留影子（第 2 层：只投影不入画）
    const lay = (this.view === 'tp' && !(this._cd < 0.9)) || (this._tk || 0) > 0.35 || this._crane ? 0 : 2;
    if (this._avLayer !== lay) {
      this._avLayer = lay;
      av.traverse((o) => o.layers.set(lay));
    }
    // 涟漪：水面着色里画（见上面的 addRipple），蹚水、泅水都有

    // ── 镜头 ──
    // 先算平常的机位（第三人称跟随 / 第一人称），再看要不要让给“入画”的摇臂镜头或交谈时的过肩镜头
    let gx, gy, gz;
    if (this.view === 'tp') {
      if (!this._ct || Math.hypot(this._ct.x - p.x, this._ct.z - p.z) > 6) this._ct = { x: p.x, y: p.y, z: p.z, vy: 0, side: 0, run: 0 };
      const ct = this._ct, kf = Math.min(1, dt * 9);
      // 跟随点略带迟滞，转身起步更柔和
      ct.x += (p.x - ct.x) * kf;
      ct.z += (p.z - ct.z) * kf;
      // 竖直方向是一根带阻尼的弹簧：上下台阶不颠；落地时镜头跟着一沉再回上来
      if (this._landV > 2) ct.vy -= Math.min(this._landV, 9) * 0.1;
      for (let n = dt > 0.02 ? 2 : 1, h = dt / n, i = 0; i < n; i++) {
        ct.vy += (81 * (p.y - ct.y) - 16.2 * ct.vy) * h;
        ct.y += ct.vy * h;
      }
      const cp = Math.cos(p.pitch), ty = ct.y + (p.swim ? 1.75 : 1.55);
      const dx = Math.sin(p.yaw) * cp, dy = -Math.sin(p.pitch), dz = Math.cos(p.yaw) * cp; // 自目标指向镜头
      // 肩位：镜头往右让出一拃，人站在画面中线偏左，正前方的景不被后脑勺挡着；右手边贴着墙、或镜头拉得很近时收回去
      const sideOK = !colliders.hit(ct.x + rx * 0.55, ct.z + rz * 0.55, 0.25, ty - 0.3, 0.6);
      ct.side += ((sideOK ? 0.34 : 0) * clamp(((this._cd ?? this.camDist) - 1.3) / 1.6, 0, 1) - ct.side) * Math.min(1, dt * 5);
      const ox = ct.x + rx * ct.side, oz = ct.z + rz * ct.side;
      // 跑起来镜头略往后撤
      ct.run += (clamp((sp - 4.6) / 2.6, 0, 1) - ct.run) * Math.min(1, dt * 2.5);
      const want = this.camDist * (1 + 0.14 * ct.run);
      let dist = 0.5;
      // 沿途若被墙挡住，就把镜头拉近
      for (let t = 0.5; t <= want; t += 0.25) {
        const qx = ox + dx * t, qz = oz + dz * t, qy = ty + 0.3 + dy * t;
        // 脚下是水的地方，“地面”按水面算（河床不在地形里，原先人一下水镜头就缩到贴脸）
        const gq = riverSD(qx, qz) < 0 ? RV.WATER_Y : groundY(qx, qz);
        if (colliders.hit(qx, qz, 0.3, qy - 0.3, 0.5) || outOfBounds(qx, qz) || (qy < gq + 0.25 && p.y - terrainH(p.x, p.z) < 1.5)) break;
        dist = t;
      }
      this._cd = this._cd === undefined ? dist : dist < this._cd ? dist : this._cd + (dist - this._cd) * Math.min(1, dt * 5);
      let cy = ty + 0.3 + dy * this._cd;
      const cx = ox + dx * this._cd, cz = oz + dz * this._cd;
      // 屋内、门道内压低镜头，不穿梁顶
      if (Math.abs(cx - HOME.x) < HOME.hallW / 2 && Math.abs(cz - (HOME.z + HOME.hallZ)) < HOME.hallD / 2) cy = Math.min(cy, HOME.floorY + 3.3);
      if (Math.abs(cx - GATE.x) < GATE.halfX + 0.5 && Math.abs(cz) < GATE.pass && p.y < 6 * GATE.K) cy = Math.min(cy, 5.6 * GATE.K);
      // 屋内不穿顶棚、楼板
      cy = Math.min(cy, ceilAt(cx, cz, p.y) - 0.3, ceilAt(p.x, p.z, p.y) - 0.3);
      gx = cx;
      gy = Math.max(cy, (p.swim ? RV.WATER_Y : p.y - terrainH(p.x, p.z) > 1.5 ? p.y : groundY(cx, cz)) + 0.3, terrainH(cx, cz) + 0.3);
      gz = cz;
    } else {
      gx = p.x;
      gy = p.y + 1.62 + bob;
      gz = p.z;
    }
    _p1.set(gx, gy, gz);
    _q1.setFromEuler(_eu.set(p.pitch, p.yaw, 0, 'YXZ'));
    let fov = this._fov || 62;
    // 交谈：越过主角的肩头看对方，两人都在画里；说完推回原位
    const te = this._talkCam(dt);
    if (te > 0) {
      const T = this._tp;
      _p1.lerp(T.C, te);
      _q1.slerp(_q2.setFromRotationMatrix(_mt.lookAt(T.C, T.L, _UP)), te);
      fov = mixN(fov, 44, te);
    }
    this.talkE = te;
    this.talkD = te > 0 ? this._tp.d : 0;
    // 入画：自身后高处摇下来
    if (this._crane) {
      const c = this._crane;
      if (!c.pos) {
        if (ceilAt(p.x, p.z, p.y) < 1e8) this._crane = null; // 人在屋里：不摇
        else {
          const bx = Math.sin(p.yaw), bz = Math.cos(p.yaw);
          for (const [D, H] of [[36, 26], [24, 17], [13, 9.5]]) {
            const S = new THREE.Vector3(p.x + bx * D + rx * D * 0.22, p.y + H, p.z + bz * D + rz * D * 0.22);
            let ok = S.y > terrainH(S.x, S.z) + 2;
            // 这条下降的路上不能有屋宇、城墙挡着
            for (let i = 0; ok && i <= 16; i++) {
              const t = i / 16;
              if (colliders.hit(mixN(S.x, gx, t), mixN(S.z, gz, t), 0.6, mixN(S.y, gy, t) - 0.6, 1.2)) ok = false;
            }
            if (ok) {
              c.pos = S;
              c.q = new THREE.Quaternion().setFromRotationMatrix(_mt.lookAt(S, _p1.clone().set(p.x - bx * 6, p.y + 1.2, p.z - bz * 6), _UP));
              break;
            }
          }
          if (!c.pos) this._crane = null;
        }
      }
      if (this._crane) {
        c.t += dt * (f || r ? 2.4 : 1); // 等不及就推一下摇杆，快些落下来
        const u = clamp(c.t / c.T, 0, 1), e = u * u * u * (u * (u * 6 - 15) + 10);
        _p1.set(mixN(c.pos.x, _p1.x, e), mixN(c.pos.y, _p1.y, e), mixN(c.pos.z, _p1.z, e));
        _q1.copy(_q2.copy(c.q).slerp(_q1, e));
        fov = mixN(40, fov, e);
        this.wide = 1 - e;
        if (u >= 1) this._crane = null;
      }
    }
    if (!this._crane) this.wide = 0;
    cam.position.copy(_p1);
    cam.quaternion.copy(_q1);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.updateMatrixWorld();

    // 行人与可交谈者
    this.crowd.update(dt, p.x, p.z, p.vx, p.vz);
    let focus = null, fd = 3.7;
    for (const [id, n] of this.npcs) {
      const dx = p.x - n.spec.x, dz = p.z - n.spec.z, d = Math.hypot(dx, dz);
      n.t += dt;
      // 见人走近：头先转过来，身子慢半拍跟上；人走远了便回身，自己随意张望
      const near = d < 6.5, want = near ? Math.atan2(dx, dz) : n.spec.yaw;
      n.yaw += angDiff(want, n.yaw) * Math.min(1, dt * 1.8);
      n.grp.rotation.y = n.yaw;
      const hd = n.grp.userData.head;
      if (hd) poseHead(hd, near ? clamp(angDiff(want, n.yaw), -1.1, 1.1) : null, dt);
      if (d < fd) {
        const ang = Math.abs(angDiff(Math.atan2(-dx, -dz), Math.atan2(fx, fz)));
        if (ang < 0.95 || d < 1.6) {
          fd = d;
          focus = id;
        }
      }
    }
    this.focus = free && !this.decorMode ? focus : null;
    this.focusObj = !this.focus && free && !this.decorMode && this.inHome() ? this.decor.pick(cam) : null;
    if (this.focus) {
      const n = this.npcs.get(this.focus).spec;
      ui.setPrompt('E', `${n.name}`, n.title);
    } else if (this.focusObj) ui.setPrompt('E', DECOR[this.focusObj.rec.id].name, '陈设');
    else if (free && !this.decorMode && this.inHome() && s.decor.length) ui.setPrompt('B', '布置陈设', this.unplaced().length ? `待摆 ${this.unplaced().length} 件` : '调整摆设');
    else ui.setPrompt(null);

    // 任务推进
    if (s.quest === 0 && this.inHome()) {
      ui.toast('到家了');
      this.setQuest(1);
    }
    if (s.quest === 2 && this.carried() > 0) this.setQuest(3);
    if (s.quest === 4 && s.decor.length) this.setQuest(5);
    if (s.quest === 5 && s.decor.some((d) => d.placed)) this.setQuest(6);

    // 地名
    const dn = districtAt(p.x, p.z);
    if (dn !== this.district) {
      this.district = dn;
      ui.banner(dn, DISTRICT_SUB[dn] || '');
    }

    // 布置模式
    if (this.decorMode) {
      if (!this.inHome()) this.exitDecor();
      else {
        this.decor.aim(cam, p.yaw);
        const list = this.unplaced();
        const pick = this.decor.pick(cam);
        ui.decorBar({
          chips: list.map((d, i) => ({ name: DECOR[d.id].name, sel: i === this.decorSel })),
          keys: `滚轮 换物　·　R 旋转　·　左键 / E 摆放${pick ? `　·　F 收起「${DECOR[pick.rec.id].name}」` : '　·　F 收起所指之物'}　·　B 完成`,
        });
      }
    }

    // 指引
    this.routeT -= dt;
    if (this.routeT <= 0) {
      this.routeT = 0.35;
      this.updateRoute();
    }
    ui.drawMini({ x: p.x, z: p.z, yaw: p.yaw, route: this.routePts, target: this.target, home: poi('home') });
    this.updateMarker();
    this.updateBubbles(dt);

    // 声音
    this.sound.tick(clamp(1 - mainRiverSD(p.x, p.z) / 30, 0, 1));
    this.saveT += dt;
    if (this.saveT > 20) {
      this.saveT = 0;
      this.save();
    }
  }

  project(x, y, z) {
    _v.set(x, y, z).project(this.camera);
    const behind = _v.z > 1;
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, behind };
  }
  updateMarker() {
    const t = this.target, ui = this.ui;
    if (!t || !this.routePts || ui.modal || this.decorMode) return ui.marker(null);
    const p = this.player;
    const direct = Math.hypot(t.x - p.x, t.z - p.z);
    if (direct < 3.2) return ui.marker(null);
    // 远时指向下一处转折，近时指向目标本身
    let wp = [t.x, t.z], h = 2.5;
    if (direct > 24) {
      for (const q of this.routePts) {
        if (Math.hypot(q[0] - p.x, q[1] - p.z) > 8) {
          wp = q;
          h = 1.9;
          break;
        }
      }
    }
    const s = this.project(wp[0], groundY(wp[0], wp[1]) + h, wp[1]);
    const mx = 70, my = 90, W = innerWidth, H = innerHeight;
    let x = s.x, y = s.y;
    if (s.behind) {
      x = W - x;
      y = H - my;
    }
    x = clamp(x, mx, W - mx);
    y = clamp(y, my, H - my);
    ui.marker({ x, y, ch: t.ch, text: `${t.name} · 约${Math.max(1, Math.round(this.routeLen / 1.5))}步` });
  }
  updateBubbles(dt) {
    const p = this.player, out = [];
    if (!this.ui.modal) {
      this.world.criers.forEach((c, i) => {
        this.crierT[i] += dt;
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d > (c.r || 17) || out.length >= 3) return;
        const cyc = this.crierT[i] % 7.5;
        if (cyc > 3.6) return;
        const line = c.lines[Math.floor(this.crierT[i] / 7.5) % c.lines.length];
        const s = this.project(c.x, (c.y ?? groundY(c.x, c.z)) + 2.25, c.z);
        if (s.behind || s.x < 40 || s.x > innerWidth - 40 || s.y < 60) return;
        const fadeIn = Math.min(1, cyc / 0.4), fadeOut = Math.min(1, (3.6 - cyc) / 0.5);
        out.push({ x: s.x, y: s.y, text: line, a: Math.min(fadeIn, fadeOut) * clamp(1.4 - d / ((c.r || 17) * 0.82), 0.25, 0.95) });
      });
    }
    this.ui.bubbles(out);
  }
}

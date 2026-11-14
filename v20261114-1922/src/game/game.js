// 玩法主体：存档、行走、交谈、任务、贩货、添置与布置
import * as THREE from 'three';
import { CAPACITY, SELL_MARKUP, START_CAPITAL, GOODS, DECOR, QUESTS, TALK } from './data.js';
import { DecorSystem } from './decor.js';
import { makeFigure, makePlayerAvatar, Crowd, poseHead } from '../world/figures.js';
import { HOME, GATE, NODES, POIS, poi, route, nearestNode, groundY, blocked, inRailZone, surfaceAt, outOfBounds, districtAt, colliders, ceilAt } from '../world/layout.js';
import { mainRiverSD, riverSD, RV } from '../world/river.js';
import { Batch } from '../engine/batch.js';
import { RNG, mulberry32, clamp, angDiff } from '../util.js';

const SAVE_KEY = 'qingming.save.v1';
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
    scene.add(this.avatar);
    // 泅水时的涟漪
    this.ripples = [];
    {
      const rb = new Batch(), N = 30, P = [], I = [];
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        P.push(Math.cos(a) * 0.94, 0, Math.sin(a) * 0.94, Math.cos(a), 0, Math.sin(a));
        if (i < N) I.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 2, i * 2 + 1, i * 2 + 3);
      }
      rb.raw('flat', P, null, I, { color: [0.62, 0.68, 0.69], lw: 0, id: 5 / 255 });
      const geo = rb.build(world.mats)[0].geometry;
      for (let i = 0; i < 4; i++) {
        const m = new THREE.Mesh(geo, world.mats.flat);
        m.visible = false;
        m.layers.set(1);
        m.frustumCulled = false;
        scene.add(m);
        this.ripples.push({ m, t: 9 });
      }
      this.rippleT = 0;
    }
    this.keys = {};
    this.npcs = new Map();
    for (const spec of world.npcs) {
      const grp = makeFigure(world.mats, spec.look, { head: true });
      grp.position.set(spec.x, spec.y ?? groundY(spec.x, spec.z), spec.z);
      grp.rotation.y = spec.yaw;
      scene.add(grp);
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
  talk(id) {
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
      this.cine -= dt * 5.5;
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
      const want = running ? 67 : 62;
      if (Math.abs(cam.fov - want) > 0.05) {
        cam.fov += (want - cam.fov) * Math.min(1, dt * 4);
        cam.updateProjectionMatrix();
      }
    }
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
    const acc = Math.min(1, dt * (p.swim ? 4 : p.ground ? 11 : 3));
    p.vx += (tvx - p.vx) * acc;
    p.vz += (tvz - p.vz) * acc;
    const nx = p.x + p.vx * dt, nz = p.z + p.vz * dt;
    if (outOfBounds(nx, nz) && this.boundT <= 0 && (f || r)) {
      ui.toast('前路烟霭迷蒙——画卷至此而尽');
      this.boundT = 6;
    }
    this.boundT -= dt;
    if (!blocked(nx, p.z, 0.35, p.y)) p.x = nx;
    else p.vx = 0;
    if (!blocked(p.x, nz, 0.35, p.y)) p.z = nz;
    else p.vz = 0;
    // 也不从行人身上穿过去
    for (const w of this.crowd.walkers) {
      if (!w.grp.visible) continue;
      const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz);
      if (d < 0.52 && d > 1e-3 && Math.abs(p.y - groundY(w.x, w.z)) < 1.2) {
        const qx = w.x + (dx / d) * 0.52, qz = w.z + (dz / d) * 0.52;
        if (!blocked(qx, qz, 0.35, p.y)) {
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
    // 岸坡：近岸一米多水不深，踩得到底——下水是蹚下去的，上岸是踩着坡走上来的，不是从岸里“钻”出来
    if (surf.water) {
      const sdw = riverSD(p.x, p.z);
      if (sdw > -1.25) {
        surf.water = false;
        surf.y = (RV.WATER_Y - 0.4) * Math.max(0, -sdw / 1.25);
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
          p.y = surf.y;
          p.vy = 0;
          p.ground = true;
        }
      }
    }
    p.step += sp * dt * 1.9;
    const bob = p.ground ? Math.sin(p.step * Math.PI) * 0.028 * Math.min(1, sp / 4) : 0;

    // 主角小像：行走摆臂、跃起、泅水
    const av = this.avatar, ad = av.userData;
    if (this.view === 'tp') {
      if (sp > 0.4) p.face += angDiff(Math.atan2(p.vx, p.vz), p.face) * Math.min(1, dt * 10);
    } else p.face = p.yaw + Math.PI;
    av.position.set(p.x, p.y + bob * 0.6, p.z);
    av.rotation.y = p.face;
    // 步态另计相位：步频随速度略增，免得腿脚倒腾得太急
    if (p.ground && !p.swim && sp > 0.3) p.gait = (p.gait || 0) + dt * Math.PI * 2 * (0.9 + sp * 0.22);
    const amp = p.ground ? Math.min(1, sp / 2.2) : 0, runK = clamp((sp - 2.2) / 4.6, 0, 1);
    const sw = Math.sin(p.gait || 0), cw = Math.cos(p.gait || 0);
    if (!p.swim) av.position.y = p.y + Math.abs(cw) * 0.035 * amp * (1 + runK * 0.6);
    const kk = Math.min(1, dt * 16);
    const to = (o, ax, v) => { o.rotation[ax] += (v - o.rotation[ax]) * kk; };
    let tilt = 0, twist = 0, lean = 0, breath = 0, skirtZ = 1, skirtX = 0, tail = 0.06;
    if (p.swim) {
      // 泅水：两臂轮番前划，两腿上下打水
      tilt = 1.08;
      const a = Math.sin(p.swimT * 4.2), q = Math.sin(p.swimT * 7);
      to(ad.armL, 'x', -2.55 + a * 0.75);
      to(ad.armR, 'x', -2.55 - a * 0.75);
      to(ad.armL, 'z', -0.3);
      to(ad.armR, 'z', 0.3);
      to(ad.foreL, 'x', -0.2 - Math.max(0, a) * 0.5);
      to(ad.foreR, 'x', -0.2 - Math.max(0, -a) * 0.5);
      to(ad.legL, 'x', q * 0.3);
      to(ad.legR, 'x', -q * 0.3);
      to(ad.shinL, 'x', 0.2 + Math.max(0, -q) * 0.4);
      to(ad.shinR, 'x', 0.2 + Math.max(0, q) * 0.4);
      skirtZ = 1.2;
      tail = 0.5;
    } else if (!p.ground) {
      // 跃起：一腿提膝，两臂张开
      const up = p.vy > 0 ? 1 : 0.4;
      to(ad.armL, 'x', -0.5 - up * 0.5);
      to(ad.armR, 'x', -0.3 - up * 0.3);
      to(ad.armL, 'z', -0.55);
      to(ad.armR, 'z', 0.55);
      to(ad.foreL, 'x', -0.6);
      to(ad.foreR, 'x', -0.5);
      to(ad.legL, 'x', -0.55 * up);
      to(ad.shinL, 'x', 1.0 * up);
      to(ad.legR, 'x', 0.3);
      to(ad.shinR, 'x', 0.45);
      skirtZ = 1.55;
      tail = p.vy > 0 ? -0.3 : 0.9;
      tilt = 0.06;
    } else {
      // 行走 / 疾行：腿前后摆，回摆的那条腿屈膝；臂与腿反向，跑起来肘弯得更深
      const A = (0.34 + 0.3 * runK) * amp, B = (0.36 + 0.5 * runK) * amp;
      this._idleT = (this._idleT || 0) + dt;
      const breathe = Math.sin(this._idleT * 1.5) * 0.02 * (1 - amp);
      to(ad.legL, 'x', -sw * A);
      to(ad.legR, 'x', sw * A);
      to(ad.shinL, 'x', (Math.max(0, cw) * (0.55 + 0.6 * runK) + 0.06) * amp);
      to(ad.shinR, 'x', (Math.max(0, -cw) * (0.55 + 0.6 * runK) + 0.06) * amp);
      to(ad.armL, 'x', sw * B + breathe);
      to(ad.armR, 'x', -sw * B + breathe);
      to(ad.armL, 'z', -0.1 - runK * 0.1);
      to(ad.armR, 'z', 0.1 + runK * 0.1);
      to(ad.foreL, 'x', -(0.12 + runK * 0.9 * amp + Math.max(0, -sw) * 0.25 * amp));
      to(ad.foreR, 'x', -(0.12 + runK * 0.9 * amp + Math.max(0, sw) * 0.25 * amp));
      tilt = (0.02 + runK * 0.15) * amp;
      twist = sw * 0.07 * amp + Math.sin(this._idleT * 0.37) * 0.035 * (1 - amp);
      lean = Math.sin(this._idleT * 0.46) * 0.012 * (1 - amp);
      breath = Math.sin(this._idleT * 1.5) * 0.003 * (1 - amp);
      skirtZ = 1 + Math.abs(sw) * (0.2 + 0.8 * runK) * amp;
      skirtX = (runK * 0.1 + 0.02) * amp;
      tail = 0.06 + runK * 0.55 * amp + Math.sin((p.gait || 0) * 2) * 0.05 * amp;
    }
    to(ad.pivot, 'y', twist);
    to(ad.pivot, 'z', lean);
    ad.upper.scale.y = 1 + breath;
    to(ad.skirt, 'x', skirtX);
    to(ad.tails, 'x', tail);
    ad.skirt.scale.z += (skirtZ - ad.skirt.scale.z) * kk;
    ad.pivot.rotation.x += (tilt - ad.pivot.rotation.x) * Math.min(1, dt * 7);
    // 第一人称时小像只留影子（第 2 层：只投影不入画）
    const lay = this.view === 'tp' && !(this._cd < 0.9) ? 0 : 2;
    if (this._avLayer !== lay) {
      this._avLayer = lay;
      av.traverse((o) => o.layers.set(lay));
    }
    // 涟漪
    this.rippleT -= dt;
    if (p.swim && this.rippleT <= 0) {
      this.rippleT = sp > 0.5 ? 0.45 : 1.1;
      const rp = this.ripples.reduce((a, c) => (c.t > a.t ? c : a));
      rp.t = 0;
      rp.m.position.set(p.x, RV.WATER_Y + 0.02, p.z);
    }
    for (const rp of this.ripples) {
      rp.t += dt;
      rp.m.visible = rp.t < 2;
      if (rp.m.visible) rp.m.scale.setScalar(0.5 + rp.t * 1.5);
    }

    // 镜头
    if (this.view === 'tp') {
      // 跟随点略带迟滞，转身起步更柔和
      if (!this._ct || Math.hypot(this._ct.x - p.x, this._ct.z - p.z) > 6) this._ct = { x: p.x, y: p.y, z: p.z };
      const kf = Math.min(1, dt * 9);
      this._ct.x += (p.x - this._ct.x) * kf;
      this._ct.z += (p.z - this._ct.z) * kf;
      this._ct.y += (p.y - this._ct.y) * Math.min(1, dt * 6);
      const cp = Math.cos(p.pitch), ty = this._ct.y + (p.swim ? 1.75 : 1.55);
      const dx = Math.sin(p.yaw) * cp, dy = -Math.sin(p.pitch), dz = Math.cos(p.yaw) * cp; // 自目标指向镜头
      let dist = 0.5;
      // 沿途若被墙挡住，就把镜头拉近
      for (let t = 0.5; t <= this.camDist; t += 0.25) {
        const qx = this._ct.x + dx * t, qz = this._ct.z + dz * t, qy = ty + 0.3 + dy * t;
        if (colliders.hit(qx, qz, 0.3, qy - 0.3, 0.5) || outOfBounds(qx, qz) || (qy < groundY(qx, qz) + 0.25 && p.y < 1.5)) break;
        dist = t;
      }
      this._cd = this._cd === undefined ? dist : dist < this._cd ? dist : this._cd + (dist - this._cd) * Math.min(1, dt * 5);
      let cy = ty + 0.3 + dy * this._cd;
      const cx = this._ct.x + dx * this._cd, cz = this._ct.z + dz * this._cd;
      // 屋内、门道内压低镜头，不穿梁顶
      if (Math.abs(cx - HOME.x) < HOME.hallW / 2 && Math.abs(cz - (HOME.z + HOME.hallZ)) < HOME.hallD / 2) cy = Math.min(cy, HOME.floorY + 3.3);
      if (Math.abs(cx - GATE.x) < GATE.halfX + 0.5 && Math.abs(cz) < GATE.pass && p.y < 6 * GATE.K) cy = Math.min(cy, 5.6 * GATE.K);
      // 屋内不穿顶棚、楼板
      cy = Math.min(cy, ceilAt(cx, cz, p.y) - 0.3, ceilAt(p.x, p.z, p.y) - 0.3);
      cam.position.set(cx, Math.max(cy, (p.swim ? RV.WATER_Y : p.y > 1.5 ? p.y : groundY(cx, cz)) + 0.3), cz);
      cam.rotation.set(p.pitch, p.yaw, 0);
    } else {
      cam.position.set(p.x, p.y + 1.62 + bob, p.z);
      cam.rotation.set(p.pitch, p.yaw, 0);
    }
    cam.updateMatrixWorld();

    // 行人与可交谈者
    this.crowd.update(dt, p.x, p.z);
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
        if (d > 17 || out.length >= 3) return;
        const cyc = this.crierT[i] % 7.5;
        if (cyc > 3.6) return;
        const line = c.lines[Math.floor(this.crierT[i] / 7.5) % c.lines.length];
        const s = this.project(c.x, groundY(c.x, c.z) + 2.25, c.z);
        if (s.behind || s.x < 40 || s.x > innerWidth - 40 || s.y < 60) return;
        const fadeIn = Math.min(1, cyc / 0.4), fadeOut = Math.min(1, (3.6 - cyc) / 0.5);
        out.push({ x: s.x, y: s.y, text: line, a: Math.min(fadeIn, fadeOut) * clamp(1.4 - d / 14, 0.25, 0.95) });
      });
    }
    this.ui.bubbles(out);
  }
}

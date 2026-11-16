// 界面：卷首、择角、引子、HUD（任务/小地图/钱囊/提示）、对白、买卖与铺子、行囊、画卷大地图、暂停
import { renderWorldMap, MAPRECT } from './mapdraw.js';
import { installInkArt } from './inkart.js';
import { POIS, NODES, worldToScrollU } from '../world/layout.js';
import { ROLES, KEY_HINTS } from '../game/data.js';

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// 题跋：行到一处，录一段孟元老《东京梦华录》
const COLOPHON_SRC = { 杏花村: '杜牧《清明》' };
const COLOPHON = {
  郊野: ['四野如市，往往就芳树之下，', '或园囿之间，罗列杯盘，互相劝酬。'],
  杏花村: ['清明时节雨纷纷，路上行人欲断魂。', '借问酒家何处有？牧童遥指杏花村。'],
  隋堤烟柳: ['都城之歌儿舞女，遍满园亭，', '抵暮而归。'],
  汴河码头: ['汴河自西京洛口分水入京城，', '东去至泗州入淮，运东南之粮，', '凡东南方物，自此入京城。'],
  虹桥: ['其桥无柱，皆以巨木虚架，', '饰以丹艧，宛如飞虹。'],
  城外街市: ['举目则青楼画阁，绣户珠帘；', '雕车竞驻于天街，宝马争驰于御路。'],
  城门: ['城壕曰护龙河，阔十余丈，', '壕之内外，皆植杨柳。'],
  城内街市: ['金翠耀目，罗绮飘香；', '新声巧笑于柳陌花衢，', '按管调弦于茶坊酒肆。'],
  甜水巷: ['太平日久，人物繁阜；', '时节相次，各有观赏。'],
  沈宅: ['太平日久，人物繁阜；', '时节相次，各有观赏。'],
};

export class UI {
  constructor(root, MAP) {
    this.root = root;
    this.MAP = MAP;
    root.innerHTML = `
      <div id="hud" class="hidden">
        <div id="banner"></div>
        <div id="colophon"><div class="cols"></div><div class="seal"><span>夢</span><span>華</span></div></div>
        <div id="bubbles"></div>
        <div id="marker" class="hidden"><div class="seal m-seal"><span></span></div><div class="m-text"></div></div>
        <div id="quest"><div class="seal">任</div><div><div id="q-title"></div><div id="q-desc"></div><div id="q-extra"></div></div></div>
        <div id="right"><div id="mini-wrap" data-k="KeyM"><canvas id="minimap"></canvas><div id="mini-north" class="seal">北</div><div id="mini-key">M · 展开画卷</div></div>
        <div id="purse"><span class="coin"></span><b id="money">0</b>文<span class="sep">｜</span>行囊 <span id="load">0/8</span></div></div>
        <div id="tbtns"><button class="tbtn" data-k="KeyV">视</button><button class="tbtn" data-k="KeyT">时</button><button class="tbtn" data-k="KeyM">卷</button><button class="tbtn" data-k="Tab">囊</button><button class="tbtn" data-k="Escape">歇</button></div>
        <button id="tb-jump" class="tbtn" data-k="Space">跃</button>
        <button id="tb-act" class="tbtn hidden" data-k="KeyE">谈</button>
        <div id="joy" class="hidden"><div id="joy-knob"></div></div>
        <div id="joy-hint">行走</div>
        <div id="rotate-hint" class="hidden">横屏游玩，画面更开阔</div>
        <div id="cross"></div>
        <div id="prompt" class="hidden"></div>
        <div id="toasts"></div>
        <div id="lockhint" class="hidden">点击画面以环顾四周</div>
        <div id="decorbar" class="paper hidden"></div>
        <div id="hints">${KEY_HINTS}</div>
      </div>
      <div id="dialogue" class="paper hidden"><div class="seal who"></div><div class="txt"></div><div class="next">E / 空格 / 点击 继续</div></div>
      <div id="pie" class="hidden"></div>
      <div id="panel-wrap" class="hidden"><div class="panel paper"></div></div>
      <div id="bigmap" class="hidden"></div>
      <div id="pause" class="hidden"></div>
      <div id="title" class="hidden"></div>
      <div id="roles" class="hidden"></div>
      <div id="intro" class="hidden"></div>
      <div id="fade"></div>`;
    this.$ = (s) => root.querySelector(s);
    installInkArt(root);
    this.hudEl = this.$('#hud');
    this.touch = false;
    this.scale = 1;
    this.vw = innerWidth;
    this.vh = innerHeight;
    this.onKey = null;
    // 带 data-k 的元素（提示条、小地图、触屏按钮）点一下即相当于按键
    root.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]');
      if (k && this.onKey) this.onKey(k.dataset.k);
    });
    this.layout();
    // 小地图
    this.mini = this.$('#minimap');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.mini.width = this.mini.height = Math.round(208 * this.dpr);
    this.miniCtx = this.mini.getContext('2d');
    this.mapScale = 3;
    this.mapCanvas = renderWorldMap(MAP, this.mapScale);
    this.bigCanvas = null;
    this.dialogueOpen = false;
    this.panelOpen = false;
    this.mapOpen = false;
    this.pauseOpen = false;
    this.pieOpen = false;
    this.bubbleEls = [];
    this._bannerT = 0;
    // 原画：故宫本全卷扫描，切作十二段（assets/scroll）
    this.scroll = null;
    this.paintingOk = false;
    fetch('./assets/scroll/scroll.json')
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        this.scroll = m;
        this.paintingOk = !!m;
      })
      .catch(() => {});
    this.$('#dialogue').addEventListener('click', () => this.advanceDialogue());
  }
  get modal() {
    return this.dialogueOpen || this.panelOpen || this.mapOpen || this.pauseOpen || this.pieOpen;
  }

  // ── 适配：整套界面按屏幕大小等比缩放（设计基准 1280×720） ──
  layout() {
    const W = innerWidth, H = innerHeight, portrait = H > W;
    let s = Math.max(this.touch ? 0.7 : 0.6, Math.min(1.3, Math.min(W / 1280, H / 720)));
    if (portrait) s = Math.max(0.62, Math.min(1, W / 600));
    this.scale = s;
    this.vw = W / s;
    this.vh = H / s;
    const st = this.root.style;
    st.width = this.vw + 'px';
    st.height = this.vh + 'px';
    st.transform = `scale(${s})`;
    st.setProperty('--vh', this.vh / 100 + 'px');
    st.setProperty('--vw', this.vw / 100 + 'px');
    this.root.classList.toggle('narrow', this.vw < 900);
    this.root.classList.toggle('short', this.vh < 640);
    const rh = this.$('#rotate-hint');
    if (this.touch && portrait && !this._rotShown) {
      this._rotShown = true;
      rh.classList.remove('hidden');
      setTimeout(() => rh.classList.add('hidden'), 5000);
    } else if (!portrait) rh.classList.add('hidden');
  }
  setTouch(v) {
    if (this.touch === v) return;
    this.touch = v;
    this.root.classList.toggle('touch', v);
    this.layout();
  }
  joy(j) {
    const el = this.$('#joy');
    if (!j) return el.classList.add('hidden');
    el.classList.remove('hidden');
    this.$('#joy-hint').classList.add('hidden');
    const s = this.scale;
    el.style.left = j.ox / s + 'px';
    el.style.top = j.oy / s + 'px';
    this.$('#joy-knob').style.transform = `translate(${j.dx / s}px, ${j.dy / s}px)`;
  }

  // ── 过场 ──
  loaded() {
    const l = document.getElementById('loading');
    if (!l) return;
    l.classList.add('gone');
    setTimeout(() => l.remove(), 900);
  }
  fade(on) {
    this.$('#fade').classList.toggle('on', on);
    return new Promise((r) => setTimeout(r, 820));
  }

  // ── 卷首 ──
  showTitle({ hasSave, onNew, onContinue, muted, onMute }) {
    const t = this.$('#title');
    t.classList.remove('hidden');
    t.innerHTML = `<div class="veil"></div>
      <div class="name">清明上河圖<div class="seal stamp"><span>入</span><span>畫</span></div></div>
      <div class="sub">北宋 張擇端 原作　·　入畫漫遊</div>
      <div class="menu">
        ${hasSave ? '<button class="btn red" data-a="cont">續卷 · 接着游</button>' : ''}
        <button class="btn ${hasSave ? '' : 'red'}" data-a="new">展卷 · 新游</button>
      </div>
      <div class="foot">汴京梦华　一卷之中　有屋有船有人家</div>
      <button id="mute-btn" data-a="mute">丝竹：${muted ? '已静' : '奏着'}</button>`;
    t.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'new') onNew();
      if (a === 'cont') onContinue();
      if (a === 'mute') e.target.textContent = `丝竹：${onMute() ? '已静' : '奏着'}`;
    };
  }
  hideTitle() {
    this.$('#title').classList.add('hidden');
  }
  showRoles(onPick) {
    const r = this.$('#roles');
    r.classList.remove('hidden');
    r.innerHTML = `<div class="box paper"><h2>入画为谁</h2><div class="tip">画中八百余人，各有营生。此番先做一回汴京商贾，其余角色日后陆续开卷。</div>
      <div class="cards">${ROLES.map((o) => `<div class="role ${o.open ? 'open' : 'locked'}" data-id="${o.id}">
        <div class="seal lock">${o.open ? '可入' : '未启'}</div><div class="rn">${o.name}</div><div class="rw">${o.who}</div><div class="rd">${o.desc}</div></div>`).join('')}</div></div>`;
    r.onclick = (e) => {
      const c = e.target.closest('.role.open');
      if (c) onPick(c.dataset.id);
    };
  }
  hideRoles() {
    this.$('#roles').classList.add('hidden');
  }
  showIntro(lines, onDone) {
    const el = this.$('#intro');
    el.classList.remove('hidden');
    el.innerHTML = `<div class="box paper">${lines.map((l) => `<p>${esc(l)}</p>`).join('')}<button class="btn red">入　画</button></div>`;
    const ps = [...el.querySelectorAll('p')], btn = el.querySelector('.btn');
    ps.forEach((p, i) => setTimeout(() => p.classList.add('show'), 250 + i * 1500));
    setTimeout(() => btn.classList.add('show'), 250 + ps.length * 1500);
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      onDone();
    };
    btn.onclick = go;
    this._introGo = go;
  }
  hideIntro() {
    this.$('#intro').classList.add('hidden');
    this._introGo = null;
  }

  // ── HUD ──
  showHud(v) {
    this.hudEl.classList.toggle('hidden', !v);
    if (v) {
      const h = this.$('#hints');
      h.classList.remove('dim');
      clearTimeout(this._hintT);
      this._hintT = setTimeout(() => h.classList.add('dim'), 16000);
    }
  }
  setQuest(q, extra = '') {
    this.$('#q-title').textContent = q.title;
    this.$('#q-desc').textContent = q.desc;
    this.$('#q-extra').textContent = extra;
  }
  setMoney(v) {
    this.$('#money').textContent = v;
  }
  setLoad(n, cap) {
    this.$('#load').textContent = `${n}/${cap}`;
  }
  setPrompt(key, text, sub) {
    const p = this.$('#prompt'), act = this.$('#tb-act');
    if (!key) {
      act.classList.add('hidden');
      return p.classList.add('hidden');
    }
    p.dataset.k = act.dataset.k = key === 'B' ? 'KeyB' : 'KeyE';
    act.textContent = key === 'B' ? '置' : '谈';
    act.classList.remove('hidden');
    const html = `<span class="key">${key}</span><span>${esc(text)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}`;
    if (p._h !== html) {
      p.innerHTML = html;
      p._h = html;
    }
    p.classList.remove('hidden');
  }
  toast(text, cls = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.textContent = text;
    const box = this.$('#toasts');
    box.appendChild(t);
    while (box.children.length > 4) box.firstChild.remove();
    setTimeout(() => t.remove(), 3500);
  }
  banner(name, sub = '') {
    const b = this.$('#banner');
    b.innerHTML = `${esc(name)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    b.classList.add('show');
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => b.classList.remove('show'), 2800);
    this.colophon(name);
  }
  // 地名淡去之后，题跋慢慢显出来
  colophon(name) {
    const el = this.$('#colophon'), lines = COLOPHON[name];
    el.classList.remove('show');
    clearTimeout(this._colT);
    if (!lines) return;
    this._colT = setTimeout(() => {
      el.querySelector('.cols').innerHTML = lines.map(esc).join('<br>') + `<br><small>${COLOPHON_SRC[name] || '孟元老《东京梦华录》'}</small>`;
      el.classList.add('show');
    }, 3200);
  }
  lockHint(v, drag) {
    const el = this.$('#lockhint');
    el.classList.toggle('hidden', !v);
    const t = drag ? '按住鼠标左键拖动以环顾四周' : '点击画面以环顾四周';
    if (v && el.textContent !== t) el.textContent = t;
  }
  marker(m) {
    const el = this.$('#marker');
    if (!m) return el.classList.add('hidden');
    el.classList.remove('hidden');
    el.style.transform = `translate(${m.x / this.scale}px, ${m.y / this.scale}px) translate(-50%, -50%)`;
    el.querySelector('.m-seal span').textContent = m.ch;
    el.querySelector('.m-text').textContent = m.text;
  }
  bubbles(list) {
    const box = this.$('#bubbles');
    while (this.bubbleEls.length < list.length) {
      const d = document.createElement('div');
      d.className = 'bubble';
      box.appendChild(d);
      this.bubbleEls.push(d);
    }
    this.bubbleEls.forEach((d, i) => {
      const it = list[i];
      if (!it) {
        d.style.opacity = 0;
        return;
      }
      if (d._t !== it.text) {
        d.textContent = it.text;
        d._t = it.text;
      }
      d.style.opacity = it.a;
      d.style.transform = `translate(${it.x / this.scale}px, ${it.y / this.scale}px) translate(-50%, -100%)`;
    });
  }
  decorBar(cfg) {
    const el = this.$('#decorbar');
    if (!cfg) return el.classList.add('hidden');
    el.classList.remove('hidden');
    const html = `<div class="dt">布置家宅</div><div class="chips">${cfg.chips.length ? cfg.chips.map((c) => `<span class="chip ${c.sel ? 'sel' : ''}">${esc(c.name)}</span>`).join('') : '<span class="chip">手头没有待摆放的陈设</span>'}</div>${this.touch ? '<div class="dbtns"><button class="btn small" data-k="wheel">换一件</button><button class="btn small" data-k="KeyR">旋转</button><button class="btn small red" data-k="KeyE">摆放</button><button class="btn small" data-k="KeyF">收起所指</button><button class="btn small" data-k="KeyB">完成</button></div>' : ''}<div class="dk">${cfg.keys}</div>`;
    if (el._h !== html) {
      el.innerHTML = html;
      el._h = html;
    }
  }

  // ── 小地图 ──
  drawMini(g) {
    const ctx = this.miniCtx, S = this.mini.width, R = S / 2, scale = R / 62, ms = this.mapScale;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R, 0, 7);
    ctx.clip();
    ctx.fillStyle = '#e6d8b6';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(R, R);
    ctx.rotate(g.yaw);
    ctx.save();
    ctx.scale(scale / ms, scale / ms);
    ctx.drawImage(this.mapCanvas, -(g.x - MAPRECT.minX) * ms, -(g.z - MAPRECT.minZ) * ms);
    ctx.restore();
    ctx.scale(scale, scale);
    // 朱线指引
    if (g.route && g.route.length) {
      ctx.strokeStyle = '#b23a2c';
      ctx.lineWidth = 2.6 / scale * this.dpr;
      ctx.setLineDash([5 / scale * this.dpr, 4 / scale * this.dpr]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (const p of g.route) ctx.lineTo(p[0] - g.x, p[1] - g.z);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 自家
    if (g.home) {
      ctx.fillStyle = '#2a211b';
      ctx.beginPath();
      ctx.arc(g.home.x - g.x, g.home.z - g.z, 3.2 / scale * this.dpr, 0, 7);
      ctx.fill();
    }
    ctx.restore();
    // 目标标记（圈内画印，圈外画箭头）
    const c = Math.cos(g.yaw), s = Math.sin(g.yaw);
    if (g.target) {
      const dx = (g.target.x - g.x) * scale, dz = (g.target.z - g.z) * scale;
      let sx = dx * c - dz * s, sy = dx * s + dz * c;
      const d = Math.hypot(sx, sy), lim = R - 15 * this.dpr;
      ctx.fillStyle = '#b23a2c';
      if (d > lim) {
        sx *= lim / d;
        sy *= lim / d;
        const a = Math.atan2(sy, sx);
        ctx.save();
        ctx.translate(R + sx, R + sy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(11 * this.dpr, 0);
        ctx.lineTo(-5 * this.dpr, -8 * this.dpr);
        ctx.lineTo(-5 * this.dpr, 8 * this.dpr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        const q = 8.5 * this.dpr;
        ctx.save();
        ctx.translate(R + sx, R + sy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-q, -q, 2 * q, 2 * q);
        ctx.restore();
        ctx.fillStyle = '#f6e9d2';
        ctx.font = `${12 * this.dpr}px "QM Kai","STKaiti","KaiTi",serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(g.target.ch, R + sx, R + sy + this.dpr);
      }
    }
    // 自身
    ctx.save();
    ctx.translate(R, R);
    ctx.fillStyle = '#2a211b';
    ctx.strokeStyle = '#f6e9d2';
    ctx.lineWidth = 2 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(0, -10 * this.dpr);
    ctx.lineTo(7 * this.dpr, 8 * this.dpr);
    ctx.lineTo(0, 4 * this.dpr);
    ctx.lineTo(-7 * this.dpr, 8 * this.dpr);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
    // “北”字印
    const n = this.$('#mini-north');
    const rr = (this.touch ? 82 : 104) - 13;
    n.style.transform = `translate(${s * rr}px, ${-c * rr}px)`;
  }

  // ── 对白 ──
  playDialogue(lines, { onLine, onDone } = {}) {
    this.dlg = { lines, i: -1, onLine, onDone, shown: 0, full: '' };
    this.dialogueOpen = true;
    this.$('#dialogue').classList.remove('hidden');
    this._nextLine();
  }
  _nextLine() {
    const d = this.dlg;
    d.i++;
    if (d.i >= d.lines.length) {
      this.dialogueOpen = false;
      this.$('#dialogue').classList.add('hidden');
      const cb = d.onDone;
      this.dlg = null;
      if (cb) cb();
      return;
    }
    const l = d.lines[d.i];
    const who = this.$('#dialogue .who');
    who.textContent = l.who;
    who.classList.toggle('me', l.who === '你');
    d.full = l.text;
    d.shown = 0;
    d.gift = l.give ? `　〔得钱 ${l.give} 文〕` : '';
    if (d.onLine) d.onLine(l);
    this._renderLine();
  }
  _renderLine() {
    const d = this.dlg;
    const done = d.shown >= d.full.length;
    this.$('#dialogue .txt').innerHTML = esc(d.full.slice(0, Math.floor(d.shown))) + (done && d.gift ? `<span class="gift">${d.gift}</span>` : '');
  }
  updateDialogue(dt) {
    const d = this.dlg;
    if (!d || d.shown >= d.full.length) return;
    d.shown = Math.min(d.full.length, d.shown + dt * 42);
    this._renderLine();
  }
  advanceDialogue() {
    const d = this.dlg;
    if (!d) return;
    if (d.shown < d.full.length) {
      d.shown = d.full.length;
      this._renderLine();
    } else this._nextLine();
  }

  // ── 环形互动菜单：对着人或物，选一件要做的事 ──
  openPie(cfg, onPick, onClose) {
    this.pieOpen = true;
    this._pie = { cfg, onPick, onClose };
    const el = this.$('#pie'), n = cfg.options.length;
    el.classList.remove('hidden');
    const opts = cfg.options
      .map((o, i) => {
        const a = -Math.PI / 2 + (i / n) * Math.PI * 2 + (n === 2 ? Math.PI / 2 : 0);
        const x = Math.cos(a) * 190, y = Math.sin(a) * 128;
        return `<div class="line" style="width:${Math.hypot(x, y) - 58}px;transform:rotate(${Math.atan2(y, x)}rad) translateX(58px)"></div>
          <button class="opt" style="left:${x}px;top:${y}px;animation-delay:${i * 45}ms" data-pick="${o.key}"><i>${i + 1}</i>${esc(o.label)}</button>`;
      })
      .join('');
    el.innerHTML = `<div class="hub">${opts}<div class="core"><div><b>${esc(cfg.title)}</b><small>${esc(cfg.sub || '')}</small></div></div></div>`;
    el.onclick = (e) => {
      const b = e.target.closest('[data-pick]');
      if (b) this.pickPie(b.dataset.pick);
      else if (!e.target.closest('.core')) this.closePie();
    };
  }
  _hidePie() {
    const p = this._pie;
    this._pie = null;
    this.pieOpen = false;
    this.$('#pie').classList.add('hidden');
    return p;
  }
  pickPie(key) {
    const p = this._hidePie();
    if (p) p.onPick(key);
  }
  pickPieIndex(i) {
    const o = this._pie && this._pie.cfg.options[i];
    if (o) this.pickPie(o.key);
  }
  closePie() {
    const p = this._hidePie();
    if (p && p.onClose) p.onClose();
  }

  // ── 通用面板 ──
  openPanel(render, onAct, onClose) {
    this.panelOpen = true;
    this._panel = { render, onAct, onClose };
    const wrap = this.$('#panel-wrap');
    wrap.classList.remove('hidden');
    wrap.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'close') return this.closePanel();
      onAct && onAct(b.dataset.act, b.dataset.id);
      this.refreshPanel();
    };
    this.refreshPanel();
  }
  refreshPanel() {
    if (!this._panel) return;
    const body = this.$('#panel-wrap .panel');
    const sc = body.querySelector('.body')?.scrollTop || 0;
    body.innerHTML = this._panel.render();
    const nb = body.querySelector('.body');
    if (nb) nb.scrollTop = sc;
  }
  closePanel() {
    if (!this._panel) return;
    const cb = this._panel.onClose;
    this._panel = null;
    this.panelOpen = false;
    this.$('#panel-wrap').classList.add('hidden');
    if (cb) cb();
  }

  // ── 暂停 ──
  showPause({ muted, onResume, onMute, onTitle, onReset }) {
    const canFull = this.touch && document.documentElement.requestFullscreen;
    this.pauseOpen = true;
    const p = this.$('#pause');
    p.classList.remove('hidden');
    const render = (m) => {
      p.innerHTML = `<div class="panel paper"><h2>暂　歇</h2>
        <div class="keys">${KEY_HINTS.split(' · ').join('<br>')}<br>布置时：滚轮换物 · R 旋转 · 左键摆放 · F 收起</div>
        <button class="btn red" data-a="resume">回到画中</button>
        <button class="btn" data-a="mute">${m ? '丝竹：已静' : '丝竹：奏着'}</button>
        ${canFull ? '<button class="btn" data-a="full">全屏 / 退出全屏</button>' : ''}
        <button class="btn" data-a="title">存档并回卷首</button>
        <button class="btn" data-a="reset">弃档重来</button></div>`;
    };
    render(muted);
    p.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'resume') onResume();
      if (a === 'mute') render(onMute());
      if (a === 'full') {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }
      if (a === 'title') onTitle();
      if (a === 'reset') {
        if (e.target.dataset.sure) onReset();
        else {
          e.target.dataset.sure = 1;
          e.target.textContent = '当真弃档？再点一次';
        }
      }
    };
  }
  hidePause() {
    this.pauseOpen = false;
    this.$('#pause').classList.add('hidden');
  }

  // ── 画卷大地图 ──
  openMap(g, onPick, onClose) {
    this.mapOpen = true;
    this.root.classList.add('mapopen'); // 展卷时把底下的罗盘、摇杆、按钮都收起来，免得透出来搅在一起
    this._mapClose = onClose;
    const el = this.$('#bigmap');
    el.classList.remove('hidden');
    let tab = this._mapTab || (this.paintingOk ? 'painting' : 'map');
    if (!this.bigCanvas) this.bigCanvas = renderWorldMap(this.MAP, 6);
    const render = () => {
      this._mapTab = tab;
      const isP = tab === 'painting';
      el.innerHTML = `<div class="bar"><h2>清明上河圖</h2>
          <div class="tabs"><button class="tab ${isP ? 'on' : ''}" data-tab="painting">原画</button><button class="tab ${isP ? '' : 'on'}" data-tab="map">舆图</button></div>
          <div class="info">${this.touch ? '左右拖动展卷　·　点榜题可设为指引' : '拖拽或滚轮横向展卷　·　点击榜题可设为指引　·　M / Esc 收卷'}</div>
          <button class="mclose" data-k="KeyM">收卷</button></div>
        <div class="rail"><div class="roller"></div><div class="sheet"></div><div class="roller"></div></div>
        <div class="legend"><span>朱框：画中原有　｜　虚框：此番入画所添　｜　朱底：当前去处</span><span>${isP ? '北宋 张择端《清明上河图》故宫博物院藏本 · 两端为题跋与裱边' : '舆图依画中世界实测绘成'}</span></div>`;
      const sheet = el.querySelector('.sheet'), rail = el.querySelector('.rail');
      let aspect;
      if (isP && this.paintingOk) {
        const strip = document.createElement('div');
        strip.className = 'strip';
        const set = this.touch ? 'b' : 'a';
        for (let i = 0; i < this.scroll.tiles; i++) {
          const im = new Image();
          im.decoding = 'async';
          im.draggable = false;
          im.src = `./assets/scroll/${set}${String(i).padStart(2, '0')}.jpg`;
          strip.appendChild(im);
        }
        sheet.appendChild(strip);
        aspect = this.scroll.aspect;
      } else if (isP) {
        aspect = 3.2;
        sheet.insertAdjacentHTML('beforeend', `<div class="missing">原画尚未载入。<br>未找到 <b>assets/scroll</b> 下的原画分段图；<br>眼下请先看「舆图」。</div>`);
      } else {
        sheet.appendChild(this.bigCanvas);
        aspect = this.bigCanvas.width / this.bigCanvas.height;
      }
      const hgt = this.vh * 0.62;
      sheet.style.width = hgt * aspect + 'px';
      // 画心只占整幅扫描的中段（两端是题跋与裱边）
      const U0 = 0.1045, U1 = 0.8705, inP = (u) => U0 + u * (U1 - U0);
      const pos = (x, z, p) => (isP ? [inP(p ? p.pu : worldToScrollU(x)), p ? p.pv : 0.5] : [(x - MAPRECT.minX) / (MAPRECT.maxX - MAPRECT.minX), (z - MAPRECT.minZ) / (MAPRECT.maxZ - MAPRECT.minZ)]);
      if (!isP || this.paintingOk) {
        for (const p of POIS) {
          const [u, v] = pos(p.x, p.z, p);
          const d = document.createElement('div');
          d.className = `lbl ${p.own ? 'own' : ''} ${g.targetId === p.id ? 'target' : ''}`;
          d.style.left = u * 100 + '%';
          d.style.top = `calc(${v * 100}% - 46px)`;
          d.dataset.poi = p.id;
          d.title = p.sub || '';
          d.innerHTML = `<div class="tag">${esc(p.name)}</div><div class="pin"></div><div class="dot"></div>`;
          sheet.appendChild(d);
        }
        const [u, v] = isP ? [inP(worldToScrollU(g.x)), 0.93] : pos(g.x, g.z);
        const y = document.createElement('div');
        y.className = 'you';
        y.style.left = u * 100 + '%';
        y.style.top = v * 100 + '%';
        y.innerHTML = `<div class="ring"></div><div class="yt">你在此</div>`;
        sheet.appendChild(y);
        requestAnimationFrame(() => (rail.scrollLeft = sheet.offsetLeft + u * sheet.offsetWidth - rail.clientWidth / 2));
      }
      // 拖拽展卷
      let drag = null;
      rail.onpointerdown = (e) => {
        drag = { x: e.clientX, s: rail.scrollLeft, moved: false };
        rail.classList.add('drag');
      };
      rail.onpointermove = (e) => {
        if (!drag) return;
        if (Math.abs(e.clientX - drag.x) > 4) drag.moved = true;
        rail.scrollLeft = drag.s - (e.clientX - drag.x);
      };
      rail.onpointerup = rail.onpointerleave = () => {
        rail.classList.remove('drag');
        setTimeout(() => (drag = null), 0);
      };
      rail.onwheel = (e) => {
        rail.scrollLeft += e.deltaY + e.deltaX;
        e.preventDefault();
      };
      el.onclick = (e) => {
        const t = e.target.closest('[data-tab]');
        if (t) {
          tab = t.dataset.tab;
          return render();
        }
        const l = e.target.closest('[data-poi]');
        if (l && !(drag && drag.moved)) {
          onPick(l.dataset.poi);
          g.targetId = l.dataset.poi;
          render();
        }
      };
    };
    render();
  }
  closeMap() {
    if (!this.mapOpen) return;
    this.mapOpen = false;
    this.root.classList.remove('mapopen');
    this.$('#bigmap').classList.add('hidden');
    if (this._mapClose) this._mapClose();
  }
}

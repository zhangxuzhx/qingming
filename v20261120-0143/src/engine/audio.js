// 声音：录好的配乐（assets/music 里的五个曲位）；哪个曲位空着，就由程序合成的五声拨弦顶上。另有风与水声、几样音效
const SCALE = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33];
// 配乐的五个曲位与各自的相对音量：卷首、街上的白天与夜晚、家里的白天与夜晚
const MIX = { title: 1, day: 0.9, night: 0.8, 'home-day': 0.78, 'home-night': 0.7 };
const REST = 7; // 一曲奏完，歇几秒再起
const KEEP = 240; // 离开一处不到这么多秒又回来，曲子接着上回停的地方奏；隔久了就换下一首、从头奏

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.level = 0.5; // 总音量（0~1）。眼下界面上只有“奏着 / 已静”；调试时可在 localStorage 里写 qingming.level
    try {
      this.muted = localStorage.getItem('qingming.muted') === '1';
      const lv = localStorage.getItem('qingming.level');
      if (lv !== null && lv !== '' && Number(lv) >= 0 && Number(lv) <= 1) this.level = Number(lv);
    } catch {
      /* 忽略 */
    }
    this.nextT = 0;
    this.idx = 5;
    this.scene = 'title'; // 此刻的场合，main.js 每帧给：title / day / night / home-day / home-night
    this.tracks = null; // 曲目清单（assets/music/tracks.json）：曲位 → 几首曲子；null 是还没读到
    this.base = '';
    this.decks = null; // 两路播放器
    this.cur = null; // 正奏着的那一路
    this.curKey = null; // 正奏着的曲位；null 是程序拨弦
    this.pend = null;
    this.pendT = 0;
    this.busy = 0; // 上一回换曲的淡出要到这一刻才走完
    this.slots = {}; // 各曲位奏到哪一首、哪一秒
    this.blessed = false;
  }
  // 浏览器的规矩：有人点按过页面才许出声，播放器也得在点按的当口放行一次。所以任何一下点按都来叫一声 start
  listen() {
    for (const ev of ['keydown', 'mousedown', 'pointerup', 'touchend']) addEventListener(ev, () => this.start(true), { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      // 页面切到后台：停住，不在背后响
      if (!this.ctx) return;
      if (document.hidden) {
        this.ctx.suspend();
        for (const d of this.decks) d.el.pause();
      } else this.ctx.resume(); // 曲子由 tick 续上
    });
  }
  // 读曲目清单。没有清单、或清单是空的：全由程序拨弦
  async loadMusic(base = './assets/music/') {
    let tracks = {};
    try {
      const r = await fetch(base + 'tracks.json', { cache: 'no-cache' });
      if (r.ok) tracks = (await r.json()).tracks || {};
    } catch {
      /* 取不到就算了 */
    }
    for (const k of Object.keys(tracks)) if (!MIX[k] || !Array.isArray(tracks[k]) || !tracks[k].length) delete tracks[k];
    if (this.cur) this._switch(null, this.ctx.currentTime);
    this.base = base;
    this.slots = {};
    this.tracks = tracks;
    return tracks;
  }
  // 不等人点按，现在出不出得了声？（多数浏览器头一回来是不许的）
  async canPlay() {
    this.start();
    if (!this.ctx) return false;
    for (let i = 0; i < 8 && this.ctx.state !== 'running'; i++) await new Promise((r) => setTimeout(r, 50));
    return this.ctx.state === 'running';
  }
  start(gesture) {
    if (this.muted && !this.ctx) return; // 静音时不建音频上下文，彻底无声
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
      if (gesture) this._bless();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.level;
    this.master.connect(ctx.destination);
    // 录好的曲子走这一路
    this.songs = ctx.createGain();
    this.songs.connect(this.master);
    this.decks = [this._deck(), this._deck()];
    if (gesture) this._bless();
    // 余韵
    this.music = ctx.createGain();
    this.music.gain.value = 0.55;
    const delay = ctx.createDelay(1.2), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
    delay.delayTime.value = 0.37;
    fb.gain.value = 0.42;
    lp.type = 'lowpass';
    lp.frequency.value = 1700;
    wet.gain.value = 0.36;
    this.music.connect(this.master);
    this.music.connect(delay);
    delay.connect(lp);
    lp.connect(fb);
    fb.connect(delay);
    lp.connect(wet);
    wet.connect(this.master);
    // 风、水
    const len = ctx.sampleRate * 3, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = b * 0.985 + (Math.random() * 2 - 1) * 0.12;
      d[i] = b;
    }
    this.noiseBuf = buf;
    const mk = (type, f, q, g) => {
      const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), gn = ctx.createGain();
      src.buffer = buf;
      src.loop = true;
      fl.type = type;
      fl.frequency.value = f;
      fl.Q.value = q;
      gn.gain.value = g;
      src.connect(fl);
      fl.connect(gn);
      gn.connect(this.master);
      src.start();
      return gn;
    };
    this.wind = mk('lowpass', 420, 0.4, 0.5);
    this.water = mk('bandpass', 1100, 0.7, 0);
    this.nextT = ctx.currentTime + 1.2;
  }
  setMuted(m) {
    this.muted = m;
    try {
      localStorage.setItem('qingming.muted', m ? '1' : '0');
    } catch {
      /* 忽略 */
    }
    if (!m) this.start();
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.level, this.ctx.currentTime, 0.1);
  }

  // ── 配乐 ──
  // 只用两路播放器轮着来（一路淡出、一路淡入），而不是一支曲子一路：
  // 手机浏览器要“有人点按”才放行一个播放器，这两路在头一回点按时就放行了，往后换曲子只是换它们的来源
  _deck() {
    const ctx = this.ctx, el = new Audio(), tail = ctx.createGain(), g = ctx.createGain();
    el.preload = 'auto';
    g.gain.value = 0;
    ctx.createMediaElementSource(el).connect(tail);
    tail.connect(g);
    g.connect(this.songs);
    const d = { el, g, tail, key: null, t: null, url: '', off: 0, rest: 0, retry: 0, seek: 0 };
    el.addEventListener('loadedmetadata', () => {
      if (d.seek > 0.5 && Math.abs(el.currentTime - d.seek) > 1) el.currentTime = d.seek;
    });
    el.addEventListener('error', () => {
      // 这支曲子取不到：从清单里拿掉；这个曲位再没别的曲子，就回到程序拨弦
      if (!d.key || !d.url || !this.tracks || !this.tracks[d.key]) return;
      const rest = this.tracks[d.key].filter((t) => t !== d.t);
      if (rest.length) this.tracks[d.key] = rest;
      else delete this.tracks[d.key];
      delete this.slots[d.key];
      d.url = '';
      d.key = null;
      d.g.gain.cancelScheduledValues(0);
      d.g.gain.value = 0;
      if (this.cur === d) (this.cur = null), (this.curKey = null);
    });
    return d;
  }
  _bless() {
    if (this.blessed) return;
    this.blessed = true;
    for (const d of this.decks) if (!d.url) d.el.load();
    if (this.cur && this.cur.el.paused && !this.cur.el.ended) this._play(this.cur);
  }
  _play(d) {
    const p = d.el.play();
    if (p) p.catch(() => {});
  }
  _load(d, at, now) {
    const url = this.base + d.t.file + (d.t.v ? '?v=' + d.t.v : '');
    d.seek = at;
    if (d.url !== url) d.el.src = d.url = url;
    try {
      d.el.currentTime = at;
    } catch {
      /* 有的浏览器要等元数据到了才许跳：见 _deck 里的 loadedmetadata */
    }
    d.retry = now + 0.6;
    this._play(d);
  }
  _switch(key, now) {
    const old = this.cur;
    // 只是昼夜交替、人没挪地方：慢慢地换
    const slow = !!(old && key && old.key.replace(/day|night/, '') === key.replace(/day|night/, ''));
    const tau = slow ? 1.5 : 0.5;
    if (old) {
      const s = this.slots[old.key];
      if (s) {
        const left = old.el.duration - old.el.currentTime;
        s.at = old.rest || old.el.ended || left < 20 ? 0 : old.el.currentTime; // 快奏完了就不记了，下回换一首
        s.left = now;
      }
      old.g.gain.cancelScheduledValues(now);
      old.g.gain.setTargetAtTime(0, now, tau);
      old.off = now + tau * 5;
      old.rest = 0;
      this.busy = old.off + 0.05;
    }
    this.cur = null;
    this.curKey = key;
    if (!key) return;
    const list = this.tracks[key];
    let s = this.slots[key];
    if (!s) s = this.slots[key] = { i: 0, at: 0, left: now };
    else if (!s.at || now - s.left > KEEP) (s.i = (s.i + 1) % list.length), (s.at = 0);
    const d = this.decks[0] === old ? this.decks[1] : this.decks[0];
    d.off = d.rest = 0;
    d.key = key;
    d.t = list[s.i % list.length];
    d.g.gain.cancelScheduledValues(now);
    d.g.gain.setValueAtTime(0, now);
    d.g.gain.setTargetAtTime(MIX[key] * (d.t.gain || 1), now + (old ? tau * 0.6 : 0), slow ? 1.5 : 0.7);
    d.tail.gain.cancelScheduledValues(now);
    d.tail.gain.setValueAtTime(1, now);
    this._load(d, s.at, now);
    this.cur = d;
  }
  // 每帧：该换曲就换；一曲奏完歇一会儿再起
  _music(now) {
    const want = !this.muted && this.tracks && this.tracks[this.scene] ? this.scene : null;
    if (want !== this.pend) (this.pend = want), (this.pendT = now);
    // 场合换了，稍等一下再换曲（在家门口进进出出时不跟着乱切）；上一回的淡出也得先走完
    if (want !== this.curKey && now >= this.busy && now - this.pendT >= (this.cur && want ? 1.2 : 0.25)) this._switch(want, now);
    for (const d of this.decks) if (d.off && now >= d.off) (d.off = 0), d.el.pause();
    const c = this.cur;
    if (!c) return;
    const el = c.el;
    if (c.rest) {
      if (now < c.rest) return;
      // 歇够了：这个曲位有几首就轮着来
      const list = this.tracks[c.key], s = this.slots[c.key];
      c.rest = 0;
      s.i = (s.i + 1) % list.length;
      c.t = list[s.i];
      c.g.gain.setTargetAtTime(MIX[c.key] * (c.t.gain || 1), now, 0.3);
      this._load(c, 0, now);
    } else if (el.ended) c.rest = now + REST;
    else {
      if (el.paused && now >= c.retry) (c.retry = now + 0.6), this._play(c);
      // 收尾收得急的曲子（清单里标了 tail 秒数），末了自己淡出去
      const left = el.duration - el.currentTime, tail = c.t.tail || 0;
      c.tail.gain.setTargetAtTime(tail && left < tail ? Math.max(0, (left - 0.12) / tail) : 1, now, 0.05);
    }
  }
  pluck(freq, t, vel = 0.2, dur = 2.8) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    g.connect(this.music);
    for (const [mul, type, amp] of [[1, 'triangle', 1], [2, 'sine', 0.28], [3, 'sine', 0.1]]) {
      const o = ctx.createOscillator(), og = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq * mul * 1.014, t);
      o.frequency.exponentialRampToValueAtTime(freq * mul, t + 0.07);
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
  // 每帧调用：管配乐；没有录好的曲子时续写拨弦小曲；riverNear∈[0,1] 调节水声
  tick(riverNear = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    this._music(now);
    const live = this.curKey !== null;
    // 有曲子奏着的时候风声让一让，在家里更轻
    this.wind.gain.setTargetAtTime(live ? (this.scene.startsWith('home') ? 0.12 : 0.2) : 0.5, now, 0.8);
    this.water.gain.setTargetAtTime(riverNear * 0.42, now, 0.4);
    if (live || !this.tracks) {
      this.nextT = Math.max(this.nextT, now + 1.5); // 曲子奏着（或清单还没读到）：拨弦先歇着
      return;
    }
    if (this.nextT < now - 1) this.nextT = now + 0.3; // 画面停过一阵（帧没在走）：不补奏落下的那些音
    while (this.nextT < now + 0.4) {
      const r = Math.random();
      if (r < 0.14) {
        this.nextT += 1.6 + Math.random() * 2.6; // 留白
        continue;
      }
      const step = [-2, -1, -1, 1, 1, 2, 3, -3][Math.floor(Math.random() * 8)];
      this.idx = Math.max(1, Math.min(SCALE.length - 1, this.idx + step));
      this.pluck(SCALE[this.idx], this.nextT, 0.16 + Math.random() * 0.1);
      if (Math.random() < 0.22) this.pluck(SCALE[Math.max(0, this.idx - 5)] / 2, this.nextT + 0.02, 0.14, 3.6);
      this.nextT += [0.42, 0.84, 0.84, 1.26, 1.68][Math.floor(Math.random() * 5)];
    }
  }
  sfx(name) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const tone = (f0, f1, dur, vel, type = 'sine', at = 0) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t + at);
      o.frequency.exponentialRampToValueAtTime(f1, t + at + dur);
      g.gain.setValueAtTime(vel, t + at);
      g.gain.exponentialRampToValueAtTime(0.0005, t + at + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t + at);
      o.stop(t + at + dur + 0.02);
    };
    if (name === 'coin') {
      tone(2300, 2250, 0.28, 0.12);
      tone(3450, 3400, 0.22, 0.06);
      tone(2600, 2550, 0.3, 0.1, 'sine', 0.07);
    } else if (name === 'page') tone(520, 660, 0.07, 0.07, 'triangle');
    else if (name === 'place') {
      tone(190, 85, 0.16, 0.3);
      tone(900, 400, 0.04, 0.08, 'triangle');
    } else if (name === 'quest') {
      [293.66, 440, 587.33].forEach((f, i) => this.pluck(f, t + i * 0.16, 0.22, 2.2));
    } else if (name === 'deny') tone(180, 150, 0.12, 0.14, 'triangle');
  }
}

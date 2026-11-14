// 程序化声音：五声音阶的拨弦小曲、风与水声、几样音效（无需任何音频文件）
const SCALE = [146.83, 164.81, 185.0, 220.0, 246.94, 293.66, 329.63, 369.99, 440.0, 493.88, 587.33];

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    try {
      this.muted = localStorage.getItem('qingming.muted') === '1';
    } catch {
      /* 忽略 */
    }
    this.nextT = 0;
    this.idx = 5;
  }
  start() {
    if (this.muted && !this.ctx) return; // 静音时不建音频上下文，彻底无声
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ctx.destination);
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
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.1);
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
  // 每帧调用：续写小曲；riverNear∈[0,1] 调节水声
  tick(riverNear = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.water.gain.setTargetAtTime(riverNear * 0.42, ctx.currentTime, 0.4);
    while (this.nextT < ctx.currentTime + 0.4) {
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

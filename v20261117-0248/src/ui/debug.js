// 调试菜单：平时没有。网址后面带 ?debug（或本地存了 qingming.debug=1）才装上，按 ` 键或点左上角的“调”字开合。
// 换时辰原先是玩家按 T 就能换的，现在时辰照联网时间走，要改只能从这里改。
import { Clock, SHICHEN } from '../game/clock.js';

export function installDebug({ clock, stats, ink }) {
  let enabled = false;
  try {
    enabled = /[?&#]debug\b/.test(location.search + location.hash) || localStorage.getItem('qingming.debug') === '1';
  } catch {
    /* 没有本地存储就只认网址 */
  }
  if (!enabled) return { key: () => false, update() {} };

  const style = document.createElement('style');
  style.textContent = `
    #dbg-btn { position: fixed; left: 6px; top: 6px; z-index: 60; width: 30px; height: 30px; border: 1px solid #3a2c22; background: rgba(236, 223, 194, 0.85); color: #3a2c22; font: 16px var(--kai); cursor: pointer; opacity: 0.55; }
    #dbg { position: fixed; left: 6px; top: 42px; z-index: 60; width: 300px; padding: 10px 12px 12px; background: rgba(34, 28, 24, 0.9); color: #eadfc4; font: 14px/1.5 var(--kai); border: 1px solid #6b5a45; user-select: none; }
    #dbg.hidden { display: none; }
    #dbg h4 { margin: 0 0 6px; font-weight: normal; font-size: 15px; letter-spacing: 0.2em; color: #cdb98f; }
    #dbg .row { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px; }
    #dbg button { min-width: 34px; padding: 3px 6px; border: 1px solid #8a7a66; background: transparent; color: #eadfc4; font: inherit; cursor: pointer; }
    #dbg button.on { background: #eadfc4; color: #2a2320; border-color: #eadfc4; }
    #dbg input[type=range] { width: 100%; }
    #dbg .info { color: #cdb98f; font-size: 13px; white-space: pre-line; }
  `;
  document.head.appendChild(style);
  const btn = document.createElement('button');
  btn.id = 'dbg-btn';
  btn.textContent = '调';
  const el = document.createElement('div');
  el.id = 'dbg';
  el.className = 'hidden';
  el.innerHTML = `<h4>调试 · 时辰</h4>
    <div class="row"><button data-t="auto">随联网时间</button><button data-t="fast">快进（一分钟一天）</button></div>
    <div class="row">${[...SHICHEN].map((c, i) => `<button data-h="${i * 2}">${c}</button>`).join('')}</div>
    <input type="range" min="0" max="24" step="0.05" value="12" />
    <h4 style="margin-top:8px">画面</h4>
    <div class="row"><button data-g="taa">跨帧累积抗锯齿</button></div>
    <div class="info"></div>`;
  document.body.append(btn, el);
  const range = el.querySelector('input'), info = el.querySelector('.info');
  const toggle = () => el.classList.toggle('hidden');
  btn.onclick = toggle;
  el.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.g === 'taa') {
      if (ink) ink.taa = !ink.taa;
    } else if (b.dataset.t === 'auto') {
      clock.fixed = null;
      clock.fast = false;
    } else if (b.dataset.t === 'fast') {
      clock.fixed = null;
      clock.fast = true;
    } else clock.fixed = Number(b.dataset.h);
  };
  range.oninput = () => (clock.fixed = Number(range.value));
  // 这些按钮、滑杆上的按键和点击不要漏到游戏里去
  for (const ev of ['mousedown', 'pointerdown', 'keydown', 'keyup', 'wheel', 'touchstart']) el.addEventListener(ev, (e) => e.stopPropagation());

  let acc = 0;
  return {
    // 返回 true 表示这一键已被调试菜单用掉
    key(code) {
      if (code !== 'Backquote') return false;
      toggle();
      return true;
    },
    update(dt) {
      acc += dt;
      if (el.classList.contains('hidden') || acc < 0.25) return;
      acc = 0;
      const h = clock.hour(), mm = Math.floor((h % 1) * 60);
      const cur = clock.fixed !== null ? Math.round(clock.fixed / 2) * 2 % 24 : -1;
      for (const b of el.querySelectorAll('button')) b.classList.toggle('on', b.dataset.g === 'taa' ? !!(ink && ink.taa && ink.hist) : b.dataset.t === 'auto' ? clock.fixed === null && !clock.fast : b.dataset.t === 'fast' ? clock.fixed === null && clock.fast : Number(b.dataset.h) === cur && clock.fixed !== null);
      if (document.activeElement !== range) range.value = h;
      const s = stats ? stats() : null;
      info.textContent = `画中钟点 ${String(Math.floor(h)).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${Clock.shichen(h)}时
时间来源：${clock.source === 'net' ? `联网（本机钟差 ${(clock.offset / 1000).toFixed(1)} 秒）` : '本机时间（没问到联网时间）'}${s ? `
帧率 ${s.fps} · 每帧平均 ${s.ms.toFixed(1)} 毫秒，这一秒里最慢的一帧 ${s.worst.toFixed(0)} 毫秒
画幅 ${s.size[0]}×${s.size[1]}（像素倍率 ${s.pixelRatio.toFixed(2)}${s.adaptOff ? '，已停止自动调' : ''}）· 三角形 ${(s.triangles / 1e6).toFixed(2)} 百万` : ''}`;
    },
  };
}

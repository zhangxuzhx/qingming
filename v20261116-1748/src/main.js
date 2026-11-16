// 入口：研墨（生成贴图）→ 搭建汴京 → 卷首 → 入画
import * as THREE from 'three';
import { buildTextures } from './engine/textures.js';
import { InkRenderer, shared, setTimeOfDay, TIMES } from './engine/ink.js';
import { Sound } from './engine/audio.js';
import { buildWorld, MAP } from './world/world.js';
import { UI } from './ui/ui.js';
import { Game } from './game/game.js';
import { INTRO } from './game/data.js';

const canvas = document.getElementById('view');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

function boot() {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const tex = buildTextures();
  shared.tNoise.value = tex.noise;
  const ink = new InkRenderer(canvas, tex, { ssr: false, reflect: !coarse, fx: !coarse });
  if (coarse) {
    ink.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
    ink.shadowEvery = 2;
    ink.aoTaps = 5;
    ink.maxPixels = 1.3e6;
  }
  ink.renderer.info.autoReset = false;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.15, 3200);
  camera.rotation.order = 'YXZ';
  camera.layers.enable(1);
  const world = buildWorld(scene, tex);
  if (coarse) world.viewDist = 380;
  const ui = new UI(document.getElementById('ui'), MAP);
  const sound = new Sound();
  const game = new Game({ scene, camera, world, ui, sound, crowd: coarse ? 48 : 112 });
  ui.setTouch(coarse);

  const resize = () => {
    ink.resize();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    ui.layout();
  };
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 250));
  resize();

  // ── 时辰：上午 / 正午 / 黄昏 ──
  const TIME_ORDER = ['morning', 'noon', 'dusk'];
  let timeName = 'morning';
  try {
    const t = localStorage.getItem('qingming.time');
    if (TIMES[t]) timeName = t;
  } catch {
    /* 无本地存储时用默认 */
  }
  setTimeOfDay(timeName);
  const cycleTime = () => {
    timeName = TIME_ORDER[(TIME_ORDER.indexOf(timeName) + 1) % TIME_ORDER.length];
    const t = setTimeOfDay(timeName);
    try {
      localStorage.setItem('qingming.time', timeName);
    } catch {
      /* 存不了就算了 */
    }
    if (photo.on) tip('时辰 · ' + t.label);
    else ui.toast('时辰 · ' + t.label);
    sound.sfx('page');
  };

  // ── 留影：隐去界面，镜头自由游走，回车存一张大图 ──
  const photo = { on: false, pos: new THREE.Vector3(), yaw: 0, pitch: 0, fov: 50, timer: 0, view: 'tp', focus: 9, dof: 1 };
  const PHOTO_TIP = '留影 · W A S D 移动 · Q E 升降 · Shift 快些 · 滚轮 远近 · [ ] 调焦 · F 景深 · T 换时辰 · 回车 存图 · P 退出';
  // 景深的几档：平时走路是淡淡的一层（远处渐虚）；留影时可调焦，分 关 / 淡 / 浓
  const DOF_PLAY = { focus: 9, aper: 3.2, tol: 0.6, nearTol: 3.2, nearK: 1.2 };
  const DOF_TITLE = { focus: 118, aper: 3, tol: 0.3, nearTol: 0.45, nearK: 1 };
  const DOF_PHOTO = [{ aper: 0, tol: 0.3, nearTol: 0.5, nearK: 1, label: '关' }, { aper: 4, tol: 0.3, nearTol: 0.5, nearK: 1, label: '淡' }, { aper: 7.5, tol: 0.12, nearTol: 0.2, nearK: 1, label: '浓' }];
  const photoTip = document.createElement('div');
  photoTip.id = 'photo-tip';
  document.body.appendChild(photoTip);
  const tip = (text, ms = 2600) => {
    photoTip.textContent = text;
    photoTip.classList.add('show');
    clearTimeout(photo.timer);
    photo.timer = setTimeout(() => photoTip.classList.remove('show'), ms);
  };
  const enterPhoto = () => {
    photo.on = true;
    photo.pos.copy(camera.position);
    photo.yaw = camera.rotation.y;
    photo.pitch = camera.rotation.x;
    photo.fov = camera.fov;
    photo.view = game.view;
    // 焦点先落在主角身上
    photo.focus = Math.max(2, Math.hypot(camera.position.x - game.player.x, camera.position.y - ((game.player.y || 0) + 1.3), camera.position.z - game.player.z));
    game.view = 'tp'; // 留影时人在画中
    ui.root.style.visibility = 'hidden';
    tip(PHOTO_TIP, 7000);
    lock();
  };
  const exitPhoto = () => {
    photo.on = false;
    game.view = photo.view;
    ui.root.style.visibility = '';
    photoTip.classList.remove('show');
  };
  const savePhoto = () => {
    // 临时把画幅放大到约四千像素宽，画一帧，存下，再还原
    const pr0 = ink.pixelRatio, mp0 = ink.maxPixels;
    ink.pixelRatio = Math.min(4, Math.max(pr0, 3840 / innerWidth));
    ink.maxPixels = 3840 * 2400;
    ink.resize();
    ink._frame = 0;
    ink.render(scene, camera);
    const d = new Date(), z = (n) => String(n).padStart(2, '0');
    const name = `清明上河图-入画-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}.png`;
    canvas.toBlob((blob) => {
      if (!blob) return tip('存图未成');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      tip('已存 · ' + name, 3200);
    }, 'image/png');
    ink.pixelRatio = pr0;
    ink.maxPixels = mp0;
    ink.resize();
    ink.render(scene, camera);
    slow = -0.5; // 存图那一帧慢是应当的，不算掉帧
    sound.sfx('page');
  };
  // 返回 true 表示这一键已被时辰 / 留影用掉
  const hotkey = (code) => {
    if (photo.on) {
      if (code === 'KeyP' || code === 'Escape') exitPhoto();
      else if (code === 'Enter' || code === 'NumpadEnter') savePhoto();
      else if (code === 'KeyT') cycleTime();
      else if (code === 'BracketLeft' || code === 'BracketRight') {
        photo.focus = Math.max(1.2, Math.min(400, photo.focus * (code === 'BracketLeft' ? 0.88 : 1.14)));
        if (!photo.dof) photo.dof = 1;
        tip(`焦点 · 约 ${Math.max(1, Math.round(photo.focus / 1.5))} 步`, 1600);
      } else if (code === 'KeyF') {
        photo.dof = (photo.dof + 1) % DOF_PHOTO.length;
        tip('景深 · ' + DOF_PHOTO[photo.dof].label, 1600);
      }
      return true;
    }
    if (game.mode !== 'play' || ui.modal) return false;
    if (code === 'KeyT') return cycleTime(), true;
    if (code === 'KeyP' && !game.decorMode) return enterPhoto(), true;
    return false;
  };

  // ── 视角锁定（桌面） ──
  let expectUnlock = false, noLock = coarse, hintT = 0;
  const locked = () => document.pointerLockElement === canvas;
  const lock = () => {
    if (noLock || ui.touch || locked() || !canvas.requestPointerLock) return;
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* 某些内嵌环境不支持锁定，退化为拖动环顾 */
    }
  };
  document.addEventListener('pointerlockerror', () => {
    noLock = true;
    hintT = 6;
  });
  document.addEventListener('pointerlockchange', () => {
    if (!locked() && photo.on) {
      // 留影时按 Esc：只退出留影，不进暂停
      exitPhoto();
      expectUnlock = false;
      return;
    }
    if (!locked() && game.mode === 'play' && !ui.modal && !expectUnlock) game.pause();
    expectUnlock = false;
  });
  game.onModal = (open) => {
    if (open) {
      if (locked()) {
        expectUnlock = true;
        document.exitPointerLock();
      }
    } else lock();
  };

  // ── 键鼠 ──
  addEventListener('keydown', (e) => {
    if (e.code === 'Tab' || (e.code === 'Space' && game.mode === 'play')) e.preventDefault();
    sound.start();
    if (e.repeat) return;
    game.keys[e.code] = true;
    if (!hotkey(e.code)) game.keyDown(e.code);
  });
  addEventListener('keyup', (e) => (game.keys[e.code] = false));
  addEventListener('blur', () => (game.keys = {}));
  let down = null;
  canvas.addEventListener('mousedown', (e) => {
    sound.start();
    if (game.mode !== 'play' || ui.modal || e.button !== 0) return;
    if (locked()) {
      if (!photo.on) game.click();
    } else {
      down = { x: e.clientX, y: e.clientY, moved: false };
      lock();
    }
  });
  addEventListener('mouseup', () => {
    if (down && !down.moved && (noLock || !canvas.requestPointerLock) && game.mode === 'play' && !ui.modal && !photo.on) game.click();
    down = null;
  });
  const photoLook = (dx, dy) => {
    const k = 0.0022 * (photo.fov / 62);
    photo.yaw -= dx * k;
    photo.pitch = Math.max(-1.45, Math.min(1.45, photo.pitch - dy * k));
  };
  addEventListener('mousemove', (e) => {
    const look = photo.on ? photoLook : (dx, dy) => game.look(dx, dy);
    if (locked()) look(e.movementX, e.movementY);
    else if (down) {
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 4) down.moved = true;
      look(e.movementX * 1.5, e.movementY * 1.5);
    }
  });
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (photo.on) photo.fov = Math.max(16, Math.min(92, photo.fov + (e.deltaY > 0 ? 3 : -3)));
      else game.wheel(e.deltaY);
    },
    { passive: true }
  );
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ── 触屏：左半屏按下即出摇杆，其余处滑动环顾 ──
  let joyT = null, lookT = null;
  const JOY_R = 62;
  canvas.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      sound.start();
      noLock = true;
      ui.setTouch(true);
      if (game.mode !== 'play' || ui.modal) return;
      for (const t of e.changedTouches) {
        if (!joyT && t.clientX < innerWidth * 0.42) {
          joyT = { id: t.identifier, ox: t.clientX, oy: t.clientY, dx: 0, dy: 0 };
          ui.joy(joyT);
        } else if (!lookT) lookT = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    },
    { passive: false }
  );
  canvas.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (joyT && t.identifier === joyT.id) {
          let dx = t.clientX - joyT.ox, dy = t.clientY - joyT.oy;
          const l = Math.hypot(dx, dy), R = JOY_R * ui.scale;
          if (l > R) {
            dx *= R / l;
            dy *= R / l;
          }
          joyT.dx = dx;
          joyT.dy = dy;
          game.move = { x: dx / R, y: -dy / R };
          ui.joy(joyT);
        } else if (lookT && t.identifier === lookT.id) {
          game.look((t.clientX - lookT.x) * 2.4, (t.clientY - lookT.y) * 2.4);
          lookT.x = t.clientX;
          lookT.y = t.clientY;
        }
      }
    },
    { passive: false }
  );
  const touchEnd = (e) => {
    for (const t of e.changedTouches) {
      if (joyT && t.identifier === joyT.id) {
        joyT = null;
        game.move = null;
        ui.joy(null);
      }
      if (lookT && t.identifier === lookT.id) lookT = null;
    }
  };
  canvas.addEventListener('touchend', touchEnd);
  canvas.addEventListener('touchcancel', touchEnd);
  // 提示条、小地图、触屏按钮
  ui.onKey = (code) => {
    sound.start();
    if (code === 'wheel') game.wheel(1);
    else if (!hotkey(code)) game.keyDown(code);
  };

  // ── 卷首流程 ──
  const enter = async (isNew) => {
    await ui.fade(true);
    ui.hideIntro();
    ui.hideTitle();
    game.enter(isNew);
    await nextFrame();
    ui.fade(false);
    lock();
    hintT = 8;
  };
  const showTitle = () => {
    ui.showTitle({
      hasSave: Game.hasSave(),
      muted: sound.muted,
      onMute: () => {
        sound.setMuted(!sound.muted);
        return sound.muted;
      },
      onNew: () => {
        sound.start();
        ui.hideTitle();
        ui.showRoles(() => {
          ui.hideRoles();
          ui.showIntro(INTRO, () => enter(true));
        });
      },
      onContinue: () => {
        sound.start();
        enter(false);
      },
    });
  };
  game.onTitle = async () => {
    await ui.fade(true);
    game.toTitle();
    showTitle();
    ui.fade(false);
  };
  showTitle();
  ui.loaded();

  // 调试钩子（控制台可用）
  window.__qm = {
    game, ui, world, ink, scene, camera, photo, hotkey,
    time: (n) => setTimeOfDay(n),
    tp(x, z, yawDeg, pitchDeg = 0) {
      Object.assign(game.player, { x, z, vx: 0, vz: 0 });
      if (yawDeg !== undefined) game.player.yaw = (yawDeg * Math.PI) / 180;
      game.player.pitch = (pitchDeg * Math.PI) / 180;
    },
    start(isNew = true) {
      ui.hideTitle();
      ui.hideRoles();
      ui.hideIntro();
      game.enter(isNew);
    },
    stats: () => ({ ...ink.renderer.info.render, fps: Math.round(fps), pixelRatio: ink.pixelRatio }),
  };

  let last = performance.now(), fps = 60, slow = 0, smooth = 0, raises = 0;
  const fullRatio = ink.pixelRatio;
  function frame(now) {
    const raw = (now - last) / 1000;
    const dt = Math.max(0, Math.min(0.05, raw));
    last = now;
    fps += (1 / Math.max(raw, 1e-3) - fps) * 0.05;
    // 自适应画质：持续掉帧则逐级降低渲染分辨率
    // （窗口不在前台时浏览器会压低帧率，那不算掉帧；降过之后若一直流畅，再慢慢升回去）
    const front = document.hasFocus();
    if (front && raw > 0.042 && raw < 0.25) slow += raw;
    else slow = Math.max(0, slow - Math.max(0, raw) * 0.5);
    if (slow > 3 && ink.pixelRatio > 0.7) {
      ink.pixelRatio = Math.max(0.7, ink.pixelRatio * 0.82);
      ink.resize();
      slow = 0;
      smooth = -30;
    }
    if (front && raw < 0.02 && ink.pixelRatio < fullRatio) smooth += raw;
    else smooth = Math.min(smooth, 0);
    if (smooth > 20 && raises < 2) {
      raises++; // 至多试两回，免得在两档之间来回折腾
      ink.pixelRatio = Math.min(fullRatio, ink.pixelRatio / 0.82);
      ink.resize();
      smooth = -40;
    }
    shared.uTime.value += dt;
    if (ui.modal && joyT) {
      joyT = null;
      game.move = null;
      ui.joy(null);
    }
    if (photo.on) {
      const k = game.keys, sp = (k.ShiftLeft || k.ShiftRight ? 18 : 5) * Math.min(raw, 0.1);
      const cp = Math.cos(photo.pitch), fx = -Math.sin(photo.yaw) * cp, fy = Math.sin(photo.pitch), fz = -Math.cos(photo.yaw) * cp;
      const mf = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), mr = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0), mu = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
      photo.pos.x += (fx * mf + Math.cos(photo.yaw) * mr) * sp;
      photo.pos.y = Math.max(0.25, Math.min(140, photo.pos.y + (fy * mf + mu) * sp));
      photo.pos.z += (fz * mf - Math.sin(photo.yaw) * mr) * sp;
      game.keys = {};
      game.move = null;
      game.update(dt);
      game.keys = k;
      camera.position.copy(photo.pos);
      camera.rotation.set(photo.pitch, photo.yaw, 0);
      camera.fov = photo.fov;
      camera.updateProjectionMatrix();
    } else game.update(dt);
    const dbg = window.__qm.cam;
    if (dbg) {
      camera.fov = dbg.fov;
      camera.position.set(...dbg.pos);
      camera.lookAt(...dbg.target);
      camera.updateProjectionMatrix();
    }
    ui.updateDialogue(dt);
    if (game.mode !== 'play') sound.tick(0.25);
    const needHint = game.mode === 'play' && !ui.modal && !locked() && !ui.touch;
    if (needHint && hintT > 0) hintT -= dt;
    ui.lockHint(needHint && hintT > 0, noLock);
    world.update(dt, camera);
    // 投影范围跟着视线走
    if (dbg) {
      ink.shadowRange = 40;
      ink.shadowCenter.set(dbg.target[0], 0, dbg.target[2]);
    } else if (photo.on) {
      // 镜头越高，投影铺得越开
      const reach = 26 + photo.pos.y * 1.2;
      ink.shadowRange = Math.min(120, 50 + photo.pos.y * 1.5);
      ink.shadowCenter.set(photo.pos.x - Math.sin(photo.yaw) * reach, 0, photo.pos.z - Math.cos(photo.yaw) * reach);
    } else if (game.mode === 'play') {
      ink.shadowRange = coarse ? 44 : 56;
      ink.shadowCenter.set(game.player.x - Math.sin(game.player.yaw) * 30, 0, game.player.z - Math.cos(game.player.yaw) * 30);
    } else {
      ink.shadowRange = 150;
      ink.shadowCenter.set(game.cine - 9, 0, 10);
    }
    ink.expose += ((world.indoor && !photo.on && !dbg ? 1.36 : 1) - ink.expose) * Math.max(0, Math.min(1, raw * 2.5));
    // 景深：各档之间缓缓过渡
    {
      const tg = photo.on ? { ...DOF_PHOTO[photo.dof], focus: photo.focus } : dbg ? { ...DOF_PLAY, focus: Math.max(9, Math.hypot(dbg.pos[0] - dbg.target[0], dbg.pos[1] - dbg.target[1], dbg.pos[2] - dbg.target[2]) * 0.6) } : game.mode === 'play' ? DOF_PLAY : DOF_TITLE;
      const k = Math.max(0, Math.min(1, raw * 5));
      for (const key of ['focus', 'aper', 'tol', 'nearTol', 'nearK']) ink.dof[key] += (tg[key] - ink.dof[key]) * k;
    }
    ink.renderer.info.reset();
    ink.render(scene, camera);
  }
  function loop(now) {
    frame(now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  // 调试：页面在后台（动画帧暂停）时手动推进若干帧
  window.__qm.step = (n = 1, ms = 33) => {
    for (let i = 0; i < n; i++) frame(last + ms);
  };
  // 调试：从任意机位看（pos / target 为世界坐标）；shot() 无参则交还镜头
  window.__qm.shot = (pos, target, fov = 36) => {
    window.__qm.cam = pos ? { pos, target, fov } : null;
    ui.root.style.visibility = pos ? 'hidden' : '';
  };
}

// 招牌、字画是画在贴图上的，生成之前得先把随游戏带的字体载好；最多等 4 秒，载不下来就用系统字体顶上
function fontsReady() {
  if (!document.fonts || !document.fonts.load) return Promise.resolve();
  const want = ['"QM Kai"', '"QM Brush"', '"QM Title"'].map((f) => document.fonts.load(`24px ${f}`, '清明上河圖汴京'));
  return Promise.race([Promise.all(want), new Promise((r) => setTimeout(r, 4000))]).catch(() => {});
}

// 先让“研墨铺纸”显示出来，再开始生成
setTimeout(() =>
  fontsReady().then(() =>
    setTimeout(() => {
      try {
        boot();
      } catch (e) {
        console.error(e);
        const l = document.getElementById('loading');
        if (l) l.textContent = '展卷未成：' + (e && e.message ? e.message : e);
      }
    }, 40)
  )
);

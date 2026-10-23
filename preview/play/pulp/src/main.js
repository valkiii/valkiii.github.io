// PULP — slice fruit with your hands (or your eyes). App shell: screens, loop, input.
import { World } from './game.js';
import { drawWorld, drawHud, drawPreview, drawText } from './render.js';
import { sprites } from './sprites.js';
import { Blade } from './blade.js';
import { HandInput } from './hands.js';
import { EyeInput } from './eyes.js';
import { fitGaze } from './gaze.js';
import { DotRun, CALIB_POINTS, VALID_POINTS, scoreValidation } from './calibration.js';
import { openBestCamera, listCameras, switchCamera } from './camera.js';
import { unlockAudio, sfx } from './audio.js';
import { clamp, makeRng } from './geom.js';
import { trimFixation } from './gaze.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const statusEl = document.getElementById('status');
const helpEl = document.getElementById('help');

const store = {
  get(k, d) { try { const v = localStorage.getItem(`pulp.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`pulp.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

const app = {
  w: 0, h: 0, dpr: 1, scale: 1,
  state: 'splash',            // splash | menu | play | over | calib | validate | calibdone | drift
  input: params.get('input') || store.get('input', 'hands'),   // hands | eyes | mouse
  world: null,
  screen: null,               // rebuilds the current menu world on resize
  hands: new HandInput(),
  eyes: new EyeInput(),
  mouse: new Blade('mouse', { color: '#ffffff', minSpeed: 700 }),
  bot: params.has('demo') ? { blade: new Blade('bot', { color: '#9dff8a', minSpeed: 300 }), path: [], next: 0 } : null,
  handLm: null, faceLm: null,
  camera: null, lastVideoTime: -1, detectTimes: [],
  lastHands: [], segs: [],
  manualPause: false, autoPaused: false, presentSince: null,
  pending: null,              // {action, at}
  showPreview: store.get('preview', true),
  ghost: store.get('ghost', false),
  eyeSlice: store.get('eyeSlice', 'both'),   // both | flick | dwell
  showGaze: store.get('showGaze', true),
  calib: null, valid: null, validation: null, drift: null,
  lastMode: 'classic',
  lastSwipe: new Map(), lastSwoosh: 0,
  message: null,              // {text, until}
  now: 0,
};
window.pulp = app;            // handy in the devtools console

const profile = () => (app.input === 'eyes' ? 'eyes' : app.input === 'mouse' ? 'mouse' : 'hands');
const best = (mode) => store.get(`best.${profile()}.${mode}`, 0);
const say = (text, secs = 2.5) => { app.message = { text, until: app.now + secs }; };

// ---- layout ----------------------------------------------------------------------------
function resize() {
  app.dpr = Math.min(window.devicePixelRatio || 1, 2);
  app.w = window.innerWidth; app.h = window.innerHeight;
  canvas.width = Math.round(app.w * app.dpr); canvas.height = Math.round(app.h * app.dpr);
  app.scale = clamp(Math.min(app.w, app.h) / 820, 0.7, 1.6);
  if (app.screen) app.screen();
  else if (app.world) app.world.resize(app.w, app.h);
}
window.addEventListener('resize', resize);

// ---- screens -----------------------------------------------------------------------------
function menuWorld(buttons) {
  const wd = new World({ w: app.w, h: app.h, mode: 'menu', profile: profile() });
  for (const [kind, u, v, action, label] of buttons) wd.addButton(kind, u * app.w, v * app.h, action, label);
  return wd;
}

function showMenu() {
  app.state = 'menu';
  app.screen = () => {
    app.world = menuWorld(app.input === 'eyes'
      ? [['watermelon', 0.2, 0.62, 'classic', 'CLASSIC'], ['orange', 0.4, 0.62, 'zen', 'ZEN'],
         ['lemon', 0.6, 0.62, 'recal', 'RECALIBRATE'], ['apple', 0.8, 0.62, 'hands', 'USE HANDS']]
      : [['watermelon', 0.26, 0.6, 'classic', 'CLASSIC'], ['orange', 0.5, 0.6, 'zen', 'ZEN'],
         ['plum', 0.74, 0.6, 'eyes', 'EYES (BETA)']]);
  };
  app.screen();
}

function showOver() {
  app.state = 'over';
  const w = app.world;
  const result = { score: w.score, mode: w.mode, reason: w.overReason };
  const key = `best.${profile()}.${w.mode}`;
  result.record = w.score > store.get(key, 0);
  if (result.record) store.set(key, w.score);
  app.screen = () => {
    app.world = menuWorld([['watermelon', 0.38, 0.7, 'retry', 'AGAIN'], ['apple', 0.62, 0.7, 'menu', 'MENU']]);
    app.world.result = result;
  };
  app.screen();
}

function startGame(mode) {
  app.lastMode = mode;
  app.screen = null;
  app.world = new World({ w: app.w, h: app.h, mode, profile: profile(), seed: params.has('seed') ? +params.get('seed') : undefined });
  app.state = 'play';
  app.manualPause = false; app.autoPaused = false;
}

function startCalibration() {
  app.screen = null;
  app.world = new World({ w: app.w, h: app.h, mode: 'menu', profile: 'eyes' });
  app.state = 'calib';
  app.calib = new DotRun(CALIB_POINTS, { dwell: 1.5, settle: 0.6, intro: 2.5 });
  app.eyes.model = null;
}

function finishCalibration() {
  const data = app.calib.dataset(app.w, app.h);
  const groups = new Set(data.map((d) => d.group));
  if (groups.size < 9 || data.length < 60) {
    say('Could not see your eyes well enough — try again with more light on your face', 5);
    showMenuFor('hands-fallback');
    return;
  }
  const fit = fitGaze(data);
  app.eyes.model = fit;
  app.eyes.offset = [0, 0];
  app.eyes.filter.reset();
  app.state = 'validate';
  app.valid = new DotRun(VALID_POINTS, { dwell: 1.4, settle: 0.55, intro: 0.8 });
}

function finishValidation() {
  const m = app.eyes.model;
  app.validation = { ...scoreValidation(app.valid, m.predict, app.w, app.h), cv: m.cv, run: app.valid };
  app.eyes.tune(app.validation.precision);
  app.state = 'calibdone';
  app.screen = () => {
    app.world = menuWorld([['watermelon', 0.33, 0.72, 'menu', 'CONTINUE'], ['lemon', 0.67, 0.72, 'recal', 'REDO']]);
  };
  app.screen();
}

function showMenuFor(reason) {
  if (reason === 'hands-fallback') setInput('hands');
  showMenu();
}

async function setInput(input) {
  app.input = input;
  store.set('input', input);
  if (input !== 'mouse') await ensureTracking();
}

function act(action) {
  sfx.select();
  switch (action) {
    case 'classic': case 'zen': startGame(action); break;
    case 'retry': startGame(app.lastMode); break;
    case 'menu': showMenu(); break;
    case 'eyes': setInput('eyes').then(() => (app.eyes.model ? showMenu() : startCalibration())); break;
    case 'hands': setInput('hands').then(showMenu); break;
    case 'recal': startCalibration(); break;
  }
}

// ---- camera + models ---------------------------------------------------------------------
let trackingReady = null;
async function ensureTracking() {
  trackingReady ??= (async () => {
    try {
      statusEl.textContent = 'Starting camera…';
      app.camera = await openBestCamera(video, store.get('cameraId', null), (s) => (statusEl.textContent = s));
      store.set('cameraId', app.camera.deviceId);
      if (!app.camera.live) say('The camera picture looks black — press C to try another camera', 6);
      statusEl.textContent = 'Loading hand & face models…';
      const { createHands, createFace } = await import('./vision.js');
      [app.handLm, app.faceLm] = await Promise.all([createHands(), createFace()]);
      statusEl.textContent = '';
    } catch (e) {
      console.error(e);
      trackingReady = null;
      const denied = e.name === 'NotAllowedError';
      statusEl.textContent = denied ? 'Camera blocked — allow it in the address bar, then reload. Mouse still works.' : `Tracking unavailable: ${e.message}. Mouse still works.`;
      app.input = 'mouse';
    }
  })();
  return trackingReady;
}

async function cycleCamera() {
  const cams = await listCameras();
  if (cams.length < 2) { say('Only one camera found'); return; }
  const i = cams.findIndex((c) => c.deviceId === app.camera?.deviceId);
  const next = cams[(i + 1) % cams.length];
  app.camera = { ...(await switchCamera(video, next.deviceId)), live: true };
  store.set('cameraId', app.camera.deviceId);
  app.lastVideoTime = -1;
  say(`Camera: ${app.camera.label || 'camera ' + ((i + 1) % cams.length + 1)}`);
}

// ---- input -------------------------------------------------------------------------------
canvas.addEventListener('pointermove', (e) => {
  const t = performance.now() / 1000;
  const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of list.length ? list : [e]) {
    const seg = app.mouse.add(ev.clientX, ev.clientY, t);
    if (seg) app.segs.push(seg);
  }
});
canvas.addEventListener('pointerleave', () => app.mouse.lose());

window.addEventListener('keydown', (e) => {
  if (app.state === 'splash') { begin(); return; }
  const k = e.key.toLowerCase();
  if (k === ' ') { if (app.state === 'play') app.manualPause = !app.manualPause; e.preventDefault(); }
  else if (k === 'escape') { if (app.state !== 'menu') showMenu(); }
  else if (k === 'f') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); }
  else if (k === 'v') { app.showPreview = !app.showPreview; store.set('preview', app.showPreview); }
  else if (k === 'g') { app.ghost = !app.ghost; store.set('ghost', app.ghost); }
  else if (k === 'c') cycleCamera();
  else if (k === 'h') act('hands');
  else if (k === 'e') act('eyes');
  else if (k === 'm') { setInput('mouse'); say('Mouse only'); if (app.state === 'menu') showMenu(); }
  else if (k === 'k') { if (app.input === 'eyes') startCalibration(); }
  else if (k === 'd') { if (app.input === 'eyes' && app.eyes.model) startDrift(); }
  else if (k === 'x') {
    const order = ['both', 'flick', 'dwell'];
    app.eyeSlice = order[(order.indexOf(app.eyeSlice) + 1) % 3]; store.set('eyeSlice', app.eyeSlice);
    say(`Eye slicing: ${{ both: 'flick + dwell', flick: 'flick only', dwell: 'dwell only' }[app.eyeSlice]}`);
  }
  else if (k === 'o') { app.showGaze = !app.showGaze; store.set('showGaze', app.showGaze); }
  else if (k === '1') startGame('classic');
  else if (k === '2') startGame('zen');
  else if (k === 'enter') {
    if (app.state === 'calibdone' || app.state === 'over') act(app.state === 'over' ? 'retry' : 'menu');
  }
  else if (k === 'r' && app.state === 'calibdone') startCalibration();
  else if (k === '?' || k === '/') helpEl.classList.toggle('show');
});

let drift = null;
function startDrift() {
  drift = { run: new DotRun([[0.5, 0.5]], { dwell: 1.3, settle: 0.45, intro: 0.6 }), back: app.state, world: app.world, screen: app.screen };
  app.state = 'drift';
}

// Scripted blade for ?demo (tests and screenshots without a camera).
function botStep(now) {
  const bot = app.bot;
  if (!bot) return;
  while (bot.path.length && bot.path[0].t <= now) {
    const p = bot.path.shift();
    const seg = bot.blade.add(p.x, p.y, p.t);
    if (seg) app.segs.push(seg);
  }
  if (bot.path.length || now < bot.next) return;
  const targets = app.world.fruits.filter((f) => !f.cut && f.wait <= 0 && !f.bomb && (f.button ? params.get('demo') === 'menu' : f.vy > -app.h * 0.5));
  if (!targets.length) return;
  const f = targets[0];
  const a = makeRng()() * Math.PI;
  const L = f.r * 2.6;
  for (let i = 0; i <= 8; i++) {
    const k = i / 8 - 0.5;
    bot.path.push({ x: f.x + Math.cos(a) * L * k + f.vx * 0.05, y: f.y + Math.sin(a) * L * k + f.vy * 0.05, t: now + i * 0.012 });
  }
  bot.next = now + 0.25;
}

// ---- main loop ---------------------------------------------------------------------------
let last = performance.now() / 1000;
function frame(ts) {
  const now = ts / 1000;
  app.now = now;
  const dt = clamp(now - last, 0, 0.05);
  last = now;
  const { w, h } = app;

  // 1. tracking
  let tracked = false;
  if (video.readyState >= 2 && video.currentTime !== app.lastVideoTime && app.state !== 'splash') {
    app.lastVideoTime = video.currentTime;
    const aspect = video.videoWidth / video.videoHeight;
    if (app.input === 'hands' && app.handLm) {
      const res = app.handLm.detectForVideo(video, ts);
      app.lastHands = res.landmarks || [];
      app.segs.push(...app.hands.process(res, now, w, h));
      tracked = true;
    } else if (app.input === 'eyes' && app.faceLm) {
      const res = app.faceLm.detectForVideo(video, ts);
      const segs = app.eyes.process(res, now, w, h, aspect);
      const flick = app.state === 'play' && app.eyeSlice !== 'dwell';
      if (flick) app.segs.push(...segs);
      tracked = true;
    }
    if (tracked) { app.detectTimes.push(now); while (app.detectTimes.length > 30) app.detectTimes.shift(); }
  }
  botStep(now);

  const blades = [app.mouse, ...(app.input === 'hands' ? app.hands.blades : []), ...(app.input === 'eyes' ? app.eyes.blades : []), ...(app.bot ? [app.bot.blade] : [])];
  app.eyes.blade.hideCursor = true;

  // 2. presence → auto pause
  if (app.state === 'play' && !app.world.over) {
    const present = app.input === 'hands' ? now - app.hands.lastSeen < 2.5
      : app.input === 'eyes' ? now - app.eyes.lastSeen < 1.5 && !(app.eyes.closedSince && now - app.eyes.closedSince > 1.2)
        : true;
    if (!present) { app.autoPaused = true; app.presentSince = null; }
    else if (app.autoPaused) {
      app.presentSince ??= now;
      if (now - app.presentSince > 0.8) app.autoPaused = false;
    }
  }
  const paused = app.state === 'play' && (app.manualPause || app.autoPaused);

  // 3. simulate
  const world = app.world;
  if (app.state === 'calib' || app.state === 'validate' || app.state === 'drift') {
    const run = app.state === 'calib' ? app.calib : app.state === 'validate' ? app.valid : drift.run;
    const before = run.index;
    run.step(dt, app.eyes.blinking ? null : app.eyes.features);
    if (run.index !== before && !run.done) sfx.tick();
    if (run.done) {
      if (app.state === 'calib') finishCalibration();
      else if (app.state === 'validate') finishValidation();
      else {
        const ps = trimFixation(run.samples[0]).map(app.eyes.model.predict);
        if (ps.length > 5) {
          const mx = ps.reduce((s, p) => s + p[0], 0) / ps.length, my = ps.reduce((s, p) => s + p[1], 0) / ps.length;
          app.eyes.offset = [w / 2 - mx, h / 2 - my];
          say('Drift corrected');
        }
        app.state = drift.back;
        drift = null;
      }
    }
    app.segs.length = 0;
  } else if (!paused) {
    for (const seg of app.segs) world.slice(seg);
    app.segs.length = 0;
    const g = app.eyes.gaze;
    const canDwell = app.input === 'eyes' && g && !app.eyes.blinking && (app.state !== 'play' || app.eyeSlice !== 'flick');
    if (canDwell) world.dwell(g.x, g.y, dt);
    world.update(dt);
    world.endSwipes(blades, now);
  } else {
    app.segs.length = 0;
  }

  // 4. events → sound and screens
  for (const b of blades) {
    if (b.active && app.lastSwipe.get(b) !== b.swipe && now - app.lastSwoosh > 0.09) { sfx.swoosh(); app.lastSwoosh = now; }
    app.lastSwipe.set(b, b.swipe);
    b.trim(now);
  }
  for (const ev of world.takeEvents()) {
    if (ev.type === 'cut') { sfx.splat(); if (ev.button && !app.pending) app.pending = { action: ev.button.action, at: now + 0.45 }; }
    else if (ev.type === 'bomb') sfx.bomb();
    else if (ev.type === 'miss') { sfx.miss(); world.popups.push({ text: 'X', x: ev.x, y: ev.y - 60, age: 0, life: 1, color: '#ff3b3b' }); }
    else if (ev.type === 'combo') sfx.combo(ev.n);
    else if (ev.type === 'wave') sfx.launch();
    else if (ev.type === 'gameover') { setTimeout(() => sfx.gameover(), ev.reason === 'bomb' ? 900 : 200); app.pending = { action: 'over', at: now + (ev.reason === 'bomb' ? 1.6 : 1.0) }; }
  }
  if (app.pending && now >= app.pending.at) {
    const { action } = app.pending;
    app.pending = null;
    action === 'over' ? showOver() : act(action);
  }

  // 5. draw
  ctx.setTransform(app.dpr, 0, 0, app.dpr, 0, 0);
  const g = app.eyes.gaze;
  const showRing = app.input === 'eyes' && g && app.showGaze && app.state !== 'calib' && app.state !== 'validate' && app.state !== 'drift';
  drawWorld(ctx, app.world, {
    w, h, dpr: app.dpr, now, video, ghost: app.ghost, blades, scale: app.scale,
    gazeRing: showRing ? { x: g.x, y: g.y, r: clamp(app.validation?.accuracy ?? 70, 30, 110) * 0.6, blink: app.eyes.blinking } : null,
  });
  drawScreen(now);
  if (app.showPreview && app.input !== 'mouse') {
    const fps = app.detectTimes.length > 2 ? (app.detectTimes.length - 1) / (app.detectTimes.at(-1) - app.detectTimes[0]) : 0;
    drawPreview(ctx, video, { w, h, scale: app.scale, hands: app.input === 'hands' ? app.lastHands : [], face: app.input === 'eyes' ? app.eyes.lm : null,
      label: `${app.input.toUpperCase()} · ${fps.toFixed(0)} FPS` });
  }
  if (paused) drawPause();
  if (app.message && now < app.message.until) {
    drawText(ctx, app.message.text, w / 2, h - 40 * app.scale, 16 * app.scale, { color: '#fff4dc', alpha: Math.min(1, (app.message.until - now) * 2) });
  }
  requestAnimationFrame(frame);
}

function drawPause() {
  const { w, h, scale: s } = app;
  ctx.fillStyle = 'rgba(10,4,0,0.55)'; ctx.fillRect(0, 0, w, h);
  drawText(ctx, 'PAUSED', w / 2, h * 0.42, 64 * s, { color: '#ffd54a' });
  const why = app.manualPause ? 'Press space to continue'
    : app.input === 'hands' ? 'Show your hand to the camera to continue'
      : 'Look at the screen with your eyes open to continue';
  drawText(ctx, why, w / 2, h * 0.52, 20 * s, { color: '#fff4dc' });
}

function drawScreen(now) {
  const { w, h, scale: s } = app;
  const world = app.world;
  if (app.state === 'menu') {
    drawText(ctx, 'PULP', w / 2, h * 0.2, 120 * s, { color: '#ffd54a', glow: '#ff7a1a' });
    const how = app.input === 'eyes' ? 'Look at a fruit to choose it'
      : app.input === 'mouse' ? 'Swipe the mouse through a fruit to choose'
        : 'Swipe your index finger through a fruit to choose';
    drawText(ctx, how, w / 2, h * 0.32, 20 * s, { color: '#fff4dc', alpha: 0.9 });
    const b1 = best('classic'), b2 = best('zen');
    if (b1 || b2) drawText(ctx, `BEST  classic ${b1}  ·  zen ${b2}`, w / 2, h * 0.38, 15 * s, { color: '#f5e6c8', alpha: 0.7 });
    drawText(ctx, keysLine(), w / 2, h - 18 * s, 12 * s, { color: '#f5e6c8', alpha: 0.55, stroke: false });
  } else if (app.state === 'play') {
    drawHud(ctx, world, { w, best: best(world.mode), scale: s });
    if (app.input === 'eyes') drawText(ctx, `eyes · ${app.eyeSlice}`, w / 2, 24 * s, 12 * s, { color: '#ffd36b', alpha: 0.6, stroke: false });
    if (world.time < 2.5) drawText(ctx, world.mode === 'zen' ? 'ZEN · 90 SECONDS' : 'CLASSIC · DODGE THE BOMBS', w / 2, h * 0.3, 32 * s, { alpha: Math.min(1, 2.5 - world.time), color: '#fff4dc' });
  } else if (app.state === 'over') {
    const r = world.result || {};
    const title = r.reason === 'bomb' ? 'BOOM!' : r.reason === 'time' ? 'TIME UP' : 'GAME OVER';
    drawText(ctx, title, w / 2, h * 0.2, 90 * s, { color: '#ff6a4a', glow: '#ff2d1a' });
    drawText(ctx, String(r.score ?? 0), w / 2, h * 0.38, 80 * s, { color: '#ffd54a' });
    drawText(ctx, r.record ? 'NEW BEST!' : `BEST ${best(r.mode)}`, w / 2, h * 0.48, 22 * s, { color: r.record ? '#9dff8a' : '#f5e6c8' });
  } else if (app.state === 'calib' || app.state === 'validate' || app.state === 'drift') {
    drawCalibration(now);
  } else if (app.state === 'calibdone') {
    drawCalibResult();
  }
}

function keysLine() {
  return 'SPACE pause · ESC menu · F fullscreen · V camera view · C switch camera · H hands · E eyes · M mouse · ? help';
}

function drawCalibration() {
  const { w, h, scale: s } = app;
  const run = app.state === 'calib' ? app.calib : app.state === 'validate' ? app.valid : drift.run;
  ctx.fillStyle = 'rgba(8,4,2,0.82)'; ctx.fillRect(0, 0, w, h);
  const noFace = app.now - app.eyes.lastSeen > 0.5;
  if (run.t < 0) {
    const title = app.state === 'calib' ? 'EYE CALIBRATION' : app.state === 'validate' ? 'CHECKING ACCURACY' : 'RE-CENTRE';
    drawText(ctx, title, w / 2, h * 0.22, 44 * s, { color: '#ffd54a' });
    drawText(ctx, 'Follow the dot with your eyes. Keep your head still, about an arm\'s length from the screen.', w / 2, h * 0.3, 18 * s, { color: '#fff4dc' });
  }
  const [u, v] = run.points[Math.min(run.index, run.points.length - 1)];
  const x = u * w, y = v * h;
  const ph = run.phase < 0 ? 0 : run.phase;
  ctx.save();
  ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(x, y, 8 + 34 * (1 - ph), 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.shadowColor = '#ffd36b'; ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#e8203a';
  ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (run.t >= 0) drawText(ctx, `${Math.min(run.index + 1, run.points.length)} / ${run.points.length}`, w / 2, h - 30 * s, 14 * s, { alpha: 0.6, stroke: false });
  if (noFace) drawText(ctx, 'I can\'t see your face — look at the screen, light on your face', w / 2, h * 0.56, 18 * s, { color: '#ff8a6a' });
}

function drawCalibResult() {
  const { w, h, scale: s } = app;
  const val = app.validation;
  ctx.fillStyle = 'rgba(8,4,2,0.55)'; ctx.fillRect(0, 0, w, h * 0.55);
  // targets vs where we think you looked
  val.run.samples.forEach((fs, i) => {
    const ps = trimFixation(fs).map(app.eyes.model.predict);
    const [u, v] = val.run.points[i];
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(u * w, v * h, 10, 0, Math.PI * 2); ctx.stroke();
    if (!ps.length) return;
    const mx = ps.reduce((a, p) => a + p[0], 0) / ps.length, my = ps.reduce((a, p) => a + p[1], 0) / ps.length;
    ctx.fillStyle = 'rgba(255,211,107,0.35)';
    for (const p of ps) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#ffd36b';
    ctx.beginPath(); ctx.moveTo(u * w, v * h); ctx.lineTo(mx, my); ctx.stroke();
    ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.fill();
  });
  const a = val.accuracy;
  const grade = a < 70 ? ['GREAT', '#9dff8a'] : a < 120 ? ['OK', '#ffd54a'] : ['ROUGH', '#ff8a6a'];
  drawText(ctx, `CALIBRATION ${grade[0]}`, w / 2, h * 0.16, 44 * s, { color: grade[1] });
  drawText(ctx, `off by ~${Math.round(a)} px on average · jitter ${Math.round(val.precision)} px`, w / 2, h * 0.24, 18 * s, { color: '#fff4dc' });
  if (a >= 120) drawText(ctx, 'Tip: light your face from the front, sit closer, keep your head still — then REDO', w / 2, h * 0.3, 15 * s, { color: '#fff4dc', alpha: 0.8 });
  drawText(ctx, 'Look at a fruit to choose · ENTER continue · R redo · in game: D re-centre, X slice style', w / 2, h - 18 * s, 12 * s, { alpha: 0.6, stroke: false });
}

// ---- start -------------------------------------------------------------------------------
let begun = false;
function begin() {
  if (begun) return;
  begun = true;
  unlockAudio();
  sprites();
  overlay.classList.add('hidden');
  if (app.input === 'eyes') app.input = 'hands';         // eyes need calibration first
  showMenu();
  if (app.input !== 'mouse') ensureTracking();
  const auto = params.get('autostart');
  if (auto === 'classic' || auto === 'zen') startGame(auto);
}

overlay.addEventListener('click', begin);
resize();
app.world = new World({ w: app.w, h: app.h, mode: 'menu' });
if (params.has('autostart')) begin();
requestAnimationFrame(frame);
Object.assign(app, { act, startGame, startCalibration, showMenu, showOver });

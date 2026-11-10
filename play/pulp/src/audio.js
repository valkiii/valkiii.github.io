// Synthesised sound effects (WebAudio, no files). Must be unlocked by a click or key.
let ac = null, master = null, noise = null;

export function unlockAudio() {
  if (!ac) {
    ac = new AudioContext();
    master = ac.createGain();
    master.gain.value = 0.7;
    master.connect(ac.destination);
    noise = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}

export function setVolume(v) { if (master) master.gain.value = v; }

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noiseBurst({ type = 'bandpass', f0 = 1000, f1 = f0, q = 1, a = 0.005, d = 0.2, peak = 0.5, offset = 0 }) {
  const t = ac.currentTime;
  const src = ac.createBufferSource(); src.buffer = noise;
  const fl = ac.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  const g = ac.createGain(); env(g, t, a, peak, d);
  src.connect(fl).connect(g).connect(master);
  src.start(t, offset); src.stop(t + a + d + 0.05);
}

function tone({ type = 'sine', f0 = 440, f1 = f0, a = 0.005, d = 0.2, peak = 0.3, at = 0 }) {
  const t = ac.currentTime + at;
  const o = ac.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
  const g = ac.createGain(); env(g, t, a, peak, d);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + a + d + 0.05);
}

const r = (a, b) => a + Math.random() * (b - a);

export const sfx = {
  swoosh() { if (!ac) return; noiseBurst({ f0: r(700, 1000), f1: r(2600, 3600), q: 1.4, a: 0.03, d: 0.16, peak: 0.22, offset: Math.random() }); },
  splat() {
    if (!ac) return;
    noiseBurst({ type: 'lowpass', f0: r(1800, 2600), f1: 300, a: 0.002, d: 0.14, peak: 0.5, offset: Math.random() });
    tone({ f0: r(150, 190), f1: 60, a: 0.002, d: 0.12, peak: 0.45 });
    noiseBurst({ type: 'highpass', f0: 4000, a: 0.001, d: 0.05, peak: 0.12, offset: Math.random() });
  },
  bomb() {
    if (!ac) return;
    noiseBurst({ type: 'lowpass', f0: 2500, f1: 80, a: 0.003, d: 1.3, peak: 0.9, offset: Math.random() * 0.2 });
    tone({ f0: 90, f1: 30, a: 0.004, d: 0.9, peak: 0.7 });
  },
  miss() { if (!ac) return; tone({ type: 'triangle', f0: 260, f1: 120, a: 0.01, d: 0.3, peak: 0.25 }); },
  combo(n = 3) {
    if (!ac) return;
    [0, 4, 7, 12, 16].slice(0, Math.min(5, n)).forEach((st, i) =>
      tone({ type: 'triangle', f0: 523 * 2 ** (st / 12), a: 0.005, d: 0.22, peak: 0.18, at: i * 0.06 }));
  },
  launch() { if (!ac) return; tone({ f0: 120, f1: 70, a: 0.003, d: 0.08, peak: 0.12 }); noiseBurst({ type: 'lowpass', f0: 600, a: 0.002, d: 0.08, peak: 0.08 }); },
  select() { if (!ac) return; tone({ type: 'triangle', f0: 660, a: 0.005, d: 0.12, peak: 0.2 }); tone({ type: 'triangle', f0: 990, a: 0.005, d: 0.2, peak: 0.16, at: 0.08 }); },
  tick() { if (!ac) return; tone({ type: 'sine', f0: 1200, a: 0.002, d: 0.05, peak: 0.08 }); },
  gameover() { if (!ac) return; [0, -3, -7, -12].forEach((st, i) => tone({ type: 'triangle', f0: 392 * 2 ** (st / 12), a: 0.01, d: 0.35, peak: 0.18, at: i * 0.16 })); },
};

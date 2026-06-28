// Procedural sound effects using the Web Audio API.
// AudioContext is created on first user gesture (browser autoplay policy).
const Sound = {
  ctx: null,
  master: null,
  enabled: true,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      try {
        if (localStorage.getItem('orbit-muted') === '1') this.enabled = false;
      } catch (_) {}
      this.master.gain.value = this.enabled ? 0.45 : 0;
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (_) { /* audio unsupported — silent */ }
  },

  setMuted(muted) {
    this.enabled = !muted;
    if (this.master) this.master.gain.value = this.enabled ? 0.45 : 0;
    try { localStorage.setItem('orbit-muted', muted ? '1' : '0'); } catch (_) {}
    return this.enabled;
  },

  toggle() { return this.setMuted(this.enabled); },

  // Single oscillator tone with linear attack, exponential decay,
  // optional frequency sweep, and a delay (for chord/arpeggio sequencing).
  _tone({ freq, freqEnd, duration, type = 'sine', attack = 0.005, volume = 0.2, delay = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), now + duration);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  },

  // White-noise burst — used for splatty / impact-y effects
  _noiseBurst(duration, volume, filterFreq) {
    if (!this.enabled || !this.ctx) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(now);
    src.stop(now + duration + 0.02);
  },

  hqDamage() {
    // Low thud + noise impact
    this._tone({ freq: 130, freqEnd: 45, duration: 0.45, type: 'sawtooth', volume: 0.4 });
    this._tone({ freq: 65,  freqEnd: 30, duration: 0.55, type: 'triangle', volume: 0.25 });
    this._noiseBurst(0.18, 0.18, 800);
  },

  enemyKilled() {
    // Short descending zap
    this._tone({ freq: 720, freqEnd: 220, duration: 0.11, type: 'square', volume: 0.1 });
    this._noiseBurst(0.06, 0.04, 4000);
  },

  waveStart() {
    // Two ascending alert beeps
    this._tone({ freq: 440, duration: 0.14, type: 'square', volume: 0.18 });
    this._tone({ freq: 660, duration: 0.18, type: 'square', volume: 0.18, delay: 0.14 });
  },

  waveClear() {
    // Major-triad chime: C5 → E5 → G5
    this._tone({ freq: 523.25, duration: 0.16, type: 'triangle', volume: 0.18 });
    this._tone({ freq: 659.25, duration: 0.16, type: 'triangle', volume: 0.18, delay: 0.10 });
    this._tone({ freq: 783.99, duration: 0.32, type: 'triangle', volume: 0.20, delay: 0.20 });
  },

  // Sharp bullet pop — matches the silver casing projectile
  gunShot() {
    this._tone({ freq: 1100, freqEnd: 350, duration: 0.06, type: 'square', volume: 0.08, attack: 0.001 });
    this._noiseBurst(0.04, 0.06, 3000);
  },

  // Low whoosh + thump for missile launch
  missileShot() {
    this._tone({ freq: 220, freqEnd: 60, duration: 0.22, type: 'sawtooth', volume: 0.16, attack: 0.005 });
    this._tone({ freq: 80,  freqEnd: 35, duration: 0.30, type: 'triangle', volume: 0.10, attack: 0.005 });
    this._noiseBurst(0.18, 0.07, 1500);
  },

  // High-pitched buzzing zap for laser (called repeatedly while firing)
  laserPulse() {
    this._tone({ freq: 1800, freqEnd: 1500, duration: 0.14, type: 'sawtooth', volume: 0.05, attack: 0.004 });
    this._tone({ freq: 920,  freqEnd: 820,  duration: 0.14, type: 'sine',     volume: 0.035, attack: 0.004 });
  },

  // Light "tink" — picking ore off a node or grabbing a floating pickup
  pickupOre() {
    this._tone({ freq: 880, freqEnd: 1320, duration: 0.07, type: 'triangle', volume: 0.10, attack: 0.002 });
    this._noiseBurst(0.03, 0.03, 5000);
  },

  // Satisfying "clink" — manually delivering ore into HQ
  depositOre() {
    this._tone({ freq: 660, freqEnd: 990, duration: 0.10, type: 'triangle', volume: 0.14, attack: 0.002 });
    this._tone({ freq: 330, freqEnd: 220, duration: 0.12, type: 'sine',     volume: 0.10, attack: 0.003, delay: 0.02 });
  },

  // Solid placement "thunk"
  placed() {
    this._tone({ freq: 320, freqEnd: 140, duration: 0.08, type: 'triangle', volume: 0.18, attack: 0.001 });
    this._noiseBurst(0.05, 0.05, 2000);
  },

  // Resource node depleted — crumbling rock sound
  nodeDepleted() {
    this._tone({ freq: 200, freqEnd: 55, duration: 0.40, type: 'sawtooth', volume: 0.18, attack: 0.005 });
    this._tone({ freq: 80,  freqEnd: 28, duration: 0.55, type: 'triangle', volume: 0.14, attack: 0.01 });
    this._noiseBurst(0.35, 0.18, 1100);
    this._noiseBurst(0.12, 0.10, 4200);
  },

  // HQ destroyed — dramatic descending minor chord + sub-bass + explosion
  gameOver() {
    // Doom chord, each note descending: A3 → F3 → D3
    this._tone({ freq: 220, freqEnd: 110, duration: 0.6, type: 'sawtooth', volume: 0.22, attack: 0.02 });
    this._tone({ freq: 175, freqEnd: 87,  duration: 0.7, type: 'sawtooth', volume: 0.20, attack: 0.02, delay: 0.20 });
    this._tone({ freq: 147, freqEnd: 73,  duration: 1.0, type: 'sawtooth', volume: 0.22, attack: 0.03, delay: 0.45 });
    // Sub-bass rumble underneath
    this._tone({ freq: 60,  freqEnd: 28,  duration: 1.6, type: 'sine',     volume: 0.25, attack: 0.05 });
    // Dying alarm descending
    this._tone({ freq: 880, freqEnd: 200, duration: 1.5, type: 'square',   volume: 0.04, attack: 0.05, delay: 0.1 });
    // Initial explosion crunch
    this._noiseBurst(0.45, 0.16, 700);
  },
};

// Background music — separate from the procedural SFX above so its own volume
// can be set independently. Audio file lives in /resources/music/ (gitignored,
// uploaded to the server out-of-band). If the file isn't present the rest of
// the game still works, the theme just stays silent.
const Music = {
  el: null,
  defaultVolume: 0.02,
  volume: 0.02,
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;
    this.el = document.getElementById('theme-audio');
    if (!this.el) return;
    try {
      const stored = localStorage.getItem('orbit-music-vol');
      if (stored != null) {
        const v = parseFloat(stored);
        if (!isNaN(v)) this.volume = Math.min(1, Math.max(0, v));
      }
    } catch (_) {}
    this.el.loop = true;
    this.el.volume = this.volume;
    // Autoplay policy: only allowed after a user gesture. Caller hooks first
    // pointer/keydown to call Music.start().
  },

  start() {
    if (!this.el) return;
    // .play() returns a promise that rejects if autoplay is blocked
    const p = this.el.play();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  },

  stop() {
    if (!this.el) return;
    this.el.pause();
  },

  setVolume(v) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.el) this.el.volume = this.volume;
    try { localStorage.setItem('orbit-music-vol', String(this.volume)); } catch (_) {}
    return this.volume;
  },
};

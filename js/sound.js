// Tiny procedural sound effects — no audio files.
const Sound = {
  ctx: null,
  enabled: true,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.enabled = false; return; }
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    // one second of white noise, reused by every effect
    const len = this.ctx.sampleRate;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  burst({ dur = 0.14, freq = 900, q = 1.2, gain = 0.5, type = 'lowpass', sweep = 0.4 }) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.7 + Math.random() * 0.6;
    const filt = this.ctx.createBiquadFilter();
    filt.type = type; filt.Q.value = q;
    filt.frequency.setValueAtTime(freq, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(60, freq * sweep), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  dig(id) {
    const b = BLOCKS[id] || {};
    if (b.name && /Sand|Gravel/.test(b.name)) this.burst({ dur: 0.18, freq: 1600, gain: 0.35, sweep: 0.3 });
    else if (b.name && /Log|Planks|Leaves/.test(b.name)) this.burst({ dur: 0.13, freq: 700, gain: 0.45, sweep: 0.5 });
    else if (b.name && /Glass/.test(b.name)) this.burst({ dur: 0.22, freq: 4200, q: 3, gain: 0.3, type: 'bandpass', sweep: 0.9 });
    else this.burst({ dur: 0.12, freq: 520, gain: 0.5, sweep: 0.45 });
  },
  tone({ f0, f1, dur, type = 'square', gain = 0.25, delay = 0, vibrato = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.04, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(this.master);
    if (vibrato) {
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain();
      lfo.frequency.value = vibrato; lg.gain.value = f0 * 0.06;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(t); lfo.stop(t + dur);
    }
    osc.start(t); osc.stop(t + dur + 0.02);
  },
  animal(call, vol = 1) {
    const g = 0.3 * vol;
    if (call === 'oink') {
      this.tone({ f0: 300, f1: 170, dur: 0.12, gain: g });
      this.tone({ f0: 260, f1: 150, dur: 0.1, gain: g * 0.8, delay: 0.17 });
    } else if (call === 'moo') {
      this.tone({ f0: 220, f1: 128, dur: 0.55, type: 'sawtooth', gain: g, vibrato: 7 });
    } else if (call === 'baa') {
      this.tone({ f0: 440, f1: 350, dur: 0.42, gain: g * 0.8, vibrato: 22 });
    } else if (call === 'roar') {
      this.tone({ f0: 180, f1: 60, dur: 1.1, type: 'sawtooth', gain: g, vibrato: 5 });
      this.tone({ f0: 90, f1: 40, dur: 1.3, type: 'square', gain: g * 0.6 });
    } else if (call === 'groan') {
      this.tone({ f0: 150, f1: 96, dur: 0.55, type: 'sawtooth', gain: g * 0.8, vibrato: 9 });
    } else if (call === 'hmm') {
      this.tone({ f0: 240, f1: 200, dur: 0.35, type: 'sine', gain: g * 0.7 });
    } else {
      this.tone({ f0: 900, f1: 620, dur: 0.07, gain: g * 0.7 });
      this.tone({ f0: 780, f1: 520, dur: 0.06, gain: g * 0.5, delay: 0.1 });
    }
  },
  place() { this.burst({ dur: 0.1, freq: 420, gain: 0.45, sweep: 0.5 }); },
  step() { this.burst({ dur: 0.07, freq: 320, gain: 0.16, sweep: 0.6 }); },
  splash() { this.burst({ dur: 0.35, freq: 2600, gain: 0.3, sweep: 0.12 }); },
};

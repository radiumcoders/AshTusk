/** Fully synthesized sound: no audio files. Effects + a generative ambient score. */

export type Mood = 'day' | 'night' | 'cave' | 'boss' | 'triumph';

const SCALES: Record<Mood, number[]> = {
  day: [62, 64, 65, 67, 69, 72, 74], // D dorian
  night: [57, 60, 62, 63, 65, 67, 69], // A minor-ish
  cave: [50, 53, 55, 56, 58, 62],
  boss: [45, 46, 49, 50, 52, 53],
  triumph: [60, 62, 64, 67, 69, 72, 74, 76],
};
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private music!: GainNode;
  private echo!: DelayNode;
  private noiseBuf!: AudioBuffer;
  private step = 0;
  mood: Mood = 'day';
  musicOn = true;

  /** Must be called from a user gesture. */
  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.55;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0.22;
    this.music.connect(this.master);
    this.echo = ctx.createDelay(1);
    this.echo.delayTime.value = 0.38;
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = 2200;
    this.echo.connect(lp).connect(fb).connect(this.echo);
    lp.connect(this.music);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    setInterval(() => this.musicTick(), 250);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.music) this.music.gain.value = this.musicOn ? 0.22 : 0;
    return this.musicOn;
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0, out?: AudioNode) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out ?? this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, freq: number, vol: number, type: BiquadFilterType = 'bandpass', delay = 0, sweep?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  play(name: string, material?: string) {
    if (!this.ctx) return;
    const r = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'dig':
        if (material === 'stone') this.noise(0.07, 2600 * r, 0.35);
        else if (material === 'wood') { this.noise(0.06, 900 * r, 0.35); this.tone(200 * r, 140, 0.05, 'triangle', 0.15); }
        else if (material === 'leaf') this.noise(0.05, 3500 * r, 0.2, 'highpass');
        else if (material === 'glass') this.tone(1800 * r, 1300, 0.06, 'triangle', 0.08);
        else if (material === 'sand') this.noise(0.06, 1400 * r, 0.25);
        else this.noise(0.07, 600 * r, 0.4);
        break;
      case 'break':
        this.noise(0.18, material === 'stone' ? 1800 : 700, 0.45);
        this.tone(140 * r, 60, 0.14, 'sine', 0.3);
        break;
      case 'place':
        this.tone(170 * r, 90, 0.08, 'sine', 0.35);
        this.noise(0.05, 900, 0.2, 'lowpass');
        break;
      case 'swing':
        this.noise(0.13, 500, 0.13, 'bandpass', 0, 2400);
        break;
      case 'hit':
        this.tone(240 * r, 70, 0.11, 'square', 0.12);
        this.noise(0.08, 1200, 0.3);
        break;
      case 'hurt':
        this.tone(280 * r, 100, 0.25, 'sawtooth', 0.14);
        this.noise(0.12, 500, 0.3, 'lowpass');
        break;
      case 'pickup':
        this.tone(700 * r, 1100, 0.05, 'sine', 0.12);
        this.tone(1100 * r, 1500, 0.06, 'sine', 0.08, 0.05);
        break;
      case 'jump':
        this.tone(200, 320, 0.08, 'square', 0.04);
        break;
      case 'craft':
        this.tone(520, 520, 0.08, 'triangle', 0.15);
        this.tone(780, 780, 0.12, 'triangle', 0.15, 0.08);
        this.noise(0.05, 3000, 0.15, 'highpass');
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noise(0.06, 500, 0.3, 'lowpass', i * 0.09);
        break;
      case 'quest':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.35, 'triangle', 0.14, i * 0.09));
        break;
      case 'heart':
        [440, 554, 659, 880, 1108].forEach((f, i) => this.tone(f, f * 1.002, 2.2, 'sine', 0.1, i * 0.12));
        break;
      case 'forge':
        this.noise(2.5, 200, 0.6, 'lowpass', 0, 900);
        this.tone(55, 45, 2.5, 'sawtooth', 0.2);
        [261, 329, 392, 523].forEach((f, i) => this.tone(f, f, 2.4, 'triangle', 0.08, 0.6 + i * 0.15));
        break;
      case 'boss':
        this.tone(55, 35, 2.5, 'sawtooth', 0.3);
        this.noise(2, 150, 0.5, 'lowpass');
        break;
      case 'orb':
        this.tone(900 * r, 300, 0.25, 'sine', 0.08);
        break;
      case 'death':
        [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.4, 'triangle', 0.15, i * 0.22));
        break;
      case 'splash':
        this.noise(0.25, 900, 0.3, 'lowpass', 0, 300);
        break;
      case 'roll':
        this.noise(0.2, 400, 0.18, 'bandpass', 0, 1200);
        break;
      case 'kill':
        this.tone(320 * r, 90, 0.18, 'square', 0.1);
        this.noise(0.18, 900, 0.35);
        break;
      case 'bow':
        this.tone(180 * r, 520, 0.06, 'triangle', 0.15);
        this.noise(0.1, 2600, 0.12, 'highpass');
        break;
      case 'draw':
        this.tone(120, 180, 0.3, 'sawtooth', 0.03);
        break;
      case 'thunk':
        this.tone(220 * r, 120, 0.06, 'square', 0.08);
        break;
      case 'bite':
        this.noise(0.08, 1800, 0.35);
        this.tone(400 * r, 200, 0.05, 'square', 0.06);
        break;
      case 'growl':
        this.tone(90 * r, 70, 0.35, 'sawtooth', 0.08);
        break;
      case 'boom':
        this.noise(0.5, 300, 0.7, 'lowpass', 0, 80);
        this.tone(80, 35, 0.4, 'sine', 0.4);
        break;
      case 'chest':
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, f, 0.2, 'triangle', 0.12, i * 0.07));
        this.noise(0.12, 600, 0.3, 'lowpass');
        break;
      case 'equip':
        this.tone(300, 600, 0.06, 'square', 0.06);
        this.noise(0.06, 3000, 0.15, 'highpass', 0.03);
        break;
      case 'fire':
        this.noise(0.25, 700, 0.3, 'bandpass', 0, 2400);
        this.tone(200, 90, 0.2, 'sawtooth', 0.06);
        break;
      case 'ui':
        this.tone(660, 660, 0.04, 'square', 0.05);
        break;
    }
  }

  private musicTick() {
    const ctx = this.ctx;
    if (!ctx || !this.musicOn || ctx.state !== 'running') return;
    this.step++;
    const scale = SCALES[this.mood];
    const boss = this.mood === 'boss';
    if (this.step % 32 === 1) {
      const root = scale[0] - 12;
      for (const m of [root, root + 7, root + (this.mood === 'day' || this.mood === 'triumph' ? 16 : 15)]) this.pad(mtof(m), 8.5);
    }
    if (boss && this.step % 2 === 0) {
      this.tone(60, 35, 0.18, 'sine', 0.5, 0, this.music);
      if (this.step % 4 === 2) this.noise(0.05, 6000, 0.15, 'highpass');
    }
    const chance = boss ? 0.5 : this.mood === 'triumph' ? 0.55 : 0.28;
    if (this.step % 2 === 0 && Math.random() < chance) {
      const m = scale[Math.floor(Math.random() * scale.length)] + (Math.random() < 0.2 ? 12 : 0);
      this.pluck(mtof(m));
    }
  }

  private pad(f: number, dur: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.frequency.value = 700;
    o.type = 'sawtooth';
    o2.type = 'triangle';
    o.frequency.value = f;
    o2.frequency.value = f * 1.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 2.5);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(lp);
    o2.connect(lp);
    lp.connect(g).connect(this.music);
    o.start(t);
    o2.start(t);
    o.stop(t + dur);
    o2.stop(t + dur);
  }

  private pluck(f: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(g);
    g.connect(this.music);
    g.connect(this.echo);
    o.start(t);
    o.stop(t + 1.7);
  }
}

export const audio = new Sound();

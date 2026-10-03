type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  vol?: number;
  attack?: number;
  glideTo?: number;
  wet?: number;
  delay?: number;
}

interface NoiseOpts {
  vol?: number;
  freq?: number;
  q?: number;
  filter?: BiquadFilterType;
  attack?: number;
  wet?: number;
  sweepTo?: number;
}

type DroneKind = 'room' | 'boss' | 'room2' | 'boss2' | 'none';

/** Map a natural number to a pitch from the harmonic series, folded into one octave. */
export function pitchOf(v: number): number {
  if (v < 0) return pitchOf(-v) / 2;
  if (v === 0) return 110;
  const oct = Math.pow(2, Math.floor(Math.log2(v)));
  return 220 * (v / oct);
}

export class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private dry!: GainNode;
  private wet!: GainNode;
  private noiseBuf!: AudioBuffer;
  private drone: { gain: GainNode; nodes: AudioScheduledSourceNode[] } | null = null;
  private droneKind: DroneKind = 'none';

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(comp).connect(ctx.destination);

    this.dry = ctx.createGain();
    this.dry.connect(this.master);

    // A dark feedback echo: the space between things.
    this.wet = ctx.createGain();
    const delay = ctx.createDelay(2);
    delay.delayTime.value = 0.31;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    this.wet.connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    const wetOut = ctx.createGain();
    wetOut.gain.value = 0.5;
    lp.connect(wetOut).connect(this.master);

    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    if (this.droneKind !== 'none') {
      const k = this.droneKind;
      this.droneKind = 'none';
      this.setDrone(k);
    }
  }

  private out(gain: GainNode, wet: number): void {
    gain.connect(this.dry);
    if (wet > 0) {
      const w = this.ctx!.createGain();
      w.gain.value = wet;
      gain.connect(w).connect(this.wet);
    }
  }

  tone(freq: number, dur: number, o: ToneOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.glideTo), t0 + dur);
    const g = ctx.createGain();
    const vol = o.vol ?? 0.2;
    const a = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    this.out(g, o.wet ?? 0.3);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise(dur: number, o: NoiseOpts = {}): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq ?? 1200, t0);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t0 + dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.2, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g);
    this.out(g, o.wet ?? 0.15);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  bell(freq: number, vol = 0.16, dur = 2.2): void {
    this.tone(freq, dur, { vol, wet: 0.6 });
    this.tone(freq * 2.76, dur * 0.5, { vol: vol * 0.35, wet: 0.6 });
    this.tone(freq * 5.4, dur * 0.25, { vol: vol * 0.15, wet: 0.6 });
  }

  setDrone(kind: DroneKind): void {
    if (kind === this.droneKind) return;
    this.droneKind = kind;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this.drone) {
      const old = this.drone;
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + 2.5);
      for (const n of old.nodes) n.stop(now + 2.6);
      this.drone = null;
    }
    if (kind === 'none') return;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    const boss = kind === 'boss' || kind === 'boss2';
    gain.gain.linearRampToValueAtTime(boss ? 0.16 : 0.11, now + 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = boss ? 520 : 380;
    lp.Q.value = 4;
    lp.connect(gain);
    this.out(gain, 0.4);

    // the other side of zero hums a minor third higher, uneasy
    const base = { room: 55, boss: 41.2, room2: 65.4, boss2: 49, none: 55 }[kind];
    const nodes: AudioScheduledSourceNode[] = [];
    const ratios = { room: [1, 1.5, 2.003], boss: [1, 1.498, 2.01, 1.06], room2: [1, 1.189, 1.5, 2.002], boss2: [1, 1.189, 1.414, 2.01], none: [1] }[kind];
    for (const r of ratios) {
      const o = ctx.createOscillator();
      o.type = r === 1 ? 'sine' : 'triangle';
      o.frequency.value = base * r;
      o.detune.value = (Math.random() - 0.5) * 12;
      const og = ctx.createGain();
      og.gain.value = r === 1 ? 0.9 : 0.35;
      o.connect(og).connect(lp);
      o.start(now);
      nodes.push(o);
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = boss ? 0.5 : 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = boss ? 260 : 160;
    lfo.connect(lfoGain).connect(lp.frequency);
    lfo.start(now);
    nodes.push(lfo);
    this.drone = { gain, nodes };
  }

  // ——— the vocabulary of sounds ———

  swing(): void {
    this.noise(0.12, { vol: 0.08, freq: 2600, q: 0.6, sweepTo: 900, wet: 0.05 });
  }
  hit(v: number): void {
    this.noise(0.09, { vol: 0.22, freq: 900, q: 1.2, wet: 0.1 });
    this.tone(pitchOf(v) * 2, 0.35, { vol: 0.14, type: 'triangle', wet: 0.35 });
  }
  blocked(): void {
    this.tone(70, 0.25, { vol: 0.35, glideTo: 45, wet: 0.1 });
    this.tone(2400, 0.06, { vol: 0.05, type: 'square', wet: 0.2 });
  }
  kill(v: number): void {
    this.bell(pitchOf(v) * 2, 0.18, 2.6);
    this.noise(0.5, { vol: 0.08, freq: 5000, q: 0.3, sweepTo: 12000, wet: 0.4 });
  }
  hurt(): void {
    this.tone(90, 0.5, { vol: 0.45, glideTo: 30, wet: 0.2 });
    this.noise(0.25, { vol: 0.25, freq: 400, q: 0.5, wet: 0.2 });
  }
  compose(): void {
    this.tone(880, 0.12, { vol: 0.05, wet: 0.5 });
  }
  composed(v: number): void {
    this.tone(pitchOf(v) * 4, 0.6, { vol: 0.09, wet: 0.6 });
    this.tone(pitchOf(v) * 2, 0.8, { vol: 0.06, type: 'triangle', wet: 0.6 });
  }
  refuse(): void {
    this.tone(160, 0.18, { vol: 0.12, type: 'square', glideTo: 120, wet: 0.1 });
  }
  jump(): void {
    this.noise(0.1, { vol: 0.035, freq: 700, q: 0.5, sweepTo: 1400, wet: 0 });
  }
  land(): void {
    this.noise(0.08, { vol: 0.05, freq: 300, q: 0.7, wet: 0 });
  }
  dash(): void {
    this.noise(0.22, { vol: 0.09, freq: 1800, q: 0.4, sweepTo: 500, wet: 0.2 });
  }
  pickup(): void {
    const f = [220, 330, 440, 554.37, 660];
    f.forEach((x, i) => this.tone(x, 4, { vol: 0.07, attack: 0.4 + i * 0.25, wet: 0.7 }));
  }
  lamp(): void {
    this.bell(440, 0.08, 3);
    this.bell(660, 0.05, 3);
  }
  fire(): void {
    this.tone(1200, 0.15, { vol: 0.05, glideTo: 500, wet: 0.3 });
  }
  slam(): void {
    this.tone(55, 0.9, { vol: 0.5, glideTo: 28, wet: 0.3 });
    this.noise(0.6, { vol: 0.3, freq: 200, q: 0.4, wet: 0.3 });
  }
  wave(): void {
    this.tone(110, 1.2, { vol: 0.2, type: 'sawtooth', glideTo: 55, wet: 0.4 });
  }
  crack(): void {
    this.noise(1.2, { vol: 0.4, freq: 3000, q: 0.3, sweepTo: 200, wet: 0.6 });
    this.tone(41, 2, { vol: 0.5, wet: 0.5 });
    this.bell(165, 0.2, 4);
  }
  nullify(): void {
    this.tone(440, 1.5, { vol: 0.15, glideTo: 27.5, wet: 0.6 });
  }
  equate(i: number): void {
    this.bell(330 * Math.pow(1.5, i % 4), 0.14, 2.5);
  }
  door(): void {
    this.tone(82.4, 3, { vol: 0.3, attack: 0.3, wet: 0.6 });
    this.tone(123.5, 3, { vol: 0.15, attack: 0.6, wet: 0.6 });
  }
  heartbeat(): void {
    this.tone(48, 0.35, { vol: 0.35, glideTo: 36, wet: 0.2 });
    this.tone(46, 0.35, { vol: 0.25, glideTo: 34, wet: 0.2, delay: 0.22 });
  }
  /** A number crosses zero and becomes its own opposite. */
  turn(): void {
    this.tone(330, 0.5, { vol: 0.12, glideTo: 165, wet: 0.5 });
    this.tone(495, 0.5, { vol: 0.06, glideTo: 990, wet: 0.5 });
  }
  point(): void {
    this.bell(523.25, 0.1, 2.5);
  }
  resolve(): void {
    const f = [110, 165, 220, 277.18, 330, 440];
    f.forEach((x, i) => this.tone(x, 7, { vol: 0.08, attack: 1 + i * 0.3, wet: 0.8 }));
  }
}

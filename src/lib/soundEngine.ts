// ─── 8-bit Sound Engine (Web Audio API, no files) ───────────────────────────
export type MusicMode = "menu" | "main" | "boss" | null;

export interface SoundEngine {
  shoot(weaponKey: string): void;
  reload(): void;
  empty(): void;
  zombieHit(): void;
  zombieDeath(): void;
  barrelHit(): void;
  barrelExplode(): void;
  playerDamage(): void;
  pickup(): void;
  buyWeapon(): void;
  totemAwaken(): void;
  torchLight(): void;
  bossEnrage(): void;
  bossCharge(): void;
  bossDeath(): void;
  roundStart(): void;
  lavaBurn(): void;
  obstacleHit(): void;
  toxicDeath(): void;
  jumpscare(): void;
  setMusic(mode: MusicMode): void;
  getCurrentMusic(): MusicMode;
  init(): void;
  setMusicEnabled(enabled: boolean): void;
  setSfxEnabled(enabled: boolean): void;
  isMusicEnabled(): boolean;
  isSfxEnabled(): boolean;
}

export const soundEngine: SoundEngine = (() => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let currentMusic: MusicMode = null;
  let musicTimers: ReturnType<typeof setTimeout>[] = [];
  let musicOscs: OscillatorNode[] = [];
  let musicNoise: AudioBufferSourceNode | null = null;
  let _musicEnabled = true;
  let _sfxEnabled = true;

  function ensure() {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.25;
      musicGain.connect(master);
      sfxGain = ctx.createGain();
      sfxGain.gain.value = 0.6;
      sfxGain.connect(master);
    }
    if (ctx.state === "suspended") ctx.resume();
    return { ctx: ctx!, sfx: sfxGain!, mus: musicGain! };
  }

  function playTone(
    type: OscillatorType, freq: number, duration: number,
    volume = 0.3, dest?: GainNode, freqEnd?: number, detune?: number,
  ) {
    const { ctx: c, sfx: d } = ensure();
    const t = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) osc.frequency.linearRampToValueAtTime(freqEnd, t + duration);
    if (detune) osc.detune.value = detune;
    gain.gain.setValueAtTime(volume, t);
    gain.gain.linearRampToValueAtTime(0, t + duration);
    osc.connect(gain);
    gain.connect(dest ?? d);
    osc.start(t);
    osc.stop(t + duration);
  }

  function playNoise(duration: number, volume = 0.2, filterFreq = 4000, dest?: GainNode) {
    const { ctx: c, sfx: d } = ensure();
    const t = c.currentTime;
    const bufSize = Math.max(1, Math.floor(c.sampleRate * duration));
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = filterFreq;
    filter.Q.value = 1;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.linearRampToValueAtTime(0, t + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest ?? d);
    src.start(t);
    src.stop(t + duration);
  }

  // ── SFX ──────────────────────────────────────────────────────────────────
  const sfx = {
    shoot(weaponKey: string) {
      switch (weaponKey) {
        case "shotgun":
          playNoise(0.12, 0.35, 3000);
          playTone("square", 400, 0.12, 0.25, undefined, 100);
          break;
        case "smg":
          playNoise(0.05, 0.2, 5000);
          playTone("square", 600, 0.05, 0.2, undefined, 300);
          break;
        case "rifle":
          playNoise(0.07, 0.25, 4500);
          playTone("square", 1000, 0.07, 0.2, undefined, 400);
          break;
        case "lmg":
          playNoise(0.06, 0.22, 4000);
          playTone("square", 500, 0.06, 0.2, undefined, 250);
          break;
        default: // pistol
          playNoise(0.08, 0.2, 4000);
          playTone("square", 800, 0.08, 0.2, undefined, 200);
          break;
      }
    },
    reload() {
      playTone("square", 1200, 0.04, 0.15);
      setTimeout(() => playTone("square", 800, 0.04, 0.15), 80);
    },
    empty() {
      playNoise(0.02, 0.12, 6000);
    },
    zombieHit() {
      playTone("sine", 150, 0.06, 0.15);
      playNoise(0.06, 0.1, 1500);
    },
    zombieDeath() {
      playTone("sawtooth", 300, 0.2, 0.2, undefined, 80);
      playNoise(0.15, 0.15, 2000);
    },
    barrelHit() {
      playTone("square", 2000, 0.03, 0.15);
      playNoise(0.04, 0.1, 6000);
    },
    barrelExplode() {
      playNoise(0.4, 0.4, 2000);
      playTone("sine", 80, 0.5, 0.35, undefined, 20);
      playTone("square", 600, 0.3, 0.2, undefined, 60);
    },
    playerDamage() {
      playTone("square", 400, 0.15, 0.25, undefined, 150);
      playNoise(0.1, 0.15, 3000);
    },
    pickup() {
      playTone("square", 500, 0.1, 0.2, undefined, 1200);
    },
    buyWeapon() {
      playTone("square", 800, 0.06, 0.2);
      setTimeout(() => playTone("square", 1200, 0.08, 0.2), 70);
    },
    totemAwaken() {
      const { ctx: c, sfx: d } = ensure();
      const t = c.currentTime;
      for (const freq of [440, 554, 659]) {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.15, t);
        g.gain.linearRampToValueAtTime(0, t + 0.5);
        osc.connect(g); g.connect(d);
        osc.start(t); osc.stop(t + 0.5);
      }
    },
    torchLight() {
      const { ctx: c, sfx: d } = ensure();
      const t = c.currentTime;
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.linearRampToValueAtTime(800, t + 0.15);
      osc.frequency.linearRampToValueAtTime(400, t + 0.4);
      g.gain.setValueAtTime(0.25, t);
      g.gain.linearRampToValueAtTime(0, t + 0.5);
      osc.connect(g); g.connect(d);
      osc.start(t); osc.stop(t + 0.5);
    },
    bossEnrage() {
      playTone("sawtooth", 80, 0.6, 0.3);
      playNoise(0.5, 0.25, 800);
    },
    bossCharge() {
      const { ctx: c, sfx: d } = ensure();
      const t = c.currentTime;
      const noise = c.createBufferSource();
      const buf = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buf;
      const filter = c.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(500, t);
      filter.frequency.linearRampToValueAtTime(4000, t + 0.3);
      filter.Q.value = 2;
      const gain = c.createGain();
      gain.gain.setValueAtTime(0.2, t);
      gain.gain.linearRampToValueAtTime(0, t + 0.3);
      noise.connect(filter); filter.connect(gain); gain.connect(d);
      noise.start(t); noise.stop(t + 0.3);
    },
    bossDeath() {
      playNoise(0.6, 0.4, 1500);
      playTone("sine", 100, 0.6, 0.35, undefined, 20);
      playTone("square", 200, 0.5, 0.25, undefined, 30);
    },
    roundStart() {
      playTone("square", 440, 0.15, 0.2);
      setTimeout(() => playTone("square", 660, 0.15, 0.2), 160);
    },
    lavaBurn() {
      playNoise(0.1, 0.1, 2000);
    },
    obstacleHit() {
      playNoise(0.04, 0.12, 3000);
      playTone("square", 300, 0.03, 0.08);
    },
    toxicDeath() {
      playTone("sawtooth", 200, 0.25, 0.2, undefined, 100);
      playNoise(0.2, 0.15, 1200);
    },
    jumpscare() {
      const { ctx: c, sfx: d } = ensure();
      const t = c.currentTime;
      // dissonant screech: two detuned sawtooths sweeping up
      for (const freq of [220, 233]) {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.linearRampToValueAtTime(freq * 3, t + 0.08);
        osc.frequency.linearRampToValueAtTime(freq * 0.5, t + 0.6);
        osc.detune.value = 40;
        g.gain.setValueAtTime(0.4, t);
        g.gain.linearRampToValueAtTime(0, t + 0.7);
        osc.connect(g); g.connect(d);
        osc.start(t); osc.stop(t + 0.7);
      }
      // low boom
      playTone("sine", 60, 0.5, 0.35, undefined, 20);
      // harsh noise burst
      playNoise(0.15, 0.3, 3500);
    },
  };

  // ── Music helpers ────────────────────────────────────────────────────────
  function stopMusic() {
    for (const t of musicTimers) clearTimeout(t);
    musicTimers = [];
    for (const o of musicOscs) { try { o.stop(); } catch {} }
    musicOscs = [];
    if (musicNoise) { try { musicNoise.stop(); } catch {} musicNoise = null; }
    currentMusic = null;
  }

  function musicNote(
    type: OscillatorType, freq: number, startBeat: number, beats: number,
    bpm: number, volume = 0.12, dest?: GainNode,
  ) {
    const { ctx: c, mus: d } = ensure();
    const t = c.currentTime;
    const startSec = t + (startBeat / bpm) * 60;
    const durSec = (beats / bpm) * 60;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, startSec);
    gain.gain.linearRampToValueAtTime(volume * 0.7, startSec + durSec * 0.8);
    gain.gain.linearRampToValueAtTime(0, startSec + durSec);
    osc.connect(gain);
    gain.connect(dest ?? d);
    osc.start(startSec);
    osc.stop(startSec + durSec);
    musicOscs.push(osc);
  }

  function musicHihat(startBeat: number, bpm: number, volume = 0.06) {
    const { ctx: c, mus: d } = ensure();
    const t = c.currentTime;
    const startSec = t + (startBeat / bpm) * 60;
    const durSec = (0.5 / bpm) * 60;
    const bufSize = Math.max(1, Math.floor(c.sampleRate * durSec));
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, startSec);
    gain.gain.linearRampToValueAtTime(0, startSec + durSec);
    src.connect(filter); filter.connect(gain); gain.connect(d);
    src.start(startSec); src.stop(startSec + durSec);
  }

  function musicKick(startBeat: number, bpm: number, volume = 0.18) {
    const { ctx: c, mus: d } = ensure();
    const t = c.currentTime;
    const startSec = t + (startBeat / bpm) * 60;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, startSec);
    osc.frequency.linearRampToValueAtTime(40, startSec + 0.08);
    gain.gain.setValueAtTime(volume, startSec);
    gain.gain.linearRampToValueAtTime(0, startSec + 0.15);
    osc.connect(gain); gain.connect(d);
    osc.start(startSec); osc.stop(startSec + 0.15);
    musicOscs.push(osc);
  }

  function musicSnare(startBeat: number, bpm: number, volume = 0.1) {
    const { ctx: c, mus: d } = ensure();
    const t = c.currentTime;
    const startSec = t + (startBeat / bpm) * 60;
    const durSec = (1 / bpm) * 60;
    const bufSize = Math.max(1, Math.floor(c.sampleRate * durSec));
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 3000;
    const gain = c.createGain();
    gain.gain.setValueAtTime(volume, startSec);
    gain.gain.linearRampToValueAtTime(0, startSec + durSec * 0.7);
    src.connect(filter); filter.connect(gain); gain.connect(d);
    src.start(startSec); src.stop(startSec + durSec);
  }

  // ── Music Tracks ─────────────────────────────────────────────────────────

  function playMenuMusic() {
    stopMusic();
    currentMusic = "menu";
    const bpm = 60;
    const bars = 8;
    const beatsPerBar = 4;
    const totalBeats = bars * beatsPerBar;
    const loopMs = (totalBeats / bpm) * 60 * 1000;
    // low drone
    musicNote("sine", 55, 0, totalBeats, bpm, 0.15);
    // sparse arpeggio (minor pentatonic)
    const notes = [165, 196, 220, 262, 294];
    for (let bar = 0; bar < bars; bar++) {
      const beat = bar * beatsPerBar;
      musicNote("square", notes[bar % notes.length], beat, 2, bpm, 0.06);
      musicNote("square", notes[(bar + 2) % notes.length], beat + 2, 2, bpm, 0.04);
    }
    // subtle noise floor
    const { ctx: c, mus: d } = ensure();
    const t = c.currentTime;
    const dur = (totalBeats / bpm) * 60;
    const bufSize = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const filter = c.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 200;
    filter.Q.value = 0.5;
    const gain = c.createGain();
    gain.gain.value = 0.03;
    src.connect(filter); filter.connect(gain); gain.connect(d);
    src.start(t); src.stop(t + dur);
    musicNoise = src;
    const timer = setTimeout(() => { if (currentMusic === "menu") playMenuMusic(); }, loopMs);
    musicTimers.push(timer);
  }

  function playMainMusic() {
    stopMusic();
    currentMusic = "main";
    const bpm = 130;
    const bars = 16;
    const beatsPerBar = 4;
    const totalBeats = bars * beatsPerBar;
    const loopMs = (totalBeats / bpm) * 60 * 1000;
    // bass line (E minor)
    const bassNotes = [82, 98, 110, 123]; // E2, G2, A2, B2
    for (let bar = 0; bar < bars; bar++) {
      const beat = bar * beatsPerBar;
      const note = bassNotes[bar % bassNotes.length];
      musicNote("square", note, beat, 1, bpm, 0.12);
      musicNote("square", note, beat + 1, 1, bpm, 0.10);
      musicNote("square", note * 1.5, beat + 2, 0.5, bpm, 0.08);
      musicNote("square", note, beat + 2.5, 1.5, bpm, 0.10);
    }
    // lead melody (minor scale)
    const leadNotes = [330, 392, 440, 523, 494, 440, 392, 330, 294, 330, 392, 440, 523, 587, 523, 494];
    for (let i = 0; i < totalBeats; i++) {
      if (i >= 8) { // lead enters after 2 bars
        musicNote("square", leadNotes[i % leadNotes.length], i, 0.8, bpm, 0.06);
      }
    }
    // hi-hats
    for (let i = 0; i < totalBeats * 2; i++) {
      musicHihat(i * 0.5, bpm, 0.04);
    }
    // kicks on 1 and 3
    for (let bar = 0; bar < bars; bar++) {
      musicKick(bar * beatsPerBar, bpm, 0.15);
      musicKick(bar * beatsPerBar + 2, bpm, 0.12);
    }
    const timer = setTimeout(() => { if (currentMusic === "main") playMainMusic(); }, loopMs);
    musicTimers.push(timer);
  }

  function playBossMusic() {
    stopMusic();
    currentMusic = "boss";
    const bpm = 155;
    const bars = 8;
    const beatsPerBar = 4;
    const totalBeats = bars * beatsPerBar;
    const loopMs = (totalBeats / bpm) * 60 * 1000;
    // heavy bass pulse (chromatic descent)
    const bassFreqs = [110, 104, 98, 92, 87, 82, 78, 73];
    for (let bar = 0; bar < bars; bar++) {
      const beat = bar * beatsPerBar;
      const note = bassFreqs[bar % bassFreqs.length];
      for (let b = 0; b < 4; b++) {
        musicNote("sawtooth", note, beat + b * 0.5, 0.4, bpm, 0.10);
      }
    }
    // urgent lead (chromatic tension)
    const leadNotes = [440, 466, 494, 523, 494, 466, 440, 415, 440, 466, 494, 523, 554, 523, 494, 466];
    for (let i = 0; i < totalBeats; i++) {
      musicNote("square", leadNotes[i % leadNotes.length], i, 0.6, bpm, 0.07);
    }
    // rapid hi-hats (16th notes)
    for (let i = 0; i < totalBeats * 4; i++) {
      musicHihat(i * 0.25, bpm, 0.035);
    }
    // snares on 2 and 4
    for (let bar = 0; bar < bars; bar++) {
      musicSnare(bar * beatsPerBar + 1, bpm, 0.08);
      musicSnare(bar * beatsPerBar + 3, bpm, 0.08);
    }
    // sub-drop every 4th bar
    for (let bar = 0; bar < bars; bar += 4) {
      const { ctx: c, mus: d } = ensure();
      const t = c.currentTime;
      const startSec = t + (bar * beatsPerBar / bpm) * 60;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(60, startSec);
      osc.frequency.linearRampToValueAtTime(20, startSec + 0.4);
      gain.gain.setValueAtTime(0.2, startSec);
      gain.gain.linearRampToValueAtTime(0, startSec + 0.5);
      osc.connect(gain); gain.connect(d);
      osc.start(startSec); osc.stop(startSec + 0.5);
      musicOscs.push(osc);
    }
    const timer = setTimeout(() => { if (currentMusic === "boss") playBossMusic(); }, loopMs);
    musicTimers.push(timer);
  }

  // ── Public API ───────────────────────────────────────────────────────────
  return {
    ...sfx,
    setMusic(mode: MusicMode) {
      ensure();
      if (mode === currentMusic) return;
      if (!_musicEnabled && mode !== null) {
        currentMusic = mode;
        return;
      }
      switch (mode) {
        case "menu": playMenuMusic(); break;
        case "main": playMainMusic(); break;
        case "boss": playBossMusic(); break;
        case null: stopMusic(); break;
      }
    },
    getCurrentMusic: () => currentMusic,
    init() { ensure(); },
    setMusicEnabled(enabled: boolean) {
      _musicEnabled = enabled;
      ensure();
      if (musicGain) musicGain.gain.value = enabled ? 0.25 : 0;
      if (!enabled) {
        stopMusic();
      } else if (currentMusic) {
        const mode = currentMusic;
        currentMusic = null;
        switch (mode) {
          case "menu": playMenuMusic(); break;
          case "main": playMainMusic(); break;
          case "boss": playBossMusic(); break;
        }
      }
    },
    setSfxEnabled(enabled: boolean) {
      _sfxEnabled = enabled;
      ensure();
      if (sfxGain) sfxGain.gain.value = enabled ? 0.6 : 0;
    },
    isMusicEnabled: () => _musicEnabled,
    isSfxEnabled: () => _sfxEnabled,
  };
})();

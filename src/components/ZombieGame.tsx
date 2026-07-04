import { useEffect, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";

// Dead Sector — original round-based top-down zombie shooter.
// Not affiliated with any existing franchise.

type Vec = { x: number; y: number };

type Bullet = Vec & { vx: number; vy: number; life: number; dmg: number };
type Zombie = Vec & { hp: number; maxHp: number; speed: number; radius: number; type: "walker" | "runner" | "brute" };
type Particle = Vec & { vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type Pickup = Vec & { kind: "ammo" | "health" | "maxammo"; life: number };

type Weapon = {
  name: string;
  dmg: number;
  fireRate: number;
  spread: number;
  pellets: number;
  speed: number;
  magSize: number;
  reserve: number;
  reloadMs: number;
  cost: number;
  auto: boolean;
};

const WEAPONS: Record<string, Weapon> = {
  pistol: { name: "M1911 Sidearm", dmg: 25, fireRate: 220, spread: 0.03, pellets: 1, speed: 900, magSize: 12, reserve: 96, reloadMs: 900, cost: 0, auto: false },
  smg: { name: "MP-40 SMG", dmg: 22, fireRate: 90, spread: 0.08, pellets: 1, speed: 950, magSize: 32, reserve: 192, reloadMs: 1400, cost: 1000, auto: true },
  shotgun: { name: "Trench Gun", dmg: 30, fireRate: 550, spread: 0.28, pellets: 7, speed: 850, magSize: 6, reserve: 48, reloadMs: 1700, cost: 1500, auto: false },
  rifle: { name: "Battle Rifle", dmg: 55, fireRate: 130, spread: 0.04, pellets: 1, speed: 1100, magSize: 24, reserve: 160, reloadMs: 1600, cost: 2500, auto: true },
  lmg: { name: "Heavy MG", dmg: 40, fireRate: 75, spread: 0.1, pellets: 1, speed: 1000, magSize: 75, reserve: 300, reloadMs: 2400, cost: 4000, auto: true },
};

const MAP_W = 2000;
const MAP_H = 2000;
const BOSS_ARENA_SIZE = 1000;

// ─── 8-bit Sound Engine (Web Audio API, no files) ───────────────────────────
type MusicMode = "menu" | "main" | "boss" | null;

const soundEngine = (() => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicGain: GainNode | null = null;
  let sfxGain: GainNode | null = null;
  let currentMusic: MusicMode = null;
  let musicTimers: ReturnType<typeof setTimeout>[] = [];
  let musicOscs: OscillatorNode[] = [];
  let musicNoise: AudioBufferSourceNode | null = null;

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
      switch (mode) {
        case "menu": playMenuMusic(); break;
        case "main": playMainMusic(); break;
        case "boss": playBossMusic(); break;
        case null: stopMusic(); break;
      }
    },
    getCurrentMusic: () => currentMusic,
    init() { ensure(); },
  };
})();

export function ZombieGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startGameRef = useRef<() => void>(() => {});
  const [uiState, setUiState] = useState({
    hp: 100,
    points: 500,
    round: 1,
    zombiesLeft: 0,
    mag: WEAPONS.pistol.magSize,
    reserve: WEAPONS.pistol.reserve,
    weaponName: WEAPONS.pistol.name,
    reloading: false,
    gameOver: false,
    started: false,
    message: "",
    elapsedMs: 0,
  });
  const [showHelp, setShowHelp] = useState(true);
  const isMobile = useIsMobile();

  const stateRef = useRef({
    player: { x: MAP_W / 2, y: MAP_H / 2, r: 14, hp: 100, maxHp: 100, speed: 260, angle: 0 },
    keys: {} as Record<string, boolean>,
    mouse: { x: 0, y: 0, worldX: 0, worldY: 0, down: false },
    bullets: [] as Bullet[],
    zombies: [] as Zombie[],
    particles: [] as Particle[],
    pickups: [] as Pickup[],
    points: 500,
    round: 1,
    zombiesToSpawn: 0,
    zombiesAlive: 0,
    spawnCooldown: 0,
    lastShot: 0,
    currentWeaponKey: "pistol" as keyof typeof WEAPONS,
    weapons: {
      pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve, owned: true },
    } as Record<string, { mag: number; reserve: number; owned: boolean }>,
    reloadingUntil: 0,
    lastDamageTime: 0,
    hitFlash: 0,
    camera: { x: 0, y: 0, shake: 0 },
    buyStations: [
      { x: MAP_W / 2 - 300, y: MAP_H / 2 - 300, weapon: "smg" as keyof typeof WEAPONS },
      { x: MAP_W / 2 + 300, y: MAP_H / 2 - 300, weapon: "shotgun" as keyof typeof WEAPONS },
      { x: MAP_W / 2 - 300, y: MAP_H / 2 + 300, weapon: "rifle" as keyof typeof WEAPONS },
      { x: MAP_W / 2 + 300, y: MAP_H / 2 + 300, weapon: "lmg" as keyof typeof WEAPONS },
    ],
    ammoBoxes: [
      { x: MAP_W / 2, y: MAP_H / 2 - 500 },
      { x: MAP_W / 2, y: MAP_H / 2 + 500 },
    ],
    obstacles: [] as { x: number; y: number; w: number; h: number; type: "rock" | "crate" | "fence" | "barrel"; hp?: number }[],
    totems: [] as { x: number; y: number; kills: number; need: number; active: boolean; id: string }[],
    totemPhase: 0 as 0 | 1 | 2 | 3, // 0=corners, 1=center, 2=transitioning, 3=boss
    transitionFlash: 0,
    bossMode: false,
    boss: null as null | { x: number; y: number; hp: number; maxHp: number; speed: number; radius: number; lastShot: number; phase: number; lastCharge: number; charging: boolean; chargeDirX: number; chargeDirY: number; chargeTimer: number },
    bossBullets: [] as { x: number; y: number; vx: number; vy: number; life: number; dmg: number }[],
    lava: [] as { x: number; y: number; w: number; h: number }[],
    lastLavaDmg: 0,
    won: false,
    messageUntil: 0,
    message: "",
    started: false,
    gameOver: false,
    lastTime: 0,
    round0Started: false,
    startTime: 0,
    endTime: 0,
    decals: [] as { x: number; y: number; r: number; color: string; alpha: number; kind: "blood" | "scorch" }[],
    dirtPatches: [] as { x: number; y: number; r: number; c: string }[],
    grassTufts: [] as { x: number; y: number; c: string }[],
    groundInit: false,
    walkPhase: 0,
    muzzleFlash: 0,
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    // Generate obstacles once
    if (s.obstacles.length === 0) {
      const cx = MAP_W / 2, cy = MAP_H / 2;
      const rects: typeof s.obstacles = [
        // central sandbag pit around spawn (leave gaps)
        { x: cx - 90, y: cy - 140, w: 180, h: 18, type: "fence" },
        { x: cx - 140, y: cy + 122, w: 90, h: 18, type: "fence" },
        { x: cx + 50, y: cy + 122, w: 90, h: 18, type: "fence" },
        { x: cx - 158, y: cy - 90, w: 18, h: 180, type: "fence" },
        { x: cx + 140, y: cy - 90, w: 18, h: 180, type: "fence" },
        // crate stacks near buy stations (spaced to avoid overlap with 80x80 buy stations)
        { x: cx - 430, y: cy - 260, w: 46, h: 46, type: "crate" },
        { x: cx - 350, y: cy - 170, w: 40, h: 40, type: "crate" },
        { x: cx + 340, y: cy - 240, w: 46, h: 46, type: "crate" },
        { x: cx + 370, y: cy + 220, w: 44, h: 44, type: "crate" },
        { x: cx - 410, y: cy + 240, w: 50, h: 50, type: "crate" },
        // rocks scattered
        { x: cx - 620, y: cy - 100, w: 80, h: 70, type: "rock" },
        { x: cx + 560, y: cy + 80, w: 90, h: 80, type: "rock" },
        { x: cx - 200, y: cy - 640, w: 70, h: 60, type: "rock" },
        { x: cx + 220, y: cy + 600, w: 85, h: 70, type: "rock" },
        { x: cx - 700, y: cy + 500, w: 100, h: 90, type: "rock" },
        { x: cx + 680, y: cy - 520, w: 95, h: 85, type: "rock" },
        { x: cx - 500, y: cy + 640, w: 70, h: 60, type: "rock" },
        { x: cx + 500, y: cy - 700, w: 80, h: 70, type: "rock" },
        // long fences forming lanes
        { x: cx - 800, y: cy - 400, w: 200, h: 16, type: "fence" },
        { x: cx + 600, y: cy - 400, w: 200, h: 16, type: "fence" },
        { x: cx - 800, y: cy + 400, w: 200, h: 16, type: "fence" },
        { x: cx + 600, y: cy + 400, w: 200, h: 16, type: "fence" },
        { x: cx - 900, y: cy - 200, w: 16, h: 200, type: "fence" },
        { x: cx + 884, y: cy - 200, w: 16, h: 200, type: "fence" },
        // barrels
        { x: cx - 450, y: cy - 500, w: 28, h: 28, type: "barrel", hp: 50 },
        { x: cx + 450, y: cy - 480, w: 28, h: 28, type: "barrel", hp: 50 },
        { x: cx - 480, y: cy + 460, w: 28, h: 28, type: "barrel", hp: 50 },
        { x: cx + 470, y: cy + 490, w: 28, h: 28, type: "barrel", hp: 50 },
        { x: cx - 250, y: cy + 370, w: 28, h: 28, type: "barrel", hp: 50 },
        { x: cx + 280, y: cy - 380, w: 28, h: 28, type: "barrel", hp: 50 },
        // outer wall crates
        { x: cx - 850, y: cy + 750, w: 60, h: 60, type: "crate" },
        { x: cx + 820, y: cy - 780, w: 60, h: 60, type: "crate" },
        { x: cx - 780, y: cy - 800, w: 55, h: 55, type: "crate" },
        { x: cx + 770, y: cy + 780, w: 55, h: 55, type: "crate" },
      ];
      s.obstacles = rects;
    }

    if (!s.groundInit) {
      s.groundInit = true;
      const rnd = (seed: number) => {
        let x = Math.sin(seed) * 10000; return x - Math.floor(x);
      };
      for (let i = 0; i < 140; i++) {
        s.dirtPatches.push({
          x: rnd(i + 1) * MAP_W,
          y: rnd(i + 999) * MAP_H,
          r: 40 + rnd(i + 500) * 120,
          c: rnd(i + 77) < 0.5 ? "#111611" : "#0d120d",
        });
      }
      for (let i = 0; i < 300; i++) {
        s.grassTufts.push({
          x: rnd(i + 2000) * MAP_W,
          y: rnd(i + 3000) * MAP_H,
          c: rnd(i + 4000) < 0.5 ? "#1a2515" : "#22301a",
        });
      }
    }

    if (s.totems.length === 0) {
      const cx = MAP_W / 2, cy = MAP_H / 2;
      s.totems = [
        { x: cx - 720, y: cy - 720, kills: 0, need: 10, active: true, id: "NW" },
        { x: cx + 720, y: cy - 720, kills: 0, need: 10, active: true, id: "NE" },
        { x: cx - 720, y: cy + 720, kills: 0, need: 10, active: true, id: "SW" },
        { x: cx + 720, y: cy + 720, kills: 0, need: 10, active: true, id: "SE" },
      ];
    }

    // Collision helpers
    const circleRectOverlap = (cx: number, cy: number, r: number, rx: number, ry: number, rw: number, rh: number) => {
      const closestX = Math.max(rx, Math.min(cx, rx + rw));
      const closestY = Math.max(ry, Math.min(cy, ry + rh));
      const dx = cx - closestX, dy = cy - closestY;
      return dx * dx + dy * dy < r * r;
    };
    const resolveCircleAgainstObstacles = (pos: { x: number; y: number }, r: number) => {
      for (const o of s.obstacles) {
        if (!circleRectOverlap(pos.x, pos.y, r, o.x, o.y, o.w, o.h)) continue;
        const closestX = Math.max(o.x, Math.min(pos.x, o.x + o.w));
        const closestY = Math.max(o.y, Math.min(pos.y, o.y + o.h));
        let dx = pos.x - closestX, dy = pos.y - closestY;
        let dist = Math.hypot(dx, dy);
        if (dist === 0) {
          // Push out toward nearest edge
          const leftD = pos.x - o.x, rightD = (o.x + o.w) - pos.x;
          const topD = pos.y - o.y, botD = (o.y + o.h) - pos.y;
          const m = Math.min(leftD, rightD, topD, botD);
          if (m === leftD) { pos.x = o.x - r; }
          else if (m === rightD) { pos.x = o.x + o.w + r; }
          else if (m === topD) { pos.y = o.y - r; }
          else { pos.y = o.y + o.h + r; }
          continue;
        }
        const push = r - dist;
        pos.x += (dx / dist) * push;
        pos.y += (dy / dist) * push;
      }
    };
    (s as any)._resolveObstacles = resolveCircleAgainstObstacles;
    (s as any)._bulletHitsObstacle = (bx: number, by: number) => {
      for (const o of s.obstacles) {
        if (bx >= o.x && bx <= o.x + o.w && by >= o.y && by <= o.y + o.h) return true;
      }
      return false;
    };
    (s as any)._findHitObstacle = (bx: number, by: number) => {
      for (let i = 0; i < s.obstacles.length; i++) {
        const o = s.obstacles[i];
        if (bx >= o.x && bx <= o.x + o.w && by >= o.y && by <= o.y + o.h) return i;
      }
      return -1;
    };

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const kd = (e: KeyboardEvent) => {
      s.keys[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === "r") tryReload();
      if (e.key.toLowerCase() === "e") tryInteract();
    };
    const ku = (e: KeyboardEvent) => {
      s.keys[e.key.toLowerCase()] = false;
    };
    const mm = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      s.mouse.x = e.clientX - rect.left;
      s.mouse.y = e.clientY - rect.top;
    };
    const md = () => {
      if (!s.started) {
        beginGame();
        return;
      }
      s.mouse.down = true;
    };
    const mu = () => (s.mouse.down = false);

    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    canvas.addEventListener("mousemove", mm);
    canvas.addEventListener("mousedown", md);
    // bind mouseup + blur to window so releasing outside canvas still stops firing
    window.addEventListener("mouseup", mu);
    window.addEventListener("blur", mu);
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    function setMessage(m: string, ms = 1800) {
      s.message = m;
      s.messageUntil = performance.now() + ms;
    }

    function startRound(r: number) {
      s.round = r;
      const count = Math.floor(6 + r * 4 + Math.pow(r, 1.4));
      s.zombiesToSpawn = count;
      s.zombiesAlive = 0;
      s.spawnCooldown = 500;
      setMessage(`ROUND ${r}`, 2200);
      soundEngine.roundStart();
      setUiState((u) => ({ ...u, round: r, zombiesLeft: count }));
    }

    function beginGame() {
      if (s.started) return;
      s.started = true;
      s.mouse.down = false;
      s.lastShot = performance.now();
      s.startTime = performance.now();
      s.endTime = 0;
      setUiState((u) => ({ ...u, started: true, elapsedMs: 0 }));
      setShowHelp(false);
      soundEngine.init();
      soundEngine.setMusic("main");
      startRound(1);
    }

    startGameRef.current = beginGame;

    function tryReload() {
      const key = s.currentWeaponKey;
      const w = WEAPONS[key];
      const pw = s.weapons[key];
      if (!pw || pw.mag >= w.magSize || pw.reserve <= 0) return;
      if (performance.now() < s.reloadingUntil) return;
      s.reloadingUntil = performance.now() + w.reloadMs;
      soundEngine.reload();
      setUiState((u) => ({ ...u, reloading: true }));
    }

    function finishReload() {
      const key = s.currentWeaponKey;
      const w = WEAPONS[key];
      const pw = s.weapons[key];
      const need = w.magSize - pw.mag;
      const take = Math.min(need, pw.reserve);
      pw.mag += take;
      pw.reserve -= take;
      setUiState((u) => ({ ...u, mag: pw.mag, reserve: pw.reserve, reloading: false }));
    }

    function tryInteract() {
      // buy station
      for (const b of s.buyStations) {
        const dx = b.x - s.player.x, dy = b.y - s.player.y;
        if (dx * dx + dy * dy < 70 * 70) {
          const w = WEAPONS[b.weapon];
          const owned = s.weapons[b.weapon]?.owned;
          const cost = owned ? Math.floor(w.cost * 0.5) : w.cost; // refill cost
          if (s.points < cost) { setMessage(`Need ${cost} points`); return; }
          s.points -= cost;
          soundEngine.buyWeapon();
          if (!owned) {
            s.weapons[b.weapon] = { mag: w.magSize, reserve: w.reserve, owned: true };
            s.currentWeaponKey = b.weapon;
            setMessage(`Purchased ${w.name}`);
          } else {
            const pw = s.weapons[b.weapon];
            pw.mag = w.magSize;
            pw.reserve = w.reserve;
            setMessage(`Refilled ${w.name}`);
          }
          syncWeaponUi();
          return;
        }
      }
      // ammo box
      for (const a of s.ammoBoxes) {
        const dx = a.x - s.player.x, dy = a.y - s.player.y;
        if (dx * dx + dy * dy < 60 * 60) {
          const cost = 500;
          if (s.points < cost) { setMessage(`Ammo: ${cost} pts`); return; }
          s.points -= cost;
          soundEngine.buyWeapon();
          const w = WEAPONS[s.currentWeaponKey];
          const pw = s.weapons[s.currentWeaponKey];
          pw.reserve = w.reserve;
          setMessage("Max ammo!");
          syncWeaponUi();
          return;
        }
      }
    }

    function syncWeaponUi() {
      const w = WEAPONS[s.currentWeaponKey];
      const pw = s.weapons[s.currentWeaponKey];
      setUiState((u) => ({ ...u, weaponName: w.name, mag: pw.mag, reserve: pw.reserve, points: s.points }));
    }

    function spawnZombie() {
      // spawn just outside camera view
      const angle = Math.random() * Math.PI * 2;
      const dist = 700;
      const x = s.player.x + Math.cos(angle) * dist;
      const y = s.player.y + Math.sin(angle) * dist;
      const cx = Math.max(50, Math.min(MAP_W - 50, x));
      const cy = Math.max(50, Math.min(MAP_H - 50, y));
      let type: Zombie["type"] = "walker";
      const rr = Math.random();
      if (s.round >= 5 && rr < 0.15) type = "brute";
      else if (s.round >= 4 && rr < 0.08) type = "brute";
      else if (s.round >= 3 && rr < 0.22) type = "runner";
      else if (s.round >= 2 && rr < 0.12) type = "runner";
      let hp = 30 + s.round * 15;
      let speed = 50 + s.round * 3;
      let radius = 16;
      if (type === "runner") { hp *= 0.6; speed = 130 + s.round * 6; radius = 13; }
      if (type === "brute") { hp *= 3.5; speed = 45 + s.round * 3; radius = 24; }
      s.zombies.push({ x: cx, y: cy, hp, maxHp: hp, speed, radius, type });
      s.zombiesAlive++;
    }

    function shoot() {
      const key = s.currentWeaponKey;
      const w = WEAPONS[key];
      const pw = s.weapons[key];
      const now = performance.now();
      if (now < s.reloadingUntil) return;
      if (now - s.lastShot < w.fireRate) return;
      if (pw.mag <= 0) { soundEngine.empty(); tryReload(); return; }
      s.lastShot = now;
      pw.mag--;
      const baseAngle = Math.atan2(s.mouse.worldY - s.player.y, s.mouse.worldX - s.player.x);
      for (let i = 0; i < w.pellets; i++) {
        const a = baseAngle + (Math.random() - 0.5) * w.spread * 2;
        s.bullets.push({
          x: s.player.x + Math.cos(a) * 20,
          y: s.player.y + Math.sin(a) * 20,
          vx: Math.cos(a) * w.speed,
          vy: Math.sin(a) * w.speed,
          life: 0.8,
          dmg: w.dmg,
        });
      }
      soundEngine.shoot(key);
      // muzzle flash
      for (let i = 0; i < 4; i++) {
        s.particles.push({
          x: s.player.x + Math.cos(baseAngle) * 22,
          y: s.player.y + Math.sin(baseAngle) * 22,
          vx: Math.cos(baseAngle) * (200 + Math.random() * 100) + (Math.random() - 0.5) * 60,
          vy: Math.sin(baseAngle) * (200 + Math.random() * 100) + (Math.random() - 0.5) * 60,
          life: 0.08, maxLife: 0.08, color: "#ffcc55", size: 4,
        });
      }
      s.camera.shake = Math.min(s.camera.shake + 3, 12);
      s.muzzleFlash = 1;
      // eject shell casing
      const perpA = baseAngle + Math.PI / 2;
      s.particles.push({
        x: s.player.x + Math.cos(baseAngle) * 6,
        y: s.player.y + Math.sin(baseAngle) * 6,
        vx: Math.cos(perpA) * 90 + (Math.random() - 0.5) * 40,
        vy: Math.sin(perpA) * 90 + (Math.random() - 0.5) * 40,
        life: 0.6, maxLife: 0.6, color: "#d4b060", size: 2,
      });
      syncWeaponUi();
    }

    function damagePlayer(amt: number) {
      const now = performance.now();
      if (now - s.lastDamageTime < 400) return;
      s.lastDamageTime = now;
      s.player.hp -= amt;
      s.hitFlash = 1;
      s.camera.shake = Math.min(s.camera.shake + 8, 16);
      soundEngine.playerDamage();
      if (s.player.hp <= 0) {
        s.player.hp = 0;
        s.gameOver = true;
        soundEngine.setMusic("menu");
        setUiState((u) => ({ ...u, gameOver: true, hp: 0 }));
      }
      setUiState((u) => ({ ...u, hp: Math.max(0, s.player.hp) }));
    }

    function explodeBarrel(bx: number, by: number) {
      const EXPLOSION_RADIUS = 100;
      const EXPLOSION_DAMAGE = 80;
      soundEngine.barrelExplode();
      // remove barrel from obstacles
      for (let i = s.obstacles.length - 1; i >= 0; i--) {
        const o = s.obstacles[i];
        if (o.type === "barrel" && bx >= o.x && bx <= o.x + o.w && by >= o.y && by <= o.y + o.h) {
          s.obstacles.splice(i, 1);
          break;
        }
      }
      // fire particles
      for (let i = 0; i < 30; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 80 + Math.random() * 250;
        s.particles.push({
          x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.4 + Math.random() * 0.5, maxLife: 0.9,
          color: Math.random() < 0.4 ? "#ff6600" : Math.random() < 0.6 ? "#ff3300" : "#ffaa00",
          size: 4 + Math.random() * 6,
        });
      }
      // smoke particles
      for (let i = 0; i < 12; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 20 + Math.random() * 60;
        s.particles.push({
          x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.8 + Math.random() * 0.6, maxLife: 1.4,
          color: "#333",
          size: 6 + Math.random() * 8,
        });
      }
      // scorch decal
      s.decals.push({ x: bx, y: by, r: EXPLOSION_RADIUS * 0.7, color: "#1a1008", alpha: 0.6, kind: "scorch" });
      if (s.decals.length > 120) s.decals.shift();
      // camera shake
      s.camera.shake = Math.min(s.camera.shake + 14, 20);
      // damage nearby zombies
      for (let i = s.zombies.length - 1; i >= 0; i--) {
        const z = s.zombies[i];
        const dx = z.x - bx, dy = z.y - by;
        const dist = Math.hypot(dx, dy);
        if (dist < EXPLOSION_RADIUS) {
          const falloff = 1 - dist / EXPLOSION_RADIUS;
          z.hp -= EXPLOSION_DAMAGE * falloff;
          // knockback
          if (dist > 0) {
            z.x += (dx / dist) * 60 * falloff;
            z.y += (dy / dist) * 60 * falloff;
          }
          if (z.hp <= 0) {
            s.zombies.splice(i, 1);
            killZombie(z);
          }
        }
      }
      // damage player
      const pdx = s.player.x - bx, pdy = s.player.y - by;
      const playerDist = Math.hypot(pdx, pdy);
      if (playerDist < EXPLOSION_RADIUS) {
        const falloff = 1 - playerDist / EXPLOSION_RADIUS;
        damagePlayer(Math.round(EXPLOSION_DAMAGE * falloff * 0.5));
      }
    }

    function killZombie(z: Zombie, headshot = false) {
      s.zombiesAlive--;
      const pts = (z.type === "brute" ? 200 : z.type === "runner" ? 80 : 60) + (headshot ? 30 : 0);
      s.points += pts;
      soundEngine.zombieDeath();
      // blood decal
      s.decals.push({ x: z.x, y: z.y, r: z.radius * (1.4 + Math.random() * 0.6), color: "#4a0808", alpha: 0.55, kind: "blood" });
      if (s.decals.length > 120) s.decals.shift();
      // particles
      for (let i = 0; i < 18; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 60 + Math.random() * 180;
        s.particles.push({
          x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.6 + Math.random() * 0.3, maxLife: 0.9,
          color: Math.random() < 0.6 ? "#7a0d0d" : "#3a0808", size: 3 + Math.random() * 3,
        });
      }
      // random pickup
      if (Math.random() < 0.06) {
        s.pickups.push({ x: z.x, y: z.y, kind: Math.random() < 0.5 ? "ammo" : "health", life: 15 });
      }
      // easter egg: totem progression
      for (const t of s.totems) {
        if (!t.active) continue;
        const dx = t.x - z.x, dy = t.y - z.y;
        if (dx * dx + dy * dy < 220 * 220) {
          t.kills++;
          if (t.kills >= t.need) {
            t.active = false;
            soundEngine.totemAwaken();
            setMessage(`TOTEM ${t.id} AWAKENED`);
            if (s.totemPhase === 0 && s.totems.every((tt) => !tt.active)) {
              s.totemPhase = 1;
              s.totems.push({ x: MAP_W / 2, y: MAP_H / 2, kills: 0, need: 25, active: true, id: "CORE" });
              setMessage("THE CORE CALLS...", 2600);
            } else if (s.totemPhase === 1) {
              s.totemPhase = 2;
              s.transitionFlash = 1;
              // insta-kill all zombies
              for (const zz of s.zombies) {
                for (let i = 0; i < 20; i++) {
                  const a = Math.random() * Math.PI * 2;
                  s.particles.push({ x: zz.x, y: zz.y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 240, life: 0.7, maxLife: 0.7, color: "#ffffff", size: 5 });
                }
              }
              s.zombies.length = 0;
              s.zombiesAlive = 0;
              s.zombiesToSpawn = -1;
              setMessage("ASCEND", 2200);
              setTimeout(() => enterBossMap(), 1600);
            }
          }
          break;
        }
      }
      setUiState((u) => ({ ...u, points: s.points, zombiesLeft: Math.max(0, s.zombiesToSpawn) + s.zombiesAlive }));
    }

    function enterBossMap() {
      const cx = MAP_W / 2, cy = MAP_H / 2;
      const half = BOSS_ARENA_SIZE / 2;
      s.bossMode = true;
      s.totemPhase = 3;
      s.zombies.length = 0;
      s.bullets.length = 0;
      s.pickups.length = 0;
      s.zombiesAlive = 0;
      s.zombiesToSpawn = -1;
      s.obstacles = [];
      soundEngine.bossEnrage();
      soundEngine.setMusic("boss");
      // lava pools (repositioned for smaller arena)
      s.lava = [
        { x: cx - 130, y: cy - 50, w: 140, h: 70 },
        { x: cx + 40, y: cy - 30, w: 150, h: 80 },
        { x: cx - 60, y: cy + 70, w: 160, h: 75 },
        { x: cx - 350, y: cy - 120, w: 100, h: 120 },
        { x: cx + 250, y: cy + 60, w: 110, h: 130 },
      ];
      s.totems = [];
      s.player.x = cx;
      s.player.y = cy + half - 60;
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 40);
      // ammo refill box in boss arena
      s.ammoBoxes = [
        { x: cx, y: cy + half - 160 },
      ];
      // boss
      s.boss = {
        x: cx, y: cy - half + 60,
        hp: 4000, maxHp: 4000, speed: 70, radius: 42,
        lastShot: performance.now() + 3000,
        phase: 1, lastCharge: performance.now() + 7000,
        charging: false, chargeDirX: 0, chargeDirY: 0, chargeTimer: 0,
      };
      setMessage("BOSS: THE HARBINGER", 3000);
      setUiState((u) => ({ ...u, round: 999, zombiesLeft: 1, hp: s.player.hp }));
    }

    function update(dt: number) {
      if (!s.started || s.gameOver) return;

      // movement
      let mx = 0, my = 0;
      if (s.keys["w"] || s.keys["arrowup"]) my -= 1;
      if (s.keys["s"] || s.keys["arrowdown"]) my += 1;
      if (s.keys["a"] || s.keys["arrowleft"]) mx -= 1;
      if (s.keys["d"] || s.keys["arrowright"]) mx += 1;
      const len = Math.hypot(mx, my);
      if (len > 0) { mx /= len; my /= len; }
      const sp = s.player.speed * dt;
      // move X then resolve, then Y then resolve, for smooth wall sliding
      s.player.x = Math.max(20, Math.min(MAP_W - 20, s.player.x + mx * sp));
      (s as any)._resolveObstacles(s.player, s.player.r);
      s.player.y = Math.max(20, Math.min(MAP_H - 20, s.player.y + my * sp));
      (s as any)._resolveObstacles(s.player, s.player.r);
      // boss arena bounds
      if (s.bossMode) {
        const cx = MAP_W / 2, cy = MAP_H / 2;
        const half = BOSS_ARENA_SIZE / 2 - s.player.r;
        s.player.x = Math.max(cx - half, Math.min(cx + half, s.player.x));
        s.player.y = Math.max(cy - half, Math.min(cy + half, s.player.y));
      }

      // world mouse
      s.mouse.worldX = s.mouse.x + s.camera.x;
      s.mouse.worldY = s.mouse.y + s.camera.y;
      s.player.angle = Math.atan2(s.mouse.worldY - s.player.y, s.mouse.worldX - s.player.x);

      // reload finish
      if (s.reloadingUntil > 0 && performance.now() >= s.reloadingUntil) {
        s.reloadingUntil = 0;
        finishReload();
      }

      // shoot
      const w = WEAPONS[s.currentWeaponKey];
      if (s.mouse.down) {
        if (w.auto) shoot();
        else if (performance.now() - s.lastShot > w.fireRate) shoot();
      }

      // bullets
      for (let i = s.bullets.length - 1; i >= 0; i--) {
        const b = s.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        let hit = false;
        // obstacle hit
        const hitObsIdx = (s as any)._findHitObstacle(b.x, b.y);
        if (hitObsIdx >= 0) {
          hit = true;
          const obs = s.obstacles[hitObsIdx];
          if (obs.type === "barrel" && obs.hp !== undefined) {
            obs.hp -= b.dmg;
            soundEngine.barrelHit();
            // sparks
            for (let k = 0; k < 3; k++) {
              const a = Math.random() * Math.PI * 2;
              s.particles.push({
                x: b.x, y: b.y, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70,
                life: 0.2, maxLife: 0.2, color: "#fa0", size: 2 + Math.random() * 2,
              });
            }
            if (obs.hp <= 0) {
              const cx = obs.x + obs.w / 2, cy = obs.y + obs.h / 2;
              explodeBarrel(cx, cy);
            }
          } else {
            soundEngine.obstacleHit();
            for (let k = 0; k < 4; k++) {
              const a = Math.random() * Math.PI * 2;
              s.particles.push({
                x: b.x, y: b.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
                life: 0.25, maxLife: 0.25, color: "#888", size: 2 + Math.random() * 2,
              });
            }
          }
        }
        if (!hit) for (let j = s.zombies.length - 1; j >= 0; j--) {
          const z = s.zombies[j];
          const dx = z.x - b.x, dy = z.y - b.y;
          if (dx * dx + dy * dy < z.radius * z.radius) {
            z.hp -= b.dmg;
            hit = true;
            soundEngine.zombieHit();
            for (let k = 0; k < 5; k++) {
              const a = Math.random() * Math.PI * 2;
              s.particles.push({
                x: b.x, y: b.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80,
                life: 0.3, maxLife: 0.3, color: "#a11", size: 2 + Math.random() * 2,
              });
            }
            if (z.hp <= 0) {
              s.zombies.splice(j, 1);
              killZombie(z);
            }
            break;
          }
        }
        if (hit || b.life <= 0 || b.x < 0 || b.y < 0 || b.x > MAP_W || b.y > MAP_H) {
          s.bullets.splice(i, 1);
        }
      }

      // zombies
      for (const z of s.zombies) {
        const dx = s.player.x - z.x, dy = s.player.y - z.y;
        const d = Math.hypot(dx, dy) || 1;
        let dirX = dx / d, dirY = dy / d;

        // Steer around obstacles: if the look-ahead position collides,
        // rotate the desired direction to the side of the blocker that
        // is closer to the player (obstacle avoidance).
        const look = z.radius + 34;
        for (let attempt = 0; attempt < 3; attempt++) {
          let blocker: typeof s.obstacles[number] | null = null;
          const tx = z.x + dirX * look, ty = z.y + dirY * look;
          for (const o of s.obstacles) {
            if (circleRectOverlap(tx, ty, z.radius + 2, o.x, o.y, o.w, o.h)) { blocker = o; break; }
          }
          if (!blocker) break;
          // Choose rotation side: cross product of dir with vector to obstacle center
          const ocx = blocker.x + blocker.w / 2, ocy = blocker.y + blocker.h / 2;
          const cross = dirX * (ocy - z.y) - dirY * (ocx - z.x);
          const sign = cross > 0 ? -1 : 1;
          const ang = sign * (Math.PI / 3); // 60° sidestep per attempt
          const cs = Math.cos(ang), sn = Math.sin(ang);
          const nx = dirX * cs - dirY * sn;
          const ny = dirX * sn + dirY * cs;
          dirX = nx; dirY = ny;
        }

        z.x += dirX * z.speed * dt;
        (s as any)._resolveObstacles(z, z.radius);
        z.y += dirY * z.speed * dt;
        (s as any)._resolveObstacles(z, z.radius);
        if (d < z.radius + s.player.r) {
          damagePlayer(z.type === "brute" ? 25 : z.type === "runner" ? 12 : 15);
        }
      }
      // separate zombies
      for (let i = 0; i < s.zombies.length; i++) {
        for (let j = i + 1; j < s.zombies.length; j++) {
          const a = s.zombies[i], b = s.zombies[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 1;
          const min = a.radius + b.radius;
          if (dist < min) {
            const push = (min - dist) / 2;
            const nx = dx / dist, ny = dy / dist;
            a.x -= nx * push; a.y -= ny * push;
            b.x += nx * push; b.y += ny * push;
          }
        }
      }

      // spawning (disabled in boss mode / transition)
      if (!s.bossMode && s.totemPhase < 2 && s.zombiesToSpawn > 0) {
        s.spawnCooldown -= dt * 1000;
        if (s.spawnCooldown <= 0 && s.zombiesAlive < Math.min(24, 8 + s.round * 2)) {
          spawnZombie();
          s.zombiesToSpawn--;
          s.spawnCooldown = Math.max(200, 800 - s.round * 40);
        }
      }
      if (!s.bossMode && s.totemPhase < 2 && s.zombiesToSpawn === 0 && s.zombiesAlive === 0) {
        setTimeout(() => startRound(s.round + 1), 3000);
        s.zombiesToSpawn = -1; // guard
      }

      // boss logic
      if (s.bossMode && s.boss) {
        const bs = s.boss;
        (bs as any).hitFlash = Math.max(0, ((bs as any).hitFlash || 0) - dt * 4);
        (bs as any).hitShake = Math.max(0, ((bs as any).hitShake || 0) - dt * 40);
        const now = performance.now();

        // phase transition at 60% HP
        if (bs.phase === 1 && bs.hp <= bs.maxHp * 0.6) {
          bs.phase = 2;
          bs.lastCharge = now + 7000;
          soundEngine.bossEnrage();
          setMessage("THE HARBINGER ENRAGES!", 2500);
          s.camera.shake = 12;
          for (let i = 0; i < 30; i++) {
            const aa = Math.random() * Math.PI * 2;
            s.particles.push({ x: bs.x, y: bs.y, vx: Math.cos(aa) * 200, vy: Math.sin(aa) * 200, life: 0.8, maxLife: 0.8, color: Math.random() < 0.5 ? "#ff2200" : "#ffaa00", size: 4 });
          }
        }

        // sprint attack (phase 2): charge at player for 2s every 7s
        if (bs.phase === 2 && !bs.charging && now - bs.lastCharge > 7000) {
          bs.charging = true;
          bs.chargeTimer = 2.0;
          soundEngine.bossCharge();
          s.camera.shake = 8;
          for (let i = 0; i < 15; i++) {
            const aa = Math.random() * Math.PI * 2;
            s.particles.push({ x: bs.x, y: bs.y, vx: Math.cos(aa) * 140, vy: Math.sin(aa) * 140, life: 0.5, maxLife: 0.5, color: "#ff4400", size: 3 });
          }
        }

        if (bs.charging) {
          bs.chargeTimer -= dt;
          // track player direction each frame during sprint
          const sdx = s.player.x - bs.x, sdy = s.player.y - bs.y;
          const sd = Math.hypot(sdx, sdy) || 1;
          bs.chargeDirX = sdx / sd;
          bs.chargeDirY = sdy / sd;
          // sprint toward player at 3.5x speed
          bs.x += bs.chargeDirX * bs.speed * 3.5 * dt;
          (s as any)._resolveObstacles(bs, bs.radius);
          bs.y += bs.chargeDirY * bs.speed * 3.5 * dt;
          (s as any)._resolveObstacles(bs, bs.radius);
          // arena bounds
          const cx = MAP_W / 2, cy = MAP_H / 2, half = BOSS_ARENA_SIZE / 2 - bs.radius;
          bs.x = Math.max(cx - half, Math.min(cx + half, bs.x));
          bs.y = Math.max(cy - half, Math.min(cy + half, bs.y));
          // sprint trail particles
          if (Math.random() < 0.5) {
            const aa = Math.random() * Math.PI * 2;
            s.particles.push({ x: bs.x, y: bs.y, vx: Math.cos(aa) * 80, vy: Math.sin(aa) * 80, life: 0.3, maxLife: 0.3, color: "#ff6600", size: 3 });
          }
          // contact damage during sprint
          const cdx = s.player.x - bs.x, cdy = s.player.y - bs.y;
          if (cdx * cdx + cdy * cdy < (bs.radius + s.player.r + 10) * (bs.radius + s.player.r + 10)) {
            damagePlayer(50);
          }
          // sprint ends
          if (bs.chargeTimer <= 0) {
            bs.charging = false;
            bs.lastCharge = now;
          }
        }

        if (!bs.charging) {
          const dx = s.player.x - bs.x, dy = s.player.y - bs.y;
          const d = Math.hypot(dx, dy) || 1;
          let dirX = dx / d, dirY = dy / d;
          const look = bs.radius + 40;
          for (let attempt = 0; attempt < 3; attempt++) {
            let blocker: typeof s.obstacles[number] | null = null;
            const tx = bs.x + dirX * look, ty = bs.y + dirY * look;
            for (const o of s.obstacles) {
              if (circleRectOverlap(tx, ty, bs.radius + 2, o.x, o.y, o.w, o.h)) { blocker = o; break; }
            }
            if (!blocker) break;
            const ocx = blocker.x + blocker.w / 2, ocy = blocker.y + blocker.h / 2;
            const cross = dirX * (ocy - bs.y) - dirY * (ocx - bs.x);
            const sign = cross > 0 ? -1 : 1;
            const ang = sign * (Math.PI / 3);
            const cs = Math.cos(ang), sn = Math.sin(ang);
            const nx = dirX * cs - dirY * sn;
            const ny = dirX * sn + dirY * cs;
            dirX = nx; dirY = ny;
          }
          bs.x += dirX * bs.speed * dt;
          (s as any)._resolveObstacles(bs, bs.radius);
          bs.y += dirY * bs.speed * dt;
          (s as any)._resolveObstacles(bs, bs.radius);
          // arena bounds
          const cx = MAP_W / 2, cy = MAP_H / 2, half = BOSS_ARENA_SIZE / 2 - bs.radius;
          bs.x = Math.max(cx - half, Math.min(cx + half, bs.x));
          bs.y = Math.max(cy - half, Math.min(cy + half, bs.y));
          if (d < bs.radius + s.player.r) damagePlayer(bs.phase === 2 ? 40 : 30);
          // shoot
          const shootInterval = bs.phase === 2 ? 3500 : 5000;
          if (now - bs.lastShot > shootInterval) {
            bs.lastShot = now;
            const a = Math.atan2(s.player.y - bs.y, s.player.x - bs.x);
            const bulletCount = bs.phase === 2 ? 5 : 3;
            const spread = bs.phase === 2 ? 0.14 : 0.18;
            for (let i = -(bulletCount - 1) / 2; i <= (bulletCount - 1) / 2; i++) {
              const aa = a + i * spread;
              s.bossBullets.push({
                x: bs.x + Math.cos(aa) * bs.radius,
                y: bs.y + Math.sin(aa) * bs.radius,
                vx: Math.cos(aa) * (bs.phase === 2 ? 540 : 480), vy: Math.sin(aa) * (bs.phase === 2 ? 540 : 480),
                life: 2.2, dmg: bs.phase === 2 ? 26 : 22,
              });
            }
            s.camera.shake = Math.min(s.camera.shake + 6, 16);
          }
        }
        // player bullets vs boss
        for (let i = s.bullets.length - 1; i >= 0; i--) {
          const b = s.bullets[i];
          const bdx = bs.x - b.x, bdy = bs.y - b.y;
          if (bdx * bdx + bdy * bdy < bs.radius * bs.radius) {
            bs.hp -= b.dmg;
            soundEngine.zombieHit();
            (bs as any).hitFlash = 1;
            (bs as any).hitShake = Math.min(12, ((bs as any).hitShake || 0) + 6);
            s.camera.shake = Math.max(s.camera.shake, 4);
            s.bullets.splice(i, 1);
            const impactAng = Math.atan2(b.y - bs.y, b.x - bs.x);
            for (let k = 0; k < 10; k++) {
              const aa = impactAng + (Math.random() - 0.5) * 1.4;
              const sp = 140 + Math.random() * 120;
              s.particles.push({ x: b.x, y: b.y, vx: Math.cos(aa) * sp, vy: Math.sin(aa) * sp, life: 0.45, maxLife: 0.45, color: Math.random() < 0.5 ? "#ffdd66" : "#ff5522", size: 3 + Math.random() * 2 });
            }
          }
        }
        if (bs.hp <= 0) {
          for (let i = 0; i < 60; i++) {
            const aa = Math.random() * Math.PI * 2;
            s.particles.push({ x: bs.x, y: bs.y, vx: Math.cos(aa) * 260, vy: Math.sin(aa) * 260, life: 1.0, maxLife: 1.0, color: Math.random() < 0.5 ? "#ffcc55" : "#ff4020", size: 5 });
          }
          soundEngine.bossDeath();
          soundEngine.setMusic("menu");
          s.boss = null;
          s.bossMode = false;
          s.won = true;
          s.points += 5000;
          setUiState((u) => ({ ...u, gameOver: true, points: s.points, zombiesLeft: 0 }));
        }
      }

      // boss bullets
      for (let i = s.bossBullets.length - 1; i >= 0; i--) {
        const b = s.bossBullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        const pdx = b.x - s.player.x, pdy = b.y - s.player.y;
        if (pdx * pdx + pdy * pdy < (s.player.r + 4) * (s.player.r + 4)) {
          damagePlayer(b.dmg);
          s.bossBullets.splice(i, 1); continue;
        }
        if ((s as any)._bulletHitsObstacle(b.x, b.y) || b.life <= 0 || b.x < 0 || b.y < 0 || b.x > MAP_W || b.y > MAP_H) {
          s.bossBullets.splice(i, 1);
        }
      }

      // lava damage
      if (s.lava.length) {
        const now = performance.now();
        for (const l of s.lava) {
          if (s.player.x > l.x && s.player.x < l.x + l.w && s.player.y > l.y && s.player.y < l.y + l.h) {
            if (now - s.lastLavaDmg > 350) {
              s.lastLavaDmg = now;
              soundEngine.lavaBurn();
              s.player.hp -= 8;
              s.hitFlash = Math.max(s.hitFlash, 0.5);
              if (s.player.hp <= 0) {
                s.player.hp = 0; s.gameOver = true;
                setUiState((u) => ({ ...u, gameOver: true, hp: 0 }));
              } else {
                setUiState((u) => ({ ...u, hp: s.player.hp }));
              }
            }
            break;
          }
        }
      }

      // transition flash decay
      if (s.transitionFlash > 0) s.transitionFlash = Math.max(0, s.transitionFlash - dt * 0.6);


      // pickups
      for (let i = s.pickups.length - 1; i >= 0; i--) {
        const p = s.pickups[i];
        p.life -= dt;
        const dx = p.x - s.player.x, dy = p.y - s.player.y;
        if (dx * dx + dy * dy < 30 * 30) {
          soundEngine.pickup();
          if (p.kind === "health") {
            s.player.hp = Math.min(s.player.maxHp, s.player.hp + 40);
            setUiState((u) => ({ ...u, hp: s.player.hp }));
          } else {
            const pw = s.weapons[s.currentWeaponKey];
            const ww = WEAPONS[s.currentWeaponKey];
            pw.reserve = Math.min(ww.reserve, pw.reserve + Math.floor(ww.magSize * 2));
            syncWeaponUi();
          }
          s.pickups.splice(i, 1);
          continue;
        }
        if (p.life <= 0) s.pickups.splice(i, 1);
      }

      // particles
      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92; p.vy *= 0.92;
        p.life -= dt;
        if (p.life <= 0) s.particles.splice(i, 1);
      }

      // camera
      const targetX = s.player.x - canvas.width / 2;
      const targetY = s.player.y - canvas.height / 2;
      s.camera.x += (targetX - s.camera.x) * 0.15;
      s.camera.y += (targetY - s.camera.y) * 0.15;
      if (s.camera.shake > 0) {
        s.camera.x += (Math.random() - 0.5) * s.camera.shake;
        s.camera.y += (Math.random() - 0.5) * s.camera.shake;
        s.camera.shake *= 0.85;
        if (s.camera.shake < 0.1) s.camera.shake = 0;
      }
      s.hitFlash *= 0.9;
      s.muzzleFlash = Math.max(0, s.muzzleFlash - dt * 12);
      // walk bob when moving
      const isMoving = (s.keys["w"] || s.keys["a"] || s.keys["s"] || s.keys["d"] ||
        s.keys["arrowup"] || s.keys["arrowdown"] || s.keys["arrowleft"] || s.keys["arrowright"]);
      if (isMoving) s.walkPhase += dt * 12;
    }

    function drawGrid() {
      // dirt patches (parallax-free, world-anchored)
      if (!s.bossMode) {
        const vx0 = s.camera.x, vy0 = s.camera.y, vx1 = vx0 + canvas.width, vy1 = vy0 + canvas.height;
        for (const p of s.dirtPatches) {
          if (p.x + p.r < vx0 || p.y + p.r < vy0 || p.x - p.r > vx1 || p.y - p.r > vy1) continue;
          ctx.fillStyle = p.c;
          ctx.beginPath();
          ctx.arc(p.x - s.camera.x, p.y - s.camera.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const g of s.grassTufts) {
          if (g.x < vx0 - 4 || g.y < vy0 - 4 || g.x > vx1 + 4 || g.y > vy1 + 4) continue;
          ctx.fillStyle = g.c;
          ctx.fillRect(g.x - s.camera.x, g.y - s.camera.y, 3, 3);
        }
      }
      ctx.strokeStyle = s.bossMode ? "#2a0808" : "#1a1f1a";
      ctx.lineWidth = 1;
      const step = 100;
      const startX = Math.floor(s.camera.x / step) * step;
      const startY = Math.floor(s.camera.y / step) * step;
      for (let x = startX; x < s.camera.x + canvas.width + step; x += step) {
        ctx.beginPath();
        ctx.moveTo(x - s.camera.x, 0);
        ctx.lineTo(x - s.camera.x, canvas.height);
        ctx.stroke();
      }
      for (let y = startY; y < s.camera.y + canvas.height + step; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y - s.camera.y);
        ctx.lineTo(canvas.width, y - s.camera.y);
        ctx.stroke();
      }
    }

    function drawDecals() {
      for (const d of s.decals) {
        const sx = d.x - s.camera.x, sy = d.y - s.camera.y;
        if (sx + d.r < 0 || sy + d.r < 0 || sx - d.r > canvas.width || sy - d.r > canvas.height) continue;
        ctx.globalAlpha = d.alpha;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(sx, sy, d.r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // splatter dots
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + d.r;
          const rr = d.r * (0.7 + ((i * 37) % 10) / 30);
          ctx.beginPath();
          ctx.arc(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, 3 + (i % 2), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    }

    function drawMapBounds() {
      if (s.bossMode) {
        const cx = MAP_W / 2 - s.camera.x, cy = MAP_H / 2 - s.camera.y;
        const arenaHalf = BOSS_ARENA_SIZE / 2;
        const wallHalfX = MAP_W / 2;
        const wallHalfY = MAP_H / 2;
        const cliffW = 55;
        // outer map border
        ctx.strokeStyle = "#1a0e05";
        ctx.lineWidth = 6;
        ctx.strokeRect(-s.camera.x, -s.camera.y, MAP_W, MAP_H);
        // cliff faces — four sides
        const sides: [number, number, number, number][] = [
          // top: from arena top edge upward to wall
          [cx - wallHalfX, cy - wallHalfY, wallHalfX * 2, cliffW],
          // bottom
          [cx - wallHalfX, cy + arenaHalf - cliffW + arenaHalf * 0, wallHalfX * 2, cliffW],
          // left
          [cx - wallHalfX, cy - arenaHalf, cliffW, arenaHalf * 2],
          // right
          [cx + arenaHalf - cliffW, cy - arenaHalf, cliffW, arenaHalf * 2],
        ];
        // dark cliff face fill
        for (const [rx, ry, rw, rh] of sides) {
          const grd = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
          grd.addColorStop(0, "#1a0e05");
          grd.addColorStop(0.5, "#2a1a0a");
          grd.addColorStop(1, "#1a0e05");
          ctx.fillStyle = grd;
          ctx.fillRect(rx, ry, rw, rh);
        }
        // inner cliff lip highlight (arena edge)
        ctx.strokeStyle = "#4a3a20";
        ctx.lineWidth = 3;
        ctx.strokeRect(cx - arenaHalf, cy - arenaHalf, arenaHalf * 2, arenaHalf * 2);
        // outer cliff edge shadow
        ctx.strokeStyle = "#0d0702";
        ctx.lineWidth = 2;
        ctx.strokeRect(cx - wallHalfX, cy - wallHalfY, wallHalfX * 2, wallHalfY * 2);
      } else {
        ctx.strokeStyle = "#3a2a1a";
        ctx.lineWidth = 8;
        ctx.strokeRect(-s.camera.x, -s.camera.y, MAP_W, MAP_H);
      }
    }

    function drawBuyStations() {
      for (const b of s.buyStations) {
        const sx = b.x - s.camera.x, sy = b.y - s.camera.y;
        if (sx < -100 || sy < -100 || sx > canvas.width + 100 || sy > canvas.height + 100) continue;
        const w = WEAPONS[b.weapon];
        const owned = s.weapons[b.weapon]?.owned;
        ctx.fillStyle = "#2a1a0a";
        ctx.strokeStyle = owned ? "#4a7c3a" : "#c9a24a";
        ctx.lineWidth = 3;
        ctx.fillRect(sx - 40, sy - 40, 80, 80);
        ctx.strokeRect(sx - 40, sy - 40, 80, 80);
        ctx.fillStyle = "#c9a24a";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(w.name.split(" ")[0].toUpperCase(), sx, sy - 5);
        ctx.fillStyle = owned ? "#7fbf5f" : "#e0e0e0";
        ctx.fillText(owned ? `REFILL ${Math.floor(w.cost * 0.5)}` : `${w.cost}`, sx, sy + 12);
        const dx = b.x - s.player.x, dy = b.y - s.player.y;
        if (dx * dx + dy * dy < 100 * 100) {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px monospace";
          ctx.fillText("[E] BUY", sx, sy - 55);
        }
      }
      for (const a of s.ammoBoxes) {
        const sx = a.x - s.camera.x, sy = a.y - s.camera.y;
        ctx.fillStyle = "#1a2a1a";
        ctx.strokeStyle = "#4a7c3a";
        ctx.lineWidth = 3;
        ctx.fillRect(sx - 30, sy - 30, 60, 60);
        ctx.strokeRect(sx - 30, sy - 30, 60, 60);
        ctx.fillStyle = "#4a7c3a";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("AMMO", sx, sy - 3);
        ctx.fillText("500", sx, sy + 12);
        const dx = a.x - s.player.x, dy = a.y - s.player.y;
        if (dx * dx + dy * dy < 100 * 100) {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px monospace";
          ctx.fillText("[E] REFILL", sx, sy - 45);
        }
      }
    }

    function drawBossAmmoBoxes() {
      for (const a of s.ammoBoxes) {
        const sx = a.x - s.camera.x, sy = a.y - s.camera.y;
        if (sx < -80 || sy < -80 || sx > canvas.width + 80 || sy > canvas.height + 80) continue;
        const pulse = 0.7 + Math.sin(performance.now() / 300) * 0.3;
        ctx.fillStyle = "#1a2a1a";
        ctx.strokeStyle = `rgba(74,124,58,${pulse})`;
        ctx.lineWidth = 3;
        ctx.fillRect(sx - 30, sy - 30, 60, 60);
        ctx.strokeRect(sx - 30, sy - 30, 60, 60);
        ctx.fillStyle = "#4a7c3a";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("AMMO", sx, sy - 3);
        ctx.fillText("500", sx, sy + 12);
        const dx = a.x - s.player.x, dy = a.y - s.player.y;
        if (dx * dx + dy * dy < 100 * 100) {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px monospace";
          ctx.fillText("[E] REFILL", sx, sy - 45);
        }
      }
    }

    function drawPickups() {
      for (const p of s.pickups) {
        const sx = p.x - s.camera.x, sy = p.y - s.camera.y;
        const pulse = 0.7 + Math.sin(performance.now() / 200) * 0.3;
        ctx.fillStyle = p.kind === "health" ? `rgba(200,60,60,${pulse})` : `rgba(230,200,60,${pulse})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.fillText(p.kind === "health" ? "+" : "A", sx, sy + 4);
      }
    }

    function drawPlayer() {
      const sx = s.player.x - s.camera.x, sy = s.player.y - s.camera.y;
      const bob = Math.sin(s.walkPhase) * 1.5;
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(sx + 3, sy + 6, s.player.r + 2, (s.player.r + 2) * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // aim laser
      const laserLen = 260;
      const grd = ctx.createLinearGradient(sx, sy, sx + Math.cos(s.player.angle) * laserLen, sy + Math.sin(s.player.angle) * laserLen);
      grd.addColorStop(0, "rgba(255,80,60,0.55)");
      grd.addColorStop(1, "rgba(255,80,60,0)");
      ctx.strokeStyle = grd;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(s.player.angle) * 22, sy + Math.sin(s.player.angle) * 22);
      ctx.lineTo(sx + Math.cos(s.player.angle) * laserLen, sy + Math.sin(s.player.angle) * laserLen);
      ctx.stroke();

      ctx.save();
      ctx.translate(sx, sy + bob);
      ctx.rotate(s.player.angle);
      // muzzle flash glow
      if (s.muzzleFlash > 0.05) {
        const mf = s.muzzleFlash;
        const g2 = ctx.createRadialGradient(30, 0, 0, 30, 0, 26);
        g2.addColorStop(0, `rgba(255,230,140,${0.9 * mf})`);
        g2.addColorStop(0.4, `rgba(255,150,50,${0.5 * mf})`);
        g2.addColorStop(1, "rgba(255,120,20,0)");
        ctx.fillStyle = g2;
        ctx.beginPath();
        ctx.arc(30, 0, 26, 0, Math.PI * 2);
        ctx.fill();
      }
      // gun
      ctx.fillStyle = "#333";
      ctx.fillRect(8, -3, 22, 6);
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(28, -2, 4, 4);
      // body
      ctx.fillStyle = "#4a5a3a";
      ctx.beginPath();
      ctx.arc(0, 0, s.player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2a3a1a";
      ctx.lineWidth = 2;
      ctx.stroke();
      // shoulder highlight
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.arc(-3, -4, s.player.r * 0.7, 0, Math.PI * 2);
      ctx.fill();
      // helmet
      ctx.fillStyle = "#2a2a2a";
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(-2, -3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawObstacles() {
      for (const o of s.obstacles) {
        const sx = o.x - s.camera.x, sy = o.y - s.camera.y;
        if (sx + o.w < -20 || sy + o.h < -20 || sx > canvas.width + 20 || sy > canvas.height + 20) continue;
        if (o.type === "rock") {
          ctx.fillStyle = "#3a3a38";
          ctx.strokeStyle = "#1a1a18";
          ctx.lineWidth = 2;
          ctx.beginPath();
          const cx = sx + o.w / 2, cy = sy + o.h / 2;
          const rw = o.w / 2, rh = o.h / 2;
          ctx.moveTo(cx - rw, cy);
          ctx.lineTo(cx - rw * 0.6, cy - rh);
          ctx.lineTo(cx + rw * 0.5, cy - rh * 0.9);
          ctx.lineTo(cx + rw, cy - rh * 0.2);
          ctx.lineTo(cx + rw * 0.7, cy + rh);
          ctx.lineTo(cx - rw * 0.5, cy + rh * 0.9);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = "#4a4a48";
          ctx.beginPath();
          ctx.arc(cx - rw * 0.2, cy - rh * 0.2, Math.min(rw, rh) * 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else if (o.type === "crate") {
          ctx.fillStyle = "#6b4a22";
          ctx.fillRect(sx, sy, o.w, o.h);
          ctx.strokeStyle = "#2a1a08";
          ctx.lineWidth = 3;
          ctx.strokeRect(sx, sy, o.w, o.h);
          ctx.beginPath();
          ctx.moveTo(sx, sy); ctx.lineTo(sx + o.w, sy + o.h);
          ctx.moveTo(sx + o.w, sy); ctx.lineTo(sx, sy + o.h);
          ctx.strokeStyle = "#4a2f10";
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (o.type === "fence") {
          // sandbag wall
          ctx.fillStyle = "#5a4a2a";
          ctx.strokeStyle = "#2a1f0a";
          ctx.lineWidth = 1;
          const bagSize = 18;
          if (o.w >= o.h) {
            for (let i = 0; i < Math.floor(o.w / bagSize); i++) {
              ctx.beginPath();
              ctx.ellipse(sx + i * bagSize + bagSize / 2, sy + o.h / 2, bagSize / 2 - 1, o.h / 2, 0, 0, Math.PI * 2);
              ctx.fill(); ctx.stroke();
            }
          } else {
            for (let i = 0; i < Math.floor(o.h / bagSize); i++) {
              ctx.beginPath();
              ctx.ellipse(sx + o.w / 2, sy + i * bagSize + bagSize / 2, o.w / 2, bagSize / 2 - 1, 0, 0, Math.PI * 2);
              ctx.fill(); ctx.stroke();
            }
          }
        } else if (o.type === "barrel") {
          const cx = sx + o.w / 2, cy = sy + o.h / 2, r = o.w / 2;
          const hpRatio = o.hp !== undefined ? Math.max(0, o.hp / 50) : 1;
          // barrel body darkens as it takes damage
          const cr = Math.round(122 * hpRatio + 30 * (1 - hpRatio));
          const cg = Math.round(42 * hpRatio);
          const cb = Math.round(26 * hpRatio);
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#2a0a05";
          ctx.lineWidth = 2; ctx.stroke();
          // warning stripe when damaged
          if (hpRatio < 0.7) {
            ctx.strokeStyle = hpRatio < 0.4 ? "#ff3300" : "#cc6600";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.strokeStyle = "#4a1a0a";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
          ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
          ctx.stroke();
        }
      }
    }

    function drawZombies() {
      const now = performance.now() / 1000;
      for (const z of s.zombies) {
        const sx = z.x - s.camera.x, sy = z.y - s.camera.y;
        if (sx < -50 || sy < -50 || sx > canvas.width + 50 || sy > canvas.height + 50) continue;
        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.ellipse(sx + 3, sy + z.radius * 0.5, z.radius + 2, (z.radius + 2) * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        const bob = Math.sin(now * 5 + (z.x + z.y) * 0.01) * 1.5;
        const cy = sy + bob;
        const color = z.type === "brute" ? "#3a1a1a" : z.type === "runner" ? "#4a3a1a" : "#3a3a2a";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
        ctx.fill();
        // torn flesh highlight
        ctx.fillStyle = "rgba(120,20,20,0.35)";
        ctx.beginPath();
        ctx.arc(sx - z.radius * 0.4, cy - z.radius * 0.3, z.radius * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#7a0d0d";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
        ctx.stroke();
        // eye glow
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.4);
        const ey = Math.sin(ang) * (z.radius * 0.4);
        const perpX = -Math.sin(ang) * 4, perpY = Math.cos(ang) * 4;
        const glow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 8);
        glow.addColorStop(0, "rgba(255,60,60,0.6)");
        glow.addColorStop(1, "rgba(255,60,60,0)");
        ctx.fillStyle = glow;
        ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff3030";
        ctx.beginPath();
        ctx.arc(sx + ex + perpX, cy + ey + perpY, 2, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, cy + ey - perpY, 2, 0, Math.PI * 2);
        ctx.fill();
        // hp bar
        if (z.hp < z.maxHp) {
          ctx.fillStyle = "#000";
          ctx.fillRect(sx - z.radius, sy - z.radius - 8, z.radius * 2, 4);
          ctx.fillStyle = "#c93030";
          ctx.fillRect(sx - z.radius, sy - z.radius - 8, (z.radius * 2) * (z.hp / z.maxHp), 4);
        }
      }
    }

    function drawBullets() {
      for (const b of s.bullets) {
        const sx = b.x - s.camera.x, sy = b.y - s.camera.y;
        // tracer trail
        const tlen = 14;
        const speed = Math.hypot(b.vx, b.vy) || 1;
        const tx = sx - (b.vx / speed) * tlen;
        const ty = sy - (b.vy / speed) * tlen;
        const grad = ctx.createLinearGradient(tx, ty, sx, sy);
        grad.addColorStop(0, "rgba(255,220,80,0)");
        grad.addColorStop(1, "rgba(255,240,160,0.95)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(sx, sy);
        ctx.stroke();
        // glow head
        const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 6);
        g.addColorStop(0, "rgba(255,240,160,1)");
        g.addColorStop(1, "rgba(255,180,50,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(sx, sy, 6, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    function drawParticles() {
      for (const p of s.particles) {
        const sx = p.x - s.camera.x, sy = p.y - s.camera.y;
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(sx - p.size / 2, sy - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;
    }

    function drawFog() {
      // vignette + darkness
      const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 100,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7
      );
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, "rgba(0,0,0,0.75)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawMessage() {
      if (performance.now() < s.messageUntil && s.message) {
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.font = "bold 48px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillText(s.message, canvas.width / 2 + 2, canvas.height / 2 - 100 + 2);
        ctx.fillStyle = "#c9a24a";
        ctx.fillText(s.message, canvas.width / 2, canvas.height / 2 - 100);
      }
    }

    function drawHitFlash() {
      if (s.hitFlash > 0.01) {
        ctx.fillStyle = `rgba(200,20,20,${s.hitFlash * 0.4})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function drawTotems() {
      const now = performance.now();
      for (const t of s.totems) {
        if (!t.active) continue;
        const sx = t.x - s.camera.x, sy = t.y - s.camera.y;
        if (sx < -80 || sy < -120 || sx > canvas.width + 80 || sy > canvas.height + 120) continue;
        const pulse = 0.6 + Math.sin(now / 260) * 0.4;
        // glow ring on ground (kill radius)
        ctx.strokeStyle = `rgba(180,80,255,${0.15 + pulse * 0.15})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, 220, 0, Math.PI * 2); ctx.stroke();
        // shadow base
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.beginPath(); ctx.ellipse(sx, sy + 34, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
        // pole body
        ctx.fillStyle = "#2a1a10";
        ctx.fillRect(sx - 14, sy - 60, 28, 90);
        ctx.strokeStyle = "#0a0503"; ctx.lineWidth = 2;
        ctx.strokeRect(sx - 14, sy - 60, 28, 90);
        // carvings
        ctx.fillStyle = "#5a2a10";
        ctx.fillRect(sx - 10, sy - 50, 20, 14);
        ctx.fillRect(sx - 10, sy - 20, 20, 14);
        ctx.fillRect(sx - 10, sy + 10, 20, 14);
        // glowing eyes
        ctx.fillStyle = `rgba(200,100,255,${pulse})`;
        ctx.beginPath(); ctx.arc(sx - 5, sy - 43, 2.4, 0, Math.PI * 2);
        ctx.arc(sx + 5, sy - 43, 2.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,80,80,${pulse})`;
        ctx.beginPath(); ctx.arc(sx - 5, sy - 13, 2.4, 0, Math.PI * 2);
        ctx.arc(sx + 5, sy - 13, 2.4, 0, Math.PI * 2); ctx.fill();
        // counter above
        ctx.fillStyle = "#000"; ctx.fillRect(sx - 30, sy - 88, 60, 18);
        ctx.strokeStyle = "#b060ff"; ctx.lineWidth = 1;
        ctx.strokeRect(sx - 30, sy - 88, 60, 18);
        ctx.fillStyle = "#e0c0ff";
        ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
        ctx.fillText(`${t.kills}/${t.need}`, sx, sy - 74);
      }
    }

    function drawLava() {
      const t = performance.now() / 400;
      for (const l of s.lava) {
        const sx = l.x - s.camera.x, sy = l.y - s.camera.y;
        if (sx + l.w < 0 || sy + l.h < 0 || sx > canvas.width || sy > canvas.height) continue;
        // outer glow
        ctx.fillStyle = "#3a0a02";
        ctx.fillRect(sx - 4, sy - 4, l.w + 8, l.h + 8);
        // lava base
        const grd = ctx.createLinearGradient(sx, sy, sx, sy + l.h);
        grd.addColorStop(0, "#ff5a10");
        grd.addColorStop(1, "#8a1a02");
        ctx.fillStyle = grd;
        ctx.fillRect(sx, sy, l.w, l.h);
        // bubbling spots
        ctx.fillStyle = "rgba(255,220,80,0.7)";
        for (let i = 0; i < 4; i++) {
          const bx = sx + ((i * 53 + t * 20) % l.w);
          const by = sy + ((i * 37 + t * 15) % l.h);
          const rr = 3 + Math.sin(t + i) * 2;
          ctx.beginPath(); ctx.arc(bx, by, Math.abs(rr), 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    function drawBoss() {
      if (!s.boss) return;
      const bs = s.boss;
      const flash = (bs as any).hitFlash || 0;
      const shake = (bs as any).hitShake || 0;
      const shx = shake ? (Math.random() - 0.5) * shake : 0;
      const shy = shake ? (Math.random() - 0.5) * shake : 0;
      const sx = bs.x - s.camera.x + shx, sy = bs.y - s.camera.y + shy;
      const pulse = 0.7 + Math.sin(performance.now() / 200) * 0.3;
      const p2 = bs.phase === 2;
      // sprint glow
      if (bs.charging) {
        const sprintPulse = 0.5 + Math.sin(performance.now() / 60) * 0.5;
        ctx.fillStyle = `rgba(255,80,0,${sprintPulse * 0.5})`;
        ctx.beginPath(); ctx.arc(sx, sy, bs.radius * (2 + sprintPulse), 0, Math.PI * 2); ctx.fill();
      }
      // aura (brighter when hit, bigger/redder in phase 2)
      const auraSize = p2 ? 2.8 : 2.2;
      const grd = ctx.createRadialGradient(sx, sy, bs.radius * 0.5, sx, sy, bs.radius * (auraSize + flash * 0.6));
      const gR = p2 ? 200 : 60;
      grd.addColorStop(0, `rgba(255,${gR + flash * 180},${20 + flash * 180},${((p2 ? 0.5 : 0.35) + flash * 0.5) * pulse})`);
      grd.addColorStop(1, `rgba(255,${p2 ? 30 : 60},20,0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(sx - bs.radius * 3.2, sy - bs.radius * 3.2, bs.radius * 6.4, bs.radius * 6.4);
      // body
      const bodyR = p2 ? 36 : 26;
      ctx.fillStyle = flash > 0.05 ? `rgba(${bodyR + flash * 229},${5 + flash * 250},${5 + flash * 250},1)` : (p2 ? "#2a0505" : "#1a0505");
      ctx.beginPath(); ctx.arc(sx, sy, bs.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = flash > 0.05 ? "#ffffff" : (p2 ? "#ff2020" : "#c93030");
      ctx.lineWidth = 4 + flash * 3 + (p2 ? 2 : 0);
      ctx.stroke();
      // spikes (more/bigger in phase 2)
      const now = performance.now() / (p2 ? 350 : 500);
      const spikeCount = p2 ? 12 : 8;
      const spikeLen = p2 ? 18 : 12;
      for (let i = 0; i < spikeCount; i++) {
        const a = (i / spikeCount) * Math.PI * 2 + now;
        ctx.fillStyle = p2 ? "#8a0a0a" : "#5a0a0a";
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * bs.radius, sy + Math.sin(a) * bs.radius);
        ctx.lineTo(sx + Math.cos(a + 0.15) * (bs.radius + spikeLen), sy + Math.sin(a + 0.15) * (bs.radius + spikeLen));
        ctx.lineTo(sx + Math.cos(a + 0.3) * bs.radius, sy + Math.sin(a + 0.3) * bs.radius);
        ctx.closePath(); ctx.fill();
      }
      // eyes (red in phase 2)
      ctx.fillStyle = p2 ? `rgba(255,60,20,${pulse})` : `rgba(255,220,80,${pulse})`;
      const ang = Math.atan2(s.player.y - bs.y, s.player.x - bs.x);
      const ex = Math.cos(ang) * (bs.radius * 0.4);
      const ey = Math.sin(ang) * (bs.radius * 0.4);
      const perpX = -Math.sin(ang) * 10, perpY = Math.cos(ang) * 10;
      ctx.beginPath();
      ctx.arc(sx + ex + perpX, sy + ey + perpY, p2 ? 5 : 4, 0, Math.PI * 2);
      ctx.arc(sx + ex - perpX, sy + ey - perpY, p2 ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
      // hp bar (large, top of screen)
      const barW = Math.min(600, canvas.width - 200);
      const barX = (canvas.width - barW) / 2;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(barX - 4, 46, barW + 8, 22);
      ctx.fillStyle = p2 ? "#5a0505" : "#3a0505";
      ctx.fillRect(barX, 50, barW, 14);
      ctx.fillStyle = p2 ? "#ff2020" : "#c93030";
      ctx.fillRect(barX, 50, barW * (bs.hp / bs.maxHp), 14);
      ctx.fillStyle = "#e0c090"; ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
      ctx.fillText(p2 ? "THE HARBINGER - ENRAGED" : "THE HARBINGER", canvas.width / 2, 44);
    }

    function drawBossBullets() {
      for (const b of s.bossBullets) {
        const sx = b.x - s.camera.x, sy = b.y - s.camera.y;
        ctx.fillStyle = "#ff4020";
        ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,180,80,0.6)";
        ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
      }
    }

    function drawTransitionFlash() {
      if (s.transitionFlash > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, s.transitionFlash)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function render() {
      ctx.fillStyle = s.bossMode ? "#1a0505" : "#0a0d0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawGrid();
      drawDecals();
      drawMapBounds();
      if (s.bossMode) drawLava();
      if (!s.bossMode) drawBuyStations();
      else drawBossAmmoBoxes();
      drawPickups();
      drawObstacles();
      drawTotems();
      drawParticles();
      drawZombies();
      drawBoss();
      drawBossBullets();
      drawPlayer();
      drawBullets();
      drawFog();
      drawHitFlash();
      drawTransitionFlash();
      drawMessage();
    }


    let raf = 0;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - (s.lastTime || t)) / 1000);
      s.lastTime = t;
      update(dt);
      render();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("mouseup", mu);
      window.removeEventListener("blur", mu);
    };
  }, []);

  useEffect(() => {
    if (!uiState.started) return;
    const s = stateRef.current;
    let raf = 0;
    const tick = () => {
      if (s.gameOver) {
        if (!s.endTime) s.endTime = performance.now();
        setUiState((u) => ({ ...u, elapsedMs: s.endTime - s.startTime }));
        return;
      }
      setUiState((u) => ({ ...u, elapsedMs: performance.now() - s.startTime }));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [uiState.started, uiState.gameOver]);

  const formatTime = (ms: number) => {
    const total = Math.max(0, Math.floor(ms));
    const m = Math.floor(total / 60000);
    const sec = Math.floor((total % 60000) / 1000);
    const cs = Math.floor((total % 1000) / 10);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
  };

  const restart = () => window.location.reload();

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none">
      <canvas ref={canvasRef} className="block cursor-crosshair" />

      {/* HUD */}
      {uiState.started && !uiState.gameOver && (
        <>
          <div className="absolute top-2 left-2 sm:top-4 sm:left-4 font-mono text-[#c9a24a] pointer-events-none">
            <div className="text-lg sm:text-3xl font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {uiState.round === 999 ? "BOSS" : `R${uiState.round}`}
              <span className="hidden sm:inline">
                {uiState.round === 999 ? " FIGHT" : ""}
              </span>
            </div>
            {uiState.round !== 999 && (
              <div className="mt-0.5 sm:mt-2 text-[10px] sm:text-sm text-[#a89060]">
                Z: {uiState.zombiesLeft}
              </div>
            )}
          </div>

          <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 font-mono pointer-events-none text-center">
            <div className="hidden sm:block text-[10px] tracking-[0.3em] text-[#8a8a6a]">TIME</div>
            <div className="text-base sm:text-3xl font-bold tabular-nums text-[#c9a24a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {formatTime(uiState.elapsedMs)}
            </div>
          </div>

          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 font-mono text-right pointer-events-none">
            <div className="text-base sm:text-2xl font-bold text-[#c9a24a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {uiState.points}
              <span className="text-[10px] sm:text-base"> PTS</span>
            </div>
          </div>

          {/* Health — bottom on desktop, top-center-under-time on mobile */}
          <div className="absolute left-1/2 -translate-x-1/2 top-14 sm:top-auto sm:left-4 sm:translate-x-0 sm:bottom-4 font-mono pointer-events-none">
            <div className="bg-black/60 border border-[#3a3a1a] px-2 py-1 sm:px-4 sm:py-2 rounded-sm">
              <div className="hidden sm:flex items-center gap-2 mb-1">
                <div className="text-xs text-[#8a8a6a]">HEALTH</div>
              </div>
              <div className="w-40 sm:w-56 h-2 sm:h-3 bg-[#1a0505] border border-[#3a1010]">
                <div
                  className="h-full bg-gradient-to-r from-[#8a1010] to-[#c93030] transition-all"
                  style={{ width: `${uiState.hp}%` }}
                />
              </div>
              <div className="text-[10px] sm:text-xs text-[#a89060] mt-0.5 sm:mt-1 text-center sm:text-left">
                {uiState.hp} / 100
              </div>
            </div>
          </div>

          {/* Weapon — bottom-right on desktop, compact top-right-below-pts on mobile */}
          <div className="absolute top-11 right-2 sm:top-auto sm:right-4 sm:bottom-4 font-mono text-right pointer-events-none">
            <div className="bg-black/60 border border-[#3a3a1a] px-2 py-1 sm:px-4 sm:py-2 rounded-sm">
              <div className="text-[9px] sm:text-xs text-[#8a8a6a] truncate max-w-[110px] sm:max-w-none">
                {uiState.weaponName.toUpperCase()}
              </div>
              <div className="text-lg sm:text-3xl font-bold text-[#c9a24a] leading-tight">
                {uiState.reloading ? "..." : uiState.mag}
                <span className="text-xs sm:text-lg text-[#8a7a4a]"> / {uiState.reserve}</span>
              </div>
              {uiState.reloading && (
                <div className="text-[9px] sm:text-xs text-[#c93030] animate-pulse">RELOADING</div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Start screen */}
      {!uiState.started && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-center font-mono max-w-2xl px-6">
            <h1 className="text-6xl md:text-7xl font-bold text-[#c9a24a] tracking-widest drop-shadow-[0_4px_10px_rgba(201,162,74,0.3)]">
              DEAD SECTOR
            </h1>
            <p className="text-[#a89060] mt-2 tracking-[0.4em] text-sm">SURVIVE THE UNDEAD</p>
            {showHelp && (
              <div className="mt-10 text-left text-[#c0c0a0] text-sm space-y-2 bg-black/40 border border-[#3a3a1a] p-6">
                <div><span className="text-[#c9a24a] font-bold">WASD</span> — Move</div>
                <div><span className="text-[#c9a24a] font-bold">MOUSE</span> — Aim</div>
                <div><span className="text-[#c9a24a] font-bold">LEFT CLICK</span> — Fire</div>
                <div><span className="text-[#c9a24a] font-bold">R</span> — Reload</div>
                <div><span className="text-[#c9a24a] font-bold">E</span> — Buy weapons / ammo at stations</div>
                <div className="pt-2 text-[#8a8a6a] text-xs">
                  Kill zombies to earn points. Spend points at the yellow buy stations to unlock stronger weapons.
                  Green boxes refill ammo. Survive as many rounds as you can.
                </div>
              </div>
            )}
            <button
              onClick={() => {
                startGameRef.current();
              }}
              className="mt-10 px-10 py-3 bg-[#c9a24a] text-black font-bold tracking-widest hover:bg-[#e0b85a] transition-colors"
            >
              DEPLOY
            </button>
          </div>
        </div>
      )}

      {/* Game over / Victory */}
      {uiState.gameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="text-center font-mono">
            {uiState.hp > 0 ? (
              <>
                <h1 className="text-7xl font-bold text-[#c9a24a] tracking-widest drop-shadow-[0_4px_10px_rgba(201,162,74,0.5)]">
                  VICTORY
                </h1>
                <p className="text-[#a89060] mt-4 text-xl">
                  THE HARBINGER HAS FALLEN
                </p>
              </>
            ) : (
              <>
                <h1 className="text-7xl font-bold text-[#c93030] tracking-widest">
                  YOU DIED
                </h1>
                <p className="text-[#a89060] mt-4 text-xl">
                  SURVIVED {uiState.round} ROUND{uiState.round !== 1 ? "S" : ""}
                </p>
              </>
            )}
            <p className="text-[#8a8a6a] mt-1">{uiState.points} TOTAL POINTS</p>
            <p className="text-[#c9a24a] mt-2 text-2xl font-bold tabular-nums tracking-widest">
              TIME {formatTime(uiState.elapsedMs)}
            </p>
            <button
              onClick={restart}
              className="mt-10 px-10 py-3 bg-[#c9a24a] text-black font-bold tracking-widest hover:bg-[#e0b85a] transition-colors"
            >
              REDEPLOY
            </button>
          </div>
        </div>
      )}

      {isMobile && uiState.started && !uiState.gameOver && (
        <TouchControls stateRef={stateRef} canvasRef={canvasRef} />
      )}
    </div>
  );
}

type TouchControlsProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateRef: React.MutableRefObject<any>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
};

function TouchControls({ stateRef, canvasRef }: TouchControlsProps) {
  const moveRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef<HTMLDivElement>(null);
  const [moveKnob, setMoveKnob] = useState({ x: 0, y: 0, active: false });
  const [aimKnob, setAimKnob] = useState({ x: 0, y: 0, active: false });

  useEffect(() => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const JOY_RADIUS = 55;
    const MOVE_DEADZONE = 0.25;

    let movePointerId: number | null = null;
    let moveCenter = { x: 0, y: 0 };
    let aimPointerId: number | null = null;
    let aimCenter = { x: 0, y: 0 };

    const setMoveKeys = (dx: number, dy: number) => {
      const mag = Math.hypot(dx, dy);
      const nx = mag > 0 ? dx / mag : 0;
      const ny = mag > 0 ? dy / mag : 0;
      const active = mag / JOY_RADIUS > MOVE_DEADZONE;
      s.keys["w"] = active && ny < -0.35;
      s.keys["s"] = active && ny > 0.35;
      s.keys["a"] = active && nx < -0.35;
      s.keys["d"] = active && nx > 0.35;
    };

    const clearMoveKeys = () => {
      s.keys["w"] = false;
      s.keys["s"] = false;
      s.keys["a"] = false;
      s.keys["d"] = false;
    };

    const setAim = (dx: number, dy: number) => {
      const mag = Math.hypot(dx, dy);
      if (mag < 6) return;
      const nx = dx / mag;
      const ny = dy / mag;
      // Player is centered on screen; aim relative to canvas center.
      s.mouse.x = canvas.width / 2 + nx * 300;
      s.mouse.y = canvas.height / 2 + ny * 300;
      s.mouse.down = true;
    };

    const clampKnob = (dx: number, dy: number) => {
      const mag = Math.hypot(dx, dy);
      if (mag <= JOY_RADIUS) return { x: dx, y: dy };
      return { x: (dx / mag) * JOY_RADIUS, y: (dy / mag) * JOY_RADIUS };
    };

    const moveEl = moveRef.current;
    const aimEl = aimRef.current;
    if (!moveEl || !aimEl) return;

    const onMoveDown = (e: PointerEvent) => {
      e.preventDefault();
      if (movePointerId !== null) return;
      movePointerId = e.pointerId;
      moveEl.setPointerCapture(e.pointerId);
      const rect = moveEl.getBoundingClientRect();
      moveCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const dx = e.clientX - moveCenter.x;
      const dy = e.clientY - moveCenter.y;
      const k = clampKnob(dx, dy);
      setMoveKnob({ x: k.x, y: k.y, active: true });
      setMoveKeys(k.x, k.y);
    };
    const onMoveMove = (e: PointerEvent) => {
      if (e.pointerId !== movePointerId) return;
      const dx = e.clientX - moveCenter.x;
      const dy = e.clientY - moveCenter.y;
      const k = clampKnob(dx, dy);
      setMoveKnob({ x: k.x, y: k.y, active: true });
      setMoveKeys(k.x, k.y);
    };
    const onMoveUp = (e: PointerEvent) => {
      if (e.pointerId !== movePointerId) return;
      movePointerId = null;
      setMoveKnob({ x: 0, y: 0, active: false });
      clearMoveKeys();
    };

    const onAimDown = (e: PointerEvent) => {
      e.preventDefault();
      if (aimPointerId !== null) return;
      aimPointerId = e.pointerId;
      aimEl.setPointerCapture(e.pointerId);
      const rect = aimEl.getBoundingClientRect();
      aimCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const dx = e.clientX - aimCenter.x;
      const dy = e.clientY - aimCenter.y;
      const k = clampKnob(dx, dy);
      setAimKnob({ x: k.x, y: k.y, active: true });
      setAim(k.x, k.y);
    };
    const onAimMove = (e: PointerEvent) => {
      if (e.pointerId !== aimPointerId) return;
      const dx = e.clientX - aimCenter.x;
      const dy = e.clientY - aimCenter.y;
      const k = clampKnob(dx, dy);
      setAimKnob({ x: k.x, y: k.y, active: true });
      setAim(k.x, k.y);
    };
    const onAimUp = (e: PointerEvent) => {
      if (e.pointerId !== aimPointerId) return;
      aimPointerId = null;
      setAimKnob({ x: 0, y: 0, active: false });
      s.mouse.down = false;
    };

    moveEl.addEventListener("pointerdown", onMoveDown);
    moveEl.addEventListener("pointermove", onMoveMove);
    moveEl.addEventListener("pointerup", onMoveUp);
    moveEl.addEventListener("pointercancel", onMoveUp);
    aimEl.addEventListener("pointerdown", onAimDown);
    aimEl.addEventListener("pointermove", onAimMove);
    aimEl.addEventListener("pointerup", onAimUp);
    aimEl.addEventListener("pointercancel", onAimUp);

    return () => {
      moveEl.removeEventListener("pointerdown", onMoveDown);
      moveEl.removeEventListener("pointermove", onMoveMove);
      moveEl.removeEventListener("pointerup", onMoveUp);
      moveEl.removeEventListener("pointercancel", onMoveUp);
      aimEl.removeEventListener("pointerdown", onAimDown);
      aimEl.removeEventListener("pointermove", onAimMove);
      aimEl.removeEventListener("pointerup", onAimUp);
      aimEl.removeEventListener("pointercancel", onAimUp);
      clearMoveKeys();
      s.mouse.down = false;
    };
  }, [stateRef, canvasRef]);

  const tapKey = (key: string) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key }));
  };

  const joyBase =
    "absolute w-32 h-32 rounded-full bg-black/40 border-2 border-[#c9a24a]/60 touch-none pointer-events-auto";
  const knobStyle = (k: { x: number; y: number; active: boolean }) => ({
    transform: `translate(-50%, -50%) translate(${k.x}px, ${k.y}px)`,
    opacity: k.active ? 1 : 0.7,
  });

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20">
      {/* Movement joystick */}
      <div
        ref={moveRef}
        className={joyBase}
        style={{ left: 24, bottom: 120 }}
      >
        <div
          className="absolute top-1/2 left-1/2 w-14 h-14 rounded-full bg-[#c9a24a]/80 border border-black/40"
          style={knobStyle(moveKnob)}
        />
      </div>

      {/* Aim + fire joystick */}
      <div
        ref={aimRef}
        className={joyBase}
        style={{ right: 24, bottom: 120 }}
      >
        <div
          className="absolute top-1/2 left-1/2 w-14 h-14 rounded-full bg-[#c93030]/80 border border-black/40"
          style={knobStyle(aimKnob)}
        />
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] font-mono text-[#c9a24a] tracking-widest">
          AIM / FIRE
        </div>
      </div>

      {/* Action buttons */}
      <div className="absolute right-6 bottom-[270px] flex flex-col gap-3 pointer-events-auto">
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            tapKey("r");
          }}
          className="w-16 h-16 rounded-full bg-black/60 border-2 border-[#c9a24a]/70 font-mono text-[#c9a24a] text-sm font-bold touch-none"
        >
          RELOAD
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            tapKey("e");
          }}
          className="w-16 h-16 rounded-full bg-black/60 border-2 border-[#c9a24a]/70 font-mono text-[#c9a24a] text-sm font-bold touch-none"
        >
          USE
        </button>
      </div>
    </div>
  );
}

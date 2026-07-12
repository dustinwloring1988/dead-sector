import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGameSettings } from "@/hooks/use-settings";
import { SettingsModal } from "@/components/SettingsModal";

// Dead Sector — original round-based top-down zombie shooter.
// Not affiliated with any existing franchise.

type Vec = { x: number; y: number };

type Bullet = Vec & { vx: number; vy: number; life: number; dmg: number; owner?: 1 | 2 };
type Zombie = Vec & { hp: number; maxHp: number; speed: number; radius: number; type: "walker" | "runner" | "brute" | "fire" | "toxic" | "fireMiniboss" | "toxicMiniboss" | "ghost" | "underworld" | "redPoolMiniboss" | "bluePoolMiniboss" };
type ToxicGas = Vec & { radius: number; life: number; maxLife: number };
type ToxicProjectile = Vec & { vx: number; vy: number; distTraveled: number; maxDist: number };
type Particle = Vec & { vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type Pickup = Vec & { kind: "ammo" | "health" | "maxammo"; life: number };
type Obstacle = Vec & { w: number; h: number; type: "rock" | "crate" | "fence" | "barrel" | "toxicBarrel" | "caveWall" | "door" | "golfDoor"; hp?: number; paid?: number };
type CaveGenerator = Vec & { active: boolean; progressMs: number };

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
  smg: { name: "SMG", dmg: 22, fireRate: 90, spread: 0.08, pellets: 1, speed: 950, magSize: 32, reserve: 192, reloadMs: 1400, cost: 3000, auto: true },
  shotgun: { name: "Shotgun", dmg: 30, fireRate: 550, spread: 0.28, pellets: 7, speed: 850, magSize: 6, reserve: 48, reloadMs: 1700, cost: 4000, auto: false },
  rifle: { name: "Rifle", dmg: 55, fireRate: 130, spread: 0.04, pellets: 1, speed: 1100, magSize: 24, reserve: 160, reloadMs: 1600, cost: 5000, auto: true },
  lmg: { name: "LMG", dmg: 40, fireRate: 75, spread: 0.1, pellets: 1, speed: 1000, magSize: 75, reserve: 300, reloadMs: 2400, cost: 6000, auto: true },
};

const MAP_W = 2000;
const MAP_H = 2600;
const SURFACE_CENTER_Y = 1000;
const BOSS_ARENA_SIZE = 1000;
const CAVE_RECT = { x: 0, y: 2000, w: MAP_W, h: 600 };
const CAVE_ENTRY = { x: 900, w: 200 };
const CAVE_DOOR_COST = 1500;
const GENERATOR_POS = { x: CAVE_RECT.x + CAVE_RECT.w / 2, y: CAVE_RECT.y + CAVE_RECT.h - 120 };
const GENERATOR_INTERACT_DISTANCE = 80;
const GENERATOR_HOLD_MS = 20000;
const DOOR_HOLD_MS = 1500;
const REVIVE_HOLD_MS = 3000;
const REVIVE_HP = 50;
const CAVE_TOTEM_POS = { x: 1700, y: CAVE_RECT.y + CAVE_RECT.h - 140 };
const FLASHLIGHT_CONE_ANGLE = Math.PI / 3;
const FLASHLIGHT_LENGTH = 430;
const GOLF_ROOM_RECT = { x: 0, y: 0, w: MAP_W, h: 450 };
const GOLF_ENTRY = { x: 900, w: 200 };
const GOLF_DOOR_COST = 1000;
const TORCH_POSITIONS = [
  { x: 400, y: 1000 },
  { x: 1600, y: 1000 },
];
const TORCH_LIGHT_RADIUS = 180;

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

export function ZombieGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startGameRef = useRef<() => void>(() => {});
  const [menuMode, setMenuMode] = useState<"main" | "splitLobby">("main");
  const [gameMode, setGameMode] = useState<"single" | "split">("single");
  const [controllerConnected, setControllerConnected] = useState(false);
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
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    showingFireworks: false,
    actualRound: 1,
    hp2: 100,
    points2: 500,
    mag2: WEAPONS.pistol.magSize,
    reserve2: WEAPONS.pistol.reserve,
    weaponName2: WEAPONS.pistol.name,
    reloading2: false,
    kills2: 0,
  });
  const [showHelp, setShowHelp] = useState(true);
  const isMobileWidth = useIsMobile();
  const [isCoarsePointer, setIsCoarsePointer] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(pointer: coarse)");
    const update = () => setIsCoarsePointer(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  // Touch controls whenever the device has a coarse pointer (mobile portrait
  // OR landscape, incl. wider-than-768 landscape phones) or the viewport is
  // narrow enough to be considered mobile.
  const isMobile = isMobileWidth || isCoarsePointer;
  const { settings, update: updateSettings } = useGameSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sync settings to sound engine
  useEffect(() => {
    soundEngine.setMusicEnabled(settings.musicEnabled);
  }, [settings.musicEnabled]);
  useEffect(() => {
    soundEngine.setSfxEnabled(settings.sfxEnabled);
  }, [settings.sfxEnabled]);

  // Ref for game loop access
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const stateRef = useRef({
    player: { x: MAP_W / 2, y: SURFACE_CENTER_Y, r: 14, hp: 100, maxHp: 100, speed: 260, angle: 0 },
    keys: {} as Record<string, boolean>,
    mouse: { x: 0, y: 0, worldX: 0, worldY: 0, down: false },
    mouse2: { x: 0, y: 0, worldX: 0, worldY: 0, down: false },
    bullets: [] as Bullet[],
    zombies: [] as Zombie[],
    particles: [] as Particle[],
    pickups: [] as Pickup[],
    points: 500,
    points2: 500,
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
      { x: CAVE_RECT.x + 200, y: CAVE_RECT.y + CAVE_RECT.h / 2, weapon: "smg" as keyof typeof WEAPONS },
      { x: MAP_W / 2 + 300, y: SURFACE_CENTER_Y - 300, weapon: "shotgun" as keyof typeof WEAPONS },
      { x: 250, y: 225, weapon: "rifle" as keyof typeof WEAPONS },
      { x: MAP_W - 250, y: 225, weapon: "lmg" as keyof typeof WEAPONS },
    ],
    ammoBoxes: [
      { x: MAP_W / 2, y: SURFACE_CENTER_Y + 500 },
    ],
    obstacles: [] as Obstacle[],
    totems: [] as { x: number; y: number; kills: number; need: number; active: boolean; id: string }[],
    totemPhase: 0 as 0 | 1 | 2 | 3 | 4 | 5, // 0=torches, 1=generator, 2=cave totem, 3=center, 4=transitioning, 5=boss
    torches: [] as { x: number; y: number; lit: boolean }[],
    fireZombieToSpawn: false as boolean,
    fireZombieAlive: false as boolean,
    minibossSpawned: false as boolean,
    minibossAlive: false as boolean,
    lastMinibossShot: 0 as number,
    toxicMinibossSpawned: false as boolean,
    toxicMinibossAlive: false as boolean,
    lastToxicMinibossShot: 0 as number,
    toxicProjectiles: [] as ToxicProjectile[],
    transitionFlash: 0,
    bossMode: false,
    boss: null as null | { x: number; y: number; hp: number; maxHp: number; speed: number; radius: number; lastShot: number; phase: number; lastCharge: number; charging: boolean; chargeDirX: number; chargeDirY: number; chargeTimer: number; lastUnderworldSpawn: number },
    bossBullets: [] as { x: number; y: number; vx: number; vy: number; life: number; dmg: number; color?: string }[],
    lava: [] as { x: number; y: number; w: number; h: number }[],
    lastLavaDmg: 0,
    won: false,
    messageUntil: 0,
    message: "",
    messageTarget: 0 as 0 | 1 | 2,
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
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    gameMode: "single" as "single" | "split",
    player2: { x: MAP_W / 2 + 100, y: SURFACE_CENTER_Y, r: 14, hp: 100, maxHp: 100, speed: 260, angle: 0 },
    camera2: { x: 0, y: 0, shake: 0 },
    weapons2: {
      pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve, owned: true },
    } as Record<string, { mag: number; reserve: number; owned: boolean }>,
    currentWeaponKey2: "pistol" as keyof typeof WEAPONS,
    reloadingUntil2: 0,
    lastShot2: 0,
    lastDamageTime2: 0,
    hitFlash2: 0,
    muzzleFlash2: 0,
    walkPhase2: 0,
    kills2: 0,
    shotsFired2: 0,
    shotsHit2: 0,
    player2Alive: true,
    controllerIndex: -1,
    _p2MoveX: 0,
    _p2MoveY: 0,
    _vpIsP2: false,
    showingFireworks: false,
    fireworksTimer: 0,
    generator: {
      x: GENERATOR_POS.x,
      y: GENERATOR_POS.y,
      active: false,
      progressMs: 0,
    } as CaveGenerator,
    jumpscareUntil: 0,
    generatorHintShown: false,
    golfBalls: [] as { x: number; y: number; vx: number; vy: number; hole: number }[],
    golfHoles: [
      { x: GOLF_ROOM_RECT.w / 2 - 300, y: 250 },
      { x: GOLF_ROOM_RECT.w / 2 + 300, y: 250 },
    ] as { x: number; y: number }[],
    golfCompleted: false,
    golfDoorOpened: false,
    golfTargetBalls: [] as { x: number; y: number; color: "red" | "blue"; spawned: boolean }[],
    lastPoolMinibossShot: 0 as number,
    toxicGas: [] as ToxicGas[],
    toxicZombieSpawned: false,
    lastToxicDmg: 0,
    ghostSpawnTimer: 0,
    portalActive: false,
    portalPos: null as null | { x: number; y: number },
    glowingCrate: null as null | { x: number; y: number; w: number; h: number; hp: number },
    portalRoundPending: false,
    portalSpawnTimer: 0,
    _doorHoldStartP1: 0,
    _doorHoldStartP2: 0,
    _reviveHoldStart: 0,
    _reviveTarget: 0 as 0 | 1 | 2,
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;

    // Generate obstacles once
    if (s.obstacles.length === 0) {
      const cx = MAP_W / 2, cy = SURFACE_CENTER_Y;
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
        // toxic barrels in cave
        { x: CAVE_RECT.x + 200, y: CAVE_RECT.y + 150, w: 28, h: 28, type: "toxicBarrel", hp: 50 },
        { x: CAVE_RECT.x + CAVE_RECT.w - 250, y: CAVE_RECT.y + 200, w: 28, h: 28, type: "toxicBarrel", hp: 50 },
        { x: CAVE_RECT.x + CAVE_RECT.w / 2, y: CAVE_RECT.y + CAVE_RECT.h - 200, w: 28, h: 28, type: "toxicBarrel", hp: 50 },
        // outer wall crates
        { x: cx - 850, y: cy + 750, w: 60, h: 60, type: "crate" },
        { x: cx + 770, y: cy + 780, w: 55, h: 55, type: "crate" },
        // cave entrance and chamber at the bottom of the map
        { x: CAVE_RECT.x + 40, y: CAVE_RECT.y, w: CAVE_ENTRY.x - CAVE_RECT.x - 40, h: 32, type: "caveWall" },
        { x: CAVE_ENTRY.x + CAVE_ENTRY.w, y: CAVE_RECT.y, w: CAVE_RECT.x + CAVE_RECT.w - (CAVE_ENTRY.x + CAVE_ENTRY.w) - 40, h: 32, type: "caveWall" },
        { x: CAVE_ENTRY.x, y: CAVE_RECT.y, w: CAVE_ENTRY.w, h: 42, type: "door" },
        { x: CAVE_RECT.x, y: CAVE_RECT.y, w: 40, h: CAVE_RECT.h, type: "caveWall" },
        { x: CAVE_RECT.x + CAVE_RECT.w - 40, y: CAVE_RECT.y, w: 40, h: CAVE_RECT.h, type: "caveWall" },
        { x: CAVE_RECT.x, y: CAVE_RECT.y + CAVE_RECT.h - 40, w: CAVE_RECT.w, h: 40, type: "caveWall" },
        // golf room entrance and chamber at the top of the map
        { x: GOLF_ROOM_RECT.x + 40, y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 32, w: GOLF_ENTRY.x - GOLF_ROOM_RECT.x - 40, h: 32, type: "caveWall" },
        { x: GOLF_ENTRY.x + GOLF_ENTRY.w, y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 32, w: GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w - (GOLF_ENTRY.x + GOLF_ENTRY.w) - 40, h: 32, type: "caveWall" },
        { x: GOLF_ENTRY.x, y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 42, w: GOLF_ENTRY.w, h: 42, type: "golfDoor" },
        { x: GOLF_ROOM_RECT.x, y: GOLF_ROOM_RECT.y, w: 40, h: GOLF_ROOM_RECT.h, type: "caveWall" },
        { x: GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w - 40, y: GOLF_ROOM_RECT.y, w: 40, h: GOLF_ROOM_RECT.h, type: "caveWall" },
        { x: GOLF_ROOM_RECT.x, y: GOLF_ROOM_RECT.y, w: GOLF_ROOM_RECT.w, h: 40, type: "caveWall" },
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

    if (s.torches.length === 0) {
      s.torches = TORCH_POSITIONS.map((p) => ({ x: p.x, y: p.y, lit: false }));
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

    const isInCave = (x: number, y: number) =>
      x >= CAVE_RECT.x && x <= CAVE_RECT.x + CAVE_RECT.w && y >= CAVE_RECT.y && y <= CAVE_RECT.y + CAVE_RECT.h;
    const isInGolfRoom = (x: number, y: number) =>
      x >= GOLF_ROOM_RECT.x && x <= GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w && y >= GOLF_ROOM_RECT.y && y <= GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h;

    const caveDark = () => isInCave(s.player.x, s.player.y) && !s.generator?.active;
    const isInPlayerFlashlight = (wx: number, wy: number, px: number, py: number, pAngle: number) => {
      const objInCave = isInCave(wx, wy);
      const playerInCave = isInCave(px, py);
      if (objInCave && !playerInCave) return false;
      if (playerInCave && !s.generator?.active) {
        const dx = wx - px, dy = wy - py;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > FLASHLIGHT_LENGTH) return false;
        const angle = Math.atan2(dy, dx);
        let diff = angle - pAngle;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return Math.abs(diff) < FLASHLIGHT_CONE_ANGLE / 2;
      }
      return !objInCave;
    };
    const isInFlashlight = (wx: number, wy: number) => {
      if (s.generator?.active) return true;
      if (isInPlayerFlashlight(wx, wy, s.player.x, s.player.y, s.player.angle)) return true;
      if (s.gameMode === "split" && s.player2Alive) {
        if (isInPlayerFlashlight(wx, wy, s.player2.x, s.player2.y, s.player2.angle)) return true;
      }
      return false;
    };

    const CAVE_ENTRY_TARGET = { x: CAVE_ENTRY.x + CAVE_ENTRY.w / 2, y: CAVE_RECT.y + 64 };
    const CAVE_EXIT_TARGET = { x: CAVE_ENTRY.x + CAVE_ENTRY.w / 2, y: CAVE_RECT.y - 44 };
    const GOLF_ENTRY_TARGET = { x: GOLF_ENTRY.x + GOLF_ENTRY.w / 2, y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 22 };
    const GOLF_EXIT_TARGET = { x: GOLF_ENTRY.x + GOLF_ENTRY.w / 2, y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h + 44 };

    const getZombiePursuitTarget = (z: Zombie) => {
      // Find closest alive player
      let targetPlayer: typeof s.player | null = null;
      let targetDist = Infinity;
      if (s.player.hp > 0) {
        targetPlayer = s.player;
        targetDist = Math.hypot(s.player.x - z.x, s.player.y - z.y);
      }
      if (s.gameMode === "split" && s.player2Alive) {
        const d2 = Math.hypot(s.player2.x - z.x, s.player2.y - z.y);
        if (d2 < targetDist) {
          targetPlayer = s.player2;
          targetDist = d2;
        }
      }
      if (!targetPlayer) return { x: z.x, y: z.y };

      const playerInCave = isInCave(targetPlayer.x, targetPlayer.y);
      const playerInGolf = isInGolfRoom(targetPlayer.x, targetPlayer.y);
      const zombieInCave = isInCave(z.x, z.y);
      const zombieInGolf = isInGolfRoom(z.x, z.y);

      if (playerInCave && !zombieInCave) return CAVE_ENTRY_TARGET;
      if (playerInGolf && !zombieInGolf) return GOLF_ENTRY_TARGET;
      if (!playerInCave && zombieInCave) return CAVE_EXIT_TARGET;
      if (!playerInGolf && zombieInGolf) return GOLF_EXIT_TARGET;

      return { x: targetPlayer.x, y: targetPlayer.y };
    };

    const caveLights = [
      { x: CAVE_RECT.x + 120, y: CAVE_RECT.y + 70 },
      { x: CAVE_RECT.x + CAVE_RECT.w - 120, y: CAVE_RECT.y + 70 },
      { x: CAVE_RECT.x + 120, y: CAVE_RECT.y + CAVE_RECT.h - 78 },
      { x: CAVE_RECT.x + CAVE_RECT.w - 120, y: CAVE_RECT.y + CAVE_RECT.h - 78 },
      { x: CAVE_RECT.x + CAVE_RECT.w / 2, y: CAVE_RECT.y + 90 },
    ];

    function drawCaveArea() {
      const sx = CAVE_RECT.x - s.camera.x;
      const sy = CAVE_RECT.y - s.camera.y;
      if (sx > canvas.width || sy > canvas.height || sx + CAVE_RECT.w < 0 || sy + CAVE_RECT.h < 0) return;

      const cp = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
      const playerInCave = isInCave(cp.x, cp.y);
      const cavePower = !!s.generator?.active;
      const base = ctx.createLinearGradient(sx, sy, sx, sy + CAVE_RECT.h);
      base.addColorStop(0, playerInCave ? (cavePower ? "#1d1814" : "#090705") : "#020202");
      base.addColorStop(0.45, playerInCave ? (cavePower ? "#15100d" : "#050403") : "#010101");
      base.addColorStop(1, playerInCave ? (cavePower ? "#221b15" : "#030202") : "#000000");
      ctx.fillStyle = base;
      ctx.fillRect(sx, sy, CAVE_RECT.w, CAVE_RECT.h);

      if (!playerInCave) {
        // Hide the cave interior from outside the entrance.
        ctx.fillStyle = "rgba(0,0,0,0.95)";
        ctx.fillRect(sx + 16, sy + 24, CAVE_RECT.w - 32, CAVE_RECT.h - 24);
        ctx.fillStyle = "rgba(20,16,12,0.95)";
        ctx.fillRect(sx, sy, CAVE_RECT.w, 42);
        ctx.fillRect(sx + 16, sy + 42, CAVE_RECT.w - 32, 20);
      }

      // rugged cave floor texture
      const specks = cavePower
        ? [
            [80, 80, 90], [180, 150, 70], [290, 310, 110], [480, 260, 80], [620, 120, 95],
            [120, 410, 120], [360, 460, 95], [560, 380, 120], [700, 470, 70],
          ]
        : [
            [70, 70, 110], [170, 160, 90], [300, 330, 130], [500, 240, 120], [660, 140, 130],
            [130, 420, 140], [380, 460, 115], [560, 380, 120], [700, 470, 90],
          ];
      if (playerInCave) {
        for (const [ox, oy, r] of specks) {
          ctx.fillStyle = cavePower ? "rgba(120,90,60,0.08)" : "rgba(80,60,40,0.12)";
          ctx.beginPath();
          ctx.arc(sx + ox, sy + oy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // tunnel mouth and floor lip
      const entryX = CAVE_ENTRY.x - s.camera.x;
      ctx.fillStyle = playerInCave ? (cavePower ? "rgba(55,40,25,0.4)" : "rgba(25,18,12,0.65)") : "rgba(0,0,0,0.98)";
      ctx.fillRect(entryX, sy, CAVE_ENTRY.w, 42);
      ctx.fillStyle = playerInCave ? (cavePower ? "rgba(255,220,150,0.06)" : "rgba(255,220,150,0.03)") : "rgba(0,0,0,0)";
      ctx.fillRect(entryX, sy + 38, CAVE_ENTRY.w, 6);

      // stalactite teeth at the cave mouth
      ctx.fillStyle = playerInCave ? (cavePower ? "rgba(35,25,18,0.75)" : "rgba(10,8,6,0.9)") : "rgba(0,0,0,1)";
      for (let i = 0; i < 9; i++) {
        const tx = entryX - 20 + i * 26;
        const height = 18 + ((i % 3) * 10);
        ctx.beginPath();
        ctx.moveTo(tx, sy);
        ctx.lineTo(tx + 13, sy + height);
        ctx.lineTo(tx + 26, sy);
        ctx.closePath();
        ctx.fill();
      }

      // lamp posts and glow after power is restored
      if (playerInCave && cavePower) {
        for (const light of caveLights) {
          const lx = light.x - s.camera.x;
          const ly = light.y - s.camera.y;
          const pulse = 0.7 + Math.sin(performance.now() / 260 + light.x * 0.01) * 0.3;
          const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 140);
          glow.addColorStop(0, `rgba(255,236,180,${0.35 * pulse})`);
          glow.addColorStop(0.5, `rgba(255,182,70,${0.18 * pulse})`);
          glow.addColorStop(1, "rgba(255,182,70,0)");
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(lx, ly, 140, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#3c2f1f";
          ctx.fillRect(lx - 3, ly - 12, 6, 24);
          ctx.fillStyle = "#ffd98a";
          ctx.beginPath();
          ctx.arc(lx, ly - 14, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    const golfLights = [
      { x: GOLF_ROOM_RECT.x + 120, y: GOLF_ROOM_RECT.y + 70 },
      { x: GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w - 120, y: GOLF_ROOM_RECT.y + 70 },
      { x: GOLF_ROOM_RECT.x + 120, y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 78 },
      { x: GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w - 120, y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 78 },
      { x: GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w / 2, y: GOLF_ROOM_RECT.y + 90 },
    ];

    function drawGolfRoom() {
      const sx = GOLF_ROOM_RECT.x - s.camera.x;
      const sy = GOLF_ROOM_RECT.y - s.camera.y;
      if (sx > canvas.width || sy > canvas.height || sx + GOLF_ROOM_RECT.w < 0 || sy + GOLF_ROOM_RECT.h < 0) return;

      // room floor – green felt
      const base = ctx.createLinearGradient(sx, sy, sx, sy + GOLF_ROOM_RECT.h);
      base.addColorStop(0, "#1a3a1a");
      base.addColorStop(0.5, "#1e4a1e");
      base.addColorStop(1, "#1a3a1a");
      ctx.fillStyle = base;
      ctx.fillRect(sx, sy, GOLF_ROOM_RECT.w, GOLF_ROOM_RECT.h);

      if (!s.golfDoorOpened) {
        ctx.fillStyle = "rgba(0,0,0,0.92)";
        ctx.fillRect(sx + 16, sy, GOLF_ROOM_RECT.w - 32, GOLF_ROOM_RECT.h - 16);
      }

      // entry lip
      const entryX = GOLF_ENTRY.x - s.camera.x;
      const entryY = sy + GOLF_ROOM_RECT.h - 42;
      ctx.fillStyle = s.golfDoorOpened ? "rgba(40,80,40,0.4)" : "rgba(0,0,0,0.98)";
      ctx.fillRect(entryX, entryY, GOLF_ENTRY.w, 42);

      // lamp posts (always on)
      for (const light of golfLights) {
        const lx = light.x - s.camera.x;
        const ly = light.y - s.camera.y;
        const pulse = 0.7 + Math.sin(performance.now() / 260 + light.x * 0.01) * 0.3;
        const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 140);
        glow.addColorStop(0, `rgba(255,236,180,${0.35 * pulse})`);
        glow.addColorStop(0.5, `rgba(255,182,70,${0.18 * pulse})`);
        glow.addColorStop(1, "rgba(255,182,70,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(lx, ly, 140, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3c2f1f";
        ctx.fillRect(lx - 3, ly - 12, 6, 24);
        ctx.fillStyle = "#ffd98a";
        ctx.beginPath();
        ctx.arc(lx, ly - 14, 5, 0, Math.PI * 2);
        ctx.fill();
      }

      // draw holes
      for (const h of s.golfHoles) {
        const hx = h.x - s.camera.x;
        const hy = h.y - s.camera.y;
        ctx.fillStyle = "#0a0a0a";
        ctx.beginPath();
        ctx.arc(hx, hy, 18, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 2;
        ctx.stroke();
        // flag pole
        ctx.fillStyle = "#aaa";
        ctx.fillRect(hx - 1, hy - 40, 2, 40);
        // flag
        ctx.fillStyle = "#e03030";
        ctx.beginPath();
        ctx.moveTo(hx + 1, hy - 40);
        ctx.lineTo(hx + 14, hy - 34);
        ctx.lineTo(hx + 1, hy - 28);
        ctx.closePath();
        ctx.fill();
      }

      // draw golf balls
      for (let bi = 0; bi < s.golfBalls.length; bi++) {
        const ball = s.golfBalls[bi];
        if (ball.hole >= 0) continue;
        const bx = ball.x - s.camera.x;
        const by = ball.y - s.camera.y;
        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.beginPath();
        ctx.ellipse(bx + 2, by + 4, 10, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        // ball body
        ctx.fillStyle = "#f0f0e8";
        ctx.beginPath();
        ctx.arc(bx, by, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#bbb";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        // dimple pattern
        ctx.fillStyle = "rgba(180,180,170,0.4)";
        for (let d = 0; d < 5; d++) {
          const da = (d / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(bx + Math.cos(da) * 4, by + Math.sin(da) * 4, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
        // number
        ctx.fillStyle = "#666";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${bi + 1}`, bx, by + 3);
      }

      // draw target balls (red and blue pool balls)
      for (const tb of s.golfTargetBalls) {
        if (tb.spawned) continue;
        const tx = tb.x - s.camera.x;
        const ty = tb.y - s.camera.y;
        const isRed = tb.color === "red";
        const ballColor = isRed ? "#cc2200" : "#2244cc";
        const ballHighlight = isRed ? "#ff4422" : "#4488ff";
        const ballDark = isRed ? "#881100" : "#112288";
        // shadow
        ctx.fillStyle = "rgba(0,0,0,0.4)";
        ctx.beginPath();
        ctx.ellipse(tx + 2, ty + 4, 14, 7, 0, 0, Math.PI * 2);
        ctx.fill();
        // ball body
        const bgrd = ctx.createRadialGradient(tx - 3, ty - 3, 1, tx, ty, 14);
        bgrd.addColorStop(0, ballHighlight);
        bgrd.addColorStop(0.7, ballColor);
        bgrd.addColorStop(1, ballDark);
        ctx.fillStyle = bgrd;
        ctx.beginPath();
        ctx.arc(tx, ty, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = isRed ? "#661100" : "#112266";
        ctx.lineWidth = 2;
        ctx.stroke();
        // white circle (pool ball style)
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, Math.PI * 2);
        ctx.fill();
        // number
        ctx.fillStyle = isRed ? "#cc2200" : "#2244cc";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.fillText(isRed ? "3" : "10", tx, ty + 3);
        // pulsing glow
        const pulse = 0.3 + Math.sin(performance.now() * 0.004) * 0.15;
        const glowColor = isRed ? `rgba(255,40,20,${pulse})` : `rgba(40,80,255,${pulse})`;
        const ggrd = ctx.createRadialGradient(tx, ty, 10, tx, ty, 30);
        ggrd.addColorStop(0, glowColor);
        ggrd.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = ggrd;
        ctx.beginPath();
        ctx.arc(tx, ty, 30, 0, Math.PI * 2);
        ctx.fill();

      }

      // hint text when player is near entry
      if (s.golfDoorOpened && !s.golfCompleted) {
        const pdx = GOLF_ENTRY.x + GOLF_ENTRY.w / 2 - s.player.x;
        const pdy = GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 21 - s.player.y;
        if (pdx * pdx + pdy * pdy < 120 * 120) {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 11px monospace";
          ctx.textAlign = "center";
          ctx.fillText("SHOOT BALLS INTO HOLES", sx + GOLF_ROOM_RECT.w / 2, sy + GOLF_ROOM_RECT.h - 55);
        }
      }
    }

    function drawGenerator() {
      const gen = s.generator;
      if (!gen) return;

      const sx = gen.x - s.camera.x;
      const sy = gen.y - s.camera.y;
      if (sx < -120 || sy < -120 || sx > canvas.width + 120 || sy > canvas.height + 120) return;

      const dg = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
      const dist = Math.hypot(dg.x - gen.x, dg.y - gen.y);
      const progress = gen.active ? 1 : Math.min(1, gen.progressMs / GENERATOR_HOLD_MS);
      const pulse = 0.65 + Math.sin(performance.now() / 180) * 0.35;

      ctx.save();
      ctx.translate(sx, sy);

      if (!gen.active && dist < 140) {
        ctx.shadowBlur = 18 * pulse;
        ctx.shadowColor = "#ff9a3a";
        ctx.fillStyle = `rgba(255, 140, 40, ${0.12 * pulse})`;
        ctx.beginPath();
        ctx.arc(0, 0, 80, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      ctx.fillStyle = gen.active ? "#234b2b" : "#26231f";
      ctx.fillRect(-28, -18, 56, 36);
      ctx.strokeStyle = gen.active ? "#67d77b" : "#6d6258";
      ctx.lineWidth = 2;
      ctx.strokeRect(-28, -18, 56, 36);
      ctx.fillStyle = gen.active ? "#67d77b" : "#ff6b2d";
      ctx.beginPath();
      ctx.arc(18, -8, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1d1712";
      ctx.fillRect(-10, -32, 20, 14);
      ctx.strokeStyle = "#0d0907";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-10, -32, 20, 14);

      ctx.fillStyle = "#5d4f42";
      ctx.fillRect(-14, 18, 28, 24);
      ctx.fillRect(-3, 18, 6, 36);

      if (!gen.active) {
        ctx.beginPath();
        ctx.arc(0, 0, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
        ctx.strokeStyle = "#ff9a3a";
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.fillStyle = "#f5d9a0";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${Math.floor(progress * 100)}%`, 0, -36);
      } else {
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#67d77b";
        ctx.fillStyle = "rgba(103, 215, 123, 0.35)";
        ctx.beginPath();
        ctx.arc(0, 0, 44, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#b6ffbf";
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";
        ctx.fillText("POWER ON", 0, -42);
      }

      ctx.restore();
    }

    let _flashlightOc: HTMLCanvasElement | null = null;
    function drawFlashlightOverlay() {
      const flashlights: { x: number; y: number; angle: number; r: number }[] = [];
      const localPlayer = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
      flashlights.push(localPlayer);
      if (s.gameMode === "split" && s.player2Alive) {
        const otherPlayer = s._vpIsP2 ? s.player : s.player2;
        flashlights.push(otherPlayer);
      }

      const activeFlashlights = flashlights.filter(fp => {
        const startY = CAVE_RECT.y + fp.r * 4;
        return (isInCave(fp.x, fp.y) || fp.y >= startY) && !s.generator?.active;
      });
      if (activeFlashlights.length === 0) return;

      const intensity = settingsRef.current.lightIntensity;
      const overlayAlpha = 0.95 * (1 - intensity * 0.75);
      const coneAlpha = 0.3 + intensity * 0.4;

      if (!_flashlightOc || _flashlightOc.width !== canvas.width || _flashlightOc.height !== canvas.height) {
        _flashlightOc = document.createElement("canvas");
        _flashlightOc.width = canvas.width;
        _flashlightOc.height = canvas.height;
      }
      const oc = _flashlightOc;
      const ocCtx = oc.getContext("2d")!;
      ocCtx.clearRect(0, 0, oc.width, oc.height);
      ocCtx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
      ocCtx.fillRect(0, 0, oc.width, oc.height);

      ocCtx.globalCompositeOperation = "destination-out";
      for (const fp of activeFlashlights) {
        const screenX = fp.x - s.camera.x;
        const screenY = fp.y - s.camera.y;
        const leftAngle = fp.angle - FLASHLIGHT_CONE_ANGLE / 2;
        const rightAngle = fp.angle + FLASHLIGHT_CONE_ANGLE / 2;
        ocCtx.fillStyle = "rgba(0,0,0,1)";
        ocCtx.beginPath();
        ocCtx.moveTo(screenX, screenY);
        ocCtx.lineTo(screenX + Math.cos(leftAngle) * FLASHLIGHT_LENGTH, screenY + Math.sin(leftAngle) * FLASHLIGHT_LENGTH);
        ocCtx.arc(screenX, screenY, FLASHLIGHT_LENGTH, leftAngle, rightAngle);
        ocCtx.closePath();
        ocCtx.fill();
      }
      ocCtx.globalCompositeOperation = "source-over";

      ctx.drawImage(oc, 0, 0);

      for (const fp of activeFlashlights) {
        const screenX = fp.x - s.camera.x;
        const screenY = fp.y - s.camera.y;
        const leftAngle = fp.angle - FLASHLIGHT_CONE_ANGLE / 2;
        const rightAngle = fp.angle + FLASHLIGHT_CONE_ANGLE / 2;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(screenX, screenY);
        ctx.lineTo(screenX + Math.cos(leftAngle) * FLASHLIGHT_LENGTH, screenY + Math.sin(leftAngle) * FLASHLIGHT_LENGTH);
        ctx.arc(screenX, screenY, FLASHLIGHT_LENGTH, leftAngle, rightAngle);
        ctx.closePath();
        ctx.clip();
        const coneGlow = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, FLASHLIGHT_LENGTH);
        coneGlow.addColorStop(0, `rgba(255,250,220,${coneAlpha})`);
        coneGlow.addColorStop(0.55, "rgba(255,245,205,0.18)");
        coneGlow.addColorStop(1, "rgba(255,245,205,0)");
        ctx.fillStyle = coneGlow;
        ctx.beginPath();
        ctx.arc(screenX, screenY, FLASHLIGHT_LENGTH, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const kd = (e: KeyboardEvent) => {
      s.keys[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === "r") tryReload();
      if (e.key.toLowerCase() === "e") {
        // Check for revive proximity first (split-screen)
        let reviveStarted = false;
        if (s.gameMode === "split" && s.player.hp > 0 && !s.player2Alive) {
          // Only start if not already reviving (prevents OS key-repeat from resetting timer)
          if (s._reviveHoldStart === 0) {
            const dx = s.player2.x - s.player.x, dy = s.player2.y - s.player.y;
            if (dx * dx + dy * dy < 90 * 90) {
              s._reviveHoldStart = performance.now();
              s._reviveTarget = 2;
              reviveStarted = true;
            }
          } else {
            reviveStarted = true; // already reviving, don't fall through to door hold
          }
        }
        if (!reviveStarted && s._doorHoldStartP1 === 0) {
          s._doorHoldStartP1 = performance.now();
        }
      }
    };
    const ku = (e: KeyboardEvent) => {
      s.keys[e.key.toLowerCase()] = false;
      if (e.key.toLowerCase() === "e") {
        if (s._reviveHoldStart > 0) {
          s._reviveHoldStart = 0;
          s._reviveTarget = 0;
        } else if (s._doorHoldStartP1 > 0 && performance.now() - s._doorHoldStartP1 < DOOR_HOLD_MS) {
          tryInteract();
        }
        s._doorHoldStartP1 = 0;
      }
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

    // Controller detection for split-screen lobby
    const onGamepadConnected = (e: GamepadEvent) => {
      s.controllerIndex = e.gamepad.index;
      setControllerConnected(true);
    };
    const onGamepadDisconnected = (e: GamepadEvent) => {
      if (e.gamepad.index === s.controllerIndex) {
        s.controllerIndex = -1;
        setControllerConnected(false);
      }
    };
    window.addEventListener("gamepadconnected", onGamepadConnected);
    window.addEventListener("gamepaddisconnected", onGamepadDisconnected);
    // Check for already-connected controllers
    const existingGamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < existingGamepads.length; i++) {
      if (existingGamepads[i]) { s.controllerIndex = i; setControllerConnected(true); break; }
    }

    function setMessage(m: string, ms = 1800, target: 0 | 1 | 2 = 0) {
      s.message = m;
      s.messageUntil = performance.now() + ms;
      s.messageTarget = target;
    }

    function startRound(r: number) {
      s.round = r;
      const count = Math.floor(6 + r * 4 + Math.pow(r, 1.4));
      s.zombiesToSpawn = count;
      s.zombiesAlive = 0;
      s.spawnCooldown = 500;
      setMessage(`ROUND ${r}`, 2200);
      soundEngine.roundStart();
      setUiState((u) => ({ ...u, round: r, actualRound: r, zombiesLeft: count }));
      if (!s.torches.every((t) => t.lit)) {
        s.fireZombieToSpawn = true;
      }
    }

    function beginGame() {
      if (s.started) return;
      s.started = true;
      s.mouse.down = false;
      s.lastShot = performance.now();
      s.lastShot2 = performance.now();
      s.startTime = performance.now();
      s.endTime = 0;
      if (s.generator) {
        s.generator.active = false;
        s.generator.progressMs = 0;
      }
      // Initialize player 2 for split-screen
      if (s.gameMode === "split") {
        s.player2.x = MAP_W / 2 + 100;
        s.player2.y = SURFACE_CENTER_Y;
        s.player2.hp = 100;
        s.player2.maxHp = 100;
        s.player2Alive = true;
        s.camera2.x = s.player2.x - canvas.width / 4;
        s.camera2.y = s.player2.y - canvas.height / 2;
      }
      setUiState((u) => ({ ...u, started: true, elapsedMs: 0 }));
      setShowHelp(false);
      soundEngine.init();
      soundEngine.setMusic("main");
      startRound(1);
    }

    startGameRef.current = beginGame;

    function haptic(pattern: number | number[]) {
      if (!settingsRef.current.hapticEnabled) return;
      try {
        if (typeof navigator !== "undefined" && "vibrate" in navigator) {
          navigator.vibrate(pattern);
        }
      } catch { /* ignore */ }
    }

    // ─── Gamepad polling for Player 2 ──────────────────────────────────────────
    const GAMEPAD_DEADZONE = 0.18;
    const GAMEPAD_TRIGGER_THRESHOLD = 0.5;
    let p2PrevRT = false;
    let p2PrevLB = false;
    let p2PrevY = false;

    // Continuous controller detection (runs even on menu for lobby detection)
    function detectGamepad() {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      // Try to find a connected gamepad
      if (s.controllerIndex < 0 || !gamepads[s.controllerIndex]) {
        for (let i = 0; i < gamepads.length; i++) {
          if (gamepads[i]) {
            s.controllerIndex = i;
            setControllerConnected(true);
            break;
          }
        }
      } else {
        // Verify still connected
        if (!gamepads[s.controllerIndex]) {
          s.controllerIndex = -1;
          setControllerConnected(false);
        }
      }
    }

    function pollGamepad() {
      if (s.gameMode !== "split" || !s.started || s.gameOver) return;
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = gamepads[s.controllerIndex];
      if (!gp) {
        // Controller disconnected — try to find one
        for (let i = 0; i < gamepads.length; i++) {
          if (gamepads[i]) { s.controllerIndex = i; return pollGamepad(); }
        }
        return;
      }

      // Left stick → movement
      let lx = gp.axes[0] || 0;
      let ly = gp.axes[1] || 0;
      if (Math.abs(lx) < GAMEPAD_DEADZONE) lx = 0;
      if (Math.abs(ly) < GAMEPAD_DEADZONE) ly = 0;
      s._p2MoveX = lx;
      s._p2MoveY = ly;

      // Right stick → aim direction (if magnitude > deadzone)
      let rx = gp.axes[2] || 0;
      let ry = gp.axes[3] || 0;
      if (Math.abs(rx) < GAMEPAD_DEADZONE) rx = 0;
      if (Math.abs(ry) < GAMEPAD_DEADZONE) ry = 0;
      if (rx !== 0 || ry !== 0) {
        s.player2.angle = Math.atan2(ry, rx);
        // Set world aim point for shooting direction
        s.mouse2.worldX = s.player2.x + Math.cos(s.player2.angle) * 200;
        s.mouse2.worldY = s.player2.y + Math.sin(s.player2.angle) * 200;
      }

      // Right trigger → shoot
      const rtVal = gp.buttons[7]?.value ?? 0;
      const rtDown = rtVal > GAMEPAD_TRIGGER_THRESHOLD;
      s.mouse2.down = rtDown;

      // Left bumper → reload (edge-triggered)
      const lbDown = !!(gp.buttons[4]?.pressed);
      if (lbDown && !p2PrevLB) {
        tryReload2();
      }
      p2PrevLB = lbDown;

      // Y button → interact (hold to pay half or revive, tap to buy full)
      const yDown = !!(gp.buttons[3]?.pressed);
      if (yDown && !p2PrevY) {
        // Check for revive proximity first
        let reviveStarted = false;
        if (s.player2Alive && s.player.hp <= 0) {
          const dx = s.player.x - s.player2.x, dy = s.player.y - s.player2.y;
          if (dx * dx + dy * dy < 90 * 90) {
            s._reviveHoldStart = performance.now();
            s._reviveTarget = 1;
            reviveStarted = true;
          }
        }
        if (!reviveStarted) {
          s._doorHoldStartP2 = performance.now();
        }
      }
      if (!yDown && p2PrevY) {
        if (s._reviveHoldStart > 0) {
          s._reviveHoldStart = 0;
          s._reviveTarget = 0;
        } else if (s._doorHoldStartP2 > 0 && performance.now() - s._doorHoldStartP2 < DOOR_HOLD_MS) {
          tryInteract2();
        }
        s._doorHoldStartP2 = 0;
      }
      p2PrevY = yDown;

      // D-pad → weapon switching
      if (gp.buttons[12]?.pressed) cycleWeapon2(-1); // up
      if (gp.buttons[13]?.pressed) cycleWeapon2(1);  // down
    }

    function tryReload2() {
      const key = s.currentWeaponKey2;
      const w = WEAPONS[key];
      const pw = s.weapons2[key];
      if (!pw || pw.mag >= w.magSize || pw.reserve <= 0) return;
      if (performance.now() < s.reloadingUntil2) return;
      s.reloadingUntil2 = performance.now() + w.reloadMs;
      soundEngine.reload();
      haptic([15, 40, 25]);
      setUiState((u) => ({ ...u, reloading2: true }));
    }

    function finishReload2() {
      const key = s.currentWeaponKey2;
      const w = WEAPONS[key];
      const pw = s.weapons2[key];
      const need = w.magSize - pw.mag;
      const take = Math.min(need, pw.reserve);
      pw.mag += take;
      pw.reserve -= take;
      setUiState((u) => ({ ...u, mag2: pw.mag, reserve2: pw.reserve, reloading2: false }));
    }

    function syncWeaponUi2() {
      const w = WEAPONS[s.currentWeaponKey2];
      const pw = s.weapons2[s.currentWeaponKey2];
      setUiState((u) => ({ ...u, weaponName2: w.name, mag2: pw.mag, reserve2: pw.reserve, points2: s.points2 }));
    }

    function cycleWeapon2(dir: number) {
      const ownedKeys = Object.keys(s.weapons2).filter((k) => s.weapons2[k].owned);
      if (ownedKeys.length <= 1) return;
      const idx = ownedKeys.indexOf(s.currentWeaponKey2);
      const next = (idx + dir + ownedKeys.length) % ownedKeys.length;
      s.currentWeaponKey2 = ownedKeys[next] as keyof typeof WEAPONS;
      syncWeaponUi2();
    }

    function shoot2() {
      const key = s.currentWeaponKey2;
      const w = WEAPONS[key];
      const pw = s.weapons2[key];
      const now = performance.now();
      if (now < s.reloadingUntil2) return;
      if (now - s.lastShot2 < w.fireRate) return;
      if (pw.mag <= 0) { soundEngine.empty(); tryReload2(); return; }
      s.lastShot2 = now;
      pw.mag--;
      const baseAngle = s.player2.angle;
      for (let i = 0; i < w.pellets; i++) {
        const a = baseAngle + (Math.random() - 0.5) * w.spread * 2;
        s.bullets.push({
          x: s.player2.x + Math.cos(a) * 20,
          y: s.player2.y + Math.sin(a) * 20,
          vx: Math.cos(a) * w.speed,
          vy: Math.sin(a) * w.speed,
          life: 0.8,
          dmg: w.dmg,
          owner: 2,
        });
      }
      s.shotsFired2 += w.pellets;
      soundEngine.shoot(key);
      s.camera2.shake = Math.min(s.camera2.shake + 3, 12);
      s.muzzleFlash2 = 1;
      syncWeaponUi2();
    }

    function tryInteract2() {
      // cave door
      for (let i = 0; i < s.obstacles.length; i++) {
        const o = s.obstacles[i];
        if (o.type !== "door") continue;
        const dx = o.x + o.w / 2 - s.player2.x;
        const dy = o.y + o.h / 2 - s.player2.y;
        if (dx * dx + dy * dy < 90 * 90) {
          const remaining = CAVE_DOOR_COST - (o.paid || 0);
          if (s.points2 < remaining) { setMessage(`Need ${remaining} points`, 1800, 2); return; }
          s.points2 -= remaining;
          openDoor(o, 2);
          return;
        }
      }
      // golf door
      for (let i = 0; i < s.obstacles.length; i++) {
        const o = s.obstacles[i];
        if (o.type !== "golfDoor") continue;
        const dx = o.x + o.w / 2 - s.player2.x;
        const dy = o.y + o.h / 2 - s.player2.y;
        if (dx * dx + dy * dy < 90 * 90) {
          const remaining = GOLF_DOOR_COST - (o.paid || 0);
          if (s.points2 < remaining) { setMessage(`Need ${remaining} points`, 1800, 2); return; }
          s.points2 -= remaining;
          openDoor(o, 2);
          return;
        }
      }
      // buy station
      for (const b of s.buyStations) {
        const dx = b.x - s.player2.x, dy = b.y - s.player2.y;
        if (dx * dx + dy * dy < 70 * 70) {
          if (!s.generator?.active) { setMessage("POWER NEEDED", 1800, 2); return; }
          const w = WEAPONS[b.weapon];
          const owned = s.weapons2[b.weapon]?.owned;
          const cost = owned ? Math.floor(w.cost * 0.5) : w.cost;
          if (s.points2 < cost) { setMessage(`Need ${cost} points`, 1800, 2); return; }
          s.points2 -= cost;
          soundEngine.buyWeapon();
          if (!owned) {
            s.weapons2[b.weapon] = { mag: w.magSize, reserve: w.reserve, owned: true };
            s.currentWeaponKey2 = b.weapon;
            setMessage(`Purchased ${w.name}`, 1800, 2);
          } else {
            const pw = s.weapons2[b.weapon];
            pw.mag = w.magSize;
            pw.reserve = w.reserve;
            setMessage(`Refilled ${w.name}`, 1800, 2);
          }
          syncWeaponUi2();
          return;
        }
      }
      // ammo box
      for (const a of s.ammoBoxes) {
        const dx = a.x - s.player2.x, dy = a.y - s.player2.y;
        if (dx * dx + dy * dy < 60 * 60) {
          const cost = 500;
          if (s.points2 < cost) { setMessage(`Ammo: ${cost} pts`, 1800, 2); return; }
          s.points2 -= cost;
          soundEngine.buyWeapon();
          const w = WEAPONS[s.currentWeaponKey2];
          const pw = s.weapons2[s.currentWeaponKey2];
          pw.reserve = w.reserve;
          setMessage("Max ammo!", 1800, 2);
          syncWeaponUi2();
          return;
        }
      }
      // dark ether portal
      if (s.portalActive && s.portalPos) {
        const dx = s.portalPos.x - s.player2.x, dy = s.portalPos.y - s.player2.y;
        if (dx * dx + dy * dy < 90 * 90) {
          s.portalActive = false;
          s.portalPos = null;
          s.glowingCrate = null;
          enterBossMap();
          return;
        }
      }
    }

    function damagePlayer2(amt: number) {
      const now = performance.now();
      if (now - s.lastDamageTime2 < 400) return;
      s.lastDamageTime2 = now;
      s.player2.hp -= amt;
      s.hitFlash2 = 1;
      s.camera2.shake = Math.min(s.camera2.shake + 8, 16);
      soundEngine.playerDamage();
      if (s.player2.hp <= 0) {
        s.player2.hp = 0;
        s.player2Alive = false;
        const inCave = isInCave(s.player2.x, s.player2.y) && !s.generator.active;
        if (inCave) {
          s.camera2.shake = 20;
        }
        haptic([80, 60, 120, 60, 200]);
        // Check if both players are dead
        if (!s.player2Alive && s.player.hp <= 0) {
          s.gameOver = true;
          soundEngine.setMusic("menu");
          setUiState((u) => ({ ...u, gameOver: true, hp: 0, kills: s.kills, shotsFired: s.shotsFired, shotsHit: s.shotsHit }));
        }
      } else {
        haptic([30, 20, 40]);
      }
      setUiState((u) => ({ ...u, hp2: Math.max(0, s.player2.hp) }));
    }

    function tryReload() {
      const key = s.currentWeaponKey;
      const w = WEAPONS[key];
      const pw = s.weapons[key];
      if (!pw || pw.mag >= w.magSize || pw.reserve <= 0) return;
      if (performance.now() < s.reloadingUntil) return;
      s.reloadingUntil = performance.now() + w.reloadMs;
      soundEngine.reload();
      haptic([15, 40, 25]);
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

    function openDoor(o: Obstacle, playerNum: 1 | 2) {
      const idx = s.obstacles.indexOf(o);
      if (idx === -1) return;
      s.obstacles.splice(idx, 1);
      soundEngine.buyWeapon();
      if (o.type === "door") {
        setMessage("CAVE DOOR OPENED", 2200, playerNum);
        if (playerNum === 1) syncWeaponUi(); else syncWeaponUi2();
        if (!s.toxicZombieSpawned) {
          const hp = 30 + s.round * 15;
          s.zombies.push({ x: GENERATOR_POS.x - 60, y: GENERATOR_POS.y, hp, maxHp: hp, speed: 45 + s.round * 3, radius: 18, type: "toxic" });
          s.zombies.push({ x: GENERATOR_POS.x + 60, y: GENERATOR_POS.y, hp, maxHp: hp, speed: 45 + s.round * 3, radius: 18, type: "toxic" });
          s.zombiesAlive += 2;
          s.toxicZombieSpawned = true;
        }
        for (let i = 0; i < 3; i++) spawnGhostZombie();
      } else if (o.type === "golfDoor") {
        s.golfDoorOpened = true;
        setMessage("GOLF ROOM OPENED", 2200, playerNum);
        if (playerNum === 1) syncWeaponUi(); else syncWeaponUi2();
        if (s.golfBalls.length === 0) {
          s.golfBalls = [
            { x: GOLF_ROOM_RECT.w / 2 - 80, y: GOLF_ROOM_RECT.h - 80, vx: 0, vy: 0, hole: -1 },
            { x: GOLF_ROOM_RECT.w / 2 + 80, y: GOLF_ROOM_RECT.h - 80, vx: 0, vy: 0, hole: -1 },
          ];
        }
        if (s.golfTargetBalls.length === 0) {
          s.golfTargetBalls = [
            { x: GOLF_ROOM_RECT.w / 2 - 350, y: 180, color: "red", spawned: false },
            { x: GOLF_ROOM_RECT.w / 2 + 350, y: 180, color: "blue", spawned: false },
          ];
        }
      }
    }

    function tryInteract() {
      // cave door
      for (let i = 0; i < s.obstacles.length; i++) {
        const o = s.obstacles[i];
        if (o.type !== "door") continue;
        const dx = o.x + o.w / 2 - s.player.x;
        const dy = o.y + o.h / 2 - s.player.y;
        if (dx * dx + dy * dy < 90 * 90) {
          const remaining = CAVE_DOOR_COST - (o.paid || 0);
          if (s.points < remaining) { setMessage(`Need ${remaining} points`, 1800, 1); return; }
          s.points -= remaining;
          openDoor(o, 1);
          return;
        }
      }

      // golf door
      for (let i = 0; i < s.obstacles.length; i++) {
        const o = s.obstacles[i];
        if (o.type !== "golfDoor") continue;
        const dx = o.x + o.w / 2 - s.player.x;
        const dy = o.y + o.h / 2 - s.player.y;
        if (dx * dx + dy * dy < 90 * 90) {
          const remaining = GOLF_DOOR_COST - (o.paid || 0);
          if (s.points < remaining) { setMessage(`Need ${remaining} points`, 1800, 1); return; }
          s.points -= remaining;
          openDoor(o, 1);
          return;
        }
      }

      // buy station (requires power)
      for (const b of s.buyStations) {
        const dx = b.x - s.player.x, dy = b.y - s.player.y;
        if (dx * dx + dy * dy < 70 * 70) {
          if (!s.generator?.active) { setMessage("POWER NEEDED", 1800, 1); return; }
          const w = WEAPONS[b.weapon];
          const owned = s.weapons[b.weapon]?.owned;
          const cost = owned ? Math.floor(w.cost * 0.5) : w.cost; // refill cost
          if (s.points < cost) { setMessage(`Need ${cost} points`, 1800, 1); return; }
          s.points -= cost;
          soundEngine.buyWeapon();
          if (!owned) {
            s.weapons[b.weapon] = { mag: w.magSize, reserve: w.reserve, owned: true };
            s.currentWeaponKey = b.weapon;
            setMessage(`Purchased ${w.name}`, 1800, 1);
          } else {
            const pw = s.weapons[b.weapon];
            pw.mag = w.magSize;
            pw.reserve = w.reserve;
            setMessage(`Refilled ${w.name}`, 1800, 1);
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
          if (s.points < cost) { setMessage(`Ammo: ${cost} pts`, 1800, 1); return; }
          s.points -= cost;
          soundEngine.buyWeapon();
          const w = WEAPONS[s.currentWeaponKey];
          const pw = s.weapons[s.currentWeaponKey];
          pw.reserve = w.reserve;
          setMessage("Max ammo!", 1800, 1);
          syncWeaponUi();
          return;
        }
      }
      // dark ether portal
      if (s.portalActive && s.portalPos) {
        const dx = s.portalPos.x - s.player.x, dy = s.portalPos.y - s.player.y;
        if (dx * dx + dy * dy < 90 * 90) {
          s.portalActive = false;
          s.portalPos = null;
          s.glowingCrate = null;
          enterBossMap();
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
      // spawn just outside camera view — use random alive player
      const spawnPlayer = (s.gameMode === "split" && s.player2Alive && Math.random() > 0.5) ? s.player2 : s.player;
      let cx = spawnPlayer.x;
      let cy = spawnPlayer.y;
      for (let attempt = 0; attempt < 12; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 700;
        const x = spawnPlayer.x + Math.cos(angle) * dist;
        const y = spawnPlayer.y + Math.sin(angle) * dist;
        cx = Math.max(50, Math.min(MAP_W - 50, x));
        cy = Math.max(50, Math.min(MAP_H - 50, y));
        if (!isInCave(cx, cy)) break;
      }
      if (isInCave(cx, cy)) {
        cy = Math.max(50, CAVE_RECT.y - 120 - Math.random() * 160);
      }
      if (cx >= GOLF_ROOM_RECT.x && cx <= GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w && cy >= GOLF_ROOM_RECT.y && cy <= GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h) {
        cy = GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h + 100 + Math.random() * 100;
      }
      let type: Zombie["type"] = "walker";
      const rr = Math.random();
      if (s.round >= 5 && rr < 0.15) type = "brute";
      else if (s.round >= 4 && rr < 0.08) type = "brute";
      else if (s.round >= 3 && rr < 0.22) type = "runner";
      else if (s.round >= 3 && rr < 0.12) type = "runner";
      let hp = 30 + s.round * 15;
      let speed = 50 + s.round * 3;
      let radius = 16;
      if (type === "runner") { hp *= 0.6; speed = 130 + s.round * 6; radius = 13; }
      if (type === "brute") { hp *= 3.5; speed = 45 + s.round * 3; radius = 24; }
      s.zombies.push({ x: cx, y: cy, hp, maxHp: hp, speed, radius, type });
      s.zombiesAlive++;
    }

    function spawnFireZombie() {
      let cx = s.player.x;
      let cy = s.player.y;
      for (let attempt = 0; attempt < 12; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 700;
        const x = s.player.x + Math.cos(angle) * dist;
        const y = s.player.y + Math.sin(angle) * dist;
        cx = Math.max(50, Math.min(MAP_W - 50, x));
        cy = Math.max(50, Math.min(MAP_H - 50, y));
        if (!isInCave(cx, cy)) break;
      }
      if (isInCave(cx, cy)) {
        cy = Math.max(50, CAVE_RECT.y - 120 - Math.random() * 160);
      }
      if (cx >= GOLF_ROOM_RECT.x && cx <= GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w && cy >= GOLF_ROOM_RECT.y && cy <= GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h) {
        cy = GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h + 100 + Math.random() * 100;
      }
      const hp = 30 + s.round * 15;
      const speed = 50 + s.round * 3;
      const radius = 16;
      s.zombies.push({ x: cx, y: cy, hp, maxHp: hp, speed, radius, type: "fire" });
      s.zombiesAlive++;
      s.fireZombieAlive = true;
    }

    function spawnFireMiniboss() {
      let cx = s.player.x;
      let cy = s.player.y;
      for (let attempt = 0; attempt < 12; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 700;
        const x = s.player.x + Math.cos(angle) * dist;
        const y = s.player.y + Math.sin(angle) * dist;
        cx = Math.max(50, Math.min(MAP_W - 50, x));
        cy = Math.max(50, Math.min(MAP_H - 50, y));
        if (!isInCave(cx, cy)) break;
      }
      if (isInCave(cx, cy)) {
        cy = Math.max(50, CAVE_RECT.y - 120 - Math.random() * 160);
      }
      if (cx >= GOLF_ROOM_RECT.x && cx <= GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w && cy >= GOLF_ROOM_RECT.y && cy <= GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h) {
        cy = GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h + 100 + Math.random() * 100;
      }
      const hp = (30 + s.round * 15) * 3;
      const speed = 50 + s.round * 3;
      const radius = 24;
      s.zombies.push({ x: cx, y: cy, hp, maxHp: hp, speed, radius, type: "fireMiniboss" });
      s.zombiesAlive++;
      s.minibossAlive = true;
      s.minibossSpawned = true;
      s.lastMinibossShot = performance.now();
      setMessage("FIRE ZOMBIE MINIBOSS!", 2600);
      soundEngine.bossEnrage();
    }

    function spawnToxicMiniboss() {
      // spawn in or near the cave
      const cx = CAVE_RECT.x + CAVE_RECT.w / 2 + (Math.random() - 0.5) * 300;
      const cy = CAVE_RECT.y + CAVE_RECT.h / 2 + (Math.random() - 0.5) * 200;
      const hp = (30 + s.round * 15) * 3;
      const speed = 45 + s.round * 3;
      const radius = 22;
      s.zombies.push({ x: cx, y: cy, hp, maxHp: hp, speed, radius, type: "toxicMiniboss" });
      s.zombiesAlive++;
      s.toxicMinibossAlive = true;
      s.toxicMinibossSpawned = true;
      s.lastToxicMinibossShot = performance.now();
      setMessage("TOXIC MINIBOSS!", 2600);
      soundEngine.bossEnrage();
    }

    function spawnGhostZombie() {
      const cx = CAVE_RECT.x + 80 + Math.random() * (CAVE_RECT.w - 160);
      const cy = CAVE_RECT.y + 80 + Math.random() * (CAVE_RECT.h - 160);
      const hp = 15;
      const speed = 35 + Math.random() * 20;
      const radius = 14;
      s.zombies.push({ x: cx, y: cy, hp, maxHp: hp, speed, radius, type: "ghost" });
      s.zombiesAlive++;
    }

    function spawnUnderworldZombie() {
      if (!s.boss) return;
      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 20;
      const x = s.boss.x + Math.cos(angle) * dist;
      const y = s.boss.y + Math.sin(angle) * dist;
      const hp = 20;
      const speed = 40 + Math.random() * 20;
      const radius = 14;
      s.zombies.push({ x, y, hp, maxHp: hp, speed, radius, type: "underworld" });
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
          owner: 1,
        });
      }
      s.shotsFired += w.pellets;
      soundEngine.shoot(key);
      haptic(key === "shotgun" ? 25 : key === "rifle" ? 18 : key === "lmg" ? 12 : 10);
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
        const inCave = isInCave(s.player.x, s.player.y) && !s.generator.active;
        if (inCave) {
          s.jumpscareUntil = performance.now() + 1500;
          soundEngine.jumpscare();
          s.camera.shake = 20;
        }
        haptic([80, 60, 120, 60, 200]);
        // In split-screen, only game over if both players are dead
        if (s.gameMode === "split" && s.player2Alive) {
          // P2 still alive, game continues
        } else {
          s.gameOver = true;
          soundEngine.setMusic("menu");
          if (!inCave) {
            setUiState((u) => ({ ...u, gameOver: true, hp: 0, kills: s.kills, shotsFired: s.shotsFired, shotsHit: s.shotsHit }));
          }
        }
      } else {
        haptic([30, 20, 40]);
      }
      setUiState((u) => ({ ...u, hp: Math.max(0, s.player.hp) }));
    }

    function explodeBarrel(bx: number, by: number, isToxic = false) {
      const EXPLOSION_RADIUS = 100;
      const EXPLOSION_DAMAGE = 80;
      soundEngine.barrelExplode();
      // remove barrel from obstacles
      for (let i = s.obstacles.length - 1; i >= 0; i--) {
        const o = s.obstacles[i];
        if ((o.type === "barrel" || o.type === "toxicBarrel") && bx >= o.x && bx <= o.x + o.w && by >= o.y && by <= o.y + o.h) {
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
      if (s.player.hp > 0) {
        const pdx = s.player.x - bx, pdy = s.player.y - by;
        const playerDist = Math.hypot(pdx, pdy);
        if (playerDist < EXPLOSION_RADIUS) {
          const falloff = 1 - playerDist / EXPLOSION_RADIUS;
          damagePlayer(Math.round(EXPLOSION_DAMAGE * falloff * 0.5));
        }
      }
      // damage player 2
      if (s.gameMode === "split" && s.player2Alive) {
        const p2dx = s.player2.x - bx, p2dy = s.player2.y - by;
        const p2dist = Math.hypot(p2dx, p2dy);
        if (p2dist < EXPLOSION_RADIUS) {
          const falloff = 1 - p2dist / EXPLOSION_RADIUS;
          damagePlayer2(Math.round(EXPLOSION_DAMAGE * falloff * 0.5));
        }
      }
      // toxic barrel: spawn toxic gas clouds
      if (isToxic) {
        s.toxicGas.push({ x: bx, y: by, radius: 70, life: 5, maxLife: 5 });
        s.toxicGas.push({ x: bx + 50, y: by - 30, radius: 55, life: 4, maxLife: 4 });
        s.toxicGas.push({ x: bx - 40, y: by + 40, radius: 60, life: 4.5, maxLife: 4.5 });
        // green gas particles
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 30 + Math.random() * 80;
          s.particles.push({
            x: bx, y: by, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.6 + Math.random() * 0.6, maxLife: 1.2,
            color: Math.random() < 0.5 ? "#33cc33" : "#22aa22",
            size: 4 + Math.random() * 5,
          });
        }
        setMessage("TOXIC BARREL!", 1500);
      }
    }

    function killZombie(z: Zombie, headshot = false, owner: 1 | 2 = 1) {
      s.kills++;
      if (owner === 2) s.kills2++;
      s.zombiesAlive--;
      if (z.type === "fire") s.fireZombieAlive = false;
      if (z.type === "fireMiniboss") s.minibossAlive = false;
      if (z.type === "toxicMiniboss") s.toxicMinibossAlive = false;
      const pts = (z.type === "brute" ? 200 : z.type === "fireMiniboss" ? 300 : z.type === "toxicMiniboss" ? 300 : z.type === "redPoolMiniboss" ? 350 : z.type === "bluePoolMiniboss" ? 350 : z.type === "runner" ? 80 : z.type === "fire" ? 100 : z.type === "toxic" ? 120 : z.type === "ghost" ? 5 : z.type === "underworld" ? 10 : 60) + (headshot ? 30 : 0);
      if (owner === 2) { s.points2 += pts; } else { s.points += pts; }
      soundEngine.zombieDeath();
      // fireMiniboss: big explosion, drops, advance totem phase
      if (z.type === "fireMiniboss") {
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 80 + Math.random() * 260;
          s.particles.push({
            x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.7 + Math.random() * 0.5, maxLife: 1.2,
            color: Math.random() < 0.3 ? "#ff2200" : Math.random() < 0.6 ? "#ff6600" : "#ffaa00",
            size: 4 + Math.random() * 6,
          });
        }
        s.decals.push({ x: z.x, y: z.y, r: z.radius * 2.0, color: "#4a2008", alpha: 0.6, kind: "scorch" });
        if (s.decals.length > 120) s.decals.shift();
        s.camera.shake = Math.min(s.camera.shake + 12, 20);
        // guaranteed health and ammo drops
        s.pickups.push({ x: z.x - 15, y: z.y, kind: "health", life: 20 });
        s.pickups.push({ x: z.x + 15, y: z.y, kind: "ammo", life: 20 });
        setMessage("MINIBOSS DEFEATED!", 2600);
        // advance totem phase after miniboss death
        if (s.totemPhase === 0) {
          setTimeout(() => {
            if (s.generator.active) {
              s.totemPhase = 2;
              setMessage("THE CAVE AWAKENS...", 2600);
            } else {
              s.totemPhase = 1;
              setMessage("THE CAVE REQUIRES POWER...", 2600);
            }
          }, 2000);
        }
      } else if (z.type === "toxicMiniboss") {
        // toxic miniboss: green gas explosion, drops, advance totem phase
        for (let i = 0; i < 40; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 60 + Math.random() * 200;
          s.particles.push({
            x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.8 + Math.random() * 0.5, maxLife: 1.3,
            color: Math.random() < 0.3 ? "#22cc22" : Math.random() < 0.6 ? "#33aa33" : "#44dd44",
            size: 4 + Math.random() * 6,
          });
        }
        s.decals.push({ x: z.x, y: z.y, r: z.radius * 2.0, color: "#0a3a0a", alpha: 0.6, kind: "scorch" });
        if (s.decals.length > 120) s.decals.shift();
        s.camera.shake = Math.min(s.camera.shake + 12, 20);
        // spawn gas clouds on death
        for (let i = 0; i < 3; i++) {
          const offX = (Math.random() - 0.5) * 80;
          const offY = (Math.random() - 0.5) * 80;
          s.toxicGas.push({ x: z.x + offX, y: z.y + offY, radius: 50 + Math.random() * 20, life: 5, maxLife: 5 });
        }
        // guaranteed health and ammo drops
        s.pickups.push({ x: z.x - 15, y: z.y, kind: "health", life: 20 });
        s.pickups.push({ x: z.x + 15, y: z.y, kind: "ammo", life: 20 });
        setMessage("TOXIC MINIBOSS DEFEATED!", 2600);
        // advance totem phase after miniboss death
        if (s.totemPhase === 2) {
          setTimeout(() => {
            s.totemPhase = 3;
            s.totems.push({ x: MAP_W / 2, y: SURFACE_CENTER_Y, kills: 0, need: 25, active: true, id: "CORE" });
            setMessage("THE CORE CALLS...", 2600);
          }, 2000);
        }
      } else if (z.type === "redPoolMiniboss" || z.type === "bluePoolMiniboss") {
        const isRed = z.type === "redPoolMiniboss";
        // colored explosion particles
        for (let i = 0; i < 35; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 60 + Math.random() * 220;
          s.particles.push({
            x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.6 + Math.random() * 0.5, maxLife: 1.1,
            color: isRed
              ? (Math.random() < 0.3 ? "#ff2200" : Math.random() < 0.6 ? "#ff4422" : "#cc2200")
              : (Math.random() < 0.3 ? "#2244cc" : Math.random() < 0.6 ? "#4488ff" : "#2266ff"),
            size: 3 + Math.random() * 5,
          });
        }
        // scorch decal
        s.decals.push({ x: z.x, y: z.y, r: z.radius * 2.0, color: isRed ? "#3a0a0a" : "#0a0a3a", alpha: 0.6, kind: "scorch" });
        if (s.decals.length > 120) s.decals.shift();
        s.camera.shake = Math.min(s.camera.shake + 12, 20);
        // guaranteed health and ammo drops
        s.pickups.push({ x: z.x - 15, y: z.y, kind: "health", life: 20 });
        s.pickups.push({ x: z.x + 15, y: z.y, kind: "ammo", life: 20 });
        setMessage(isRed ? "RED BALL DEFEATED!" : "BLUE BALL DEFEATED!", 2600);
      } else if (z.type === "fire") {
        // fire zombie: check if near unlit torch
        for (const torch of s.torches) {
          if (torch.lit) continue;
          const dx = torch.x - z.x, dy = torch.y - z.y;
          if (dx * dx + dy * dy < TORCH_LIGHT_RADIUS * TORCH_LIGHT_RADIUS) {
            torch.lit = true;
            soundEngine.torchLight();
            setMessage("TORCH LIT!", 2200);
            // fire particles
            for (let i = 0; i < 25; i++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 40 + Math.random() * 160;
              s.particles.push({
                x: torch.x, y: torch.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 0.6 + Math.random() * 0.4, maxLife: 1.0,
                color: Math.random() < 0.4 ? "#ff6600" : Math.random() < 0.6 ? "#ffaa00" : "#ff3300",
                size: 3 + Math.random() * 4,
              });
            }
            // check if all torches lit → spawn miniboss
            if (s.totemPhase === 0 && s.torches.every((t) => t.lit)) {
              if (!s.minibossSpawned) {
                spawnFireMiniboss();
              }
            }
            break;
          }
        }
        // fire zombie death particles (fire themed)
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 60 + Math.random() * 200;
          s.particles.push({
            x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
            color: Math.random() < 0.5 ? "#ff6600" : "#ffaa00", size: 3 + Math.random() * 4,
          });
        }
        s.decals.push({ x: z.x, y: z.y, r: z.radius * 1.6, color: "#4a2008", alpha: 0.55, kind: "scorch" });
        if (s.decals.length > 120) s.decals.shift();
      } else if (z.type === "toxic") {
        // toxic zombie: spawn gas cloud
        s.toxicGas.push({ x: z.x, y: z.y, radius: 60, life: 4, maxLife: 4 });
        setMessage("TOXIC GAS!", 1500);
        soundEngine.toxicDeath();
        // green gas particles
        for (let i = 0; i < 25; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 30 + Math.random() * 80;
          s.particles.push({
            x: z.x, y: z.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.8 + Math.random() * 0.6, maxLife: 1.4,
            color: Math.random() < 0.5 ? "#33cc33" : Math.random() < 0.7 ? "#22aa22" : "#44dd44",
            size: 5 + Math.random() * 6,
          });
        }
        s.decals.push({ x: z.x, y: z.y, r: z.radius * 1.8, color: "#0a3a0a", alpha: 0.5, kind: "scorch" });
        if (s.decals.length > 120) s.decals.shift();
      } else {
        // normal zombie: blood decal
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
      }
      // random pickup (skip for minibosses, they always drop both)
      if (z.type !== "fireMiniboss" && z.type !== "toxicMiniboss" && Math.random() < 0.06) {
        s.pickups.push({ x: z.x, y: z.y, kind: Math.random() < 0.5 ? "ammo" : "health", life: 15 });
      }
      // easter egg: totem progression (cave totem / core totem only)
      for (const t of s.totems) {
        if (!t.active) continue;
        const dx = t.x - z.x, dy = t.y - z.y;
        if (dx * dx + dy * dy < 220 * 220) {
          t.kills++;
          if (t.kills >= t.need) {
            t.active = false;
            soundEngine.totemAwaken();
            setMessage(`TOTEM ${t.id} AWAKENED`);
            if (s.totemPhase === 2 && t.id === "CAVE") {
              if (!s.toxicMinibossSpawned) {
                spawnToxicMiniboss();
              }
            } else if (s.totemPhase === 3) {
              s.totemPhase = 4;
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
              s.zombiesToSpawn = Math.floor(6 + s.round * 4 + Math.pow(s.round, 1.4));
              // spawn dark ether portal at core totem position
              s.portalActive = true;
              s.portalPos = { x: MAP_W / 2, y: SURFACE_CENTER_Y };
              // spawn glowing crate at random position on map
              const gcX = 200 + Math.random() * (MAP_W - 400);
              const gcY = 200 + Math.random() * (SURFACE_CENTER_Y * 2 - 400);
              s.glowingCrate = { x: gcX, y: gcY, w: 44, h: 44, hp: 3 };
              setMessage("THE DARK AETHER CALLS...", 3000);
            }
          }
        }
      }
      setUiState((u) => ({ ...u, points: s.points, points2: s.points2, zombiesLeft: Math.max(0, s.zombiesToSpawn) + s.zombiesAlive }));
    }

    function enterBossMap() {
      const cx = MAP_W / 2, cy = SURFACE_CENTER_Y;
      const half = BOSS_ARENA_SIZE / 2;
      s.bossMode = true;
      s.totemPhase = 5;
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
      s.torches = [];
      s.fireZombieAlive = false;
      s.fireZombieToSpawn = false;
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
        lastUnderworldSpawn: performance.now() + 2500,
      };
      setMessage("BOSS: THE HARBINGER", 3000);
      setUiState((u) => ({ ...u, round: 999, actualRound: s.round, zombiesLeft: 1, hp: s.player.hp }));
    }

    function update(dt: number) {
      if (!s.started || s.gameOver) return;

      // Poll gamepad for player 2
      pollGamepad();

      // ─── Player 1 movement (skip if dead) ────────────────────────────────
      if (s.player.hp > 0) {
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
      // glowing crate collision
      if (s.glowingCrate) {
        const gc = s.glowingCrate;
        const gcCx = gc.x + gc.w / 2, gcCy = gc.y + gc.h / 2;
        const dx = s.player.x - gcCx, dy = s.player.y - gcCy;
        const dist = Math.hypot(dx, dy);
        const minDist = s.player.r + Math.max(gc.w, gc.h) / 2;
        if (dist < minDist && dist > 0) {
          const push = minDist - dist;
          s.player.x += (dx / dist) * push;
          s.player.y += (dy / dist) * push;
        }
      }
      // boss arena bounds
      if (s.bossMode) {
        const cx = MAP_W / 2, cy = SURFACE_CENTER_Y;
        const half = BOSS_ARENA_SIZE / 2 - s.player.r;
        s.player.x = Math.max(cx - half, Math.min(cx + half, s.player.x));
        s.player.y = Math.max(cy - half, Math.min(cy + half, s.player.y));
      }
      } // end P1 alive check

      // ─── Player 2 movement (split-screen) ──────────────────────────────────
      if (s.gameMode === "split" && s.player2Alive) {
        const p2mx = s._p2MoveX;
        const p2my = s._p2MoveY;
        const p2len = Math.hypot(p2mx, p2my);
        let p2dx = 0, p2dy = 0;
        if (p2len > 0) { p2dx = p2mx / p2len; p2dy = p2my / p2len; }
        const p2sp = s.player2.speed * dt;
        s.player2.x = Math.max(20, Math.min(MAP_W - 20, s.player2.x + p2dx * p2sp));
        (s as any)._resolveObstacles(s.player2, s.player2.r);
        s.player2.y = Math.max(20, Math.min(MAP_H - 20, s.player2.y + p2dy * p2sp));
        (s as any)._resolveObstacles(s.player2, s.player2.r);
        // glowing crate collision
        if (s.glowingCrate) {
          const gc = s.glowingCrate;
          const gcCx = gc.x + gc.w / 2, gcCy = gc.y + gc.h / 2;
          const dx2 = s.player2.x - gcCx, dy2 = s.player2.y - gcCy;
          const dist2 = Math.hypot(dx2, dy2);
          const minDist2 = s.player2.r + Math.max(gc.w, gc.h) / 2;
          if (dist2 < minDist2 && dist2 > 0) {
            const push2 = minDist2 - dist2;
            s.player2.x += (dx2 / dist2) * push2;
            s.player2.y += (dy2 / dist2) * push2;
          }
        }
        // boss arena bounds for P2
        if (s.bossMode) {
          const cx = MAP_W / 2, cy = SURFACE_CENTER_Y;
          const half = BOSS_ARENA_SIZE / 2 - s.player2.r;
          s.player2.x = Math.max(cx - half, Math.min(cx + half, s.player2.x));
          s.player2.y = Math.max(cy - half, Math.min(cy + half, s.player2.y));
        }
        // P2 shooting
        if (s.mouse2.down) {
          const w2 = WEAPONS[s.currentWeaponKey2];
          if (w2.auto) shoot2();
          else if (performance.now() - s.lastShot2 > w2.fireRate) shoot2();
        }
        // P2 reload finish
        if (s.reloadingUntil2 > 0 && performance.now() >= s.reloadingUntil2) {
          s.reloadingUntil2 = 0;
          finishReload2();
        }
        // P2 walk bob
        if (p2len > 0) s.walkPhase2 += dt * 12;
        // P2 muzzle flash decay
        s.muzzleFlash2 = Math.max(0, s.muzzleFlash2 - dt * 12);
        s.hitFlash2 *= 0.9;
      }

      // world mouse (account for zoom)
      const zoom = settingsRef.current.cameraZoom === "zoomed" ? 1.4 : 1;
      const px = s.player.x - s.camera.x;
      const py = s.player.y - s.camera.y;
      s.mouse.worldX = (s.mouse.x - px) / zoom + px + s.camera.x;
      s.mouse.worldY = (s.mouse.y - py) / zoom + py + s.camera.y;
      s.player.angle = Math.atan2(s.mouse.worldY - s.player.y, s.mouse.worldX - s.player.x);

      // cave generator: stay close for 20s to restore power
      if (s.generator && !s.generator.active) {
        const genDist1 = Math.hypot(s.player.x - s.generator.x, s.player.y - s.generator.y);
        const inRange1 = genDist1 <= GENERATOR_INTERACT_DISTANCE;
        let inRange2 = false;
        if (s.gameMode === "split" && s.player2Alive) {
          const genDist2 = Math.hypot(s.player2.x - s.generator.x, s.player2.y - s.generator.y);
          inRange2 = genDist2 <= GENERATOR_INTERACT_DISTANCE;
        }
        const anyInRange = inRange1 || inRange2;
        if (anyInRange) {
          if (!s.generatorHintShown) {
            setMessage("STAY CLOSE TO POWER THE GENERATOR", 1800);
            s.generatorHintShown = true;
          }
          s.generator.progressMs = Math.min(GENERATOR_HOLD_MS, s.generator.progressMs + dt * 1000);
          if (s.generator.progressMs >= GENERATOR_HOLD_MS) {
            s.generator.active = true;
            s.generator.progressMs = GENERATOR_HOLD_MS;
            s.generatorHintShown = false;
            setMessage("CAVE LIGHTS RESTORED", 2600);
            if (!s.totems.some((tt) => tt.id === "CAVE")) {
              s.totems.push({ x: CAVE_TOTEM_POS.x, y: CAVE_TOTEM_POS.y, kills: 0, need: 15, active: true, id: "CAVE" });
              setMessage("A TOTEM AWAKENS IN THE DEPTHS...", 2600);
            }
            if (s.totemPhase === 1) {
              s.totemPhase = 2;
            }
          }
        } else {
          s.generator.progressMs = 0;
          s.generatorHintShown = false;
        }
      }

      // door hold-to-pay-half (player 1)
      if (s._doorHoldStartP1 > 0 && performance.now() - s._doorHoldStartP1 >= DOOR_HOLD_MS) {
        s._doorHoldStartP1 = 0;
        for (const o of s.obstacles) {
          if (o.type !== "door" && o.type !== "golfDoor") continue;
          const cost = o.type === "door" ? CAVE_DOOR_COST : GOLF_DOOR_COST;
          const dx = o.x + o.w / 2 - s.player.x, dy = o.y + o.h / 2 - s.player.y;
          if (dx * dx + dy * dy < 90 * 90) {
            const remaining = cost - (o.paid || 0);
            const half = Math.ceil(remaining / 2);
            if (s.points >= half) {
              s.points -= half;
              o.paid = (o.paid || 0) + half;
              soundEngine.buyWeapon();
              if (o.paid >= cost) {
                openDoor(o, 1);
              } else {
                setMessage(`PAID ${o.paid}/${cost} - ${cost - o.paid} LEFT`, 2200, 1);
              }
            } else {
              setMessage(`Need ${half} points for half`, 1800, 1);
            }
            break;
          }
        }
      }

      // door hold-to-pay-half (player 2)
      if (s.gameMode === "split" && s._doorHoldStartP2 > 0 && performance.now() - s._doorHoldStartP2 >= DOOR_HOLD_MS) {
        s._doorHoldStartP2 = 0;
        for (const o of s.obstacles) {
          if (o.type !== "door" && o.type !== "golfDoor") continue;
          const cost = o.type === "door" ? CAVE_DOOR_COST : GOLF_DOOR_COST;
          const dx = o.x + o.w / 2 - s.player2.x, dy = o.y + o.h / 2 - s.player2.y;
          if (dx * dx + dy * dy < 90 * 90) {
            const remaining = cost - (o.paid || 0);
            const half = Math.ceil(remaining / 2);
            if (s.points2 >= half) {
              s.points2 -= half;
              o.paid = (o.paid || 0) + half;
              soundEngine.buyWeapon();
              if (o.paid >= cost) {
                openDoor(o, 2);
              } else {
                setMessage(`PAID ${o.paid}/${cost} - ${cost - o.paid} LEFT`, 2200, 2);
              }
            } else {
              setMessage(`Need ${half} points for half`, 1800, 2);
            }
            break;
          }
        }
      }

      // ─── Revive hold (split-screen only) ──────────────────────────────────
      if (s.gameMode === "split" && s._reviveHoldStart > 0) {
        // Check proximity is still valid (use larger radius to avoid flickering reset)
        let stillNear = false;
        if (s._reviveTarget === 1 && s.player.hp <= 0 && s.player2Alive) {
          const dx = s.player.x - s.player2.x, dy = s.player.y - s.player2.y;
          stillNear = dx * dx + dy * dy < 120 * 120;
        } else if (s._reviveTarget === 2 && !s.player2Alive && s.player.hp > 0) {
          const dx = s.player2.x - s.player.x, dy = s.player2.y - s.player.y;
          stillNear = dx * dx + dy * dy < 120 * 120;
        }
        if (!stillNear) {
          s._reviveHoldStart = 0;
          s._reviveTarget = 0;
        } else {
          const elapsed = performance.now() - s._reviveHoldStart;
          if (elapsed >= REVIVE_HOLD_MS) {
            const target = s._reviveTarget;
            s._reviveHoldStart = 0;
            s._reviveTarget = 0;
            // Revive the downed player
            if (target === 1 && s.player.hp <= 0) {
              s.player.hp = REVIVE_HP;
              soundEngine.buyWeapon();
              setMessage("PLAYER 1 REVIVED", 2200, 2);
              setUiState((u) => ({ ...u, hp: REVIVE_HP }));
            } else if (target === 2 && !s.player2Alive) {
              s.player2.hp = REVIVE_HP;
              s.player2Alive = true;
              soundEngine.buyWeapon();
              setMessage("PLAYER 2 REVIVED", 2200, 1);
              setUiState((u) => ({ ...u, hp2: REVIVE_HP }));
            }
          }
        }
      }

      // ─── Auto-detect revive start (key held near downed player) ───────────
      // P1 holding E near downed P2
      if (s.gameMode === "split" && s._reviveHoldStart === 0 && s._reviveTarget === 0 && s.player.hp > 0 && !s.player2Alive && s.keys["e"]) {
        const dx = s.player2.x - s.player.x, dy = s.player2.y - s.player.y;
        if (dx * dx + dy * dy < 90 * 90) {
          s._reviveHoldStart = performance.now();
          s._reviveTarget = 2;
        }
      }
      // P2 holding Y near downed P1
      if (s.gameMode === "split" && s._reviveHoldStart === 0 && s._reviveTarget === 0 && s.player2Alive && s.player.hp <= 0) {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[s.controllerIndex];
        if (gp && !!(gp.buttons[3]?.pressed)) {
          const dx = s.player.x - s.player2.x, dy = s.player.y - s.player2.y;
          if (dx * dx + dy * dy < 90 * 90) {
            s._reviveHoldStart = performance.now();
            s._reviveTarget = 1;
          }
        }
      }

      // golf ball physics
      if (!s.golfCompleted && s.golfBalls.length > 0) {
        const BALL_RADIUS = 10;
        const FRICTION = 0.985;
        const BOUNCE = 0.75;
        const HOLE_RADIUS = 18;
        const WALL_T = 40;
        for (const ball of s.golfBalls) {
          if (ball.hole >= 0) continue;
          ball.x += ball.vx * dt;
          ball.y += ball.vy * dt;
          ball.vx *= FRICTION;
          ball.vy *= FRICTION;
          if (Math.abs(ball.vx) < 2 && Math.abs(ball.vy) < 2) { ball.vx = 0; ball.vy = 0; }
          // bounce off room walls
          if (ball.x - BALL_RADIUS < GOLF_ROOM_RECT.x + WALL_T) {
            ball.x = GOLF_ROOM_RECT.x + WALL_T + BALL_RADIUS;
            ball.vx = Math.abs(ball.vx) * BOUNCE;
          }
          if (ball.x + BALL_RADIUS > GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w - WALL_T) {
            ball.x = GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w - WALL_T - BALL_RADIUS;
            ball.vx = -Math.abs(ball.vx) * BOUNCE;
          }
          if (ball.y - BALL_RADIUS < GOLF_ROOM_RECT.y + WALL_T) {
            ball.y = GOLF_ROOM_RECT.y + WALL_T + BALL_RADIUS;
            ball.vy = Math.abs(ball.vy) * BOUNCE;
          }
          if (ball.y + BALL_RADIUS > GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - WALL_T) {
            ball.y = GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - WALL_T - BALL_RADIUS;
            ball.vy = -Math.abs(ball.vy) * BOUNCE;
          }
          // bounce off buy stations
          for (const b of s.buyStations) {
            const bw = 40, bh = 40;
            if (ball.x + BALL_RADIUS > b.x - bw && ball.x - BALL_RADIUS < b.x + bw &&
                ball.y + BALL_RADIUS > b.y - bh && ball.y - BALL_RADIUS < b.y + bh) {
              const overlapL = (ball.x + BALL_RADIUS) - (b.x - bw);
              const overlapR = (b.x + bw) - (ball.x - BALL_RADIUS);
              const overlapT = (ball.y + BALL_RADIUS) - (b.y - bh);
              const overlapB = (b.y + bh) - (ball.y - BALL_RADIUS);
              const minO = Math.min(overlapL, overlapR, overlapT, overlapB);
              if (minO === overlapL) { ball.x = b.x - bw - BALL_RADIUS; ball.vx = -Math.abs(ball.vx) * BOUNCE; }
              else if (minO === overlapR) { ball.x = b.x + bw + BALL_RADIUS; ball.vx = Math.abs(ball.vx) * BOUNCE; }
              else if (minO === overlapT) { ball.y = b.y - bh - BALL_RADIUS; ball.vy = -Math.abs(ball.vy) * BOUNCE; }
              else { ball.y = b.y + bh + BALL_RADIUS; ball.vy = Math.abs(ball.vy) * BOUNCE; }
            }
          }
          // check hole
          for (let hi = 0; hi < s.golfHoles.length; hi++) {
            const h = s.golfHoles[hi];
            if (Math.hypot(ball.x - h.x, ball.y - h.y) < HOLE_RADIUS) {
              ball.hole = hi;
              ball.vx = 0; ball.vy = 0;
              ball.x = h.x; ball.y = h.y;
              soundEngine.buyWeapon();
              setMessage(`BALL ${s.golfBalls.indexOf(ball) + 1} IN HOLE ${hi + 1}!`, 1500);
              break;
            }
          }
        }
        // check completion
        if (s.golfBalls.every(b => b.hole >= 0)) {
          if (s.golfBalls[0].hole === s.golfBalls[1].hole) {
            setMessage("BOTH BALLS IN SAME HOLE - TRY AGAIN", 2200);
            s.golfBalls = [
              { x: GOLF_ROOM_RECT.w / 2 - 80, y: GOLF_ROOM_RECT.h - 80, vx: 0, vy: 0, hole: -1 },
              { x: GOLF_ROOM_RECT.w / 2 + 80, y: GOLF_ROOM_RECT.h - 80, vx: 0, vy: 0, hole: -1 },
            ];
          } else {
            s.golfCompleted = true;
            setMessage("MINI GOLF COMPLETE! +2000 PTS", 3000, 0);
            s.points += 2000;
            s.points2 += 2000;
            syncWeaponUi();
          }
        }
      }

      // reload finish
      if (s.player.hp > 0 && s.reloadingUntil > 0 && performance.now() >= s.reloadingUntil) {
        s.reloadingUntil = 0;
        finishReload();
      }

      // shoot
      if (s.player.hp > 0) {
        const w = WEAPONS[s.currentWeaponKey];
        if (s.mouse.down) {
          if (w.auto) shoot();
          else if (performance.now() - s.lastShot > w.fireRate) shoot();
        }
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
          if ((obs.type === "barrel" || obs.type === "toxicBarrel") && obs.hp !== undefined) {
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
              explodeBarrel(cx, cy, obs.type === "toxicBarrel");
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
        // glowing crate hit
        if (!hit && s.glowingCrate) {
          const gc = s.glowingCrate;
          if (b.x >= gc.x && b.x <= gc.x + gc.w && b.y >= gc.y && b.y <= gc.y + gc.h) {
            hit = true;
            gc.hp--;
            soundEngine.obstacleHit();
            for (let k = 0; k < 5; k++) {
              const a = Math.random() * Math.PI * 2;
              s.particles.push({
                x: b.x, y: b.y, vx: Math.cos(a) * 80, vy: Math.sin(a) * 80,
                life: 0.3, maxLife: 0.3, color: Math.random() < 0.5 ? "#a060ff" : "#c080ff", size: 3,
              });
            }
            if (gc.hp <= 0) {
              // drop 3 ammo and 2 health
              for (let i = 0; i < 3; i++) {
                s.pickups.push({ x: gc.x + gc.w / 2 + (Math.random() - 0.5) * 30, y: gc.y + gc.h / 2 + (Math.random() - 0.5) * 30, kind: "ammo", life: 20 });
              }
              for (let i = 0; i < 2; i++) {
                s.pickups.push({ x: gc.x + gc.w / 2 + (Math.random() - 0.5) * 30, y: gc.y + gc.h / 2 + (Math.random() - 0.5) * 30, kind: "health", life: 20 });
              }
              // explosion particles
              for (let k = 0; k < 20; k++) {
                const a = Math.random() * Math.PI * 2;
                const sp = 60 + Math.random() * 140;
                s.particles.push({
                  x: gc.x + gc.w / 2, y: gc.y + gc.h / 2,
                  vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                  life: 0.6, maxLife: 0.6,
                  color: Math.random() < 0.3 ? "#ffcc44" : Math.random() < 0.6 ? "#a060ff" : "#c080ff",
                  size: 3 + Math.random() * 3,
                });
              }
              s.camera.shake = Math.min(s.camera.shake + 6, 12);
              setMessage("SUPPLY CRATE DESTROYED!", 2000);
              s.glowingCrate = null;
            }
          }
        }
        if (!hit) for (const gb of s.golfBalls) {
          if (gb.hole >= 0) continue;
          const dx = gb.x - b.x, dy = gb.y - b.y;
          if (dx * dx + dy * dy < 14 * 14) {
            const pushAngle = Math.atan2(b.vy, b.vx);
            gb.vx += Math.cos(pushAngle) * 420;
            gb.vy += Math.sin(pushAngle) * 420;
            hit = true;
            soundEngine.obstacleHit();
            for (let k = 0; k < 3; k++) {
              const a = Math.random() * Math.PI * 2;
              s.particles.push({
                x: b.x, y: b.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
                life: 0.2, maxLife: 0.2, color: "#fff", size: 2 + Math.random() * 2,
              });
            }
            break;
          }
        }
        // target ball hit detection
        if (!hit) for (const tb of s.golfTargetBalls) {
          if (tb.spawned) continue;
          const dx = tb.x - b.x, dy = tb.y - b.y;
          if (dx * dx + dy * dy < 18 * 18) {
            hit = true;
            tb.spawned = true;
            const zType = tb.color === "red" ? "redPoolMiniboss" : "bluePoolMiniboss";
            const hp = (30 + s.round * 15) * 3;
            const speed = 55 + s.round * 3;
            const radius = 22;
            s.zombies.push({ x: tb.x, y: tb.y, hp, maxHp: hp, speed, radius, type: zType });
            s.zombiesAlive++;
            s.lastPoolMinibossShot = performance.now();
            soundEngine.bossEnrage();
            setMessage(tb.color === "red" ? "RED BALL MINIBOSS!" : "BLUE BALL MINIBOSS!", 2600);
            // explosion particles on transform
            for (let k = 0; k < 20; k++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 60 + Math.random() * 150;
              s.particles.push({
                x: tb.x, y: tb.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
                life: 0.5 + Math.random() * 0.4, maxLife: 0.9,
                color: tb.color === "red" ? (Math.random() < 0.5 ? "#ff4422" : "#cc2200") : (Math.random() < 0.5 ? "#4488ff" : "#2244cc"),
                size: 3 + Math.random() * 4,
              });
            }
            s.camera.shake = Math.min(s.camera.shake + 10, 16);
            break;
          }
        }
        if (!hit) for (let j = s.zombies.length - 1; j >= 0; j--) {
          const z = s.zombies[j];
          const dx = z.x - b.x, dy = z.y - b.y;
          if (dx * dx + dy * dy < z.radius * z.radius) {
            z.hp -= b.dmg;
            hit = true;
            if (b.owner === 2) s.shotsHit2++; else s.shotsHit++;
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
              killZombie(z, false, b.owner || 1);
              if (b.owner === 2) s.shotsHit++;
            }
            break;
          }
        }
        if (hit || b.life <= 0 || b.x < 0 || b.y < 0 || b.x > MAP_W || b.y > MAP_H) {
          s.bullets.splice(i, 1);
        }
      }

      // zombies
      const caveDoorClosed = s.obstacles.some((o) => o.type === "door");
      const ghostDespawnList: Zombie[] = [];
      for (const z of s.zombies) {
        const target = getZombiePursuitTarget(z);
        const dx = target.x - z.x, dy = target.y - z.y;
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
        // Once the cave door is opened, zombies are allowed to enter the cave.
        // Before that, keep them outside so they do not clip through the locked entrance.
        if (caveDoorClosed && isInCave(z.x, z.y)) {
          z.y = Math.max(20, CAVE_RECT.y - z.radius - 2);
          z.x = Math.max(CAVE_RECT.x + z.radius + 2, Math.min(CAVE_RECT.x + CAVE_RECT.w - z.radius - 2, z.x));
          (s as any)._resolveObstacles(z, z.radius);
        }
        // ghosts cannot leave the cave — despawn at the doorway
        if (z.type === "ghost" && z.y < CAVE_RECT.y + 10) {
          ghostDespawnList.push(z);
        }
        const playerDx = s.player.x - z.x, playerDy = s.player.y - z.y;
        const playerDist = Math.hypot(playerDx, playerDy) || 1;
        if (s.player.hp > 0 && playerDist < z.radius + s.player.r) {
          damagePlayer(z.type === "brute" ? 25 : z.type === "fireMiniboss" ? 20 : z.type === "toxicMiniboss" ? 18 : z.type === "redPoolMiniboss" || z.type === "bluePoolMiniboss" ? 18 : z.type === "runner" ? 12 : z.type === "ghost" || z.type === "underworld" ? 10 : 15);
        }
        // Player 2 collision
        if (s.gameMode === "split" && s.player2Alive) {
          const p2dx = s.player2.x - z.x, p2dy = s.player2.y - z.y;
          const p2dist = Math.hypot(p2dx, p2dy) || 1;
          if (p2dist < z.radius + s.player2.r) {
            damagePlayer2(z.type === "brute" ? 25 : z.type === "fireMiniboss" ? 20 : z.type === "toxicMiniboss" ? 18 : z.type === "redPoolMiniboss" || z.type === "bluePoolMiniboss" ? 18 : z.type === "runner" ? 12 : z.type === "ghost" || z.type === "underworld" ? 10 : 15);
          }
        }
        // fireMiniboss: shoot fireball every 4 seconds (target closest player)
        if (z.type === "fireMiniboss") {
          const now = performance.now();
          if (now - s.lastMinibossShot > 4000) {
            s.lastMinibossShot = now;
            // Find closest player for targeting
            let targetPx = z.x, targetPy = z.y;
            let targetFound = false;
            if (s.player.hp > 0) {
              targetPx = s.player.x; targetPy = s.player.y;
              targetFound = true;
            }
            if (s.gameMode === "split" && s.player2Alive) {
              const d1 = targetFound ? Math.hypot(s.player.x - z.x, s.player.y - z.y) : Infinity;
              const d2 = Math.hypot(s.player2.x - z.x, s.player2.y - z.y);
              if (d2 < d1) { targetPx = s.player2.x; targetPy = s.player2.y; }
            }
            const a = Math.atan2(targetPy - z.y, targetPx - z.x);
            s.bossBullets.push({
              x: z.x + Math.cos(a) * z.radius,
              y: z.y + Math.sin(a) * z.radius,
              vx: Math.cos(a) * 400,
              vy: Math.sin(a) * 400,
              life: 3.0,
              dmg: 20,
            });
            s.camera.shake = Math.min(s.camera.shake + 4, 12);
            // fireball spawn particles
            for (let k = 0; k < 6; k++) {
              const pa = Math.random() * Math.PI * 2;
              s.particles.push({
                x: z.x + Math.cos(a) * z.radius, y: z.y + Math.sin(a) * z.radius,
                vx: Math.cos(pa) * 60, vy: Math.sin(pa) * 60,
                life: 0.3, maxLife: 0.3,
                color: Math.random() < 0.5 ? "#ff6600" : "#ffaa00", size: 3,
              });
            }
          }
        }
        // toxicMiniboss: throw toxic gas cloud every 3 seconds (target closest player)
        if (z.type === "toxicMiniboss") {
          const now = performance.now();
          if (now - s.lastToxicMinibossShot > 3000) {
            s.lastToxicMinibossShot = now;
            let targetPx = z.x, targetPy = z.y;
            if (s.player.hp > 0) {
              targetPx = s.player.x; targetPy = s.player.y;
            }
            if (s.gameMode === "split" && s.player2Alive) {
              const d1 = s.player.hp > 0 ? Math.hypot(s.player.x - z.x, s.player.y - z.y) : Infinity;
              const d2 = Math.hypot(s.player2.x - z.x, s.player2.y - z.y);
              if (d2 < d1) { targetPx = s.player2.x; targetPy = s.player2.y; }
            }
            const a = Math.atan2(targetPy - z.y, targetPx - z.x);
            const throwSpeed = 170;
            s.toxicProjectiles.push({
              x: z.x + Math.cos(a) * z.radius,
              y: z.y + Math.sin(a) * z.radius,
              vx: Math.cos(a) * throwSpeed,
              vy: Math.sin(a) * throwSpeed,
              distTraveled: 0,
              maxDist: 100,
            });
            s.camera.shake = Math.min(s.camera.shake + 3, 10);
            // throw spawn particles
            for (let k = 0; k < 5; k++) {
              const pa = Math.random() * Math.PI * 2;
              s.particles.push({
                x: z.x + Math.cos(a) * z.radius, y: z.y + Math.sin(a) * z.radius,
                vx: Math.cos(pa) * 50, vy: Math.sin(pa) * 50,
                life: 0.3, maxLife: 0.3,
                color: Math.random() < 0.5 ? "#33cc33" : "#22aa22", size: 3,
              });
            }
          }
        }
        // redPoolMiniboss / bluePoolMiniboss: shoot colored pool ball every 2 seconds (target closest player)
        if (z.type === "redPoolMiniboss" || z.type === "bluePoolMiniboss") {
          const now = performance.now();
          if (now - s.lastPoolMinibossShot > 2000) {
            s.lastPoolMinibossShot = now;
            let targetPx = z.x, targetPy = z.y;
            if (s.player.hp > 0) {
              targetPx = s.player.x; targetPy = s.player.y;
            }
            if (s.gameMode === "split" && s.player2Alive) {
              const d1 = s.player.hp > 0 ? Math.hypot(s.player.x - z.x, s.player.y - z.y) : Infinity;
              const d2 = Math.hypot(s.player2.x - z.x, s.player2.y - z.y);
              if (d2 < d1) { targetPx = s.player2.x; targetPy = s.player2.y; }
            }
            const a = Math.atan2(targetPy - z.y, targetPx - z.x);
            const ballColor = z.type === "redPoolMiniboss" ? "#ff3322" : "#3366ff";
            s.bossBullets.push({
              x: z.x + Math.cos(a) * z.radius,
              y: z.y + Math.sin(a) * z.radius,
              vx: Math.cos(a) * 350,
              vy: Math.sin(a) * 350,
              life: 3.0,
              dmg: 18,
              color: ballColor,
            });
            s.camera.shake = Math.min(s.camera.shake + 4, 12);
            // pool ball spawn particles
            for (let k = 0; k < 6; k++) {
              const pa = Math.random() * Math.PI * 2;
              s.particles.push({
                x: z.x + Math.cos(a) * z.radius, y: z.y + Math.sin(a) * z.radius,
                vx: Math.cos(pa) * 50, vy: Math.sin(pa) * 50,
                life: 0.3, maxLife: 0.3,
                color: ballColor, size: 3,
              });
            }
          }
        }
      }
      // remove ghosts that tried to leave the cave
      for (const g of ghostDespawnList) {
        const i = s.zombies.indexOf(g);
        if (i !== -1) {
          s.zombies.splice(i, 1);
          s.zombiesAlive--;
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

      // spawning (disabled in boss mode)
      if (!s.bossMode && s.totemPhase < 5 && s.zombiesToSpawn > 0) {
        s.spawnCooldown -= dt * 1000;
        if (s.spawnCooldown <= 0 && s.zombiesAlive < Math.min(24, 8 + s.round * 2)) {
          spawnZombie();
          s.zombiesToSpawn--;
          s.spawnCooldown = Math.max(200, 800 - s.round * 40);
        }
      }
      // fire zombie spawn
      if (s.fireZombieToSpawn && !s.fireZombieAlive && !s.bossMode && s.totemPhase < 5) {
        spawnFireZombie();
        s.fireZombieToSpawn = false;
      }
      // ghost zombie spawn in dark cave (only when generator is off and player is inside cave)
      if (s.started && !s.gameOver && !s.bossMode && s.generator && !s.generator.active && isInCave(s.player.x, s.player.y)) {
        s.ghostSpawnTimer += dt;
        if (s.ghostSpawnTimer >= 2.0) {
          s.ghostSpawnTimer = 0;
          spawnGhostZombie();
        }
      }
      // despawn all ghosts when generator turns on
      if (s.generator && s.generator.active) {
        s.ghostSpawnTimer = 0;
        for (let i = s.zombies.length - 1; i >= 0; i--) {
          if (s.zombies[i].type === "ghost") {
            s.zombies.splice(i, 1);
            s.zombiesAlive--;
          }
        }
      }
      // portal phase: spawn fire and toxic zombies every 6s
      if (s.portalActive && !s.bossMode && s.totemPhase === 4) {
        s.portalSpawnTimer += dt;
        if (s.portalSpawnTimer >= 6.0) {
          s.portalSpawnTimer = 0;
          // spawn a fire zombie
          if (!s.fireZombieAlive) {
            spawnFireZombie();
          }
          // spawn a toxic zombie (reuse fire zombie spawning logic with toxic type)
          const toxHp = 30 + s.round * 15;
          const toxSpeed = 45 + s.round * 3;
          const toxRadius = 18;
          let toxX = s.player.x, toxY = s.player.y;
          for (let attempt = 0; attempt < 12; attempt++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = 700;
            const x = s.player.x + Math.cos(angle) * dist;
            const y = s.player.y + Math.sin(angle) * dist;
            toxX = Math.max(50, Math.min(MAP_W - 50, x));
            toxY = Math.max(50, Math.min(MAP_H - 50, y));
            if (!isInCave(toxX, toxY)) break;
          }
          if (isInCave(toxX, toxY)) {
            toxY = Math.max(50, CAVE_RECT.y - 120 - Math.random() * 160);
          }
          s.zombies.push({ x: toxX, y: toxY, hp: toxHp, maxHp: toxHp, speed: toxSpeed, radius: toxRadius, type: "toxic" });
          s.zombiesAlive++;
        }
      }
      // round continues during portal phase (advance when all zombies cleared)
      if (!s.bossMode && s.portalActive && s.totemPhase === 4 && s.zombiesAlive === 0 && s.zombiesToSpawn === 0 && !s.portalRoundPending) {
        s.portalRoundPending = true;
        setTimeout(() => {
          s.round++;
          s.portalRoundPending = false;
          s.zombiesAlive = 0;
          s.zombiesToSpawn = Math.floor(6 + s.round * 4 + Math.pow(s.round, 1.4));
          setMessage(`ROUND ${s.round}`, 2200);
          soundEngine.roundStart();
          setUiState((u) => ({ ...u, round: s.round, actualRound: s.round, zombiesLeft: s.zombiesToSpawn }));
        }, 3000);
      }
      if (!s.bossMode && !s.portalActive && s.totemPhase < 5 && s.totemPhase !== 4 && s.zombiesToSpawn === 0 && s.zombiesAlive === 0) {
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

        // spawn underworld ghost zombies during phase 1 only (every 2.5s, max 7)
        if (bs.phase === 1) {
          const underworldCount = s.zombies.filter(z => z.type === "underworld").length;
          if (now - bs.lastUnderworldSpawn > 2500 && underworldCount < 7) {
            bs.lastUnderworldSpawn = now;
            spawnUnderworldZombie();
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
          // track closest player direction each frame during sprint
          let chargeTargetX = s.player.x, chargeTargetY = s.player.y;
          if (s.gameMode === "split" && s.player2Alive) {
            const cd1 = Math.hypot(s.player.x - bs.x, s.player.y - bs.y);
            const cd2 = Math.hypot(s.player2.x - bs.x, s.player2.y - bs.y);
            if (cd2 < cd1) { chargeTargetX = s.player2.x; chargeTargetY = s.player2.y; }
          }
          const sdx = chargeTargetX - bs.x, sdy = chargeTargetY - bs.y;
          const sd = Math.hypot(sdx, sdy) || 1;
          bs.chargeDirX = sdx / sd;
          bs.chargeDirY = sdy / sd;
          // sprint toward player at 3.5x speed
          bs.x += bs.chargeDirX * bs.speed * 3.5 * dt;
          (s as any)._resolveObstacles(bs, bs.radius);
          bs.y += bs.chargeDirY * bs.speed * 3.5 * dt;
          (s as any)._resolveObstacles(bs, bs.radius);
          // arena bounds
          const cx = MAP_W / 2, cy = SURFACE_CENTER_Y, half = BOSS_ARENA_SIZE / 2 - bs.radius;
          bs.x = Math.max(cx - half, Math.min(cx + half, bs.x));
          bs.y = Math.max(cy - half, Math.min(cy + half, bs.y));
          // sprint trail particles
          if (Math.random() < 0.5) {
            const aa = Math.random() * Math.PI * 2;
            s.particles.push({ x: bs.x, y: bs.y, vx: Math.cos(aa) * 80, vy: Math.sin(aa) * 80, life: 0.3, maxLife: 0.3, color: "#ff6600", size: 3 });
          }
          // contact damage during sprint
          if (s.player.hp > 0) {
            const cdx = s.player.x - bs.x, cdy = s.player.y - bs.y;
            if (cdx * cdx + cdy * cdy < (bs.radius + s.player.r + 10) * (bs.radius + s.player.r + 10)) {
              damagePlayer(50);
            }
          }
          // sprint ends
          if (bs.chargeTimer <= 0) {
            bs.charging = false;
            bs.lastCharge = now;
          }
        }

        if (!bs.charging) {
          let bossMoveTargetX = s.player.hp > 0 ? s.player.x : bs.x;
          let bossMoveTargetY = s.player.hp > 0 ? s.player.y : bs.y;
          if (s.gameMode === "split" && s.player2Alive) {
            const bm1 = s.player.hp > 0 ? Math.hypot(s.player.x - bs.x, s.player.y - bs.y) : Infinity;
            const bm2 = Math.hypot(s.player2.x - bs.x, s.player2.y - bs.y);
            if (bm2 < bm1) { bossMoveTargetX = s.player2.x; bossMoveTargetY = s.player2.y; }
          }
          const dx = bossMoveTargetX - bs.x, dy = bossMoveTargetY - bs.y;
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
          const cx = MAP_W / 2, cy = SURFACE_CENTER_Y, half = BOSS_ARENA_SIZE / 2 - bs.radius;
          bs.x = Math.max(cx - half, Math.min(cx + half, bs.x));
          bs.y = Math.max(cy - half, Math.min(cy + half, bs.y));
          if (s.player.hp > 0 && d < bs.radius + s.player.r) damagePlayer(bs.phase === 2 ? 40 : 30);
          // Player 2 boss contact damage
          if (s.gameMode === "split" && s.player2Alive) {
            const d2 = Math.hypot(s.player2.x - bs.x, s.player2.y - bs.y);
            if (d2 < bs.radius + s.player2.r) damagePlayer2(bs.phase === 2 ? 40 : 30);
          }
          // shoot (target closest player)
          const shootInterval = bs.phase === 2 ? 3500 : 5000;
          if (now - bs.lastShot > shootInterval) {
            bs.lastShot = now;
            let bossTargetX = s.player.hp > 0 ? s.player.x : bs.x;
            let bossTargetY = s.player.hp > 0 ? s.player.y : bs.y;
            if (s.gameMode === "split" && s.player2Alive) {
              const bd1 = s.player.hp > 0 ? Math.hypot(s.player.x - bs.x, s.player.y - bs.y) : Infinity;
              const bd2 = Math.hypot(s.player2.x - bs.x, s.player2.y - bs.y);
              if (bd2 < bd1) { bossTargetX = s.player2.x; bossTargetY = s.player2.y; }
            }
            const a = Math.atan2(bossTargetY - bs.y, bossTargetX - bs.x);
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
            if (b.owner === 2) s.shotsHit2++; else s.shotsHit++;
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
          // clear underworld zombies on boss death
          for (let i = s.zombies.length - 1; i >= 0; i--) {
            if (s.zombies[i].type === "underworld") {
              s.zombies.splice(i, 1);
              s.zombiesAlive--;
            }
          }
          s.boss = null;
          s.bossMode = false;
          s.won = true;
          s.kills++;
          s.gameOver = true;
          s.showingFireworks = true;
          s.fireworksTimer = 2.0;
          s.points += 5000;
          s.points2 += 5000;
        }
      }

      // boss bullets
      for (let i = s.bossBullets.length - 1; i >= 0; i--) {
        const b = s.bossBullets[i];
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        // Player 1 boss bullet collision
        if (s.player.hp > 0) {
          const pdx = b.x - s.player.x, pdy = b.y - s.player.y;
          if (pdx * pdx + pdy * pdy < (s.player.r + 4) * (s.player.r + 4)) {
            damagePlayer(b.dmg);
            s.bossBullets.splice(i, 1); continue;
          }
        }
        // Player 2 boss bullet collision
        if (s.gameMode === "split" && s.player2Alive) {
          const p2dx = b.x - s.player2.x, p2dy = b.y - s.player2.y;
          if (p2dx * p2dx + p2dy * p2dy < (s.player2.r + 4) * (s.player2.r + 4)) {
            damagePlayer2(b.dmg);
            s.bossBullets.splice(i, 1); continue;
          }
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
                s.player.hp = 0;
                const inCave = isInCave(s.player.x, s.player.y) && !s.generator.active;
                if (inCave) {
                  s.jumpscareUntil = performance.now() + 1500;
                  soundEngine.jumpscare();
                  s.camera.shake = 20;
                } else {
                  setUiState((u) => ({ ...u, hp: 0 }));
                }
              } else {
                setUiState((u) => ({ ...u, hp: s.player.hp }));
              }
            }
            break;
          }
          // Player 2 lava damage
          if (s.gameMode === "split" && s.player2Alive) {
            if (s.player2.x > l.x && s.player2.x < l.x + l.w && s.player2.y > l.y && s.player2.y < l.y + l.h) {
              if (now - s.lastLavaDmg > 350) {
                s.lastLavaDmg = now;
                soundEngine.lavaBurn();
                s.player2.hp -= 8;
                s.hitFlash2 = Math.max(s.hitFlash2, 0.5);
                if (s.player2.hp <= 0) {
                  s.player2.hp = 0;
                  s.player2Alive = false;
                } else {
                  setUiState((u) => ({ ...u, hp2: s.player2.hp }));
                }
              }
              break;
            }
          }
        }
      }

      // toxic projectile update: move toward target, land when traveled enough
      for (let i = s.toxicProjectiles.length - 1; i >= 0; i--) {
        const p = s.toxicProjectiles[i];
        const moveX = p.vx * dt;
        const moveY = p.vy * dt;
        const moveDist = Math.hypot(moveX, moveY);
        p.x += moveX;
        p.y += moveY;
        p.distTraveled += moveDist;
        // trail particles
        if (Math.random() < 0.5) {
          s.particles.push({
            x: p.x, y: p.y,
            vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30,
            life: 0.25, maxLife: 0.25,
            color: Math.random() < 0.5 ? "#33cc33" : "#22aa22", size: 2,
          });
        }
        // landed: convert to toxic gas cloud
        if (p.distTraveled >= p.maxDist) {
          s.toxicGas.push({ x: p.x, y: p.y, radius: 60, life: 4, maxLife: 4 });
          // landing burst particles
          for (let k = 0; k < 8; k++) {
            const a = Math.random() * Math.PI * 2;
            s.particles.push({
              x: p.x, y: p.y,
              vx: Math.cos(a) * 50, vy: Math.sin(a) * 50,
              life: 0.4, maxLife: 0.4,
              color: Math.random() < 0.5 ? "#44dd44" : "#22aa22", size: 3,
            });
          }
          s.toxicProjectiles.splice(i, 1);
        }
      }

      // toxic gas update and damage
      for (let i = s.toxicGas.length - 1; i >= 0; i--) {
        const g = s.toxicGas[i];
        g.life -= dt;
        if (g.life <= 0) {
          s.toxicGas.splice(i, 1);
          continue;
        }
        // damage player if inside gas
        const gdx = s.player.x - g.x, gdy = s.player.y - g.y;
        if (gdx * gdx + gdy * gdy < g.radius * g.radius) {
          const now = performance.now();
          if (now - s.lastToxicDmg > 500) {
            s.lastToxicDmg = now;
            soundEngine.lavaBurn();
            s.player.hp -= 5;
            s.hitFlash = Math.max(s.hitFlash, 0.4);
            if (s.player.hp <= 0) {
              s.player.hp = 0;
              const inCave = isInCave(s.player.x, s.player.y) && !s.generator.active;
              if (inCave) {
                s.jumpscareUntil = performance.now() + 1500;
                soundEngine.jumpscare();
                s.camera.shake = 20;
              } else {
                setUiState((u) => ({ ...u, hp: 0 }));
              }
            } else {
              setUiState((u) => ({ ...u, hp: s.player.hp }));
            }
          }
        }
        // Player 2 toxic gas damage
        if (s.gameMode === "split" && s.player2Alive) {
          const g2dx = s.player2.x - g.x, g2dy = s.player2.y - g.y;
          if (g2dx * g2dx + g2dy * g2dy < g.radius * g.radius) {
            const now = performance.now();
            if (now - s.lastToxicDmg > 500) {
              s.lastToxicDmg = now;
              soundEngine.lavaBurn();
              s.player2.hp -= 5;
              s.hitFlash2 = Math.max(s.hitFlash2, 0.4);
              if (s.player2.hp <= 0) {
                s.player2.hp = 0;
                s.player2Alive = false;
              } else {
                setUiState((u) => ({ ...u, hp2: s.player2.hp }));
              }
            }
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
        // Player 2 pickup
        if (s.gameMode === "split" && s.player2Alive) {
          const p2dx = p.x - s.player2.x, p2dy = p.y - s.player2.y;
          if (p2dx * p2dx + p2dy * p2dy < 30 * 30) {
            soundEngine.pickup();
            if (p.kind === "health") {
              s.player2.hp = Math.min(s.player2.maxHp, s.player2.hp + 40);
              setUiState((u) => ({ ...u, hp2: s.player2.hp }));
            } else {
              const pw = s.weapons2[s.currentWeaponKey2];
              const ww = WEAPONS[s.currentWeaponKey2];
              pw.reserve = Math.min(ww.reserve, pw.reserve + Math.floor(ww.magSize * 2));
              syncWeaponUi2();
            }
            s.pickups.splice(i, 1);
            continue;
          }
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

      // camera (player 1)
      const vpW = s.gameMode === "split" ? canvas.width / 2 : canvas.width;
      const targetX = s.player.x - vpW / 2;
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
      if (s.player.hp > 0) {
        s.muzzleFlash = Math.max(0, s.muzzleFlash - dt * 12);
        // walk bob when moving
        const isMoving = (s.keys["w"] || s.keys["a"] || s.keys["s"] || s.keys["d"] ||
          s.keys["arrowup"] || s.keys["arrowdown"] || s.keys["arrowleft"] || s.keys["arrowright"]);
        if (isMoving) s.walkPhase += dt * 12;
      }
      // Camera 2 (player 2)
      if (s.gameMode === "split") {
        const t2x = s.player2.x - vpW / 2;
        const t2y = s.player2.y - canvas.height / 2;
        s.camera2.x += (t2x - s.camera2.x) * 0.15;
        s.camera2.y += (t2y - s.camera2.y) * 0.15;
        if (s.camera2.shake > 0) {
          s.camera2.x += (Math.random() - 0.5) * s.camera2.shake;
          s.camera2.y += (Math.random() - 0.5) * s.camera2.shake;
          s.camera2.shake *= 0.85;
          if (s.camera2.shake < 0.1) s.camera2.shake = 0;
        }
      }
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
        const cx = MAP_W / 2 - s.camera.x, cy = SURFACE_CENTER_Y - s.camera.y;
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
        if (!isInFlashlight(b.x, b.y)) continue;
        const w = WEAPONS[b.weapon];
        const owned = s.weapons[b.weapon]?.owned;
        const hasPower = !!s.generator?.active;
        const isCurrent = s.currentWeaponKey === b.weapon;
        ctx.fillStyle = "#2a1a0a";
        if (!hasPower) {
          ctx.strokeStyle = "#c93030";
        } else if (isCurrent) {
          ctx.strokeStyle = "#c9a24a";
        } else {
          ctx.strokeStyle = "#4a7c3a";
        }
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, 40, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = hasPower ? "#c9a24a" : "#888";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText(w.name.toUpperCase(), sx, sy - 5);
        if (hasPower) {
          ctx.fillStyle = owned ? "#7fbf5f" : "#e0e0e0";
          ctx.fillText(owned ? `REFILL ${Math.floor(w.cost * 0.5)}` : `${w.cost}`, sx, sy + 12);
        }
        const db = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
        const dx = b.x - db.x, dy = b.y - db.y;
        if (dx * dx + dy * dy < 100 * 100) {
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px monospace";
          ctx.fillText(hasPower ? "[E] BUY" : "POWER NEEDED", sx, sy - 55);
        }
      }
      for (const a of s.ammoBoxes) {
        const sx = a.x - s.camera.x, sy = a.y - s.camera.y;
        ctx.fillStyle = "#1a2a1a";
        ctx.strokeStyle = "#4a7c3a";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(sx, sy, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#4a7c3a";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("AMMO", sx, sy - 3);
        ctx.fillText("500", sx, sy + 12);
        const da = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
        const dx = a.x - da.x, dy = a.y - da.y;
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
        ctx.beginPath();
        ctx.arc(sx, sy, 30, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#4a7c3a";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("AMMO", sx, sy - 3);
        ctx.fillText("500", sx, sy + 12);
        const dab = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
        const dx = a.x - dab.x, dy = a.y - dab.y;
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

    function drawPlayerAt(
      px: number, py: number, angle: number, radius: number,
      walkPhaseVal: number, muzzleFlashVal: number, isP2: boolean,
    ) {
      const sx = px - s.camera.x, sy = py - s.camera.y;
      const bob = Math.sin(walkPhaseVal) * 1.5;
      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(sx + 3, sy + 6, radius + 2, (radius + 2) * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      // aim laser
      const laserLen = 260;
      const grd = ctx.createLinearGradient(sx, sy, sx + Math.cos(angle) * laserLen, sy + Math.sin(angle) * laserLen);
      const laserColor = isP2 ? "rgba(70,150,255," : "rgba(255,80,60,";
      grd.addColorStop(0, laserColor + "0.55)");
      grd.addColorStop(1, laserColor + "0)");
      ctx.strokeStyle = grd;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(angle) * 22, sy + Math.sin(angle) * 22);
      ctx.lineTo(sx + Math.cos(angle) * laserLen, sy + Math.sin(angle) * laserLen);
      ctx.stroke();

      ctx.save();
      ctx.translate(sx, sy + bob);
      ctx.rotate(angle);
      // muzzle flash glow
      if (muzzleFlashVal > 0.05) {
        const mf = muzzleFlashVal;
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
      ctx.fillStyle = isP2 ? "#3a4a6a" : "#4a5a3a";
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isP2 ? "#1a2a4a" : "#2a3a1a";
      ctx.lineWidth = 2;
      ctx.stroke();
      // shoulder highlight
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.arc(-3, -4, radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
      // helmet
      ctx.fillStyle = isP2 ? "#1a2a3a" : "#2a2a2a";
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.beginPath();
      ctx.arc(-2, -3, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    function drawPlayer() {
      // Draw P1 (or downed indicator)
      if (s.player.hp > 0) {
        drawPlayerAt(s.player.x, s.player.y, s.player.angle, s.player.r, s.walkPhase, s.muzzleFlash, false);
      } else if (s.gameMode === "split" && s.player2Alive) {
        // P1 downed
        const sx = s.player.x - s.camera.x, sy = s.player.y - s.camera.y;
        ctx.fillStyle = "rgba(255,60,60,0.35)";
        ctx.beginPath();
        ctx.arc(sx, sy, s.player.r + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#aa3333";
        ctx.beginPath();
        ctx.arc(sx, sy, s.player.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#661a1a";
        ctx.lineWidth = 2;
        ctx.stroke();
        // Revive progress arc or prompt
        const dp = s.player2;
        const ddx = s.player.x - dp.x, ddy = s.player.y - dp.y;
        if (ddx * ddx + ddy * ddy < 110 * 110) {
          if (s._reviveHoldStart > 0 && s._reviveTarget === 1) {
            const progress = Math.min(1, (performance.now() - s._reviveHoldStart) / REVIVE_HOLD_MS);
            ctx.beginPath();
            ctx.arc(sx, sy, s.player.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.strokeStyle = "#ff6666";
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 11px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${Math.floor(progress * 100)}%`, sx, sy - s.player.r - 20);
          } else {
            ctx.fillStyle = "#ff6666";
            ctx.font = "bold 11px monospace";
            ctx.textAlign = "center";
            ctx.fillText("HOLD [Y] REVIVE", sx, sy - s.player.r - 12);
          }
        }
      }
      // Draw P2 (or downed indicator)
      if (s.gameMode === "split") {
        if (s.player2Alive) {
          drawPlayerAt(s.player2.x, s.player2.y, s.player2.angle, s.player2.r, s.walkPhase2, s.muzzleFlash2, true);
        } else if (s.player.hp > 0) {
          // P2 downed
          const sx = s.player2.x - s.camera.x, sy = s.player2.y - s.camera.y;
          ctx.fillStyle = "rgba(70,150,255,0.35)";
          ctx.beginPath();
          ctx.arc(sx, sy, s.player2.r + 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#3366aa";
          ctx.beginPath();
          ctx.arc(sx, sy, s.player2.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#1a3366";
          ctx.lineWidth = 2;
          ctx.stroke();
          // Revive progress arc or prompt
          const dp = s.player;
          const ddx = s.player2.x - dp.x, ddy = s.player2.y - dp.y;
          if (ddx * ddx + ddy * ddy < 110 * 110) {
            if (s._reviveHoldStart > 0 && s._reviveTarget === 2) {
              const progress = Math.min(1, (performance.now() - s._reviveHoldStart) / REVIVE_HOLD_MS);
              ctx.beginPath();
              ctx.arc(sx, sy, s.player2.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
              ctx.strokeStyle = "#66aaff";
              ctx.lineWidth = 4;
              ctx.stroke();
              ctx.fillStyle = "#fff";
              ctx.font = "bold 11px monospace";
              ctx.textAlign = "center";
              ctx.fillText(`${Math.floor(progress * 100)}%`, sx, sy - s.player2.r - 20);
            } else {
              ctx.fillStyle = "#66aaff";
              ctx.font = "bold 11px monospace";
              ctx.textAlign = "center";
              ctx.fillText("HOLD [E] REVIVE", sx, sy - s.player2.r - 12);
            }
          }
        }
      }
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
        } else if (o.type === "caveWall") {
          const grd = ctx.createLinearGradient(sx, sy, sx + o.w, sy + o.h);
          grd.addColorStop(0, "#19130f");
          grd.addColorStop(0.55, "#2d231a");
          grd.addColorStop(1, "#100c09");
          ctx.fillStyle = grd;
          ctx.fillRect(sx, sy, o.w, o.h);
          ctx.strokeStyle = "rgba(255, 220, 160, 0.08)";
          ctx.lineWidth = 2;
          ctx.strokeRect(sx, sy, o.w, o.h);
          ctx.fillStyle = "rgba(255, 220, 160, 0.05)";
          for (let i = 0; i < 4; i++) {
            const rx = sx + 10 + i * (o.w / 4);
            const ry = sy + 8 + ((i % 2) * 6);
            ctx.beginPath();
            ctx.arc(rx, ry, 6 + (i % 3), 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (o.type === "door") {
          const frame = ctx.createLinearGradient(sx, sy, sx, sy + o.h);
          frame.addColorStop(0, "#4a341f");
          frame.addColorStop(0.5, "#2e2012");
          frame.addColorStop(1, "#1a120a");
          ctx.fillStyle = frame;
          ctx.fillRect(sx, sy, o.w, o.h);
          ctx.strokeStyle = "#7b5a33";
          ctx.lineWidth = 3;
          ctx.strokeRect(sx, sy, o.w, o.h);
          ctx.fillStyle = "#927047";
          ctx.fillRect(sx + 8, sy + 6, o.w - 16, o.h - 12);
          ctx.strokeStyle = "#3a2817";
          ctx.lineWidth = 2;
          ctx.strokeRect(sx + 8, sy + 6, o.w - 16, o.h - 12);
          for (let i = 1; i < 4; i++) {
            const px = sx + (o.w / 4) * i;
            ctx.beginPath();
            ctx.moveTo(px, sy + 8);
            ctx.lineTo(px, sy + o.h - 8);
            ctx.stroke();
          }
          ctx.fillStyle = "#d8b56a";
          ctx.beginPath();
          ctx.arc(sx + o.w - 18, sy + o.h / 2, 4, 0, Math.PI * 2);
          ctx.fill();
          const dp = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
          const dx = o.x + o.w / 2 - dp.x, dy = o.y + o.h / 2 - dp.y;
          if (dx * dx + dy * dy < 110 * 110) {
            const remaining = CAVE_DOOR_COST - (o.paid || 0);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 12px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`[E] OPEN ${remaining}`, sx + o.w / 2, sy - 10);
            if (s.gameMode === "split") {
              ctx.fillStyle = "#ccc";
              ctx.font = "bold 9px monospace";
              ctx.fillText(`HOLD [E] PAY HALF`, sx + o.w / 2, sy - 22);
            }
          }
        } else if (o.type === "golfDoor") {
          const frame = ctx.createLinearGradient(sx, sy, sx, sy + o.h);
          frame.addColorStop(0, "#2a4a2a");
          frame.addColorStop(0.5, "#1a3a1a");
          frame.addColorStop(1, "#0a2a0a");
          ctx.fillStyle = frame;
          ctx.fillRect(sx, sy, o.w, o.h);
          ctx.strokeStyle = "#4a8a4a";
          ctx.lineWidth = 3;
          ctx.strokeRect(sx, sy, o.w, o.h);
          ctx.fillStyle = "#5aaa5a";
          ctx.fillRect(sx + 8, sy + 6, o.w - 16, o.h - 12);
          ctx.strokeStyle = "#2a5a2a";
          ctx.lineWidth = 2;
          ctx.strokeRect(sx + 8, sy + 6, o.w - 16, o.h - 12);
          for (let i = 1; i < 4; i++) {
            const px = sx + (o.w / 4) * i;
            ctx.beginPath();
            ctx.moveTo(px, sy + 8);
            ctx.lineTo(px, sy + o.h - 8);
            ctx.stroke();
          }
          ctx.fillStyle = "#a0d8a0";
          ctx.beginPath();
          ctx.arc(sx + o.w - 18, sy + o.h / 2, 4, 0, Math.PI * 2);
          ctx.fill();
          const dp2 = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
          const dx2 = o.x + o.w / 2 - dp2.x, dy2 = o.y + o.h / 2 - dp2.y;
          if (dx2 * dx2 + dy2 * dy2 < 110 * 110) {
            const remaining = GOLF_DOOR_COST - (o.paid || 0);
            ctx.fillStyle = "#fff";
            ctx.font = "bold 12px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`[E] OPEN ${remaining}`, sx + o.w / 2, sy - 10);
            if (s.gameMode === "split") {
              ctx.fillStyle = "#ccc";
              ctx.font = "bold 9px monospace";
              ctx.fillText(`HOLD [E] PAY HALF`, sx + o.w / 2, sy - 22);
            }
          }
        } else if (o.type === "barrel" || (o.type === "toxicBarrel" && isInFlashlight(o.x + o.w / 2, o.y + o.h / 2))) {
          const cx = sx + o.w / 2, cy = sy + o.h / 2, r = o.w / 2;
          const hpRatio = o.hp !== undefined ? Math.max(0, o.hp / 50) : 1;
          if (o.type === "toxicBarrel") {
            // toxic barrel: green color scheme
            const cr = Math.round(20 * hpRatio + 10 * (1 - hpRatio));
            const cg = Math.round(120 * hpRatio + 30 * (1 - hpRatio));
            const cb = Math.round(20 * hpRatio + 10 * (1 - hpRatio));
            ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#0a2a0a";
            ctx.lineWidth = 2; ctx.stroke();
            // toxic bubble indicator
            const pulse = 0.4 + Math.sin(performance.now() * 0.005) * 0.2;
            const tgrd = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.8);
            tgrd.addColorStop(0, `rgba(50,200,50,${0.3 * pulse})`);
            tgrd.addColorStop(1, "rgba(30,120,30,0)");
            ctx.fillStyle = tgrd;
            ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2); ctx.fill();
            // warning stripe when damaged
            if (hpRatio < 0.7) {
              ctx.strokeStyle = hpRatio < 0.4 ? "#ff3300" : "#33cc33";
              ctx.lineWidth = 1.5;
              ctx.setLineDash([3, 3]);
              ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
              ctx.setLineDash([]);
            }
            ctx.strokeStyle = "#1a4a1a";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
            ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
            ctx.stroke();
          } else {
            // normal barrel: brown color scheme
            const cr = Math.round(122 * hpRatio + 30 * (1 - hpRatio));
            const cg = Math.round(42 * hpRatio);
            const cb = Math.round(26 * hpRatio);
            ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = "#2a0a05";
            ctx.lineWidth = 2; ctx.stroke();
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
    }

    function drawZombies() {
      const now = performance.now() / 1000;
      for (const z of s.zombies) {
        const sx = z.x - s.camera.x, sy = z.y - s.camera.y;
        if (sx < -50 || sy < -50 || sx > canvas.width + 50 || sy > canvas.height + 50) continue;
        const basicZombie = z.type === "walker" || z.type === "runner" || z.type === "brute";
        const basicLit = !basicZombie || isInFlashlight(z.x, z.y);
        // shadow
        if (basicLit) {
          ctx.fillStyle = "rgba(0,0,0,0.45)";
          ctx.beginPath();
          ctx.ellipse(sx + 3, sy + z.radius * 0.5, z.radius + 2, (z.radius + 2) * 0.45, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        const bob = Math.sin(now * 5 + (z.x + z.y) * 0.01) * 1.5;
        const cy = sy + bob;
        if (z.type === "fire") {
          // fire zombie aura
          const fpulse = 0.5 + Math.sin(now * 8) * 0.3;
          const fgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 2.5);
          fgrd.addColorStop(0, `rgba(255,120,20,${0.35 * fpulse})`);
          fgrd.addColorStop(0.5, `rgba(255,60,0,${0.15 * fpulse})`);
          fgrd.addColorStop(1, "rgba(200,30,0,0)");
          ctx.fillStyle = fgrd;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius * 2.5, 0, Math.PI * 2); ctx.fill();
          // body
          ctx.fillStyle = "#5a1a0a";
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.fill();
          // flame crown
          for (let fi = 0; fi < 5; fi++) {
            const fa = (fi / 5) * Math.PI * 2 + now * 3;
            const fr = z.radius * 0.5 + Math.sin(now * 10 + fi) * 3;
            const fx = sx + Math.cos(fa) * fr * 0.6;
            const fy = cy - z.radius * 0.6 + Math.sin(now * 8 + fi * 2) * 4;
            ctx.fillStyle = fi % 2 === 0 ? `rgba(255,180,40,${0.6 + fpulse * 0.3})` : `rgba(255,100,20,${0.5 + fpulse * 0.2})`;
            ctx.beginPath();
            ctx.moveTo(fx - 3, fy + 4);
            ctx.quadraticCurveTo(fx, fy - 8 + Math.sin(now * 12 + fi) * 3, fx + 3, fy + 4);
            ctx.closePath(); ctx.fill();
          }
          // outline
          ctx.strokeStyle = "#ff6600";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.stroke();
          // eye glow (fire themed)
          const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
          const ex = Math.cos(ang) * (z.radius * 0.4);
          const ey = Math.sin(ang) * (z.radius * 0.4);
          const perpX = -Math.sin(ang) * 4, perpY = Math.cos(ang) * 4;
          const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 10);
          eglow.addColorStop(0, "rgba(255,200,40,0.8)");
          eglow.addColorStop(1, "rgba(255,100,0,0)");
          ctx.fillStyle = eglow;
          ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 10, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ffcc00";
          ctx.beginPath();
          ctx.arc(sx + ex + perpX, cy + ey + perpY, 2.5, 0, Math.PI * 2);
          ctx.arc(sx + ex - perpX, cy + ey - perpY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (z.type === "toxic") {
          // toxic zombie aura
          const tpulse = 0.5 + Math.sin(now * 7) * 0.3;
          const tgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 2.5);
          tgrd.addColorStop(0, `rgba(50,200,50,${0.3 * tpulse})`);
          tgrd.addColorStop(0.5, `rgba(30,160,30,${0.12 * tpulse})`);
          tgrd.addColorStop(1, "rgba(20,120,20,0)");
          ctx.fillStyle = tgrd;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius * 2.5, 0, Math.PI * 2); ctx.fill();
          // body
          ctx.fillStyle = "#1a4a1a";
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.fill();
          // toxic bubbling spots
          for (let bi = 0; bi < 4; bi++) {
            const ba = (bi / 4) * Math.PI * 2 + now * 2;
            const br = z.radius * 0.4 + Math.sin(now * 6 + bi) * 2;
            const bx = sx + Math.cos(ba) * br;
            const by = cy + Math.sin(ba) * br;
            ctx.fillStyle = `rgba(100,255,100,${0.4 + tpulse * 0.2})`;
            ctx.beginPath();
            ctx.arc(bx, by, 2 + Math.sin(now * 9 + bi) * 1, 0, Math.PI * 2);
            ctx.fill();
          }
          // outline
          ctx.strokeStyle = "#33cc33";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.stroke();
          // toxic eyes (green)
          const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
          const ex = Math.cos(ang) * (z.radius * 0.4);
          const ey = Math.sin(ang) * (z.radius * 0.4);
          const perpX = -Math.sin(ang) * 4, perpY = Math.cos(ang) * 4;
          const tglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 10);
          tglow.addColorStop(0, "rgba(100,255,100,0.8)");
          tglow.addColorStop(1, "rgba(50,200,50,0)");
          ctx.fillStyle = tglow;
          ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 10, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#66ff66";
          ctx.beginPath();
          ctx.arc(sx + ex + perpX, cy + ey + perpY, 2.5, 0, Math.PI * 2);
          ctx.arc(sx + ex - perpX, cy + ey - perpY, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (z.type === "fireMiniboss") {
          // fire miniboss: large intense aura
          const fpulse = 0.6 + Math.sin(now * 10) * 0.4;
          const fgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 3.0);
          fgrd.addColorStop(0, `rgba(255,80,0,${0.5 * fpulse})`);
          fgrd.addColorStop(0.4, `rgba(255,40,0,${0.25 * fpulse})`);
          fgrd.addColorStop(1, "rgba(200,20,0,0)");
          ctx.fillStyle = fgrd;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius * 3.0, 0, Math.PI * 2); ctx.fill();
          // body (darker, larger)
          ctx.fillStyle = "#3a0a02";
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.fill();
          // inner fire core
          const igrd = ctx.createRadialGradient(sx, cy, 0, sx, cy, z.radius * 0.7);
          igrd.addColorStop(0, `rgba(255,120,20,${0.4 * fpulse})`);
          igrd.addColorStop(1, "rgba(200,40,0,0)");
          ctx.fillStyle = igrd;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius * 0.7, 0, Math.PI * 2); ctx.fill();
          // flame crown (8 larger flames)
          for (let fi = 0; fi < 8; fi++) {
            const fa = (fi / 8) * Math.PI * 2 + now * 4;
            const fr = z.radius * 0.6 + Math.sin(now * 12 + fi) * 4;
            const fx = sx + Math.cos(fa) * fr * 0.6;
            const fy = cy - z.radius * 0.7 + Math.sin(now * 10 + fi * 2) * 5;
            ctx.fillStyle = fi % 2 === 0 ? `rgba(255,160,30,${0.7 + fpulse * 0.2})` : `rgba(255,60,10,${0.6 + fpulse * 0.2})`;
            ctx.beginPath(); ctx.moveTo(fx - 4, fy + 5); ctx.quadraticCurveTo(fx, fy - 12 + Math.sin(now * 14 + fi) * 4, fx + 4, fy + 5); ctx.closePath(); ctx.fill();
          }
          // outline (thick, bright orange)
          ctx.strokeStyle = "#ff4400";
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.stroke();
          // secondary outline pulse
          ctx.strokeStyle = `rgba(255,100,0,${0.3 + fpulse * 0.3})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius + 4, 0, Math.PI * 2); ctx.stroke();
          // eye glow (intense red-orange)
          const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
          const ex = Math.cos(ang) * (z.radius * 0.4);
          const ey = Math.sin(ang) * (z.radius * 0.4);
          const perpX = -Math.sin(ang) * 5, perpY = Math.cos(ang) * 5;
          const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 14);
          eglow.addColorStop(0, "rgba(255,100,20,0.9)");
          eglow.addColorStop(1, "rgba(255,40,0,0)");
          ctx.fillStyle = eglow;
          ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 14, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ff6600";
          ctx.beginPath();
          ctx.arc(sx + ex + perpX, cy + ey + perpY, 3, 0, Math.PI * 2);
          ctx.arc(sx + ex - perpX, cy + ey - perpY, 3, 0, Math.PI * 2);
          ctx.fill();
          // health bar above miniboss
          const barW = z.radius * 2.4;
          const barH = 5;
          const barX = sx - barW / 2;
          const barY = sy - z.radius - 16;
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
          ctx.fillStyle = "#4a0a0a";
          ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = "#ff3300";
          ctx.fillRect(barX, barY, barW * (z.hp / z.maxHp), barH);
          ctx.fillStyle = "#ffcc00";
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "center";
          ctx.fillText("MINIBOSS", sx, barY - 4);
        } else if (z.type === "toxicMiniboss") {
          // toxic miniboss: large green toxic aura
          const tpulse = 0.6 + Math.sin(now * 9) * 0.4;
          const tgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 3.0);
          tgrd.addColorStop(0, `rgba(40,220,40,${0.45 * tpulse})`);
          tgrd.addColorStop(0.4, `rgba(20,160,20,${0.2 * tpulse})`);
          tgrd.addColorStop(1, "rgba(10,100,10,0)");
          ctx.fillStyle = tgrd;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius * 3.0, 0, Math.PI * 2); ctx.fill();
          // body (dark toxic green)
          ctx.fillStyle = "#0a3a0a";
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.fill();
          // inner toxic core
          const igrd = ctx.createRadialGradient(sx, cy, 0, sx, cy, z.radius * 0.7);
          igrd.addColorStop(0, `rgba(60,200,60,${0.35 * tpulse})`);
          igrd.addColorStop(1, "rgba(20,120,20,0)");
          ctx.fillStyle = igrd;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius * 0.7, 0, Math.PI * 2); ctx.fill();
          // toxic bubbling spots (larger, more)
          for (let bi = 0; bi < 6; bi++) {
            const ba = (bi / 6) * Math.PI * 2 + now * 2.5;
            const br = z.radius * 0.5 + Math.sin(now * 7 + bi) * 3;
            const bx = sx + Math.cos(ba) * br;
            const by = cy + Math.sin(ba) * br;
            ctx.fillStyle = `rgba(100,255,100,${0.5 + tpulse * 0.2})`;
            ctx.beginPath(); ctx.arc(bx, by, 3 + Math.sin(now * 10 + bi) * 1.5, 0, Math.PI * 2); ctx.fill();
          }
          // outline (thick, bright green)
          ctx.strokeStyle = "#33cc33";
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.stroke();
          // secondary outline pulse
          ctx.strokeStyle = `rgba(50,200,50,${0.3 + tpulse * 0.3})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius + 4, 0, Math.PI * 2); ctx.stroke();
          // toxic eyes (bright green)
          const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
          const ex = Math.cos(ang) * (z.radius * 0.4);
          const ey = Math.sin(ang) * (z.radius * 0.4);
          const perpX = -Math.sin(ang) * 5, perpY = Math.cos(ang) * 5;
          const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 14);
          eglow.addColorStop(0, "rgba(80,255,80,0.9)");
          eglow.addColorStop(1, "rgba(30,160,30,0)");
          ctx.fillStyle = eglow;
          ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 14, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#66ff66";
          ctx.beginPath();
          ctx.arc(sx + ex + perpX, cy + ey + perpY, 3, 0, Math.PI * 2);
          ctx.arc(sx + ex - perpX, cy + ey - perpY, 3, 0, Math.PI * 2);
          ctx.fill();
          // health bar above miniboss
          const barW = z.radius * 2.4;
          const barH = 5;
          const barX = sx - barW / 2;
          const barY = sy - z.radius - 16;
          ctx.fillStyle = "rgba(0,0,0,0.7)";
          ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
          ctx.fillStyle = "#0a3a0a";
          ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = "#33cc33";
          ctx.fillRect(barX, barY, barW * (z.hp / z.maxHp), barH);
          ctx.fillStyle = "#88ff88";
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "center";
          ctx.fillText("TOXIC MINIBOSS", sx, barY - 4);
        } else if (z.type === "ghost") {
          // ghost zombie: translucent, ethereal blue-white glow
          const ghostPulse = 0.4 + Math.sin(now * 4 + z.x * 0.01) * 0.2;
          const ggrd = ctx.createRadialGradient(sx, cy, z.radius * 0.2, sx, cy, z.radius * 2.2);
          ggrd.addColorStop(0, `rgba(150,200,255,${0.3 * ghostPulse})`);
          ggrd.addColorStop(0.5, `rgba(100,150,220,${0.12 * ghostPulse})`);
          ggrd.addColorStop(1, "rgba(80,120,200,0)");
          ctx.fillStyle = ggrd;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius * 2.2, 0, Math.PI * 2); ctx.fill();
          // translucent body
          ctx.fillStyle = `rgba(180,210,255,${0.35 + ghostPulse * 0.15})`;
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.fill();
          // inner core
          ctx.fillStyle = `rgba(220,240,255,${0.2 + ghostPulse * 0.1})`;
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius * 0.5, 0, Math.PI * 2);
          ctx.fill();
          // outline
          ctx.strokeStyle = `rgba(150,200,255,${0.5 + ghostPulse * 0.2})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.stroke();
          // glowing eyes
          const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
          const ex = Math.cos(ang) * (z.radius * 0.35);
          const ey = Math.sin(ang) * (z.radius * 0.35);
          const perpX = -Math.sin(ang) * 3, perpY = Math.cos(ang) * 3;
          const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 8);
          eglow.addColorStop(0, "rgba(200,230,255,0.9)");
          eglow.addColorStop(1, "rgba(100,150,220,0)");
          ctx.fillStyle = eglow;
          ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#ddeeff";
          ctx.beginPath();
          ctx.arc(sx + ex + perpX, cy + ey + perpY, 2, 0, Math.PI * 2);
          ctx.arc(sx + ex - perpX, cy + ey - perpY, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (z.type === "underworld") {
          // underworld ghost zombie: translucent, ethereal purple glow
          const uwPulse = 0.4 + Math.sin(now * 4 + z.x * 0.01) * 0.2;
          const uwgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.2, sx, cy, z.radius * 2.2);
          uwgrd.addColorStop(0, `rgba(160,80,255,${0.3 * uwPulse})`);
          uwgrd.addColorStop(0.5, `rgba(120,50,220,${0.12 * uwPulse})`);
          uwgrd.addColorStop(1, "rgba(90,30,200,0)");
          ctx.fillStyle = uwgrd;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius * 2.2, 0, Math.PI * 2); ctx.fill();
          // translucent body
          ctx.fillStyle = `rgba(180,130,255,${0.35 + uwPulse * 0.15})`;
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.fill();
          // inner core
          ctx.fillStyle = `rgba(220,180,255,${0.2 + uwPulse * 0.1})`;
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius * 0.5, 0, Math.PI * 2);
          ctx.fill();
          // outline
          ctx.strokeStyle = `rgba(150,100,255,${0.5 + uwPulse * 0.2})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, cy, z.radius, 0, Math.PI * 2);
          ctx.stroke();
          // glowing eyes
          const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
          const ex = Math.cos(ang) * (z.radius * 0.35);
          const ey = Math.sin(ang) * (z.radius * 0.35);
          const perpX = -Math.sin(ang) * 3, perpY = Math.cos(ang) * 3;
          const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 8);
          eglow.addColorStop(0, "rgba(200,150,255,0.9)");
          eglow.addColorStop(1, "rgba(120,50,220,0)");
          ctx.fillStyle = eglow;
          ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#eeccff";
          ctx.beginPath();
          ctx.arc(sx + ex + perpX, cy + ey + perpY, 2, 0, Math.PI * 2);
          ctx.arc(sx + ex - perpX, cy + ey - perpY, 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (z.type === "redPoolMiniboss" || z.type === "bluePoolMiniboss") {
          const isRed = z.type === "redPoolMiniboss";
          const mainColor = isRed ? "#cc2200" : "#2244cc";
          const glowColor = isRed ? "rgba(255,40,20," : "rgba(40,80,255,";
          const eyeColor = isRed ? "#ff4422" : "#4488ff";
          // large aura
          const ppulse = 0.5 + Math.sin(now * 8) * 0.3;
          const pgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 3.0);
          pgrd.addColorStop(0, `${glowColor}${(0.45 * ppulse)})`);
          pgrd.addColorStop(0.4, `${glowColor}${(0.2 * ppulse)})`);
          pgrd.addColorStop(1, `${glowColor}0)`);
          ctx.fillStyle = pgrd;
          ctx.beginPath(); ctx.arc(sx, cy, z.radius * 3.0, 0, Math.PI * 2); ctx.fill();
          // body (pool ball)
          const bgrd = ctx.createRadialGradient(sx - 3, sy - 3, 1, sx, sy, z.radius);
          bgrd.addColorStop(0, isRed ? "#ff4422" : "#4488ff");
          bgrd.addColorStop(0.7, mainColor);
          bgrd.addColorStop(1, isRed ? "#881100" : "#112288");
          ctx.fillStyle = bgrd;
          ctx.beginPath(); ctx.arc(sx, sy, z.radius, 0, Math.PI * 2); ctx.fill();
          // white circle (pool ball style)
          ctx.fillStyle = "#fff";
          ctx.beginPath(); ctx.arc(sx, sy, z.radius * 0.35, 0, Math.PI * 2); ctx.fill();
          // number
          ctx.fillStyle = mainColor;
          ctx.font = "bold 10px monospace";
          ctx.textAlign = "center";
          ctx.fillText(isRed ? "3" : "10", sx, sy + 4);
          // outline
          ctx.strokeStyle = isRed ? "#ff4422" : "#4488ff";
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(sx, sy, z.radius, 0, Math.PI * 2); ctx.stroke();
          // secondary outline pulse
          ctx.strokeStyle = `${glowColor}${(0.3 + ppulse * 0.3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(sx, sy, z.radius + 4, 0, Math.PI * 2); ctx.stroke();
          // glowing eyes
          const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
          const ex = Math.cos(ang) * (z.radius * 0.35);
          const ey = Math.sin(ang) * (z.radius * 0.35);
          const perpX = -Math.sin(ang) * 4, perpY = Math.cos(ang) * 4;
          const egrd = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 8);
          egrd.addColorStop(0, `${eyeColor}cc`);
          egrd.addColorStop(1, `${eyeColor}00`);
          ctx.fillStyle = egrd;
          ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = eyeColor;
          ctx.beginPath();
          ctx.arc(sx + ex + perpX, cy + ey + perpY, 2.5, 0, Math.PI * 2);
          ctx.arc(sx + ex - perpX, cy + ey - perpY, 2.5, 0, Math.PI * 2);
          ctx.fill();
          // health bar + label
          const barW = z.radius * 2.4;
          const barH = 5;
          ctx.fillStyle = "rgba(0,0,0,0.6)";
          ctx.fillRect(sx - barW / 2, sy - z.radius - 18, barW, barH);
          ctx.fillStyle = isRed ? "#ff3322" : "#3366ff";
          ctx.fillRect(sx - barW / 2, sy - z.radius - 18, barW * (z.hp / z.maxHp), barH);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.fillText(isRed ? "RED BALL" : "BLUE BALL", sx, sy - z.radius - 22);
        } else {
          const litByFlashlight = isInFlashlight(z.x, z.y);
          if (litByFlashlight) {
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
          }
          // eye glow (always visible)
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
        }
        // hp bar
        if (z.hp < z.maxHp && basicLit) {
          ctx.fillStyle = "#000";
          ctx.fillRect(sx - z.radius, sy - z.radius - 8, z.radius * 2, 4);
          ctx.fillStyle = z.type === "fire" || z.type === "fireMiniboss" ? "#ff6600" : z.type === "toxic" || z.type === "toxicMiniboss" ? "#33cc33" : z.type === "ghost" ? "#8ab4f8" : z.type === "underworld" ? "#aa66ff" : z.type === "redPoolMiniboss" ? "#ff3322" : z.type === "bluePoolMiniboss" ? "#3366ff" : "#c93030";
          ctx.fillRect(sx - z.radius, sy - z.radius - 8, (z.radius * 2) * (z.hp / z.maxHp), 4);
        }
      }
    }

    function drawToxicGas() {
      const now = performance.now() / 1000;
      for (const g of s.toxicGas) {
        const sx = g.x - s.camera.x, sy = g.y - s.camera.y;
        if (sx < -100 || sy < -100 || sx > canvas.width + 100 || sy > canvas.height + 100) continue;
        const alpha = (g.life / g.maxLife) * 0.45;
        const pulse = 0.8 + Math.sin(now * 5) * 0.2;
        // outer glow
        const grd = ctx.createRadialGradient(sx, sy, g.radius * 0.2, sx, sy, g.radius);
        grd.addColorStop(0, `rgba(50,200,50,${alpha * pulse})`);
        grd.addColorStop(0.4, `rgba(30,160,30,${alpha * pulse * 0.6})`);
        grd.addColorStop(1, "rgba(20,120,20,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(sx, sy, g.radius, 0, Math.PI * 2);
        ctx.fill();
        // inner swirl particles
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + now * 1.5;
          const r = g.radius * 0.35 + Math.sin(now * 4 + i * 2) * g.radius * 0.15;
          const px = sx + Math.cos(a) * r;
          const py = sy + Math.sin(a) * r;
          ctx.fillStyle = `rgba(100,255,100,${alpha * 0.5})`;
          ctx.beginPath();
          ctx.arc(px, py, 4 + Math.sin(now * 7 + i) * 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function drawToxicProjectiles() {
      const now = performance.now() / 1000;
      for (const p of s.toxicProjectiles) {
        const sx = p.x - s.camera.x, sy = p.y - s.camera.y;
        if (sx < -30 || sy < -30 || sx > canvas.width + 30 || sy > canvas.height + 30) continue;
        // green glowing orb
        const pulse = 0.7 + Math.sin(now * 10) * 0.3;
        const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 10);
        grd.addColorStop(0, `rgba(80,255,80,${pulse})`);
        grd.addColorStop(0.5, `rgba(40,180,40,${pulse * 0.6})`);
        grd.addColorStop(1, "rgba(20,120,20,0)");
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fill();
        // solid core
        ctx.fillStyle = `rgba(60,220,60,${pulse})`;
        ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
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
      // vignette + darkness, scaled by light intensity setting
      const intensity = settingsRef.current.lightIntensity;
      const fogAlpha = 0.85 * (1 - intensity * 0.8);
      const grad = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, 100,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7
      );
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, `rgba(0,0,0,${fogAlpha})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function drawMessage() {
      if (performance.now() < s.messageUntil && s.message) {
        if (s.gameMode === "split") {
          // In split mode, only show if target matches this viewport (0 = both)
          if (s.messageTarget !== 0 && s.messageTarget !== (s._vpIsP2 ? 2 : 1)) return;
        }
        const cx = s.gameMode === "split" ? canvas.width / 4 : canvas.width / 2;
        const fontSize = s.gameMode === "split" ? 36 : 48;
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
        ctx.textAlign = "center";
        ctx.fillText(s.message, cx + 2, canvas.height / 2 - 100 + 2);
        ctx.fillStyle = "#c9a24a";
        ctx.fillText(s.message, cx, canvas.height / 2 - 100);
      }
    }

    function drawHitFlash() {
      if (s.hitFlash > 0.01) {
        ctx.fillStyle = `rgba(200,20,20,${s.hitFlash * 0.4})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function drawJumpscare() {
      const until = s.jumpscareUntil;
      if (!until) return;
      const now = performance.now();
      const remaining = until - now;
      if (remaining <= 0) return;
      const elapsed = 1500 - remaining;
      const progress = elapsed / 1500;

      // heavy screen shake that tapers off
      s.camera.shake = Math.max(s.camera.shake, 16 * Math.max(0, 1 - progress * 1.2));

      const cx = canvas.width / 2;
      const cy = canvas.height / 2;

      // initial white flash (first 100ms)
      if (elapsed < 100) {
        ctx.fillStyle = `rgba(255, 255, 255, ${1 - elapsed / 100})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
      }

      // flicker: random intensity changes
      const flicker = Math.random() < 0.2 ? 0.95 : 0.65;

      // dark red/black overlay
      ctx.fillStyle = `rgba(60, 0, 0, ${flicker * (1 - progress * 0.3)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // random inversion flashes
      if (Math.random() < 0.08) {
        ctx.fillStyle = `rgba(255, 255, 255, 0.2)`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // scary face - two glowing eyes
      const eyeSpacing = 55;
      const eyeY = cy - 35;
      const eyeSize = 20 + Math.sin(elapsed * 0.03) * 5;

      // left eye
      ctx.fillStyle = `rgba(255, 0, 0, ${flicker})`;
      ctx.beginPath();
      ctx.ellipse(cx - eyeSpacing, eyeY, eyeSize, eyeSize * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(0, 0, 0, ${flicker})`;
      ctx.beginPath();
      ctx.ellipse(cx - eyeSpacing, eyeY + 2, eyeSize * 0.35, eyeSize * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      // right eye
      ctx.fillStyle = `rgba(255, 0, 0, ${flicker})`;
      ctx.beginPath();
      ctx.ellipse(cx + eyeSpacing, eyeY, eyeSize, eyeSize * 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(0, 0, 0, ${flicker})`;
      ctx.beginPath();
      ctx.ellipse(cx + eyeSpacing, eyeY + 2, eyeSize * 0.35, eyeSize * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();

      // jagged mouth
      ctx.strokeStyle = `rgba(255, 0, 0, ${flicker * 0.9})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - 85, cy + 40);
      const teeth = 10;
      for (let i = 0; i <= teeth; i++) {
        const tx = cx - 85 + (170 / teeth) * i;
        const ty = cy + 40 + (i % 2 === 0 ? 0 : 22 + Math.sin(elapsed * 0.01 + i) * 8);
        ctx.lineTo(tx, ty);
      }
      ctx.stroke();

      // scan lines
      ctx.fillStyle = `rgba(0, 0, 0, 0.12)`;
      for (let y = 0; y < canvas.height; y += 4) {
        ctx.fillRect(0, y, canvas.width, 2);
      }

      // fade to black in the last 300ms
      if (remaining < 300) {
        const fadeAlpha = 1 - remaining / 300;
        ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
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

    function drawTorches() {
      const now = performance.now();
      for (const torch of s.torches) {
        const sx = torch.x - s.camera.x, sy = torch.y - s.camera.y;
        if (sx < -60 || sy < -100 || sx > canvas.width + 60 || sy > canvas.height + 100) continue;
        // base circle on ground
        ctx.fillStyle = torch.lit ? "rgba(255,160,40,0.12)" : "rgba(100,80,60,0.08)";
        ctx.beginPath(); ctx.arc(sx, sy + 6, 20, 0, Math.PI * 2); ctx.fill();
        // wooden post
        ctx.fillStyle = torch.lit ? "#5a3a1a" : "#3a2a1a";
        ctx.fillRect(sx - 4, sy - 48, 8, 54);
        ctx.strokeStyle = torch.lit ? "#3a2010" : "#1a1008";
        ctx.lineWidth = 1;
        ctx.strokeRect(sx - 4, sy - 48, 8, 54);
        // cross bar
        ctx.fillStyle = torch.lit ? "#4a2a12" : "#2a1a0a";
        ctx.fillRect(sx - 10, sy - 48, 20, 6);
        // wick / flame
        if (torch.lit) {
          const pulse = 0.7 + Math.sin(now / 100) * 0.3;
          const flicker = Math.sin(now / 60) * 2;
          // flame glow
          const glow = ctx.createRadialGradient(sx + flicker, sy - 58, 0, sx, sy - 50, 40);
          glow.addColorStop(0, `rgba(255,200,60,${0.4 * pulse})`);
          glow.addColorStop(0.5, `rgba(255,120,20,${0.2 * pulse})`);
          glow.addColorStop(1, "rgba(255,60,0,0)");
          ctx.fillStyle = glow;
          ctx.beginPath(); ctx.arc(sx, sy - 50, 40, 0, Math.PI * 2); ctx.fill();
          // flame body
          ctx.fillStyle = `rgba(255,180,40,${pulse})`;
          ctx.beginPath();
          ctx.moveTo(sx - 6, sy - 42);
          ctx.quadraticCurveTo(sx - 3 + flicker, sy - 62, sx, sy - 68 + flicker);
          ctx.quadraticCurveTo(sx + 3 - flicker, sy - 62, sx + 6, sy - 42);
          ctx.closePath(); ctx.fill();
          // inner flame
          ctx.fillStyle = `rgba(255,240,120,${pulse * 0.8})`;
          ctx.beginPath();
          ctx.moveTo(sx - 3, sy - 42);
          ctx.quadraticCurveTo(sx + flicker * 0.5, sy - 56, sx, sy - 62 + flicker);
          ctx.quadraticCurveTo(sx - flicker * 0.5, sy - 56, sx + 3, sy - 42);
          ctx.closePath(); ctx.fill();
        } else {
          // unlit wick
          ctx.fillStyle = "#2a1a0a";
          ctx.fillRect(sx - 1.5, sy - 52, 3, 10);
        }
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

    function drawPortal() {
      if (!s.portalActive || !s.portalPos) return;
      const px = s.portalPos.x - s.camera.x, py = s.portalPos.y - s.camera.y;
      if (px < -200 || py < -200 || px > canvas.width + 200 || py > canvas.height + 200) return;
      const now = performance.now() / 1000;
      const pulse = 0.7 + Math.sin(now * 3) * 0.3;
      const rot = now * 1.5;
      // outer glow ring
      const outerGrd = ctx.createRadialGradient(px, py, 40, px, py, 120);
      outerGrd.addColorStop(0, `rgba(120,40,200,${0.35 * pulse})`);
      outerGrd.addColorStop(0.4, `rgba(80,20,160,${0.2 * pulse})`);
      outerGrd.addColorStop(0.7, `rgba(50,10,120,${0.1 * pulse})`);
      outerGrd.addColorStop(1, "rgba(30,5,80,0)");
      ctx.fillStyle = outerGrd;
      ctx.beginPath(); ctx.arc(px, py, 120, 0, Math.PI * 2); ctx.fill();
      // swirling energy rings
      for (let i = 0; i < 4; i++) {
        const ringR = 50 + i * 15 + Math.sin(now * 2 + i) * 8;
        const alpha = (0.3 - i * 0.06) * pulse;
        ctx.strokeStyle = `rgba(160,80,255,${alpha})`;
        ctx.lineWidth = 2.5 - i * 0.4;
        ctx.beginPath();
        ctx.arc(px, py, ringR, rot + i * 0.5, rot + i * 0.5 + Math.PI * 1.4);
        ctx.stroke();
      }
      // dark vortex center
      const innerGrd = ctx.createRadialGradient(px, py, 0, px, py, 45);
      innerGrd.addColorStop(0, "rgba(10,0,20,0.95)");
      innerGrd.addColorStop(0.5, "rgba(40,10,80,0.7)");
      innerGrd.addColorStop(0.8, "rgba(80,30,140,0.3)");
      innerGrd.addColorStop(1, "rgba(120,50,200,0)");
      ctx.fillStyle = innerGrd;
      ctx.beginPath(); ctx.arc(px, py, 45, 0, Math.PI * 2); ctx.fill();
      // inner energy core
      const coreGrd = ctx.createRadialGradient(px, py, 0, px, py, 20);
      coreGrd.addColorStop(0, `rgba(180,100,255,${0.5 * pulse})`);
      coreGrd.addColorStop(1, "rgba(120,40,200,0)");
      ctx.fillStyle = coreGrd;
      ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.fill();
      // floating particles
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + now * 0.8;
        const dist = 55 + Math.sin(now * 2.5 + i * 1.3) * 20;
        const ppx = px + Math.cos(angle) * dist;
        const ppy = py + Math.sin(angle) * dist;
        const size = 2 + Math.sin(now * 4 + i) * 1;
        ctx.fillStyle = `rgba(180,120,255,${0.6 * pulse})`;
        ctx.beginPath(); ctx.arc(ppx, ppy, size, 0, Math.PI * 2); ctx.fill();
      }
      // interaction prompt
      const dpp = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
      const dx = dpp.x - s.portalPos.x, dy = dpp.y - s.portalPos.y;
      if (dx * dx + dy * dy < 90 * 90) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("[E] ENTER THE DARK AETHER", px, py - 75);
      }
    }

    function drawGlowingCrate() {
      if (!s.glowingCrate) return;
      const gc = s.glowingCrate;
      const sx = gc.x - s.camera.x, sy = gc.y - s.camera.y;
      if (sx + gc.w < -20 || sy + gc.h < -20 || sx > canvas.width + 20 || sy > canvas.height + 20) return;
      const now = performance.now() / 1000;
      const pulse = 0.6 + Math.sin(now * 4) * 0.4;
      // purple glow aura
      const glowGrd = ctx.createRadialGradient(sx + gc.w / 2, sy + gc.h / 2, 10, sx + gc.w / 2, sy + gc.h / 2, 60);
      glowGrd.addColorStop(0, `rgba(160,80,255,${0.3 * pulse})`);
      glowGrd.addColorStop(0.5, `rgba(120,40,200,${0.15 * pulse})`);
      glowGrd.addColorStop(1, "rgba(80,20,160,0)");
      ctx.fillStyle = glowGrd;
      ctx.beginPath(); ctx.arc(sx + gc.w / 2, sy + gc.h / 2, 60, 0, Math.PI * 2); ctx.fill();
      // crate body (brown with purple tint)
      ctx.fillStyle = `rgba(90,50,30,${0.9 + pulse * 0.1})`;
      ctx.fillRect(sx, sy, gc.w, gc.h);
      // purple energy lines on crate
      ctx.strokeStyle = `rgba(160,80,255,${0.5 + pulse * 0.3})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(sx + gc.w, sy + gc.h);
      ctx.moveTo(sx + gc.w, sy); ctx.lineTo(sx, sy + gc.h);
      ctx.stroke();
      // outline
      ctx.strokeStyle = `rgba(180,100,255,${0.6 + pulse * 0.3})`;
      ctx.lineWidth = 3;
      ctx.strokeRect(sx, sy, gc.w, gc.h);
      // HP indicator dots
      for (let i = 0; i < gc.hp; i++) {
        ctx.fillStyle = `rgba(180,120,255,${0.8 * pulse})`;
        ctx.beginPath();
        ctx.arc(sx + 10 + i * 14, sy + gc.h + 10, 4, 0, Math.PI * 2);
        ctx.fill();
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
        if (b.color) {
          // colored pool ball
          ctx.fillStyle = b.color;
          ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.5)";
          ctx.beginPath(); ctx.arc(sx - 1, sy - 1, 2, 0, Math.PI * 2); ctx.fill();
          // glow
          const g = ctx.createRadialGradient(sx, sy, 3, sx, sy, 12);
          g.addColorStop(0, b.color + "88");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2); ctx.fill();
        } else {
          // default fire bullet
          ctx.fillStyle = "#ff4020";
          ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(255,180,80,0.6)";
          ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    function drawTransitionFlash() {
      if (s.transitionFlash > 0.01) {
        ctx.fillStyle = `rgba(255,255,255,${Math.min(1, s.transitionFlash)})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    function renderWorld() {
      const zoom = settingsRef.current.cameraZoom === "zoomed" ? 1.4 : 1;
      ctx.save();
      if (zoom !== 1) {
        const vp = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
        const px = vp.x - s.camera.x;
        const py = vp.y - s.camera.y;
        ctx.translate(px, py);
        ctx.scale(zoom, zoom);
        ctx.translate(-px, -py);
      }
      drawGrid();
      drawCaveArea();
      drawGolfRoom();
      drawDecals();
      drawMapBounds();
      if (s.bossMode) drawLava();
      if (!s.bossMode) drawBuyStations();
      else drawBossAmmoBoxes();
      drawPickups();
      drawObstacles();
      drawGlowingCrate();
      drawPortal();
      drawGenerator();
      drawTotems();
      drawTorches();
      drawParticles();
      drawToxicGas();
      drawToxicProjectiles();
      drawZombies();
      drawBoss();
      drawBossBullets();
      drawPlayer();
      drawBullets();
      drawFog();
      drawFlashlightOverlay();
      drawHitFlash();
      drawJumpscare();
      drawTransitionFlash();
      drawMessage();
      ctx.restore();
    }

    function render() {
      ctx.fillStyle = s.bossMode ? "#1a0505" : "#0a0d0a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (s.gameMode === "split" && s.started) {
        const halfW = Math.floor(canvas.width / 2);
        const origCamera = s.camera;

        // ─── Player 1 viewport (left half) ────────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, halfW, canvas.height);
        ctx.clip();
        s.camera = origCamera;
        s._vpIsP2 = false;
        renderWorld();
        // P1 viewport border
        ctx.strokeStyle = "#c9a24a";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, halfW - 2, canvas.height - 2);
        ctx.restore();

        // ─── Player 2 viewport (right half) ───────────────────────────────
        ctx.save();
        ctx.beginPath();
        ctx.rect(halfW, 0, halfW, canvas.height);
        ctx.clip();
        ctx.translate(halfW, 0);
        s.camera = s.camera2;
        s._vpIsP2 = true;
        renderWorld();
        ctx.restore();

        // Restore originals
        s.camera = origCamera;

        // Draw divider line
        ctx.fillStyle = "#c9a24a";
        ctx.fillRect(halfW - 1, 0, 2, canvas.height);

        // P2 viewport border
        ctx.strokeStyle = "#4a9aff";
        ctx.lineWidth = 2;
        ctx.strokeRect(halfW + 1, 1, halfW - 2, canvas.height - 2);
      } else {
        renderWorld();
      }
    }


    let raf = 0;
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - (s.lastTime || t)) / 1000);
      s.lastTime = t;
      // Always poll for controllers (needed for menu lobby detection)
      detectGamepad();
      update(dt);

      // Jumpscare complete: transition to game over screen
      if (s.gameOver && s.jumpscareUntil && performance.now() >= s.jumpscareUntil) {
        s.jumpscareUntil = 0;
        soundEngine.setMusic("menu");
        setUiState((u) => ({ ...u, gameOver: true, hp: 0, kills: s.kills, shotsFired: s.shotsFired, shotsHit: s.shotsHit }));
      }

      // Apply camera shake (needed during jumpscare since update() returns early)
      if (s.camera.shake > 0) {
        s.camera.x += (Math.random() - 0.5) * s.camera.shake;
        s.camera.y += (Math.random() - 0.5) * s.camera.shake;
        s.camera.shake *= 0.85;
        if (s.camera.shake < 0.1) s.camera.shake = 0;
      }

      // Fireworks phase: update particles and spawn bursts
      if (s.showingFireworks) {
        s.fireworksTimer -= dt;
        // Update existing particles (update() returns early on gameOver)
        for (let i = s.particles.length - 1; i >= 0; i--) {
          const p = s.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 0.92; p.vy *= 0.92;
          p.life -= dt;
          if (p.life <= 0) s.particles.splice(i, 1);
        }
        // Spawn firework bursts at random positions
        if (Math.random() < dt * 4) {
          const fx = s.camera.x + Math.random() * canvas.width;
          const fy = s.camera.y + Math.random() * canvas.height * 0.7;
          const colors = ["#ff4444", "#44ff44", "#4444ff", "#ffff44", "#ff44ff", "#44ffff", "#ffaa22", "#ff22aa", "#22ffaa", "#ffffff", "#ffcc55"];
          const burstColor = colors[Math.floor(Math.random() * colors.length)];
          const count = 20 + Math.floor(Math.random() * 25);
          for (let i = 0; i < count; i++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 80 + Math.random() * 200;
            s.particles.push({
              x: fx, y: fy,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp - 40,
              life: 0.6 + Math.random() * 0.8,
              maxLife: 1.4,
              color: Math.random() < 0.3 ? "#ffffff" : burstColor,
              size: 2 + Math.random() * 3,
            });
          }
        }
        // Transition to victory popup
        if (s.fireworksTimer <= 0) {
          s.showingFireworks = false;
          setUiState((u) => ({ ...u, showingFireworks: false, gameOver: true, points: s.points, kills: s.kills, shotsFired: s.shotsFired, shotsHit: s.shotsHit, zombiesLeft: 0 }));
        }
      }

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
      window.removeEventListener("gamepadconnected", onGamepadConnected);
      window.removeEventListener("gamepaddisconnected", onGamepadDisconnected);
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
            {isMobile && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="pointer-events-auto mt-1 p-1 text-[#8a8a6a] hover:text-[#c9a24a] transition-colors"
              >
                <Settings className="w-5 h-5" />
              </button>
            )}
          </div>

          <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 font-mono pointer-events-none text-center">
            <div className="hidden sm:block text-[10px] tracking-[0.3em] text-[#8a8a6a]">TIME</div>
            <div className="text-base sm:text-3xl font-bold tabular-nums text-[#c9a24a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {formatTime(uiState.elapsedMs)}
            </div>
          </div>

          <div
            className="absolute font-mono text-right pointer-events-none"
            style={{
              top: "0.5rem",
              right: gameMode === "split" ? "calc(50% + 0.5rem)" : "0.5rem",
            }}
          >
            <div className="text-base sm:text-2xl font-bold text-[#c9a24a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {uiState.points}
              <span className="text-[10px] sm:text-base"> PTS</span>
            </div>
            {!isMobile && (
              <button
                onClick={() => setSettingsOpen(true)}
                className="pointer-events-auto mt-1 px-2 py-0.5 text-[10px] sm:text-xs text-[#8a8a6a] border border-[#3a3a1a] hover:border-[#c9a24a] hover:text-[#c9a24a] transition-colors bg-black/40"
              >
                SETTINGS
              </button>
            )}
          </div>

          {/* Health — bottom on desktop, top-center on touch devices (portrait & landscape phones) */}
          <div
            className={
              isMobile
                ? "absolute left-1/2 -translate-x-1/2 top-16 font-mono pointer-events-none"
                : "absolute left-4 bottom-4 font-mono pointer-events-none"
            }
          >
            <div className="bg-black/60 border border-[#3a3a1a] px-2 py-1 sm:px-4 sm:py-2 rounded-sm">
              {!isMobile && (
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-xs text-[#8a8a6a]">HEALTH</div>
                </div>
              )}
              <div className={(isMobile ? "w-40 h-2" : "w-56 h-3") + " bg-[#1a0505] border border-[#3a1010]"}>
                <div
                  className="h-full bg-gradient-to-r from-[#8a1010] to-[#c93030] transition-all"
                  style={{ width: `${uiState.hp}%` }}
                />
              </div>
              <div className={"text-[10px] sm:text-xs text-[#a89060] mt-0.5 sm:mt-1 " + (isMobile ? "text-center" : "text-left")}>
                {uiState.hp} / 100
              </div>
            </div>
          </div>

          {/* Weapon — bottom-right on desktop, compact top-right-below-pts on touch */}
          <div
            className={
              isMobile
                ? "absolute top-11 right-2 font-mono text-right pointer-events-none"
                : "absolute bottom-4 font-mono text-right pointer-events-none"
            }
            style={!isMobile ? { right: gameMode === "split" ? "calc(50% + 1rem)" : "1rem" } : undefined}
          >
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

          {/* ─── Player 2 HUD (split-screen only) ─── */}
          {gameMode === "split" && (
            <>
              {/* P2 Health — bottom-left of right half */}
              <div className="absolute bottom-4 font-mono pointer-events-none" style={{ left: "calc(50% + 1rem)" }}>
                <div className="bg-black/60 border border-[#1a2a4a] px-4 py-2 rounded-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="text-xs text-[#4a9aff]">P2 HEALTH</div>
                  </div>
                  <div className="w-56 h-3 bg-[#0a0a1a] border border-[#1a1a3a]">
                    <div
                      className="h-full bg-gradient-to-r from-[#103080] to-[#3060c0] transition-all"
                      style={{ width: `${uiState.hp2}%` }}
                    />
                  </div>
                  <div className="text-xs text-[#6090c0] mt-1 text-left">
                    {uiState.hp2} / 100
                  </div>
                </div>
              </div>

              {/* P2 Points — top-right of right half */}
              <div className="absolute top-2 right-2 sm:top-4 sm:right-4 font-mono text-right pointer-events-none">
                <div className="text-base sm:text-2xl font-bold text-[#4a9aff] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                  {uiState.points2}
                  <span className="text-[10px] sm:text-base text-[#3a6a9a]"> PTS</span>
                </div>
              </div>

              {/* P2 Weapon — bottom-right of right half */}
              <div className="absolute right-4 bottom-20 font-mono text-right pointer-events-none">
                <div className="bg-black/60 border border-[#1a2a4a] px-4 py-2 rounded-sm">
                  <div className="text-xs text-[#4a9aff] truncate">
                    P2 — {uiState.weaponName2.toUpperCase()}
                  </div>
                  <div className="text-2xl font-bold text-[#4a9aff] leading-tight">
                    {uiState.reloading2 ? "..." : uiState.mag2}
                    <span className="text-lg text-[#3a6a9a]"> / {uiState.reserve2}</span>
                  </div>
                  {uiState.reloading2 && (
                    <div className="text-xs text-[#4488ff] animate-pulse">RELOADING</div>
                  )}
                </div>
              </div>
            </>
          )}
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
            {showHelp && menuMode === "main" && (
              <div className="mt-10 text-left text-[#c0c0a0] text-sm space-y-2 bg-black/40 border border-[#3a3a1a] p-6">
                {isMobile ? (
                  <>
                    <div className="text-[#c9a24a] font-bold text-center tracking-widest">
                      MOBILE CONTROLS
                    </div>
                    <div className="text-[#c0c0a0] text-center text-xs pt-1">
                      Use the on-screen virtual controls to play.
                    </div>
                    <div className="pt-3"><span className="text-[#c9a24a] font-bold">LEFT STICK</span> — Move</div>
                    <div><span className="text-[#c9a24a] font-bold">RIGHT STICK</span> — Aim &amp; Fire</div>
                    <div><span className="text-[#c9a24a] font-bold">RELOAD BUTTON</span> — Reload</div>
                    <div><span className="text-[#c9a24a] font-bold">USE BUTTON</span> — Buy weapons / ammo at stations</div>
                    <div className="pt-2 text-[#8a8a6a] text-xs">
                      Kill zombies to earn points. Complete Tasks to get to the boss.
                    </div>
                  </>
                ) : (
                  <>
                    <div><span className="text-[#c9a24a] font-bold">WASD</span> — Move</div>
                    <div><span className="text-[#c9a24a] font-bold">MOUSE</span> — Aim</div>
                    <div><span className="text-[#c9a24a] font-bold">LEFT CLICK</span> — Fire</div>
                    <div><span className="text-[#c9a24a] font-bold">R</span> — Reload</div>
                    <div><span className="text-[#c9a24a] font-bold">E</span> — Buy weapons / ammo at stations</div>
                    <div className="pt-2 text-[#8a8a6a] text-xs">
                      Kill zombies to earn points. Complete Tasks to get to the boss.
                    </div>
                  </>
                )}
              </div>
            )}
            {menuMode === "splitLobby" && (
              <div className="mt-8 text-left text-[#c0c0a0] text-sm space-y-2 bg-black/40 border border-[#3a3a1a] p-6">
                <div className="text-[#c9a24a] font-bold text-center tracking-widest">
                  SPLIT SCREEN
                </div>
                <div className="text-[#c0c0a0] text-center text-xs pt-1">
                  Connect a controller for Player 2, then deploy.
                </div>
                <div className="pt-3"><span className="text-[#c9a24a] font-bold">PLAYER 1</span> — WASD + Mouse</div>
                <div><span className="text-[#c9a24a] font-bold">PLAYER 2</span> — Controller (Left Stick / Right Stick)</div>
                <div className="pt-2 text-[#8a8a6a] text-xs">
                  {controllerConnected ? (
                    <span className="text-[#5a5]">Controller connected — ready to deploy!</span>
                  ) : (
                    "No controller detected yet. Connect one via USB or Bluetooth."
                  )}
                </div>
              </div>
            )}

            <div className="mt-10 flex flex-col items-center gap-4">
              {menuMode === "main" ? (
                <>
                  <button
                    onClick={() => {
                      stateRef.current.gameMode = "single";
                      setGameMode("single");
                      startGameRef.current();
                    }}
                    className="w-64 px-10 py-3 bg-[#c9a24a] text-black font-bold tracking-widest border border-[#c9a24a] hover:bg-[#e0b85a] transition-colors"
                  >
                    SINGLE PLAYER
                  </button>
                  <button
                    onClick={() => setMenuMode("splitLobby")}
                    className="w-64 px-10 py-3 bg-transparent text-[#c9a24a] font-bold tracking-widest border border-[#c9a24a] hover:bg-[#c9a24a]/10 transition-colors"
                  >
                    SPLIT SCREEN
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      stateRef.current.gameMode = "split";
                      setGameMode("split");
                      startGameRef.current();
                    }}
                    className="w-64 px-10 py-3 bg-[#c9a24a] text-black font-bold tracking-widest border border-[#c9a24a] hover:bg-[#e0b85a] transition-colors"
                  >
                    DEPLOY
                  </button>
                  <button
                    onClick={() => setMenuMode("main")}
                    className="w-64 px-10 py-3 bg-transparent text-[#8a8a6a] font-bold tracking-widest border border-[#3a3a1a] hover:border-[#c9a24a] hover:text-[#c9a24a] transition-colors"
                  >
                    BACK
                  </button>
                </>
              )}
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-64 px-10 py-3 bg-transparent text-[#c9a24a] font-bold tracking-widest border border-[#c9a24a] hover:bg-[#c9a24a]/10 transition-colors"
              >
                SETTINGS
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game over / Victory */}
      {uiState.gameOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div
            className="text-center font-mono max-w-md w-full mx-4"
            style={{ animation: "fadeSlideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
          >
            {uiState.hp > 0 ? (
              <>
                <div className="border-2 border-[#c9a24a]/40 bg-black/60 p-8 rounded-sm">
                  <h1
                    className="text-7xl font-bold text-[#c9a24a] tracking-widest"
                    style={{ animation: "pulseGlow 2s ease-in-out infinite" }}
                  >
                    VICTORY
                  </h1>
                  <p className="text-[#a89060] mt-3 text-xl tracking-wider">
                    THE HARBINGER HAS FALLEN
                  </p>
                  {uiState.elapsedMs < 600000 && (
                    <div className="mt-3 inline-block px-4 py-1 bg-[#c9a24a]/20 border border-[#c9a24a]/50 rounded-sm">
                      <span className="text-[#c9a24a] font-bold text-lg tracking-widest">
                        {uiState.elapsedMs < 480000 ? "S-RANK" : uiState.elapsedMs < 600000 ? "A-RANK" : ""}
                      </span>
                    </div>
                  )}
                  <div className="mt-6 space-y-2 text-sm">
                    <div className="flex justify-between border-b border-[#3a3a1a] pb-2">
                      <span className="text-[#8a8a6a]">POINTS</span>
                      <span className="text-[#c9a24a] font-bold">{uiState.points}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#3a3a1a] pb-2">
                      <span className="text-[#8a8a6a]">TIME</span>
                      <span className="text-[#c9a24a] font-bold tabular-nums">{formatTime(uiState.elapsedMs)}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#3a3a1a] pb-2">
                      <span className="text-[#8a8a6a]">KILLS</span>
                      <span className="text-[#c9a24a] font-bold">{uiState.kills}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8a8a6a]">ACCURACY</span>
                      <span className="text-[#c9a24a] font-bold">
                        {uiState.shotsFired > 0 ? Math.round((uiState.shotsHit / uiState.shotsFired) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="border-2 border-[#c93030]/40 bg-black/60 p-8 rounded-sm">
                  <h1
                    className="text-7xl font-bold text-[#c93030] tracking-widest"
                    style={{ animation: "pulseGlowRed 2s ease-in-out infinite" }}
                  >
                    YOU DIED
                  </h1>
                  <p className="text-[#a89060] mt-3 text-xl tracking-wider">
                    SURVIVED {uiState.actualRound} ROUND{uiState.actualRound !== 1 ? "S" : ""}
                  </p>
                  <div className="mt-6 space-y-2 text-sm">
                    <div className="flex justify-between border-b border-[#3a1a1a] pb-2">
                      <span className="text-[#8a8a6a]">POINTS</span>
                      <span className="text-[#c9a24a] font-bold">{uiState.points}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#3a1a1a] pb-2">
                      <span className="text-[#8a8a6a]">TIME</span>
                      <span className="text-[#c9a24a] font-bold tabular-nums">{formatTime(uiState.elapsedMs)}</span>
                    </div>
                    <div className="flex justify-between border-b border-[#3a1a1a] pb-2">
                      <span className="text-[#8a8a6a]">KILLS</span>
                      <span className="text-[#c9a24a] font-bold">{uiState.kills}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8a8a6a]">ACCURACY</span>
                      <span className="text-[#c9a24a] font-bold">
                        {uiState.shotsFired > 0 ? Math.round((uiState.shotsHit / uiState.shotsFired) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                </div>
              </>
            )}
            <button
              onClick={restart}
              className="mt-8 w-64 px-10 py-3 bg-[#c9a24a] text-black font-bold tracking-widest border border-[#c9a24a] hover:bg-[#e0b85a] transition-colors"
            >
              REDEPLOY
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="mt-4 w-64 px-10 py-3 bg-transparent text-[#c9a24a] font-bold tracking-widest border border-[#c9a24a] hover:bg-[#c9a24a]/10 transition-colors"
            >
              SETTINGS
            </button>
          </div>
        </div>
      )}

      {isMobile && uiState.started && !uiState.gameOver && (
        <TouchControls stateRef={stateRef} canvasRef={canvasRef} thumbstickSize={settings.thumbstickSize} />
      )}

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onUpdate={updateSettings}
        isMobile={isMobile}
      />
    </div>
  );
}

type TouchControlsProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateRef: React.MutableRefObject<any>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  thumbstickSize: "normal" | "big";
};

function TouchControls({ stateRef, canvasRef, thumbstickSize }: TouchControlsProps) {
  const moveRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef<HTMLDivElement>(null);
  const [moveKnob, setMoveKnob] = useState({ x: 0, y: 0, active: false });
  const [aimKnob, setAimKnob] = useState({ x: 0, y: 0, active: false });

  useEffect(() => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const JOY_RADIUS = thumbstickSize === "big" ? 82.5 : 55;
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
  }, [stateRef, canvasRef, thumbstickSize]);

  const tapKey = (key: string) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key }));
  };

  const big = thumbstickSize === "big";
  const joyBase =
    `absolute rounded-full bg-black/40 border-2 border-[#c9a24a]/60 touch-none pointer-events-auto ${
      big ? "w-[168px] h-[168px] sm:w-[192px] sm:h-[192px]" : "w-28 h-28 sm:w-32 sm:h-32"
    }`;
  const knobStyle = (k: { x: number; y: number; active: boolean }) => ({
    transform: `translate(-50%, -50%) translate(${k.x}px, ${k.y}px)`,
    opacity: k.active ? 1 : 0.7,
  });

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20">
      {/* Movement joystick — bottom-left, hugs the corner so it fits in landscape */}
      <div
        ref={moveRef}
        className={`${joyBase} left-4 bottom-4 [@media(orientation:portrait)]:bottom-[calc(120px+env(safe-area-inset-bottom))] sm:left-6 sm:bottom-24`}
      >
        <div
          className={`absolute top-1/2 left-1/2 rounded-full bg-[#c9a24a]/80 border border-black/40 ${
            big ? "w-[72px] h-[72px] sm:w-[84px] sm:h-[84px]" : "w-12 h-12 sm:w-14 sm:h-14"
          }`}
          style={knobStyle(moveKnob)}
        />
      </div>

      {/* Aim + fire joystick — bottom-right */}
      <div
        ref={aimRef}
        className={`${joyBase} right-4 bottom-4 [@media(orientation:portrait)]:bottom-[calc(120px+env(safe-area-inset-bottom))] sm:right-6 sm:bottom-24`}
      >
        <div
          className={`absolute top-1/2 left-1/2 rounded-full bg-[#c93030]/80 border border-black/40 ${
            big ? "w-[72px] h-[72px] sm:w-[84px] sm:h-[84px]" : "w-12 h-12 sm:w-14 sm:h-14"
          }`}
          style={knobStyle(aimKnob)}
        />
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] font-mono text-[#c9a24a] tracking-widest whitespace-nowrap">
          AIM / FIRE
        </div>
      </div>

      {/* Action buttons — stacked vertically between thumbsticks in portrait (big only), horizontal otherwise */}
      <div
        className={`absolute pointer-events-auto w-max flex items-center gap-2
                   ${big
                     ? `[@media(orientation:portrait)]:flex-col-reverse
                        [@media(orientation:portrait)]:left-1/2
                        [@media(orientation:portrait)]:-translate-x-1/2
                        [@media(orientation:portrait)]:bottom-[calc(140px+env(safe-area-inset-bottom))]`
                     : `[@media(orientation:portrait)]:flex-row [@media(orientation:portrait)]:flex-nowrap
                        [@media(orientation:portrait)]:left-1/2
                        [@media(orientation:portrait)]:-translate-x-1/2
                        [@media(orientation:portrait)]:bottom-[calc(180px+env(safe-area-inset-bottom))]`}
                   [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:flex-nowrap
                   [@media(orientation:landscape)]:left-1/2 [@media(orientation:landscape)]:-translate-x-1/2
                   [@media(orientation:landscape)]:bottom-[100px]`}
      >

        <button
          onPointerDown={(e) => {
            e.preventDefault();
            tapKey("r");
          }}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/60 border-2 border-[#c9a24a]/70 font-mono text-[#c9a24a] text-xs sm:text-sm font-bold touch-none"
        >
          RELOAD
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            tapKey("e");
          }}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/60 border-2 border-[#c9a24a]/70 font-mono text-[#c9a24a] text-xs sm:text-sm font-bold touch-none"
        >
          USE
        </button>
      </div>

    </div>
  );
}

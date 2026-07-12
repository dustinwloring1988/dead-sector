import type {
  Bullet,
  Zombie,
  ToxicGas,
  ToxicProjectile,
  Particle,
  Pickup,
  Obstacle,
  CaveGenerator,
} from "@/lib/gameTypes";
import { WEAPONS } from "@/lib/weapons";
import {
  MAP_W,
  SURFACE_CENTER_Y,
  CAVE_RECT,
  CAVE_ENTRY,
  GENERATOR_POS,
  GOLF_ROOM_RECT,
  GOLF_ENTRY,
  TORCH_POSITIONS,
} from "@/lib/mapData";

// ─── Derived position constants ───────────────────────────────────────────────
const CAVE_ENTRY_TARGET = { x: CAVE_ENTRY.x + CAVE_ENTRY.w / 2, y: CAVE_RECT.y + 64 };
const CAVE_EXIT_TARGET = { x: CAVE_ENTRY.x + CAVE_ENTRY.w / 2, y: CAVE_RECT.y - 44 };
const GOLF_ENTRY_TARGET = {
  x: GOLF_ENTRY.x + GOLF_ENTRY.w / 2,
  y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 22,
};
const GOLF_EXIT_TARGET = {
  x: GOLF_ENTRY.x + GOLF_ENTRY.w / 2,
  y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h + 44,
};

// ─── Player type ──────────────────────────────────────────────────────────────
export type Player = {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  angle: number;
};

// ─── Totem / Torch types ──────────────────────────────────────────────────────
export type Totem = {
  x: number;
  y: number;
  kills: number;
  need: number;
  active: boolean;
  id: string;
};
export type Torch = { x: number; y: number; lit: boolean };

// ─── Weapon inventory entry ───────────────────────────────────────────────────
export type WeaponInventory = { mag: number; reserve: number; owned: boolean };

// ─── Boss type ────────────────────────────────────────────────────────────────
export type Boss = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  radius: number;
  lastShot: number;
  phase: number;
  lastCharge: number;
  charging: boolean;
  chargeDirX: number;
  chargeDirY: number;
  chargeTimer: number;
  lastUnderworldSpawn: number;
  hitFlash?: number;
  hitShake?: number;
};

// ─── Buy station / Ammo box ──────────────────────────────────────────────────
export type BuyStation = { x: number; y: number; weapon: keyof typeof WEAPONS };
export type AmmoBox = { x: number; y: number };

// ─── Golf types ───────────────────────────────────────────────────────────────
export type GolfBall = { x: number; y: number; vx: number; vy: number; hole: number };
export type GolfHole = { x: number; y: number };
export type GolfTargetBall = { x: number; y: number; color: "red" | "blue"; spawned: boolean };

// ─── Boss bullet ──────────────────────────────────────────────────────────────
export type BossBullet = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  color?: string;
};

// ─── Decal ────────────────────────────────────────────────────────────────────
export type Decal = {
  x: number;
  y: number;
  r: number;
  color: string;
  alpha: number;
  kind: "blood" | "scorch";
};

// ─── Ground decoration ────────────────────────────────────────────────────────
export type DirtPatch = { x: number; y: number; r: number; c: string };
export type GrassTuft = { x: number; y: number; c: string };

// ─── React HUD state (mirrors the useState shape in ZombieGame) ──────────────
export type UiState = {
  hp: number;
  points: number;
  round: number;
  zombiesLeft: number;
  mag: number;
  reserve: number;
  weaponName: string;
  reloading: boolean;
  gameOver: boolean;
  started: boolean;
  message: string;
  elapsedMs: number;
  kills: number;
  shotsFired: number;
  shotsHit: number;
  showingFireworks: boolean;
  actualRound: number;
  hp2: number;
  points2: number;
  mag2: number;
  reserve2: number;
  weaponName2: string;
  reloading2: boolean;
  kills2: number;
};

export type SetUiState = (fn: (prev: UiState) => UiState) => void;

// ─── Full game state ──────────────────────────────────────────────────────────
export type GameState = {
  // Player 1
  player: Player;
  keys: Record<string, boolean>;
  mouse: { x: number; y: number; worldX: number; worldY: number; down: boolean };
  weapons: Record<string, WeaponInventory>;
  currentWeaponKey: keyof typeof WEAPONS;
  reloadingUntil: number;
  lastShot: number;
  lastDamageTime: number;
  hitFlash: number;
  camera: { x: number; y: number; shake: number };
  walkPhase: number;
  muzzleFlash: number;
  kills: number;
  shotsFired: number;
  shotsHit: number;
  points: number;

  // Player 2 (split-screen)
  player2: Player;
  mouse2: { x: number; y: number; worldX: number; worldY: number; down: boolean };
  weapons2: Record<string, WeaponInventory>;
  currentWeaponKey2: keyof typeof WEAPONS;
  reloadingUntil2: number;
  lastShot2: number;
  lastDamageTime2: number;
  hitFlash2: number;
  camera2: { x: number; y: number; shake: number };
  walkPhase2: number;
  muzzleFlash2: number;
  kills2: number;
  shotsFired2: number;
  shotsHit2: number;
  points2: number;
  player2Alive: boolean;
  controllerIndex: number;
  _p2MoveX: number;
  _p2MoveY: number;
  _vpIsP2: boolean;

  // Game mode & state
  gameMode: "single" | "split";
  round: number;
  zombiesToSpawn: number;
  zombiesAlive: number;
  spawnCooldown: number;
  started: boolean;
  gameOver: boolean;
  lastTime: number;
  startTime: number;
  endTime: number;
  won: boolean;

  // Entities
  bullets: Bullet[];
  zombies: Zombie[];
  particles: Particle[];
  pickups: Pickup[];
  obstacles: Obstacle[];
  decals: Decal[];
  dirtPatches: DirtPatch[];
  grassTufts: GrassTuft[];
  groundInit: boolean;

  // Buy stations & ammo
  buyStations: BuyStation[];
  ammoBoxes: AmmoBox[];

  // Totem / Torch / Phase system
  totems: Totem[];
  totemPhase: 0 | 1 | 2 | 3 | 4 | 5;
  torches: Torch[];
  fireZombieToSpawn: boolean;
  fireZombieAlive: boolean;

  // Miniboss tracking
  minibossSpawned: boolean;
  minibossAlive: boolean;
  lastMinibossShot: number;
  toxicMinibossSpawned: boolean;
  toxicMinibossAlive: boolean;
  lastToxicMinibossShot: number;
  lastPoolMinibossShot: number;

  // Toxic system
  toxicProjectiles: ToxicProjectile[];
  toxicGas: ToxicGas[];
  toxicZombieSpawned: boolean;
  lastToxicDmg: number;

  // Ghost / portal
  ghostSpawnTimer: number;
  portalActive: boolean;
  portalPos: null | { x: number; y: number };
  glowingCrate: null | { x: number; y: number; w: number; h: number; hp: number };
  portalRoundPending: boolean;
  portalSpawnTimer: number;

  // Generator
  generator: CaveGenerator;
  generatorHintShown: boolean;

  // Golf
  golfBalls: GolfBall[];
  golfHoles: GolfHole[];
  golfCompleted: boolean;
  golfDoorOpened: boolean;
  golfTargetBalls: GolfTargetBall[];

  // Boss
  bossMode: boolean;
  boss: null | Boss;
  bossBullets: BossBullet[];
  lava: { x: number; y: number; w: number; h: number }[];
  lastLavaDmg: number;

  // Transitions / messages
  transitionFlash: number;
  messageUntil: number;
  message: string;
  messageTarget: 0 | 1 | 2;

  // Door hold / revive
  _doorHoldStartP1: number;
  _doorHoldStartP2: number;
  _reviveHoldStart: number;
  _reviveTarget: 0 | 1 | 2;

  // Jumpscare / fireworks
  jumpscareUntil: number;
  showingFireworks: boolean;
  fireworksTimer: number;

  // Collision helpers (attached at runtime)
  _resolveObstacles: (pos: { x: number; y: number }, r: number) => void;
  _bulletHitsObstacle: (bx: number, by: number) => boolean;
  _findHitObstacle: (bx: number, by: number) => number;
};

// ─── Initial state factory ────────────────────────────────────────────────────
export function createInitialState(): GameState {
  return {
    player: { x: MAP_W / 2, y: SURFACE_CENTER_Y, r: 14, hp: 100, maxHp: 100, speed: 260, angle: 0 },
    keys: {},
    mouse: { x: 0, y: 0, worldX: 0, worldY: 0, down: false },
    mouse2: { x: 0, y: 0, worldX: 0, worldY: 0, down: false },
    bullets: [],
    zombies: [],
    particles: [],
    pickups: [],
    points: 500,
    points2: 500,
    round: 1,
    zombiesToSpawn: 0,
    zombiesAlive: 0,
    spawnCooldown: 0,
    lastShot: 0,
    currentWeaponKey: "pistol",
    weapons: {
      pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve, owned: true },
    },
    reloadingUntil: 0,
    lastDamageTime: 0,
    hitFlash: 0,
    camera: { x: 0, y: 0, shake: 0 },
    buyStations: [
      { x: CAVE_RECT.x + 200, y: CAVE_RECT.y + CAVE_RECT.h / 2, weapon: "smg" },
      { x: MAP_W / 2 + 300, y: SURFACE_CENTER_Y - 300, weapon: "shotgun" },
      { x: 250, y: 225, weapon: "rifle" },
      { x: MAP_W - 250, y: 225, weapon: "lmg" },
    ],
    ammoBoxes: [{ x: MAP_W / 2, y: SURFACE_CENTER_Y + 500 }],
    obstacles: [],
    totems: [],
    totemPhase: 0,
    torches: [],
    fireZombieToSpawn: false,
    fireZombieAlive: false,
    minibossSpawned: false,
    minibossAlive: false,
    lastMinibossShot: 0,
    toxicMinibossSpawned: false,
    toxicMinibossAlive: false,
    lastToxicMinibossShot: 0,
    toxicProjectiles: [],
    transitionFlash: 0,
    bossMode: false,
    boss: null,
    bossBullets: [],
    lava: [],
    lastLavaDmg: 0,
    won: false,
    messageUntil: 0,
    message: "",
    messageTarget: 0,
    started: false,
    gameOver: false,
    lastTime: 0,
    round0Started: false,
    startTime: 0,
    endTime: 0,
    decals: [],
    dirtPatches: [],
    grassTufts: [],
    groundInit: false,
    walkPhase: 0,
    muzzleFlash: 0,
    kills: 0,
    shotsFired: 0,
    shotsHit: 0,
    gameMode: "single",
    player2: {
      x: MAP_W / 2 + 100,
      y: SURFACE_CENTER_Y,
      r: 14,
      hp: 100,
      maxHp: 100,
      speed: 260,
      angle: 0,
    },
    camera2: { x: 0, y: 0, shake: 0 },
    weapons2: {
      pistol: { mag: WEAPONS.pistol.magSize, reserve: WEAPONS.pistol.reserve, owned: true },
    },
    currentWeaponKey2: "pistol",
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
    },
    jumpscareUntil: 0,
    generatorHintShown: false,
    golfBalls: [],
    golfHoles: [
      { x: GOLF_ROOM_RECT.w / 2 - 300, y: 250 },
      { x: GOLF_ROOM_RECT.w / 2 + 300, y: 250 },
    ],
    golfCompleted: false,
    golfDoorOpened: false,
    golfTargetBalls: [],
    lastPoolMinibossShot: 0,
    toxicGas: [],
    toxicZombieSpawned: false,
    lastToxicDmg: 0,
    ghostSpawnTimer: 0,
    portalActive: false,
    portalPos: null,
    glowingCrate: null,
    portalRoundPending: false,
    portalSpawnTimer: 0,
    _doorHoldStartP1: 0,
    _doorHoldStartP2: 0,
    _reviveHoldStart: 0,
    _reviveTarget: 0,
    _resolveObstacles: () => {},
    _bulletHitsObstacle: () => false,
    _findHitObstacle: () => -1,
  };
}

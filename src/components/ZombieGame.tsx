import { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useGameSettings } from "@/hooks/use-settings";
import { SettingsModal } from "@/components/SettingsModal";
import { createRenderer } from "@/lib/gameRendering";
import { soundEngine } from "@/lib/soundEngine";
import type { Bullet, Zombie, ToxicGas, ToxicProjectile, Particle, Pickup, Obstacle } from "@/lib/gameTypes";
import { WEAPONS } from "@/lib/weapons";
import { TouchControls } from "@/components/TouchControls";
import { createInitialState } from "@/lib/gameState";
import type { GameState } from "@/lib/gameState";
import {
  movePlayer1 as moveP1, movePlayer2 as moveP2, updatePlayerAim,
  damagePlayer as dmgPlayer1, damagePlayer2 as dmgPlayer2,
  syncWeaponUi as syncWpnUi1, syncWeaponUi2 as syncWpnUi2,
  tryReload as tryReload1, finishReload as finishReload1,
  tryReload2, finishReload2,
  cycleWeapon2, updateCamera, updateWalkAnimation,
} from "@/lib/playerSystem";

// Dead Sector — original round-based top-down zombie shooter.
// Not affiliated with any existing franchise.

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

  const stateRef = useRef<GameState>(createInitialState());

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

    const renderer = createRenderer({ ctx, canvas, s, settingsRef, isInCave, isInFlashlight, WEAPONS });
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
      syncWpnUi2(s, setUiState);
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
      dmgPlayer2(s, amt, haptic, isInCave, setUiState);
    }

    function tryReload() {
      tryReload1(s, haptic, setUiState);
    }

    function finishReload() {
      finishReload1(s, setUiState);
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
      syncWpnUi1(s, setUiState);
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
      dmgPlayer1(s, amt, haptic, isInCave, setUiState);
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
      moveP1(s, dt, (s as any)._resolveObstacles);

      // ─── Player 2 movement (split-screen) ──────────────────────────────────
      moveP2(s, dt, (s as any)._resolveObstacles);
      if (s.gameMode === "split" && s.player2Alive) {
        const p2len = Math.hypot(s._p2MoveX, s._p2MoveY);
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
      updatePlayerAim(s, settingsRef.current.cameraZoom);

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

      // camera & walk animation
      updateCamera(s, canvas.width, canvas.height);
      updateWalkAnimation(s, dt);
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

      renderer.render();
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

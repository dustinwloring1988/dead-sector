import { useEffect, useRef, useState } from "react";

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
    obstacles: [] as { x: number; y: number; w: number; h: number; type: "rock" | "crate" | "fence" | "barrel" }[],
    totems: [] as { x: number; y: number; kills: number; need: number; active: boolean; id: string }[],
    totemPhase: 0 as 0 | 1 | 2 | 3, // 0=corners, 1=center, 2=transitioning, 3=boss
    transitionFlash: 0,
    bossMode: false,
    boss: null as null | { x: number; y: number; hp: number; maxHp: number; speed: number; radius: number; lastShot: number },
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
        // crate stacks near buy stations
        { x: cx - 380, y: cy - 240, w: 46, h: 46, type: "crate" },
        { x: cx - 340, y: cy - 200, w: 40, h: 40, type: "crate" },
        { x: cx + 340, y: cy - 240, w: 46, h: 46, type: "crate" },
        { x: cx + 320, y: cy + 220, w: 44, h: 44, type: "crate" },
        { x: cx - 360, y: cy + 240, w: 50, h: 50, type: "crate" },
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
        { x: cx - 450, y: cy - 500, w: 28, h: 28, type: "barrel" },
        { x: cx + 450, y: cy - 480, w: 28, h: 28, type: "barrel" },
        { x: cx - 480, y: cy + 460, w: 28, h: 28, type: "barrel" },
        { x: cx + 470, y: cy + 490, w: 28, h: 28, type: "barrel" },
        { x: cx - 250, y: cy + 340, w: 28, h: 28, type: "barrel" },
        { x: cx + 260, y: cy - 340, w: 28, h: 28, type: "barrel" },
        // outer wall crates
        { x: cx - 850, y: cy + 750, w: 60, h: 60, type: "crate" },
        { x: cx + 820, y: cy - 780, w: 60, h: 60, type: "crate" },
        { x: cx - 780, y: cy - 800, w: 55, h: 55, type: "crate" },
        { x: cx + 770, y: cy + 780, w: 55, h: 55, type: "crate" },
      ];
      s.obstacles = rects;
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
      if (s.round >= 4 && rr < 0.15) type = "brute";
      else if (s.round >= 2 && rr < 0.35) type = "runner";
      let hp = 40 + s.round * 20;
      let speed = 55 + s.round * 5;
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
      if (pw.mag <= 0) { tryReload(); return; }
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
      syncWeaponUi();
    }

    function damagePlayer(amt: number) {
      const now = performance.now();
      if (now - s.lastDamageTime < 400) return;
      s.lastDamageTime = now;
      s.player.hp -= amt;
      s.hitFlash = 1;
      s.camera.shake = Math.min(s.camera.shake + 8, 16);
      if (s.player.hp <= 0) {
        s.player.hp = 0;
        s.gameOver = true;
        setUiState((u) => ({ ...u, gameOver: true, hp: 0 }));
      }
      setUiState((u) => ({ ...u, hp: Math.max(0, s.player.hp) }));
    }

    function killZombie(z: Zombie, headshot = false) {
      s.zombiesAlive--;
      const pts = (z.type === "brute" ? 200 : z.type === "runner" ? 80 : 60) + (headshot ? 30 : 0);
      s.points += pts;
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
      s.bossMode = true;
      s.totemPhase = 3;
      s.zombies.length = 0;
      s.bullets.length = 0;
      s.pickups.length = 0;
      s.zombiesAlive = 0;
      s.zombiesToSpawn = -1;
      // rock-only obstacles scattered around lava arena
      s.obstacles = [
        { x: cx - 600, y: cy - 500, w: 110, h: 90, type: "rock" },
        { x: cx + 500, y: cy - 560, w: 100, h: 80, type: "rock" },
        { x: cx - 700, y: cy + 300, w: 130, h: 100, type: "rock" },
        { x: cx + 620, y: cy + 420, w: 120, h: 110, type: "rock" },
        { x: cx - 300, y: cy - 700, w: 90, h: 80, type: "rock" },
        { x: cx + 250, y: cy + 660, w: 100, h: 90, type: "rock" },
        { x: cx - 400, y: cy + 200, w: 80, h: 70, type: "rock" },
        { x: cx + 380, y: cy - 220, w: 85, h: 75, type: "rock" },
        { x: cx - 100, y: cy - 400, w: 70, h: 60, type: "rock" },
        { x: cx + 120, y: cy + 380, w: 90, h: 75, type: "rock" },
      ];
      // lava pools
      s.lava = [
        { x: cx - 260, y: cy - 100, w: 180, h: 90 },
        { x: cx + 80, y: cy - 60, w: 200, h: 110 },
        { x: cx - 120, y: cy + 140, w: 240, h: 100 },
        { x: cx - 550, y: cy + 40, w: 140, h: 200 },
        { x: cx + 410, y: cy + 120, w: 160, h: 180 },
        { x: cx - 40, y: cy - 340, w: 220, h: 90 },
      ];
      s.totems = [];
      s.player.x = cx;
      s.player.y = cy + 500;
      s.player.hp = Math.min(s.player.maxHp, s.player.hp + 40);
      // boss
      s.boss = {
        x: cx, y: cy - 500,
        hp: 4000, maxHp: 4000, speed: 70, radius: 42,
        lastShot: performance.now() + 3000,
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
        if ((s as any)._bulletHitsObstacle(b.x, b.y)) {
          hit = true;
          for (let k = 0; k < 4; k++) {
            const a = Math.random() * Math.PI * 2;
            s.particles.push({
              x: b.x, y: b.y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60,
              life: 0.25, maxLife: 0.25, color: "#888", size: 2 + Math.random() * 2,
            });
          }
        }
        if (!hit) for (let j = s.zombies.length - 1; j >= 0; j--) {
          const z = s.zombies[j];
          const dx = z.x - b.x, dy = z.y - b.y;
          if (dx * dx + dy * dy < z.radius * z.radius) {
            z.hp -= b.dmg;
            hit = true;
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
        if (d < bs.radius + s.player.r) damagePlayer(30);
        // shoot
        const now = performance.now();
        if (now - bs.lastShot > 5000) {
          bs.lastShot = now;
          const a = Math.atan2(s.player.y - bs.y, s.player.x - bs.x);
          for (let i = -1; i <= 1; i++) {
            const aa = a + i * 0.18;
            s.bossBullets.push({
              x: bs.x + Math.cos(aa) * bs.radius,
              y: bs.y + Math.sin(aa) * bs.radius,
              vx: Math.cos(aa) * 480, vy: Math.sin(aa) * 480,
              life: 2.2, dmg: 22,
            });
          }
          s.camera.shake = Math.min(s.camera.shake + 6, 16);
        }
        // player bullets vs boss
        for (let i = s.bullets.length - 1; i >= 0; i--) {
          const b = s.bullets[i];
          const bdx = bs.x - b.x, bdy = bs.y - b.y;
          if (bdx * bdx + bdy * bdy < bs.radius * bs.radius) {
            bs.hp -= b.dmg;
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
    }

    function drawGrid() {
      ctx.strokeStyle = "#1a1f1a";
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

    function drawMapBounds() {
      ctx.strokeStyle = "#3a2a1a";
      ctx.lineWidth = 8;
      ctx.strokeRect(-s.camera.x, -s.camera.y, MAP_W, MAP_H);
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
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(s.player.angle);
      // gun
      ctx.fillStyle = "#333";
      ctx.fillRect(8, -3, 22, 6);
      // body
      ctx.fillStyle = "#4a5a3a";
      ctx.beginPath();
      ctx.arc(0, 0, s.player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2a3a1a";
      ctx.lineWidth = 2;
      ctx.stroke();
      // helmet
      ctx.fillStyle = "#2a2a2a";
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
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
          ctx.fillStyle = "#7a2a1a";
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#2a0a05";
          ctx.lineWidth = 2; ctx.stroke();
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
      for (const z of s.zombies) {
        const sx = z.x - s.camera.x, sy = z.y - s.camera.y;
        if (sx < -50 || sy < -50 || sx > canvas.width + 50 || sy > canvas.height + 50) continue;
        const color = z.type === "brute" ? "#3a1a1a" : z.type === "runner" ? "#4a3a1a" : "#3a3a2a";
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, z.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#7a0d0d";
        ctx.lineWidth = 2;
        ctx.stroke();
        // eyes
        ctx.fillStyle = "#ff3030";
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.4);
        const ey = Math.sin(ang) * (z.radius * 0.4);
        const perpX = -Math.sin(ang) * 4, perpY = Math.cos(ang) * 4;
        ctx.beginPath();
        ctx.arc(sx + ex + perpX, sy + ey + perpY, 2, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, sy + ey - perpY, 2, 0, Math.PI * 2);
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
      ctx.fillStyle = "#ffdd66";
      for (const b of s.bullets) {
        const sx = b.x - s.camera.x, sy = b.y - s.camera.y;
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
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
      // aura (brighter when hit)
      const grd = ctx.createRadialGradient(sx, sy, bs.radius * 0.5, sx, sy, bs.radius * (2.2 + flash * 0.6));
      grd.addColorStop(0, `rgba(255,${60 + flash * 180},${20 + flash * 180},${(0.35 + flash * 0.5) * pulse})`);
      grd.addColorStop(1, "rgba(255,60,20,0)");
      ctx.fillStyle = grd;
      ctx.fillRect(sx - bs.radius * 2.8, sy - bs.radius * 2.8, bs.radius * 5.6, bs.radius * 5.6);
      // body
      ctx.fillStyle = flash > 0.05 ? `rgba(${26 + flash * 229},${5 + flash * 250},${5 + flash * 250},1)` : "#1a0505";
      ctx.beginPath(); ctx.arc(sx, sy, bs.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = flash > 0.05 ? "#ffffff" : "#c93030";
      ctx.lineWidth = 4 + flash * 3;
      ctx.stroke();
      // spikes
      const now = performance.now() / 500;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + now;
        ctx.fillStyle = "#5a0a0a";
        ctx.beginPath();
        ctx.moveTo(sx + Math.cos(a) * bs.radius, sy + Math.sin(a) * bs.radius);
        ctx.lineTo(sx + Math.cos(a + 0.2) * (bs.radius + 12), sy + Math.sin(a + 0.2) * (bs.radius + 12));
        ctx.lineTo(sx + Math.cos(a + 0.4) * bs.radius, sy + Math.sin(a + 0.4) * bs.radius);
        ctx.closePath(); ctx.fill();
      }
      // eyes
      ctx.fillStyle = `rgba(255,220,80,${pulse})`;
      const ang = Math.atan2(s.player.y - bs.y, s.player.x - bs.x);
      const ex = Math.cos(ang) * (bs.radius * 0.4);
      const ey = Math.sin(ang) * (bs.radius * 0.4);
      const perpX = -Math.sin(ang) * 10, perpY = Math.cos(ang) * 10;
      ctx.beginPath();
      ctx.arc(sx + ex + perpX, sy + ey + perpY, 4, 0, Math.PI * 2);
      ctx.arc(sx + ex - perpX, sy + ey - perpY, 4, 0, Math.PI * 2);
      ctx.fill();
      // hp bar (large, top of screen)
      const barW = Math.min(600, canvas.width - 200);
      const barX = (canvas.width - barW) / 2;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(barX - 4, 46, barW + 8, 22);
      ctx.fillStyle = "#3a0505";
      ctx.fillRect(barX, 50, barW, 14);
      ctx.fillStyle = "#c93030";
      ctx.fillRect(barX, 50, barW * (bs.hp / bs.maxHp), 14);
      ctx.fillStyle = "#e0c090"; ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
      ctx.fillText("THE HARBINGER", canvas.width / 2, 44);
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
      drawMapBounds();
      if (s.bossMode) drawLava();
      if (!s.bossMode) drawBuyStations();
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
          <div className="absolute top-4 left-4 font-mono text-[#c9a24a] pointer-events-none">
            <div className="text-3xl font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {uiState.round === 999 ? "BOSS FIGHT" : `ROUND ${uiState.round}`}
            </div>
            {uiState.round !== 999 && (
              <div className="mt-2 text-sm text-[#a89060]">
                ZOMBIES: {uiState.zombiesLeft}
              </div>
            )}
          </div>

          <div className="absolute top-4 left-1/2 -translate-x-1/2 font-mono pointer-events-none text-center">
            <div className="text-[10px] tracking-[0.3em] text-[#8a8a6a]">TIME</div>
            <div className="text-3xl font-bold tabular-nums text-[#c9a24a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {formatTime(uiState.elapsedMs)}
            </div>
          </div>



          <div className="absolute top-4 right-4 font-mono text-right pointer-events-none">
            <div className="text-2xl font-bold text-[#c9a24a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {uiState.points} PTS
            </div>
          </div>

          <div className="absolute bottom-4 left-4 font-mono pointer-events-none">
            <div className="bg-black/60 border border-[#3a3a1a] px-4 py-2 rounded-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-xs text-[#8a8a6a]">HEALTH</div>
              </div>
              <div className="w-56 h-3 bg-[#1a0505] border border-[#3a1010]">
                <div
                  className="h-full bg-gradient-to-r from-[#8a1010] to-[#c93030] transition-all"
                  style={{ width: `${uiState.hp}%` }}
                />
              </div>
              <div className="text-xs text-[#a89060] mt-1">{uiState.hp} / 100</div>
            </div>
          </div>

          <div className="absolute bottom-4 right-4 font-mono text-right pointer-events-none">
            <div className="bg-black/60 border border-[#3a3a1a] px-4 py-2 rounded-sm">
              <div className="text-xs text-[#8a8a6a]">{uiState.weaponName.toUpperCase()}</div>
              <div className="text-3xl font-bold text-[#c9a24a]">
                {uiState.reloading ? "..." : uiState.mag}
                <span className="text-lg text-[#8a7a4a]"> / {uiState.reserve}</span>
              </div>
              {uiState.reloading && (
                <div className="text-xs text-[#c93030] animate-pulse">RELOADING</div>
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
    </div>
  );
}

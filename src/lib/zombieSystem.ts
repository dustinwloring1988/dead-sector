import type { GameState } from "@/lib/gameState";
import type { Zombie } from "@/lib/gameTypes";
import {
  MAP_W,
  MAP_H,
  CAVE_RECT,
  GOLF_ROOM_RECT,
} from "@/lib/mapData";
import { circleRectOverlap, isInCave, isInGolfRoom, getZombiePursuitTarget } from "@/lib/physicsUtils";
import { soundEngine } from "@/lib/soundEngine";

// ─── Spawn position helpers ───────────────────────────────────────────────────

function findSpawnPosition(
  s: GameState,
  nearPlayer: boolean,
): { x: number; y: number } {
  const spawnPlayer =
    nearPlayer && s.gameMode === "split" && s.player2Alive && Math.random() > 0.5
      ? s.player2
      : s.player;
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
  if (
    cx >= GOLF_ROOM_RECT.x &&
    cx <= GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w &&
    cy >= GOLF_ROOM_RECT.y &&
    cy <= GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h
  ) {
    cy = GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h + 100 + Math.random() * 100;
  }
  return { x: cx, y: cy };
}

// ─── Spawning functions ───────────────────────────────────────────────────────

export function spawnZombie(s: GameState) {
  const { x: cx, y: cy } = findSpawnPosition(s, true);
  let type: Zombie["type"] = "walker";
  const rr = Math.random();
  if (s.round >= 5 && rr < 0.15) type = "brute";
  else if (s.round >= 4 && rr < 0.08) type = "brute";
  else if (s.round >= 3 && rr < 0.22) type = "runner";
  else if (s.round >= 3 && rr < 0.12) type = "runner";
  let hp = 30 + s.round * 15;
  let speed = 50 + s.round * 3;
  let radius = 16;
  if (type === "runner") {
    hp *= 0.6;
    speed = 130 + s.round * 6;
    radius = 13;
  }
  if (type === "brute") {
    hp *= 3.5;
    speed = 45 + s.round * 3;
    radius = 24;
  }
  s.zombies.push({ x: cx, y: cy, hp, maxHp: hp, speed, radius, type });
  s.zombiesAlive++;
}

export function spawnFireZombie(s: GameState) {
  const { x: cx, y: cy } = findSpawnPosition(s, false);
  const hp = 30 + s.round * 15;
  const speed = 50 + s.round * 3;
  const radius = 16;
  s.zombies.push({ x: cx, y: cy, hp, maxHp: hp, speed, radius, type: "fire" });
  s.zombiesAlive++;
  s.fireZombieAlive = true;
}

export function spawnFireMiniboss(
  s: GameState,
  setMessage: (m: string, ms?: number, target?: 0 | 1 | 2) => void,
) {
  const { x: cx, y: cy } = findSpawnPosition(s, false);
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

export function spawnToxicMiniboss(
  s: GameState,
  setMessage: (m: string, ms?: number, target?: 0 | 1 | 2) => void,
) {
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

export function spawnGhostZombie(s: GameState) {
  const cx = CAVE_RECT.x + 80 + Math.random() * (CAVE_RECT.w - 160);
  const cy = CAVE_RECT.y + 80 + Math.random() * (CAVE_RECT.h - 160);
  const hp = 15;
  const speed = 35 + Math.random() * 20;
  const radius = 14;
  s.zombies.push({ x: cx, y: cy, hp, maxHp: hp, speed, radius, type: "ghost" });
  s.zombiesAlive++;
}

export function spawnUnderworldZombie(s: GameState) {
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

// ─── Zombie update (movement, AI, collision) ──────────────────────────────────

export function updateZombies(
  s: GameState,
  dt: number,
  callbacks: {
    damagePlayer: (amt: number) => void;
    damagePlayer2: (amt: number) => void;
    setMessage: (m: string, ms?: number, target?: 0 | 1 | 2) => void;
  },
) {
  const caveDoorClosed = s.obstacles.some((o) => o.type === "door");
  const ghostDespawnList: Zombie[] = [];

  for (const z of s.zombies) {
    const target = getZombiePursuitTarget(
      z,
      s.player,
      s.player2,
      s.gameMode,
      s.player2Alive,
    );
    const dx = target.x - z.x;
    const dy = target.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    let dirX = dx / d;
    let dirY = dy / d;

    // Steer around obstacles
    const look = z.radius + 34;
    for (let attempt = 0; attempt < 3; attempt++) {
      let blocker: (typeof s.obstacles)[number] | null = null;
      const tx = z.x + dirX * look;
      const ty = z.y + dirY * look;
      for (const o of s.obstacles) {
        if (circleRectOverlap(tx, ty, z.radius + 2, o.x, o.y, o.w, o.h)) {
          blocker = o;
          break;
        }
      }
      if (!blocker) break;
      const ocx = blocker.x + blocker.w / 2;
      const ocy = blocker.y + blocker.h / 2;
      const cross = dirX * (ocy - z.y) - dirY * (ocx - z.x);
      const sign = cross > 0 ? -1 : 1;
      const ang = sign * (Math.PI / 3);
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const nx = dirX * cs - dirY * sn;
      const ny = dirX * sn + dirY * cs;
      dirX = nx;
      dirY = ny;
    }

    z.x += dirX * z.speed * dt;
    s._resolveObstacles(z, z.radius);
    z.y += dirY * z.speed * dt;
    s._resolveObstacles(z, z.radius);

    // Cave door boundary enforcement
    if (caveDoorClosed && isInCave(z.x, z.y)) {
      z.y = Math.max(20, CAVE_RECT.y - z.radius - 2);
      z.x = Math.max(
        CAVE_RECT.x + z.radius + 2,
        Math.min(CAVE_RECT.x + CAVE_RECT.w - z.radius - 2, z.x),
      );
      s._resolveObstacles(z, z.radius);
    }

    // Ghosts cannot leave the cave
    if (z.type === "ghost" && z.y < CAVE_RECT.y + 10) {
      ghostDespawnList.push(z);
    }

    // Player 1 collision damage
    const playerDist = Math.hypot(s.player.x - z.x, s.player.y - z.y) || 1;
    if (s.player.hp > 0 && playerDist < z.radius + s.player.r) {
      callbacks.damagePlayer(zombieDamage(z));
    }

    // Player 2 collision damage
    if (s.gameMode === "split" && s.player2Alive) {
      const p2dist = Math.hypot(s.player2.x - z.x, s.player2.y - z.y) || 1;
      if (p2dist < z.radius + s.player2.r) {
        callbacks.damagePlayer2(zombieDamage(z));
      }
    }

    // Miniboss special attacks
    updateMinibossAttacks(s, z, dt);
  }

  // Remove ghosts that tried to leave the cave
  for (const g of ghostDespawnList) {
    const i = s.zombies.indexOf(g);
    if (i !== -1) {
      s.zombies.splice(i, 1);
      s.zombiesAlive--;
    }
  }

  // Separate overlapping zombies
  separateZombies(s.zombies);
}

// ─── Miniboss special attacks ─────────────────────────────────────────────────

function updateMinibossAttacks(s: GameState, z: Zombie, dt: number) {
  const now = performance.now();

  // Fire miniboss: shoot fireball every 4 seconds
  if (z.type === "fireMiniboss") {
    if (now - s.lastMinibossShot > 4000) {
      s.lastMinibossShot = now;
      const { x: targetPx, y: targetPy } = findClosestPlayer(s, z);
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
      for (let k = 0; k < 6; k++) {
        const pa = Math.random() * Math.PI * 2;
        s.particles.push({
          x: z.x + Math.cos(a) * z.radius,
          y: z.y + Math.sin(a) * z.radius,
          vx: Math.cos(pa) * 60,
          vy: Math.sin(pa) * 60,
          life: 0.3,
          maxLife: 0.3,
          color: Math.random() < 0.5 ? "#ff6600" : "#ffaa00",
          size: 3,
        });
      }
    }
  }

  // Toxic miniboss: throw toxic gas cloud every 3 seconds
  if (z.type === "toxicMiniboss") {
    if (now - s.lastToxicMinibossShot > 3000) {
      s.lastToxicMinibossShot = now;
      const { x: targetPx, y: targetPy } = findClosestPlayer(s, z);
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
      for (let k = 0; k < 5; k++) {
        const pa = Math.random() * Math.PI * 2;
        s.particles.push({
          x: z.x + Math.cos(a) * z.radius,
          y: z.y + Math.sin(a) * z.radius,
          vx: Math.cos(pa) * 50,
          vy: Math.sin(pa) * 50,
          life: 0.3,
          maxLife: 0.3,
          color: Math.random() < 0.5 ? "#33cc33" : "#22aa22",
          size: 3,
        });
      }
    }
  }

  // Red/Blue pool miniboss: shoot colored ball every 2 seconds
  if (z.type === "redPoolMiniboss" || z.type === "bluePoolMiniboss") {
    if (now - s.lastPoolMinibossShot > 2000) {
      s.lastPoolMinibossShot = now;
      const { x: targetPx, y: targetPy } = findClosestPlayer(s, z);
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
      for (let k = 0; k < 6; k++) {
        const pa = Math.random() * Math.PI * 2;
        s.particles.push({
          x: z.x + Math.cos(a) * z.radius,
          y: z.y + Math.sin(a) * z.radius,
          vx: Math.cos(pa) * 50,
          vy: Math.sin(pa) * 50,
          life: 0.3,
          maxLife: 0.3,
          color: ballColor,
          size: 3,
        });
      }
    }
  }
}

// ─── Utility helpers ──────────────────────────────────────────────────────────

function findClosestPlayer(s: GameState, z: Zombie): { x: number; y: number } {
  let targetPx = z.x;
  let targetPy = z.y;
  let targetFound = false;

  if (s.player.hp > 0) {
    targetPx = s.player.x;
    targetPy = s.player.y;
    targetFound = true;
  }

  if (s.gameMode === "split" && s.player2Alive) {
    const d1 = targetFound ? Math.hypot(s.player.x - z.x, s.player.y - z.y) : Infinity;
    const d2 = Math.hypot(s.player2.x - z.x, s.player2.y - z.y);
    if (d2 < d1) {
      targetPx = s.player2.x;
      targetPy = s.player2.y;
    }
  }

  return { x: targetPx, y: targetPy };
}

function zombieDamage(z: Zombie): number {
  return z.type === "brute"
    ? 25
    : z.type === "fireMiniboss"
      ? 20
      : z.type === "toxicMiniboss"
        ? 18
        : z.type === "redPoolMiniboss" || z.type === "bluePoolMiniboss"
          ? 18
          : z.type === "runner"
            ? 12
            : z.type === "ghost" || z.type === "underworld"
              ? 10
              : 15;
}

function separateZombies(zombies: Zombie[]) {
  for (let i = 0; i < zombies.length; i++) {
    for (let j = i + 1; j < zombies.length; j++) {
      const a = zombies[i];
      const b = zombies[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const min = a.radius + b.radius;
      if (dist < min) {
        const push = (min - dist) / 2;
        const nx = dx / dist;
        const ny = dy / dist;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
      }
    }
  }
}

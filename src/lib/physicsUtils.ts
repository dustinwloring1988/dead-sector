import {
  CAVE_RECT,
  GOLF_ROOM_RECT,
  FLASHLIGHT_CONE_ANGLE,
  FLASHLIGHT_LENGTH,
  CAVE_ENTRY,
  GOLF_ENTRY,
} from "@/lib/mapData";

export type PlayerLike = {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  angle: number;
};

export type ZombieLike = { x: number; y: number };

export type ObstacleLike = { x: number; y: number; w: number; h: number };

// ─── Collision / physics helpers ──────────────────────────────────────────────

export function circleRectOverlap(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
) {
  const closestX = Math.max(rx, Math.min(cx, rx + rw));
  const closestY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - closestX,
    dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

export function resolveCircleAgainstObstacles(
  pos: { x: number; y: number },
  r: number,
  obstacles: ObstacleLike[],
) {
  for (const o of obstacles) {
    if (!circleRectOverlap(pos.x, pos.y, r, o.x, o.y, o.w, o.h)) continue;
    const closestX = Math.max(o.x, Math.min(pos.x, o.x + o.w));
    const closestY = Math.max(o.y, Math.min(pos.y, o.y + o.h));
    let dx = pos.x - closestX,
      dy = pos.y - closestY;
    let dist = Math.hypot(dx, dy);
    if (dist === 0) {
      const leftD = pos.x - o.x,
        rightD = o.x + o.w - pos.x;
      const topD = pos.y - o.y,
        botD = o.y + o.h - pos.y;
      const m = Math.min(leftD, rightD, topD, botD);
      if (m === leftD) {
        pos.x = o.x - r;
      } else if (m === rightD) {
        pos.x = o.x + o.w + r;
      } else if (m === topD) {
        pos.y = o.y - r;
      } else {
        pos.y = o.y + o.h + r;
      }
      continue;
    }
    const push = r - dist;
    pos.x += (dx / dist) * push;
    pos.y += (dy / dist) * push;
  }
}

export function bulletHitsObstacle(
  bx: number,
  by: number,
  obstacles: ObstacleLike[],
) {
  for (const o of obstacles) {
    if (bx >= o.x && bx <= o.x + o.w && by >= o.y && by <= o.y + o.h) return true;
  }
  return false;
}

export function findHitObstacle(
  bx: number,
  by: number,
  obstacles: ObstacleLike[],
) {
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    if (bx >= o.x && bx <= o.x + o.w && by >= o.y && by <= o.y + o.h) return i;
  }
  return -1;
}

// ─── Room visibility checks ──────────────────────────────────────────────────

export function isInCave(x: number, y: number) {
  return (
    x >= CAVE_RECT.x &&
    x <= CAVE_RECT.x + CAVE_RECT.w &&
    y >= CAVE_RECT.y &&
    y <= CAVE_RECT.y + CAVE_RECT.h
  );
}

export function isInGolfRoom(x: number, y: number) {
  return (
    x >= GOLF_ROOM_RECT.x &&
    x <= GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w &&
    y >= GOLF_ROOM_RECT.y &&
    y <= GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h
  );
}

export function isInPlayerFlashlight(
  wx: number,
  wy: number,
  px: number,
  py: number,
  pAngle: number,
  generatorActive: boolean,
) {
  const objInCave = isInCave(wx, wy);
  const playerInCave = isInCave(px, py);
  if (objInCave && !playerInCave) return false;
  if (playerInCave && !generatorActive) {
    const dx = wx - px,
      dy = wy - py;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > FLASHLIGHT_LENGTH) return false;
    const angle = Math.atan2(dy, dx);
    let diff = angle - pAngle;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return Math.abs(diff) < FLASHLIGHT_CONE_ANGLE / 2;
  }
  return !objInCave;
}

export function isInFlashlight(
  wx: number,
  wy: number,
  generatorActive: boolean,
  player: PlayerLike,
  player2: PlayerLike | null,
  gameMode: string,
  player2Alive: boolean,
) {
  if (generatorActive) return true;
  if (isInPlayerFlashlight(wx, wy, player.x, player.y, player.angle, generatorActive)) return true;
  if (gameMode === "split" && player2 && player2Alive) {
    if (isInPlayerFlashlight(wx, wy, player2.x, player2.y, player2.angle, generatorActive)) return true;
  }
  return false;
}

// ─── Pursuit helpers ─────────────────────────────────────────────────────────

export function getZombiePursuitTarget(
  z: ZombieLike,
  player: PlayerLike,
  player2: PlayerLike | null,
  gameMode: string,
  player2Alive: boolean,
) {
  let targetPlayer: PlayerLike | null = null;
  let targetDist = Infinity;
  if (player.hp > 0) {
    targetPlayer = player;
    targetDist = Math.hypot(player.x - z.x, player.y - z.y);
  }
  if (gameMode === "split" && player2Alive && player2) {
    const d2 = Math.hypot(player2.x - z.x, player2.y - z.y);
    if (d2 < targetDist) {
      targetPlayer = player2;
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
}

// ─── Derived constants ───────────────────────────────────────────────────────

export const CAVE_ENTRY_TARGET = {
  x: CAVE_ENTRY.x + CAVE_ENTRY.w / 2,
  y: CAVE_RECT.y + 64,
};
export const CAVE_EXIT_TARGET = {
  x: CAVE_ENTRY.x + CAVE_ENTRY.w / 2,
  y: CAVE_RECT.y - 44,
};
export const GOLF_ENTRY_TARGET = {
  x: GOLF_ENTRY.x + GOLF_ENTRY.w / 2,
  y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 22,
};
export const GOLF_EXIT_TARGET = {
  x: GOLF_ENTRY.x + GOLF_ENTRY.w / 2,
  y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h + 44,
};

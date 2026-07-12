import type { GameState, SetUiState } from "@/lib/gameState";
import { WEAPONS } from "@/lib/weapons";
import { soundEngine } from "@/lib/soundEngine";
import { MAP_W, MAP_H, SURFACE_CENTER_Y, BOSS_ARENA_SIZE } from "@/lib/mapData";

// ─── Movement ─────────────────────────────────────────────────────────────────

export function movePlayer1(
  s: GameState,
  dt: number,
  resolveObstacles: (pos: { x: number; y: number }, r: number) => void,
) {
  if (s.player.hp <= 0) return;

  let mx = 0,
    my = 0;
  if (s.keys["w"] || s.keys["arrowup"]) my -= 1;
  if (s.keys["s"] || s.keys["arrowdown"]) my += 1;
  if (s.keys["a"] || s.keys["arrowleft"]) mx -= 1;
  if (s.keys["d"] || s.keys["arrowright"]) mx += 1;
  const len = Math.hypot(mx, my);
  if (len > 0) {
    mx /= len;
    my /= len;
  }

  const sp = s.player.speed * dt;
  s.player.x = Math.max(20, Math.min(MAP_W - 20, s.player.x + mx * sp));
  resolveObstacles(s.player, s.player.r);
  s.player.y = Math.max(20, Math.min(MAP_H - 20, s.player.y + my * sp));
  resolveObstacles(s.player, s.player.r);

  // Glowing crate collision
  if (s.glowingCrate) {
    const gc = s.glowingCrate;
    const gcCx = gc.x + gc.w / 2,
      gcCy = gc.y + gc.h / 2;
    const dx = s.player.x - gcCx,
      dy = s.player.y - gcCy;
    const dist = Math.hypot(dx, dy);
    const minDist = s.player.r + Math.max(gc.w, gc.h) / 2;
    if (dist < minDist && dist > 0) {
      const push = minDist - dist;
      s.player.x += (dx / dist) * push;
      s.player.y += (dy / dist) * push;
    }
  }

  // Boss arena bounds
  if (s.bossMode) {
    const cx = MAP_W / 2,
      cy = SURFACE_CENTER_Y;
    const half = BOSS_ARENA_SIZE / 2 - s.player.r;
    s.player.x = Math.max(cx - half, Math.min(cx + half, s.player.x));
    s.player.y = Math.max(cy - half, Math.min(cy + half, s.player.y));
  }
}

export function movePlayer2(
  s: GameState,
  dt: number,
  resolveObstacles: (pos: { x: number; y: number }, r: number) => void,
) {
  if (s.gameMode !== "split" || !s.player2Alive) return;

  const p2mx = s._p2MoveX;
  const p2my = s._p2MoveY;
  const p2len = Math.hypot(p2mx, p2my);
  let p2dx = 0,
    p2dy = 0;
  if (p2len > 0) {
    p2dx = p2mx / p2len;
    p2dy = p2my / p2len;
  }

  const p2sp = s.player2.speed * dt;
  s.player2.x = Math.max(20, Math.min(MAP_W - 20, s.player2.x + p2dx * p2sp));
  resolveObstacles(s.player2, s.player2.r);
  s.player2.y = Math.max(20, Math.min(MAP_H - 20, s.player2.y + p2dy * p2sp));
  resolveObstacles(s.player2, s.player2.r);

  // Glowing crate collision
  if (s.glowingCrate) {
    const gc = s.glowingCrate;
    const gcCx = gc.x + gc.w / 2,
      gcCy = gc.y + gc.h / 2;
    const dx2 = s.player2.x - gcCx,
      dy2 = s.player2.y - gcCy;
    const dist2 = Math.hypot(dx2, dy2);
    const minDist2 = s.player2.r + Math.max(gc.w, gc.h) / 2;
    if (dist2 < minDist2 && dist2 > 0) {
      const push2 = minDist2 - dist2;
      s.player2.x += (dx2 / dist2) * push2;
      s.player2.y += (dy2 / dist2) * push2;
    }
  }

  // Boss arena bounds for P2
  if (s.bossMode) {
    const cx = MAP_W / 2,
      cy = SURFACE_CENTER_Y;
    const half = BOSS_ARENA_SIZE / 2 - s.player2.r;
    s.player2.x = Math.max(cx - half, Math.min(cx + half, s.player2.x));
    s.player2.y = Math.max(cy - half, Math.min(cy + half, s.player2.y));
  }
}

// ─── Aim ──────────────────────────────────────────────────────────────────────

export function updatePlayerAim(s: GameState, cameraZoom: "normal" | "zoomed") {
  const zoom = cameraZoom === "zoomed" ? 1.4 : 1;
  const px = s.player.x - s.camera.x;
  const py = s.player.y - s.camera.y;
  s.mouse.worldX = (s.mouse.x - px) / zoom + px + s.camera.x;
  s.mouse.worldY = (s.mouse.y - py) / zoom + py + s.camera.y;
  s.player.angle = Math.atan2(s.mouse.worldY - s.player.y, s.mouse.worldX - s.player.x);
}

// ─── Damage ───────────────────────────────────────────────────────────────────

export function damagePlayer(
  s: GameState,
  amt: number,
  haptic: (pattern: number | number[]) => void,
  isInCave: (x: number, y: number) => boolean,
  setUiState: SetUiState,
) {
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
        setUiState((u) => ({
          ...u,
          gameOver: true,
          hp: 0,
          points: s.points,
          kills: s.kills,
          shotsFired: s.shotsFired,
          shotsHit: s.shotsHit,
          points2: s.points2,
          kills2: s.kills2,
          shotsFired2: s.shotsFired2,
          shotsHit2: s.shotsHit2,
        }));
      }
    }
  } else {
    haptic([30, 20, 40]);
  }
  setUiState((u) => ({ ...u, hp: Math.max(0, s.player.hp) }));
}

export function damagePlayer2(
  s: GameState,
  amt: number,
  haptic: (pattern: number | number[]) => void,
  isInCave: (x: number, y: number) => boolean,
  setUiState: SetUiState,
) {
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
      setUiState((u) => ({
        ...u,
        gameOver: true,
        hp: 0,
        points: s.points,
        kills: s.kills,
        shotsFired: s.shotsFired,
        shotsHit: s.shotsHit,
        points2: s.points2,
        kills2: s.kills2,
        shotsFired2: s.shotsFired2,
        shotsHit2: s.shotsHit2,
      }));
    }
  } else {
    haptic([30, 20, 40]);
  }
  setUiState((u) => ({ ...u, hp2: Math.max(0, s.player2.hp) }));
}

// ─── Weapon UI Sync ───────────────────────────────────────────────────────────

export function syncWeaponUi(s: GameState, setUiState: SetUiState) {
  const w = WEAPONS[s.currentWeaponKey];
  const pw = s.weapons[s.currentWeaponKey];
  setUiState((u) => ({
    ...u,
    weaponName: w.name,
    mag: pw.mag,
    reserve: pw.reserve,
    points: s.points,
  }));
}

export function syncWeaponUi2(s: GameState, setUiState: SetUiState) {
  const w = WEAPONS[s.currentWeaponKey2];
  const pw = s.weapons2[s.currentWeaponKey2];
  setUiState((u) => ({
    ...u,
    weaponName2: w.name,
    mag2: pw.mag,
    reserve2: pw.reserve,
    points2: s.points2,
  }));
}

// ─── Reload ───────────────────────────────────────────────────────────────────

export function tryReload(
  s: GameState,
  haptic: (pattern: number | number[]) => void,
  setUiState: SetUiState,
) {
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

export function finishReload(s: GameState, setUiState: SetUiState) {
  const key = s.currentWeaponKey;
  const w = WEAPONS[key];
  const pw = s.weapons[key];
  const need = w.magSize - pw.mag;
  const take = Math.min(need, pw.reserve);
  pw.mag += take;
  pw.reserve -= take;
  setUiState((u) => ({ ...u, mag: pw.mag, reserve: pw.reserve, reloading: false }));
}

export function tryReload2(
  s: GameState,
  haptic: (pattern: number | number[]) => void,
  setUiState: SetUiState,
) {
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

export function finishReload2(s: GameState, setUiState: SetUiState) {
  const key = s.currentWeaponKey2;
  const w = WEAPONS[key];
  const pw = s.weapons2[key];
  const need = w.magSize - pw.mag;
  const take = Math.min(need, pw.reserve);
  pw.mag += take;
  pw.reserve -= take;
  setUiState((u) => ({ ...u, mag2: pw.mag, reserve2: pw.reserve, reloading2: false }));
}

// ─── Weapon Cycling ───────────────────────────────────────────────────────────

export function cycleWeapon2(s: GameState, dir: number, setUiState: SetUiState) {
  const ownedKeys = Object.keys(s.weapons2).filter((k) => s.weapons2[k].owned);
  if (ownedKeys.length <= 1) return;
  const idx = ownedKeys.indexOf(s.currentWeaponKey2);
  const next = (idx + dir + ownedKeys.length) % ownedKeys.length;
  s.currentWeaponKey2 = ownedKeys[next] as keyof typeof WEAPONS;
  syncWeaponUi2(s, setUiState);
}

// ─── Camera ───────────────────────────────────────────────────────────────────

export function updateCamera(s: GameState, canvasWidth: number, canvasHeight: number) {
  const vpW = s.gameMode === "split" ? canvasWidth / 2 : canvasWidth;
  const targetX = s.player.x - vpW / 2;
  const targetY = s.player.y - canvasHeight / 2;
  s.camera.x += (targetX - s.camera.x) * 0.15;
  s.camera.y += (targetY - s.camera.y) * 0.15;
  if (s.camera.shake > 0) {
    s.camera.x += (Math.random() - 0.5) * s.camera.shake;
    s.camera.y += (Math.random() - 0.5) * s.camera.shake;
    s.camera.shake *= 0.85;
    if (s.camera.shake < 0.1) s.camera.shake = 0;
  }
  s.hitFlash *= 0.9;

  // Camera 2 (player 2)
  if (s.gameMode === "split") {
    const t2x = s.player2.x - vpW / 2;
    const t2y = s.player2.y - canvasHeight / 2;
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

// ─── Walk animation ───────────────────────────────────────────────────────────

export function updateWalkAnimation(s: GameState, dt: number) {
  if (s.player.hp > 0) {
    s.muzzleFlash = Math.max(0, s.muzzleFlash - dt * 12);
    const isMoving =
      s.keys["w"] ||
      s.keys["a"] ||
      s.keys["s"] ||
      s.keys["d"] ||
      s.keys["arrowup"] ||
      s.keys["arrowdown"] ||
      s.keys["arrowleft"] ||
      s.keys["arrowright"];
    if (isMoving) s.walkPhase += dt * 12;
  }
  if (s.gameMode === "split" && s.player2Alive) {
    const p2len = Math.hypot(s._p2MoveX, s._p2MoveY);
    s.muzzleFlash2 = Math.max(0, s.muzzleFlash2 - dt * 12);
    s.hitFlash2 *= 0.9;
    if (p2len > 0) s.walkPhase2 += dt * 12;
  }
}

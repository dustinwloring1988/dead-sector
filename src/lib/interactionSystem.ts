import type { GameState } from "@/lib/gameState";
import type { Obstacle } from "@/lib/gameTypes";
import { WEAPONS } from "@/lib/weapons";
import {
  CAVE_DOOR_COST,
  GOLF_DOOR_COST,
  GENERATOR_POS,
  GOLF_ROOM_RECT,
} from "@/lib/mapData";
import { soundEngine } from "@/lib/soundEngine";
import { spawnGhostZombie } from "@/lib/zombieSystem";

// ─── Open door (shared by P1 and P2) ─────────────────────────────────────────

export function openDoor(
  s: GameState,
  o: Obstacle,
  playerNum: 1 | 2,
  callbacks: {
    setMessage: (m: string, ms?: number, target?: 0 | 1 | 2) => void;
    syncWeaponUi: () => void;
  },
) {
  const idx = s.obstacles.indexOf(o);
  if (idx === -1) return;
  s.obstacles.splice(idx, 1);
  soundEngine.buyWeapon();

  if (o.type === "door") {
    callbacks.setMessage("CAVE DOOR OPENED", 2200, playerNum);
    callbacks.syncWeaponUi();
    if (!s.toxicZombieSpawned) {
      const hp = 30 + s.round * 15;
      s.zombies.push({
        x: GENERATOR_POS.x - 60,
        y: GENERATOR_POS.y,
        hp,
        maxHp: hp,
        speed: 45 + s.round * 3,
        radius: 18,
        type: "toxic",
      });
      s.zombies.push({
        x: GENERATOR_POS.x + 60,
        y: GENERATOR_POS.y,
        hp,
        maxHp: hp,
        speed: 45 + s.round * 3,
        radius: 18,
        type: "toxic",
      });
      s.zombiesAlive += 2;
      s.toxicZombieSpawned = true;
    }
    for (let i = 0; i < 3; i++) spawnGhostZombie(s);
  } else if (o.type === "golfDoor") {
    s.golfDoorOpened = true;
    callbacks.setMessage("GOLF ROOM OPENED", 2200, playerNum);
    callbacks.syncWeaponUi();
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

// ─── Try interact (Player 1) ──────────────────────────────────────────────────

export function tryInteract(
  s: GameState,
  callbacks: {
    setMessage: (m: string, ms?: number, target?: 0 | 1 | 2) => void;
    syncWeaponUi: () => void;
    enterBossMap: () => void;
  },
) {
  // Cave door
  for (let i = 0; i < s.obstacles.length; i++) {
    const o = s.obstacles[i];
    if (o.type !== "door") continue;
    const dx = o.x + o.w / 2 - s.player.x;
    const dy = o.y + o.h / 2 - s.player.y;
    if (dx * dx + dy * dy < 90 * 90) {
      const remaining = CAVE_DOOR_COST - (o.paid || 0);
      if (s.points < remaining) {
        callbacks.setMessage(`Need ${remaining} points`, 1800, 1);
        return;
      }
      s.points -= remaining;
      openDoor(s, o, 1, callbacks);
      return;
    }
  }

  // Golf door
  for (let i = 0; i < s.obstacles.length; i++) {
    const o = s.obstacles[i];
    if (o.type !== "golfDoor") continue;
    const dx = o.x + o.w / 2 - s.player.x;
    const dy = o.y + o.h / 2 - s.player.y;
    if (dx * dx + dy * dy < 90 * 90) {
      const remaining = GOLF_DOOR_COST - (o.paid || 0);
      if (s.points < remaining) {
        callbacks.setMessage(`Need ${remaining} points`, 1800, 1);
        return;
      }
      s.points -= remaining;
      openDoor(s, o, 1, callbacks);
      return;
    }
  }

  // Buy station (requires power)
  for (const b of s.buyStations) {
    const dx = b.x - s.player.x;
    const dy = b.y - s.player.y;
    if (dx * dx + dy * dy < 70 * 70) {
      if (!s.generator?.active) {
        callbacks.setMessage("POWER NEEDED", 1800, 1);
        return;
      }
      const w = WEAPONS[b.weapon];
      const owned = s.weapons[b.weapon]?.owned;
      const cost = owned ? Math.floor(w.cost * 0.5) : w.cost;
      if (s.points < cost) {
        callbacks.setMessage(`Need ${cost} points`, 1800, 1);
        return;
      }
      s.points -= cost;
      soundEngine.buyWeapon();
      if (!owned) {
        s.weapons[b.weapon] = { mag: w.magSize, reserve: w.reserve, owned: true };
        s.currentWeaponKey = b.weapon;
        callbacks.setMessage(`Purchased ${w.name}`, 1800, 1);
      } else {
        const pw = s.weapons[b.weapon];
        pw.mag = w.magSize;
        pw.reserve = w.reserve;
        callbacks.setMessage(`Refilled ${w.name}`, 1800, 1);
      }
      callbacks.syncWeaponUi();
      return;
    }
  }

  // Ammo box
  for (const a of s.ammoBoxes) {
    const dx = a.x - s.player.x;
    const dy = a.y - s.player.y;
    if (dx * dx + dy * dy < 60 * 60) {
      const cost = 500;
      if (s.points < cost) {
        callbacks.setMessage(`Ammo: ${cost} pts`, 1800, 1);
        return;
      }
      s.points -= cost;
      soundEngine.buyWeapon();
      const pw = s.weapons[s.currentWeaponKey];
      pw.reserve = WEAPONS[s.currentWeaponKey].reserve;
      callbacks.setMessage("Max ammo!", 1800, 1);
      callbacks.syncWeaponUi();
      return;
    }
  }

  // Dark ether portal
  if (s.portalActive && s.portalPos) {
    const dx = s.portalPos.x - s.player.x;
    const dy = s.portalPos.y - s.player.y;
    if (dx * dx + dy * dy < 90 * 90) {
      s.portalActive = false;
      s.portalPos = null;
      s.glowingCrate = null;
      callbacks.enterBossMap();
      return;
    }
  }
}

// ─── Try interact (Player 2) ──────────────────────────────────────────────────

export function tryInteract2(
  s: GameState,
  callbacks: {
    setMessage: (m: string, ms?: number, target?: 0 | 1 | 2) => void;
    syncWeaponUi: () => void;
    enterBossMap: () => void;
  },
) {
  // Cave door
  for (let i = 0; i < s.obstacles.length; i++) {
    const o = s.obstacles[i];
    if (o.type !== "door") continue;
    const dx = o.x + o.w / 2 - s.player2.x;
    const dy = o.y + o.h / 2 - s.player2.y;
    if (dx * dx + dy * dy < 90 * 90) {
      const remaining = CAVE_DOOR_COST - (o.paid || 0);
      if (s.points2 < remaining) {
        callbacks.setMessage(`Need ${remaining} points`, 1800, 2);
        return;
      }
      s.points2 -= remaining;
      openDoor(s, o, 2, callbacks);
      return;
    }
  }

  // Golf door
  for (let i = 0; i < s.obstacles.length; i++) {
    const o = s.obstacles[i];
    if (o.type !== "golfDoor") continue;
    const dx = o.x + o.w / 2 - s.player2.x;
    const dy = o.y + o.h / 2 - s.player2.y;
    if (dx * dx + dy * dy < 90 * 90) {
      const remaining = GOLF_DOOR_COST - (o.paid || 0);
      if (s.points2 < remaining) {
        callbacks.setMessage(`Need ${remaining} points`, 1800, 2);
        return;
      }
      s.points2 -= remaining;
      openDoor(s, o, 2, callbacks);
      return;
    }
  }

  // Buy station
  for (const b of s.buyStations) {
    const dx = b.x - s.player2.x;
    const dy = b.y - s.player2.y;
    if (dx * dx + dy * dy < 70 * 70) {
      if (!s.generator?.active) {
        callbacks.setMessage("POWER NEEDED", 1800, 2);
        return;
      }
      const w = WEAPONS[b.weapon];
      const owned = s.weapons2[b.weapon]?.owned;
      const cost = owned ? Math.floor(w.cost * 0.5) : w.cost;
      if (s.points2 < cost) {
        callbacks.setMessage(`Need ${cost} points`, 1800, 2);
        return;
      }
      s.points2 -= cost;
      soundEngine.buyWeapon();
      if (!owned) {
        s.weapons2[b.weapon] = { mag: w.magSize, reserve: w.reserve, owned: true };
        s.currentWeaponKey2 = b.weapon;
        callbacks.setMessage(`Purchased ${w.name}`, 1800, 2);
      } else {
        const pw = s.weapons2[b.weapon];
        pw.mag = w.magSize;
        pw.reserve = w.reserve;
        callbacks.setMessage(`Refilled ${w.name}`, 1800, 2);
      }
      callbacks.syncWeaponUi();
      return;
    }
  }

  // Ammo box
  for (const a of s.ammoBoxes) {
    const dx = a.x - s.player2.x;
    const dy = a.y - s.player2.y;
    if (dx * dx + dy * dy < 60 * 60) {
      const cost = 500;
      if (s.points2 < cost) {
        callbacks.setMessage(`Ammo: ${cost} pts`, 1800, 2);
        return;
      }
      s.points2 -= cost;
      soundEngine.buyWeapon();
      const pw = s.weapons2[s.currentWeaponKey2];
      pw.reserve = WEAPONS[s.currentWeaponKey2].reserve;
      callbacks.setMessage("Max ammo!", 1800, 2);
      callbacks.syncWeaponUi();
      return;
    }
  }

  // Dark ether portal
  if (s.portalActive && s.portalPos) {
    const dx = s.portalPos.x - s.player2.x;
    const dy = s.portalPos.y - s.player2.y;
    if (dx * dx + dy * dy < 90 * 90) {
      s.portalActive = false;
      s.portalPos = null;
      s.glowingCrate = null;
      callbacks.enterBossMap();
      return;
    }
  }
}

// ─── Door hold-to-pay-half (called from update loop) ──────────────────────────

export function updateDoorHolds(
  s: GameState,
  callbacks: {
    setMessage: (m: string, ms?: number, target?: 0 | 1 | 2) => void;
    syncWeaponUi: () => void;
    enterBossMap: () => void;
  },
) {
  const now = performance.now();

  // Player 1 door hold
  if (s._doorHoldStartP1 > 0 && now - s._doorHoldStartP1 >= 1500) {
    s._doorHoldStartP1 = 0;
    for (const o of s.obstacles) {
      if (o.type !== "door" && o.type !== "golfDoor") continue;
      const cost = o.type === "door" ? CAVE_DOOR_COST : GOLF_DOOR_COST;
      const dx = o.x + o.w / 2 - s.player.x;
      const dy = o.y + o.h / 2 - s.player.y;
      if (dx * dx + dy * dy < 90 * 90) {
        const remaining = cost - (o.paid || 0);
        const half = Math.ceil(remaining / 2);
        if (s.points >= half) {
          s.points -= half;
          o.paid = (o.paid || 0) + half;
          soundEngine.buyWeapon();
          if (o.paid >= cost) {
            openDoor(s, o, 1, callbacks);
          } else {
            callbacks.setMessage(`PAID ${o.paid}/${cost} - ${cost - o.paid} LEFT`, 2200, 1);
          }
        } else {
          callbacks.setMessage(`Need ${half} points for half`, 1800, 1);
        }
        break;
      }
    }
  }

  // Player 2 door hold
  if (
    s.gameMode === "split" &&
    s._doorHoldStartP2 > 0 &&
    now - s._doorHoldStartP2 >= 1500
  ) {
    s._doorHoldStartP2 = 0;
    for (const o of s.obstacles) {
      if (o.type !== "door" && o.type !== "golfDoor") continue;
      const cost = o.type === "door" ? CAVE_DOOR_COST : GOLF_DOOR_COST;
      const dx = o.x + o.w / 2 - s.player2.x;
      const dy = o.y + o.h / 2 - s.player2.y;
      if (dx * dx + dy * dy < 90 * 90) {
        const remaining = cost - (o.paid || 0);
        const half = Math.ceil(remaining / 2);
        if (s.points2 >= half) {
          s.points2 -= half;
          o.paid = (o.paid || 0) + half;
          soundEngine.buyWeapon();
          if (o.paid >= cost) {
            openDoor(s, o, 2, callbacks);
          } else {
            callbacks.setMessage(`PAID ${o.paid}/${cost} - ${cost - o.paid} LEFT`, 2200, 2);
          }
        } else {
          callbacks.setMessage(`Need ${half} points for half`, 1800, 2);
        }
        break;
      }
    }
  }
}

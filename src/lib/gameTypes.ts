export type Vec = { x: number; y: number };

export type Bullet = Vec & { vx: number; vy: number; life: number; dmg: number; owner?: 1 | 2 };
export type Zombie = Vec & { hp: number; maxHp: number; speed: number; radius: number; type: "walker" | "runner" | "brute" | "fire" | "toxic" | "fireMiniboss" | "toxicMiniboss" | "ghost" | "underworld" | "redPoolMiniboss" | "bluePoolMiniboss" };
export type ToxicGas = Vec & { radius: number; life: number; maxLife: number };
export type ToxicProjectile = Vec & { vx: number; vy: number; distTraveled: number; maxDist: number };
export type Particle = Vec & { vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
export type Pickup = Vec & { kind: "ammo" | "health" | "maxammo"; life: number };
export type Obstacle = Vec & { w: number; h: number; type: "rock" | "crate" | "fence" | "barrel" | "toxicBarrel" | "caveWall" | "door" | "golfDoor"; hp?: number; paid?: number };
export type CaveGenerator = Vec & { active: boolean; progressMs: number };

export type Weapon = {
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

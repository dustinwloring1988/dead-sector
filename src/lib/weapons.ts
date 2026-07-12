import type { Weapon } from "./gameTypes";

export type { Weapon };

export const WEAPONS: Record<string, Weapon> = {
  pistol: { name: "M1911 Sidearm", dmg: 25, fireRate: 220, spread: 0.03, pellets: 1, speed: 900, magSize: 12, reserve: 96, reloadMs: 900, cost: 0, auto: false },
  smg: { name: "SMG", dmg: 22, fireRate: 90, spread: 0.08, pellets: 1, speed: 950, magSize: 32, reserve: 192, reloadMs: 1400, cost: 3000, auto: true },
  shotgun: { name: "Shotgun", dmg: 30, fireRate: 550, spread: 0.28, pellets: 7, speed: 850, magSize: 6, reserve: 48, reloadMs: 1700, cost: 4000, auto: false },
  rifle: { name: "Rifle", dmg: 55, fireRate: 130, spread: 0.04, pellets: 1, speed: 1100, magSize: 24, reserve: 160, reloadMs: 1600, cost: 5000, auto: true },
  lmg: { name: "LMG", dmg: 40, fireRate: 75, spread: 0.1, pellets: 1, speed: 1000, magSize: 75, reserve: 300, reloadMs: 2400, cost: 6000, auto: true },
};

export type ObstacleType = "rock" | "crate" | "fence" | "barrel" | "toxicBarrel" | "caveWall" | "door" | "golfDoor";

export type MapObstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
  type: ObstacleType;
  hp?: number;
};

export type MapData = {
  width: number;
  height: number;
  surfaceCenterY: number;
  bossArenaSize: number;
  cave: {
    rect: { x: number; y: number; w: number; h: number };
    entry: { x: number; w: number };
    doorCost: number;
    generatorPos: { x: number; y: number };
    generatorInteractDistance: number;
    generatorHoldMs: number;
    totemPos: { x: number; y: number };
  };
  golfRoom: {
    rect: { x: number; y: number; w: number; h: number };
    entry: { x: number; w: number };
    doorCost: number;
  };
  flashlight: { coneAngle: number; length: number };
  torches: { positions: { x: number; y: number }[]; lightRadius: number };
  doorHoldMs: number;
  revive: { holdMs: number; hp: number };
  buyStations: { x: number; y: number; weapon: string }[];
  ammoBoxes: { x: number; y: number }[];
  golfHoles: { x: number; y: number }[];
  obstacles: MapObstacle[];
  caveLights: { x: number; y: number }[];
  bossLava: { x: number; y: number; w: number; h: number }[];
};

export const DEFAULT_MAP: MapData = {
  width: 2000,
  height: 2600,
  surfaceCenterY: 1000,
  bossArenaSize: 1000,
  cave: {
    rect: { x: 0, y: 2000, w: 2000, h: 600 },
    entry: { x: 900, w: 200 },
    doorCost: 1500,
    generatorPos: { x: 1000, y: 2480 },
    generatorInteractDistance: 80,
    generatorHoldMs: 20000,
    totemPos: { x: 1700, y: 2460 },
  },
  golfRoom: {
    rect: { x: 0, y: 0, w: 2000, h: 450 },
    entry: { x: 900, w: 200 },
    doorCost: 1000,
  },
  flashlight: { coneAngle: Math.PI / 3, length: 430 },
  torches: {
    positions: [
      { x: 400, y: 1000 },
      { x: 1600, y: 1000 },
    ],
    lightRadius: 180,
  },
  doorHoldMs: 1500,
  revive: { holdMs: 3000, hp: 50 },
  buyStations: [
    { x: 200, y: 2300, weapon: "smg" },
    { x: 1300, y: 700, weapon: "shotgun" },
    { x: 250, y: 225, weapon: "rifle" },
    { x: 1750, y: 225, weapon: "lmg" },
  ],
  ammoBoxes: [
    { x: 1000, y: 1500 },
  ],
  golfHoles: [
    { x: 700, y: 250 },
    { x: 1300, y: 250 },
  ],
  obstacles: [
    // central sandbag pit around spawn (leave gaps)
    { x: 910, y: 860, w: 180, h: 18, type: "fence" },
    { x: 860, y: 1122, w: 90, h: 18, type: "fence" },
    { x: 1050, y: 1122, w: 90, h: 18, type: "fence" },
    { x: 842, y: 910, w: 18, h: 180, type: "fence" },
    { x: 1140, y: 910, w: 18, h: 180, type: "fence" },
    // crate stacks near buy stations (spaced to avoid overlap with 80x80 buy stations)
    { x: 570, y: 740, w: 46, h: 46, type: "crate" },
    { x: 650, y: 830, w: 40, h: 40, type: "crate" },
    { x: 1340, y: 760, w: 46, h: 46, type: "crate" },
    { x: 1370, y: 1220, w: 44, h: 44, type: "crate" },
    { x: 590, y: 1240, w: 50, h: 50, type: "crate" },
    // rocks scattered
    { x: 380, y: 900, w: 80, h: 70, type: "rock" },
    { x: 1560, y: 1080, w: 90, h: 80, type: "rock" },
    { x: 800, y: 360, w: 70, h: 60, type: "rock" },
    { x: 1220, y: 1600, w: 85, h: 70, type: "rock" },
    { x: 300, y: 1500, w: 100, h: 90, type: "rock" },
    { x: 1680, y: 480, w: 95, h: 85, type: "rock" },
    { x: 500, y: 1640, w: 70, h: 60, type: "rock" },
    { x: 1500, y: 300, w: 80, h: 70, type: "rock" },
    // long fences forming lanes
    { x: 200, y: 600, w: 200, h: 16, type: "fence" },
    { x: 1600, y: 600, w: 200, h: 16, type: "fence" },
    { x: 200, y: 1400, w: 200, h: 16, type: "fence" },
    { x: 1600, y: 1400, w: 200, h: 16, type: "fence" },
    { x: 100, y: 800, w: 16, h: 200, type: "fence" },
    { x: 1884, y: 800, w: 16, h: 200, type: "fence" },
    // barrels
    { x: 550, y: 500, w: 28, h: 28, type: "barrel", hp: 50 },
    { x: 1450, y: 520, w: 28, h: 28, type: "barrel", hp: 50 },
    { x: 520, y: 1460, w: 28, h: 28, type: "barrel", hp: 50 },
    { x: 1470, y: 1490, w: 28, h: 28, type: "barrel", hp: 50 },
    { x: 750, y: 1370, w: 28, h: 28, type: "barrel", hp: 50 },
    { x: 1280, y: 620, w: 28, h: 28, type: "barrel", hp: 50 },
    // toxic barrels in cave
    { x: 200, y: 2150, w: 28, h: 28, type: "toxicBarrel", hp: 50 },
    { x: 1750, y: 2200, w: 28, h: 28, type: "toxicBarrel", hp: 50 },
    { x: 1000, y: 2400, w: 28, h: 28, type: "toxicBarrel", hp: 50 },
    // outer wall crates
    { x: 150, y: 1750, w: 60, h: 60, type: "crate" },
    { x: 1770, y: 1780, w: 55, h: 55, type: "crate" },
    // cave entrance and chamber at the bottom of the map
    { x: 40, y: 2000, w: 860, h: 32, type: "caveWall" },
    { x: 1100, y: 2000, w: 860, h: 32, type: "caveWall" },
    { x: 900, y: 2000, w: 200, h: 42, type: "door" },
    { x: 0, y: 2000, w: 40, h: 600, type: "caveWall" },
    { x: 1960, y: 2000, w: 40, h: 600, type: "caveWall" },
    { x: 0, y: 2560, w: 2000, h: 40, type: "caveWall" },
    // golf room entrance and chamber at the top of the map
    { x: 40, y: 418, w: 860, h: 32, type: "caveWall" },
    { x: 1100, y: 418, w: 860, h: 32, type: "caveWall" },
    { x: 900, y: 408, w: 200, h: 42, type: "golfDoor" },
    { x: 0, y: 0, w: 40, h: 450, type: "caveWall" },
    { x: 1960, y: 0, w: 40, h: 450, type: "caveWall" },
    { x: 0, y: 0, w: 2000, h: 40, type: "caveWall" },
  ],
  caveLights: [
    { x: 120, y: 2070 },
    { x: 1880, y: 2070 },
    { x: 120, y: 2522 },
    { x: 1880, y: 2522 },
    { x: 1000, y: 2090 },
  ],
  bossLava: [
    { x: 870, y: 950, w: 140, h: 70 },
    { x: 1040, y: 970, w: 150, h: 80 },
    { x: 940, y: 1070, w: 160, h: 75 },
    { x: 650, y: 880, w: 100, h: 120 },
    { x: 1250, y: 1060, w: 110, h: 130 },
  ],
};

// Convenience re-exports
export const MAP_W = DEFAULT_MAP.width;
export const MAP_H = DEFAULT_MAP.height;
export const SURFACE_CENTER_Y = DEFAULT_MAP.surfaceCenterY;
export const BOSS_ARENA_SIZE = DEFAULT_MAP.bossArenaSize;
export const CAVE_RECT = DEFAULT_MAP.cave.rect;
export const CAVE_ENTRY = DEFAULT_MAP.cave.entry;
export const CAVE_DOOR_COST = DEFAULT_MAP.cave.doorCost;
export const GENERATOR_POS = DEFAULT_MAP.cave.generatorPos;
export const GENERATOR_INTERACT_DISTANCE = DEFAULT_MAP.cave.generatorInteractDistance;
export const GENERATOR_HOLD_MS = DEFAULT_MAP.cave.generatorHoldMs;
export const CAVE_TOTEM_POS = DEFAULT_MAP.cave.totemPos;
export const FLASHLIGHT_CONE_ANGLE = DEFAULT_MAP.flashlight.coneAngle;
export const FLASHLIGHT_LENGTH = DEFAULT_MAP.flashlight.length;
export const GOLF_ROOM_RECT = DEFAULT_MAP.golfRoom.rect;
export const GOLF_ENTRY = DEFAULT_MAP.golfRoom.entry;
export const GOLF_DOOR_COST = DEFAULT_MAP.golfRoom.doorCost;
export const TORCH_POSITIONS = DEFAULT_MAP.torches.positions;
export const TORCH_LIGHT_RADIUS = DEFAULT_MAP.torches.lightRadius;
export const DOOR_HOLD_MS = DEFAULT_MAP.doorHoldMs;
export const REVIVE_HOLD_MS = DEFAULT_MAP.revive.holdMs;
export const REVIVE_HP = DEFAULT_MAP.revive.hp;

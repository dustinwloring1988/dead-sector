# Dead Sector

A round-based top-down zombie survival shooter. Fight endless waves of the undead, earn points, and upgrade your arsenal.

## About

Dead Sector is a browser-based top-down shooter inspired by Black Ops Zombies. Survive wave after wave, buy weapons, and hold the line. Playable on desktop and mobile with touch controls and haptics.

## Tech Stack

- **Framework:** React 19 + TanStack Start (SSR)
- **Build Tool:** Vite 8
- **Styling:** Tailwind CSS 4 + shadcn/ui
- **Language:** TypeScript
- **Package Manager:** Bun

## Getting Started

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Build for production
bun run build

# Preview production build
bun run preview
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start development server |
| `bun run build` | Build for production |
| `bun run build:dev` | Build in development mode |
| `bun run preview` | Preview production build |
| `bun run lint` | Run ESLint |
| `bun run format` | Format code with Prettier |

## Features

- Wave-based survival gameplay
- 5 unlockable weapons (Pistol, SMG, Shotgun, Battle Rifle, Heavy MG)
- 7 zombie types (Walkers, Runners, Brutes, Fire, Toxic, Fire Miniboss, Toxic Miniboss)
- Boss fight — "THE HARBINGER" with 2 phases and sprint attack
- Totem/easter egg progression system leading to the boss
- Generator puzzle — restore power to the cave
- Mini-golf mini-game in the golf room
- Cave system with flashlight and torch lighting mechanics
- Toxic gas and lava hazards
- Exploding barrels and environmental obstacles (rocks, crates, sandbag fences)
- Pickups (health, ammo)
- Rank system (S-RANK, A-RANK) based on completion time
- Stats tracking (kills, accuracy, time)
- 8-bit procedural sound engine (Web Audio API)
- Touch controls for mobile with haptics
- Points system for weapon purchases

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
- Multiple zombie types (Walkers, Runners, Brutes, Fire, Toxic)
- Cave system and golf room areas
- 8-bit procedural sound engine (Web Audio API)
- Touch controls for mobile
- Points system for weapon purchases

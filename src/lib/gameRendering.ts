import {
  MAP_W, MAP_H, SURFACE_CENTER_Y, BOSS_ARENA_SIZE,
  CAVE_RECT, CAVE_ENTRY, CAVE_DOOR_COST,
  GENERATOR_POS, GENERATOR_INTERACT_DISTANCE, GENERATOR_HOLD_MS,
  CAVE_TOTEM_POS, FLASHLIGHT_CONE_ANGLE, FLASHLIGHT_LENGTH,
  GOLF_ROOM_RECT, GOLF_ENTRY, GOLF_DOOR_COST,
  TORCH_POSITIONS, TORCH_LIGHT_RADIUS,
  DOOR_HOLD_MS, REVIVE_HOLD_MS, REVIVE_HP,
  DEFAULT_MAP,
} from "@/lib/mapData";
import type { GameSettings } from "@/hooks/use-settings";

export type RenderDeps = {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  s: any;
  settingsRef: React.MutableRefObject<GameSettings>;
  isInCave: (x: number, y: number) => boolean;
  isInFlashlight: (wx: number, wy: number) => boolean;
  WEAPONS: Record<string, any>;
};

export function createRenderer(deps: RenderDeps) {
  const { ctx, canvas, s, settingsRef, isInCave, isInFlashlight, WEAPONS } = deps;

  let _flashlightOc: HTMLCanvasElement | null = null;

  const caveLights = DEFAULT_MAP.caveLights;

  const golfLights = [
    { x: GOLF_ROOM_RECT.x + 120, y: GOLF_ROOM_RECT.y + 70 },
    { x: GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w - 120, y: GOLF_ROOM_RECT.y + 70 },
    { x: GOLF_ROOM_RECT.x + 120, y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 78 },
    { x: GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w - 120, y: GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 78 },
    { x: GOLF_ROOM_RECT.x + GOLF_ROOM_RECT.w / 2, y: GOLF_ROOM_RECT.y + 90 },
  ];

  function drawGrid() {
    if (!s.bossMode) {
      const vx0 = s.camera.x, vy0 = s.camera.y, vx1 = vx0 + canvas.width, vy1 = vy0 + canvas.height;
      for (const p of s.dirtPatches) {
        if (p.x + p.r < vx0 || p.y + p.r < vy0 || p.x - p.r > vx1 || p.y - p.r > vy1) continue;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.arc(p.x - s.camera.x, p.y - s.camera.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const g of s.grassTufts) {
        if (g.x < vx0 - 4 || g.y < vy0 - 4 || g.x > vx1 + 4 || g.y > vy1 + 4) continue;
        ctx.fillStyle = g.c;
        ctx.fillRect(g.x - s.camera.x, g.y - s.camera.y, 3, 3);
      }
    }
    ctx.strokeStyle = s.bossMode ? "#2a0808" : "#1a1f1a";
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

  function drawCaveArea() {
    const sx = CAVE_RECT.x - s.camera.x;
    const sy = CAVE_RECT.y - s.camera.y;
    if (sx > canvas.width || sy > canvas.height || sx + CAVE_RECT.w < 0 || sy + CAVE_RECT.h < 0) return;

    const cp = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
    const playerInCave = isInCave(cp.x, cp.y);
    const cavePower = !!s.generator?.active;
    const base = ctx.createLinearGradient(sx, sy, sx, sy + CAVE_RECT.h);
    base.addColorStop(0, playerInCave ? (cavePower ? "#1d1814" : "#090705") : "#020202");
    base.addColorStop(0.45, playerInCave ? (cavePower ? "#15100d" : "#050403") : "#010101");
    base.addColorStop(1, playerInCave ? (cavePower ? "#221b15" : "#030202") : "#000000");
    ctx.fillStyle = base;
    ctx.fillRect(sx, sy, CAVE_RECT.w, CAVE_RECT.h);

    if (!playerInCave) {
      ctx.fillStyle = "rgba(0,0,0,0.95)";
      ctx.fillRect(sx + 16, sy + 24, CAVE_RECT.w - 32, CAVE_RECT.h - 24);
      ctx.fillStyle = "rgba(20,16,12,0.95)";
      ctx.fillRect(sx, sy, CAVE_RECT.w, 42);
      ctx.fillRect(sx + 16, sy + 42, CAVE_RECT.w - 32, 20);
    }

    const specks = cavePower
      ? [
          [80, 80, 90], [180, 150, 70], [290, 310, 110], [480, 260, 80], [620, 120, 95],
          [120, 410, 120], [360, 460, 95], [560, 380, 120], [700, 470, 70],
        ]
      : [
          [70, 70, 110], [170, 160, 90], [300, 330, 130], [500, 240, 120], [660, 140, 130],
          [130, 420, 140], [380, 460, 115], [560, 380, 120], [700, 470, 90],
        ];
    if (playerInCave) {
      for (const [ox, oy, r] of specks) {
        ctx.fillStyle = cavePower ? "rgba(120,90,60,0.08)" : "rgba(80,60,40,0.12)";
        ctx.beginPath();
        ctx.arc(sx + ox, sy + oy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const entryX = CAVE_ENTRY.x - s.camera.x;
    ctx.fillStyle = playerInCave ? (cavePower ? "rgba(55,40,25,0.4)" : "rgba(25,18,12,0.65)") : "rgba(0,0,0,0.98)";
    ctx.fillRect(entryX, sy, CAVE_ENTRY.w, 42);
    ctx.fillStyle = playerInCave ? (cavePower ? "rgba(255,220,150,0.06)" : "rgba(255,220,150,0.03)") : "rgba(0,0,0,0)";
    ctx.fillRect(entryX, sy + 38, CAVE_ENTRY.w, 6);

    ctx.fillStyle = playerInCave ? (cavePower ? "rgba(35,25,18,0.75)" : "rgba(10,8,6,0.9)") : "rgba(0,0,0,1)";
    for (let i = 0; i < 9; i++) {
      const tx = entryX - 20 + i * 26;
      const height = 18 + ((i % 3) * 10);
      ctx.beginPath();
      ctx.moveTo(tx, sy);
      ctx.lineTo(tx + 13, sy + height);
      ctx.lineTo(tx + 26, sy);
      ctx.closePath();
      ctx.fill();
    }

    if (playerInCave && cavePower) {
      for (const light of caveLights) {
        const lx = light.x - s.camera.x;
        const ly = light.y - s.camera.y;
        const pulse = 0.7 + Math.sin(performance.now() / 260 + light.x * 0.01) * 0.3;
        const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 140);
        glow.addColorStop(0, `rgba(255,236,180,${0.35 * pulse})`);
        glow.addColorStop(0.5, `rgba(255,182,70,${0.18 * pulse})`);
        glow.addColorStop(1, "rgba(255,182,70,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(lx, ly, 140, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#3c2f1f";
        ctx.fillRect(lx - 3, ly - 12, 6, 24);
        ctx.fillStyle = "#ffd98a";
        ctx.beginPath();
        ctx.arc(lx, ly - 14, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGolfRoom() {
    const sx = GOLF_ROOM_RECT.x - s.camera.x;
    const sy = GOLF_ROOM_RECT.y - s.camera.y;
    if (sx > canvas.width || sy > canvas.height || sx + GOLF_ROOM_RECT.w < 0 || sy + GOLF_ROOM_RECT.h < 0) return;

    const base = ctx.createLinearGradient(sx, sy, sx, sy + GOLF_ROOM_RECT.h);
    base.addColorStop(0, "#1a3a1a");
    base.addColorStop(0.5, "#1e4a1e");
    base.addColorStop(1, "#1a3a1a");
    ctx.fillStyle = base;
    ctx.fillRect(sx, sy, GOLF_ROOM_RECT.w, GOLF_ROOM_RECT.h);

    if (!s.golfDoorOpened) {
      ctx.fillStyle = "rgba(0,0,0,0.92)";
      ctx.fillRect(sx + 16, sy, GOLF_ROOM_RECT.w - 32, GOLF_ROOM_RECT.h - 16);
    }

    const entryX = GOLF_ENTRY.x - s.camera.x;
    const entryY = sy + GOLF_ROOM_RECT.h - 42;
    ctx.fillStyle = s.golfDoorOpened ? "rgba(40,80,40,0.4)" : "rgba(0,0,0,0.98)";
    ctx.fillRect(entryX, entryY, GOLF_ENTRY.w, 42);

    for (const light of golfLights) {
      const lx = light.x - s.camera.x;
      const ly = light.y - s.camera.y;
      const pulse = 0.7 + Math.sin(performance.now() / 260 + light.x * 0.01) * 0.3;
      const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 140);
      glow.addColorStop(0, `rgba(255,236,180,${0.35 * pulse})`);
      glow.addColorStop(0.5, `rgba(255,182,70,${0.18 * pulse})`);
      glow.addColorStop(1, "rgba(255,182,70,0)");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(lx, ly, 140, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3c2f1f";
      ctx.fillRect(lx - 3, ly - 12, 6, 24);
      ctx.fillStyle = "#ffd98a";
      ctx.beginPath();
      ctx.arc(lx, ly - 14, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const h of s.golfHoles) {
      const hx = h.x - s.camera.x;
      const hy = h.y - s.camera.y;
      ctx.fillStyle = "#0a0a0a";
      ctx.beginPath();
      ctx.arc(hx, hy, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#aaa";
      ctx.fillRect(hx - 1, hy - 40, 2, 40);
      ctx.fillStyle = "#e03030";
      ctx.beginPath();
      ctx.moveTo(hx + 1, hy - 40);
      ctx.lineTo(hx + 14, hy - 34);
      ctx.lineTo(hx + 1, hy - 28);
      ctx.closePath();
      ctx.fill();
    }

    for (let bi = 0; bi < s.golfBalls.length; bi++) {
      const ball = s.golfBalls[bi];
      if (ball.hole >= 0) continue;
      const bx = ball.x - s.camera.x;
      const by = ball.y - s.camera.y;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.ellipse(bx + 2, by + 4, 10, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f0f0e8";
      ctx.beginPath();
      ctx.arc(bx, by, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#bbb";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "rgba(180,180,170,0.4)";
      for (let d = 0; d < 5; d++) {
        const da = (d / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(bx + Math.cos(da) * 4, by + Math.sin(da) * 4, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = "#666";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${bi + 1}`, bx, by + 3);
    }

    for (const tb of s.golfTargetBalls) {
      if (tb.spawned) continue;
      const tx = tb.x - s.camera.x;
      const ty = tb.y - s.camera.y;
      const isRed = tb.color === "red";
      const ballColor = isRed ? "#cc2200" : "#2244cc";
      const ballHighlight = isRed ? "#ff4422" : "#4488ff";
      const ballDark = isRed ? "#881100" : "#112288";
      ctx.fillStyle = "rgba(0,0,0,0.4)";
      ctx.beginPath();
      ctx.ellipse(tx + 2, ty + 4, 14, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      const bgrd = ctx.createRadialGradient(tx - 3, ty - 3, 1, tx, ty, 14);
      bgrd.addColorStop(0, ballHighlight);
      bgrd.addColorStop(0.7, ballColor);
      bgrd.addColorStop(1, ballDark);
      ctx.fillStyle = bgrd;
      ctx.beginPath();
      ctx.arc(tx, ty, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isRed ? "#661100" : "#112266";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(tx, ty, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = isRed ? "#cc2200" : "#2244cc";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.fillText(isRed ? "3" : "10", tx, ty + 3);
      const pulse = 0.3 + Math.sin(performance.now() * 0.004) * 0.15;
      const glowColor = isRed ? `rgba(255,40,20,${pulse})` : `rgba(40,80,255,${pulse})`;
      const ggrd = ctx.createRadialGradient(tx, ty, 10, tx, ty, 30);
      ggrd.addColorStop(0, glowColor);
      ggrd.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = ggrd;
      ctx.beginPath();
      ctx.arc(tx, ty, 30, 0, Math.PI * 2);
      ctx.fill();
    }

    if (s.golfDoorOpened && !s.golfCompleted) {
      const pdx = GOLF_ENTRY.x + GOLF_ENTRY.w / 2 - s.player.x;
      const pdy = GOLF_ROOM_RECT.y + GOLF_ROOM_RECT.h - 21 - s.player.y;
      if (pdx * pdx + pdy * pdy < 120 * 120) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillText("SHOOT BALLS INTO HOLES", sx + GOLF_ROOM_RECT.w / 2, sy + GOLF_ROOM_RECT.h - 55);
      }
    }
  }

  function drawGenerator() {
    const gen = s.generator;
    if (!gen) return;

    const sx = gen.x - s.camera.x;
    const sy = gen.y - s.camera.y;
    if (sx < -120 || sy < -120 || sx > canvas.width + 120 || sy > canvas.height + 120) return;

    const dg = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
    const dist = Math.hypot(dg.x - gen.x, dg.y - gen.y);
    const progress = gen.active ? 1 : Math.min(1, gen.progressMs / GENERATOR_HOLD_MS);
    const pulse = 0.65 + Math.sin(performance.now() / 180) * 0.35;

    ctx.save();
    ctx.translate(sx, sy);

    if (!gen.active && dist < 140) {
      ctx.shadowBlur = 18 * pulse;
      ctx.shadowColor = "#ff9a3a";
      ctx.fillStyle = `rgba(255, 140, 40, ${0.12 * pulse})`;
      ctx.beginPath();
      ctx.arc(0, 0, 80, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.fillStyle = gen.active ? "#234b2b" : "#26231f";
    ctx.fillRect(-28, -18, 56, 36);
    ctx.strokeStyle = gen.active ? "#67d77b" : "#6d6258";
    ctx.lineWidth = 2;
    ctx.strokeRect(-28, -18, 56, 36);
    ctx.fillStyle = gen.active ? "#67d77b" : "#ff6b2d";
    ctx.beginPath();
    ctx.arc(18, -8, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#1d1712";
    ctx.fillRect(-10, -32, 20, 14);
    ctx.strokeStyle = "#0d0907";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-10, -32, 20, 14);

    ctx.fillStyle = "#5d4f42";
    ctx.fillRect(-14, 18, 28, 24);
    ctx.fillRect(-3, 18, 6, 36);

    if (!gen.active) {
      ctx.beginPath();
      ctx.arc(0, 0, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.strokeStyle = "#ff9a3a";
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = "#f5d9a0";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`${Math.floor(progress * 100)}%`, 0, -36);
    } else {
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#67d77b";
      ctx.fillStyle = "rgba(103, 215, 123, 0.35)";
      ctx.beginPath();
      ctx.arc(0, 0, 44, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#b6ffbf";
      ctx.font = "bold 10px monospace";
      ctx.textAlign = "center";
      ctx.fillText("POWER ON", 0, -42);
    }

    ctx.restore();
  }

  function drawFlashlightOverlay() {
    const flashlights: { x: number; y: number; angle: number; r: number }[] = [];
    const localPlayer = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
    flashlights.push(localPlayer);
    if (s.gameMode === "split" && s.player2Alive) {
      const otherPlayer = s._vpIsP2 ? s.player : s.player2;
      flashlights.push(otherPlayer);
    }

    const activeFlashlights = flashlights.filter(fp => {
      const startY = CAVE_RECT.y + fp.r * 4;
      return (isInCave(fp.x, fp.y) || fp.y >= startY) && !s.generator?.active;
    });
    if (activeFlashlights.length === 0) return;

    const intensity = settingsRef.current.lightIntensity;
    const overlayAlpha = 0.95 * (1 - intensity * 0.75);
    const coneAlpha = 0.3 + intensity * 0.4;

    if (!_flashlightOc || _flashlightOc.width !== canvas.width || _flashlightOc.height !== canvas.height) {
      _flashlightOc = document.createElement("canvas");
      _flashlightOc.width = canvas.width;
      _flashlightOc.height = canvas.height;
    }
    const oc = _flashlightOc;
    const ocCtx = oc.getContext("2d")!;
    ocCtx.clearRect(0, 0, oc.width, oc.height);
    ocCtx.fillStyle = `rgba(0,0,0,${overlayAlpha})`;
    ocCtx.fillRect(0, 0, oc.width, oc.height);

    ocCtx.globalCompositeOperation = "destination-out";
    for (const fp of activeFlashlights) {
      const screenX = fp.x - s.camera.x;
      const screenY = fp.y - s.camera.y;
      const leftAngle = fp.angle - FLASHLIGHT_CONE_ANGLE / 2;
      const rightAngle = fp.angle + FLASHLIGHT_CONE_ANGLE / 2;
      ocCtx.fillStyle = "rgba(0,0,0,1)";
      ocCtx.beginPath();
      ocCtx.moveTo(screenX, screenY);
      ocCtx.lineTo(screenX + Math.cos(leftAngle) * FLASHLIGHT_LENGTH, screenY + Math.sin(leftAngle) * FLASHLIGHT_LENGTH);
      ocCtx.arc(screenX, screenY, FLASHLIGHT_LENGTH, leftAngle, rightAngle);
      ocCtx.closePath();
      ocCtx.fill();
    }
    ocCtx.globalCompositeOperation = "source-over";

    ctx.drawImage(oc, 0, 0);

    for (const fp of activeFlashlights) {
      const screenX = fp.x - s.camera.x;
      const screenY = fp.y - s.camera.y;
      const leftAngle = fp.angle - FLASHLIGHT_CONE_ANGLE / 2;
      const rightAngle = fp.angle + FLASHLIGHT_CONE_ANGLE / 2;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(screenX, screenY);
      ctx.lineTo(screenX + Math.cos(leftAngle) * FLASHLIGHT_LENGTH, screenY + Math.sin(leftAngle) * FLASHLIGHT_LENGTH);
      ctx.arc(screenX, screenY, FLASHLIGHT_LENGTH, leftAngle, rightAngle);
      ctx.closePath();
      ctx.clip();
      const coneGlow = ctx.createRadialGradient(screenX, screenY, 0, screenX, screenY, FLASHLIGHT_LENGTH);
      coneGlow.addColorStop(0, `rgba(255,250,220,${coneAlpha})`);
      coneGlow.addColorStop(0.55, "rgba(255,245,205,0.18)");
      coneGlow.addColorStop(1, "rgba(255,245,205,0)");
      ctx.fillStyle = coneGlow;
      ctx.beginPath();
      ctx.arc(screenX, screenY, FLASHLIGHT_LENGTH, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDecals() {
    for (const d of s.decals) {
      const sx = d.x - s.camera.x, sy = d.y - s.camera.y;
      if (sx + d.r < 0 || sy + d.r < 0 || sx - d.r > canvas.width || sy - d.r > canvas.height) continue;
      ctx.globalAlpha = d.alpha;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.arc(sx, sy, d.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + d.r;
        const rr = d.r * (0.7 + ((i * 37) % 10) / 30);
        ctx.beginPath();
        ctx.arc(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr, 3 + (i % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawMapBounds() {
    if (s.bossMode) {
      const cx = MAP_W / 2 - s.camera.x, cy = SURFACE_CENTER_Y - s.camera.y;
      const arenaHalf = BOSS_ARENA_SIZE / 2;
      const wallHalfX = MAP_W / 2;
      const wallHalfY = MAP_H / 2;
      const cliffW = 55;
      ctx.strokeStyle = "#1a0e05";
      ctx.lineWidth = 6;
      ctx.strokeRect(-s.camera.x, -s.camera.y, MAP_W, MAP_H);
      const sides: [number, number, number, number][] = [
        [cx - wallHalfX, cy - wallHalfY, wallHalfX * 2, cliffW],
        [cx - wallHalfX, cy + arenaHalf - cliffW + arenaHalf * 0, wallHalfX * 2, cliffW],
        [cx - wallHalfX, cy - arenaHalf, cliffW, arenaHalf * 2],
        [cx + arenaHalf - cliffW, cy - arenaHalf, cliffW, arenaHalf * 2],
      ];
      for (const [rx, ry, rw, rh] of sides) {
        const grd = ctx.createLinearGradient(rx, ry, rx + rw, ry + rh);
        grd.addColorStop(0, "#1a0e05");
        grd.addColorStop(0.5, "#2a1a0a");
        grd.addColorStop(1, "#1a0e05");
        ctx.fillStyle = grd;
        ctx.fillRect(rx, ry, rw, rh);
      }
      ctx.strokeStyle = "#4a3a20";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx - arenaHalf, cy - arenaHalf, arenaHalf * 2, arenaHalf * 2);
      ctx.strokeStyle = "#0d0702";
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - wallHalfX, cy - wallHalfY, wallHalfX * 2, wallHalfY * 2);
    } else {
      ctx.strokeStyle = "#3a2a1a";
      ctx.lineWidth = 8;
      ctx.strokeRect(-s.camera.x, -s.camera.y, MAP_W, MAP_H);
    }
  }

  function drawBuyStations() {
    for (const b of s.buyStations) {
      const sx = b.x - s.camera.x, sy = b.y - s.camera.y;
      if (sx < -100 || sy < -100 || sx > canvas.width + 100 || sy > canvas.height + 100) continue;
      if (!isInFlashlight(b.x, b.y)) continue;
      const w = WEAPONS[b.weapon];
      const owned = s.weapons[b.weapon]?.owned;
      const hasPower = !!s.generator?.active;
      const isCurrent = s.currentWeaponKey === b.weapon;
      ctx.fillStyle = "#2a1a0a";
      if (!hasPower) {
        ctx.strokeStyle = "#c93030";
      } else if (isCurrent) {
        ctx.strokeStyle = "#c9a24a";
      } else {
        ctx.strokeStyle = "#4a7c3a";
      }
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = hasPower ? "#c9a24a" : "#888";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(w.name.toUpperCase(), sx, sy - 5);
      if (hasPower) {
        ctx.fillStyle = owned ? "#7fbf5f" : "#e0e0e0";
        ctx.fillText(owned ? `REFILL ${Math.floor(w.cost * 0.5)}` : `${w.cost}`, sx, sy + 12);
      }
      const db = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
      const dx = b.x - db.x, dy = b.y - db.y;
      if (dx * dx + dy * dy < 100 * 100) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px monospace";
        ctx.fillText(hasPower ? "[E] BUY" : "POWER NEEDED", sx, sy - 55);
      }
    }
    for (const a of s.ammoBoxes) {
      const sx = a.x - s.camera.x, sy = a.y - s.camera.y;
      ctx.fillStyle = "#1a2a1a";
      ctx.strokeStyle = "#4a7c3a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#4a7c3a";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("AMMO", sx, sy - 3);
      ctx.fillText("500", sx, sy + 12);
      const da = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
      const dx = a.x - da.x, dy = a.y - da.y;
      if (dx * dx + dy * dy < 100 * 100) {
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px monospace";
        ctx.fillText("[E] REFILL", sx, sy - 45);
      }
    }
  }

  function drawBossAmmoBoxes() {
    for (const a of s.ammoBoxes) {
      const sx = a.x - s.camera.x, sy = a.y - s.camera.y;
      if (sx < -80 || sy < -80 || sx > canvas.width + 80 || sy > canvas.height + 80) continue;
      const pulse = 0.7 + Math.sin(performance.now() / 300) * 0.3;
      ctx.fillStyle = "#1a2a1a";
      ctx.strokeStyle = `rgba(74,124,58,${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#4a7c3a";
      ctx.font = "bold 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText("AMMO", sx, sy - 3);
      ctx.fillText("500", sx, sy + 12);
      const dab = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
      const dx = a.x - dab.x, dy = a.y - dab.y;
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

  function drawPlayerAt(
    px: number, py: number, angle: number, radius: number,
    walkPhaseVal: number, muzzleFlashVal: number, isP2: boolean,
  ) {
    const sx = px - s.camera.x, sy = py - s.camera.y;
    const bob = Math.sin(walkPhaseVal) * 1.5;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(sx + 3, sy + 6, radius + 2, (radius + 2) * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    const laserLen = 260;
    const grd = ctx.createLinearGradient(sx, sy, sx + Math.cos(angle) * laserLen, sy + Math.sin(angle) * laserLen);
    const laserColor = isP2 ? "rgba(70,150,255," : "rgba(255,80,60,";
    grd.addColorStop(0, laserColor + "0.55)");
    grd.addColorStop(1, laserColor + "0)");
    ctx.strokeStyle = grd;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(angle) * 22, sy + Math.sin(angle) * 22);
    ctx.lineTo(sx + Math.cos(angle) * laserLen, sy + Math.sin(angle) * laserLen);
    ctx.stroke();

    ctx.save();
    ctx.translate(sx, sy + bob);
    ctx.rotate(angle);
    if (muzzleFlashVal > 0.05) {
      const mf = muzzleFlashVal;
      const g2 = ctx.createRadialGradient(30, 0, 0, 30, 0, 26);
      g2.addColorStop(0, `rgba(255,230,140,${0.9 * mf})`);
      g2.addColorStop(0.4, `rgba(255,150,50,${0.5 * mf})`);
      g2.addColorStop(1, "rgba(255,120,20,0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(30, 0, 26, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#333";
    ctx.fillRect(8, -3, 22, 6);
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(28, -2, 4, 4);
    ctx.fillStyle = isP2 ? "#3a4a6a" : "#4a5a3a";
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = isP2 ? "#1a2a4a" : "#2a3a1a";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.beginPath();
    ctx.arc(-3, -4, radius * 0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = isP2 ? "#1a2a3a" : "#2a2a2a";
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(-2, -3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawPlayer() {
    if (s.player.hp > 0) {
      drawPlayerAt(s.player.x, s.player.y, s.player.angle, s.player.r, s.walkPhase, s.muzzleFlash, false);
    } else if (s.gameMode === "split" && s.player2Alive) {
      const sx = s.player.x - s.camera.x, sy = s.player.y - s.camera.y;
      ctx.fillStyle = "rgba(255,60,60,0.35)";
      ctx.beginPath();
      ctx.arc(sx, sy, s.player.r + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#aa3333";
      ctx.beginPath();
      ctx.arc(sx, sy, s.player.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#661a1a";
      ctx.lineWidth = 2;
      ctx.stroke();
      const dp = s.player2;
      const ddx = s.player.x - dp.x, ddy = s.player.y - dp.y;
      if (ddx * ddx + ddy * ddy < 110 * 110) {
        if (s._reviveHoldStart > 0 && s._reviveTarget === 1) {
          const progress = Math.min(1, (performance.now() - s._reviveHoldStart) / REVIVE_HOLD_MS);
          ctx.beginPath();
          ctx.arc(sx, sy, s.player.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
          ctx.strokeStyle = "#ff6666";
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.fillStyle = "#fff";
          ctx.font = "bold 11px monospace";
          ctx.textAlign = "center";
          ctx.fillText(`${Math.floor(progress * 100)}%`, sx, sy - s.player.r - 20);
        } else {
          ctx.fillStyle = "#ff6666";
          ctx.font = "bold 11px monospace";
          ctx.textAlign = "center";
          ctx.fillText("HOLD [Y] REVIVE", sx, sy - s.player.r - 12);
        }
      }
    }
    if (s.gameMode === "split") {
      if (s.player2Alive) {
        drawPlayerAt(s.player2.x, s.player2.y, s.player2.angle, s.player2.r, s.walkPhase2, s.muzzleFlash2, true);
      } else if (s.player.hp > 0) {
        const sx = s.player2.x - s.camera.x, sy = s.player2.y - s.camera.y;
        ctx.fillStyle = "rgba(70,150,255,0.35)";
        ctx.beginPath();
        ctx.arc(sx, sy, s.player2.r + 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#3366aa";
        ctx.beginPath();
        ctx.arc(sx, sy, s.player2.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#1a3366";
        ctx.lineWidth = 2;
        ctx.stroke();
        const dp = s.player;
        const ddx = s.player2.x - dp.x, ddy = s.player2.y - dp.y;
        if (ddx * ddx + ddy * ddy < 110 * 110) {
          if (s._reviveHoldStart > 0 && s._reviveTarget === 2) {
            const progress = Math.min(1, (performance.now() - s._reviveHoldStart) / REVIVE_HOLD_MS);
            ctx.beginPath();
            ctx.arc(sx, sy, s.player2.r + 10, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.strokeStyle = "#66aaff";
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.font = "bold 11px monospace";
            ctx.textAlign = "center";
            ctx.fillText(`${Math.floor(progress * 100)}%`, sx, sy - s.player2.r - 20);
          } else {
            ctx.fillStyle = "#66aaff";
            ctx.font = "bold 11px monospace";
            ctx.textAlign = "center";
            ctx.fillText("HOLD [E] REVIVE", sx, sy - s.player2.r - 12);
          }
        }
      }
    }
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
      } else if (o.type === "caveWall") {
        const grd = ctx.createLinearGradient(sx, sy, sx + o.w, sy + o.h);
        grd.addColorStop(0, "#19130f");
        grd.addColorStop(0.55, "#2d231a");
        grd.addColorStop(1, "#100c09");
        ctx.fillStyle = grd;
        ctx.fillRect(sx, sy, o.w, o.h);
        ctx.strokeStyle = "rgba(255, 220, 160, 0.08)";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx, sy, o.w, o.h);
        ctx.fillStyle = "rgba(255, 220, 160, 0.05)";
        for (let i = 0; i < 4; i++) {
          const rx = sx + 10 + i * (o.w / 4);
          const ry = sy + 8 + ((i % 2) * 6);
          ctx.beginPath();
          ctx.arc(rx, ry, 6 + (i % 3), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (o.type === "door") {
        const frame = ctx.createLinearGradient(sx, sy, sx, sy + o.h);
        frame.addColorStop(0, "#4a341f");
        frame.addColorStop(0.5, "#2e2012");
        frame.addColorStop(1, "#1a120a");
        ctx.fillStyle = frame;
        ctx.fillRect(sx, sy, o.w, o.h);
        ctx.strokeStyle = "#7b5a33";
        ctx.lineWidth = 3;
        ctx.strokeRect(sx, sy, o.w, o.h);
        ctx.fillStyle = "#927047";
        ctx.fillRect(sx + 8, sy + 6, o.w - 16, o.h - 12);
        ctx.strokeStyle = "#3a2817";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 8, sy + 6, o.w - 16, o.h - 12);
        for (let i = 1; i < 4; i++) {
          const px = sx + (o.w / 4) * i;
          ctx.beginPath();
          ctx.moveTo(px, sy + 8);
          ctx.lineTo(px, sy + o.h - 8);
          ctx.stroke();
        }
        ctx.fillStyle = "#d8b56a";
        ctx.beginPath();
        ctx.arc(sx + o.w - 18, sy + o.h / 2, 4, 0, Math.PI * 2);
        ctx.fill();
        const dp = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
        const dx = o.x + o.w / 2 - dp.x, dy = o.y + o.h / 2 - dp.y;
        if (dx * dx + dy * dy < 110 * 110) {
          const remaining = CAVE_DOOR_COST - (o.paid || 0);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px monospace";
          ctx.textAlign = "center";
          ctx.fillText(`[E] OPEN ${remaining}`, sx + o.w / 2, sy - 10);
          if (s.gameMode === "split") {
            ctx.fillStyle = "#ccc";
            ctx.font = "bold 9px monospace";
            ctx.fillText(`HOLD [E] PAY HALF`, sx + o.w / 2, sy - 22);
          }
        }
      } else if (o.type === "golfDoor") {
        const frame = ctx.createLinearGradient(sx, sy, sx, sy + o.h);
        frame.addColorStop(0, "#2a4a2a");
        frame.addColorStop(0.5, "#1a3a1a");
        frame.addColorStop(1, "#0a2a0a");
        ctx.fillStyle = frame;
        ctx.fillRect(sx, sy, o.w, o.h);
        ctx.strokeStyle = "#4a8a4a";
        ctx.lineWidth = 3;
        ctx.strokeRect(sx, sy, o.w, o.h);
        ctx.fillStyle = "#5aaa5a";
        ctx.fillRect(sx + 8, sy + 6, o.w - 16, o.h - 12);
        ctx.strokeStyle = "#2a5a2a";
        ctx.lineWidth = 2;
        ctx.strokeRect(sx + 8, sy + 6, o.w - 16, o.h - 12);
        for (let i = 1; i < 4; i++) {
          const px = sx + (o.w / 4) * i;
          ctx.beginPath();
          ctx.moveTo(px, sy + 8);
          ctx.lineTo(px, sy + o.h - 8);
          ctx.stroke();
        }
        ctx.fillStyle = "#a0d8a0";
        ctx.beginPath();
        ctx.arc(sx + o.w - 18, sy + o.h / 2, 4, 0, Math.PI * 2);
        ctx.fill();
        const dp2 = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
        const dx2 = o.x + o.w / 2 - dp2.x, dy2 = o.y + o.h / 2 - dp2.y;
        if (dx2 * dx2 + dy2 * dy2 < 110 * 110) {
          const remaining = GOLF_DOOR_COST - (o.paid || 0);
          ctx.fillStyle = "#fff";
          ctx.font = "bold 12px monospace";
          ctx.textAlign = "center";
          ctx.fillText(`[E] OPEN ${remaining}`, sx + o.w / 2, sy - 10);
          if (s.gameMode === "split") {
            ctx.fillStyle = "#ccc";
            ctx.font = "bold 9px monospace";
            ctx.fillText(`HOLD [E] PAY HALF`, sx + o.w / 2, sy - 22);
          }
        }
      } else if (o.type === "barrel" || (o.type === "toxicBarrel" && isInFlashlight(o.x + o.w / 2, o.y + o.h / 2))) {
        const cx = sx + o.w / 2, cy = sy + o.h / 2, r = o.w / 2;
        const hpRatio = o.hp !== undefined ? Math.max(0, o.hp / 50) : 1;
        if (o.type === "toxicBarrel") {
          const cr = Math.round(20 * hpRatio + 10 * (1 - hpRatio));
          const cg = Math.round(120 * hpRatio + 30 * (1 - hpRatio));
          const cb = Math.round(20 * hpRatio + 10 * (1 - hpRatio));
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#0a2a0a";
          ctx.lineWidth = 2; ctx.stroke();
          const pulse = 0.4 + Math.sin(performance.now() * 0.005) * 0.2;
          const tgrd = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r * 1.8);
          tgrd.addColorStop(0, `rgba(50,200,50,${0.3 * pulse})`);
          tgrd.addColorStop(1, "rgba(30,120,30,0)");
          ctx.fillStyle = tgrd;
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.8, 0, Math.PI * 2); ctx.fill();
          if (hpRatio < 0.7) {
            ctx.strokeStyle = hpRatio < 0.4 ? "#ff3300" : "#33cc33";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.strokeStyle = "#1a4a1a";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
          ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
          ctx.stroke();
        } else {
          const cr = Math.round(122 * hpRatio + 30 * (1 - hpRatio));
          const cg = Math.round(42 * hpRatio);
          const cb = Math.round(26 * hpRatio);
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#2a0a05";
          ctx.lineWidth = 2; ctx.stroke();
          if (hpRatio < 0.7) {
            ctx.strokeStyle = hpRatio < 0.4 ? "#ff3300" : "#cc6600";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.arc(cx, cy, r + 2, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.strokeStyle = "#4a1a0a";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2);
          ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
          ctx.stroke();
        }
      }
    }
  }

  function drawZombies() {
    const now = performance.now() / 1000;
    for (const z of s.zombies) {
      const sx = z.x - s.camera.x, sy = z.y - s.camera.y;
      if (sx < -50 || sy < -50 || sx > canvas.width + 50 || sy > canvas.height + 50) continue;
      const basicZombie = z.type === "walker" || z.type === "runner" || z.type === "brute";
      const basicLit = !basicZombie || isInFlashlight(z.x, z.y);
      if (basicLit) {
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.beginPath();
        ctx.ellipse(sx + 3, sy + z.radius * 0.5, z.radius + 2, (z.radius + 2) * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      const bob = Math.sin(now * 5 + (z.x + z.y) * 0.01) * 1.5;
      const cy = sy + bob;
      if (z.type === "fire") {
        const fpulse = 0.5 + Math.sin(now * 8) * 0.3;
        const fgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 2.5);
        fgrd.addColorStop(0, `rgba(255,120,20,${0.35 * fpulse})`);
        fgrd.addColorStop(0.5, `rgba(255,60,0,${0.15 * fpulse})`);
        fgrd.addColorStop(1, "rgba(200,30,0,0)");
        ctx.fillStyle = fgrd;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#5a1a0a";
        ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.fill();
        for (let fi = 0; fi < 5; fi++) {
          const fa = (fi / 5) * Math.PI * 2 + now * 3;
          const fr = z.radius * 0.5 + Math.sin(now * 10 + fi) * 3;
          const fx = sx + Math.cos(fa) * fr * 0.6;
          const fy = cy - z.radius * 0.6 + Math.sin(now * 8 + fi * 2) * 4;
          ctx.fillStyle = fi % 2 === 0 ? `rgba(255,180,40,${0.6 + fpulse * 0.3})` : `rgba(255,100,20,${0.5 + fpulse * 0.2})`;
          ctx.beginPath(); ctx.moveTo(fx - 3, fy + 4); ctx.quadraticCurveTo(fx, fy - 8 + Math.sin(now * 12 + fi) * 3, fx + 3, fy + 4); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = "#ff6600"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.stroke();
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.4); const ey = Math.sin(ang) * (z.radius * 0.4);
        const perpX = -Math.sin(ang) * 4, perpY = Math.cos(ang) * 4;
        const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 10);
        eglow.addColorStop(0, "rgba(255,200,40,0.8)"); eglow.addColorStop(1, "rgba(255,100,0,0)");
        ctx.fillStyle = eglow; ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ffcc00"; ctx.beginPath();
        ctx.arc(sx + ex + perpX, cy + ey + perpY, 2.5, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, cy + ey - perpY, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (z.type === "toxic") {
        const tpulse = 0.5 + Math.sin(now * 7) * 0.3;
        const tgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 2.5);
        tgrd.addColorStop(0, `rgba(50,200,50,${0.3 * tpulse})`);
        tgrd.addColorStop(0.5, `rgba(30,160,30,${0.12 * tpulse})`);
        tgrd.addColorStop(1, "rgba(20,120,20,0)");
        ctx.fillStyle = tgrd;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius * 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#1a4a1a"; ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.fill();
        for (let bi = 0; bi < 4; bi++) {
          const ba = (bi / 4) * Math.PI * 2 + now * 2;
          const br = z.radius * 0.4 + Math.sin(now * 6 + bi) * 2;
          const bx = sx + Math.cos(ba) * br; const by = cy + Math.sin(ba) * br;
          ctx.fillStyle = `rgba(100,255,100,${0.4 + tpulse * 0.2})`;
          ctx.beginPath(); ctx.arc(bx, by, 2 + Math.sin(now * 9 + bi) * 1, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = "#33cc33"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.stroke();
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.4); const ey = Math.sin(ang) * (z.radius * 0.4);
        const perpX = -Math.sin(ang) * 4, perpY = Math.cos(ang) * 4;
        const tglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 10);
        tglow.addColorStop(0, "rgba(100,255,100,0.8)"); tglow.addColorStop(1, "rgba(50,200,50,0)");
        ctx.fillStyle = tglow; ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 10, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#66ff66"; ctx.beginPath();
        ctx.arc(sx + ex + perpX, cy + ey + perpY, 2.5, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, cy + ey - perpY, 2.5, 0, Math.PI * 2); ctx.fill();
      } else if (z.type === "fireMiniboss") {
        const fpulse = 0.6 + Math.sin(now * 10) * 0.4;
        const fgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 3.0);
        fgrd.addColorStop(0, `rgba(255,80,0,${0.5 * fpulse})`);
        fgrd.addColorStop(0.4, `rgba(255,40,0,${0.25 * fpulse})`);
        fgrd.addColorStop(1, "rgba(200,20,0,0)");
        ctx.fillStyle = fgrd;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius * 3.0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#3a0a02"; ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.fill();
        const igrd = ctx.createRadialGradient(sx, cy, 0, sx, cy, z.radius * 0.7);
        igrd.addColorStop(0, `rgba(255,120,20,${0.4 * fpulse})`);
        igrd.addColorStop(1, "rgba(200,40,0,0)");
        ctx.fillStyle = igrd; ctx.beginPath(); ctx.arc(sx, cy, z.radius * 0.7, 0, Math.PI * 2); ctx.fill();
        for (let fi = 0; fi < 8; fi++) {
          const fa = (fi / 8) * Math.PI * 2 + now * 4;
          const fr = z.radius * 0.6 + Math.sin(now * 12 + fi) * 4;
          const fx = sx + Math.cos(fa) * fr * 0.6;
          const fy = cy - z.radius * 0.7 + Math.sin(now * 10 + fi * 2) * 5;
          ctx.fillStyle = fi % 2 === 0 ? `rgba(255,160,30,${0.7 + fpulse * 0.2})` : `rgba(255,60,10,${0.6 + fpulse * 0.2})`;
          ctx.beginPath(); ctx.moveTo(fx - 4, fy + 5); ctx.quadraticCurveTo(fx, fy - 12 + Math.sin(now * 14 + fi) * 4, fx + 4, fy + 5); ctx.closePath(); ctx.fill();
        }
        ctx.strokeStyle = "#ff4400"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(255,100,0,${0.3 + fpulse * 0.3})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius + 4, 0, Math.PI * 2); ctx.stroke();
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.4); const ey = Math.sin(ang) * (z.radius * 0.4);
        const perpX = -Math.sin(ang) * 5, perpY = Math.cos(ang) * 5;
        const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 14);
        eglow.addColorStop(0, "rgba(255,100,20,0.9)"); eglow.addColorStop(1, "rgba(255,40,0,0)");
        ctx.fillStyle = eglow; ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff6600"; ctx.beginPath();
        ctx.arc(sx + ex + perpX, cy + ey + perpY, 3, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, cy + ey - perpY, 3, 0, Math.PI * 2); ctx.fill();
        const barW = z.radius * 2.4; const barH = 5; const barX = sx - barW / 2; const barY = sy - z.radius - 16;
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = "#4a0a0a"; ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = "#ff3300"; ctx.fillRect(barX, barY, barW * (z.hp / z.maxHp), barH);
        ctx.fillStyle = "#ffcc00"; ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
        ctx.fillText("MINIBOSS", sx, barY - 4);
      } else if (z.type === "toxicMiniboss") {
        const tpulse = 0.6 + Math.sin(now * 9) * 0.4;
        const tgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 3.0);
        tgrd.addColorStop(0, `rgba(40,220,40,${0.45 * tpulse})`);
        tgrd.addColorStop(0.4, `rgba(20,160,20,${0.2 * tpulse})`);
        tgrd.addColorStop(1, "rgba(10,100,10,0)");
        ctx.fillStyle = tgrd;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius * 3.0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#0a3a0a"; ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.fill();
        const igrd = ctx.createRadialGradient(sx, cy, 0, sx, cy, z.radius * 0.7);
        igrd.addColorStop(0, `rgba(60,200,60,${0.35 * tpulse})`);
        igrd.addColorStop(1, "rgba(20,120,20,0)");
        ctx.fillStyle = igrd; ctx.beginPath(); ctx.arc(sx, cy, z.radius * 0.7, 0, Math.PI * 2); ctx.fill();
        for (let bi = 0; bi < 6; bi++) {
          const ba = (bi / 6) * Math.PI * 2 + now * 2.5;
          const br = z.radius * 0.5 + Math.sin(now * 7 + bi) * 3;
          const bx = sx + Math.cos(ba) * br; const by = cy + Math.sin(ba) * br;
          ctx.fillStyle = `rgba(100,255,100,${0.5 + tpulse * 0.2})`;
          ctx.beginPath(); ctx.arc(bx, by, 3 + Math.sin(now * 10 + bi) * 1.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.strokeStyle = "#33cc33"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `rgba(50,200,50,${0.3 + tpulse * 0.3})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius + 4, 0, Math.PI * 2); ctx.stroke();
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.4); const ey = Math.sin(ang) * (z.radius * 0.4);
        const perpX = -Math.sin(ang) * 5, perpY = Math.cos(ang) * 5;
        const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 14);
        eglow.addColorStop(0, "rgba(80,255,80,0.9)"); eglow.addColorStop(1, "rgba(30,160,30,0)");
        ctx.fillStyle = eglow; ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#66ff66"; ctx.beginPath();
        ctx.arc(sx + ex + perpX, cy + ey + perpY, 3, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, cy + ey - perpY, 3, 0, Math.PI * 2); ctx.fill();
        const barW = z.radius * 2.4; const barH = 5; const barX = sx - barW / 2; const barY = sy - z.radius - 16;
        ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
        ctx.fillStyle = "#0a3a0a"; ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = "#33cc33"; ctx.fillRect(barX, barY, barW * (z.hp / z.maxHp), barH);
        ctx.fillStyle = "#88ff88"; ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
        ctx.fillText("TOXIC MINIBOSS", sx, barY - 4);
      } else if (z.type === "ghost") {
        const ghostPulse = 0.4 + Math.sin(now * 4 + z.x * 0.01) * 0.2;
        const ggrd = ctx.createRadialGradient(sx, cy, z.radius * 0.2, sx, cy, z.radius * 2.2);
        ggrd.addColorStop(0, `rgba(150,200,255,${0.3 * ghostPulse})`);
        ggrd.addColorStop(0.5, `rgba(100,150,220,${0.12 * ghostPulse})`);
        ggrd.addColorStop(1, "rgba(80,120,200,0)");
        ctx.fillStyle = ggrd;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(180,210,255,${0.35 + ghostPulse * 0.15})`;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(220,240,255,${0.2 + ghostPulse * 0.1})`;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(150,200,255,${0.5 + ghostPulse * 0.2})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.stroke();
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.35); const ey = Math.sin(ang) * (z.radius * 0.35);
        const perpX = -Math.sin(ang) * 3, perpY = Math.cos(ang) * 3;
        const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 8);
        eglow.addColorStop(0, "rgba(200,230,255,0.9)"); eglow.addColorStop(1, "rgba(100,150,220,0)");
        ctx.fillStyle = eglow; ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ddeeff"; ctx.beginPath();
        ctx.arc(sx + ex + perpX, cy + ey + perpY, 2, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, cy + ey - perpY, 2, 0, Math.PI * 2); ctx.fill();
      } else if (z.type === "underworld") {
        const uwPulse = 0.4 + Math.sin(now * 4 + z.x * 0.01) * 0.2;
        const uwgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.2, sx, cy, z.radius * 2.2);
        uwgrd.addColorStop(0, `rgba(160,80,255,${0.3 * uwPulse})`);
        uwgrd.addColorStop(0.5, `rgba(120,50,220,${0.12 * uwPulse})`);
        uwgrd.addColorStop(1, "rgba(90,30,200,0)");
        ctx.fillStyle = uwgrd;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(180,130,255,${0.35 + uwPulse * 0.15})`;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(220,180,255,${0.2 + uwPulse * 0.1})`;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(150,100,255,${0.5 + uwPulse * 0.2})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.stroke();
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.35); const ey = Math.sin(ang) * (z.radius * 0.35);
        const perpX = -Math.sin(ang) * 3, perpY = Math.cos(ang) * 3;
        const eglow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 8);
        eglow.addColorStop(0, "rgba(200,150,255,0.9)"); eglow.addColorStop(1, "rgba(120,50,220,0)");
        ctx.fillStyle = eglow; ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#eeccff"; ctx.beginPath();
        ctx.arc(sx + ex + perpX, cy + ey + perpY, 2, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, cy + ey - perpY, 2, 0, Math.PI * 2); ctx.fill();
      } else if (z.type === "redPoolMiniboss" || z.type === "bluePoolMiniboss") {
        const isRed = z.type === "redPoolMiniboss";
        const mainColor = isRed ? "#cc2200" : "#2244cc";
        const glowColor = isRed ? "rgba(255,40,20," : "rgba(40,80,255,";
        const eyeColor = isRed ? "#ff4422" : "#4488ff";
        const ppulse = 0.5 + Math.sin(now * 8) * 0.3;
        const pgrd = ctx.createRadialGradient(sx, cy, z.radius * 0.3, sx, cy, z.radius * 3.0);
        pgrd.addColorStop(0, `${glowColor}${(0.45 * ppulse)})`);
        pgrd.addColorStop(0.4, `${glowColor}${(0.2 * ppulse)})`);
        pgrd.addColorStop(1, `${glowColor}0)`);
        ctx.fillStyle = pgrd;
        ctx.beginPath(); ctx.arc(sx, cy, z.radius * 3.0, 0, Math.PI * 2); ctx.fill();
        const bgrd = ctx.createRadialGradient(sx - 3, sy - 3, 1, sx, sy, z.radius);
        bgrd.addColorStop(0, isRed ? "#ff4422" : "#4488ff");
        bgrd.addColorStop(0.7, mainColor);
        bgrd.addColorStop(1, isRed ? "#881100" : "#112288");
        ctx.fillStyle = bgrd;
        ctx.beginPath(); ctx.arc(sx, sy, z.radius, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(sx, sy, z.radius * 0.35, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = mainColor; ctx.font = "bold 10px monospace"; ctx.textAlign = "center";
        ctx.fillText(isRed ? "3" : "10", sx, sy + 4);
        ctx.strokeStyle = isRed ? "#ff4422" : "#4488ff"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(sx, sy, z.radius, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = `${glowColor}${(0.3 + ppulse * 0.3)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(sx, sy, z.radius + 4, 0, Math.PI * 2); ctx.stroke();
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.35); const ey = Math.sin(ang) * (z.radius * 0.35);
        const perpX = -Math.sin(ang) * 4, perpY = Math.cos(ang) * 4;
        const egrd = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 8);
        egrd.addColorStop(0, `${eyeColor}cc`); egrd.addColorStop(1, `${eyeColor}00`);
        ctx.fillStyle = egrd; ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = eyeColor; ctx.beginPath();
        ctx.arc(sx + ex + perpX, cy + ey + perpY, 2.5, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, cy + ey - perpY, 2.5, 0, Math.PI * 2); ctx.fill();
        const barW = z.radius * 2.4; const barH = 5;
        ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(sx - barW / 2, sy - z.radius - 18, barW, barH);
        ctx.fillStyle = isRed ? "#ff3322" : "#3366ff"; ctx.fillRect(sx - barW / 2, sy - z.radius - 18, barW * (z.hp / z.maxHp), barH);
        ctx.fillStyle = "#fff"; ctx.font = "bold 9px monospace"; ctx.textAlign = "center";
        ctx.fillText(isRed ? "RED BALL" : "BLUE BALL", sx, sy - z.radius - 22);
      } else {
        const litByFlashlight = isInFlashlight(z.x, z.y);
        if (litByFlashlight) {
          const color = z.type === "brute" ? "#3a1a1a" : z.type === "runner" ? "#4a3a1a" : "#3a3a2a";
          ctx.fillStyle = color; ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "rgba(120,20,20,0.35)"; ctx.beginPath(); ctx.arc(sx - z.radius * 0.4, cy - z.radius * 0.3, z.radius * 0.45, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#7a0d0d"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, cy, z.radius, 0, Math.PI * 2); ctx.stroke();
        }
        const ang = Math.atan2(s.player.y - z.y, s.player.x - z.x);
        const ex = Math.cos(ang) * (z.radius * 0.4); const ey = Math.sin(ang) * (z.radius * 0.4);
        const perpX = -Math.sin(ang) * 4, perpY = Math.cos(ang) * 4;
        const glow = ctx.createRadialGradient(sx + ex, cy + ey, 0, sx + ex, cy + ey, 8);
        glow.addColorStop(0, "rgba(255,60,60,0.6)"); glow.addColorStop(1, "rgba(255,60,60,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx + ex, cy + ey, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#ff3030"; ctx.beginPath();
        ctx.arc(sx + ex + perpX, cy + ey + perpY, 2, 0, Math.PI * 2);
        ctx.arc(sx + ex - perpX, cy + ey - perpY, 2, 0, Math.PI * 2); ctx.fill();
      }
      if (z.hp < z.maxHp && basicLit) {
        ctx.fillStyle = "#000"; ctx.fillRect(sx - z.radius, sy - z.radius - 8, z.radius * 2, 4);
        ctx.fillStyle = z.type === "fire" || z.type === "fireMiniboss" ? "#ff6600" : z.type === "toxic" || z.type === "toxicMiniboss" ? "#33cc33" : z.type === "ghost" ? "#8ab4f8" : z.type === "underworld" ? "#aa66ff" : z.type === "redPoolMiniboss" ? "#ff3322" : z.type === "bluePoolMiniboss" ? "#3366ff" : "#c93030";
        ctx.fillRect(sx - z.radius, sy - z.radius - 8, (z.radius * 2) * (z.hp / z.maxHp), 4);
      }
    }
  }

  function drawToxicGas() {
    const now = performance.now() / 1000;
    for (const g of s.toxicGas) {
      const sx = g.x - s.camera.x, sy = g.y - s.camera.y;
      if (sx < -100 || sy < -100 || sx > canvas.width + 100 || sy > canvas.height + 100) continue;
      const alpha = (g.life / g.maxLife) * 0.45;
      const pulse = 0.8 + Math.sin(now * 5) * 0.2;
      const grd = ctx.createRadialGradient(sx, sy, g.radius * 0.2, sx, sy, g.radius);
      grd.addColorStop(0, `rgba(50,200,50,${alpha * pulse})`);
      grd.addColorStop(0.4, `rgba(30,160,30,${alpha * pulse * 0.6})`);
      grd.addColorStop(1, "rgba(20,120,20,0)");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(sx, sy, g.radius, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + now * 1.5;
        const r = g.radius * 0.35 + Math.sin(now * 4 + i * 2) * g.radius * 0.15;
        const px = sx + Math.cos(a) * r; const py = sy + Math.sin(a) * r;
        ctx.fillStyle = `rgba(100,255,100,${alpha * 0.5})`;
        ctx.beginPath(); ctx.arc(px, py, 4 + Math.sin(now * 7 + i) * 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawToxicProjectiles() {
    const now = performance.now() / 1000;
    for (const p of s.toxicProjectiles) {
      const sx = p.x - s.camera.x, sy = p.y - s.camera.y;
      if (sx < -30 || sy < -30 || sx > canvas.width + 30 || sy > canvas.height + 30) continue;
      const pulse = 0.7 + Math.sin(now * 10) * 0.3;
      const grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 10);
      grd.addColorStop(0, `rgba(80,255,80,${pulse})`);
      grd.addColorStop(0.5, `rgba(40,180,40,${pulse * 0.6})`);
      grd.addColorStop(1, "rgba(20,120,20,0)");
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.arc(sx, sy, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(60,220,60,${pulse})`;
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBullets() {
    for (const b of s.bullets) {
      const sx = b.x - s.camera.x, sy = b.y - s.camera.y;
      const tlen = 14;
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const tx = sx - (b.vx / speed) * tlen;
      const ty = sy - (b.vy / speed) * tlen;
      const grad = ctx.createLinearGradient(tx, ty, sx, sy);
      grad.addColorStop(0, "rgba(255,220,80,0)");
      grad.addColorStop(1, "rgba(255,240,160,0.95)");
      ctx.strokeStyle = grad; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(sx, sy); ctx.stroke();
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 6);
      g.addColorStop(0, "rgba(255,240,160,1)"); g.addColorStop(1, "rgba(255,180,50,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
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
    const intensity = settingsRef.current.lightIntensity;
    const fogAlpha = 0.85 * (1 - intensity * 0.8);
    const grad = ctx.createRadialGradient(
      canvas.width / 2, canvas.height / 2, 100,
      canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) * 0.7
    );
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, `rgba(0,0,0,${fogAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawMessage() {
    if (performance.now() < s.messageUntil && s.message) {
      if (s.gameMode === "split") {
        if (s.messageTarget !== 0 && s.messageTarget !== (s._vpIsP2 ? 2 : 1)) return;
      }
      const cx = s.gameMode === "split" ? canvas.width / 4 : canvas.width / 2;
      const fontSize = s.gameMode === "split" ? 36 : 48;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.font = `bold ${fontSize}px 'Courier New', monospace`;
      ctx.textAlign = "center";
      ctx.fillText(s.message, cx + 2, canvas.height / 2 - 100 + 2);
      ctx.fillStyle = "#c9a24a";
      ctx.fillText(s.message, cx, canvas.height / 2 - 100);
    }
  }

  function drawHitFlash() {
    if (s.hitFlash > 0.01) {
      ctx.fillStyle = `rgba(200,20,20,${s.hitFlash * 0.4})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function drawJumpscare() {
    const until = s.jumpscareUntil;
    if (!until) return;
    const now = performance.now();
    const remaining = until - now;
    if (remaining <= 0) return;
    const elapsed = 1500 - remaining;
    const progress = elapsed / 1500;

    s.camera.shake = Math.max(s.camera.shake, 16 * Math.max(0, 1 - progress * 1.2));

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    if (elapsed < 100) {
      ctx.fillStyle = `rgba(255, 255, 255, ${1 - elapsed / 100})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      return;
    }

    const flicker = Math.random() < 0.2 ? 0.95 : 0.65;
    ctx.fillStyle = `rgba(60, 0, 0, ${flicker * (1 - progress * 0.3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (Math.random() < 0.08) {
      ctx.fillStyle = `rgba(255, 255, 255, 0.2)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    const eyeSpacing = 55;
    const eyeY = cy - 35;
    const eyeSize = 20 + Math.sin(elapsed * 0.03) * 5;

    ctx.fillStyle = `rgba(255, 0, 0, ${flicker})`;
    ctx.beginPath(); ctx.ellipse(cx - eyeSpacing, eyeY, eyeSize, eyeSize * 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(0, 0, 0, ${flicker})`;
    ctx.beginPath(); ctx.ellipse(cx - eyeSpacing, eyeY + 2, eyeSize * 0.35, eyeSize * 0.55, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = `rgba(255, 0, 0, ${flicker})`;
    ctx.beginPath(); ctx.ellipse(cx + eyeSpacing, eyeY, eyeSize, eyeSize * 1.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(0, 0, 0, ${flicker})`;
    ctx.beginPath(); ctx.ellipse(cx + eyeSpacing, eyeY + 2, eyeSize * 0.35, eyeSize * 0.55, 0, 0, Math.PI * 2); ctx.fill();

    ctx.strokeStyle = `rgba(255, 0, 0, ${flicker * 0.9})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - 85, cy + 40);
    const teeth = 10;
    for (let i = 0; i <= teeth; i++) {
      const tx = cx - 85 + (170 / teeth) * i;
      const ty = cy + 40 + (i % 2 === 0 ? 0 : 22 + Math.sin(elapsed * 0.01 + i) * 8);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();

    ctx.fillStyle = `rgba(0, 0, 0, 0.12)`;
    for (let y = 0; y < canvas.height; y += 4) {
      ctx.fillRect(0, y, canvas.width, 2);
    }

    if (remaining < 300) {
      const fadeAlpha = 1 - remaining / 300;
      ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
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
      ctx.strokeStyle = `rgba(180,80,255,${0.15 + pulse * 0.15})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 220, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.beginPath(); ctx.ellipse(sx, sy + 34, 26, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#2a1a10"; ctx.fillRect(sx - 14, sy - 60, 28, 90);
      ctx.strokeStyle = "#0a0503"; ctx.lineWidth = 2; ctx.strokeRect(sx - 14, sy - 60, 28, 90);
      ctx.fillStyle = "#5a2a10"; ctx.fillRect(sx - 10, sy - 50, 20, 14); ctx.fillRect(sx - 10, sy - 20, 20, 14); ctx.fillRect(sx - 10, sy + 10, 20, 14);
      ctx.fillStyle = `rgba(200,100,255,${pulse})`; ctx.beginPath(); ctx.arc(sx - 5, sy - 43, 2.4, 0, Math.PI * 2); ctx.arc(sx + 5, sy - 43, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,80,80,${pulse})`; ctx.beginPath(); ctx.arc(sx - 5, sy - 13, 2.4, 0, Math.PI * 2); ctx.arc(sx + 5, sy - 13, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#000"; ctx.fillRect(sx - 30, sy - 88, 60, 18);
      ctx.strokeStyle = "#b060ff"; ctx.lineWidth = 1; ctx.strokeRect(sx - 30, sy - 88, 60, 18);
      ctx.fillStyle = "#e0c0ff"; ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
      ctx.fillText(`${t.kills}/${t.need}`, sx, sy - 74);
    }
  }

  function drawTorches() {
    const now = performance.now();
    for (const torch of s.torches) {
      const sx = torch.x - s.camera.x, sy = torch.y - s.camera.y;
      if (sx < -60 || sy < -100 || sx > canvas.width + 60 || sy > canvas.height + 100) continue;
      ctx.fillStyle = torch.lit ? "rgba(255,160,40,0.12)" : "rgba(100,80,60,0.08)";
      ctx.beginPath(); ctx.arc(sx, sy + 6, 20, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = torch.lit ? "#5a3a1a" : "#3a2a1a"; ctx.fillRect(sx - 4, sy - 48, 8, 54);
      ctx.strokeStyle = torch.lit ? "#3a2010" : "#1a1008"; ctx.lineWidth = 1; ctx.strokeRect(sx - 4, sy - 48, 8, 54);
      ctx.fillStyle = torch.lit ? "#4a2a12" : "#2a1a0a"; ctx.fillRect(sx - 10, sy - 48, 20, 6);
      if (torch.lit) {
        const pulse = 0.7 + Math.sin(now / 100) * 0.3;
        const flicker = Math.sin(now / 60) * 2;
        const glow = ctx.createRadialGradient(sx + flicker, sy - 58, 0, sx, sy - 50, 40);
        glow.addColorStop(0, `rgba(255,200,60,${0.4 * pulse})`);
        glow.addColorStop(0.5, `rgba(255,120,20,${0.2 * pulse})`);
        glow.addColorStop(1, "rgba(255,60,0,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(sx, sy - 50, 40, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,180,40,${pulse})`;
        ctx.beginPath(); ctx.moveTo(sx - 6, sy - 42); ctx.quadraticCurveTo(sx - 3 + flicker, sy - 62, sx, sy - 68 + flicker); ctx.quadraticCurveTo(sx + 3 - flicker, sy - 62, sx + 6, sy - 42); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(255,240,120,${pulse * 0.8})`;
        ctx.beginPath(); ctx.moveTo(sx - 3, sy - 42); ctx.quadraticCurveTo(sx + flicker * 0.5, sy - 56, sx, sy - 62 + flicker); ctx.quadraticCurveTo(sx - flicker * 0.5, sy - 56, sx + 3, sy - 42); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = "#2a1a0a"; ctx.fillRect(sx - 1.5, sy - 52, 3, 10);
      }
    }
  }

  function drawLava() {
    const t = performance.now() / 400;
    for (const l of s.lava) {
      const sx = l.x - s.camera.x, sy = l.y - s.camera.y;
      if (sx + l.w < 0 || sy + l.h < 0 || sx > canvas.width || sy > canvas.height) continue;
      ctx.fillStyle = "#3a0a02"; ctx.fillRect(sx - 4, sy - 4, l.w + 8, l.h + 8);
      const grd = ctx.createLinearGradient(sx, sy, sx, sy + l.h);
      grd.addColorStop(0, "#ff5a10"); grd.addColorStop(1, "#8a1a02");
      ctx.fillStyle = grd; ctx.fillRect(sx, sy, l.w, l.h);
      ctx.fillStyle = "rgba(255,220,80,0.7)";
      for (let i = 0; i < 4; i++) {
        const bx = sx + ((i * 53 + t * 20) % l.w);
        const by = sy + ((i * 37 + t * 15) % l.h);
        const rr = 3 + Math.sin(t + i) * 2;
        ctx.beginPath(); ctx.arc(bx, by, Math.abs(rr), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawPortal() {
    if (!s.portalActive || !s.portalPos) return;
    const px = s.portalPos.x - s.camera.x, py = s.portalPos.y - s.camera.y;
    if (px < -200 || py < -200 || px > canvas.width + 200 || py > canvas.height + 200) return;
    const now = performance.now() / 1000;
    const pulse = 0.7 + Math.sin(now * 3) * 0.3;
    const rot = now * 1.5;
    const outerGrd = ctx.createRadialGradient(px, py, 40, px, py, 120);
    outerGrd.addColorStop(0, `rgba(120,40,200,${0.35 * pulse})`);
    outerGrd.addColorStop(0.4, `rgba(80,20,160,${0.2 * pulse})`);
    outerGrd.addColorStop(0.7, `rgba(50,10,120,${0.1 * pulse})`);
    outerGrd.addColorStop(1, "rgba(30,5,80,0)");
    ctx.fillStyle = outerGrd; ctx.beginPath(); ctx.arc(px, py, 120, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 4; i++) {
      const ringR = 50 + i * 15 + Math.sin(now * 2 + i) * 8;
      const alpha = (0.3 - i * 0.06) * pulse;
      ctx.strokeStyle = `rgba(160,80,255,${alpha})`; ctx.lineWidth = 2.5 - i * 0.4;
      ctx.beginPath(); ctx.arc(px, py, ringR, rot + i * 0.5, rot + i * 0.5 + Math.PI * 1.4); ctx.stroke();
    }
    const innerGrd = ctx.createRadialGradient(px, py, 0, px, py, 45);
    innerGrd.addColorStop(0, "rgba(10,0,20,0.95)"); innerGrd.addColorStop(0.5, "rgba(40,10,80,0.7)");
    innerGrd.addColorStop(0.8, "rgba(80,30,140,0.3)"); innerGrd.addColorStop(1, "rgba(120,50,200,0)");
    ctx.fillStyle = innerGrd; ctx.beginPath(); ctx.arc(px, py, 45, 0, Math.PI * 2); ctx.fill();
    const coreGrd = ctx.createRadialGradient(px, py, 0, px, py, 20);
    coreGrd.addColorStop(0, `rgba(180,100,255,${0.5 * pulse})`); coreGrd.addColorStop(1, "rgba(120,40,200,0)");
    ctx.fillStyle = coreGrd; ctx.beginPath(); ctx.arc(px, py, 20, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + now * 0.8;
      const dist = 55 + Math.sin(now * 2.5 + i * 1.3) * 20;
      const ppx = px + Math.cos(angle) * dist; const ppy = py + Math.sin(angle) * dist;
      const size = 2 + Math.sin(now * 4 + i) * 1;
      ctx.fillStyle = `rgba(180,120,255,${0.6 * pulse})`;
      ctx.beginPath(); ctx.arc(ppx, ppy, size, 0, Math.PI * 2); ctx.fill();
    }
    const dpp = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
    const dx = dpp.x - s.portalPos.x, dy = dpp.y - s.portalPos.y;
    if (dx * dx + dy * dy < 90 * 90) {
      ctx.fillStyle = "#fff"; ctx.font = "bold 14px monospace"; ctx.textAlign = "center";
      ctx.fillText("[E] ENTER THE DARK AETHER", px, py - 75);
    }
  }

  function drawGlowingCrate() {
    if (!s.glowingCrate) return;
    const gc = s.glowingCrate;
    const sx = gc.x - s.camera.x, sy = gc.y - s.camera.y;
    if (sx + gc.w < -20 || sy + gc.h < -20 || sx > canvas.width + 20 || sy > canvas.height + 20) return;
    const now = performance.now() / 1000;
    const pulse = 0.6 + Math.sin(now * 4) * 0.4;
    const glowGrd = ctx.createRadialGradient(sx + gc.w / 2, sy + gc.h / 2, 10, sx + gc.w / 2, sy + gc.h / 2, 60);
    glowGrd.addColorStop(0, `rgba(160,80,255,${0.3 * pulse})`);
    glowGrd.addColorStop(0.5, `rgba(120,40,200,${0.15 * pulse})`);
    glowGrd.addColorStop(1, "rgba(80,20,160,0)");
    ctx.fillStyle = glowGrd; ctx.beginPath(); ctx.arc(sx + gc.w / 2, sy + gc.h / 2, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = `rgba(90,50,30,${0.9 + pulse * 0.1})`; ctx.fillRect(sx, sy, gc.w, gc.h);
    ctx.strokeStyle = `rgba(160,80,255,${0.5 + pulse * 0.3})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + gc.w, sy + gc.h); ctx.moveTo(sx + gc.w, sy); ctx.lineTo(sx, sy + gc.h); ctx.stroke();
    ctx.strokeStyle = `rgba(180,100,255,${0.6 + pulse * 0.3})`; ctx.lineWidth = 3; ctx.strokeRect(sx, sy, gc.w, gc.h);
    for (let i = 0; i < gc.hp; i++) {
      ctx.fillStyle = `rgba(180,120,255,${0.8 * pulse})`;
      ctx.beginPath(); ctx.arc(sx + 10 + i * 14, sy + gc.h + 10, 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBoss() {
    if (!s.boss) return;
    const bs = s.boss;
    const flash = bs.hitFlash || 0;
    const shake = bs.hitShake || 0;
    const shx = shake ? (Math.random() - 0.5) * shake : 0;
    const shy = shake ? (Math.random() - 0.5) * shake : 0;
    const sx = bs.x - s.camera.x + shx, sy = bs.y - s.camera.y + shy;
    const pulse = 0.7 + Math.sin(performance.now() / 200) * 0.3;
    const p2 = bs.phase === 2;
    if (bs.charging) {
      const sprintPulse = 0.5 + Math.sin(performance.now() / 60) * 0.5;
      ctx.fillStyle = `rgba(255,80,0,${sprintPulse * 0.5})`;
      ctx.beginPath(); ctx.arc(sx, sy, bs.radius * (2 + sprintPulse), 0, Math.PI * 2); ctx.fill();
    }
    const auraSize = p2 ? 2.8 : 2.2;
    const grd = ctx.createRadialGradient(sx, sy, bs.radius * 0.5, sx, sy, bs.radius * (auraSize + flash * 0.6));
    const gR = p2 ? 200 : 60;
    grd.addColorStop(0, `rgba(255,${gR + flash * 180},${20 + flash * 180},${((p2 ? 0.5 : 0.35) + flash * 0.5) * pulse})`);
    grd.addColorStop(1, `rgba(255,${p2 ? 30 : 60},20,0)`);
    ctx.fillStyle = grd;
    ctx.fillRect(sx - bs.radius * 3.2, sy - bs.radius * 3.2, bs.radius * 6.4, bs.radius * 6.4);
    const bodyR = p2 ? 36 : 26;
    ctx.fillStyle = flash > 0.05 ? `rgba(${bodyR + flash * 229},${5 + flash * 250},${5 + flash * 250},1)` : (p2 ? "#2a0505" : "#1a0505");
    ctx.beginPath(); ctx.arc(sx, sy, bs.radius, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = flash > 0.05 ? "#ffffff" : (p2 ? "#ff2020" : "#c93030");
    ctx.lineWidth = 4 + flash * 3 + (p2 ? 2 : 0); ctx.stroke();
    const now = performance.now() / (p2 ? 350 : 500);
    const spikeCount = p2 ? 12 : 8; const spikeLen = p2 ? 18 : 12;
    for (let i = 0; i < spikeCount; i++) {
      const a = (i / spikeCount) * Math.PI * 2 + now;
      ctx.fillStyle = p2 ? "#8a0a0a" : "#5a0a0a";
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * bs.radius, sy + Math.sin(a) * bs.radius);
      ctx.lineTo(sx + Math.cos(a + 0.15) * (bs.radius + spikeLen), sy + Math.sin(a + 0.15) * (bs.radius + spikeLen));
      ctx.lineTo(sx + Math.cos(a + 0.3) * bs.radius, sy + Math.sin(a + 0.3) * bs.radius);
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = p2 ? `rgba(255,60,20,${pulse})` : `rgba(255,220,80,${pulse})`;
    const ang = Math.atan2(s.player.y - bs.y, s.player.x - bs.x);
    const ex = Math.cos(ang) * (bs.radius * 0.4); const ey = Math.sin(ang) * (bs.radius * 0.4);
    const perpX = -Math.sin(ang) * 10, perpY = Math.cos(ang) * 10;
    ctx.beginPath();
    ctx.arc(sx + ex + perpX, sy + ey + perpY, p2 ? 5 : 4, 0, Math.PI * 2);
    ctx.arc(sx + ex - perpX, sy + ey - perpY, p2 ? 5 : 4, 0, Math.PI * 2); ctx.fill();
    const barW = Math.min(600, canvas.width - 200); const barX = (canvas.width - barW) / 2;
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(barX - 4, 46, barW + 8, 22);
    ctx.fillStyle = p2 ? "#5a0505" : "#3a0505"; ctx.fillRect(barX, 50, barW, 14);
    ctx.fillStyle = p2 ? "#ff2020" : "#c93030"; ctx.fillRect(barX, 50, barW * (bs.hp / bs.maxHp), 14);
    ctx.fillStyle = "#e0c090"; ctx.font = "bold 12px monospace"; ctx.textAlign = "center";
    ctx.fillText(p2 ? "THE HARBINGER - ENRAGED" : "THE HARBINGER", canvas.width / 2, 44);
  }

  function drawBossBullets() {
    for (const b of s.bossBullets) {
      const sx = b.x - s.camera.x, sy = b.y - s.camera.y;
      if (b.color) {
        ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(sx, sy, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(sx - 1, sy - 1, 2, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createRadialGradient(sx, sy, 3, sx, sy, 12);
        g.addColorStop(0, b.color + "88"); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 12, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = "#ff4020"; ctx.beginPath(); ctx.arc(sx, sy, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "rgba(255,180,80,0.6)"; ctx.beginPath(); ctx.arc(sx, sy, 9, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawTransitionFlash() {
    if (s.transitionFlash > 0.01) {
      ctx.fillStyle = `rgba(255,255,255,${Math.min(1, s.transitionFlash)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function renderWorld() {
    const zoom = settingsRef.current.cameraZoom === "zoomed" ? 1.4 : 1;
    ctx.save();
    if (zoom !== 1) {
      const vp = (s.gameMode === "split" && s._vpIsP2) ? s.player2 : s.player;
      const px = vp.x - s.camera.x;
      const py = vp.y - s.camera.y;
      ctx.translate(px, py);
      ctx.scale(zoom, zoom);
      ctx.translate(-px, -py);
    }
    drawGrid();
    drawCaveArea();
    drawGolfRoom();
    drawDecals();
    drawMapBounds();
    if (s.bossMode) drawLava();
    if (!s.bossMode) drawBuyStations();
    else drawBossAmmoBoxes();
    drawPickups();
    drawObstacles();
    drawGlowingCrate();
    drawPortal();
    drawGenerator();
    drawTotems();
    drawTorches();
    drawParticles();
    drawToxicGas();
    drawToxicProjectiles();
    drawZombies();
    drawBoss();
    drawBossBullets();
    drawPlayer();
    drawBullets();
    drawFog();
    drawFlashlightOverlay();
    drawHitFlash();
    drawJumpscare();
    drawTransitionFlash();
    drawMessage();
    ctx.restore();
  }

  function render() {
    ctx.fillStyle = s.bossMode ? "#1a0505" : "#0a0d0a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (s.gameMode === "split" && s.started) {
      const halfW = Math.floor(canvas.width / 2);
      const origCamera = s.camera;

      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, halfW, canvas.height); ctx.clip();
      s.camera = origCamera;
      s._vpIsP2 = false;
      renderWorld();
      ctx.strokeStyle = "#c9a24a"; ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, halfW - 2, canvas.height - 2);
      ctx.restore();

      ctx.save();
      ctx.beginPath(); ctx.rect(halfW, 0, halfW, canvas.height); ctx.clip();
      ctx.translate(halfW, 0);
      s.camera = s.camera2;
      s._vpIsP2 = true;
      renderWorld();
      ctx.restore();

      s.camera = origCamera;

      ctx.fillStyle = "#c9a24a"; ctx.fillRect(halfW - 1, 0, 2, canvas.height);
      ctx.strokeStyle = "#4a9aff"; ctx.lineWidth = 2;
      ctx.strokeRect(halfW + 1, 1, halfW - 2, canvas.height - 2);
    } else {
      renderWorld();
    }
  }

  return {
    drawGrid,
    drawCaveArea,
    drawGolfRoom,
    drawGenerator,
    drawFlashlightOverlay,
    drawDecals,
    drawMapBounds,
    drawBuyStations,
    drawBossAmmoBoxes,
    drawPickups,
    drawPlayerAt,
    drawPlayer,
    drawObstacles,
    drawZombies,
    drawToxicGas,
    drawToxicProjectiles,
    drawBullets,
    drawParticles,
    drawFog,
    drawMessage,
    drawHitFlash,
    drawJumpscare,
    drawTotems,
    drawTorches,
    drawLava,
    drawPortal,
    drawGlowingCrate,
    drawBoss,
    drawBossBullets,
    drawTransitionFlash,
    renderWorld,
    render,
  };
}

import type { GameState } from "@/lib/gameState";
import { DOOR_HOLD_MS } from "@/lib/mapData";

// ─── Constants ────────────────────────────────────────────────────────────────

const GAMEPAD_DEADZONE = 0.18;
const GAMEPAD_TRIGGER_THRESHOLD = 0.5;

// ─── Input state (module-level for gamepad edge detection) ─────────────────────

let p2PrevLB = false;
let p2PrevY = false;

// ─── Setup keyboard + mouse handlers ──────────────────────────────────────────

export function setupInputHandlers(
  s: GameState,
  canvas: HTMLCanvasElement,
  callbacks: {
    tryReload: () => void;
    tryInteract: () => void;
    tryInteract2: () => void;
    beginGame: () => void;
    setControllerConnected: (v: boolean) => void;
  },
) {
  const kd = (e: KeyboardEvent) => {
    s.keys[e.key.toLowerCase()] = true;
    if (e.key.toLowerCase() === "r") callbacks.tryReload();
    if (e.key.toLowerCase() === "e") {
      let reviveStarted = false;
      if (s.gameMode === "split" && s.player.hp > 0 && !s.player2Alive) {
        if (s._reviveHoldStart === 0) {
          const dx = s.player2.x - s.player.x;
          const dy = s.player2.y - s.player.y;
          if (dx * dx + dy * dy < 90 * 90) {
            s._reviveHoldStart = performance.now();
            s._reviveTarget = 2;
            reviveStarted = true;
          }
        } else {
          reviveStarted = true;
        }
      }
      if (!reviveStarted && s._doorHoldStartP1 === 0) {
        s._doorHoldStartP1 = performance.now();
      }
    }
  };

  const ku = (e: KeyboardEvent) => {
    s.keys[e.key.toLowerCase()] = false;
    if (e.key.toLowerCase() === "e") {
      if (s._reviveHoldStart > 0) {
        s._reviveHoldStart = 0;
        s._reviveTarget = 0;
      } else if (
        s._doorHoldStartP1 > 0 &&
        performance.now() - s._doorHoldStartP1 < DOOR_HOLD_MS
      ) {
        callbacks.tryInteract();
      }
      s._doorHoldStartP1 = 0;
    }
  };

  const mm = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    s.mouse.x = e.clientX - rect.left;
    s.mouse.y = e.clientY - rect.top;
  };

  const md = () => {
    if (!s.started) {
      callbacks.beginGame();
      return;
    }
    s.mouse.down = true;
  };

  const mu = () => (s.mouse.down = false);

  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  canvas.addEventListener("mousemove", mm);
  canvas.addEventListener("mousedown", md);
  window.addEventListener("mouseup", mu);
  window.addEventListener("blur", mu);
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  // Gamepad connection events
  const onGamepadConnected = (e: GamepadEvent) => {
    s.controllerIndex = e.gamepad.index;
    callbacks.setControllerConnected(true);
  };
  const onGamepadDisconnected = (e: GamepadEvent) => {
    if (e.gamepad.index === s.controllerIndex) {
      s.controllerIndex = -1;
      callbacks.setControllerConnected(false);
    }
  };
  window.addEventListener("gamepadconnected", onGamepadConnected);
  window.addEventListener("gamepaddisconnected", onGamepadDisconnected);

  // Check for already-connected controllers
  const existingGamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (let i = 0; i < existingGamepads.length; i++) {
    if (existingGamepads[i]) {
      s.controllerIndex = i;
      callbacks.setControllerConnected(true);
      break;
    }
  }

  // Return cleanup function
  return () => {
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
    canvas.removeEventListener("mousemove", mm);
    canvas.removeEventListener("mousedown", md);
    window.removeEventListener("mouseup", mu);
    window.removeEventListener("blur", mu);
    window.removeEventListener("gamepadconnected", onGamepadConnected);
    window.removeEventListener("gamepaddisconnected", onGamepadDisconnected);
  };
}

// ─── Continuous gamepad detection (runs every frame for lobby) ────────────────

export function detectGamepad(
  s: GameState,
  setControllerConnected: (v: boolean) => void,
) {
  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  if (s.controllerIndex < 0 || !gamepads[s.controllerIndex]) {
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        s.controllerIndex = i;
        setControllerConnected(true);
        break;
      }
    }
  } else {
    if (!gamepads[s.controllerIndex]) {
      s.controllerIndex = -1;
      setControllerConnected(false);
    }
  }
}

// ─── Gamepad polling for Player 2 (called each frame) ─────────────────────────

export function pollGamepad(
  s: GameState,
  callbacks: {
    tryReload2: () => void;
    tryInteract2: () => void;
    cycleWeapon2: (dir: number) => void;
  },
) {
  if (s.gameMode !== "split" || !s.started || s.gameOver) return;

  const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = gamepads[s.controllerIndex];
  if (!gp) {
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        s.controllerIndex = i;
        return pollGamepad(s, callbacks);
      }
    }
    return;
  }

  // Left stick -> movement
  let lx = gp.axes[0] || 0;
  let ly = gp.axes[1] || 0;
  if (Math.abs(lx) < GAMEPAD_DEADZONE) lx = 0;
  if (Math.abs(ly) < GAMEPAD_DEADZONE) ly = 0;
  s._p2MoveX = lx;
  s._p2MoveY = ly;

  // Right stick -> aim direction
  let rx = gp.axes[2] || 0;
  let ry = gp.axes[3] || 0;
  if (Math.abs(rx) < GAMEPAD_DEADZONE) rx = 0;
  if (Math.abs(ry) < GAMEPAD_DEADZONE) ry = 0;
  if (rx !== 0 || ry !== 0) {
    s.player2.angle = Math.atan2(ry, rx);
    s.mouse2.worldX = s.player2.x + Math.cos(s.player2.angle) * 200;
    s.mouse2.worldY = s.player2.y + Math.sin(s.player2.angle) * 200;
  }

  // Right trigger -> shoot
  const rtVal = gp.buttons[7]?.value ?? 0;
  s.mouse2.down = rtVal > GAMEPAD_TRIGGER_THRESHOLD;

  // Left bumper -> reload (edge-triggered)
  const lbDown = !!gp.buttons[4]?.pressed;
  if (lbDown && !p2PrevLB) {
    callbacks.tryReload2();
  }
  p2PrevLB = lbDown;

  // Y button -> interact (hold to pay half or revive, tap to buy full)
  const yDown = !!gp.buttons[3]?.pressed;
  if (yDown && !p2PrevY) {
    let reviveStarted = false;
    if (s.player2Alive && s.player.hp <= 0) {
      const dx = s.player.x - s.player2.x;
      const dy = s.player.y - s.player2.y;
      if (dx * dx + dy * dy < 90 * 90) {
        s._reviveHoldStart = performance.now();
        s._reviveTarget = 1;
        reviveStarted = true;
      }
    }
    if (!reviveStarted) {
      s._doorHoldStartP2 = performance.now();
    }
  }
  if (!yDown && p2PrevY) {
    if (s._reviveHoldStart > 0) {
      s._reviveHoldStart = 0;
      s._reviveTarget = 0;
    } else if (
      s._doorHoldStartP2 > 0 &&
      performance.now() - s._doorHoldStartP2 < DOOR_HOLD_MS
    ) {
      callbacks.tryInteract2();
    }
    s._doorHoldStartP2 = 0;
  }
  p2PrevY = yDown;

  // D-pad -> weapon switching
  if (gp.buttons[12]?.pressed) callbacks.cycleWeapon2(-1);
  if (gp.buttons[13]?.pressed) callbacks.cycleWeapon2(1);
}

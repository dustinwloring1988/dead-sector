import { useEffect, useRef, useState } from "react";

export type TouchControlsProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stateRef: React.MutableRefObject<any>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  thumbstickSize: "normal" | "big";
};

export function TouchControls({ stateRef, canvasRef, thumbstickSize }: TouchControlsProps) {
  const moveRef = useRef<HTMLDivElement>(null);
  const aimRef = useRef<HTMLDivElement>(null);
  const [moveKnob, setMoveKnob] = useState({ x: 0, y: 0, active: false });
  const [aimKnob, setAimKnob] = useState({ x: 0, y: 0, active: false });

  useEffect(() => {
    const s = stateRef.current;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const JOY_RADIUS = thumbstickSize === "big" ? 82.5 : 55;
    const MOVE_DEADZONE = 0.25;

    let movePointerId: number | null = null;
    let moveCenter = { x: 0, y: 0 };
    let aimPointerId: number | null = null;
    let aimCenter = { x: 0, y: 0 };

    const setMoveKeys = (dx: number, dy: number) => {
      const mag = Math.hypot(dx, dy);
      const nx = mag > 0 ? dx / mag : 0;
      const ny = mag > 0 ? dy / mag : 0;
      const active = mag / JOY_RADIUS > MOVE_DEADZONE;
      s.keys["w"] = active && ny < -0.35;
      s.keys["s"] = active && ny > 0.35;
      s.keys["a"] = active && nx < -0.35;
      s.keys["d"] = active && nx > 0.35;
    };

    const clearMoveKeys = () => {
      s.keys["w"] = false;
      s.keys["s"] = false;
      s.keys["a"] = false;
      s.keys["d"] = false;
    };

    const setAim = (dx: number, dy: number) => {
      const mag = Math.hypot(dx, dy);
      if (mag < 6) return;
      const nx = dx / mag;
      const ny = dy / mag;
      // Player is centered on screen; aim relative to canvas center.
      s.mouse.x = canvas.width / 2 + nx * 300;
      s.mouse.y = canvas.height / 2 + ny * 300;
      s.mouse.down = true;
    };

    const clampKnob = (dx: number, dy: number) => {
      const mag = Math.hypot(dx, dy);
      if (mag <= JOY_RADIUS) return { x: dx, y: dy };
      return { x: (dx / mag) * JOY_RADIUS, y: (dy / mag) * JOY_RADIUS };
    };

    const moveEl = moveRef.current;
    const aimEl = aimRef.current;
    if (!moveEl || !aimEl) return;

    const onMoveDown = (e: PointerEvent) => {
      e.preventDefault();
      if (movePointerId !== null) return;
      movePointerId = e.pointerId;
      moveEl.setPointerCapture(e.pointerId);
      const rect = moveEl.getBoundingClientRect();
      moveCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const dx = e.clientX - moveCenter.x;
      const dy = e.clientY - moveCenter.y;
      const k = clampKnob(dx, dy);
      setMoveKnob({ x: k.x, y: k.y, active: true });
      setMoveKeys(k.x, k.y);
    };
    const onMoveMove = (e: PointerEvent) => {
      if (e.pointerId !== movePointerId) return;
      const dx = e.clientX - moveCenter.x;
      const dy = e.clientY - moveCenter.y;
      const k = clampKnob(dx, dy);
      setMoveKnob({ x: k.x, y: k.y, active: true });
      setMoveKeys(k.x, k.y);
    };
    const onMoveUp = (e: PointerEvent) => {
      if (e.pointerId !== movePointerId) return;
      movePointerId = null;
      setMoveKnob({ x: 0, y: 0, active: false });
      clearMoveKeys();
    };

    const onAimDown = (e: PointerEvent) => {
      e.preventDefault();
      if (aimPointerId !== null) return;
      aimPointerId = e.pointerId;
      aimEl.setPointerCapture(e.pointerId);
      const rect = aimEl.getBoundingClientRect();
      aimCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      const dx = e.clientX - aimCenter.x;
      const dy = e.clientY - aimCenter.y;
      const k = clampKnob(dx, dy);
      setAimKnob({ x: k.x, y: k.y, active: true });
      setAim(k.x, k.y);
    };
    const onAimMove = (e: PointerEvent) => {
      if (e.pointerId !== aimPointerId) return;
      const dx = e.clientX - aimCenter.x;
      const dy = e.clientY - aimCenter.y;
      const k = clampKnob(dx, dy);
      setAimKnob({ x: k.x, y: k.y, active: true });
      setAim(k.x, k.y);
    };
    const onAimUp = (e: PointerEvent) => {
      if (e.pointerId !== aimPointerId) return;
      aimPointerId = null;
      setAimKnob({ x: 0, y: 0, active: false });
      s.mouse.down = false;
    };

    moveEl.addEventListener("pointerdown", onMoveDown);
    moveEl.addEventListener("pointermove", onMoveMove);
    moveEl.addEventListener("pointerup", onMoveUp);
    moveEl.addEventListener("pointercancel", onMoveUp);
    aimEl.addEventListener("pointerdown", onAimDown);
    aimEl.addEventListener("pointermove", onAimMove);
    aimEl.addEventListener("pointerup", onAimUp);
    aimEl.addEventListener("pointercancel", onAimUp);

    return () => {
      moveEl.removeEventListener("pointerdown", onMoveDown);
      moveEl.removeEventListener("pointermove", onMoveMove);
      moveEl.removeEventListener("pointerup", onMoveUp);
      moveEl.removeEventListener("pointercancel", onMoveUp);
      aimEl.removeEventListener("pointerdown", onAimDown);
      aimEl.removeEventListener("pointermove", onAimMove);
      aimEl.removeEventListener("pointerup", onAimUp);
      aimEl.removeEventListener("pointercancel", onAimUp);
      clearMoveKeys();
      s.mouse.down = false;
    };
  }, [stateRef, canvasRef, thumbstickSize]);

  const tapKey = (key: string) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    window.dispatchEvent(new KeyboardEvent("keyup", { key }));
  };

  const big = thumbstickSize === "big";
  const joyBase =
    `absolute rounded-full bg-black/40 border-2 border-[#c9a24a]/60 touch-none pointer-events-auto ${
      big ? "w-[168px] h-[168px] sm:w-[192px] sm:h-[192px]" : "w-28 h-28 sm:w-32 sm:h-32"
    }`;
  const knobStyle = (k: { x: number; y: number; active: boolean }) => ({
    transform: `translate(-50%, -50%) translate(${k.x}px, ${k.y}px)`,
    opacity: k.active ? 1 : 0.7,
  });

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-20">
      {/* Movement joystick — bottom-left, hugs the corner so it fits in landscape */}
      <div
        ref={moveRef}
        className={`${joyBase} left-4 bottom-4 [@media(orientation:portrait)]:bottom-[calc(120px+env(safe-area-inset-bottom))] sm:left-6 sm:bottom-24`}
      >
        <div
          className={`absolute top-1/2 left-1/2 rounded-full bg-[#c9a24a]/80 border border-black/40 ${
            big ? "w-[72px] h-[72px] sm:w-[84px] sm:h-[84px]" : "w-12 h-12 sm:w-14 sm:h-14"
          }`}
          style={knobStyle(moveKnob)}
        />
      </div>

      {/* Aim + fire joystick — bottom-right */}
      <div
        ref={aimRef}
        className={`${joyBase} right-4 bottom-4 [@media(orientation:portrait)]:bottom-[calc(120px+env(safe-area-inset-bottom))] sm:right-6 sm:bottom-24`}
      >
        <div
          className={`absolute top-1/2 left-1/2 rounded-full bg-[#c93030]/80 border border-black/40 ${
            big ? "w-[72px] h-[72px] sm:w-[84px] sm:h-[84px]" : "w-12 h-12 sm:w-14 sm:h-14"
          }`}
          style={knobStyle(aimKnob)}
        />
        <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] sm:text-[10px] font-mono text-[#c9a24a] tracking-widest whitespace-nowrap">
          AIM / FIRE
        </div>
      </div>

      {/* Action buttons — stacked vertically between thumbsticks in portrait (big only), horizontal otherwise */}
      <div
        className={`absolute pointer-events-auto w-max flex items-center gap-2
                   ${big
                     ? `[@media(orientation:portrait)]:flex-col-reverse
                        [@media(orientation:portrait)]:left-1/2
                        [@media(orientation:portrait)]:-translate-x-1/2
                        [@media(orientation:portrait)]:bottom-[calc(140px+env(safe-area-inset-bottom))]`
                     : `[@media(orientation:portrait)]:flex-row [@media(orientation:portrait)]:flex-nowrap
                        [@media(orientation:portrait)]:left-1/2
                        [@media(orientation:portrait)]:-translate-x-1/2
                        [@media(orientation:portrait)]:bottom-[calc(180px+env(safe-area-inset-bottom))]`}
                   [@media(orientation:landscape)]:flex-row [@media(orientation:landscape)]:flex-nowrap
                   [@media(orientation:landscape)]:left-1/2 [@media(orientation:landscape)]:-translate-x-1/2
                   [@media(orientation:landscape)]:bottom-[100px]`}
      >

        <button
          onPointerDown={(e) => {
            e.preventDefault();
            tapKey("r");
          }}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/60 border-2 border-[#c9a24a]/70 font-mono text-[#c9a24a] text-xs sm:text-sm font-bold touch-none"
        >
          RELOAD
        </button>
        <button
          onPointerDown={(e) => {
            e.preventDefault();
            tapKey("e");
          }}
          className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-black/60 border-2 border-[#c9a24a]/70 font-mono text-[#c9a24a] text-xs sm:text-sm font-bold touch-none"
        >
          USE
        </button>
      </div>

    </div>
  );
}

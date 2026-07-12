import { Settings } from "lucide-react";

type GameHudProps = {
  round: number;
  zombiesLeft: number;
  elapsedMs: number;
  points: number;
  hp: number;
  weaponName: string;
  mag: number;
  reserve: number;
  reloading: boolean;
  gameMode: "single" | "split";
  isMobile: boolean;
  points2?: number;
  hp2?: number;
  weaponName2?: string;
  mag2?: number;
  reserve2?: number;
  reloading2?: boolean;
  onOpenSettings: () => void;
};

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms));
  const m = Math.floor(total / 60000);
  const sec = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

export function GameHud({
  round,
  zombiesLeft,
  elapsedMs,
  points,
  hp,
  weaponName,
  mag,
  reserve,
  reloading,
  gameMode,
  isMobile,
  points2,
  hp2,
  weaponName2,
  mag2,
  reserve2,
  reloading2,
  onOpenSettings,
}: GameHudProps) {
  return (
    <>
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 font-mono text-[#c9a24a] pointer-events-none">
        <div className="text-lg sm:text-3xl font-bold tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {round === 999 ? "BOSS" : `R${round}`}
          <span className="hidden sm:inline">
            {round === 999 ? " FIGHT" : ""}
          </span>
        </div>
        {round !== 999 && (
          <div className="mt-0.5 sm:mt-2 text-[10px] sm:text-sm text-[#a89060]">
            Z: {zombiesLeft}
          </div>
        )}
        {isMobile && (
          <button
            onClick={onOpenSettings}
            className="pointer-events-auto mt-1 p-1 text-[#8a8a6a] hover:text-[#c9a24a] transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="absolute top-2 sm:top-4 left-1/2 -translate-x-1/2 font-mono pointer-events-none text-center">
        <div className="hidden sm:block text-[10px] tracking-[0.3em] text-[#8a8a6a]">TIME</div>
        <div className="text-base sm:text-3xl font-bold tabular-nums text-[#c9a24a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {formatTime(elapsedMs)}
        </div>
      </div>

      <div
        className="absolute font-mono text-right pointer-events-none"
        style={{
          top: "0.5rem",
          right: gameMode === "split" ? "calc(50% + 0.5rem)" : "0.5rem",
        }}
      >
        <div className="text-base sm:text-2xl font-bold text-[#c9a24a] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
          {points}
          <span className="text-[10px] sm:text-base"> PTS</span>
        </div>
        {!isMobile && (
          <button
            onClick={onOpenSettings}
            className="pointer-events-auto mt-1 px-2 py-0.5 text-[10px] sm:text-xs text-[#8a8a6a] border border-[#3a3a1a] hover:border-[#c9a24a] hover:text-[#c9a24a] transition-colors bg-black/40"
          >
            SETTINGS
          </button>
        )}
      </div>

      {/* Health — bottom on desktop, top-center on touch devices (portrait & landscape phones) */}
      <div
        className={
          isMobile
            ? "absolute left-1/2 -translate-x-1/2 top-16 font-mono pointer-events-none"
            : "absolute left-4 bottom-4 font-mono pointer-events-none"
        }
      >
        <div className="bg-black/60 border border-[#3a3a1a] px-2 py-1 sm:px-4 sm:py-2 rounded-sm">
          {!isMobile && (
            <div className="flex items-center gap-2 mb-1">
              <div className="text-xs text-[#8a8a6a]">HEALTH</div>
            </div>
          )}
          <div className={(isMobile ? "w-40 h-2" : "w-56 h-3") + " bg-[#1a0505] border border-[#3a1010]"}>
            <div
              className="h-full bg-gradient-to-r from-[#8a1010] to-[#c93030] transition-all"
              style={{ width: `${hp}%` }}
            />
          </div>
          <div className={"text-[10px] sm:text-xs text-[#a89060] mt-0.5 sm:mt-1 " + (isMobile ? "text-center" : "text-left")}>
            {hp} / 100
          </div>
        </div>
      </div>

      {/* Weapon — bottom-right on desktop, compact top-right-below-pts on touch */}
      <div
        className={
          isMobile
            ? "absolute top-11 right-2 font-mono text-right pointer-events-none"
            : "absolute bottom-4 font-mono text-right pointer-events-none"
        }
        style={!isMobile ? { right: gameMode === "split" ? "calc(50% + 1rem)" : "1rem" } : undefined}
      >
        <div className="bg-black/60 border border-[#3a3a1a] px-2 py-1 sm:px-4 sm:py-2 rounded-sm">
          <div className="text-[9px] sm:text-xs text-[#8a8a6a] truncate max-w-[110px] sm:max-w-none">
            {weaponName.toUpperCase()}
          </div>
          <div className="text-lg sm:text-3xl font-bold text-[#c9a24a] leading-tight">
            {reloading ? "..." : mag}
            <span className="text-xs sm:text-lg text-[#8a7a4a]"> / {reserve}</span>
          </div>
          {reloading && (
            <div className="text-[9px] sm:text-xs text-[#c93030] animate-pulse">RELOADING</div>
          )}
        </div>
      </div>

      {/* ─── Player 2 HUD (split-screen only) ─── */}
      {gameMode === "split" && (
        <>
          {/* P2 Health — bottom-left of right half */}
          <div className="absolute bottom-4 font-mono pointer-events-none" style={{ left: "calc(50% + 1rem)" }}>
            <div className="bg-black/60 border border-[#1a2a4a] px-4 py-2 rounded-sm">
              <div className="flex items-center gap-2 mb-1">
                <div className="text-xs text-[#4a9aff]">P2 HEALTH</div>
              </div>
              <div className="w-56 h-3 bg-[#0a0a1a] border border-[#1a1a3a]">
                <div
                  className="h-full bg-gradient-to-r from-[#103080] to-[#3060c0] transition-all"
                  style={{ width: `${hp2 ?? 100}%` }}
                />
              </div>
              <div className="text-xs text-[#6090c0] mt-1 text-left">
                {hp2 ?? 100} / 100
              </div>
            </div>
          </div>

          {/* P2 Points — top-right of right half */}
          <div className="absolute top-2 right-2 sm:top-4 sm:right-4 font-mono text-right pointer-events-none">
            <div className="text-base sm:text-2xl font-bold text-[#4a9aff] drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
              {points2 ?? 0}
              <span className="text-[10px] sm:text-base text-[#3a6a9a]"> PTS</span>
            </div>
          </div>

          {/* P2 Weapon — bottom-right of right half */}
          <div className="absolute right-4 bottom-20 font-mono text-right pointer-events-none">
            <div className="bg-black/60 border border-[#1a2a4a] px-4 py-2 rounded-sm">
              <div className="text-xs text-[#4a9aff] truncate">
                P2 — {(weaponName2 ?? "PISTOL").toUpperCase()}
              </div>
              <div className="text-2xl font-bold text-[#4a9aff] leading-tight">
                {reloading2 ? "..." : mag2 ?? 0}
                <span className="text-lg text-[#3a6a9a]"> / {reserve2 ?? 0}</span>
              </div>
              {reloading2 && (
                <div className="text-xs text-[#4488ff] animate-pulse">RELOADING</div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

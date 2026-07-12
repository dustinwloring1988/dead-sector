import { Gamepad2, Monitor, Settings, Skull, Users, Zap } from "lucide-react";

type StartScreenProps = {
  menuMode: "main" | "splitLobby";
  isMobile: boolean;
  controllerConnected: boolean;
  onStartSingle: () => void;
  onStartSplit: () => void;
  onSetMenuMode: (mode: "main" | "splitLobby") => void;
  onOpenSettings: () => void;
  showHelp: boolean;
};

const desktopControls = [
  ["WASD", "Move"],
  ["MOUSE", "Aim"],
  ["LMB", "Fire"],
  ["R", "Reload"],
  ["E", "Use stations"],
];

const mobileControls = [
  ["LEFT STICK", "Move"],
  ["RIGHT STICK", "Aim & fire"],
  ["RELOAD", "Reload weapon"],
  ["USE", "Use stations"],
];

export function StartScreen({
  menuMode,
  isMobile,
  controllerConnected,
  onStartSingle,
  onStartSplit,
  onSetMenuMode,
  onOpenSettings,
  showHelp,
}: StartScreenProps) {
  const controls = isMobile ? mobileControls : desktopControls;

  return (
    <div className="start-screen absolute inset-0 overflow-y-auto font-mono text-[#ded8c4]">
      <div className="start-screen__scanlines pointer-events-none absolute inset-0" />
      <div className="start-screen__glow pointer-events-none absolute left-1/2 top-0 h-80 w-[42rem] -translate-x-1/2" />

      <div className="relative mx-auto flex min-h-full w-full max-w-6xl items-center px-4 py-8 sm:px-8">
        <main className="start-screen__panel mx-auto w-full max-w-5xl overflow-hidden border border-[#c9a24a]/35 bg-[#090a09]/85 shadow-2xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-[#c9a24a]/20 px-4 py-3 text-[10px] tracking-[0.2em] text-[#a89060] sm:px-6">
            <span className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-[#c93030]" /> SECTOR //
              LOCKDOWN
            </span>
            <span>BUILD 01.26</span>
          </div>

          <div className="grid lg:grid-cols-[1.2fr_0.8fr]">
            <section className="p-6 sm:p-10 lg:border-r lg:border-[#c9a24a]/20">
              <div className="mb-8 flex items-start gap-3 text-[#c9a24a]">
                <Skull className="mt-1 h-7 w-7 shrink-0" strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <p className="text-[10px] font-bold tracking-[0.35em] text-[#a89060]">
                    UNDEAD RESPONSE UNIT
                  </p>
                  <h1 className="start-screen__title mt-1 text-5xl font-black leading-none tracking-[0.12em] sm:text-7xl">
                    DEAD
                    <br />
                    SECTOR
                  </h1>
                </div>
              </div>

              <p className="max-w-md border-l-2 border-[#c93030] pl-4 text-sm leading-6 text-[#b9b29d]">
                The perimeter has failed. Lock, load, and hold the line until extraction.
              </p>

              {menuMode === "main" ? (
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={onStartSingle}
                    className="start-screen__action start-screen__action--primary group text-left"
                    autoFocus
                  >
                    <span className="flex items-center justify-between">
                      <span>01 / DEPLOY SOLO</span>
                      <Zap className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                    <small>One survivor. No backup.</small>
                  </button>
                  <button
                    onClick={() => onSetMenuMode("splitLobby")}
                    className="start-screen__action group text-left"
                  >
                    <span className="flex items-center justify-between">
                      <span>02 / SPLIT SQUAD</span>
                      <Users className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                    <small>Bring a second survivor.</small>
                  </button>
                </div>
              ) : (
                <div className="mt-8 grid gap-3 sm:grid-cols-2">
                  <button
                    onClick={onStartSplit}
                    className="start-screen__action start-screen__action--primary group text-left"
                    autoFocus
                  >
                    <span className="flex items-center justify-between">
                      <span>DEPLOY SQUAD</span>
                      <Zap className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                    </span>
                    <small>Begin split-screen operation.</small>
                  </button>
                  <button
                    onClick={() => onSetMenuMode("main")}
                    className="start-screen__action text-left"
                  >
                    <span>← RETURN TO MODE SELECT</span>
                    <small>Change operation type.</small>
                  </button>
                </div>
              )}

              <button
                onClick={onOpenSettings}
                className="mt-4 inline-flex items-center gap-2 text-xs font-bold tracking-[0.18em] text-[#a89060] transition-colors hover:text-[#e0b85a] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#c9a24a]"
              >
                <Settings className="h-4 w-4" aria-hidden="true" /> SYSTEM SETTINGS
              </button>
            </section>

            <aside className="bg-black/20 p-6 sm:p-10 lg:p-8">
              {menuMode === "splitLobby" ? (
                <div className="start-screen__info-card border-[#52779c]/50">
                  <div className="flex items-center gap-3 text-[#8fc7ff]">
                    <Gamepad2 className="h-5 w-5" />
                    <span className="text-xs font-bold tracking-[0.2em]">SQUAD LINK</span>
                  </div>
                  <div className="mt-6 space-y-4 text-sm">
                    <p>
                      <span className="block text-[10px] tracking-[0.18em] text-[#77735f]">
                        PLAYER 1
                      </span>
                      Keyboard + mouse
                    </p>
                    <p>
                      <span className="block text-[10px] tracking-[0.18em] text-[#77735f]">
                        PLAYER 2
                      </span>
                      Controller
                    </p>
                    <div
                      className={`border-l-2 pl-3 text-xs leading-5 ${controllerConnected ? "border-[#6fa86f] text-[#90ce90]" : "border-[#c93030] text-[#c8a09a]"}`}
                    >
                      {controllerConnected
                        ? "CONTROLLER DETECTED // READY TO DEPLOY"
                        : "AWAITING CONTROLLER // CONNECT VIA USB OR BLUETOOTH"}
                    </div>
                  </div>
                </div>
              ) : showHelp ? (
                <div className="start-screen__info-card">
                  <div className="flex items-center gap-3 text-[#c9a24a]">
                    <Monitor className="h-5 w-5" />
                    <span className="text-xs font-bold tracking-[0.2em]">FIELD CONTROLS</span>
                  </div>
                  <div className="mt-5 grid gap-2">
                    {controls.map(([key, action]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between border-b border-[#c9a24a]/10 pb-2 text-xs"
                      >
                        <kbd className="rounded border border-[#c9a24a]/30 bg-[#c9a24a]/10 px-2 py-1 font-bold text-[#e0c46f]">
                          {key}
                        </kbd>
                        <span className="text-[#aaa38e]">{action}</span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-5 text-xs leading-5 text-[#827c6c]">
                    Kill undead, earn points, and complete tasks to reach the boss.
                  </p>
                </div>
              ) : null}

              <div className="mt-8 border-t border-[#c9a24a]/15 pt-5 text-[10px] leading-5 tracking-[0.14em] text-[#756f60]">
                THREAT LEVEL: CRITICAL
                <br />
                STATUS: NO EVACUATION
              </div>
            </aside>
          </div>
        </main>
      </div>
    </div>
  );
}

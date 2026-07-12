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
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/70">
      <div className="text-center font-mono max-w-2xl px-6">
        <h1 className="text-6xl md:text-7xl font-bold text-[#c9a24a] tracking-widest drop-shadow-[0_4px_10px_rgba(201,162,74,0.3)]">
          DEAD SECTOR
        </h1>
        <p className="text-[#a89060] mt-2 tracking-[0.4em] text-sm">SURVIVE THE UNDEAD</p>
        {showHelp && menuMode === "main" && (
          <div className="mt-10 text-left text-[#c0c0a0] text-sm space-y-2 bg-black/40 border border-[#3a3a1a] p-6">
            {isMobile ? (
              <>
                <div className="text-[#c9a24a] font-bold text-center tracking-widest">
                  MOBILE CONTROLS
                </div>
                <div className="text-[#c0c0a0] text-center text-xs pt-1">
                  Use the on-screen virtual controls to play.
                </div>
                <div className="pt-3"><span className="text-[#c9a24a] font-bold">LEFT STICK</span> — Move</div>
                <div><span className="text-[#c9a24a] font-bold">RIGHT STICK</span> — Aim &amp; Fire</div>
                <div><span className="text-[#c9a24a] font-bold">RELOAD BUTTON</span> — Reload</div>
                <div><span className="text-[#c9a24a] font-bold">USE BUTTON</span> — Buy weapons / ammo at stations</div>
                <div className="pt-2 text-[#8a8a6a] text-xs">
                  Kill zombies to earn points. Complete Tasks to get to the boss.
                </div>
              </>
            ) : (
              <>
                <div><span className="text-[#c9a24a] font-bold">WASD</span> — Move</div>
                <div><span className="text-[#c9a24a] font-bold">MOUSE</span> — Aim</div>
                <div><span className="text-[#c9a24a] font-bold">LEFT CLICK</span> — Fire</div>
                <div><span className="text-[#c9a24a] font-bold">R</span> — Reload</div>
                <div><span className="text-[#c9a24a] font-bold">E</span> — Buy weapons / ammo at stations</div>
                <div className="pt-2 text-[#8a8a6a] text-xs">
                  Kill zombies to earn points. Complete Tasks to get to the boss.
                </div>
              </>
            )}
          </div>
        )}
        {menuMode === "splitLobby" && (
          <div className="mt-8 text-left text-[#c0c0a0] text-sm space-y-2 bg-black/40 border border-[#3a3a1a] p-6">
            <div className="text-[#c9a24a] font-bold text-center tracking-widest">
              SPLIT SCREEN
            </div>
            <div className="text-[#c0c0a0] text-center text-xs pt-1">
              Connect a controller for Player 2, then deploy.
            </div>
            <div className="pt-3"><span className="text-[#c9a24a] font-bold">PLAYER 1</span> — WASD + Mouse</div>
            <div><span className="text-[#c9a24a] font-bold">PLAYER 2</span> — Controller (Left Stick / Right Stick)</div>
            <div className="pt-2 text-[#8a8a6a] text-xs">
              {controllerConnected ? (
                <span className="text-[#5a5]">Controller connected — ready to deploy!</span>
              ) : (
                "No controller detected yet. Connect one via USB or Bluetooth."
              )}
            </div>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-4">
          {menuMode === "main" ? (
            <>
              <button
                onClick={onStartSingle}
                className="w-64 px-10 py-3 bg-[#c9a24a] text-black font-bold tracking-widest border border-[#c9a24a] hover:bg-[#e0b85a] transition-colors"
              >
                SINGLE PLAYER
              </button>
              <button
                onClick={() => onSetMenuMode("splitLobby")}
                className="w-64 px-10 py-3 bg-transparent text-[#c9a24a] font-bold tracking-widest border border-[#c9a24a] hover:bg-[#c9a24a]/10 transition-colors"
              >
                SPLIT SCREEN
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onStartSplit}
                className="w-64 px-10 py-3 bg-[#c9a24a] text-black font-bold tracking-widest border border-[#c9a24a] hover:bg-[#e0b85a] transition-colors"
              >
                DEPLOY
              </button>
              <button
                onClick={() => onSetMenuMode("main")}
                className="w-64 px-10 py-3 bg-transparent text-[#8a8a6a] font-bold tracking-widest border border-[#3a3a1a] hover:border-[#c9a24a] hover:text-[#c9a24a] transition-colors"
              >
                BACK
              </button>
            </>
          )}
          <button
            onClick={onOpenSettings}
            className="w-64 px-10 py-3 bg-transparent text-[#c9a24a] font-bold tracking-widest border border-[#c9a24a] hover:bg-[#c9a24a]/10 transition-colors"
          >
            SETTINGS
          </button>
        </div>
      </div>
    </div>
  );
}

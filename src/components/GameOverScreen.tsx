type PlayerScore = {
  label: string;
  points: number;
  kills: number;
  shotsFired: number;
  shotsHit: number;
};

type GameOverScreenProps = {
  won: boolean;
  players: PlayerScore[];
  elapsedMs: number;
  actualRound: number;
  onRestart: () => void;
  onOpenSettings: () => void;
};

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms));
  const m = Math.floor(total / 60000);
  const sec = Math.floor((total % 60000) / 1000);
  const cs = Math.floor((total % 1000) / 10);
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

export function GameOverScreen({
  won,
  players,
  elapsedMs,
  actualRound,
  onRestart,
  onOpenSettings,
}: GameOverScreenProps) {
  const scoreBorder = won ? "border-[#3a3a1a]" : "border-[#3a1a1a]";
  const renderScorecard = (player: PlayerScore) => (
    <div className={`min-w-0 flex-1 border ${scoreBorder} bg-black/30 p-4 text-left`}>
      {players.length > 1 && (
        <h2 className="mb-3 text-center text-sm font-bold tracking-widest text-[#a89060]">
          {player.label}
        </h2>
      )}
      <div className="space-y-2 text-sm">
        <div className={`flex justify-between border-b ${scoreBorder} pb-2`}>
          <span className="text-[#8a8a6a]">POINTS</span>
          <span className="font-bold text-[#c9a24a]">{player.points}</span>
        </div>
        <div className={`flex justify-between border-b ${scoreBorder} pb-2`}>
          <span className="text-[#8a8a6a]">KILLS</span>
          <span className="font-bold text-[#c9a24a]">{player.kills}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[#8a8a6a]">ACCURACY</span>
          <span className="font-bold text-[#c9a24a]">
            {player.shotsFired > 0 ? Math.round((player.shotsHit / player.shotsFired) * 100) : 0}%
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className={`text-center font-mono w-full mx-4 ${players.length > 1 ? "max-w-3xl" : "max-w-md"}`}
        style={{ animation: "fadeSlideIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards" }}
      >
        {won ? (
          <>
            <div className="border-2 border-[#c9a24a]/40 bg-black/60 p-8 rounded-sm">
              <h1
                className="text-7xl font-bold text-[#c9a24a] tracking-widest"
                style={{ animation: "pulseGlow 2s ease-in-out infinite" }}
              >
                VICTORY
              </h1>
              <p className="text-[#a89060] mt-3 text-xl tracking-wider">THE HARBINGER HAS FALLEN</p>
              {elapsedMs < 600000 && (
                <div className="mt-3 inline-block px-4 py-1 bg-[#c9a24a]/20 border border-[#c9a24a]/50 rounded-sm">
                  <span className="text-[#c9a24a] font-bold text-lg tracking-widest">
                    {elapsedMs < 480000 ? "S-RANK" : elapsedMs < 600000 ? "A-RANK" : ""}
                  </span>
                </div>
              )}
              <div className="mt-6 text-sm">
                <div className="mb-3 flex justify-between border-b border-[#3a3a1a] pb-2">
                  <span className="text-[#8a8a6a]">TIME</span>
                  <span className="text-[#c9a24a] font-bold tabular-nums">
                    {formatTime(elapsedMs)}
                  </span>
                </div>
                <div className={`flex gap-3 ${players.length > 1 ? "flex-col sm:flex-row" : ""}`}>
                  {players.map((player) => (
                    <div key={player.label} className="contents">
                      {renderScorecard(player)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="border-2 border-[#c93030]/40 bg-black/60 p-8 rounded-sm">
              <h1
                className="text-7xl font-bold text-[#c93030] tracking-widest"
                style={{ animation: "pulseGlowRed 2s ease-in-out infinite" }}
              >
                YOU DIED
              </h1>
              <p className="text-[#a89060] mt-3 text-xl tracking-wider">
                SURVIVED {actualRound} ROUND{actualRound !== 1 ? "S" : ""}
              </p>
              <div className="mt-6 text-sm">
                <div className="mb-3 flex justify-between border-b border-[#3a1a1a] pb-2">
                  <span className="text-[#8a8a6a]">TIME</span>
                  <span className="text-[#c9a24a] font-bold tabular-nums">
                    {formatTime(elapsedMs)}
                  </span>
                </div>
                <div className={`flex gap-3 ${players.length > 1 ? "flex-col sm:flex-row" : ""}`}>
                  {players.map((player) => (
                    <div key={player.label} className="contents">
                      {renderScorecard(player)}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
        <button
          onClick={onRestart}
          className="mt-8 w-64 px-10 py-3 bg-[#c9a24a] text-black font-bold tracking-widest border border-[#c9a24a] hover:bg-[#e0b85a] transition-colors"
        >
          REDEPLOY
        </button>
        <button
          onClick={onOpenSettings}
          className="mt-4 w-64 px-10 py-3 bg-transparent text-[#c9a24a] font-bold tracking-widest border border-[#c9a24a] hover:bg-[#c9a24a]/10 transition-colors"
        >
          SETTINGS
        </button>
      </div>
    </div>
  );
}

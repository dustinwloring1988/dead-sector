import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import type { GameSettings } from "@/hooks/use-settings";

type SettingsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: GameSettings;
  onUpdate: (partial: Partial<GameSettings>) => void;
  isMobile: boolean;
};

export function SettingsModal({
  open,
  onOpenChange,
  settings,
  onUpdate,
  isMobile,
}: SettingsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[#0a0d0a] border-[#3a3a1a] text-[#c0c0a0] font-mono max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#c9a24a] tracking-widest text-lg">SETTINGS</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Music toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-[#a89060]">MUSIC</label>
            <Switch
              checked={settings.musicEnabled}
              onCheckedChange={(checked) => onUpdate({ musicEnabled: checked })}
              className="data-[state=checked]:bg-[#c9a24a] data-[state=unchecked]:bg-[#3a3a1a]"
            />
          </div>

          {/* SFX toggle */}
          <div className="flex items-center justify-between">
            <label className="text-sm text-[#a89060]">SOUND EFFECTS</label>
            <Switch
              checked={settings.sfxEnabled}
              onCheckedChange={(checked) => onUpdate({ sfxEnabled: checked })}
              className="data-[state=checked]:bg-[#c9a24a] data-[state=unchecked]:bg-[#3a3a1a]"
            />
          </div>

          {/* Mobile-only settings */}
          {isMobile && (
            <>
              <div className="border-t border-[#3a3a1a] pt-4 mt-4">
                <p className="text-[10px] text-[#8a8a6a] tracking-widest mb-4">MOBILE OPTIONS</p>
              </div>

              {/* Light intensity slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-[#a89060]">LIGHT INTENSITY</label>
                  <span className="text-xs text-[#8a8a6a] tabular-nums">
                    {Math.round(settings.lightIntensity * 100)}%
                  </span>
                </div>
                <Slider
                  value={[settings.lightIntensity * 100]}
                  onValueChange={([val]) => onUpdate({ lightIntensity: val / 100 })}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full [&_[role=slider]]:bg-[#c9a24a] [&_[role=slider]]:border-[#8a7a3a] [&_.bg-primary]:bg-[#c9a24a]"
                />
              </div>

              {/* Haptic feedback toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-[#a89060]">HAPTIC FEEDBACK</label>
                <Switch
                  checked={settings.hapticEnabled}
                  onCheckedChange={(checked) => onUpdate({ hapticEnabled: checked })}
                  className="data-[state=checked]:bg-[#c9a24a] data-[state=unchecked]:bg-[#3a3a1a]"
                />
              </div>

              {/* Thumbstick size */}
              <div className="flex items-center justify-between">
                <label className="text-sm text-[#a89060]">THUMBSTICK SIZE</label>
                <div className="flex gap-1">
                  {(["normal", "big"] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => onUpdate({ thumbstickSize: opt })}
                      className={`px-3 py-1 text-xs font-mono tracking-wider transition-colors border ${
                        settings.thumbstickSize === opt
                          ? "bg-[#c9a24a] text-black border-[#c9a24a]"
                          : "bg-transparent text-[#8a8a6a] border-[#3a3a1a] hover:border-[#c9a24a] hover:text-[#c9a24a]"
                      }`}
                    >
                      {opt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Camera zoom — available on all devices */}
          <div className="border-t border-[#3a3a1a] pt-4 mt-4">
            <p className="text-[10px] text-[#8a8a6a] tracking-widest mb-4">CAMERA</p>
          </div>
          <div className="flex items-center justify-between">
            <label className="text-sm text-[#a89060]">ZOOM</label>
            <div className="flex gap-1">
              {(["normal", "zoomed"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => onUpdate({ cameraZoom: opt })}
                  className={`px-3 py-1 text-xs font-mono tracking-wider transition-colors border ${
                    settings.cameraZoom === opt
                      ? "bg-[#c9a24a] text-black border-[#c9a24a]"
                      : "bg-transparent text-[#8a8a6a] border-[#3a3a1a] hover:border-[#c9a24a] hover:text-[#c9a24a]"
                  }`}
                >
                  {opt.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

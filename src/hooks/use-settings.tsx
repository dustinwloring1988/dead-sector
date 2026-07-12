import { useCallback, useEffect, useState } from "react";

export type GameSettings = {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  hapticEnabled: boolean;
  lightIntensity: number;
  cameraZoom: "normal" | "zoomed";
  thumbstickSize: "normal" | "big";
};

const STORAGE_KEY = "dead-sector-settings";

const defaults: GameSettings = {
  musicEnabled: true,
  sfxEnabled: true,
  hapticEnabled: true,
  lightIntensity: 1,
  cameraZoom: "normal",
  thumbstickSize: "normal",
};

function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return defaults;
}

function saveSettings(s: GameSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  const update = useCallback((partial: Partial<GameSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  return { settings, update };
}

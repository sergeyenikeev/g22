import { campaignDays } from "../data/gameData";

export interface SaveData {
  version: number;
  chapter: number;
  day: number;
  coins: number;
  reputation: number;
  dayStars: Record<number, number>;
  unlockedRecipeIds: string[];
  boughtUpgradeIds: string[];
  ownedCosmetics: Record<string, string[]>;
  equippedCosmetics: Record<string, string>;
  settings: {
    musicEnabled: boolean;
    soundsEnabled: boolean;
    musicVolume: number;
    soundsVolume: number;
    graphicsQuality: "low" | "medium" | "high";
    hintsEnabled: boolean;
    language: "ru";
  };
  achievements: Record<string, boolean>;
  records: {
    bestTipsDay: number;
    bestCombo: number;
    endlessScore: number;
    dailyChallengeScore: number;
  };
  lastDailyChallengeDate: string;
}

const SAVE_VERSION = 1;
const SAVE_KEY = "tea-run-save";

export class SaveService {
  createDefaultSave(): SaveData {
    return {
      version: SAVE_VERSION,
      chapter: 1,
      day: 1,
      coins: 300,
      reputation: 0,
      dayStars: {},
      unlockedRecipeIds: ["r01", "r02", "r03"],
      boughtUpgradeIds: [],
      ownedCosmetics: {},
      equippedCosmetics: {},
      settings: {
        musicEnabled: true,
        soundsEnabled: true,
        musicVolume: 0.5,
        soundsVolume: 0.7,
        graphicsQuality: "high",
        hintsEnabled: true,
        language: "ru"
      },
      achievements: {},
      records: {
        bestTipsDay: 0,
        bestCombo: 0,
        endlessScore: 0,
        dailyChallengeScore: 0
      },
      lastDailyChallengeDate: ""
    };
  }

  load(): SaveData {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return this.createDefaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return this.migrate(parsed);
    } catch {
      return this.createDefaultSave();
    }
  }

  save(data: SaveData): void {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  }

  reset(): SaveData {
    const fresh = this.createDefaultSave();
    this.save(fresh);
    return fresh;
  }

  private migrate(data: Partial<SaveData>): SaveData {
    const base = this.createDefaultSave();
    const merged: SaveData = {
      ...base,
      ...data,
      settings: { ...base.settings, ...data.settings },
      records: { ...base.records, ...data.records },
      dayStars: { ...base.dayStars, ...data.dayStars },
      achievements: { ...base.achievements, ...data.achievements },
      ownedCosmetics: { ...base.ownedCosmetics, ...data.ownedCosmetics },
      equippedCosmetics: { ...base.equippedCosmetics, ...data.equippedCosmetics }
    };
    if (merged.version !== SAVE_VERSION) {
      merged.version = SAVE_VERSION;
    }
    merged.day = Math.max(1, Math.min(campaignDays.length, merged.day));
    if (!["low", "medium", "high"].includes(merged.settings.graphicsQuality)) {
      merged.settings.graphicsQuality = "high";
    }
    return merged;
  }
}

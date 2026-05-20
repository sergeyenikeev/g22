import { campaignDays, cosmetics } from "../data/gameData";

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
    totalServed: number;
    campaignCompleted: boolean;
  };
  lastDailyChallengeDate: string;
}

const SAVE_VERSION = 1;
const SAVE_KEY = "tea-run-save";

const createDefaultOwnedCosmetics = (): Record<string, string[]> =>
  Object.fromEntries(Object.entries(cosmetics).map(([category, items]) => [category, [items[0]]]));

const createDefaultEquippedCosmetics = (): Record<string, string> =>
  Object.fromEntries(Object.entries(cosmetics).map(([category, items]) => [category, items[0]]));

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
      ownedCosmetics: createDefaultOwnedCosmetics(),
      equippedCosmetics: createDefaultEquippedCosmetics(),
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
        dailyChallengeScore: 0,
        totalServed: 0,
        campaignCompleted: false
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

  normalize(data: Partial<SaveData>): SaveData {
    return this.migrate(data);
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
    merged.unlockedRecipeIds = merged.unlockedRecipeIds.filter((id, index, list) => id.startsWith("r") && list.indexOf(id) === index);
    if (merged.unlockedRecipeIds.length === 0) merged.unlockedRecipeIds = [...base.unlockedRecipeIds];
    for (const [category, items] of Object.entries(cosmetics)) {
      const owned = (merged.ownedCosmetics[category] ?? []).filter((item, index, list) => items.includes(item) && list.indexOf(item) === index);
      merged.ownedCosmetics[category] = owned.length ? owned : [items[0]];
      if (!merged.ownedCosmetics[category].includes(merged.equippedCosmetics[category])) {
        merged.equippedCosmetics[category] = merged.ownedCosmetics[category][0];
      }
    }
    return merged;
  }
}

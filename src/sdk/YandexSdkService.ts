declare global {
  interface Window {
    YaGames?: {
      init: () => Promise<any>;
    };
  }
}

export interface SdkContext {
  language: string;
  hasSdk: boolean;
  ysdk: any | null;
  player: any | null;
}

export class YandexSdkService {
  private context: SdkContext = {
    language: "ru",
    hasSdk: false,
    ysdk: null,
    player: null
  };

  async init(): Promise<SdkContext> {
    if (!window.YaGames?.init) {
      this.context = { language: "ru", hasSdk: false, ysdk: null, player: null };
      return this.context;
    }
    try {
      const ysdk = await window.YaGames.init();
      const lang = ysdk?.environment?.i18n?.lang ?? "ru";
      this.context = { language: lang, hasSdk: true, ysdk, player: null };
      return this.context;
    } catch {
      this.context = { language: "ru", hasSdk: false, ysdk: null, player: null };
      return this.context;
    }
  }

  async requestPlayer(): Promise<any | null> {
    const getPlayer = this.context.ysdk?.getPlayer;
    if (typeof getPlayer !== "function") return null;
    try {
      const player = await getPlayer.call(this.context.ysdk, { scopes: true });
      this.context.player = player;
      return player;
    } catch {
      return null;
    }
  }

  async getPlayer(): Promise<any | null> {
    if (this.context.player) return this.context.player;
    const getPlayer = this.context.ysdk?.getPlayer;
    if (typeof getPlayer !== "function") return null;
    try {
      const player = await getPlayer.call(this.context.ysdk, { scopes: false });
      this.context.player = player;
      return player;
    } catch {
      return null;
    }
  }

  getContext(): SdkContext {
    return this.context;
  }

  async loadingReady(): Promise<void> {
    const readyFn = this.context.ysdk?.features?.LoadingAPI?.ready;
    if (typeof readyFn === "function") await readyFn.call(this.context.ysdk.features.LoadingAPI);
  }

  gameplayStart(): void {
    const fn = this.context.ysdk?.features?.GameplayAPI?.start;
    if (typeof fn === "function") fn.call(this.context.ysdk.features.GameplayAPI);
  }

  gameplayStop(): void {
    const fn = this.context.ysdk?.features?.GameplayAPI?.stop;
    if (typeof fn === "function") fn.call(this.context.ysdk.features.GameplayAPI);
  }

  async showFullscreenAd(): Promise<void> {
    const ad = this.context.ysdk?.adv;
    if (!ad?.showFullscreenAdv) return;
    await new Promise<void>((resolve) => {
      ad.showFullscreenAdv({
        callbacks: {
          onClose: () => resolve(),
          onError: () => resolve()
        }
      });
    });
  }

  async loadCloudSave<T>(): Promise<Partial<T> | null> {
    const player = await this.getPlayer();
    if (!player || typeof player.getData !== "function") return null;
    try {
      const data = await player.getData(["saveData"]);
      return data?.saveData ?? null;
    } catch {
      return null;
    }
  }

  async saveCloudData(data: unknown): Promise<void> {
    const player = await this.getPlayer();
    if (!player || typeof player.setData !== "function") return;
    try {
      await player.setData({ saveData: data }, false);
    } catch {
      // Cloud saves are optional; local progress remains authoritative offline.
    }
  }

  async setLeaderboardScore(name: string, score: number): Promise<void> {
    const getLeaderboards = this.context.ysdk?.getLeaderboards;
    if (typeof getLeaderboards !== "function") return;
    try {
      const leaderboards = await getLeaderboards.call(this.context.ysdk);
      if (typeof leaderboards?.setLeaderboardScore === "function") {
        await leaderboards.setLeaderboardScore(name, score);
      }
    } catch {
      // Leaderboards may be absent in local builds or not configured in the console yet.
    }
  }
}

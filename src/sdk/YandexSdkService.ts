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
}

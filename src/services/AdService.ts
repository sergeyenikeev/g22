import { YandexSdkService } from "../sdk/YandexSdkService";

export class AdService {
  constructor(private readonly sdk: YandexSdkService) {}

  async showBetweenDays(allow: boolean, resumeAfter = false): Promise<void> {
    if (!allow) return;
    this.sdk.gameplayStop();
    await this.sdk.showFullscreenAd();
    if (resumeAfter) this.sdk.gameplayStart();
  }
}

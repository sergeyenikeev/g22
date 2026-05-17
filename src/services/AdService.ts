import { YandexSdkService } from "../sdk/YandexSdkService";

export class AdService {
  constructor(private readonly sdk: YandexSdkService) {}

  async showBetweenDays(allow: boolean): Promise<void> {
    if (!allow) return;
    this.sdk.gameplayStop();
    await this.sdk.showFullscreenAd();
    this.sdk.gameplayStart();
  }
}

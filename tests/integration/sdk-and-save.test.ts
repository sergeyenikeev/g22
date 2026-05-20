import { LocalizationService } from "../../src/services/LocalizationService";
import { SaveService } from "../../src/services/SaveService";
import { YandexSdkService } from "../../src/sdk/YandexSdkService";

describe("интеграция SDK и i18n", () => {
  it("живет без SDK Яндекса", async () => {
    const sdk = new YandexSdkService();
    const ctx = await sdk.init();
    expect(ctx.hasSdk).toBe(false);
  });

  it("держит русский язык при неизвестной локали SDK", async () => {
    (window as any).YaGames = {
      init: async () => ({
        environment: { i18n: { lang: "tr" } },
        features: {}
      })
    };
    const sdk = new YandexSdkService();
    const i18n = new LocalizationService();
    const ctx = await sdk.init();
    i18n.setLanguage(ctx.language);
    expect(i18n.getLanguage()).toBe("ru");
    delete (window as any).YaGames;
  });

  it("мягко работает с облачными данными SDK", async () => {
    let savedCloud: unknown = null;
    (window as any).YaGames = {
      init: async () => ({
        environment: { i18n: { lang: "ru" } },
        features: {},
        getPlayer: async () => ({
          getData: async () => ({ saveData: { coins: 555 } }),
          setData: async (data: { saveData: unknown }) => {
            savedCloud = data.saveData;
          }
        })
      })
    };
    const sdk = new YandexSdkService();
    await sdk.init();
    const cloud = await sdk.loadCloudSave<{ coins: number }>();
    expect(cloud?.coins).toBe(555);
    await sdk.saveCloudData({ coins: 888 });
    expect(savedCloud).toEqual({ coins: 888 });
    delete (window as any).YaGames;
  });
});

describe("интеграция сохранений", () => {
  it("сохраняет и загружает прогресс", () => {
    const save = new SaveService();
    const data = save.createDefaultSave();
    data.coins = 777;
    save.save(data);
    const loaded = save.load();
    expect(loaded.coins).toBe(777);
  });
});

import "./styles.css";
import { GameApp } from "./app/GameApp";
import { YandexSdkService } from "./sdk/YandexSdkService";
import { AdService } from "./services/AdService";
import { AudioService } from "./services/AudioService";
import { LocalizationService } from "./services/LocalizationService";
import { Logger } from "./services/Logger";
import { ResponsiveLayoutService } from "./services/ResponsiveLayoutService";
import { SaveService } from "./services/SaveService";
import { ComboSystem, EconomySystem, OrderSystem, RecipeSystem, TemperatureSystem, TimingSystem, UpgradeSystem } from "./systems/systems";

document.addEventListener("contextmenu", (event) => event.preventDefault());

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Корневой контейнер не найден");
}

const localization = new LocalizationService();
const sdk = new YandexSdkService();
const logger = new Logger(import.meta.env.DEV);
const save = new SaveService();
const audio = new AudioService();
const responsive = new ResponsiveLayoutService();
const adService = new AdService(sdk);

const app = new GameApp(
  root,
  sdk,
  localization,
  save,
  logger,
  audio,
  responsive,
  adService,
  new RecipeSystem(),
  new OrderSystem(),
  new TimingSystem(),
  new TemperatureSystem(),
  new ComboSystem(),
  new EconomySystem(),
  new UpgradeSystem()
);

const renderFallback = () => {
  root.innerHTML = `
    <div class="warning-screen">
      <div>
        <div style="font-size:30px;margin-bottom:12px;">${localization.t("startupError")}</div>
        <button class="btn" id="retry-boot">${localization.t("retry")}</button>
      </div>
    </div>
  `;
  root.querySelector<HTMLButtonElement>("#retry-boot")?.addEventListener("click", () => {
    void boot();
  });
};

const boot = async () => {
  try {
    await app.start();
  } catch (error) {
    logger.error("Сбой запуска игры", error);
    renderFallback();
  }
};

window.onerror = () => {
  renderFallback();
  return true;
};
window.addEventListener("unhandledrejection", () => {
  renderFallback();
});

void boot();

import {
  achievements,
  campaignDays,
  clientTypes,
  cosmeticCategoryLabels,
  cosmeticPrices,
  cosmetics,
  recipes,
  upgrades
} from "../data/gameData";
import type { AchievementDefinition, ClientType, CosmeticCategory, IngredientId, Recipe } from "../data/gameData";
import { YandexSdkService } from "../sdk/YandexSdkService";
import { AdService } from "../services/AdService";
import { AudioService } from "../services/AudioService";
import { LocalizationService } from "../services/LocalizationService";
import { Logger } from "../services/Logger";
import { ResponsiveLayoutService } from "../services/ResponsiveLayoutService";
import { SaveService, type SaveData } from "../services/SaveService";
import { ComboSystem, EconomySystem, OrderSystem, RecipeSystem, TemperatureSystem, TimingSystem, UpgradeSystem } from "../systems/systems";
import type { ActiveOrder } from "../systems/systems";

type ScreenId = "loading" | "menu" | "campaign" | "game" | "pause" | "results" | "recipes" | "upgrades" | "cosmetics" | "achievements" | "settings" | "how" | "about";
type FeedbackKind = "perfect" | "good" | "miss" | "win";
type GameMode = "campaign" | "endless" | "blitz" | "practice";
type FinishReason = "complete" | "timeout" | "lost" | "manual";

interface RunResult {
  title: string;
  mode: GameMode;
  reason: FinishReason;
  served: number;
  lost: number;
  coins: number;
  tips: number;
  combo: number;
  quality: number;
  stars: number;
  goal: string;
  unlocked: string[];
  achievements: string[];
}

const ingredientLabels: Record<IngredientId, string> = {
  cup: "чашка",
  glass: "стакан",
  holder: "подстаканник",
  kettle: "чайник",
  boilingWater: "кипяток",
  blackTea: "черный чай",
  greenTea: "зеленый чай",
  herbalTea: "травяной чай",
  strongTea: "крепкая заварка",
  sugar: "сахар",
  lemon: "лимон",
  honey: "мед",
  jam: "варенье",
  mint: "мята",
  cinnamon: "корица",
  ginger: "имбирь",
  seaberry: "облепиха",
  bagel: "баранка",
  cookie: "печенье",
  pie: "пирог"
};

const ingredientShortLabels: Record<IngredientId, string> = {
  cup: "Ч",
  glass: "С",
  holder: "П",
  kettle: "К",
  boilingWater: "В",
  blackTea: "Чр",
  greenTea: "Зл",
  herbalTea: "Тр",
  strongTea: "Кр",
  sugar: "Сх",
  lemon: "Л",
  honey: "М",
  jam: "Вр",
  mint: "Мт",
  cinnamon: "Кц",
  ginger: "Им",
  seaberry: "Об",
  bagel: "Б",
  cookie: "Пч",
  pie: "Пг"
};

const modeLabels: Record<GameMode, string> = {
  campaign: "Кампания",
  endless: "Бесконечная смена",
  blitz: "Чайный блиц",
  practice: "Тренировка"
};

const categoryOrder: CosmeticCategory[] = ["cups", "samovars", "tablecloths", "trays", "backgrounds", "steamEffects"];

export class GameApp {
  private currentScreen: ScreenId = "loading";
  private root: HTMLElement;
  private save: SaveData;
  private activeOrder: ActiveOrder;
  private currentRecipe: Recipe;
  private currentClient: ClientType = clientTypes[0];
  private activeMode: GameMode = "campaign";
  private practiceRecipeId = "";
  private targetOrders = 6;
  private timeLimitMs = 0;
  private runStartedAt = 0;
  private orderStartedAt = 0;
  private temperature = 78;
  private served = 0;
  private lost = 0;
  private dayTips = 0;
  private dayCoins = 0;
  private quality = 1;
  private running = false;
  private handlersBound = false;
  private ringRotation = [0, 0, 0, 0];
  private activeRing = 0;
  private animationId = 0;
  private holdStart = 0;
  private feedback: FeedbackKind | null = null;
  private feedbackStarted = 0;
  private feedbackUntil = 0;
  private lastResult: RunResult | null = null;
  private cloudStatus = "";

  constructor(
    app: HTMLElement,
    private readonly sdk: YandexSdkService,
    private readonly i18n: LocalizationService,
    private readonly saveService: SaveService,
    private readonly logger: Logger,
    private readonly audio: AudioService,
    private readonly layout: ResponsiveLayoutService,
    private readonly adService: AdService,
    private readonly recipeSystem: RecipeSystem,
    private readonly orderSystem: OrderSystem,
    private readonly timingSystem: TimingSystem,
    private readonly temperatureSystem: TemperatureSystem,
    private readonly comboSystem: ComboSystem,
    private readonly economySystem: EconomySystem,
    private readonly upgradeSystem: UpgradeSystem
  ) {
    this.root = app;
    this.save = this.saveService.load();
    this.activeOrder = this.orderSystem.createOrder(this.save.unlockedRecipeIds[0]);
    this.currentRecipe = this.recipeSystem.getById(this.activeOrder.recipeId) ?? recipes[0];
  }

  async start(): Promise<void> {
    this.bindGlobalHandlers();
    await this.initializeSdk();
    await this.loadCloudProgress();
    this.applyAudioSettings();
    this.currentScreen = "menu";
    this.render();
  }

  private async initializeSdk(): Promise<void> {
    this.renderLoading();
    const sdkInfo = await this.sdk.init();
    this.i18n.setLanguage(sdkInfo.language);
    await this.sdk.loadingReady();
  }

  private async loadCloudProgress(): Promise<void> {
    const cloud = await this.sdk.loadCloudSave<SaveData>();
    if (!cloud) return;
    this.save = this.saveService.normalize(cloud);
    this.saveService.save(this.save);
    this.cloudStatus = this.i18n.t("cloudConnected");
  }

  private applyAudioSettings(): void {
    this.audio.setVolumes(this.save.settings.musicVolume, this.save.settings.soundsVolume);
    this.audio.setSoundsEnabled(this.save.settings.soundsEnabled);
    if (!this.save.settings.musicEnabled) this.audio.setMusicEnabled(false);
  }

  private saveProgress(): void {
    this.saveService.save(this.save);
    void this.sdk.saveCloudData(this.save);
  }

  private bindGlobalHandlers(): void {
    if (this.handlersBound) return;
    this.handlersBound = true;
    window.addEventListener("resize", () => this.render());
    document.addEventListener("keydown", (event) => this.onKey(event));
    document.addEventListener("mousedown", (event) => {
      if (this.currentScreen === "game" && event.button === 2) {
        this.activeRing = (this.activeRing + 3) % 4;
        this.render();
      }
      this.holdStart = performance.now();
    });
    document.addEventListener("mouseup", () => this.heatByHold());
  }

  private onKey(event: KeyboardEvent): void {
    if (this.currentScreen === "pause") {
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        this.resumeRun();
      }
      return;
    }
    if (this.currentScreen !== "game") return;
    if (event.code === "KeyQ") this.activeRing = (this.activeRing + 3) % 4;
    if (event.code === "KeyE") this.activeRing = (this.activeRing + 1) % 4;
    if (["1", "2", "3", "4"].includes(event.key)) this.activeRing = Number(event.key) - 1;
    if (event.key === " ") {
      event.preventDefault();
      this.makeShot();
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.completeOrder();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.pauseRun();
      return;
    }
    this.render();
  }

  private beginRun(mode: GameMode, recipeId = ""): void {
    cancelAnimationFrame(this.animationId);
    this.activeMode = mode;
    this.practiceRecipeId = recipeId;
    this.served = 0;
    this.lost = 0;
    this.dayTips = 0;
    this.dayCoins = 0;
    this.quality = 1;
    this.temperature = mode === "blitz" ? 86 : 78;
    this.comboSystem.combo = 0;
    this.comboSystem.boost = 0;
    this.targetOrders = mode === "practice" ? 3 : mode === "blitz" ? 7 : mode === "campaign" ? 6 : 999;
    this.timeLimitMs = mode === "blitz" ? 75_000 : 0;
    this.runStartedAt = performance.now();
    this.orderStartedAt = this.runStartedAt;
    this.createNextOrder();
    this.currentScreen = "game";
    this.running = true;
    this.sdk.gameplayStart();
    this.render();
    this.loop();
  }

  private pauseRun(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.animationId);
    this.sdk.gameplayStop();
    this.currentScreen = "pause";
    this.render();
  }

  private resumeRun(): void {
    if (this.currentScreen !== "pause") return;
    this.running = true;
    this.currentScreen = "game";
    this.orderStartedAt = performance.now();
    this.sdk.gameplayStart();
    this.render();
    this.loop();
  }

  private heatByHold(): void {
    if (!this.running || this.currentScreen !== "game") return;
    const hold = performance.now() - this.holdStart;
    if (hold > 250) {
      this.temperature = Math.min(100, this.temperature + 4 + this.ownedUpgradeCount("samovars") * 0.18);
      this.audio.playSfx("hit");
      this.render();
    }
  }

  private loop(): void {
    if (!this.running || this.currentScreen !== "game") return;
    const now = performance.now();
    const stabilizer = Math.min(0.28, this.ownedUpgradeCount("samovars") * 0.012);
    const modeSpeed = this.activeMode === "blitz" ? 1.32 : this.activeMode === "practice" ? 0.82 : 1;
    this.ringRotation = this.ringRotation.map((value, idx) => value + (0.006 + idx * 0.002 + this.comboSystem.boost * 0.00001) * modeSpeed * (1 - stabilizer));
    const coolingBonus = Math.min(0.35, this.ownedUpgradeCount("kitchen") * 0.018);
    const modeCooling = this.activeMode === "blitz" ? 1.25 : 1;
    this.temperature = Math.max(45, this.temperature - 0.02 * modeCooling * (1 - coolingBonus));
    this.updateRunTimers(now);
    if (!this.running) return;
    this.drawCanvas();
    this.animationId = requestAnimationFrame(() => this.loop());
  }

  private updateRunTimers(now: number): void {
    if (this.timeLimitMs > 0 && now - this.runStartedAt >= this.timeLimitMs) {
      void this.finishRun("timeout");
      return;
    }
    if (now - this.orderStartedAt >= this.getOrderPatienceMs()) {
      this.loseOrder();
      return;
    }
    this.updateLiveHud(now);
  }

  private updateLiveHud(now: number): void {
    const patience = this.getPatiencePercent(now);
    const patienceBar = document.querySelector<HTMLElement>("#order-patience-bar");
    const patienceText = document.querySelector<HTMLElement>("#order-patience-text");
    const runClock = document.querySelector<HTMLElement>("#run-clock");
    const tempText = document.querySelector<HTMLElement>("#temp-value");
    const qualityText = document.querySelector<HTMLElement>("#quality-value");
    if (patienceBar) patienceBar.style.width = `${patience}%`;
    if (patienceText) patienceText.textContent = `${Math.ceil((this.getOrderPatienceMs() - (now - this.orderStartedAt)) / 1000)} с`;
    if (runClock && this.timeLimitMs > 0) runClock.textContent = this.formatTime(Math.max(0, this.timeLimitMs - (now - this.runStartedAt)));
    if (tempText) tempText.textContent = `${this.temperature.toFixed(0)}°`;
    if (qualityText) qualityText.textContent = `${Math.min(100, this.quality * 100).toFixed(0)}%`;
  }

  private drawCanvas(): void {
    const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = 720;
    canvas.width = size;
    canvas.height = size;
    const now = performance.now();
    ctx.clearRect(0, 0, size, size);

    this.drawTeaRoom(ctx, now, size);
    ctx.save();
    ctx.translate(size / 2, size / 2 + 8);
    this.drawRings(ctx, now);
    this.drawSamovar(ctx, now);
    this.drawFeedback(ctx, now);
    ctx.restore();
  }

  private drawTeaRoom(ctx: CanvasRenderingContext2D, now: number, size: number): void {
    const background = this.getEquippedCosmetic("backgrounds");
    const tablecloth = this.getEquippedCosmetic("tablecloths");
    const wall = ctx.createLinearGradient(0, 0, 0, size);
    if (background === "Шумный вокзал") {
      wall.addColorStop(0, "#38445b");
      wall.addColorStop(0.48, "#6d5638");
      wall.addColorStop(1, "#1a1717");
    } else if (background === "Снежная ярмарка") {
      wall.addColorStop(0, "#32495a");
      wall.addColorStop(0.52, "#7a4a31");
      wall.addColorStop(1, "#15151c");
    } else if (background === "Театральный зал") {
      wall.addColorStop(0, "#4a1630");
      wall.addColorStop(0.5, "#6d3828");
      wall.addColorStop(1, "#160d13");
    } else if (background === "Фестивальная площадь") {
      wall.addColorStop(0, "#1f4b4d");
      wall.addColorStop(0.52, "#814425");
      wall.addColorStop(1, "#17100e");
    } else {
      wall.addColorStop(0, "#59331e");
      wall.addColorStop(0.42, "#7c4724");
      wall.addColorStop(0.72, "#3a2116");
      wall.addColorStop(1, "#17100e");
    }
    ctx.fillStyle = wall;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = "rgba(255, 221, 158, 0.12)";
    for (let y = 54; y < 440; y += 74) {
      ctx.fillRect(0, y, size, 2);
    }

    const windowGlow = ctx.createRadialGradient(560, 96, 10, 560, 96, 210);
    windowGlow.addColorStop(0, "rgba(255, 226, 146, 0.36)");
    windowGlow.addColorStop(1, "rgba(255, 226, 146, 0)");
    ctx.fillStyle = windowGlow;
    ctx.fillRect(360, 0, 360, 280);

    ctx.fillStyle = "rgba(80, 46, 24, 0.86)";
    ctx.fillRect(412, 38, 218, 154);
    ctx.fillStyle = "rgba(255, 213, 132, 0.34)";
    ctx.fillRect(428, 54, 82, 122);
    ctx.fillRect(532, 54, 82, 122);
    ctx.fillStyle = "rgba(45, 24, 15, 0.72)";
    ctx.fillRect(516, 46, 8, 138);
    ctx.fillRect(421, 112, 202, 8);

    const table = ctx.createLinearGradient(0, 500, 0, size);
    table.addColorStop(0, tablecloth === "Красная скатерть" ? "#a83f34" : tablecloth === "Звездная скатерть" ? "#314e6e" : "#9c5627");
    table.addColorStop(1, tablecloth === "Красная скатерть" ? "#4d1718" : tablecloth === "Звездная скатерть" ? "#172337" : "#4c2617");
    ctx.fillStyle = table;
    ctx.fillRect(0, 500, size, 220);
    ctx.fillStyle = "rgba(255, 232, 188, 0.12)";
    for (let x = -80; x < size; x += 98) {
      ctx.save();
      ctx.translate(x + ((now * 0.006) % 98), 500);
      ctx.rotate(-0.5);
      ctx.fillRect(0, 0, 18, 260);
      ctx.restore();
    }

    for (let i = 0; i < 18; i += 1) {
      const x = (i * 89 + now * 0.018) % 820 - 50;
      const y = 80 + ((i * 53) % 440) - Math.sin(now * 0.001 + i) * 10;
      ctx.fillStyle = `rgba(255, 236, 184, ${0.07 + (i % 3) * 0.03})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 20 + (i % 4) * 9, 6 + (i % 3) * 3, -0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawRings(ctx: CanvasRenderingContext2D, now: number): void {
    const radii = [120, 185, 250, 305];
    const progressIndex = Math.min(this.activeOrder.index, this.currentRecipe.ingredients.length - 1);
    const expected = this.currentRecipe.ingredients[progressIndex];
    const pulse = this.feedback && now < this.feedbackUntil ? 1 + Math.sin(now * 0.035) * 0.035 : 1;
    ctx.save();
    ctx.scale(pulse, pulse);

    radii.forEach((r, i) => {
      const active = i === this.activeRing;
      ctx.beginPath();
      ctx.lineWidth = active ? 24 : 12;
      ctx.strokeStyle = active ? "#fff0a8" : "rgba(198, 111, 49, 0.92)";
      ctx.shadowColor = active ? "rgba(255, 225, 127, 0.86)" : "rgba(0, 0, 0, 0.42)";
      ctx.shadowBlur = active ? 22 : 9;
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      for (let k = 0; k < 8; k += 1) {
        const angle = this.ringRotation[i] + (Math.PI * 2 * k) / 8;
        const tokenIngredient = this.currentRecipe.ingredients[(k + i) % this.currentRecipe.ingredients.length];
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        const isTarget = active && tokenIngredient === expected;
        const token = ctx.createRadialGradient(x - 6, y - 8, 2, x, y, active ? 17 : 13);
        token.addColorStop(0, isTarget ? "#ffffff" : "#ffe6ba");
        token.addColorStop(1, isTarget ? "#66ffc1" : "#d57b31");
        ctx.fillStyle = token;
        ctx.beginPath();
        ctx.arc(x, y, active ? 17 : 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = isTarget ? "#08301d" : "#3a1d0e";
        ctx.font = `800 ${active ? 13 : 10}px Segoe UI`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ingredientShortLabels[tokenIngredient], x, y + 1);
      }
    });

    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.arc(0, 0, radii[this.activeRing], -0.34, 0.34);
    ctx.stroke();

    ctx.restore();
  }

  private drawSamovar(ctx: CanvasRenderingContext2D, now: number): void {
    const palette = this.getSamovarPalette();
    const steam = this.getEquippedCosmetic("steamEffects");
    const body = ctx.createRadialGradient(-36, -48, 10, 0, 0, 122);
    body.addColorStop(0, palette.light);
    body.addColorStop(0.38, palette.mid);
    body.addColorStop(0.74, palette.dark);
    body.addColorStop(1, "#4b2312");
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 8, 92, 118, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = palette.mid;
    ctx.fillRect(-30, -132, 60, 54);
    ctx.beginPath();
    ctx.ellipse(0, -138, 44, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a2d17";
    ctx.fillRect(-46, 115, 92, 20);
    ctx.fillStyle = palette.light;
    ctx.beginPath();
    ctx.arc(0, -34, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#32180e";
    ctx.font = "800 18px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("самовар", 0, -34);

    ctx.strokeStyle = palette.light;
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-86, -14);
    ctx.quadraticCurveTo(-132, 0, -118, 52);
    ctx.moveTo(86, -14);
    ctx.quadraticCurveTo(132, 0, 118, 52);
    ctx.stroke();

    ctx.fillStyle = palette.light;
    ctx.fillRect(72, 18, 70, 12);
    ctx.beginPath();
    ctx.arc(152, 24, 14, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 7; i += 1) {
      const drift = Math.sin(now * 0.0018 + i) * (steam === "Искристый пар" ? 20 : 14);
      ctx.strokeStyle =
        steam === "Зимний пар"
          ? `rgba(190, 231, 255, ${0.2 + i * 0.04})`
          : steam === "Искристый пар"
            ? `rgba(255, 244, 179, ${0.2 + i * 0.05})`
            : `rgba(255, 245, 213, ${0.18 + i * 0.04})`;
      ctx.lineWidth = 5 - i * 0.28;
      ctx.beginPath();
      ctx.moveTo(-28 + i * 9, -150);
      ctx.bezierCurveTo(-55 + drift, -184 - i * 8, 38 + drift, -218 - i * 7, 4 + drift, -258 - i * 5);
      ctx.stroke();
    }

    const tempRatio = Math.max(0, Math.min(1, (this.temperature - 45) / 55));
    ctx.fillStyle = "rgba(42, 20, 10, 0.72)";
    ctx.fillRect(-92, 150, 184, 18);
    const temp = ctx.createLinearGradient(-88, 0, 88, 0);
    temp.addColorStop(0, "#78d7ff");
    temp.addColorStop(0.58, "#ffe47a");
    temp.addColorStop(1, "#ff725f");
    ctx.fillStyle = temp;
    ctx.fillRect(-88, 154, 176 * tempRatio, 10);
  }

  private drawFeedback(ctx: CanvasRenderingContext2D, now: number): void {
    if (!this.feedback || now > this.feedbackUntil) return;
    const elapsed = now - this.feedbackStarted;
    const alpha = Math.max(0, 1 - elapsed / (this.feedback === "win" ? 1200 : 650));
    const text = this.feedbackText(this.feedback);
    const success = this.feedback !== "miss";

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = success ? "rgba(95, 255, 176, 0.2)" : "rgba(255, 86, 86, 0.2)";
    ctx.beginPath();
    ctx.arc(0, 0, 180 + elapsed * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = success ? "#c8ffd9" : "#ffd0cb";
    ctx.shadowColor = success ? "rgba(99, 255, 178, 0.8)" : "rgba(255, 86, 86, 0.82)";
    ctx.shadowBlur = 22;
    ctx.font = `900 ${this.feedback === "win" ? 52 : 44}px Segoe UI`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, -160 - elapsed * 0.025);
    ctx.restore();
  }

  private feedbackText(type: FeedbackKind): string {
    if (type === "perfect") return "Точно!";
    if (type === "good") return "Хорошо!";
    if (type === "win") return "Готово!";
    return "Промах!";
  }

  private makeShot(): void {
    if (!this.running || this.currentScreen !== "game") return;
    const precisionBonus = 1 - Math.min(0.35, this.ownedUpgradeCount("samovars") * 0.018);
    const delta = Math.sin(this.ringRotation[this.activeRing]) * 0.15 * precisionBonus;
    const hit = this.timingSystem.evaluate(delta);
    const feedback: FeedbackKind = hit === "perfect" ? "perfect" : hit === "good" ? "good" : "miss";
    this.comboSystem.add(hit);

    if (hit === "perfect" || hit === "good") {
      const ingredient = this.currentRecipe.ingredients[this.activeOrder.index];
      if (ingredient) this.orderSystem.addIngredient(this.activeOrder, this.currentRecipe, ingredient);
      this.audio.playSfx(hit === "perfect" ? "perfect" : "hit");
    } else {
      this.activeOrder.mistakes += 1;
      this.audio.playSfx("error");
    }

    this.showFeedback(feedback);
    this.quality = Math.max(0.1, this.quality + (hit === "perfect" ? 0.06 : hit === "good" ? 0.01 : -0.09));
    this.render();
  }

  private completeOrder(): void {
    if (!this.running || this.currentScreen !== "game") return;
    const qualityByTemp = this.temperatureSystem.evaluate(this.temperature, this.currentRecipe.idealTemp);
    const progress = this.activeOrder.index / this.currentRecipe.ingredients.length;
    const progressQuality = this.activeOrder.done ? 1 : Math.max(0.35, progress * 0.82);
    const mistakePenalty = Math.max(0.55, 1 - this.activeOrder.mistakes * 0.12);
    const strictnessPenalty = Math.max(0.72, 1 - Math.max(0, this.currentClient.qualityStrictness - 1) * 0.15);
    const serviceBonus = 1 + Math.min(0.28, this.ownedUpgradeCount("service") * 0.015);
    const totalQuality = Math.max(0.1, ((this.quality + qualityByTemp + progressQuality) / 3) * mistakePenalty * strictnessPenalty);
    const reward =
      this.activeMode === "practice"
        ? 0
        : this.economySystem.reward(this.currentRecipe.reward, totalQuality * serviceBonus, this.comboSystem.tipMultiplier());
    this.dayTips += Math.round(reward * 0.35);
    this.dayCoins += reward;
    this.save.coins += reward;
    this.save.reputation += Math.max(1, Math.round(totalQuality * 3));
    this.save.records.totalServed += 1;
    this.served += 1;
    this.audio.playSfx("win");
    this.showFeedback("win");
    this.saveProgress();

    if (this.shouldFinishRun()) {
      void this.finishRun("complete");
    } else {
      this.createNextOrder();
      this.render();
    }
  }

  private loseOrder(): void {
    if (!this.running) return;
    this.lost += 1;
    this.quality = Math.max(0.1, this.quality - 0.14);
    this.comboSystem.combo = 0;
    this.comboSystem.boost = 0;
    this.audio.playSfx("error");
    this.showFeedback("miss");
    if (this.shouldFinishRun()) {
      void this.finishRun(this.activeMode === "endless" ? "lost" : "complete");
    } else {
      this.createNextOrder();
      this.render();
    }
  }

  private shouldFinishRun(): boolean {
    if (this.activeMode === "endless") return this.lost >= 3;
    return this.served + this.lost >= this.targetOrders;
  }

  private createNextOrder(): void {
    const pool = this.getRecipePool();
    const recipe = this.activeMode === "practice" && this.practiceRecipeId ? this.recipeSystem.getById(this.practiceRecipeId) : pool[Math.floor(Math.random() * pool.length)];
    this.currentRecipe = recipe ?? recipes[0];
    this.activeOrder = this.orderSystem.createOrder(this.currentRecipe.id);
    this.currentClient = clientTypes[(this.served + this.lost + this.save.day) % clientTypes.length];
    this.orderStartedAt = performance.now();
  }

  private async finishRun(reason: FinishReason): Promise<void> {
    if (this.currentScreen === "results" && !this.running) return;
    this.running = false;
    cancelAnimationFrame(this.animationId);
    this.sdk.gameplayStop();
    const completedDay = this.save.day;
    const stars = this.calculateStars(completedDay, reason);
    const shouldCommitCampaign = this.activeMode === "campaign" && reason !== "manual" && this.served + this.lost >= this.targetOrders;
    const unlocked = shouldCommitCampaign ? this.applyCampaignProgress(completedDay, stars) : [];
    if (this.activeMode === "endless") this.save.records.endlessScore = Math.max(this.save.records.endlessScore, this.served);
    if (this.activeMode === "blitz") this.save.records.dailyChallengeScore = Math.max(this.save.records.dailyChallengeScore, this.dayCoins);
    this.save.records.bestCombo = Math.max(this.save.records.bestCombo, this.comboSystem.combo);
    this.save.records.bestTipsDay = Math.max(this.save.records.bestTipsDay, this.dayTips);
    const achievementNames = this.updateAchievements();
    this.lastResult = {
      title: this.resultTitle(reason),
      mode: this.activeMode,
      reason,
      served: this.served,
      lost: this.lost,
      coins: this.dayCoins,
      tips: this.dayTips,
      combo: this.comboSystem.combo,
      quality: Math.min(100, this.quality * 100),
      stars,
      goal: this.runGoalText(completedDay),
      unlocked,
      achievements: achievementNames
    };
    this.saveProgress();
    void this.sdk.setLeaderboardScore("bestTipsDay", this.save.records.bestTipsDay);
    if (this.activeMode === "endless") void this.sdk.setLeaderboardScore("endlessScore", this.save.records.endlessScore);
    if (this.activeMode !== "practice" && reason !== "manual" && this.served + this.lost > 0 && this.save.day > 3) {
      await this.adService.showBetweenDays(true);
      this.sdk.gameplayStop();
    }
    this.currentScreen = "results";
    this.render();
  }

  private calculateStars(day: number, reason: FinishReason): number {
    if (this.served === 0) return 0;
    if (this.activeMode === "practice") {
      if (this.lost === 0 && this.served >= this.targetOrders) return 3;
      return this.served >= 2 ? 2 : 1;
    }
    if (this.activeMode === "endless") {
      if (this.served >= 18) return 3;
      if (this.served >= 10) return 2;
      return 1;
    }
    if (this.activeMode === "blitz") {
      if (reason === "timeout" && this.served < 3) return 1;
      if (this.served >= this.targetOrders && this.lost === 0) return 3;
      if (this.served >= Math.max(4, this.targetOrders - 2)) return 2;
      return 1;
    }
    const target = campaignDays[day - 1]?.targetScore ?? 160;
    if (this.dayCoins >= target) return 3;
    if (this.dayCoins >= target * 0.68) return 2;
    return 1;
  }

  private applyCampaignProgress(completedDay: number, stars: number): string[] {
    const unlocked: string[] = [];
    this.save.dayStars[completedDay] = Math.max(this.save.dayStars[completedDay] ?? 0, stars);
    const recipeLimit = Math.min(recipes.length, 3 + Math.ceil(completedDay / 2) + (stars >= 3 ? 1 : 0));
    recipes.slice(0, recipeLimit).forEach((recipe) => {
      if (!this.save.unlockedRecipeIds.includes(recipe.id)) {
        this.save.unlockedRecipeIds.push(recipe.id);
        unlocked.push(recipe.name);
      }
    });
    if (stars >= 2) {
      const category = categoryOrder[completedDay % categoryOrder.length];
      const items = cosmetics[category];
      const item = items[Math.min(items.length - 1, Math.floor(completedDay / 3))];
      if (this.unlockCosmetic(category, item)) unlocked.push(item);
    }
    if (completedDay >= campaignDays.length) {
      this.save.records.campaignCompleted = true;
    } else {
      this.save.day = Math.min(campaignDays.length, completedDay + 1);
    }
    this.save.chapter = campaignDays[this.save.day - 1]?.chapter ?? this.save.chapter;
    return unlocked;
  }

  private updateAchievements(): string[] {
    const newly: string[] = [];
    achievements.forEach((achievement) => {
      if (this.save.achievements[achievement.id] || !this.isAchievementMet(achievement)) return;
      this.save.achievements[achievement.id] = true;
      this.save.coins += achievement.reward;
      newly.push(`${achievement.name} (+${achievement.reward})`);
    });
    return newly;
  }

  private isAchievementMet(achievement: AchievementDefinition): boolean {
    const ownedCosmeticCount = Object.values(this.save.ownedCosmetics).reduce((sum, items) => sum + items.length, 0);
    if (achievement.id === "first_day") return Object.values(this.save.dayStars).some((stars) => stars > 0);
    if (achievement.id === "ten_guests") return this.save.records.totalServed >= 10;
    if (achievement.id === "combo_five") return this.save.records.bestCombo >= 5 || this.comboSystem.combo >= 5;
    if (achievement.id === "three_stars") return Object.values(this.save.dayStars).some((stars) => stars >= 3);
    if (achievement.id === "collector") return ownedCosmeticCount >= 10;
    if (achievement.id === "first_chapter") return this.save.chapter >= 2;
    if (achievement.id === "rich_house") return this.save.coins >= 1500;
    if (achievement.id === "campaign_complete") return this.save.records.campaignCompleted;
    return false;
  }

  private resultTitle(reason: FinishReason): string {
    if (reason === "timeout") return "Время вышло";
    if (reason === "lost") return "Очередь разошлась";
    if (reason === "manual") return "Смена завершена";
    return "Смена закрыта";
  }

  private showFeedback(type: FeedbackKind): void {
    const duration = type === "win" ? 1200 : 650;
    this.feedback = type;
    this.feedbackStarted = performance.now();
    this.feedbackUntil = this.feedbackStarted + duration;
    this.root.classList.remove("feedback-perfect", "feedback-good", "feedback-miss", "feedback-win");
    this.root.classList.add(`feedback-${type}`);
    window.setTimeout(() => {
      this.root.classList.remove(`feedback-${type}`);
      if (this.feedback === type && performance.now() >= this.feedbackUntil) this.feedback = null;
    }, duration);
  }

  private getRecipePool(): Recipe[] {
    const unlocked = this.save.unlockedRecipeIds.map((id) => this.recipeSystem.getById(id)).filter((recipe): recipe is Recipe => Boolean(recipe));
    if (this.activeMode === "campaign") {
      const chapter = campaignDays[this.save.day - 1]?.chapter ?? 1;
      const campaignPool = unlocked.filter((recipe) => recipe.difficulty <= chapter + 1);
      return campaignPool.length ? campaignPool : unlocked.length ? unlocked : recipes.slice(0, 3);
    }
    if (this.activeMode === "blitz") {
      const blitzPool = unlocked.filter((recipe) => recipe.difficulty <= 4);
      return blitzPool.length ? blitzPool : recipes.slice(0, 4);
    }
    return unlocked.length ? unlocked : recipes.slice(0, 3);
  }

  private getOrderPatienceMs(): number {
    const serviceBonus = 1 + Math.min(0.32, this.ownedUpgradeCount("service") * 0.018);
    const modeFactor = this.activeMode === "blitz" ? 0.72 : this.activeMode === "practice" ? 1.35 : 1;
    return this.currentClient.patience * 1000 * serviceBonus * modeFactor;
  }

  private getPatiencePercent(now = performance.now()): number {
    return Math.max(0, Math.min(100, 100 - ((now - this.orderStartedAt) / this.getOrderPatienceMs()) * 100));
  }

  private runGoalText(day = this.save.day): string {
    if (this.activeMode === "endless") return "играть до трех ушедших гостей";
    if (this.activeMode === "blitz") return `${this.targetOrders} заказов за ${this.formatTime(this.timeLimitMs)}`;
    if (this.activeMode === "practice") return `${this.targetOrders} тренировочных заказа`;
    const target = campaignDays[day - 1]?.targetScore ?? 160;
    return `${target} монет за день`;
  }

  private formatTime(ms: number): string {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  private formatIngredients(ingredients: IngredientId[]): string {
    return ingredients.map((item) => ingredientLabels[item]).join(" → ");
  }

  private ownedUpgradeCount(category: "samovar" | "kitchen" | "service" | "samovars"): number {
    const normalized = category === "samovars" ? "samovar" : category;
    return this.save.boughtUpgradeIds.reduce((count, id) => {
      const upgrade = upgrades.find((item) => item.id === id);
      return count + (upgrade?.category === normalized ? 1 : 0);
    }, 0);
  }

  private getEquippedCosmetic(category: CosmeticCategory): string {
    return this.save.equippedCosmetics[category] ?? cosmetics[category][0];
  }

  private ownsCosmetic(category: CosmeticCategory, item: string): boolean {
    return (this.save.ownedCosmetics[category] ?? []).includes(item);
  }

  private unlockCosmetic(category: CosmeticCategory, item: string): boolean {
    if (this.ownsCosmetic(category, item)) return false;
    this.save.ownedCosmetics[category] = [...(this.save.ownedCosmetics[category] ?? []), item];
    return true;
  }

  private cosmeticPrice(category: CosmeticCategory, index: number): number {
    return cosmeticPrices[category] + index * 160;
  }

  private getSamovarPalette(): { light: string; mid: string; dark: string } {
    const samovar = this.getEquippedCosmetic("samovars");
    if (samovar === "Серебряный самовар") return { light: "#f4fbff", mid: "#b6c8d4", dark: "#61717c" };
    if (samovar === "Ярмарочный самовар") return { light: "#ffe7a8", mid: "#d65a3e", dark: "#803028" };
    if (samovar === "Фестивальный самовар") return { light: "#fff0bf", mid: "#67c693", dark: "#276d5c" };
    return { light: "#fff2bf", mid: "#d89035", dark: "#8c471f" };
  }

  private renderLoading(): void {
    this.root.innerHTML = `
      <div class="screen screen-menu">
        <div class="panel hero-panel">
          <h1 class="title">${this.i18n.t("gameTitle")}</h1>
          <div class="text">${this.i18n.t("loading")}</div>
        </div>
        <div class="loading-kettle" aria-hidden="true"></div>
      </div>
    `;
  }

  private render(): void {
    const info = this.layout.compute(window.innerWidth, window.innerHeight);
    if (info.tooSmall) {
      this.root.innerHTML = `<div class="warning-screen">${this.i18n.t("tooSmallWindow")}</div>`;
      return;
    }
    if (this.currentScreen === "menu") this.renderMenu();
    if (this.currentScreen === "campaign") this.renderCampaign();
    if (this.currentScreen === "game") this.renderGame();
    if (this.currentScreen === "pause") this.renderPause();
    if (this.currentScreen === "results") this.renderResults();
    if (this.currentScreen === "recipes") this.renderRecipes();
    if (this.currentScreen === "upgrades") this.renderUpgrades();
    if (this.currentScreen === "cosmetics") this.renderCosmetics();
    if (this.currentScreen === "achievements") this.renderAchievements();
    if (this.currentScreen === "settings") this.renderSettings();
    if (this.currentScreen === "how") this.renderHowToPlay();
    if (this.currentScreen === "about") this.renderAbout();
    this.bindControls();
    if (this.currentScreen === "game") this.drawCanvas();
  }

  private renderMenu(): void {
    this.root.innerHTML = `
      <div class="screen screen-menu">
        <div class="panel hero-panel">
          <div class="hero-copy">
            <h1 class="title">${this.i18n.t("gameTitle")}</h1>
            <div class="text">${this.i18n.t("slogan")}</div>
          </div>
          <div class="hero-samovar" aria-hidden="true"></div>
        </div>
        <div class="panel menu-grid menu-grid-main">
          <button class="btn btn-primary" data-action="start-campaign">▶ ${this.i18n.t("play")}</button>
          <button class="btn" data-action="campaign">${this.i18n.t("campaign")}</button>
          <button class="btn" data-action="start-endless">${this.i18n.t("endless")}</button>
          <button class="btn" data-action="start-blitz">${this.i18n.t("blitz")}</button>
          <button class="btn" data-action="recipes">${this.i18n.t("recipes")}</button>
          <button class="btn" data-action="upgrades">${this.i18n.t("upgrades")}</button>
          <button class="btn" data-action="cosmetics">${this.i18n.t("cosmetics")}</button>
          <button class="btn" data-action="achievements">${this.i18n.t("achievements")}</button>
          <button class="btn" data-action="settings">⚙ ${this.i18n.t("settings")}</button>
        </div>
        <div class="panel status-strip">
          <div class="metric">${this.i18n.t("coins")}: ${this.save.coins}</div>
          <div>${this.i18n.t("day")}: ${this.save.day}</div>
          <div>${this.i18n.t("reputation")}: ${this.save.reputation}</div>
          <div>${this.i18n.t("best")}: ${this.save.records.bestCombo}</div>
        </div>
      </div>
    `;
  }

  private renderCampaign(): void {
    const day = campaignDays[this.save.day - 1] ?? campaignDays[campaignDays.length - 1];
    const earnedStars = this.save.dayStars[day.day] ?? 0;
    const completed = this.save.records.campaignCompleted;
    this.root.innerHTML = `
      <div class="screen screen-page">
        <div class="panel hero-panel compact-hero">
          <h2 class="title">${this.i18n.t("campaign")} · ${this.i18n.t("day")} ${day.day}</h2>
          <span class="badge">${this.i18n.t("chapter")}: ${day.chapterName}</span>
        </div>
        <div class="panel text list">
          <div>${this.i18n.t("dayModifier")}: ${day.modifier}</div>
          <div>${this.i18n.t("reward")}: ${day.targetScore} ${this.i18n.t("coins")}</div>
          <div>${this.i18n.t("stars")}: ${earnedStars > 0 ? "★".repeat(earnedStars) : "пока нет"}</div>
          <div>${this.i18n.t("recipes")}: ${this.save.unlockedRecipeIds.length} из ${recipes.length}</div>
          <div>${completed ? "Кампания завершена. Можно переигрывать последний день и улучшать результат." : "Новые рецепты и украшения открываются за успешные дни."}</div>
        </div>
        <div class="menu-grid">
          <button class="btn btn-primary" data-action="start-day">${this.i18n.t("startDay")}</button>
          <button class="btn" data-action="open-upgrades">${this.i18n.t("upgrades")}</button>
          <button class="btn" data-action="back">${this.i18n.t("back")}</button>
        </div>
      </div>
    `;
  }

  private renderGame(): void {
    const progress = this.currentRecipe.ingredients
      .map((ingredient, index) => `<span class="recipe-step ${index < this.activeOrder.index ? "done" : index === this.activeOrder.index ? "active" : ""}">${ingredientLabels[ingredient]}</span>`)
      .join("");
    const attempts = this.served + this.lost;
    const targetText = this.activeMode === "endless" ? `${this.lost}/3` : `${attempts}/${this.targetOrders}`;
    const patience = this.getPatiencePercent();
    this.root.innerHTML = `
      <div class="screen screen-game">
        <div class="panel game-hud">
          <div class="metric">${this.i18n.t("mode")}: ${modeLabels[this.activeMode]}</div>
          <div class="metric">${this.i18n.t("coins")}: ${this.save.coins}</div>
          <div class="metric">${this.i18n.t("combo")}: ${this.comboSystem.combo}</div>
          <button class="btn btn-small" data-action="pause">${this.i18n.t("pause")}</button>
        </div>
        <div class="game-layout">
          <div class="panel side-panel text">
            <div class="metric">Очередь</div>
            <div class="guest-card">
              <div class="guest-face" aria-hidden="true"></div>
              <div>
                <div>${this.currentClient.name}</div>
                <div class="muted">${this.i18n.t("patience")}: <span id="order-patience-text">${Math.ceil(this.getOrderPatienceMs() / 1000)} с</span></div>
              </div>
            </div>
            <div class="meter"><span id="order-patience-bar" class="meter-fill" style="width:${patience}%"></span></div>
            <div>${this.i18n.t("orders")}: ${targetText}</div>
            <div>${this.i18n.t("clientsServed")}: ${this.served}</div>
            <div>${this.i18n.t("clientsLost")}: ${this.lost}</div>
            ${this.timeLimitMs > 0 ? `<div>${this.i18n.t("timeLeft")}: <span id="run-clock">${this.formatTime(Math.max(0, this.timeLimitMs - (performance.now() - this.runStartedAt)))}</span></div>` : ""}
          </div>
          <div class="panel samovar-wrap">
            <canvas id="game-canvas"></canvas>
          </div>
          <div class="panel side-panel text">
            <div class="metric">Заказ: ${this.currentRecipe.name}</div>
            <div class="recipe-flow">${progress}</div>
            <div>${this.i18n.t("overheat")}: <span id="temp-value">${this.temperature.toFixed(0)}°</span></div>
            <div>${this.i18n.t("brew")}: <span id="quality-value">${Math.min(100, this.quality * 100).toFixed(0)}%</span></div>
            ${this.save.settings.hintsEnabled ? `<div class="muted">Подсказка: ${this.currentRecipe.hint}</div>` : ""}
            <button class="btn btn-primary primary-action" data-action="hit">Поймать ингредиент</button>
          </div>
        </div>
        <div class="panel menu-grid ring-grid">
          <button class="btn ${this.activeRing === 0 ? "active-ring" : ""}" data-action="ring-1">${this.i18n.t("ring1")}</button>
          <button class="btn ${this.activeRing === 1 ? "active-ring" : ""}" data-action="ring-2">${this.i18n.t("ring2")}</button>
          <button class="btn ${this.activeRing === 2 ? "active-ring" : ""}" data-action="ring-3">${this.i18n.t("ring3")}</button>
          <button class="btn ${this.activeRing === 3 ? "active-ring" : ""}" data-action="ring-4">${this.i18n.t("ring4")}</button>
          <button class="btn" data-action="boost">Подогреть</button>
          <button class="btn btn-primary" data-action="submit">${this.i18n.t("submit")}</button>
        </div>
      </div>
    `;
  }

  private renderPause(): void {
    this.root.innerHTML = `
      <div class="screen screen-page">
        <div class="panel hero-panel compact-hero">
          <h2 class="title">${this.i18n.t("pause")}</h2>
          <span class="badge">${modeLabels[this.activeMode]}</span>
        </div>
        <div class="panel text list">
          <div>${this.i18n.t("clientsServed")}: ${this.served}</div>
          <div>${this.i18n.t("clientsLost")}: ${this.lost}</div>
          <div>${this.i18n.t("coins")}: +${this.dayCoins}</div>
        </div>
        <div class="menu-grid">
          <button class="btn btn-primary" data-action="resume-run">${this.i18n.t("resume")}</button>
          <button class="btn" data-action="finish-run">${this.i18n.t("finishRun")}</button>
          <button class="btn" data-action="settings">${this.i18n.t("settings")}</button>
        </div>
      </div>
    `;
  }

  private renderResults(): void {
    const result = this.lastResult;
    if (!result) {
      this.currentScreen = "menu";
      this.renderMenu();
      return;
    }
    const starText = result.stars > 0 ? "★".repeat(result.stars) : "Без звезд";
    const unlocks = result.unlocked.length ? result.unlocked.map((item) => `<li>${item}</li>`).join("") : "<li>Новых наград нет</li>";
    const achievementList = result.achievements.length ? result.achievements.map((item) => `<li>${item}</li>`).join("") : "<li>Новых достижений нет</li>";
    this.root.innerHTML = `
      <div class="screen screen-page results-screen">
        <div class="panel hero-panel victory-panel">
          <div class="confetti" aria-hidden="true"></div>
          <h2 class="title">${result.title}</h2>
          <div class="stars">${starText}</div>
        </div>
        <div class="panel text result-grid">
          <div>${this.i18n.t("mode")}: ${modeLabels[result.mode]}</div>
          <div>${this.i18n.t("reward")}: ${result.goal}</div>
          <div>${this.i18n.t("clientsServed")}: ${result.served}</div>
          <div>${this.i18n.t("clientsLost")}: ${result.lost}</div>
          <div>${this.i18n.t("coins")}: +${result.coins}</div>
          <div>${this.i18n.t("tips")}: ${result.tips}</div>
          <div>${this.i18n.t("combo")}: ${result.combo}</div>
          <div>${this.i18n.t("accuracy")}: ${result.quality.toFixed(0)}%</div>
        </div>
        <div class="result-columns">
          <div class="panel text"><div class="metric">${this.i18n.t("newItems")}</div><ul>${unlocks}</ul></div>
          <div class="panel text"><div class="metric">${this.i18n.t("achievements")}</div><ul>${achievementList}</ul></div>
        </div>
        <div class="menu-grid">
          <button class="btn btn-primary" data-action="next-day">${this.i18n.t("next")}</button>
          <button class="btn" data-action="replay">${this.i18n.t("replay")}</button>
          <button class="btn" data-action="back">${this.i18n.t("back")}</button>
        </div>
      </div>
    `;
  }

  private renderRecipes(): void {
    const cards = recipes
      .map((recipe) => {
        const unlocked = this.save.unlockedRecipeIds.includes(recipe.id);
        return `<div class="panel text catalog-card ${unlocked ? "" : "locked-card"}"><div class="metric">${recipe.name}</div><div>${this.formatIngredients(recipe.ingredients)}</div><div>Температура: ${recipe.idealTemp[0]}-${recipe.idealTemp[1]}°</div><div>Сложность: ${recipe.difficulty}</div><div class="muted">${recipe.hint}</div><button class="btn" data-action="practice" data-id="${recipe.id}" ${unlocked ? "" : "disabled"}>${unlocked ? this.i18n.t("practice") : this.i18n.t("practiceLocked")}</button></div>`;
      })
      .join("");
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "recipes"
    )}</h2></div><div class="list catalog-list">${cards}</div><button class="btn" data-action="back">${this.i18n.t("back")}</button></div>`;
  }

  private renderUpgrades(): void {
    const boughtSet = new Set(this.save.boughtUpgradeIds);
    const cards = upgrades
      .map((upgrade) => {
        const bought = boughtSet.has(upgrade.id);
        const canBuy = this.upgradeSystem.canBuy(this.save.coins, upgrade.id, boughtSet);
        return `<div class="panel text catalog-card ${bought ? "owned-card" : ""}"><div class="metric">${upgrade.name}</div><span class="badge">${this.upgradeCategoryLabel(upgrade.category)}</span><div>${upgrade.effect}</div><div>${this.i18n.t("price")}: ${upgrade.basePrice}</div><button class="btn" data-action="buy-upgrade" data-id="${upgrade.id}" ${canBuy ? "" : "disabled"}>${bought ? this.i18n.t("bought") : this.i18n.t("buy")}</button></div>`;
      })
      .join("");
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "upgrades"
    )}</h2></div><div class="list catalog-list">${cards}</div><button class="btn" data-action="back">${this.i18n.t("back")}</button></div>`;
  }

  private renderCosmetics(): void {
    const groups = categoryOrder
      .map((category) => {
        const items = cosmetics[category]
          .map((item, index) => {
            const owned = this.ownsCosmetic(category, item);
            const equipped = this.getEquippedCosmetic(category) === item;
            const price = this.cosmeticPrice(category, index);
            const action = owned ? "equip-cosmetic" : "buy-cosmetic";
            const text = equipped ? this.i18n.t("selected") : owned ? this.i18n.t("equip") : `${this.i18n.t("buy")} ${price}`;
            return `<div class="cosmetic-item ${equipped ? "owned-card" : ""}"><span class="cosmetic-preview"></span><span>${item}</span><button class="btn btn-small" data-action="${action}" data-category="${category}" data-item="${item}" ${!owned && this.save.coins < price ? "disabled" : ""}>${text}</button></div>`;
          })
          .join("");
        return `<div class="panel text cosmetic-card"><div class="metric">${cosmeticCategoryLabels[category]}</div><div class="cosmetic-list">${items}</div></div>`;
      })
      .join("");
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "cosmetics"
    )}</h2><span class="badge">${this.i18n.t("coins")}: ${this.save.coins}</span></div><div class="list catalog-list">${groups}</div><button class="btn" data-action="back">${this.i18n.t("back")}</button></div>`;
  }

  private renderAchievements(): void {
    const cards = achievements
      .map((achievement) => {
        const collected = this.save.achievements[achievement.id];
        return `<div class="panel text catalog-card ${collected ? "owned-card" : "locked-card"}"><div class="metric">${achievement.name}</div><div>${achievement.description}</div><div>${this.i18n.t("reward")}: ${achievement.reward}</div><span class="badge">${collected ? this.i18n.t("collected") : this.i18n.t("notCollected")}</span></div>`;
      })
      .join("");
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "achievements"
    )}</h2></div><div class="list catalog-list">${cards}</div><button class="btn" data-action="back">${this.i18n.t("back")}</button></div>`;
  }

  private renderSettings(): void {
    const graphicsOptions = [
      ["low", "Низкое"],
      ["medium", "Среднее"],
      ["high", "Высокое"]
    ]
      .map(([value, label]) => `<option value="${value}" ${this.save.settings.graphicsQuality === value ? "selected" : ""}>${label}</option>`)
      .join("");
    this.root.innerHTML = `
      <div class="screen screen-page">
        <div class="panel compact-hero"><h2 class="title">${this.i18n.t("settings")}</h2></div>
        <div class="panel list text settings-list">
          <label><input type="checkbox" data-action="music-toggle" ${this.save.settings.musicEnabled ? "checked" : ""} /> ${this.i18n.t("music")}</label>
          <label><input type="range" min="0" max="100" value="${Math.round(this.save.settings.musicVolume * 100)}" data-action="music-volume" /> ${this.i18n.t("musicVolume")}</label>
          <label><input type="checkbox" data-action="sounds-toggle" ${this.save.settings.soundsEnabled ? "checked" : ""} /> ${this.i18n.t("sounds")}</label>
          <label><input type="range" min="0" max="100" value="${Math.round(this.save.settings.soundsVolume * 100)}" data-action="sounds-volume" /> ${this.i18n.t("soundsVolume")}</label>
          <label><input type="checkbox" data-action="hints-toggle" ${this.save.settings.hintsEnabled ? "checked" : ""} /> ${this.i18n.t("hints")}</label>
          <label><select class="select" data-action="graphics-quality">${graphicsOptions}</select> ${this.i18n.t("graphicsQuality")}</label>
          <button class="btn" data-action="login-cloud">${this.i18n.t("loginCloud")}</button>
          ${this.cloudStatus ? `<div class="cloud-status">${this.cloudStatus}</div>` : `<div class="muted">${this.i18n.t("loginCloudHint")}</div>`}
          <button class="btn" data-action="how">${this.i18n.t("howToPlayTitle")}</button>
          <button class="btn" data-action="about">${this.i18n.t("aboutTitle")}</button>
          <button class="btn" data-action="reset">${this.i18n.t("resetProgress")}</button>
        </div>
        <button class="btn" data-action="back">${this.i18n.t("back")}</button>
      </div>`;
  }

  private renderHowToPlay(): void {
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "howToPlayTitle"
    )}</h2></div><div class="panel text">${this.i18n.t("howToPlayText")}</div><button class="btn" data-action="back-settings">${this.i18n.t(
      "back"
    )}</button></div>`;
  }

  private renderAbout(): void {
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "aboutTitle"
    )}</h2></div><div class="panel text">${this.i18n.t("aboutText")} Все изображения, звуки и эффекты созданы средствами кода и работают без сервера.</div><button class="btn" data-action="back-settings">${this.i18n.t(
      "back"
    )}</button></div>`;
  }

  private bindControls(): void {
    this.root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
      const run = () => void this.handleAction(element);
      if (element instanceof HTMLInputElement && element.type === "range") {
        element.oninput = run;
      } else if (element instanceof HTMLSelectElement) {
        element.onchange = run;
      } else {
        element.onclick = run;
      }
    });
  }

  private async handleAction(element: HTMLElement): Promise<void> {
    this.audio.startMusic();
    const action = element.dataset.action;
    if (!action) return;

    if (action === "start-campaign" || action === "campaign") this.currentScreen = "campaign";
    if (action === "start-day") {
      this.beginRun("campaign");
      return;
    }
    if (action === "start-endless" || action === "endless") {
      this.beginRun("endless");
      return;
    }
    if (action === "start-blitz" || action === "blitz") {
      this.beginRun("blitz");
      return;
    }
    if (action === "practice") {
      const id = element.dataset.id;
      if (id && this.save.unlockedRecipeIds.includes(id)) this.beginRun("practice", id);
      return;
    }
    if (action === "pause") {
      this.pauseRun();
      return;
    }
    if (action === "resume-run") {
      this.resumeRun();
      return;
    }
    if (action === "finish-run") {
      await this.finishRun("manual");
      return;
    }
    if (action === "submit") this.completeOrder();
    if (action === "hit") this.makeShot();
    if (action === "next-day") this.currentScreen = this.activeMode === "campaign" ? "campaign" : "menu";
    if (action === "back") this.currentScreen = "menu";
    if (action === "replay") {
      this.beginRun(this.activeMode, this.practiceRecipeId);
      return;
    }
    if (action === "recipes") this.currentScreen = "recipes";
    if (action === "upgrades" || action === "open-upgrades") this.currentScreen = "upgrades";
    if (action === "cosmetics") this.currentScreen = "cosmetics";
    if (action === "achievements") this.currentScreen = "achievements";
    if (action === "settings") this.currentScreen = "settings";
    if (action === "how") this.currentScreen = "how";
    if (action === "about") this.currentScreen = "about";
    if (action === "back-settings") this.currentScreen = "settings";
    if (action === "ring-1") this.activeRing = 0;
    if (action === "ring-2") this.activeRing = 1;
    if (action === "ring-3") this.activeRing = 2;
    if (action === "ring-4") this.activeRing = 3;
    if (action === "boost") {
      this.temperature = Math.min(100, this.temperature + 7);
      this.audio.playSfx("hit");
      this.showFeedback("good");
    }
    if (action === "buy-upgrade") this.buyUpgrade(element.dataset.id);
    if (action === "buy-cosmetic" || action === "equip-cosmetic") this.handleCosmeticAction(element);
    if (action === "music-toggle") {
      this.save.settings.musicEnabled = element instanceof HTMLInputElement ? element.checked : !this.save.settings.musicEnabled;
      this.audio.setMusicEnabled(this.save.settings.musicEnabled);
      this.saveProgress();
    }
    if (action === "sounds-toggle") {
      this.save.settings.soundsEnabled = element instanceof HTMLInputElement ? element.checked : !this.save.settings.soundsEnabled;
      this.audio.setSoundsEnabled(this.save.settings.soundsEnabled);
      this.saveProgress();
    }
    if (action === "hints-toggle") {
      this.save.settings.hintsEnabled = element instanceof HTMLInputElement ? element.checked : !this.save.settings.hintsEnabled;
      this.saveProgress();
    }
    if (action === "music-volume" && element instanceof HTMLInputElement) {
      this.save.settings.musicVolume = Number(element.value) / 100;
      this.audio.setVolumes(this.save.settings.musicVolume, this.save.settings.soundsVolume);
      this.saveProgress();
      return;
    }
    if (action === "sounds-volume" && element instanceof HTMLInputElement) {
      this.save.settings.soundsVolume = Number(element.value) / 100;
      this.audio.setVolumes(this.save.settings.musicVolume, this.save.settings.soundsVolume);
      this.saveProgress();
      return;
    }
    if (action === "graphics-quality" && element instanceof HTMLSelectElement) {
      const value = element.value;
      if (value === "low" || value === "medium" || value === "high") {
        this.save.settings.graphicsQuality = value;
        this.saveProgress();
      }
      return;
    }
    if (action === "login-cloud") {
      const player = await this.sdk.requestPlayer();
      this.cloudStatus = player ? this.i18n.t("cloudConnected") : this.i18n.t("cloudUnavailable");
      if (player) this.saveProgress();
    }
    if (action === "reset") {
      this.save = this.saveService.reset();
      this.applyAudioSettings();
      this.currentScreen = "menu";
    }
    this.render();
  }

  private buyUpgrade(id?: string): void {
    if (!id) return;
    const item = upgrades.find((upgrade) => upgrade.id === id);
    if (!item || !this.upgradeSystem.canBuy(this.save.coins, id, new Set(this.save.boughtUpgradeIds))) return;
    this.save.coins -= item.basePrice;
    this.save.boughtUpgradeIds.push(id);
    this.audio.playSfx("buy");
    this.updateAchievements();
    this.saveProgress();
  }

  private handleCosmeticAction(element: HTMLElement): void {
    const category = element.dataset.category as CosmeticCategory | undefined;
    const item = element.dataset.item;
    if (!category || !item || !cosmetics[category]?.includes(item)) return;
    if (!this.ownsCosmetic(category, item)) {
      const index = cosmetics[category].indexOf(item);
      const price = this.cosmeticPrice(category, index);
      if (this.save.coins < price) return;
      this.save.coins -= price;
      this.unlockCosmetic(category, item);
      this.audio.playSfx("buy");
    }
    this.save.equippedCosmetics[category] = item;
    this.updateAchievements();
    this.saveProgress();
  }

  private upgradeCategoryLabel(category: "samovar" | "kitchen" | "service"): string {
    if (category === "samovar") return "Самовар";
    if (category === "kitchen") return "Кухня";
    return "Сервис";
  }
}

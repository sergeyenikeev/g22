import { campaignDays, clientTypes, recipes, upgrades } from "../data/gameData";
import type { IngredientId } from "../data/gameData";
import { YandexSdkService } from "../sdk/YandexSdkService";
import { AdService } from "../services/AdService";
import { AudioService } from "../services/AudioService";
import { LocalizationService } from "../services/LocalizationService";
import { Logger } from "../services/Logger";
import { ResponsiveLayoutService } from "../services/ResponsiveLayoutService";
import { SaveService } from "../services/SaveService";
import { ComboSystem, EconomySystem, OrderSystem, RecipeSystem, TemperatureSystem, TimingSystem, UpgradeSystem } from "../systems/systems";

type ScreenId =
  | "loading"
  | "menu"
  | "campaign"
  | "game"
  | "results"
  | "recipes"
  | "upgrades"
  | "cosmetics"
  | "achievements"
  | "settings"
  | "how"
  | "about";

type FeedbackKind = "perfect" | "good" | "miss" | "win";

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

export class GameApp {
  private currentScreen: ScreenId = "loading";
  private root: HTMLElement;
  private save;
  private activeOrder;
  private currentRecipe;
  private temperature = 78;
  private served = 0;
  private lost = 0;
  private dayTips = 0;
  private quality = 1;
  private running = false;
  private ringRotation = [0, 0, 0, 0];
  private activeRing = 0;
  private animationId = 0;
  private holdStart = 0;
  private feedback: FeedbackKind | null = null;
  private feedbackStarted = 0;
  private feedbackUntil = 0;

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
    this.audio.setVolumes(this.save.settings.musicVolume, this.save.settings.soundsVolume);
    this.audio.setSoundsEnabled(this.save.settings.soundsEnabled);
    if (!this.save.settings.musicEnabled) this.audio.setMusicEnabled(false);
    await this.initializeSdk();
    this.currentScreen = "menu";
    this.render();
  }

  private async initializeSdk(): Promise<void> {
    this.renderLoading();
    const sdkInfo = await this.sdk.init();
    this.i18n.setLanguage(sdkInfo.language);
    await this.sdk.loadingReady();
  }

  private bindGlobalHandlers(): void {
    window.addEventListener("resize", () => this.render());
    document.addEventListener("keydown", (event) => this.onKey(event));
    document.addEventListener("mousedown", (event) => {
      if (this.currentScreen === "game" && event.button === 2) {
        this.activeRing = (this.activeRing + 3) % 4;
        this.render();
      }
      this.holdStart = performance.now();
    });
    document.addEventListener("mouseup", () => {
      if (!this.running || this.currentScreen !== "game") return;
      const hold = performance.now() - this.holdStart;
      if (hold > 250) {
        this.temperature = Math.min(100, this.temperature + 4);
        this.audio.playSfx("hit");
        this.render();
      }
    });
  }

  private onKey(event: KeyboardEvent): void {
    if (this.currentScreen !== "game") return;
    if (event.key === "q" || event.key === "Q") this.activeRing = (this.activeRing + 3) % 4;
    if (event.key === "e" || event.key === "E") this.activeRing = (this.activeRing + 1) % 4;
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
      this.running = false;
      this.sdk.gameplayStop();
      this.currentScreen = "menu";
    }
    this.render();
  }

  private beginDay(): void {
    this.served = 0;
    this.lost = 0;
    this.dayTips = 0;
    this.quality = 1;
    this.temperature = 78;
    this.comboSystem.combo = 0;
    this.createNextOrder();
    this.currentScreen = "game";
    this.running = true;
    this.sdk.gameplayStart();
    this.render();
    this.loop();
  }

  private loop(): void {
    if (!this.running || this.currentScreen !== "game") return;
    this.ringRotation = this.ringRotation.map((value, idx) => value + 0.006 + idx * 0.002 + this.comboSystem.boost * 0.00001);
    this.temperature = Math.max(45, this.temperature - 0.02);
    this.drawCanvas();
    this.animationId = requestAnimationFrame(() => this.loop());
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
    const wall = ctx.createLinearGradient(0, 0, 0, size);
    wall.addColorStop(0, "#59331e");
    wall.addColorStop(0.42, "#7c4724");
    wall.addColorStop(0.72, "#3a2116");
    wall.addColorStop(1, "#17100e");
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
    table.addColorStop(0, "#9c5627");
    table.addColorStop(1, "#4c2617");
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
    const body = ctx.createRadialGradient(-36, -48, 10, 0, 0, 122);
    body.addColorStop(0, "#fff2bf");
    body.addColorStop(0.38, "#d89035");
    body.addColorStop(0.74, "#8c471f");
    body.addColorStop(1, "#4b2312");
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = 24;
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 8, 92, 118, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#f2bd62";
    ctx.fillRect(-30, -132, 60, 54);
    ctx.beginPath();
    ctx.ellipse(0, -138, 44, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5a2d17";
    ctx.fillRect(-46, 115, 92, 20);
    ctx.fillStyle = "#ffe08a";
    ctx.beginPath();
    ctx.arc(0, -34, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#32180e";
    ctx.font = "800 18px Segoe UI";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("самовар", 0, -34);

    ctx.strokeStyle = "#f5c364";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-86, -14);
    ctx.quadraticCurveTo(-132, 0, -118, 52);
    ctx.moveTo(86, -14);
    ctx.quadraticCurveTo(132, 0, 118, 52);
    ctx.stroke();

    ctx.fillStyle = "#ffe4a2";
    ctx.fillRect(72, 18, 70, 12);
    ctx.beginPath();
    ctx.arc(152, 24, 14, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 7; i += 1) {
      const drift = Math.sin(now * 0.0018 + i) * 14;
      ctx.strokeStyle = `rgba(255, 245, 213, ${0.18 + i * 0.04})`;
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
    const delta = Math.sin(this.ringRotation[this.activeRing]) * 0.15;
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
    const qualityByTemp = this.temperatureSystem.evaluate(this.temperature, this.currentRecipe.idealTemp);
    const progress = this.activeOrder.index / this.currentRecipe.ingredients.length;
    const progressQuality = this.activeOrder.done ? 1 : Math.max(0.35, progress * 0.82);
    const mistakePenalty = Math.max(0.55, 1 - this.activeOrder.mistakes * 0.12);
    const totalQuality = Math.max(0.1, ((this.quality + qualityByTemp + progressQuality) / 3) * mistakePenalty);
    const reward = this.economySystem.reward(this.currentRecipe.reward, totalQuality, this.comboSystem.tipMultiplier());
    this.dayTips += Math.round(reward * 0.35);
    this.save.coins += reward;
    this.served += 1;
    this.audio.playSfx("win");
    this.showFeedback("win");
    this.saveService.save(this.save);

    if (this.served >= 6) {
      void this.finishDay();
    } else {
      this.createNextOrder();
      this.render();
    }
  }

  private createNextOrder(): void {
    const randomRecipe = this.save.unlockedRecipeIds[Math.floor(Math.random() * this.save.unlockedRecipeIds.length)];
    this.activeOrder = this.orderSystem.createOrder(randomRecipe);
    this.currentRecipe = this.recipeSystem.getById(randomRecipe) ?? recipes[0];
  }

  private async finishDay(): Promise<void> {
    this.running = false;
    cancelAnimationFrame(this.animationId);
    this.sdk.gameplayStop();
    this.currentScreen = "results";
    this.save.day = Math.min(campaignDays.length, this.save.day + 1);
    this.save.records.bestCombo = Math.max(this.save.records.bestCombo, this.comboSystem.combo);
    this.save.records.bestTipsDay = Math.max(this.save.records.bestTipsDay, this.dayTips);
    this.saveService.save(this.save);
    await this.adService.showBetweenDays(this.save.day > 3);
    this.render();
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

  private formatIngredients(ingredients: IngredientId[]): string {
    return ingredients.map((item) => ingredientLabels[item]).join(" -> ");
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
          <button class="btn" data-action="endless">${this.i18n.t("endless")}</button>
          <button class="btn" data-action="blitz">${this.i18n.t("blitz")}</button>
          <button class="btn" data-action="recipes">${this.i18n.t("recipes")}</button>
          <button class="btn" data-action="upgrades">${this.i18n.t("upgrades")}</button>
          <button class="btn" data-action="cosmetics">${this.i18n.t("cosmetics")}</button>
          <button class="btn" data-action="achievements">${this.i18n.t("achievements")}</button>
          <button class="btn" data-action="settings">⚙ ${this.i18n.t("settings")}</button>
        </div>
        <div class="panel status-strip">
          <div class="metric">${this.i18n.t("coins")}: ${this.save.coins}</div>
          <div>${this.i18n.t("day")}: ${this.save.day}</div>
          <div>${this.i18n.t("combo")}: ${this.save.records.bestCombo}</div>
        </div>
      </div>
    `;
  }

  private renderCampaign(): void {
    const day = campaignDays[this.save.day - 1];
    this.root.innerHTML = `
      <div class="screen screen-page">
        <div class="panel hero-panel compact-hero">
          <h2 class="title">${this.i18n.t("campaign")} - ${this.i18n.t("day")} ${day.day}</h2>
          <span class="badge">${this.i18n.t("chapter")}: ${day.chapterName}</span>
        </div>
        <div class="panel text list">
          <div>${this.i18n.t("dayModifier")}: ${day.modifier}</div>
          <div>${this.i18n.t("reward")}: ${day.targetScore} ${this.i18n.t("coins")}</div>
          <div>${this.i18n.t("coins")}: ${this.save.coins}</div>
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
    const client = clientTypes[(this.served + this.lost) % clientTypes.length];
    const progress = this.currentRecipe.ingredients
      .map((ingredient, index) => `<span class="recipe-step ${index < this.activeOrder.index ? "done" : index === this.activeOrder.index ? "active" : ""}">${ingredientLabels[ingredient]}</span>`)
      .join("");
    this.root.innerHTML = `
      <div class="screen screen-game">
        <div class="panel game-hud">
          <div class="metric">${this.i18n.t("day")} ${this.save.day}</div>
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
                <div>${client.name}</div>
                <div class="muted">Терпение: ${client.patience}</div>
              </div>
            </div>
            <div>${this.i18n.t("clientsServed")}: ${this.served}</div>
            <div>${this.i18n.t("clientsLost")}: ${this.lost}</div>
          </div>
          <div class="panel samovar-wrap">
            <canvas id="game-canvas"></canvas>
          </div>
          <div class="panel side-panel text">
            <div class="metric">Заказ: ${this.currentRecipe.name}</div>
            <div class="recipe-flow">${progress}</div>
            <div>${this.i18n.t("overheat")}: ${this.temperature.toFixed(0)}°</div>
            <div>${this.i18n.t("brew")}: ${Math.min(100, this.quality * 100).toFixed(0)}%</div>
            <div class="muted">Подсказка: ${this.currentRecipe.hint}</div>
            <button class="btn btn-primary primary-action" data-action="hit">Поймать ингредиент</button>
          </div>
        </div>
        <div class="panel menu-grid ring-grid">
          <button class="btn ${this.activeRing === 0 ? "active-ring" : ""}" data-action="ring-1">${this.i18n.t("ring1")}</button>
          <button class="btn ${this.activeRing === 1 ? "active-ring" : ""}" data-action="ring-2">${this.i18n.t("ring2")}</button>
          <button class="btn ${this.activeRing === 2 ? "active-ring" : ""}" data-action="ring-3">${this.i18n.t("ring3")}</button>
          <button class="btn ${this.activeRing === 3 ? "active-ring" : ""}" data-action="ring-4">${this.i18n.t("ring4")}</button>
          <button class="btn" data-action="boost">${this.i18n.t("boost")}</button>
          <button class="btn btn-primary" data-action="submit">${this.i18n.t("submit")}</button>
        </div>
      </div>
    `;
  }

  private renderResults(): void {
    const stars = this.dayTips > 120 ? 3 : this.dayTips > 80 ? 2 : 1;
    const starText = "★".repeat(stars);
    this.root.innerHTML = `
      <div class="screen screen-page results-screen">
        <div class="panel hero-panel victory-panel">
          <div class="confetti" aria-hidden="true"></div>
          <h2 class="title">${this.i18n.t("results")}</h2>
          <div class="stars">${starText}</div>
        </div>
        <div class="panel text list">
          <div>${this.i18n.t("clientsServed")}: ${this.served}</div>
          <div>${this.i18n.t("clientsLost")}: ${this.lost}</div>
          <div>${this.i18n.t("coins")}: ${this.save.coins}</div>
          <div>${this.i18n.t("tips")}: ${this.dayTips}</div>
          <div>${this.i18n.t("combo")}: ${this.comboSystem.combo}</div>
          <div>${this.i18n.t("accuracy")}: ${Math.min(100, this.quality * 100).toFixed(0)}%</div>
          <div>${this.i18n.t("stars")}: ${stars}</div>
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
      .map(
        (recipe) => `<div class="panel text catalog-card"><div class="metric">${recipe.name}</div><div>${this.formatIngredients(recipe.ingredients)}</div><div>Температура: ${recipe.idealTemp[0]}-${recipe.idealTemp[1]}°</div><div>Время: ${(recipe.brewTimeMs / 1000).toFixed(1)} с</div><button class="btn">${this.i18n.t("practice")}</button></div>`
      )
      .join("");
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "recipes"
    )}</h2></div><div class="list catalog-list">${cards}</div><button class="btn" data-action="back">${this.i18n.t("back")}</button></div>`;
  }

  private renderUpgrades(): void {
    const boughtSet = new Set(this.save.boughtUpgradeIds);
    const cards = upgrades
      .map((upgrade) => {
        const canBuy = this.upgradeSystem.canBuy(this.save.coins, upgrade.id, boughtSet);
        return `<div class="panel text catalog-card"><div class="metric">${upgrade.name}</div><div>${upgrade.effect}</div><div>${this.i18n.t("price")}: ${
          upgrade.basePrice
        }</div><button class="btn" data-action="buy-upgrade" data-id="${upgrade.id}" ${canBuy ? "" : "disabled"}>${
          this.i18n.t("buy")
        }</button></div>`;
      })
      .join("");
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "upgrades"
    )}</h2></div><div class="list catalog-list">${cards}</div><button class="btn" data-action="back">${this.i18n.t("back")}</button></div>`;
  }

  private renderCosmetics(): void {
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "cosmetics"
    )}</h2></div><div class="panel text">Категории: чашки, самовары, скатерти, подносы, фоны, пар.</div><button class="btn" data-action="back">${this.i18n.t(
      "back"
    )}</button></div>`;
  }

  private renderAchievements(): void {
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "achievements"
    )}</h2></div><div class="panel text">Достижения обновляются по мере прохождения кампании и режимов.</div><button class="btn" data-action="back">${this.i18n.t(
      "back"
    )}</button></div>`;
  }

  private renderSettings(): void {
    this.root.innerHTML = `<div class="screen screen-page"><div class="panel compact-hero"><h2 class="title">${this.i18n.t(
      "settings"
    )}</h2></div><div class="panel list text settings-list"><label><input type="checkbox" data-action="music-toggle" ${
      this.save.settings.musicEnabled ? "checked" : ""
    } /> ${this.i18n.t("music")}</label><label><input type="checkbox" data-action="sounds-toggle" ${
      this.save.settings.soundsEnabled ? "checked" : ""
    } /> ${this.i18n.t("sounds")}</label><button class="btn" data-action="how">${this.i18n.t(
      "howToPlayTitle"
    )}</button><button class="btn" data-action="about">${this.i18n.t("aboutTitle")}</button><button class="btn" data-action="reset">${
      this.i18n.t("resetProgress")
    }</button></div><button class="btn" data-action="back">${this.i18n.t("back")}</button></div>`;
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
    )}</h2></div><div class="panel text">${this.i18n.t("aboutText")}</div><button class="btn" data-action="back-settings">${this.i18n.t(
      "back"
    )}</button></div>`;
  }

  private bindControls(): void {
    this.root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
      element.onclick = async () => {
        this.audio.startMusic();
        const action = element.dataset.action;
        if (!action) return;
        if (action === "start-campaign" || action === "campaign") this.currentScreen = "campaign";
        if (action === "start-day") this.beginDay();
        if (action === "pause") {
          this.currentScreen = "menu";
          this.running = false;
          this.sdk.gameplayStop();
        }
        if (action === "submit") this.completeOrder();
        if (action === "hit") this.makeShot();
        if (action === "next-day" || action === "back") this.currentScreen = "menu";
        if (action === "replay") this.currentScreen = "campaign";
        if (action === "recipes") this.currentScreen = "recipes";
        if (action === "upgrades" || action === "open-upgrades") this.currentScreen = "upgrades";
        if (action === "cosmetics") this.currentScreen = "cosmetics";
        if (action === "achievements") this.currentScreen = "achievements";
        if (action === "settings") this.currentScreen = "settings";
        if (action === "how") this.currentScreen = "how";
        if (action === "about") this.currentScreen = "about";
        if (action === "back-settings") this.currentScreen = "settings";
        if (action === "endless" || action === "blitz") this.currentScreen = "campaign";
        if (action === "ring-1") this.activeRing = 0;
        if (action === "ring-2") this.activeRing = 1;
        if (action === "ring-3") this.activeRing = 2;
        if (action === "ring-4") this.activeRing = 3;
        if (action === "boost") {
          this.ringRotation = this.ringRotation.map((value) => value + 0.15);
          this.comboSystem.combo += 1;
          this.comboSystem.boost = Math.min(100, this.comboSystem.boost + 6);
          this.audio.playSfx("perfect");
          this.showFeedback("good");
        }
        if (action === "buy-upgrade") {
          const id = element.dataset.id;
          if (id) {
            const item = upgrades.find((upgrade) => upgrade.id === id);
            if (item && this.upgradeSystem.canBuy(this.save.coins, id, new Set(this.save.boughtUpgradeIds))) {
              this.save.coins -= item.basePrice;
              this.save.boughtUpgradeIds.push(id);
              this.audio.playSfx("buy");
              this.saveService.save(this.save);
            }
          }
        }
        if (action === "music-toggle") {
          this.save.settings.musicEnabled = element instanceof HTMLInputElement ? element.checked : !this.save.settings.musicEnabled;
          this.audio.setMusicEnabled(this.save.settings.musicEnabled);
          this.saveService.save(this.save);
        }
        if (action === "sounds-toggle") {
          this.save.settings.soundsEnabled = element instanceof HTMLInputElement ? element.checked : !this.save.settings.soundsEnabled;
          this.audio.setSoundsEnabled(this.save.settings.soundsEnabled);
          this.saveService.save(this.save);
        }
        if (action === "reset") {
          this.save = this.saveService.reset();
          this.audio.setSoundsEnabled(this.save.settings.soundsEnabled);
          this.currentScreen = "menu";
        }
        this.render();
      };
    });
  }
}

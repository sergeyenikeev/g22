import { achievements, cosmetics, recipes, upgrades } from "../../src/data/gameData";
import { LocalizationService } from "../../src/services/LocalizationService";
import { ResponsiveLayoutService } from "../../src/services/ResponsiveLayoutService";
import { SaveService } from "../../src/services/SaveService";
import { ComboSystem, EconomySystem, OrderSystem, RecipeSystem, TemperatureSystem, TimingSystem, UpgradeSystem } from "../../src/systems/systems";

describe("игровые системы", () => {
  it("RecipeSystem отдает рецепты", () => {
    const rs = new RecipeSystem();
    expect(rs.getAll().length).toBeGreaterThanOrEqual(20);
  });

  it("OrderSystem отслеживает правильный порядок", () => {
    const order = new OrderSystem();
    const recipe = recipes[0];
    const active = order.createOrder(recipe.id);
    recipe.ingredients.forEach((item) => order.addIngredient(active, recipe, item));
    expect(active.done).toBe(true);
  });

  it("TimingSystem возвращает perfect", () => {
    expect(new TimingSystem().evaluate(0.01)).toBe("perfect");
  });

  it("TemperatureSystem считает качество", () => {
    const score = new TemperatureSystem().evaluate(80, [78, 86]);
    expect(score).toBeGreaterThan(0.9);
  });

  it("ComboSystem увеличивает комбо", () => {
    const combo = new ComboSystem();
    combo.add("perfect");
    combo.add("perfect");
    expect(combo.combo).toBe(2);
  });

  it("EconomySystem рассчитывает награду", () => {
    const reward = new EconomySystem().reward(20, 0.8, 1.2);
    expect(reward).toBe(19);
  });

  it("UpgradeSystem проверяет покупку", () => {
    const us = new UpgradeSystem();
    const can = us.canBuy(5000, upgrades[0].id, new Set<string>());
    expect(can).toBe(true);
  });
});

describe("сервисы", () => {
  it("SaveService возвращает дефолт", () => {
    const s = new SaveService();
    const data = s.createDefaultSave();
    expect(data.day).toBe(1);
  });

  it("SaveService выдает стартовую косметику", () => {
    const data = new SaveService().createDefaultSave();
    expect(data.ownedCosmetics.cups).toContain(cosmetics.cups[0]);
    expect(data.equippedCosmetics.samovars).toBe(cosmetics.samovars[0]);
  });

  it("в игре есть набор достижений", () => {
    expect(achievements.length).toBeGreaterThanOrEqual(8);
    expect(achievements.every((achievement) => achievement.reward > 0)).toBe(true);
  });

  it("LocalizationService работает через t()", () => {
    const i18n = new LocalizationService();
    i18n.setLanguage("en");
    expect(i18n.getLanguage()).toBe("ru");
    expect(i18n.t("gameTitle")).toBe("Чайная на бегу");
  });

  it("ResponsiveLayoutService выявляет слишком малый экран", () => {
    const layout = new ResponsiveLayoutService();
    expect(layout.compute(800, 500).tooSmall).toBe(true);
  });
});

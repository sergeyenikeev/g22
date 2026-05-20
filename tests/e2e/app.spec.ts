import { expect, test } from "@playwright/test";

test("игра запускается и показывает русское меню", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Чайная на бегу")).toBeVisible();
  await expect(page.getByRole("button", { name: /Играть/ })).toBeVisible();
});

test("контекстное меню отключено глобально", async ({ page }) => {
  await page.goto("/");
  const prevented = await page.evaluate(() => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    const ok = document.dispatchEvent(event);
    return !ok || event.defaultPrevented;
  });
  expect(prevented).toBeTruthy();
});

test("изменение размера не ломает интерфейс", async ({ page }) => {
  await page.goto("/");
  await page.setViewportSize({ width: 960, height: 540 });
  await expect(page.getByRole("button", { name: /Играть/ })).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.getByRole("button", { name: /Играть/ })).toBeVisible();
});

test("минимальное desktop-разрешение не прячет меню и управление сменой", async ({ page }) => {
  await page.setViewportSize({ width: 960, height: 540 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /Настройки/ })).toBeInViewport();
  await page.getByRole("button", { name: /Играть/ }).click();
  await page.getByRole("button", { name: "Начать день" }).click();
  await expect(page.getByRole("button", { name: "Поймать ингредиент" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Подать" })).toBeInViewport();
});

test("нет системного скролла", async ({ page }) => {
  await page.goto("/");
  const noScroll = await page.evaluate(() => {
    const html = getComputedStyle(document.documentElement).overflow;
    const body = getComputedStyle(document.body).overflow;
    return html === "hidden" && body === "hidden";
  });
  expect(noScroll).toBeTruthy();
});

test("игровой экран показывает крупные кнопки и канвас", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Играть/ }).click();
  await page.getByRole("button", { name: "Начать день" }).click();
  await expect(page.locator("#game-canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: "Поймать ингредиент" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Подать" })).toBeVisible();
});

test("дополнительные режимы запускаются из меню", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Бесконечная смена" }).click();
  await expect(page.locator("#game-canvas")).toBeVisible();
  await expect(page.getByText("Режим: Бесконечная смена")).toBeVisible();
  await page.getByRole("button", { name: "Пауза" }).click();
  await page.getByRole("button", { name: "Завершить смену" }).click();
  await page.getByRole("button", { name: "Назад" }).click();
  await page.getByRole("button", { name: "Чайный блиц" }).click();
  await expect(page.getByText("Осталось:")).toBeVisible();
});

test("косметика и достижения показывают реальные карточки", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Украшения" }).click();
  await expect(page.getByText("Чашки")).toBeVisible();
  await expect(page.getByText("Классическая чашка")).toBeVisible();
  await expect(page.getByRole("button", { name: "Выбрано" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Назад" }).click();
  await page.getByRole("button", { name: "Достижения" }).click();
  await expect(page.getByText("Первая смена")).toBeVisible();
});

test("настройки содержат звук, подсказки, графику и облако", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Настройки/ }).click();
  await expect(page.getByText("Громкость музыки")).toBeVisible();
  await expect(page.getByText("Громкость звуков")).toBeVisible();
  await expect(page.getByText("Подсказки")).toBeVisible();
  await expect(page.getByText("Качество графики")).toBeVisible();
  await expect(page.getByRole("button", { name: "Войти для облачного сохранения" })).toBeVisible();
});

test("ручное завершение кампании без заказов не продвигает день", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Играть/ }).click();
  await page.getByRole("button", { name: "Начать день" }).click();
  await page.getByRole("button", { name: "Пауза" }).click();
  await page.getByRole("button", { name: "Завершить смену" }).click();
  await expect(page.getByText("Без звезд")).toBeVisible();
  await expect(page.getByText("Монеты: +0")).toBeVisible();
  await page.getByRole("button", { name: "Дальше" }).click();
  await expect(page.getByText("Кампания · День 1")).toBeVisible();
  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByText("Монеты: 300")).toBeVisible();
});

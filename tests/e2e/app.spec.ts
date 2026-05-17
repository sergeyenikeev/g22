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

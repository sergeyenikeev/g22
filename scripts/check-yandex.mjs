import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const distIndex = path.join(root, "dist", "index.html");
const viteConfig = path.join(root, "vite.config.ts");
const publicationDir = path.join(root, "docs", "yandex-publication");

const requiredPublication = [
  "title.txt",
  "short-description-ru.txt",
  "full-description-ru.txt",
  "how-to-play-ru.txt",
  "about-ru.txt",
  "categories.txt",
  "tags-ru.txt",
  "moderation-comment-ru.txt",
  "asset-rights.md",
  "moderation-checklist.md",
  "test-report.md"
];

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

if (!fs.existsSync(distIndex)) fail("dist/index.html отсутствует");
if (!fs.existsSync(viteConfig)) fail("vite.config.ts отсутствует");

if (fs.existsSync(viteConfig)) {
  const text = fs.readFileSync(viteConfig, "utf-8");
  if (!text.includes("base: \"./\"") && !text.includes("base: './'")) fail("Vite base './' не найден");
}

if (fs.existsSync(distIndex)) {
  const html = fs.readFileSync(distIndex, "utf-8");
  if (!html.includes("./assets/")) fail("В dist/index.html нет относительных путей ./assets/");
  if (/["']\/assets\//.test(html)) fail("Найдены абсолютные пути /assets/");
}

const sourceHtml = fs.readFileSync(path.join(root, "index.html"), "utf-8");
if (!sourceHtml.includes("/sdk.js")) fail("SDK должен подключаться как /sdk.js");

requiredPublication.forEach((file) => {
  if (!fs.existsSync(path.join(publicationDir, file))) {
    fail(`Не найден файл публикации: ${file}`);
  }
});

const scanNames = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (/[А-Яа-я ]/.test(entry.name)) fail(`Недопустимое имя файла или папки: ${entry.name}`);
    if (entry.isDirectory()) scanNames(full);
  }
};

scanNames(path.join(root, "src"));
scanNames(path.join(root, "tests"));

console.log(process.exitCode ? "Проверки завершены с ошибками" : "check:yandex пройден");

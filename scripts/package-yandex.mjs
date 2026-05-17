import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const zipPath = path.join(releaseDir, "tea-run-yandex.zip");

if (!fs.existsSync(releaseDir)) fs.mkdirSync(releaseDir, { recursive: true });
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

execSync("npm run check:yandex", { stdio: "inherit" });

const command = `powershell -NoProfile -Command "Compress-Archive -Path dist\\* -DestinationPath release\\tea-run-yandex.zip -Force"`;
execSync(command, { stdio: "inherit" });

console.log(`Архив создан: ${zipPath}`);

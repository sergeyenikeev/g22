type Level = "debug" | "info" | "warn" | "error";

export class Logger {
  constructor(private readonly isDev = false) {}

  log(level: Level, message: string, details?: unknown): void {
    if (level === "debug" && !this.isDev) {
      return;
    }
    const payload = [`[${level.toUpperCase()}]`, message];
    if (details !== undefined) {
      payload.push(JSON.stringify(details));
    }
    const text = payload.join(" ");
    if (level === "error") console.error(text);
    else if (level === "warn") console.warn(text);
    else console.log(text);
  }

  debug(message: string, details?: unknown): void {
    this.log("debug", message, details);
  }
  info(message: string, details?: unknown): void {
    this.log("info", message, details);
  }
  warn(message: string, details?: unknown): void {
    this.log("warn", message, details);
  }
  error(message: string, details?: unknown): void {
    this.log("error", message, details);
  }
}

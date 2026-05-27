---
title: "09 · Logging, Config & Errors"
description: "Zod-validated config, structured logger, and discriminated error types"
---

# 09 · Logging, Config & Errors

::: info Learning Goals
Build a Zod-validated config system with file + CLI merge, a structured JSON logger, and a discriminated union for error types that maps to specific exit codes.
:::

## Configuration

### Schema

```typescript
// src/config/config.ts
import { z } from "zod";

const OWASP_CATEGORIES = [
  "A01:2021-Broken-Access-Control",
  "A02:2021-Cryptographic-Failures",
  "A03:2021-Injection",
  "A05:2021-Security-Misconfiguration",
  "A07:2021-Identification-Authentication-Failures",
] as const;

export type OwaspCategory = typeof OWASP_CATEGORIES[number];

export const SecReviewConfigSchema = z.object({
  model: z.string().default("claude-sonnet-4-5"),
  maxFiles: z.number().int().min(1).max(1000).default(100),
  maxTurns: z.number().int().min(1).max(100).default(20),
  categories: z.array(z.enum(OWASP_CATEGORIES)).default([...OWASP_CATEGORIES]),
  severity: z.enum(["low", "medium", "high", "critical"]).default("low"),
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),
  logFile: z.string().optional(),
  output: z.string().default("./sec-review-report.json"),
});

export type SecReviewConfig = z.infer<typeof SecReviewConfigSchema>;
```

### Loading with CLI Override

```typescript
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CONFIG_PATH = path.join(os.homedir(), ".sec-review", "config.json");

export async function loadConfig(cliArgs: Partial<SecReviewConfig>): Promise<SecReviewConfig> {
  let fileConfig: unknown = {};

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
    } catch {
      // malformed config — ignore, use defaults
    }
  }

  // CLI args override file config, which overrides schema defaults
  const merged = { ...fileConfig, ...cliArgs };  // [!code highlight]
  return SecReviewConfigSchema.parse(merged);
}

export async function saveConfig(config: Partial<SecReviewConfig>): Promise<void> {
  const dir = path.dirname(CONFIG_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
```

Config file location: `~/.sec-review/config.json`

```json
{
  "model": "claude-sonnet-4-5",
  "maxFiles": 50,
  "categories": ["A01:2021-Broken-Access-Control", "A03:2021-Injection"]
}
```

## Logger

```typescript
// src/utils/logger.ts
import fs from "node:fs";

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
};

export class Logger {
  private stream?: fs.WriteStream;

  constructor(
    private readonly level: LogLevel,
    logFile?: string,
  ) {
    if (logFile) {
      this.stream = fs.createWriteStream(logFile, { flags: "a" });
    }
  }

  debug(msg: string, data?: unknown) { this.log("debug", msg, data); }
  info(msg: string, data?: unknown)  { this.log("info",  msg, data); }
  warn(msg: string, data?: unknown)  { this.log("warn",  msg, data); }
  error(msg: string, data?: unknown) { this.log("error", msg, data); }

  private log(level: LogLevel, msg: string, data?: unknown): void {
    if (LEVELS[level] < LEVELS[this.level]) return;

    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg,
      ...(data !== undefined ? { data } : {}),
    });

    // Always write to file if configured
    if (this.stream) {
      this.stream.write(entry + "\n");
    }

    // Write warn/error to stderr so they don't pollute --no-tui stdout
    if (LEVELS[level] >= LEVELS["warn"]) {
      process.stderr.write(entry + "\n");
    }
  }

  close(): void {
    this.stream?.end();
  }
}
```

Usage:

```typescript
const logger = new Logger(config.logLevel, config.logFile);
logger.debug("tool_start", { name: "read_file", input: params });
logger.info("scan_complete", { findings: session.findings.length });
```

Debug mode — tail the log:

```bash
sec-review ./target --log-level debug --log-file /tmp/sec-review.log &
tail -f /tmp/sec-review.log | jq .
```

## Error Types

A discriminated union lets you map each error type to an exit code without `instanceof` chains:

```typescript
// src/utils/errors.ts
export type SecReviewError =
  | { type: "invalid_input"; message: string }
  | { type: "api_error"; message: string; cause?: unknown }
  | { type: "max_turns"; turnsElapsed: number; maxTurns: number }
  | { type: "permission_denied"; path: string }
  | { type: "report_write_failed"; outputPath: string; cause: unknown };

export function exitCodeFor(error: SecReviewError): number {
  switch (error.type) {
    case "invalid_input":       return 2;
    case "api_error":           return 3;
    case "max_turns":           return 4;
    case "permission_denied":   return 2;
    case "report_write_failed": return 3;
  }
}

export function formatError(error: SecReviewError): string {
  switch (error.type) {
    case "invalid_input":
      return `Invalid input: ${error.message}`;
    case "api_error":
      return `API error: ${error.message}`;
    case "max_turns":
      return `Max turns exceeded (${error.turnsElapsed}/${error.maxTurns}) — report not written`;
    case "permission_denied":
      return `Permission denied: ${error.path}`;
    case "report_write_failed":
      return `Failed to write report to ${error.outputPath}`;
  }
}
```

### Fatal Error Handler

```typescript
export function handleFatalError(err: unknown): never {
  if (isSecReviewError(err)) {
    process.stderr.write(formatError(err) + "\n");
    process.exit(exitCodeFor(err));
  }

  // Unknown error — log and exit with generic code
  process.stderr.write(`Unexpected error: ${String(err)}\n`);
  process.exit(3);
}

function isSecReviewError(err: unknown): err is SecReviewError {
  return typeof err === "object" && err !== null && "type" in err;
}
```

## Graceful Shutdown

```typescript
// src/utils/shutdown.ts
export function registerShutdownHandlers(app: SecReviewApp, logger: Logger): void {
  process.on("SIGINT", () => {
    logger.info("SIGINT received, aborting scan");
    app.abort();
    // Give the TUI 1s to render the aborted state
    setTimeout(() => {
      logger.close();
      process.exit(130);
    }, 1000);
  });

  process.on("uncaughtException", (err) => {
    logger.error("uncaught_exception", err);
    logger.close();
    process.exit(3);
  });

  process.on("unhandledRejection", (reason) => {
    logger.error("unhandled_rejection", reason);
    logger.close();
    process.exit(3);
  });
}
```

**Next:** [10 · Testing Strategy →](/guide/10-testing-strategy)

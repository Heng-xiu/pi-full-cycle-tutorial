---
title: "07 · Runtime Implementation"
description: "Build SecReviewApp: agent setup, tool wiring, three hooks, and the stop signal"
---

# 07 · Runtime Implementation

::: info Learning Goals
Implement the `SecReviewApp` class that wires together the Agent, four tools, and three hooks. Understand the stop-signal pattern and the event flow from agent to UI.
:::

## SecReviewApp Skeleton

```typescript
// src/agent/sec-review-app.ts
import { Agent } from "@earendil-works/pi-agent-core";
import { registerBuiltins } from "@earendil-works/pi-ai/providers";
import EventEmitter from "node:events";
import path from "node:path";
import { createListDirectoryTool } from "../tools/list-directory.js";
import { createReadFileTool } from "../tools/read-file.js";
import { createGrepPatternTool } from "../tools/grep-pattern.js";
import { createWriteReportTool } from "../tools/write-report.js";
import { buildSystemPrompt } from "./system-prompt.js";
import type { SecReviewConfig } from "../config/config.js";
import type { ScanSession } from "./types.js";

registerBuiltins();

export class SecReviewApp extends EventEmitter {
  private agent!: Agent;
  private session!: ScanSession;
  private turnsElapsed = 0;
  private reportWritten = false;

  constructor(
    private readonly scanRoot: string,
    private readonly config: SecReviewConfig,
  ) {
    super();
  }

  async run(): Promise<void> {
    const absRoot = path.resolve(this.scanRoot);
    this.session = {
      scanRoot: absRoot,
      startTime: Date.now(),
      assessedFiles: [],
      findings: [],
      totalFiles: 0,
      model: this.config.model,
    };

    this.agent = this.buildAgent(absRoot);
    this.bindEvents();
    await this.agent.prompt("Begin the security scan.");
  }

  abort(): void {
    this.agent?.abort();
  }
}
```

## Building the Agent

```typescript
private buildAgent(absRoot: string): Agent {
  const tools = [
    createListDirectoryTool(absRoot),
    createReadFileTool(absRoot),
    createGrepPatternTool(absRoot),
    createWriteReportTool(this.session, (reportPath, exitCode) => {
      this.reportWritten = true;
      this.emit("scan_complete", reportPath, exitCode);
      setTimeout(() => this.agent.abort(), 500);  // [!code highlight]
    }),
  ];

  return new Agent({
    initialState: {
      model: this.config.model,
      systemPrompt: buildSystemPrompt({
        scanRoot: absRoot,
        fileCount: this.session.totalFiles,
        model: this.config.model,
        categories: this.config.categories,
        minFiles: Math.min(5, this.config.maxFiles),
      }),
      tools,
    },
    getApiKey: () => process.env.ANTHROPIC_API_KEY!,
    toolExecution: "sequential",
    beforeToolCall: this.beforeToolCall.bind(this),
    afterToolCall: this.afterToolCall.bind(this),
    prepareNextTurn: this.prepareNextTurn.bind(this),
  });
}
```

## The Three Hooks

### beforeToolCall — Path Guard

```typescript
private async beforeToolCall(ctx: BeforeToolCallContext) {
  const { toolCall } = ctx;
  const pathParam = (toolCall.input as Record<string, unknown>).path as string | undefined;

  if (pathParam && (toolCall.name === "read_file" || toolCall.name === "list_directory")) {
    const resolved = path.resolve(this.session.scanRoot, pathParam);
    if (!resolved.startsWith(this.session.scanRoot)) {
      this.emit("warning", `Path traversal blocked: ${pathParam}`);
      return { blocked: true, reason: `Path '${pathParam}' is outside scan root` };
    }
  }
}
```

### afterToolCall — Rewrite + React

```typescript
private async afterToolCall(ctx: AfterToolCallContext) {
  const { toolCall, result } = ctx;

  // Track assessed files
  if (toolCall.name === "read_file" && result.type === "final") {
    const pathParam = (toolCall.input as Record<string, unknown>).path as string;
    if (!this.session.assessedFiles.includes(pathParam)) {
      this.session.assessedFiles.push(pathParam);
      this.emit("file_assessed", pathParam, this.session.assessedFiles.length);
    }
  }

  // Wrap file content to prevent prompt injection
  if (toolCall.name === "read_file" && result.type === "final") {
    return {
      result: `[FILE_CONTENT_START]\n${result.result}\n[FILE_CONTENT_END]`,  // [!code highlight]
    };
  }

  // Enforce minimum files before allowing write_report
  if (toolCall.name === "write_report") {
    const filesRead = this.session.assessedFiles.length;
    if (filesRead < 3 && this.session.totalFiles > 5) {
      this.agent.steer({
        role: "user",
        content: `You've only read ${filesRead} files. Please investigate more before reporting.`,
      });
      return undefined;
    }
  }
}
```

### prepareNextTurn — Budget

```typescript
private async prepareNextTurn() {
  this.turnsElapsed++;
  this.emit("turn", this.turnsElapsed, this.config.maxTurns);

  if (this.turnsElapsed >= this.config.maxTurns) {
    this.emit("max_turns_exceeded");
    this.agent.abort();
  }
}
```

## Binding Events to the UI

```typescript
private bindEvents(): void {
  this.agent.subscribe(async (event) => {
    switch (event.type) {
      case "run_start":
        this.emit("scan_started");
        break;

      case "assistant_delta":
        this.emit("thinking", event.text);
        break;

      case "tool_execution_start":
        this.emit("tool_start", event.toolCall.name, event.toolCall.input);
        break;

      case "tool_execution_end":
        this.emit("tool_end", event.toolCall.name, event.result);
        break;

      case "run_error":
        this.emit("error", event.error);
        break;

      case "abort":
        if (!this.reportWritten) {
          this.emit("aborted");
        }
        break;
    }
  });
}
```

## The Stop Signal Pattern

The stop signal is the most important invariant in the agent:

```
write_report called
       │
afterToolCall fires (if needed, steer agent back)
       │
onReportWritten callback fires
       │   ├── emit("scan_complete", reportPath, exitCode)
       │   └── setTimeout(() => agent.abort(), 500)  ← [!code highlight]
       │
500ms later: agent.abort() fires
       │
event: "abort" → UI shows "Scan complete"
       │
process.exit(exitCode)
```

The 500ms delay exists because `afterToolCall` fires while the LLM is still streaming its response. Aborting immediately would cut off the stream mid-token; 500ms is enough to let it finish cleanly.

## CLI Entry Point

```typescript
// src/cli.ts
#!/usr/bin/env node
import { parseArgs } from "./cli/parse-args.js";
import { loadConfig } from "./config/config.js";
import { SecReviewApp } from "./agent/sec-review-app.js";
import { SecReviewTUI } from "./tui/sec-review-tui.js";
import { handleFatalError } from "./utils/errors.js";

const args = parseArgs(process.argv.slice(2));
const config = await loadConfig(args);
const app = new SecReviewApp(args.scanPath, config);

process.on("SIGINT", () => {
  app.abort();
  process.exit(130);
});

if (args.noTui) {
  const { PlainOutput } = await import("./tui/plain-output.js");
  new PlainOutput(app);
} else {
  new SecReviewTUI(app, config);
}

try {
  await app.run();
} catch (err) {
  handleFatalError(err);
}
```

**Next:** [08 · TUI Implementation →](/guide/08-tui-implementation)

---
title: "08 · TUI Implementation"
description: "Build the sec-review terminal UI with pi-tui: five components, event binding, and live rendering"
---

# 08 · TUI Implementation

::: info Learning Goals
Build a live terminal UI using pi-tui's component model. Connect it to SecReviewApp events. Implement five components: header, progress panel, findings list, log stream, and status bar.
:::

## pi-tui Component Model

Every pi-tui component implements this interface:

```typescript
interface Component {
  render(width: number): string[];  // return lines to display
  handleInput?(data: Buffer): void; // handle keyboard input
  invalidate(): void;               // mark as needing re-render
}
```

The TUI renderer calls `render(width)` on each component, diffs the output against the previous render, and repaints only changed lines. This makes it efficient even with rapid event streams.

## SecReviewTUI Layout

```
┌──────────────────────────────────────┐
│ sec-review  v1.0.0    claude-sonnet  │  ← HeaderBox
├──────────────────────────────────────┤
│ Progress                             │  ← ProgressPanel
│ Files: 12/50  Turn: 3/20            │
│ Current: src/auth.ts                │
├──────────────────────────────────────┤
│ Findings (2)                         │  ← FindingsList
│ [CRITICAL] SQL injection · db.ts:47  │
│ [HIGH]     Weak hashing · auth.ts:12 │
├──────────────────────────────────────┤
│ ► list_directory "src/"             │  ← LogStream
│ ► read_file "src/auth.ts"           │
│ ► grep_pattern "eval\s*\("         │
├──────────────────────────────────────┤
│ Scanning...  [q] quit               │  ← StatusBar
└──────────────────────────────────────┘
```

## SecReviewTUI Class

```typescript
// src/tui/sec-review-tui.ts
import { TUI } from "@earendil-works/pi-tui";
import { HeaderBox } from "./components/header.js";
import { ProgressPanel } from "./components/progress-panel.js";
import { FindingsList } from "./components/findings-list.js";
import { LogStream } from "./components/log-stream.js";
import { StatusBar } from "./components/status-bar.js";
import type { SecReviewApp } from "../agent/sec-review-app.js";
import type { SecReviewConfig } from "../config/config.js";

export class SecReviewTUI {
  private tui: TUI;
  private header: HeaderBox;
  private progress: ProgressPanel;
  private findings: FindingsList;
  private logStream: LogStream;
  private statusBar: StatusBar;

  constructor(app: SecReviewApp, config: SecReviewConfig) {
    this.header = new HeaderBox(config.model);
    this.progress = new ProgressPanel();
    this.findings = new FindingsList();
    this.logStream = new LogStream();
    this.statusBar = new StatusBar();

    this.tui = new TUI({
      components: [
        this.header,
        this.progress,
        this.findings,
        this.logStream,
        this.statusBar,
      ],
      onInput: (data) => {
        if (data.toString() === "q") app.abort();
      },
    });

    this.bindAppEvents(app);
    this.tui.start();
  }

  private bindAppEvents(app: SecReviewApp): void {
    app.on("scan_started", () => {
      this.statusBar.setStatus("Scanning...");
      this.tui.render();
    });

    app.on("file_assessed", (filePath: string, count: number) => {
      this.progress.setCurrentFile(filePath);
      this.progress.setFilesAssessed(count);
      this.progress.invalidate();
      this.tui.render();
    });

    app.on("turn", (current: number, max: number) => {
      this.progress.setTurn(current, max);
      this.progress.invalidate();
      this.tui.render();
    });

    app.on("tool_start", (toolName: string, input: unknown) => {
      this.logStream.addEntry(`► ${toolName} ${formatInput(input)}`);
      this.logStream.invalidate();
      this.tui.render();
    });

    app.on("finding_added", (finding: Finding) => {
      this.findings.addFinding(finding);
      this.findings.invalidate();
      this.tui.render();
    });

    app.on("scan_complete", (reportPath: string, exitCode: number) => {
      this.statusBar.setStatus(
        exitCode === 0 ? "✓ Clean scan" : `✗ ${this.findings.count} finding(s) — ${reportPath}`
      );
      this.statusBar.invalidate();
      this.tui.render();
      setTimeout(() => this.tui.stop(), 2000);
    });

    app.on("aborted", () => {
      this.statusBar.setStatus("Aborted");
      this.statusBar.invalidate();
      this.tui.render();
      this.tui.stop();
    });
  }
}
```

## Component Implementations

### HeaderBox

```typescript
// src/tui/components/header.ts
import { Box, Text } from "@earendil-works/pi-tui";

export class HeaderBox implements Component {
  private needsRender = true;
  private cached: string[] = [];

  constructor(private readonly model: string) {}

  render(width: number): string[] {
    if (!this.needsRender) return this.cached;
    this.needsRender = false;
    this.cached = Box.render(
      [Text.bold("sec-review"), Text.dim(`  ${this.model}`)],
      width,
    );
    return this.cached;
  }

  invalidate(): void { this.needsRender = true; }
}
```

### ProgressPanel

```typescript
// src/tui/components/progress-panel.ts
export class ProgressPanel implements Component {
  private filesAssessed = 0;
  private currentFile = "";
  private turn = 0;
  private maxTurns = 20;
  private needsRender = true;
  private cached: string[] = [];

  setFilesAssessed(n: number) { this.filesAssessed = n; this.needsRender = true; }
  setCurrentFile(f: string) { this.currentFile = f; this.needsRender = true; }
  setTurn(current: number, max: number) { this.turn = current; this.maxTurns = max; this.needsRender = true; }

  render(width: number): string[] {
    if (!this.needsRender) return this.cached;
    this.needsRender = false;
    this.cached = [
      `Files assessed: ${this.filesAssessed}   Turn: ${this.turn}/${this.maxTurns}`,
      this.currentFile ? `Analyzing: ${this.currentFile}` : "",
    ].filter(Boolean);
    return this.cached;
  }

  invalidate(): void { this.needsRender = true; }
}
```

### LogStream

```typescript
// src/tui/components/log-stream.ts
import { ScrollView } from "@earendil-works/pi-tui";

export class LogStream implements Component {
  private entries: string[] = [];
  private needsRender = true;
  private cached: string[] = [];
  private readonly maxEntries = 100;

  addEntry(line: string): void {
    this.entries.push(line);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
    this.needsRender = true;
  }

  render(width: number): string[] {
    if (!this.needsRender) return this.cached;
    this.needsRender = false;
    const visible = this.entries.slice(-8);  // show last 8 entries
    this.cached = ScrollView.render(visible, width);
    return this.cached;
  }

  invalidate(): void { this.needsRender = true; }
}
```

## `--no-tui` Mode

For CI environments, skip the TUI entirely:

```typescript
// src/tui/plain-output.ts
import type { SecReviewApp } from "../agent/sec-review-app.js";
import type { Finding } from "../agent/types.js";

export class PlainOutput {
  constructor(app: SecReviewApp) {
    app.on("tool_start", (name: string) => {
      process.stderr.write(`[tool] ${name}\n`);
    });
    app.on("finding_added", (f: Finding) => {
      process.stderr.write(`[${f.severity.toUpperCase()}] ${f.title} · ${f.file}:${f.line}\n`);
    });
    app.on("scan_complete", (reportPath: string) => {
      process.stdout.write(`Report: ${reportPath}\n`);
    });
  }
}
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `q` | Abort scan gracefully |
| `↑` / `↓` | Scroll findings list |
| `Enter` | Expand selected finding |

**Next:** [09 · Logging, Config & Errors →](/guide/09-logging-config-errors)

---
title: "10 · Testing Strategy"
description: "Four-layer test pyramid: unit, integration with mocked LLM, TUI snapshots, and e2e"
---

# 10 · Testing Strategy

::: info Learning Goals
Build a four-layer test suite using Vitest. Learn how to test agent behavior without calling a real LLM by injecting mock responses. Write snapshot tests for TUI components.
:::

## Test Pyramid

```
                    e2e
               (real LLM, skipped without key)
              ─────────────────────────────────
           integration
        (mocked LLM, fast, deterministic)
        ─────────────────────────────────────
     unit tests     snapshot tests
  (tools in isolation)  (TUI component output)
  ─────────────────────────────────────────────
```

## Setup

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/tests/setup.ts"],
    testTimeout: 30_000,
  },
});
```

```typescript
// src/tests/setup.ts
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function createTestFixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sec-review-test-"));

  for (const [relativePath, content] of Object.entries(files)) {
    const abs = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }

  return {
    root,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

export const noopSignal = new AbortController().signal;
```

## Unit Tests: Tools

### list_directory

```typescript
// src/tests/tools/list-directory.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createListDirectoryTool } from "../../tools/list-directory.js";
import { createTestFixture, noopSignal } from "../setup.js";

describe("list_directory", () => {
  let cleanup: () => void;

  afterEach(() => cleanup?.());

  it("returns files in the directory", async () => {
    const { root, cleanup: c } = createTestFixture({
      "src/auth.ts": "// auth",
      "src/db.ts": "// db",
      "README.md": "# readme",
    });
    cleanup = c;

    const tool = createListDirectoryTool(root);
    const result = await tool.execute({ path: ".", recursive: false }, noopSignal);

    expect(result.type).toBe("final");
    const data = JSON.parse((result as { type: "final"; result: string }).result);
    expect(data.entries.some((e: { name: string }) => e.name === "src")).toBe(true);
  });

  it("blocks path traversal", async () => {
    const { root, cleanup: c } = createTestFixture({ "file.ts": "" });
    cleanup = c;

    const tool = createListDirectoryTool(root);
    const result = await tool.execute({ path: "../../etc", recursive: false }, noopSignal);

    expect(result.type).toBe("error");
    expect((result as { type: "error"; error: string }).error).toMatch(/outside scan root/i);
  });
});
```

### read_file with line numbers

```typescript
it("prepends line numbers", async () => {
  const { root, cleanup: c } = createTestFixture({
    "src/auth.ts": "import express from 'express';\nconst app = express();\n",
  });
  cleanup = c;

  const tool = createReadFileTool(root);
  const result = await tool.execute({ path: "src/auth.ts" }, noopSignal);

  expect(result.type).toBe("final");
  const data = JSON.parse((result as { type: "final"; result: string }).result);
  expect(data.content).toMatch(/^\s+1 \|/);
  expect(data.content).toMatch(/^\s+2 \|/m);
});
```

## Integration Tests: Mocked LLM

The key to fast, deterministic agent tests is injecting mock LLM responses:

```typescript
// src/tests/integration/sec-review-app.test.ts
import { describe, it, expect, vi } from "vitest";
import { SecReviewApp } from "../../agent/sec-review-app.js";
import { createTestFixture } from "../setup.js";

// Mock the LLM to return a scripted tool call sequence
vi.mock("@earendil-works/pi-ai/providers", () => ({
  registerBuiltins: vi.fn(),
  streamSimple: vi.fn().mockImplementation(async function* (opts) {
    // Turn 1: list_directory call
    yield { type: "tool_use", id: "t1", name: "list_directory", input: { path: ".", recursive: false } };
    // Turn 2: read_file call
    yield { type: "tool_use", id: "t2", name: "read_file", input: { path: "src/app.ts" } };
    // Turn 3: write_report
    yield {
      type: "tool_use", id: "t3", name: "write_report",
      input: {
        findings: [{
          id: "FINDING-001",
          owaspCategory: "A03:2021-Injection",
          severity: "critical",
          title: "SQL Injection",
          description: "User input concatenated into SQL query",
          file: "src/app.ts",
          line: 5,
          codeSnippet: "db.query(`SELECT * FROM users WHERE id = '${id}'`)",
          recommendation: "Use parameterized queries",
          confidence: "high",
        }],
        summary: "Found 1 critical finding",
        scannedFiles: ["src/app.ts"],
        scanDurationMs: 1000,
      },
    };
  }),
}));

describe("SecReviewApp integration", () => {
  it("completes scan and emits scan_complete", async () => {
    const { root, cleanup } = createTestFixture({
      "src/app.ts": [
        "import { db } from './db';",
        "app.get('/user', async (req, res) => {",
        "  const id = req.query.id;",
        "  const user = await db.query(",
        "    `SELECT * FROM users WHERE id = '${id}'`",
        "  );",
        "  res.json(user);",
        "});",
      ].join("\n"),
    });

    const app = new SecReviewApp(root, { model: "claude-sonnet-4-5", maxFiles: 10, maxTurns: 5 });

    await new Promise<void>((resolve, reject) => {
      app.on("scan_complete", () => resolve());
      app.on("error", reject);
      app.run().catch(reject);
    });

    cleanup();
  });
});
```

## Snapshot Tests: TUI Components

```typescript
// src/tests/snapshots/progress-panel.test.ts
import { describe, it, expect } from "vitest";
import { ProgressPanel } from "../../tui/components/progress-panel.js";

describe("ProgressPanel", () => {
  it("renders initial state", () => {
    const panel = new ProgressPanel();
    expect(panel.render(60)).toMatchSnapshot();
  });

  it("renders with current file", () => {
    const panel = new ProgressPanel();
    panel.setCurrentFile("src/auth.ts");
    panel.setFilesAssessed(3);
    panel.setTurn(2, 20);
    panel.invalidate();
    expect(panel.render(60)).toMatchSnapshot();
  });
});
```

Run to generate snapshots initially:
```bash
npx vitest run src/tests/snapshots/ -u
```

## End-to-End Tests

E2E tests call the real LLM and are skipped when `ANTHROPIC_API_KEY` is not set:

```typescript
// src/tests/e2e/full-scan.test.ts
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { SecReviewApp } from "../../agent/sec-review-app.js";
import { createTestFixture } from "../setup.js";

const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!hasApiKey)("e2e: full scan", () => {
  it("finds SQL injection in test fixture", async () => {
    const { root, cleanup } = createTestFixture({
      "src/db.ts": `
        import mysql from 'mysql';
        export function getUser(id) {
          return db.query("SELECT * FROM users WHERE id = '" + id + "'");
        }
      `,
    });

    const app = new SecReviewApp(root, {
      model: "claude-haiku-4-5",  // cheapest model for e2e
      maxFiles: 10,
      maxTurns: 10,
    });

    let reportPath: string | undefined;
    app.on("scan_complete", (path: string) => { reportPath = path; });
    await app.run();

    expect(reportPath).toBeTruthy();
    const report = JSON.parse(fs.readFileSync(reportPath!, "utf-8"));
    const findings = report.findings as Array<{ owaspCategory: string }>;
    expect(findings.some(f => f.owaspCategory.includes("A03"))).toBe(true);

    cleanup();
  }, 120_000);  // 2 minute timeout for real LLM
});
```

## Running Tests

```bash
npm test                              # unit + snapshot (fast)
npm run test:coverage                 # with coverage report
npx vitest run src/tests/e2e/         # e2e (needs ANTHROPIC_API_KEY)
npx vitest watch                      # interactive watch mode
```

Target: **≥ 80% line coverage** on `src/tools/` and `src/agent/`.

**Next:** [11 · npm Package →](/guide/11-npm-package)

---
title: "14 · Final Project Structure"
description: "Canonical layout, dependency graph, data flow, and build checklist"
---

# 14 · Final Project Structure

## Directory Tree

```
sec-review/
├── package.json            ← npm package manifest
├── tsconfig.json           ← TypeScript compiler config
├── tsconfig.bun.json       ← Bun binary overrides
├── vitest.config.ts
├── Makefile
│
├── src/
│   ├── index.ts            ← public API exports
│   ├── cli.ts              ← CLI entry (#!/usr/bin/env node)
│   │
│   ├── cli/
│   │   └── parse-args.ts   ← argv parser
│   │
│   ├── agent/
│   │   ├── types.ts        ← ScanSession, Finding, OwaspCategory
│   │   ├── system-prompt.ts
│   │   ├── sec-review-app.ts   ← main orchestrator
│   │   └── headless-runner.ts
│   │
│   ├── tools/
│   │   ├── list-directory.ts
│   │   ├── read-file.ts
│   │   ├── grep-pattern.ts
│   │   └── write-report.ts
│   │
│   ├── tui/
│   │   ├── sec-review-tui.ts
│   │   ├── plain-output.ts
│   │   └── components/
│   │       ├── header.ts
│   │       ├── progress-panel.ts
│   │       ├── findings-list.ts
│   │       ├── log-stream.ts
│   │       └── status-bar.ts
│   │
│   ├── config/
│   │   └── config.ts
│   │
│   └── utils/
│       ├── errors.ts
│       ├── language.ts
│       ├── logger.ts
│       ├── retry.ts
│       └── shutdown.ts
│
├── src/tests/
│   ├── setup.ts
│   ├── tools/              ← unit tests
│   ├── integration/        ← mocked-LLM tests
│   ├── snapshots/          ← TUI component snapshots
│   └── e2e/                ← real-LLM tests (skipped without API key)
│
├── dist/                   ← TypeScript output (gitignored)
├── bin/                    ← Bun binaries (gitignored)
│
└── electron/               ← macOS DMG packaging
    ├── package.json
    ├── src/
    │   ├── main.js
    │   └── preload.js
    ├── renderer/
    │   └── index.html
    ├── resources/
    │   ├── icon.icns
    │   └── entitlements.mac.plist
    └── scripts/
        └── notarize.js
```

## Dependency Graph

```
sec-review
│
├── @earendil-works/pi-agent-core  ← Agent, AgentTool, AgentEvent
├── @earendil-works/pi-ai          ← streamSimple, registerBuiltins, models
├── @earendil-works/pi-tui         ← TUI, components
├── chalk                           ← ANSI color strings
├── glob                            ← file globbing
└── zod                             ← runtime config validation
```

## Data Flow

```
$ sec-review ./my-app
       │
cli.ts → SecReviewApp
              │
    ┌─────────┴──────────┐
    │                    │
 Agent               SecReviewTUI
 ├─ systemPrompt         ├─ HeaderBox
 ├─ tools × 4           ├─ ProgressPanel
 └─ hooks × 3           ├─ FindingsList
    │                   ├─ LogStream
    │  AgentEvent        └─ StatusBar
    └────────────────────────▶ render()

[ReAct loop: list→read→grep→write_report]
       │
 write_report called
       │
 abort() + scan_complete event
       │
 process.exit(0 or 1)
```

## Configuration Precedence

```
CLI flags
   > ~/.sec-review/config.json
      > built-in defaults (claude-sonnet-4-5, 100 files, all OWASP)
```

## Build Checklist

### Development

```bash
npm install                 # install deps
npm run lint                # type-check only (no output)
npm run build               # compile TypeScript
npm test                    # unit + snapshot tests
```

### Pre-release

```bash
npm run test:coverage       # verify ≥ 80% lines
npm pack --dry-run          # inspect tarball contents
make binary                 # Bun standalone binary
./bin/sec-review-darwin-arm64 --version
./bin/sec-review-darwin-arm64 ./test-target --no-tui
```

### Release

```bash
npm version patch            # bump version + git tag
npm publish                  # publish to npm
git push origin main --tags  # triggers GitHub Actions release
```

### macOS DMG (requires Apple credentials)

```bash
cd electron && npm run build:mac
codesign -dv --verbose=4 dist-electron/mac-arm64/sec-review.app
spctl -a -vvv -t install dist-electron/mac-arm64/sec-review.app
```

## Key Invariants

::: warning These must always be true
1. `src/index.ts` exports only stable typed interfaces
2. Tools **never modify** files in the scan root — read-only always
3. `beforeToolCall` **always** validates paths against `scanRoot`
4. `write_report` is always the **last** tool call
5. `dist/cli.js` always has `#!/usr/bin/env node` on line 1
6. Exit codes always match the spec: 0/1/2/3/4
7. The TUI never writes to files — only reads events, writes to stdout
:::

**Next:** [15 · Failure Modes & Debugging →](/guide/15-failure-modes-debugging)

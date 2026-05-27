---
title: "02 · Repository Walkthrough"
description: "Understand the pi monorepo layout and the role of each package"
---

# 02 · Repository Walkthrough

::: info Learning Goals
Map the pi monorepo, understand the three core packages you will consume, and know where to look when you hit a type error or unexpected behavior.
:::

## Top-Level Layout

```
pi/
├── packages/
│   ├── pi-ai/              ← LLM provider abstraction
│   ├── pi-agent-core/      ← Agent loop + event bus
│   ├── pi-tui/             ← Terminal UI framework
│   └── pi-coding-agent/    ← Reference implementation
│
├── package.json            ← npm workspaces root
├── tsconfig.base.json      ← shared TypeScript settings
└── turbo.json              ← Turborepo build pipeline
```

## Package Roles

### `@earendil-works/pi-ai` — Provider Abstraction

Normalizes different LLM providers (Anthropic, OpenAI, Ollama) behind a single `streamSimple` function. You rarely call this directly; pi-agent-core calls it for you.

Key exports:
- `registerBuiltins()` — registers Anthropic + OpenAI providers
- `streamSimple(opts)` — raw streaming, used internally by Agent
- `MODELS` — typed list of known model IDs

### `@earendil-works/pi-agent-core` — The Loop

The core package you build against. Implements the ReAct loop, tool dispatch, and the event bus.

Key exports:

```typescript
import {
  Agent,           // the main class
  AgentTool,       // tool interface
  AgentEvent,      // discriminated union of all events
  AgentMessage,    // message in the conversation history
  AgentToolResult, // { type: "final" | "error", result/error: string }
} from "@earendil-works/pi-agent-core";
```

### `@earendil-works/pi-tui` — Terminal UI

A lightweight differential-rendering terminal UI framework. Components are pure functions from state to string arrays; the framework diffs and repaints only changed lines.

Key exports:

```typescript
import {
  TUI,             // the renderer
  Component,       // interface: render(width): string[], handleInput(data), invalidate()
  Box,             // bordered container
  Text,            // styled text
  ScrollView,      // scrollable text region
} from "@earendil-works/pi-tui";
```

### `@earendil-works/pi-coding-agent` — Reference Implementation

A fully-featured coding agent that can read, write, and run code. Study it to see real-world usage of all three packages above. Do **not** copy-paste it; use it as a reference.

## TypeScript Configuration

All packages share `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

::: warning The `.js` extension rule
`"moduleResolution": "NodeNext"` requires all relative imports to use `.js` extensions in TypeScript source files — even though the source files are `.ts`. This is not a bug; Node's ESM resolver sees the compiled output.

```typescript
// ❌ Will fail at runtime
import { buildSystemPrompt } from "./system-prompt";

// ✅ Correct
import { buildSystemPrompt } from "./system-prompt.js";
```
:::

## Build Pipeline

```bash
# From repo root (builds all packages in dependency order):
npm run build

# Individual package:
cd packages/pi-agent-core && npm run build
```

The build uses `tsc` and outputs to each package's `dist/` directory. Turborepo caches outputs so unchanged packages are skipped on subsequent builds.

## Browsing the Source

| What to look for | Where |
|-----------------|-------|
| `Agent` class implementation | `packages/pi-agent-core/src/agent.ts` |
| Hook interfaces (`beforeToolCall`, `afterToolCall`) | `packages/pi-agent-core/src/types.ts` |
| `AgentEvent` discriminated union | `packages/pi-agent-core/src/events.ts` |
| TUI component lifecycle | `packages/pi-tui/src/tui.ts` |
| Anthropic provider | `packages/pi-ai/src/providers/anthropic.ts` |

**Next:** [03 · Architecture Analysis →](/guide/03-architecture-analysis)

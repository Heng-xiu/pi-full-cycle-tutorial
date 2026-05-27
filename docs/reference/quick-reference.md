---
title: Quick Reference
description: One-page cheat sheet for the pi-agent API and sec-review patterns
---

# Quick Reference

## pi-agent-core API

```typescript
import { Agent } from "@earendil-works/pi-agent-core";
import { registerBuiltins } from "@earendil-works/pi-ai/providers";

registerBuiltins();

const agent = new Agent({
  initialState: {
    model: "claude-sonnet-4-5",
    systemPrompt: "…",
    tools: [myTool],
  },
  getApiKey: (provider) => process.env[`${provider.toUpperCase()}_API_KEY`],
  toolExecution: "parallel",          // or "sequential"
  beforeToolCall: async (ctx) => { /* return { blocked: true } to block */ },
  afterToolCall:  async (ctx) => { /* return { result: "…" } to rewrite */ },
  prepareNextTurn: async () => { /* return AgentLoopTurnUpdate or undefined */ },
});

const unsub = agent.subscribe(async (event) => { /* … */ });
await agent.prompt("Do the thing.");
unsub();
```

## AgentTool Shape

```typescript
import { Type } from "@sinclair/typebox";

const myTool: AgentTool = {
  name:        "tool_name",
  description: "What this tool does (shown to LLM in tool list)",
  parameters:  Type.Object({
    path: Type.String({ description: "File path relative to root" }),
    limit: Type.Optional(Type.Number({ default: 100 })),
  }),
  async execute(params, signal) {
    if (signal.aborted) return { type: "error", error: "Aborted" };
    // … do work (must be async / non-blocking) …
    return { type: "final", result: JSON.stringify(output) };
  },
};
```

## AgentEvent Types

| Event type | Key fields |
|-----------|-----------|
| `run_start` | — |
| `run_end` | `messages: AgentMessage[]` |
| `run_error` | `error: unknown` |
| `assistant_delta` | `text: string` |
| `thinking_delta` | `thinking: string` |
| `tool_execution_start` | `toolCall: { name, input }` |
| `tool_execution_end` | `toolCall`, `result: AgentToolResult` |
| `abort` | — |

## Stop Conditions

| Condition | How |
|-----------|-----|
| LLM makes no tool calls | Automatic (default behavior) |
| Specific tool called | `afterToolCall` → `setTimeout(() => agent.abort(), 500)` |
| Max turns reached | `prepareNextTurn` counter → `agent.abort()` |
| User Ctrl+C | `process.on("SIGINT")` → `agent.abort()` |

## Tool Result Formatting Rules

| Rule | Why |
|------|-----|
| Always JSON, not prose | LLM reasons better over structured data |
| Prepend line numbers in file reads | LLM must cite them in findings |
| Always include `truncated: boolean` | LLM must know to request more |
| Cap results at ~6,000 chars | Larger results crowd context |
| Include `language`, `totalLines` metadata | Helps LLM reason about scope |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean scan, no findings at/above severity threshold |
| 1 | Findings found |
| 2 | Invalid input (bad path, no source files) |
| 3 | API error (non-retryable) |
| 4 | Max turns exceeded |
| 130 | User abort (SIGINT) |

## Config File

```json
// ~/.sec-review/config.json
{
  "model": "claude-sonnet-4-5",
  "maxFiles": 100,
  "maxTurns": 20,
  "categories": ["A01:2021-Broken-Access-Control", "A03:2021-Injection"],
  "logLevel": "debug",
  "logFile": "~/.sec-review/debug.log"
}
```

## Build Commands

```bash
npm run build             # compile TypeScript
npm test                  # unit + snapshot tests
npm run test:coverage     # with coverage report
npx vitest run src/tests/e2e  # e2e (needs ANTHROPIC_API_KEY)
make binary               # Bun binary (current platform)
make binary-all           # all platforms
npm publish               # publish to npm
```

## Debug Commands

```bash
# Verbose logging to file
sec-review ./target --log-level debug --no-tui 2>/tmp/debug.log
tail -f /tmp/debug.log | jq .

# Event tracing (set env var to enable)
SEC_REVIEW_DEBUG=1 sec-review ./target --no-tui 2>&1 | grep "\[tool"

# TypeScript errors only
npx tsc --noEmit 2>&1 | head -20
```

## Common Pitfalls

| Symptom | Fix |
|---------|-----|
| `ERR_MODULE_NOT_FOUND` | Add `.js` to all import paths in TypeScript |
| Agent loops forever | Add `abort()` in `afterToolCall` for `write_report` |
| Wrong line numbers cited | Require `read_file` before citing; strengthen prompt |
| Context overflow | Reduce `MAX_LINES` to 300, `MAX_ENTRIES` to 100 |
| Prompt injection | Wrap file content in `[FILE_CONTENT_START]…[FILE_CONTENT_END]` |
| Hardcoded password = "info" | Add concrete severity examples to system prompt |

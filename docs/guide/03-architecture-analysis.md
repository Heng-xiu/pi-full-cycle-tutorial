---
title: "03 · Architecture Analysis"
description: "ReAct loop mechanics, AgentTool contract, AgentEvent bus, and the three hook points"
---

# 03 · Architecture Analysis

::: info Learning Goals
Understand how the ReAct loop works, what the AgentTool contract requires, how to observe the agent with AgentEvent, and when to use each of the three hook points.
:::

## The ReAct Loop

pi-agent-core implements the classic Reason → Act → Observe loop:

```
User prompt
    │
    ▼
┌─────────────────────────────┐
│  LLM call (streaming)        │
│  → receives assistant delta  │
│  → may emit tool_use blocks  │
└─────────────┬───────────────┘
              │ tool calls?
         ┌────┴────┐
         │ Yes     │ No
         ▼         ▼
    Execute    run_end event
    tools      (loop stops)
         │
         ▼
   Append tool results
   to message history
         │
         └────────► LLM call again
```

The loop terminates when the LLM emits **no tool calls** in a turn. This is the natural stop condition. You can also force stop with `agent.abort()`.

## AgentTool Contract

Every tool must implement this interface:

```typescript
interface AgentTool {
  name: string;          // snake_case, unique
  description: string;   // shown to LLM in tool list — write clearly
  parameters: TSchema;   // TypeBox schema (compiled to JSON Schema)
  execute(
    params: unknown,     // validated against parameters schema
    signal: AbortSignal, // check signal.aborted before slow operations
  ): Promise<AgentToolResult>;
}

type AgentToolResult =
  | { type: "final"; result: string }   // success — result is a string (use JSON)
  | { type: "error"; error: string };   // error — LLM sees the message
```

::: tip Return JSON, not prose
The LLM reasons better over structured data. Always `JSON.stringify` your result:
```typescript
return { type: "final", result: JSON.stringify({ files: [...], count: 5 }) };
```
:::

## AgentEvent Bus

Subscribe to the agent's event stream with `agent.subscribe(handler)`. The handler receives a discriminated union:

```typescript
type AgentEvent =
  | { type: "run_start" }
  | { type: "run_end"; messages: AgentMessage[] }
  | { type: "run_error"; error: unknown }
  | { type: "assistant_delta"; text: string }         // streaming text token
  | { type: "thinking_delta"; thinking: string }      // extended thinking token
  | { type: "tool_execution_start"; toolCall: { name: string; input: unknown } }
  | { type: "tool_execution_end"; toolCall: { name: string; input: unknown }; result: AgentToolResult }
  | { type: "abort" };
```

Pattern — subscribe before calling `agent.prompt()`:

```typescript
const unsub = agent.subscribe(async (event) => {
  switch (event.type) {
    case "assistant_delta":
      process.stdout.write(event.text);
      break;
    case "tool_execution_start":
      console.error(`→ ${event.toolCall.name}`, event.toolCall.input);
      break;
    case "run_end":
      console.error(`Finished in ${event.messages.length} messages`);
      break;
  }
});

await agent.prompt("Analyze this codebase.");
unsub(); // always clean up
```

## The Three Hook Points

These are configured in the `Agent` constructor:

### `beforeToolCall` — Guard / Block

Called before every tool execution. Return `{ blocked: true, reason: "..." }` to prevent the call.

```typescript
beforeToolCall: async (ctx) => {
  const { toolCall } = ctx;
  if (toolCall.name === "read_file") {
    const resolved = path.resolve(scanRoot, toolCall.input.path);
    if (!resolved.startsWith(scanRoot)) {
      return { blocked: true, reason: "Path traversal blocked" };
    }
  }
},
```

### `afterToolCall` — Rewrite / React

Called after every tool execution. Can rewrite the result or trigger side effects (like stopping the loop).

```typescript
afterToolCall: async (ctx) => {
  // Rewrite: wrap file content to prevent prompt injection
  if (ctx.toolCall.name === "read_file") {
    return {
      result: `[FILE_CONTENT_START]\n${ctx.result.result}\n[FILE_CONTENT_END]`,
    };
  }

  // React: abort when the terminal tool is called
  if (ctx.toolCall.name === "write_report") {
    setTimeout(() => agent.abort(), 500);
  }
},
```

### `prepareNextTurn` — Budget / Steer

Called before each new LLM turn. Use for turn budgeting or injecting a user message to steer the agent.

```typescript
prepareNextTurn: async () => {
  turnsElapsed++;
  if (turnsElapsed >= config.maxTurns) {
    agent.abort();
    return;
  }
  // Optionally inject a message to guide the next turn:
  // return { role: "user", content: "Focus on auth-related files next." };
},
```

## Mental Model

Think of the agent as a **state machine with an event bus**:

```
State: { messages, tools, model }
         │
         ▼
   [LLM inference] ──────────────────────────► events: assistant_delta, thinking_delta
         │
   tool_use blocks?
         │ yes
         ▼
   beforeToolCall hook
         │ not blocked
         ▼
   execute tool ─────────────────────────────► events: tool_execution_start/end
         │
   afterToolCall hook
         │
   append to messages
         │
   prepareNextTurn hook ────── abort? ───────► event: abort
         │ continue
         ▼
   [LLM inference again]
```

Understanding this flow is the foundation for everything in the chapters ahead.

**Next:** [04 · Domain Selection →](/guide/04-domain-selection)

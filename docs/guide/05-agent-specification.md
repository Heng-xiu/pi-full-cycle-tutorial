---
title: "05 · Agent Specification"
description: "Formal spec: tools, output schema, stop condition, exit codes, and constraints"
---

# 05 · Agent Specification

::: info Learning Goals
Write a precise agent specification before touching code. A good spec prevents scope creep, guides prompt design, and makes testing straightforward.
:::

## Invocation

```bash
sec-review <path> [options]

Options:
  --model <id>          LLM model (default: claude-sonnet-4-5)
  --max-files <n>       Maximum files to scan (default: 100)
  --max-turns <n>       Maximum agent turns (default: 20)
  --categories <ids>    Comma-separated OWASP IDs (default: all 5)
  --severity <level>    Minimum severity to report: low|medium|high|critical
  --no-tui              Plain text output (for CI)
  --log-level <level>   debug|info|warn|error (default: info)
  --log-file <path>     Write logs to file
  --output <path>       Report output path (default: ./sec-review-report.json)
  --version             Print version
```

## Four Tools

### `list_directory`

```typescript
{
  name: "list_directory",
  parameters: {
    path: string,         // relative to scan root
    recursive: boolean,   // default false
    include_hidden: boolean, // default false
  }
}
```

Returns: `{ entries: Entry[], truncated: boolean, totalEntries: number }`
where `Entry = { name, path, type: "file"|"directory", size?, extension? }`

### `read_file`

```typescript
{
  name: "read_file",
  parameters: {
    path: string,   // relative to scan root
    start_line: number,  // optional, default 1
    end_line: number,    // optional, default EOF
  }
}
```

Returns: `{ content: string, language: string, totalLines: number, truncated: boolean }`

Content is **line-numbered** (`"  1 | import express from 'express'"`).

### `grep_pattern`

```typescript
{
  name: "grep_pattern",
  parameters: {
    pattern: string,      // regex
    path: string,         // relative to scan root, or "." for all
    file_pattern: string, // glob, default "**/*"
    case_sensitive: boolean, // default false
    context_lines: number,   // lines before/after match, default 2
  }
}
```

Returns: `{ matches: Match[], truncated: boolean, totalMatches: number }`
where `Match = { file, line, column, content, context: { before: string[], after: string[] } }`

### `write_report`

```typescript
{
  name: "write_report",
  parameters: {
    findings: Finding[],
    summary: string,
    scannedFiles: string[],
    scanDurationMs: number,
  }
}
```

`Finding` shape:

```typescript
interface Finding {
  id: string;           // "FINDING-001"
  owaspCategory: OwaspCategory;   // "A01:2021-Broken-Access-Control" etc.
  severity: "critical" | "high" | "medium" | "low" | "info";
  title: string;
  description: string;
  file: string;
  line: number;
  codeSnippet: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
}
```

**Calling `write_report` is the stop signal.** The agent MUST call it exactly once, as the final action.

## Stop Condition

The agent loop stops when `write_report` is called. This is enforced mechanically:

```typescript
afterToolCall: async (ctx) => {
  if (ctx.toolCall.name === "write_report") {
    setTimeout(() => agent.abort(), 500);
  }
},
```

The 500ms delay lets the LLM finish streaming its response before the abort fires.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Clean scan — no findings at or above severity threshold |
| 1 | Findings found at or above severity threshold |
| 2 | Invalid input (bad path, no source files found) |
| 3 | API error (authentication failure, rate limit, non-retryable) |
| 4 | Max turns exceeded without `write_report` |
| 130 | User abort (SIGINT / Ctrl+C) |

## Hard Constraints

::: warning These constraints are non-negotiable
1. **Read-only**: No tool writes, modifies, or deletes files in the scan root
2. **Path-safe**: All paths are resolved against `scanRoot` and blocked if they escape it
3. **Bounded**: `maxFiles` and `maxTurns` caps apply regardless of what the LLM asks for
4. **Single report**: `write_report` fires at most once per scan
:::

## Report Output Format

```json
{
  "version": "1.0",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "scanRoot": "/path/to/project",
  "model": "claude-sonnet-4-5",
  "scannedFiles": ["src/auth.ts", "src/db.ts"],
  "scanDurationMs": 45320,
  "summary": "Found 3 high-severity vulnerabilities...",
  "findings": [
    {
      "id": "FINDING-001",
      "owaspCategory": "A03:2021-Injection",
      "severity": "critical",
      "title": "SQL injection in user query",
      "description": "User input is concatenated directly into SQL query without sanitization.",
      "file": "src/db.ts",
      "line": 47,
      "codeSnippet": "const query = `SELECT * FROM users WHERE id = '${req.params.id}'`;",
      "recommendation": "Use parameterized queries: db.query('SELECT * FROM users WHERE id = $1', [req.params.id])",
      "confidence": "high"
    }
  ]
}
```

**Next:** [06 · Prompt & Tool Design →](/guide/06-prompt-and-tool-design)

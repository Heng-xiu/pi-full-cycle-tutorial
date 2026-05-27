---
title: "01 · Environment Setup"
description: "Install Node.js 22, Bun, clone pi, and verify your API key"
---

# 01 · Environment Setup

::: info Learning Goals
Install all prerequisites, clone the pi monorepo, verify API access, and confirm everything works before writing a single line of agent code.
:::

## Required Versions

| Tool | Minimum | Why |
|------|---------|-----|
| Node.js | 22.19.0 | `"moduleResolution": "NodeNext"` requires it |
| Bun | 1.1.0 | Standalone binary compilation |
| TypeScript | 5.4+ | `satisfies` keyword, const type parameters |
| Git | any recent | Cloning the repo |

## 1 · Install Node.js 22

Use `nvm` to manage Node versions cleanly:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zshrc   # or ~/.bashrc

nvm install 22
nvm use 22
node --version    # should print v22.x.x
```

::: warning Node 18/20 will fail
`"moduleResolution": "NodeNext"` requires Node 22+. Earlier versions silently resolve imports incorrectly, leading to `ERR_MODULE_NOT_FOUND` at runtime even when TypeScript compiles successfully.
:::

## 2 · Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.zshrc
bun --version     # should print 1.1.x or later
```

Bun is used only for compiling standalone binaries in chapter 12. You do not use it for day-to-day development.

## 3 · Clone pi

```bash
git clone https://github.com/earendil-works/pi.git
cd pi
npm install       # install workspace dependencies
npm run build     # compile all packages
```

::: tip Build time
The first build takes 30–60 seconds. Subsequent incremental builds are fast.
:::

Verify the three core packages built correctly:

```bash
ls packages/pi-agent-core/dist/   # should show index.js, index.d.ts
ls packages/pi-ai/dist/
ls packages/pi-tui/dist/
```

## 4 · Set Your API Key

```bash
# Option A — export in current shell (temporary)
export ANTHROPIC_API_KEY="sk-ant-..."

# Option B — add to shell profile (permanent)
echo 'export ANTHROPIC_API_KEY="sk-ant-..."' >> ~/.zshrc
source ~/.zshrc

# Option C — .env file (per-project)
echo 'ANTHROPIC_API_KEY=sk-ant-...' > .env
# Then run: node --env-file=.env dist/cli.js
```

::: danger Keep your key private
Never commit `.env` or any file containing `ANTHROPIC_API_KEY` to git. Add `.env` to `.gitignore` before creating the file.
:::

## 5 · Smoke-test the Agent

Create a minimal test script to verify the full stack works:

```typescript
// smoke-test.ts
import { Agent } from "@earendil-works/pi-agent-core";
import { registerBuiltins } from "@earendil-works/pi-ai/providers";

registerBuiltins();

const agent = new Agent({
  initialState: {
    model: "claude-haiku-4-5",
    systemPrompt: "You are a helpful assistant. Answer in one sentence.",
    tools: [],
  },
  getApiKey: () => process.env.ANTHROPIC_API_KEY!,
});

agent.subscribe(async (event) => {
  if (event.type === "assistant_delta") process.stdout.write(event.text);
  if (event.type === "run_end") console.log("\n\n✅ Agent loop complete");
});

await agent.prompt("Say hello.");
```

```bash
npx tsx smoke-test.ts
```

Expected output:
```
Hello! I'm Claude, happy to help you today.

✅ Agent loop complete
```

If you see this, your environment is fully configured. Proceed to chapter 02.

## Troubleshooting

| Error | Fix |
|-------|-----|
| `nvm: command not found` | Restart terminal or re-run the install script |
| `ERR_MODULE_NOT_FOUND` | Check Node version is 22+; ensure `npm run build` completed |
| `Missing API key for provider "anthropic"` | `echo $ANTHROPIC_API_KEY` — if empty, re-export |
| `Cannot find package '@earendil-works/pi-agent-core'` | Run `npm install` from the pi repo root |

**Next:** [02 · Repository Walkthrough →](/guide/02-repository-walkthrough)

---
title: "11 · npm Package"
description: "Configure package.json for ESM-only distribution, TypeScript declarations, and conditional exports"
---

# 11 · npm Package

::: info Learning Goals
Configure `package.json` for a dual-mode npm package (library + CLI), set up conditional exports, generate TypeScript declarations, and verify the package tarball before publishing.
:::

## package.json

```json
{
  "name": "@your-org/sec-review",
  "version": "1.0.0",
  "description": "Autonomous OWASP security code reviewer powered by Claude",
  "license": "MIT",
  "author": "Your Name",
  "keywords": ["security", "owasp", "ai", "claude", "code-review"],

  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",

  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./cli": {
      "import": "./dist/cli.js"
    }
  },

  "bin": {
    "sec-review": "./dist/cli.js"
  },

  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ],

  "scripts": {
    "build":          "tsc",
    "build:watch":    "tsc --watch",
    "lint":           "tsc --noEmit",
    "test":           "vitest run src/tests/tools src/tests/snapshots",
    "test:coverage":  "vitest run --coverage",
    "prepublishOnly": "npm run lint && npm run build && npm test"
  },

  "dependencies": {
    "@earendil-works/pi-agent-core": "^0.4.0",
    "@earendil-works/pi-ai":         "^0.4.0",
    "@earendil-works/pi-tui":        "^0.4.0",
    "@sinclair/typebox":             "^0.32.0",
    "chalk":  "^5.3.0",
    "glob":   "^11.0.0",
    "zod":    "^3.23.0"
  },

  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest":     "^1.6.0",
    "@vitest/coverage-v8": "^1.6.0"
  },

  "engines": {
    "node": ">=22.0.0"
  }
}
```

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": false,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/tests/**", "dist/**", "electron/**"]
}
```

## Public API (src/index.ts)

Only export what consumers need. Avoid leaking internal types:

```typescript
// src/index.ts
export type { SecReviewConfig } from "./config/config.js";
export type { Finding, OwaspCategory, ScanSession } from "./agent/types.js";
export { SecReviewApp } from "./agent/sec-review-app.js";
export { buildSystemPrompt } from "./agent/system-prompt.js";
export { loadConfig, saveConfig } from "./config/config.js";
```

## Shebang Line

The CLI entry point must have the shebang as the very first line:

```typescript
#!/usr/bin/env node
// src/cli.ts
import { parseArgs } from "./cli/parse-args.js";
// ...
```

TypeScript strips this correctly when compiling to `dist/cli.js`. Verify:

```bash
head -1 dist/cli.js   # must print: #!/usr/bin/env node
```

If it doesn't, add `"removeComments": false` to tsconfig and rebuild.

## Verifying the Package

```bash
# Inspect what will be included in the tarball
npm pack --dry-run

# Should output something like:
# npm notice === Tarball Contents ===
# npm notice 1.2kB  package.json
# npm notice 12.4kB dist/index.js
# npm notice 8.2kB  dist/cli.js
# npm notice ...
# npm notice === Tarball Details ===
# npm notice name: @your-org/sec-review
# npm notice version: 1.0.0
# npm notice total files: 24
```

::: warning Check the file list
If you see `src/` files or `.ts` files in the tarball, your `files` field is wrong. Only `dist/` should appear.
:::

## Testing the Installed Package

```bash
# Pack to a local tarball
npm pack

# Install it in a fresh directory
mkdir /tmp/test-install && cd /tmp/test-install
npm init -y
npm install /path/to/sec-review-1.0.0.tgz

# Test the CLI
./node_modules/.bin/sec-review --version

# Test the library API
node -e "
  import('@your-org/sec-review').then(m => {
    console.log(Object.keys(m));
  });
"
```

## Publishing

```bash
# Bump version (also creates a git tag)
npm version patch    # 1.0.0 → 1.0.1
npm version minor    # 1.0.0 → 1.1.0
npm version major    # 1.0.0 → 2.0.0

# Publish (runs prepublishOnly automatically)
npm publish --access public

# For scoped packages (@your-org/sec-review)
npm publish --access public
```

::: tip First-time publish
Run `npm login` before your first publish. For organization-scoped packages, make sure the org exists on npmjs.com first.
:::

**Next:** [12 · CLI Packaging →](/guide/12-cli-packaging)

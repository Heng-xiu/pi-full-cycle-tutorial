---
title: "12 · CLI Packaging"
description: "Compile sec-review to standalone Bun binaries for macOS, Linux, and Windows"
---

# 12 · CLI Packaging

::: info Learning Goals
Use Bun's `--compile` flag to produce standalone binaries that need no Node.js installed. Set up a Makefile for cross-platform builds. Integrate binary releases into GitHub Actions.
:::

## Why Bun Binaries

| Method | Requires Node | Single file | Startup |
|--------|--------------|-------------|---------|
| `dist/cli.js` via npm | Yes | No | ~200ms |
| `pkg` (Node.js) | No | Yes | ~400ms |
| Bun binary | No | Yes | ~50ms |

Bun compiles your TypeScript + all dependencies into a single self-contained executable. No Node.js, no npm, no `node_modules` needed on the target machine.

## tsconfig.bun.json

Bun needs a separate tsconfig because it resolves imports differently from NodeNext:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "bundler"  // [!code highlight]
  }
}
```

## Makefile

```makefile
# Makefile
BIN_DIR := bin
SRC     := src/cli.ts

.PHONY: binary binary-all clean

binary: $(BIN_DIR)/sec-review-$(shell uname -s | tr '[:upper:]' '[:lower:]')-$(shell uname -m)

$(BIN_DIR)/sec-review-darwin-arm64:
	@mkdir -p $(BIN_DIR)
	bun build $(SRC) --compile --target=bun-darwin-arm64 --outfile=$(BIN_DIR)/sec-review-darwin-arm64

$(BIN_DIR)/sec-review-darwin-x64:
	@mkdir -p $(BIN_DIR)
	bun build $(SRC) --compile --target=bun-darwin-x64 --outfile=$(BIN_DIR)/sec-review-darwin-x64

$(BIN_DIR)/sec-review-linux-x64:
	@mkdir -p $(BIN_DIR)
	bun build $(SRC) --compile --target=bun-linux-x64 --outfile=$(BIN_DIR)/sec-review-linux-x64

$(BIN_DIR)/sec-review-windows-x64.exe:
	@mkdir -p $(BIN_DIR)
	bun build $(SRC) --compile --target=bun-windows-x64 --outfile=$(BIN_DIR)/sec-review-windows-x64.exe

binary-all: \
	$(BIN_DIR)/sec-review-darwin-arm64 \
	$(BIN_DIR)/sec-review-darwin-x64 \
	$(BIN_DIR)/sec-review-linux-x64 \
	$(BIN_DIR)/sec-review-windows-x64.exe

clean:
	rm -rf $(BIN_DIR) dist
```

Build commands:

```bash
make binary           # current platform only
make binary-all       # all four platforms
```

## Testing the Binary

```bash
# Build for current platform
make binary

# Find the binary name
ls bin/

# Test it works
./bin/sec-review-darwin-arm64 --version
./bin/sec-review-darwin-arm64 ./test-target --no-tui

# Verify no Node.js dependency
ldd ./bin/sec-review-linux-x64  # should show no node libraries
```

## GitHub Actions Release Pipeline

```yaml
# .github/workflows/release.yml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: bun-darwin-arm64
            binary: sec-review-darwin-arm64
          - os: macos-13
            target: bun-darwin-x64
            binary: sec-review-darwin-x64
          - os: ubuntu-latest
            target: bun-linux-x64
            binary: sec-review-linux-x64
          - os: windows-latest
            target: bun-windows-x64
            binary: sec-review-windows-x64.exe

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      - name: Install dependencies
        run: bun install

      - name: Build binary
        run: |
          mkdir -p bin
          bun build src/cli.ts --compile --target=${{ matrix.target }} --outfile=bin/${{ matrix.binary }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.binary }}
          path: bin/${{ matrix.binary }}

  release:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      contents: write

    steps:
      - uses: actions/download-artifact@v4
        with:
          path: bin/
          merge-multiple: true

      - name: Create GitHub release
        uses: softprops/action-gh-release@v2
        with:
          files: bin/*
          generate_release_notes: true
```

## Version Flag

Your CLI should support `--version` before any other argument parsing:

```typescript
// src/cli/parse-args.ts
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

export function parseArgs(argv: string[]) {
  if (argv.includes("--version") || argv.includes("-v")) {
    console.log(`sec-review ${version}`);
    process.exit(0);
  }
  // ... rest of arg parsing
}
```

## Binary Size

| Platform | Typical size |
|----------|-------------|
| darwin-arm64 | 55–70 MB |
| darwin-x64 | 55–70 MB |
| linux-x64 | 50–65 MB |
| windows-x64 | 55–70 MB |

The binary includes the Bun runtime + all dependencies. This is expected — no further optimization is needed for a CLI tool.

**Next:** [13 · macOS DMG →](/guide/13-macos-dmg)

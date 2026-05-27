---
layout: home

hero:
  name: "pi-agent Full Cycle"
  text: "Build a vertical-domain agent from scratch"
  tagline: Local CLI · Custom TUI · npm package · macOS DMG
  actions:
    - theme: brand
      text: Start Tutorial
      link: /guide/01-environment-setup
    - theme: alt
      text: Quick Reference
      link: /reference/quick-reference

features:
  - icon: 🔍
    title: Real Agent, Real Problem
    details: Build sec-review — an autonomous OWASP security scanner powered by Claude. Not a toy demo; a production-ready tool you can actually ship.
  - icon: 🧱
    title: Full Stack of Primitives
    details: Master pi-agent-core's Agent, AgentTool, AgentEvent, and three hook points. These patterns transfer to any vertical-domain agent you build next.
  - icon: 🖥️
    title: Custom TUI with pi-tui
    details: Build a live terminal UI showing progress, findings, and log stream — differential rendering, no curses library needed.
  - icon: 📦
    title: Ship It
    details: Package as an npm library, compile to a standalone Bun binary, and wrap in a signed+notarized macOS .dmg with Electron and xterm.js.
---

## What You Will Build

By the end of this tutorial you will have a working `sec-review` command-line tool that:

- **Autonomously scans** a codebase for OWASP Top 10 vulnerabilities using a ReAct agent loop
- **Shows live progress** in a custom terminal UI built with pi-tui
- **Writes a JSON report** categorized by OWASP ID, severity, and file location
- **Ships as three artifacts**: an npm package, a standalone binary (macOS/Linux/Windows), and a macOS `.dmg`

## Chapter Map

| # | Chapter | What You Learn |
|---|---------|---------------|
| 01 | Environment Setup | Node 22, Bun, API key, pi repo |
| 02 | Repository Walkthrough | Monorepo layout, package roles |
| 03 | Architecture Analysis | ReAct loop, AgentTool, AgentEvent, hooks |
| 04 | Domain Selection | Scoring framework, why security review |
| 05 | Agent Specification | Tool list, OWASP scope, stop condition |
| 06 | Prompt & Tool Design | System prompt phases, parameter naming |
| 07 | Runtime Implementation | SecReviewApp, hooks, stop signal |
| 08 | TUI Implementation | pi-tui components, event binding |
| 09 | Logging, Config & Errors | Zod config, logger, discriminated errors |
| 10 | Testing Strategy | Unit → integration → snapshot → e2e |
| 11 | npm Package | ESM exports, TypeScript declarations |
| 12 | CLI Packaging | Bun standalone binary, cross-platform |
| 13 | macOS DMG | Electron + xterm.js, notarization |
| 14 | Final Project Structure | Directory tree, data flow, build checklist |
| 15 | Failure Modes & Debugging | 12 failure modes with concrete fixes |

## Prerequisites

- macOS 13+ or Linux (Windows via WSL2)
- Node.js 22.19 or later
- Bun 1.1 or later
- An Anthropic API key (`ANTHROPIC_API_KEY`)
- Comfortable with TypeScript and the command line

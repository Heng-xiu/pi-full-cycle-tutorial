import { defineConfig } from "vitepress";

export default defineConfig({
  base: "/pi-full-cycle-tutorial/",
  title: "pi-agent Full Cycle",
  description:
    "Build a vertical-domain agent from scratch — local CLI, custom TUI, npm package, macOS DMG",
  lang: "en-US",

  head: [
    ["link", { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  ],

  themeConfig: {
    logo: "/logo.svg",
    siteTitle: "pi-agent Full Cycle",

    nav: [
      { text: "Tutorial", link: "/guide/01-environment-setup" },
      { text: "Quick Reference", link: "/reference/quick-reference" },
      {
        text: "pi on GitHub",
        link: "https://github.com/earendil-works/pi",
        target: "_blank",
      },
    ],

    sidebar: [
      {
        text: "Introduction",
        items: [
          { text: "What You Will Build", link: "/" },
          { text: "Quick Reference", link: "/reference/quick-reference" },
        ],
      },
      {
        text: "Getting Started",
        collapsed: false,
        items: [
          { text: "01 · Environment Setup", link: "/guide/01-environment-setup" },
        ],
      },
      {
        text: "Understanding pi",
        collapsed: false,
        items: [
          { text: "02 · Repository Walkthrough", link: "/guide/02-repository-walkthrough" },
          { text: "03 · Architecture Analysis",  link: "/guide/03-architecture-analysis" },
        ],
      },
      {
        text: "Building sec-review",
        collapsed: false,
        items: [
          { text: "04 · Domain Selection",        link: "/guide/04-domain-selection" },
          { text: "05 · Agent Specification",     link: "/guide/05-agent-specification" },
          { text: "06 · Prompt & Tool Design",    link: "/guide/06-prompt-and-tool-design" },
          { text: "07 · Runtime Implementation",  link: "/guide/07-runtime-implementation" },
          { text: "08 · TUI Implementation",      link: "/guide/08-tui-implementation" },
          { text: "09 · Logging, Config & Errors",link: "/guide/09-logging-config-errors" },
        ],
      },
      {
        text: "Testing & Quality",
        collapsed: false,
        items: [
          { text: "10 · Testing Strategy", link: "/guide/10-testing-strategy" },
        ],
      },
      {
        text: "Distribution",
        collapsed: false,
        items: [
          { text: "11 · npm Package",   link: "/guide/11-npm-package" },
          { text: "12 · CLI Packaging", link: "/guide/12-cli-packaging" },
          { text: "13 · macOS DMG",     link: "/guide/13-macos-dmg" },
        ],
      },
      {
        text: "Reference",
        collapsed: false,
        items: [
          { text: "14 · Final Project Structure",     link: "/guide/14-final-project-structure" },
          { text: "15 · Failure Modes & Debugging", link: "/guide/15-failure-modes-debugging" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/earendil-works/pi" },
    ],

    footer: {
      message: "Built with VitePress · Based on pi-agent by earendil-works",
    },

    search: { provider: "local" },

    outline: {
      level: [2, 3],
      label: "On this page",
    },
  },

  markdown: {
    lineNumbers: true,
    theme: {
      light: "github-light",
      dark: "one-dark-pro",
    },
  },
});

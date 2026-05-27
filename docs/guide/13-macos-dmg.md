---
title: "13 · macOS DMG"
description: "Wrap the Bun binary in Electron + xterm.js, sign, notarize, and package as a .dmg"
---

# 13 · macOS DMG

::: info Learning Goals
Build a macOS desktop app that wraps the sec-review CLI in an Electron shell with an xterm.js terminal emulator. Sign and notarize it for distribution outside the Mac App Store.
:::

## Architecture

```
sec-review.app/
├── Electron main process (Node.js)
│   └── spawns: sec-review-darwin-arm64 (Bun binary)
│                    ↕ pty (pseudoterminal)
└── Renderer process (Chromium)
    └── xterm.js ← renders terminal output
```

The Bun binary runs as a subprocess connected to a pseudoterminal. xterm.js renders the output including ANSI escape codes from the TUI. This means the macOS app gets the full TUI experience with zero extra code.

## Electron Project Structure

```
electron/
├── package.json
├── src/
│   ├── main.js       ← Electron main process
│   └── preload.js    ← contextBridge for IPC
├── renderer/
│   └── index.html    ← xterm.js UI
├── resources/
│   ├── icon.icns     ← macOS app icon
│   └── entitlements.mac.plist
└── scripts/
    └── notarize.js   ← notarization hook
```

## electron/package.json

```json
{
  "name": "sec-review",
  "version": "1.0.0",
  "description": "Autonomous OWASP security code reviewer",
  "main": "src/main.js",
  "scripts": {
    "start":     "electron .",
    "build:mac": "electron-builder --mac --arm64 --x64"
  },
  "devDependencies": {
    "electron":           "^31.0.0",
    "electron-builder":   "^24.13.0",
    "@electron/notarize": "^2.4.0",
    "node-pty":           "^1.0.0"
  },
  "dependencies": {
    "xterm": "^5.3.0",
    "xterm-addon-fit": "^0.8.0"
  },
  "build": {
    "appId": "com.yourorg.sec-review",
    "productName": "sec-review",
    "mac": {
      "category": "public.app-category.developer-tools",
      "icon": "resources/icon.icns",
      "entitlements": "resources/entitlements.mac.plist",
      "entitlementsInherit": "resources/entitlements.mac.plist",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "notarize": false
    },
    "afterSign": "scripts/notarize.js",
    "extraResources": [
      {
        "from": "../bin/sec-review-darwin-${arch}",
        "to": "bin/sec-review",
        "filter": ["**/*"]
      }
    ],
    "dmg": {
      "contents": [
        { "x": 130, "y": 220 },
        { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
      ]
    }
  }
}
```

## Main Process (src/main.js)

```javascript
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const pty = require("node-pty");
const path = require("node:path");

let mainWindow;

app.whenReady().then(() => {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
});

ipcMain.handle("select-folder", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.filePaths[0] ?? null;
});

ipcMain.on("start-scan", (event, folderPath) => {
  const binaryPath = path.join(
    process.resourcesPath,
    "bin",
    "sec-review",
  );

  const ptyProcess = pty.spawn(binaryPath, [folderPath], {
    name: "xterm-color",
    cols: 100,
    rows: 30,
    env: { ...process.env },
  });

  ptyProcess.onData((data) => {
    event.sender.send("terminal-data", data);
  });

  ptyProcess.onExit(({ exitCode }) => {
    event.sender.send("scan-complete", exitCode);
  });

  ipcMain.once("abort-scan", () => {
    ptyProcess.kill();
  });
});
```

## Renderer (renderer/index.html)

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>sec-review</title>
  <link rel="stylesheet" href="../node_modules/xterm/css/xterm.css">
  <style>
    body { margin: 0; background: #1e1e2e; display: flex; flex-direction: column; height: 100vh; }
    #toolbar { padding: 12px; display: flex; gap: 8px; align-items: center; }
    #path-display { color: #cdd6f4; font-family: monospace; flex: 1; }
    button { padding: 6px 14px; border-radius: 6px; border: none; cursor: pointer; }
    #scan-btn { background: #89b4fa; color: #1e1e2e; font-weight: bold; }
    #terminal { flex: 1; }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="folder-btn">Choose Folder</button>
    <span id="path-display">No folder selected</span>
    <button id="scan-btn" disabled>Scan</button>
  </div>
  <div id="terminal"></div>

  <script src="../node_modules/xterm/lib/xterm.js"></script>
  <script src="../node_modules/xterm-addon-fit/lib/xterm-addon-fit.js"></script>
  <script>
    const term = new Terminal({ theme: { background: '#1e1e2e', foreground: '#cdd6f4' } });
    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById("terminal"));
    fitAddon.fit();

    let selectedPath = null;

    document.getElementById("folder-btn").addEventListener("click", async () => {
      selectedPath = await window.electronAPI.selectFolder();
      if (selectedPath) {
        document.getElementById("path-display").textContent = selectedPath;
        document.getElementById("scan-btn").disabled = false;
      }
    });

    document.getElementById("scan-btn").addEventListener("click", () => {
      term.clear();
      window.electronAPI.startScan(selectedPath);
    });

    window.electronAPI.onTerminalData((data) => term.write(data));
    window.electronAPI.onScanComplete((exitCode) => {
      term.write(`\r\n\x1b[32m[sec-review exited with code ${exitCode}]\x1b[0m\r\n`);
    });

    window.addEventListener("resize", () => fitAddon.fit());
  </script>
</body>
</html>
```

## Signing & Notarization

::: warning Requires an Apple Developer account
Code signing and notarization require a paid Apple Developer account ($99/year). Without notarization, macOS Gatekeeper will block the app on other machines.
:::

```javascript
// electron/scripts/notarize.js
const { notarize } = require("@electron/notarize");

exports.default = async function(context) {
  if (process.platform !== "darwin") return;

  const appPath = context.artifactPaths.find(p => p.endsWith(".app"));
  if (!appPath) return;

  await notarize({
    appPath,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
```

```bash
# Set in CI environment or .env:
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"

# Build the DMG
cd electron
npm install
npm run build:mac
```

Output: `electron/dist-electron/sec-review-1.0.0-arm64.dmg`

## Verifying the DMG

```bash
# Verify code signature
codesign -dv --verbose=4 dist-electron/mac-arm64/sec-review.app

# Check Gatekeeper assessment
spctl -a -vvv -t install dist-electron/mac-arm64/sec-review.app
# Expected output: "accepted" (source: Notarized Developer ID)
```

**Next:** [14 · Final Project Structure →](/guide/14-final-project-structure)

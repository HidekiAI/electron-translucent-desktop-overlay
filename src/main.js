'use strict';

/**
 * main.js — Electron main process
 *
 * Creates a transparent, frameless, always-on-top BrowserWindow that acts as a
 * HUD / closed-caption overlay.  A UDP server listens for incoming text messages
 * (or JSON control commands) and forwards them to the renderer via IPC.
 *
 * UDP message protocol (all messages are UTF-8 strings):
 *   Plain text          → displayed as a new caption line
 *   JSON { type: "message",  text: "..." }    → same as plain text
 *   JSON { type: "config",   settings: {...} } → update overlay config at runtime
 *   JSON { type: "clear" }                     → clear all displayed lines
 *   JSON { type: "quit"  }                     → quit the application
 *
 * Config fields (config.json or runtime JSON update):
 *   udpPort          number   UDP port to listen on          (default: 5005)
 *   position         string   "bottom-center" | "top-center" | "custom"
 *   x, y             number   Window position when position="custom"
 *   opacity          number   Window opacity 0.0–1.0         (default: 0.85)
 *   fontSize         number   Caption font size in px        (default: 24)
 *   maxLines         number   Max caption lines shown        (default: 5)
 *   textColor        string   CSS colour for text            (default: "#FFFFFF")
 *   backgroundColor  string   CSS colour for background      (default: "#00000066")
 *   width            number   Window width in px             (default: 800)
 *   height           number   Window height in px            (default: 200)
 *   displayDuration  number   ms to show each line (0 = forever)
 */

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const dgram = require('dgram');
const path = require('path');
const fs = require('fs');

// ─── Configuration ───────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  udpPort: 5005,
  position: 'bottom-center',
  x: null,
  y: null,
  opacity: 0.85,
  fontSize: 24,
  maxLines: 5,
  textColor: '#FFFFFF',
  backgroundColor: '#00000066',
  width: 800,
  height: 200,
  displayDuration: 0,
};

function loadConfig() {
  const configPath = path.join(__dirname, 'config.json');
  let cfg = Object.assign({}, DEFAULT_CONFIG);
  if (fs.existsSync(configPath)) {
    try {
      const loaded = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      cfg = Object.assign(cfg, loaded);
    } catch (err) {
      console.error('[main] Failed to parse config.json:', err.message);
    }
  }
  return cfg;
}

let config = loadConfig();

// ─── Window management ───────────────────────────────────────────────────────

/** @type {BrowserWindow|null} */
let win = null;

function computeWindowPosition() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  const w = config.width;
  const h = config.height;

  const noCoords = config.x == null && config.y == null;

  if (config.position === 'top-center') {
    return {
      x: Math.round((sw - w) / 2),
      y: 40,
    };
  }

  if (config.position === 'bottom-center' || noCoords) {
    return {
      x: Math.round((sw - w) / 2),
      y: sh - h - 40,
    };
  }

  // 'custom' or explicit x/y
  return {
    x: typeof config.x === 'number' ? config.x : 0,
    y: typeof config.y === 'number' ? config.y : 0,
  };
}

function createWindow() {
  const { x, y } = computeWindowPosition();

  win = new BrowserWindow({
    x,
    y,
    width: config.width,
    height: config.height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: false,
    type: 'desktop',        // keeps it below regular windows on some WMs
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Apply initial opacity from config.
  win.setOpacity(Math.min(1, Math.max(0, config.opacity)));

  // Make the window click-through so it does not interfere with other apps.
  win.setIgnoreMouseEvents(true);

  win.loadFile(path.join(__dirname, 'index.html'));

  win.webContents.on('did-finish-load', () => {
    sendConfig();
  });

  win.on('closed', () => {
    win = null;
  });
}

/** Push the current config object to the renderer. */
function sendConfig() {
  if (win && !win.isDestroyed()) {
    win.webContents.send('hud:config', config);
  }
}

/** Apply a partial config update, resize/reposition the window when needed. */
function applyConfigUpdate(partial) {
  const prev = Object.assign({}, config);
  config = Object.assign(config, partial);

  const needsResize =
    config.width !== prev.width || config.height !== prev.height;
  const needsMove =
    config.position !== prev.position ||
    config.x !== prev.x ||
    config.y !== prev.y;

  if (win && !win.isDestroyed()) {
    if (config.opacity !== prev.opacity) {
      win.setOpacity(Math.min(1, Math.max(0, config.opacity)));
    }
    if (needsResize) {
      win.setSize(config.width, config.height);
    }
    if (needsMove || needsResize) {
      const { x, y } = computeWindowPosition();
      win.setPosition(x, y);
    }
    sendConfig();
  }
}

// ─── UDP server ───────────────────────────────────────────────────────────────

/** @type {import('dgram').Socket|null} */
let udpServer = null;

function startUDPServer() {
  udpServer = dgram.createSocket('udp4');

  udpServer.on('message', (msgBuf) => {
    const raw = msgBuf.toString('utf8').trim();
    if (!raw) return;

    // Try to parse as a JSON control command first.
    if (raw.startsWith('{')) {
      try {
        const cmd = JSON.parse(raw);
        handleCommand(cmd);
        return;
      } catch {
        // Not valid JSON — fall through and treat as plain text.
      }
    }

    // Plain-text message → display as caption line.
    sendMessage(raw);
  });

  udpServer.on('error', (err) => {
    console.error('[udp] Error:', err.message);
    udpServer.close();
  });

  udpServer.bind(config.udpPort, '0.0.0.0', () => {
    const addr = udpServer.address();
    console.log(`[udp] Listening on ${addr.address}:${addr.port}`);
  });
}

/** Dispatch a parsed JSON command. */
function handleCommand(cmd) {
  switch (cmd.type) {
    case 'message':
      if (typeof cmd.text === 'string') sendMessage(cmd.text);
      break;

    case 'config':
      if (cmd.settings && typeof cmd.settings === 'object') {
        applyConfigUpdate(cmd.settings);
      }
      break;

    case 'clear':
      if (win && !win.isDestroyed()) {
        win.webContents.send('hud:clear');
      }
      break;

    case 'quit':
      app.quit();
      break;

    default:
      console.warn('[udp] Unknown command type:', cmd.type);
  }
}

/** Forward a plain-text caption message to the renderer. */
function sendMessage(text) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('hud:message', text);
  }
}

// ─── IPC handlers (renderer → main) ──────────────────────────────────────────

// The renderer can request a config dump (e.g. on first load).
ipcMain.handle('hud:getConfig', () => config);

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  startUDPServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (udpServer) {
    udpServer.close();
    udpServer = null;
  }
  // On macOS it's conventional to keep the app running until Cmd+Q.
  if (process.platform !== 'darwin') app.quit();
});

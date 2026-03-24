# electron-translucent-desktop-overlay

Replacement of https://github.com/HidekiAI/tauri-translucent-desktop-overlay which uses WebKit2GTK which is buggy on Linux for Translucency

## electron-desktop-hud

A transparent, always-on-top HUD overlay for Linux desktops. Displays subtitle-like text sent over UDP — useful for live narration, screen readers, speech-to-text output, or any tool that needs to push text onto the screen without touching the focused application.

Built with **Electron / Chromium** because WebKit2GTK (Tauri) has an unfixed bug where alpha pixels are not cleared between repaints, leaving ghost text on the X11 surface.

![simplescreenrecorder-2026-03-23_18 57 28](https://github.com/user-attachments/assets/b65d6be5-2592-48b9-858d-998f8c873cd8)


---

## Prerequisites

| Requirement       | Notes                                                                          |
| ----------------- | ------------------------------------------------------------------------------ |
| **Compositor**    | picom (or any ARGB compositor). Without one, transparency falls back to black. |
| **nvm**           | Node version manager — installed by `setup.sh` if missing.                     |
| **Node 22**       | Pinned via `.nvmrc`.                                                           |
| **pnpm**          | Installed by `setup.sh` via `npm install -g pnpm` if missing.                  |
| **netcat** (`nc`) | For `demo.sh` — installed automatically if missing.                            |
| **jq**            | For `demo.sh` to read the UDP port from `hud_config.json`.                     |

### Compositor quick-start (XFCE example)

```bash
# Disable the built-in compositor so picom can own the display
xfconf-query -c xfwm4 -p /general/use_compositing -s false
# Start picom with GLX backend (required for ARGB windows)
picom --backend glx --no-use-damage &
```

---

## Setup

```bash
bash setup.sh
```

`setup.sh` installs nvm + Node 22 + pnpm (if not present), runs `pnpm install`, and downloads the Electron and esbuild binaries.

---

## Running

```bash
nvm use    # activate Node 22 from .nvmrc
pnpm start # build TypeScript then launch the HUD
```

Once running the window appears at the bottom-center of the primary display.

### Demo

```bash
nvm use
bash demo.sh
```

Sends a scripted sequence of UDP messages and exits after the sequence completes.

---

## Sending text

Any tool that can send a UDP packet works:

```bash
# netcat
printf 'Hello world' | nc -u -w1 127.0.0.1 7331

# Python
python3 -c "import socket; socket.socket(socket.AF_INET, socket.SOCK_DGRAM).sendto(b'Hello world', ('127.0.0.1', 7331))"
```

Sending an empty string clears the display (removes the background pill).

---

## Controls

| Key         | Action                                                     |
| ----------- | ---------------------------------------------------------- |
| `ArrowUp`   | Move HUD to the next position up (bottom → center → top)   |
| `ArrowDown` | Move HUD to the next position down (top → center → bottom) |

Arrow keys work when the HUD window has keyboard focus (click on it first).

---

## Configuration

Edit `hud_config.json` in the project root. Changes take effect on the next launch.

| Field                | Default          | Description                                                       |
| -------------------- | ---------------- | ----------------------------------------------------------------- |
| `height`             | `200`            | Window height in pixels                                           |
| `background_opacity` | `0.72`           | Opacity of the text pill background (0 – 1)                       |
| `text_color`         | `"#f5e642"`      | CSS color for the subtitle text                                   |
| `font_size_pt`       | `24`             | Font size in points                                               |
| `min_font_size_pt`   | `0`              | Unused (reserved for future shrink-to-fit); set to `0` to disable |
| `bottom_margin`      | `50`             | Gap in pixels between the HUD and the top/bottom of the work area |
| `udp_port`           | `7331`           | UDP port to listen on (loopback only)                             |
| `default_text`       | `"Hello world…"` | Text shown on startup before the first UDP message                |

---

## Development

```bash
nvm use
pnpm run build      # compile TypeScript via esbuild → dist/
pnpm test           # run unit tests (vitest)
pnpm run test:watch # re-run tests on save
pnpm run typecheck  # type-check without emitting
pnpm run dev        # build + launch with --inspect (Chrome DevTools on port 9229)
```

### Project layout

```
src/
  main.ts              # Electron main process — window, UDP, IPC
  preload.ts           # contextBridge — exposes API to renderer
  config.ts            # pure: reads and merges hud_config.json
  window-position.ts   # pure: computes window x/y from display bounds
  renderer/
    app.ts             # renderer — updates DOM on IPC messages, arrow keys
    index.html
    styles.css
  __tests__/
    config.test.ts
    window-position.test.ts
build.mjs              # esbuild script — bundles all TS → dist/
vitest.config.ts
tsconfig.json
hud_config.json        # runtime configuration
```

### Architecture

```
 UDP client (nc, Python, …)
        │ UDP packet
        ▼
  [main process]  src/main.ts
    dgram socket
        │ webContents.send('hud-text-changed', text)
        ▼
  [preload]       src/preload.ts
    contextBridge.exposeInMainWorld('electronHUD', …)
        │ window.electronHUD.onTextChanged(cb)
        ▼
  [renderer]      src/renderer/app.ts
    renderText()  — updates #subtitle-text + pill background
```

### Why Electron instead of Tauri

Tauri uses WebKit2GTK as its renderer on Linux. WebKit2GTK has a long-standing bug where alpha pixels vacated by shrinking content are not cleared on the X11 surface — old text pixels remain visible ("ghost text") even after the DOM is updated. Workarounds (synthetic X11 Expose events, body-background dirty-rect forcing) reduce but do not eliminate the artefact.

Electron uses Chromium, which handles ARGB transparency on X11 correctly with a compositor running. No special repaint workarounds are needed.

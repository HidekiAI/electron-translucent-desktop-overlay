/**
 * Minimal transparent window smoke test.
 *
 * Run with:  pnpm exec electron scripts/test-transparent.js
 *
 * The window should be a solid red band with NO white strip above it.
 * Console output shows window sizing and what window type was applied.
 */
const { app, BrowserWindow } = require('electron');
const { execSync } = require('child_process');

app.commandLine.appendSwitch('enable-transparent-visuals');

app.whenReady().then(() => {
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const w = display.workAreaSize.width;

  const win = new BrowserWindow({
    width: w,
    height: 150,
    x: 0,
    y: display.workAreaSize.height - 150 - 50,
    transparent: true,
    frame: false,
    show: false,           // keep unmapped until we've set the window type
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });

  // Grab the native X11 window ID before the window is mapped.
  // We set _NET_WM_WINDOW_TYPE_DOCK here so xfwm4 sees it on first map
  // and skips creating a decoration frame around the window.
  const buf = win.getNativeWindowHandle();
  // Buffer holds a 64-bit int on 64-bit Linux; X11 ID fits in lower 32 bits.
  const winIdNum = buf.length >= 8
    ? Number(buf.readBigUInt64LE(0))
    : buf.readUInt32LE(0);
  const winId = '0x' + winIdNum.toString(16);
  console.log('native window id:', winId);

  try {
    execSync(
      `xprop -id ${winId} -f _NET_WM_WINDOW_TYPE 32a -set _NET_WM_WINDOW_TYPE _NET_WM_WINDOW_TYPE_NOTIFICATION`
    );
    execSync(
      `xprop -id ${winId} -f _NET_WM_BYPASS_COMPOSITOR 32c -set _NET_WM_BYPASS_COMPOSITOR 2`
    );
    console.log('window type: NOTIFICATION, bypass compositor: 2 (force composite)');
  } catch (e) {
    console.error('xprop failed:', e.message);
  }

  win.loadURL(`data:text/html,
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      html, body { width:100%; height:100%; background:transparent; overflow:hidden; }
      .fill { position:fixed; inset:0; background:rgba(40,40,40,0.5);
              display:flex; align-items:flex-start; }
      .label { color:white; font:bold 16px monospace; padding:4px 8px;
               background:rgba(0,0,0,0.5); }
    </style>
    <div class="fill">
      <span class="label">content top (y=0) — no white strip should appear above this</span>
    </div>
  `);

  win.once('ready-to-show', () => {
    const [ow, oh] = win.getSize();
    const [cw, ch] = win.getContentSize();
    console.log(`outer: ${ow}x${oh}  content: ${cw}x${ch}  reserved: ${oh - ch}px`);
    win.show();
  });

  setTimeout(() => app.quit(), 12_000);
});

app.on('window-all-closed', () => app.quit());

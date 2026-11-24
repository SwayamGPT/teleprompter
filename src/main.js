// Main process: creates the teleprompter window and keeps it out of screen captures.
const { app, BrowserWindow, globalShortcut, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let protectedFromCapture = true;   // what the user asked for
let actualAffinity = null;         // what Windows reports back
let clickThrough = false;

// ---------- Win32 capture exclusion ----------
// Electron's setContentProtection() uses WDA_EXCLUDEFROMCAPTURE too, but the
// setting can be silently lost (e.g. when it is applied before the window is
// first shown, or when the window becomes layered for opacity). So we also
// call user32 directly, re-apply on every show/restore/opacity change, and
// read the real value back so the UI never claims protection it doesn't have.
const WDA_NONE = 0x00;
const WDA_MONITOR = 0x01;              // pre-2004 fallback: shows as black box
const WDA_EXCLUDEFROMCAPTURE = 0x11;   // Win10 2004+: fully invisible

let user32 = null;
if (process.platform === 'win32') {
  try {
    const koffi = require('koffi');
    const lib = koffi.load('user32.dll');
    user32 = {
      setAffinity: lib.func('int __stdcall SetWindowDisplayAffinity(intptr_t hWnd, uint32_t dwAffinity)'),
      getAffinity: lib.func('int __stdcall GetWindowDisplayAffinity(intptr_t hWnd, _Out_ uint32_t *pdwAffinity)'),
    };
  } catch (err) {
    console.error('Could not load user32 via koffi, falling back to Electron only:', err);
  }
}

function hwndOf(w) {
  const buf = w.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

function readAffinity() {
  if (!user32 || !win) return null;
  const out = [0];
  return user32.getAffinity(hwndOf(win), out) ? out[0] : null;
}

function applyProtection() {
  if (!win || win.isDestroyed()) return;
  win.setContentProtection(protectedFromCapture);
  if (user32) {
    const hwnd = hwndOf(win);
    if (protectedFromCapture) {
      if (!user32.setAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)) {
        user32.setAffinity(hwnd, WDA_MONITOR); // older Windows
      }
    } else {
      user32.setAffinity(hwnd, WDA_NONE);
    }
  }
  actualAffinity = readAffinity();
  sendState();
}

// Re-check every couple of seconds in case anything resets the flag.
setInterval(() => {
  if (!win || win.isDestroyed() || !user32) return;
  const now = readAffinity();
  const wanted = protectedFromCapture ? [WDA_EXCLUDEFROMCAPTURE, WDA_MONITOR] : [WDA_NONE];
  if (!wanted.includes(now)) applyProtection();
  else if (now !== actualAffinity) { actualAffinity = now; sendState(); }
}, 2000);

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(900, Math.round(workArea.width * 0.6));
  const height = 300;

  win = new BrowserWindow({
    width,
    height,
    // Top-centre of the screen = right under a typical laptop webcam.
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y,
    minWidth: 360,
    minHeight: 140,
    frame: false,
    backgroundColor: '#101114',
    alwaysOnTop: true,
    show: false,
    title: 'Stealth Teleprompter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The core trick: exclude the window from capture (see applyProtection).
  applyProtection();

  // Stay above fullscreen apps and the taskbar.
  win.setAlwaysOnTop(true, 'screen-saver');

  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    applyProtection();
  });
  win.on('show', applyProtection);
  win.on('restore', applyProtection);
  win.on('closed', () => { win = null; });
}

function sendState() {
  if (!win) return;
  win.webContents.send('state', {
    protectedFromCapture,
    // null = can't verify (non-Windows, or user32 unavailable)
    actualAffinity,
    verifiable: !!user32,
    clickThrough,
    platform: process.platform,
    windowsBuild: process.platform === 'win32' ? Number(require('os').release().split('.')[2] || 0) : null,
  });
}

function setClickThrough(on) {
  clickThrough = on;
  if (!win) return;
  // forward:true keeps mouse-move events flowing so the UI can still react.
  win.setIgnoreMouseEvents(on, { forward: true });
  sendState();
}

function registerShortcuts() {
  // Global hotkeys work even while your recording app has focus.
  const map = {
    'CommandOrControl+Alt+Space': 'toggle-play',
    'CommandOrControl+Alt+Up': 'speed-up',
    'CommandOrControl+Alt+Down': 'speed-down',
    'CommandOrControl+Alt+Left': 'rewind',
    'CommandOrControl+Alt+Right': 'forward',
    'CommandOrControl+Alt+R': 'restart',
  };
  for (const [accel, action] of Object.entries(map)) {
    globalShortcut.register(accel, () => win && win.webContents.send('shortcut', action));
  }
  globalShortcut.register('CommandOrControl+Alt+T', () => setClickThrough(!clickThrough));
  globalShortcut.register('CommandOrControl+Alt+H', () => {
    if (!win) return;
    if (win.isVisible()) win.hide(); else { win.showInactive(); applyProtection(); }
  });
}

ipcMain.handle('open-script', async () => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Open script',
    properties: ['openFile'],
    filters: [
      { name: 'Text', extensions: ['txt', 'md', 'markdown'] },
      { name: 'All files', extensions: ['*'] },
    ],
  });
  if (res.canceled || !res.filePaths[0]) return null;
  return fs.readFileSync(res.filePaths[0], 'utf8');
});

ipcMain.on('set-opacity', (_e, value) => {
  if (!win) return;
  const v = Math.min(1, Math.max(0.2, Number(value) || 1));
  if (v === win.getOpacity()) return;
  win.setOpacity(v);
  // Opacity turns the window into a layered window; re-apply protection.
  applyProtection();
});

ipcMain.on('set-protection', (_e, on) => {
  protectedFromCapture = !!on;
  applyProtection();
});

ipcMain.on('set-click-through', (_e, on) => setClickThrough(!!on));
// Ctrl+Shift+Up/Down normally selects text in other apps, so we only claim
// these global hotkeys while the teleprompter is in prompting mode.
const SCROLL_KEYS = {
  'CommandOrControl+Shift+Up': 'scroll-up',
  'CommandOrControl+Shift+Down': 'scroll-down',
};
function setScrollKeys(on) {
  for (const [accel, action] of Object.entries(SCROLL_KEYS)) {
    if (on && !globalShortcut.isRegistered(accel)) {
      globalShortcut.register(accel, () => win && win.webContents.send('shortcut', action));
    } else if (!on && globalShortcut.isRegistered(accel)) {
      globalShortcut.unregister(accel);
    }
  }
}
ipcMain.on('mode', (_e, mode) => setScrollKeys(mode === 'prompt'));

ipcMain.on('minimize', () => win && win.minimize());
ipcMain.on('close', () => win && win.close());

// Only one instance, so hotkeys don't collide.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
  });
  app.whenReady().then(() => {
    createWindow();
    registerShortcuts();
  });
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}

// Main process: creates the teleprompter window and keeps it out of screen captures.
const { app, BrowserWindow, globalShortcut, ipcMain, screen, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let win = null;
let protectedFromCapture = true;
let clickThrough = false;

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

  // The core trick. On Windows 10 2004+ this calls
  // SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE): the window stays
  // visible to you, but OBS, Zoom, Teams, Meet, Loom, Snipping Tool, etc.
  // see straight through it. (Older Windows shows a black rectangle instead.)
  win.setContentProtection(protectedFromCapture);

  // Stay above fullscreen apps and the taskbar.
  win.setAlwaysOnTop(true, 'screen-saver');

  win.loadFile(path.join(__dirname, 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
    sendState();
  });
  win.on('closed', () => { win = null; });
}

function sendState() {
  if (!win) return;
  win.webContents.send('state', {
    protectedFromCapture,
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
    if (win.isVisible()) win.hide(); else win.showInactive();
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
  if (win) win.setOpacity(Math.min(1, Math.max(0.2, Number(value) || 1)));
});

ipcMain.on('set-protection', (_e, on) => {
  protectedFromCapture = !!on;
  if (win) win.setContentProtection(protectedFromCapture);
  sendState();
});

ipcMain.on('set-click-through', (_e, on) => setClickThrough(!!on));
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

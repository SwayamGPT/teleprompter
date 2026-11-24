const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('prompter', {
  openScript: () => ipcRenderer.invoke('open-script'),
  setOpacity: (v) => ipcRenderer.send('set-opacity', v),
  setProtection: (on) => ipcRenderer.send('set-protection', on),
  setClickThrough: (on) => ipcRenderer.send('set-click-through', on),
  setMode: (m) => ipcRenderer.send('mode', m),
  minimize: () => ipcRenderer.send('minimize'),
  close: () => ipcRenderer.send('close'),
  onShortcut: (fn) => ipcRenderer.on('shortcut', (_e, action) => fn(action)),
  onState: (fn) => ipcRenderer.on('state', (_e, state) => fn(state)),
});

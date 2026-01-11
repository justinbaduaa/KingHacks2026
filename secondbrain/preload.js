const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('braindump', {
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  simulateVoice: () => ipcRenderer.invoke('simulate-voice'),
  keysReleased: () => ipcRenderer.invoke('keys-released'),
  onStartListening: (callback) => ipcRenderer.on('start-listening', callback),
  onStopListening: (callback) => ipcRenderer.on('stop-listening', callback),
  onCheckKeys: (callback) => ipcRenderer.on('check-keys', callback),
  onWindowHidden: (callback) => ipcRenderer.on('window-hidden', callback),
});

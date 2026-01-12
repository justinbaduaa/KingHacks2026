const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('braindump', {
  hideWindow: () => ipcRenderer.invoke('hide-window'), // hides the window and notifies renderer
  simulateVoice: () => ipcRenderer.invoke('simulate-voice'), // simulates voice input
  keysReleased: () => ipcRenderer.invoke('keys-released'), // notifies renderer that keys are released
  onStartListening: (callback) => ipcRenderer.on('start-listening', callback), // notifies renderer that the overlay is visible
  onStopListening: (callback) => ipcRenderer.on('stop-listening', callback), // notifies renderer that the overlay is hidden
  onCheckKeys: (callback) => ipcRenderer.on('check-keys', callback), // checks if keys are still held
  onWindowHidden: (callback) => ipcRenderer.on('window-hidden', callback),
});

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("recorder", {
  saveAudio: (buffer, filename) => ipcRenderer.invoke("save-audio", { buffer, filename }),
  quitApp: () => ipcRenderer.invoke("quit-app"),
});


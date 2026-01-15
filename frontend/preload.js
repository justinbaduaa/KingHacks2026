const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('braindump', {
  hideWindow: () => ipcRenderer.invoke('hide-window'),
  simulateVoice: () => ipcRenderer.invoke('simulate-voice'),
  keysReleased: () => ipcRenderer.invoke('keys-released'),
  openDashboard: () => ipcRenderer.invoke('open-dashboard'),
  
  // Dashboard window controls (for custom title bar)
  dashboardMinimize: () => ipcRenderer.invoke('dashboard-minimize'),
  dashboardMaximize: () => ipcRenderer.invoke('dashboard-maximize'),
  dashboardClose: () => ipcRenderer.invoke('dashboard-close'),
  
  // Backend integration - Transcription
  transcribeStart: () => ipcRenderer.invoke('transcribe-start'),
  transcribeStart: () => ipcRenderer.invoke('transcribe-start'),
  transcribeStop: () => ipcRenderer.invoke('transcribe-stop'),
  transcribeFinish: () => ipcRenderer.invoke('transcribe-finish'),
  sendAudioChunk: (buffer) => ipcRenderer.invoke('audio-chunk', buffer),
  
  // Backend integration - Ingest
  ingestTranscript: (text, timeIso) => ipcRenderer.invoke('ingest-transcript', text, timeIso),
  
  // Backend integration - Complete Node
  completeNode: (node, nodeId) => ipcRenderer.invoke('complete-node', node, nodeId),
  
  // Auth
  authStatus: () => ipcRenderer.invoke('auth-status'),
  authLogin: () => ipcRenderer.invoke('auth-login'),
  
  // Event listeners - Window
  onStartListening: (callback) => ipcRenderer.on('start-listening', callback),
  onStopListening: (callback) => ipcRenderer.on('stop-listening', callback),
  onCheckKeys: (callback) => ipcRenderer.on('check-keys', callback),
  onWindowHidden: (callback) => ipcRenderer.on('window-hidden', callback),
  
  // Event listeners - Transcription
  onTranscript: (callback) => ipcRenderer.on('transcribe-transcript', (_, payload) => callback(payload)),
  onTranscribeEnded: (callback) => ipcRenderer.on('transcribe-ended', callback),
  onTranscribeError: (callback) => ipcRenderer.on('transcribe-error', (_, err) => callback(err)),
  onTranscribeReady: (callback) => ipcRenderer.on('transcribe-ready', callback),
});


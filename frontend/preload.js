const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('braindump', {
  // Window management
  hideWindow: () => ipcRenderer.invoke('hide-window'),

  // Voice simulation (for testing)
  simulateVoice: () => ipcRenderer.invoke('simulate-voice'),

  // Keyboard state
  keysReleased: () => ipcRenderer.invoke('keys-released'),

  // Event listeners
  onStartListening: (callback) => ipcRenderer.on('start-listening', callback),
  onStopListening: (callback) => ipcRenderer.on('stop-listening', callback),
  onCheckKeys: (callback) => ipcRenderer.on('check-keys', callback),
  onWindowHidden: (callback) => ipcRenderer.on('window-hidden', callback),

  // Google OAuth
  googleConnect: () => ipcRenderer.invoke('google-connect'),
  googleDisconnect: (cognitoToken) => ipcRenderer.invoke('google-disconnect', cognitoToken),
  googleStatus: (cognitoToken) => ipcRenderer.invoke('google-status', cognitoToken),
  storeGoogleToken: (data) => ipcRenderer.invoke('store-google-token', data),

  // Actions
  executeAction: (data) => ipcRenderer.invoke('execute-action', data),

  // Tasks
  fetchTasks: (cognitoToken) => ipcRenderer.invoke('fetch-tasks', cognitoToken),

  // Local Google API execution (for testing without backend)
  executeGmailLocal: (data) => ipcRenderer.invoke('execute-gmail-local', data),
  executeCalendarLocal: (data) => ipcRenderer.invoke('execute-calendar-local', data),

  // Apple Reminders (macOS only)
  isAppleRemindersAvailable: () => ipcRenderer.invoke('apple-reminders-available'),
  executeAppleReminder: (data) => ipcRenderer.invoke('execute-apple-reminder', data),
  getAppleRemindersLists: () => ipcRenderer.invoke('apple-reminders-lists'),
});

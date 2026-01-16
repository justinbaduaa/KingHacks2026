const { app } = require('electron');
const path = require('path');
const fs = require('fs');

// Default settings
const DEFAULT_SETTINGS = {
  globalShortcut: 'Alt+Shift+Space',
  launchAtLogin: true,
};

// Get settings file path
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

// Load settings from disk
function loadSettings() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('[SETTINGS] Failed to load settings:', err);
  }
  return { ...DEFAULT_SETTINGS };
}

// Save settings to disk
function saveSettings(settings) {
  try {
    const settingsPath = getSettingsPath();
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (err) {
    console.error('[SETTINGS] Failed to save settings:', err);
    return false;
  }
}

// Get global shortcut
function getShortcut() {
  const settings = loadSettings();
  return settings.globalShortcut;
}

// Set global shortcut
function setShortcut(shortcut) {
  const settings = loadSettings();
  settings.globalShortcut = shortcut;
  return saveSettings(settings);
}

module.exports = {
  loadSettings,
  saveSettings,
  getShortcut,
  setShortcut,
  DEFAULT_SETTINGS,
};

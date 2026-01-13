const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const path = require("path");

let mainWindow = null;
let dashboardWindow = null;
let tray = null;
let isShortcutHeld = false;

// Creates the overlay window (lightweight, always-on-top for voice capture)
function createOverlayWindow() { 
  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  const windowWidth = 400;
  const windowHeight = 450;

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: Math.round((screenWidth - windowWidth) / 2),
    y: screenHeight - windowHeight - 5,
    type: 'panel',
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    show: false,
    hasShadow: false,
    excludedFromShownWindowsMenu: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("blur", () => {
    if (!isShortcutHeld) {
      hideOverlay();
    }
  });

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      hideOverlay();
    }
  });
}

// Shows the overlay at bottom center of current screen
function showOverlay() {
  if (mainWindow) {
    const cursorPoint = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { width: screenWidth, height: screenHeight } = currentDisplay.workAreaSize;
    const { x: screenX, y: screenY } = currentDisplay.workArea;
    
    const windowWidth = 400;
    const windowHeight = 450;
    
    const newX = Math.round(screenX + (screenWidth - windowWidth) / 2);
    const newY = screenY + screenHeight - windowHeight - 5;
    
    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: windowWidth,
      height: windowHeight
    });
    
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("start-listening");
  }
}

// Hides the overlay window
function hideOverlay() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
    mainWindow.webContents.send("window-hidden");
  }
}

// Creates the dashboard window (frameless, floating, with vibrancy)
function createDashboardWindow() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.show();
    dashboardWindow.focus();
    return;
  }

  const { width: screenWidth, height: screenHeight } =
    screen.getPrimaryDisplay().workAreaSize;

  dashboardWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    x: Math.round((screenWidth - 1200) / 2),
    y: Math.round((screenHeight - 800) / 2),
    frame: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 20, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dashboardWindow.loadFile(path.join(__dirname, "renderer", "dashboard.html"));

  dashboardWindow.once('ready-to-show', () => {
    dashboardWindow.show();
  });

  // Hide instead of close - stay in background
  dashboardWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      dashboardWindow.hide();
    }
  });
}

// Opens or focuses the dashboard
function openDashboard() {
  createDashboardWindow();
}

// Creates the menu bar tray icon
function createTray() {
  // Create brain icon for the tray - resize maintaining aspect ratio
  const trayIconPath = path.join(__dirname, "renderer", "brain.png");
  let trayIcon = nativeImage.createFromPath(trayIconPath);
  // Get original size to calculate aspect ratio
  const originalSize = trayIcon.getSize();
  const targetHeight = 18;
  const targetWidth = Math.round((originalSize.width / originalSize.height) * targetHeight);
  trayIcon = trayIcon.resize({ width: targetWidth, height: targetHeight });
  trayIcon.setTemplateImage(true);
  
  tray = new Tray(trayIcon);
  tray.setToolTip('SecondBrain');
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Dashboard',
      click: () => openDashboard(),
    },
    { type: 'separator' },
    {
      label: 'Settings',
      click: () => {
        openDashboard();
        // Could navigate to settings tab
      },
    },
    { type: 'separator' },
    {
      label: 'Quit SecondBrain',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  
  tray.setContextMenu(contextMenu);
  
  // Click on tray icon opens dashboard
  tray.on('click', () => {
    openDashboard();
  });
}

app.whenReady().then(() => {
  createOverlayWindow();
  createTray();

  // Register global shortcut for overlay
  const shortcut = "Alt+Shift+Space";
  globalShortcut.register(shortcut, () => {
    if (!isShortcutHeld) {
      isShortcutHeld = true;
      showOverlay();
    }
  });

  // Poll keyboard state to detect release
  setInterval(() => {
    if (isShortcutHeld && mainWindow && mainWindow.isVisible()) {
      mainWindow.webContents.send("check-keys");
    }
  }, 100);

  // IPC handlers
  ipcMain.handle("hide-window", () => {
    hideOverlay();
  });

  ipcMain.handle("keys-released", () => {
    if (isShortcutHeld) {
      isShortcutHeld = false;
      mainWindow.webContents.send("stop-listening");
    }
  });

  ipcMain.handle("simulate-voice", () => {
    const transcripts = [
      "Remind me to email Sarah tomorrow",
      "Write down idea about AI study planner",
      "Schedule meeting next Monday at 2",
      "Add task to review the project proposal",
      "Note: check the budget spreadsheet",
    ];
    return transcripts[Math.floor(Math.random() * transcripts.length)];
  });

  ipcMain.handle("open-dashboard", () => {
    openDashboard();
  });

  // Show in Dock on macOS (don't hide)
  // The app persists in background when windows are closed
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

// Don't quit when all windows are closed - stay in background
app.on("window-all-closed", () => {
  // Do nothing - app stays running via tray
});

app.on("activate", () => {
  // When clicking dock icon, open dashboard
  openDashboard();
});


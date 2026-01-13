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

// creates the overlay window with some special settings, like transparent and always on top, no taskbar
function createWindow() { 
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
      hideWindow();
    }
  });

  mainWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      hideWindow();
    }
  });
}

// shows the overlay at the bottom centre of the current screen (semi-works with multidisplays)
function showWindow() {
  if (mainWindow) {
    // Get the display where the cursor currently is
    const cursorPoint = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursorPoint);
    const { width: screenWidth, height: screenHeight } = currentDisplay.workAreaSize;
    const { x: screenX, y: screenY } = currentDisplay.workArea;
    
    const windowWidth = 400;
    const windowHeight = 450;
    
    // Calculate position at bottom center of the current screen
    const newX = Math.round(screenX + (screenWidth - windowWidth) / 2);
    const newY = screenY + screenHeight - windowHeight - 5;
    
    // Use setBounds for more reliable multi-monitor positioning
    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: windowWidth,
      height: windowHeight
    });
    
    // Ensure window is visible on all workspaces (helps with multi-monitor)
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("start-listening");
  }
}

// hides the window and notifies renderer
function hideWindow() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
    mainWindow.webContents.send("window-hidden");
  }
}

// Creates the dashboard window - frameless, floating, magical
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
    frame: false, // Frameless - no native title bar
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 }, // Hide native traffic lights
    transparent: false,
    vibrancy: 'under-window', // macOS native blur
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    hasShadow: true,
    roundedCorners: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  dashboardWindow.loadFile(path.join(__dirname, "renderer", "dashboard.html"));

  // Show dock icon when dashboard is open (macOS)
  dashboardWindow.once('ready-to-show', () => {
    if (process.platform === 'darwin') {
      app.dock.show();
    }
    dashboardWindow.show();
  });

  // Hide dock when dashboard closes, but don't quit app
  dashboardWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      dashboardWindow.hide();
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
    }
  });

  dashboardWindow.on('closed', () => {
    dashboardWindow = null;
  });
}

// Opens the dashboard window
function openDashboard() {
  createDashboardWindow();
}

// Creates the menu bar tray icon
function createTray() {
  // Create a small brain icon for the menu bar
  const iconPath = path.join(__dirname, "renderer", "brain.png");
  let trayIcon = nativeImage.createFromPath(iconPath);
  
  // Get original size and calculate proper resize maintaining aspect ratio
  const originalSize = trayIcon.getSize();
  const targetHeight = 18;
  const aspectRatio = originalSize.width / originalSize.height;
  const targetWidth = Math.round(targetHeight * aspectRatio);
  
  trayIcon = trayIcon.resize({ width: targetWidth, height: targetHeight });
  trayIcon.setTemplateImage(true); // Makes it adapt to dark/light mode on macOS
  
  tray = new Tray(trayIcon);
  tray.setToolTip('SecondBrain');
  
  // Click tray icon to open dashboard
  tray.on('click', () => {
    openDashboard();
  });
  
  // Right-click context menu
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open Dashboard', 
      click: () => openDashboard() 
    },
    { 
      label: 'Activate Overlay (⌥⇧Space)', 
      click: () => showWindow() 
    },
    { type: 'separator' },
    { 
      label: 'Quit SecondBrain', 
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

app.whenReady().then(() => {
  createWindow();
  createTray();

  // Register shortcut - fires repeatedly while held
  // Use Option+Shift+Space on Mac, Alt+Shift+Space on Windows/Linux
  const shortcut = "Alt+Shift+Space";
  globalShortcut.register(shortcut, () => {
    if (!isShortcutHeld) {
      isShortcutHeld = true;
      showWindow();
    }
  });

  // Poll keyboard state to detect release
  setInterval(() => {
    if (isShortcutHeld && mainWindow && mainWindow.isVisible()) {
      // Send ping to check if keys are still held
      mainWindow.webContents.send("check-keys");
    }
  }, 100);

  // IPC handlers
  ipcMain.handle("hide-window", () => {
    hideWindow();
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
  
  // IPC for window controls from renderer
  ipcMain.handle("dashboard-minimize", () => {
    if (dashboardWindow) dashboardWindow.minimize();
  });
  
  ipcMain.handle("dashboard-maximize", () => {
    if (dashboardWindow) {
      if (dashboardWindow.isMaximized()) {
        dashboardWindow.unmaximize();
      } else {
        dashboardWindow.maximize();
      }
    }
  });
  
  ipcMain.handle("dashboard-close", () => {
    if (dashboardWindow) dashboardWindow.close();
  });

  // Hide dock initially (macOS) - we'll show it when dashboard opens
  if (process.platform === "darwin") {
    app.dock.hide();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

// Don't quit when all windows closed - we're a menu bar app
app.on("window-all-closed", () => {
  // Do nothing - app stays alive in menu bar
});

app.on("activate", () => {
  // When dock icon clicked, open dashboard
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.show();
  } else {
    openDashboard();
  }
});

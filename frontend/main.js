const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
} = require("electron");
const path = require("path");
const { ensureValidTokens, loginInteractive } = require("./auth");

let mainWindow = null;
let isShortcutHeld = false;
let keyPollInterval = null;
let windowReady = false;
let pendingStartListening = false;

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in main process:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection in main process:", err);
});

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
  windowReady = false;
  pendingStartListening = false;

  mainWindow.webContents.on("did-finish-load", () => {
    windowReady = true;
    if (pendingStartListening) {
      pendingStartListening = false;
      if (safeSend("start-listening")) {
        startKeyPoll();
      }
    }
  });

  mainWindow.webContents.on("did-fail-load", () => {
    windowReady = false;
  });

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

  mainWindow.on("closed", () => {
    stopKeyPoll();
    windowReady = false;
    pendingStartListening = false;
    mainWindow = null;
  });

  mainWindow.webContents.on("render-process-gone", () => {
    stopKeyPoll();
    windowReady = false;
    pendingStartListening = false;
    isShortcutHeld = false;
  });

  mainWindow.webContents.on("destroyed", () => {
    stopKeyPoll();
    windowReady = false;
    pendingStartListening = false;
    isShortcutHeld = false;
  });
}


// shwos the overlay at the bottom centre of the current screen (semi-works with multidisplays)
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
  }
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
    if (!windowReady) {
      pendingStartListening = true;
    } else if (safeSend("start-listening")) {
      startKeyPoll();
    }
  }
}

// hides the window and notifies renderer
function hideWindow() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
    safeSend("window-hidden");
    stopKeyPoll();
  }
}

function canSend() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return false;
  }
  if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) {
    return false;
  }
  if (mainWindow.webContents.isCrashed()) {
    return false;
  }
  return true;
}

function safeSend(channel, ...args) {
  if (!canSend()) {
    stopKeyPoll();
    isShortcutHeld = false;
    return false;
  }
  try {
    mainWindow.webContents.send(channel, ...args);
    return true;
  } catch (err) {
    stopKeyPoll();
    isShortcutHeld = false;
    return false;
  }
}

function startKeyPoll() {
  if (keyPollInterval) {
    return;
  }
  keyPollInterval = setInterval(() => {
    if (isShortcutHeld && mainWindow && mainWindow.isVisible()) {
      safeSend("check-keys");
    }
  }, 100);
}

function stopKeyPoll() {
  if (!keyPollInterval) {
    return;
  }
  clearInterval(keyPollInterval);
  keyPollInterval = null;
}

app.whenReady().then(() => {
  if (process.env.PRINT_TOKEN === "1") {
    (async () => {
      const tokens = await ensureValidTokens().catch(() => null);
      const result = tokens || (await loginInteractive().catch(() => null));
      if (!result?.access_token) {
        console.error("No access token available.");
      } else {
        console.log(result.id_token);
      }
      app.quit();
    })();
    return;
  }

  registerIpcHandlers();

  createWindow();
  if (process.env.OPEN_DEVTOOLS === "1" && mainWindow) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Register shortcut - fires repeatedly while held
  // Use Option+Shift+Space on Mac, Alt+Shift+Space on Windows/Linux
  const shortcut = "Alt+Shift+Space";
  globalShortcut.register(shortcut, () => {
    if (!isShortcutHeld) {
      isShortcutHeld = true;
      showWindow();
    }
  });


  if (process.platform === "darwin") {
    app.dock.hide();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (keyPollInterval) {
    clearInterval(keyPollInterval);
    keyPollInterval = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

function registerIpcHandlers() {
  // IPC handlers
  ipcMain.handle("hide-window", () => {
    hideWindow();
  });

  ipcMain.handle("keys-released", () => {
    if (isShortcutHeld) {
      isShortcutHeld = false;
      stopKeyPoll();
      safeSend("stop-listening");
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

  ipcMain.handle("auth-status", async () => {
    const tokens = await ensureValidTokens().catch(() => null);
    return { authenticated: Boolean(tokens) };
  });

  ipcMain.handle("auth-login", async () => {
    const tokens = await loginInteractive();
    return { authenticated: Boolean(tokens) };
  });

}

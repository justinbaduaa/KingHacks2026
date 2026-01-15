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
const fs = require("fs");
const https = require("https");
const { execSync } = require("child_process");
const { ensureValidTokens, loadConfig, loginInteractive, clearTokens } = require("./auth");
const { loginGoogleInteractive } = require("./google_auth");
const { createTranscribeSession } = require("./transcribe");

let mainWindow = null;
let dashboardWindow = null;
let tray = null;
let isShortcutHeld = false;

// Transcription state
const transcribeSession = createTranscribeSession();
let streamReady = false;

// Cache for API URL
let cachedApiUrl = null;

// Get CloudFormation stack output
function getStackOutput(stackName, outputKey) {
  try {
    const result = execSync(
      `aws cloudformation describe-stacks --stack-name ${stackName} --query "Stacks[0].Outputs[?OutputKey=='${outputKey}'].OutputValue" --output text`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    const value = result.trim();
    return value && value !== "None" ? value : null;
  } catch (err) {
    return null;
  }
}

function getApiUrl() {
  if (cachedApiUrl) {
    return cachedApiUrl;
  }
  const stackName = "second-brain-backend-evan";
  const url = getStackOutput(stackName, "ApiEndpoint");
  if (url) {
    cachedApiUrl = url.endsWith("/") ? url : url + "/";
  }
  return cachedApiUrl;
}

function toLocalIsoWithOffset(date = new Date()) {
  const offsetMinutes = date.getTimezoneOffset();
  const sign = offsetMinutes > 0 ? "-" : "+";
  const pad = (value) => String(Math.floor(Math.abs(value))).padStart(2, "0");
  const hours = pad(offsetMinutes / 60);
  const minutes = pad(offsetMinutes % 60);
  const local = new Date(date.getTime() - offsetMinutes * 60000)
    .toISOString()
    .replace("Z", "");
  return `${local}${sign}${hours}:${minutes}`;
}

async function callApi(endpoint, method = "GET", body = null) {
  const apiUrl = getApiUrl();
  if (!apiUrl) {
    throw new Error("Could not get API URL from stack");
  }

  const tokens = await ensureValidTokens();
  if (!tokens || !tokens.id_token) {
    throw new Error("Not authenticated. Please log in first.");
  }

  const fullUrl = apiUrl + endpoint;
  const url = new URL(fullUrl);
  const options = {
    hostname: url.hostname,
    path: url.pathname + url.search,
    method,
    headers: {
      Authorization: `Bearer ${tokens.id_token}`,
      "Content-Type": "application/json",
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({
            statusCode: res.statusCode,
            body: jsonData,
          });
        } catch (err) {
          resolve({
            statusCode: res.statusCode,
            body: data,
          });
        }
      });
    });

    req.on("error", reject);

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

async function ensureCognitoLogin() {
  const tokens = await ensureValidTokens().catch(() => null);
  if (tokens) {
    return true;
  }
  try {
    await loginInteractive();
    return true;
  } catch (err) {
    console.error("[AUTH] Cognito login failed:", err);
    return false;
  }
}

async function ensureGoogleConnected() {
  let connected = false;

  try {
    const status = await callApi("integrations/google/token", "GET");
    connected = Boolean(status?.body?.connected);
  } catch (err) {
    console.warn("[GOOGLE] Failed to check integration status:", err?.message || err);
  }

  if (connected) {
    return true;
  }

  const tokens = await loginGoogleInteractive();
  if (!tokens?.refresh_token) {
    throw new Error("Google OAuth did not return a refresh token. Try disconnecting and re-consenting.");
  }

  const payload = {
    refresh_token: tokens.refresh_token,
    access_token: tokens.access_token,
    access_token_expires_at: tokens.expires_at,
    scope: tokens.scope,
    provider_user_id: tokens.provider_user_id,
    token_type: tokens.token_type,
  };

  await callApi("integrations/google/token", "POST", payload);
  return true;
}

// Error handlers
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in main process:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection in main process:", err);
});

// Transcribe session events
transcribeSession.on("error", (err) => {
  const message = err?.Message || err?.message || "Transcribe error";
  const code = err?.name || err?.code || "error";
  safeSend("transcribe-error", { message, code });
});

transcribeSession.on("ended", () => {
  streamReady = false;
  safeSend("transcribe-ended");
});

transcribeSession.on("transcript", (payload) => {
  safeSend("transcribe-transcript", payload);
});

transcribeSession.on("ready", () => {
  streamReady = true;
  safeSend("transcribe-ready");
});

// Safe send helper
function safeSend(channel, ...args) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (!mainWindow.webContents || mainWindow.webContents.isDestroyed()) return false;
  try {
    mainWindow.webContents.send(channel, ...args);
    return true;
  } catch (err) {
    return false;
  }
}

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
  // Create a small brain icon for the menu bar (PNG required for macOS tray)
  const iconPath = path.join(__dirname, "renderer", "brain logo pink.png");
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

app.whenReady().then(async () => {
  const shouldClearAuth = process.argv.includes("--clear-auth");
  const shouldForceLogin = process.argv.includes("--force-login");

  if (shouldClearAuth) {
    clearTokens();
    console.log("[AUTH] Cleared stored tokens.");
  }

  if (shouldForceLogin) {
    try {
      await loginInteractive();
      console.log("[AUTH] Login complete.");
    } catch (err) {
      console.error("[AUTH] Login failed:", err);
    }
  }

  createWindow();
  createTray();

  const cognitoReady = await ensureCognitoLogin();
  if (cognitoReady) {
    try {
      await ensureGoogleConnected();
    } catch (err) {
      console.error("[GOOGLE] Google login failed:", err?.message || err);
    }
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

  // Poll keyboard state to detect release
  setInterval(() => {
    if (isShortcutHeld && mainWindow && mainWindow.isVisible()) {
      // Send ping to check if keys are still held
      safeSend("check-keys");
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

  // Backend integration handlers
  ipcMain.handle("auth-status", async () => {
    const tokens = await ensureValidTokens().catch(() => null);
    return { authenticated: Boolean(tokens) };
  });

  ipcMain.handle("auth-login", async () => {
    const tokens = await loginInteractive();
    return { authenticated: Boolean(tokens) };
  });

  ipcMain.handle("transcribe-start", async () => {
    try {
      console.log("[MAIN] transcribe-start called");
      streamReady = false;
      const started = await transcribeSession.start();
      console.log("[MAIN] transcribe-start result:", started);
      return { started: Boolean(started) };
    } catch (err) {
      console.error("[MAIN] Failed to start transcription:", err);
      return { started: false, error: err?.message || "start_failed" };
    }
  });

  ipcMain.handle("transcribe-stop", async () => {
    console.log("[MAIN] transcribe-stop called");
    transcribeSession.stop();
    streamReady = false;
    return { stopped: true };
  });

  let audioChunkCount = 0;
  ipcMain.handle("audio-chunk", async (event, buffer) => {
    // Accept audio chunks immediately - transcribe session queues them internally
    // This allows audio to flow before AWS Transcribe fully accepts the stream
    if (buffer) {
      audioChunkCount++;
      if (audioChunkCount <= 3 || audioChunkCount % 50 === 0) {
        console.log(`[MAIN] Audio chunk #${audioChunkCount}, size: ${buffer.byteLength} bytes`);
      }
      const chunk = Buffer.from(buffer);
      transcribeSession.enqueue(chunk);
    }
  });

  ipcMain.handle("transcribe-finish", async () => {
    console.log("[MAIN] transcribe-finish called");
    transcribeSession.finish();
    streamReady = false;
    // We don't return anything specific, expecting the 'ended' event to fire eventually
    return { finishing: true };
  });

  ipcMain.handle("ingest-transcript", async (event, transcript, userTimeIso) => {
    try {
      const body = {
        transcript: transcript,
        user_time_iso: userTimeIso || toLocalIsoWithOffset(),
        user_id: "demo",
        user_location: {
          kind: "unknown",
        },
      };
      const result = await callApi("ingest", "POST", body);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  ipcMain.handle("complete-node", async (event, node, nodeId) => {
    try {
      // Get node_id from parameter, node object, or generate from node if available
      const finalNodeId = nodeId || node?.node_id || node?.id;
      
      if (!finalNodeId) {
        throw new Error("Node ID is required to complete node");
      }
      
      // Construct endpoint with node_id in path (matches API Gateway route)
      const endpoint = `node/${finalNodeId}/complete`;
      
      const body = {
        node: node,
        node_id: finalNodeId,
        captured_at_iso: node?.captured_at_iso || new Date().toISOString(),
      };
      
      const result = await callApi(endpoint, "POST", body);
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("get-active-nodes", async () => {
    try {
      const result = await callApi("nodes/active", "GET");
      if (result.statusCode >= 300) {
        return { success: false, ...result };
      }
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("delete-node", async (event, nodeId) => {
    try {
      if (!nodeId) {
        throw new Error("Node ID is required to delete node");
      }
      const endpoint = `node/${nodeId}`;
      const result = await callApi(endpoint, "DELETE");
      if (result.statusCode >= 300) {
        return { success: false, ...result };
      }
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle("google-access-token", async () => {
    try {
      const result = await callApi("integrations/google/access-token", "GET");
      return { success: true, ...result };
    } catch (err) {
      return { success: false, error: err.message };
    }
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

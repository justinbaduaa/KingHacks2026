const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
} = require("electron");
const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");
const { ensureValidTokens, loginInteractive } = require("./auth");
const https = require("https");
// const { createTranscribeSession } = require("./transcribe");

let mainWindow = null;
let isShortcutHeld = false;
// const transcribeSession = createTranscribeSession();

// Cache for API URL
let cachedApiUrl = null;

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

// shwos the overlay at the bottom centre of the current screen (semi-works with multidisplays)
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
    if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("start-listening");
    }
  }
}

// hides the window and notifies renderer
function hideWindow() {
  if (mainWindow && mainWindow.isVisible()) {
    mainWindow.hide();
    // Check if webContents is still valid before sending
    if (mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("window-hidden");
    }
  }
}

app.whenReady().then(() => {
  // Handle command-line flags
  if (process.argv.includes("--clear-auth") || process.argv.includes("--logout")) {
    const { app: electronApp } = require("electron");
    const authPath = path.join(electronApp.getPath("userData"), "auth.json");
    if (fs.existsSync(authPath)) {
      fs.unlinkSync(authPath);
      console.log("✅ Authentication tokens cleared!");
      console.log(`   Deleted: ${authPath}`);
    } else {
      console.log("ℹ️  No saved tokens found.");
    }
    app.quit();
    return;
  }

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

  if (process.argv.includes("--force-login")) {
    (async () => {
      console.log("🔄 Forcing new login...");
      // Clear existing tokens first
      const { app: electronApp } = require("electron");
      const authPath = path.join(electronApp.getPath("userData"), "auth.json");
      if (fs.existsSync(authPath)) {
        fs.unlinkSync(authPath);
      }
      // Start login flow
      const tokens = await loginInteractive().catch((err) => {
        console.error("Login failed:", err);
        return null;
      });
      if (tokens) {
        console.log("✅ Login successful!");
        console.log(`   Access token: ${tokens.access_token.substring(0, 30)}...`);
        console.log(`   ID token: ${tokens.id_token.substring(0, 30)}...`);
      }
      app.quit();
    })();
    return;
  }

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


  // Poll keyboard state to detect release
  setInterval(() => {
    if (isShortcutHeld && mainWindow && mainWindow.isVisible() && 
        mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
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
      if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send("stop-listening");
      }
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

  ipcMain.handle("ingest-transcript", async (event, transcript, userTimeIso) => {
    try {
      const body = {
        transcript: transcript,
        user_time_iso: userTimeIso || new Date().toISOString(),
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

  // TRANSCRIPTION CODE COMMENTED OUT
  // ipcMain.handle("transcribe-start", async () => {
  //   try {
  //     const started = await transcribeSession.start();
  //     return { started: Boolean(started) };
  //   } catch (err) {
  //     console.error("Failed to start transcription:", err);
  //     return { started: false, error: err?.message || "start_failed" };
  //   }
  // });

  // ipcMain.handle("transcribe-stop", async () => {
  //   transcribeSession.stop();
  //   return { stopped: true };
  // });

  // ipcMain.on("transcribe-audio", (event, chunk) => {
  //   const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  //   transcribeSession.enqueue(buffer);
  // });


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

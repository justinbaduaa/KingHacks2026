const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
} = require("electron");
const path = require("path");
const record = require("node-record-lpcm16");
const { ensureValidTokens, loadConfig, loginInteractive } = require("./auth");
const { createTranscribeSession } = require("./transcribe");

let mainWindow = null;
let isShortcutHeld = false;
const transcribeSession = createTranscribeSession();
let nodeRecorder = null;
let recordingActive = false;
let stopTimer = null;
let silenceTimer = null;
let stopRequestedBeforeReady = false;
let streamReady = false;
let keyPollInterval = null;
let windowReady = false;
let pendingStartListening = false;

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception in main process:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection in main process:", err);
});

transcribeSession.on("error", (err) => {
  const message = err?.Message || err?.message || "Transcribe error";
  const code = err?.name || err?.code || "error";
  safeSend("transcribe-error", { message, code });
  if (recordingActive) {
    stopNodeTranscription({ immediate: true });
  }
});

transcribeSession.on("ended", () => {
  safeSend("transcribe-ended");
  if (recordingActive) {
    stopNodeTranscription({ immediate: true });
  }
});

transcribeSession.on("transcript", (payload) => {
  safeSend("transcribe-transcript", payload);
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

  ipcMain.handle("transcribe-start", async () => {
    try {
      const started = await startNodeTranscription();
      return { started: Boolean(started) };
    } catch (err) {
      console.error("Failed to start transcription:", err);
      return { started: false, error: err?.message || "start_failed" };
    }
  });

  ipcMain.handle("transcribe-stop", async () => {
    await stopNodeTranscription();
    return { stopped: true };
  });

}

function mapRecorderError(err) {
  const message = err?.message || String(err || "recorder_error");
  if (message.includes("spawn sox") || message.includes("ENOENT")) {
    return "Missing sox. Install with `brew install sox`.";
  }
  return message;
}

function waitForTranscribeReady(timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Transcribe stream not ready"));
    }, timeoutMs);

    function onReady() {
      cleanup();
      resolve();
    }

    function onError(err) {
      cleanup();
      reject(err);
    }

    function cleanup() {
      clearTimeout(timer);
      transcribeSession.off("ready", onReady);
      transcribeSession.off("error", onError);
    }

    transcribeSession.on("ready", onReady);
    transcribeSession.on("error", onError);
  });
}

async function startNodeTranscription() {
  if (recordingActive) {
    return false;
  }

  const tokens = await ensureValidTokens().catch(() => null);
  if (!tokens?.id_token) {
    throw new Error("Not authenticated. Run auth login before recording.");
  }

  const config = loadConfig();
  const sampleRate = Number(config.transcribeSampleRate || 16000);
  const pendingChunks = [];
  streamReady = false;
  stopRequestedBeforeReady = false;
  let chunkCount = 0;
  let totalBytes = 0;
  let firstChunkLogged = false;

  nodeRecorder = record.record({
    sampleRate,
    channels: 1,
    audioType: "raw",
    verbose: false,
  });

  recordingActive = true;

  if (nodeRecorder.process) {
    console.log("[RECORDER] Started sox:", nodeRecorder.process.spawnargs?.join(" ") || nodeRecorder.process.spawnargs);
    if (nodeRecorder.process.stderr) {
      nodeRecorder.process.stderr.on("data", (data) => {
        const text = data.toString().trim();
        if (text) {
          console.warn("[RECORDER] sox stderr:", text);
        }
      });
    }
    nodeRecorder.process.on("error", (err) => {
      const message = mapRecorderError(err);
      safeSend("transcribe-error", { message, code: "recorder_error" });
      stopNodeTranscription({ immediate: true });
    });
  }

  const stream = nodeRecorder.stream();
  stream.on("error", (err) => {
    const message = mapRecorderError(err);
    safeSend("transcribe-error", { message, code: "recorder_error" });
    stopNodeTranscription({ immediate: true });
  });
  stream.on("data", (chunk) => {
    if (!recordingActive || !chunk) {
      return;
    }
    if (!firstChunkLogged) {
      firstChunkLogged = true;
      console.log("[RECORDER] First audio chunk received.");
    }
    chunkCount += 1;
    totalBytes += chunk.length;
    if (!streamReady) {
      pendingChunks.push(chunk);
      return;
    }
    transcribeSession.enqueue(chunk);
  });

  const statsTimer = setInterval(() => {
    if (!recordingActive) {
      clearInterval(statsTimer);
      return;
    }
    console.log(`[RECORDER] chunks=${chunkCount} bytes=${totalBytes}`);
  }, 2000);

  transcribeSession.once("ready", () => {
    streamReady = true;
    console.log(`[TRANSCRIBE] Ready. Flushing ${pendingChunks.length} buffered chunks.`);
    pendingChunks.forEach((chunk) => transcribeSession.enqueue(chunk));
    pendingChunks.length = 0;
    if (silenceTimer) {
      clearInterval(silenceTimer);
      silenceTimer = null;
    }
    if (stopRequestedBeforeReady) {
      stopRequestedBeforeReady = false;
      stopNodeTranscription();
    }
  });

  await transcribeSession.start();

  const silenceChunk = Buffer.alloc(Math.round(sampleRate * 0.1) * 2);
  silenceTimer = setInterval(() => {
    if (!recordingActive || streamReady) {
      if (silenceTimer) {
        clearInterval(silenceTimer);
        silenceTimer = null;
      }
      return;
    }
    transcribeSession.enqueue(silenceChunk);
  }, 200);
  return true;
}

function stopNodeTranscription(options = {}) {
  const immediate = Boolean(options.immediate);
  if (!recordingActive && !stopTimer) {
    return;
  }
  if (!immediate && recordingActive && !streamReady) {
    stopRequestedBeforeReady = true;
    return;
  }
  if (immediate) {
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    stopNodeTranscriptionNow();
    return;
  }
  if (stopTimer) {
    return;
  }
  stopTimer = setTimeout(() => {
    stopTimer = null;
    stopNodeTranscriptionNow();
  }, 1500);
}

function stopNodeTranscriptionNow() {
  if (!recordingActive) {
    return;
  }
  recordingActive = false;
  streamReady = false;
  stopRequestedBeforeReady = false;
  if (silenceTimer) {
    clearInterval(silenceTimer);
    silenceTimer = null;
  }
  if (nodeRecorder) {
    try {
      nodeRecorder.stop();
    } catch (err) {
      console.warn("Failed to stop recorder:", err);
    }
    nodeRecorder = null;
  }
  transcribeSession.stop();
}

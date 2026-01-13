const { app, BrowserWindow, crashReporter, ipcMain, session } = require("electron");
const fs = require("fs");
const path = require("path");

const OUTPUT_DIR = path.join(__dirname, "recordings");

function createWindow() {
  const win = new BrowserWindow({
    width: 360,
    height: 240,
    resizable: false,
    minimizable: false,
    maximizable: false,
    show: true,
    backgroundThrottling: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  if (process.env.OPEN_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }

  win.webContents.on("render-process-gone", (event, details) => {
    console.error("[REC_MIN] Renderer crashed:", details);
  });
  win.webContents.on("did-fail-load", (event, code, desc) => {
    console.error("[REC_MIN] Failed to load:", code, desc);
  });

  return win;
}

function registerIpc() {
  ipcMain.handle("save-audio", async (event, { buffer, filename } = {}) => {
    if (!buffer) {
      return { saved: false, error: "missing_buffer" };
    }
    const safeName = (filename || "recording.wav").replace(/[^a-zA-Z0-9._-]/g, "_");
    const outputPath = path.join(OUTPUT_DIR, safeName);
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    await fs.promises.writeFile(outputPath, data);
    return { saved: true, path: outputPath, bytes: data.length };
  });

  ipcMain.handle("quit-app", () => {
    app.quit();
    return { quitting: true };
  });
}

app.whenReady().then(() => {
  crashReporter.start({
    submitURL: "",
    uploadToServer: false,
    compress: true,
  });
  registerIpc();
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === "media" || permission === "microphone") {
      return callback(true);
    }
    return callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => true);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

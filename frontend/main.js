const {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
} = require("electron");
const path = require("path");
const { OAuthServer, exchangeCodeForTokens, decodeJWT } = require("./oauth-server");
const appleReminders = require("./apple-reminders");

let mainWindow = null;
let isShortcutHeld = false;

// OAuth server instance
let oauthServer = new OAuthServer();

// API Configuration - Update this after deploying backend
// Can also be loaded from environment variable or config file
const API_BASE_URL = process.env.SECONDBRAIN_API_URL || "https://YOUR_API_GATEWAY_URL.execute-api.us-east-1.amazonaws.com/Prod";

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

app.whenReady().then(() => {
  createWindow();

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

  // Google OAuth: Start authentication flow
  ipcMain.handle("google-connect", async () => {
    try {
      const { code, codeVerifier } = await oauthServer.startAuthFlow();
      const tokens = await exchangeCodeForTokens(code, codeVerifier);

      // Extract user info from ID token if available
      let providerUserId = null;
      if (tokens.id_token) {
        const claims = decodeJWT(tokens.id_token);
        if (claims) {
          providerUserId = claims.sub;
        }
      }

      return {
        success: true,
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          scope: tokens.scope,
        },
        providerUserId,
      };
    } catch (error) {
      console.error("Google OAuth error:", error);
      return { success: false, error: error.message };
    }
  });

  // Google OAuth: Disconnect (delete token from backend)
  ipcMain.handle("google-disconnect", async (event, cognitoToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/integrations/google/token`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${cognitoToken}`,
        },
      });
      const data = await response.json();
      return { success: response.ok, ...data };
    } catch (error) {
      console.error("Google disconnect error:", error);
      return { success: false, error: error.message };
    }
  });

  // Google OAuth: Check connection status
  ipcMain.handle("google-status", async (event, cognitoToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/integrations/google/token`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cognitoToken}`,
        },
      });
      const data = await response.json();
      return data;
    } catch (error) {
      console.error("Google status error:", error);
      return { connected: false, error: error.message };
    }
  });

  // Google OAuth: Store refresh token in backend
  ipcMain.handle("store-google-token", async (event, { cognitoToken, refreshToken, providerUserId, scope }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/integrations/google/token`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cognitoToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
          provider_user_id: providerUserId,
          scope: scope,
        }),
      });
      const data = await response.json();
      return { success: response.ok, ...data };
    } catch (error) {
      console.error("Store token error:", error);
      return { success: false, error: error.message };
    }
  });

  // Execute an action (Gmail send/draft, Calendar event, etc.)
  ipcMain.handle("execute-action", async (event, { cognitoToken, action }) => {
    try {
      const response = await fetch(`${API_BASE_URL}/actions/execute`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cognitoToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(action),
      });
      const data = await response.json();
      return { success: response.ok, ...data };
    } catch (error) {
      console.error("Execute action error:", error);
      return { success: false, error: error.message };
    }
  });

  // Fetch active tasks/nodes from backend
  ipcMain.handle("fetch-tasks", async (event, cognitoToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/nodes/active`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cognitoToken}`,
        },
      });
      const data = await response.json();
      return { success: response.ok, ...data };
    } catch (error) {
      console.error("Fetch tasks error:", error);
      return { success: false, error: error.message, tasks: [] };
    }
  });

  // ============================================
  // Local Google API Execution (for testing without backend)
  // ============================================

  // Gmail: Send email or create draft directly using access token
  ipcMain.handle("execute-gmail-local", async (event, { accessToken, action }) => {
    try {
      const { to, subject, body, executionMode } = action;

      // Create email in RFC 2822 format
      const emailLines = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        body,
      ];
      const email = emailLines.join("\r\n");

      // Base64url encode the email
      const encodedEmail = Buffer.from(email)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      let endpoint;
      let requestBody;

      if (executionMode === "draft") {
        // Create draft
        endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";
        requestBody = JSON.stringify({
          message: { raw: encodedEmail },
        });
      } else {
        // Send email
        endpoint = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
        requestBody = JSON.stringify({ raw: encodedEmail });
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Gmail API error: ${response.status}`);
      }

      const data = await response.json();
      console.log(`[Gmail] ${executionMode === "draft" ? "Draft created" : "Email sent"}:`, data.id);

      return {
        success: true,
        messageId: data.id,
        mode: executionMode,
      };
    } catch (error) {
      console.error("Gmail local execution error:", error);
      return { success: false, error: error.message };
    }
  });

  // Calendar: Create event directly using access token
  ipcMain.handle("execute-calendar-local", async (event, { accessToken, action }) => {
    try {
      const { title, start_time, end_time, description, attendees, timezone } = action;

      // Default end time to 1 hour after start if not provided
      const startDate = new Date(start_time);
      const endDate = end_time ? new Date(end_time) : new Date(startDate.getTime() + 60 * 60 * 1000);

      const eventBody = {
        summary: title,
        description: description || "",
        start: {
          dateTime: startDate.toISOString(),
          timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      };

      // Add attendees if provided
      if (attendees && attendees.length > 0) {
        eventBody.attendees = attendees.map((email) => ({ email }));
      }

      const response = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(eventBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Calendar API error: ${response.status}`);
      }

      const data = await response.json();
      console.log("[Calendar] Event created:", data.id);

      return {
        success: true,
        eventId: data.id,
        htmlLink: data.htmlLink,
      };
    } catch (error) {
      console.error("Calendar local execution error:", error);
      return { success: false, error: error.message };
    }
  });

  // ============================================
  // Apple Reminders (macOS only)
  // ============================================

  // Check if Apple Reminders is available
  ipcMain.handle("apple-reminders-available", async () => {
    return appleReminders.isAvailable();
  });

  // Create a reminder in Apple Reminders app
  ipcMain.handle("execute-apple-reminder", async (event, { action }) => {
    if (!appleReminders.isAvailable()) {
      return { success: false, error: "Apple Reminders is only available on macOS" };
    }

    try {
      const { title, due_date, notes, list } = action;

      // Parse due date if provided
      let dueDate = null;
      if (due_date) {
        dueDate = new Date(due_date);
        if (isNaN(dueDate.getTime())) {
          dueDate = null;
        }
      }

      const result = await appleReminders.createReminder(title, {
        dueDate,
        notes,
        listName: list || null, // null = use system default list
      });

      if (result.success) {
        console.log("[Apple Reminders] Reminder created:", title);
      } else {
        console.warn("[Apple Reminders] Failed:", result.error);
      }

      return result;
    } catch (error) {
      console.error("Apple Reminder error:", error);
      return { success: false, error: error.message };
    }
  });

  // Get available reminder lists
  ipcMain.handle("apple-reminders-lists", async () => {
    if (!appleReminders.isAvailable()) {
      return { success: false, error: "Apple Reminders is only available on macOS" };
    }
    return appleReminders.getLists();
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

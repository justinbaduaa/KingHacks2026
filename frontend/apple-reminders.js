/**
 * Apple Reminders Integration Module
 *
 * Creates reminders in the native macOS Reminders app via AppleScript.
 * This is a frontend-only integration (no cloud API exists for Apple Reminders).
 */

const { exec } = require("child_process");
const util = require("util");
const execPromise = util.promisify(exec);

/**
 * Escape a string for safe use in AppleScript.
 * @param {string} str - The string to escape
 * @returns {string} - Escaped string
 */
function escapeAppleScript(str) {
  if (!str) return "";
  return str
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Format a Date object for AppleScript.
 * @param {Date} date - The date to format
 * @returns {string} - AppleScript date string
 */
function formatAppleScriptDate(date) {
  // AppleScript expects dates in the system's locale format
  // Using a format that works reliably across locales
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;

  return `${month}/${day}/${year} ${hour12}:${minutes.toString().padStart(2, "0")} ${ampm}`;
}

/**
 * Create a reminder in Apple Reminders app.
 *
 * @param {string} title - Reminder title (required)
 * @param {Object} options - Optional parameters
 * @param {Date|null} options.dueDate - Due date for the reminder
 * @param {string|null} options.notes - Additional notes/body text
 * @param {string} options.listName - Reminders list name (default: uses system default list)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function createReminder(title, options = {}) {
  const { dueDate = null, notes = null, listName = null } = options;

  if (!title || typeof title !== "string") {
    return { success: false, error: "Title is required" };
  }

  // Build properties string
  let properties = `name:"${escapeAppleScript(title)}"`;

  if (notes) {
    properties += `, body:"${escapeAppleScript(notes)}"`;
  }

  if (dueDate instanceof Date && !isNaN(dueDate.getTime())) {
    const dateStr = formatAppleScriptDate(dueDate);
    properties += `, due date:date "${dateStr}"`;
  }

  // Use default list or a specific named list
  let listTarget;
  if (listName) {
    const escapedListName = escapeAppleScript(listName);
    listTarget = `list "${escapedListName}"`;
  } else {
    listTarget = "default list";
  }

  // Build the AppleScript command
  const script = `
tell application "Reminders"
  tell ${listTarget}
    make new reminder with properties {${properties}}
  end tell
end tell
  `.trim();

  try {
    // Escape single quotes for shell execution
    const shellEscapedScript = script.replace(/'/g, "'\"'\"'");
    await execPromise(`osascript -e '${shellEscapedScript}'`, {
      timeout: 10000, // 10 second timeout
    });
    return { success: true };
  } catch (error) {
    // Parse common error scenarios
    const errorMessage = error.message || String(error);

    if (errorMessage.includes("Not authorized")) {
      return {
        success: false,
        error:
          "Permission denied. Please allow SecondBrain to control Reminders in System Preferences > Privacy & Security > Automation.",
      };
    }

    if (errorMessage.includes("Application isn't running")) {
      return {
        success: false,
        error: "Reminders app is not available on this system.",
      };
    }

    return { success: false, error: `Failed to create reminder: ${errorMessage}` };
  }
}

/**
 * Check if Apple Reminders is available on this system.
 * @returns {boolean} - True if running on macOS
 */
function isAvailable() {
  return process.platform === "darwin";
}

/**
 * Get list of reminder lists from Apple Reminders.
 * @returns {Promise<{success: boolean, lists?: string[], error?: string}>}
 */
async function getLists() {
  if (!isAvailable()) {
    return { success: false, error: "Apple Reminders only available on macOS" };
  }

  const script = `
tell application "Reminders"
  set listNames to {}
  repeat with reminderList in lists
    set end of listNames to name of reminderList
  end repeat
  return listNames
end tell
  `.trim();

  try {
    const shellEscapedScript = script.replace(/'/g, "'\"'\"'");
    const { stdout } = await execPromise(`osascript -e '${shellEscapedScript}'`, {
      timeout: 10000,
    });

    // Parse AppleScript list output (comma-separated)
    const lists = stdout
      .trim()
      .split(", ")
      .filter((name) => name.length > 0);

    return { success: true, lists };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = {
  createReminder,
  isAvailable,
  getLists,
};

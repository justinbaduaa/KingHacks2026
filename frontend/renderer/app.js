// BrainDump - Minimal Brain with Loudness-Based Pulse + Action Cards

const State = { IDLE: 'idle', LISTENING: 'listening', PROCESSING: 'processing', CONFIRMED: 'confirmed', COMPLETING: 'completing' };
let currentState = State.IDLE;
let animationFrameId = null;
let keysHeld = false;

// Audio analysis
let audioContext = null;
let analyser = null;
let microphone = null;
let mediaStream = null;

// Elements
const brainContainer = document.getElementById('brain-container');
const pulseRing = document.getElementById('pulse-ring');
const brainIcon = document.getElementById('brain-icon');
const cardsStack = document.getElementById('cards-stack');
const cardsWrapper = document.getElementById('cards-wrapper');
const progressBar = document.getElementById('progress-bar');
const loadingBar = document.querySelector('.loading-bar');
const expiredMessage = document.getElementById('expired-message');
const processingContainer = document.getElementById('processing-container');

// Timer state
let timerPermanentlyPaused = false;
let expiredDismissTimeout = null;

// Google connection state
let googleConnected = false;
let cognitoToken = null; // TODO: Implement Cognito auth flow to get this token

// Backend integration
let currentTasks = [];  // Real tasks from backend
let transcriptBuffer = '';  // Buffer for collecting transcript
let lastPartialTranscript = '';  // Track the last partial transcript (not yet finalized)
let audioStreamProcessor = null;  // Audio processor for streaming to main process
let audioWorkletNode = null;  // AudioWorklet node for modern audio processing
let workletReady = false;  // Flag to track if worklet is registered
let isTranscribing = false;

// Convert Bedrock nodes to UI task format
function convertNodesToTasks(nodes) {
  if (!nodes || !Array.isArray(nodes)) return [];
  return nodes.map(node => {
    // Map node_type to display type
    let displayType = node.node_type || 'note';
    if (displayType === 'calendar_placeholder') displayType = 'calendar';
    displayType = displayType.charAt(0).toUpperCase() + displayType.slice(1);

    return {
      type: displayType,
      text: node.title || node.body || 'Untitled',
      nodeId: node.node_id,
      fullNode: node,
      actionData: {
        // Include any action-related data from the node
        to: node.to,
        subject: node.subject,
        body: node.body,
        title: node.title,
        start_time: node.start_time,
        end_time: node.end_time,
        due_date: node.due_date,
        content: node.body || node.title,
        description: node.description,
        attendees: node.attendees,
      }
    };
  });
}

// ============================================
// Google OAuth Functions
// ============================================

// Check Google connection status on app load
async function checkGoogleStatus() {
  if (!cognitoToken) {
    console.log('[Google] No auth token available');
    return false;
  }

  try {
    const status = await window.braindump.googleStatus(cognitoToken);
    googleConnected = status.connected === true;
    updateGoogleStatusUI();
    return googleConnected;
  } catch (error) {
    console.error('[Google] Status check failed:', error);
    return false;
  }
}

// Connect Google account via OAuth
async function connectGoogle() {
  console.log('[Google] Starting OAuth flow...');

  try {
    const result = await window.braindump.googleConnect();

    if (result.success && result.tokens) {
      console.log('[Google] OAuth successful!');
      console.log('[Google] Access token received:', result.tokens.access_token ? 'Yes' : 'No');
      console.log('[Google] Refresh token received:', result.tokens.refresh_token ? 'Yes' : 'No');

      // Store tokens locally for now (backend integration later)
      localStorage.setItem('google_access_token', result.tokens.access_token);
      if (result.tokens.refresh_token) {
        localStorage.setItem('google_refresh_token', result.tokens.refresh_token);
      }
      localStorage.setItem('google_connected', 'true');

      // Try to store in backend if available (non-blocking)
      if (cognitoToken) {
        window.braindump.storeGoogleToken({
          cognitoToken: cognitoToken,
          refreshToken: result.tokens.refresh_token,
          providerUserId: result.providerUserId,
          scope: result.tokens.scope,
        }).catch(err => console.warn('[Google] Backend storage failed (OK for local testing):', err));
      }

      googleConnected = true;
      updateGoogleStatusUI();
      console.log('[Google] Connected successfully!');
    } else {
      console.error('[Google] OAuth failed:', result.error);
    }
  } catch (error) {
    console.error('[Google] Connection error:', error);
  }
}

// Disconnect Google account
async function disconnectGoogle() {
  // Clear local storage
  localStorage.removeItem('google_access_token');
  localStorage.removeItem('google_refresh_token');
  localStorage.removeItem('google_connected');

  // Try to disconnect from backend if authenticated
  if (cognitoToken) {
    try {
      await window.braindump.googleDisconnect(cognitoToken);
    } catch (error) {
      console.warn('[Google] Backend disconnect failed (OK for local testing):', error);
    }
  }

  googleConnected = false;
  updateGoogleStatusUI();
  console.log('[Google] Disconnected successfully');
}

// Update the Google connection status UI
function updateGoogleStatusUI() {
  const btn = document.getElementById('google-connect-btn');
  const text = document.getElementById('google-connect-text');

  if (!btn || !text) return;

  if (googleConnected) {
    btn.classList.add('connected');
    text.textContent = 'Google Connected';
  } else {
    btn.classList.remove('connected');
    text.textContent = 'Connect Google';
  }
}

// ============================================
// Action Execution
// ============================================

// Execute an action locally using Google APIs (for testing without backend)
async function executeActionLocally(task, executionMode = 'execute') {
  const accessToken = localStorage.getItem('google_access_token');
  if (!accessToken) {
    console.warn('[Action] No Google access token available');
    return { success: false, error: 'Google not connected' };
  }

  const taskType = task.type.toLowerCase();
  console.log(`[Action] Executing locally: ${taskType} (${executionMode})`);

  try {
    // Gmail actions (email, reminder)
    if (['email', 'reminder', 'gmail'].includes(taskType)) {
      const result = await window.braindump.executeGmailLocal({
        accessToken,
        action: {
          to: task.actionData.to || 'me@example.com',
          subject: task.actionData.subject || task.text,
          body: task.actionData.body || task.text,
          executionMode,
        },
      });
      return result;
    }

    // Calendar actions (calendar, meeting, event)
    if (['calendar', 'meeting', 'event'].includes(taskType)) {
      console.log('[Google Calendar] Creating event:', task.actionData.title || task.text);
      const result = await window.braindump.executeCalendarLocal({
        accessToken,
        action: {
          title: task.actionData.title || task.text,
          start_time: task.actionData.start_time || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          end_time: task.actionData.end_time,
          description: task.actionData.description || '',
          attendees: task.actionData.attendees || [],
        },
      });
      if (result.success) {
        console.log('[Google Calendar] Event created:', result.eventId || result.id);
      } else {
        console.error('[Google Calendar] Failed to create event:', result.error);
      }
      return result;
    }

    // Other types (todo, note) - just log locally for now
    console.log(`[Action] Local action type '${taskType}' stored locally`);
    return { success: true, local: true };
  } catch (error) {
    console.error('[Action] Local execution error:', error);
    return { success: false, error: error.message };
  }
}

// Execute an action via the backend (or locally if no backend)
async function executeActionOnBackend(task, executionMode = 'execute') {
  const taskType = task.type.toLowerCase();

  // If Google is connected locally but no backend auth, use local execution
  if (googleConnected && !cognitoToken) {
    if (['email', 'reminder', 'gmail', 'calendar', 'meeting', 'event'].includes(taskType)) {
      return executeActionLocally(task, executionMode);
    }
    // For non-Google actions without backend, just succeed locally
    console.log(`[Action] No backend - '${taskType}' action logged locally`);
    return { success: true, local: true };
  }

  // No auth at all
  if (!cognitoToken) {
    console.warn('[Action] No auth token - action will not be sent to backend');
    return { success: false, error: 'Not authenticated' };
  }

  // Use backend
  const actionPayload = {
    type: taskType,
    execution_mode: executionMode,
    ...task.actionData,
  };

  console.log('[Action] Executing via backend:', actionPayload);

  try {
    const result = await window.braindump.executeAction({
      cognitoToken: cognitoToken,
      action: actionPayload,
    });

    if (result.success) {
      console.log('[Action] Success:', result);
    } else {
      console.error('[Action] Failed:', result.error);
    }

    return result;
  } catch (error) {
    console.error('[Action] Error:', error);
    return { success: false, error: error.message };
  }
}

// Helper: Get icon SVG based on card type
function getIconForType(type) {
  const lowerType = type.toLowerCase();

  switch (lowerType) {
    case 'reminder':
      // Bell icon
      return `<svg viewBox="0 0 24 24">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>`;

    case 'calendar':
      // Calendar icon
      return `<svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>`;

    case 'todo':
    case 'task':
      // Checkbox/task icon
      return `<svg viewBox="0 0 24 24">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <path d="M9 12l2 2 4-4"/>
      </svg>`;

    case 'note':
    case 'notes':
      // Note/document icon
      return `<svg viewBox="0 0 24 24">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>`;

    case 'event':
      // Star/event icon
      return `<svg viewBox="0 0 24 24">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
      </svg>`;

    case 'meeting':
      // People/meeting icon
      return `<svg viewBox="0 0 24 24">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>`;

    default:
      // Default tag icon
      return `<svg viewBox="0 0 24 24">
        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
        <line x1="7" y1="7" x2="7.01" y2="7"/>
      </svg>`;
  }
}

// Helper: Check if a task type supports draft mode (email types only)
function supportsDraftMode(type) {
  const lowerType = type.toLowerCase();
  return ['email', 'gmail'].includes(lowerType);
}

// Helper: Render cards from tasks array
function renderCards(tasks) {
  // Store tasks for reference in approve/dismiss handlers
  currentTasks = tasks;

  // Reset all timer states for fresh card set
  timerPermanentlyPaused = false;
  cardsStack.classList.remove('timer-paused');

  // Clear any pending expired message dismiss timeout
  if (expiredDismissTimeout) {
    clearTimeout(expiredDismissTimeout);
    expiredDismissTimeout = null;
  }

  // Reset expired message state completely
  expiredMessage.classList.remove('visible', 'hover-paused');
  const expiredCountdownBar = expiredMessage.querySelector('.expired-countdown-bar');
  if (expiredCountdownBar) {
    // Force reset the animation by removing and re-adding the element
    expiredCountdownBar.style.animation = 'none';
    expiredCountdownBar.offsetHeight; // Trigger reflow
    expiredCountdownBar.style.animation = '';
  }

  // Reset the loading bar for fresh countdown
  loadingBar.style.display = '';
  loadingBar.style.animation = 'none';
  loadingBar.offsetHeight; // Trigger reflow
  loadingBar.style.animation = '';

  // Clear existing cards from wrapper
  const existingCards = cardsWrapper.querySelectorAll('.action-card');
  existingCards.forEach(card => card.remove());

  // Create and append new cards
  tasks.forEach((task, index) => {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.dataset.index = index;
    card.dataset.type = task.type.toLowerCase();
    if (index === tasks.length - 1) card.classList.add('last-card');

    // Check if this task type supports draft mode
    const hasDraftOption = supportsDraftMode(task.type);

    card.innerHTML = `
      <div class="action-icon" data-type="${task.type.toLowerCase()}">
        ${getIconForType(task.type)}
      </div>
      <div class="action-content">
        <div class="action-type">${task.type}</div>
        <div class="action-text">${task.text}</div>
      </div>
      <div class="action-buttons">
        ${hasDraftOption ? `
          <button class="btn-draft" title="Save as Draft">
            <svg viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
          </button>
        ` : ''}
        <button class="btn-approve" title="${hasDraftOption ? 'Send Now' : 'Approve'}">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <button class="btn-dismiss" title="Dismiss">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;

    // Draft button handler (if exists)
    const draftBtn = card.querySelector('.btn-draft');
    if (draftBtn) {
      draftBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        approveCard(card, index, 'draft');
      });
    }

    // Approve button handler (execute mode)
    card.querySelector('.btn-approve').addEventListener('click', (e) => {
      e.stopPropagation();
      approveCard(card, index, 'execute');
    });

    // Dismiss button handler
    card.querySelector('.btn-dismiss').addEventListener('click', (e) => {
      e.stopPropagation();
      dismissCard(card, index);
    });

    // Append to the cards wrapper
    cardsWrapper.appendChild(card);
  });

  // Apply initial wheel positions
  focusedIndex = 0;
  updateWheelPositions();
}

// Wheel navigation state
let focusedIndex = 0;

// Update card positions based on focused index (wheel effect)
function updateWheelPositions() {
  const cards = Array.from(cardsWrapper.querySelectorAll('.action-card:not(.approved):not(.dismissed)'));

  cards.forEach((card, i) => {
    // Remove all position classes
    card.classList.remove('focused', 'behind-1', 'behind-2', 'behind-3', 'ahead', 'selected');

    const relativePos = i - focusedIndex;

    if (relativePos === 0) {
      card.classList.add('focused', 'selected');
    } else if (relativePos === 1) {
      card.classList.add('behind-1');
    } else if (relativePos === 2) {
      card.classList.add('behind-2');
    } else if (relativePos >= 3) {
      card.classList.add('behind-3');
    } else if (relativePos < 0) {
      card.classList.add('ahead');
    }
  });

  // Update selectedCard reference for compatibility
  selectedCard = cards[focusedIndex] || null;

  // Rebuild progress bar dots for visible cards only
  progressBar.innerHTML = '';
  cards.forEach((card, i) => {
    const dot = document.createElement('div');
    dot.className = 'progress-dot';
    if (i === focusedIndex) dot.classList.add('active');

    // Click to navigate to this card
    dot.addEventListener('click', () => {
      focusedIndex = i;
      updateWheelPositions();

      // Pause timer on interaction
      if (!timerPermanentlyPaused) {
        timerPermanentlyPaused = true;
        cardsStack.classList.add('timer-paused');
      }
    });

    progressBar.appendChild(dot);
  });
  progressBar.classList.toggle('hidden', cards.length === 0);
}

// Move focus up/down in the wheel
function moveFocus(direction) {
  const cards = Array.from(cardsWrapper.querySelectorAll('.action-card:not(.approved):not(.dismissed)'));
  if (cards.length === 0) return;

  // Pause timer on interaction
  if (!timerPermanentlyPaused) {
    timerPermanentlyPaused = true;
    cardsStack.classList.add('timer-paused');
  }

  if (direction === 'up') {
    focusedIndex = Math.max(0, focusedIndex - 1);
  } else {
    focusedIndex = Math.min(cards.length - 1, focusedIndex + 1);
  }

  updateWheelPositions();
}

// Currently selected card (for keyboard navigation compatibility)
let selectedCard = null;

// Update the last-card class on the new last visible card
function updateLastCardClass() {
  // Remove last-card from all cards
  cardsWrapper.querySelectorAll('.action-card.last-card').forEach(card => {
    card.classList.remove('last-card');
  });

  // Find the new last visible card and add the class
  const visibleCards = Array.from(cardsWrapper.querySelectorAll('.action-card:not(.approved):not(.dismissed)'));
  if (visibleCards.length > 0) {
    visibleCards[visibleCards.length - 1].classList.add('last-card');
  }
}

// Select the next available card after an action
function selectNextCard() {
  const cards = Array.from(cardsWrapper.querySelectorAll('.action-card:not(.approved):not(.dismissed)'));

  if (cards.length > 0) {
    // Keep focusedIndex in bounds
    focusedIndex = Math.min(focusedIndex, cards.length - 1);
    updateWheelPositions();
  } else {
    selectedCard = null;
    // All cards processed - hide window after brief delay
    setTimeout(() => {
      if (currentState === State.CONFIRMED) {
        window.braindump.hideWindow();
      }
    }, 500);
  }
}

// Create particle burst effect at position
function createParticleBurst(x, y, type = 'poof', count = 12) {
  const container = document.createElement('div');
  container.className = 'particle-container';
  container.style.left = x + 'px';
  container.style.top = y + 'px';
  document.body.appendChild(container);

  for (let i = 0; i < count; i++) {
    const particle = document.createElement('div');
    particle.className = `particle ${type}`;

    // Random size
    const size = Math.random() * 12 + 6;
    particle.style.width = size + 'px';
    particle.style.height = size + 'px';

    // Random direction for poof
    if (type === 'poof') {
      const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
      const distance = 60 + Math.random() * 80;
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance;
      particle.style.setProperty('--tx', tx + 'px');
      particle.style.setProperty('--ty', ty + 'px');
    } else if (type === 'sparkle') {
      // Trailing sparkles for send effect
      particle.style.left = -(i * 15) + 'px';
      particle.style.top = (Math.random() - 0.5) * 30 + 'px';
      particle.style.animationDelay = (i * 0.05) + 's';
    }

    container.appendChild(particle);
  }

  // Cleanup after animation
  setTimeout(() => container.remove(), 1000);
}

// ============================================
// Apple Reminders Smart Routing
// ============================================

/**
 * Determine if a reminder should go to Apple Reminders or Gmail
 * @param {Object} task - The task object
 * @returns {'apple' | 'gmail'} - Destination
 */
function determineReminderDestination(task) {
  const text = (task.text || '').toLowerCase();
  const actionData = task.actionData || {};

  // If actionData has email-specific fields (to, subject), it's an email
  if (actionData.to || actionData.subject) {
    return 'gmail';
  }

  // Check for email keywords in the text
  const emailKeywords = ['email', 'send email', 'send an email', 'mail to', 'mail me', 'send a mail'];
  if (emailKeywords.some(kw => text.includes(kw))) {
    return 'gmail';
  }

  // Default to Apple Reminders for actual reminder tasks on macOS
  return 'apple';
}

/**
 * Execute a reminder via Apple Reminders app
 * @param {Object} task - The task object
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function executeAppleReminder(task) {
  try {
    const result = await window.braindump.executeAppleReminder({
      action: {
        title: task.text,
        due_date: task.actionData?.due_date || task.actionData?.start_time || null,
        notes: task.actionData?.body || task.actionData?.content || null,
        list: task.actionData?.list || null, // null = use system default list
      }
    });
    return result;
  } catch (error) {
    console.error('[Apple Reminders] Error:', error);
    return { success: false, error: error.message };
  }
}

// Create ghost trail effect for smooth slide
function createGhostTrail(card) {
  const rect = card.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'ghost-trail';
  ghost.style.left = rect.left + 'px';
  ghost.style.top = rect.top + 'px';
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  document.body.appendChild(ghost);

  setTimeout(() => ghost.remove(), 500);
}

// Approve a card with optional execution mode
async function approveCard(card, index, executionMode = 'execute') {
  if (!card || card.classList.contains('approved')) return;

  const task = currentTasks[index];
  const modeLabel = executionMode === 'draft' ? 'DRAFT' : 'APPROVED';
  console.log(`[${modeLabel}] Task ${index}: ${task?.text || 'unknown'}`);
  console.log(`[${modeLabel}] Task object:`, task);

  // Send node to backend to save to database
  if (task?.fullNode && task?.nodeId) {
    try {
      console.log(`[COMPLETE_NODE] Sending node ${task.nodeId} to backend...`);
      const result = await window.braindump.completeNode(task.fullNode, task.nodeId);
      console.log(`[COMPLETE_NODE] API Response:`, result);
      if (result.success) {
        console.log(`[COMPLETE_NODE] Successfully saved node ${task.nodeId}`);
      } else {
        console.error(`[COMPLETE_NODE] Failed to save node:`, result.error);
      }
    } catch (err) {
      console.error(`[COMPLETE_NODE] Error saving node:`, err);
    }
  }

  // Check if this is the last remaining card
  const remainingCards = cardsWrapper.querySelectorAll('.action-card:not(.approved):not(.dismissed)');
  const isLastCard = remainingCards.length === 1;

  // Add approved state immediately for visual feedback
  card.classList.add('approved');

  // Create and inject the checkmark element
  const checkmark = document.createElement('div');
  checkmark.className = 'approve-checkmark';
  checkmark.innerHTML = executionMode === 'draft'
    ? `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
    : `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
  card.appendChild(checkmark);

  // Execute the action (non-blocking for UI)
  const taskType = task.type.toLowerCase();

  // Handle reminder type with smart routing (Apple Reminders vs Gmail)
  if (taskType === 'reminder') {
    (async () => {
      const appleAvailable = await window.braindump.isAppleRemindersAvailable();
      const destination = appleAvailable ? determineReminderDestination(task) : 'gmail';

      if (destination === 'apple') {
        console.log('[Action] Routing reminder to Apple Reminders');
        const result = await executeAppleReminder(task);
        if (!result.success) {
          console.warn('[Apple Reminders] Failed:', result.error);
          // Fallback to Gmail/backend if Apple Reminders fails
          if (googleConnected) {
            executeActionOnBackend(task, executionMode);
          }
        } else {
          console.log('[Apple Reminders] Reminder created successfully');
        }
      } else {
        // Route to Gmail
        console.log('[Action] Routing reminder to Gmail');
        if (googleConnected) {
          executeActionOnBackend(task, executionMode);
        }
      }
    })();
  } else if (googleConnected && ['email', 'gmail', 'calendar', 'meeting', 'event'].includes(taskType)) {
    // Google-connected action types (email, calendar)
    if (['calendar', 'meeting', 'event'].includes(taskType)) {
      console.log('[Action] Routing to Google Calendar:', task.text);
    } else {
      console.log('[Action] Routing to Gmail:', task.text);
    }
    executeActionOnBackend(task, executionMode).then(result => {
      if (result.success) {
        if (['calendar', 'meeting', 'event'].includes(taskType)) {
          console.log('[Google Calendar] Event created successfully');
        }
      } else {
        console.warn('[Action] Backend execution failed, but card already approved');
      }
    });
  } else if (!googleConnected && ['calendar', 'meeting', 'event'].includes(taskType)) {
    // Calendar task but Google not connected - warn user
    console.warn('[Action] Calendar event detected but Google not connected! Connect Google to add to calendar.');
  } else if (['todo', 'task', 'note'].includes(taskType)) {
    // Local actions - store in backend if authenticated
    if (cognitoToken) {
      executeActionOnBackend(task, executionMode);
    }
  }

  // Trigger the collapse animation after checkmark pops
  setTimeout(() => {
    card.classList.add('animate-send');

    // Remove after collapse completes
    setTimeout(() => {
      card.remove();

      // If this was the last card, transition to completing state then hide
      if (isLastCard) {
        setState(State.COMPLETING);
        setTimeout(() => {
          window.braindump.hideWindow();
        }, 100);
      }
    }, 400);
  }, 150);

  // Select next card immediately (if not the last one)
  if (!isLastCard) {
    selectNextCard();
  }
}

// Dismiss a card (now with real task data)
function dismissCard(card, index) {
  if (!card || card.classList.contains('dismissed')) return;

  const task = currentTasks[index];
  console.log(`[DISMISSED] Task ${index}: ${task?.text || 'unknown'}`);

  // TODO: Send dismissal to backend if needed
  // if (task?.nodeId) { window.braindump.dismissNode(task.nodeId); }

  // Check if this is the last remaining card
  const remainingCards = cardsWrapper.querySelectorAll('.action-card:not(.approved):not(.dismissed)');
  const isLastCard = remainingCards.length === 1;

  // Get card center for particle burst
  const rect = card.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  // Create poof particles
  createParticleBurst(centerX, centerY, 'poof', 16);

  // Add classes for poof animation
  card.classList.add('dismissed', 'animate-poof');

  setTimeout(() => {
    card.remove();

    // If this was the last card, transition to completing state then hide
    if (isLastCard) {
      setState(State.COMPLETING);
      setTimeout(() => {
        window.braindump.hideWindow();
      }, 100);
    }
  }, 500);

  // Select next card immediately (if not the last one)
  if (!isLastCard) {
    selectNextCard();
  }
}

// Inline editing - double-click to edit
cardsStack.addEventListener('dblclick', (e) => {
  const textEl = e.target.closest('.action-text');
  if (!textEl) return;

  const card = textEl.closest('.action-card');
  if (card.classList.contains('approved') || card.classList.contains('editing')) return;

  card.classList.add('editing');
  const originalText = textEl.textContent;

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'inline-edit-input';
  input.value = originalText;

  textEl.textContent = '';
  textEl.appendChild(input);
  input.focus();
  input.select();

  const saveEdit = () => {
    const newText = input.value.trim() || originalText;
    textEl.textContent = newText;
    card.classList.remove('editing');

    // Update current data
    const index = parseInt(card.dataset.index);
    if (!isNaN(index)) {
      if (currentTasks[index]) {
        currentTasks[index].text = newText;
        // Also update actionData content if it exists
        if (currentTasks[index].actionData) {
          if (currentTasks[index].actionData.content !== undefined) {
            currentTasks[index].actionData.content = newText;
          }
          if (currentTasks[index].actionData.body !== undefined) {
            currentTasks[index].actionData.body = newText;
          }
        }
      }
      console.log(`[EDITED] Task ${index}: ${newText}`);
    }
  };

  input.addEventListener('blur', saveEdit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      input.value = originalText;
      input.blur();
    }
  });
});

// Hover pauses the countdown timer
cardsStack.addEventListener('mouseenter', () => {
  if (!timerPermanentlyPaused) {
    timerPermanentlyPaused = true;
    cardsStack.classList.add('timer-paused');
  }
});

// Scroll wheel navigation (velocity-aware)
let lastScrollTime = 0;

cardsStack.addEventListener('wheel', (e) => {
  if (currentState !== State.CONFIRMED) return;
  e.preventDefault();

  const now = Date.now();
  // Adjust throttle based on velocity - faster scroll = less throttle
  const velocity = Math.abs(e.deltaY);
  const throttleMs = velocity > 50 ? 80 : 150; // Faster for quick scrolls

  if (now - lastScrollTime < throttleMs) return;
  lastScrollTime = now;

  // Inverted: scroll down (positive deltaY) = go UP in the wheel
  if (e.deltaY > 0) {
    moveFocus('up');
  } else if (e.deltaY < 0) {
    moveFocus('down');
  }
}, { passive: false });

// Hover-to-scroll: auto-navigate when hovering behind-cards
let hoverScrollInterval = null;

function startHoverScroll(direction) {
  if (hoverScrollInterval) return;
  moveFocus(direction); // Immediate first move
  hoverScrollInterval = setInterval(() => moveFocus(direction), 400);
}

function stopHoverScroll() {
  if (hoverScrollInterval) {
    clearInterval(hoverScrollInterval);
    hoverScrollInterval = null;
  }
}

// Handle hover on behind-cards to auto-scroll
cardsWrapper.addEventListener('mouseover', (e) => {
  const card = e.target.closest('.action-card');
  if (!card) return;

  if (card.classList.contains('behind-1') ||
      card.classList.contains('behind-2') ||
      card.classList.contains('behind-3')) {
    startHoverScroll('down');
  } else if (card.classList.contains('ahead')) {
    startHoverScroll('up');
  } else {
    stopHoverScroll();
  }
});

cardsWrapper.addEventListener('mouseleave', stopHoverScroll);

// Stop hover scroll when leaving the stack
cardsStack.addEventListener('mouseleave', () => {
  stopHoverScroll();
});

// Click to focus a card in the wheel
cardsStack.addEventListener('click', (e) => {
  const card = e.target.closest('.action-card');
  if (card && !card.classList.contains('approved') && !card.classList.contains('dismissed')) {
    const index = parseInt(card.dataset.index);
    if (!isNaN(index)) {
      // Find this card's position in the visible cards array
      const cards = Array.from(cardsWrapper.querySelectorAll('.action-card:not(.approved):not(.dismissed)'));
      const cardPosition = cards.findIndex(c => c === card);
      if (cardPosition !== -1) {
        focusedIndex = cardPosition;
        updateWheelPositions();

        // Pause timer on interaction
        if (!timerPermanentlyPaused) {
          timerPermanentlyPaused = true;
          cardsStack.classList.add('timer-paused');
        }
      }
    }
  }
});

// Keyboard shortcuts - Arrow navigation + Enter/Delete workflow
document.addEventListener('keydown', (e) => {
  if (currentState !== State.CONFIRMED) return;

  // Don't process if editing
  const isEditing = document.querySelector('.action-card.editing');
  if (isEditing) return;

  // Arrow keys for wheel navigation (inverted to match visual stack)
  // Up goes to cards stacked behind (higher index), Down goes forward (lower index)
  if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
    e.preventDefault();
    moveFocus('down'); // Visual up = stack behind = higher index
  }

  if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
    e.preventDefault();
    moveFocus('up'); // Visual down = stack forward = lower index
  }

  // Enter to approve focused card
  if (e.key === 'Enter' && selectedCard) {
    e.preventDefault();
    const index = parseInt(selectedCard.dataset.index);
    if (!isNaN(index)) {
      approveCard(selectedCard, index, 'execute');
    }
  }

  // Delete or Backspace to dismiss focused card
  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedCard) {
    e.preventDefault();
    const index = parseInt(selectedCard.dataset.index);
    if (!isNaN(index)) {
      dismissCard(selectedCard, index);
    }
  }
});


// Handle loading bar countdown completion
// If timer completes without hover, show expiration message
loadingBar.addEventListener('animationend', () => {
  if (currentState === State.CONFIRMED && !timerPermanentlyPaused) {
    // Timer expired without user interaction
    // Remove all task cards completely and show only the expired message
    const cards = cardsWrapper.querySelectorAll('.action-card');
    cards.forEach(card => card.remove());
    loadingBar.style.display = 'none';
    expiredMessage.classList.add('visible');

    // Auto-dismiss after the countdown bar animation (3 seconds)
    expiredDismissTimeout = setTimeout(() => {
      window.braindump.hideWindow();
    }, 3000);
  }
});

// Pause expired countdown on hover
expiredMessage.addEventListener('mouseenter', () => {
  if (expiredDismissTimeout) {
    clearTimeout(expiredDismissTimeout);
    expiredDismissTimeout = null;
  }
  // Pause the CSS animation
  const countdownBar = expiredMessage.querySelector('.expired-countdown-bar');
  if (countdownBar) {
    countdownBar.style.animationPlayState = 'paused';
    countdownBar.querySelector('::after')?.style?.setProperty('animation-play-state', 'paused');
  }
  expiredMessage.classList.add('hover-paused');
});

// Open Dashboard button handler
document.getElementById('open-dashboard-btn').addEventListener('click', () => {
  // Clear any pending dismiss
  if (expiredDismissTimeout) {
    clearTimeout(expiredDismissTimeout);
    expiredDismissTimeout = null;
  }
  // Open the dashboard window and hide the overlay
  console.log('[DASHBOARD] Opening dashboard...');
  window.braindump.openDashboard();
  window.braindump.hideWindow();
});

// Update pulse ring size based on loudness (0 to 1)
function updatePulse(loudness) {
  const scale = 1 + (loudness * 1.5);
  const opacity = 0.3 + (loudness * 0.7);

  pulseRing.style.transform = `scale(${scale})`;
  pulseRing.style.opacity = opacity;

  const brainScale = 1 + (loudness * 0.08);
  brainIcon.style.transform = `scale(${brainScale})`;
}

function setState(newState, data = {}) {
  currentState = newState;
  brainContainer.className = 'brain-container ' + newState;

  // Stop audio analysis
  stopAudioAnalysis();

  switch (newState) {
    case State.IDLE:
      pulseRing.style.transform = 'scale(1)';
      pulseRing.style.opacity = '0';
      brainIcon.style.transform = 'scale(1)';
      brainContainer.classList.remove('hidden');
      cardsStack.classList.remove('visible');
      processingContainer.classList.remove('visible');
      break;

    case State.LISTENING:
      brainContainer.classList.remove('hidden');
      cardsStack.classList.remove('visible');
      processingContainer.classList.remove('visible');
      startAudioAnalysis();
      break;

    case State.PROCESSING:
      brainContainer.classList.add('hidden');
      brainIcon.style.transform = 'scale(1)';
      processingContainer.classList.add('visible');
      cardsStack.classList.remove('visible');
      break;

    case State.CONFIRMED:
      brainContainer.classList.add('hidden');
      processingContainer.classList.remove('visible');
      cardsStack.classList.add('visible');
      break;

    case State.COMPLETING:
      // Terminal state after all tasks completed - brain stays hidden
      brainContainer.classList.add('hidden');
      processingContainer.classList.remove('visible');
      cardsStack.classList.remove('visible');
      break;
  }
}

// Start real audio analysis from microphone
async function startAudioAnalysis() {
  try {
    // Get microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Create audio context at 16000Hz to match AWS Transcribe
    // Note: Some browsers may not support this and will use default sample rate
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;

    // Connect microphone to analyser
    microphone = audioContext.createMediaStreamSource(mediaStream);
    microphone.connect(analyser);

    console.log('[AUDIO] Context created at sample rate:', audioContext.sampleRate);

    // Now that audio context is ready, start streaming if transcription is active
    if (isTranscribing) {
      console.log('[AUDIO] Context ready, starting transcription stream');
      await startAudioStreaming();
    }

    // Start analyzing for pulse ring visualization
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    function analyze() {
      if (currentState !== State.LISTENING) return;

      analyser.getByteFrequencyData(dataArray);

      // Calculate average volume (RMS-like)
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const average = sum / dataArray.length;

      // Normalize to 0-1 range (255 is max value)
      // Apply scaling to make it more sensitive to quieter sounds
      const loudness = Math.min(1, (average / 30) * 1.5);

      updatePulse(loudness);
      animationFrameId = requestAnimationFrame(analyze);
    }

    analyze();
  } catch (err) {
    console.error('Error accessing microphone:', err);
    // Fallback to simulation if microphone access fails
    startLoudnessSimulation();
  }
}

// Stop audio analysis and cleanup
function stopAudioAnalysis() {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
    workletReady = false;  // Reset so worklet is re-registered with new context
  }

  analyser = null;
  microphone = null;
}

// Fallback: Simulate audio loudness with random values
function startLoudnessSimulation() {
  let phase = 0;
  function simulate() {
    if (currentState !== State.LISTENING) return;

    const base = Math.sin(phase) * 0.3 + 0.4;
    const noise = (Math.random() - 0.5) * 0.4;
    const loudness = Math.max(0, Math.min(1, base + noise));

    updatePulse(loudness);
    phase += 0.15;
    animationFrameId = requestAnimationFrame(simulate);
  }
  simulate();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processAndShowAction() {
  // Update UI immediately to look like we're processing (while still listening briefly)
  // This "shadow listening" captures the tail of speech without the user knowing
  brainContainer.classList.add('hidden');
  processingContainer.classList.add('visible');

  // Wait a moment to capture the tail of the sentence (Shadow Listening)
  // This is crucial because users often release the key slightly before they finish speaking.
  console.log('[AUDIO] Capturing tail (800ms shadow listening)...');
  await sleep(800);

  // Brief processing moment
  setState(State.PROCESSING);

  // Stop transcription gracefully
  if (isTranscribing) {
    // 1. Tell backend to finish the stream (sends end-of-stream to AWS)
    await window.braindump.transcribeFinish();
    isTranscribing = false;
    stopAudioStreaming();

    // 2. Wait for the final 'transcribe-ended' event which confirms AWS is done
    // We wrap this in a promise with a timeout just in case
    console.log('[TRANSCRIBE] Waiting for final transcript...');
    await new Promise((resolve) => {
      let resolved = false;
      const onEnded = () => {
        if (!resolved) {
          resolved = true;
          console.log('[TRANSCRIBE] Final ended event received');
          resolve();
        }
      };

      // One-time listener
      window.braindump.onTranscribeEnded(onEnded);

      // Safety timeout (e.g. 2s) so we don't hang forever if network dies
      setTimeout(() => {
        if (!resolved) {
          console.warn('[TRANSCRIBE] Timed out waiting for end event');
          resolved = true;
          resolve();
        }
      }, 2000);
    });
  }

  // Get the transcript we've collected (including any last partial that wasn't finalized)
  let transcript = transcriptBuffer.trim();
  if (lastPartialTranscript) {
    transcript = (transcript + ' ' + lastPartialTranscript).trim();
    console.log('[TRANSCRIPT] Including last partial:', lastPartialTranscript);
  }
  transcriptBuffer = '';
  lastPartialTranscript = '';

  let tasks = [];

  if (transcript) {
    console.log('[TRANSCRIPT] Collected:', transcript);
    try {
      // Send to Bedrock via backend
      const result = await window.braindump.ingestTranscript(transcript);
      console.log('[INGEST] Result:', result);

      if (result.success && result.body) {
        // Handle both array and single node responses
        let nodes = result.body.nodes;
        if (!nodes && result.body.node) {
          nodes = [result.body.node];
        }
        if (nodes && nodes.length > 0) {
          tasks = convertNodesToTasks(nodes);
          currentTasks = tasks;
        } else {
          console.warn('[INGEST] No nodes in response, using fallback');
          tasks = [{ type: 'Note', text: transcript, actionData: { content: transcript } }];
          currentTasks = tasks;
        }
      } else {
        console.warn('[INGEST] Failed or no nodes, using fallback');
        // Fallback: create a note from the transcript
        tasks = [{ type: 'Note', text: transcript, actionData: { content: transcript } }];
        currentTasks = tasks;
      }
    } catch (err) {
      console.error('[INGEST] Error:', err);
      // Fallback: create a note from the transcript
      tasks = [{ type: 'Note', text: transcript, actionData: { content: transcript } }];
      currentTasks = tasks;
    }
  } else {
    // No transcript captured - just hide the window
    console.log('[TRANSCRIPT] No transcript captured, hiding window');
    window.braindump.hideWindow();
    return;
  }

  // Render and show cards
  renderCards(tasks);
  setState(State.CONFIRMED);
}

// Initialize Google status check on app load (when authenticated)
function initializeApp() {
  // Check local storage for Google connection (for local testing)
  if (localStorage.getItem('google_connected') === 'true') {
    googleConnected = true;
    updateGoogleStatusUI();
    console.log('[Google] Restored connection from local storage');
  }

  // Check Google connection status from backend if we have a Cognito token
  if (cognitoToken) {
    checkGoogleStatus();
  }

  // Set up Google connect button click handler
  const googleBtn = document.getElementById('google-connect-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      if (googleConnected) {
        disconnectGoogle();
      } else {
        connectGoogle();
      }
    });
  }
}

// Call initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}

// Track if modifier keys are still held
document.addEventListener('keyup', (e) => {
  if (e.key === 'Alt' || e.key === 'Shift' || e.key === ' ') {
    if (keysHeld) {
      keysHeld = false;
      window.braindump.keysReleased();
    }
  }
});

// Check keys when main process asks
window.braindump.onCheckKeys(() => {
  // Handled by blur event in main process as backup
});

// Handle transcript events from AWS Transcribe
window.braindump.onTranscript((payload) => {
  if (payload && payload.text) {
    if (payload.partial) {
      // Track the latest partial (not yet finalized)
      lastPartialTranscript = payload.text;
    } else {
      // Finalized transcript - add to buffer and clear partial
      transcriptBuffer += ' ' + payload.text;
      lastPartialTranscript = '';  // Clear since this was finalized
      console.log('[TRANSCRIPT] Final:', payload.text);
    }
  }
});

window.braindump.onTranscribeReady(async () => {
  console.log('[TRANSCRIBE] Stream ready, starting audio capture');
  await startAudioStreaming();
});

window.braindump.onTranscribeError((err) => {
  console.error('[TRANSCRIBE] Error:', err);
  isTranscribing = false;
  stopAudioStreaming();
});

window.braindump.onTranscribeEnded(() => {
  console.log('[TRANSCRIBE] Session ended');
  isTranscribing = false;
  stopAudioStreaming();
});

// Start streaming audio to main process for transcription using AudioWorklet
async function startAudioStreaming() {
  if (audioWorkletNode) return;
  if (!audioContext || !microphone) {
    console.warn('[AUDIO] Cannot start streaming - no audio context or microphone');
    return;
  }

  try {
    // Register the AudioWorklet module if not already done
    if (!workletReady) {
      console.log('[AUDIO] Registering AudioWorklet module...');
      await audioContext.audioWorklet.addModule('./audio-processor.js');
      workletReady = true;
      console.log('[AUDIO] AudioWorklet module registered');
    }

    // Create AudioWorkletNode
    audioWorkletNode = new AudioWorkletNode(audioContext, 'audio-stream-processor');

    // Calculate optimal buffer size based on sample rate
    // We want ~256ms chunks for AWS Transcribe
    const targetChunkMs = 256;
    const bufferSize = Math.floor(audioContext.sampleRate * (targetChunkMs / 1000));
    audioWorkletNode.port.postMessage({ type: 'setBufferSize', size: bufferSize });

    // Handle messages from the worklet
    audioWorkletNode.port.onmessage = (event) => {
      if (event.data.type === 'audio' && isTranscribing) {
        // The worklet sends Int16 PCM data, forward to main process
        window.braindump.sendAudioChunk(event.data.buffer);
      }
    };

    // Connect microphone -> worklet
    // Note: AudioWorklet doesn't need to connect to destination to stay alive
    microphone.connect(audioWorkletNode);

    console.log('[AUDIO] AudioWorklet streaming started at', audioContext.sampleRate, 'Hz');
  } catch (err) {
    console.error('[AUDIO] Failed to start AudioWorklet:', err);
    // Fallback: try the old ScriptProcessorNode (may still crash on some systems)
    startAudioStreamingFallback();
  }
}

// Fallback using ScriptProcessorNode (deprecated, may cause issues)
function startAudioStreamingFallback() {
  if (audioStreamProcessor) return;
  console.warn('[AUDIO] Using fallback ScriptProcessorNode (deprecated)');

  audioStreamProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  audioStreamProcessor.onaudioprocess = (e) => {
    if (!isTranscribing) return;

    const pcmFloat = e.inputBuffer.getChannelData(0);
    const int16 = new Int16Array(pcmFloat.length);
    for (let i = 0; i < pcmFloat.length; i++) {
      int16[i] = Math.max(-32768, Math.min(32767, Math.floor(pcmFloat[i] * 32768)));
    }
    window.braindump.sendAudioChunk(int16.buffer);
  };

  microphone.connect(audioStreamProcessor);
  audioStreamProcessor.connect(audioContext.destination);
  console.log('[AUDIO] Fallback streaming started at', audioContext.sampleRate, 'Hz');
}

function stopAudioStreaming() {
  // Stop AudioWorklet
  if (audioWorkletNode) {
    audioWorkletNode.port.postMessage({ type: 'stop' });
    audioWorkletNode.disconnect();
    audioWorkletNode = null;
    console.log('[AUDIO] AudioWorklet streaming stopped');
  }

  // Stop fallback ScriptProcessorNode if active
  if (audioStreamProcessor) {
    audioStreamProcessor.disconnect();
    audioStreamProcessor = null;
    console.log('[AUDIO] Fallback streaming stopped');
  }
}

// Start listening when window shows
window.braindump.onStartListening(async () => {
  keysHeld = true;
  transcriptBuffer = '';
  setState(State.LISTENING);  // This starts audio analysis which will start streaming when ready

  // Start transcription session (audio streaming starts from startAudioAnalysis after context is ready)
  try {
    const result = await window.braindump.transcribeStart();
    if (result.started) {
      isTranscribing = true;
      console.log('[TRANSCRIBE] Session started, waiting for audio context...');
      // Note: startAudioStreaming() is called from startAudioAnalysis() after audioContext is ready
    } else {
      console.warn('[TRANSCRIBE] Failed to start:', result.error);
    }
  } catch (err) {
    console.error('[TRANSCRIBE] Start error:', err);
  }
});

// Stop listening and show action
window.braindump.onStopListening(() => {
  if (currentState === State.LISTENING) {
    processAndShowAction();
  }
});

// Window hidden - reset state (but not if completing tasks)
window.braindump.onWindowHidden(() => {
  // Only reset to IDLE if we weren't completing tasks
  // This prevents the brain from flashing when tasks finish
  if (currentState !== State.COMPLETING) {
    setState(State.IDLE);
  } else {
    // Reset for next session, but keep brain hidden for now
    currentState = State.IDLE;
  }
});

// Escape to cancel
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    keysHeld = false;
    window.braindump.hideWindow();
  }
});

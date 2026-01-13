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
const loadingBar = document.querySelector('.loading-bar');
const expiredMessage = document.getElementById('expired-message');

// Timer state
let timerPermanentlyPaused = false;

// Google connection state
let googleConnected = false;
let cognitoToken = null; // TODO: Implement Cognito auth flow to get this token

// Current tasks being displayed (replaces direct MOCK_TASKS reference)
let currentTasks = [];

// Mock Data for Stacked UI (fallback when not connected to backend)
// Each task should have: type, text, and actionData for execution
const MOCK_TASKS = [
  {
    type: 'Reminder',
    text: "Email Sarah tomorrow about the project update",
    actionData: {
      to: "sarah@example.com",
      subject: "Project Update",
      body: "Hi Sarah,\n\nJust a reminder about the project update.\n\nBest regards"
    }
  },
  {
    type: 'Calendar',
    text: "Meeting with Design Team at 2:00 PM",
    actionData: {
      title: "Meeting with Design Team",
      start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      description: "Weekly design sync",
      attendees: []
    }
  },
  {
    type: 'Todo',
    text: "Research competitors for new feature",
    actionData: {
      content: "Research competitors for new feature"
    }
  }
];

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

// Helper: Check if a task type supports draft mode (email/reminder types)
function supportsDraftMode(type) {
  const lowerType = type.toLowerCase();
  return ['email', 'reminder', 'gmail'].includes(lowerType);
}

// Helper: Render cards from tasks array
function renderCards(tasks) {
  // Store tasks for reference in approve/dismiss handlers
  currentTasks = tasks;

  // Reset timer state for fresh card set
  timerPermanentlyPaused = false;
  cardsStack.classList.remove('timer-paused');
  expiredMessage.classList.remove('visible');

  // Clear existing cards (keep loading bar)
  const existingCards = cardsStack.querySelectorAll('.action-card');
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

    // Insert before loading bar
    cardsStack.insertBefore(card, loadingBar);
  });

  // Auto-select first card for keyboard navigation
  const firstCard = cardsStack.querySelector('.action-card');
  if (firstCard) {
    setTimeout(() => selectCard(firstCard), 50);
  }
}

// Currently selected card (for keyboard navigation)
let selectedCard = null;

// Select a specific card
function selectCard(card) {
  // Remove selection from previous
  if (selectedCard) selectedCard.classList.remove('selected');
  
  selectedCard = card;
  if (card) {
    card.classList.add('selected');
  }
}

// Update the last-card class on the new last visible card
function updateLastCardClass() {
  // Remove last-card from all cards
  cardsStack.querySelectorAll('.action-card.last-card').forEach(card => {
    card.classList.remove('last-card');
  });
  
  // Find the new last visible card and add the class
  const visibleCards = Array.from(cardsStack.querySelectorAll('.action-card:not(.approved):not(.dismissed)'));
  if (visibleCards.length > 0) {
    visibleCards[visibleCards.length - 1].classList.add('last-card');
  }
}

// Select the next available card after an action
function selectNextCard() {
  // Update last-card class for proper margin handling
  updateLastCardClass();
  
  const cards = Array.from(cardsStack.querySelectorAll('.action-card:not(.approved):not(.dismissed)'));
  if (cards.length > 0) {
    selectCard(cards[0]);
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
  console.log(`[${modeLabel}] Task ${index}: ${task.text}`);

  // Check if this is the last remaining card
  const remainingCards = cardsStack.querySelectorAll('.action-card:not(.approved):not(.dismissed)');
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

  // Execute the action on the backend (non-blocking for UI)
  // Only execute for Google-connected action types (email, calendar)
  const taskType = task.type.toLowerCase();
  if (googleConnected && ['email', 'reminder', 'gmail', 'calendar', 'meeting', 'event'].includes(taskType)) {
    executeActionOnBackend(task, executionMode).then(result => {
      if (!result.success) {
        console.warn('[Action] Backend execution failed, but card already approved');
      }
    });
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

// Dismiss a card
function dismissCard(card, index) {
  if (!card || card.classList.contains('dismissed')) return;

  const task = currentTasks[index];
  console.log(`[DISMISSED] Task ${index}: ${task.text}`);
  
  // Check if this is the last remaining card
  const remainingCards = cardsStack.querySelectorAll('.action-card:not(.approved):not(.dismissed)');
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

    // Update current tasks data
    const index = parseInt(card.dataset.index);
    if (!isNaN(index) && currentTasks[index]) {
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

// Hover to select a card (for Enter/Delete workflow)
// Also permanently pauses the countdown timer
cardsStack.addEventListener('mouseenter', (e) => {
  // Permanently pause timer on any hover
  if (!timerPermanentlyPaused) {
    timerPermanentlyPaused = true;
    cardsStack.classList.add('timer-paused');
  }
  
  const card = e.target.closest('.action-card');
  if (card && !card.classList.contains('approved') && !card.classList.contains('dismissed')) {
    selectCard(card);
  }
}, true);

// Reset to first card when hover leaves the stack
cardsStack.addEventListener('mouseleave', () => {
  const firstCard = cardsStack.querySelector('.action-card:not(.approved):not(.dismissed)');
  if (firstCard) {
    selectCard(firstCard);
  }
});

// Click to select a card
cardsStack.addEventListener('click', (e) => {
  const card = e.target.closest('.action-card');
  if (card && !card.classList.contains('approved') && !card.classList.contains('dismissed')) {
    selectCard(card);
  }
});

// Keyboard shortcuts - Enter, Enter, Enter workflow
document.addEventListener('keydown', (e) => {
  if (currentState !== State.CONFIRMED) return;
  
  // Don't process if editing
  const isEditing = document.querySelector('.action-card.editing');
  if (isEditing) return;
  
  // Any keyboard interaction pauses the timer (user is engaging)
  if ((e.key === 'Enter' || e.key === 'Delete' || e.key === 'Backspace') && selectedCard) {
    if (!timerPermanentlyPaused) {
      timerPermanentlyPaused = true;
      cardsStack.classList.add('timer-paused');
    }
  }
  
  // Enter to approve selected card (execute mode)
  if (e.key === 'Enter' && selectedCard) {
    e.preventDefault();
    const index = parseInt(selectedCard.dataset.index);
    if (!isNaN(index)) {
      approveCard(selectedCard, index, 'execute');
    }
  }
  
  // Delete or Backspace to dismiss selected card
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
    // Timer expired without user interaction - show expiration message
    // Hide all cards and show the expired message
    const cards = cardsStack.querySelectorAll('.action-card');
    cards.forEach(card => {
      card.style.opacity = '0.4';
      card.style.pointerEvents = 'none';
    });
    loadingBar.style.display = 'none';
    expiredMessage.classList.add('visible');
  }
});

// Open Dashboard button handler
document.getElementById('open-dashboard-btn').addEventListener('click', () => {
  // Placeholder: Could open a dashboard URL or trigger IPC to main process
  console.log('[DASHBOARD] Opening dashboard...');
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
      break;
      
    case State.LISTENING:
      brainContainer.classList.remove('hidden');
      cardsStack.classList.remove('visible');
      startAudioAnalysis();
      break;
      
    case State.PROCESSING:
      brainContainer.classList.add('hidden');
      brainIcon.style.transform = 'scale(1)';
      break;
      
    case State.CONFIRMED:
      brainContainer.classList.add('hidden');
      cardsStack.classList.add('visible');
      break;
      
    case State.COMPLETING:
      // Terminal state after all tasks completed - brain stays hidden
      brainContainer.classList.add('hidden');
      cardsStack.classList.remove('visible');
      break;
  }
}

// Start real audio analysis from microphone
async function startAudioAnalysis() {
  try {
    // Get microphone access
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Create audio context and analyser
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.3;
    
    // Connect microphone to analyser
    microphone = audioContext.createMediaStreamSource(mediaStream);
    microphone.connect(analyser);
    
    // Start analyzing
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
  // Brief processing moment
  setState(State.PROCESSING);
  await sleep(300);

  // TODO: In production, fetch real tasks from backend after voice processing
  // For now, use mock tasks as fallback
  // const tasks = await fetchTasksFromBackend();
  const tasks = MOCK_TASKS;

  if (tasks.length === 0) {
    // No tasks to show - hide window
    window.braindump.hideWindow();
    return;
  }

  // Generate and render cards before showing
  renderCards(tasks);

  // Show the card stack
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

// Start listening when window shows
window.braindump.onStartListening(() => {
  keysHeld = true;
  setState(State.LISTENING);
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

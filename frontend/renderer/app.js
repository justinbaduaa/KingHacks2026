// BrainDump - Minimal Brain with Loudness-Based Pulse + Action Cards

const State = { IDLE: 'idle', LISTENING: 'listening', PROCESSING: 'processing', CONFIRMED: 'confirmed', COMPLETING: 'completing' };
let currentState = State.IDLE;
let keysHeld = false;

let transcriptionActive = false;
const audioCapture = window.BrainAudioCapture;

// Elements
const brainContainer = document.getElementById('brain-container');
const pulseRing = document.getElementById('pulse-ring');
const brainIcon = document.getElementById('brain-icon');
const cardsStack = document.getElementById('cards-stack');
const loadingBar = document.querySelector('.loading-bar');
const expiredMessage = document.getElementById('expired-message');
const testApiBtn = document.getElementById('test-api-btn');
const testResults = document.getElementById('test-results');
const testResultsContent = document.getElementById('test-results-content');
const testResultsClose = document.getElementById('test-results-close');

// Timer state
let timerPermanentlyPaused = false;

async function ensureAuthenticated() {
  if (!window.braindump?.authStatus || !window.braindump?.authLogin) {
    return;
  }
  const status = await window.braindump.authStatus();
  if (!status?.authenticated) {
    await window.braindump.authLogin();
  }
}

// Mock Data for Stacked UI
const MOCK_TASKS = [
  { type: 'Reminder', text: "Email Sarah tomorrow about the project update" },
  { type: 'Calendar', text: "Meeting with Design Team at 2:00 PM" },
  { type: 'Todo', text: "Research competitors for new feature" }
];

const MOCK_TRANSCRIPT =
  "Remind me to email Sarah tomorrow morning about the project update, " +
  "schedule a meeting with the design team next Tuesday afternoon, " +
  "and add a task to review competitor pricing by Friday.";

function nodeToTask(node, fallbackText = '') {
  if (!node || typeof node !== 'object') {
    return { type: 'Note', text: fallbackText || 'Captured item' };
  }

  const typeMap = {
    reminder: 'Reminder',
    todo: 'Todo',
    note: 'Note',
    calendar_placeholder: 'Calendar'
  };

  let text = fallbackText || node.title || node.body || '';

  switch (node.node_type) {
    case 'reminder':
      text = node.reminder?.reminder_text || node.title || node.body || fallbackText;
      break;
    case 'todo':
      text = node.todo?.task || node.title || node.body || fallbackText;
      break;
    case 'note':
      text = node.note?.content || node.title || node.body || fallbackText;
      break;
    case 'calendar_placeholder':
      text = node.calendar_placeholder?.event_title ||
        node.calendar_placeholder?.intent ||
        node.title ||
        node.body ||
        fallbackText;
      break;
  }

  return {
    type: typeMap[node.node_type] || 'Note',
    text: text || 'Captured item'
  };
}

async function fetchMockTasksFromApi() {
  if (!window.braindump?.ingestTranscript) {
    return null;
  }

  const userTimeIso = new Date().toISOString();
  const transcript = MOCK_TRANSCRIPT;

  try {
    const result = await window.braindump.ingestTranscript(transcript, userTimeIso);
    if (result?.success && result?.statusCode === 200) {
      const nodes = result?.body?.nodes || (result?.body?.node ? [result.body.node] : []);
      if (nodes.length > 0) {
        return nodes.map((node) => nodeToTask(node, transcript));
      }
    }
    console.warn('Ingest failed, falling back to mock tasks:', result);
  } catch (err) {
    console.warn('Ingest error, falling back to mock tasks:', err);
  }

  return null;
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

// Helper: Render mock cards
function renderCards(tasks) {
  // Reset timer state for fresh card set
  timerPermanentlyPaused = false;
  cardsStack.classList.remove('timer-paused');
  expiredMessage.classList.remove('visible');
  
  // Clear existing cards (keep loading bar)
  const existingCards = cardsStack.querySelectorAll('.action-card');
  existingCards.forEach(card => card.remove());
  
  // Create and append new cards (reverse order so first item is on top in DOM)
  // Actually, standard stacking context means last in DOM is on top,
  // BUT we want visual order 1st item = top.
  // CSS :nth-child(1) is top card.
  // So we just append them in order.
  
  tasks.forEach((task, index) => {
    const card = document.createElement('div');
    card.className = 'action-card';
    card.dataset.index = index;
    card.dataset.type = task.type.toLowerCase();
    if (index === tasks.length - 1) card.classList.add('last-card');
    card.innerHTML = `
      <div class="action-icon" data-type="${task.type.toLowerCase()}">
        ${getIconForType(task.type)}
      </div>
      <div class="action-content">
        <div class="action-type">${task.type}</div>
        <div class="action-text">${task.text}</div>
      </div>
      <div class="action-buttons">
        <button class="btn-approve" title="Approve">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        </button>
        <button class="btn-dismiss" title="Dismiss">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    `;
    
    // Approve button handler
    card.querySelector('.btn-approve').addEventListener('click', (e) => {
      e.stopPropagation();
      approveCard(card, index);
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

// Approve a card (hardcoded action)
function approveCard(card, index) {
  if (!card || card.classList.contains('approved')) return;
  
  console.log(`[APPROVED] Task ${index}: ${MOCK_TASKS[index].text}`);
  
  // Check if this is the last remaining card
  const remainingCards = cardsStack.querySelectorAll('.action-card:not(.approved):not(.dismissed)');
  const isLastCard = remainingCards.length === 1;
  
  // Add approved state
  card.classList.add('approved');
  
  // Create and inject the checkmark element
  const checkmark = document.createElement('div');
  checkmark.className = 'approve-checkmark';
  checkmark.innerHTML = `<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`;
  card.appendChild(checkmark);
  
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
  
  console.log(`[DISMISSED] Task ${index}: ${MOCK_TASKS[index].text}`);
  
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
    
    // Update mock data
    const index = parseInt(card.dataset.index);
    if (!isNaN(index)) {
      MOCK_TASKS[index].text = newText;
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
  
  // Enter to approve selected card
  if (e.key === 'Enter' && selectedCard) {
    e.preventDefault();
    const index = parseInt(selectedCard.dataset.index);
    if (!isNaN(index)) {
      approveCard(selectedCard, index);
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
  // TRANSCRIPTION CODE COMMENTED OUT
  // stopTranscriptionStream();
  
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
      // TRANSCRIPTION CODE COMMENTED OUT
      // startTranscriptionStream();
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
  if (!audioCapture?.start) {
    console.warn("Audio capture module missing.");
    return;
  }
  await audioCapture.start({
    onLoudness: updatePulse,
    // TRANSCRIPTION CODE COMMENTED OUT
    // onAudioChunk: handleAudioChunk,
  });
}

// Stop audio analysis and cleanup
function stopAudioAnalysis() {
  audioCapture?.stop?.();
}

// TRANSCRIPTION CODE COMMENTED OUT
function startTranscriptionStream() {
  // Transcription disabled
  transcriptionActive = false;
  // if (transcriptionActive || !window.braindump?.startTranscription) {
  //   return;
  // }
  // window.braindump
  //   .startTranscription()
  //   .then((result) => {
  //     if (result?.started) {
  //       transcriptionActive = true;
  //     } else {
  //       console.error("Failed to start transcription:", result?.error || "unknown_error");
  //     }
  //   })
  //   .catch((err) => {
  //     console.error("Failed to start transcription:", err);
  //     transcriptionActive = false;
  //   });
}

function stopTranscriptionStream() {
  // Transcription disabled
  transcriptionActive = false;
  // if (!transcriptionActive || !window.braindump?.stopTranscription) {
  //   return;
  // }
  // transcriptionActive = false;
  // window.braindump.stopTranscription().catch((err) => {
  //   console.error("Failed to stop transcription:", err);
  // });
}

function handleAudioChunk(pcm) {
  // Transcription disabled - audio chunks ignored
  return;
  // if (!transcriptionActive || !window.braindump?.sendAudioChunk) {
  //   return;
  // }
  // window.braindump.sendAudioChunk(pcm);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processAndShowAction() {
  // Brief processing moment
  setState(State.PROCESSING);
  await sleep(300);

  let tasks = MOCK_TASKS;

  try {
    await ensureAuthenticated();
    const apiTasks = await fetchMockTasksFromApi();
    if (apiTasks && apiTasks.length > 0) {
      tasks = apiTasks;
    }
  } catch (err) {
    console.warn('Failed to fetch ingest tasks, using mock tasks:', err);
  }
  
  // Generate and render cards before showing
  renderCards(tasks);
  
  // Show the card stack
  setState(State.CONFIRMED);
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

// Test API functionality
async function testAPIs() {
  if (!window.braindump?.testWhoami || !window.braindump?.testIngest) {
    showTestResult('error', 'API test functions not available');
    return;
  }

  testApiBtn.classList.add('loading');
  testResultsContent.innerHTML = '';

  try {
    // Test WhoAmI
    showTestResult('info', 'Testing WhoAmI API...');
    const whoamiResult = await window.braindump.testWhoami();
    
    if (whoamiResult.success && whoamiResult.statusCode === 200) {
      showTestResult('success', 'WhoAmI', JSON.stringify(whoamiResult.body, null, 2));
    } else {
      showTestResult('error', 'WhoAmI Failed', 
        `Status: ${whoamiResult.statusCode || 'N/A'}\n` +
        `Error: ${whoamiResult.error || JSON.stringify(whoamiResult.body, null, 2)}`
      );
    }

    // Test Ingest
    showTestResult('info', 'Testing Ingest API...');
    const ingestResult = await window.braindump.testIngest('Remind me to call Sarah tomorrow at 3pm');
    
    if (ingestResult.success && ingestResult.statusCode === 200) {
      showTestResult('success', 'Ingest', JSON.stringify(ingestResult.body, null, 2));
    } else {
      showTestResult('error', 'Ingest Failed',
        `Status: ${ingestResult.statusCode || 'N/A'}\n` +
        `Error: ${ingestResult.error || JSON.stringify(ingestResult.body, null, 2)}`
      );
    }
  } catch (err) {
    showTestResult('error', 'Test Error', err.message);
  } finally {
    testApiBtn.classList.remove('loading');
    testResults.classList.add('visible');
  }
}

function showTestResult(type, label, content = '') {
  const item = document.createElement('div');
  item.className = `test-result-item ${type}`;
  
  const labelEl = document.createElement('div');
  labelEl.className = 'test-result-label';
  labelEl.textContent = label;
  item.appendChild(labelEl);
  
  if (content) {
    const contentEl = document.createElement('div');
    contentEl.className = 'test-result-content';
    contentEl.textContent = content;
    item.appendChild(contentEl);
  }
  
  testResultsContent.appendChild(item);
  testResultsContent.scrollTop = testResultsContent.scrollHeight;
}

// Test API button click handler
testApiBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  testAPIs();
});

// Close test results
testResultsClose.addEventListener('click', () => {
  testResults.classList.remove('visible');
});

// Close on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && testResults.classList.contains('visible')) {
    testResults.classList.remove('visible');
  }
});

ensureAuthenticated().catch((err) => {
  console.warn('Auth flow failed to start:', err);
});

// BrainDump - Minimal Brain with Loudness-Based Pulse

const State = { IDLE: 'idle', LISTENING: 'listening', PROCESSING: 'processing', CONFIRMED: 'confirmed' };
let currentState = State.IDLE;
let simulationInterval = null;
let keysHeld = false;

const brainContainer = document.getElementById('brain-container');
const pulseRing = document.getElementById('pulse-ring');
const brainIcon = document.getElementById('brain-icon');

// Update pulse ring size based on loudness (0 to 1)
function updatePulse(loudness) {
  // Scale: 1.0 (no sound) to 2.5 (max loudness)
  const scale = 1 + (loudness * 1.5);
  // Opacity: 0.3 (quiet) to 1 (loud)
  const opacity = 0.3 + (loudness * 0.7);
  
  pulseRing.style.transform = `scale(${scale})`;
  pulseRing.style.opacity = opacity;
  
  // Subtle brain breathing - slight scale
  const brainScale = 1 + (loudness * 0.08);
  brainIcon.style.transform = `scale(${brainScale})`;
}

function setState(newState, data = {}) {
  currentState = newState;
  brainContainer.className = 'brain-container ' + newState;
  
  // Clear any simulation
  if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  
  switch (newState) {
    case State.IDLE:
      pulseRing.style.transform = 'scale(1)';
      pulseRing.style.opacity = '0';
      brainIcon.style.transform = 'scale(1)';
      break;
      
    case State.LISTENING:
      // Simulate varying loudness for now (will be replaced with real audio levels)
      startLoudnessSimulation();
      break;
      
    case State.PROCESSING:
      // CSS handles the animation
      brainIcon.style.transform = 'scale(1)';
      break;
      
    case State.CONFIRMED:
      // Quick confirmation then dismiss
      brainIcon.style.transform = 'scale(1)';
      break;
  }
}

// Simulate audio loudness with random values (until real audio integration)
function startLoudnessSimulation() {
  let phase = 0;
  simulationInterval = setInterval(() => {
    // Generate natural-looking loudness variations
    const base = Math.sin(phase) * 0.3 + 0.4;
    const noise = (Math.random() - 0.5) * 0.4;
    const loudness = Math.max(0, Math.min(1, base + noise));
    
    updatePulse(loudness);
    phase += 0.15;
  }, 50);
}

function classifyIntent(transcript) {
  const text = transcript.toLowerCase();
  if (text.includes('remind')) return '✓ Reminder';
  if (text.includes('email')) return '✓ Email';
  if (text.includes('schedule') || text.includes('meeting')) return '✓ Scheduled';
  if (text.includes('task') || text.includes('todo')) return '✓ Task';
  return '✓ Saved';
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function processAndDismiss() {
  setState(State.PROCESSING);
  
  const transcript = await window.braindump.simulateVoice();
  await sleep(300);
  
  setState(State.CONFIRMED);
  await sleep(800);
  
  window.braindump.hideWindow();
}

// Track if modifier keys are still held - any of the keys releasing triggers stop
document.addEventListener('keyup', (e) => {
  // Alt = Option on Mac, Shift, or Space released
  if (e.key === 'Alt' || e.key === 'Shift' || e.key === ' ') {
    if (keysHeld) {
      keysHeld = false;
      window.braindump.keysReleased();
    }
  }
});

// Check keys when main process asks - poll-based fallback
window.braindump.onCheckKeys(() => {
  // The window may lose focus, check if keys are no longer held
  // This is handled by blur event in main process as backup
});

// Start listening when window shows
window.braindump.onStartListening(() => {
  keysHeld = true;
  setState(State.LISTENING);
});

// Stop listening and process
window.braindump.onStopListening(() => {
  if (currentState === State.LISTENING) {
    processAndDismiss();
  }
});

// Escape to cancel
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    keysHeld = false;
    window.braindump.hideWindow();
  }
});

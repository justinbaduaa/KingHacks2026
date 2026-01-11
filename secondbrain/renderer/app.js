// BrainDump - Push-to-Talk Style

const State = { LISTENING: 'listening', PROCESSING: 'processing', CONFIRMED: 'confirmed' };
let currentState = State.LISTENING;
let keysHeld = false;

const pillContainer = document.getElementById('pill-container');
const waveform = document.getElementById('waveform');
const statusText = document.getElementById('status-text');

function classifyIntent(transcript) {
  const text = transcript.toLowerCase();
  if (text.includes('remind')) return '✓ Reminder';
  if (text.includes('email')) return '✓ Email';
  if (text.includes('schedule') || text.includes('meeting')) return '✓ Scheduled';
  if (text.includes('task') || text.includes('todo')) return '✓ Task';
  return '✓ Saved';
}

function setState(newState, data = {}) {
  currentState = newState;
  waveform.classList.remove('listening', 'processing', 'hidden');
  statusText.classList.remove('hidden');
  pillContainer.classList.remove('confirmed');
  
  switch (newState) {
    case State.LISTENING:
      waveform.classList.add('listening');
      statusText.classList.add('hidden');
      break;
    case State.PROCESSING:
      waveform.classList.add('processing');
      statusText.classList.add('hidden');
      break;
    case State.CONFIRMED:
      waveform.classList.add('hidden');
      statusText.textContent = data.message || '✓ Saved';
      pillContainer.classList.add('confirmed');
      break;
  }
}

async function processAndDismiss() {
  setState(State.PROCESSING);
  
  const transcript = await window.braindump.simulateVoice();
  await sleep(300);
  
  setState(State.CONFIRMED, { message: classifyIntent(transcript) });
  await sleep(800);
  
  window.braindump.hideWindow();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Track if modifier keys are still held
document.addEventListener('keyup', (e) => {
  // Check if Ctrl, Shift, or Space was released
  if (e.key === 'Control' || e.key === 'Shift' || e.key === ' ') {
    if (keysHeld) {
      keysHeld = false;
      window.braindump.keysReleased();
    }
  }
});

// Check keys when main process asks
window.braindump.onCheckKeys(() => {
  // If we receive this and keys aren't detected as held, they were released
  // This is a fallback - keyup should catch it first
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

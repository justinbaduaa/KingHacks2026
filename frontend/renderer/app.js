// BrainDump - Minimal Brain with Loudness-Based Pulse + Action Cards

const State = { IDLE: 'idle', LISTENING: 'listening', PROCESSING: 'processing', CONFIRMED: 'confirmed' };
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
const actionCard = document.getElementById('action-card');
const actionText = document.getElementById('action-text');
const loadingBar = document.querySelector('.loading-bar');

// Hardcoded reminder for demo
const DEMO_REMINDER = "Email Sarah tomorrow about the project update";

// Auto-dismiss when loading bar animation finishes
// Note: Animation is paused by CSS hover state, so this naturally handles the "hover to stay" feature
loadingBar.addEventListener('animationend', () => {
  if (currentState === State.CONFIRMED) {
    window.braindump.hideWindow();
  }
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
      actionCard.classList.remove('visible');
      break;
      
    case State.LISTENING:
      brainContainer.classList.remove('hidden');
      actionCard.classList.remove('visible');
      startAudioAnalysis();
      break;
      
    case State.PROCESSING:
      brainContainer.classList.add('hidden');
      brainIcon.style.transform = 'scale(1)';
      break;
      
    case State.CONFIRMED:
      brainContainer.classList.add('hidden');
      actionText.textContent = data.text || DEMO_REMINDER;
      actionCard.classList.add('visible');
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
  
  // Show the action card with hardcoded reminder
  setState(State.CONFIRMED, { text: DEMO_REMINDER });
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

// Window hidden - reset state
window.braindump.onWindowHidden(() => {
  setState(State.IDLE);
});

// Escape to cancel
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    keysHeld = false;
    window.braindump.hideWindow();
  }
});

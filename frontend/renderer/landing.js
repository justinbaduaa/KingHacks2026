/**
 * Landing Page - Entry point for SecondBrain
 * Handles the brain click interaction and transition to dashboard
 */

// State
let isTransitioning = false;

// Elements
const brainButton = document.getElementById('brain-button');
const rippleLayer = document.getElementById('ripple-layer');
const ripple = document.getElementById('ripple');
const centerContent = document.querySelector('.center-content');

/**
 * Trigger the transition to dashboard
 */
function triggerTransition() {
  if (isTransitioning) return;
  isTransitioning = true;
  
  // Disable further interactions
  brainButton.classList.add('disabled');
  brainButton.classList.add('pressed');
  
  // Brief press feedback
  setTimeout(() => {
    brainButton.classList.remove('pressed');
    
    // Start ripple animation
    startRippleAnimation();
  }, 100);
}

/**
 * Start the ripple expansion animation
 */
function startRippleAnimation() {
  // Get brain center position for ripple origin
  const brainRect = brainButton.getBoundingClientRect();
  const centerX = brainRect.left + brainRect.width / 2;
  const centerY = brainRect.top + brainRect.height / 2;
  
  // Position ripple at brain center
  ripple.style.left = `${centerX}px`;
  ripple.style.top = `${centerY}px`;
  
  // Show ripple layer and start animation
  rippleLayer.classList.add('active');
  ripple.classList.add('expanding');
  
  // Fade out center content
  centerContent.classList.add('fading');
  
  // Navigate to dashboard after animation completes
  const transitionDuration = prefersReducedMotion() ? 400 : 900;
  
  setTimeout(() => {
    navigateToDashboard();
  }, transitionDuration);
}

/**
 * Navigate to the dashboard
 */
function navigateToDashboard() {
  // Mark body as transition complete for clean state
  document.body.classList.add('transition-complete');
  
  // Small delay for the final fade, then navigate
  setTimeout(() => {
    // Use Electron IPC to navigate
    if (window.braindump?.navigateToDashboard) {
      window.braindump.navigateToDashboard();
    } else {
      // Fallback: direct navigation for non-Electron or testing
      window.location.href = 'dashboard.html';
    }
  }, 100);
}

/**
 * Check if user prefers reduced motion
 */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Handle keyboard interaction
 */
function handleKeydown(event) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    triggerTransition();
  }
}

// Event Listeners
brainButton.addEventListener('click', triggerTransition);
brainButton.addEventListener('keydown', handleKeydown);

// Leave focus unset on load to avoid visual rings in the hero.

// Prevent context menu on the page
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
});

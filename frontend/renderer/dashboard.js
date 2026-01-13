// SecondBrain Dashboard - Premium MVP

// ===== Mock Data =====

const MOCK_TASKS = [
  {
    id: 1,
    type: 'email',
    title: 'Email to Sarah',
    description: 'Follow up about the project update meeting scheduled for next week',
    timestamp: '2 hours ago',
    status: 'pending'
  },
  {
    id: 2,
    type: 'calendar',
    title: 'Design Team Meeting',
    description: 'Added to calendar: Monday at 2:00 PM with the design team',
    timestamp: '3 hours ago',
    status: 'completed'
  },
  {
    id: 3,
    type: 'task',
    title: 'Research Competitors',
    description: 'Research top competitors for the new AI feature planning',
    timestamp: 'Yesterday',
    status: 'pending'
  }
];

const MOCK_REMINDERS = [
  {
    id: 1,
    type: 'reminder',
    title: 'Call Mom',
    description: 'Weekly check-in call - she mentioned wanting to hear about the project',
    timestamp: 'Due today',
    status: 'pending'
  },
  {
    id: 2,
    type: 'reminder',
    title: 'Submit Hackathon',
    description: 'Final submission deadline for KingHacks 2026',
    timestamp: 'Due tomorrow',
    status: 'pending'
  }
];

const MOCK_NOTES = [
  {
    id: 1,
    type: 'note',
    title: 'AI Study Planner Idea',
    description: 'Use spaced repetition combined with AI to create personalized study schedules based on learning patterns',
    timestamp: 'Today',
    status: null
  },
  {
    id: 2,
    type: 'note',
    title: 'Dashboard UI Notes',
    description: 'Inspiration: Wispr clean layouts, Cluely warm gradients. Keep glass effect for cards.',
    timestamp: 'Today',
    status: null
  },
  {
    id: 3,
    type: 'note',
    title: 'Backend Architecture',
    description: 'Consider using FastAPI for the transcription pipeline with async endpoints',
    timestamp: 'Yesterday',
    status: null
  },
  {
    id: 4,
    type: 'note',
    title: 'Shortcut Ideas',
    description: 'Option+Shift+Space works well. Consider adding custom shortcuts in settings.',
    timestamp: '2 days ago',
    status: null
  }
];

const MOCK_ACTIVITY = [
  {
    day: 'TODAY',
    items: [
      { time: '05:35 PM', type: 'reminder', text: 'Created reminder: Call Mom', detail: 'Due today' },
      { time: '03:22 PM', type: 'email', text: 'Drafted email to Sarah', detail: 'Pending send' },
      { time: '02:15 PM', type: 'note', text: 'Added note: AI Study Planner Idea', detail: 'Voice capture' },
      { time: '11:53 AM', type: 'calendar', text: 'Added meeting to calendar', detail: 'Design Team - Monday 2 PM' },
      { time: '09:20 AM', type: 'task', text: 'Completed task: Review PR', detail: 'Code review' }
    ]
  },
  {
    day: 'YESTERDAY',
    items: [
      { time: '04:30 PM', type: 'task', text: 'Created task: Research Competitors', detail: 'AI feature planning' },
      { time: '02:45 PM', type: 'note', text: 'Added note: Backend Architecture', detail: 'Voice capture' },
      { time: '10:20 AM', type: 'reminder', text: 'Created reminder: Submit Hackathon', detail: 'Due tomorrow' }
    ]
  },
  {
    day: 'THIS WEEK',
    items: [
      { time: 'Mon 3:00 PM', type: 'note', text: 'Added note: Shortcut Ideas', detail: 'Voice capture' },
      { time: 'Mon 11:30 AM', type: 'calendar', text: 'Added meeting to calendar', detail: 'Weekly standup' },
      { time: 'Sun 8:15 PM', type: 'note', text: 'Added note: Dashboard UI Notes', detail: 'Voice capture' }
    ]
  }
];

// ===== DOM Elements =====
const pendingList = document.getElementById('pending-list');
const remindersList = document.getElementById('reminders-list');
const notesList = document.getElementById('notes-list');
const activityTimeline = document.getElementById('activity-timeline');

const pendingCount = document.getElementById('pending-count');
const remindersCount = document.getElementById('reminders-count');
const notesCount = document.getElementById('notes-count');

const loginBtn = document.getElementById('login-btn');
const loginView = document.getElementById('login-view');
const mainDashboard = document.getElementById('main-dashboard');

// View containers
const viewHome = document.getElementById('view-home');
const viewHistory = document.getElementById('view-history');
const viewSettings = document.getElementById('view-settings');

// ===== Render Functions =====

function getIconForType(type) {
  switch(type) {
    case 'email': return 'mail';
    case 'calendar': return 'calendar';
    case 'note': return 'file-text';
    case 'reminder': return 'bell';
    case 'task': return 'check-square';
    default: return 'mic';
  }
}

function renderCard(item) {
  const statusBadge = item.status 
    ? `<span class="status-badge ${item.status}">${item.status}</span>` 
    : '';
  
  return `
    <div class="kanban-card" data-id="${item.id}" data-type="${item.type}">
      <h3 class="card-title">${item.title}</h3>
      <p class="card-description">${item.description}</p>
      <span class="card-tag ${item.type}">${item.type.charAt(0).toUpperCase() + item.type.slice(1)}</span>
      <div class="card-meta">
        <span class="timestamp">${item.timestamp}</span>
        ${statusBadge}
      </div>
    </div>
  `;
}

function renderCards(container, items, countEl) {
  if (!container) return;
  
  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>No items yet</p>
      </div>
    `;
  } else {
    container.innerHTML = items.map(renderCard).join('');
  }
  
  if (countEl) {
    countEl.textContent = items.length;
  }
  
  // Re-initialize Feather icons for new content
  if (typeof feather !== 'undefined') {
    feather.replace();
  }
}

function renderActivity(container, activityData) {
  if (!container) return;
  
  let html = '';
  
  activityData.forEach(day => {
    html += `<div class="activity-day">`;
    html += `<div class="activity-day-label">${day.day}</div>`;
    
    day.items.forEach(item => {
      html += `
        <div class="activity-item" data-type="${item.type}">
          <span class="activity-time">${item.time}</span>
          <div class="activity-dot ${item.type}"></div>
          <div class="activity-content">
            <p>${item.text}</p>
            <span>${item.detail}</span>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
  });
  
  container.innerHTML = html;
}

// ===== View Switching =====
function switchView(viewName) {
  // Hide all views with fade out
  const allViews = document.querySelectorAll('.view-container');
  allViews.forEach(view => {
    view.classList.remove('active');
  });
  
  // Show selected view with fade in
  const targetView = document.getElementById(`view-${viewName}`);
  if (targetView) {
    // Small delay for smooth transition
    setTimeout(() => {
      targetView.classList.add('active');
    }, 50);
  }
  
  // Update nav items
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    if (item.dataset.view === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// ===== Navigation =====
function setupNavigation() {
  // Sidebar nav - View switching
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const viewName = item.dataset.view;
      switchView(viewName);
    });
  });
  
  // Top tabs
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      tabItems.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });
  
  // Filter pills (History page)
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      filterActivity(pill.dataset.filter);
    });
  });
}

function filterActivity(filterType) {
  const activityItems = document.querySelectorAll('.activity-item');
  activityItems.forEach(item => {
    if (filterType === 'all' || item.dataset.type === filterType) {
      item.style.display = 'flex';
    } else {
      item.style.display = 'none';
    }
  });
}

function setupThemeToggle() {
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Theme switching logic can be added here
    });
  });
}

// ===== Premium Card Interactions =====
function setupCardInteractions() {
  // Add ripple effect on card click
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.kanban-card');
    if (card) {
      // Visual feedback
      card.style.transform = 'scale(0.98)';
      setTimeout(() => {
        card.style.transform = '';
      }, 100);
    }
  });
  
  // Add keyboard navigation for cards
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Could close modals, etc.
    }
  });
}

// ===== Login Flow =====
function showDashboard() {
  if (loginView) loginView.classList.add('hidden');
  setTimeout(() => {
    if (mainDashboard) mainDashboard.classList.add('visible');
  }, 100);
}

// ===== Window Controls =====
function setupWindowControls() {
  const btnClose = document.getElementById('btn-close');
  const btnMinimize = document.getElementById('btn-minimize');
  const btnMaximize = document.getElementById('btn-maximize');
  
  if (btnClose && window.braindump) btnClose.addEventListener('click', () => window.braindump.dashboardClose());
  if (btnMinimize && window.braindump) btnMinimize.addEventListener('click', () => window.braindump.dashboardMinimize());
  if (btnMaximize && window.braindump) btnMaximize.addEventListener('click', () => window.braindump.dashboardMaximize());
}

// ===== Voice Capture Button =====
function setupCaptureButton() {
  const captureBtn = document.getElementById('capture-btn');
  if (captureBtn) {
    captureBtn.addEventListener('click', () => {
      // Visual feedback
      captureBtn.style.transform = 'scale(0.92)';
      setTimeout(() => {
        captureBtn.style.transform = '';
      }, 150);
      
      console.log('Voice capture triggered');
      if (window.braindump && window.braindump.triggerCapture) {
        window.braindump.triggerCapture();
      }
    });
  }
}

// ===== Search Box =====
function setupSearch() {
  const searchInput = document.querySelector('.search-box input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value.toLowerCase();
      // Could implement search filtering here
      console.log('Search:', query);
    });
    
    // Keyboard shortcut to focus search
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInput.focus();
      }
    });
  }
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  // Render all columns
  renderCards(pendingList, MOCK_TASKS, pendingCount);
  renderCards(remindersList, MOCK_REMINDERS, remindersCount);
  renderCards(notesList, MOCK_NOTES, notesCount);
  
  // Render activity timeline
  renderActivity(activityTimeline, MOCK_ACTIVITY);
  
  setupNavigation();
  setupThemeToggle();
  setupWindowControls();
  setupCaptureButton();
  setupCardInteractions();
  setupSearch();
  
  // Login handlers
  if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showDashboard();
    });
  }
  
  // Initialize Feather Icons
  if (typeof feather !== 'undefined') {
    feather.replace();
  }
  
  // Default to home view
  switchView('home');
});

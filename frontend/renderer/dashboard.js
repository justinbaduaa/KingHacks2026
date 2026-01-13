// BrainDump Dashboard - 3-Column Logic

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
      { time: '02:15 PM', type: 'note', text: 'Added note: AI Study Planner Idea', detail: 'Voice transcription' },
      { time: '11:53 AM', type: 'calendar', text: 'Added meeting to calendar', detail: 'Design Team - Monday 2 PM' }
    ]
  },
  {
    day: 'YESTERDAY',
    items: [
      { time: '04:30 PM', type: 'task', text: 'Created task: Research Competitors', detail: 'AI feature planning' },
      { time: '10:20 AM', type: 'note', text: 'Added note: Backend Architecture', detail: 'Voice transcription' }
    ]
  }
];

// ===== DOM Elements =====
const tasksList = document.getElementById('tasks-list');
const remindersList = document.getElementById('reminders-list');
const notesList = document.getElementById('notes-list');
const activityTimeline = document.getElementById('activity-timeline');

const tasksCount = document.getElementById('tasks-count');
const remindersCount = document.getElementById('reminders-count');
const notesCount = document.getElementById('notes-count');
const loginBtn = document.getElementById('login-btn');
const loginView = document.getElementById('login-view');
const mainDashboard = document.getElementById('main-dashboard');


// ===== Render Functions =====

function renderCard(item) {
  const statusBadge = item.status 
    ? `<span class="status-badge ${item.status}">${item.status}</span>` 
    : '';
  
  return `
    <div class="dash-card" data-id="${item.id}">
      <div class="dash-card-icon ${item.type}">
        <i data-feather="${getIconForType(item.type)}"></i>
      </div>
      <div class="dash-card-body">
        <h3>${item.title}</h3>
        <p>${item.description}</p>
        <div class="dash-card-meta">
          <span class="timestamp">${item.timestamp}</span>
          ${statusBadge}
        </div>
      </div>
    </div>
  `;
}

function renderCards(container, items, countEl) {
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
}

function renderActivity(container, activityData) {
  let html = '';
  
  activityData.forEach(day => {
    html += `<div class="activity-day">`;
    html += `<div class="activity-day-label">${day.day}</div>`;
    
    day.items.forEach(item => {
      html += `
        <div class="activity-item">
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

// ===== Helper =====
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

// ===== Navigation =====
function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      navItems.forEach(nav => nav.classList.remove('active'));
      item.classList.add('active');
    });
  });
}

// ===== Login Flow =====
function showDashboard() {
  loginView.classList.add('hidden');
  setTimeout(() => {
    mainDashboard.classList.add('visible');
  }, 100);
}

// ===== Window Controls =====
function setupWindowControls() {
  const btnClose = document.getElementById('btn-close');
  const btnMinimize = document.getElementById('btn-minimize');
  const btnMaximize = document.getElementById('btn-maximize');
  
  if (btnClose) btnClose.addEventListener('click', () => window.braindump.dashboardClose());
  if (btnMinimize) btnMinimize.addEventListener('click', () => window.braindump.dashboardMinimize());
  if (btnMaximize) btnMaximize.addEventListener('click', () => window.braindump.dashboardMaximize());
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  renderCards(tasksList, MOCK_TASKS, tasksCount);
  renderCards(remindersList, MOCK_REMINDERS, remindersCount);
  renderCards(notesList, MOCK_NOTES, notesCount);
  renderActivity(activityTimeline, MOCK_ACTIVITY);
  
  setupNavigation();
  setupWindowControls();
  
  // Login handlers
  if (loginBtn) {
    loginBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showDashboard();
    });
  }
  
  // Initialize Feather Icons
  feather.replace();
});




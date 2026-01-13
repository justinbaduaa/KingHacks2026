// SecondBrain Dashboard - Mock Data & Interactions

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

// ===== Icons =====

const ICONS = {
  task: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><path d="M9 12l2 2 4-4"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  reminder: `<svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
  note: `<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  email: `<svg viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`
};

// ===== DOM Elements =====

const mainDashboard = document.getElementById('main-dashboard');

const tasksList = document.getElementById('tasks-list');
const remindersList = document.getElementById('reminders-list');
const notesList = document.getElementById('notes-list');
const activityTimeline = document.getElementById('activity-timeline');

const tasksCount = document.getElementById('tasks-count');
const remindersCount = document.getElementById('reminders-count');
const notesCount = document.getElementById('notes-count');

// ===== Render Functions =====

function renderCard(item) {
  const statusBadge = item.status 
    ? `<span class="status-badge ${item.status}">${item.status}</span>` 
    : '';
  
  return `
    <div class="dash-card" data-id="${item.id}">
      <div class="dash-card-icon ${item.type}">
        ${ICONS[item.type] || ICONS.task}
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
        <div class="empty-state-icon">📭</div>
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

// ===== Navigation =====

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Remove active from all
      navItems.forEach(nav => nav.classList.remove('active'));
      
      // Add active to clicked
      item.classList.add('active');
      
      // Could add view switching logic here
      const view = item.dataset.view;
      console.log(`[NAV] Switched to ${view}`);
    });
  });
}

// ===== Initialize =====

function init() {
  // Render all columns
  renderCards(tasksList, MOCK_TASKS, tasksCount);
  renderCards(remindersList, MOCK_REMINDERS, remindersCount);
  renderCards(notesList, MOCK_NOTES, notesCount);
  renderActivity(activityTimeline, MOCK_ACTIVITY);
  
  // Setup navigation
  setupNavigation();
  
  // Card click handlers
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.dash-card');
    if (card) {
      const id = card.dataset.id;
      console.log(`[CARD] Clicked card ${id}`);
      // Could open detail modal here
    }
  });
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', init);


// SecondBrain Dashboard - Premium MVP

// ===== Fallback Data =====
const FALLBACK_TASKS = [];
const FALLBACK_REMINDERS = [];
const FALLBACK_NOTES = [];
const FALLBACK_ACTIVITY = [];

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
    <div class="kanban-card" data-id="${item.id}" data-node-id="${item.nodeId || ''}" data-type="${item.type}">
      <button class="card-delete" title="Delete">
        <i data-feather="x"></i>
      </button>
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

function formatRelativeTime(isoString) {
  if (!isoString) return 'Just now';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

function normalizeNodeType(nodeType) {
  if (!nodeType) return 'task';
  if (nodeType === 'todo') return 'task';
  if (nodeType === 'calendar_placeholder') return 'calendar';
  return nodeType;
}

function deriveCardFromNode(node) {
  const nodeType = normalizeNodeType(node.node_type);
  const title = node.title || node.todo?.task || node.reminder?.reminder_text || node.body || 'Untitled';
  const description = node.body || node.note?.content || node.todo?.task || node.reminder?.reminder_text || '';
  const status = node.status === 'completed' || node.todo?.status_detail === 'done' ? 'completed' : 'pending';

  return {
    id: node.node_id || node.id,
    nodeId: node.node_id || node.id,
    type: nodeType,
    title,
    description,
    timestamp: formatRelativeTime(node.created_at_iso || node.captured_at_iso),
    status: nodeType === 'note' ? null : status,
  };
}

function buildActivityFromNodes(nodes) {
  const groups = new Map();
  const sorted = [...nodes].sort((a, b) => {
    const aTime = new Date(a.created_at_iso || a.captured_at_iso || 0).getTime();
    const bTime = new Date(b.created_at_iso || b.captured_at_iso || 0).getTime();
    return bTime - aTime;
  });

  sorted.forEach((node) => {
    const date = new Date(node.created_at_iso || node.captured_at_iso || Date.now());
    const dayKey = date.toDateString();
    const nodeType = normalizeNodeType(node.node_type);
    const title = node.title || node.todo?.task || node.reminder?.reminder_text || node.body || 'Untitled';
    const timeLabel = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (!groups.has(dayKey)) {
      groups.set(dayKey, []);
    }
    groups.get(dayKey).push({
      time: timeLabel,
      type: nodeType,
      text: title,
      detail: nodeType === 'note' ? 'Note captured' : 'Captured',
    });
  });

  const todayKey = new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toDateString();

  return Array.from(groups.entries()).map(([dayKey, items]) => {
    let label = dayKey.toUpperCase();
    if (dayKey === todayKey) label = 'TODAY';
    if (dayKey === yesterdayKey) label = 'YESTERDAY';
    return { day: label, items };
  });
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

async function loadDashboardData() {
  if (!window.braindump || !window.braindump.getActiveNodes) {
    renderCards(pendingList, FALLBACK_TASKS, pendingCount);
    renderCards(remindersList, FALLBACK_REMINDERS, remindersCount);
    renderCards(notesList, FALLBACK_NOTES, notesCount);
    renderActivity(activityTimeline, FALLBACK_ACTIVITY);
    return;
  }

  try {
    const result = await window.braindump.getActiveNodes();
    if (!result.success) {
      throw new Error(result.error || 'Failed to load nodes');
    }

    const nodes = result.body?.nodes || [];
    const cards = nodes.map(deriveCardFromNode);

    const pendingCards = [];
    const reminderCards = [];
    const noteCards = [];

    cards.forEach((card) => {
      if (card.type === 'reminder') {
        reminderCards.push(card);
      } else if (card.type === 'note') {
        noteCards.push(card);
      } else {
        pendingCards.push(card);
      }
    });

    renderCards(pendingList, pendingCards, pendingCount);
    renderCards(remindersList, reminderCards, remindersCount);
    renderCards(notesList, noteCards, notesCount);
    renderActivity(activityTimeline, buildActivityFromNodes(nodes));
  } catch (err) {
    console.error('[DASHBOARD] Failed to load nodes:', err);
    renderCards(pendingList, FALLBACK_TASKS, pendingCount);
    renderCards(remindersList, FALLBACK_REMINDERS, remindersCount);
    renderCards(notesList, FALLBACK_NOTES, notesCount);
    renderActivity(activityTimeline, FALLBACK_ACTIVITY);
  }
}

function setupDeleteHandlers() {
  document.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.card-delete');
    if (!deleteBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const card = deleteBtn.closest('.kanban-card');
    if (!card) return;

    const nodeId = card.dataset.nodeId;
    if (!nodeId || !window.braindump?.deleteNode) {
      return;
    }

    const shouldDelete = window.confirm('Delete this item?');
    if (!shouldDelete) return;

    const result = await window.braindump.deleteNode(nodeId);
    if (!result.success) {
      console.error('[DASHBOARD] Delete failed:', result.error || result.body);
      return;
    }

    card.remove();
    loadDashboardData();
  });
}

function setupRefreshButton() {
  const refreshBtn = document.querySelector('.nav-actions .action-btn[title="Refresh"]');
  if (!refreshBtn) return;
  refreshBtn.addEventListener('click', (e) => {
    e.preventDefault();
    loadDashboardData();
  });
}

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupThemeToggle();
  setupWindowControls();
  setupCaptureButton();
  setupCardInteractions();
  setupSearch();
  setupRefreshButton();
  setupDeleteHandlers();
  
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

  loadDashboardData();
});

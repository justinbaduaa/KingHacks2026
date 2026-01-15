// SecondBrain Dashboard - Premium MVP

// ===== Fallback Data =====
const FALLBACK_TASKS = [];
const FALLBACK_REMINDERS = [];
const FALLBACK_NOTES = [];
const FALLBACK_CALENDAR = [];
const FALLBACK_ACTIVITY = [];

// ===== DOM Elements =====
const pendingList = document.getElementById('pending-list');
const remindersList = document.getElementById('reminders-list');
const notesList = document.getElementById('notes-list');
const calendarList = document.getElementById('calendar-list');
const activityTimeline = document.getElementById('activity-timeline');

const pendingCount = document.getElementById('pending-count');
const remindersCount = document.getElementById('reminders-count');
const notesCount = document.getElementById('notes-count');
const calendarCount = document.getElementById('calendar-count');

const loginBtn = document.getElementById('login-btn');
const loginView = document.getElementById('login-view');
const mainDashboard = document.getElementById('main-dashboard');

// View containers
const viewHome = document.getElementById('view-home');
const viewHistory = document.getElementById('view-history');
const viewSettings = document.getElementById('view-settings');

// ===== Render Functions =====

function renderTaskCard(item) {
  return `
    <div class="kanban-card task-card" data-id="${item.id}" data-node-id="${item.nodeId || ''}" data-type="task">
      <div class="card-actions">
        <button class="card-action-btn card-delete" type="button" data-action="delete" title="Delete">
          <i data-feather="x"></i>
        </button>
      </div>
      <div class="card-main task-main">
        <button class="card-action-btn card-check" type="button" data-action="complete" title="Mark done">
          <i data-feather="check"></i>
        </button>
        <div class="card-main-body">
          <h3 class="card-title">${item.title}</h3>
          <div class="card-meta-row">
            <span class="card-date">${item.dateLabel}</span>
            <span class="card-time">${item.timeLabel}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderReminderCard(item) {
  return `
    <div class="kanban-card reminder-card" data-id="${item.id}" data-node-id="${item.nodeId || ''}" data-type="reminder">
      <div class="card-actions">
        <button class="card-action-btn card-send" type="button" data-action="send-reminder" title="Send to Apple Reminders">
          <i data-feather="send"></i>
        </button>
        <button class="card-action-btn card-delete" type="button" data-action="delete" title="Delete">
          <i data-feather="x"></i>
        </button>
      </div>
      <div class="card-header">
        <span class="card-pill reminder">Reminder</span>
      </div>
      <h3 class="card-title">${item.title}</h3>
      <div class="card-meta-row">
        <span class="card-date">${item.dateLabel}</span>
        <span class="card-time">${item.timeLabel}</span>
      </div>
    </div>
  `;
}

function renderNoteCard(item) {
  return `
    <div class="kanban-card note-card" data-id="${item.id}" data-node-id="${item.nodeId || ''}" data-type="note">
      <div class="card-actions">
        <button class="card-action-btn card-delete" type="button" data-action="delete" title="Delete">
          <i data-feather="x"></i>
        </button>
      </div>
      <div class="card-header">
        <span class="card-pill note">Note</span>
      </div>
      <h3 class="card-title">${item.title}</h3>
      <p class="card-description">${item.description || 'No details yet'}</p>
    </div>
  `;
}

function renderCalendarCard(item) {
  return `
    <div class="kanban-card calendar-card" data-id="${item.id}" data-node-id="${item.nodeId || ''}" data-type="calendar">
      <div class="card-actions">
        <button class="card-action-btn card-send" type="button" data-action="send-calendar" title="Send to Calendar">
          <i data-feather="send"></i>
        </button>
        <button class="card-action-btn card-delete" type="button" data-action="delete" title="Delete">
          <i data-feather="x"></i>
        </button>
      </div>
      <div class="card-header">
        <span class="card-pill calendar">Calendar</span>
      </div>
      <h3 class="card-title">${item.title}</h3>
      <div class="card-detail-row">
        <span class="detail-label">Location</span>
        <span class="detail-value">${item.locationLabel}</span>
      </div>
      <div class="card-detail-row">
        <span class="detail-label">Date</span>
        <span class="detail-value">${item.dateLabel}</span>
      </div>
      <div class="card-detail-row">
        <span class="detail-label">Time</span>
        <span class="detail-value">${item.timeLabel}</span>
      </div>
    </div>
  `;
}

function renderEmailCard(item) {
  return `
    <div class="kanban-card email-card" data-id="${item.id}" data-node-id="${item.nodeId || ''}" data-type="email">
      <div class="card-actions">
        <button class="card-action-btn card-delete" type="button" data-action="delete" title="Delete">
          <i data-feather="x"></i>
        </button>
      </div>
      <div class="card-header">
        <span class="card-pill email">Email</span>
      </div>
      <h3 class="card-title">${item.title}</h3>
      <div class="card-detail-row">
        <span class="detail-label">To</span>
        <span class="detail-value">${item.recipientLabel}</span>
      </div>
      <div class="card-detail-row">
        <span class="detail-label">Mode</span>
        <span class="detail-value">${item.sendModeLabel}</span>
      </div>
    </div>
  `;
}

function renderCard(item) {
  if (item.type === 'reminder') return renderReminderCard(item);
  if (item.type === 'note') return renderNoteCard(item);
  if (item.type === 'calendar') return renderCalendarCard(item);
  if (item.type === 'email') return renderEmailCard(item);
  return renderTaskCard(item);
}

function renderCards(container, items, countEl, emptyLabel) {
  if (!container) return;
  
  if (items.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <p>${emptyLabel || 'No items yet'}</p>
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

function parseDateTime(value) {
  if (!value || typeof value !== 'string') return null;
  const dateOnlyMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch.map(Number);
    return new Date(year, month - 1, day);
  }
  const dateTimeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (dateTimeMatch) {
    const [, year, month, day, hour, minute, second] = dateTimeMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second || 0)
    );
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateLabel(date) {
  if (!date) return 'Date TBD';
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatTimeLabel(date, hasTime) {
  if (!date) return 'Time TBD';
  if (!hasTime) return 'All day';
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function buildDateTimeLabels(value) {
  const date = parseDateTime(value);
  const hasTime = Boolean(value && value.includes('T'));
  return {
    dateLabel: formatDateLabel(date),
    timeLabel: formatTimeLabel(date, hasTime),
  };
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
  const nodeId = node.node_id || node.id;
  const baseTitle = node.title || node.todo?.task || node.reminder?.reminder_text || node.body || 'Untitled';

  if (nodeType === 'task') {
    const dueDateTime = node.todo?.due_datetime_iso || node.todo?.due?.resolved_start_iso;
    const dueDate = node.todo?.due_date_iso;
    const labels = buildDateTimeLabels(dueDateTime || dueDate);

    return {
      id: nodeId,
      nodeId,
      type: nodeType,
      title: baseTitle,
      dateLabel: labels.dateLabel,
      timeLabel: dueDateTime ? labels.timeLabel : (dueDate ? 'All day' : 'No due time'),
    };
  }

  if (nodeType === 'reminder') {
    const trigger = node.reminder?.trigger_datetime_iso || node.reminder?.when?.resolved_start_iso || node.time_interpretation?.resolved_start_iso;
    const labels = buildDateTimeLabels(trigger);
    return {
      id: nodeId,
      nodeId,
      type: nodeType,
      title: baseTitle,
      dateLabel: labels.dateLabel,
      timeLabel: labels.timeLabel,
    };
  }

  if (nodeType === 'calendar') {
    const startIso = node.calendar_placeholder?.start_datetime_iso || node.calendar_placeholder?.start?.resolved_start_iso;
    let endIso = node.calendar_placeholder?.end_datetime_iso || node.calendar_placeholder?.start?.resolved_end_iso;
    const durationMinutes = node.calendar_placeholder?.duration_minutes;
    if (!endIso && startIso && durationMinutes) {
      const startDate = parseDateTime(startIso);
      if (startDate) {
        endIso = new Date(startDate.getTime() + durationMinutes * 60000).toISOString();
      }
    }
    const startLabels = buildDateTimeLabels(startIso);
    const endLabels = buildDateTimeLabels(endIso);
    const timeLabel = endIso && endLabels.timeLabel !== 'Time TBD'
      ? `${startLabels.timeLabel} - ${endLabels.timeLabel}`
      : startLabels.timeLabel;

    return {
      id: nodeId,
      nodeId,
      type: nodeType,
      title: node.calendar_placeholder?.event_title || baseTitle,
      locationLabel: node.calendar_placeholder?.location_text || 'Location TBD',
      dateLabel: startLabels.dateLabel,
      timeLabel,
    };
  }

  if (nodeType === 'email') {
    const emailPayload = node.email || {};
    const recipient = emailPayload.to_email || emailPayload.to_name || 'Recipient TBD';
    const sendMode = (emailPayload.send_mode || 'send').toUpperCase();

    return {
      id: nodeId,
      nodeId,
      type: nodeType,
      title: emailPayload.subject || baseTitle,
      recipientLabel: recipient,
      sendModeLabel: sendMode,
    };
  }

  return {
    id: nodeId,
    nodeId,
    type: 'note',
    title: baseTitle,
    description: node.body || node.note?.content || '',
    timestamp: formatRelativeTime(node.created_at_iso || node.captured_at_iso),
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
    if (e.target.closest('[data-action]')) {
      return;
    }
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
    renderCards(pendingList, FALLBACK_TASKS, pendingCount, 'No tasks yet');
    renderCards(remindersList, FALLBACK_REMINDERS, remindersCount, 'No reminders yet');
    renderCards(notesList, FALLBACK_NOTES, notesCount, 'No notes yet');
    renderCards(calendarList, FALLBACK_CALENDAR, calendarCount, 'No calendar items yet');
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
    const calendarCards = [];

    cards.forEach((card) => {
      if (card.type === 'reminder') {
        reminderCards.push(card);
      } else if (card.type === 'note' || card.type === 'email') {
        noteCards.push(card);
      } else if (card.type === 'calendar') {
        calendarCards.push(card);
      } else {
        pendingCards.push(card);
      }
    });

    renderCards(pendingList, pendingCards, pendingCount, 'No tasks yet');
    renderCards(remindersList, reminderCards, remindersCount, 'No reminders yet');
    renderCards(notesList, noteCards, notesCount, 'No notes yet');
    renderCards(calendarList, calendarCards, calendarCount, 'No calendar items yet');
    renderActivity(activityTimeline, buildActivityFromNodes(nodes));
  } catch (err) {
    console.error('[DASHBOARD] Failed to load nodes:', err);
    renderCards(pendingList, FALLBACK_TASKS, pendingCount, 'No tasks yet');
    renderCards(remindersList, FALLBACK_REMINDERS, remindersCount, 'No reminders yet');
    renderCards(notesList, FALLBACK_NOTES, notesCount, 'No notes yet');
    renderCards(calendarList, FALLBACK_CALENDAR, calendarCount, 'No calendar items yet');
    renderActivity(activityTimeline, FALLBACK_ACTIVITY);
  }
}

function setupDeleteHandlers() {
  document.addEventListener('click', async (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const card = actionBtn.closest('.kanban-card');
    if (!card) return;

    const nodeId = card.dataset.nodeId;
    const action = actionBtn.dataset.action;

    if (action === 'send-reminder') {
      console.log('[DASHBOARD] Reminder send placeholder', nodeId);
      return;
    }

    if (action === 'send-calendar') {
      console.log('[DASHBOARD] Calendar send placeholder', nodeId);
      return;
    }

    if (!nodeId || !window.braindump?.deleteNode) {
      return;
    }

    const existingConfirm = card.querySelector('.card-confirm');
    if (existingConfirm) {
      existingConfirm.remove();
      return;
    }

    const confirmEl = document.createElement('div');
    confirmEl.className = 'card-confirm';
    confirmEl.innerHTML = `
      <span>Confirm delete</span>
      <button type="button" class="confirm-action" data-confirm="delete">Check</button>
      <button type="button" class="confirm-cancel" data-confirm="cancel">Cancel</button>
    `;
    card.appendChild(confirmEl);
    confirmEl.querySelector('.confirm-action')?.focus();
  });

  document.addEventListener('click', async (e) => {
    const confirmBtn = e.target.closest('[data-confirm]');
    if (!confirmBtn) return;

    e.preventDefault();
    e.stopPropagation();

    const card = confirmBtn.closest('.kanban-card');
    if (!card) return;

    const confirmBox = card.querySelector('.card-confirm');
    const nodeId = card.dataset.nodeId;
    if (!confirmBox) return;

    if (confirmBtn.dataset.confirm === 'cancel') {
      confirmBox.remove();
      return;
    }

    if (!nodeId || !window.braindump?.deleteNode) {
      return;
    }

    const result = await window.braindump.deleteNode(nodeId);
    if (!result.success) {
      console.error('[DASHBOARD] Delete failed:', result.error || result.body);
      return;
    }

    card.remove();
    loadDashboardData();
  });

  document.addEventListener('click', (e) => {
    const confirmBox = document.querySelector('.card-confirm');
    if (!confirmBox) return;
    if (e.target.closest('.kanban-card')) return;
    confirmBox.remove();
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

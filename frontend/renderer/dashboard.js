// secondbrain Dashboard - Premium MVP

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

// Tab view containers
const listViewContainer = document.getElementById('list-view');
const boardViewContainer = document.getElementById('board-view');
const allItemsList = document.getElementById('all-items-list');

// Current view state
let currentTab = 'board';
let allCards = [];

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

function renderCard(item) {
  if (item.type === 'reminder') return renderReminderCard(item);
  if (item.type === 'note') return renderNoteCard(item);
  if (item.type === 'calendar') return renderCalendarCard(item);
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
  
  // Show/hide the List/Board tabs - only visible on Home view
  const navTabs = document.querySelector('.nav-tabs');
  if (navTabs) {
    if (viewName === 'home') {
      navTabs.style.display = '';
    } else {
      navTabs.style.display = 'none';
    }
  }
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
  
  // Top tabs - view switching (List/Board)
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      const tabName = tab.dataset.tab;
      switchTab(tabName);
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

// ===== Tab Switching (List/Board) =====
function switchTab(tabName) {
  currentTab = tabName;
  
  // Update tab UI
  const tabItems = document.querySelectorAll('.tab-item');
  tabItems.forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  // Switch views
  if (tabName === 'list') {
    if (listViewContainer) listViewContainer.classList.add('active');
    if (boardViewContainer) boardViewContainer.classList.remove('active');
    renderListView();
  } else {
    if (listViewContainer) listViewContainer.classList.remove('active');
    if (boardViewContainer) boardViewContainer.classList.add('active');
  }
  
  // Re-init feather icons
  if (typeof feather !== 'undefined') {
    feather.replace();
  }
}

// ===== List View Rendering =====
function renderListItem(item) {
  const showCheck = item.type === 'task';
  return `
    <div class="list-item" data-id="${item.id}" data-node-id="${item.nodeId || ''}" data-type="${item.type}">
      ${showCheck ? `
        <button class="list-item-check" data-action="complete" title="Mark complete">
          <i data-feather="check"></i>
        </button>
      ` : ''}
      <div class="list-item-content">
        <span class="list-item-title">${item.title}</span>
        <div class="list-item-meta">
          <span class="list-item-type ${item.type}">${item.type}</span>
          <span>${item.dateLabel || ''}</span>
          <span>${item.timeLabel || ''}</span>
        </div>
      </div>
      <div class="list-item-actions">
        <button class="list-item-action" data-action="delete" title="Delete">
          <i data-feather="trash-2"></i>
        </button>
      </div>
    </div>
  `;
}

function renderListView() {
  if (!allItemsList) return;
  
  if (allCards.length === 0) {
    allItemsList.innerHTML = `
      <div class="list-empty">
        <i data-feather="inbox"></i>
        <p>No items captured yet. Use voice capture to add tasks, reminders, notes, or calendar events.</p>
      </div>
    `;
  } else {
    // Sort by type priority: tasks first, then reminders, calendar, notes
    const typePriority = { task: 0, reminder: 1, calendar: 2, note: 3 };
    const sorted = [...allCards].sort((a, b) => {
      return (typePriority[a.type] ?? 4) - (typePriority[b.type] ?? 4);
    });
    allItemsList.innerHTML = sorted.map(renderListItem).join('');
  }
  
  if (typeof feather !== 'undefined') {
    feather.replace();
  }
}

// ===== Sidebar Collapse =====
function setupSidebarCollapse() {
  const collapseBtn = document.getElementById('collapse-sidebar');
  const sidebar = document.querySelector('.sidebar');
  
  if (collapseBtn && sidebar) {
    collapseBtn.addEventListener('click', () => {
      const isCollapsed = sidebar.classList.toggle('collapsed');
      
      // Update icon - need to update the i element's data-feather attribute
      const iconEl = collapseBtn.querySelector('i, svg');
      if (iconEl) {
        iconEl.setAttribute('data-feather', isCollapsed ? 'chevrons-right' : 'chevrons-left');
      }
      
      // Re-render feather icons
      if (typeof feather !== 'undefined') {
        feather.replace();
      }
    });
  }
}

function setupThemeToggle() {
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      themeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const theme = btn.dataset.theme;
      if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        document.body.classList.remove('light-theme');
      } else {
        document.body.classList.add('light-theme');
        document.body.classList.remove('dark-theme');
      }
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


function updateStats(nodes) {
  const weekStatEl = document.getElementById('stat-weeks');
  const itemStatEl = document.getElementById('stat-items');
  
  if (!nodes || nodes.length === 0) {
    if (itemStatEl) itemStatEl.textContent = '🧠 0 items captured';
    if (weekStatEl) weekStatEl.textContent = '🌟 New Member';
    return;
  }

  // Items captured
  const count = nodes.length;
  if (itemStatEl) itemStatEl.textContent = `🧠 ${count} item${count === 1 ? '' : 's'} captured`;

  // Weeks active
  // Find oldest node
  let oldestTime = Date.now();
  nodes.forEach(node => {
    const t = new Date(node.created_at_iso || node.captured_at_iso || Date.now()).getTime();
    if (t < oldestTime) oldestTime = t;
  });

  const diffMs = Date.now() - oldestTime;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  let timeLabel = '';
  if (diffDays < 7) {
     timeLabel = `${Math.max(1, diffDays)} day${diffDays === 1 ? '' : 's'}`;
  } else {
     const w = Math.floor(diffDays / 7);
     timeLabel = `${w} week${w === 1 ? '' : 's'}`;
  }
  
  if (weekStatEl) weekStatEl.textContent = `🌟 ${timeLabel} active`;
}

async function loadDashboardData() {

  if (!window.braindump || !window.braindump.getActiveNodes) {
    renderCards(pendingList, FALLBACK_TASKS, pendingCount, 'No tasks yet');
    renderCards(remindersList, FALLBACK_REMINDERS, remindersCount, 'No reminders yet');
    renderCards(notesList, FALLBACK_NOTES, notesCount, 'No notes yet');
    renderCards(calendarList, FALLBACK_CALENDAR, calendarCount, 'No calendar items yet');
    renderActivity(activityTimeline, FALLBACK_ACTIVITY);
    updateStats([]);
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
      } else if (card.type === 'note') {
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
    updateStats(nodes);
    
    // Store all cards for list view
    allCards = cards;
    if (currentTab === 'list') {
      renderListView();
    }
  } catch (err) {
    console.error('[DASHBOARD] Failed to load nodes:', err);
    renderCards(pendingList, FALLBACK_TASKS, pendingCount, 'No tasks yet');
    renderCards(remindersList, FALLBACK_REMINDERS, remindersCount, 'No reminders yet');
    renderCards(notesList, FALLBACK_NOTES, notesCount, 'No notes yet');
    renderCards(calendarList, FALLBACK_CALENDAR, calendarCount, 'No calendar items yet');
    renderActivity(activityTimeline, FALLBACK_ACTIVITY);
    updateStats([]);
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
      <span>Delete this item?</span>
      <div class="card-confirm-buttons">
        <button type="button" class="confirm-action" data-confirm="delete">Delete</button>
        <button type="button" class="confirm-cancel" data-confirm="cancel">Cancel</button>
      </div>
    `;
    card.appendChild(confirmEl);
    confirmEl.querySelector('.confirm-cancel')?.focus();
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

// ===== Complete Task Handlers =====
function setupCompleteTaskHandlers() {
  document.addEventListener('click', async (e) => {
    const completeBtn = e.target.closest('[data-action="complete"]');
    if (!completeBtn) return;

    e.preventDefault();
    e.stopPropagation();

    // Find card (kanban or list item)
    const card = completeBtn.closest('.kanban-card') || completeBtn.closest('.list-item');
    if (!card) return;

    const nodeId = card.dataset.nodeId;
    
    // Visual feedback - mark as completed
    card.classList.add('completed');
    completeBtn.style.transform = 'scale(1.2)';
    
    setTimeout(() => {
      completeBtn.style.transform = '';
    }, 200);

    // If we have a backend connection, delete the completed task
    if (nodeId && window.braindump?.deleteNode) {
      try {
        const result = await window.braindump.deleteNode(nodeId);
        if (result.success) {
          // Fade out and remove
          card.style.transition = 'opacity 0.3s, transform 0.3s';
          card.style.opacity = '0';
          card.style.transform = 'translateX(20px)';
          
          setTimeout(() => {
            card.remove();
            loadDashboardData();
          }, 300);
        }
      } catch (err) {
        console.error('[DASHBOARD] Complete task failed:', err);
        card.classList.remove('completed');
      }
    } else {
      // Demo mode - just show visual completion
      setTimeout(() => {
        card.style.transition = 'opacity 0.3s, transform 0.3s';
        card.style.opacity = '0';
        card.style.transform = 'translateX(20px)';
        
        setTimeout(() => {
          card.remove();
        }, 300);
      }, 500);
    }
  });
}

// ===== Shortcut Recorder =====
const DEFAULT_SHORTCUT = 'Alt+Shift+Space';

// Convert Electron accelerator format to display format
// On Mac: Alt -> ⌥, Shift -> ⇧, Ctrl -> ⌃, Meta/Cmd -> ⌘
// On Windows/Linux: show text (Ctrl+Shift+Space)
function formatShortcutDisplay(accelerator) {
  if (!accelerator) return '';
  
  const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
  
  if (isMac) {
    return accelerator
      .replace(/CommandOrControl\+/gi, '⌘')
      .replace(/CmdOrCtrl\+/gi, '⌘')
      .replace(/Command\+/gi, '⌘')
      .replace(/Cmd\+/gi, '⌘')
      .replace(/Control\+/gi, '⌃')
      .replace(/Ctrl\+/gi, '⌃')
      .replace(/Alt\+/gi, '⌥')
      .replace(/Option\+/gi, '⌥')
      .replace(/Shift\+/gi, '⇧')
      .replace(/Meta\+/gi, '⌘');
  }
  
  return accelerator;
}

// Convert key event to Electron accelerator format
function keyEventToAccelerator(e) {
  const parts = [];
  
  // Order matters: CmdOrCtrl, Alt, Shift, then key
  if (e.metaKey) parts.push('Meta');
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  
  // Get the actual key, not modifier
  const key = e.key;
  const code = e.code;
  
  // Ignore if only modifier keys pressed
  if (['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(key)) {
    return null;
  }
  
  // Map common keys to Electron format
  let keyName = key;
  
  if (code.startsWith('Key')) {
    keyName = code.replace('Key', '');
  } else if (code.startsWith('Digit')) {
    keyName = code.replace('Digit', '');
  } else if (code === 'Space') {
    keyName = 'Space';
  } else if (key === 'ArrowUp') {
    keyName = 'Up';
  } else if (key === 'ArrowDown') {
    keyName = 'Down';
  } else if (key === 'ArrowLeft') {
    keyName = 'Left';
  } else if (key === 'ArrowRight') {
    keyName = 'Right';
  } else if (key.length === 1) {
    keyName = key.toUpperCase();
  }
  
  parts.push(keyName);
  
  return parts.join('+');
}

function setupShortcutRecorder() {
  const shortcutBadge = document.getElementById('shortcut-badge');
  const shortcutDisplay = document.getElementById('shortcut-display');
  const shortcutReset = document.getElementById('shortcut-reset');
  const recordingModal = document.getElementById('shortcut-recording-modal');
  const keysDisplay = document.getElementById('modal-keys-display');
  const timerContainer = document.getElementById('modal-timer-container');
  const timerBar = document.getElementById('modal-timer-bar');
  const timerLabel = document.getElementById('modal-timer-label');
  const modalCancelBtn = document.getElementById('modal-cancel-recording');
  const modalInstruction = document.getElementById('modal-instruction');
  
  if (!shortcutBadge || !shortcutDisplay || !recordingModal) return;
  
  let isRecording = false;
  let pressedKeys = new Set();
  let currentAccelerator = null;
  let holdStartTime = null;
  let holdTimerInterval = null;
  const HOLD_DURATION = 1000; // 1 second hold required
  
  // Map key codes to display symbols (Mac style)
  function keyToSymbol(key) {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const keyMap = {
      'Meta': isMac ? '⌘' : 'Win',
      'Control': isMac ? '⌃' : 'Ctrl',
      'Alt': isMac ? '⌥' : 'Alt',
      'Shift': '⇧',
      'Space': 'Space',
      'ArrowUp': '↑',
      'ArrowDown': '↓',
      'ArrowLeft': '←',
      'ArrowRight': '→',
      'Backspace': '⌫',
      'Delete': '⌦',
      'Enter': '↵',
      'Escape': 'Esc',
      'Tab': '⇥',
    };
    return keyMap[key] || key.toUpperCase();
  }
  
  // Build accelerator string from pressed keys
  function buildAccelerator() {
    const parts = [];
    const modifiers = ['Meta', 'Control', 'Alt', 'Shift'];
    const regularKeys = [];
    
    pressedKeys.forEach(key => {
      if (modifiers.includes(key)) {
        parts.push(key);
      } else {
        regularKeys.push(key);
      }
    });
    
    // Sort modifiers in standard order
    parts.sort((a, b) => modifiers.indexOf(a) - modifiers.indexOf(b));
    
    // Add regular key (should only be one)
    if (regularKeys.length > 0) {
      let keyName = regularKeys[0];
      if (keyName === ' ') keyName = 'Space';
      else if (keyName.length === 1) keyName = keyName.toUpperCase();
      parts.push(keyName);
    }
    
    return parts.join('+');
  }
  
  // Update the visual key display
  function updateKeysDisplay() {
    if (pressedKeys.size === 0) {
      keysDisplay.innerHTML = '<span class="waiting-text">Waiting for keys...</span>';
      keysDisplay.classList.remove('has-keys', 'complete');
      return;
    }
    
    keysDisplay.classList.add('has-keys');
    keysDisplay.classList.remove('complete');
    
    const modifiers = ['Meta', 'Control', 'Alt', 'Shift'];
    const sortedKeys = Array.from(pressedKeys).sort((a, b) => {
      const aIdx = modifiers.indexOf(a);
      const bIdx = modifiers.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return 0;
    });
    
    const html = sortedKeys.map((key, idx) => {
      const symbol = keyToSymbol(key);
      const plus = idx < sortedKeys.length - 1 ? '<span class="key-plus">+</span>' : '';
      return `<span class="key-pill">${symbol}</span>${plus}`;
    }).join('');
    
    keysDisplay.innerHTML = html;
  }
  
  // Start the hold timer
  function startHoldTimer() {
    holdStartTime = Date.now();
    timerContainer.classList.add('active');
    timerLabel.classList.add('visible');
    timerLabel.classList.remove('success');
    timerLabel.textContent = 'Hold for 1 second to save';
    
    holdTimerInterval = setInterval(() => {
      const elapsed = Date.now() - holdStartTime;
      const progress = Math.min((elapsed / HOLD_DURATION) * 100, 100);
      timerBar.style.width = `${progress}%`;
      
      if (progress >= 100) {
        // Timer complete - save the shortcut
        clearInterval(holdTimerInterval);
        holdTimerInterval = null;
        
        keysDisplay.classList.add('complete');
        timerLabel.textContent = 'Saved!';
        timerLabel.classList.add('success');
        
        // Save after a brief visual confirmation
        setTimeout(() => {
          hideModal(true);
        }, 300);
      }
    }, 50);
  }
  
  // Stop/reset the hold timer
  function stopHoldTimer() {
    if (holdTimerInterval) {
      clearInterval(holdTimerInterval);
      holdTimerInterval = null;
    }
    holdStartTime = null;
    timerBar.style.width = '0%';
    timerContainer.classList.remove('active');
    timerLabel.classList.remove('visible', 'success');
  }
  
  // Check if we have a valid shortcut (at least one modifier + one key)
  function hasValidShortcut() {
    const modifiers = ['Meta', 'Control', 'Alt', 'Shift'];
    let hasModifier = false;
    let hasKey = false;
    
    pressedKeys.forEach(key => {
      if (modifiers.includes(key)) hasModifier = true;
      else hasKey = true;
    });
    
    return hasModifier && hasKey;
  }
  
  // Load current shortcut on page load
  async function loadShortcut() {
    if (window.braindump?.getShortcut) {
      try {
        const result = await window.braindump.getShortcut();
        if (result?.shortcut) {
          shortcutDisplay.textContent = formatShortcutDisplay(result.shortcut);
        }
      } catch (err) {
        console.error('[SHORTCUT] Failed to load:', err);
      }
    }
  }
  
  // Show the recording modal
  async function showModal() {
    isRecording = true;
    pressedKeys.clear();
    currentAccelerator = null;
    
    // Pause the global shortcut so it doesn't interfere
    if (window.braindump?.pauseShortcut) {
      await window.braindump.pauseShortcut();
    }
    
    // Reset UI
    shortcutBadge.classList.add('recording');
    recordingModal.classList.add('active');
    updateKeysDisplay();
    stopHoldTimer();
    
    // Re-render feather icons for the modal
    if (typeof feather !== 'undefined') {
      feather.replace();
    }
  }
  
  // Hide the recording modal
  async function hideModal(saveNewShortcut = false) {
    isRecording = false;
    shortcutBadge.classList.remove('recording');
    recordingModal.classList.remove('active');
    stopHoldTimer();
    
    // Resume the global shortcut
    if (window.braindump?.resumeShortcut) {
      await window.braindump.resumeShortcut();
    }
    
    // Save the captured shortcut if requested
    if (saveNewShortcut && currentAccelerator) {
      await saveShortcut(currentAccelerator);
    } else {
      loadShortcut();
    }
    
    pressedKeys.clear();
    currentAccelerator = null;
  }
  
  // Save new shortcut
  async function saveShortcut(accelerator) {
    if (!window.braindump?.setShortcut) {
      console.error('[SHORTCUT] No API available');
      loadShortcut();
      return;
    }
    
    try {
      const result = await window.braindump.setShortcut(accelerator);
      if (result?.success) {
        shortcutDisplay.textContent = formatShortcutDisplay(accelerator);
        console.log('[SHORTCUT] Saved:', accelerator);
      } else {
        console.error('[SHORTCUT] Save failed:', result?.error);
        shortcutDisplay.textContent = 'Failed!';
        setTimeout(() => loadShortcut(), 1500);
      }
    } catch (err) {
      console.error('[SHORTCUT] Save error:', err);
      loadShortcut();
    }
  }
  
  // Click on badge to start recording
  shortcutBadge.addEventListener('click', (e) => {
    e.preventDefault();
    if (!isRecording) {
      showModal();
    }
  });
  
  // Cancel button in modal
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideModal(false);
    });
  }
  
  // Click on backdrop to cancel
  recordingModal.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    hideModal(false);
  });
  
  // Keydown handler - add keys and start timer when valid
  document.addEventListener('keydown', (e) => {
    if (!isRecording) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Escape to cancel
    if (e.key === 'Escape') {
      hideModal(false);
      return;
    }
    
    // Normalize key name - use e.code for reliable detection
    let keyName = e.key;
    if (e.code === 'Space') keyName = 'Space';
    else if (e.code.startsWith('Key')) keyName = e.code.replace('Key', '');
    else if (e.code.startsWith('Digit')) keyName = e.code.replace('Digit', '');
    
    // Track modifier keys separately
    if (e.metaKey) pressedKeys.add('Meta');
    if (e.ctrlKey) pressedKeys.add('Control');
    if (e.altKey) pressedKeys.add('Alt');
    if (e.shiftKey) pressedKeys.add('Shift');
    
    // Add the actual key if it's not a pure modifier
    if (!['Meta', 'Control', 'Alt', 'Shift', 'OS'].includes(e.key)) {
      pressedKeys.add(keyName);
    }
    
    // Update display
    updateKeysDisplay();
    
    // Check if we have a valid shortcut and start timer
    if (hasValidShortcut()) {
      currentAccelerator = buildAccelerator();
      if (!holdTimerInterval) {
        startHoldTimer();
      }
    } else {
      stopHoldTimer();
    }
  });
  
  // Keyup handler - if any key is released, reset the timer
  document.addEventListener('keyup', (e) => {
    if (!isRecording) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    // Remove the released key - use e.code for reliable detection
    let keyName = e.key;
    if (e.code === 'Space') keyName = 'Space';
    else if (e.code.startsWith('Key')) keyName = e.code.replace('Key', '');
    else if (e.code.startsWith('Digit')) keyName = e.code.replace('Digit', '');
    
    // For modifiers, check the event flags
    if (!e.metaKey) pressedKeys.delete('Meta');
    if (!e.ctrlKey) pressedKeys.delete('Control');
    if (!e.altKey) pressedKeys.delete('Alt');
    if (!e.shiftKey) pressedKeys.delete('Shift');
    
    // Remove the actual key
    pressedKeys.delete(keyName);
    pressedKeys.delete(e.key);
    
    // Update display
    updateKeysDisplay();
    
    // Reset timer if shortcut is no longer valid
    if (!hasValidShortcut()) {
      stopHoldTimer();
      currentAccelerator = null;
    }
  });
  
  // Reset button
  if (shortcutReset) {
    shortcutReset.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await saveShortcut(DEFAULT_SHORTCUT);
    });
  }
  
  // Load current shortcut on init
  loadShortcut();
  
  // Re-render feather icons for reset button
  if (typeof feather !== 'undefined') {
    feather.replace();
  }
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
  setupSidebarCollapse();
  setupCompleteTaskHandlers();
  setupShortcutRecorder();
  
  // Set default tab view
  switchTab('board');
  
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

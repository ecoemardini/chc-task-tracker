// ============ UI CORE ============
// Toasts, tab switching, debounce, and shared UI utilities.

// --- Debounce Utility ---
function debounce(fn, delay) {
    let timer;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// --- Toast Notifications (with optional undo action) ---
function showToast(message, type = 'success', action = null) {
    // action = { label: 'Undo', callback: () => {...} }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    if (action) {
        toast.innerHTML = `
            <span>${message}</span>
            <button style="margin-left:12px;background:rgba(255,255,255,0.3);border:1px solid rgba(255,255,255,0.5);color:white;padding:3px 10px;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">${action.label}</button>
        `;
        const btn = toast.querySelector('button');
        btn.addEventListener('click', () => {
            action.callback();
            toast.remove();
        });
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 10000); // longer timeout for undo toasts
    } else {
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
}

// --- Tab Switching ---
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById(tabName).classList.add('active');
    const clickedTab = document.querySelector(`.tab-btn[onclick*="${tabName}"]`);
    if (clickedTab) clickedTab.classList.add('active');

    if (tabName === 'dashboard') {
        updateDashboard();
    } else if (tabName === 'log-task') {
        initSpreadsheet();
    } else if (tabName === 'overview') {
        updateOverview();
    } else if (tabName === 'team') {
        updateTeamTab();
    } else if (tabName === 'projects') {
        updateProjectsTab();
    } else if (tabName === 'timeline') {
        updateTimelineTab();
    } else if (tabName === 'all-tasks') {
        updateAllTasksTab();
    } else if (tabName === 'kanban') {
        updateKanbanTab();
    } else if (tabName === 'calendar') {
        updateCalendarTab();
    } else if (tabName === 'settings') {
        updateSettingsTab();
    }
}

// --- Tab Badges ---
function updateTabBadges() {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'Completed').length;

    document.getElementById('badge-log-task').textContent = totalTasks;
    document.getElementById('badge-overview').textContent = completedTasks;
    document.getElementById('badge-all-tasks').textContent = totalTasks;
}

// --- Populate Login Dropdown ---
function populateUserSelect() {
    const userSelect = document.getElementById('userSelect');
    if (!userSelect) return;
    const currentValue = userSelect.value;
    const newHtml = '<option value="">— Select your name —</option>' +
        users.map(u => `<option value="${u.name}">${u.name}${u.role === 'observer' ? ' (Observer)' : ''}</option>`).join('');
    if (userSelect.innerHTML === newHtml) return;
    userSelect.innerHTML = newHtml;
    if (currentValue && users.some(u => u.name === currentValue)) {
        userSelect.value = currentValue;
    }
}

// --- Initialize App UI ---
function initializeApp() {
    updateDashboard();
    updateTabBadges();
}

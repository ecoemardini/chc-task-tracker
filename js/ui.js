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
        updateKanban();
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

// ============ IMPROVEMENT A: SKELETON LOADING ============
function showSkeletonFor(containerId, count = 3) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let skeleton = '';
    for (let i = 0; i < count; i++) {
        skeleton += '<div class="skeleton" style="margin-bottom:12px;"></div>';
    }
    container.innerHTML = skeleton;
}

// ============ IMPROVEMENT C: EMPTY STATE ============
function emptyStateHTML(icon, title, subtitle, ctaText = null, ctaAction = null) {
    let html = `<div class="empty-state-container">
        <svg class="empty-state-icon" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
            ${icon}
        </svg>
        <h3>${title}</h3>
        <p>${subtitle}</p>`;
    if (ctaText && ctaAction) {
        html += `<button class="btn btn-primary empty-state-cta" onclick="${ctaAction}">${ctaText}</button>`;
    }
    html += '</div>';
    return html;
}

// ============ IMPROVEMENT H: KEYBOARD SHORTCUTS ============
function showShortcutsPanel() {
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:10000;`;
    backdrop.onclick = () => { backdrop.remove(); panel.remove(); };

    const panel = document.createElement('div');
    panel.className = 'shortcuts-panel';
    panel.innerHTML = `
        <h2>Keyboard Shortcuts</h2>
        <div class="shortcut-item">
            <span>New Task</span>
            <span class="shortcut-key">N</span>
        </div>
        <div class="shortcut-item">
            <span>Dashboard</span>
            <span class="shortcut-key">D</span>
        </div>
        <div class="shortcut-item">
            <span>All Tasks</span>
            <span class="shortcut-key">T</span>
        </div>
        <div class="shortcut-item">
            <span>Search</span>
            <span class="shortcut-key">/</span>
        </div>
        <div style="margin-top:16px;text-align:center;">
            <button class="btn btn-secondary btn-sm" onclick="this.closest('.shortcuts-panel').parentElement.remove();this.closest('.shortcuts-panel').remove();">Close</button>
        </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(panel);
}

// ============ IMPROVEMENT H: KEYBOARD SHORTCUTS LISTENER ============
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Only when no modal is open and no input is focused
        const modal = document.querySelector('.modal.active');
        const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName);
        if (modal || isInputFocused) return;

        if (e.key === 'n' || e.key === 'N') {
            switchTab('log-task');
            e.preventDefault();
        } else if (e.key === 'd' || e.key === 'D') {
            switchTab('dashboard');
            e.preventDefault();
        } else if (e.key === 't' || e.key === 'T') {
            switchTab('all-tasks');
            e.preventDefault();
        } else if (e.key === '/') {
            document.getElementById('globalSearch')?.focus();
            e.preventDefault();
        } else if (e.key === '?') {
            showShortcutsPanel();
            e.preventDefault();
        }
    });
}

// ============ IMPROVEMENT K: SMART GROUPING ============
function renderGroupedTasks(tasks, groupBy = 'None') {
    if (groupBy === 'None') {
        return renderTasksAsTable(tasks);
    }

    let grouped = {};
    tasks.forEach(task => {
        let key = '';
        switch (groupBy) {
            case 'Person': key = task.person || 'Unassigned'; break;
            case 'Project': key = task.project || 'No Project'; break;
            case 'Status': key = task.status || 'Not Started'; break;
            case 'Priority': key = task.priority || 'Medium'; break;
            case 'Week': key = task.week || 'No Week'; break;
            default: key = 'All';
        }
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(task);
    });

    let html = '';
    Object.keys(grouped).forEach(group => {
        const count = grouped[group].length;
        const groupId = 'group-' + btoa(group);
        html += `<div class="group-header" onclick="toggleGroup('${groupId}')">
            <span class="group-toggle-icon" data-group="${groupId}">▼</span>
            <span>${group}</span>
            <span style="margin-left:auto;color:var(--text-dim);font-size:11px;">${count}</span>
        </div>
        <div id="${groupId}" class="group-content">
            ${renderTasksAsTable(grouped[group])}
        </div>`;
    });
    return html;
}

function toggleGroup(groupId) {
    const content = document.getElementById(groupId);
    const icon = document.querySelector(`[data-group="${groupId}"]`);
    if (content) {
        content.classList.toggle('collapsed');
        if (icon) icon.classList.toggle('collapsed');
    }
}

function renderTasksAsTable(tasks) {
    if (tasks.length === 0) return '<p style="padding:10px;color:var(--text-dim);">No tasks</p>';
    return `<table class="data-table" style="margin:0;">
        <tbody>
            ${tasks.map(t => `<tr>
                <td>${t.person}</td>
                <td>${t.taskTitle}</td>
                <td>${t.project}</td>
                <td><span class="status-badge status-${t.status.toLowerCase().replace(/\s/g,'')}">${t.status}</span></td>
                <td>${t.comments}</td>
            </tr>`).join('')}
        </tbody>
    </table>`;
}

// ============ IMPROVEMENT L: CUSTOMIZABLE DASHBOARD WIDGETS ============
const DASHBOARD_LAYOUT_KEY = 'chc_dashboard_layout';

function saveDashboardLayout() {
    const widgets = document.querySelectorAll('.dash-widget');
    const order = [];
    const visibility = {};
    widgets.forEach((w, idx) => {
        const id = w.id || 'widget-' + idx;
        order.push(id);
        visibility[id] = !w.style.display || w.style.display !== 'none';
    });
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify({ order, visibility }));
}

function loadDashboardLayout() {
    try {
        const saved = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
        if (!saved) return;
        const { visibility } = JSON.parse(saved);
        Object.keys(visibility).forEach(id => {
            const widget = document.getElementById(id);
            if (widget) {
                widget.style.display = visibility[id] ? '' : 'none';
            }
        });
    } catch (e) { console.warn('Failed to load dashboard layout:', e); }
}

function toggleWidgetVisibility(widgetId) {
    const widget = document.getElementById(widgetId);
    if (!widget) return;
    const isHidden = widget.style.display === 'none';
    widget.style.display = isHidden ? '' : 'none';
    saveDashboardLayout();
}

function initDashboardDragDrop() {
    let draggedElement = null;
    const container = document.querySelector('.main');
    if (!container) return;

    document.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('widget-drag-handle')) {
            draggedElement = e.target.closest('.dash-widget');
            draggedElement.classList.add('dragging');
        }
    });

    document.addEventListener('dragend', (e) => {
        if (draggedElement) {
            draggedElement.classList.remove('dragging');
            saveDashboardLayout();
            draggedElement = null;
        }
    });

    document.addEventListener('dragover', (e) => {
        if (!draggedElement) return;
        e.preventDefault();
        const after = getDragAfterElement(container, e.clientY);
        if (after == null) {
            container.appendChild(draggedElement);
        } else {
            container.insertBefore(draggedElement, after);
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.dash-widget:not(.dragging)')];
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Call on initialization
function initDashboardInteractions() {
    loadDashboardLayout();
    initDashboardDragDrop();
}

// ============ TASK MANAGEMENT ============
// Log Task spreadsheet, All Tasks table, filters, CRUD, comments.
// Includes role-based permission enforcement.

// --- Permission Helpers ---
function canEditTask(task) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return task.person === currentUser.name;
}

function canDeleteTask(task) {
    if (!currentUser) return false;
    return currentUser.role === 'admin';
}

// --- Task ID Generation ---
function newTaskId() {
    const rand = Math.random().toString(36).slice(2, 10);
    return 't-' + Date.now().toString(36) + '-' + rand;
}

// --- Log Task Spreadsheet ---
function initSpreadsheet() {
    const tbody = document.getElementById('spreadsheetBody');
    tbody.innerHTML = '';
    for (let i = 0; i < 3; i++) {
        addSpreadsheetRow(true);
    }
    updateRecentTasks();
    updateLogKPIs();
}

function addSpreadsheetRow(silent = false) {
    const tbody = document.getElementById('spreadsheetBody');
    const rowNum = tbody.children.length + 1;
    const row = document.createElement('tr');
    row.innerHTML = `
        <td class="row-number">${rowNum}</td>
        <td>
            <select class="personSelect">
                ${currentUser.role === 'member' ? `<option value="${currentUser.name}">${currentUser.name}</option>` : `<option value="">Select...</option>${users.map(u => `<option value="${u.name}">${u.name}</option>`).join('')}`}
            </select>
        </td>
        <td>
            <div class="combobox-container">
                <input type="text" class="weekInput combobox-input" placeholder="Select week..." data-list="weeks">
                <div class="combobox-dropdown" style="display:none;"></div>
            </div>
        </td>
        <td>
            <select class="projectSelect">
                <option value="">Select...</option>
                ${projects.map(p => `<option value="${p}">${p}</option>`).join('')}
            </select>
        </td>
        <td>
            <div class="combobox-container">
                <input type="text" class="titleInput combobox-input" placeholder="Search/type..." data-list="categories">
                <div class="combobox-dropdown" style="display:none;"></div>
            </div>
        </td>
        <td><textarea style="height: 40px;" class="descInput" placeholder="Describe..."></textarea></td>
        <td>
            <select class="prioritySelect">
                <option value="Low">Low</option>
                <option value="Medium" selected>Medium</option>
                <option value="High">High</option>
            </select>
        </td>
        <td>
            <select class="statusSelect">
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
            </select>
        </td>
        <td><input type="text" class="commentInput" placeholder="Notes..."></td>
        <td>
            <div class="action-buttons">
                <button class="btn btn-sm btn-primary" onclick="duplicateRow(this)">Dup</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRow(this)">Del</button>
            </div>
        </td>
    `;
    tbody.appendChild(row);

    // Auto-fill week on every new row
    row.querySelector('.weekInput').value = getCurrentWeek();

    // Auto-set user for members (enforce: members can only add tasks for themselves)
    if (currentUser.role === 'member') {
        row.querySelector('.personSelect').value = currentUser.name;
    }

    initCombobox(row.querySelector('.weekInput'), weeks);
    initCombobox(row.querySelector('.titleInput'), taskCategories);

    const lastInput = row.querySelector('.commentInput');
    lastInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') {
            saveAllTasks();
            addSpreadsheetRow();
        }
    });
}

function duplicateRow(btn) {
    const row = btn.closest('tr');
    const tbody = row.parentElement;
    const newRow = row.cloneNode(true);
    newRow.querySelector('.titleInput').value = '';
    newRow.querySelector('.descInput').value = '';
    tbody.insertBefore(newRow, row.nextSibling);
    initCombobox(newRow.querySelector('.weekInput'), weeks);
    initCombobox(newRow.querySelector('.titleInput'), taskCategories);
    updateRowNumbers();
}

function deleteRow(btn) {
    btn.closest('tr').remove();
    updateRowNumbers();
}

function updateRowNumbers() {
    const rows = document.querySelectorAll('#spreadsheetBody tr');
    rows.forEach((row, idx) => {
        row.querySelector('.row-number').textContent = idx + 1;
    });
}

// --- Combobox ---
function initCombobox(input, options) {
    const container = input.parentElement;
    const dropdown = container.querySelector('.combobox-dropdown');
    let highlightedIndex = -1;

    function showDropdown(filter = '') {
        const filtered = options.filter(o => o.toLowerCase().includes(filter.toLowerCase()));
        if (filtered.length === 0) { dropdown.style.display = 'none'; return; }
        dropdown.innerHTML = filtered.map(o => `<div class="combobox-option">${o}</div>`).join('');
        dropdown.style.display = 'block';
        highlightedIndex = -1;
        dropdown.querySelectorAll('.combobox-option').forEach(opt => {
            opt.addEventListener('mousedown', () => {
                input.value = opt.textContent;
                dropdown.style.display = 'none';
            });
        });
    }

    input.addEventListener('focus', () => showDropdown(input.value));
    input.addEventListener('input', () => showDropdown(input.value));
    input.addEventListener('blur', () => setTimeout(() => { dropdown.style.display = 'none'; }, 200));

    input.addEventListener('keydown', e => {
        const items = dropdown.querySelectorAll('.combobox-option');
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = Math.min(highlightedIndex + 1, items.length - 1);
            updateHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = Math.max(highlightedIndex - 1, 0);
            updateHighlight();
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
            e.preventDefault();
            input.value = items[highlightedIndex].textContent;
            dropdown.style.display = 'none';
        } else if (e.key === 'Escape') {
            dropdown.style.display = 'none';
        }
    });

    function updateHighlight() {
        const items = dropdown.querySelectorAll('.combobox-option');
        items.forEach((item, idx) => {
            item.classList.toggle('highlighted', idx === highlightedIndex);
        });
    }
}

// --- Save All Tasks ---
let _saveInFlight = false;
function saveAllTasks() {
    if (_saveInFlight) return;
    _saveInFlight = true;

    try {
        const rows = document.querySelectorAll('#spreadsheetBody tr');
        const saved = [];
        const skipped = [];

        rows.forEach(row => {
            const person = row.querySelector('.personSelect').value;
            const week = row.querySelector('.weekInput').value;
            const project = row.querySelector('.projectSelect').value;
            const title = row.querySelector('.titleInput').value;
            const desc = row.querySelector('.descInput').value;
            const priority = row.querySelector('.prioritySelect').value;
            const status = row.querySelector('.statusSelect').value;
            const comments = row.querySelector('.commentInput').value;

            const isBlank = !person && !week && !project && !title && !desc && !comments;
            if (isBlank) return;

            if (!person || !week || !project || !title) {
                skipped.push(row);
                return;
            }

            // Enforce: members can only add tasks for themselves
            if (currentUser.role === 'member' && person !== currentUser.name) {
                showToast(`You can only add tasks for yourself`, 'error');
                skipped.push(row);
                return;
            }

            const now = new Date().toISOString();
            const taskId = newTaskId();
            tasks.push({
                id: taskId,
                person,
                week,
                project,
                taskTitle: title,
                taskDescription: desc,
                priority,
                status,
                comments,
                observerComments: [],
                links: [],
                createdAt: now,
                updatedAt: now
            });
            markTaskDirty(taskId);
            logActivity('create', `"${title}" for ${person.split(' ')[0]} (${project})`);
            saved.push(row);
        });

        if (saved.length === 0 && skipped.length === 0) {
            showToast('Nothing to save â all rows are empty', 'error');
            return;
        }

        saveToLocalStorage();

        saved.forEach(r => r.remove());
        skipped.forEach(r => r.style.outline = '2px solid #ffa94d');
        updateRowNumbers();

        const tbody = document.getElementById('spreadsheetBody');
        if (tbody.children.length === 0) {
            for (let i = 0; i < 3; i++) addSpreadsheetRow(true);
        }

        if (skipped.length > 0) {
            showToast(`Saved ${saved.length} task(s). ${skipped.length} row(s) missing required fields â highlighted.`, 'error');
        } else {
            showToast(`Saved ${saved.length} task(s)`, 'success');
        }

        updateRecentTasks();
        updateLogKPIs();
    } finally {
        setTimeout(() => { _saveInFlight = false; }, 300);
    }
}

function clearSpreadsheet() {
    if (confirm('Clear all rows? (Data will be lost if not saved)')) {
        document.getElementById('spreadsheetBody').innerHTML = '';
        for (let i = 0; i < 3; i++) {
            addSpreadsheetRow(true);
        }
    }
}

function updateRecentTasks() {
    const recent = tasks.slice(-5).reverse();
    const tbody = document.getElementById('recentTasksBody');
    tbody.innerHTML = recent.map(task => {
        const commentText = task.comments ? task.comments.substring(0, 50) + (task.comments.length > 50 ? '...' : '') : '\u2014';
        return `
        <tr>
            <td>${task.person}</td>
            <td>${task.taskTitle}</td>
            <td><span class="project-tag" style="background-color: ${projectColors[task.project] || '#999'};">${task.project && projectLogos[task.project] ? `<img class="project-tag-logo" src="${projectLogos[task.project]}" alt="">` : ''}${task.project}</span></td>
            <td><span class="status-badge status-${task.status.toLowerCase().replace(' ', '')}">${task.status}</span></td>
            <td style="font-size:12px;">${commentText}</td>
            <td style="font-size:12px;">${new Date(task.createdAt).toLocaleDateString()}</td>
        </tr>`;
    }).join('');
}

function updateLogKPIs() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.status === 'Completed').length;
    const inProgress = tasks.filter(t => t.status === 'In Progress').length;
    const highPriority = tasks.filter(t => t.priority === 'High').length;

    document.getElementById('kpi-total-log').textContent = total;
    document.getElementById('kpi-completed-log').textContent = completed;
    document.getElementById('kpi-inprogress-log').textContent = inProgress;
    document.getElementById('kpi-high-log').textContent = highPriority;
}

// --- All Tasks Tab ---
function updateAllTasksTab() {
    if (currentUser.role === 'admin') {
        document.getElementById('bulkCheckHeader').style.display = 'table-cell';
        document.getElementById('bulkUpdateBtn').style.display = 'inline-block';
    } else {
        document.getElementById('bulkCheckHeader').style.display = 'none';
        document.getElementById('bulkUpdateBtn').style.display = 'none';
    }
    populateFilterSelects();
    applyFilters();
}

function populateFilterSelects() {
    const people = [...new Set(tasks.map(t => t.person))].sort();
    const projectsUsed = [...new Set(tasks.map(t => t.project))].sort();
    const weeksUsed = [...new Set(tasks.map(t => t.week))];

    document.getElementById('filterPerson').innerHTML = '<option value="">All People</option>' + people.map(p => `<option value="${p}">${p}</option>`).join('');
    document.getElementById('filterProject').innerHTML = '<option value="">All Projects</option>' + projectsUsed.map(p => `<option value="${p}">${p}</option>`).join('');
    document.getElementById('filterWeek').innerHTML = '<option value="">All Weeks</option>' + weeksUsed.map(w => `<option value="${w}">${w}</option>`).join('');
}

function clearAllFilters() {
    document.getElementById('filterPerson').value = '';
    document.getElementById('filterProject').value = '';
    document.getElementById('filterStatus').value = '';
    document.getElementById('filterWeek').value = '';
    document.getElementById('globalSearch').value = '';
    applyFilters();
}

// Debounced version for search input
const debouncedApplyFilters = debounce(() => applyFilters(), 300);

function applyFilters() {
    const person = document.getElementById('filterPerson').value;
    const project = document.getElementById('filterProject').value;
    const status = document.getElementById('filterStatus').value;
    const week = document.getElementById('filterWeek').value;
    const search = document.getElementById('globalSearch').value.toLowerCase();

    let filtered = tasks.filter(t => {
        if (person && t.person !== person) return false;
        if (project && t.project !== project) return false;
        if (status && t.status !== status) return false;
        if (week && t.week !== week) return false;
        if (search && !(t.taskTitle||'').toLowerCase().includes(search) && !(t.taskDescription||'').toLowerCase().includes(search) && !(t.comments||'').toLowerCase().includes(search)) return false;
        return true;
    });

    filtered.sort((a, b) => {
        const weekIdxA = weeks.indexOf(a.week);
        const weekIdxB = weeks.indexOf(b.week);
        if (weekIdxA !== weekIdxB) return weekIdxB - weekIdxA;
        return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    const tbody = document.getElementById('allTasksBody');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:40px; color:#999;">No tasks match your filters</td></tr>';
        return;
    }

    tbody.innerHTML = filtered.map(task => {
        try {
            const isOwner = task.person === currentUser.name;
            const _canEdit = canEditTask(task);
            const _canDelete = canDeleteTask(task);
            const isObserver = currentUser.role === 'observer';
            const safeId = String(task.id || Date.now()).replace(/'/g, "\\'");
            const commentCount = (task.observerComments || []).length;
            const linkCount = (task.links || []).length;
            const commentPreview = (task.comments || '') ? (task.comments || '').substring(0, 40) + ((task.comments || '').length > 40 ? '...' : '') : '';
            const priority = task.priority || 'Medium';
            const status = task.status || 'Not Started';

            return `
                <tr>
                    ${currentUser.role === 'admin' ? `<td><input type="checkbox" class="checkbox task-checkbox" data-task-id="${safeId}"></td>` : ''}
                    <td>${task.person || ''}</td>
                    <td>${task.taskTitle || ''}</td>
                    <td style="font-size:12px;color:#6b7b8d;max-width:200px;">
                        <div style="display:flex;align-items:center;gap:6px;">
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;" title="${(task.taskDescription||'').replace(/"/g,'&quot;')}">${(task.taskDescription || '').substring(0, 40)}${(task.taskDescription || '').length > 40 ? '...' : ''}</span>
                            ${task.taskDescription ? `<button class="btn btn-sm btn-secondary" style="padding:2px 8px;font-size:11px;white-space:nowrap;" onclick="openDescriptionModal('${safeId}')">View</button>` : ''}
                        </div>
                    </td>
                    <td><span class="project-tag" style="background-color: ${projectColors[task.project] || '#999'};">${task.project && projectLogos[task.project] ? `<img class="project-tag-logo" src="${projectLogos[task.project]}" alt="">` : ''}${task.project || ''}</span></td>
                    <td>${task.week || ''}</td>
                    <td><span class="priority-${priority.toLowerCase()}">${priority}</span></td>
                    <td><span class="status-badge status-${status.toLowerCase().replace(' ', '')}">${status}</span></td>
                    <td style="font-size:12px;color:#6b7b8d;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${(task.comments||'').replace(/"/g,'&quot;')}">${commentPreview}</td>
                    <td>
                        <div class="action-buttons">
                            ${_canEdit ? `<button class="btn btn-sm btn-primary" onclick="openEditTaskModal('${safeId}')">Edit</button>` : ''}
                            ${_canEdit ? `<button class="btn btn-sm btn-secondary" onclick="openRepeatModal('${safeId}')" title="Repeat">&#x21bb;</button>` : ''}
                            ${_canDelete ? `<button class="btn btn-sm btn-danger" onclick="deleteTaskById('${safeId}')">Del</button>` : ''}
                            ${linkCount > 0 ? `<span style="font-size:12px;color:var(--primary-blue);cursor:pointer;" onclick="openEditTaskModal('${safeId}')" title="${linkCount} link(s)">&#x1F517;${linkCount}</span>` : ''}
                            <button class="btn btn-sm btn-secondary" onclick="openCommentModal('${safeId}')">${commentCount > 0 ? '\ud83d\udcac' + commentCount : '\ud83d\udcac'}</button>
                        </div>
                    </td>
                </tr>
            `;
        } catch (e) {
            console.error('Error rendering task row:', e, task);
            return '';
        }
    }).join('');
}

// --- Edit Task Modal ---
function openEditTaskModal(taskId) {
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    if (!canEditTask(task)) {
        showToast('You can only edit your own tasks', 'error');
        return;
    }
    editingTaskId = task.id;
    document.getElementById('editTaskTitle').value = task.taskTitle;
    document.getElementById('editTaskDescription').value = task.taskDescription || '';
    document.getElementById('editTaskPriority').value = task.priority;
    document.getElementById('editTaskStatus').value = task.status;
    // Render existing links
    _editTaskLinks = (task.links || []).slice();
    renderEditTaskLinks();
    document.getElementById('editTaskNewLinkUrl').value = '';
    document.getElementById('editTaskNewLinkLabel').value = '';
    document.getElementById('editTaskModal').classList.add('active');
}

function closeEditTaskModal() {
    document.getElementById('editTaskModal').classList.remove('active');
    editingTaskId = null;
    _editTaskLinks = [];
}

// --- Link Management in Edit Modal ---
let _editTaskLinks = [];

function renderEditTaskLinks() {
    const container = document.getElementById('editTaskLinksContainer');
    if (!container) return;
    if (_editTaskLinks.length === 0) {
        container.innerHTML = '<p style="font-size:12px;color:var(--text-dim);">No links yet</p>';
        return;
    }
    container.innerHTML = _editTaskLinks.map((link, i) => {
        const label = link.label || _shortenUrl(link.url);
        return `<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid #f0f4f8;">
            <span style="font-size:16px;">&#x1F517;</span>
            <a href="${link.url}" target="_blank" rel="noopener" style="flex:1;font-size:12px;color:var(--primary-blue);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${label}</a>
            <button class="btn btn-sm btn-danger" style="padding:2px 6px;font-size:10px;" onclick="removeLinkFromEditTask(${i})">Ã</button>
        </div>`;
    }).join('');
}

function addLinkToEditTask() {
    const url = document.getElementById('editTaskNewLinkUrl').value.trim();
    const label = document.getElementById('editTaskNewLinkLabel').value.trim();
    if (!url) { showToast('Please enter a URL', 'error'); return; }
    // Basic URL validation
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        showToast('URL should start with http:// or https://', 'error');
        return;
    }
    _editTaskLinks.push({ url, label: label || '' });
    renderEditTaskLinks();
    document.getElementById('editTaskNewLinkUrl').value = '';
    document.getElementById('editTaskNewLinkLabel').value = '';
}

function removeLinkFromEditTask(index) {
    _editTaskLinks.splice(index, 1);
    renderEditTaskLinks();
}

function _shortenUrl(url) {
    try {
        const u = new URL(url);
        return u.hostname + (u.pathname.length > 20 ? u.pathname.substring(0, 20) + '...' : u.pathname);
    } catch { return url.substring(0, 40); }
}

function saveEditedTask() {
    const task = tasks.find(t => String(t.id) === String(editingTaskId));
    if (!task) return;
    if (!canEditTask(task)) {
        showToast('You can only edit your own tasks', 'error');
        return;
    }
    const oldStatus = task.status;
    task.taskTitle = document.getElementById('editTaskTitle').value;
    task.taskDescription = document.getElementById('editTaskDescription').value;
    task.priority = document.getElementById('editTaskPriority').value;
    task.status = document.getElementById('editTaskStatus').value;
    task.links = _editTaskLinks.slice();
    task.updatedAt = new Date().toISOString();
    markTaskDirty(task.id);
    if (oldStatus !== task.status) {
        logActivity('status', `"${task.taskTitle}" ${oldStatus} â ${task.status}`);
    } else {
        logActivity('edit', `"${task.taskTitle}" edited`);
    }
    saveToLocalStorage();
    showToast('Task updated', 'success');
    closeEditTaskModal();
    applyFilters();
}

// --- Delete Task (with 10-second undo) ---
function deleteTaskById(taskId) {
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    if (!canDeleteTask(task)) {
        showToast('Only admins can delete tasks', 'error');
        return;
    }

    // Remove from array immediately for visual feedback
    const removedTask = { ...task };
    const removedIndex = tasks.indexOf(task);
    tasks.splice(removedIndex, 1);
    _originalSave(); // save locally but DON'T trigger sync yet

    applyFilters();
    updateLogKPIs();

    // Show undo toast â tombstone is NOT created yet
    const undoTimer = setTimeout(() => {
        // Undo window expired â finalize deletion
        addTombstone(taskId);
        markTaskDirty(taskId);
        logActivity('delete', `"${removedTask.taskTitle}" by ${removedTask.person.split(' ')[0]} deleted`);
        saveToLocalStorage(); // this triggers sync
        updateTabBadges();
    }, 10000);

    showToast(`Deleted "${removedTask.taskTitle}"`, 'success', {
        label: 'Undo',
        callback: () => {
            clearTimeout(undoTimer);
            // Restore the task
            tasks.splice(removedIndex, 0, removedTask);
            _originalSave();
            applyFilters();
            updateLogKPIs();
            showToast('Task restored', 'success');
        }
    });
}

// --- Description Modal ---
function openDescriptionModal(taskId) {
    const task = tasks.find(t => String(t.id) === String(taskId));
    if (!task) return;
    document.getElementById('descModalPerson').textContent = task.person || '';
    document.getElementById('descModalTaskTitle').textContent = task.taskTitle || '';
    document.getElementById('descModalBody').textContent = task.taskDescription || '(No description)';
    document.getElementById('descriptionModal').classList.add('active');
}

function closeDescriptionModal() {
    document.getElementById('descriptionModal').classList.remove('active');
}

// --- Bulk Operations ---
function getFilteredTasks() {
    const person = document.getElementById('filterPerson').value;
    const project = document.getElementById('filterProject').value;
    const status = document.getElementById('filterStatus').value;
    const week = document.getElementById('filterWeek').value;
    const search = document.getElementById('globalSearch').value.toLowerCase();

    return tasks.filter(t => {
        if (person && t.person !== person) return false;
        if (project && t.project !== project) return false;
        if (status && t.status !== status) return false;
        if (week && t.week !== week) return false;
        if (search && !(t.taskTitle||'').toLowerCase().includes(search) && !(t.taskDescription||'').toLowerCase().includes(search) && !(t.comments||'').toLowerCase().includes(search)) return false;
        return true;
    });
}

function showBulkUpdate() {
    const checked = document.querySelectorAll('.task-checkbox:checked');
    const taskIds = Array.from(checked).map(c => c.dataset.taskId);

    if (taskIds.length === 0) {
        showToast('Select at least one task', 'error');
        return;
    }

    if (confirm(`Mark ${taskIds.length} task(s) as Completed?`)) {
        taskIds.forEach(id => {
            const task = tasks.find(t => String(t.id) === String(id));
            if (task) {
                task.status = 'Completed';
                task.updatedAt = new Date().toISOString();
            }
        });
        saveToLocalStorage();
        showToast(`${taskIds.length} task(s) completed`, 'success');
        applyFilters();
        updateOverview();
        updateTabBadges();
    }
}

function toggleSelectAll() {
    const checked = document.getElementById('selectAllCheckbox').checked;
    document.querySelectorAll('.task-checkbox').forEach(cb => cb.checked = checked);
}

function exportFilteredTasks() {
    const filtered = getFilteredTasks();
    let csv = 'Person,Task Title,Project,Week,Priority,Status,Description,Comments\n';
    filtered.forEach(t => {
        csv += `"${t.person}","${t.taskTitle}","${t.project}","${t.week}","${t.priority}","${t.status}","${t.taskDescription}","${t.comments}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tasks_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
}

// --- Comments ---
function openCommentModal(taskId) {
    commentingTaskId = taskId;
    const task = tasks.find(t => String(t.id) === String(taskId));
    const list = document.getElementById('commentList');
    list.innerHTML = (task.observerComments || []).map(c => `
        <div class="comment-item">
            <div class="comment-author">${c.author} <span class="comment-time">${new Date(c.timestamp).toLocaleString()}</span></div>
            <div class="comment-text">${c.text}</div>
        </div>
    `).join('') || '<p style="color:#999; text-align:center;">No comments yet</p>';
    document.getElementById('commentModal').classList.add('active');
}

function closeCommentModal() {
    document.getElementById('commentModal').classList.remove('active');
    commentingTaskId = null;
    document.getElementById('commentInput').value = '';
}

function addComment() {
    const text = document.getElementById('commentInput').value.trim();
    if (!text) return;
    const task = tasks.find(t => String(t.id) === String(commentingTaskId));
    if (!task) return;
    if (!task.observerComments) task.observerComments = [];
    task.observerComments.push({
        author: currentUser.name,
        text,
        timestamp: new Date().toISOString()
    });
    markTaskDirty(task.id);
    saveToLocalStorage();

    // Notify the task owner if someone else commented
    if (task.person && task.person !== currentUser.name) {
        const shortText = text.length > 50 ? text.substring(0, 50) + '...' : text;
        addNotification(
            task.person,
            `${currentUser.name.split(' ')[0]} commented on your task "${task.taskTitle}": "${shortText}"`,
            task.id
        );
    }

    logActivity('comment', `${currentUser.name.split(' ')[0]} commented on "${task.taskTitle}"`);
    showToast('Comment added', 'success');
    document.getElementById('commentInput').value = '';
    openCommentModal(commentingTaskId);
}

// --- Repeat Task (Recurring) ---
let repeatingTaskId = null;

function openRepeatModal(taskId) {
    repeatingTaskId = taskId;
    document.getElementById('repeatFrequency').value = 'weekly';
    document.getElementById('repeatCount').value = '4';
    document.getElementById('repeatModal').classList.add('active');
}

function closeRepeatModal() {
    document.getElementById('repeatModal').classList.remove('active');
    repeatingTaskId = null;
}

function executeRepeat() {
    const task = tasks.find(t => String(t.id) === String(repeatingTaskId));
    if (!task) { closeRepeatModal(); return; }

    const freq = document.getElementById('repeatFrequency').value;
    const count = parseInt(document.getElementById('repeatCount').value) || 1;
    if (count < 1 || count > 52) { showToast('Enter a count between 1 and 52', 'error'); return; }

    // Parse the task's week to find a base date
    // Week format: "20â24 Apr 2026" â we need the Monday date
    const baseMonday = parseWeekToMonday(task.week);
    if (!baseMonday) {
        showToast('Could not parse the task week. Try a different task.', 'error');
        closeRepeatModal();
        return;
    }

    let created = 0;
    for (let i = 1; i <= count; i++) {
        const nextMonday = new Date(baseMonday);
        if (freq === 'weekly') {
            nextMonday.setDate(baseMonday.getDate() + 7 * i);
        } else if (freq === 'biweekly') {
            nextMonday.setDate(baseMonday.getDate() + 14 * i);
        } else if (freq === 'monthly') {
            nextMonday.setMonth(baseMonday.getMonth() + i);
            // Snap to Monday
            const day = nextMonday.getDay();
            const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day;
            nextMonday.setDate(nextMonday.getDate() + diff);
        }

        const weekLabel = findWeekLabel(nextMonday);
        if (!weekLabel) continue; // outside generated week range

        const now = new Date().toISOString();
        const rid = newTaskId();
        tasks.push({
            id: rid,
            person: task.person,
            week: weekLabel,
            project: task.project,
            taskTitle: task.taskTitle,
            taskDescription: task.taskDescription || '',
            priority: task.priority,
            status: 'Not Started',
            comments: '',
            observerComments: [],
            links: task.links ? task.links.slice() : [],
            createdAt: now,
            updatedAt: now
        });
        markTaskDirty(rid);
        created++;
    }

    if (created > 0) {
        logActivity('repeat', `"${task.taskTitle}" repeated ${created}x (${freq})`);
        saveToLocalStorage();
        showToast(`Created ${created} recurring task(s)`, 'success');
        applyFilters();
    } else {
        showToast('No weeks matched â the date range may be outside the generated weeks.', 'error');
    }
    closeRepeatModal();
}

function parseWeekToMonday(weekStr) {
    // Format: "20â24 Apr 2026" or "28 Aprâ2 May 2026"
    if (!weekStr) return null;
    try {
        // Try to extract the first day + month + year
        const clean = weekStr.replace(/â/g, '-').replace(/â/g, '-');
        const parts = clean.split('-');
        const firstPart = parts[0].trim(); // "20" or "28 Apr"
        const secondPart = parts[1].trim(); // "24 Apr 2026" or "2 May 2026"

        // Extract month and year from the second part
        const match2 = secondPart.match(/(\d+)\s+(\w+)\s+(\d{4})/);
        if (!match2) return null;

        const endMonth = match2[2];
        const year = parseInt(match2[3]);

        // First part might have its own month or just a number
        const match1 = firstPart.match(/(\d+)\s*(\w*)/);
        if (!match1) return null;

        const startDay = parseInt(match1[1]);
        const startMonth = match1[2] || endMonth;

        const months = { 'Jan':0,'Feb':1,'Mar':2,'Apr':3,'May':4,'Jun':5,'Jul':6,'Aug':7,'Sep':8,'Oct':9,'Nov':10,'Dec':11 };
        const monthIdx = months[startMonth];
        if (monthIdx === undefined) return null;

        return new Date(year, monthIdx, startDay);
    } catch { return null; }
}

function findWeekLabel(date) {
    // Find the week in `weeks` array that contains this date
    // Weeks are like "20â24 Apr 2026"
    for (const w of weeks) {
        const mon = parseWeekToMonday(w);
        if (!mon) continue;
        // Check if dates are in the same week (Monday)
        if (mon.getFullYear() === date.getFullYear() &&
            mon.getMonth() === date.getMonth() &&
            mon.getDate() === date.getDate()) {
            return w;
        }
    }
    return null;
}

// ============ QUICK ENTRY ============
// Paste a freeform task list â auto-parse into structured tasks.

let _qeParsedTasks = [];

function openQuickEntry() {
    document.getElementById('qeRawInput').value = '';
    document.getElementById('qeStep1').style.display = '';
    document.getElementById('qeStep2').style.display = 'none';
    document.getElementById('qeDefaultStatus').value = 'In Progress';
    document.getElementById('qeDefaultPriority').value = 'Medium';
    _qeParsedTasks = [];
    document.getElementById('quickEntryModal').classList.add('active');
}

function closeQuickEntry() {
    document.getElementById('quickEntryModal').classList.remove('active');
    _qeParsedTasks = [];
}

function backToQeStep1() {
    document.getElementById('qeStep1').style.display = '';
    document.getElementById('qeStep2').style.display = 'none';
}

function parseQuickEntry() {
    const raw = document.getElementById('qeRawInput').value.trim();
    if (!raw) { showToast('Please paste your task list first', 'error'); return; }

    const defaultStatus = document.getElementById('qeDefaultStatus').value;
    const defaultPriority = document.getElementById('qeDefaultPriority').value;

    // Split into lines, strip numbering and bullets
    const lines = raw.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .map(l => l.replace(/^\d+[\.\)\-\:]\s*/, '').replace(/^[\-\â¢\*\>]\s*/, '').trim())
        .filter(l => l.length > 2);

    if (lines.length === 0) { showToast('No tasks found in the text', 'error'); return; }

    _qeParsedTasks = lines.map(line => {
        const detected = _detectFromText(line);
        // Clean description: strip trailing status/priority tags but keep project names
        var desc = line;
        desc = desc.replace(/\s*[-ââ]\s*(done|finished|completed|complete|submitted|sent|delivered|resolved|closed|in progress|working on|started|ongoing|wip|doing|active|not started|todo|to do|pending|waiting|blocked|on hold|later|urgent|asap|critical|high priority|important|top priority|low priority|not urgent|high|medium|low)\s*$/i, '');
        desc = desc.replace(/\(\s*(done|completed|in progress|urgent|high priority|low priority|not started|pending|finished|important)\s*\)/gi, '');
        desc = desc.replace(/\s+/g, ' ').replace(/^[\s,\-ââ:]+|[\s,\-ââ:]+$/g, '').trim();
        return {
            title: detected.category || '',
            description: desc || line,
            project: detected.project,
            category: detected.category,
            priority: detected.priority || defaultPriority,
            status: detected.status || defaultStatus,
            person: currentUser.name
        };
    });

    _renderQeParsed();
    document.getElementById('qeStep1').style.display = 'none';
    document.getElementById('qeStep2').style.display = '';
}

function _detectFromText(text) {
    var result = { title: '', project: '', category: '', priority: 'Medium', status: 'Not Started' };
    var lower = text.toLowerCase();

    // ====== DETECT STATUS ======
    // Check longer/compound phrases FIRST to avoid "started" matching before "not started"
    var statusFound = false;
    var notStartedWords = ['not started', 'todo', 'to do', 'to-do', 'pending', 'waiting', 'blocked', 'on hold', 'later', 'backlog', 'not begun'];
    var completedWords = ['done', 'finished', 'completed', 'complete', 'submitted', 'sent', 'delivered', 'resolved', 'closed'];
    var inProgressWords = ['in progress', 'working on', 'ongoing', 'wip', 'doing', 'active', 'drafting', 'preparing', 'started'];

    for (var sn = 0; sn < notStartedWords.length; sn++) {
        if (lower.indexOf(notStartedWords[sn]) !== -1) { result.status = 'Not Started'; statusFound = true; break; }
    }
    if (!statusFound) {
        for (var si = 0; si < completedWords.length; si++) {
            if (lower.indexOf(completedWords[si]) !== -1) { result.status = 'Completed'; statusFound = true; break; }
        }
    }
    if (!statusFound) {
        for (var sj = 0; sj < inProgressWords.length; sj++) {
            if (lower.indexOf(inProgressWords[sj]) !== -1) { result.status = 'In Progress'; statusFound = true; break; }
        }
    }

    // ====== DETECT PRIORITY ======
    var highWords = ['urgent', 'asap', 'critical', 'immediately', 'high priority', 'important', '!!!', 'top priority', 'deadline'];
    var lowWords = ['low priority', 'when possible', 'nice to have', 'eventually', 'if time', 'not urgent', 'whenever'];

    for (var hi = 0; hi < highWords.length; hi++) {
        if (lower.indexOf(highWords[hi]) !== -1) { result.priority = 'High'; break; }
    }
    if (result.priority === 'Medium') {
        for (var li = 0; li < lowWords.length; li++) {
            if (lower.indexOf(lowWords[li]) !== -1) { result.priority = 'Low'; break; }
        }
    }

    // ====== DETECT PROJECT ======
    var projectAliases = {};
    for (var pi = 0; pi < projects.length; pi++) {
        var p = projects[pi];
        projectAliases[p.toLowerCase()] = p;
        var noSpace = p.replace(/\s+/g, '').toLowerCase();
        projectAliases[noSpace] = p;
        var noParen = p.replace(/\s*\(.*\)/, '').toLowerCase();
        if (noParen !== p.toLowerCase()) projectAliases[noParen] = p;
    }
    // Manual aliases
    var spaceProj = '';
    var presidProj = '';
    var cppProj = '';
    var costProj = '';
    for (var ai = 0; ai < projects.length; ai++) {
        var pl = projects[ai].toLowerCase();
        if (!spaceProj && pl.indexOf('space') !== -1) spaceProj = projects[ai];
        if (!presidProj && pl.indexOf('presid') !== -1) presidProj = projects[ai];
        if (!cppProj && pl.indexOf('cpp') !== -1) cppProj = projects[ai];
        if (!costProj && pl.indexOf('cost') !== -1) costProj = projects[ai];
    }
    if (spaceProj) { projectAliases['spacebic'] = spaceProj; projectAliases['space bic'] = spaceProj; }
    if (presidProj) { projectAliases['eu presidency'] = presidProj; projectAliases['presidency'] = presidProj; }
    if (cppProj) { projectAliases['cpp4all'] = cppProj; }
    if (costProj) { projectAliases['cost'] = costProj; }

    // Sort aliases longest first, check with word boundaries for short names
    var aliasKeys = Object.keys(projectAliases).sort(function(a, b) { return b.length - a.length; });
    for (var ak = 0; ak < aliasKeys.length; ak++) {
        var alias = aliasKeys[ak];
        if (!alias) continue;
        if (alias.length <= 4) {
            var wordBound = new RegExp('\\b' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
            if (wordBound.test(text)) { result.project = projectAliases[alias]; break; }
        } else {
            if (lower.indexOf(alias) !== -1) { result.project = projectAliases[alias]; break; }
        }
    }
    // Default to Other Tasks
    if (!result.project) result.project = 'Other Tasks';

    // ====== DETECT CATEGORY ======
    var categoryKeywords = {
        'review budget': 'Administrative Follow-up',
        'review report': 'Reports (internal, external, events, etc.)',
        'review proposal': 'Proposal Writing / Preparation',
        'consortium meeting': 'Consortium Meeting',
        'stakeholder meeting': 'Stakeholder Meeting',
        'send invitation': 'Event Planning & Logistics',
        'purchase request': 'Administrative Follow-up',
        'send email': 'Administrative Follow-up',
        'social media': 'Social Media Content Preparation',
        'press release': 'Press Release / Public Communication',
        'follow up': 'Administrative Follow-up',
        'follow-up': 'Administrative Follow-up',
        'book taxi': 'Travel Coordination',
        'roll-up': 'Event Planning & Logistics',
        'meeting': 'Internal Meeting',
        'email': 'Administrative Follow-up',
        'admin': 'Administrative Follow-up',
        'invitation': 'Event Planning & Logistics',
        'badge': 'Event Planning & Logistics',
        'catering': 'Event Planning & Logistics',
        'taxi': 'Travel Coordination',
        'travel': 'Travel Coordination',
        'flight': 'Travel Coordination',
        'hotel': 'Travel Coordination',
        'booking': 'Travel Coordination',
        'purchase': 'Administrative Follow-up',
        'invoice': 'Administrative Follow-up',
        'presentation': 'Preparation of Presentations',
        'slides': 'Preparation of Presentations',
        'html': 'Digital Tool / Platform Development',
        'website': 'Database / Website Development',
        'database': 'Database / Website Development',
        'report': 'Reports (internal, external, events, etc.)',
        'deliverable': 'Reports (internal, external, events, etc.)',
        'paper': 'Manuscript Writing/Review/Proofreading',
        'manuscript': 'Manuscript Writing/Review/Proofreading',
        'review': 'Manuscript Writing/Review/Proofreading',
        'proofread': 'Manuscript Writing/Review/Proofreading',
        'abstract': 'Abstract / Proposal Submission',
        'proposal': 'Proposal Writing / Preparation',
        'budget': 'Administrative Follow-up',
        'financial': 'Administrative Follow-up',
        'finance': 'Administrative Follow-up',
        'timesheet': 'Administrative Follow-up',
        'twitter': 'Social Media Content Preparation',
        'linkedin': 'Social Media Content Preparation',
        'training': 'Training & Courses',
        'course': 'Training & Courses',
        'bootcamp': 'Training & Courses',
        'workshop': 'Training & Courses',
        'fieldwork': 'Research Development',
        'survey': 'Research Development',
        'analysis': 'Data Research & Analysis',
        'mou': 'MoU / Agreement Preparation',
        'agreement': 'MoU / Agreement Preparation',
        'ethics': 'Administrative Follow-up',
        'dissemination': 'Dissemination & Outreach',
        'outreach': 'Dissemination & Outreach',
        'pilot': 'Pilot Projects',
        'event': 'Event Planning & Logistics',
        'attend': 'Event Participation',
        'participate': 'Event Participation',
        'conference': 'Event Participation',
        'banner': 'Event Planning & Logistics',
        'coordinate': 'Project Coordination',
        'schedule': 'Project Planning & Scheduling',
        'plan': 'Project Planning & Scheduling'
    };
    var kwKeys = Object.keys(categoryKeywords).sort(function(a, b) { return b.length - a.length; });
    for (var ki = 0; ki < kwKeys.length; ki++) {
        if (lower.indexOf(kwKeys[ki]) !== -1) { result.category = categoryKeywords[kwKeys[ki]]; break; }
    }

    // ====== BUILD CLEAN TITLE ======
    var title = text;

    // 1) Strip trailing status/priority tags (e.g. "- done", "- urgent", "- high priority")
    title = title.replace(/\s*[-ââ]\s*(done|finished|completed|complete|submitted|sent|delivered|resolved|closed|in progress|working on|started|ongoing|wip|doing|active|not started|todo|to do|pending|waiting|blocked|on hold|later|urgent|asap|critical|high priority|important|top priority|low priority|not urgent|high|medium|low)\s*$/i, '');
    // 2) Strip parenthetical tags like (done), (urgent), (in progress)
    title = title.replace(/\(\s*(done|completed|in progress|urgent|high priority|low priority|not started|pending|finished|important)\s*\)/gi, '');

    // 3) Remove project name from title (redundant since it's in the dropdown)
    if (result.project && result.project !== 'Other Tasks') {
        var projEsc = result.project.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Remove "for PROJECT" or just "PROJECT"
        title = title.replace(new RegExp('\\s+for\\s+' + projEsc, 'gi'), '');
        title = title.replace(new RegExp('\\b' + projEsc + '\\b', 'gi'), '');
    }

    // 4) Clean up artifacts: trailing "for", double spaces, leading/trailing punctuation
    title = title.replace(/\s+for\s*$/i, '');
    title = title.replace(/\s+/g, ' ').replace(/^[\s,\-ââ:]+|[\s,\-ââ:]+$/g, '').trim();

    // 5) Truncate if too long
    if (title.length > 70) {
        title = title.substring(0, 70).replace(/\s\S*$/, '') + '...';
    }

    // Fallback
    if (!title && result.category) title = result.category;
    result.title = title || text.substring(0, 60);

    return result;
}

function _renderQeParsed() {
    const container = document.getElementById('qeParsedList');
    document.getElementById('qeCount').textContent = _qeParsedTasks.length;

    container.innerHTML = _qeParsedTasks.map((t, i) => {
        // Build project options, include "Other Tasks" if not already in the list
        const projList = projects.includes('Other Tasks') ? projects : [...projects, 'Other Tasks'];
        const projOptions = '<option value="">â None â</option>' + projList.map(p =>
            `<option value="${p}" ${p === t.project ? 'selected' : ''}>${p}</option>`
        ).join('');

        // Task Title = dropdown of existing taskCategories (not freeform)
        const titleOptions = '<option value="">â Select Title â</option>' + taskCategories.map(c =>
            `<option value="${c}" ${c === t.title ? 'selected' : ''}>${c}</option>`
        ).join('');

        const titleDetected = t.title ? 'style="border-color:rgba(0,174,239,0.5);"' : 'style="border-color:#e74c3c;"';

        const projDetected = (t.project && t.project !== 'Other Tasks') ? `style="background:rgba(0,174,239,0.08);border:1px solid rgba(0,174,239,0.3);"` : '';

        return `<div class="qe-card" ${projDetected} data-idx="${i}" style="padding:12px;border-radius:8px;border:1px solid #e0e7f1;margin-bottom:8px;background:var(--surface-white);">
            <div style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;">
                <span style="color:var(--text-dim);font-weight:700;font-size:12px;min-width:20px;">${i + 1}</span>
                <div style="flex:1;">
                    <select class="qe-title" ${titleDetected} style="width:100%;font-weight:600;font-size:13px;border:1px solid #e0e7f1;border-radius:6px;padding:6px 8px;margin-bottom:4px;">${titleOptions}</select>
                    <div style="font-size:11px;color:var(--text-dim);line-height:1.4;max-height:36px;overflow:hidden;margin-top:2px;">ð ${t.description}</div>
                </div>
                <button class="btn btn-sm btn-danger" onclick="removeQeTask(${i})" style="padding:2px 8px;font-size:11px;">Ã</button>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <select class="qe-project" style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid #e0e7f1;">${projOptions}</select>
                <select class="qe-priority" style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid #e0e7f1;">
                    <option value="Low" ${t.priority === 'Low' ? 'selected' : ''}>Low</option>
                    <option value="Medium" ${t.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                    <option value="High" ${t.priority === 'High' ? 'selected' : ''}>High</option>
                </select>
                <select class="qe-status" style="font-size:11px;padding:3px 6px;border-radius:6px;border:1px solid #e0e7f1;">
                    <option value="Not Started" ${t.status === 'Not Started' ? 'selected' : ''}>Not Started</option>
                    <option value="In Progress" ${t.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
                    <option value="Completed" ${t.status === 'Completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
        </div>`;
    }).join('');
}

function removeQeTask(index) {
    _qeParsedTasks.splice(index, 1);
    _renderQeParsed();
}

function saveQuickEntryTasks() {
    // Read values from DOM (user may have edited them)
    const cards = document.querySelectorAll('#qeParsedList .qe-card');
    const curWeek = getCurrentWeek();
    let saved = 0;

    cards.forEach((card, i) => {
        const title = card.querySelector('.qe-title').value;
        const project = card.querySelector('.qe-project').value;
        const priority = card.querySelector('.qe-priority').value;
        const status = card.querySelector('.qe-status').value;
        const description = _qeParsedTasks[i] ? _qeParsedTasks[i].description : '';

        if (!title) return;

        const finalTitle = title;

        const now = new Date().toISOString();
        const taskId = newTaskId();
        tasks.push({
            id: taskId,
            person: currentUser.name,
            week: curWeek,
            project: project,
            taskTitle: finalTitle,
            taskDescription: description,
            priority: priority,
            status: status,
            comments: '',
            observerComments: [],
            links: [],
            createdAt: now,
            updatedAt: now
        });
        markTaskDirty(taskId);
        saved++;
    });

    if (saved > 0) {
        logActivity('create', `Quick Entry: ${saved} task(s) added`);
        saveToLocalStorage();
        showToast(`Created ${saved} task(s) via Quick Entry`, 'success');
        updateRecentTasks();
        updateLogKPIs();
        updateTabBadges();
    }

    closeQuickEntry();
}

// ============ IMPROVEMENT G: INLINE TASK EDITING ============
let _selectedTaskIds = new Set();

function toggleTaskStatus(taskId, currentStatus) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !canEditTask(task)) return;

    const statusCycle = ['Not Started', 'In Progress', 'Completed'];
    const currentIdx = statusCycle.indexOf(currentStatus);
    const nextIdx = (currentIdx + 1) % statusCycle.length;
    task.status = statusCycle[nextIdx];
    markTaskDirty(taskId);
    saveToLocalStorage();
    applyFilters();
    showToast(`Status changed to "${task.status}"`, 'success');
}

function toggleTaskPriority(taskId, currentPriority) {
    const task = tasks.find(t => t.id === taskId);
    if (!task || !canEditTask(task)) return;

    const priorityCycle = ['Low', 'Medium', 'High'];
    const currentIdx = priorityCycle.indexOf(currentPriority);
    const nextIdx = (currentIdx + 1) % priorityCycle.length;
    task.priority = priorityCycle[nextIdx];
    markTaskDirty(taskId);
    saveToLocalStorage();
    applyFilters();
    showToast(`Priority changed to "${task.priority}"`, 'success');
}

// ============ IMPROVEMENT I: BULK ACTIONS ============
function toggleTaskSelection(taskId) {
    if (_selectedTaskIds.has(taskId)) {
        _selectedTaskIds.delete(taskId);
    } else {
        _selectedTaskIds.add(taskId);
    }
    updateBulkToolbar();
}

function toggleSelectAll() {
    const checkbox = document.getElementById('selectAllCheckbox');
    const tbody = document.getElementById('allTasksBody');
    const rows = tbody.querySelectorAll('tr');
    if (checkbox.checked) {
        rows.forEach(row => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) {
                const taskId = checkbox.value;
                _selectedTaskIds.add(taskId);
                checkbox.checked = true;
            }
        });
    } else {
        _selectedTaskIds.clear();
        rows.forEach(row => {
            const checkbox = row.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = false;
        });
    }
    updateBulkToolbar();
}

function updateBulkToolbar() {
    const count = _selectedTaskIds.size;
    let toolbar = document.getElementById('bulkToolbar');
    
    if (count > 0) {
        if (!toolbar) {
            toolbar = document.createElement('div');
            toolbar.id = 'bulkToolbar';
            toolbar.className = 'bulk-toolbar';
            document.body.appendChild(toolbar);
        }
        toolbar.innerHTML = `
            <div class="selected-count">${count} selected</div>
            <button class="btn btn-sm btn-success" onclick="bulkMarkComplete()">Mark Complete</button>
            <button class="btn btn-sm btn-primary" onclick="bulkMarkInProgress()">Mark In Progress</button>
            <button class="btn btn-sm btn-danger" onclick="bulkDeleteSelected()">Delete</button>
            <button class="btn btn-sm btn-secondary" onclick="bulkClearSelection()">Clear</button>
        `;
    } else if (toolbar) {
        toolbar.remove();
    }
}

function bulkMarkComplete() {
    let count = 0;
    _selectedTaskIds.forEach(taskId => {
        const task = tasks.find(t => t.id === taskId);
        if (task && canEditTask(task)) {
            task.status = 'Completed';
            markTaskDirty(taskId);
            count++;
        }
    });
    saveToLocalStorage();
    applyFilters();
    _selectedTaskIds.clear();
    updateBulkToolbar();
    showToast(`${count} task(s) marked complete`, 'success');
}

function bulkMarkInProgress() {
    let count = 0;
    _selectedTaskIds.forEach(taskId => {
        const task = tasks.find(t => t.id === taskId);
        if (task && canEditTask(task)) {
            task.status = 'In Progress';
            markTaskDirty(taskId);
            count++;
        }
    });
    saveToLocalStorage();
    applyFilters();
    _selectedTaskIds.clear();
    updateBulkToolbar();
    showToast(`${count} task(s) marked in progress`, 'success');
}

function bulkDeleteSelected() {
    if (_selectedTaskIds.size === 0) return;
    if (!confirm(`Delete ${_selectedTaskIds.size} task(s)? This cannot be undone.`)) return;

    let count = 0;
    _selectedTaskIds.forEach(taskId => {
        const task = tasks.find(t => t.id === taskId);
        if (task && canDeleteTask(task)) {
            addTombstone(taskId);
            tasks = tasks.filter(t => t.id !== taskId);
            count++;
        }
    });
    saveToLocalStorage();
    applyFilters();
    _selectedTaskIds.clear();
    updateBulkToolbar();
    showToast(`${count} task(s) deleted`, 'success');
}

function bulkClearSelection() {
    _selectedTaskIds.clear();
    document.querySelectorAll('#allTasksBody input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.getElementById('selectAllCheckbox').checked = false;
    updateBulkToolbar();
}

// ============ IMPROVEMENT J: TASK PINNING ============
function toggleTaskPin(taskId) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    task.pinned = !task.pinned;
    markTaskDirty(taskId);
    saveToLocalStorage();
    applyFilters();
    showToast(task.pinned ? 'Task pinned' : 'Task unpinned', 'success');
}

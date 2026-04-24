// ============ KANBAN BOARD VIEW ============
// Drag-and-drop Kanban board with status columns: Not Started, In Progress, Completed
// Non-admin users see only their own tasks; admins can filter by person.

// --- Initialize Kanban Tab ---
function updateKanbanTab() {
    setupKanbanFilters();
    renderKanban();
}

// --- Setup Filter Dropdowns (role-aware) ---
function setupKanbanFilters() {
    const personSelect = document.getElementById('kanbanFilterPerson');
    const projectSelect = document.getElementById('kanbanFilterProject');
    const personGroup = document.getElementById('kanbanFilterPersonGroup');

    const isAdmin = currentUser && currentUser.role === 'admin';

    // Show/hide person filter based on role
    if (personGroup) {
        personGroup.style.display = isAdmin ? '' : 'none';
    }

    if (personSelect && isAdmin) {
        const uniquePeople = [...new Set(tasks.map(t => t.person))].filter(p => p);
        const currentValue = personSelect.value;
        personSelect.innerHTML = '<option value="">All People</option>' +
            uniquePeople.map(p => `<option value="${p}">${p}</option>`).join('');
        if (currentValue) personSelect.value = currentValue;
    }

    if (projectSelect) {
        const uniqueProjects = [...new Set(tasks.map(t => t.project))].filter(p => p);
        const currentValue = projectSelect.value;
        projectSelect.innerHTML = '<option value="">All Projects</option>' +
            uniqueProjects.map(p => `<option value="${p}">${p}</option>`).join('');
        if (currentValue) projectSelect.value = currentValue;
    }
}

// --- Render Kanban Board ---
function renderKanban() {
    const container = document.getElementById('kanbanBoard');
    if (!container) return;

    const isAdmin = currentUser && currentUser.role === 'admin';

    // Get filter values
    const filterProject = document.getElementById('kanbanFilterProject')?.value || '';

    // For non-admins, always filter to their own tasks
    let filterPerson = '';
    if (isAdmin) {
        filterPerson = document.getElementById('kanbanFilterPerson')?.value || '';
    } else if (currentUser) {
        filterPerson = currentUser.name;
    }

    // Filter tasks
    let filteredTasks = tasks;
    if (filterPerson) {
        filteredTasks = filteredTasks.filter(t => t.person === filterPerson);
    }
    if (filterProject) {
        filteredTasks = filteredTasks.filter(t => t.project === filterProject);
    }

    // Show whose board this is for non-admins
    let headerNote = '';
    if (!isAdmin && currentUser) {
        headerNote = `<div style="margin-bottom:12px;font-size:13px;color:var(--text-dim,#888);">Showing your tasks only</div>`;
    }

    // Group by status
    const statuses = ['Not Started', 'In Progress', 'Completed'];
    const tasksByStatus = {
        'Not Started': filteredTasks.filter(t => t.status === 'Not Started'),
        'In Progress': filteredTasks.filter(t => t.status === 'In Progress'),
        'Completed': filteredTasks.filter(t => t.status === 'Completed')
    };

    // Build HTML
    let html = headerNote + '<div class="kanban-board">';

    statuses.forEach(status => {
        const columnTasks = tasksByStatus[status] || [];
        const countBadge = columnTasks.length;

        html += `
            <div class="kanban-column" data-status="${status}">
                <div class="kanban-column-header">
                    <h3>${status}</h3>
                    <span class="kanban-count-badge">${countBadge}</span>
                </div>
                <div class="kanban-drop-zone" data-status="${status}">
        `;

        columnTasks.forEach(task => {
            const projectColor = projectColors[task.project] || '#999';
            const personFirstName = task.person.split(' ')[0];
            const priorityClass = `priority-${task.priority.toLowerCase()}`;

            // Only show person badge if admin is viewing all people
            const personBadge = isAdmin
                ? `<span class="kanban-person-badge">${escapeHtml(personFirstName)}</span>`
                : '';

            html += `
                <div class="kanban-card" draggable="true" data-task-id="${task.id}">
                    <div class="kanban-card-header">
                        <strong class="kanban-card-title">${escapeHtml(task.taskTitle)}</strong>
                    </div>
                    <div class="kanban-card-meta">
                        <span class="kanban-project-tag" style="background-color: ${projectColor};">${projectLogos[task.project] ? `<img src="${projectLogos[task.project]}" alt="${escapeHtml(task.project)}" title="${escapeHtml(task.project)}" style="height:22px;min-width:30px;width:auto;vertical-align:middle;border-radius:2px;object-fit:contain;">` : escapeHtml(task.project)}</span>
                        ${personBadge}
                    </div>
                    <div class="kanban-card-footer">
                        <span class="kanban-priority-badge ${priorityClass}">${task.priority}</span>
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;

    // Attach drag-and-drop listeners
    attachKanbanDragListeners();
}

// --- Filter Kanban ---
function filterKanban() {
    renderKanban();
}

// --- Drag & Drop Handlers ---
function attachKanbanDragListeners() {
    // Drag start
    document.querySelectorAll('.kanban-card').forEach(card => {
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', card.innerHTML);
            card.classList.add('kanban-card-dragging');
        });

        card.addEventListener('dragend', (e) => {
            card.classList.remove('kanban-card-dragging');
            document.querySelectorAll('.kanban-drop-zone').forEach(z => {
                z.classList.remove('kanban-drop-highlight');
            });
        });
    });

    // Drop zones
    document.querySelectorAll('.kanban-drop-zone').forEach(zone => {
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('kanban-drop-highlight');
        });

        zone.addEventListener('dragleave', (e) => {
            if (e.target === zone) {
                zone.classList.remove('kanban-drop-highlight');
            }
        });

        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('kanban-drop-highlight');

            const draggedCard = document.querySelector('.kanban-card-dragging');
            if (!draggedCard) return;

            const taskId = draggedCard.dataset.taskId;
            const newStatus = zone.dataset.status;

            // Find and update task
            const task = tasks.find(t => t.id === taskId);
            if (task && task.status !== newStatus) {
                // Non-admins can only move their own tasks
                if (currentUser && currentUser.role !== 'admin' && task.person !== currentUser.name) {
                    showToast('You can only move your own tasks', 'error');
                    renderKanban();
                    return;
                }

                task.status = newStatus;
                task.updatedAt = new Date().toISOString();

                // Mark task as dirty and save
                markTaskDirty(taskId);
                saveToLocalStorage();

                // Log activity
                if (typeof logActivity === 'function') {
                    logActivity(`${currentUser.name} moved task "${task.taskTitle}" to ${newStatus}`);
                }

                // Re-render
                renderKanban();
                showToast(`Task moved to ${newStatus}`, 'success');
            }
        });
    });
}

// --- Utility: Escape HTML ---
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text || '').replace(/[&<>"']/g, m => map[m]);
}

// Alias for compatibility
const updateKanban = updateKanbanTab;

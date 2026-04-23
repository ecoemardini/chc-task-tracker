// ============ KANBAN BOARD VIEW ============
// Drag-and-drop Kanban board with status columns: Not Started, In Progress, Completed

// --- Initialize Kanban Tab ---
function updateKanbanTab() {
    populateKanbanFilters();
    renderKanban();
}

// --- Populate Filter Dropdowns ---
function populateKanbanFilters() {
    const personSelect = document.getElementById('kanbanFilterPerson');
    const projectSelect = document.getElementById('kanbanFilterProject');

    if (personSelect) {
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

    // Get filter values
    const filterPerson = document.getElementById('kanbanFilterPerson')?.value || '';
    const filterProject = document.getElementById('kanbanFilterProject')?.value || '';

    // Filter tasks
    let filteredTasks = tasks;
    if (filterPerson) {
        filteredTasks = filteredTasks.filter(t => t.person === filterPerson);
    }
    if (filterProject) {
        filteredTasks = filteredTasks.filter(t => t.project === filterProject);
    }

    // Group by status
    const statuses = ['Not Started', 'In Progress', 'Completed'];
    const tasksByStatus = {
        'Not Started': filteredTasks.filter(t => t.status === 'Not Started'),
        'In Progress': filteredTasks.filter(t => t.status === 'In Progress'),
        'Completed': filteredTasks.filter(t => t.status === 'Completed')
    };

    // Build HTML
    let html = '<div class="kanban-board">';

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

            html += `
                <div class="kanban-card" draggable="true" data-task-id="${task.id}">
                    <div class="kanban-card-header">
                        <strong class="kanban-card-title">${escapeHtml(task.taskTitle)}</strong>
                    </div>
                    <div class="kanban-card-meta">
                        <span class="kanban-project-tag" style="background-color: ${projectColor};">${escapeHtml(task.project)}</span>
                        <span class="kanban-person-badge">${escapeHtml(personFirstName)}</span>
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

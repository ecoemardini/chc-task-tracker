// ============ COMMAND PALETTE ============
// Ctrl+K (or Cmd+K on Mac) to open command palette with fuzzy search.

let commandBarState = {
    isOpen: false,
    selectedIndex: 0,
    query: '',
    allResults: []
};

// Open command palette
function openCommandBar() {
    commandBarState.isOpen = true;
    commandBarState.selectedIndex = 0;
    commandBarState.query = '';

    const overlay = document.getElementById('cmdOverlay');
    const modal = document.getElementById('cmdModal');
    const input = document.getElementById('cmdInput');

    if (overlay) overlay.style.display = '';
    if (modal) modal.style.display = '';
    if (input) {
        input.value = '';
        input.focus();
    }

    renderCommandResults();
}

// Close command palette
function closeCommandBar() {
    commandBarState.isOpen = false;
    commandBarState.selectedIndex = 0;
    commandBarState.query = '';

    const overlay = document.getElementById('cmdOverlay');
    const modal = document.getElementById('cmdModal');

    if (overlay) overlay.style.display = 'none';
    if (modal) modal.style.display = 'none';
}

// Build all searchable commands
function buildCommandIndex() {
    const results = [];

    // Navigation commands (always show when empty)
    const navCommands = [
        { category: 'Navigation', icon: 'ð', title: 'Go to Dashboard', subtitle: '', action: () => switchTab('dashboard') },
        { category: 'Navigation', icon: 'â', title: 'Go to Log Task', subtitle: '', action: () => switchTab('log-task') },
        { category: 'Navigation', icon: 'ð', title: 'Go to All Tasks', subtitle: '', action: () => switchTab('all-tasks') },
        { category: 'Navigation', icon: 'ðï¸', title: 'Go to Overview', subtitle: '', action: () => switchTab('overview') },
        { category: 'Navigation', icon: 'ð¥', title: 'Go to Team', subtitle: '', action: () => switchTab('team') },
        { category: 'Navigation', icon: 'ðï¸', title: 'Go to Projects', subtitle: '', action: () => switchTab('projects') },
        { category: 'Navigation', icon: 'ð', title: 'Go to Timeline', subtitle: '', action: () => switchTab('timeline') },
        { category: 'Navigation', icon: 'ð', title: 'Go to Calendar', subtitle: '', action: () => switchTab('calendar') },
        { category: 'Navigation', icon: 'â¹ï¸', title: 'Go to Settings', subtitle: '', action: () => switchTab('settings'), adminOnly: true },
    ];

    // Action commands
    const actionCommands = [
        { category: 'Actions', icon: 'âï¸', title: 'New Task', subtitle: 'Log a new task', action: () => switchTab('log-task'), hint: 'Tab' },
        { category: 'Actions', icon: 'â¡', title: 'Quick Entry', subtitle: 'Paste bulk tasks', action: () => openQuickEntry(), hint: 'Q' },
        { category: 'Actions', icon: 'ð¥', title: 'Export Excel', subtitle: 'Download all data', action: () => exportExcel() },
        { category: 'Actions', icon: 'ð', title: 'Sync Now', subtitle: 'Force sync with server', action: () => manualSync() },
        { category: 'Actions', icon: 'ð', title: 'Toggle Dark Mode', subtitle: 'Switch theme', action: () => {
            const theme = document.documentElement.getAttribute('data-theme');
            const newTheme = theme === 'dark' ? 'light' : 'dark';
            if (newTheme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
                document.getElementById('themeToggle').textContent = 'âï¸';
            } else {
                document.documentElement.removeAttribute('data-theme');
                document.getElementById('themeToggle').textContent = 'ð';
            }
            localStorage.setItem('chc-theme-preference', newTheme);
            closeCommandBar();
        } },
    ];

    // Task search (match by title, description, or person)
    const taskCommands = tasks.map(t => ({
        category: 'Tasks',
        icon: 'â',
        title: t.taskTitle || '(untitled)',
        subtitle: `${t.person} â ${t.project || 'No project'}`,
        action: () => openEditModal(t.id),
        searchText: `${t.taskTitle} ${t.taskDescription} ${t.person}`.toLowerCase()
    }));

    // People search
    const peopleCommands = users.map(u => ({
        category: 'People',
        icon: 'ð¤',
        title: u.name,
        subtitle: `${u.role} â ${tasks.filter(t => t.person === u.name).length} tasks`,
        action: () => {
            switchTab('all-tasks');
            setTimeout(() => {
                const filterEl = document.getElementById('filterPerson');
                if (filterEl) {
                    filterEl.value = u.name;
                    applyFilters();
                }
            }, 100);
        },
        searchText: u.name.toLowerCase()
    }));

    // Project search
    const projectCommands = projects.map(p => ({
        category: 'Projects',
        icon: 'ðï¸',
        title: p,
        subtitle: `${tasks.filter(t => t.project === p).length} tasks`,
        action: () => {
            switchTab('all-tasks');
            setTimeout(() => {
                const filterEl = document.getElementById('filterProject');
                if (filterEl) {
                    filterEl.value = p;
                    applyFilters();
                }
            }, 100);
        },
        searchText: p.toLowerCase()
    }));

    // Filter navigation commands (show when empty)
    const filterCommands = [
        { category: 'Filters', icon: 'ð', title: 'Filter by Status', subtitle: 'In Progress, Completed, etc.', action: () => switchTab('all-tasks') },
        { category: 'Filters', icon: 'ð', title: 'Filter by Week', subtitle: 'View tasks by week', action: () => switchTab('all-tasks') },
    ];

    // Combine all results
    results.push(
        ...navCommands.filter(c => !c.adminOnly || (currentUser && currentUser.role === 'admin')),
        ...actionCommands,
        ...taskCommands,
        ...peopleCommands,
        ...projectCommands,
        ...filterCommands
    );

    return results;
}

// Search/filter commands by query
function searchCommands(query) {
    if (!query.trim()) {
        // Show navigation, actions, filters when empty
        return buildCommandIndex().filter(c => ['Navigation', 'Actions', 'Filters'].includes(c.category));
    }

    const q = query.toLowerCase().trim();
    const allCommands = buildCommandIndex();

    return allCommands.filter(cmd => {
        const searchText = (cmd.searchText || `${cmd.title} ${cmd.subtitle}`.toLowerCase());
        return searchText.includes(q);
    }).slice(0, 8); // Max 8 results
}

// Render command results
function renderCommandResults() {
    const query = document.getElementById('cmdInput')?.value || '';
    commandBarState.query = query;

    const results = searchCommands(query);
    commandBarState.allResults = results;
    commandBarState.selectedIndex = 0;

    const resultsContainer = document.getElementById('cmdResults');
    if (!resultsContainer) return;

    if (results.length === 0) {
        resultsContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-dim); font-size: 14px;">
            No results found
        </div>`;
        return;
    }

    // Group by category
    const grouped = {};
    results.forEach(r => {
        if (!grouped[r.category]) grouped[r.category] = [];
        grouped[r.category].push(r);
    });

    let html = '';
    const categories = Object.keys(grouped);

    categories.forEach((cat, catIdx) => {
        if (catIdx > 0) html += '<div style="margin-top: 8px;"></div>';
        html += `<div class="cmd-category">${cat}</div>`;
        grouped[cat].forEach((item, itemIdx) => {
            const globalIdx = results.indexOf(item);
            const isActive = globalIdx === commandBarState.selectedIndex;
            html += `
                <div class="cmd-item ${isActive ? 'active' : ''}" onclick="selectCommand(${globalIdx})">
                    <div class="cmd-item-icon">${item.icon}</div>
                    <div class="cmd-item-content">
                        <div class="cmd-item-title">${escapeHtml(item.title)}</div>
                        ${item.subtitle ? `<div class="cmd-item-subtitle">${escapeHtml(item.subtitle)}</div>` : ''}
                    </div>
                    ${item.hint ? `<div class="cmd-item-hint">${item.hint}</div>` : ''}
                </div>
            `;
        });
    });

    resultsContainer.innerHTML = html;

    // Scroll active into view
    const activeEl = resultsContainer.querySelector('.cmd-item.active');
    if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
    }
}

// Select and execute a command
function selectCommand(index) {
    const cmd = commandBarState.allResults[index];
    if (!cmd) return;

    closeCommandBar();
    setTimeout(() => {
        cmd.action();
    }, 100);
}

// Handle keyboard navigation
function handleCommandBarKeydown(e) {
    if (!commandBarState.isOpen) return;

    const { allResults, selectedIndex } = commandBarState;

    switch (e.key) {
        case 'Escape':
            e.preventDefault();
            closeCommandBar();
            break;

        case 'ArrowDown':
            e.preventDefault();
            commandBarState.selectedIndex = Math.min(selectedIndex + 1, allResults.length - 1);
            renderCommandResults();
            break;

        case 'ArrowUp':
            e.preventDefault();
            commandBarState.selectedIndex = Math.max(selectedIndex - 1, 0);
            renderCommandResults();
            break;

        case 'Enter':
            e.preventDefault();
            selectCommand(selectedIndex);
            break;

        default:
            break;
    }
}

// Escape special HTML characters
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// Wire up keyboard listener
document.addEventListener('keydown', e => {
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
    const isCtrlK = (isMac && e.metaKey && e.key === 'k') || (!isMac && e.ctrlKey && e.key === 'k');

    if (isCtrlK) {
        e.preventDefault();
        if (commandBarState.isOpen) {
            closeCommandBar();
        } else {
            // Only open if app is shown (not login screen)
            const mainContainer = document.getElementById('mainContainer');
            if (mainContainer && !mainContainer.classList.contains('hidden')) {
                openCommandBar();
            }
        }
    }

    if (commandBarState.isOpen) {
        handleCommandBarKeydown(e);
    }
});

// Update on input
document.getElementById('cmdInput')?.addEventListener('input', e => {
    renderCommandResults();
});

// Close on overlay click
document.getElementById('cmdOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'cmdOverlay') {
        closeCommandBar();
    }
});

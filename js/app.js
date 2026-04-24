// ============ APP INITIALIZATION & SETTINGS ============
// Login, settings, import/export, and bootstrap.

// --- Init ---
function init() {
    weeks = generateWeekRanges();

    const logoB64 = 'data:image/png;base64,' + LOGO_DATA;
    document.getElementById('logoLogin').src = logoB64;
    document.getElementById('logoHeader').src = logoB64;
    loadFromLocalStorage();
    loadEventsFromLocalStorage();
    loadEventTombstones();
    loadNotifications();
    populateUserSelect();

    const pinEl = document.getElementById('pinInput');
    if (pinEl) pinEl.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });

    // Render project logo strip on login card
    const strip = document.getElementById('loginLogoStrip');
    if (strip) {
        strip.innerHTML = Object.keys(projectLogos)
            .filter(p => projects.includes(p) || p === 'SATCULT')
            .map(p => `<img src="${projectLogos[p]}" alt="${p}" title="${p}">`)
            .join('');
    }

    // Wire up debounced search
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        searchInput.removeAttribute('onkeyup'); // remove inline handler if present
        searchInput.addEventListener('input', debouncedApplyFilters);
    }

    // Restore session
    try {
        const savedSession = localStorage.getItem('chc_current_user');
        if (savedSession) {
            const sessionData = JSON.parse(savedSession);
            const user = users.find(u => u.name === sessionData.name);
            if (user) {
                currentUser = user;
                transitionToApp();
            }
        }
    } catch (e) { console.warn('Session restore failed:', e); }

    // Background server pull
    if (SYNC_URL && isOnline) {
        pullFromServer().then(() => {
            populateUserSelect();
        }).catch(err => {
            console.warn('Background pull failed:', err);
        });
    }
}

// --- Auth ---
function handleLogin() {
    const name = document.getElementById('userSelect').value;
    const pin = document.getElementById('pinInput').value.trim(); // trim whitespace

    if (!name) { showToast('Please select your name', 'error'); return; }
    if (!pin) { showToast('Please enter your PIN', 'error'); return; }

    const user = users.find(u => u.name === name);
    if (!user) { showToast('User not found', 'error'); return; }

    if (String(user.pin) !== String(pin)) {
        showToast('Wrong password. Please try again.', 'error');
        return;
    }

    currentUser = user;
    localStorage.setItem('chc_current_user', JSON.stringify({ name: user.name }));
    transitionToApp();
}

function handleSignOut() {
    currentUser = null;
    localStorage.removeItem('chc_current_user');
    showLogin();
}

function transitionToApp() {
    showApp();
    initializeApp();
    initKeyboardShortcuts();
    initDashboardInteractions();

    // Show/hide settings tab based on role
    const settingsTab = document.getElementById('settingsTab');
    if (settingsTab) {
        settingsTab.style.display = currentUser.role === 'admin' ? '' : 'none';
    }

    document.getElementById('currentUserName').textContent = currentUser.name;
    document.getElementById('currentUserRole').textContent = currentUser.role;
    if (currentUser.role === 'observer') {
        document.getElementById('observerBadge').style.display = 'inline-block';
    }
}

function showLogin() {
    document.getElementById('loginContainer').classList.remove('hidden');
    document.getElementById('header').classList.add('hidden');
    document.getElementById('mainContent').classList.add('hidden');
    document.getElementById('pinInput').value = '';
}

function showApp() {
    document.getElementById('loginContainer').classList.add('hidden');
    document.getElementById('header').classList.remove('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    updateNotifBadge();
}

// --- Notifications UI ---
function toggleNotifPanel() {
    const panel = document.getElementById('notifPanel');
    if (panel.style.display === 'none') {
        renderNotifPanel();
        panel.style.display = '';
    } else {
        panel.style.display = 'none';
    }
}

function renderNotifPanel() {
    const list = document.getElementById('notifList');
    const notifs = getMyNotifications();
    if (notifs.length === 0) {
        list.innerHTML = '<div class="notif-empty">No notifications yet</div>';
    } else {
        list.innerHTML = notifs.slice(0, 30).map(n => {
            const ago = _timeAgo(new Date(n.timestamp));
            return `<div class="notif-item ${n.read ? '' : 'unread'}" onclick="markNotificationRead('${n.id}');updateNotifBadge();this.classList.remove('unread');">
                <div>${n.message}</div>
                <div class="notif-time">${ago}</div>
            </div>`;
        }).join('');
    }
    updateNotifBadge();
}

function updateNotifBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const count = getUnreadCount();
    if (count > 0) {
        badge.textContent = count > 9 ? '9+' : count;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function _timeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

// Close notif panel when clicking outside
document.addEventListener('click', function(e) {
    const panel = document.getElementById('notifPanel');
    const bell = document.getElementById('notifBell');
    if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
        panel.style.display = 'none';
    }
});

// --- Settings Tab ---
function updateSettingsTab() {
    updateTeamMembersSettings();
    updateProjectsSettings();
    updateCategoriesSettings();
    updatePinSettings();
    renderActivityLog();
}

function updateTeamMembersSettings() {
    const container = document.getElementById('teamMembersSettings');
    const roleBadge = role => {
        const colors = { admin: '#00aeef', member: '#00c4a0', observer: '#ffa94d' };
        return `<span style="display:inline-block;padding:2px 10px;border-radius:9999px;font-size:11px;font-weight:600;color:white;background:${colors[role]||'#999'}">${role}</span>`;
    };
    container.innerHTML = users.map(u => `
        <div class="list-item">
            <div class="list-item-content"><strong>${u.name}</strong> ${roleBadge(u.role)}</div>
            <div class="list-item-actions">
                ${u.name !== currentUser.name ? `<button class="btn btn-sm btn-danger" onclick="deleteUser('${u.name.replace(/'/g, "\\'")}')">Remove</button>` : '<small style="color:#999">You</small>'}
            </div>
        </div>
    `).join('');
}

function addTeamMember() {
    const name = document.getElementById('newMemberName').value.trim();
    const role = document.getElementById('newMemberRole').value;
    const pin = document.getElementById('newMemberPin').value.trim();
    if (!name) { showToast('Please enter a name', 'error'); return; }
    if (!pin || pin.length !== 4) { showToast('PIN must be 4 digits', 'error'); return; }
    if (users.find(u => u.name === name)) { showToast('User already exists', 'error'); return; }
    users.push({ name, role, pin });
    saveToLocalStorage();
    showToast(`${name} added as ${role}`, 'success');
    document.getElementById('newMemberName').value = '';
    document.getElementById('newMemberPin').value = '';
    updateTeamMembersSettings();
    updatePinSettings();
}

function deleteUser(name) {
    if (name === currentUser.name) { showToast("You can't remove yourself", 'error'); return; }
    if (confirm(`Remove ${name}? Their tasks will remain.`)) {
        users = users.filter(u => u.name !== name);
        saveToLocalStorage();
        showToast(`${name} removed`, 'success');
        updateTeamMembersSettings();
        updatePinSettings();
    }
}

function updateProjectsSettings() {
    const container = document.getElementById('projectsSettings');
    container.innerHTML = projects.map(p => {
        const logoPreview = projectLogos[p]
            ? `<img src="${projectLogos[p]}" alt="${p}" style="height:24px;width:auto;border-radius:4px;margin-right:8px;vertical-align:middle;">`
            : '';
        const logoActions = projectLogos[p]
            ? `<button class="btn btn-sm btn-secondary" onclick="uploadProjectLogo('${p.replace(/'/g,"\\'")}')" title="Change logo" style="font-size:11px;">Change Logo</button>
               <button class="btn btn-sm btn-secondary" onclick="removeProjectLogo('${p.replace(/'/g,"\\'")}')" title="Remove logo" style="font-size:11px;">Remove Logo</button>`
            : `<button class="btn btn-sm btn-secondary" onclick="uploadProjectLogo('${p.replace(/'/g,"\\'")}')" title="Upload logo" style="font-size:11px;">Upload Logo</button>`;
        return `
        <div class="list-item" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #eee;">
            <div class="list-item-content" style="flex:1;display:flex;align-items:center;">
                ${logoPreview}
                <span class="project-tag" style="background-color: ${projectColors[p] || '#999'};">${projectDisplayHTML(p, 18)}</span>
            </div>
            <div class="list-item-actions" style="display:flex;gap:6px;">
                ${logoActions}
                <button class="btn btn-sm btn-danger" onclick="deleteProject('${p.replace(/'/g,"\\'")}')">Remove</button>
            </div>
        </div>`;
    }).join('');
}

function addProject() {
    const name = document.getElementById('newProjectInput').value.trim();
    if (!name) return;
    if (projects.includes(name)) { showToast('Project already exists', 'error'); return; }
    projects.push(name);
    projectColors[name] = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
    saveToLocalStorage();
    document.getElementById('newProjectInput').value = '';
    updateProjectsSettings();
    showToast('Project added', 'success');
}

function deleteProject(name) {
    if (confirm(`Remove project "${name}"?`)) {
        projects = projects.filter(p => p !== name);
        tasks = tasks.map(t => t.project === name ? { ...t, project: '' } : t);
        saveToLocalStorage();
        showToast('Project removed', 'success');
        updateProjectsSettings();
    }
}

function updateCategoriesSettings() {
    const container = document.getElementById('categoriesSettings');
    container.innerHTML = taskCategories.map(c => `
        <div class="list-item">
            <div class="list-item-content">${c}</div>
            <div class="list-item-actions"><button class="btn btn-sm btn-danger" onclick="deleteCategory('${c}')">Remove</button></div>
        </div>
    `).join('');
}

function addCategory() {
    const name = document.getElementById('newCategoryInput').value.trim();
    if (!name) return;
    if (taskCategories.includes(name)) { showToast('Category already exists', 'error'); return; }
    taskCategories.push(name);
    saveToLocalStorage();
    document.getElementById('newCategoryInput').value = '';
    updateCategoriesSettings();
    showToast('Category added', 'success');
}

function deleteCategory(name) {
    if (confirm(`Remove category "${name}"?`)) {
        taskCategories = taskCategories.filter(c => c !== name);
        saveToLocalStorage();
        showToast('Category removed', 'success');
        updateCategoriesSettings();
    }
}

function updatePinSettings() {
    const container = document.getElementById('pinSettings');
    container.innerHTML = users.map(u => `
        <div class="form-row">
            <div class="form-field">
                <label>${u.name}</label>
                <input type="password" value="${u.pin}" readonly style="background:#f0f4f8;">
            </div>
            <div class="form-field">
                <label>&nbsp;</label>
                <div style="display: flex; gap: 5px;">
                    <input type="password" id="newPin_${u.name}" placeholder="New PIN" maxlength="4" inputmode="numeric" style="flex: 1;">
                    <button class="btn btn-sm btn-primary" onclick="changePIN('${u.name}')">Update</button>
                </div>
            </div>
        </div>
    `).join('');
}

function changePIN(name) {
    const newPin = document.getElementById(`newPin_${name}`).value;
    if (!newPin || newPin.length !== 4) { showToast('PIN must be 4 digits', 'error'); return; }
    const user = users.find(u => u.name === name);
    if (user) {
        user.pin = newPin;
        _originalSave();
        if (SYNC_URL && isOnline && !isSyncing) syncToServer();
        showToast(`PIN updated for ${name}`, 'success');
        document.getElementById(`newPin_${name}`).value = '';
        updatePinSettings();
    }
}

// --- Export / Import ---
function exportCSV() {
    let csv = 'Person,Task Title,Project,Week,Priority,Status,Description,Comments\n';
    tasks.forEach(t => {
        csv += `"${t.person}","${t.taskTitle}","${t.project}","${t.week}","${t.priority}","${t.status}","${t.taskDescription}","${t.comments}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `tasks_${new Date().toISOString().split('T')[0]}.csv`; a.click();
    showToast('CSV exported', 'success');
}

function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(tasks.map(t => ({
        Person: t.person, 'Task Title': t.taskTitle, Project: t.project,
        Week: t.week, Priority: t.priority, Status: t.status,
        Description: t.taskDescription, Comments: t.comments
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tasks');
    XLSX.writeFile(wb, `tasks_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Excel exported', 'success');
}

function importExcel() {
    document.getElementById('excelFileInput').click();
}

function handleExcelImport() {
    const file = document.getElementById('excelFileInput').files[0];
    if (!file) return;

    // Validate file type and size
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        showToast('Please select an Excel or CSV file', 'error');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('File too large (max 5MB)', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = e => {
        try {
            const workbook = XLSX.read(e.target.result, { type: 'array' });
            let importedCount = 0;
            const skipSheets = ['Lists', 'Sheet1', 'Team Summary', 'Project Breakdown', 'Weekly Activity'];

            workbook.SheetNames.forEach(sheetName => {
                if (skipSheets.includes(sheetName)) return;
                const ws = workbook.Sheets[sheetName];
                const data = XLSX.utils.sheet_to_json(ws, { range: 1 });
                const sheetPerson = users.find(u => u.name.includes(sheetName) || sheetName.includes(u.name.split(' ')[0]))?.name || sheetName;

                data.forEach(row => {
                    const weekKey = Object.keys(row).find(k => k.toLowerCase().startsWith('week'));
                    const titleKey = Object.keys(row).find(k => k === 'Task Title');
                    const descKey = Object.keys(row).find(k => k === 'Task Description');
                    const commentKey = Object.keys(row).find(k => k.toLowerCase().includes('comment'));
                    const weekVal = weekKey ? String(row[weekKey] || '') : '';
                    const titleVal = titleKey ? String(row[titleKey] || '') : '';
                    const descVal = descKey ? String(row[descKey] || '') : '';
                    const commentVal = commentKey ? String(row[commentKey] || '') : '';

                    if (weekVal && row.Project && titleVal) {
                        const now = new Date().toISOString();
                        const taskId = newTaskId();
                        tasks.push({
                            id: taskId,
                            person: sheetPerson,
                            week: weekVal,
                            project: row.Project || '',
                            taskTitle: titleVal,
                            taskDescription: descVal,
                            priority: row.Priority || 'Medium',
                            status: row.Status || 'Not Started',
                            comments: commentVal,
                            observerComments: [],
                            createdAt: now,
                            updatedAt: now
                        });
                        markTaskDirty(taskId);
                        importedCount++;
                    }
                });
            });

            saveToLocalStorage();
            if (SYNC_URL && isOnline) syncToServer();
            showToast(`Imported ${importedCount} new task(s)`, 'success');
            updateOverview();
            applyFilters();
        } catch (err) {
            showToast('Import failed: ' + err.message, 'error');
        }
    };
    reader.readAsArrayBuffer(file);
}

function clearAllData() {
    if (tasks.length === 0) {
        showToast('No data to clear', 'error');
        return;
    }

    // First offer to save backup
    const saveFirst = confirm('Would you like to save an Excel backup before deleting all data?\n\nClick OK to save backup first, or Cancel to skip.');
    if (saveFirst) {
        try { exportExcel(); } catch (e) { console.warn('Export failed:', e); }
    }

    // Then confirm deletion
    if (confirm('Clear ALL ' + tasks.length + ' tasks and events? This cannot be undone!')) {
        if (confirm('Are you absolutely sure? This will delete everything.')) {
            // Tombstone all tasks
            tasks.forEach(t => { if (t && t.id !== undefined) addTombstone(t.id); });
            // Tombstone all events
            events.forEach(e => { if (e && e.id) addEventTombstone(e.id); });
            tasks = [];
            events = [];
            saveToLocalStorage();
            if (typeof saveEventsToLocalStorage === 'function') saveEventsToLocalStorage();
            // Sync tombstones to server
            if (SYNC_URL && isOnline) syncToServer();
            showToast('All data cleared', 'success');
            updateOverview();
            applyFilters();
            if (typeof renderCalendar === 'function') renderCalendar();
        }
    }
}

// --- Bootstrap ---
// Network event listeners
window.addEventListener('online', () => {
    isOnline = true;
    updateSyncIndicator();
    showToast('Back online — syncing...', 'success');
    if (SYNC_URL) pullFromServer().then(() => syncToServer());
});

window.addEventListener('offline', () => {
    isOnline = false;
    updateSyncIndicator();
    showToast('You are offline. Changes saved locally.', 'error');
});

// Periodic sync indicator + pull
setInterval(updateSyncIndicator, 30000);
setInterval(() => {
    if (SYNC_URL && isOnline && !isSyncing) pullFromServer();
}, 60000);

// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
        console.log('Service Worker registered:', reg.scope);
    }).catch(err => {
        console.warn('Service Worker registration failed:', err);
    });
}

// Load sync state and initialize
loadPendingChanges();
loadTombstones();
loadDirtyIds();
loadActivityLog();
try {
    const ls = localStorage.getItem('chc_last_sync');
    if (ls) lastSyncTime = new Date(ls);
} catch {}

init();

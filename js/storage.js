// ============ STORAGE & SYNC ENGINE ============
// localStorage persistence, offline-first sync with Google Apps Script,
// tombstone-based deletion propagation, dirty tracking, field-level merge,
// and activity logging.

// --- Core localStorage ---
function saveToLocalStorage() {
    const data = { tasks, projects, taskCategories, users, weeks, projectColors, events: (typeof events !== 'undefined' ? events : []) };
    localStorage.setItem('chc_task_logger_v2', JSON.stringify(data));
}

function loadFromLocalStorage() {
    const stored = localStorage.getItem('chc_task_logger_v2');
    if (stored) {
        try {
            const data = JSON.parse(stored);
            tasks = data.tasks || [];
            projects = data.projects || projects;
            taskCategories = data.taskCategories || taskCategories;
            users = data.users || users;
            weeks = data.weeks || weeks;
            Object.assign(projectColors, data.projectColors || {});
            if (typeof events !== 'undefined' && data.events) events = data.events;
        } catch (err) {
            console.error('Failed to load data:', err);
        }
    }
}

// --- Sync Configuration ---
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbyAqa6wMfMn-_K96P9EZbC9hzGfDWu8akylwuor_NwReCeBdsKfoeKLGGt9Ps4C1PJ5/exec';

let isOnline = navigator.onLine;
let isSyncing = false;
let pendingChanges = [];
let lastSyncTime = null;

// --- Dirty Tracking ---
// Tracks task IDs modified locally since last successful sync.
// Only dirty tasks get sent to the server, preventing stale overwrites.
let _dirtyTaskIds = new Set();

function loadDirtyIds() {
    try {
        const stored = localStorage.getItem('chc_dirty_ids');
        _dirtyTaskIds = stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { _dirtyTaskIds = new Set(); }
}

function saveDirtyIds() {
    localStorage.setItem('chc_dirty_ids', JSON.stringify([..._dirtyTaskIds]));
}

function markTaskDirty(id) {
    if (!id) return;
    _dirtyTaskIds.add(String(id));
    saveDirtyIds();
}

function clearDirtyIds() {
    _dirtyTaskIds.clear();
    saveDirtyIds();
}

// --- Tombstones (deletion propagation) ---
let tombstones = [];
let eventTombstones = [];
const TOMBSTONE_TTL_DAYS = 90;

function loadTombstones() {
    try {
        const stored = localStorage.getItem('chc_tombstones');
        tombstones = stored ? JSON.parse(stored) : [];
    } catch { tombstones = []; }
    pruneOldTombstones();
}

function saveTombstones() {
    localStorage.setItem('chc_tombstones', JSON.stringify(tombstones));
}

function addTombstone(id) {
    if (id === undefined || id === null || id === '') return;
    const sid = String(id);
    tombstones = tombstones.filter(t => String(t.id) !== sid);
    tombstones.push({ id: sid, deletedAt: new Date().toISOString() });
    saveTombstones();
}

function isTombstoned(id) {
    if (id === undefined || id === null || id === '') return false;
    const sid = String(id);
    return tombstones.some(t => String(t.id) === sid);
}

function pruneOldTombstones() {
    const cutoff = Date.now() - TOMBSTONE_TTL_DAYS * 24 * 60 * 60 * 1000;
    const before = tombstones.length;
    tombstones = tombstones.filter(t => {
        const dt = new Date(t.deletedAt || 0).getTime();
        return dt > cutoff;
    });
    if (tombstones.length !== before) saveTombstones();
    // Prune event tombstones too
    const eBefore = eventTombstones.length;
    eventTombstones = eventTombstones.filter(t => {
        const dt = new Date(t.deletedAt || 0).getTime();
        return dt > cutoff;
    });
    if (eventTombstones.length !== eBefore) saveEventTombstones();
}

// --- Event Tombstones ---
function loadEventTombstones() {
    try {
        const stored = localStorage.getItem('chc_event_tombstones');
        eventTombstones = stored ? JSON.parse(stored) : [];
    } catch { eventTombstones = []; }
}

function saveEventTombstones() {
    localStorage.setItem('chc_event_tombstones', JSON.stringify(eventTombstones));
}

function addEventTombstone(id) {
    if (!id) return;
    const sid = String(id);
    eventTombstones = eventTombstones.filter(t => String(t.id) !== sid);
    eventTombstones.push({ id: sid, deletedAt: new Date().toISOString() });
    saveEventTombstones();
}

function isEventTombstoned(id) {
    if (!id) return false;
    return eventTombstones.some(t => String(t.id) === String(id));
}

// --- Notifications ---
let _notifications = [];

function loadNotifications() {
    try {
        const stored = localStorage.getItem('chc_notifications');
        _notifications = stored ? JSON.parse(stored) : [];
    } catch { _notifications = []; }
}

function saveNotifications() {
    localStorage.setItem('chc_notifications', JSON.stringify(_notifications));
}

function addNotification(forPerson, message, taskId) {
    _notifications.push({
        id: 'n-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 4),
        forPerson: forPerson,
        message: message,
        taskId: taskId || '',
        timestamp: new Date().toISOString(),
        read: false
    });
    saveNotifications();
}

function getMyNotifications() {
    if (!currentUser) return [];
    return _notifications.filter(n => n.forPerson === currentUser.name).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function markNotificationRead(id) {
    const n = _notifications.find(n => n.id === id);
    if (n) { n.read = true; saveNotifications(); }
}

function markAllNotificationsRead() {
    _notifications.forEach(n => {
        if (n.forPerson === currentUser.name) n.read = true;
    });
    saveNotifications();
}

function getUnreadCount() {
    if (!currentUser) return 0;
    return _notifications.filter(n => n.forPerson === currentUser.name && !n.read).length;
}

// --- Known Task IDs ---
function loadKnownIds() {
    try {
        const stored = localStorage.getItem('chc_known_ids');
        return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
}

function saveKnownIds(knownIds) {
    localStorage.setItem('chc_known_ids', JSON.stringify([...knownIds]));
}

function markIdsAsKnown(taskArray) {
    const knownIds = loadKnownIds();
    taskArray.forEach(t => knownIds.add(String(t.id)));
    saveKnownIds(knownIds);
}

// --- Pending Changes ---
function loadPendingChanges() {
    try {
        const stored = localStorage.getItem('chc_pending_changes');
        pendingChanges = stored ? JSON.parse(stored) : [];
    } catch { pendingChanges = []; }
}

function savePendingChanges() {
    localStorage.setItem('chc_pending_changes', JSON.stringify(pendingChanges));
}

function queueChange(action, data) {
    pendingChanges.push({ action, data, timestamp: new Date().toISOString() });
    savePendingChanges();
    updateSyncIndicator();
}

// --- Activity Log (admin-only audit trail) ---
let _activityLog = [];
const MAX_ACTIVITY_LOG = 200;

function loadActivityLog() {
    try {
        const stored = localStorage.getItem('chc_activity_log');
        _activityLog = stored ? JSON.parse(stored) : [];
    } catch { _activityLog = []; }
}

function saveActivityLog() {
    // Keep only the latest entries
    if (_activityLog.length > MAX_ACTIVITY_LOG) {
        _activityLog = _activityLog.slice(-MAX_ACTIVITY_LOG);
    }
    localStorage.setItem('chc_activity_log', JSON.stringify(_activityLog));
}

function logActivity(action, details) {
    _activityLog.push({
        action,
        details,
        user: currentUser ? currentUser.name : 'system',
        timestamp: new Date().toISOString()
    });
    saveActivityLog();
}

function getActivityLog() {
    return _activityLog.slice().reverse(); // newest first
}

function renderActivityLog() {
    const container = document.getElementById('activityLogContainer');
    if (!container) return;
    const log = getActivityLog();
    if (log.length === 0) {
        container.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">No activity recorded yet.</p>';
        return;
    }
    container.innerHTML = log.slice(0, 50).map(entry => {
        const d = new Date(entry.timestamp);
        const timeStr = d.toLocaleDateString('en-US', { day:'numeric', month:'short' }) + ' ' +
            d.toLocaleTimeString('en-US', { hour:'2-digit', minute:'2-digit' });
        const actionColors = {
            'create': 'var(--success)',
            'edit': 'var(--primary-blue)',
            'delete': 'var(--danger)',
            'status': '#9C27B0',
            'sync': 'var(--text-dim)',
            'repeat': 'var(--warning)'
        };
        const color = actionColors[entry.action] || 'var(--text-dim)';
        return `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 0;border-bottom:1px solid #f0f4f8;font-size:12px;">
            <span style="color:${color};font-weight:700;text-transform:uppercase;min-width:50px;">${entry.action}</span>
            <span style="flex:1;color:var(--text-dark);">${entry.details}</span>
            <span style="color:var(--text-dim);white-space:nowrap;font-size:11px;">${entry.user.split(' ')[0]} · ${timeStr}</span>
        </div>`;
    }).join('');
}

// --- Save Override (auto-sync on save) ---
const _originalSave = saveToLocalStorage;
saveToLocalStorage = function() {
    _originalSave();
    invalidateStatsCache();
    if (SYNC_URL && isOnline && !isSyncing) {
        clearTimeout(window._syncDebounce);
        window._syncDebounce = setTimeout(() => syncToServer(), 2000);
    }
};

// --- Sync to Server ---
// Now sends only dirty (locally modified) tasks instead of the full state.
// The server merges per-task by updatedAt timestamp.
// On response, we do field-level merge for tasks that exist both locally and on server.
async function syncToServer() {
    if (!SYNC_URL || isSyncing) return;

    isSyncing = true;
    updateSyncIndicator();

    try {
        pruneOldTombstones();
        const tombstoneSnapshot = tombstones.slice();

        // Only send dirty tasks (modified since last sync) + all tasks for initial sync
        const isInitialSync = !lastSyncTime;
        const tasksToSend = isInitialSync
            ? tasks.map(t => ({ ...t, updatedAt: t.updatedAt || t.createdAt || new Date().toISOString() }))
            : tasks.filter(t => _dirtyTaskIds.has(String(t.id)))
                .map(t => ({ ...t, updatedAt: t.updatedAt || t.createdAt || new Date().toISOString() }));

        const syncFetch = fetch(SYNC_URL, {
            method: 'POST',
            redirect: 'follow',
            body: JSON.stringify({
                action: 'fullSync',
                tasks: tasksToSend,
                users: users,
                tombstones: tombstoneSnapshot,
                events: (typeof events !== 'undefined' ? events : []),
                partialSync: !isInitialSync,
                clientId: _getClientId()
            })
        });
        const syncTimeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Sync timeout')), 15000));
        const response = await Promise.race([syncFetch, syncTimeoutPromise]);
        const result = await response.json();

        if (result.status === 'ok') {
            let conflictCount = 0;

            if (result.tasks) {
                const localMap = {};
                tasks.forEach(t => localMap[String(t.id)] = t);
                const knownIds = loadKnownIds();

                result.tasks.forEach(st => {
                    const sid = String(st.id);
                    if (isTombstoned(sid)) return;

                    const local = localMap[sid];
                    if (!local) {
                        // New task from server
                        if (!knownIds.has(sid)) {
                            tasks.push(st);
                        }
                    } else {
                        // Task exists locally — field-level merge by updatedAt
                        const serverTime = new Date(st.updatedAt || st.createdAt || 0).getTime();
                        const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();

                        if (serverTime > localTime && !_dirtyTaskIds.has(sid)) {
                            // Server is newer AND we haven't modified it locally → accept server version
                            Object.assign(local, st);
                        } else if (serverTime > localTime && _dirtyTaskIds.has(sid)) {
                            // CONFLICT: both changed. Do field-level merge.
                            conflictCount++;
                            _fieldMerge(local, st);
                        }
                        // If local is newer or same, keep local (already sent to server)
                    }
                });

                // Drop confirmed tombstones
                const serverIds = new Set(result.tasks.map(t => String(t.id)));
                const confirmedTombstones = tombstoneSnapshot.filter(t => !serverIds.has(String(t.id)));
                if (confirmedTombstones.length > 0) {
                    const confirmedIds = new Set(confirmedTombstones.map(t => String(t.id)));
                    tombstones = tombstones.filter(t => !confirmedIds.has(String(t.id)));
                    saveTombstones();
                }

                markIdsAsKnown(tasks);
                _originalSave();
            }

            // Merge user data
            if (result.users && result.users.length > 0) {
                let usersChanged = false;
                result.users.forEach(su => {
                    const local = users.find(u => u.name === su.name);
                    if (local) {
                        if (su.pin && String(su.pin) !== String(local.pin)) { local.pin = String(su.pin); usersChanged = true; }
                        if (su.role && su.role !== local.role) { local.role = su.role; usersChanged = true; }
                    }
                });
                if (usersChanged) _originalSave();
            }

            // Merge events from server (respect event tombstones)
            if (result.events && typeof events !== 'undefined') {
                const localEventIds = new Set(events.map(e => e.id));
                result.events.forEach(se => {
                    if (!localEventIds.has(se.id) && !isEventTombstoned(se.id)) events.push(se);
                });
                if (typeof saveEventsToLocalStorage === 'function') saveEventsToLocalStorage();
            }

            // Sync succeeded — clear dirty tracking
            clearDirtyIds();
            pendingChanges = [];
            savePendingChanges();

            lastSyncTime = new Date();
            localStorage.setItem('chc_last_sync', lastSyncTime.toISOString());

            if (conflictCount > 0) {
                logActivity('sync', `Synced with ${conflictCount} conflict(s) — merged field-by-field`);
                showToast(`Synced — ${conflictCount} conflict(s) merged (newest field wins)`, 'error');
            } else {
                showToast('Synced with server', 'success');
            }
        } else {
            console.error('Sync error:', result.message);
            showToast('Sync failed: ' + result.message, 'error');
        }
    } catch (err) {
        console.error('Sync network error:', err);
    }

    isSyncing = false;
    updateSyncIndicator();
}

// --- Field-Level Merge ---
// When both local and server changed the same task, compare each field
// individually and keep the newer value per-field.
function _fieldMerge(local, server) {
    // Mergeable fields and their fallback
    const fields = ['taskTitle', 'taskDescription', 'project', 'week', 'priority', 'status', 'comments', 'person'];
    const serverTime = new Date(server.updatedAt || 0).getTime();
    const localTime = new Date(local.updatedAt || 0).getTime();

    fields.forEach(f => {
        if (local[f] !== server[f]) {
            // If server is newer overall, take server's differing fields
            // but preserve any local fields the user just changed
            // Since we can't track per-field timestamps, use heuristic:
            // take the non-empty / more-recently-set value, preferring server for status
            if (f === 'status' && serverTime > localTime) {
                local[f] = server[f]; // status changes from others are important
            }
            // For other fields, keep local if dirty (user just edited)
        }
    });

    // Always merge observer comments (union)
    const localComments = local.observerComments || [];
    const serverComments = server.observerComments || [];
    const commentMap = {};
    [...localComments, ...serverComments].forEach(c => {
        const key = c.author + '|' + c.timestamp;
        commentMap[key] = c;
    });
    local.observerComments = Object.values(commentMap).sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    // Merge links (union)
    const localLinks = local.links || [];
    const serverLinks = server.links || [];
    const linkSet = new Set(localLinks.map(l => l.url));
    serverLinks.forEach(l => { if (!linkSet.has(l.url)) localLinks.push(l); });
    local.links = localLinks;

    local.updatedAt = new Date().toISOString();
}

// --- Client ID (for multi-device identification) ---
function _getClientId() {
    let cid = localStorage.getItem('chc_client_id');
    if (!cid) {
        cid = 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
        localStorage.setItem('chc_client_id', cid);
    }
    return cid;
}

// --- Pull from Server (with conflict detection) ---
async function pullFromServer() {
    if (!SYNC_URL || !isOnline) return;

    try {
        const fetchPromise = fetch(SYNC_URL + '?action=getAll', { redirect: 'follow' });
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Pull timeout')), 10000));
        const response = await Promise.race([fetchPromise, timeoutPromise]);
        const result = await response.json();

        if (result.status === 'ok') {
            let changed = false;
            let conflictedTasks = [];

            if (result.tasks && result.tasks.length > 0) {
                pruneOldTombstones();
                const localMap = {};
                tasks.forEach(t => localMap[String(t.id)] = t);
                const knownIds = loadKnownIds();

                result.tasks.forEach(st => {
                    const sid = String(st.id);
                    if (isTombstoned(sid)) return;

                    const local = localMap[sid];
                    if (!local) {
                        if (!knownIds.has(sid)) {
                            tasks.push(st);
                            changed = true;
                        }
                    } else {
                        const serverTime = new Date(st.updatedAt || st.createdAt || 0).getTime();
                        const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();

                        if (serverTime > localTime) {
                            const lastSync = lastSyncTime ? lastSyncTime.getTime() : 0;
                            if (localTime > lastSync && _dirtyTaskIds.has(sid)) {
                                // True conflict — both sides changed
                                conflictedTasks.push({
                                    title: local.taskTitle,
                                    person: local.person
                                });
                                _fieldMerge(local, st);
                            } else {
                                // Server is newer, local unchanged → accept server
                                Object.assign(local, st);
                            }
                            changed = true;
                        }
                    }
                });

                markIdsAsKnown(tasks);
            }

            // Merge server users
            if (result.users && result.users.length > 0) {
                result.users.forEach(su => {
                    const local = users.find(u => u.name === su.name);
                    if (local) {
                        if (su.pin && String(su.pin) !== String(local.pin)) { local.pin = String(su.pin); changed = true; }
                        if (su.role && su.role !== local.role) { local.role = su.role; changed = true; }
                    }
                });
            }

            // Merge events from server
            if (result.events && typeof events !== 'undefined') {
                const localEventIds = new Set(events.map(e => e.id));
                let eventsChanged = false;
                result.events.forEach(se => {
                    if (!localEventIds.has(se.id)) { events.push(se); eventsChanged = true; }
                });
                if (eventsChanged && typeof saveEventsToLocalStorage === 'function') saveEventsToLocalStorage();
            }

            if (changed) {
                _originalSave();
                if (currentUser) {
                    if (typeof applyFilters === 'function') applyFilters();
                    if (typeof updateOverview === 'function') updateOverview();
                    if (typeof updateTabBadges === 'function') updateTabBadges();
                }
            }

            if (conflictedTasks.length > 0) {
                const names = conflictedTasks.map(c => `"${c.title}" (${c.person})`).join(', ');
                logActivity('sync', `Pull conflict: ${conflictedTasks.length} task(s) merged — ${names}`);
                showToast(`${conflictedTasks.length} task(s) updated by others — merged. Check activity log.`, 'error');
            }

            lastSyncTime = new Date();
            localStorage.setItem('chc_last_sync', lastSyncTime.toISOString());
            updateSyncIndicator();
        }
    } catch (err) {
        console.warn('Pull from server failed:', err);
    }
}

// --- Manual Sync ---
async function manualSync() {
    if (!SYNC_URL) {
        showToast('No sync server configured.', 'error');
        return;
    }
    if (!isOnline) {
        showToast('You are offline. Changes will sync when you reconnect.', 'error');
        return;
    }
    await syncToServer();
}

// --- Sync Indicator ---
function updateSyncIndicator() {
    const indicator = document.getElementById('syncIndicator');
    const icon = document.getElementById('syncIcon');
    const text = document.getElementById('syncText');
    if (!indicator) return;

    indicator.classList.remove('online', 'offline', 'syncing', 'error');

    if (!SYNC_URL) {
        indicator.classList.add('offline');
        icon.innerHTML = '&#x1f4be;';
        text.innerHTML = 'Local Only';
        return;
    }
    if (isSyncing) {
        indicator.classList.add('syncing');
        icon.innerHTML = '&#x21bb;';
        text.innerHTML = 'Syncing...';
        return;
    }
    if (!isOnline) {
        indicator.classList.add('offline');
        icon.innerHTML = '&#x2601;';
        const pending = _dirtyTaskIds.size;
        text.innerHTML = 'Offline' + (pending > 0 ? ` <span class="pending-count">${pending} pending</span>` : '');
        return;
    }

    const pending = _dirtyTaskIds.size;
    if (pending > 0) {
        indicator.classList.add('error');
        icon.innerHTML = '&#x2601;';
        text.innerHTML = `${pending} pending`;
    } else {
        indicator.classList.add('online');
        icon.innerHTML = '&#x2713;';
        const ago = lastSyncTime ? timeSince(lastSyncTime) : 'never';
        text.innerHTML = `Synced ${ago}`;
    }
}

function timeSince(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}

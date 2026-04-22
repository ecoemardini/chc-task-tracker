// ============ STORAGE & SYNC ENGINE ============
// localStorage persistence, offline-first sync with Google Apps Script,
// tombstone-based deletion propagation, and conflict detection.

// --- Core localStorage ---
function saveToLocalStorage() {
    const data = { tasks, projects, taskCategories, users, weeks, projectColors };
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
        } catch (err) {
            console.error('Failed to load data:', err);
        }
    }
}

// --- Sync Configuration ---
const SYNC_URL = 'https://script.google.com/macros/s/AKfycbxFzITJfQN0cF4kan8GSeVDQJLqvPdDrczzZlNjRcwUs-d8ql381jos4fM5KzLXd3k/exec';

let isOnline = navigator.onLine;
let isSyncing = false;
let pendingChanges = [];
let lastSyncTime = null;

// --- Tombstones (deletion propagation) ---
let tombstones = [];
const TOMBSTONE_TTL_DAYS = 90; // extended from 14 to survive long holidays/sick leave

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
}

// --- Known Task IDs ---
// Tracks every task ID the client has ever seen. Prevents "resurrection"
// of tasks that were deleted locally but whose tombstones have expired.
// If the server returns a task we've never seen and there's no tombstone,
// we add it. If we HAVE seen it before but it's gone locally (and no
// tombstone), that means the tombstone expired → treat as intentional delete.
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

// --- Save Override (auto-sync on save) ---
const _originalSave = saveToLocalStorage;
saveToLocalStorage = function() {
    _originalSave();
    invalidateStatsCache(); // clear cached aggregations
    if (SYNC_URL && isOnline && !isSyncing) {
        clearTimeout(window._syncDebounce);
        window._syncDebounce = setTimeout(() => syncToServer(), 2000);
    }
};

// --- Sync to Server ---
async function syncToServer() {
    if (!SYNC_URL || isSyncing) return;

    isSyncing = true;
    updateSyncIndicator();

    try {
        pruneOldTombstones();
        const tombstoneSnapshot = tombstones.slice();
        const syncFetch = fetch(SYNC_URL, {
            method: 'POST',
            redirect: 'follow',
            body: JSON.stringify({
                action: 'fullSync',
                tasks: tasks.map(t => ({
                    ...t,
                    updatedAt: t.updatedAt || t.createdAt || new Date().toISOString()
                })),
                users: users,
                tombstones: tombstoneSnapshot
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

                result.tasks.forEach(st => {
                    const sid = String(st.id);
                    if (isTombstoned(sid)) return;
                    if (!localMap[sid]) {
                        tasks.push(st);
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

            pendingChanges = [];
            savePendingChanges();

            lastSyncTime = new Date();
            localStorage.setItem('chc_last_sync', lastSyncTime.toISOString());

            if (conflictCount > 0) {
                showToast(`Synced — ${conflictCount} conflict(s) resolved (server version kept)`, 'error');
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
                        // Unknown task from server.
                        // If we've NEVER seen this ID, it's genuinely new → add it.
                        // If we HAVE seen it but it's gone locally (tombstone expired),
                        // DON'T resurrect it — the user deleted it intentionally.
                        if (!knownIds.has(sid)) {
                            tasks.push(st);
                            changed = true;
                        }
                        // else: silently skip — expired tombstone, don't resurrect
                    } else {
                        // Task exists locally — detect conflicts
                        const serverTime = new Date(st.updatedAt || st.createdAt || 0).getTime();
                        const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();

                        if (serverTime > localTime) {
                            // Check if local also changed (true conflict)
                            const lastSync = lastSyncTime ? lastSyncTime.getTime() : 0;
                            if (localTime > lastSync) {
                                // CONFLICT: both local and server changed since last sync
                                conflictedTasks.push({
                                    title: local.taskTitle,
                                    person: local.person,
                                    field: 'multiple fields'
                                });
                            }
                            // Server wins — apply update
                            Object.assign(local, st);
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

            if (changed) {
                _originalSave();
                if (currentUser) {
                    if (typeof applyFilters === 'function') applyFilters();
                    if (typeof updateOverview === 'function') updateOverview();
                    if (typeof updateTabBadges === 'function') updateTabBadges();
                }
            }

            // Notify about conflicts
            if (conflictedTasks.length > 0) {
                const names = conflictedTasks.map(c => `"${c.title}" (${c.person})`).join(', ');
                showToast(`${conflictedTasks.length} task(s) updated by others: ${names}. Server version kept.`, 'error');
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
        const pending = pendingChanges.length;
        text.innerHTML = 'Offline' + (pending > 0 ? ` <span class="pending-count">${pending}</span>` : '');
        return;
    }

    const pending = pendingChanges.length;
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
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

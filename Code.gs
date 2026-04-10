/**
 * Cultural Heritage Cluster — Task Tracker Backend
 * Google Apps Script — Deploy as Web App
 *
 * This script:
 * 1. Serves as the shared backend (read/write tasks to a Google Sheet)
 * 2. Sends a weekly email digest every Friday at 17:00
 *
 * SETUP:
 * 1. Create a new Google Sheet (this will be your database)
 * 2. Open Extensions → Apps Script
 * 3. Paste this entire file into Code.gs
 * 4. Set the SHEET_ID and EMAIL_TO below
 * 5. Deploy → New deployment → Web app → Anyone can access
 * 6. Copy the deployment URL into your Task Tracker HTML (SYNC_URL variable)
 * 7. Run setupTriggers() once to schedule the weekly email
 */

// ========== CONFIGURATION ==========
const SHEET_ID = '16vKT_yBXGNL2P6H0AF5TDd8whmVpL5weLmWOKAAq1UA';  // The ID from your Google Sheet URL
const EMAIL_TO = 'mardiniecoe@gmail.com';       // Weekly digest recipient
const EMAIL_SUBJECT_PREFIX = '[CHC Task Tracker]';

// Sheet names (auto-created if missing)
const TASKS_SHEET = 'Tasks';
const USERS_SHEET = 'Users';
const SYNC_LOG_SHEET = 'SyncLog';

// ========== WEB APP ENDPOINTS ==========

function doGet(e) {
  const action = e.parameter.action || 'ping';

  try {
    switch (action) {
      case 'ping':
        return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });

      case 'getTasks':
        return jsonResponse({ status: 'ok', tasks: getAllTasks() });

      case 'getUsers':
        return jsonResponse({ status: 'ok', users: getAllUsers() });

      case 'getAll':
        return jsonResponse({
          status: 'ok',
          tasks: getAllTasks(),
          users: getAllUsers(),
          lastSync: new Date().toISOString()
        });

      default:
        return jsonResponse({ status: 'error', message: 'Unknown action' });
    }
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;

    switch (action) {
      case 'syncTasks':
        return handleSyncTasks(payload);

      case 'addTask':
        return handleAddTask(payload.task);

      case 'updateTask':
        return handleUpdateTask(payload.task);

      case 'deleteTask':
        return handleDeleteTask(payload.taskId);

      case 'fullSync':
        return handleFullSync(payload);

      default:
        return jsonResponse({ status: 'error', message: 'Unknown action: ' + action });
    }
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message });
  }
}

// ========== TASK CRUD ==========

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    if (headers) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }
  }
  return sheet;
}

const TASK_HEADERS = [
  'id', 'person', 'week', 'project', 'taskTitle', 'taskDescription',
  'priority', 'status', 'comments', 'observerComments', 'createdAt', 'updatedAt', 'deleted'
];

const USER_HEADERS = ['name', 'role', 'pin'];

function getAllTasks() {
  const sheet = getOrCreateSheet(TASKS_SHEET, TASK_HEADERS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h === 'observerComments') {
        try { obj[h] = JSON.parse(row[i] || '[]'); } catch { obj[h] = []; }
      } else if (h === 'deleted') {
        obj[h] = row[i] === true || row[i] === 'true';
      } else {
        obj[h] = row[i] || '';
      }
    });
    return obj;
  }).filter(t => !t.deleted);
}

function getAllUsers() {
  const sheet = getOrCreateSheet(USERS_SHEET, USER_HEADERS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || '');
    return obj;
  });
}

function handleAddTask(task) {
  const sheet = getOrCreateSheet(TASKS_SHEET, TASK_HEADERS);
  const now = new Date().toISOString();

  const row = TASK_HEADERS.map(h => {
    if (h === 'observerComments') return JSON.stringify(task[h] || []);
    if (h === 'createdAt') return task.createdAt || now;
    if (h === 'updatedAt') return now;
    if (h === 'deleted') return false;
    return task[h] || '';
  });

  sheet.appendRow(row);
  logSync('addTask', task.person, task.id);

  return jsonResponse({ status: 'ok', message: 'Task added' });
}

function handleUpdateTask(task) {
  const sheet = getOrCreateSheet(TASKS_SHEET, TASK_HEADERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');

  for (let i = 1; i < data.length; i++) {
    if (data[i][idCol] === task.id) {
      const now = new Date().toISOString();
      const row = TASK_HEADERS.map(h => {
        if (h === 'observerComments') return JSON.stringify(task[h] || []);
        if (h === 'updatedAt') return now;
        if (h === 'deleted') return task.deleted || false;
        return task[h] !== undefined ? task[h] : data[i][headers.indexOf(h)];
      });
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      logSync('updateTask', task.person, task.id);
      return jsonResponse({ status: 'ok', message: 'Task updated' });
    }
  }

  // Task not found — add it
  return handleAddTask(task);
}

function handleDeleteTask(taskId) {
  const sheet = getOrCreateSheet(TASKS_SHEET, TASK_HEADERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idCol = headers.indexOf('id');
  const deletedCol = headers.indexOf('deleted');
  const updatedCol = headers.indexOf('updatedAt');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(taskId)) {
      sheet.getRange(i + 1, deletedCol + 1).setValue(true);
      sheet.getRange(i + 1, updatedCol + 1).setValue(new Date().toISOString());
      logSync('deleteTask', '', taskId);
      return jsonResponse({ status: 'ok', message: 'Task deleted' });
    }
  }

  return jsonResponse({ status: 'error', message: 'Task not found' });
}

/**
 * Batched soft-delete used by the client's tombstone sync.
 * Accepts an array of {id, deletedAt} and marks each matching row deleted=true
 * in a single sheet read, minimising quota use.
 */
function applyTombstones(tombstones) {
  if (!tombstones || tombstones.length === 0) return 0;
  const sheet = getOrCreateSheet(TASKS_SHEET, TASK_HEADERS);
  const range = sheet.getDataRange();
  const data = range.getValues();
  if (data.length <= 1) return 0;

  const headers = data[0];
  const idCol = headers.indexOf('id');
  const deletedCol = headers.indexOf('deleted');
  const updatedCol = headers.indexOf('updatedAt');
  if (idCol < 0 || deletedCol < 0) return 0;

  const tombIds = {};
  tombstones.forEach(t => {
    if (t && t.id !== undefined && t.id !== null && t.id !== '') {
      tombIds[String(t.id)] = t.deletedAt || new Date().toISOString();
    }
  });

  let touched = 0;
  for (let i = 1; i < data.length; i++) {
    const rowId = String(data[i][idCol]);
    if (tombIds.hasOwnProperty(rowId)) {
      if (data[i][deletedCol] !== true) {
        data[i][deletedCol] = true;
        if (updatedCol >= 0) data[i][updatedCol] = tombIds[rowId];
        touched++;
      }
    }
  }

  if (touched > 0) {
    range.setValues(data);
    logSync('tombstoneBatch', '', touched + ' ids');
  }
  return touched;
}

function getAllTasksIncludingDeleted() {
  const sheet = getOrCreateSheet(TASKS_SHEET, TASK_HEADERS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h === 'observerComments') {
        try { obj[h] = JSON.parse(row[i] || '[]'); } catch { obj[h] = []; }
      } else if (h === 'deleted') {
        obj[h] = row[i] === true || row[i] === 'true';
      } else {
        obj[h] = row[i] || '';
      }
    });
    return obj;
  });
}

function handleSyncTasks(payload) {
  const clientTasks = payload.tasks || [];
  // Use ALL server tasks (including deleted) so we never re-add a deleted row
  const serverTasks = getAllTasksIncludingDeleted();
  const serverMap = {};
  serverTasks.forEach(t => serverMap[String(t.id)] = t);

  let added = 0, updated = 0, skippedAsDeleted = 0;

  // Process client tasks
  clientTasks.forEach(ct => {
    const sid = String(ct.id);
    const st = serverMap[sid];
    if (!st) {
      // Genuinely new task from client
      handleAddTask(ct);
      added++;
    } else if (st.deleted) {
      // Server row is soft-deleted. Only resurrect if the client's update is
      // strictly newer than the server's deletion timestamp.
      const clientTime = new Date(ct.updatedAt || ct.createdAt || 0).getTime();
      const serverTime = new Date(st.updatedAt || st.createdAt || 0).getTime();
      if (clientTime > serverTime) {
        // Client explicitly updated after deletion — un-delete and update
        const resurrect = Object.assign({}, ct, { deleted: false });
        handleUpdateTask(resurrect);
        updated++;
      } else {
        skippedAsDeleted++;
      }
    } else {
      // Both sides have the task — last write wins
      const clientTime = new Date(ct.updatedAt || ct.createdAt || 0).getTime();
      const serverTime = new Date(st.updatedAt || st.createdAt || 0).getTime();
      if (clientTime > serverTime) {
        handleUpdateTask(ct);
        updated++;
      }
    }
    delete serverMap[sid];
  });

  return jsonResponse({
    status: 'ok',
    message: `Synced: ${added} added, ${updated} updated, ${skippedAsDeleted} skipped (deleted)`,
    serverTasks: getAllTasks(),  // Return only non-deleted tasks to client
    added,
    updated,
    skippedAsDeleted
  });
}

function handleFullSync(payload) {
  // Client sends full state, server returns merged state
  const clientTasks = payload.tasks || [];
  const clientUsers = payload.users || [];
  const clientTombstones = payload.tombstones || [];

  // 1. Apply tombstones FIRST so deleted rows don't get re-updated or returned
  const tombstoned = applyTombstones(clientTombstones);

  // 2. Build a tombstone set and filter client tasks so we never re-add a deleted task
  const tombSet = {};
  clientTombstones.forEach(t => {
    if (t && t.id !== undefined) tombSet[String(t.id)] = true;
  });
  const filteredClientTasks = clientTasks.filter(t => !tombSet[String(t.id)]);

  // 3. Sync remaining tasks
  const result = handleSyncTasks({ tasks: filteredClientTasks });
  const parsed = JSON.parse(result.getContent());

  // 4. Sync users if admin
  if (clientUsers.length > 0) {
    const sheet = getOrCreateSheet(USERS_SHEET, USER_HEADERS);
    sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), USER_HEADERS.length).clearContent();
    clientUsers.forEach(u => {
      sheet.appendRow(USER_HEADERS.map(h => u[h] || ''));
    });
  }

  return jsonResponse({
    status: 'ok',
    tasks: parsed.serverTasks || getAllTasks(),
    users: getAllUsers(),
    tombstoned: tombstoned,
    lastSync: new Date().toISOString()
  });
}

// ========== SYNC LOG ==========

function logSync(action, person, taskId) {
  const sheet = getOrCreateSheet(SYNC_LOG_SHEET, ['timestamp', 'action', 'person', 'taskId']);
  sheet.appendRow([new Date().toISOString(), action, person, taskId]);

  // Keep only last 500 entries
  if (sheet.getLastRow() > 501) {
    sheet.deleteRows(2, sheet.getLastRow() - 501);
  }
}

// ========== WEEKLY EMAIL DIGEST ==========

function setupTriggers() {
  // Remove existing triggers
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));

  // Weekly digest: every Friday at 17:00
  ScriptApp.newTrigger('sendWeeklyDigest')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(17)
    .create();

  Logger.log('Triggers set up. Weekly digest will send every Friday at 17:00.');
}

function sendWeeklyDigest() {
  const tasks = getAllTasks();
  const users = getAllUsers();

  // Determine current week
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const mondayStr = Utilities.formatDate(monday, Session.getScriptTimeZone(), 'dd MMM yyyy');
  const fridayStr = Utilities.formatDate(friday, Session.getScriptTimeZone(), 'dd MMM yyyy');
  const weekLabel = `${Utilities.formatDate(monday, Session.getScriptTimeZone(), 'dd')}–${fridayStr}`;

  // Find tasks created or updated this week
  const weekStart = new Date(monday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(friday);
  weekEnd.setHours(23, 59, 59, 999);

  const weekTasks = tasks.filter(t => {
    const created = new Date(t.createdAt);
    const updated = new Date(t.updatedAt || t.createdAt);
    return (created >= weekStart && created <= weekEnd) || (updated >= weekStart && updated <= weekEnd);
  });

  // Also match tasks by week string (some might have been entered for this week)
  const allWeekTasks = tasks.filter(t => {
    if (weekTasks.find(wt => wt.id === t.id)) return true;
    // Check if the task's week field matches current week
    const tw = t.week || '';
    if (tw.includes(mondayStr.split(' ')[0]) || tw.includes(fridayStr.split(' ')[0])) return true;
    return false;
  });

  // Build per-person summary
  const activeMembers = users.filter(u => u.role !== 'observer');
  const observers = users.filter(u => u.role === 'observer');

  let html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; background: #ffffff;">
      <div style="background: linear-gradient(135deg, #003b5b 0%, #00568a 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 22px;">Cultural Heritage Cluster</h1>
        <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0; font-size: 14px;">Weekly Task Digest — ${weekLabel}</p>
      </div>

      <div style="padding: 30px; border: 1px solid #e0e7f1; border-top: none; border-radius: 0 0 12px 12px;">
  `;

  // Overall KPIs
  const totalThisWeek = allWeekTasks.length;
  const completedThisWeek = allWeekTasks.filter(t => t.status === 'Completed').length;
  const inProgressThisWeek = allWeekTasks.filter(t => t.status === 'In Progress').length;
  const highPriority = allWeekTasks.filter(t => t.priority === 'High').length;

  html += `
    <div style="display: flex; gap: 15px; margin-bottom: 30px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 120px; background: #f4f8fb; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #00aeef;">${totalThisWeek}</div>
        <div style="font-size: 12px; color: #6b7b8d;">Tasks This Week</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: #f0faf7; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #00c4a0;">${completedThisWeek}</div>
        <div style="font-size: 12px; color: #6b7b8d;">Completed</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: #f4f8fb; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #003b5b;">${inProgressThisWeek}</div>
        <div style="font-size: 12px; color: #6b7b8d;">In Progress</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: #fff5f5; padding: 15px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: 700; color: #ff6b6b;">${highPriority}</div>
        <div style="font-size: 12px; color: #6b7b8d;">High Priority</div>
      </div>
    </div>
  `;

  // Per-person breakdown
  activeMembers.forEach(user => {
    const userTasks = allWeekTasks.filter(t => t.person === user.name);
    const completed = userTasks.filter(t => t.status === 'Completed').length;
    const pending = userTasks.filter(t => t.status !== 'Completed').length;
    const projects = [...new Set(userTasks.map(t => t.project))].filter(Boolean);

    html += `
      <div style="margin-bottom: 25px; border: 1px solid #e0e7f1; border-radius: 10px; overflow: hidden;">
        <div style="background: #f4f8fb; padding: 12px 18px; display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: #003b5b;">${user.name}</strong>
          <span style="font-size: 13px; color: #6b7b8d;">
            ${userTasks.length} task${userTasks.length !== 1 ? 's' : ''} ·
            <span style="color: #00c4a0;">${completed} done</span> ·
            <span style="color: #ffa94d;">${pending} pending</span>
          </span>
        </div>
    `;

    if (userTasks.length === 0) {
      html += `<div style="padding: 15px 18px; color: #999; font-style: italic;">No tasks logged this week</div>`;
    } else {
      html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`;
      userTasks.forEach(t => {
        const statusColor = t.status === 'Completed' ? '#00c4a0' : t.status === 'In Progress' ? '#00aeef' : '#ffa94d';
        const priorityColor = t.priority === 'High' ? '#ff6b6b' : t.priority === 'Medium' ? '#ffa94d' : '#00c4a0';
        html += `
          <tr style="border-bottom: 1px solid #f0f4f8;">
            <td style="padding: 10px 18px; width: 35%;">${t.taskTitle}</td>
            <td style="padding: 10px 8px;">
              <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;background:${priorityColor}20;color:${priorityColor};">${t.priority}</span>
            </td>
            <td style="padding: 10px 8px;">
              <span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;background:${statusColor}20;color:${statusColor};">${t.status}</span>
            </td>
            <td style="padding: 10px 8px; color: #6b7b8d; font-size: 12px;">${t.project}</td>
          </tr>
        `;
      });
      html += `</table>`;
    }

    if (projects.length > 0) {
      html += `<div style="padding: 8px 18px; background: #fafbfc; font-size: 12px; color: #6b7b8d;">Projects: ${projects.join(', ')}</div>`;
    }

    html += `</div>`;
  });

  // Observer comments this week
  const commentsThisWeek = [];
  allWeekTasks.forEach(t => {
    (t.observerComments || []).forEach(c => {
      const cDate = new Date(c.timestamp);
      if (cDate >= weekStart && cDate <= weekEnd) {
        commentsThisWeek.push({ ...c, taskTitle: t.taskTitle, taskPerson: t.person });
      }
    });
  });

  if (commentsThisWeek.length > 0) {
    html += `
      <div style="margin-top: 25px; border: 1px solid #e0e7f1; border-radius: 10px; overflow: hidden;">
        <div style="background: #f4f8fb; padding: 12px 18px;">
          <strong style="color: #003b5b;">Observer Comments This Week (${commentsThisWeek.length})</strong>
        </div>
    `;
    commentsThisWeek.forEach(c => {
      html += `
        <div style="padding: 10px 18px; border-bottom: 1px solid #f0f4f8; font-size: 13px;">
          <strong>${c.author}</strong> on <em>"${c.taskTitle}"</em> (${c.taskPerson}):
          <div style="color: #6b7b8d; margin-top: 4px;">${c.text}</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  // Overall stats
  const totalAll = tasks.length;
  const completedAll = tasks.filter(t => t.status === 'Completed').length;
  const completionRate = totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0;

  html += `
    <div style="margin-top: 25px; padding: 15px; background: #f4f8fb; border-radius: 8px; font-size: 13px; color: #6b7b8d;">
      <strong>Overall:</strong> ${totalAll} total tasks · ${completedAll} completed · ${completionRate}% completion rate
    </div>

    <div style="margin-top: 20px; font-size: 12px; color: #999; text-align: center;">
      Sent automatically by the Cultural Heritage Cluster Task Tracker<br>
      ${new Date().toLocaleString()}
    </div>
    </div>
    </div>
  `;

  MailApp.sendEmail({
    to: EMAIL_TO,
    subject: `${EMAIL_SUBJECT_PREFIX} Weekly Digest — ${weekLabel}`,
    htmlBody: html
  });

  Logger.log('Weekly digest sent to ' + EMAIL_TO);
}

// ========== UTILITIES ==========

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ========== MANUAL TEST FUNCTIONS ==========

function testDigest() {
  sendWeeklyDigest();
}

function testSetup() {
  // Creates sheets with headers if they don't exist
  getOrCreateSheet(TASKS_SHEET, TASK_HEADERS);
  getOrCreateSheet(USERS_SHEET, USER_HEADERS);
  getOrCreateSheet(SYNC_LOG_SHEET, ['timestamp', 'action', 'person', 'taskId']);
  Logger.log('Sheets created/verified successfully.');
}

// ============ CHARTS & ANALYTICS ============
// All chart rendering with a single-pass stats cache for performance.
// Cache is invalidated on every saveToLocalStorage() call (see storage.js).

// --- Stats Cache ---
// Instead of scanning `tasks` O(n) for every chart, we compute all
// aggregations in a single pass and cache them. The cache is invalidated
// whenever tasks are modified (via invalidateStatsCache in storage.js).
let _statsCache = null;

function invalidateStatsCache() {
    _statsCache = null;
}

function getStats() {
    if (_statsCache) return _statsCache;

    const stats = {
        total: tasks.length,
        byStatus: { 'Not Started': 0, 'In Progress': 0, 'Completed': 0 },
        byPriority: { 'Low': 0, 'Medium': 0, 'High': 0 },
        byProject: {},
        byPerson: {},
        byWeek: {},
        byProjectStatus: {},   // { 'CHANGES': { 'Not Started': 0, ... }, ... }
        byPersonProject: {},   // { 'Mahmoud': { 'CHANGES': 0, ... }, ... }
        byWeekStatus: {},      // { 'week1': { 'Not Started': 0, ... }, ... }
        byWeekPerson: {},      // { 'week1': { 'Mahmoud': 0, ... }, ... }
    };

    // Initialize nested maps
    projects.forEach(p => {
        stats.byProject[p] = 0;
        stats.byProjectStatus[p] = { 'Not Started': 0, 'In Progress': 0, 'Completed': 0 };
    });

    // Single pass over all tasks
    tasks.forEach(t => {
        const s = t.status || 'Not Started';
        const p = t.priority || 'Medium';
        const proj = t.project || '';
        const person = t.person || '';
        const week = t.week || '';

        // Status / Priority
        if (stats.byStatus[s] !== undefined) stats.byStatus[s]++;
        if (stats.byPriority[p] !== undefined) stats.byPriority[p]++;

        // By project
        stats.byProject[proj] = (stats.byProject[proj] || 0) + 1;

        // By person
        if (!stats.byPerson[person]) {
            stats.byPerson[person] = { total: 0, completed: 0, inProgress: 0 };
        }
        stats.byPerson[person].total++;
        if (s === 'Completed') stats.byPerson[person].completed++;
        if (s === 'In Progress') stats.byPerson[person].inProgress++;

        // By project + status
        if (stats.byProjectStatus[proj]) {
            stats.byProjectStatus[proj][s] = (stats.byProjectStatus[proj][s] || 0) + 1;
        }

        // By person + project (heatmap)
        if (!stats.byPersonProject[person]) stats.byPersonProject[person] = {};
        stats.byPersonProject[person][proj] = (stats.byPersonProject[person][proj] || 0) + 1;

        // By week + status (timeline)
        if (!stats.byWeekStatus[week]) stats.byWeekStatus[week] = { 'Not Started': 0, 'In Progress': 0, 'Completed': 0 };
        stats.byWeekStatus[week][s] = (stats.byWeekStatus[week][s] || 0) + 1;

        // By week + person (workload)
        if (!stats.byWeekPerson[week]) stats.byWeekPerson[week] = {};
        stats.byWeekPerson[week][person] = (stats.byWeekPerson[week][person] || 0) + 1;
    });

    _statsCache = stats;
    return stats;
}

// --- Overview Tab ---
function updateOverview() {
    const s = getStats();
    const completionRate = s.total > 0 ? Math.round((s.byStatus['Completed'] / s.total) * 100) : 0;

    document.getElementById('kpi-total').textContent = s.total;
    document.getElementById('kpi-completed').textContent = s.byStatus['Completed'];
    document.getElementById('completion-rate').textContent = `${completionRate}% done`;
    document.getElementById('kpi-inprogress').textContent = s.byStatus['In Progress'];
    document.getElementById('kpi-high').textContent = s.byPriority['High'];

    createStatusChart();
    createPriorityChart();
    createCompletionRateChart();
}

function createStatusChart() {
    const s = getStats();
    const ctx = document.getElementById('statusChart').getContext('2d');
    const statuses = ['Not Started', 'In Progress', 'Completed'];
    const statusData = statuses.map(st => s.byStatus[st]);

    if (currentChart.statusChart) currentChart.statusChart.destroy();
    currentChart.statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: statuses,
            datasets: [{ data: statusData, backgroundColor: ['#e0e7f1', '#ffa94d', '#00c4a0'], borderColor: 'white', borderWidth: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: "'Nunito', sans-serif" }, usePointStyle: true } },
                title: { display: true, text: 'Tasks by Status', font: { size: 14, weight: 'bold' } }
            }
        }
    });
}

function createPriorityChart() {
    const s = getStats();
    const ctx = document.getElementById('priorityChart').getContext('2d');
    const priorities = ['Low', 'Medium', 'High'];
    const priorityData = priorities.map(p => s.byPriority[p]);

    if (currentChart.priorityChart) currentChart.priorityChart.destroy();
    currentChart.priorityChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: priorities,
            datasets: [{ data: priorityData, backgroundColor: ['#a0d995', '#ffa94d', '#ff6b6b'], borderColor: 'white', borderWidth: 2 }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: "'Nunito', sans-serif" }, usePointStyle: true } },
                title: { display: true, text: 'Tasks by Priority', font: { size: 14, weight: 'bold' } }
            }
        }
    });
}

function createCompletionRateChart() {
    const s = getStats();
    const ctx = document.getElementById('completionRateChart').getContext('2d');
    const members = Object.keys(s.byPerson).sort();
    const data = members.map(m => {
        const mp = s.byPerson[m];
        return mp.total > 0 ? (mp.completed / mp.total) * 100 : 0;
    });

    if (currentChart.completionChart) currentChart.completionChart.destroy();
    currentChart.completionChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: members,
            datasets: [{ label: 'Completion Rate %', data: data, backgroundColor: members.map((m, i) => getMemberColor(m, i)), borderRadius: 8, borderSkipped: false }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'x',
            plugins: { legend: { display: false }, title: { display: true, text: 'Completion Rate by Member', font: { size: 14, weight: 'bold' } } },
            scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
        }
    });
}

// --- Team Tab ---
function updateTeamTab() {
    const s = getStats();
    const members = Object.keys(s.byPerson).sort();
    const container = document.getElementById('teamMembersContainer');

    if (members.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No tasks yet</h3><p>Start logging tasks to see team stats</p></div>';
        return;
    }

    container.innerHTML = members.map((member, idx) => {
        const mp = s.byPerson[member];
        const rate = mp.total > 0 ? Math.round((mp.completed / mp.total) * 100) : 0;
        const color = getMemberColor(member, idx);
        const photo = memberPhotos[member];

        return `
            <div class="person-card" style="border-top: 4px solid ${color};">
                ${photo
                    ? `<img src="${photo}" alt="${member}" class="avatar" style="width:50px;height:50px;border-radius:50%;object-fit:cover;border:3px solid ${color};">`
                    : `<div class="avatar" style="background:${color};color:#fff;">${member.charAt(0).toUpperCase()}</div>`
                }
                <div class="person-card-content">
                    <h3>${member}</h3>
                    <div class="role">${users.find(u => u.name === member)?.role || 'member'}</div>
                    <div class="progress-bar">
                        <div class="progress-bar-fill" style="width: ${rate}%; background: ${color};"></div>
                    </div>
                    <div class="stat-row"><span class="stat-label">Total Tasks</span><span class="stat-value">${mp.total}</span></div>
                    <div class="stat-row"><span class="stat-label">Completed</span><span class="stat-value">${mp.completed}</span></div>
                    <div class="stat-row"><span class="stat-label">In Progress</span><span class="stat-value">${mp.inProgress}</span></div>
                    <div class="stat-row"><span class="stat-label">Completion Rate</span><span class="stat-value">${rate}%</span></div>
                </div>
            </div>
        `;
    }).join('');

    createWorkloadChart();
}

function createWorkloadChart() {
    const s = getStats();
    const ctx = document.getElementById('workloadChart').getContext('2d');
    const members = Object.keys(s.byPerson).sort();

    if (currentChart.workloadChart) currentChart.workloadChart.destroy();
    currentChart.workloadChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeks,
            datasets: members.map((m, idx) => ({
                label: m,
                data: weeks.map(w => (s.byWeekPerson[w] || {})[m] || 0),
                borderColor: getMemberColor(m, idx),
                backgroundColor: getMemberColor(m, idx),
                borderWidth: 2, fill: false, tension: 0.4
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: "'Nunito', sans-serif" }, usePointStyle: true } },
                title: { display: true, text: 'Workload Over Time', font: { size: 14, weight: 'bold' } }
            },
            scales: { x: { ticks: { maxRotation: 45 } } }
        }
    });
}

// --- Projects Tab ---
function updateProjectsTab() {
    renderProjectSummaryGrid();
    createProjectsChart();
    createProjectStatusChart();
    createHeatmapChart();
}

function renderProjectSummaryGrid() {
    const s = getStats();
    const grid = document.getElementById('projectSummaryGrid');
    if (!grid) return;
    grid.innerHTML = projects.map(p => {
        const count = s.byProject[p] || 0;
        const done = (s.byProjectStatus[p] || {})['Completed'] || 0;
        const pct = count ? Math.round((done / count) * 100) : 0;
        const color = projectColors[p] || '#999';
        const hasLogo = !!projectLogos[p];
        const logoImg = hasLogo
            ? `<img src="${projectLogos[p]}" alt="${p}" title="${p}" style="height:36px;min-width:50px;width:auto;max-width:90px;object-fit:contain;">`
            : `<div style="width:28px;height:28px;border-radius:6px;background:${color};"></div>`;
        const nameDiv = hasLogo ? '' : `<div style="font-weight:700;font-size:13px;color:#2d3e4e;">${p}</div>`;
        return `
            <div style="background:white;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);border-left:4px solid ${color};">
                <div class="project-card-header">${logoImg}${nameDiv}</div>
                <div style="display:flex;justify-content:space-between;font-size:11px;color:#6c7a89;"><span>${count} task${count === 1 ? '' : 's'}</span><span>${pct}% done</span></div>
                <div style="height:4px;border-radius:2px;background:#eef2f6;margin-top:6px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${color};transition:width 0.3s;"></div></div>
            </div>
        `;
    }).join('');
}

function createProjectsChart() {
    const s = getStats();
    const ctx = document.getElementById('projectsChart').getContext('2d');

    if (currentChart.projectsChart) currentChart.projectsChart.destroy();
    currentChart.projectsChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: projects,
            datasets: [{ label: 'Task Count', data: projects.map(p => s.byProject[p] || 0), backgroundColor: projects.map(p => projectColors[p]), borderRadius: 8, borderSkipped: false }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, indexAxis: 'y',
            plugins: { legend: { display: false }, title: { display: true, text: 'Tasks per Project', font: { size: 14, weight: 'bold' } } }
        }
    });
}

function createProjectStatusChart() {
    const s = getStats();
    const ctx = document.getElementById('projectStatusChart').getContext('2d');
    const statuses = ['Not Started', 'In Progress', 'Completed'];

    if (currentChart.projectStatusChart) currentChart.projectStatusChart.destroy();
    currentChart.projectStatusChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: projects,
            datasets: statuses.map((status, idx) => ({
                label: status,
                data: projects.map(p => (s.byProjectStatus[p] || {})[status] || 0),
                backgroundColor: ['#e0e7f1', '#ffa94d', '#00c4a0'][idx]
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true } },
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: "'Nunito', sans-serif" }, usePointStyle: true } },
                title: { display: true, text: 'Project Status Breakdown', font: { size: 14, weight: 'bold' } }
            }
        }
    });
}

function createHeatmapChart() {
    const s = getStats();
    const container = document.getElementById('heatmapChart').parentElement;
    const members = Object.keys(s.byPerson).sort();

    if (currentChart.heatmapChart) { currentChart.heatmapChart.destroy(); currentChart.heatmapChart = null; }

    let maxCount = 0;
    projects.forEach(proj => {
        members.forEach(member => {
            const count = (s.byPersonProject[member] || {})[proj] || 0;
            if (count > maxCount) maxCount = count;
        });
    });

    const canvas = document.getElementById('heatmapChart');
    canvas.style.display = 'none';

    const oldTable = document.getElementById('heatmapTable');
    if (oldTable) oldTable.remove();

    const getColor = (count) => {
        if (count === 0) return '#f4f8fb';
        const intensity = Math.min(count / Math.max(maxCount, 1), 1);
        const alpha = 0.15 + intensity * 0.75;
        return `rgba(0, 174, 239, ${alpha.toFixed(2)})`;
    };

    let html = `<div id="heatmapTable" style="overflow-x:auto;margin-top:10px;">
        <h4 style="text-align:center;font-size:14px;font-weight:bold;margin-bottom:12px;color:#1a2332;">Project \u00d7 Member Workload</h4>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr>
                <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #dee2e6;font-weight:600;color:#6b7b8d;">Project</th>
                ${members.map((m, i) => `<th style="padding:10px 12px;text-align:center;border-bottom:2px solid #dee2e6;font-weight:600;color:${getMemberColor(m, i)};">${m.split(' ')[0]}</th>`).join('')}
                <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #dee2e6;font-weight:600;color:#6b7b8d;">Total</th>
            </tr></thead><tbody>`;

    projects.forEach(proj => {
        const projTotal = members.reduce((sum, m) => sum + ((s.byPersonProject[m] || {})[proj] || 0), 0);
        if (projTotal === 0) return;
        html += `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;white-space:nowrap;">${proj}</td>`;
        members.forEach(m => {
            const count = (s.byPersonProject[m] || {})[proj] || 0;
            html += `<td style="padding:8px 12px;text-align:center;border-bottom:1px solid #eee;background:${getColor(count)};font-weight:${count > 0 ? '600' : '400'};color:${count > 0 ? '#003b5b' : '#ccc'};border-radius:4px;">${count > 0 ? count : '\u2014'}</td>`;
        });
        html += `<td style="padding:8px 12px;text-align:center;border-bottom:1px solid #eee;font-weight:700;color:#003b5b;">${projTotal}</td></tr>`;
    });

    html += `<tr style="background:#f8f9fa;"><td style="padding:10px 12px;font-weight:700;color:#003b5b;">Total</td>`;
    members.forEach((m, i) => {
        const total = projects.reduce((sum, p) => sum + ((s.byPersonProject[m] || {})[p] || 0), 0);
        html += `<td style="padding:10px 12px;text-align:center;font-weight:700;color:${getMemberColor(m, i)};">${total}</td>`;
    });
    html += `<td style="padding:10px 12px;text-align:center;font-weight:700;color:#003b5b;">${s.total}</td></tr></tbody></table></div>`;

    canvas.insertAdjacentHTML('afterend', html);
}

// --- Timeline Tab ---
function updateTimelineTab() {
    createWeeklyActivityChart();
    createStatusTrendChart();
}

function createWeeklyActivityChart() {
    const s = getStats();
    const ctx = document.getElementById('weeklyActivityChart').getContext('2d');
    const statuses = ['Not Started', 'In Progress', 'Completed'];

    if (currentChart.weeklyActivityChart) currentChart.weeklyActivityChart.destroy();
    currentChart.weeklyActivityChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: weeks,
            datasets: statuses.map((status, idx) => ({
                label: status,
                data: weeks.map(w => (s.byWeekStatus[w] || {})[status] || 0),
                backgroundColor: ['#e0e7f1', '#ffa94d', '#00c4a0'][idx]
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { x: { stacked: true }, y: { stacked: true } },
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: "'Nunito', sans-serif" }, usePointStyle: true } },
                title: { display: true, text: 'Weekly Activity', font: { size: 14, weight: 'bold' } }
            }
        }
    });
}

function createStatusTrendChart() {
    const s = getStats();
    const ctx = document.getElementById('statusTrendChart').getContext('2d');
    const statuses = ['Not Started', 'In Progress', 'Completed'];

    if (currentChart.statusTrendChart) currentChart.statusTrendChart.destroy();
    currentChart.statusTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: weeks,
            datasets: statuses.map((status, idx) => ({
                label: status,
                data: weeks.map(w => (s.byWeekStatus[w] || {})[status] || 0),
                borderColor: ['#e0e7f1', '#ffa94d', '#00c4a0'][idx],
                borderWidth: 2, fill: false, tension: 0.4
            }))
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: "'Nunito', sans-serif" }, usePointStyle: true } },
                title: { display: true, text: 'Status Trends', font: { size: 14, weight: 'bold' } }
            }
        }
    });
}

// --- Dashboard Landing Page ---
function updateDashboard() {
    if (!currentUser) return;
    const curWeek = getCurrentWeek();
    const me = currentUser.name;

    // Greeting
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('dashGreeting').textContent = `${greeting}, ${me.split(' ')[0]}`;

    // --- My tasks this week ---
    const myTasks = tasks.filter(t => t.person === me && t.week === curWeek);
    const myDone = myTasks.filter(t => t.status === 'Completed').length;
    document.getElementById('dash-my-total').textContent = myTasks.length;
    document.getElementById('dash-my-done').textContent = myDone;

    const myTasksEl = document.getElementById('dashMyTasks');
    if (myTasks.length === 0) {
        myTasksEl.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">No tasks this week. Head to <a href="#" onclick="switchTab(\'log-task\');return false;" style="color:var(--primary-blue);">Log Task</a> to add some.</p>';
    } else {
        myTasksEl.innerHTML = '<h4 style="font-size:14px;margin-bottom:8px;color:var(--dark-navy);">My Tasks This Week</h4>' +
            myTasks.map(t => {
                const statusColors = { 'Completed': 'var(--success)', 'In Progress': 'var(--primary-blue)', 'Not Started': 'var(--text-dim)' };
                const statusIcon = t.status === 'Completed' ? '&#10003;' : t.status === 'In Progress' ? '&#9654;' : '&#9675;';
                const projTag = t.project ? `<span class="project-tag" style="background:${projectColors[t.project]||'#999'};font-size:10px;padding:1px 6px;">${projectDisplayHTML(t.project,20)}</span>` : '';
                return `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f4f8;">
                    <span style="color:${statusColors[t.status]||'#999'};font-size:14px;">${statusIcon}</span>
                    <span style="flex:1;font-size:13px;${t.status==='Completed'?'text-decoration:line-through;color:var(--text-dim);':''}">${t.taskTitle}</span>
                    ${projTag}
                </div>`;
            }).join('');
    }

    // --- My upcoming events ---
    if (typeof loadEventsFromLocalStorage === 'function') loadEventsFromLocalStorage();
    const todayStr = typeof toDateStr === 'function' ? toDateStr(new Date()) : new Date().toISOString().split('T')[0];
    const myEvents = (typeof events !== 'undefined' ? events : []).filter(e => e.person === me && e.endDate >= todayStr)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 5);
    const myEventsEl = document.getElementById('dashMyEventsList');
    if (myEvents.length === 0) {
        myEventsEl.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">No upcoming events</p>';
    } else {
        myEventsEl.innerHTML = myEvents.map(e => {
            const color = projectColors[e.project] || getMemberColor(me, 0);
            const loc = e.location ? ` — ${e.location}` : '';
            const fmtDate = typeof formatDateShort === 'function' ? formatDateShort : d => d.toLocaleDateString();
            return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f4f8;">
                <div style="width:4px;height:28px;border-radius:2px;background:${color};flex-shrink:0;"></div>
                <div style="flex:1;">
                    <div style="font-size:13px;font-weight:600;">${e.title}${loc}</div>
                    <div style="font-size:11px;color:var(--text-dim);">${fmtDate(new Date(e.startDate+'T00:00:00'))} — ${fmtDate(new Date(e.endDate+'T00:00:00'))}</div>
                </div>
            </div>`;
        }).join('');
    }

    // --- Team overview ---
    const stats = getStats();
    document.getElementById('dash-team-total').textContent = stats.total;
    document.getElementById('dash-team-ip').textContent = stats.byStatus['In Progress'] || 0;

    // Who's doing what this week
    const teamList = document.getElementById('dashTeamList');
    const teamMembers = users.filter(u => u.role !== 'observer');
    teamList.innerHTML = teamMembers.map((u, idx) => {
        const color = getMemberColor(u.name, idx);
        const weekTasks = tasks.filter(t => t.person === u.name && t.week === curWeek);
        const ipCount = weekTasks.filter(t => t.status === 'In Progress').length;
        const doneCount = weekTasks.filter(t => t.status === 'Completed').length;
        const totalW = weekTasks.length;
        return `<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #f0f4f8;">
            <div style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;"></div>
            <span style="flex:1;font-size:13px;font-weight:600;">${u.name.split(' ')[0]}</span>
            <span style="font-size:12px;color:var(--text-dim);">${totalW} task${totalW!==1?'s':''}</span>
            ${ipCount > 0 ? `<span style="font-size:11px;background:rgba(0,174,239,0.15);color:var(--primary-blue);padding:1px 6px;border-radius:9999px;">${ipCount} active</span>` : ''}
            ${doneCount > 0 ? `<span style="font-size:11px;background:rgba(0,196,160,0.15);color:var(--success);padding:1px 6px;border-radius:9999px;">${doneCount} done</span>` : ''}
        </div>`;
    }).join('');

    // --- Team upcoming events ---
    const allEvents = typeof events !== 'undefined' ? events : [];
    const teamEvents = allEvents.filter(e => e.endDate >= todayStr)
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .slice(0, 6);
    const teamEventsEl = document.getElementById('dashTeamEventsList');
    if (teamEvents.length === 0) {
        teamEventsEl.innerHTML = '<p style="color:var(--text-dim);font-size:13px;">No upcoming events</p>';
    } else {
        const fmtDate = typeof formatDateShort === 'function' ? formatDateShort : d => d.toLocaleDateString();
        teamEventsEl.innerHTML = teamEvents.map(e => {
            const color = projectColors[e.project] || getMemberColor(e.person, 0);
            const loc = e.location ? ` — ${e.location}` : '';
            return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f0f4f8;">
                <div style="width:4px;height:28px;border-radius:2px;background:${color};flex-shrink:0;"></div>
                <div style="flex:1;">
                    <div style="font-size:13px;font-weight:600;">${e.title}${loc}</div>
                    <div style="font-size:11px;color:var(--text-dim);">${e.person.split(' ')[0]} · ${fmtDate(new Date(e.startDate+'T00:00:00'))} — ${fmtDate(new Date(e.endDate+'T00:00:00'))}</div>
                </div>
            </div>`;
        }).join('');
    }
}

// ============ IMPROVEMENT D: STREAK COUNTER ============
function calculateStreak(personName) {
    const personTasks = tasks.filter(t => t.person === personName);
    if (personTasks.length === 0) return 0;

    // Group tasks by date they were created
    const dateMap = {};
    personTasks.forEach(t => {
        const dateCreated = t.createdAt ? new Date(t.createdAt).toISOString().split('T')[0] : null;
        if (dateCreated) {
            if (!dateMap[dateCreated]) dateMap[dateCreated] = 0;
            dateMap[dateCreated]++;
        }
    });

    if (Object.keys(dateMap).length === 0) return 0;

    const dates = Object.keys(dateMap).sort().reverse();
    let streak = 0;
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    let checkDate = new Date(todayStr + 'T00:00:00');
    for (const dateStr of dates) {
        const checkDateStr = checkDate.toISOString().split('T')[0];
        if (dateStr === checkDateStr) {
            streak++;
            checkDate.setDate(checkDate.getDate() - 1);
        } else {
            break;
        }
    }
    return streak;
}

// ============ IMPROVEMENT E: PROGRESS RINGS ============
function renderProjectProgressRings() {
    const container = document.querySelector('.progress-ring-container');
    if (!container) return;

    container.innerHTML = projects.map(proj => {
        const projTasks = tasks.filter(t => t.project === proj);
        const completed = projTasks.filter(t => t.status === 'Completed').length;
        const total = projTasks.length;
        const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
        const color = projectColors[proj] || '#0095d0';
        const circumference = 2 * Math.PI * 45;
        const offset = circumference - (pct / 100) * circumference;

        return `<div class="progress-ring-card">
            <svg class="progress-ring" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="45" fill="none" stroke="var(--border-color)" stroke-width="6"></circle>
                <circle cx="60" cy="60" r="45" fill="none" stroke="${color}" stroke-width="6"
                    stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"
                    style="transform:rotate(-90deg);transform-origin:60px 60px;transition:stroke-dashoffset 0.5s;"></circle>
                <text x="60" y="60" text-anchor="middle" dy="0.3em" font-size="20" font-weight="700" fill="${color}">${pct}%</text>
            </svg>
            <div class="progress-ring-label">${proj}</div>
            <div class="progress-ring-stat">${completed}/${total}</div>
        </div>`;
    }).join('');
}

// ============ IMPROVEMENT F: ACTIVITY FEED ============
function renderActivityFeed() {
    const log = getActivityLog().slice(0, 10);
    if (log.length === 0) return '<p style="color:var(--text-dim);font-size:13px;">No recent activity</p>';

    return `<div style="background:var(--surface-white);border-radius:var(--radius-card);padding:16px;">
        <h4 style="font-size:14px;margin-bottom:12px;color:var(--dark-navy);">Recent Activity</h4>
        ${log.map(entry => {
            const ago = (function() {
                const d = new Date(entry.timestamp);
                const seconds = Math.floor((new Date() - d) / 1000);
                if (seconds < 60) return 'just now';
                const mins = Math.floor(seconds / 60);
                if (mins < 60) return mins + 'm ago';
                const hours = Math.floor(mins / 60);
                if (hours < 24) return hours + 'h ago';
                return Math.floor(hours / 24) + 'd ago';
            })();
            const actionColors = {
                'create': 'var(--success)',
                'edit': 'var(--primary-blue)',
                'delete': 'var(--danger)',
                'status': '#9C27B0',
                'sync': 'var(--text-dim)',
                'repeat': 'var(--warning)'
            };
            const color = actionColors[entry.action] || 'var(--text-dim)';
            const avatar = memberAvatarHTML(entry.user, 'small');
            return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #f0f4f8;font-size:12px;">
                ${avatar}
                <div style="flex:1;">
                    <span style="color:${color};font-weight:700;">${entry.action.toUpperCase()}</span>
                    <span style="color:var(--text-dim);">${entry.details}</span>
                </div>
                <span style="font-size:11px;color:var(--text-dim);white-space:nowrap;">${ago}</span>
            </div>`;
        }).join('')}
    </div>`;
}

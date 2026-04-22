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
        const logoImg = projectLogos[p]
            ? `<img src="${projectLogos[p]}" alt="${p}" style="height:28px;width:auto;max-width:70px;object-fit:contain;">`
            : `<div style="width:28px;height:28px;border-radius:6px;background:${color};"></div>`;
        return `
            <div style="background:white;border-radius:12px;padding:14px;box-shadow:0 1px 3px rgba(0,0,0,0.06);border-left:4px solid ${color};">
                <div class="project-card-header">${logoImg}<div style="font-weight:700;font-size:13px;color:#2d3e4e;">${p}</div></div>
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

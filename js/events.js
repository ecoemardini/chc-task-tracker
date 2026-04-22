// ============ TEAM EVENTS CALENDAR ============
// Swimlane timeline calendar for team events (meetings, fieldwork, travel, etc.)
// Separate from tasks — purely visual scheduling.

let events = [];

// --- Event CRUD ---
function newEventId() {
    return 'e-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 6);
}

function addEvent(evt) {
    evt.id = evt.id || newEventId();
    evt.createdAt = evt.createdAt || new Date().toISOString();
    events.push(evt);
    saveEventsToLocalStorage();
    renderCalendar();
}

function deleteEvent(id) {
    const evt = events.find(e => e.id === id);
    if (!evt) return;
    const canDelete = currentUser.role === 'admin' || evt.createdBy === currentUser.name;
    if (!canDelete) { showToast('You can only delete your own events', 'error'); return; }

    events = events.filter(e => e.id !== id);
    saveEventsToLocalStorage();
    showToast('Event deleted', 'success');
    renderCalendar();
}

function saveEventsToLocalStorage() {
    localStorage.setItem('chc_events', JSON.stringify(events));
    if (SYNC_URL && isOnline && !isSyncing) {
        clearTimeout(window._eventSyncDebounce);
        window._eventSyncDebounce = setTimeout(() => syncToServer(), 2000);
    }
}

function loadEventsFromLocalStorage() {
    try {
        const stored = localStorage.getItem('chc_events');
        events = stored ? JSON.parse(stored) : [];
    } catch { events = []; }
}

// --- Calendar State ---
let calendarViewStart = null;
const CALENDAR_DAYS_VISIBLE = 28;

function initCalendarView() {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    calendarViewStart = new Date(today);
    calendarViewStart.setDate(today.getDate() + diff);
    calendarViewStart.setHours(0, 0, 0, 0);
}

function navigateCalendar(direction) {
    if (!calendarViewStart) initCalendarView();
    if (direction === 'prev') {
        calendarViewStart.setDate(calendarViewStart.getDate() - 14);
    } else if (direction === 'next') {
        calendarViewStart.setDate(calendarViewStart.getDate() + 14);
    } else {
        initCalendarView();
    }
    renderCalendar();
}

// --- Render Swimlane Calendar ---
function renderCalendar() {
    const container = document.getElementById('calendarSwimlane');
    if (!container) return;
    if (!calendarViewStart) initCalendarView();

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const N = CALENDAR_DAYS_VISIBLE;

    // Build date array
    const dates = [];
    for (let i = 0; i < N; i++) {
        const d = new Date(calendarViewStart);
        d.setDate(calendarViewStart.getDate() + i);
        dates.push(d);
    }

    const people = users.filter(u => u.role !== 'observer').map(u => u.name);

    // Range label
    document.getElementById('calendarRangeLabel').textContent =
        formatDateShort(dates[0]) + ' — ' + formatDateShort(dates[N - 1]);

    // --- Month header row ---
    let monthCells = '';
    let curMonth = -1, span = 0, mName = '';
    dates.forEach((d, i) => {
        const m = d.getMonth();
        if (m !== curMonth) {
            if (span > 0) monthCells += `<div class="cal-hcell" style="flex:${span};">${mName}</div>`;
            curMonth = m;
            mName = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            span = 1;
        } else { span++; }
        if (i === N - 1) monthCells += `<div class="cal-hcell" style="flex:${span};">${mName}</div>`;
    });

    // --- Day header row ---
    const dayCells = dates.map(d => {
        const isToday = d.getTime() === today.getTime();
        const isWE = d.getDay() === 0 || d.getDay() === 6;
        return `<div class="cal-dcell ${isToday ? 'cal-today' : ''} ${isWE ? 'cal-we' : ''}">
            <div class="cal-dn">${d.toLocaleDateString('en-US', { weekday: 'narrow' })}</div>
            <div class="cal-dd">${d.getDate()}</div>
        </div>`;
    }).join('');

    // --- Swimlane rows ---
    let swimRows = '';
    people.forEach((person, pIdx) => {
        const color = getMemberColor(person, pIdx);
        const personEvts = events.filter(e => e.person === person);

        // Background grid cells
        const bgCells = dates.map(d => {
            const isToday = d.getTime() === today.getTime();
            const isWE = d.getDay() === 0 || d.getDay() === 6;
            return `<div class="cal-cell ${isToday ? 'cal-today-bg' : ''} ${isWE ? 'cal-we-bg' : ''}"></div>`;
        }).join('');

        // Event blocks positioned via left% and width%
        let evtBlocks = '';
        personEvts.forEach(evt => {
            const evtStart = new Date(evt.startDate + 'T00:00:00');
            const evtEnd = new Date(evt.endDate + 'T00:00:00');
            const startCol = daysBetween(calendarViewStart, evtStart);
            const endCol = daysBetween(calendarViewStart, evtEnd);

            if (endCol < 0 || startCol >= N) return;

            const cs = Math.max(0, startCol);
            const ce = Math.min(N - 1, endCol);
            const leftPct = (cs / N * 100).toFixed(2);
            const widthPct = ((ce - cs + 1) / N * 100).toFixed(2);

            const evtColor = projectColors[evt.project] || color;
            const logo = projectLogoHTML(evt.project, 14);
            const loc = evt.location ? ' · ' + evt.location : '';

            evtBlocks += `<div class="cal-evt"
                style="left:${leftPct}%;width:${widthPct}%;background:${evtColor};"
                title="${evt.title}${loc}"
                onclick="showEventDetail('${evt.id}')">
                ${logo}<span class="cal-evt-txt">${evt.title}${loc}</span>
            </div>`;
        });

        swimRows += `<div class="cal-swim-row">
            <div class="cal-label" style="border-left:3px solid ${color};">${person.split(' ')[0]}</div>
            <div class="cal-lane">
                <div class="cal-lane-bg">${bgCells}</div>
                ${evtBlocks}
            </div>
        </div>`;
    });

    // Today marker line
    const todayIdx = daysBetween(calendarViewStart, today);
    let todayLine = '';
    if (todayIdx >= 0 && todayIdx < N) {
        const todayPct = ((todayIdx + 0.5) / N * 100).toFixed(2);
        todayLine = `<div class="cal-today-line" style="left:${todayPct}%;"></div>`;
    }

    container.innerHTML = `
        <div class="cal-scroll">
            <div class="cal-header-row cal-month-row">
                <div class="cal-label-spacer"></div>
                <div class="cal-hstrip">${monthCells}</div>
            </div>
            <div class="cal-header-row cal-day-hdr">
                <div class="cal-label-spacer"></div>
                <div class="cal-hstrip">${dayCells}</div>
            </div>
            <div class="cal-body" style="position:relative;">
                ${todayLine}
                ${swimRows}
            </div>
        </div>
    `;
}

// --- Event Detail / Delete ---
function showEventDetail(id) {
    const evt = events.find(e => e.id === id);
    if (!evt) return;
    const canDel = currentUser.role === 'admin' || evt.createdBy === currentUser.name;
    const locationLine = evt.location ? `<p><strong>Location:</strong> ${evt.location}</p>` : '';
    const projectLine = evt.project ? `<p><strong>Project:</strong> ${projectLogoHTML(evt.project, 16)} ${evt.project}</p>` : '';

    document.getElementById('eventDetailBody').innerHTML = `
        <h3 style="margin-bottom:12px;color:var(--dark-navy);">${evt.title}</h3>
        <p><strong>Who:</strong> ${evt.person}</p>
        <p><strong>When:</strong> ${formatDateShort(new Date(evt.startDate + 'T00:00:00'))} — ${formatDateShort(new Date(evt.endDate + 'T00:00:00'))}</p>
        ${locationLine}
        ${projectLine}
        <p style="font-size:11px;color:var(--text-dim);margin-top:12px;">Added by ${evt.createdBy || 'unknown'}</p>
        ${canDel ? `<button class="btn btn-danger btn-sm" style="margin-top:12px;" onclick="deleteEvent('${evt.id}'); closeEventDetailModal();">Delete Event</button>` : ''}
    `;
    document.getElementById('eventDetailModal').classList.add('active');
}

function closeEventDetailModal() {
    document.getElementById('eventDetailModal').classList.remove('active');
}

// --- Add Event Modal ---
function openAddEventModal() {
    const personSelect = document.getElementById('eventPerson');
    personSelect.innerHTML = users.filter(u => u.role !== 'observer')
        .map(u => `<option value="${u.name}" ${u.name === currentUser.name ? 'selected' : ''}>${u.name}</option>`)
        .join('');

    const projectSelect = document.getElementById('eventProject');
    projectSelect.innerHTML = '<option value="">— None —</option>' +
        projects.map(p => `<option value="${p}">${p}</option>`).join('');

    const today = new Date();
    document.getElementById('eventStartDate').value = toDateStr(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    document.getElementById('eventEndDate').value = toDateStr(tomorrow);

    document.getElementById('eventTitle').value = '';
    document.getElementById('eventLocation').value = '';

    document.getElementById('addEventModal').classList.add('active');
}

function closeAddEventModal() {
    document.getElementById('addEventModal').classList.remove('active');
}

function saveNewEvent() {
    const title = document.getElementById('eventTitle').value.trim();
    const person = document.getElementById('eventPerson').value;
    const startDate = document.getElementById('eventStartDate').value;
    const endDate = document.getElementById('eventEndDate').value;
    const location = document.getElementById('eventLocation').value.trim();
    const project = document.getElementById('eventProject').value;

    if (!title) { showToast('Please enter an event title', 'error'); return; }
    if (!startDate || !endDate) { showToast('Please select start and end dates', 'error'); return; }
    if (new Date(endDate) < new Date(startDate)) { showToast('End date must be after start date', 'error'); return; }

    addEvent({ title, person, startDate, endDate, location, project, createdBy: currentUser.name });
    closeAddEventModal();
    showToast('Event added', 'success');
}

// --- Helpers ---
function toDateStr(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function daysBetween(a, b) {
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function formatDateShort(d) {
    return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function updateCalendarTab() {
    loadEventsFromLocalStorage();
    renderCalendar();
}

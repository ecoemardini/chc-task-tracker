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
    addEventTombstone(id);
    saveEventsToLocalStorage();
    logActivity('delete', `Event "${evt.title}" deleted`);
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

        // Background grid cells (with data attributes for drop targeting)
        const bgCells = dates.map((d, di) => {
            const isToday = d.getTime() === today.getTime();
            const isWE = d.getDay() === 0 || d.getDay() === 6;
            return `<div class="cal-cell cal-drop-target ${isToday ? 'cal-today-bg' : ''} ${isWE ? 'cal-we-bg' : ''}" data-date-idx="${di}" data-person="${person}"></div>`;
        }).join('');

        // Event blocks positioned via left% and width%
        // First, compute visible ranges and assign rows to avoid overlaps
        var visibleEvts = [];
        personEvts.forEach(function(evt) {
            var evtStart = new Date(evt.startDate + 'T00:00:00');
            var evtEnd = new Date(evt.endDate + 'T00:00:00');
            var startCol = daysBetween(calendarViewStart, evtStart);
            var endCol = daysBetween(calendarViewStart, evtEnd);
            if (endCol < 0 || startCol >= N) return;
            var cs = Math.max(0, startCol);
            var ce = Math.min(N - 1, endCol);
            visibleEvts.push({ evt: evt, cs: cs, ce: ce });
        });

        // Sort by start col, then by width descending (longer events first)
        visibleEvts.sort(function(a, b) { return a.cs - b.cs || (b.ce - b.cs) - (a.ce - a.cs); });

        // Assign rows: each event goes in the first row where it doesn't overlap
        var rows = []; // rows[r] = array of {cs, ce} intervals in that row
        visibleEvts.forEach(function(ve) {
            var placed = false;
            for (var r = 0; r < rows.length; r++) {
                var overlap = false;
                for (var ri = 0; ri < rows[r].length; ri++) {
                    if (ve.cs <= rows[r][ri].ce && ve.ce >= rows[r][ri].cs) { overlap = true; break; }
                }
                if (!overlap) { rows[r].push({ cs: ve.cs, ce: ve.ce }); ve.row = r; placed = true; break; }
            }
            if (!placed) { ve.row = rows.length; rows.push([{ cs: ve.cs, ce: ve.ce }]); }
        });

        var totalRows = Math.max(1, rows.length);
        var evtHeight = 22; // px per event row
        var laneMinHeight = totalRows * (evtHeight + 2) + 4; // dynamic lane height

        let evtBlocks = '';
        visibleEvts.forEach(function(ve) {
            var evt = ve.evt;
            var leftPct = (ve.cs / N * 100).toFixed(2);
            var widthPct = ((ve.ce - ve.cs + 1) / N * 100).toFixed(2);
            var topPx = ve.row * (evtHeight + 2) + 2;

            var evtColor = projectColors[evt.project] || color;
            var logo = projectLogoHTML(evt.project, 14);
            var loc = evt.location ? ' \u00b7 ' + evt.location : '';

            evtBlocks += '<div class="cal-evt"' +
                ' draggable="true"' +
                ' data-event-id="' + evt.id + '"' +
                ' data-orig-start-col="' + ve.cs + '"' +
                ' style="left:' + leftPct + '%;width:' + widthPct + '%;top:' + topPx + 'px;height:' + evtHeight + 'px;background:' + evtColor + ';"' +
                ' title="' + evt.title + loc + '"' +
                ' onclick="showEventDetail(\'' + evt.id + '\')">' +
                logo + '<span class="cal-evt-txt">' + evt.title + loc + '</span>' +
            '</div>';
        });

        swimRows += `<div class="cal-swim-row" data-person="${person}">
            <div class="cal-label" style="border-left:3px solid ${color};">${person.split(' ')[0]}</div>
            <div class="cal-lane" data-person="${person}" style="min-height:${laneMinHeight}px;">
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

    // --- Wire drag-and-drop ---
    _wireDragAndDrop(container, dates, people);
}

function _wireDragAndDrop(container, dates, people) {
    let _dragEventId = null;
    let _dragOrigStartCol = 0;

    // Dragstart on event blocks
    container.querySelectorAll('.cal-evt[draggable]').forEach(el => {
        el.addEventListener('dragstart', e => {
            _dragEventId = el.dataset.eventId;
            _dragOrigStartCol = parseInt(el.dataset.origStartCol) || 0;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', _dragEventId);
            el.style.opacity = '0.5';
            // Prevent the click handler from firing after drag
            el._isDragging = true;
        });
        el.addEventListener('dragend', e => {
            el.style.opacity = '1';
            // Remove all drop highlights
            container.querySelectorAll('.cal-drop-highlight').forEach(c => c.classList.remove('cal-drop-highlight'));
            setTimeout(() => { el._isDragging = false; }, 100);
        });
        // Override click to not fire after drag
        const origOnclick = el.getAttribute('onclick');
        el.removeAttribute('onclick');
        el.addEventListener('click', e => {
            if (el._isDragging) { e.stopPropagation(); return; }
            // Re-execute the original onclick
            if (origOnclick) new Function(origOnclick).call(el);
        });
    });

    // Dragover/drop on lane cells
    container.querySelectorAll('.cal-drop-target').forEach(cell => {
        cell.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            cell.classList.add('cal-drop-highlight');
        });
        cell.addEventListener('dragleave', e => {
            cell.classList.remove('cal-drop-highlight');
        });
        cell.addEventListener('drop', e => {
            e.preventDefault();
            cell.classList.remove('cal-drop-highlight');
            const eventId = e.dataTransfer.getData('text/plain');
            if (!eventId) return;

            const dropDateIdx = parseInt(cell.dataset.dateIdx);
            const dropPerson = cell.dataset.person;
            if (isNaN(dropDateIdx)) return;

            const evt = events.find(ev => ev.id === eventId);
            if (!evt) return;

            // Permission check
            const canEdit = currentUser.role === 'admin' || evt.createdBy === currentUser.name;
            if (!canEdit) { showToast('You can only move your own events', 'error'); return; }

            // Calculate date shift
            const shift = dropDateIdx - _dragOrigStartCol;
            if (shift === 0 && dropPerson === evt.person) return; // no change

            // Apply date shift
            const oldStart = new Date(evt.startDate + 'T00:00:00');
            const oldEnd = new Date(evt.endDate + 'T00:00:00');
            oldStart.setDate(oldStart.getDate() + shift);
            oldEnd.setDate(oldEnd.getDate() + shift);
            evt.startDate = toDateStr(oldStart);
            evt.endDate = toDateStr(oldEnd);

            // Apply person change if dropped on different row
            if (dropPerson && dropPerson !== evt.person) {
                logActivity('edit', `Event "${evt.title}" reassigned from ${evt.person.split(' ')[0]} to ${dropPerson.split(' ')[0]}`);
                evt.person = dropPerson;
            }

            logActivity('edit', `Event "${evt.title}" moved to ${evt.startDate}`);
            saveEventsToLocalStorage();
            renderCalendar();
            showToast('Event moved', 'success');
        });
    });
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
        <div style="display:flex;gap:8px;margin-top:12px;">
            ${canDel ? `<button class="btn btn-primary btn-sm" onclick="openEditEventModal('${evt.id}'); closeEventDetailModal();">Edit</button>` : ''}
            ${canDel ? `<button class="btn btn-danger btn-sm" onclick="deleteEvent('${evt.id}'); closeEventDetailModal();">Delete</button>` : ''}
        </div>
    `;
    document.getElementById('eventDetailModal').classList.add('active');
}

function closeEventDetailModal() {
    document.getElementById('eventDetailModal').classList.remove('active');
}

// --- Add / Edit Event Modal ---
let editingEventId = null;

function _populateEventModal() {
    const personSelect = document.getElementById('eventPerson');
    personSelect.innerHTML = users.filter(u => u.role !== 'observer')
        .map(u => `<option value="${u.name}" ${u.name === currentUser.name ? 'selected' : ''}>${u.name}</option>`)
        .join('');

    const projectSelect = document.getElementById('eventProject');
    projectSelect.innerHTML = '<option value="">— None —</option>' +
        projects.map(p => `<option value="${p}">${p}</option>`).join('');
}

function openAddEventModal() {
    editingEventId = null;
    _populateEventModal();

    const today = new Date();
    document.getElementById('eventStartDate').value = toDateStr(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    document.getElementById('eventEndDate').value = toDateStr(tomorrow);
    document.getElementById('eventTitle').value = '';
    document.getElementById('eventLocation').value = '';

    document.getElementById('eventModalHeader').textContent = 'Add Event';
    document.getElementById('eventSaveBtn').textContent = 'Add Event';
    document.getElementById('addEventModal').classList.add('active');
}

function openEditEventModal(id) {
    const evt = events.find(e => e.id === id);
    if (!evt) return;
    editingEventId = id;
    _populateEventModal();

    document.getElementById('eventTitle').value = evt.title || '';
    document.getElementById('eventPerson').value = evt.person;
    document.getElementById('eventStartDate').value = evt.startDate;
    document.getElementById('eventEndDate').value = evt.endDate;
    document.getElementById('eventLocation').value = evt.location || '';
    document.getElementById('eventProject').value = evt.project || '';

    document.getElementById('eventModalHeader').textContent = 'Edit Event';
    document.getElementById('eventSaveBtn').textContent = 'Save Changes';
    document.getElementById('addEventModal').classList.add('active');
}

function closeAddEventModal() {
    document.getElementById('addEventModal').classList.remove('active');
    editingEventId = null;
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

    if (editingEventId) {
        // Update existing event
        const evt = events.find(e => e.id === editingEventId);
        if (evt) {
            evt.title = title;
            evt.person = person;
            evt.startDate = startDate;
            evt.endDate = endDate;
            evt.location = location;
            evt.project = project;
            saveEventsToLocalStorage();
            renderCalendar();
            showToast('Event updated', 'success');
        }
    } else {
        addEvent({ title, person, startDate, endDate, location, project, createdBy: currentUser.name });
        showToast('Event added', 'success');
    }
    closeAddEventModal();
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

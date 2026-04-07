/* ================================================================
   VOBL ATC OPS – script.js
   ----------------------------------------------------------------
   Sections (Ctrl+F to jump):
     1.  Configuration
     2.  App State
     3.  Auth – Login / Logout
     4.  Auth – Enter App / Role Setup
     5.  UTC Clock
     6.  Page Navigation
     7.  Dashboard – Charts
     8.  Dashboard – AI Intel Cycler
     9.  Operations – Shift Checklist
    10.  Operations – Operational Notes
    11.  Analytics – Build Page (role-gated)
    12.  Analytics – Incident Logger
    13.  Analytics – Flight Ops Monitor (tabs)
   ================================================================ */


/* ================================================================
   1. CONFIGURATION
   ================================================================ */

/**
 * Paste your Google Apps Script Web App URL here after deployment.
 * See SETUP_GUIDE.html for step-by-step instructions.
 */
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby4mgEq8vfVjG2n5BDAkSkgfOyUjUZt16W-dDSyuKdfNAMYFXKIO6MbmTVgPvGzx-7faw/exec';

/**
 * Role permissions map.
 * Add or remove roles here to control access across the app.
 *
 * canViewAnalytics  – whether the Analytics page is accessible at all
 * canLogIncidents   – whether the Incident Logger form is shown
 */
const ROLE_PERMISSIONS = {
  admin:      { canViewAnalytics: true,  canLogIncidents: true  },
  supervisor: { canViewAnalytics: true,  canLogIncidents: true  },
  controller: { canViewAnalytics: true,  canLogIncidents: false },
  trainee:    { canViewAnalytics: false, canLogIncidents: false },
};

/**
 * Shift checklist items.
 * Add, remove, or reorder items here – the list renders automatically.
 */
const CHECKLIST_ITEMS = [
  'Previous Shift Relieved in TWR',
  'Previous Shift Relieved in APP',
  'Runway Availability (TWR SUP)',
  'DRA Setup (Radar Inst./Trainee)',
  'MET Briefing (ARO)',
  'NOTAM Briefing (ARO)',
  'Check ATFM / CDM (FMP)',
  'Review Active SIGMETs',
  'Confirm Runway Config',
  'ATC Frequency Check',
  'Emergency Equipment Check',
  'Handover Log Reviewed',
  'Strip Board Initialized',
];

/**
 * AI Controller Intel messages (cycled every 8 seconds on Dashboard).
 * Add your own messages to expand the pool.
 */
const AI_MESSAGES = [
  '"Wind 090/05KT. Runway 09 preferred. QNH 1015. No significant changes forecast."',
  '"Visibility improving – expect VFR conditions sustained for next 2 hours."',
  '"Low traffic density in TMA. Standard sequencing recommended."',
  '"No active SIGMETs or AIRMETs affecting VOBL TMA at this time."',
];


/* ================================================================
   2. APP STATE
   ================================================================ */
let currentUser   = null;   // { username, displayName, role }
let checkStates   = [];     // Boolean array – mirrors CHECKLIST_ITEMS
let notes         = [];     // Operational notes for current session
let visChartInst  = null;   // Chart.js instance – visibility sparkline
let incChartInst  = null;   // Chart.js instance – incident YTD bar
let clockInterval = null;   // setInterval handle for the UTC clock
let aiInterval    = null;   // setInterval handle for AI message cycler
let aiIndex       = 0;      // Current AI message index


/* ================================================================
   3. AUTH – LOGIN / LOGOUT
   ================================================================ */

/** Toggle password field visibility */
function togglePw() {
  const input  = document.getElementById('loginPass');
  const icon   = document.getElementById('eyeIcon');
  const isText = input.type === 'text';

  input.type = isText ? 'password' : 'text';
  icon.innerHTML = isText
    // Eye (visible)
    ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    // Eye-off (hidden)
    : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>';
}

/** Show or clear the login error banner */
function showLoginError(msg) {
  const banner = document.getElementById('loginError');
  document.getElementById('loginErrorMsg').textContent = msg;
  banner.classList.add('visible');
  document.getElementById('loginUser').classList.add('error');
  document.getElementById('loginPass').classList.add('error');

  // Shake animation
  const card = document.querySelector('.login-card');
  card.style.transition = 'none';
  card.style.transform  = 'translateX(-8px)';
  setTimeout(() => {
    card.style.transition = 'transform 0.4s cubic-bezier(0.36,0.07,0.19,0.97)';
    card.style.transform  = 'translateX(0)';
  }, 50);
}
function clearLoginError() {
  document.getElementById('loginError').classList.remove('visible');
  document.getElementById('loginUser').classList.remove('error');
  document.getElementById('loginPass').classList.remove('error');
}

/** Called by the login form on button click or Enter key */
async function doLogin() {
  clearLoginError();

  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;

  if (!username || !password) {
    showLoginError('Please enter both username and password.');
    return;
  }

  const btn = document.getElementById('loginBtn');
  btn.classList.add('loading');
  btn.disabled = true;

  // ── DEMO MODE ──────────────────────────────────────────────────
  // Remove this block once APPS_SCRIPT_URL is set.
/*  if (APPS_SCRIPT_URL === 'https://script.google.com/macros/s/AKfycbzLp2b3m6tAwDkQm61iEuE-DfL8jyjHmBscb7fMdZQmeZkETAkAnv4Mlgx0IySbSUx34w/exec') {
    await sleep(1200);
    btn.classList.remove('loading');
    btn.disabled = false;
    showLoginError('Apps Script not configured yet. See SETUP_GUIDE.html.');
    return;
  }*/
  // ───────────────────────────────────────────────────────────────

  try {
    const url  = `${APPS_SCRIPT_URL}?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    const res  = await fetch(url);
    const data = await res.json();

    if (data.success) {
      currentUser = {
        username:    username,
        displayName: data.displayName || username,
        role:        data.role || 'Controller',
      };
      enterApp();
    } else {
      showLoginError(data.message || 'Invalid credentials. Access denied.');
    }
  } catch (err) {
    showLoginError('Connection error. Check network or Apps Script URL.');
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
}

/** Log out – clear state and return to login screen */
function doLogout() {
  // Stop intervals
  if (clockInterval) { clearInterval(clockInterval); clockInterval = null; }
  if (aiInterval)    { clearInterval(aiInterval);    aiInterval    = null; }

  // Destroy charts
  if (visChartInst) { visChartInst.destroy(); visChartInst = null; }
  if (incChartInst) { incChartInst.destroy(); incChartInst = null; }

  // Reset state
  currentUser = null;
  notes       = [];
  checkStates = [];

  // Switch screens
  document.getElementById('appShell').style.display   = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  clearLoginError();
}

// Allow Enter key to submit
document.getElementById('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('loginUser').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });


/* ================================================================
   4. AUTH – ENTER APP / ROLE SETUP
   ================================================================ */

/** Called on successful authentication – shows the main app */
function enterApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display    = 'block';

  // Populate navbar user pill
  const initials = currentUser.displayName
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  document.getElementById('userAvatar').textContent      = initials;
  document.getElementById('userDisplayName').textContent = currentUser.displayName;

  const roleBadge = document.getElementById('userRoleBadge');
  roleBadge.textContent = currentUser.role;
  roleBadge.className   = 'nav-user-role role-' + currentUser.role.toLowerCase();

  // Initialise sub-systems
  startClock();
  initVisibilityChart();
  renderChecklist();
  buildAnalyticsPage();
  startAICycler();
   loadWeather();

  showPage('dashboard');
}

/** Returns the permissions object for the current user's role */
function getPerms() {
  const role = (currentUser?.role || 'trainee').toLowerCase();
  return ROLE_PERMISSIONS[role] || { canViewAnalytics: false, canLogIncidents: false };
}


/* ================================================================
   5. UTC CLOCK
   ================================================================ */
function startClock() {
  updateClock();
  clockInterval = setInterval(updateClock, 1000);
}

function updateClock() {
  const now    = new Date();
  const h      = pad(now.getUTCHours());
  const m      = pad(now.getUTCMinutes());
  const s      = pad(now.getUTCSeconds());
  const days   = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  setText('clock',     `${h}:${m}:${s} UTC`);
  setText('clockDate', `${days[now.getUTCDay()]}, ${pad(now.getUTCDate())} ${months[now.getUTCMonth()]} ${now.getUTCFullYear()}`);
  setText('notamTime', `${h}:${m} UTC`);
  setText('fomLast',   `${h}:${m}:${s}`);
}


/* ================================================================
   6. PAGE NAVIGATION
   ================================================================ */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.add('active');
  document.getElementById(`btn-${name}`).classList.add('active');
}


/* ================================================================
   7. DASHBOARD – CHARTS
   ================================================================ */

/** Visibility sparkline (line chart) */
function initVisibilityChart() {
  if (visChartInst) visChartInst.destroy();

  const ctx = document.getElementById('visChart').getContext('2d');
  visChartInst = new Chart(ctx, {
    type: 'line',
    data: {
      labels:   ['-120m', '-90m', '-60m', '-30m', 'NOW'],
      datasets: [{
        data:            [2500, 2200, 2400, 3000, 4000],
        borderColor:     '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.08)',
        borderWidth:     2,
        fill:            true,
        tension:         0.4,
        pointRadius:     4,
        pointBackgroundColor: '#3b82f6',
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#4a6280', font: { size: 10 } }, grid: { color: '#1a2a3f' } },
        y: { min: 0, max: 4500, ticks: { color: '#4a6280', font: { size: 10 }, stepSize: 500 }, grid: { color: '#1a2a3f' } },
      },
    },
  });
}

/** Incident YTD bar chart */
function initIncidentChart() {
  const canvas = document.getElementById('incidentChart');
  if (!canvas) return;
  if (incChartInst) incChartInst.destroy();

  incChartInst = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels:   ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [{
        data:            [2, 1, 1, 0, 0, 0],
        backgroundColor: 'rgba(59,130,246,0.55)',
        borderColor:     'rgba(59,130,246,0.9)',
        borderWidth:     1,
        borderRadius:    3,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#4a6280', font: { size: 11 } }, grid: { color: '#1a2a3f' } },
        y: { min: 0, ticks: { color: '#4a6280', font: { size: 11 }, stepSize: 0.5 }, grid: { color: '#1a2a3f' } },
      },
      onClick: (e, els) => {
        if (!els.length) return;
        const month = incChartInst.data.labels[els[0].index];
        const count = incChartInst.data.datasets[0].data[els[0].index];
        alert(`Month: ${month}\nIncidents: ${count}`);
      },
    },
  });
}


/* ================================================================
   8. DASHBOARD – AI INTEL CYCLER
   ================================================================ */
function startAICycler() {
  if (aiInterval) clearInterval(aiInterval);
  aiIndex = 0;

  setTimeout(() => {
    setText('aiText', AI_MESSAGES[0]);
    aiInterval = setInterval(() => {
      aiIndex = (aiIndex + 1) % AI_MESSAGES.length;
      setText('aiText', AI_MESSAGES[aiIndex]);
    }, 8000);
  }, 1500);
}


/* ================================================================
   9. OPERATIONS – SHIFT CHECKLIST
   ================================================================ */

/** Render the checklist from CHECKLIST_ITEMS + checkStates */
function renderChecklist() {
  const container = document.getElementById('checklistItems');
  if (!container) return;

  // Ensure state array matches items length
  if (checkStates.length !== CHECKLIST_ITEMS.length) {
    checkStates = new Array(CHECKLIST_ITEMS.length).fill(false);
  }

  const doneCount = checkStates.filter(Boolean).length;
  setText('checkCount', `${doneCount} / ${CHECKLIST_ITEMS.length}`);

  container.innerHTML = CHECKLIST_ITEMS.map((item, i) => `
    <div class="check-item">
      <div class="check-item-text">
        <div class="check-item-name  ${checkStates[i] ? 'done' : ''}">${item}</div>
        <div class="check-item-status ${checkStates[i] ? 'done' : ''}">${checkStates[i] ? 'CONFIRMED' : 'AWAITING CHECK'}</div>
      </div>
      <label class="toggle">
        <input type="checkbox" ${checkStates[i] ? 'checked' : ''} onchange="toggleCheck(${i})">
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join('');
}

/** Toggle a checklist item on/off */
function toggleCheck(i) {
  checkStates[i] = !checkStates[i];
  renderChecklist();
}


/* ================================================================
   10. OPERATIONS – OPERATIONAL NOTES
   ================================================================ */

/** Post a new note to the shift log */
function postNote() {
  const input = document.getElementById('noteInput');
  const val   = input.value.trim();
  if (!val) return;

  const now = new Date();
  const ts  = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())} UTC`;

  notes.unshift({
    text:   val,
    time:   ts,
    author: currentUser?.displayName || '–',
  });

  input.value = '';
  renderNotes();
}

/** Re-render the notes list */
function renderNotes() {
  const area = document.getElementById('notesArea');
  if (!area) return;

  if (!notes.length) {
    area.innerHTML = `
      <div class="notes-empty">
        <div class="notes-empty-icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M12 20h9"/>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </div>
        <div class="notes-empty-text">No active logs for this shift</div>
      </div>`;
    return;
  }

  area.innerHTML = notes.map(n => `
    <div class="note-entry">
      <div class="note-entry-meta">
        <span class="note-entry-time">${n.time}</span>
        <span class="note-entry-author">${n.author}</span>
      </div>
      <div class="note-entry-text">${n.text}</div>
    </div>
  `).join('');
}


/* ================================================================
   11. ANALYTICS – BUILD PAGE (role-gated)
   ================================================================ */

/**
 * Dynamically builds the Analytics page HTML based on the
 * logged-in user's role permissions.
 * Called once after login inside enterApp().
 */
function buildAnalyticsPage() {
  const container = document.getElementById('analyticsContent');
  if (!container) return;

  const perms = getPerms();

  // ── Trainee: full block ──────────────────────────────────────
  if (!perms.canViewAnalytics) {
    container.innerHTML = `
      <div class="access-denied">
        <div class="access-denied-icon">🔒</div>
        <div class="access-denied-text">Analytics access restricted — ${currentUser.role} role</div>
        <div style="font-size:11px;color:var(--text-dim);margin-top:4px;">
          Contact your supervisor to request access.
        </div>
      </div>`;
    return;
  }

  // ── Controller: read-only info panel instead of logger ──────
  const incidentLoggerHTML = perms.canLogIncidents
    ? `
      <div class="card">
        <div class="incident-logger-title">
          <div class="incident-icon">⚠</div>
          Incident Logger
        </div>

        <div class="form-group">
          <span class="label">Incident Type</span>
          <select class="input" id="incidentType">
            <option>Bird Strike</option>
            <option>Runway Incursion</option>
            <option>TCAS RA</option>
            <option>Go Around</option>
            <option>Wake Turbulence</option>
            <option>Communication Failure</option>
            <option>Equipment Malfunction</option>
            <option>Airspace Infringement</option>
          </select>
        </div>

        <div class="form-row">
          <div>
            <span class="label">Time (UTC)</span>
            <input type="text" class="input" placeholder="HH:MM" id="incidentTime">
          </div>
          <div>
            <span class="label">POB</span>
            <input type="number" class="input" value="0" id="incidentPOB">
          </div>
        </div>

        <div class="form-group">
          <span class="label">Pilot-in-Command</span>
          <input type="text" class="input" id="incidentPIC">
        </div>

        <div class="form-group">
          <span class="label">Reason / Details</span>
          <textarea class="input" id="incidentDetails" placeholder="Enter details…"></textarea>
        </div>

        <button class="btn-primary" onclick="commitIncident()">COMMIT TO LOG</button>
      </div>`
    : `
      <div class="card" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:10px;padding:40px;">
        <div style="font-size:22px;opacity:0.3;">🔒</div>
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);">Incident Logging</div>
        <div style="font-size:13px;color:var(--text-secondary);text-align:center;">
          Read-only — Supervisor or Admin role required to log incidents.
        </div>
      </div>`;

  // ── Shared layout (Controller + Supervisor + Admin) ──────────
  container.innerHTML = `
    <div class="analytics-top">
      ${incidentLoggerHTML}

      <div class="card">
        <div class="chart-title">Incident Trends (YTD)</div>
        <canvas id="incidentChart"></canvas>
        <div class="chart-hint">Click a bar to inspect specific month categories</div>
      </div>
    </div>

    <div>
      <div class="fom-title">FLIGHT OPS MONITOR</div>
      <div class="fom-meta">
        <div class="dot"></div>
        Multi-Source ADSB Feed &bull; VOBL TMA
        <span class="refresh">
          Refresh: 5M &bull; Last: <span id="fomLast">--:--:--</span>
        </span>
      </div>
      <div>
        <span class="live-filter">LIVE FILTER: T+2M TO T+45M</span>
        <span class="fom-sub" style="margin-left:10px;">Optimized Sector View</span>
      </div>

      <div class="fom-layout">
        <div>
          <div class="tab-row">
            <button class="tab-btn active" id="tabArrivals"   onclick="switchTab('arrivals')">ARRIVALS</button>
            <button class="tab-btn"        id="tabDepartures" onclick="switchTab('departures')">DEPARTURES</button>
          </div>
          <table class="flights-table">
            <thead>
              <tr>
                <th>Flight ID</th>
                <th>Origin</th>
                <th>Type</th>
                <th>Alt (ft)</th>
                <th>Spd (kt)</th>
                <th>ETA</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colspan="7" style="text-align:center;color:var(--text-dim);padding:32px;letter-spacing:0.1em;text-transform:uppercase;font-size:11px;">
                  No active flights in sector
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="briefing-card">
          <div class="briefing-title">ATC Briefing Summary</div>
          <div style="font-size:12px;color:var(--text-dim);font-style:italic;">
            No briefing data available.
          </div>
        </div>
      </div>
    </div>`;

  // Init chart after DOM is ready
  setTimeout(initIncidentChart, 50);
}


/* ================================================================
   12. ANALYTICS – INCIDENT LOGGER
   ================================================================ */

/** Commit an incident to the log and update the chart */
function commitIncident() {
  const time = document.getElementById('incidentTime')?.value?.trim();
  if (!time) {
    alert('Please enter time (UTC) before committing.');
    return;
  }

  const type = document.getElementById('incidentType')?.value;
  const mon  = new Date().getUTCMonth();

  // Bump the current month's bar
  if (incChartInst) {
    incChartInst.data.datasets[0].data[mon]++;
    incChartInst.update();
  }

  alert(`✓ Incident logged\nType: ${type}\nTime: ${time} UTC`);

  // Clear form
  document.getElementById('incidentTime').value = '';
  const pob     = document.getElementById('incidentPOB');
  const pic     = document.getElementById('incidentPIC');
  const details = document.getElementById('incidentDetails');
  if (pob)     pob.value     = '0';
  if (pic)     pic.value     = '';
  if (details) details.value = '';
}


/* ================================================================
   13. ANALYTICS – FLIGHT OPS MONITOR (TABS)
   ================================================================ */
function switchTab(tab) {
  const arrBtn = document.getElementById('tabArrivals');
  const depBtn = document.getElementById('tabDepartures');
  if (arrBtn) arrBtn.classList.toggle('active', tab === 'arrivals');
  if (depBtn) depBtn.classList.toggle('active', tab === 'departures');
  // TODO: swap flight table data when live feed is connected
}


/* ================================================================
   HELPERS
   ================================================================ */

/** Zero-pad a number to 2 digits */
function pad(n) { return String(n).padStart(2, '0'); }

/** Safely set textContent on an element by id (no-op if not found) */
function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* ===========================================================
      Weather code
   =========================================================*/
async function loadWeather() {
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=weather`);
    const data = await res.json();

    if (data.success) {
     document.getElementById('metarText').textContent = data.metar;
document.getElementById('tafText').textContent   = data.taf;
    }
  } catch (err) {
    console.error("Weather fetch error:", err);
  }
}



/** Simple async sleep */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

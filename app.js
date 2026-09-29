const CONFIG = {
    BASE_STORAGE_KEY: 'pureEnergyTasks',
    BASE_LISTS_KEY: 'pureEnergyBankingLists',
    SYNC_URL_KEY: 'pureEnergySyncUrl',
    TOKEN_KEY: 'pureEnergyAuthToken',
    GMAIL_INDEX_KEY: 'pureEnergyGmailIndex',
    LEGACY_MIGRATED_KEY: 'pureEnergyLegacyMigratedTo',
    BASE_LISTS_TS_KEY: 'pureEnergyListsUpdatedAt',
    BASE_HOLIDAYS_KEY: 'pureEnergyHolidays',
    BASE_HOLIDAYS_TS_KEY: 'pureEnergyHolidaysUpdatedAt',
    BASE_HOLIDAY_ACK_KEY: 'pureEnergyHolidayAlertAck',
    BASE_CUSTOM_CALENDARS_KEY: 'pureEnergyCustomCalendars',
    BASE_LEAVE_DAYS_KEY: 'pureEnergyLeaveDays',
    BASE_DEADLINE_ACK_KEY: 'pureEnergyDeadlineAlertAck',
    get STORAGE_KEY() { return `${this.BASE_STORAGE_KEY}_${app.currentUser}`; },
    get LISTS_KEY() { return `${this.BASE_LISTS_KEY}_${app.currentUser}`; },
    get LISTS_TS_KEY() { return `${this.BASE_LISTS_TS_KEY}_${app.currentUser}`; },
    get HOLIDAYS_KEY() { return `${this.BASE_HOLIDAYS_KEY}_${app.currentUser}`; },
    get HOLIDAYS_TS_KEY() { return `${this.BASE_HOLIDAYS_TS_KEY}_${app.currentUser}`; },
    get HOLIDAY_ACK_KEY() { return `${this.BASE_HOLIDAY_ACK_KEY}_${app.currentUser}`; },
    get CUSTOM_CALENDARS_KEY() { return `${this.BASE_CUSTOM_CALENDARS_KEY}_${app.currentUser}`; },
    get LEAVE_DAYS_KEY() { return `${this.BASE_LEAVE_DAYS_KEY}_${app.currentUser}`; },
    get DEADLINE_ACK_KEY() { return `${this.BASE_DEADLINE_ACK_KEY}_${app.currentUser}`; }
};

const app = {
    currentUser: null,
    tasks: [], lists: {}, currentTab: 'Dashboard',
    editingId: null, editingListKey: null, sortCol: 'dateLogged', sortAsc: false,
    engineInterval: null,
    audioCtx: null, alarmInterval: null, alarmSoundTimeout: null, audioUnlocked: false,

    isAlarming: false, alarmingTasks: [], alarmSignature: '',
    lastSyncJSON: "", syncInProgress: false, userClearedAll: false, listsUpdatedAt: 0,
    fetchedEmails: [], storedEmailId: null, _searchTimer: null,

    // Seed Holiday Calendar (USD & Indian AP/TS) — copied into each user's own
    // editable list on first run by loadHolidays(). Never mutated directly.
    DEFAULT_HOLIDAYS: [
        { date: '2026-01-01', name: 'New Year\'s Day', nextWorkingDay: '2026-01-02', type: 'USD Holiday' },
        { date: '2026-01-14', name: 'Bhogi', nextWorkingDay: '2026-01-16', type: 'Indian Bank Holiday' },
        { date: '2026-01-15', name: 'Makar Sankranti', nextWorkingDay: '2026-01-16', type: 'Indian Bank Holiday' },
        { date: '2026-01-19', name: 'Martin Luther King Jr. Day', nextWorkingDay: '2026-01-20', type: 'USD Holiday' },
        { date: '2026-01-26', name: 'Republic Day', nextWorkingDay: '2026-01-27', type: 'Indian Bank Holiday' },
        { date: '2026-02-16', name: 'Washington\'s Birthday', nextWorkingDay: '2026-02-17', type: 'USD Holiday' },
        { date: '2026-03-19', name: 'Ugadi', nextWorkingDay: '2026-03-20', type: 'Indian Bank Holiday' },
        { date: '2026-05-25', name: 'Memorial Day', nextWorkingDay: '2026-05-26', type: 'USD Holiday' },
        { date: '2026-07-03', name: 'Independence Day (Observed)', nextWorkingDay: '2026-07-06', type: 'USD Holiday' },
        { date: '2026-08-15', name: 'Independence Day (India)', nextWorkingDay: '2026-08-17', type: 'Indian Bank Holiday' },
        { date: '2026-09-07', name: 'Labor Day', nextWorkingDay: '2026-09-08', type: 'USD Holiday' },
        { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti', nextWorkingDay: '2026-10-05', type: 'Indian Bank Holiday' },
        { date: '2026-10-12', name: 'Columbus Day', nextWorkingDay: '2026-10-13', type: 'USD Holiday' },
        { date: '2026-11-11', name: 'Veterans Day', nextWorkingDay: '2026-11-12', type: 'USD Holiday' },
        { date: '2026-11-26', name: 'Thanksgiving Day', nextWorkingDay: '2026-11-27', type: 'USD Holiday' },
        { date: '2026-12-25', name: 'Christmas Day', nextWorkingDay: '2026-12-28', type: 'USD Holiday' }
    ],

    // Live, per-user, editable Holiday Calendar — loaded by loadHolidays().
    holidays: [],
    editingHolidayId: null,
    holidaysUpdatedAt: 0,

    // Shared Icons for Space-Saving Buttons
    SVGS: {
        edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
        done: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>',
        reopen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><polyline points="3 3 3 8 8 8"></polyline></svg>',
        bin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
        restore: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="9 14 4 9 9 4"></polyline><path d="M20 20v-7a4 4 0 0 0-4-4H4"></path></svg>',
        mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>',
        copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
        copied: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"></polyline></svg>'
    },

    /* ---------- SMALL HELPERS ---------- */
    sanitize(str) { const div = document.createElement('div'); div.textContent = (str === undefined || str === null) ? '' : str; return div.innerHTML; },

    escAttr(str) {
        return String(str === undefined || str === null ? '' : str)
            .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    newId() {
        try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
        return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    },

    findTask(id) { return this.tasks.find(t => String(t.id) === String(id)); },

    debouncedRender() {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.renderTable(), 200);
    },

    gmailUrl(id) {
        const idx = localStorage.getItem(CONFIG.GMAIL_INDEX_KEY) || '0';
        return 'https://mail.google.com/mail/u/' + encodeURIComponent(idx) + '/#all/' + encodeURIComponent(id);
    },

    getLocalDateStr(d) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    formatDateStr(dateStr, opts) {
        if (!dateStr) return '-';
        const p = String(dateStr).split('-').map(Number);
        if (p.length < 3 || !p[0] || !p[1] || !p[2]) return this.sanitize(String(dateStr));
        return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
    },

    formatTimeStr(timeStr) {
        if (!timeStr) return '';
        const parts = String(timeStr).split(':');
        const h24 = Number(parts[0]);
        if (!isFinite(h24)) return '';
        const mm = String(parts[1] === undefined ? '00' : parts[1]).padStart(2, '0').slice(0, 2);
        const ampm = h24 >= 12 ? 'PM' : 'AM';
        return `${h24 % 12 || 12}:${mm} ${ampm}`;
    },

    getTaskDueDateTime(t) {
        if (!t || !t.dueDate) return null;
        const [year, month, day] = String(t.dueDate).split('-').map(Number);
        if (!year || !month || !day) return null;
        let hours = 23, minutes = 59, seconds = 59;
        if (t.dueTime) {
            const parts = String(t.dueTime).split(':').map(Number);
            hours = parts[0] || 0;
            minutes = parts[1] || 0;
            seconds = 0;
        }
        return new Date(year, month - 1, day, hours, minutes, seconds);
    },

    getTaskDeadlineDateTime(t) {
        if (!t || !t.deadlineDate) return null;
        const [year, month, day] = String(t.deadlineDate).split('-').map(Number);
        if (!year || !month || !day) return null;
        let hours = 23, minutes = 59, seconds = 59;
        if (t.deadlineTime) {
            const parts = String(t.deadlineTime).split(':').map(Number);
            hours = parts[0] || 0;
            minutes = parts[1] || 0;
            seconds = 0;
        }
        return new Date(year, month - 1, day, hours, minutes, seconds);
    },

    /* ---------- AUTH & 5 GLASS THEMES ---------- */
    checkAuthOnStart() {
        this.currentUser = localStorage.getItem('currentUser') || 'default';
        localStorage.setItem('currentUser', this.currentUser);
        this.applyTheme();

        document.getElementById('mainAppHeader').style.display = 'flex';
        document.getElementById('tabBar').style.display = 'flex';
        
        this.initApp();
        this.hideSplash();

        if (!(localStorage.getItem(CONFIG.SYNC_URL_KEY) || '').trim()) {
            setTimeout(() => this.showToast('Add your sheet link in Config → Cloud Sync', 'info'), 1400);
        }
    },

    THEME_KEY: 'pureEnergyTheme',

    /* Boot splash: hold it just long enough for the mark to finish drawing,
       then fade out and let the shell animate in behind it. */
    BOOT_MIN_MS: 1350,

    hideSplash() {
        const el = document.getElementById('bootSplash');
        if (!el || el.classList.contains('gone')) return;

        const started = Number(window.__bootAt) || Date.now();
        const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const wait = reduce ? 0 : Math.max(0, this.BOOT_MIN_MS - (Date.now() - started));

        setTimeout(() => {
            el.classList.add('gone');
            document.body.classList.add('booted');
            setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 700);
        }, wait);
    },

    THEMES: {
        pearl:  '#f2f2f7',
        glass:  '#bfc9f5',
        neuo:   '#e6ebf2',
        clay:   '#e7ecff',
        hero3d: '#10142a'
    },

    applyTheme(mode) {
        // Defaults to the pure light 'pearl' theme. Anything unrecognised —
        // including a theme saved before this build — falls back to it.
        let pick = mode || localStorage.getItem(this.THEME_KEY) || 'pearl';
        if (!Object.prototype.hasOwnProperty.call(this.THEMES, pick)) pick = 'pearl';

        localStorage.setItem(this.THEME_KEY, pick);
        document.documentElement.setAttribute('data-theme', pick);

        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', this.THEMES[pick]);

        document.querySelectorAll('.theme-btn').forEach(b => {
            b.classList.toggle('on', b.dataset.theme === pick);
        });
    },

    /* ---------- TEXT SIZE ---------- */
    TEXTSIZE_KEY: 'pureEnergyTextSize',
    TEXT_SIZES: { small: '87.5%', default: '100%', large: '112.5%', xlarge: '125%' },

    applyTextSize(mode) {
        let pick = mode || localStorage.getItem(this.TEXTSIZE_KEY) || 'default';
        if (!Object.prototype.hasOwnProperty.call(this.TEXT_SIZES, pick)) pick = 'default';

        localStorage.setItem(this.TEXTSIZE_KEY, pick);
        document.documentElement.style.fontSize = this.TEXT_SIZES[pick];

        document.querySelectorAll('.textsize-btn').forEach(b => {
            b.classList.toggle('on', b.dataset.size === pick);
        });
    },

    cloudRequest(payload) {
        const SCRIPT_URL = (localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim();
        if (!SCRIPT_URL) return Promise.reject(new Error("Cloud URL is not configured (Setup)"));
        const body = Object.assign({}, payload, {
            username: payload.username || this.currentUser
        });
        return fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body)
        }).then(res => res.json());
    },

    // A status that means no work has happened on this entry yet — never
    // worth a Daily Activity Report line by itself. Matched loosely so it
    // still works whatever this profile's exact status list says.
    isUnstartedStatus(status) {
        return /not\s*(yet\s*)?start/i.test(String(status || '').trim());
    },

    // What actually goes into a report line for this task: the Tally
    // Narration if one was generated (it's already the clearest, most
    // complete description of what was done) — but WITHOUT the Mail Chain
    // / mail subject baked into it, since that's meant for Tally, not the
    // report — otherwise whatever is in Notes (which also picks up any
    // remark typed in the Past Due Alert), otherwise the fallback given.
    reportDetailsFor(task, fallback) {
        if (task && task.narration) {
            if (task.narration.reportText) return task.narration.reportText;
            if (task.narration.text) {
                // Older entries saved before reportText existed: strip the
                // Mail Chain back out of the already-built text.
                let t = task.narration.text;
                if (task.mailChain && t.indexOf(task.mailChain) !== -1) {
                    t = t.split(task.mailChain).join('').trim();
                }
                return t;
            }
        }
        if (task && task.notes) return task.notes;
        return fallback || '';
    },

    /* ---------- ACTIVITY LOG (fire-and-forget: never blocks or fails the
       actual task action if the cloud URL is unset or the request fails).
       Only "completed" and "status-changed" are logged — the Daily
       Activity Report is built from this feed, and it should only ever
       list tasks that were actually finished or moved forward today, not
       every edit/reschedule/reopen/bin touch, and never a status change
       that just lands back on "Not yet started". ---------- */
    logTaskActivity(task, action, details, dateOverride) {
        if (!task || !this.currentUser) return;
        if (action !== 'completed' && action !== 'status-changed') return;
        if ((localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim() === "") return Promise.resolve();
        return this.cloudRequest({
            action: 'logActivity',
            logType: 'task',
            entry: {
                taskId: task.id,
                taskDescription: task.description,
                action: action,
                details: details || '',
                // Sent explicitly so the report can group by the date this
                // was actually done in the user's own local timezone,
                // rather than whatever timezone the request lands in.
                // resyncCompletedForReport() passes the entry's own
                // completedDate here when backfilling a past date.
                date: dateOverride || this.getLocalDateStr(new Date())
            }
        }).catch(() => {});
    },

    logGeneralActivity(activity, details) {
        if (!this.currentUser) return Promise.reject(new Error('No profile'));
        if ((localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim() === "") return Promise.reject(new Error('Cloud URL is not configured (Setup)'));
        return this.cloudRequest({
            action: 'logActivity',
            logType: 'general',
            entry: { activity: activity, details: details || '' }
        });
    },

    submitGeneralLog() {
        const activityEl = document.getElementById('generalLogActivity');
        const detailsEl = document.getElementById('generalLogDetails');
        const activity = (activityEl.value || '').trim();
        if (!activity) { this.showToast('Describe what you did first.', 'warning'); return; }

        this.logGeneralActivity(activity, (detailsEl.value || '').trim())
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Failed to log activity');
                activityEl.value = '';
                detailsEl.value = '';
                this.showToast('Activity logged.', 'success');
            })
            .catch(err => this.showToast(err.message || 'Failed to log activity', 'error'));
    },

    // Safety net for the Daily Activity Report: re-sends every entry that's
    // actually Completed on the chosen date to the activity log, in case
    // any of them were completed through a path that didn't log at the
    // time (an older version of the app, a dropped request, etc.). A Skip
    // never sets status to Completed, so a skipped-but-still-open entry is
    // naturally excluded already. Always safe to run again — it just
    // re-sends the same "completed" entries, it never invents new ones.
    resyncCompletedForReport() {
        const dateEl = document.getElementById('dailyReportDate');
        const date = dateEl.value || this.getLocalDateStr(new Date());
        const matches = this.tasks.filter(t => !t.deleted && t.status === 'Completed' && t.completedDate === date);

        if (!matches.length) { this.showToast('No completed entries found for ' + date + '.', 'info'); return; }
        if ((localStorage.getItem(CONFIG.SYNC_URL_KEY) || '').trim() === '') {
            this.showToast('Cloud URL is not configured (Setup).', 'warning');
            return;
        }

        this.showToast('Resending ' + matches.length + ' completed ' + (matches.length === 1 ? 'entry' : 'entries') + '…', 'info');
        Promise.all(matches.map(t => this.logTaskActivity(t, 'completed', this.reportDetailsFor(t), date)))
            .then(() => this.showToast('Resynced ' + matches.length + ' completed ' + (matches.length === 1 ? 'entry' : 'entries') + ' for ' + date + ' — generate the report now.', 'success'));
    },

    generateDailyReport() {
        const dateEl = document.getElementById('dailyReportDate');
        const date = dateEl.value || this.getLocalDateStr(new Date());
        const out = document.getElementById('dailyReportOutput');
        const actions = document.getElementById('dailyReportActions');

        out.style.display = 'block';
        out.textContent = 'Generating…';
        actions.style.display = 'none';

        this.cloudRequest({ action: 'generateDailyReport', date: date })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Failed to generate report');
                out.textContent = data.report;
                actions.style.display = 'grid';
                this.showToast('Report generated.', 'success');
            })
            .catch(err => {
                out.textContent = '';
                out.style.display = 'none';
                this.showToast(err.message || 'Failed to generate report', 'error');
            });
    },

    copyDailyReport() {
        const out = document.getElementById('dailyReportOutput');
        const text = out ? out.textContent : '';
        if (!text) return;
        navigator.clipboard.writeText(text)
            .then(() => this.showToast('Report copied.', 'success'))
            .catch(() => this.showToast('Could not copy — select the text manually.', 'warning'));
    },

    exportDailyReportExcel() {
        const out = document.getElementById('dailyReportOutput');
        const text = out ? out.textContent : '';
        if (!text) { this.showToast('Generate a report first.', 'warning'); return; }
        if (typeof XLSX === 'undefined') { this.showToast('Excel export library did not load — check your connection and try again.', 'error'); return; }

        const date = document.getElementById('dailyReportDate').value || this.getLocalDateStr(new Date());
        const generatedAt = new Date().toLocaleString();

        const rows = [
            ['Daily Activity Report'],
            ['Date', date],
            ['Generated', generatedAt],
            ['Profile', this.currentUser || ''],
            [],
            ['Report']
        ];
        text.split('\n').forEach(line => rows.push([line]));

        const sheet = XLSX.utils.aoa_to_sheet(rows);
        sheet['!cols'] = [{ wch: 100 }];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, 'Daily Report');
        XLSX.writeFile(workbook, `Daily_Activity_Report_${date}.xlsx`);
        this.showToast('Excel file downloaded.', 'success');
    },

    /* ---------- REPORT STYLE SAMPLES ---------- */
    saveReportSample() {
        const el = document.getElementById('reportSampleText');
        const text = (el.value || '').trim();
        if (!text) { this.showToast('Paste a report first.', 'warning'); return; }

        this.cloudRequest({ action: 'saveReportSample', sampleText: text })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Failed to save sample');
                el.value = '';
                this.showToast('Style sample saved.', 'success');
                this.loadReportSamples();
            })
            .catch(err => this.showToast(err.message || 'Failed to save sample', 'error'));
    },

    loadReportSamples() {
        const box = document.getElementById('reportSamplesList');
        if (!box) return;
        this.cloudRequest({ action: 'listReportSamples' })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Failed to load samples');
                const samples = data.samples || [];
                if (!samples.length) {
                    box.innerHTML = '<div class="empty-state" style="padding:16px;"><span>No style samples saved yet.</span></div>';
                    return;
                }
                box.innerHTML = samples.map(s => {
                    const preview = (s.sampleText || '').replace(/\n/g, ' ').substring(0, 90);
                    return `<div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:var(--input-bg); border:1px solid var(--line);">
                        <span style="flex:1; min-width:0; font-size:0.82rem; color:var(--label-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${this.escAttr(s.sampleText || '')}">${this.sanitize(preview)}${(s.sampleText || '').length > 90 ? '…' : ''}</span>
                        <button type="button" class="btn-icon bad" onclick="app.deleteReportSample('${this.escAttr(s.id)}')" title="Delete sample">${this.SVGS.bin}</button>
                    </div>`;
                }).join('');
            })
            .catch(() => { box.innerHTML = '<div class="empty-state" style="padding:16px;"><span>Could not load samples — check your Cloud URL.</span></div>'; });
    },

    deleteReportSample(id) {
        if (!confirm('Remove this style sample?')) return;
        this.cloudRequest({ action: 'deleteReportSample', id: id })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Failed to delete sample');
                this.showToast('Sample removed.', 'success');
                this.loadReportSamples();
            })
            .catch(err => this.showToast(err.message || 'Failed to delete sample', 'error'));
    },

    /* ---------- FIXED DAILY ACTIVITIES ---------- */
    /* ---------- CONFIG TAB: sidebar-nav + single-panel shell ----------
       Desktop shows the nav list and the active panel side by side.
       Mobile shows one at a time — tapping a nav row drills into that
       panel with a back button; entering the Config tab always starts
       back at the list on mobile, so it reads like a settings menu. ---------- */
    CFG_LAST_PANEL_KEY: 'pureEnergyCfgLastPanel',

    enterCfgTab() {
        const shell = document.getElementById('cfgShell');
        if (!shell) return;
        const last = localStorage.getItem(this.CFG_LAST_PANEL_KEY);
        const first = document.querySelector('.cfg-nav-item')?.dataset.cfgPanel;
        this.setCfgActivePanel(last || first, false);
        shell.classList.remove('showing-panel'); // always start at the list on mobile
    },

    setCfgActivePanel(slug, persist = true) {
        if (!slug) return;
        document.querySelectorAll('.cfg-nav-item').forEach(el => el.classList.toggle('active', el.dataset.cfgPanel === slug));
        document.querySelectorAll('.cfg-panel').forEach(el => el.classList.toggle('active', el.dataset.cfgPanel === slug));
        if (persist) localStorage.setItem(this.CFG_LAST_PANEL_KEY, slug);
    },

    showCfgPanel(slug) {
        this.setCfgActivePanel(slug, true);
        const shell = document.getElementById('cfgShell');
        if (shell) shell.classList.add('showing-panel');
    },

    showCfgNav() {
        const shell = document.getElementById('cfgShell');
        if (shell) shell.classList.remove('showing-panel');
    },

    saveFixedTask() {
        const el = document.getElementById('fixedTaskText');
        const text = (el.value || '').trim();
        if (!text) { this.showToast('Describe the activity first.', 'warning'); return; }

        this.cloudRequest({ action: 'saveFixedTask', description: text })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Failed to save');
                el.value = '';
                this.showToast('Fixed activity added.', 'success');
                this.loadFixedTasks();
            })
            .catch(err => this.showToast(err.message || 'Failed to save', 'error'));
    },

    loadFixedTasks() {
        const box = document.getElementById('fixedTasksList');
        if (!box) return;
        this.cloudRequest({ action: 'listFixedTasks' })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Failed to load');
                const items = data.fixedTasks || [];
                if (!items.length) {
                    box.innerHTML = '<div class="empty-state" style="padding:16px;"><span>No fixed activities yet.</span></div>';
                    return;
                }
                box.innerHTML = items.map(f => `
                    <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:var(--input-bg); border:1px solid var(--line);">
                        <label style="display:flex; align-items:center; gap:8px; flex:1; min-width:0; cursor:pointer;">
                            <input type="checkbox" ${f.active ? 'checked' : ''} onchange="app.toggleFixedTask('${this.escAttr(f.id)}', this.checked)" style="width:16px; height:16px; accent-color:var(--accent); flex:0 0 auto;">
                            <span style="font-size:0.86rem; color:var(--label); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.sanitize(f.description)}</span>
                        </label>
                        <button type="button" class="btn-icon bad" onclick="app.deleteFixedTask('${this.escAttr(f.id)}')" title="Delete">${this.SVGS.bin}</button>
                    </div>
                `).join('');
            })
            .catch(() => { box.innerHTML = '<div class="empty-state" style="padding:16px;"><span>Could not load — check your Cloud URL.</span></div>'; });
    },

    toggleFixedTask(id, active) {
        this.cloudRequest({ action: 'toggleFixedTask', id: id, active: active })
            .catch(err => this.showToast(err.message || 'Failed to update', 'error'));
    },

    deleteFixedTask(id) {
        if (!confirm('Remove this fixed activity?')) return;
        this.cloudRequest({ action: 'deleteFixedTask', id: id })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Failed to delete');
                this.showToast('Fixed activity removed.', 'success');
                this.loadFixedTasks();
            })
            .catch(err => this.showToast(err.message || 'Failed to delete', 'error'));
    },

    /* ---------- BOOT ---------- */
    /* Stop the browser offering "Saved info" / past entries in any field.
       Runs once on start and again for fields added later (alarm cards, modals). */
    noAutofill(root) {
        const scope = root && root.querySelectorAll ? root : document;
        const els = [];
        if (scope.matches && scope.matches('form, input, textarea')) els.push(scope);
        scope.querySelectorAll('form, input, textarea').forEach(el => els.push(el));
        els.forEach(el => {
            const type = (el.getAttribute('type') || '').toLowerCase();
            if (type === 'file' || type === 'checkbox' || type === 'radio' || type === 'hidden') return;
            if (el.getAttribute('autocomplete') !== 'off') el.setAttribute('autocomplete', 'off');
            el.setAttribute('data-lpignore', 'true');
            el.setAttribute('data-1p-ignore', 'true');
            el.setAttribute('data-form-type', 'other');
        });
    },

    watchAutofill() {
        this.noAutofill(document);
        if (!window.MutationObserver) return;
        new MutationObserver((muts) => {
            muts.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) this.noAutofill(n); }));
        }).observe(document.body, { childList: true, subtree: true });
    },

    initApp() {
        this.watchAutofill();
        this.loadLists();
        this.loadData();
        this.repairListsFromTaskData();
        this.loadHolidays();
        this.loadCustomCalendars();
        this.loadLeaveDays();
        this.applyTextSize();
        const reportDateEl = document.getElementById('dailyReportDate');
        if (reportDateEl && !reportDateEl.value) reportDateEl.value = this.getLocalDateStr(new Date());
        this.purgeOldBin();
        this.initViewMode();
        this.initCardSwipe();
        this.detachDropdowns();
        this.populateDropdowns();
        this.initColumnResize();
        ['register', 'completed', 'bin', 'holidays'].forEach(t => this.restoreColumnWidths(t));
        this.updateStats();
        this.updateHeader();
        this.renderAlarmSoundOptions();
        this.renderNudgeSettings();
        this.renderSlotSettings();
        this.switchTab('Dashboard');
        this.setupEventListeners();

        if (this.tasks.length === 0) this.pullTasksFromCloud(false);

        this.engineInterval = setInterval(() => { this.processEngine(); }, 5000);
        setInterval(() => { this.updateHeader(); this.renderNudgeSettings(); this.checkHolidayAlerts(new Date()); }, 60000);
        setInterval(() => { this.syncCycle(); }, this.SYNC_EVERY_MS);
        setTimeout(() => this.syncCycle(), 2500);
        setTimeout(() => this.checkHolidayAlerts(new Date()), 3000);

        const unlock = () => this.initAudio();
        document.addEventListener('click', unlock, { passive: true });
        document.addEventListener('keydown', unlock, { passive: true });
        document.addEventListener('touchstart', unlock, { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) { this.initAudio(); this.processEngine(); this.syncCycle(); }
        });
        window.addEventListener('online', () => this.syncCycle());

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.multi-select') && !e.target.closest('.ms-options')
                && !e.target.closest('#sortMenuPanel') && !e.target.closest('[id^="sortToggle"]')) {
                this.closeDropdowns();
            }
        });

        document.addEventListener('click', (e) => this.handleDelegatedClick(e));

        const reposition = () => {
            const open = document.querySelector('.multi-select.open');
            if (open) this.positionDropdown(open.id);
            else this.closeDropdowns();
        };
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        this.updateNotifyState();
    },

    handleDelegatedClick(e) {
        const el = e.target.closest('[data-action]');
        if (!el) { this.handleRecordClick(e); return; }
        const action = el.dataset.action;
        const id = el.dataset.id;

        switch (action) {
            case 'edit': this.openTaskModal(id); break;
            case 'done': this.tryCompleteTask(id); break;
            case 'reopen': this.reopenTask(id); break;
            case 'bin': this.softDelete(id); break;
            case 'restore': this.restoreTask(id); break;
            case 'hard-delete': this.hardDelete(id); break;
            case 'copy-mail': {
                const t = this.findTask(id);
                if (t) this.copyToClipboard(t.mailChain || '', el);
                break;
            }
            case 'copy-narration': {
                const t = this.findTask(id);
                if (t) this.copyToClipboard((t.narration && t.narration.text) || '', el);
                break;
            }
            case 'open-mail': {
                const t = this.findTask(id);
                if (t && t.emailId) window.open(this.gmailUrl(t.emailId), '_blank');
                break;
            }
            case 'email-open': window.open(this.gmailUrl(id), '_blank'); break;
            case 'email-ignore': this.ignoreEmail(id); break;
            case 'email-task': this.convertEmailToTask(id); break;
            case 'alarm-done': this.alarmAction('done', id); break;
            case 'alarm-ack': this.alarmAction('ack', id); break;
            case 'alarm-skip': this.alarmAction('skip', id); break;
            case 'alarm-snooze': this.alarmAction('snooze', id); break;
            case 'alarm-reschedule': this.alarmAction('reschedule', id); break;
            case 'dash-filter': this.filterFromDashboard(el.dataset.ftype, el.dataset.fvalue); break;
            case 'list-delete': this.deleteListOption(Number(el.dataset.index)); break;
            case 'sort-pick': this.pickSort(el.dataset.col); break;
            case 'holiday-edit': this.openHolidayModal(id); break;
            case 'holiday-delete': this.deleteHolidayById(id); break;
        }
    },

    /* ---------- CLOUD SYNC ---------- */
    mergeTasks(remoteTasks) {
        const byId = new Map();
        this.tasks.forEach(t => byId.set(String(t.id), t));
        let added = 0, updated = 0;

        (remoteTasks || []).forEach(r => {
            if (!r || r.id === undefined || r.id === null || r.id === '') return;
            const key = String(r.id);
            const local = byId.get(key);
            if (!local) { byId.set(key, r); added++; return; }
            const localTime = Number(local.updatedAt) || 0;
            const remoteTime = Number(r.updatedAt) || 0;
            if (remoteTime > localTime) { byId.set(key, Object.assign({}, local, r)); updated++; }
        });

        this.tasks = Array.from(byId.values());
        return { added, updated };
    },

    mergeLists(remoteLists) {
        let changed = false;
        Object.keys(remoteLists || {}).forEach(key => {
            if (!Array.isArray(remoteLists[key])) return;
            if (!Array.isArray(this.lists[key])) this.lists[key] = [];
            remoteLists[key].forEach(v => {
                if (v && !this.lists[key].includes(v)) { this.lists[key].push(v); changed = true; }
            });
        });
        if (changed) this.saveLists(false);
    },

    pullTasksFromCloud(manual = false, silent = false) {
        if (!this.currentUser) return Promise.resolve();
        const saver = document.getElementById('saveStatus');
        if (saver && !silent) saver.innerHTML = '<span class="dot" style="background:var(--blue)"></span> pulling...';

        return this.cloudRequest({ action: "fetchTasks" })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || "Failed to pull tasks");

                const result = this.mergeTasks(data.tasks);
                this.applyRemoteLists(data.lists, data.listsUpdatedAt);
                this.saveData();
                this.populateDropdowns();
                this.renderTable();

                const moved = result.added + result.updated;
                if (manual) {
                    this.showToast(moved ? `Merged from cloud: ${result.added} new, ${result.updated} updated` : "Already up to date with cloud.", moved ? "success" : "info");
                } else if (moved) {
                    this.showToast(`Updated from another device: ${moved} ${moved === 1 ? 'entry' : 'entries'}`, "info");
                }
                const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                if (saver) saver.innerHTML = `<span class="dot" style="background:var(--green)"></span> synced ${timeStr}`;
            })
            .catch(err => {
                if (saver) saver.innerHTML = '<span class="dot" style="background:var(--red)"></span> pull failed';
                if (manual) this.showToast(err.message || "Cloud pull failed", "error");
            });
    },

    restoreFromCloud() {
        if (!confirm("This REPLACES every entry on this device with the cloud copy.\n\nA CSV backup of your current data will be downloaded first.\n\nContinue?")) return;
        this.exportData('csv', true);

        this.cloudRequest({ action: "fetchTasks" })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || "Failed to fetch cloud copy");
                this.tasks = (data.tasks || []).map(t => {
                    if (!t.id) t.id = this.newId();
                    if (!t.updatedAt) t.updatedAt = 0;
                    return t;
                });
                this.applyRemoteLists(data.lists, data.listsUpdatedAt);
                this.userClearedAll = true;
                this.saveData();
                this.renderTable();
                this.showToast(`Restored ${this.tasks.length} entries from cloud`, "success");
            })
            .catch(err => this.showToast(err.message || "Restore failed", "error"));
    },

    applyRemoteLists(remoteLists, remoteTs) {
        if (!remoteLists) return;
        const ts = Number(remoteTs) || 0;
        const mine = Number(this.listsUpdatedAt) || 0;

        if (ts > mine) {
            this.lists = Object.assign({}, this.lists, remoteLists);
            this.listsUpdatedAt = ts;
            localStorage.setItem(CONFIG.LISTS_TS_KEY, String(ts));
            this.saveLists(false);
        } else if (!ts) {
            this.mergeLists(remoteLists);
        }
    },

    syncToGoogleSheets(manual = false) {
        if (!this.currentUser) return Promise.resolve();
        if (this.syncInProgress) return Promise.resolve();
        if ((localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim() === "") return Promise.resolve();

        const snapshot = JSON.stringify({ t: this.tasks, l: this.lists, ts: this.listsUpdatedAt });
        if (!manual && snapshot === this.lastSyncJSON) return Promise.resolve();

        const payload = {
            action: "syncTasks",
            lists: this.lists,
            listsUpdatedAt: this.listsUpdatedAt || 0
        };

        if (this.tasks.length > 0 || this.userClearedAll) {
            payload.tasks = this.tasks;
        } else if (manual) {
            this.showToast("No entries on this device — syncing your lists only.", "warning");
        }

        this.syncInProgress = true;
        const mark = document.getElementById('appMark');
        if (mark) mark.classList.add('busy');
        const saver = document.getElementById('saveStatus');
        if (saver) saver.innerHTML = '<span class="dot" style="background:var(--blue)"></span> syncing...';

        return this.cloudRequest(payload)
            .then(data => {
                this.syncInProgress = false;
                if (mark) mark.classList.remove('busy');
                if (!data || data.status !== 'success') throw new Error((data && data.message) ? data.message : "Unknown sync failure");
                this.lastSyncJSON = snapshot;
                if (data.listsSaved === undefined && !this._listsWarned) {
                    this._listsWarned = true;
                    this.showToast('Your Apps Script is out of date — category changes are not saving to the sheet.', 'warning');
                }
                const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                if (saver) saver.innerHTML = `<span class="dot" style="background:var(--green)"></span> synced ${timeStr}`;
                if (manual) this.showToast("Cloud sync successful!", "success");
            })
            .catch(error => {
                this.syncInProgress = false;
                if (mark) mark.classList.remove('busy');
                console.error('Cloud Sync Error:', error);
                if (saver) saver.innerHTML = '<span class="dot" style="background:var(--red)"></span> not synced — saved locally';
                if (manual) this.showToast(error.message || "Sync failed. Your data is safe on this device.", "error");
            });
    },

    SYNC_EVERY_MS: 15000,
    cycleBusy: false,

    syncCycle(manual = false) {
        if (!this.currentUser) return;
        if ((localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim() === "") return;
        if (this.cycleBusy) return;

        if (!manual && document.hidden) return;
        if (!manual && document.querySelector('.modal.open')) return;

        this.cycleBusy = true;
        Promise.resolve()
            .then(() => this.pullTasksFromCloud(manual, !manual))
            .catch(() => {})
            .then(() => this.syncToGoogleSheets(manual))
            .catch(() => {})
            .then(() => { this.cycleBusy = false; });
    },

    openSyncSetup() {
        document.getElementById('syncUrlInput').value = localStorage.getItem(CONFIG.SYNC_URL_KEY) || '';
        document.getElementById('gmailIndexInput').value = localStorage.getItem(CONFIG.GMAIL_INDEX_KEY) || '0';
        document.getElementById('profileInput').value = this.currentUser || 'default';
        document.getElementById('syncSetupModal').classList.add('open');
    },

    saveSyncUrlModal() {
        const url = document.getElementById('syncUrlInput').value.trim();
        const idx = document.getElementById('gmailIndexInput').value.trim() || '0';
        if (url && !/\/exec$/.test(url)) {
            this.showToast("The Apps Script URL must end in /exec", "warning");
            return;
        }
        if (url) localStorage.setItem(CONFIG.SYNC_URL_KEY, url);
        localStorage.setItem(CONFIG.GMAIL_INDEX_KEY, idx);

        const profile = (document.getElementById('profileInput').value || '').trim().toLowerCase() || 'default';
        if (profile !== this.currentUser) {
            localStorage.setItem('currentUser', profile);
            this.showToast('Profile changed — reloading', 'info');
            setTimeout(() => window.location.reload(), 700);
            return;
        }
        document.getElementById('syncSetupModal').classList.remove('open');
        this.showToast("Settings saved", "success");
    },

    /* ---------- EMAIL INTEGRATION ---------- */
    openEmailModal() {
        document.getElementById('emailListModal').classList.add('open');
        document.getElementById('emailSearchInput').value = '';
        if (this.fetchedEmails.length > 0) this.renderEmailList();
    },

    fetchEmails() {
        const SCRIPT_URL = (localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim();
        if (!SCRIPT_URL) { this.showToast("Cloud URL missing — open Setup.", "warning"); return; }

        const btn = document.getElementById('btnFetchMails');
        btn.innerText = "Fetching...";
        document.getElementById('emailListContainer').innerHTML =
            '<div class="empty-state"><strong>Loading...</strong><span>Fetching your unread mail.</span></div>';

        const q = "?action=fetchEmails&username=" + encodeURIComponent(this.currentUser || '');

        fetch(SCRIPT_URL + q, { method: 'GET' })
            .then(res => res.json())
            .then(data => {
                btn.innerText = "Fetch Unread Mail";
                if (data.status !== 'success') throw new Error(data.message || data.error);
                this.fetchedEmails = data.emails || [];
                document.getElementById('emailSearchInput').value = '';
                this.renderEmailList();
                this.showToast(`Fetched ${this.fetchedEmails.length} unread emails`, "success");
            })
            .catch(err => {
                btn.innerText = "Fetch Unread Mail";
                this.showToast("Failed to fetch emails.", "error");
            });
    },

    renderEmailList() {
        const container = document.getElementById('emailListContainer');
        const query = (document.getElementById('emailSearchInput').value || "").toLowerCase();

        let list = this.fetchedEmails;
        if (query) {
            list = this.fetchedEmails.filter(e =>
                (e.subject || "").toLowerCase().includes(query) ||
                (e.sender || "").toLowerCase().includes(query)
            );
        }

        container.innerHTML = '';
        if (list.length === 0) {
            container.innerHTML = `<div class="empty-state"><strong>No matches</strong><span>${query ? 'Nothing matches your search.' : 'You have no unread mail.'}</span></div>`;
            return;
        }

        list.forEach(email => {
            const idAttr = this.escAttr(email.id);
            const subject = email.subject || '(No subject)';
            const el = document.createElement('div');
            el.className = 'mail-item';
            el.style = 'display: flex; flex-direction: column; gap: 8px; padding: 14px; margin-bottom: 10px; border-radius: 16px; background: var(--glass-card); border: 1px solid var(--glass-border-subtle);';
            el.innerHTML = `
                <div class="mail-subject" style="font-size: 0.92rem; font-weight: 700; color: var(--label);">${this.sanitize(subject)}</div>
                <div class="mail-row" style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <div class="mail-from" style="flex: 1; min-width: 0; font-size: 0.78rem; color: var(--label-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${this.escAttr(email.sender)}">${this.sanitize(email.sender)}</div>
                    <div class="mail-actions" style="display: flex; gap: 6px; flex-shrink: 0;">
                        <button type="button" class="btn-row bad" data-action="email-ignore" data-id="${idAttr}">Ignore</button>
                        <button type="button" class="btn-row go" data-action="email-open" data-id="${idAttr}">Open</button>
                        <button type="button" class="btn-row ok" data-action="email-task" data-id="${idAttr}">Add task</button>
                    </div>
                </div>
            `;
            container.appendChild(el);
        });
    },

    ignoreEmail(id) {
        this.fetchedEmails = this.fetchedEmails.filter(e => String(e.id) !== String(id));
        this.renderEmailList();
        this.showToast("Mail marked as read", "info");

        const SCRIPT_URL = (localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim();
        if (SCRIPT_URL) {
            fetch(SCRIPT_URL + "?action=markEmailRead&id=" + encodeURIComponent(id) +
                  "&username=" + encodeURIComponent(this.currentUser || ''), { method: 'GET' })
                .catch(err => console.error("Failed to mark read:", err));
        }
    },

    convertEmailToTask(id) {
        const email = this.fetchedEmails.find(e => String(e.id) === String(id));
        if (!email) return;

        document.getElementById('emailListModal').classList.remove('open');
        this.openTaskModal(null, email.id);

        document.getElementById('taskDescription').value = email.subject || '(No Subject)';
        document.getElementById('taskMailChain').value = email.subject || '';

        const notes = document.getElementById('taskNotes');
        const header = "From: " + (email.sender || '') + "\n\n";

        if (email.body) {
            notes.value = header + (email.body.length > 500 ? email.body.substring(0, 500) + "..." : email.body);
            return;
        }

        notes.value = header + "Loading the mail…";
        const SCRIPT_URL = (localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim();
        fetch(SCRIPT_URL + "?action=emailBody&id=" + encodeURIComponent(email.id) +
              "&username=" + encodeURIComponent(this.currentUser || ''), { method: 'GET' })
            .then(res => res.json())
            .then(data => {
                const text = (data && data.status === 'success') ? (data.body || '') : '';
                email.body = text;
                if (notes.value.indexOf("Loading the mail…") !== -1) {
                    notes.value = header + (text.length > 500 ? text.substring(0, 500) + "..." : text);
                }
            })
            .catch(() => {
                if (notes.value.indexOf("Loading the mail…") !== -1) notes.value = header;
            });
    },

    openStoredEmail() {
        if (this.storedEmailId) window.open(this.gmailUrl(this.storedEmailId), '_blank');
    },

    /* ---------- AUDIO / NOTIFICATIONS ---------- */
    initAudio() {
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx && this.audioCtx.state !== 'running') this.audioCtx.resume();
            this.audioUnlocked = true;
        } catch (e) {}
    },

    sendDesktopNotification(title, body, requireInteraction = false, tag = 'btw-overdue') {
        if (!("Notification" in window)) return;

        const opts = {
            body: body,
            icon: './icon-192.png',
            badge: './icon-192.png',
            tag: tag,
            renotify: true,
            requireInteraction: requireInteraction,
            vibrate: [200, 100, 200, 100, 200]
        };

        const direct = () => { try { new Notification(title, opts); } catch (e) { console.warn('Notification failed', e); } };

        const show = () => {
            if ('serviceWorker' in navigator && navigator.serviceWorker.getRegistration) {
                navigator.serviceWorker.getRegistration()
                    .then(reg => { if (reg && reg.showNotification) reg.showNotification(title, opts); else direct(); })
                    .catch(direct);
            } else {
                direct();
            }
        };

        if (Notification.permission === "granted") show();
        else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(p => { if (p === "granted") show(); });
        }
    },

    enableNotifications() {
        if (!("Notification" in window)) { this.showToast('This browser cannot show notifications', 'warning'); return; }

        if (Notification.permission === 'granted') {
            this.sendDesktopNotification('Alerts are on', 'Overdue tasks will appear here.');
            this.showToast('Alerts already enabled — sent a test', 'success');
            return;
        }
        if (Notification.permission === 'denied') {
            this.showToast('Blocked. Chrome menu, Settings, Site settings, Notifications — allow this site.', 'error');
            return;
        }
        Notification.requestPermission().then(p => {
            this.updateNotifyState();
            if (p === 'granted') {
                this.sendDesktopNotification('Alerts are on', 'Overdue tasks will appear here.');
                this.showToast('Alerts enabled', 'success');
            } else {
                this.showToast('Alerts not enabled', 'warning');
            }
        });
    },

    updateNotifyState() {
        const hint = document.getElementById('notifyHint');
        const btn = document.getElementById('notifyBtn');
        if (!hint) return;
        const perm = ("Notification" in window) ? Notification.permission : 'unsupported';
        if (perm === 'granted') {
            hint.innerHTML = 'Alerts are <b>on</b>. You will get a notification while the app is open or in the background.';
            if (btn) btn.style.opacity = '0.6';
        } else if (perm === 'denied') {
            hint.innerHTML = 'Alerts are <b>blocked</b>. Enable them in your browser settings.';
        } else {
            hint.innerHTML = 'Turn on alerts to get a notification when a deadline passes.';
        }
    },

    testAlarmSound() {
        this.initAudio();
        this.playBeepPair();
        setTimeout(() => this.playBeepPair(), 800);
        this.sendDesktopNotification("🔔 System Alert Test", "Notifications are working!", false);
        this.showToast("🔔 Testing alarm sound!", "info");
    },

    playBeepPair() {
        this.initAudio();
        if (!this.audioCtx) return;

        if (this.audioCtx.state !== 'running') {
            this.audioCtx.resume().then(() => this.emitBeep()).catch(() => {});
            return;
        }
        this.emitBeep();
    },

    /* Each sound is its own small WebAudio recipe — no audio files to
       ship, so this keeps working offline like the rest of the app. */
    ALARM_SOUNDS: {
        classic: { label: 'Classic Beep', build(ctx, t) {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, t);
            osc.frequency.setValueAtTime(1320, t + 0.15);
            osc.frequency.setValueAtTime(880, t + 0.3);
            gain.gain.setValueAtTime(0.55, t); gain.gain.setValueAtTime(0, t + 0.12);
            gain.gain.setValueAtTime(0.55, t + 0.15); gain.gain.setValueAtTime(0, t + 0.27);
            gain.gain.setValueAtTime(0.55, t + 0.3);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.62);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(t); osc.stop(t + 0.62);
        } },
        chime: { label: 'Gentle Chime', build(ctx, t) {
            [660, 990].forEach((f, i) => {
                const s = t + i * 0.16;
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(f, s);
                gain.gain.setValueAtTime(0.0001, s);
                gain.gain.linearRampToValueAtTime(0.42, s + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, s + 0.55);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(s); osc.stop(s + 0.6);
            });
        } },
        pulse: { label: 'Alert Pulse', build(ctx, t) {
            for (let i = 0; i < 4; i++) {
                const s = t + i * 0.16;
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'square'; osc.frequency.setValueAtTime(1046, s);
                gain.gain.setValueAtTime(0.35, s);
                gain.gain.exponentialRampToValueAtTime(0.001, s + 0.09);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(s); osc.stop(s + 0.1);
            }
        } },
        bell: { label: 'Soft Bell', build(ctx, t) {
            [[523.25, 0.5], [784, 0.16]].forEach(([f, vol]) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.type = 'sine'; osc.frequency.setValueAtTime(f, t);
                gain.gain.setValueAtTime(vol, t);
                gain.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
                osc.connect(gain); gain.connect(ctx.destination);
                osc.start(t); osc.stop(t + 1.15);
            });
        } },
        siren: { label: 'Rising Siren', build(ctx, t) {
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, t);
            osc.frequency.linearRampToValueAtTime(880, t + 0.35);
            osc.frequency.linearRampToValueAtTime(440, t + 0.7);
            gain.gain.setValueAtTime(0.38, t);
            gain.gain.setValueAtTime(0.38, t + 0.65);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.75);
            osc.connect(gain); gain.connect(ctx.destination);
            osc.start(t); osc.stop(t + 0.8);
        } }
    },
    ALARM_SOUND_KEY: 'pureEnergyAlarmSound',

    getAlarmSound() {
        const saved = localStorage.getItem(this.ALARM_SOUND_KEY);
        return (saved && this.ALARM_SOUNDS[saved]) ? saved : 'classic';
    },

    setAlarmSound(name) {
        if (!this.ALARM_SOUNDS[name]) return;
        localStorage.setItem(this.ALARM_SOUND_KEY, name);
        this.renderAlarmSoundOptions();
        this.previewAlarmSound(name);
    },

    previewAlarmSound(name) {
        this.initAudio();
        if (!this.audioCtx) return;
        const fire = () => {
            const def = this.ALARM_SOUNDS[name] || this.ALARM_SOUNDS.classic;
            try { def.build(this.audioCtx, this.audioCtx.currentTime); } catch (e) {}
        };
        if (this.audioCtx.state !== 'running') this.audioCtx.resume().then(fire).catch(() => {});
        else fire();
    },

    renderAlarmSoundOptions() {
        const box = document.getElementById('alarmSoundList');
        if (!box) return;
        const current = this.getAlarmSound();
        box.innerHTML = '';

        Object.keys(this.ALARM_SOUNDS).forEach(key => {
            const def = this.ALARM_SOUNDS[key];
            const row = document.createElement('div');
            row.className = 'sound-row' + (key === current ? ' is-on' : '');
            row.addEventListener('click', () => this.setAlarmSound(key));

            const dot = document.createElement('span');
            dot.className = 'sound-dot';

            const name = document.createElement('span');
            name.className = 'sound-name';
            name.textContent = def.label;

            const play = document.createElement('button');
            play.type = 'button';
            play.className = 'sound-play';
            play.setAttribute('aria-label', 'Preview ' + def.label);
            play.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
            play.addEventListener('click', (e) => { e.stopPropagation(); this.previewAlarmSound(key); });

            row.appendChild(dot);
            row.appendChild(name);
            row.appendChild(play);
            box.appendChild(row);
        });
    },

    emitBeep() {
        if (!this.audioCtx) return;
        try {
            const t = this.audioCtx.currentTime;
            const def = this.ALARM_SOUNDS[this.getAlarmSound()] || this.ALARM_SOUNDS.classic;
            def.build(this.audioCtx, t);
            if (navigator.vibrate) navigator.vibrate([300, 120, 300]);
        } catch (e) {}
    },

    /* ---------- ALARM ENGINE ---------- */
    processEngine() {
        const now = new Date();
        const localTodayStr = this.getLocalDateStr(now);
        const activeOverdue = [];
        const addedIds = new Set();
        const addOnce = (t) => { if (!addedIds.has(String(t.id))) { addedIds.add(String(t.id)); activeOverdue.push(t); } };

        this.tasks.forEach(t => {
            if (t.deleted || t.status === 'Completed') return;

            // Deadline crossed — independent of the regular due-date alarm,
            // and independent of whether the task even has a due date.
            const deadlineDateTime = this.getTaskDeadlineDateTime(t);
            if (deadlineDateTime && now >= deadlineDateTime && t.deadlineAckDate !== localTodayStr) {
                addOnce(t);
            }

            if (!t.dueDate) return;
            const dueDateTime = this.getTaskDueDateTime(t);
            if (!dueDateTime) return;

            let dueHours = 23, dueMins = 59;
            if (t.dueTime) {
                const parts = String(t.dueTime).split(':').map(Number);
                dueHours = parts[0] || 0;
                dueMins = parts[1] || 0;
            }

            const todayAtDueTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), dueHours, dueMins, 0);
            const snoozeUntil = Number(t.snoozeUntil) || 0;

            if (now >= dueDateTime && now >= todayAtDueTime &&
                t.lastAckDate !== localTodayStr && now.getTime() >= snoozeUntil) {
                addOnce(t);
                return;
            }

            // Pre-day heads-up: if the due date itself falls on a holiday,
            // Sunday, or leave day, surface it a day early so there's time
            // to choose "do it today" or "move to the next working day"
            // before it's overdue on a day nothing can actually be done.
            if (this.isDateInRange(t, 'Tomorrow') && this.isNonWorkingDay(t.dueDate) &&
                t.lastAckDate !== localTodayStr && now.getTime() >= snoozeUntil) {
                addOnce(t);
            }
        });

        const signature = activeOverdue.map(t => String(t.id)).sort().join('|');

        if (activeOverdue.length > 0) {
            if (!this.isAlarming || signature !== this.alarmSignature) {
                this.alarmSignature = signature;
                this.triggerPersistentAlarm(activeOverdue);
            }
        } else if (this.isAlarming) {
            this.stopPersistentAlarm(false);
        }

        this.checkNudges(now);
    },

    triggerPersistentAlarm(tasks) {
        this.initAudio();
        this.isAlarming = true;
        this.alarmingTasks = tasks;

        let alarmModal = document.getElementById('alarmModal');
        if (!alarmModal) {
            alarmModal = document.createElement('div');
            alarmModal.className = 'modal';
            alarmModal.id = 'alarmModal';
            alarmModal.style.zIndex = '10500';
            alarmModal.innerHTML = `
                <div class="modal-content" style="border-color: rgba(255,59,48,0.4);">
                    <div class="modal-header" style="border-bottom-color: rgba(255,59,48,0.25);">
                        <h2 style="color:var(--red-ink);">🚨 Past Due Alert</h2>
                        <button class="modal-close" title="Silence all" onclick="app.stopPersistentAlarm(true)">✕</button>
                    </div>
                    <p style="color:var(--label-2); font-size:0.86rem; margin-bottom:14px;">These tasks missed their deadline and are still open.</p>
                    <div id="alarmTasksContainer" style="max-height:55vh; overflow-y:auto;"></div>
                    <div class="modal-buttons">
                        <button class="btn-modal secondary" onclick="app.stopPersistentAlarm(true)">Silence All For Today</button>
                    </div>
                </div>
            `;
            document.body.appendChild(alarmModal);
        }
        this.renderAlarmTasks();
        alarmModal.classList.add('open');

        const taskNames = tasks.map(t => `"${t.description}"`).join(', ');
        this.sendDesktopNotification("🚨 OVERDUE DEADLINE ALERT", `Missed deadline: ${taskNames}`, true);

        if (!this.alarmInterval) {
            this.playBeepPair();
            this.alarmInterval = setInterval(() => { this.playBeepPair(); }, 1800);
            if (this.alarmSoundTimeout) clearTimeout(this.alarmSoundTimeout);
            this.alarmSoundTimeout = setTimeout(() => {
                if (this.alarmInterval) { clearInterval(this.alarmInterval); this.alarmInterval = null; }
            }, 120000);
        }
    },

    renderAlarmTasks() {
        const container = document.getElementById('alarmTasksContainer');
        if (!container) return;
        container.innerHTML = '';

        this.alarmingTasks.forEach(task => {
            const idAttr = this.escAttr(task.id);
            const priority = (task.priority || '').toString();
            const isRecurring = task.recurrence && task.recurrence !== 'None';

            const chips = [];
            if (priority) chips.push(`<span class="chip pri-${this.escAttr(priority.replace(/\s+/g, '-'))}" style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; font-size:0.75rem; font-weight:600; border-radius:20px; color:var(--red-ink); background:rgba(239, 68, 68, 0.1); border:1px solid rgba(239, 68, 68, 0.2);">${this.sanitize(priority)}</span>`);
            if (task.category) chips.push(`<span class="chip cat" style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; font-size:0.75rem; font-weight:600; border-radius:20px; color:var(--blue-ink); background:rgba(37, 99, 235, 0.1); border:1px solid rgba(37, 99, 235, 0.2);">${this.sanitize(task.category)}</span>`);
            if (task.pendingWith) chips.push(`<span class="chip person" style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; font-size:0.75rem; font-weight:600; border-radius:20px; color:var(--amber-ink); background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.25);">Pending with: ${this.sanitize(task.pendingWith)}</span>`);
            chips.push(`<span class="chip rec" style="display:inline-flex; align-items:center; gap:4px; padding:4px 10px; font-size:0.75rem; font-weight:600; border-radius:20px; color:var(--violet-ink); background:rgba(139, 92, 246, 0.1); border:1px solid rgba(139, 92, 246, 0.2);">${isRecurring ? this.sanitize(task.recurrence) : 'One-time'}</span>`);
            
            const el = document.createElement('div');
            el.className = 'alarm-card';
            el.style = 'padding: 14px 16px; margin-bottom: 12px; border-radius: 16px; background: rgba(255, 59, 48, 0.09); border: 1px solid rgba(255, 59, 48, 0.25);';

            const nonWorking = this.isNonWorkingDay(task.dueDate);
            const deadlineDateTime = this.getTaskDeadlineDateTime(task);
            const deadlineCrossed = deadlineDateTime && new Date() >= deadlineDateTime && task.deadlineAckDate !== this.getLocalDateStr(new Date());
            const deadlineBanner = deadlineCrossed ? `
                <div class="alarm-deadline" style="margin: 8px 0; padding: 8px 10px; border-radius: 10px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.78rem; color: var(--red-ink);">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                        <span style="font-weight:700;">⏰ Deadline crossed: ${this.formatDateStr(task.deadlineDate)} at ${task.deadlineTime ? this.formatTimeStr(task.deadlineTime) : '11:59 PM'}</span>
                        <button type="button" class="btn-row" onclick="app.acknowledgeDeadline('${idAttr}')" style="padding:5px 10px; font-size:0.74rem; font-weight:600; color:var(--label); background:var(--fill); border:1px solid var(--line); border-radius:9px; cursor:pointer;">Acknowledge</button>
                    </div>
                </div>` : '';
            const nonWorkingBanner = nonWorking ? `
                <div class="alarm-nonworking" style="margin: 8px 0; padding: 8px 10px; border-radius: 10px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.25); font-size: 0.78rem; color: var(--amber-ink);">
                    <div style="font-weight:700; margin-bottom:6px;">This due date falls on a holiday, Sunday, or leave day.</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" class="btn-row" onclick="app.resolveNonWorkingDue('${idAttr}', 'today')" style="padding:6px 12px; font-size:0.76rem; font-weight:600; color:var(--label); background:var(--fill); border:1px solid var(--line); border-radius:10px; cursor:pointer;">Do it today anyway</button>
                        <button type="button" class="btn-row go" onclick="app.resolveNonWorkingDue('${idAttr}', 'next')" style="padding:6px 12px; font-size:0.76rem; font-weight:600; color:var(--blue-ink); background:rgba(37,99,235,0.1); border:1px solid rgba(37,99,235,0.2); border-radius:10px; cursor:pointer;">Move to next working day</button>
                    </div>
                </div>` : '';

            el.innerHTML = `
                <div class="alarm-title" style="font-size: 0.96rem; font-weight: 700; color: var(--label);">${this.sanitize(task.description)}</div>
                <div class="alarm-due" style="margin-top: 3px; font-size: 0.78rem; font-weight: 600; color: var(--red-ink); font-family: var(--font-num);">${task.dueDate ? ('Due ' + this.formatDateStr(task.dueDate) + ' at ' + (task.dueTime ? this.formatTimeStr(task.dueTime) : '11:59 PM')) : ''}</div>
                ${deadlineBanner}
                ${nonWorkingBanner}
                <div class="alarm-meta" style="display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0;">${chips.join('')}</div>
                <input type="text" id="alarmRemarks_${idAttr}" placeholder="Remarks / notes for today (optional) — e.g. Nothing to do Today"
                       style="width: 100%; box-sizing: border-box; padding: 8px 10px; margin-bottom: 8px; font-size: 0.82rem; color: var(--label); background: var(--input-bg); border: 1px solid var(--line); border-radius: 10px;">
                <div class="alarm-actions" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
                    <button type="button" class="btn-row ok" data-action="alarm-done" data-id="${idAttr}" style="padding: 6px 12px; font-size: 0.78rem; font-weight: 600; color: var(--green-ink); background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.2); border-radius: 10px; cursor: pointer;">Mark done</button>
                    <button type="button" class="btn-row warn" data-action="alarm-ack" data-id="${idAttr}" style="padding: 6px 12px; font-size: 0.78rem; font-weight: 600; color: var(--amber-ink); background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 10px; cursor: pointer;">Silence today</button>
                    <button type="button" class="btn-row" data-action="alarm-skip" data-id="${idAttr}" title="Not doing this today — stays open for another day, and today's alert is silenced without counting as done" style="padding: 6px 12px; font-size: 0.78rem; font-weight: 600; color: var(--label-2); background: var(--fill); border: 1px solid var(--line); border-radius: 10px; cursor: pointer;">Skip</button>
                    <span class="alarm-field" style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: var(--input-bg); border: 1px solid var(--line);">
                        <input type="number" min="1" id="snoozeMins_${idAttr}" placeholder="Min" style="font-size: 0.84rem; color: var(--label); background: transparent; border: none; outline: none; padding: 4px; width: 50px; text-align: center;">
                        <button type="button" class="btn-row go" data-action="alarm-snooze" data-id="${idAttr}" style="padding: 6px 12px; font-size: 0.78rem; font-weight: 600; color: var(--blue-ink); background: rgba(37, 99, 235, 0.1); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 10px; cursor: pointer;">Snooze</button>
                    </span>
                    <span class="alarm-field" style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: var(--input-bg); border: 1px solid var(--line);">
                        <input type="date" id="reschedDate_${idAttr}" value="${this.escAttr(task.dueDate)}" style="font-size: 0.84rem; color: var(--label); background: transparent; border: none; outline: none; padding: 4px;">
                        <input type="time" id="reschedTime_${idAttr}" value="${this.escAttr(task.dueTime)}" style="font-size: 0.84rem; color: var(--label); background: transparent; border: none; outline: none; padding: 4px;">
                        <button type="button" class="btn-row go" data-action="alarm-reschedule" data-id="${idAttr}" style="padding: 6px 12px; font-size: 0.78rem; font-weight: 600; color: var(--blue-ink); background: rgba(37, 99, 235, 0.1); border: 1px solid rgba(37, 99, 235, 0.2); border-radius: 10px; cursor: pointer;">Move</button>
                    </span>
                    <span class="alarm-field" style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: var(--input-bg); border: 1px solid var(--line);">
                        <select id="alarmRec_${idAttr}" onchange="app.changeAlarmRecurrence('${idAttr}', this.value)" style="font-size: 0.84rem; font-weight: 600; color: var(--violet-ink); background: transparent; border: none; outline: none; padding: 4px; cursor:pointer;">
                            <option value="None"${task.recurrence === 'None' || !task.recurrence ? ' selected' : ''}>Doesn't repeat</option>
                            <option value="Daily"${task.recurrence === 'Daily' ? ' selected' : ''}>Daily</option>
                            <option value="Weekly"${task.recurrence === 'Weekly' ? ' selected' : ''}>Weekly</option>
                            <option value="Monthly"${task.recurrence === 'Monthly' ? ' selected' : ''}>Monthly</option>
                        </select>
                    </span>
                </div>
            `;
            container.appendChild(el);
        });
    },

    // Lets a recurrence be changed right from the overdue-alert popup, without
    // opening the full Task modal. Only affects future occurrences generated
    // the next time this task is marked done.
    changeAlarmRecurrence(taskId, val) {
        const task = this.findTask(taskId);
        if (!task) return;
        task.recurrence = val || 'None';
        task.updatedAt = Date.now();
        this.saveData();
        this.renderTable();
        this.showToast('Recurrence set to ' + (task.recurrence === 'None' ? "doesn't repeat" : task.recurrence), 'success');
    },

    acknowledgeDeadline(taskId) {
        const task = this.findTask(taskId);
        if (!task) return;
        task.deadlineAckDate = this.getLocalDateStr(new Date());
        task.updatedAt = Date.now();
        this.saveData();
        this.processEngine();
        this.showToast('Deadline acknowledged for today.', 'success');
    },

    alarmAction(action, taskId) {
        const task = this.findTask(taskId);
        if (!task) return;

        // Whatever's typed in the alert's Remarks box travels with the
        // task either way: saved onto its Notes so it's never lost, and —
        // for "Mark done" specifically — handed straight to the Daily
        // Activity Report as that entry's details, so a quick remark here
        // is often the only editing the report needs.
        const remarkEl = document.getElementById('alarmRemarks_' + taskId);
        const remark = remarkEl ? remarkEl.value.trim() : '';
        if (remark) {
            task.notes = (task.notes ? task.notes + '\n' : '') + '[' + this.formatDateStr(this.getLocalDateStr(new Date())) + '] ' + remark;
        }

        if (action === 'done') {
            if (!this.subCategoryComplete(task)) {
                this.tryCompleteTask(taskId);
                return;
            }
            this.markComplete(taskId);
        } else if (action === 'ack') {
            task.lastAckDate = this.getLocalDateStr(new Date());
            task.deadlineAckDate = task.lastAckDate;
            task.updatedAt = Date.now();
            this.saveData(); this.renderTable();
            this.showToast("Task silenced for today.", "info");
        } else if (action === 'skip') {
            this.skipTask(taskId);
        } else if (action === 'snooze') {
            const input = document.getElementById('snoozeMins_' + taskId);
            const mins = parseInt(input ? input.value : '', 10) || 0;
            if (mins <= 0) { this.showToast("Please enter minutes to snooze.", "warning"); return; }
            task.snoozeUntil = Date.now() + (mins * 60000);
            task.updatedAt = Date.now();
            this.saveData();
            this.showToast(`Snoozed for ${mins} minutes.`, "info");
        } else if (action === 'reschedule') {
            const dateEl = document.getElementById('reschedDate_' + taskId);
            const timeEl = document.getElementById('reschedTime_' + taskId);
            const newDate = dateEl ? dateEl.value : '';
            const newTime = timeEl ? timeEl.value : '';
            if (!newDate) { this.showToast("Please select a valid date.", "warning"); return; }
            const taken = this.slotClash(newDate, newTime, task.id);
            if (taken) {
                const free = this.nextFreeTime(newDate, newTime, task.id);
                this.showToast(
                    '"' + taken.description + '" already holds ' + this.formatTimeStr(taken.dueTime) + '.',
                    'warning',
                    free ? { label: 'Use ' + this.formatTimeStr(free), onClick: () => { if (timeEl) timeEl.value = free; } } : null
                );
                return;
            }
            task.dueDate = newDate;
            task.dueTime = newTime || '';
            task.lastAckDate = null;
            task.snoozeUntil = null;
            task.updatedAt = Date.now();
            this.saveData(); this.renderTable();
            this.showToast("Task rescheduled successfully.", "success");
        }

        this.alarmingTasks = this.alarmingTasks.filter(t => String(t.id) !== String(taskId));
        this.alarmSignature = this.alarmingTasks.map(t => String(t.id)).sort().join('|');

        if (this.alarmingTasks.length === 0) this.stopPersistentAlarm(false);
        else this.renderAlarmTasks();
    },

    stopPersistentAlarm(acknowledgeAllRemaining = false) {
        const alarmModal = document.getElementById('alarmModal');
        if (alarmModal) alarmModal.classList.remove('open');

        if (this.alarmInterval) { clearInterval(this.alarmInterval); this.alarmInterval = null; }
        if (this.alarmSoundTimeout) { clearTimeout(this.alarmSoundTimeout); this.alarmSoundTimeout = null; }
        this.isAlarming = false;

        if (acknowledgeAllRemaining && this.alarmingTasks.length > 0) {
            const localTodayStr = this.getLocalDateStr(new Date());
            this.alarmingTasks.forEach(t => {
                const task = this.findTask(t.id);
                if (task) { task.lastAckDate = localTodayStr; task.updatedAt = Date.now(); }
            });
            this.saveData();
            this.renderTable();
            this.showToast("All overdue alerts silenced for today.", "info");
        }

        this.alarmingTasks = [];
        this.alarmSignature = '';
    },

    /* ---------- HEALTH NUDGES (walk / water) ----------
       Standing reminders to leave the chair and to drink water. Same look and
       sound as the past-due alert, but on a clock instead of a deadline: one
       alert per slot between a start and end time, all set in Config. */
    NUDGES: {
        walk: {
            icon: '🚶', title: 'Time To Walk',
            line: 'Stand up, stretch and take a few minutes away from the desk.',
            slotWord: 'walk break',
            notifyTitle: '🚶 Time to walk', notifyBody: 'Stand up and move for a few minutes.',
            doneLabel: 'I walked', tag: 'btw-walk', zIndex: 10400,
            defaults: { on: true, start: '11:00', end: '19:30', every: 90, snooze: 10 }
        },
        water: {
            icon: '💧', title: 'Time To Drink Water',
            line: 'Take a drink and top up your bottle before the next task.',
            slotWord: 'water break',
            notifyTitle: '💧 Time to drink water', notifyBody: 'Have a glass of water.',
            doneLabel: 'I drank', tag: 'btw-water', zIndex: 10300,
            defaults: { on: true, start: '10:00', end: '19:30', every: 60, snooze: 10 }
        }
    },

    nudgeKeys(kind) {
        const cap = kind.charAt(0).toUpperCase() + kind.slice(1);
        return {
            cfg: 'pureEnergy' + cap + 'Cfg',
            last: 'pureEnergy' + cap + 'Last',
            skip: 'pureEnergy' + cap + 'Skip'
        };
    },

    nudgeState: {},

    nudgeCfg(kind) {
        const def = this.NUDGES[kind].defaults;
        let saved = {};
        try {
            const raw = JSON.parse(localStorage.getItem(this.nudgeKeys(kind).cfg) || '{}');
            if (raw && typeof raw === 'object') saved = raw;
        } catch (e) {}
        const cfg = Object.assign({}, def, saved);
        cfg.every = Math.max(10, Number(cfg.every) || def.every);
        cfg.snooze = Math.max(1, Number(cfg.snooze) || def.snooze);
        return cfg;
    },

    saveNudgeCfg(kind, patch) {
        const cfg = Object.assign(this.nudgeCfg(kind), patch || {});
        localStorage.setItem(this.nudgeKeys(kind).cfg, JSON.stringify(cfg));
        this.renderNudgeSettings(kind);
        return cfg;
    },

    toggleNudge(kind) {
        const cfg = this.saveNudgeCfg(kind, { on: !this.nudgeCfg(kind).on });
        if (cfg.on) localStorage.removeItem(this.nudgeKeys(kind).skip);
        this.renderNudgeSettings(kind);
        this.showToast(this.NUDGES[kind].title.replace('Time To ', '') + ' reminder ' + (cfg.on ? 'on' : 'off'), 'info');
    },

    nudgeToMinutes(hhmm, fallback) {
        const parts = String(hhmm || '').split(':');
        const h = Number(parts[0]), m = Number(parts[1]);
        if (!isFinite(h) || !isFinite(m)) return fallback;
        return Math.max(0, Math.min(1439, h * 60 + m));
    },

    nudgeToClock(mins) {
        const h = Math.floor(mins / 60), m = mins % 60;
        return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },

    // Every slot in the window, e.g. 11:00, 12:30, 14:00 … up to the end time.
    nudgeSlots(cfg) {
        const start = this.nudgeToMinutes(cfg.start, 660);
        const end = this.nudgeToMinutes(cfg.end, 1170);
        const out = [];
        for (let m = start; m <= end; m += cfg.every) out.push(m);
        return out;
    },

    nudgeNextSlot(cfg, nowMins) {
        const slots = this.nudgeSlots(cfg);
        for (let i = 0; i < slots.length; i++) if (slots[i] > nowMins) return slots[i];
        return null;
    },

    checkNudges(now) {
        // One alert on screen at a time: an overdue task comes first, and a
        // second nudge waits its turn instead of stacking on top.
        if (this.isAlarming) return;
        if (Object.keys(this.nudgeState).some(k => this.nudgeState[k] && this.nudgeState[k].showing)) return;
        Object.keys(this.NUDGES).forEach(kind => {
            if (Object.keys(this.nudgeState).some(k => this.nudgeState[k] && this.nudgeState[k].showing)) return;
            this.checkNudge(kind, now);
        });
    },

    checkNudge(kind, now) {
        const cfg = this.nudgeCfg(kind);
        const keys = this.nudgeKeys(kind);
        const state = this.nudgeState[kind] || (this.nudgeState[kind] = {});
        if (!cfg.on || state.showing) return;

        const todayStr = this.getLocalDateStr(now);
        if (localStorage.getItem(keys.skip) === todayStr) return;
        if (Date.now() < (state.snoozeUntil || 0)) return;

        const nowMins = now.getHours() * 60 + now.getMinutes();
        const due = this.nudgeSlots(cfg).filter(m => m <= nowMins);
        if (!due.length) return;

        const slot = due[due.length - 1];
        const stamp = todayStr + ' ' + this.nudgeToClock(slot);
        if (localStorage.getItem(keys.last) === stamp) return;
        localStorage.setItem(keys.last, stamp);

        // If the app was closed through the slot, let it pass quietly rather
        // than nudging for a break that was due an hour ago.
        if (nowMins - slot > 45) { this.renderNudgeSettings(kind); return; }
        this.triggerNudge(kind, slot);
    },

    triggerNudge(kind, slotMins) {
        const def = this.NUDGES[kind];
        if (!def) return;
        this.initAudio();
        const state = this.nudgeState[kind] || (this.nudgeState[kind] = {});
        state.showing = true;

        const modalId = 'nudgeModal_' + kind;
        let modal = document.getElementById(modalId);
        if (!modal) {
            modal = document.createElement('div');
            modal.className = 'modal';
            modal.id = modalId;
            modal.style.zIndex = String(def.zIndex);
            modal.innerHTML = `
                <div class="modal-content modal-sm" style="border-color: rgba(52,199,89,0.4);">
                    <div class="modal-header" style="border-bottom-color: rgba(52,199,89,0.25);">
                        <h2 style="color:var(--green-ink);">${def.icon} ${this.sanitize(def.title)}</h2>
                        <button class="modal-close" title="Dismiss" onclick="app.nudgeDone('${kind}')">✕</button>
                    </div>
                    <p style="color:var(--label-2); font-size:0.86rem; margin-bottom:14px;">${this.sanitize(def.line)}</p>
                    <div class="walk-card" id="nudgeBody_${kind}"></div>
                    <div class="modal-buttons">
                        <button class="btn-modal primary" onclick="app.nudgeDone('${kind}')">${this.sanitize(def.doneLabel)}</button>
                        <button class="btn-modal secondary" id="nudgeSnooze_${kind}" onclick="app.snoozeNudge('${kind}')">Snooze</button>
                        <button class="btn-modal danger" onclick="app.nudgeOffForToday('${kind}')">Skip today</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        const cfg = this.nudgeCfg(kind);
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const at = this.formatTimeStr(this.nudgeToClock(typeof slotMins === 'number' ? slotMins : nowMins));
        const next = this.nudgeNextSlot(cfg, nowMins);
        const body = document.getElementById('nudgeBody_' + kind);
        if (body) {
            body.innerHTML =
                '<div class="walk-card-time">' + this.sanitize(at) + ' ' + this.sanitize(def.slotWord) + '</div>' +
                '<div class="walk-card-sub">Every ' + cfg.every + ' minutes, ' +
                this.sanitize(this.formatTimeStr(cfg.start)) + ' to ' + this.sanitize(this.formatTimeStr(cfg.end)) +
                (next ? ' · next at ' + this.sanitize(this.formatTimeStr(this.nudgeToClock(next))) : ' · last one today') +
                '</div>';
        }
        const snoozeBtn = document.getElementById('nudgeSnooze_' + kind);
        if (snoozeBtn) snoozeBtn.textContent = 'Snooze ' + cfg.snooze + ' min';

        modal.classList.add('open');
        this.sendDesktopNotification(def.notifyTitle, def.notifyBody, false, def.tag);

        if (!state.soundInterval) {
            this.playBeepPair();
            state.soundInterval = setInterval(() => { this.playBeepPair(); }, 1800);
            if (state.soundTimeout) clearTimeout(state.soundTimeout);
            state.soundTimeout = setTimeout(() => {
                if (state.soundInterval) { clearInterval(state.soundInterval); state.soundInterval = null; }
            }, 30000);
        }
    },

    stopNudge(kind) {
        const state = this.nudgeState[kind] || (this.nudgeState[kind] = {});
        const modal = document.getElementById('nudgeModal_' + kind);
        if (modal) modal.classList.remove('open');
        if (state.soundInterval) { clearInterval(state.soundInterval); state.soundInterval = null; }
        if (state.soundTimeout) { clearTimeout(state.soundTimeout); state.soundTimeout = null; }
        state.showing = false;
        this.renderNudgeSettings(kind);
    },

    nudgeDone(kind) {
        this.stopNudge(kind);
        (this.nudgeState[kind] || {}).snoozeUntil = 0;
    },

    snoozeNudge(kind) {
        const mins = this.nudgeCfg(kind).snooze;
        (this.nudgeState[kind] || (this.nudgeState[kind] = {})).snoozeUntil = Date.now() + mins * 60000;
        this.stopNudge(kind);
        this.showToast('Reminder snoozed for ' + mins + ' minutes', 'info');
    },

    nudgeOffForToday(kind) {
        localStorage.setItem(this.nudgeKeys(kind).skip, this.getLocalDateStr(new Date()));
        this.stopNudge(kind);
        this.showToast('No more reminders today', 'info');
    },

    renderNudgeSettings(kind) {
        if (!kind) { Object.keys(this.NUDGES).forEach(k => this.renderNudgeSettings(k)); return; }
        const cfg = this.nudgeCfg(kind);
        const set = (id, val) => { const el = document.getElementById(id); if (el && el.value !== String(val)) el.value = val; };
        set(kind + 'Start', cfg.start);
        set(kind + 'End', cfg.end);
        set(kind + 'Every', cfg.every);

        const btn = document.getElementById(kind + 'Toggle');
        const lbl = document.getElementById(kind + 'ToggleLabel');
        if (btn) btn.classList.toggle('is-off', !cfg.on);
        if (lbl) lbl.textContent = cfg.on ? 'Reminder on' : 'Reminder off';

        const hint = document.getElementById(kind + 'NextHint');
        if (!hint) return;
        if (!cfg.on) { hint.textContent = 'Reminders are off.'; return; }
        const now = new Date();
        if (localStorage.getItem(this.nudgeKeys(kind).skip) === this.getLocalDateStr(now)) {
            hint.textContent = 'Skipped for the rest of today.';
            return;
        }
        const next = this.nudgeNextSlot(cfg, now.getHours() * 60 + now.getMinutes());
        const slots = this.nudgeSlots(cfg);
        hint.textContent = (next
            ? 'Next nudge at ' + this.formatTimeStr(this.nudgeToClock(next)) + '.'
            : 'Done for today — next one tomorrow at ' + this.formatTimeStr(cfg.start) + '.') +
            ' ' + slots.length + ' a day: ' + slots.map(m => this.formatTimeStr(this.nudgeToClock(m))).join(', ') + '.';
    },

    copyToClipboard(text, btnEl) {
        if (!text) { this.showToast('Nothing to copy', 'info'); return; }
        navigator.clipboard.writeText(text).then(() => {
            if (!btnEl) { this.showToast('Copied', 'success'); return; }
            const original = btnEl.innerHTML;
            btnEl.innerHTML = this.SVGS.copied;
            btnEl.classList.add('done');
            setTimeout(() => { btnEl.innerHTML = original; btnEl.classList.remove('done'); }, 1600);
        }).catch(() => this.showToast('Could not copy', 'error'));
    },

    /* ---------- LISTS ---------- */
    loadLists() {
        const defaultLists = {
            categories: [],
            priorities: ['High', 'Medium', 'Low'],
            statuses: ['Pending', 'In-Progress', 'Completed'],
            pendingWith: ['Self', 'Banking Team', 'Finance Manager', 'Vendor', 'Customer'],
            subCategories: [],
            // Categories that were opted into having a Sub Category at the
            // time they were created/edited (see categoryHasSubCategory).
            subCategoryCategories: [],
            // Tally Narration sentence templates (see buildNarrationText).
            narrationTypes: []
        };
        let parsedStored = null;
        try {
            let stored = localStorage.getItem(CONFIG.LISTS_KEY);
            if (!stored) {
                const legacy = localStorage.getItem(CONFIG.BASE_LISTS_KEY);
                const migratedTo = localStorage.getItem(CONFIG.LEGACY_MIGRATED_KEY);
                if (legacy && (!migratedTo || migratedTo === this.currentUser)) stored = legacy;
            }
            parsedStored = stored ? JSON.parse(stored) : null;
            this.lists = parsedStored ? Object.assign({}, defaultLists, parsedStored) : defaultLists;
        } catch (e) { this.lists = defaultLists; }
        this.listsUpdatedAt = Number(localStorage.getItem(CONFIG.LISTS_TS_KEY)) || 0;

        if (!Array.isArray(this.lists.subCategoryCategories)) this.lists.subCategoryCategories = [];
        // One-time default: if this profile never explicitly set which
        // categories carry a Sub Category, seed it from the categories that
        // already look like Duty Payment / Demand Draft / Import Payments /
        // Domestic Payment / Urgent Payment. Never runs again once a value
        // (even an empty one) has been saved, so it won't fight the user's
        // own choices made from the category editor.
        if (!parsedStored || !Array.isArray(parsedStored.subCategoryCategories)) {
            (this.lists.categories || []).forEach(c => {
                const looksLikeSubCategoryCategory = /duty/i.test(c) || /demand\s*draft/i.test(c) ||
                    this.isDomesticPaymentCategory(c) || this.isUrgentPaymentCategory(c) || this.isImportPaymentCategory(c);
                if (looksLikeSubCategoryCategory && this.lists.subCategoryCategories.indexOf(c) === -1) {
                    this.lists.subCategoryCategories.push(c);
                }
            });
        }

        // Sub Categories carry per-item rule fields ({name, fields:[...]}) —
        // normalize any older plain-string entries (from before rules
        // existed) into that shape so nothing crashes on old data.
        if (Array.isArray(this.lists.subCategories)) {
            this.lists.subCategories = this.lists.subCategories.map(sc =>
                (typeof sc === 'string') ? { id: this.newId(), name: sc, fields: [] } : sc
            );
        } else {
            this.lists.subCategories = [];
        }

        // One-time default: seed the standard set of Tally Narration
        // templates (from the reference "Accounting Narrations" sheet) the
        // first time this profile ever loads with the feature. After that
        // it's entirely up to Manage Narration Types — this never runs
        // again once a (possibly edited/emptied) list has been saved.
        if (!Array.isArray(this.lists.narrationTypes)) this.lists.narrationTypes = [];
        if (!parsedStored || !Array.isArray(parsedStored.narrationTypes)) {
            this.lists.narrationTypes = [
                { id: this.newId(), name: 'Advance against Purchase Order', hasPercent: true, phrase: 'Advance amount paid against Po No: ', docLabel: 'PO No', fields: [], leadFieldLabel: '' },
                { id: this.newId(), name: '2nd Advance against Purchase Order', hasPercent: true, phrase: '2nd Advance amount paid against Po No: ', docLabel: 'PO No', fields: [], leadFieldLabel: '' },
                { id: this.newId(), name: 'Balance Payment against Purchase Order/Invoice', hasPercent: false, phrase: 'Balance amount paid against Invoice No: ', docLabel: 'Invoice No', fields: [], leadFieldLabel: '' },
                { id: this.newId(), name: 'COD Charges against Invoice', hasPercent: false, phrase: 'Amount Paid twds COD Charges Against Invoice No: ', docLabel: 'Invoice No', fields: [], leadFieldLabel: '' },
                { id: this.newId(), name: 'COD Charges against Order Id', hasPercent: false, phrase: 'Amount Paid twds COD Charges Against Order Id: ', docLabel: 'Order Id', fields: [{ label: 'Vendor Name', options: [] }], leadFieldLabel: 'Vendor Name' },
                { id: this.newId(), name: 'COD Charges against PO', hasPercent: false, phrase: 'Amount Paid twds COD Charges Against PO No: ', docLabel: 'PO No', fields: [{ label: 'Vendor Name', options: [] }], leadFieldLabel: 'Vendor Name' },
                { id: this.newId(), name: 'I&C Charges', hasPercent: false, phrase: 'Amount paid twds I&C Charges for Order id: ', docLabel: 'Order Id', fields: [], leadFieldLabel: '' },
                { id: this.newId(), name: 'Employee Advance Request', hasPercent: false, phrase: 'Amount Paid Against Emploee Advance Request Form No: ', docLabel: 'Form No', fields: [], leadFieldLabel: '' },
                { id: this.newId(), name: 'Employee Advance Settlement', hasPercent: false, phrase: 'Amount Paid Against Emploee Settlement Request Form No: ', docLabel: 'Form No', fields: [], leadFieldLabel: '' },
                { id: this.newId(), name: 'Payment against Invoice', hasPercent: false, phrase: 'amount paid against Invoice No: ', docLabel: 'Invoice No', fields: [], leadFieldLabel: '' },
                { id: this.newId(), name: 'Legal Charges (against Case No)', hasPercent: false, phrase: 'amount paid for Legal Charges against Case No: ', docLabel: 'Case No(s)', fields: [], leadFieldLabel: '' },
                { id: this.newId(), name: 'Legal Charges (without Case No)', hasPercent: false, phrase: 'amount paid for Legal Charges for ', docLabel: 'Description', fields: [], leadFieldLabel: '' }
            ];
        } else {
            // Upgrade path: a profile saved before "extra fields" existed
            // (no narration type has a `fields` array yet) gets Vendor Name
            // added to the two COD-by-reference types, adding the PO
            // variant if it's missing entirely. Never runs again once any
            // type has a `fields` array — after that it's fully in the
            // user's hands via Manage Narration Types.
            const hadFieldsAlready = this.lists.narrationTypes.some(nr => Array.isArray(nr.fields));
            this.lists.narrationTypes.forEach(nr => {
                if (!Array.isArray(nr.fields)) nr.fields = [];
                if (typeof nr.leadFieldLabel !== 'string') nr.leadFieldLabel = '';
            });
            if (!hadFieldsAlready) this.ensureCodVendorFields();
        }
    },

    // See loadLists()'s upgrade path above — adds a "Vendor Name" lead
    // field to "COD Charges against Order Id" and "COD Charges against PO"
    // (creating the PO variant if it doesn't exist), without touching
    // anything else in narrationTypes.
    ensureCodVendorFields() {
        if (!Array.isArray(this.lists.narrationTypes)) return;
        [
            { name: 'COD Charges against Order Id', phrase: 'Amount Paid twds COD Charges Against Order Id: ', docLabel: 'Order Id' },
            { name: 'COD Charges against PO', phrase: 'Amount Paid twds COD Charges Against PO No: ', docLabel: 'PO No' }
        ].forEach(spec => {
            let nr = this.lists.narrationTypes.find(x => x.name === spec.name);
            if (!nr) {
                nr = { id: this.newId(), name: spec.name, hasPercent: false, phrase: spec.phrase, docLabel: spec.docLabel, fields: [], leadFieldLabel: '' };
                this.lists.narrationTypes.push(nr);
            }
            if (!Array.isArray(nr.fields)) nr.fields = [];
            if (!nr.fields.some(f => f.label === 'Vendor Name')) nr.fields.push({ label: 'Vendor Name', options: [] });
            if (!nr.leadFieldLabel) nr.leadFieldLabel = 'Vendor Name';
        });
    },

    saveLists(bump = true) {
        if (bump) {
            this.listsUpdatedAt = Date.now();
            localStorage.setItem(CONFIG.LISTS_TS_KEY, String(this.listsUpdatedAt));
        }
        localStorage.setItem(CONFIG.LISTS_KEY, JSON.stringify(this.lists));
        this.populateDropdowns();
        this.renderTable();
        if (bump) this.syncToGoogleSheets();
    },

    // Self-heals the option lists (Category, Priority, Status, Pending With)
    // from what your actual tasks are using. The Filter dropdowns already
    // did this at display time via a "union" with this.tasks, so real
    // category/priority/status/pendingWith values were never actually lost
    // even after the old list got emptied — they just weren't showing up
    // in the entry screen's dropdown or its "Edit" list manager. This
    // makes that recovery permanent: it writes the real values back into
    // the saved list itself, once, so it's fixed everywhere from here on.
    repairListsFromTaskData() {
        const fieldsToHeal = [
            ['categories', 'category'],
            ['priorities', 'priority'],
            ['statuses', 'status'],
            ['pendingWith', 'pendingWith']
        ];
        let changed = false;

        fieldsToHeal.forEach(([listKey, taskField]) => {
            if (!Array.isArray(this.lists[listKey])) this.lists[listKey] = [];
            this.tasks.forEach(t => {
                if (t.purged) return;
                const v = t[taskField];
                if (v && this.lists[listKey].indexOf(v) === -1) {
                    this.lists[listKey].push(v);
                    changed = true;
                }
            });
        });

        if (changed) this.saveLists(true);
    },

    /* ---------- HOLIDAY CALENDAR (persisted, editable per user) ---------- */
    loadHolidays() {
        try {
            const stored = localStorage.getItem(CONFIG.HOLIDAYS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.holidays = Array.isArray(parsed) ? parsed : [];
            } else {
                // First run for this user — seed from the built-in calendar.
                this.holidays = this.DEFAULT_HOLIDAYS.map(h => Object.assign({}, h));
            }
        } catch (e) {
            this.holidays = this.DEFAULT_HOLIDAYS.map(h => Object.assign({}, h));
        }
        let touched = false;
        this.holidays.forEach(h => {
            if (!h.id) { h.id = this.newId(); touched = true; }
            if (h.alert === undefined) { h.alert = true; touched = true; }
        });
        this.holidaysUpdatedAt = Number(localStorage.getItem(CONFIG.HOLIDAYS_TS_KEY)) || 0;
        if (touched || !localStorage.getItem(CONFIG.HOLIDAYS_KEY)) this.saveHolidays(false);
    },

    saveHolidays(bump = true) {
        if (bump) {
            this.holidaysUpdatedAt = Date.now();
            localStorage.setItem(CONFIG.HOLIDAYS_TS_KEY, String(this.holidaysUpdatedAt));
        }
        localStorage.setItem(CONFIG.HOLIDAYS_KEY, JSON.stringify(this.holidays));
        if (this.currentTab === 'Holidays') this.renderHolidays();
        if (this.currentTab === 'Dashboard') this.renderDashboard();
    },

    holidayCalendars() {
        // Distinct "Holiday Calendar" names in use, plus the two defaults and
        // any custom ones registered up front, so a calendar can exist (and
        // be picked) before it's ever used on an actual holiday.
        const out = ['USD Holiday', 'Indian Bank Holiday'];
        (this.customCalendars || []).forEach(name => { if (out.indexOf(name) === -1) out.push(name); });
        this.holidays.forEach(h => { if (h.type && out.indexOf(h.type) === -1) out.push(h.type); });
        return out;
    },

    /* ---------- CUSTOM HOLIDAY CALENDARS (add/delete calendar names) ---------- */
    /* ---------- LEAVE DAYS: mark a day (usually today) as "nothing to do".
       Non-working for alert-deferral purposes, and deliberately never
       logged as activity, so it doesn't show up in the daily report. ---------- */
    loadLeaveDays() {
        try {
            const stored = localStorage.getItem(CONFIG.LEAVE_DAYS_KEY);
            this.leaveDays = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(this.leaveDays)) this.leaveDays = [];
        } catch (e) { this.leaveDays = []; }
    },

    saveLeaveDays() {
        localStorage.setItem(CONFIG.LEAVE_DAYS_KEY, JSON.stringify(this.leaveDays));
        this.renderLeaveDaysList();
        if (this.currentTab === 'Dashboard') this.renderDashboard();
    },

    isTodayLeave() {
        return this.leaveDays.indexOf(this.getLocalDateStr(new Date())) !== -1;
    },

    toggleTodayLeave() {
        const today = this.getLocalDateStr(new Date());
        if (this.leaveDays.indexOf(today) !== -1) {
            this.leaveDays = this.leaveDays.filter(d => d !== today);
            this.showToast('Leave day unmarked for today.', 'success');
        } else {
            this.leaveDays.push(today);
            this.showToast('Today marked as a leave day.', 'success');
        }
        this.saveLeaveDays();
    },

    deleteLeaveDay(date) {
        this.leaveDays = this.leaveDays.filter(d => d !== date);
        this.saveLeaveDays();
    },

    renderLeaveDaysList() {
        const box = document.getElementById('leaveDaysList');
        const btn = document.getElementById('leaveTodayBtn');
        if (btn) btn.textContent = this.isTodayLeave() ? 'Unmark Today\'s Leave' : 'Mark Today as Leave';
        if (!box) return;
        const days = this.leaveDays.slice().sort();
        if (!days.length) {
            box.innerHTML = '<div class="empty-state" style="padding:14px;"><span>No leave days marked.</span></div>';
            return;
        }
        box.innerHTML = days.map(d => `
            <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:var(--input-bg); border:1px solid var(--line);">
                <span style="flex:1; font-size:0.86rem; color:var(--label);">${this.formatDateStr(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
                <button type="button" class="btn-icon bad" onclick="app.deleteLeaveDay('${this.escAttr(d)}')" title="Remove">${this.SVGS.bin}</button>
            </div>
        `).join('');
    },

    /* ---------- NON-WORKING DAY HELPERS (Sunday / holiday / leave day) ----------
       Used to decide whether a task's due date needs the "do today or move
       to next working day" choice at alert time. ---------- */
    isNonWorkingDay(dateStr) {
        if (!dateStr) return false;
        const p = String(dateStr).split('-').map(Number);
        if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return false;
        const d = new Date(p[0], p[1] - 1, p[2]);
        if (d.getDay() === 0) return true; // Sunday
        if (this.holidays.some(h => h.date === dateStr)) return true;
        if (this.leaveDays.indexOf(dateStr) !== -1) return true;
        return false;
    },

    nextWorkingDayFrom(dateStr) {
        const p = String(dateStr).split('-').map(Number);
        if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return dateStr;
        const d = new Date(p[0], p[1] - 1, p[2]);
        for (let i = 0; i < 30; i++) {
            d.setDate(d.getDate() + 1);
            const candidate = this.getLocalDateStr(d);
            if (!this.isNonWorkingDay(candidate)) return candidate;
        }
        return dateStr;
    },

    // Called from the alarm card's "Keep Today" / "Next Working Day" choice.
    resolveNonWorkingDue(taskId, choice) {
        const t = this.findTask(taskId);
        if (!t) return;
        if (choice === 'next') {
            const newDate = this.nextWorkingDayFrom(t.dueDate);
            t.dueDate = newDate;
            t.lastAckDate = null;
            t.snoozeUntil = null;
            t.updatedAt = Date.now();
            this.logTaskActivity(t, 'rescheduled', 'Moved off a non-working day to ' + newDate);
            this.showToast('Moved to next working day (' + this.formatDateStr(newDate) + ').', 'success');
        } else {
            t.lastAckDate = this.getLocalDateStr(new Date());
            t.updatedAt = Date.now();
            this.showToast('Kept for today.', 'success');
        }
        this.saveData();
        this.renderTable();
        this.processEngine();
        this.syncToGoogleSheets();
    },

    loadCustomCalendars() {
        try {
            const stored = localStorage.getItem(CONFIG.CUSTOM_CALENDARS_KEY);
            this.customCalendars = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(this.customCalendars)) this.customCalendars = [];
        } catch (e) { this.customCalendars = []; }
    },

    saveCustomCalendars() {
        localStorage.setItem(CONFIG.CUSTOM_CALENDARS_KEY, JSON.stringify(this.customCalendars));
    },

    addCustomCalendar() {
        const el = document.getElementById('newCalendarName');
        const name = (el.value || '').trim();
        if (!name) { this.showToast('Give the calendar a name.', 'warning'); return; }
        if (this.holidayCalendars().some(c => c.toLowerCase() === name.toLowerCase())) {
            this.showToast('That calendar already exists.', 'warning');
            return;
        }
        this.customCalendars.push(name);
        this.saveCustomCalendars();
        el.value = '';
        this.renderCalendarManagerList();
        this.showToast('Calendar added.', 'success');
    },

    deleteCustomCalendar(name) {
        const inUse = this.holidays.some(h => h.type === name);
        if (inUse && !confirm(`"${name}" is used by existing holidays — remove it from the calendar list anyway? (those holidays keep their type, they just won't be pre-registered.)`)) return;
        this.customCalendars = this.customCalendars.filter(c => c !== name);
        this.saveCustomCalendars();
        this.renderCalendarManagerList();
        this.showToast('Calendar removed.', 'success');
    },

    openCalendarManager() {
        this.renderCalendarManagerList();
        document.getElementById('calendarManagerModal').classList.add('open');
    },

    closeCalendarManager() {
        document.getElementById('calendarManagerModal').classList.remove('open');
        // Whichever calendars remain should be reflected back in the open Holiday modal's select, if any.
        const typeSel = document.getElementById('holidayType');
        if (typeSel) {
            const prev = typeSel.value;
            typeSel.innerHTML = this.holidayCalendars().map(t => `<option value="${this.escAttr(t)}">${this.sanitize(t)}</option>`).join('');
            if (Array.from(typeSel.options).some(o => o.value === prev)) typeSel.value = prev;
        }
    },

    renderCalendarManagerList() {
        const box = document.getElementById('calendarManagerList');
        if (!box) return;
        const builtIn = ['USD Holiday', 'Indian Bank Holiday'];
        const all = this.holidayCalendars();
        box.innerHTML = all.map(name => {
            const isBuiltIn = builtIn.indexOf(name) !== -1;
            return `<div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:var(--input-bg); border:1px solid var(--line);">
                <span style="flex:1; font-size:0.86rem; color:var(--label);">${this.sanitize(name)}${isBuiltIn ? ' <span style=\"color:var(--label-2); font-weight:400;\">(built-in)</span>' : ''}</span>
                ${isBuiltIn ? '' : `<button type="button" class="btn-icon bad" onclick="app.deleteCustomCalendar('${this.escAttr(name)}')" title="Delete">${this.SVGS.bin}</button>`}
            </div>`;
        }).join('');
    },

    // Skips weekends and any other holidays already on file, so the
    // suggested "next working day" is genuinely the next open day.
    computeNextWorkingDay(dateStr) {
        const p = String(dateStr || '').split('-').map(Number);
        if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return '';
        const dateSet = new Set(this.holidays.map(h => h.date));
        const d = new Date(p[0], p[1] - 1, p[2]);
        for (let i = 0; i < 14; i++) {
            d.setDate(d.getDate() + 1);
            const dow = d.getDay();
            const ds = this.getLocalDateStr(d);
            if (dow !== 0 && dow !== 6 && !dateSet.has(ds)) return ds;
        }
        return '';
    },

    openHolidayModal(id = null) {
        const modal = document.getElementById('holidayModal');
        const form = document.getElementById('holidayForm');
        if (!modal || !form) return;

        const typeSel = document.getElementById('holidayType');
        typeSel.innerHTML = this.holidayCalendars().map(t => `<option value="${this.escAttr(t)}">${this.sanitize(t)}</option>`).join('');

        const delBtn = document.getElementById('deleteHolidayBtn');
        form.reset();

        if (id) {
            const h = this.holidays.find(x => String(x.id) === String(id));
            if (!h) { this.showToast('That holiday is no longer available.', 'warning'); return; }
            this.editingHolidayId = String(h.id);
            document.getElementById('holidayModalTitle').textContent = 'Edit Holiday';
            document.getElementById('holidayDate').value = h.date || '';
            document.getElementById('holidayName').value = h.name || '';
            this.setSelectValue('holidayType', h.type || 'USD Holiday');
            document.getElementById('holidayNextWorking').value = h.nextWorkingDay || '';
            document.getElementById('holidayAlertOn').checked = h.alert !== false;
            if (delBtn) delBtn.style.display = '';
        } else {
            this.editingHolidayId = null;
            document.getElementById('holidayModalTitle').textContent = 'Add Holiday';
            document.getElementById('holidayAlertOn').checked = true;
            if (delBtn) delBtn.style.display = 'none';
        }

        modal.classList.add('open');
        setTimeout(() => { const d = document.getElementById('holidayDate'); if (d) d.focus(); }, 80);
    },

    closeHolidayModal() {
        const modal = document.getElementById('holidayModal');
        if (modal) modal.classList.remove('open');
        this.editingHolidayId = null;
    },

    holidayDateChanged() {
        // Always recompute the suggestion when the date changes — otherwise
        // editing an existing holiday's date leaves the old "next working
        // day" behind since the field is no longer empty.
        const dateVal = document.getElementById('holidayDate').value;
        const nextField = document.getElementById('holidayNextWorking');
        if (nextField && dateVal) nextField.value = this.computeNextWorkingDay(dateVal);
    },

    saveHoliday(e) {
        if (e && e.preventDefault) e.preventDefault();

        const date = document.getElementById('holidayDate').value;
        const name = document.getElementById('holidayName').value.trim();
        if (!date) { this.showToast('Please pick a date.', 'warning'); return; }
        if (!name) { this.showToast('Please name the holiday.', 'warning'); return; }

        const fields = {
            date: date,
            name: name,
            type: document.getElementById('holidayType').value || 'USD Holiday',
            nextWorkingDay: document.getElementById('holidayNextWorking').value || this.computeNextWorkingDay(date),
            alert: document.getElementById('holidayAlertOn').checked
        };

        if (this.editingHolidayId) {
            const h = this.holidays.find(x => String(x.id) === String(this.editingHolidayId));
            if (h) Object.assign(h, fields);
        } else {
            this.holidays.push(Object.assign({ id: this.newId() }, fields));
        }

        this.saveHolidays();
        this.closeHolidayModal();
        this.showToast(this.editingHolidayId ? 'Holiday updated.' : 'Holiday added.', 'success');
    },

    deleteCurrentHoliday() {
        if (!this.editingHolidayId) { this.closeHolidayModal(); return; }
        if (!confirm('Remove this holiday from the calendar?')) return;
        this.holidays = this.holidays.filter(h => String(h.id) !== String(this.editingHolidayId));
        this.saveHolidays();
        this.closeHolidayModal();
        this.showToast('Holiday removed.', 'success');
    },

    deleteHolidayById(id) {
        if (!confirm('Remove this holiday from the calendar?')) return;
        this.holidays = this.holidays.filter(h => String(h.id) !== String(id));
        this.saveHolidays();
        this.showToast('Holiday removed.', 'success');
    },

    // Continuous-holiday-block detection: starting from each named holiday,
    // walks outward while the calendar day is either a Saturday/Sunday or
    // another named holiday, so "Fri holiday + Sat + Sun" becomes one block.
    // Scoped entirely to the Holidays tab — never touches task due dates.
    computeHolidayBlocks() {
        const dateSet = new Set(this.holidays.map(h => h.date));
        const nameFor = (ds) => { const h = this.holidays.find(x => x.date === ds); return h ? h.name : null; };
        const isOff = (d) => { const dow = d.getDay(); return dow === 0 || dow === 6 || dateSet.has(this.getLocalDateStr(d)); };
        const parse = (ds) => { const p = ds.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };

        const blocks = [];
        const seen = new Set();

        Array.from(dateSet).sort().forEach(ds => {
            if (seen.has(ds)) return;
            let start = parse(ds), end = parse(ds);
            while (true) { const prev = new Date(start); prev.setDate(prev.getDate() - 1); if (!isOff(prev)) break; start = prev; }
            while (true) { const next = new Date(end); next.setDate(next.getDate() + 1); if (!isOff(next)) break; end = next; }

            const days = Math.round((end - start) / 86400000) + 1;
            if (days < 2) return; // a lone holiday with working days on both sides isn't a "block"

            const names = [];
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                const s = this.getLocalDateStr(d);
                seen.add(s);
                const nm = nameFor(s);
                if (nm) names.push(nm);
            }

            blocks.push({
                start: this.getLocalDateStr(start),
                end: this.getLocalDateStr(end),
                days: days,
                names: names
            });
        });

        return blocks.sort((a, b) => a.start.localeCompare(b.start));
    },

    renderHolidayBlocks() {
        const box = document.getElementById('holidayBlocksBanner');
        if (!box) return;
        const blocks = this.computeHolidayBlocks();
        if (!blocks.length) { box.innerHTML = ''; box.style.display = 'none'; return; }

        box.style.display = 'flex';
        box.innerHTML = blocks.map(b => {
            const range = b.start === b.end
                ? this.formatDateStr(b.start, { weekday: 'short', day: 'numeric', month: 'short' })
                : this.formatDateStr(b.start, { weekday: 'short', day: 'numeric', month: 'short' }) + ' – ' + this.formatDateStr(b.end, { weekday: 'short', day: 'numeric', month: 'short' });
            return '<div class="due-hint ok" style="display:flex;">' +
                '<span><b>' + b.days + '-day continuous holiday</b> · ' + range +
                (b.names.length ? ' · ' + this.sanitize(b.names.join(' + ')) : '') + '</span></div>';
        }).join('');
    },

    // Lightweight, app-wide toast reminder for holidays flagged with an
    // alert — separate from the continuous-block banner above, which is
    // display-only and scoped to the Holidays tab.
    checkHolidayAlerts(now) {
        const todayStr = this.getLocalDateStr(now);
        let ack = {};
        try { ack = JSON.parse(localStorage.getItem(CONFIG.HOLIDAY_ACK_KEY) || '{}'); } catch (e) { ack = {}; }
        if (ack.date !== todayStr) ack = { date: todayStr, ids: [] };

        const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = this.getLocalDateStr(tomorrow);

        this.holidays.forEach(h => {
            if (h.alert === false) return;
            if (ack.ids.indexOf(h.id) !== -1) return;
            if (h.date === todayStr) {
                this.showToast('🏦 Holiday today: ' + h.name + ' (' + h.type + ')', 'info');
                ack.ids.push(h.id);
            } else if (h.date === tomorrowStr) {
                this.showToast('🏦 Holiday tomorrow: ' + h.name + ' (' + h.type + ')', 'info');
                ack.ids.push(h.id);
            }
        });

        localStorage.setItem(CONFIG.HOLIDAY_ACK_KEY, JSON.stringify(ack));
    },

    openListManager(key) {
        this.editingListKey = key;
        document.getElementById('listSelector').value = key;
        const titles = { categories: "Categories", priorities: "Priorities", statuses: "Status Options", pendingWith: "Pending With" };
        document.getElementById('listManagerTitle').textContent = `Manage ${titles[key]}`;
        this.renderListManagerItems();
        this.updateNewCategorySubCategoryOption();
        document.getElementById('listManagerModal').classList.add('open');
    },

    switchListManager() {
        this.editingListKey = document.getElementById('listSelector').value;
        const titles = { categories: "Categories", priorities: "Priorities", statuses: "Status Options", pendingWith: "Pending With" };
        document.getElementById('listManagerTitle').textContent = `Manage ${titles[this.editingListKey]}`;
        this.renderListManagerItems();
        this.updateNewCategorySubCategoryOption();
    },

    // Only Categories get the "needs a Sub Category" checkbox — it's the
    // one place that option is adopted, at category-creation time.
    updateNewCategorySubCategoryOption() {
        const wrap = document.getElementById('newCategorySubCategoryOption');
        if (!wrap) return;
        const isCategories = this.editingListKey === 'categories';
        wrap.style.display = isCategories ? 'flex' : 'none';
        const cb = document.getElementById('newCategoryHasSubCategory');
        if (cb) cb.checked = false;
    },

    closeListManager() {
        document.getElementById('listManagerModal').classList.remove('open');
        this.editingListKey = null;
    },

    renderListManagerItems() {
        const container = document.getElementById('listManagerItems');
        container.innerHTML = '';
        const isCategories = this.editingListKey === 'categories';
        (this.lists[this.editingListKey] || []).forEach((item, index) => {
            const subCatToggle = isCategories
                ? `<label class="lm-subcat-toggle" style="display:flex; align-items:center; gap:5px; font-size:0.72rem; color:var(--label-2); cursor:pointer; white-space:nowrap;" title="Show a Sub Category when an entry in this category is marked Completed">
                        <input type="checkbox" style="width:auto;" ${this.categoryHasSubCategory(item) ? 'checked' : ''} onchange="app.toggleCategorySubCategory(${index}, this.checked)">Sub Category
                   </label>`
                : '';
            container.innerHTML += `<div class="lm-item"><span class="lm-name">${this.sanitize(item)}</span>${subCatToggle}<button type="button" class="lm-del" data-action="list-delete" data-index="${index}">Delete</button></div>`;
        });
    },

    // Toggles whether a category has adopted the Sub Category option.
    toggleCategorySubCategory(index, on) {
        const name = this.lists.categories[index];
        if (!name) return;
        if (!Array.isArray(this.lists.subCategoryCategories)) this.lists.subCategoryCategories = [];
        const at = this.lists.subCategoryCategories.indexOf(name);
        if (on && at === -1) this.lists.subCategoryCategories.push(name);
        else if (!on && at !== -1) this.lists.subCategoryCategories.splice(at, 1);
        this.saveLists();
    },

    addListOption() {
        const input = document.getElementById('newListOptionInput');
        const val = input.value.trim();
        if (val && !this.lists[this.editingListKey].includes(val)) {
            this.lists[this.editingListKey].push(val);
            if (this.editingListKey === 'categories') {
                const cb = document.getElementById('newCategoryHasSubCategory');
                if (cb && cb.checked) {
                    if (!Array.isArray(this.lists.subCategoryCategories)) this.lists.subCategoryCategories = [];
                    this.lists.subCategoryCategories.push(val);
                    cb.checked = false;
                }
            }
            this.saveLists();
            this.renderListManagerItems();
            input.value = '';
        }
    },

    clearList() {
        const key = this.editingListKey;
        if (key === 'priorities' || key === 'statuses') {
            this.showToast('Priorities and statuses cannot be emptied.', 'warning');
            return;
        }
        const count = (this.lists[key] || []).length;
        if (!count) { this.showToast('Already empty', 'info'); return; }
        if (!confirm(`Remove all ${count} options from this list?`)) return;

        this.lists[key] = [];
        this.saveLists();
        this.renderListManagerItems();
        this.showToast('List cleared', 'success');
    },

    deleteListOption(index) {
        if (this.editingListKey === 'statuses' && this.lists.statuses[index] === 'Completed') {
            this.showToast("'Completed' status cannot be deleted.", "error");
            return;
        }
        const removed = this.lists[this.editingListKey][index];
        const inUse = this.tasks.filter(t => !t.deleted && (
            (this.editingListKey === 'categories' && t.category === removed) ||
            (this.editingListKey === 'priorities' && t.priority === removed) ||
            (this.editingListKey === 'statuses' && t.status === removed) ||
            (this.editingListKey === 'pendingWith' && t.pendingWith === removed)
        )).length;
        if (inUse > 0 && !confirm(`"${removed}" is used by ${inUse} entries. Delete anyway?`)) return;

        this.lists[this.editingListKey].splice(index, 1);
        if (this.editingListKey === 'categories' && Array.isArray(this.lists.subCategoryCategories)) {
            this.lists.subCategoryCategories = this.lists.subCategoryCategories.filter(c => c !== removed);
        }
        this.saveLists();
        this.renderListManagerItems();
    },

    /* ---------- DATA ---------- */
    loadData() {
        try {
            let stored = localStorage.getItem(CONFIG.STORAGE_KEY);
            if (!stored || stored === '[]') {
                const legacy = localStorage.getItem('pureEnergyBankingTasks');
                const migratedTo = localStorage.getItem(CONFIG.LEGACY_MIGRATED_KEY);
                if (legacy && legacy !== '[]' && (!migratedTo || migratedTo === this.currentUser)) {
                    stored = legacy;
                    localStorage.setItem(CONFIG.STORAGE_KEY, legacy);
                    localStorage.setItem(CONFIG.LEGACY_MIGRATED_KEY, this.currentUser);
                }
            }
            this.tasks = stored ? JSON.parse(stored) : [];
            if (!Array.isArray(this.tasks)) this.tasks = [];
            this.tasks.forEach(t => {
                if (!t.id) t.id = this.newId();
                if (!t.updatedAt) t.updatedAt = 0;
            });
        } catch (e) {
            console.error('Could not read local data:', e);
            this.tasks = [];
        }
    },

    saveData() {
        try {
            const blob = JSON.stringify(this.tasks);
            localStorage.setItem(CONFIG.STORAGE_KEY, blob);
            this.checkStorageHeadroom(blob.length);
        } catch (e) {
            this.showToast("Local storage full — export a CSV backup and empty the Bin.", "error");
        }
        this.updateStats();
        if (this.currentTab === 'Dashboard') this.renderDashboard();
    },

    updateHeader() {
        document.getElementById('headerDate').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    },

    updateStats() {
        const active = this.tasks.filter(t => !t.deleted);
        const completed = active.filter(t => t.status === 'Completed').length;
        const binned = this.tasks.filter(t => t.deleted && !t.purged).length;
        document.getElementById('entryCount').textContent = active.length;
        document.getElementById('badgeCompleted').textContent = completed;
        document.getElementById('badgeCompletedTab').textContent = completed;
        document.getElementById('badgeBin').textContent = binned;
        document.getElementById('badgeBinTab').textContent = binned;
        document.getElementById('badgeRegister').textContent = active.filter(t => t.status !== 'Completed').length;
    },

    /* ---------- MULTI SELECT FILTERS ---------- */
    msPairs: {
        'ms-category': 'filterCategoryOpts',
        'ms-priority': 'filterPriorityOpts',
        'ms-status': 'filterStatusOpts',
        'ms-category-completed': 'filterCategoryCompletedOpts'
    },

    detachDropdowns() {
        Object.keys(this.msPairs).forEach(wrapId => {
            const panel = document.getElementById(this.msPairs[wrapId]);
            if (panel && panel.parentElement !== document.body) {
                panel.dataset.owner = wrapId;
                document.body.appendChild(panel);
            }
        });
    },

    closeDropdowns() {
        Object.keys(this.msPairs).forEach(wrapId => {
            const wrap = document.getElementById(wrapId);
            const panel = document.getElementById(this.msPairs[wrapId]);
            if (wrap) wrap.classList.remove('open');
            if (panel) panel.classList.remove('open');
        });
        const sortPanel = document.getElementById('sortMenuPanel');
        if (sortPanel) sortPanel.classList.remove('open');
    },

    /* ---------- COMPACT TOOLBAR: gear filter panel + expandable search ---------- */
    toggleFilterPanel(key) {
        const panel = document.getElementById(key + 'FilterPanel');
        if (!panel) return;
        const wasOpen = panel.classList.contains('open');
        this.closeAllFilterPanels();
        if (wasOpen) return;

        panel.classList.add('open');
        const onDoc = (e) => {
            const gear = document.getElementById(key + 'GearBtn');
            if (panel.contains(e.target) || (gear && gear.contains(e.target))) return;
            panel.classList.remove('open');
            document.removeEventListener('click', onDoc, true);
        };
        // Deferred so the click that opened the panel doesn't immediately close it.
        setTimeout(() => document.addEventListener('click', onDoc, true), 0);
    },

    closeAllFilterPanels() {
        document.querySelectorAll('.filter-panel.open').forEach(p => p.classList.remove('open'));
    },

    expandSearch(key) {
        this.closeAllFilterPanels();
        const row = document.getElementById(key + 'Toolbar');
        if (row) row.classList.add('search-expanded');
    },

    collapseSearch(key) {
        const inputId = { register: 'searchInput', holidays: 'searchHolidays', completed: 'searchCompleted' }[key];
        const input = inputId && document.getElementById(inputId);
        const row = document.getElementById(key + 'Toolbar');
        if (input) { input.value = ''; input.blur(); }
        if (row) row.classList.remove('search-expanded');
        if (key === 'holidays') this.renderHolidays(); else this.renderTable();
    },

    // Lights up a small dot on the gear icon when a filter besides the
    // defaults is active, so it's obvious the list is filtered even with
    // the panel collapsed and no dedicated filter row taking up space.
    markFilterDot(key) {
        const dot = document.getElementById(key + 'FilterDot');
        if (!dot) return;
        let active = false;
        if (key === 'register') {
            active = this.getMultiValues('filterCategoryOpts').join(',') !== 'All' ||
                this.getMultiValues('filterPriorityOpts').join(',') !== 'All' ||
                this.getMultiValues('filterStatusOpts').join(',') !== 'All' ||
                (document.getElementById('filterPending')?.value || 'All') !== 'All' ||
                (document.getElementById('filterDue')?.value || 'All') !== 'All';
        } else if (key === 'holidays') {
            active = (document.getElementById('filterHolidayType')?.value || 'All') !== 'All' ||
                !!document.getElementById('filterHolidayAlertOnly')?.checked;
        } else if (key === 'completed') {
            active = this.getMultiValues('filterCategoryCompletedOpts').join(',') !== 'All';
        }
        dot.style.display = active ? 'block' : 'none';
    },

    clearHolidayFilters() {
        document.getElementById('searchHolidays').value = '';
        document.getElementById('filterHolidayType').value = 'All';
        const alertOnly = document.getElementById('filterHolidayAlertOnly');
        if (alertOnly) alertOnly.checked = false;
        this.renderHolidays();
        this.showToast('Filters cleared', 'success');
    },

    toggleDropdown(id) {
        const panel = document.getElementById(this.msPairs[id]);
        const wrap = document.getElementById(id);
        if (!panel || !wrap) return;

        const wasOpen = panel.classList.contains('open');
        this.closeDropdowns();
        if (!wasOpen) {
            wrap.classList.add('open');
            panel.classList.add('open');
            this.positionDropdown(id);
        }
    },

    positionDropdown(id) {
        const wrap = document.getElementById(id);
        if (!wrap || !wrap.classList.contains('open')) return;

        const header = wrap.querySelector('.ms-header');
        const panel = document.getElementById(this.msPairs[id]);
        if (!header || !panel) return;

        const r = header.getBoundingClientRect();
        const gap = 6;
        const below = window.innerHeight - r.bottom - 12;
        const above = r.top - 12;
        const dropDown = below >= 200 || below >= above;

        const width = Math.max(r.width, 210);
        let left = r.left;
        if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
        if (left < 8) left = 8;

        panel.style.width = width + 'px';
        panel.style.left = left + 'px';
        panel.style.maxHeight = Math.max(150, Math.min(320, dropDown ? below : above)) + 'px';

        if (dropDown) {
            panel.style.top = (r.bottom + gap) + 'px';
            panel.style.bottom = 'auto';
        } else {
            panel.style.top = 'auto';
            panel.style.bottom = (window.innerHeight - r.top + gap) + 'px';
        }
    },

    renderMultiSelect(containerId, labelPrefix, options) {
        const cont = document.getElementById(containerId);
        if (!cont) return;

        const currentVals = Array.from(cont.querySelectorAll('input[type="checkbox"]:checked')).map(b => b.value);
        const hasSelection = currentVals.length > 0;
        const isChecked = (val) => {
            if (!hasSelection && val === 'All') return 'checked';
            return currentVals.includes(val) ? 'checked' : '';
        };

        cont.innerHTML = `<label><input type="checkbox" value="All" onchange="app.handleMultiChange('${containerId}', this)" ${isChecked('All')}> All ${labelPrefix}</label>` +
            options.map(o => `<label><input type="checkbox" value="${this.escAttr(o)}" onchange="app.handleMultiChange('${containerId}', this)" ${isChecked(o)}> ${this.sanitize(o)}</label>`).join('');

        this.updateMultiHeader(containerId, labelPrefix);
    },

    SORT_COLUMNS: {
        Register: [
            ['dateLogged', 'Logged'], ['description', 'Task'], ['category', 'Category'],
            ['priority', 'Priority'], ['status', 'Status'], ['pendingWith', 'Pending with'], ['dueDate', 'Due date']
        ],
        Completed: [
            ['dateLogged', 'Logged'], ['description', 'Task'], ['category', 'Category'], ['completedDate', 'Completed on']
        ],
        Bin: [
            ['dateDeleted', 'Deleted on'], ['description', 'Task'], ['category', 'Category']
        ]
    },

    openSortMenu(tab, btnEl) {
        const panel = document.getElementById('sortMenuPanel');
        if (!panel) return;

        const wasOpenForThis = panel.classList.contains('open') && panel.dataset.owner === btnEl.id;
        this.closeDropdowns();
        if (wasOpenForThis) return;

        const cols = this.SORT_COLUMNS[tab] || [];
        panel.innerHTML = cols.map(([col, label]) => {
            const active = this.sortCol === col;
            const arrow = active ? (this.sortAsc ? '↑' : '↓') : '';
            return `<label class="${active ? 'active' : ''}" data-action="sort-pick" data-col="${this.escAttr(col)}" style="display:flex; align-items:center; gap:10px; padding:10px 14px; font-size:0.88rem; cursor:pointer; border-radius:10px;">
                <span>${this.sanitize(label)}</span><span class="sort-dir" style="color:var(--accent); font-weight:700;">${arrow}</span>
            </label>`;
        }).join('');

        panel.dataset.owner = btnEl.id;
        panel.classList.add('open');

        const r = btnEl.getBoundingClientRect();
        const width = Math.max(r.width, 190);
        let left = r.left;
        if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
        panel.style.width = width + 'px';
        panel.style.left = Math.max(8, left) + 'px';

        const below = window.innerHeight - r.bottom - 12;
        const above = r.top - 12;
        if (below >= 180 || below >= above) {
            panel.style.top = (r.bottom + 6) + 'px';
            panel.style.bottom = 'auto';
            panel.style.maxHeight = Math.max(140, Math.min(320, below)) + 'px';
        } else {
            panel.style.top = 'auto';
            panel.style.bottom = (window.innerHeight - r.top + 6) + 'px';
            panel.style.maxHeight = Math.max(140, Math.min(320, above)) + 'px';
        }
    },

    pickSort(col) {
        if (this.sortCol === col) this.sortAsc = !this.sortAsc;
        else { this.sortCol = col; this.sortAsc = true; }
        this.closeDropdowns();
        this.renderTable();
    },

    COL_WIDTHS_KEY: 'pureEnergyColWidths',

    colWidthsStore() {
        try { return JSON.parse(localStorage.getItem(this.COL_WIDTHS_KEY) || '{}'); }
        catch (e) { return {}; }
    },

    saveColWidth(table, col, px) {
        const store = this.colWidthsStore();
        store[table] = store[table] || {};
        store[table][col] = px;
        localStorage.setItem(this.COL_WIDTHS_KEY, JSON.stringify(store));
    },

    clearColWidth(table, col) {
        const store = this.colWidthsStore();
        if (store[table]) { delete store[table][col]; }
        localStorage.setItem(this.COL_WIDTHS_KEY, JSON.stringify(store));
    },

    restoreColumnWidths(table) {
        const store = this.colWidthsStore();
        const saved = store[table];
        const colgroup = document.getElementById(table + 'Colgroup');
        if (!saved || !colgroup) return;
        const cols = colgroup.querySelectorAll('col');
        Object.keys(saved).forEach(i => {
            if (cols[i]) cols[i].style.width = saved[i] + 'px';
        });
    },

    fitColumns(table) {
        const store = this.colWidthsStore();
        delete store[table];
        localStorage.setItem(this.COL_WIDTHS_KEY, JSON.stringify(store));
        const colgroup = document.getElementById(table + 'Colgroup');
        if (colgroup) colgroup.querySelectorAll('col').forEach(c => { c.style.width = ''; });
        this.showToast('Columns sized to fit your data', 'success');
    },

    initColumnResize() {
        if (window.matchMedia('(max-width: 768px)').matches) return;

        let drag = null; 

        document.addEventListener('mousedown', (e) => {
            const handle = e.target.closest('.col-resize');
            if (!handle) return;
            e.preventDefault();

            const table = handle.dataset.table;
            const colIndex = Number(handle.dataset.col);
            const th = handle.closest('th');
            const colgroup = document.getElementById(table + 'Colgroup');
            const colEl = colgroup ? colgroup.querySelectorAll('col')[colIndex] : null;
            if (!th || !colEl) return;

            drag = { table, colIndex, colEl, startX: e.clientX, startWidth: th.getBoundingClientRect().width };
            handle.classList.add('active');
            document.body.classList.add('resizing');
        });

        document.addEventListener('mousemove', (e) => {
            if (!drag) return;
            const next = Math.max(60, Math.round(drag.startWidth + (e.clientX - drag.startX)));
            drag.colEl.style.width = next + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!drag) return;
            const width = parseInt(drag.colEl.style.width, 10);
            if (width) this.saveColWidth(drag.table, drag.colIndex, width);
            document.querySelectorAll('.col-resize.active').forEach(h => h.classList.remove('active'));
            document.body.classList.remove('resizing');
            drag = null;
        });

        document.addEventListener('dblclick', (e) => {
            const handle = e.target.closest('.col-resize');
            if (!handle) return;
            const table = handle.dataset.table;
            const colIndex = Number(handle.dataset.col);
            const colgroup = document.getElementById(table + 'Colgroup');
            const colEl = colgroup ? colgroup.querySelectorAll('col')[colIndex] : null;
            if (!colEl) return;
            colEl.style.width = '';
            this.clearColWidth(table, colIndex);
        });
    },

    handleMultiChange(containerId, checkbox) {
        const cont = document.getElementById(containerId);
        const boxes = Array.from(cont.querySelectorAll('input[type="checkbox"]'));
        const allBox = boxes.find(b => b.value === 'All');

        if (checkbox.value === 'All') {
            if (checkbox.checked) boxes.forEach(b => { if (b !== checkbox) b.checked = false; });
            else checkbox.checked = true;
        } else {
            if (checkbox.checked) { if (allBox) allBox.checked = false; }
            else {
                const anyChecked = boxes.some(b => b.value !== 'All' && b.checked);
                if (!anyChecked && allBox) allBox.checked = true;
            }
        }
        this.updateMultiHeader(containerId);
        this.renderTable();
    },

    updateMultiHeader(containerId, labelPrefix = '') {
        const cont = document.getElementById(containerId);
        if (!cont) return;

        if (!labelPrefix) {
            if (containerId.includes('Category')) labelPrefix = 'Categories';
            else if (containerId.includes('Priority')) labelPrefix = 'Priorities';
            else if (containerId.includes('Status')) labelPrefix = 'Statuses';
        }

        const boxes = Array.from(cont.querySelectorAll('input[type="checkbox"]:checked'));
        const owner = cont.dataset.owner ? document.getElementById(cont.dataset.owner) : cont.parentElement;
        const header = owner ? owner.querySelector('.ms-header') : null;
        if (!header) return;

        if (boxes.length === 0 || (boxes.length === 1 && boxes[0].value === 'All')) {
            header.textContent = `All ${labelPrefix}`;
            header.style.color = '';
            header.style.borderColor = '';
        } else {
            const vals = boxes.filter(b => b.value !== 'All').map(b => b.value);
            header.textContent = vals.length === 1 ? vals[0] : `${vals.length} Selected`;
            header.style.color = 'var(--accent)';
            header.style.borderColor = 'var(--accent)';
        }
    },

    getMultiValues(containerId) {
        const cont = document.getElementById(containerId);
        if (!cont) return ['All'];
        const checked = Array.from(cont.querySelectorAll('input[type="checkbox"]:checked')).map(b => b.value);
        if (checked.includes('All') || checked.length === 0) return ['All'];
        return checked;
    },

    setMultiValue(containerId, val) {
        const cont = document.getElementById(containerId);
        if (!cont) return;
        let boxes = Array.from(cont.querySelectorAll('input[type="checkbox"]'));

        if (val && val !== 'All' && !boxes.some(b => b.value === val)) {
            const label = document.createElement('label');
            label.innerHTML = '<input type="checkbox" value="' + this.escAttr(val) + '" onchange="app.handleMultiChange(\'' + containerId + '\', this)"> ' + this.sanitize(val);
            cont.appendChild(label);
            boxes = Array.from(cont.querySelectorAll('input[type="checkbox"]'));
        }

        boxes.forEach(b => { b.checked = (b.value === val); });
        this.updateMultiHeader(containerId);
    },

    refreshFilterOptions() {
        const sig = JSON.stringify([
            this.lists,
            Array.from(new Set(this.tasks.map(t => [t.category, t.priority, t.status, t.pendingWith].join('|')))).sort()
        ]);
        if (sig === this._filterSig) return;
        if (document.querySelector('.multi-select.open')) return;
        this._filterSig = sig;
        this.populateDropdowns();
    },

    populateDropdowns() {
        const opt = (v) => `<option value="${this.escAttr(v)}">${this.sanitize(v)}</option>`;

        // Rebuilding a <select>'s innerHTML wipes whatever it currently shows.
        // This function is also called by background cloud syncs (see
        // pullTasksFromCloud), so without restoring the value here, a sync
        // that lands while the Task modal is open silently resets every
        // dropdown in it back to its first option. Remember and reapply the
        // selection — same fix already used for the "Pending With" filter.
        //
        // A value can be showing here that isn't in this.lists at all: when
        // editing a task whose stored category/priority/status/pendingWith
        // was since removed from Settings → Lists, openTaskModal's
        // setSelectValue() adds it as a one-off <option> so the task's real
        // data isn't silently altered. If that value isn't re-added after a
        // rebuild, it's just as reset as if we'd never preserved anything —
        // so add it back as a one-off option too, not just when it's a
        // current, still-valid list entry.
        const keepSelect = (elId, html) => {
            const el = document.getElementById(elId);
            if (!el) return;
            const previous = el.value;
            el.innerHTML = html;
            if (!previous) return;
            if (!Array.from(el.options).some(o => o.value === previous)) el.add(new Option(previous, previous));
            el.value = previous;
        };

        keepSelect('taskCategory', '<option value="">Select Category</option>' + this.lists.categories.map(opt).join(''));
        keepSelect('taskPriority', this.lists.priorities.map(opt).join(''));
        keepSelect('taskStatus', this.lists.statuses.map(opt).join(''));
        keepSelect('taskPendingWith', '<option value="">Select Person</option>' + this.lists.pendingWith.map(opt).join(''));
        keepSelect('taskSubCategory', '<option value="">Select Sub Category</option>' + (this.lists.subCategories || []).map(sc => opt(sc.name)).join(''));
        keepSelect('taskNarrationType', '<option value="">— Not a payment / skip —</option>' + (this.lists.narrationTypes || []).map(nr => opt(nr.name)).join(''));

        const union = (base, field) => {
            const out = [].concat(base);
            this.tasks.forEach(t => {
                const v = t[field];
                if (v && out.indexOf(v) === -1) out.push(v);
            });
            return out;
        };
        const allCats = union(this.lists.categories, 'category');

        this.renderMultiSelect('filterCategoryOpts', 'Categories', allCats);
        this.renderMultiSelect('filterPriorityOpts', 'Priorities', union(this.lists.priorities, 'priority'));
        this.renderMultiSelect('filterStatusOpts', 'Statuses', union(this.lists.statuses, 'status'));
        this.renderMultiSelect('filterCategoryCompletedOpts', 'Categories', allCats);

        // Rebuilding a <select> wipes its value, so remember and restore it —
        // otherwise a background sync silently drops the filter you just set.
        const keepValue = (elId, html) => {
            const el = document.getElementById(elId);
            if (!el) return;
            const previous = el.value;
            el.innerHTML = html;
            if (previous && Array.from(el.options).some(o => o.value === previous)) el.value = previous;
        };

        keepValue('filterPending', '<option value="All">All Pending With</option>' + union(this.lists.pendingWith, 'pendingWith').map(opt).join(''));
    },

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (document.getElementById('listManagerModal').classList.contains('open')) { this.closeListManager(); return; }
            if (document.getElementById('taskModal').classList.contains('open')) { this.closeTaskModal(); return; }
            if (document.getElementById('emailListModal').classList.contains('open')) { document.getElementById('emailListModal').classList.remove('open'); return; }
            if (document.getElementById('syncSetupModal').classList.contains('open')) { document.getElementById('syncSetupModal').classList.remove('open'); return; }
        });
    },

    clearFilters(silent = false) {
        document.getElementById('searchInput').value = '';
        const doneSearch = document.getElementById('searchCompleted');
        if (doneSearch) doneSearch.value = '';
        this.setMultiValue('filterCategoryOpts', 'All');
        this.setMultiValue('filterPriorityOpts', 'All');
        this.setMultiValue('filterStatusOpts', 'All');
        this.setMultiValue('filterCategoryCompletedOpts', 'All');

        document.getElementById('filterPending').value = 'All';
        document.getElementById('filterDue').value = 'All';
        document.getElementById('filterPending').classList.remove('active-filter');
        document.getElementById('filterDue').classList.remove('active-filter');

        this.renderTable();
        if (silent !== true) this.showToast('Filters cleared', 'success');
    },

    SORT_DEFAULTS: {
        Register:  ['dueDate', true],
        Completed: ['completedDate', false],
        Bin:       ['dateDeleted', false]
    },
    _sortChosen: {},

    switchTab(tab) {
        if (tab !== this.currentTab) this.exitSelectMode();
        this.currentTab = tab;

        // Each tab opens on the sort that actually makes sense for it —
        // Tasks by what is due next — until you pick your own for that tab.
        const chosen = this._sortChosen[tab];
        const preset = chosen || this.SORT_DEFAULTS[tab];
        if (preset) { this.sortCol = preset[0]; this.sortAsc = preset[1]; }

        document.querySelectorAll('.content-area').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tabbar-btn').forEach(btn => btn.classList.remove('active'));

        const tabMap = { 'Dashboard': 'dashboardTab', 'Register': 'registerTab', 'Holidays': 'holidaysTab', 'Config': 'configTab', 'Completed': 'completedTab', 'Bin': 'binTab' };
        const titles = { 'Dashboard': 'Overview', 'Register': 'Tasks', 'Holidays': 'Bank Holidays', 'Config': 'Configuration', 'Completed': 'Done', 'Bin': 'Bin' };

        const screen = document.getElementById(tabMap[tab]);
        if (screen) {
            screen.classList.add('active');
            screen.scrollTop = 0;
        }

        const btn = document.querySelector(`.tabbar-btn[data-tab="${tab}"]`);
        if (btn) btn.classList.add('active');
        document.getElementById('screenTitle').textContent = titles[tab] || tab;

        if (tab === 'Config') { this.loadReportSamples(); this.loadFixedTasks(); this.renderLeaveDaysList(); this.enterCfgTab(); }

        this.renderTable();
    },

    toggleFilters() {
        const bar = document.getElementById('registerFilters');
        if (bar) {
            const on = bar.classList.toggle('open');
            const toggle = document.getElementById('filterToggle');
            if (toggle) toggle.classList.toggle('is-on', on);
        }
    },

    isDateInRange(t, mode) {
        if (!t.dueDate) return false;
        if (mode === 'Overdue') {
            const dt = this.getTaskDueDateTime(t);
            return !!dt && dt < new Date();
        }
        const [y, m, d] = String(t.dueDate).split('-').map(Number);
        if (!y || !m || !d) return false;
        const target = new Date(y, m - 1, d);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

        if (mode === 'Today') return diffDays === 0;
        if (mode === 'DueByToday') return diffDays <= 0; // overdue + due today, as of today's 11:59 PM cutoff
        if (mode === 'Tomorrow') return diffDays === 1;
        if (mode === 'Next7Days') return diffDays >= 1 && diffDays <= 7;

        const dayOfWeek = today.getDay() || 7;
        const mondayThis = new Date(today); mondayThis.setDate(today.getDate() - dayOfWeek + 1);
        const sundayThis = new Date(mondayThis); sundayThis.setDate(mondayThis.getDate() + 6);
        const mondayNext = new Date(sundayThis); mondayNext.setDate(sundayThis.getDate() + 1);
        const sundayNext = new Date(mondayNext); sundayNext.setDate(mondayNext.getDate() + 6);

        if (mode === 'ThisWeek') return target >= mondayThis && target <= sundayThis;
        if (mode === 'NextWeek') return target >= mondayNext && target <= sundayNext;
        if (mode === 'ThisMonth') return target.getMonth() === today.getMonth() && target.getFullYear() === today.getFullYear();
        return false;
    },

    /* ---------- SORTING & RENDERING ---------- */
    updateSortHeaders() {
        const getIcon = (col) => this.sortCol === col ? (this.sortAsc ? '↑' : '↓') : '↕';
        const handle = (table, i) => `<span class="col-resize" data-table="${table}" data-col="${i}"></span>`;

        if (this.currentTab === 'Register') {
            document.getElementById('registerTableHead').innerHTML = `
                <tr>
                    <th onclick="app.sortTable('dateLogged')">Logged<span>${getIcon('dateLogged')}</span>${handle('register', 0)}</th>
                    <th onclick="app.sortTable('description')">Task<span>${getIcon('description')}</span>${handle('register', 1)}</th>
                    <th onclick="app.sortTable('category')">Category<span>${getIcon('category')}</span>${handle('register', 2)}</th>
                    <th onclick="app.sortTable('priority')">Priority<span>${getIcon('priority')}</span>${handle('register', 3)}</th>
                    <th onclick="app.sortTable('status')">Status<span>${getIcon('status')}</span>${handle('register', 4)}</th>
                    <th onclick="app.sortTable('pendingWith')">Pending With<span>${getIcon('pendingWith')}</span>${handle('register', 5)}</th>
                    <th onclick="app.sortTable('dueDate')">Due Date<span>${getIcon('dueDate')}</span>${handle('register', 6)}</th>
                    <th>Actions${handle('register', 7)}</th>
                </tr>`;
        } else if (this.currentTab === 'Completed') {
            document.getElementById('completedTableHead').innerHTML = `
                <tr>
                    <th onclick="app.sortTable('dateLogged')">Logged<span>${getIcon('dateLogged')}</span>${handle('completed', 0)}</th>
                    <th onclick="app.sortTable('description')">Task<span>${getIcon('description')}</span>${handle('completed', 1)}</th>
                    <th onclick="app.sortTable('category')">Category<span>${getIcon('category')}</span>${handle('completed', 2)}</th>
                    <th onclick="app.sortTable('completedDate')">Completed On<span>${getIcon('completedDate')}</span>${handle('completed', 3)}</th>
                    <th>Actions${handle('completed', 4)}</th>
                </tr>`;
        } else if (this.currentTab === 'Bin') {
            document.getElementById('binTableHead').innerHTML = `
                <tr>
                    <th onclick="app.sortTable('dateDeleted')">Deleted On<span>${getIcon('dateDeleted')}</span>${handle('bin', 0)}</th>
                    <th onclick="app.sortTable('description')">Task<span>${getIcon('description')}</span>${handle('bin', 1)}</th>
                    <th onclick="app.sortTable('category')">Category<span>${getIcon('category')}</span>${handle('bin', 2)}</th>
                    <th>Actions${handle('bin', 3)}</th>
                </tr>`;
        }
    },

    sortTable(col) {
        if (this.sortCol === col) this.sortAsc = !this.sortAsc;
        else { this.sortCol = col; this.sortAsc = true; }
        this._sortChosen[this.currentTab] = [this.sortCol, this.sortAsc];
        this.renderTable();
    },

    compareTasks(a, b) {
        const col = this.sortCol;
        const dir = this.sortAsc ? 1 : -1;
        let valA, valB;

        if (col === 'priority') {
            const rank = (v) => { const i = this.lists.priorities.indexOf(v); return i === -1 ? 999 : i; };
            valA = rank(a.priority); valB = rank(b.priority);
        } else if (col === 'dueDate') {
            const dt = (t) => { const d = this.getTaskDueDateTime(t); return d ? d.getTime() : Number.MAX_SAFE_INTEGER; };
            valA = dt(a); valB = dt(b);
        } else {
            valA = (a[col] || '').toString().toLowerCase();
            valB = (b[col] || '').toString().toLowerCase();
        }

        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    },

    renderTable() {
        this.updateSortHeaders();
        this.refreshFilterOptions();
        if (this.currentTab === 'Register') this.renderRegister();
        else if (this.currentTab === 'Completed') this.renderCompleted();
        else if (this.currentTab === 'Bin') this.renderBin();
        else if (this.currentTab === 'Holidays') this.renderHolidays();
        else if (this.currentTab === 'Dashboard') this.renderDashboard();
    },

    /* ---------- HOLIDAYS RENDERING ---------- */
    // For the Holidays tab: shows the weekday name alongside the date, and
    // flags Saturday/Sunday so continuous weekend+holiday runs are obvious
    // at a glance without having to work it out from the date alone.
    formatHolidayDate(dateStr) {
        if (!dateStr) return '-';
        const p = String(dateStr).split('-').map(Number);
        if (p.length < 3 || !p[0] || !p[1] || !p[2]) return this.sanitize(String(dateStr));
        const d = new Date(p[0], p[1] - 1, p[2]);
        const dow = d.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const text = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        return isWeekend
            ? '<span style="color:var(--red-ink); font-weight:700;">' + this.sanitize(text) + '</span>'
            : this.sanitize(text);
    },

    holidayTypeColour(type) {
        const idx = Math.max(0, this.holidayCalendars().indexOf(type));
        return this.DASH_PALETTE[idx % this.DASH_PALETTE.length];
    },

    renderHolidays() {
        const search = (document.getElementById('searchHolidays')?.value || '').toLowerCase();
        const typeFilter = document.getElementById('filterHolidayType')?.value || 'All';
        const alertOnly = !!document.getElementById('filterHolidayAlertOnly')?.checked;

        // Keep the type filter's own options in sync with whatever Holiday
        // Calendars actually exist (built-in + any the user has added).
        const typeSel = document.getElementById('filterHolidayType');
        if (typeSel) {
            const prev = typeSel.value || 'All';
            typeSel.innerHTML = '<option value="All">All Holiday Calendars</option>' +
                this.holidayCalendars().map(t => `<option value="${this.escAttr(t)}">${this.sanitize(t)}</option>`).join('');
            if (Array.from(typeSel.options).some(o => o.value === prev)) typeSel.value = prev;
        }

        let filtered = this.holidays.filter(h => {
            const matchSearch = !search || h.name.toLowerCase().includes(search) || h.date.includes(search);
            const matchType = typeFilter === 'All' || h.type === typeFilter;
            const matchAlert = !alertOnly || h.alert !== false;
            return matchSearch && matchType && matchAlert;
        });

        this.markFilterDot('holidays');

        // Upcoming holidays on top (soonest first), so the ones that matter
        // right now don't get buried under a year's worth of ones that have
        // already passed. Past holidays follow, most recently passed first.
        const todayStr = this.getLocalDateStr(new Date());
        filtered.sort((a, b) => {
            const aUp = a.date >= todayStr, bUp = b.date >= todayStr;
            if (aUp !== bUp) return aUp ? -1 : 1;
            return aUp ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
        });

        this.renderHolidayBlocks();

        const tbody = document.getElementById('holidaysTableBody');
        const cardBox = document.getElementById('holidayCardList');

        if (tbody) tbody.innerHTML = '';
        if (cardBox) cardBox.innerHTML = '';

        if (filtered.length === 0) {
            if (tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:40px; color:var(--label-2);">No holidays found.</td></tr>`;
            if (cardBox) cardBox.innerHTML = `<div class="empty-state"><strong>No holidays found</strong><span>Add one with the + button.</span></div>`;
            return;
        }

        const rowFrag = document.createDocumentFragment();
        const cardFrag = document.createDocumentFragment();

        filtered.forEach(h => {
            const idAttr = this.escAttr(h.id);
            const colour = this.holidayTypeColour(h.type);
            const isPast = h.date < todayStr;
            const alertIco = h.alert !== false ? '🔔' : '🔕';

            const row = document.createElement('tr');
            row.dataset.recordId = h.id;
            row.dataset.recordMode = 'holiday';
            row.style.opacity = isPast ? '0.6' : '1';
            row.innerHTML = `
                <td style="font-family: var(--font-num); font-weight: 600; white-space:nowrap;">${this.formatHolidayDate(h.date)}</td>
                <td style="font-weight: 700; color: var(--label);">${alertIco} ${this.sanitize(h.name)}</td>
                <td style="font-family: var(--font-num); color: var(--label-2); white-space:nowrap;">${this.formatHolidayDate(h.nextWorkingDay)}</td>
                <td><span style="display:inline-flex; align-items:center; padding:4px 10px; font-size:0.75rem; font-weight:700; border-radius:12px; color:${colour}; background:color-mix(in srgb, ${colour} 14%, transparent); border:1px solid color-mix(in srgb, ${colour} 30%, transparent)">${this.sanitize(h.type)}</span></td>
                <td class="action-cell">
                    <button type="button" class="btn-icon" data-action="holiday-edit" data-id="${idAttr}" title="Edit Holiday">${this.SVGS.edit}</button>
                    <button type="button" class="btn-icon bad" data-action="holiday-delete" data-id="${idAttr}" title="Delete Holiday">${this.SVGS.bin}</button>
                </td>
            `;
            rowFrag.appendChild(row);

            const card = document.createElement('article');
            card.className = 'tcard';
            card.dataset.recordId = h.id;
            card.dataset.recordMode = 'holiday';
            card.style.opacity = isPast ? '0.6' : '1';
            card.innerHTML = `
                <div class="tcard-row">
                    <div class="tcard-title">${alertIco} ${this.sanitize(h.name)}</div>
                    <span class="chip" style="color:${colour}; background:color-mix(in srgb, ${colour} 14%, transparent); border-color:color-mix(in srgb, ${colour} 30%, transparent);">${this.sanitize(h.type)}</span>
                </div>
                <div class="tcard-body">
                    <div class="tcard-chips">
                        <span class="chip">${this.formatHolidayDate(h.date)}</span>
                        <span class="chip">Next working: ${this.formatHolidayDate(h.nextWorkingDay)}</span>
                    </div>
                    <div class="tcard-foot">
                        <div class="tcard-actions">
                            <button type="button" class="btn-icon" data-action="holiday-edit" data-id="${idAttr}" title="Edit Holiday">${this.SVGS.edit}</button>
                            <button type="button" class="btn-icon bad" data-action="holiday-delete" data-id="${idAttr}" title="Delete Holiday">${this.SVGS.bin}</button>
                        </div>
                    </div>
                </div>
            `;
            cardFrag.appendChild(card);
        });

        if (tbody) tbody.appendChild(rowFrag);
        if (cardBox) cardBox.appendChild(cardFrag);
    },

    renderRegister() {
        let filtered = this.tasks.filter(t => !t.deleted && !t.purged && t.status !== 'Completed');
        const search = document.getElementById('searchInput').value.toLowerCase();

        const catVals = this.getMultiValues('filterCategoryOpts');
        const priVals = this.getMultiValues('filterPriorityOpts');
        const statVals = this.getMultiValues('filterStatusOpts');
        const pend = document.getElementById('filterPending');
        const dueMode = document.getElementById('filterDue');

        pend.classList.toggle('active-filter', pend.value !== 'All');
        dueMode.classList.toggle('active-filter', dueMode.value !== 'All');

        filtered = filtered.filter(t => {
            const matchSearch = !search ||
                (t.description || '').toLowerCase().includes(search) ||
                (t.mailChain || '').toLowerCase().includes(search) ||
                (t.notes || '').toLowerCase().includes(search) ||
                (t.subCategory || '').toLowerCase().includes(search);
            const matchDue = dueMode.value === 'NoDue' ? !t.dueDate : (dueMode.value !== 'All' ? this.isDateInRange(t, dueMode.value) : true);
            const matchCat = catVals.includes('All') || catVals.includes(t.category);
            const matchPri = priVals.includes('All') || priVals.includes(t.priority);
            const matchStat = statVals.includes('All') || statVals.includes(t.status);
            return matchSearch && matchCat && matchPri && matchStat &&
                (pend.value === 'All' || t.pendingWith === pend.value) && matchDue;
        });

        filtered.sort((a, b) => this.compareTasks(a, b));

        document.getElementById('entriesShownText').textContent =
            `${filtered.length} of ${this.tasks.filter(t => !t.deleted && t.status !== 'Completed').length} entries shown`;
        this.renderTaskRows('taskTableBody', filtered, 'register');
        this.renderTaskCards('taskCardList', filtered, 'register');
        this.markFilterDot('register');
    },

    renderCompleted() {
        let filtered = this.tasks.filter(t => !t.deleted && !t.purged && t.status === 'Completed');
        const search = document.getElementById('searchCompleted').value.toLowerCase();
        const catVals = this.getMultiValues('filterCategoryCompletedOpts');

        filtered = filtered.filter(t =>
            (!search || (t.description || '').toLowerCase().includes(search)) &&
            (catVals.includes('All') || catVals.includes(t.category))
        );

        filtered.sort((a, b) => this.compareTasks(a, b));

        document.getElementById('entriesCompletedText').textContent = `${filtered.length} completed entries`;
        this.renderTaskRows('completedTableBody', filtered, 'completed');
        this.renderTaskCards('completedCardList', filtered, 'completed');
        this.markFilterDot('completed');
    },

    renderBin() {
        let filtered = this.tasks.filter(t => t.deleted && !t.purged);
        filtered.sort((a, b) => this.compareTasks(a, b));
        document.getElementById('entriesBinText').textContent = `${filtered.length} entries in bin`;
        this.renderTaskRows('binTableBody', filtered, 'bin');
        this.renderTaskCards('binCardList', filtered, 'bin');
    },

    renderTaskRows(containerId, tasks, mode) {
        const tbody = document.getElementById(containerId);
        tbody.innerHTML = '';

        if (tasks.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${mode === 'bin' ? 4 : (mode === 'completed' ? 5 : 8)}" style="text-align:center; padding:40px; color:var(--label-2);">No entries found.</td></tr>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        tasks.forEach(t => {
            const row = document.createElement('tr');
            const idAttr = this.escAttr(t.id);
            row.dataset.recordId = t.id;
            row.dataset.recordMode = mode;
            if (this.selectMode && this.isSelected(t.id)) row.classList.add('is-selected');

            const recBadge = (t.recurrence && t.recurrence !== 'None')
                ? `<span class="rec-badge">${this.sanitize(t.recurrence)}</span>` : '';
            const skipBadge = (Array.isArray(t.skippedDates) && t.skippedDates.indexOf(this.getLocalDateStr(new Date())) !== -1)
                ? `<span class="skip-badge" title="Marked as not done today from the Past Due Alert">Skipped today</span>` : '';

            const mailChainHtml = t.mailChain ? `
                <div class="mailchain">
                    <span title="${this.escAttr(t.mailChain)}">${this.sanitize(t.mailChain)}</span>
                    <button type="button" class="btn-copy" data-action="copy-mail" data-id="${idAttr}"
                            title="Copy reference" aria-label="Copy reference">${this.SVGS.copy}</button>
                </div>` : '';

            const descHtml = `<div class="task-line" title="${this.escAttr(t.description)}">${this.sanitize(t.description)}${recBadge}${skipBadge}</div>${mailChainHtml}`;
            const viewMailBtn = t.emailId
                ? `<button type="button" class="btn-icon go" data-action="open-mail" data-id="${idAttr}" title="Open Mail">${this.SVGS.mail}</button>` : '';

            if (mode === 'register') {
                const logDate = t.dateLogged ? this.formatDateStr(t.dateLogged, { day: 'numeric', month: 'short' }) : '-';
                let dueString = '-';

                if (t.dueDate) {
                    const dt = this.getTaskDueDateTime(t);
                    const isOverdue = dt && dt < new Date();
                    dueString = this.formatDateStr(t.dueDate, { day: 'numeric', month: 'short' });
                    if (t.dueTime) dueString += ` <span class="due-time">${this.formatTimeStr(t.dueTime)}</span>`;
                    if (isOverdue) dueString = `<span class="due-flag" title="Past its deadline">${dueString}</span>`;
                }

                const priorityVal = (t.priority || '').toString();
                const statusVal = (t.status || 'Pending').toString();

                row.innerHTML = `
                    <td class="td-clip">${logDate}</td>
                    <td class="td-task">${descHtml}</td>
                    <td class="td-clip${t.category ? '' : ' td-empty'}" title="${this.escAttr(t.category || '')}">${this.sanitize(t.category || '—')}</td>
                    <td class="td-clip"><span class="dot-priority dot-${this.escAttr(priorityVal.replace(/\s+/g, '-'))}"></span>${this.sanitize(priorityVal || '—')}</td>
                    <td class="td-clip"><span class="status-pill ${this.escAttr(statusVal.replace(/\s+/g, '-'))}" title="${this.escAttr(statusVal)}">${this.sanitize(statusVal)}</span></td>
                    <td class="td-clip${t.pendingWith ? '' : ' td-empty'}" title="${this.escAttr(t.pendingWith || '')}">${this.sanitize(t.pendingWith || '—')}</td>
                    <td class="due-text">${dueString}</td>
                    <td class="action-cell">
                        ${viewMailBtn}
                        <button type="button" class="btn-icon" data-action="edit" data-id="${idAttr}" title="Edit Task">${this.SVGS.edit}</button>
                        <button type="button" class="btn-icon ok" data-action="done" data-id="${idAttr}" title="Mark Done">${this.SVGS.done}</button>
                    </td>`;
            } else if (mode === 'completed') {
                const narrationBtn = (t.narration && t.narration.text)
                    ? `<button type="button" class="btn-icon" data-action="copy-narration" data-id="${idAttr}" title="Copy Tally Narration">${this.SVGS.copy}</button>` : '';
                row.innerHTML = `
                    <td class="td-clip">${this.formatDateStr(t.dateLogged, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td class="td-task">${descHtml}</td>
                    <td class="td-clip${t.category ? '' : ' td-empty'}" title="${this.escAttr(t.category || '')}">${this.sanitize(t.category || '—')}</td>
                    <td class="td-clip">${this.formatDateStr(t.completedDate || this.getLocalDateStr(new Date()))}</td>
                    <td class="action-cell">
                        ${viewMailBtn}
                        ${narrationBtn}
                        <button type="button" class="btn-icon warn" data-action="reopen" data-id="${idAttr}" title="Reopen Task">${this.SVGS.reopen}</button>
                        <button type="button" class="btn-icon bad" data-action="bin" data-id="${idAttr}" title="Move to Bin">${this.SVGS.bin}</button>
                    </td>`;
            } else {
                row.innerHTML = `
                    <td class="td-clip">${this.formatDateStr(t.dateDeleted || this.getLocalDateStr(new Date()))}</td>
                    <td class="td-task">${descHtml}</td>
                    <td class="td-clip${t.category ? '' : ' td-empty'}" title="${this.escAttr(t.category || '')}">${this.sanitize(t.category || '—')}</td>
                    <td class="action-cell">
                        <button type="button" class="btn-icon ok" data-action="restore" data-id="${idAttr}" title="Restore Task">${this.SVGS.restore}</button>
                        <button type="button" class="btn-icon bad" data-action="hard-delete" data-id="${idAttr}" title="Delete Permanently">${this.SVGS.bin}</button>
                    </td>`;
            }

            fragment.appendChild(row);
        });

        tbody.appendChild(fragment);
    },

    renderTaskCards(containerId, tasks, mode) {
        const box = document.getElementById(containerId);
        if (!box) return;
        box.innerHTML = '';

        if (tasks.length === 0) {
            const msg = mode === 'bin'
                ? ['Bin is empty', 'Deleted entries land here first.']
                : (mode === 'completed'
                    ? ['Nothing completed yet', 'Finished entries move here.']
                    : ['No tasks match', 'Clear the filters or add a new entry.']);
            box.innerHTML = `<div class="empty-state"><strong>${msg[0]}</strong><span>${msg[1]}</span></div>`;
            return;
        }

        const frag = document.createDocumentFragment();

        tasks.forEach(t => {
            const idAttr = this.escAttr(t.id);
            const card = document.createElement('article');
            card.className = 'tcard';
            card.dataset.recordId = t.id;
            card.dataset.recordMode = mode;
            if (this.selectMode && this.isSelected(t.id)) card.classList.add('is-selected');

            const chips = [];
            if (t.priority) chips.push(`<span class="chip pri-${this.escAttr(String(t.priority).replace(/\s+/g, '-'))}">${this.sanitize(t.priority)}</span>`);
            if (t.category) chips.push(`<span class="chip cat">${this.sanitize(t.category)}</span>`);
            if (t.recurrence && t.recurrence !== 'None') chips.push(`<span class="chip rec">${this.sanitize(t.recurrence)}</span>`);
            if (Array.isArray(t.skippedDates) && t.skippedDates.indexOf(this.getLocalDateStr(new Date())) !== -1) {
                chips.push(`<span class="skip-badge" title="Marked as not done today from the Past Due Alert">Skipped today</span>`);
            }
            if (t.pendingWith) chips.push(`<span class="chip person">${this.sanitize(t.pendingWith)}</span>`);
            if (t.mailChain) chips.push(`<button type="button" class="chip mail" data-action="copy-mail" data-id="${idAttr}" title="${this.escAttr(t.mailChain)}">${this.SVGS.copy}<span class="chip-txt">${this.sanitize(t.mailChain)}</span></button>`);

            const mailBtn = t.emailId
                ? `<button type="button" class="btn-icon go" data-action="open-mail" data-id="${idAttr}" title="Open Mail">${this.SVGS.mail}</button>` : '';

            if (mode === 'register') {
                card.dataset.priority = (t.priority || '').toString();
                const dt = this.getTaskDueDateTime(t);
                const overdue = dt && dt < new Date();
                if (overdue) card.classList.add('is-overdue');

                let due = 'No due date';
                if (t.dueDate) {
                    due = this.formatDateStr(t.dueDate, { day: 'numeric', month: 'short' });
                    if (t.dueTime) due += ' · ' + this.formatTimeStr(t.dueTime);
                    if (overdue) due = '⚠ ' + due;
                }

                const statusVal = (t.status || 'Pending').toString();
                card.innerHTML = `
                    <div class="tcard-row">
                        <div class="tcard-title">${this.sanitize(t.description)}</div>
                        <span class="status-pill ${this.escAttr(statusVal.replace(/\s+/g, '-'))}">${this.sanitize(statusVal)}</span>
                    </div>
                    <div class="tcard-body">
                    <div class="tcard-chips">${chips.join('')}</div>
                    <div class="tcard-foot">
                        <span class="tcard-due${overdue ? ' overdue' : ''}">${due}</span>
                        <div class="tcard-actions">
                            ${mailBtn}
                            <button type="button" class="btn-icon" data-action="edit" data-id="${idAttr}" title="Edit Task">${this.SVGS.edit}</button>
                            <button type="button" class="btn-icon ok" data-action="done" data-id="${idAttr}" title="Mark Done">${this.SVGS.done}</button>
                        </div>
                    </div>
                    </div>`;
            } else if (mode === 'completed') {
                const narrationBtn = (t.narration && t.narration.text)
                    ? `<button type="button" class="btn-icon" data-action="copy-narration" data-id="${idAttr}" title="Copy Tally Narration">${this.SVGS.copy}</button>` : '';
                card.innerHTML = `
                    <div class="tcard-title">${this.sanitize(t.description)}</div>
                    <div class="tcard-body">
                    <div class="tcard-chips">${chips.join('')}</div>
                    <div class="tcard-foot">
                        <span class="tcard-due">Completed ${this.formatDateStr(t.completedDate || this.getLocalDateStr(new Date()), { day: 'numeric', month: 'short' })}</span>
                        <div class="tcard-actions">
                            ${mailBtn}
                            ${narrationBtn}
                            <button type="button" class="btn-icon warn" data-action="reopen" data-id="${idAttr}" title="Reopen Task">${this.SVGS.reopen}</button>
                            <button type="button" class="btn-icon bad" data-action="bin" data-id="${idAttr}" title="Move to Bin">${this.SVGS.bin}</button>
                        </div>
                    </div>
                    </div>`;
            } else {
                card.innerHTML = `
                    <div class="tcard-title">${this.sanitize(t.description)}</div>
                    <div class="tcard-body">
                    <div class="tcard-chips">${chips.join('')}</div>
                    <div class="tcard-foot">
                        <span class="tcard-due">Deleted ${this.formatDateStr(t.dateDeleted || this.getLocalDateStr(new Date()), { day: 'numeric', month: 'short' })}</span>
                        <div class="tcard-actions">
                            <button type="button" class="btn-icon ok" data-action="restore" data-id="${idAttr}" title="Restore Task">${this.SVGS.restore}</button>
                            <button type="button" class="btn-icon bad" data-action="hard-delete" data-id="${idAttr}" title="Delete Permanently">${this.SVGS.bin}</button>
                        </div>
                    </div>
                    </div>`;
            }

            frag.appendChild(card);
        });

        box.appendChild(frag);
    },


    /* ---------- WHOLE-RECORD TAP TO EDIT ---------- */
    handleRecordClick(e) {
        // A swipe ends in a click event; don't open the editor on the way out.
        if (this._swipeAt && Date.now() - this._swipeAt < 500) return;

        // Ignore anything that is already interactive in its own right.
        if (e.target.closest('a, button, input, textarea, select, label, .col-resize, .ms-options, .modal, #sortMenuPanel')) return;

        // Ignore a click that was really the end of a text selection / drag.
        const sel = window.getSelection && window.getSelection();
        if (sel && String(sel).trim().length > 2) return;

        const host = e.target.closest('tr[data-record-id], .tcard[data-record-id]');
        if (!host) return;

        if (this.selectMode) { this.toggleSelect(host.dataset.recordId); return; }

        const mode = host.dataset.recordMode;
        if (mode === 'bin') {
            this.showToast('Restore this entry before editing it.', 'info');
            return;
        }
        if (mode === 'holiday') { this.openHolidayModal(host.dataset.recordId); return; }
        this.openTaskModal(host.dataset.recordId);
    },

    /* ---------- TASK MODAL & CRUD ---------- */
    setSelectValue(elId, val) {
        const el = document.getElementById(elId);
        if (!el) return;
        const v = (val === undefined || val === null) ? '' : String(val);
        if (v && !Array.from(el.options).some(o => o.value === v)) el.add(new Option(v, v));
        el.value = v;
    },

    openTaskModal(id = null, emailIdForNew = null) {
        const modal = document.getElementById('taskModal');
        const form = document.getElementById('taskForm');
        if (!modal || !form) return;

        this.populateDropdowns();
        form.reset();

        const delBtn = document.getElementById('deleteTaskBtn');
        const mailBtn = document.getElementById('viewOriginalEmailBtn');
        const hasId = id !== null && id !== undefined && id !== '';

        if (hasId) {
            const t = this.findTask(id);
            if (!t) { this.showToast('That entry is no longer available.', 'warning'); return; }

            this.editingId = String(t.id);
            this.storedEmailId = t.emailId || null;

            document.getElementById('modalTitle').textContent = 'Edit Entry';
            document.getElementById('taskDescription').value = t.description || '';
            this.setSelectValue('taskCategory', t.category || '');
            this.setSelectValue('taskPriority', t.priority || '');
            this.setSelectValue('taskStatus', t.status || '');
            this.setSelectValue('taskPendingWith', t.pendingWith || '');
            document.getElementById('taskDueDate').value = t.dueDate || '';
            document.getElementById('taskDueTime').value = t.dueTime || '';
            document.getElementById('taskDeadlineDate').value = t.deadlineDate || '';
            document.getElementById('taskDeadlineTime').value = t.deadlineTime || '';
            document.getElementById('taskMailChain').value = t.mailChain || '';
            document.getElementById('taskRecurrence').value = t.recurrence || 'None';
            document.getElementById('taskNotes').value = t.notes || '';
            this.renderKeyPoints(t.keyPoints || []);
            if (delBtn) delBtn.style.display = t.deleted ? 'none' : '';
        } else {
            this.editingId = null;
            this.storedEmailId = emailIdForNew || null;
            this.renderKeyPoints([]);

            document.getElementById('modalTitle').textContent = 'New Entry';
            const pri = this.lists.priorities.indexOf('Medium') !== -1 ? 'Medium' : (this.lists.priorities[0] || '');
            const stat = this.lists.statuses.indexOf('Pending') !== -1 ? 'Pending' : (this.lists.statuses[0] || '');
            this.setSelectValue('taskPriority', pri);
            this.setSelectValue('taskStatus', stat);
            document.getElementById('taskRecurrence').value = 'None';
            if (delBtn) delBtn.style.display = 'none';
        }

        this.renderPaymentDetails(hasId ? (this.findTask(id) || {}).paymentDetails : {});
        this.setSelectValue('taskSubCategory', hasId ? (this.findTask(id) || {}).subCategory : '');
        this.renderSubCategoryFields(hasId ? (this.findTask(id) || {}).subCategoryFields : {});
        this.renderNarrationFields(hasId ? (this.findTask(id) || {}).narration : null);
        if (mailBtn) mailBtn.style.display = this.storedEmailId ? '' : 'none';
        this.checkDueHoliday();
        this.checkSlotAvailability();

        modal.classList.add('open');
        setTimeout(() => { const d = document.getElementById('taskDescription'); if (d) d.focus(); }, 80);
    },

    closeTaskModal() {
        const modal = document.getElementById('taskModal');
        if (modal) modal.classList.remove('open');
        const hint = document.getElementById('dueHolidayHint');
        if (hint) { hint.style.display = 'none'; hint.innerHTML = ''; }
        const slotHint = document.getElementById('dueSlotHint');
        if (slotHint) { slotHint.style.display = 'none'; slotHint.innerHTML = ''; slotHint.classList.remove('clash', 'ok'); }
        const form = document.getElementById('taskForm');
        if (form) form.reset();
        this.editingId = null;
        this.storedEmailId = null;
    },

    /* ---------- KEY POINTS (structured key/value fields per task, used
       as extra context for the AI daily report) ---------- */
    renderKeyPoints(points) {
        const box = document.getElementById('taskKeyPoints');
        if (!box) return;
        box.innerHTML = '';
        (points || []).forEach(p => this.addKeyPointRow(p.key || '', p.value || ''));
    },

    addKeyPointRow(key = '', value = '') {
        const box = document.getElementById('taskKeyPoints');
        if (!box) return;
        const row = document.createElement('div');
        row.className = 'keypoint-row';
        row.innerHTML = `
            <input type="text" class="kp-key" placeholder="Key (e.g. Amount)" value="${this.escAttr(key)}">
            <input type="text" class="kp-value" placeholder="Value (e.g. ₹50,000)" value="${this.escAttr(value)}">
            <button type="button" class="btn-icon bad kp-remove" onclick="this.closest('.keypoint-row').remove()" title="Remove">${this.SVGS.bin}</button>
        `;
        box.appendChild(row);
    },

    collectKeyPoints() {
        const box = document.getElementById('taskKeyPoints');
        if (!box) return [];
        return Array.from(box.querySelectorAll('.keypoint-row')).map(row => ({
            key: row.querySelector('.kp-key').value.trim(),
            value: row.querySelector('.kp-value').value.trim()
        })).filter(p => p.key || p.value);
    },

    /* ---------- CONDITIONAL PAYMENT FIELDS ----------
       Domestic Payment + Completed → PO Number / Invoice(s) / Narration.
       Import Payment + In Progress → Payment % / Payment Type / Payment
       Against. Matched loosely (case-insensitive, keyword-based) so this
       still works whatever the exact category names in your list are. ---------- */
    isDomesticPaymentCategory(cat) {
        return /domestic/i.test(cat || '') && /payment/i.test(cat || '');
    },

    isImportPaymentCategory(cat) {
        return /import/i.test(cat || '') && /payment/i.test(cat || '');
    },

    isUrgentPaymentCategory(cat) {
        return /urgent/i.test(cat || '') && /payment/i.test(cat || '');
    },

    // Whether a category was opted into showing a Sub Category — decided at
    // category-creation time in the category editor (Manage Categories),
    // not guessed from the category name.
    categoryHasSubCategory(cat) {
        if (!cat) return false;
        return (this.lists.subCategoryCategories || []).indexOf(cat) !== -1;
    },

    // True once a task's Sub Category (and every field its rule requires)
    // has actually been filled in — or the category doesn't need one at all.
    subCategoryComplete(t) {
        if (!t || !this.categoryHasSubCategory(t.category)) return true;
        if (!t.subCategory) return false;
        const sc = (this.lists.subCategories || []).find(x => x.name === t.subCategory);
        if (!sc || !sc.fields || !sc.fields.length) return true;
        const vals = t.subCategoryFields || {};
        return sc.fields.every(f => (vals[f.label] || '').toString().trim() !== '');
    },

    updateConditionalFields() {
        const cat = document.getElementById('taskCategory').value;
        const status = document.getElementById('taskStatus').value;
        const statusNorm = String(status || '').trim().toLowerCase();

        const importBox = document.getElementById('importInProgressFields');
        const subCategoryBox = document.getElementById('subCategoryField');
        const narrationBox = document.getElementById('tallyNarrationBox');

        const showImport = this.isImportPaymentCategory(cat) && statusNorm === 'in progress';
        // A category's Sub Category only needs filling in once the entry is
        // actually being marked Completed / Done — not while it's still
        // open — so it stays out of the way until it's actually required.
        // Which fields it asks for (PO No, Invoice No, or anything else) is
        // entirely up to what the user defined for it in Manage Sub
        // Categories — nothing is required by default here.
        const showSubCategory = this.categoryHasSubCategory(cat) && statusNorm === 'completed';
        // Tally Narration is offered on every payment, whatever its
        // category — same "at completion" timing as Sub Category, but
        // never required unless a Narration Type is actually picked.
        const showNarration = statusNorm === 'completed';

        if (importBox) importBox.style.display = showImport ? '' : 'none';
        if (subCategoryBox) subCategoryBox.style.display = showSubCategory ? '' : 'none';
        if (narrationBox) narrationBox.style.display = showNarration ? '' : 'none';

        // A hidden condition's old values must not silently ride along on
        // save just because the category/status changed after they were
        // filled in — clear whatever no longer applies.
        if (!showImport) {
            document.getElementById('pdPaymentPercent').value = '';
            this.setSelectValue('pdPaymentType', '');
            this.setSelectValue('pdPaymentAgainst', '');
        }
        if (!showSubCategory) {
            this.setSelectValue('taskSubCategory', '');
            const ruleBox = document.getElementById('subCategoryRuleFields');
            if (ruleBox) ruleBox.innerHTML = '';
        }
        if (!showNarration) {
            this.setSelectValue('taskNarrationType', '');
            document.getElementById('narrationPercent').value = '';
            document.getElementById('narrationDocNo').value = '';
            document.getElementById('narrationPurpose').value = '';
            document.getElementById('narrationPreview').value = '';
            const wrap = document.getElementById('narrationFieldsWrap');
            if (wrap) wrap.style.display = 'none';
        }
    },

    renderPaymentDetails(pd) {
        pd = pd || {};
        document.getElementById('pdPaymentPercent').value = pd.paymentPercent || '';
        this.setSelectValue('pdPaymentType', pd.paymentType || '');
        this.setSelectValue('pdPaymentAgainst', pd.paymentAgainst || '');
        this.updateConditionalFields();
    },

    collectPaymentDetails() {
        return {
            paymentPercent: document.getElementById('pdPaymentPercent').value.trim(),
            paymentType: document.getElementById('pdPaymentType').value,
            paymentAgainst: document.getElementById('pdPaymentAgainst').value
        };
    },

    /* ---------- SUB CATEGORY RULES: each sub category can define its own
       extra fields (e.g. "PO Advance Payment" → PO No + Type of Advance),
       set up once when the sub category itself is created/edited. ---------- */
    openSubCategoryRules() {
        this.editingScrId = null;
        this.resetScrForm();
        this.renderSubCategoryRulesList();
        document.getElementById('subCategoryRulesModal').classList.add('open');
    },

    closeSubCategoryRules() {
        document.getElementById('subCategoryRulesModal').classList.remove('open');
    },

    resetScrForm() {
        this.editingScrId = null;
        document.getElementById('scrName').value = '';
        document.getElementById('scrFieldRows').innerHTML = '';
    },

    addScrFieldRow(label = '', options = []) {
        const box = document.getElementById('scrFieldRows');
        if (!box) return;
        const row = document.createElement('div');
        row.className = 'keypoint-row scr-field-row';
        row.innerHTML = `
            <input type="text" class="kp-key scr-field-label" placeholder="Field label (e.g. PO No)" value="${this.escAttr(label)}">
            <input type="text" class="kp-value scr-field-options" placeholder="Options, comma separated (blank = plain text)" value="${this.escAttr((options || []).join(', '))}">
            <button type="button" class="btn-icon bad" onclick="this.closest('.scr-field-row').remove()" title="Remove">${this.SVGS.bin}</button>
        `;
        box.appendChild(row);
    },

    renderSubCategoryRulesList() {
        const box = document.getElementById('subCategoryRulesList');
        if (!box) return;
        const items = this.lists.subCategories || [];
        if (!items.length) {
            box.innerHTML = '<div class="empty-state" style="padding:14px;"><span>No sub categories yet — add one below.</span></div>';
            return;
        }
        box.innerHTML = items.map(sc => {
            const summary = (sc.fields || []).map(f => f.label).join(', ') || 'No extra fields';
            return `<div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:var(--input-bg); border:1px solid var(--line);">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:0.88rem; color:var(--label);">${this.sanitize(sc.name)}</div>
                    <div style="font-size:0.76rem; color:var(--label-2);">${this.sanitize(summary)}</div>
                </div>
                <button type="button" class="btn-icon" onclick="app.editSubCategoryRule('${this.escAttr(sc.id)}')" title="Edit">${this.SVGS.edit}</button>
                <button type="button" class="btn-icon bad" onclick="app.deleteSubCategoryRule('${this.escAttr(sc.id)}')" title="Delete">${this.SVGS.bin}</button>
            </div>`;
        }).join('');
    },

    editSubCategoryRule(id) {
        const sc = (this.lists.subCategories || []).find(x => String(x.id) === String(id));
        if (!sc) return;
        this.editingScrId = sc.id;
        document.getElementById('scrName').value = sc.name;
        document.getElementById('scrFieldRows').innerHTML = '';
        (sc.fields || []).forEach(f => this.addScrFieldRow(f.label, f.options || []));
    },

    collectScrFields() {
        return Array.from(document.querySelectorAll('#scrFieldRows .scr-field-row')).map(row => {
            const label = row.querySelector('.scr-field-label').value.trim();
            const optsRaw = row.querySelector('.scr-field-options').value.trim();
            const options = optsRaw ? optsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
            return { label, options };
        }).filter(f => f.label);
    },

    saveSubCategoryRule() {
        const name = document.getElementById('scrName').value.trim();
        if (!name) { this.showToast('Give the sub category a name.', 'warning'); return; }
        const fields = this.collectScrFields();
        if (!Array.isArray(this.lists.subCategories)) this.lists.subCategories = [];

        if (this.editingScrId) {
            const sc = this.lists.subCategories.find(x => String(x.id) === String(this.editingScrId));
            if (sc) { sc.name = name; sc.fields = fields; }
        } else {
            if (this.lists.subCategories.some(x => x.name.toLowerCase() === name.toLowerCase())) {
                this.showToast('A sub category with that name already exists.', 'warning');
                return;
            }
            this.lists.subCategories.push({ id: this.newId(), name, fields });
        }

        this.saveLists();
        this.resetScrForm();
        this.renderSubCategoryRulesList();
        this.showToast('Sub category saved.', 'success');
    },

    deleteSubCategoryRule(id) {
        if (!confirm('Delete this sub category and its rule fields?')) return;
        this.lists.subCategories = (this.lists.subCategories || []).filter(x => String(x.id) !== String(id));
        this.saveLists();
        this.renderSubCategoryRulesList();
        this.showToast('Sub category removed.', 'success');
    },

    // Task-modal side: shows whatever extra fields the CURRENTLY selected
    // sub category defines, prefilled from an existing task if editing.
    renderSubCategoryFields(prefill) {
        const name = document.getElementById('taskSubCategory').value;
        const box = document.getElementById('subCategoryRuleFields');
        if (!box) return;
        box.innerHTML = '';
        const sc = (this.lists.subCategories || []).find(x => x.name === name);
        if (!sc || !sc.fields || !sc.fields.length) return;

        const values = prefill || {};
        sc.fields.forEach(f => {
            const val = values[f.label] || '';
            const row = document.createElement('div');
            row.className = 'form-group scr-value-row';
            if (f.options && f.options.length) {
                row.innerHTML = `<label>${this.sanitize(f.label)}</label>
                    <select class="scr-value-input" data-label="${this.escAttr(f.label)}" onchange="app.updateNarrationPreview()">
                        <option value="">Select</option>
                        ${f.options.map(o => `<option value="${this.escAttr(o)}" ${o === val ? 'selected' : ''}>${this.sanitize(o)}</option>`).join('')}
                    </select>`;
            } else {
                row.innerHTML = `<label>${this.sanitize(f.label)}</label>
                    <input type="text" class="scr-value-input" data-label="${this.escAttr(f.label)}" value="${this.escAttr(val)}" oninput="app.updateNarrationPreview()">`;
            }
            box.appendChild(row);
        });
    },

    collectSubCategoryFields() {
        const box = document.getElementById('subCategoryRuleFields');
        if (!box) return {};
        const out = {};
        box.querySelectorAll('.scr-value-input').forEach(el => {
            if (el.value) out[el.dataset.label] = el.value;
        });
        return out;
    },

    /* ---------- TALLY NARRATION ----------
       Builds the accounting-entry sentence Tally needs for a payment,
       straight from the same New Entry screen: "Being " + an optional % +
       a fixed phrase (per narration type) + the document number entered at
       completion + any extra fields the type defines + an optional note +
       whatever the entry's Sub Category fields hold + the Mail Chain
       already captured when the task was first created. A type can also
       name one of its extra fields as the "lead field" (e.g. Vendor
       Name) — when set, the narration becomes "<lead value> : ..."
       instead of "Being ...", and the Mail Chain is left out entirely.
       Optional — only used when a Narration Type is picked; skipped
       entirely otherwise. ---------- */
    openNarrationRules() {
        this.editingNrId = null;
        this.resetNrForm();
        this.renderNarrationRulesList();
        document.getElementById('narrationRulesModal').classList.add('open');
    },

    closeNarrationRules() {
        document.getElementById('narrationRulesModal').classList.remove('open');
    },

    resetNrForm() {
        this.editingNrId = null;
        document.getElementById('nrName').value = '';
        document.getElementById('nrHasPercent').checked = false;
        document.getElementById('nrPhrase').value = '';
        document.getElementById('nrDocLabel').value = '';
        document.getElementById('nrFieldRows').innerHTML = '';
    },

    addNrFieldRow(label = '', options = [], isLead = false) {
        const box = document.getElementById('nrFieldRows');
        if (!box) return;
        const row = document.createElement('div');
        row.className = 'keypoint-row nr-field-row';
        row.innerHTML = `
            <input type="text" class="kp-key nr-field-label" placeholder="Field label (e.g. Vendor Name)" value="${this.escAttr(label)}">
            <input type="text" class="kp-value nr-field-options" placeholder="Options, comma separated (blank = plain text)" value="${this.escAttr((options || []).join(', '))}">
            <label style="display:flex; align-items:center; gap:4px; font-size:0.68rem; color:var(--label-2); white-space:nowrap; cursor:pointer; flex:0 0 auto;" title="Lead field: shown first as '&lt;value&gt; : ...' instead of 'Being ...', and the Mail Chain is left out">
                <input type="radio" name="nrLeadField" class="nr-field-lead" style="width:auto;" ${isLead ? 'checked' : ''}> Lead
            </label>
            <button type="button" class="btn-icon bad" onclick="this.closest('.nr-field-row').remove()" title="Remove">${this.SVGS.bin}</button>
        `;
        box.appendChild(row);
    },

    renderNarrationRulesList() {
        const box = document.getElementById('narrationRulesList');
        if (!box) return;
        const items = this.lists.narrationTypes || [];
        if (!items.length) {
            box.innerHTML = '<div class="empty-state" style="padding:14px;"><span>No narration types yet — add one below.</span></div>';
            return;
        }
        box.innerHTML = items.map(nr => {
            const extra = (nr.fields || []).map(f => f.label + (f.label === nr.leadFieldLabel ? ' (lead)' : '')).join(', ');
            return `
            <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:var(--input-bg); border:1px solid var(--line);">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:0.88rem; color:var(--label);">${this.sanitize(nr.name)}</div>
                    <div style="font-size:0.76rem; color:var(--label-2);">Being ${nr.hasPercent ? '[%] ' : ''}${this.sanitize(nr.phrase)}[${this.sanitize(nr.docLabel)}]${extra ? ' · Fields: ' + this.sanitize(extra) : ''}</div>
                </div>
                <button type="button" class="btn-icon" onclick="app.editNarrationRule('${this.escAttr(nr.id)}')" title="Edit">${this.SVGS.edit}</button>
                <button type="button" class="btn-icon bad" onclick="app.deleteNarrationRule('${this.escAttr(nr.id)}')" title="Delete">${this.SVGS.bin}</button>
            </div>`;
        }).join('');
    },

    editNarrationRule(id) {
        const nr = (this.lists.narrationTypes || []).find(x => String(x.id) === String(id));
        if (!nr) return;
        this.editingNrId = nr.id;
        document.getElementById('nrName').value = nr.name;
        document.getElementById('nrHasPercent').checked = !!nr.hasPercent;
        document.getElementById('nrPhrase').value = nr.phrase;
        document.getElementById('nrDocLabel').value = nr.docLabel;
        document.getElementById('nrFieldRows').innerHTML = '';
        (nr.fields || []).forEach(f => this.addNrFieldRow(f.label, f.options || [], f.label === nr.leadFieldLabel));
    },

    collectNrFields() {
        return Array.from(document.querySelectorAll('#nrFieldRows .nr-field-row')).map(row => {
            const label = row.querySelector('.nr-field-label').value.trim();
            const optsRaw = row.querySelector('.nr-field-options').value.trim();
            const options = optsRaw ? optsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
            const isLead = row.querySelector('.nr-field-lead').checked;
            return { label, options, isLead };
        }).filter(f => f.label);
    },

    saveNarrationRule() {
        const name = document.getElementById('nrName').value.trim();
        if (!name) { this.showToast('Give the narration type a name.', 'warning'); return; }
        const hasPercent = document.getElementById('nrHasPercent').checked;
        const phrase = document.getElementById('nrPhrase').value;
        const docLabel = document.getElementById('nrDocLabel').value.trim() || 'Document No';
        const collected = this.collectNrFields();
        const fields = collected.map(f => ({ label: f.label, options: f.options }));
        const lead = collected.find(f => f.isLead);
        const leadFieldLabel = lead ? lead.label : '';
        if (!Array.isArray(this.lists.narrationTypes)) this.lists.narrationTypes = [];

        if (this.editingNrId) {
            const nr = this.lists.narrationTypes.find(x => String(x.id) === String(this.editingNrId));
            if (nr) { nr.name = name; nr.hasPercent = hasPercent; nr.phrase = phrase; nr.docLabel = docLabel; nr.fields = fields; nr.leadFieldLabel = leadFieldLabel; }
        } else {
            if (this.lists.narrationTypes.some(x => x.name.toLowerCase() === name.toLowerCase())) {
                this.showToast('A narration type with that name already exists.', 'warning');
                return;
            }
            this.lists.narrationTypes.push({ id: this.newId(), name, hasPercent, phrase, docLabel, fields, leadFieldLabel });
        }

        this.saveLists();
        this.resetNrForm();
        this.renderNarrationRulesList();
        this.showToast('Narration type saved.', 'success');
    },

    deleteNarrationRule(id) {
        if (!confirm('Delete this narration type?')) return;
        this.lists.narrationTypes = (this.lists.narrationTypes || []).filter(x => String(x.id) !== String(id));
        this.saveLists();
        this.renderNarrationRulesList();
        this.showToast('Narration type removed.', 'success');
    },

    // Task-modal side: shows/hides the % field, updates the document
    // label, and rebuilds the extra-fields inputs for whichever Narration
    // Type is currently selected.
    onNarrationTypeChange() {
        const name = document.getElementById('taskNarrationType').value;
        const wrap = document.getElementById('narrationFieldsWrap');
        const nr = (this.lists.narrationTypes || []).find(x => x.name === name);
        if (wrap) wrap.style.display = nr ? '' : 'none';
        const pctGroup = document.getElementById('narrationPercentGroup');
        if (pctGroup) pctGroup.style.display = (nr && nr.hasPercent) ? '' : 'none';
        const docLabelEl = document.getElementById('narrationDocLabel');
        if (docLabelEl) docLabelEl.textContent = nr ? nr.docLabel : 'Document No';
        const docInput = document.getElementById('narrationDocNo');
        if (docInput) docInput.placeholder = nr ? ('e.g. ' + nr.docLabel) : '';
        this.renderNarrationExtraFields(nr);
        this.updateNarrationPreview();
    },

    // Shows whatever extra fields the CURRENTLY selected Narration Type
    // defines (e.g. Vendor Name), prefilled if editing an existing task.
    renderNarrationExtraFields(nr, prefillValues) {
        const box = document.getElementById('narrationExtraFieldsWrap');
        if (!box) return;
        box.innerHTML = '';
        if (!nr || !nr.fields || !nr.fields.length) return;
        const values = prefillValues || {};
        nr.fields.forEach(f => {
            const val = values[f.label] || '';
            const row = document.createElement('div');
            row.className = 'form-group nr-value-row';
            if (f.options && f.options.length) {
                row.innerHTML = `<label>${this.sanitize(f.label)}</label>
                    <select class="nr-value-input" data-label="${this.escAttr(f.label)}" onchange="app.updateNarrationPreview()">
                        <option value="">Select</option>
                        ${f.options.map(o => `<option value="${this.escAttr(o)}" ${o === val ? 'selected' : ''}>${this.sanitize(o)}</option>`).join('')}
                    </select>`;
            } else {
                row.innerHTML = `<label>${this.sanitize(f.label)}</label>
                    <input type="text" class="nr-value-input" data-label="${this.escAttr(f.label)}" value="${this.escAttr(val)}" oninput="app.updateNarrationPreview()">`;
            }
            box.appendChild(row);
        });
    },

    collectNarrationExtraFields() {
        const box = document.getElementById('narrationExtraFieldsWrap');
        if (!box) return {};
        const out = {};
        box.querySelectorAll('.nr-value-input').forEach(el => { if (el.value) out[el.dataset.label] = el.value; });
        return out;
    },

    // What the currently-selected Sub Category's fields add to the
    // narration — "Label: value, Label: value" — read live from the form.
    currentSubCategoryFieldsText() {
        const el = document.getElementById('taskSubCategory');
        const name = el ? el.value : '';
        const sc = (this.lists.subCategories || []).find(x => x.name === name);
        if (!sc || !sc.fields || !sc.fields.length) return '';
        const vals = this.collectSubCategoryFields();
        return sc.fields.map(f => {
            const v = (vals[f.label] || '').toString().trim();
            return v ? (f.label + ': ' + v) : '';
        }).filter(Boolean).join(', ');
    },

    // Pure builder. Standard form: "Being " + [%] + fixed phrase + doc no +
    // [extra fields] + [note] + [sub category fields] + Mail Chain. If the
    // type names a lead field and it has a value, that becomes
    // "<value> : " up front instead of "Being ...", and Mail Chain is left
    // off entirely.
    buildNarrationText(nr, percent, docNo, purpose, mailChain, fieldsValues, subCategoryText) {
        if (!nr) return '';
        fieldsValues = fieldsValues || {};

        const extraBits = (nr.fields || [])
            .filter(f => f.label !== nr.leadFieldLabel)
            .map(f => (fieldsValues[f.label] || '').toString().trim())
            .filter(Boolean);

        let middle = (nr.phrase || '') + String(docNo || '').trim();
        [extraBits.join(' '), String(purpose || '').trim(), String(subCategoryText || '').trim()]
            .filter(Boolean)
            .forEach(bit => { middle += ' ' + bit; });

        const leadValue = nr.leadFieldLabel ? (fieldsValues[nr.leadFieldLabel] || '').toString().trim() : '';
        if (nr.leadFieldLabel && leadValue) {
            const pct = (nr.hasPercent && String(percent || '').trim()) ? String(percent).trim() + '% ' : '';
            return leadValue + ' : ' + pct + middle;
        }

        let text = 'Being ';
        if (nr.hasPercent && String(percent || '').trim()) text += String(percent).trim() + '% ';
        text += middle;
        if (String(mailChain || '').trim()) text += ' ' + String(mailChain).trim();
        return text;
    },

    updateNarrationPreview() {
        const preview = document.getElementById('narrationPreview');
        if (!preview) return;
        const name = document.getElementById('taskNarrationType').value;
        const nr = (this.lists.narrationTypes || []).find(x => x.name === name);
        const mailChain = document.getElementById('taskMailChain') ? document.getElementById('taskMailChain').value : '';
        preview.value = nr ? this.buildNarrationText(
            nr,
            document.getElementById('narrationPercent') ? document.getElementById('narrationPercent').value : '',
            document.getElementById('narrationDocNo') ? document.getElementById('narrationDocNo').value : '',
            document.getElementById('narrationPurpose') ? document.getElementById('narrationPurpose').value : '',
            mailChain,
            this.collectNarrationExtraFields(),
            this.currentSubCategoryFieldsText()
        ) : '';
    },

    // Reads the form into a narration object to store on the task, or null
    // if no Narration Type is selected (the feature is entirely optional).
    collectNarration() {
        const name = document.getElementById('taskNarrationType') ? document.getElementById('taskNarrationType').value : '';
        const nr = (this.lists.narrationTypes || []).find(x => x.name === name);
        if (!nr) return null;
        const percent = document.getElementById('narrationPercent') ? document.getElementById('narrationPercent').value.trim() : '';
        const docNo = document.getElementById('narrationDocNo') ? document.getElementById('narrationDocNo').value.trim() : '';
        const purpose = document.getElementById('narrationPurpose') ? document.getElementById('narrationPurpose').value.trim() : '';
        const mailChain = document.getElementById('taskMailChain') ? document.getElementById('taskMailChain').value.trim() : '';
        const fieldsValues = this.collectNarrationExtraFields();
        const subCategoryText = this.currentSubCategoryFieldsText();
        return {
            typeId: nr.id, typeName: nr.name, percent, docNo, purpose, fieldsValues,
            // Full text (with Mail Chain) for Tally / Copy Narration.
            text: this.buildNarrationText(nr, percent, docNo, purpose, mailChain, fieldsValues, subCategoryText),
            // Same narration without the Mail Chain — what the Daily
            // Activity Report actually uses (see reportDetailsFor).
            reportText: this.buildNarrationText(nr, percent, docNo, purpose, '', fieldsValues, subCategoryText)
        };
    },

    // Task-modal side: prefills the Narration Type + its fields when editing
    // an entry that already has one.
    renderNarrationFields(narration) {
        this.setSelectValue('taskNarrationType', narration ? narration.typeName : '');
        this.onNarrationTypeChange();
        document.getElementById('narrationPercent').value = narration ? (narration.percent || '') : '';
        document.getElementById('narrationDocNo').value = narration ? (narration.docNo || '') : '';
        document.getElementById('narrationPurpose').value = narration ? (narration.purpose || '') : '';
        const nr = (this.lists.narrationTypes || []).find(x => x.name === (narration && narration.typeName));
        this.renderNarrationExtraFields(nr, narration ? narration.fieldsValues : {});
        this.updateNarrationPreview();
    },

    // Returns an error message if a required conditional field is missing
    // for the category+status combo currently selected, or '' if fine.
    validatePaymentDetails(fields) {
        if (this.isImportPaymentCategory(fields.category) && String(fields.status).trim().toLowerCase() === 'in progress') {
            const pd = this.collectPaymentDetails();
            if (!pd.paymentPercent || !pd.paymentType || !pd.paymentAgainst) {
                return 'Import Payment marked In Progress needs Payment %, Payment Type, and Payment Against.';
            }
        }
        if (this.categoryHasSubCategory(fields.category) && String(fields.status).trim().toLowerCase() === 'completed') {
            if (!fields.subCategory) return 'Select a Sub Category before marking this Completed.';
            const sc = (this.lists.subCategories || []).find(x => x.name === fields.subCategory);
            if (sc && sc.fields && sc.fields.length) {
                const missing = sc.fields.filter(f => !((fields.subCategoryFields || {})[f.label] || '').toString().trim());
                if (missing.length) return 'Fill in ' + missing.map(f => f.label).join(', ') + ' before marking this Completed.';
            }
        }
        // Tally Narration is opt-in — only enforced once a Narration Type
        // has actually been picked, so it never blocks a non-payment entry.
        if (fields.narration) {
            const nr = (this.lists.narrationTypes || []).find(x => x.id === fields.narration.typeId);
            if (!fields.narration.docNo) return 'Enter the ' + ((nr && nr.docLabel) || 'document number') + ' for the Tally Narration, or clear the Narration Type.';
            if (nr && nr.hasPercent && !fields.narration.percent) return 'Enter the % for the Tally Narration.';
            if (nr && nr.fields && nr.fields.length) {
                const missing = nr.fields.filter(f => !((fields.narration.fieldsValues || {})[f.label] || '').toString().trim());
                if (missing.length) return 'Fill in ' + missing.map(f => f.label).join(', ') + ' for the Tally Narration.';
            }
        }
        return '';
    },

    saveTask(e) {
        if (e && e.preventDefault) e.preventDefault();

        const desc = document.getElementById('taskDescription').value.trim();
        if (!desc) { this.showToast('Please enter a task description.', 'warning'); return; }

        const fields = {
            description: desc,
            category: document.getElementById('taskCategory').value,
            subCategory: document.getElementById('taskSubCategory') ? document.getElementById('taskSubCategory').value : '',
            priority: document.getElementById('taskPriority').value,
            status: document.getElementById('taskStatus').value || 'Pending',
            pendingWith: document.getElementById('taskPendingWith').value,
            dueDate: document.getElementById('taskDueDate').value,
            dueTime: document.getElementById('taskDueTime').value,
            deadlineDate: document.getElementById('taskDeadlineDate').value,
            deadlineTime: document.getElementById('taskDeadlineTime').value,
            mailChain: document.getElementById('taskMailChain').value.trim(),
            recurrence: document.getElementById('taskRecurrence').value || 'None',
            notes: document.getElementById('taskNotes').value,
            keyPoints: this.collectKeyPoints(),
            paymentDetails: this.collectPaymentDetails(),
            subCategoryFields: this.collectSubCategoryFields(),
            narration: this.collectNarration(),
            updatedAt: Date.now()
        };

        const paymentError = this.validatePaymentDetails(fields);
        if (paymentError) { this.showToast(paymentError, 'warning'); return; }

        const clash = this.slotClash(fields.dueDate, fields.dueTime, this.editingId);
        if (clash) {
            const free = this.nextFreeTime(fields.dueDate, fields.dueTime, this.editingId);
            this.checkSlotAvailability();
            this.showToast(
                '"' + clash.description + '" already holds ' + this.formatTimeStr(clash.dueTime) + '.',
                'warning',
                free ? { label: 'Use ' + this.formatTimeStr(free), onClick: () => this.useSlotTime(free) } : null
            );
            return;
        }

        const todayStr = this.getLocalDateStr(new Date());
        const editing = !!this.editingId;

        if (editing) {
            const task = this.findTask(this.editingId);
            if (!task) { this.showToast('That entry is no longer available.', 'error'); this.closeTaskModal(); return; }

            const dueChanged = (task.dueDate || '') !== fields.dueDate || (task.dueTime || '') !== fields.dueTime;
            const deadlineChanged = (task.deadlineDate || '') !== fields.deadlineDate || (task.deadlineTime || '') !== fields.deadlineTime;
            const oldStatus = task.status;
            const statusChanged = oldStatus !== fields.status;
            Object.assign(task, fields);
            if (dueChanged) { task.lastAckDate = null; task.snoozeUntil = null; }
            if (deadlineChanged) { task.deadlineAckDate = null; }
            if (this.storedEmailId) task.emailId = this.storedEmailId;

            if (task.status === 'Completed') {
                if (!task.completedDate) task.completedDate = todayStr;
            } else {
                task.completedDate = null;
            }

            // Any real status move (not landing back on "Not yet started")
            // is a day's work worth reporting — completing it is just one
            // case of that, so it goes through the same "status-changed"
            // log rather than needing markComplete() to have been used.
            if (statusChanged && !this.isUnstartedStatus(fields.status)) {
                this.logTaskActivity(task, fields.status === 'Completed' ? 'completed' : 'status-changed',
                    this.reportDetailsFor(task, 'Status changed from "' + (oldStatus || '—') + '" to "' + fields.status + '"'));
            }
        } else {
            const task = Object.assign({
                id: this.newId(),
                dateLogged: todayStr,
                deleted: false,
                purged: false,
                completedDate: null,
                lastAckDate: null,
                snoozeUntil: null,
                deadlineAckDate: null,
                emailId: this.storedEmailId || null
            }, fields);
            if (task.status === 'Completed') task.completedDate = todayStr;
            this.tasks.push(task);
            // A brand-new entry isn't "work done today" by itself — unless
            // it was logged already at a real (non-"Not yet started")
            // status, which is itself that day's status.
            if (!this.isUnstartedStatus(task.status)) {
                this.logTaskActivity(task, task.status === 'Completed' ? 'completed' : 'status-changed',
                    this.reportDetailsFor(task, 'Logged with status "' + task.status + '"'));
            }
        }

        this.closeTaskModal();
        this.saveData();
        this.renderTable();
        this.processEngine();
        this.showToast(editing ? 'Entry updated.' : 'Entry added.', 'success');
        this.syncToGoogleSheets();
    },

    binCurrentTask() {
        if (!this.editingId) { this.closeTaskModal(); return; }
        const id = this.editingId;
        this.closeTaskModal();
        this.softDelete(id);
    },

    nextOccurrence(t) {
        if (!t.recurrence || t.recurrence === 'None' || !t.dueDate) return null;

        const parts = String(t.dueDate).split('-').map(Number);
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

        const next = new Date(parts[0], parts[1] - 1, parts[2]);
        if (t.recurrence === 'Daily') next.setDate(next.getDate() + 1);
        else if (t.recurrence === 'Weekly') next.setDate(next.getDate() + 7);
        else if (t.recurrence === 'Monthly') next.setMonth(next.getMonth() + 1);
        else return null;

        const nextDue = this.getLocalDateStr(next);
        const seriesId = t.seriesId || String(t.id);

        // Don't spawn a second copy if this occurrence already exists.
        const exists = this.tasks.some(x => !x.purged && String(x.seriesId || '') === seriesId && x.dueDate === nextDue);
        if (exists) return null;

        const statusVal = this.lists.statuses.indexOf('Pending') !== -1 ? 'Pending' : (this.lists.statuses[0] || 'Pending');

        return Object.assign({}, t, {
            id: this.newId(),
            seriesId: seriesId,
            status: statusVal,
            dueDate: nextDue,
            dateLogged: this.getLocalDateStr(new Date()),
            completedDate: null,
            dateDeleted: null,
            deleted: false,
            purged: false,
            lastAckDate: null,
            snoozeUntil: null,
            updatedAt: Date.now()
        });
    },

    // Entry point for every "quick done" gesture (table button, swipe, drag,
    // the alarm popup's Mark done). If the category needs a Sub Category,
    // its fields must be filled in first: open the entry so they can be
    // entered, instead of silently marking it done without them.
    tryCompleteTask(id) {
        const t = this.findTask(id);
        if (!t) return;
        if (!this.subCategoryComplete(t)) {
            // Silence any active overdue alert for today so it doesn't pop
            // back up while the required fields are being filled in.
            t.lastAckDate = this.getLocalDateStr(new Date());
            t.updatedAt = Date.now();
            this.saveData();
            if (this.isAlarming) this.stopPersistentAlarm(false);

            this.openTaskModal(id);
            this.setSelectValue('taskStatus', 'Completed');
            this.updateConditionalFields();
            this.setSelectValue('taskSubCategory', t.subCategory || '');
            this.renderSubCategoryFields(t.subCategoryFields || {});
            this.showToast('Select a Sub Category and fill in its details, then save to mark this done.', 'warning');
            return;
        }
        this.markComplete(id);
    },

    markComplete(id) {
        const t = this.findTask(id);
        if (!t) return;

        t.status = 'Completed';
        t.completedDate = this.getLocalDateStr(new Date());
        t.lastAckDate = null;
        t.snoozeUntil = null;
        t.updatedAt = Date.now();

        const repeat = this.nextOccurrence(t);
        if (repeat) {
            if (!t.seriesId) t.seriesId = repeat.seriesId;
            this.tasks.push(repeat);
        }

        this.saveData();
        this.renderTable();
        this.processEngine();
        // Narration first, then Notes (which already picked up any remark
        // typed in the Past Due Alert) — see reportDetailsFor.
        this.logTaskActivity(t, 'completed', this.reportDetailsFor(t));
        this.showToast(
            repeat ? 'Done — next occurrence scheduled.' : 'Marked complete.',
            'success',
            { label: 'Undo', onClick: () => this.undoComplete(id, repeat ? repeat.id : null) }
        );
        this.syncToGoogleSheets();
    },

    // "Skip" from the Past Due Alert: today's work was NOT done — this is
    // NOT a completion. The task stays exactly as it was (still open,
    // still overdue) so it can be finished — and counted — on whatever
    // day that actually happens; it's just silenced for today and marked
    // as skipped so today's Daily Activity Report can never include it
    // (nothing is logged, since nothing here changes status).
    skipTask(id) {
        const t = this.findTask(id);
        if (!t) return;

        const todayStr = this.getLocalDateStr(new Date());
        t.lastAckDate = todayStr;
        t.deadlineAckDate = todayStr;
        if (!Array.isArray(t.skippedDates)) t.skippedDates = [];
        if (t.skippedDates.indexOf(todayStr) === -1) t.skippedDates.push(todayStr);
        t.updatedAt = Date.now();

        this.saveData();
        this.renderTable();
        this.showToast("Skipped for today — still open, and won't be in today's report.", "info");
    },

    undoComplete(id, spawnedId) {
        if (spawnedId) {
            const spawned = this.findTask(spawnedId);
            // Only drop the auto-created occurrence if it is still untouched.
            if (spawned && !spawned.completedDate && !spawned.deleted) {
                this.tasks = this.tasks.filter(t => String(t.id) !== String(spawnedId));
            }
        }
        this.reopenTask(id);
    },

    reopenTask(id) {
        const t = this.findTask(id);
        if (!t) return;

        t.status = this.lists.statuses.indexOf('Pending') !== -1 ? 'Pending' : (this.lists.statuses[0] || 'Pending');
        t.completedDate = null;
        t.lastAckDate = null;
        t.snoozeUntil = null;
        t.updatedAt = Date.now();

        this.saveData();
        this.renderTable();
        this.processEngine();
        this.logTaskActivity(t, 'reopened', '');
        this.showToast('Entry reopened.', 'success');
        this.syncToGoogleSheets();
    },

    softDelete(id) {
        const t = this.findTask(id);
        if (!t) return;

        t.deleted = true;
        t.dateDeleted = this.getLocalDateStr(new Date());
        t.updatedAt = Date.now();

        this.alarmingTasks = this.alarmingTasks.filter(a => String(a.id) !== String(id));
        if (this.alarmingTasks.length === 0 && this.isAlarming) this.stopPersistentAlarm(false);

        this.saveData();
        this.renderTable();
        this.logTaskActivity(t, 'binned', '');
        this.showToast('Moved to Bin.', 'success', { label: 'Undo', onClick: () => this.restoreTask(id) });
        this.syncToGoogleSheets();
    },

    restoreTask(id) {
        const t = this.findTask(id);
        if (!t) return;

        t.deleted = false;
        t.dateDeleted = null;
        t.updatedAt = Date.now();

        this.saveData();
        this.renderTable();
        this.processEngine();
        this.logTaskActivity(t, 'restored', '');
        this.showToast('Entry restored.', 'success');
        this.syncToGoogleSheets();
    },

    hardDelete(id) {
        const t = this.findTask(id);
        if (!t) return;
        if (!confirm('Delete this entry permanently? This cannot be undone.')) return;

        t.deleted = true;
        t.purged = true;
        t.updatedAt = Date.now();

        this.saveData();
        this.renderTable();
        this.logTaskActivity(t, 'deleted permanently', '');
        this.showToast('Entry deleted permanently.', 'success');
        this.syncToGoogleSheets();
    },

    findDuplicates() {
        const active = this.tasks.filter(t => !t.deleted && !t.purged);
        const groups = new Map();

        active.forEach(t => {
            const desc = (t.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
            if (!desc) return;
            const key = desc + '||' + (t.category || '').trim().toLowerCase();
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(t);
        });

        const dupes = Array.from(groups.values()).filter(g => g.length > 1);
        if (dupes.length === 0) { this.showToast('No duplicate entries found.', 'success'); return; }

        const extra = dupes.reduce((sum, g) => sum + g.length - 1, 0);
        const msg = 'Found ' + extra + ' duplicate ' + (extra === 1 ? 'copy' : 'copies') +
            ' across ' + dupes.length + ' ' + (dupes.length === 1 ? 'task' : 'tasks') +
            '.\n\nMove the older copies to the Bin and keep the most recent of each?';
        if (!confirm(msg)) return;

        const todayStr = this.getLocalDateStr(new Date());
        dupes.forEach(g => {
            g.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0));
            g.slice(1).forEach(t => {
                t.deleted = true;
                t.dateDeleted = todayStr;
                t.updatedAt = Date.now();
            });
        });

        this.saveData();
        this.renderTable();
        this.showToast(extra + ' duplicate ' + (extra === 1 ? 'copy' : 'copies') + ' moved to the Bin.', 'success');
        this.syncToGoogleSheets();
    },

    /* ---------- DASHBOARD ---------- */
    DASH_PALETTE: ['#007aff', '#34c759', '#ff9500', '#af52de', '#5ac8fa', '#ff2d55', '#30b0c7', '#ffcc00'],

    dashPriorityColour(name) {
        const n = String(name).toLowerCase();
        if (n.indexOf('critical') !== -1 || n.indexOf('urgent') !== -1 || n.indexOf('high') !== -1) return 'var(--red)';
        if (n.indexOf('medium') !== -1 || n.indexOf('normal') !== -1) return 'var(--amber)';
        if (n.indexOf('low') !== -1) return 'var(--green)';
        return 'var(--slate)';
    },

    dashStatusColour(name) {
        const n = String(name).toLowerCase();
        if (n.indexOf('progress') !== -1) return 'var(--amber)';
        if (n.indexOf('hold') !== -1 || n.indexOf('block') !== -1 || n.indexOf('reject') !== -1) return 'var(--red)';
        if (n.indexOf('complete') !== -1 || n.indexOf('done') !== -1 || n.indexOf('closed') !== -1) return 'var(--green)';
        if (n.indexOf('pending') !== -1 || n.indexOf('open') !== -1 || n.indexOf('new') !== -1) return 'var(--blue)';
        return 'var(--violet)';
    },

    // Returns [label, count, rawValue] sorted by count. rawValue is '' for blanks,
    // which the chart renders as a non-clickable row.
    dashGroup(tasks, field, blankLabel, order) {
        const map = new Map();
        tasks.forEach(t => {
            const raw = (t[field] === undefined || t[field] === null) ? '' : String(t[field]).trim();
            const key = raw || '\u0000blank';
            if (!map.has(key)) map.set(key, { label: raw || blankLabel, raw: raw, n: 0 });
            map.get(key).n++;
        });

        const rank = (o) => {
            if (!order) return null;
            const i = order.indexOf(o.raw);
            return i === -1 ? order.length + (o.raw ? 0 : 1) : i;
        };

        return Array.from(map.values())
            .sort((a, b) => {
                if (order) {
                    const d = rank(a) - rank(b);
                    if (d !== 0) return d;
                }
                return b.n - a.n || a.label.localeCompare(b.label);
            })
            .map(o => [o.label, o.n, o.raw]);
    },

    dashTile(cfg) {
        return '' +
            '<button type="button" class="stat-tile" style="--tint:' + cfg.colour + '"' +
            ' data-action="dash-filter" data-ftype="' + this.escAttr(cfg.ftype) + '"' +
            ' data-fvalue="' + this.escAttr(cfg.fvalue) + '" title="Show these in Tasks">' +
            '<span class="stat-num">' + cfg.count + '</span>' +
            '<span class="stat-label">' + this.sanitize(cfg.title) + '</span>' +
            '<span class="stat-sub">' + this.sanitize(cfg.sub) + '</span>' +
            '</button>';
    },

    dashSection(cfg) {
        const head = '<h3>' + this.sanitize(cfg.title) +
            (cfg.rows.length ? '<b>' + cfg.total + ' open</b>' : '') + '</h3>';

        if (!cfg.rows.length) {
            return '<section class="dash-section">' + head +
                '<div class="dash-none">' + this.sanitize(cfg.empty) + '</div></section>';
        }

        const tiles = cfg.rows.map((r, i) => {
            const colour = cfg.colourFor ? cfg.colourFor(r[0], i) : this.DASH_PALETTE[i % this.DASH_PALETTE.length];
            const clickable = r[2] !== '';
            const attrs = clickable
                ? ' data-action="dash-filter" data-ftype="' + this.escAttr(cfg.ftype) + '" data-fvalue="' + this.escAttr(r[2]) + '"'
                : '';
            return '<button type="button" class="mini-tile' + (clickable ? '' : ' is-static') + '"' +
                ' style="--tint:' + colour + '"' + attrs + ' title="' + this.escAttr(r[0]) + '">' +
                '<span class="mini-name">' + this.sanitize(r[0]) + '</span>' +
                '<span class="mini-num">' + r[1] + '</span>' +
                '</button>';
        }).join('');

        return '<section class="dash-section">' + head + '<div class="mini-grid">' + tiles + '</div></section>';
    },

    renderDashboard() {
        const heroBox = document.getElementById('dashHero');
        const chartBox = document.getElementById('dashCharts');
        const greetBox = document.getElementById('dashGreeting');
        if (!heroBox || !chartBox) return;

        const live = this.tasks.filter(t => !t.deleted && !t.purged);

        const open = live.filter(t => t.status !== 'Completed');
        const done = live.filter(t => t.status === 'Completed');

        const overdue = open.filter(t => this.isDateInRange(t, 'Overdue'));
        const dueToday = open.filter(t => this.isDateInRange(t, 'Today'));
        const next7 = open.filter(t => this.isDateInRange(t, 'Next7Days'));
        const thisMonth = open.filter(t => this.isDateInRange(t, 'ThisMonth'));
        const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });
        const noDue = open.filter(t => !t.dueDate);
        const pendingNow = open.filter(t => (t.status || 'Pending') === 'Pending');
        const pendingToday = open.filter(t => this.isDateInRange(t, 'DueByToday'));

        const todayStr = this.getLocalDateStr(new Date());
        const in7 = new Date(); in7.setDate(in7.getDate() + 7);
        const in7Str = this.getLocalDateStr(in7);
        const upcomingHolidays = this.holidays
            .filter(h => h.date >= todayStr && h.date <= in7Str)
            .sort((a, b) => a.date.localeCompare(b.date));

        /* ---- greeting ---- */
        if (greetBox) {
            const hr = new Date().getHours();
            const part = hr < 12 ? 'Good morning' : (hr < 17 ? 'Good afternoon' : 'Good evening');
            const who = (this.currentUser && this.currentUser !== 'default') ? ', ' + this.sanitize(this.currentUser) : '';

            let line;
            if (open.length === 0) {
                line = done.length
                    ? 'Nothing open — ' + done.length + ' ' + (done.length === 1 ? 'entry is' : 'entries are') + ' already done.'
                    : 'Nothing logged yet. Add your first entry from the Tasks tab.';
            } else {
                const bits = [];
                if (overdue.length) bits.push('<b>' + overdue.length + '</b> past the deadline');
                if (dueToday.length) bits.push('<b>' + dueToday.length + '</b> due today');
                if (next7.length) bits.push('<b>' + next7.length + '</b> in the next 7 days');
                line = 'You have <b>' + open.length + '</b> open ' + (open.length === 1 ? 'entry' : 'entries') +
                    (bits.length ? ' — ' + bits.join(', ') : '') + '.';
            }
            greetBox.innerHTML = '<div class="greet-top"><h1>' + part + who + '</h1>' +
                '<span class="greet-hint">Tap any card to open it in Tasks</span></div><p>' + line + '</p>';
        }

        /* ---- due-date cards ---- */
        heroBox.innerHTML = [
            this.dashTile({
                title: 'Due Today', count: dueToday.length, colour: 'var(--blue)',
                ftype: 'due', fvalue: 'Today',
                sub: dueToday.length ? 'On the clock' : 'Nothing to do Today'
            }),
            this.dashTile({
                title: 'Overdue', count: overdue.length, colour: 'var(--red)',
                ftype: 'due', fvalue: 'Overdue',
                // No overdue entries: say so plainly. This is a display-only
                // state — it's never written to a task and never logged as
                // activity, so it can't show up in the Daily Activity Report.
                sub: overdue.length ? 'Needs attention' : 'Nothing to do Today'
            }),
            this.dashTile({
                title: 'Next 7 Days', count: next7.length, colour: 'var(--amber)',
                ftype: 'due', fvalue: 'Next7Days',
                sub: next7.length ? 'Coming up' : 'Week is clear'
            }),
            this.dashTile({
                title: 'This Month', count: thisMonth.length, colour: 'var(--violet)',
                ftype: 'due', fvalue: 'ThisMonth',
                sub: thisMonth.length ? 'Due in ' + monthName : 'Nothing in ' + monthName
            }),
            this.dashTile({
                title: 'No Due Date', count: noDue.length, colour: 'var(--slate)',
                ftype: 'due', fvalue: 'NoDue',
                sub: noDue.length ? 'Needs a deadline' : 'All dated'
            }),
            this.dashTile({
                title: 'Pending', count: pendingNow.length, colour: 'var(--amber)',
                ftype: 'status', fvalue: 'Pending',
                sub: 'As of now'
            }),
            this.dashTile({
                title: 'Pending as on Today', count: pendingToday.length, colour: 'var(--red)',
                ftype: 'pendingToday', fvalue: 'DueByToday',
                sub: pendingToday.length ? 'Due today or earlier, still open' : 'Nothing pending as of today'
            })
        ].join('');

        /* ---- breakdowns, as small tiles ---- */
        const total = open.length;
        chartBox.innerHTML = [
            this.dashSection({
                title: 'By Category', ftype: 'category', total: total,
                rows: this.dashGroup(open, 'category', 'Uncategorised'),
                empty: 'Nothing open to break down.'
            }),
            this.dashSection({
                title: 'By Sub Category', ftype: 'subCategory', total: open.filter(t => t.subCategory).length,
                rows: this.dashGroup(open.filter(t => t.subCategory), 'subCategory', 'No sub category'),
                empty: 'No sub categories in use yet.'
            }),
            this.dashSection({
                title: 'By Status', ftype: 'status', total: total,
                rows: this.dashGroup(open, 'status', 'No status', this.lists.statuses),
                colourFor: (name) => this.dashStatusColour(name),
                empty: 'Nothing open to break down.'
            }),
            this.dashSection({
                title: 'By Priority', ftype: 'priority', total: total,
                rows: this.dashGroup(open, 'priority', 'No priority', this.lists.priorities),
                colourFor: (name) => this.dashPriorityColour(name),
                empty: 'Nothing open to break down.'
            }),
            this.dashSection({
                title: 'Pending Assignments', ftype: 'pending', total: total,
                rows: this.dashGroup(open, 'pendingWith', 'Unassigned'),
                empty: 'Set "Pending With" to see who owes what.'
            }),
            this.dashHolidaySection(upcomingHolidays)
        ].join('');
    },

    dashHolidaySection(upcomingHolidays) {
        const head = '<h3>Next 7 Days — Holidays<b>' + upcomingHolidays.length + ' upcoming</b></h3>';
        if (!upcomingHolidays.length) {
            return '<section class="dash-section">' + head + '<div class="dash-none">No holidays in the next 7 days.</div></section>';
        }
        const tiles = upcomingHolidays.map((h, i) => {
            const colour = this.holidayTypeColour(h.type);
            return '<button type="button" class="mini-tile" style="--tint:' + colour + '"' +
                ' data-action="dash-filter" data-ftype="holiday" data-fvalue="' + this.escAttr(h.name) + '"' +
                ' title="' + this.escAttr(h.type) + '">' +
                '<span class="mini-name">' + this.sanitize(h.name) + ' · ' + this.formatDateStr(h.date, { day: 'numeric', month: 'short' }) + '</span>' +
                '</button>';
        }).join('');
        return '<section class="dash-section">' + head + '<div class="mini-grid">' + tiles + '</div></section>';
    },

    filterFromDashboard(ftype, fvalue) {
        if (!ftype) return;

        this.clearFilters(true);

        if (ftype === 'due') {
            document.getElementById('filterDue').value = fvalue;
        } else if (ftype === 'pendingToday') {
            document.getElementById('filterDue').value = 'DueByToday';
        } else if (ftype === 'category') {
            this.setMultiValue('filterCategoryOpts', fvalue);
        } else if (ftype === 'status') {
            this.setMultiValue('filterStatusOpts', fvalue);
        } else if (ftype === 'priority') {
            this.setMultiValue('filterPriorityOpts', fvalue);
        } else if (ftype === 'pending') {
            const pend = document.getElementById('filterPending');
            if (!Array.from(pend.options).some(o => o.value === fvalue)) pend.add(new Option(fvalue, fvalue));
            pend.value = fvalue;
        } else if (ftype === 'holiday') {
            this.switchTab('Holidays');
            const search = document.getElementById('searchHolidays');
            if (search) { search.value = fvalue; this.renderHolidays(); }
            this.showToast('Holiday: ' + fvalue, 'info');
            return;
        } else if (ftype === 'subCategory') {
            this.clearFilters(true);
            const searchEl = document.getElementById('searchInput');
            if (searchEl) searchEl.value = fvalue;
            this.switchTab('Register');
            this.showToast('Sub Category: ' + fvalue, 'info');
            return;
        }

        this.switchTab('Register');

        const labels = { due: 'Due', pendingToday: 'Pending as on today', category: 'Category', status: 'Status', priority: 'Priority', pending: 'Pending with' };
        const pretty = { Today: 'Due today', Overdue: 'Overdue', Next7Days: 'Next 7 days', ThisMonth: 'This month', NoDue: 'No due date' };
        this.showToast((labels[ftype] || ftype) + ': ' + (pretty[fvalue] || fvalue), 'info');
    },


    /* ---------- TABLE vs CARD VIEW (mobile and desktop together) ---------- */
    VIEW_KEY: 'pureEnergyView',
    viewMode: 'auto',

    /* Which shell to wear: 'mobile' puts the tabs in a floating bar at the
       bottom, 'desktop' keeps them inline in the header. Decided by the device
       alone — never by the table/card toggle, so you can read a table on a
       phone and still get bottom tabs. */
    resolvedShell() {
        if (typeof window.__shell === 'function') return window.__shell();
        const w = window.innerWidth || 1024;
        const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
        if (w <= 900) return 'mobile';
        if (coarse && w <= 1180) return 'mobile';
        return 'desktop';
    },

    applyShell() {
        const shell = this.resolvedShell();
        document.documentElement.setAttribute('data-shell', shell);
        return shell;
    },

    resolvedView() {
        if (this.viewMode === 'cards' || this.viewMode === 'table') return this.viewMode;
        return this.resolvedShell() === 'mobile' ? 'cards' : 'table';
    },

    applyViewMode() {
        const view = this.resolvedView();
        if (document.body.dataset.view === view) return view;
        document.body.dataset.view = view;
        document.querySelectorAll('.view-toggle').forEach(btn => {
            btn.textContent = view === 'cards' ? '\u25a6' : '\u2630';
            btn.title = view === 'cards' ? 'Card view — tap for the table' : 'Table view — tap for cards';
        });
        return view;
    },

    toggleViewMode() {
        this.viewMode = this.resolvedView() === 'cards' ? 'table' : 'cards';
        localStorage.setItem(this.VIEW_KEY, this.viewMode);
        this.applyViewMode();
        this.renderTable();
        this.showToast(this.viewMode === 'cards' ? 'Card view' : 'Table view', 'info');
    },

    initViewMode() {
        const saved = localStorage.getItem(this.VIEW_KEY);
        this.viewMode = (saved === 'cards' || saved === 'table') ? saved : 'auto';
        this.applyShell();
        this.applyViewMode();

        let t = null;
        const onResize = () => {
            clearTimeout(t);
            t = setTimeout(() => {
                this.applyShell();
                if (this.viewMode !== 'auto') return;
                const before = document.body.dataset.view;
                if (this.applyViewMode() !== before) this.renderTable();
            }, 180);
        };
        window.addEventListener('resize', onResize);
        window.addEventListener('orientationchange', onResize);
    },

    /* ---------- SWIPE A CARD: RIGHT = DONE, LEFT = BIN ---------- */
    initCardSwipe() {
        let card = null, startX = 0, startY = 0, dx = 0, axis = null;

        document.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const el = e.target.closest('.card-list .tcard[data-record-id]');
            if (!el || el.dataset.recordMode !== 'register') return;
            if (e.target.closest('button, a, input, select, textarea')) return;
            card = el; startX = e.touches[0].clientX; startY = e.touches[0].clientY;
            dx = 0; axis = null;
            card.style.transition = 'none';
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!card || e.touches.length !== 1) return;
            dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;

            if (axis === null) {
                if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
                axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
            }
            if (axis !== 'x') return;

            this._swipeAt = Date.now();
            const capped = Math.max(-150, Math.min(150, dx));
            card.style.transform = 'translateX(' + capped + 'px)';
            card.classList.toggle('swipe-done', capped > 62);
            card.classList.toggle('swipe-bin', capped < -62);
        }, { passive: true });

        const release = () => {
            if (!card) return;
            const el = card, moved = dx, wasX = axis === 'x';
            card = null; axis = null;

            el.style.transition = '';
            el.style.transform = '';
            el.classList.remove('swipe-done', 'swipe-bin');
            if (!wasX) return;

            if (moved > 95) this.tryCompleteTask(el.dataset.recordId);
            else if (moved < -95) this.softDelete(el.dataset.recordId);
        };
        document.addEventListener('touchend', release, { passive: true });
        document.addEventListener('touchcancel', release, { passive: true });
    },

    /* ---------- BIN HOUSEKEEPING ---------- */
    BIN_KEEP_DAYS: 30,

    purgeOldBin() {
        const cutoff = Date.now() - (this.BIN_KEEP_DAYS * 86400000);
        let cleared = 0;

        this.tasks.forEach(t => {
            if (!t.deleted || t.purged || !t.dateDeleted) return;
            const p = String(t.dateDeleted).split('-').map(Number);
            if (p.length < 3 || !p[0] || !p[1] || !p[2]) return;
            if (new Date(p[0], p[1] - 1, p[2]).getTime() >= cutoff) return;
            t.purged = true;
            t.updatedAt = Date.now();
            cleared++;
        });

        if (cleared > 0) {
            this.saveData();
            this.showToast(cleared + ' bin ' + (cleared === 1 ? 'entry' : 'entries') +
                ' older than ' + this.BIN_KEEP_DAYS + ' days cleared out.', 'info');
        }
        return cleared;
    },

    /* ---------- BANK-HOLIDAY AWARE DUE DATES ---------- */
    holidayOn(dateStr) {
        if (!dateStr) return null;
        return this.holidays.find(h => h.date === dateStr) || null;
    },

    checkDueHoliday() {
        const hint = document.getElementById('dueHolidayHint');
        if (!hint) return;

        const input = document.getElementById('taskDueDate');
        const holiday = this.holidayOn(input ? input.value : '');

        if (!holiday) { hint.style.display = 'none'; hint.innerHTML = ''; return; }

        const next = holiday.nextWorkingDay;
        hint.innerHTML = '<span>' + this.sanitize(holiday.name) + ' — banks are closed that day.</span>' +
            (next ? '<button type="button" onclick="app.useNextWorkingDay(\'' + this.escAttr(next) +
                '\')">Move to ' + this.formatDateStr(next, { day: 'numeric', month: 'short' }) + '</button>' : '');
        hint.style.display = 'flex';
    },

    useNextWorkingDay(dateStr) {
        const input = document.getElementById('taskDueDate');
        if (input) input.value = dateStr;
        this.checkDueHoliday();
    },

    /* ---------- TIME SLOTS ----------
       A task with a due time holds the clock for the next few minutes, so two
       jobs can't be booked on top of each other. Window length set in Config. */
    SLOT_KEY: 'pureEnergySlotCfg',
    SLOT_DEFAULTS: { on: true, minutes: 10 },

    slotCfg() {
        let saved = {};
        try {
            const raw = JSON.parse(localStorage.getItem(this.SLOT_KEY) || '{}');
            if (raw && typeof raw === 'object') saved = raw;
        } catch (e) {}
        const cfg = Object.assign({}, this.SLOT_DEFAULTS, saved);
        cfg.minutes = Math.max(1, Math.min(240, Number(cfg.minutes) || this.SLOT_DEFAULTS.minutes));
        return cfg;
    },

    saveSlotCfg(patch) {
        const cfg = Object.assign(this.slotCfg(), patch || {});
        localStorage.setItem(this.SLOT_KEY, JSON.stringify(cfg));
        this.renderSlotSettings();
        this.checkSlotAvailability();
        return cfg;
    },

    toggleSlots() {
        const cfg = this.saveSlotCfg({ on: !this.slotCfg().on });
        this.showToast(cfg.on ? 'Slot holding on' : 'Slot holding off', 'info');
    },

    // The task already holding this date and time, if any.
    slotClash(dateStr, timeStr, ignoreId) {
        const cfg = this.slotCfg();
        if (!cfg.on || !dateStr || !timeStr) return null;
        const want = this.nudgeToMinutes(timeStr, -1);
        if (want < 0) return null;

        return this.tasks.find(t => {
            if (!t || t.deleted || t.purged || t.status === 'Completed') return false;
            if (ignoreId && String(t.id) === String(ignoreId)) return false;
            if ((t.dueDate || '') !== dateStr || !t.dueTime) return false;
            const held = this.nudgeToMinutes(t.dueTime, -1);
            if (held < 0) return false;
            return Math.abs(held - want) < cfg.minutes;
        }) || null;
    },

    // First time from this one onwards where nothing else is booked.
    nextFreeTime(dateStr, timeStr, ignoreId) {
        const cfg = this.slotCfg();
        let mins = this.nudgeToMinutes(timeStr, -1);
        if (mins < 0) return null;
        for (let guard = 0; guard < 300; guard++) {
            const clash = this.slotClash(dateStr, this.nudgeToClock(mins), ignoreId);
            if (!clash) return this.nudgeToClock(mins);
            mins = this.nudgeToMinutes(clash.dueTime, mins) + cfg.minutes;
            if (mins > 1439) return null;
        }
        return null;
    },

    // Live hint under the due date and time in the task modal.
    checkSlotAvailability() {
        const hint = document.getElementById('dueSlotHint');
        if (!hint) return;

        const dateEl = document.getElementById('taskDueDate');
        const timeEl = document.getElementById('taskDueTime');
        const dateStr = dateEl ? dateEl.value : '';
        const timeStr = timeEl ? timeEl.value : '';
        const cfg = this.slotCfg();

        const clash = this.slotClash(dateStr, timeStr, this.editingId);
        if (!clash) {
            hint.classList.remove('clash');
            hint.classList.add('ok');
            if (!cfg.on || !dateStr || !timeStr) { hint.style.display = 'none'; hint.innerHTML = ''; return; }
            hint.innerHTML = '<span>Slot free — this entry holds ' + this.formatTimeStr(timeStr) +
                ' to ' + this.formatTimeStr(this.nudgeToClock(this.nudgeToMinutes(timeStr, 0) + cfg.minutes)) + '.</span>';
            hint.style.display = 'flex';
            return;
        }

        const free = this.nextFreeTime(dateStr, timeStr, this.editingId);
        hint.classList.remove('ok');
        hint.classList.add('clash');
        hint.innerHTML = '<span>' + this.sanitize(clash.description) + ' already holds ' +
            this.formatTimeStr(clash.dueTime) + '.</span>' +
            (free ? '<button type="button" onclick="app.useSlotTime(\'' + this.escAttr(free) + '\')">Use ' +
                this.formatTimeStr(free) + '</button>' : '');
        hint.style.display = 'flex';
    },

    useSlotTime(timeStr) {
        const timeEl = document.getElementById('taskDueTime');
        if (timeEl) timeEl.value = timeStr;
        this.checkSlotAvailability();
    },

    renderSlotSettings() {
        const cfg = this.slotCfg();
        const mins = document.getElementById('slotMinutes');
        if (mins && mins.value !== String(cfg.minutes)) mins.value = cfg.minutes;

        const btn = document.getElementById('slotToggle');
        const lbl = document.getElementById('slotToggleLabel');
        if (btn) btn.classList.toggle('is-off', !cfg.on);
        if (lbl) lbl.textContent = cfg.on ? 'Holding on' : 'Holding off';

        const hint = document.getElementById('slotHint');
        if (hint) {
            hint.textContent = cfg.on
                ? 'A task due at 11:15 AM holds the clock until ' +
                  this.formatTimeStr(this.nudgeToClock(675 + cfg.minutes)) + '. Nothing else can be scheduled inside that window.'
                : 'Two tasks can share the same time.';
        }
    },

    /* ---------- LOCAL STORAGE HEADROOM ---------- */
    STORAGE_LIMIT: 5 * 1024 * 1024,

    checkStorageHeadroom(bytes) {
        const used = bytes / this.STORAGE_LIMIT;
        if (used < 0.8) { this._quotaWarned = false; return; }
        if (this._quotaWarned) return;
        this._quotaWarned = true;
        this.showToast('Local storage is about ' + Math.round(used * 100) +
            '% full — export a CSV backup and empty the Bin.', 'warning');
    },


    /* ---------- BULK SELECT ---------- */
    selectMode: false,
    selected: [],

    isSelected(id) { return this.selected.indexOf(String(id)) !== -1; },

    toggleSelectMode() {
        this.selectMode = !this.selectMode;
        this.selected = [];
        document.body.classList.toggle('selecting', this.selectMode);
        document.querySelectorAll('.select-toggle').forEach(b => b.classList.toggle('is-on', this.selectMode));
        this.renderTable();
        this.updateSelectBar();
        if (this.selectMode) this.showToast('Tap entries to select them.', 'info');
    },

    exitSelectMode() {
        if (!this.selectMode) return;
        this.selectMode = false;
        this.selected = [];
        document.body.classList.remove('selecting');
        document.querySelectorAll('.select-toggle').forEach(b => b.classList.remove('is-on'));
        this.updateSelectBar();
    },

    toggleSelect(id) {
        const key = String(id);
        const at = this.selected.indexOf(key);
        if (at === -1) this.selected.push(key); else this.selected.splice(at, 1);
        this.renderTable();
        this.updateSelectBar();
    },

    updateSelectBar() {
        const bar = document.getElementById('bulkBar');
        if (!bar) return;

        bar.classList.toggle('open', this.selectMode);
        if (!this.selectMode) return;

        const n = this.selected.length;
        document.getElementById('bulkCount').textContent = n + ' selected';

        const tab = this.currentTab;
        const show = (elId, on) => {
            const el = document.getElementById(elId);
            if (el) el.style.display = (on && n > 0) ? '' : 'none';
        };
        show('bulkDone', tab === 'Register');
        show('bulkReopen', tab === 'Completed');
        show('bulkBin', tab === 'Register' || tab === 'Completed');
        show('bulkRestore', tab === 'Bin');
    },

    bulkAction(kind) {
        const ids = this.selected.slice();
        if (!ids.length) { this.showToast('Nothing selected.', 'info'); return; }

        const todayStr = this.getLocalDateStr(new Date());
        const pending = this.lists.statuses.indexOf('Pending') !== -1 ? 'Pending' : (this.lists.statuses[0] || 'Pending');
        const spawned = [];
        let n = 0;
        let needsSubCategory = 0;

        ids.forEach(id => {
            const t = this.findTask(id);
            if (!t) return;

            if (kind === 'done') {
                // Can't fill in a Sub Category's required fields from a bulk
                // action — leave those entries open and point the user at
                // them individually instead of completing them half-filled.
                if (!this.subCategoryComplete(t)) { needsSubCategory++; return; }
                t.status = 'Completed';
                t.completedDate = todayStr;
                t.lastAckDate = null; t.snoozeUntil = null;
                t.updatedAt = Date.now();
                const repeat = this.nextOccurrence(t);
                if (repeat) { if (!t.seriesId) t.seriesId = repeat.seriesId; spawned.push(repeat); }
                this.logTaskActivity(t, 'completed', this.reportDetailsFor(t));
            } else if (kind === 'reopen') {
                t.status = pending;
                t.completedDate = null; t.lastAckDate = null; t.snoozeUntil = null;
                t.updatedAt = Date.now();
            } else if (kind === 'bin') {
                t.deleted = true;
                t.dateDeleted = todayStr;
                t.updatedAt = Date.now();
            } else if (kind === 'restore') {
                t.deleted = false;
                t.dateDeleted = null;
                t.updatedAt = Date.now();
            } else {
                return;
            }
            n++;
        });

        spawned.forEach(s => this.tasks.push(s));
        this.exitSelectMode();

        this.saveData();
        this.renderTable();
        this.processEngine();

        const verb = { done: 'completed', reopen: 'reopened', bin: 'moved to the Bin', restore: 'restored' }[kind];
        let msg = n + ' ' + (n === 1 ? 'entry' : 'entries') + ' ' + verb + '.';
        if (needsSubCategory > 0) {
            msg += ' ' + needsSubCategory + ' skipped — open ' + (needsSubCategory === 1 ? 'it' : 'them') + ' individually to fill in the Sub Category first.';
        }
        this.showToast(msg, needsSubCategory > 0 ? 'warning' : 'success');
        this.syncToGoogleSheets();
    },

    /* ---------- BACKUP ---------- */
    exportData(format, silent = false) {
        if (format !== 'csv') return;
        const headers = ['id', 'dateLogged', 'description', 'category', 'priority', 'status', 'pendingWith',
            'dueDate', 'dueTime', 'mailChain', 'notes', 'recurrence', 'deleted', 'dateDeleted',
            'lastAckDate', 'snoozeUntil', 'completedDate', 'emailId', 'updatedAt', 'purged', 'seriesId'];
        const rows = [headers.join(',')];

        this.tasks.forEach(t => {
            rows.push(headers.map(h => `"${(t[h] !== undefined && t[h] !== null ? t[h] : '').toString().replace(/"/g, '""')}"`).join(','));
        });

        const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `banking_tasks_backup_${this.getLocalDateStr(new Date())}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 2000);

        if (!silent) this.showToast('CSV backup exported', 'success');
    },

    importCSV(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                let p = '', row = [''], ret = [row], i = 0, r = 0, s = !0, l;
                for (l of evt.target.result) {
                    if ('"' === l) { if (s && l === p) row[i] += l; s = !s; }
                    else if (',' === l && s) l = row[++i] = '';
                    else if ('\n' === l && s) { if ('\r' === p) row[i] = row[i].slice(0, -1); row = ret[++r] = [l = '']; i = 0; }
                    else row[i] += l;
                    p = l;
                }
                if (ret.length && ret[ret.length - 1].length === 1 && ret[ret.length - 1][0] === '') ret.pop();
                if (ret.length < 2) { this.showToast("CSV file is empty or invalid.", "error"); return; }

                const headers = ret[0];
                const importedTasks = [];

                for (let j = 1; j < ret.length; j++) {
                    const vals = ret[j];
                    const task = {};
                    headers.forEach((h, idx) => {
                        let val = vals[idx] !== undefined ? vals[idx] : "";
                        if (h === "deleted" || h === "purged") val = (val === "true");
                        task[h] = val;
                    });
                    if (!task.id) task.id = this.newId();
                    if (task.deleted === undefined) task.deleted = false;
                    if (task.purged === undefined) task.purged = false;
                    if (!task.recurrence) task.recurrence = 'None';
                    task.updatedAt = Number(task.updatedAt) || Date.now();
                    delete task.overdueAlerted; delete task.overdueAcknowledged;
                    delete task.alerted; delete task.reminderSent;
                    importedTasks.push(task);
                }

                this.exportData('csv', true);

                const merge = confirm(
                    `Importing ${importedTasks.length} entries.\n\n` +
                    `A backup of your current data has just been downloaded.\n\n` +
                    `OK = MERGE with what you already have (recommended)\n` +
                    `Cancel = REPLACE everything`
                );

                if (merge) {
                    const res = this.mergeTasks(importedTasks);
                    this.showToast(`Merged: ${res.added} new, ${res.updated} updated`, 'success');
                } else {
                    if (!confirm("REPLACE all current entries with the imported file? This cannot be undone.")) {
                        this.showToast('Import cancelled', 'info');
                        return;
                    }
                    this.tasks = importedTasks;
                    this.userClearedAll = true;
                    this.showToast('CSV backup restored (replaced)', 'success');
                }

                this.saveData();
                this.renderTable();
            } catch (err) {
                console.error(err);
                this.showToast('Error parsing CSV file', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    },

    printRegister() { window.print(); },

    showToast(msg, type = 'info', action = null) {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const label = document.createElement('span');
        label.textContent = msg;
        toast.appendChild(label);

        let life = 3000;
        if (action && action.label && typeof action.onClick === 'function') {
            life = 6500;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'toast-action';
            btn.textContent = action.label;
            btn.addEventListener('click', () => { toast.remove(); action.onClick(); });
            toast.appendChild(btn);
        }

        container.appendChild(toast);
        setTimeout(() => {
            if (!toast.isConnected) return;
            toast.style.transform = 'translateY(-14px)';
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 350);
        }, life);
    }
};

document.addEventListener('DOMContentLoaded', () => app.checkAuthOnStart());

/* Keep --toolbar-h in sync with whichever sticky toolbar is on screen, so the
   sticky table header parks just under it instead of sliding behind it. */
document.addEventListener('DOMContentLoaded', () => {
    const bars = document.querySelectorAll('.toolbar-row');
    if (!bars.length) return;
    const sync = () => {
        let h = 0;
        bars.forEach((b) => { if (b.offsetParent !== null) h = Math.max(h, b.offsetHeight); });
        document.documentElement.style.setProperty('--toolbar-h', h + 'px');
    };
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(sync);
        bars.forEach((b) => ro.observe(b));
    }
    window.addEventListener('resize', sync);
    sync();
});

/* ---------------- PWA glue ---------------- */
window.app = app;

const pwa = {
    deferred: null,
    waitingWorker: null,

    init() {
        const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        const hint = document.getElementById('installHint');

        if (standalone) {
            if (hint) hint.textContent = 'Running as an installed app. Entries stay on this device and sync to your sheet.';
        } else if (isIOS && hint) {
            hint.innerHTML = 'On iPhone or iPad: tap <b>Share</b>, then <b>Add to Home Screen</b>.';
        }

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => this.registerWorker());

            // A new worker taking over means new files are live: reload once so
            // the running page and the cache are the same version. The very
            // first install claims an uncontrolled page — nothing to reload.
            this.hadController = !!navigator.serviceWorker.controller;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (this.reloading || !this.hadController) return;
                this.reloading = true;
                window.location.reload();
            });

            navigator.serviceWorker.addEventListener('message', (event) => {
                const data = event.data || {};
                if (data.type === 'SW_ACTIVATED' || data.type === 'VERSION') {
                    this.version = data.version || this.version;
                    this.renderVersion();
                }
            });
        } else {
            this.renderVersion();
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            this.deferred = e;
            const btn = document.getElementById('installBtn');
            if (btn) btn.style.display = 'flex';
        });

        window.addEventListener('appinstalled', () => {
            this.deferred = null;
            const btn = document.getElementById('installBtn');
            if (btn) btn.style.display = 'none';
            if (typeof app !== 'undefined' && app.showToast) app.showToast('Installed. Open it from your home screen.', 'success');
        });

        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        const action = params.get('action');
        if (tab || action) {
            setTimeout(() => {
                if (!window.app || !app.currentUser) return;
                if (tab) app.switchTab(tab);
                if (action === 'new') app.openTaskModal();
            }, 400);
        }
    },

    async install() {
        if (!this.deferred) {
            app.showToast('Use your browser menu: Add to home screen', 'info');
            return;
        }
        this.deferred.prompt();
        const choice = await this.deferred.userChoice;
        this.deferred = null;
        if (choice.outcome !== 'accepted') app.showToast('Install cancelled', 'info');
    },

    reg: null,
    hadController: false,
    waitingWorker: null,
    reloading: false,
    version: null,

    async registerWorker() {
        try {
            const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
            this.reg = reg;

            if (reg.waiting && navigator.serviceWorker.controller) this.onUpdateReady(reg.waiting);

            reg.addEventListener('updatefound', () => {
                const sw = reg.installing;
                if (!sw) return;
                sw.addEventListener('statechange', () => {
                    if (sw.state === 'installed' && navigator.serviceWorker.controller) this.onUpdateReady(sw);
                });
            });

            // Look for a new deploy on a slow loop, when the app comes back to
            // the foreground, and when the connection returns.
            setInterval(() => this.silentUpdateCheck(), 30 * 60 * 1000);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') this.silentUpdateCheck();
            });
            window.addEventListener('online', () => this.silentUpdateCheck());

            this.askVersion();
        } catch (err) {
            console.warn('Service worker registration failed', err);
            this.renderVersion();
        }
    },

    onUpdateReady(worker) {
        if (!worker || this.waitingWorker === worker) return;  // one prompt per build
        this.waitingWorker = worker;
        this.renderVersion();
        if (typeof app !== 'undefined' && app.showToast) {
            app.showToast('A new version is ready.', 'info', { label: 'Update now', onClick: () => this.applyUpdate() });
        }
    },

    applyUpdate() {
        const worker = this.waitingWorker || (this.reg && this.reg.waiting);
        if (!worker) { window.location.reload(); return; }
        if (typeof app !== 'undefined' && app.showToast) app.showToast('Updating…', 'info');
        worker.postMessage({ type: 'SKIP_WAITING' });
        // If the worker does not hand over within a few seconds, reload anyway.
        setTimeout(() => { if (!this.reloading) { this.reloading = true; window.location.reload(); } }, 4000);
    },

    silentUpdateCheck() {
        if (!this.reg || !navigator.onLine) return;
        this.reg.update().catch(() => {});
    },

    askVersion() {
        const sw = navigator.serviceWorker.controller;
        if (!sw || !window.MessageChannel) { this.renderVersion(); return; }
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
            const data = event.data || {};
            if (data.version) { this.version = data.version; this.renderVersion(); }
        };
        try { sw.postMessage({ type: 'GET_VERSION' }, [channel.port2]); } catch (e) { this.renderVersion(); }
    },

    renderVersion() {
        const el = document.getElementById('swVersion');
        if (!el) return;
        if (!('serviceWorker' in navigator)) { el.textContent = 'Offline cache needs a hosted copy over HTTPS.'; return; }
        const bits = [];
        bits.push(this.version ? 'Cache ' + this.version : 'Cache starting up');
        bits.push(navigator.serviceWorker.controller ? 'offline ready' : 'not cached yet');
        if (this.waitingWorker) bits.push('update waiting');
        el.textContent = bits.join(' · ') + '.';
    },

    async checkUpdate() {
        if (!('serviceWorker' in navigator)) { app.showToast('Updates need a hosted copy over HTTPS', 'warning'); return; }
        if (this.waitingWorker) { this.applyUpdate(); return; }

        const reg = this.reg || await navigator.serviceWorker.getRegistration();
        if (!reg) { app.showToast('Not installed yet', 'info'); return; }
        this.reg = reg;

        app.showToast('Checking for an update…', 'info');
        try {
            await reg.update();
            await new Promise(r => setTimeout(r, 1200));
            if (this.waitingWorker || reg.waiting) { this.onUpdateReady(this.waitingWorker || reg.waiting); return; }
            this.askVersion();
            app.showToast('You are on the latest version' + (this.version ? ' (' + this.version + ')' : ''), 'success');
        } catch (e) {
            app.showToast('Could not reach the server', 'error');
        }
    },

    // Last resort when a phone is stuck on an old build: wipe every cache and
    // re-fetch from the server. Tasks live in local storage and are untouched.
    clearCache() {
        if (!confirm('Clear the offline cache and reload?\n\nYour entries stay on this device.')) return;
        const done = () => window.location.reload(true);
        const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
        if (sw && window.MessageChannel) {
            const channel = new MessageChannel();
            channel.port1.onmessage = done;
            try { sw.postMessage({ type: 'CLEAR_CACHES' }, [channel.port2]); } catch (e) { done(); }
            setTimeout(done, 3000);
        } else if (window.caches) {
            caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))).then(done).catch(done);
        } else {
            done();
        }
    }
};
pwa.init();
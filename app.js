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
    BASE_TOMBSTONES_KEY: 'pureEnergyTombstones',
    get TOMBSTONES_KEY() { return `${this.BASE_TOMBSTONES_KEY}_${app.currentUser}`; },
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

// Must match <meta name="btw-build"> in index.html and CACHE_VERSION in sw.js.
const APP_BUILD = '78';

// If an old cached index.html is paired with this app.js (or vice versa),
// wipe the offline cache and reload ONCE so both come from the same deploy.
(function guardBuildMismatch() {
    try {
        const meta = document.querySelector('meta[name="btw-build"]');
        const pageBuild = meta ? meta.getAttribute('content') : '';
        if (pageBuild === APP_BUILD) { sessionStorage.removeItem('btwBuildFix'); return; }
        if (sessionStorage.getItem('btwBuildFix') === APP_BUILD) return;   // already tried — don't loop
        sessionStorage.setItem('btwBuildFix', APP_BUILD);
        const reload = () => window.location.reload();
        const wipe = window.caches ? caches.keys().then(ks => Promise.all(ks.map(k => caches.delete(k)))) : Promise.resolve();
        wipe.then(() => navigator.serviceWorker && navigator.serviceWorker.getRegistration
            ? navigator.serviceWorker.getRegistration().then(r => r && r.update()).catch(() => {}) : null)
            .then(reload, reload);
        setTimeout(reload, 2500);
    } catch (e) {}
})();

const app = {
    currentUser: null,
    tasks: [], lists: {}, currentTab: 'Dashboard',
    editingId: null, editingListKey: null, sortCol: 'dateLogged', sortAsc: false,
    engineInterval: null,
    audioCtx: null, audioUnlocked: false,

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

    // Value for a single-quoted JS string INSIDE a double-quoted inline handler
    // (onclick="app.x('...')"). escAttr() is not enough there: the browser
    // decodes &#39; back to ' before the script runs, so a quote still breaks
    // out of the string. Every character that can end the string or the
    // attribute is written as a \uXXXX escape instead.
    jsArg(str) {
        return String(str === undefined || str === null ? '' : str)
            .replace(/[\\'"<>&`\n\r\u2028\u2029]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
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

    /* ---------- DATE & TIME ENGINE ----------
       Every date-only value ("2026-10-02") is turned into a Date anchored at
       12:00 NOON local time, never midnight. Midnight sits right on the edge
       where a Daylight Saving shift or a UTC round-trip pushes it into the
       previous day; noon has 12 hours of headroom either way, so a task can
       never jump back a day. Times are read by one tolerant parser that
       understands 24-hour ("14:30"), 12-hour ("2:30 PM", "2:30pm", "02.30 P.M.")
       and compact ("1430") forms, so an AM/PM time from an import, the sheet
       or another device can no longer turn into NaN. */
    parseYMD(dateStr) {
        const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(dateStr === undefined || dateStr === null ? '' : dateStr).trim());
        if (!m) return null;
        const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
        if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
        const out = new Date(y, mo - 1, d, 12, 0, 0, 0);
        return isNaN(out.getTime()) ? null : out;
    },

    todayNoon(now) {
        const n = now || new Date();
        return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
    },

    addDaysStr(dateStr, days) {
        const d = this.parseYMD(dateStr);
        if (!d) return dateStr;
        d.setDate(d.getDate() + days);
        return this.getLocalDateStr(d);
    },

    // Returns minutes after midnight (0–1439), or `fallback` if unreadable.
    parseTimeToMinutes(value, fallback) {
        if (value === undefined || value === null) return fallback;
        let s = String(value).trim().toUpperCase();
        if (!s) return fallback;
        const iso = /T(\d{2}):(\d{2})/.exec(s);
        if (iso) s = iso[1] + ':' + iso[2];
        s = s.replace(/A\.?\s?M\.?/, 'AM').replace(/P\.?\s?M\.?/, 'PM').replace(/\s+/g, ' ');

        let h, m, mer = null;
        let x = /^(\d{1,2})(?:[:.](\d{1,2}))?(?:[:.]\d{1,2})?\s*(AM|PM)?$/.exec(s);
        if (x) { h = Number(x[1]); m = x[2] === undefined ? 0 : Number(x[2]); mer = x[3] || null; }
        else {
            x = /^(\d{3,4})\s*(AM|PM)?$/.exec(s);
            if (!x) return fallback;
            const raw = x[1].padStart(4, '0');
            h = Number(raw.slice(0, 2)); m = Number(raw.slice(2)); mer = x[2] || null;
        }
        if (!isFinite(h) || !isFinite(m) || m < 0 || m > 59) return fallback;
        if (mer) {
            if (h < 1 || h > 12) return fallback;
            h = (h % 12) + (mer === 'PM' ? 12 : 0);
        } else if (h < 0 || h > 23) {
            return fallback;
        }
        return h * 60 + m;
    },

    // Any readable time → "HH:MM" (what <input type="time"> needs), else ''.
    normalizeTime(value) {
        const mins = this.parseTimeToMinutes(value, -1);
        if (mins < 0) return '';
        return String(Math.floor(mins / 60)).padStart(2, '0') + ':' + String(mins % 60).padStart(2, '0');
    },

    formatDateStr(dateStr, opts) {
        if (!dateStr) return '-';
        const d = this.parseYMD(dateStr);
        if (!d) return this.sanitize(String(dateStr));
        return d.toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
    },

    formatTimeStr(timeStr) {
        if (!timeStr) return '';
        const mins = this.parseTimeToMinutes(timeStr, -1);
        if (mins < 0) return '';
        const h24 = Math.floor(mins / 60);
        const mm = String(mins % 60).padStart(2, '0');
        return `${h24 % 12 || 12}:${mm} ${h24 >= 12 ? 'PM' : 'AM'}`;
    },

    // Real moments in time (not date-only), so these keep the actual clock
    // time — an entry with no time counts as due at 11:59:59 PM that day.
    dateTimeFrom(dateStr, timeStr) {
        const d = this.parseYMD(dateStr);
        if (!d) return null;
        const mins = timeStr ? this.parseTimeToMinutes(timeStr, -1) : -1;
        if (mins < 0) d.setHours(23, 59, 59, 0);
        else d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
        return d;
    },

    getTaskDueDateTime(t) {
        if (!t || !t.dueDate) return null;
        return this.dateTimeFrom(t.dueDate, t.dueTime);
    },

    getTaskDeadlineDateTime(t) {
        if (!t || !t.deadlineDate) return null;
        return this.dateTimeFrom(t.deadlineDate, t.deadlineTime);
    },

    // Brings one task's stored shape up to date without touching updatedAt:
    // 12-hour times become "HH:MM", and Key Points always end up as a list
    // of { key, value } — whatever older builds or imports left behind.
    normalizeTaskShape(t) {
        if (!t || typeof t !== 'object') return t;
        ['dueTime', 'deadlineTime'].forEach(f => {
            if (t[f]) { const n = this.normalizeTime(t[f]); if (n) t[f] = n; }
        });
        if (Object.prototype.hasOwnProperty.call(t, 'keyPoints')) t.keyPoints = this.normalizeKeyPoints(t.keyPoints);
        return t;
    },

    normalizeKeyPoints(kp) {
        if (kp === undefined || kp === null || kp === '') return [];
        if (typeof kp === 'string') {
            try { return this.normalizeKeyPoints(JSON.parse(kp)); } catch (e) { return [{ key: 'Note', value: kp }]; }
        }
        if (Array.isArray(kp)) {
            return kp.map(p => {
                if (p && typeof p === 'object') return { key: String(p.key === undefined || p.key === null ? '' : p.key), value: String(p.value === undefined || p.value === null ? '' : p.value) };
                return { key: '', value: String(p) };
            }).filter(p => p.key || p.value);
        }
        if (typeof kp === 'object') {
            return Object.keys(kp).map(k => ({ key: k, value: String(kp[k] === undefined || kp[k] === null ? '' : kp[k]) }));
        }
        return [];
    },

    /* ---------- AUTH & 5 GLASS THEMES ---------- */
    checkAuthOnStart() {
        this.currentUser = localStorage.getItem('currentUser') || 'default';
        localStorage.setItem('currentUser', this.currentUser);
        this.applyTheme();
        if (typeof security !== 'undefined') {
            try { security.init(); } catch (e) { console.error('Security init failed', e); document.body.classList.remove('is-locked', 'is-shielded'); }
        }

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

    // Security token the Apps Script checks on every call (Script Property
    // AUTH_TOKEN). Set it in Config → Cloud Sync → Connection; falls back to
    // the script's own default so an untouched setup keeps working.
    authToken() { return ''; },   // the script no longer uses a token

    // fetch() with a time limit: a dropped connection can no longer leave
    // "Fetching…" / "Loading…" spinning forever.
    fetchT(url, opts, ms) {
        const ctrl = window.AbortController ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), ms || 30000) : null;
        return fetch(url, Object.assign({}, opts || {}, ctrl ? { signal: ctrl.signal } : {}))
            .catch(err => { throw (err && err.name === 'AbortError') ? new Error('Google took too long to answer — try again in a moment.') : err; })
            .finally(() => { if (timer) clearTimeout(timer); });
    },

    // GET helper for the Gmail endpoints.
    cloudGetUrl(params) {
        const SCRIPT_URL = (localStorage.getItem(CONFIG.SYNC_URL_KEY) || '').trim();
        if (!SCRIPT_URL) return '';
        const q = Object.assign({}, params || {});
        return SCRIPT_URL + '?' + Object.keys(q).map(k => encodeURIComponent(k) + '=' + encodeURIComponent(q[k])).join('&');
    },

    cloudRequest(payload) {
        const SCRIPT_URL = (localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim();
        if (!SCRIPT_URL) return Promise.reject(new Error("Cloud URL is not configured (Setup)"));
        const body = Object.assign({}, payload, {
            username: payload.username || this.currentUser
        });
        const ctrl = window.AbortController ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), this.REQUEST_TIMEOUT_MS) : null;
        return fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body),
            signal: ctrl ? ctrl.signal : undefined
        }).then(res => res.text()).then(text => {
            let data;
            try { data = JSON.parse(text); }
            catch (e) {
                // Apps Script sends an HTML page when the deployment is wrong,
                // needs re-authorising, or crashed — say so plainly.
                const err = new Error(this.explainHtmlReply(text));
                err.kind = 'config';
                throw err;
            }
            if (data && data.serverTime) this.noteServerTime(Number(data.serverTime));
            if (data && data.status === 'error' && /unauthori[sz]ed/i.test(data.message || '')) {
                data.message = 'The deployed Apps Script still checks a token — paste the latest Code.gs (no token) and deploy a New version.';
            }
            if (data && data.scriptVersion) this.serverVersion = String(data.scriptVersion);
            return data;
        }).catch(err => {
            if (err && err.name === 'AbortError') throw new Error('The sheet took too long to answer — will retry.');
            if (err && err.name === 'TypeError' && /fetch/i.test(err.message || '')) {
                const e2 = new Error(navigator.onLine ? 'Could not reach script.google.com (network or blocked by a browser shield/extension).' : 'You are offline — changes are saved on this device.');
                throw e2;
            }
            throw err;
        }).finally(() => { if (timer) clearTimeout(timer); });
    },

    REQUEST_TIMEOUT_MS: 45000,

    // Turns Google's HTML error page into a plain, specific instruction.
    explainHtmlReply(html) {
        const t = String(html || '');
        const title = ((/<title[^>]*>([^<]*)<\/title>/i.exec(t) || [])[1] || '').trim();
        // Judge the visible words only (no markup / scripts), so a stray "500"
        // or "busy" inside the page's code can't decide the diagnosis.
        const text = t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500);
        const low = (title + ' ' + text).toLowerCase();
        // Most specific first: a sign-in or permission page must never be
        // mistaken for a temporary "busy" page.
        if (/accounts\.google\.com|sign in|servicelogin/.test(low) || /accounts\.google\.com|servicelogin/i.test(t))
            return 'Google asked for a sign-in — in Apps Script set Deploy → Manage deployments → Edit → Who has access: Anyone.';
        if (/authori[sz]ation required|needs? permission|access denied|\b403\b/.test(low))
            return 'The script needs your permission again — open Apps Script, press Run on any function and approve.';
        if (/too many times|quota|rate limit|\b429\b/.test(low))
            return 'Google is rate-limiting the script for a while — retrying automatically, more slowly.';
        // "Sorry, unable to open the file at this time" is Google's generic
        // BUSY page — it shows up for a minute or two and goes away. It does
        // not mean the URL is wrong (that same URL synced moments earlier).
        if (/unable to open the file at this time|try again|temporar|\bbusy\b|\b50[023]\b/.test(low))
            return 'Google Apps Script was busy for a moment (temporary) — retrying automatically.';
        return 'Google returned a temporary error page' + (title ? ' ("' + title + '")' : '') + ' — retrying automatically.';
    },
    /* ---------- SYNC HEALTH ----------
       Last success / last error are kept so a silent failure is visible:
       hover the status pill, or open Config → Cloud Sync. */
    noteSyncResult(ok, message) {
        const now = Date.now();
        let h = {};
        try { h = JSON.parse(localStorage.getItem('pureEnergySyncHealth') || '{}') || {}; } catch (e) {}
        if (ok) {
            h.lastOk = now; h.lastError = ''; h.fails = 0; h.failingSince = 0; h.notified = false;
            this.syncPaused = ''; this.syncBackoffUntil = 0;
        } else {
            // Sync NEVER pauses itself any more. Google's busy page and other
            // hiccups are temporary, so every failure just waits a little
            // longer (15 s → 30 s → 1 min … max 5 min) and tries again.
            h.lastFail = now; h.lastError = String(message || 'Unknown error'); h.fails = (Number(h.fails) || 0) + 1;
            if (!h.failingSince) h.failingSince = now;
            this.syncPaused = '';
            this.syncBackoffUntil = now + Math.min(300000, 15000 * Math.pow(2, Math.max(0, h.fails - 1)));
        }
        try { localStorage.setItem('pureEnergySyncHealth', JSON.stringify(h)); } catch (e) {}
        const pill = document.getElementById('saveStatus');
        if (pill) pill.title = ok ? 'Last synced ' + new Date(now).toLocaleString('en-IN') : 'Sync problem: ' + h.lastError;
        // One quiet notice only if sync has been failing for 30+ minutes —
        // short outages fix themselves and aren't worth interrupting you.
        if (!ok && !h.notified && now - h.failingSince >= 30 * 60000 && h.fails >= 5) {
            h.notified = true;
            try { localStorage.setItem('pureEnergySyncHealth', JSON.stringify(h)); } catch (e) {}
            this.showToast('Cloud sync has not worked for 30 min — your entries are safe on this device. Still retrying.', 'warning',
                { label: 'Details', onClick: () => { this.switchTab('Config'); this.showCfgPanel('cfgCloudSync'); } });
        }
        this.renderSyncHealth();
    },

    renderSyncHealth() {
        const box = document.getElementById('syncHealth');
        if (!box) return;
        let h = {};
        try { h = JSON.parse(localStorage.getItem('pureEnergySyncHealth') || '{}') || {}; } catch (e) {}
        const fmt = (ts) => ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'never';
        const pending = ((this._tomb || { pending: [] }).pending || []).length;
        const live = this.tasks.filter(t => !t.deleted).length;
        const skew = Math.round((this.clockOffset || 0) / 1000);
        box.classList.toggle('warn', !!h.fails);
        box.innerHTML =
            '<b>On this device:</b> ' + live + ' entries (' + this.tasks.filter(t => t.deleted).length + ' in Bin)' +
            '<br><b>Last successful sync:</b> ' + fmt(h.lastOk) +
            (pending ? ' · <b>' + pending + '</b> deletion(s) waiting to upload' : '') +
            (Math.abs(skew) >= 30 ? '<br><b>Clock:</b> this device is ' + Math.abs(skew) + ' s ' + (skew > 0 ? 'behind' : 'ahead of') + ' the sheet (corrected automatically)' : '') +
            (h.fails ? '<br><span style="color:var(--amber-ink);"><b>Retrying automatically</b> — ' + h.fails + ' attempt(s) missed since ' + fmt(h.failingSince) + '. Nothing is lost; entries are kept on this device until the sheet answers.</span>' : '') +
            (this.serverVersion ? '<br><b>Apps Script build:</b> ' + this.sanitize(this.serverVersion) + (Number(this.serverVersion) < 70 ? ' (older — paste the latest Code.gs and deploy a New version)' : ' ✓') : '') +
            (h.lastError ? '<br><span style="color:var(--label-2);"><b>Last message from Google</b> (' + fmt(h.lastFail) + '): ' + this.sanitize(h.lastError) + '</span>' : '');
    },

    /* Device clocks drift (a PC a few minutes slow is common). Every edit is
       stamped with updatedAt and the newest stamp wins, so a slow clock made
       that device's fresh edits look OLDER than the sheet copy and they were
       thrown away. Stamps now use the sheet server's clock. */
    clockOffset: Number(localStorage.getItem('pureEnergyClockOffset')) || 0,

    noteServerTime(serverTs) {
        if (!serverTs || !isFinite(serverTs)) return;
        const off = serverTs - Date.now();
        // smooth it a little; ignore silly values
        if (Math.abs(off) > 7 * 86400000) return;
        this.clockOffset = Math.round(this.clockOffset ? (this.clockOffset * 0.5 + off * 0.5) : off);
        try { localStorage.setItem('pureEnergyClockOffset', String(this.clockOffset)); } catch (e) {}
    },

    stamp() {
        // Always strictly increasing on this device, so two quick edits
        // never share a stamp.
        const t = Date.now() + (this.clockOffset || 0);
        this._lastStamp = Math.max(t, (this._lastStamp || 0) + 1);
        return this._lastStamp;
    },

    // A status that means no work has happened on this entry yet — never
    // worth a Daily Activity Report line by itself. Matched loosely so it
    // still works whatever this profile's exact status list says.
    isUnstartedStatus(status) {
        return /not\s*(yet\s*)?start/i.test(String(status || '').trim());
    },

    // A small per-entry diary of real status moves (date + new status), so
    // the report knows what you worked on each day without depending on
    // any network request having got through.
    noteWork(task, status) {
        if (!task) return;
        const d = this.getLocalDateStr(new Date());
        const log = Array.isArray(task.workLog) ? task.workLog.slice(-19) : [];
        log.push({ d: d, s: String(status || '') });
        task.workLog = log;
    },

    workedOn(task, date) {
        return Array.isArray(task.workLog) && task.workLog.some(w => w && w.d === date);
    },

    isPaymentEntry(t) {
        if (t.narration && (t.narration.typeName || t.narration.text)) return true;
        return /domestic\s*payments?|urgent\s*payments?/i.test(t.category || '');
    },

    DAR_PAYMENT_INTRO: [
        'Modified the respective party ledgers in Tally by passing the necessary payment entries to accurately record the payment initiation.',
        'Prepared payment files after verifying beneficiary details (name, account number, IFSC), transaction dates, and payment purposes. Verified party Statements of Account (SOA) prior to payment to avoid reconciliation discrepancies and ensure accurate vendor tracking.'
    ],

    paymentIntroLines() {
        const l = this.lists && Array.isArray(this.lists.darPaymentIntro) ? this.lists.darPaymentIntro : null;
        return (l || this.DAR_PAYMENT_INTRO).map(x => String(x || '').trim()).filter(Boolean);
    },

    renderPaymentIntroEditor() {
        const a = document.getElementById('darIntro1'), b = document.getElementById('darIntro2');
        if (!a || !b) return;
        const l = this.paymentIntroLines();
        a.value = l[0] || ''; b.value = l[1] || '';
    },

    savePaymentIntro(reset) {
        const a = document.getElementById('darIntro1'), b = document.getElementById('darIntro2');
        this.lists.darPaymentIntro = reset ? this.DAR_PAYMENT_INTRO.slice() : [a.value, b.value].map(x => String(x || '').trim());
        this.listsUpdatedAt = this.stamp();
        localStorage.setItem(CONFIG.LISTS_TS_KEY, String(this.listsUpdatedAt));
        if (this.saveLists) this.saveLists(); else this.saveData();
        this.renderPaymentIntroEditor();
        this.showToast(reset ? 'Payment lines reset to default.' : 'Payment lines saved — used in every report.', 'success');
    },

    /* ================= DAILY ACTIVITY REPORT ENGINE =================
       Built on THIS device, straight from your entries — not from a
       network log that could drop items. Every entry completed on the date
       with "Done + DAR" is listed, one line each, numbered and counted, so
       nothing can go missing. Payments use "Payee Name: narration" (no mail
       chain). */
    collectReportData(date) {
        const live = this.tasks.filter(t => t && !t.deleted && !t.purged);
        const completed = live.filter(t => t.status === 'Completed' && t.completedDate === date);
        const inReport = completed.filter(t => t.darInclude !== false);
        const excluded = completed.length - inReport.length;
        const payments = inReport.filter(t => this.isPaymentEntry(t));
        const others = inReport.filter(t => !this.isPaymentEntry(t));
        const followed = live.filter(t => t.status !== 'Completed' && this.workedOn(t, date) && t.darInclude !== false);
        const byTime = (a, b) => String(a.dueTime || '99').localeCompare(String(b.dueTime || '99')) || String(a.description || '').localeCompare(String(b.description || ''));
        return { payments: payments.sort(byTime), others: others.sort(byTime), followed: followed.sort(byTime), excluded: excluded };
    },

    // Takes the mail chain (as typed, or with the vendor already cut out of
    // it, as the Tally narration stores it) out of a line.
    withoutMail(text, t) {
        let s = String(text || '');
        const mail = String((t && t.mailChain) || '').trim();
        if (!mail) return s;
        const variants = [mail, this.stripPayeeFromMail(mail, this.payeeFromMail(mail)), this.stripPayeeFromMail(mail, this.taskPayee(t))]
            .filter(v => v && v.length > 3).sort((a, b) => b.length - a.length);
        variants.forEach(v => { s = s.split(v).join(' '); });
        return s.replace(/\s+/g, ' ').trim();
    },

    reportLine(t) {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        if (this.isPaymentEntry(t)) {
            // "Vendor Name: <narration without mail chain>"
            const n = t.narration || {};
            const nr = (this.lists.narrationTypes || []).find(x => x.name === n.typeName || (n.typeId && x.id === n.typeId));
            let body = '';
            if (nr) {
                body = this.buildNarrationText(nr, n.percent, n.docNo, n.purpose, '', n.fieldsValues, this.narrationSubText(t));
            } else if (n.reportText) {
                body = n.reportText;
            } else if (n.text) {
                body = this.withoutMail(n.text, t);
            } else {
                body = t.description;
            }
            const fromNarration = !!(nr || n.reportText || n.text);
            body = clean(this.withoutMail(body, t));
            const payee = this.taskPayee(t);
            if (payee) {
                // already "Vendor: …" → take the prefix off, it's added back below
                if (body.toLowerCase().indexOf(payee.toLowerCase() + ':') === 0) body = clean(body.slice(payee.length + 1));
                // the vendor leads the line — drop it (and a "Vendor Name:" label) from inside the narration
                if (fromNarration) body = clean(body.replace(new RegExp('\\s*(?:(?:vendor|payee|party)\\s*(?:name)?\\s*:+)?\\s*' + payee.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*[,;]?', 'i'), ' '));
            }
            return payee ? payee + ': ' + body : body;
        }
        // every other task: the description, redesigned with whatever was
        // written in Notes (what was actually done / the outcome), so the
        // report line says the real work, not just the task title.
        return this.reportTaskWithNotes(t);
    },

    // Turns the Notes into clean report sentences: drops the "[1 Oct 2026]"
    // stamps that Past Due remarks add, duplicate lines, and lines that just
    // repeat the task title. Then reads "Title: what was done."
    notesForReport(t) {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const key = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const title = key(t.description);
        const seen = new Set();
        const out = [];
        String(t.notes || '').split(/\r?\n+/).forEach(raw => {
            let l = clean(raw)
                .replace(/^\[[^\]]{3,40}\]\s*/, '')          // [date] stamp
                .replace(/^(?:[-*•>]+|\d+[.)])\s*/, '')        // bullets / numbering
                .replace(/^(?:notes?|remarks?)\s*[:\-–]\s*/i, '');
            if (t.mailChain && String(t.mailChain).trim()) l = clean(l.split(String(t.mailChain).trim()).join(''));
            const k = key(l);
            if (!k || k === title || seen.has(k)) return;
            seen.add(k);
            l = l.charAt(0).toUpperCase() + l.slice(1);
            if (!/[.!?]$/.test(l)) l += '.';
            out.push(l);
        });
        return out;
    },

    reportTaskWithNotes(t) {
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const desc = clean(t.description).replace(/[.:;,\s]+$/, '');
        const notes = this.notesForReport(t);
        if (!notes.length) {
            // No Notes today: word it the way the same task was written in
            // an uploaded past report, if there is one.
            const past = this.pastLineFor(t, this._reportDate);
            if (past) { this._pastHits = (this._pastHits || 0) + 1; return past; }
            return desc;
        }
        if (!desc) return notes.join(' ');
        // Notes that already restate the task in full replace the title.
        const joined = notes.join(' ');
        if (joined.toLowerCase().indexOf(desc.toLowerCase()) === 0) return joined;
        return desc + ': ' + joined;
    },

    // One model drives both the on-screen text and the Excel file, so they
    // always match. Duplicate lines (ignoring case, spacing, punctuation)
    // are removed across all sections and counted.
    buildReportModel(date, inputs) {
        inputs = inputs || {};
        this._reportDate = date;
        this._pastHits = 0;
        const d = this.collectReportData(date);
        const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
        const key = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        // seen: line key -> section it was kept in; every removed duplicate
        // is listed (for the "Duplicates Removed" sheet in the Excel file).
        const seen = new Map();
        const dupeList = [];
        const keep = (line, sec) => {
            const k = key(line); if (!k) return false;
            if (seen.has(k)) { dupeList.push({ line: clean(line), section: sec, keptIn: seen.get(k) }); return false; }
            seen.set(k, sec); return true;
        };

        const payRows = [];
        d.payments.forEach(t => {
            const line = this.reportLine(t);
            // Every payment is its own transaction — four payments to the
            // same vendor are four lines, even when the narration reads the
            // same. Payments are never dropped as duplicates; the line is
            // only remembered so the same text elsewhere isn't repeated.
            const k = key(line);
            if (!k) return;
            if (!seen.has(k)) seen.set(k, 'Payments');
            const vendor = this.taskPayee(t);
            const body = vendor && line.indexOf(vendor + ': ') === 0 ? line.slice(vendor.length + 2) : line;
            payRows.push({ line: line, cols: [vendor || '—', body, t.category || ''], t: t });
        });
        const descRows = (list, sec) => {
            const out = [];
            list.forEach(t => { const line = this.reportLine(t); if (keep(line, sec)) out.push({ line: line, cols: [line, t.category || ''], t: t }); });
            return out;
        };
        const otherRows = descRows(d.others, 'Other work completed');
        const followRows = descRows(d.followed, 'Followed up / in progress');
        const fixRows = [];
        (inputs.fixed || []).filter(Boolean).forEach(f => { if (keep(f, 'Routine daily activities')) fixRows.push({ line: clean(f), cols: [clean(f)] }); });
        const genRows = [];
        (inputs.general || []).filter(g => g && g.activity).forEach(g => {
            const line = clean(g.activity) + (g.details ? ' — ' + clean(g.details) : '');
            if (keep(line, 'Other activities')) genRows.push({ line: line, cols: [line] });
        });

        return {
            date: date, dupes: dupeList.length, dupeList: dupeList, data: d,
            sections: [
                // Other work completed first, then Domestic / Urgent payments.
                { key: 'oth', title: 'Other work completed', head: ['Work done', 'Category'], widths: [30, 80], rows: otherRows },
                { key: 'pay', title: 'Payments', intro: payRows.length ? this.paymentIntroLines() : [], head: ['Vendor Name', 'Narration', 'Category'], widths: [30, 80, 20], rows: payRows },
                { key: 'fol', title: 'Followed up / in progress', head: ['Work done', 'Category'], widths: [30, 80], rows: followRows },
                { key: 'fix', title: 'Routine daily activities', head: ['Activity'], widths: [30], rows: fixRows },
                { key: 'gen', title: 'Other activities', head: ['Activity'], widths: [30], rows: genRows }
            ]
        };
    },

    // Plain text: headings, "* " bullets (no serial numbers), other work
    // completed first, then payments with the two standard lines, no mail
    // chains anywhere.
    buildDailyReportText(date, inputs) {
        const m = this.buildReportModel(date, inputs);
        const title = this.formatDateStr(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const out = ['Daily Activity Report — ' + title];
        let any = false;
        m.sections.forEach(s => {
            if (!s.rows.length) return;
            any = true;
            out.push('');
            out.push(s.title + (s.key === 'pay' ? ' (' + s.rows.length + ')' : ''));
            if (s.intro && s.intro.length) {
                s.intro.forEach((l, i) => { if (i) out.push(''); out.push('* ' + l); });
                out.push('');
            }
            // One blank line between every task; payment lines stay tight
            // here (plain text has no half line) — the on-screen view,
            // the copied report and the Excel file give them a half line.
            s.rows.forEach((r, i) => { if (i && s.key !== 'pay') out.push(''); out.push('* ' + r.line); });
        });
        if (!any) { out.push(''); out.push('No completed or updated entries for this date.'); }
        const cnt = (k) => (m.sections.find(s => s.key === k) || { rows: [] }).rows.length;
        const data = Object.assign({}, m.data, {
            payments: m.data.payments.slice(0, cnt('pay')), others: m.data.others.slice(0, cnt('oth')),
            followed: m.data.followed.slice(0, cnt('fol')), dupes: m.dupes, pastHits: this._pastHits || 0,
            bullets: m.sections.reduce((a, s) => a + s.rows.length + (s.intro ? s.intro.length : 0), 0)
        });
        this._lastModel = m;
        return { text: out.join('\n'), data: data };
    },

    generateDailyReport() {
        const dateEl = document.getElementById('dailyReportDate');
        const date = dateEl.value || this.getLocalDateStr(new Date());
        const out = document.getElementById('dailyReportOutput');
        const actions = document.getElementById('dailyReportActions');
        const info = document.getElementById('dailyReportInfo');

        const show = (inputs, note) => {
            const r = this.buildDailyReportText(date, inputs);
            out.style.display = 'block';
            this.renderReportOutput(out, r.text);
            actions.style.display = 'grid';
            this._lastReport = { date: date, text: r.text, data: r.data };
            if (info) {
                info.style.display = 'block';
                info.innerHTML = '<b>' + r.data.payments.length + '</b> payments · <b>' + r.data.others.length + '</b> other completed · <b>' + r.data.followed.length + '</b> followed up' +
                    (r.data.pastHits ? ' · <b>' + r.data.pastHits + '</b> worded from your past reports (check dates / amounts)' : '') +
                    (r.data.excluded ? ' · ' + r.data.excluded + ' marked "Done" (not in report)' : '') + (r.data.dupes ? ' · ' + r.data.dupes + ' duplicate' + (r.data.dupes === 1 ? '' : 's') + ' removed' : '') + (note ? '<br>' + note : '');
            }
            return r;
        };

        // 1) instant, complete report from this device
        show({}, 'Adding routine & other activities from the sheet…');
        // 2) add the standing daily activities + manually logged activities
        const url = (localStorage.getItem(CONFIG.SYNC_URL_KEY) || '').trim();
        if (!url) { show({}, ''); return; }
        this.cloudRequest({ action: 'reportInputs', date: date })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'no inputs');
                this._reportInputs = { fixed: data.fixed || [], general: data.general || [] };
                show(this._reportInputs, 'Writing it in your style with AI…');
                this.rewriteDailyReportWithAI(true);
            })
            .catch(() => { this._reportInputs = {}; show({}, 'Routine / other activities could not be loaded right now — showing the complete standard report.'); });
    },

    // Optional: Gemini rewrites the SAME report in your own style. The result
    // is checked — if a single entry went missing, it's rejected and the
    // complete report stays.
    rewriteDailyReportWithAI(auto) {
        const rep = this._lastReport;
        const out = document.getElementById('dailyReportOutput');
        const info = document.getElementById('dailyReportInfo');
        if (!rep) { this.showToast('Generate the report first.', 'warning'); return; }
        const btn = document.getElementById('darAiBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Writing with AI…'; }
        const m = this._lastModel;
        const pay = m ? (m.sections.find(s => s.key === 'pay') || { rows: [] }).rows : [];
        // Payment lines must come back exactly; others may be reworded.
        const mustPay = pay.map(r => r.line);
        const mails = this.tasks.map(t => String(t.mailChain || '').trim()).filter(x => x.length > 6);
        const note = (txt) => { if (info) info.innerHTML = info.innerHTML.replace(/<br>.*$/, '') + '<br>' + txt; };
        this.cloudRequest({ action: 'generateDailyReport', date: rep.date, draft: rep.text, itemCount: rep.data.bullets || 0, style: 'v2' })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || 'AI rewrite failed');
                let text = String(data.report || '').replace(/^\s*\d+[.)]\s+/gm, '* ').replace(/^\s*[-•]\s+/gm, '* ').trim();
                const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ');
                const nt = norm(text);
                const missing = mustPay.filter(l => nt.indexOf(norm(l)) === -1);
                const bullets = (text.match(/^\* /gm) || []).length;
                const leaked = mails.filter(x => nt.indexOf(norm(x)) !== -1);
                if (missing.length || bullets < (rep.data.bullets || 0) || leaked.length) {
                    note('AI version was not used (it ' + (missing.length ? 'changed ' + missing.length + ' payment line(s)' : bullets < rep.data.bullets ? 'dropped items' : 'added a mail chain') + ') — showing the complete standard report.');
                    if (!auto) this.showToast('AI version rejected — kept the complete report.', 'warning');
                    return;
                }
                this.renderReportOutput(out, text);
                rep.aiText = text;
                note('✨ AI-written — every payment line and item checked present.');
                this.showToast('Report ready (AI-written).', 'success');
            })
            .catch(err => {
                note('AI not available right now (' + this.sanitize((err && err.message) || 'error') + ') — showing the complete standard report.');
                if (!auto) this.showToast(err.message || 'AI rewrite failed — the complete report is still shown.', 'error');
            })
            .finally(() => { if (btn) { btn.disabled = false; btn.textContent = '✨ Rewrite again with AI'; } });
    },

    // What actually goes into a report line for this task: the Tally
    // Narration if one was generated (it's already the clearest, most
    // complete description of what was done) — but WITHOUT the Mail Chain
    // / mail subject baked into it, since that's meant for Tally, not the
    // report — otherwise whatever is in Notes (which also picks up any
    // remark typed in the Past Due Alert), otherwise the fallback given.
    reportDetailsFor(task, fallback) {
        if (task && task.narration) {
            const rebuilt = this.narrationFor(task, 'report');
            if (rebuilt) return rebuilt;
            if (task.narration.text) return task.narration.text;          // already includes the mail chain
            if (task.narration.reportText) return task.narration.reportText + (task.mailChain ? ' ' + task.mailChain : '');
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
        // The Daily Activity Report is now built on this device from the
        // entries themselves, so this extra call per completion is no longer
        // needed — it only competed with sync for the script's lock.
        return Promise.resolve();
        // eslint-disable-next-line no-unreachable
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

    // Report text -> HTML with the house spacing: a full line between
    // tasks, a half line between Domestic / Urgent payment lines.
    reportTextToHtml(text) {
        const esc = (x) => this.sanitize(x);
        const titles = ['other work completed', 'payments', 'followed up', 'routine daily activities', 'other activities'];
        let inPay = false, prevBullet = false, blank = false;
        const html = [];
        String(text || '').split('\n').forEach((raw, i) => {
            const l = raw.trim();
            if (!l) { blank = true; return; }      // spacing comes from the margins below
            const wasBlank = blank; blank = false;
            if (l.indexOf('* ') === 0) {
                // payment lines that follow each other directly: half a line
                const gap = !prevBullet ? 0 : (inPay && !wasBlank) ? 0.5 : 1;
                html.push('<div style="margin-top:' + gap + 'em;padding-left:1.1em;text-indent:-1.1em;">•&nbsp; ' + esc(l.slice(2)) + '</div>');
                prevBullet = true;
                return;
            }
            const low = l.toLowerCase();
            if (titles.some(x => low.indexOf(x) === 0)) inPay = low.indexOf('payments') === 0;
            html.push('<div style="margin-top:' + (i ? 1 : 0) + 'em;font-weight:' + (i ? 700 : 800) + ';">' + esc(l) + '</div>');
            prevBullet = false;
        });
        return html.join('');
    },

    renderReportOutput(out, text) {
        out._reportText = text;
        out.style.whiteSpace = 'normal';
        out.innerHTML = this.reportTextToHtml(text);
    },

    copyDailyReport() {
        const out = document.getElementById('dailyReportOutput');
        const text = out ? (out._reportText || out.textContent) : '';
        if (!text) return;
        // Rich copy keeps the full-line / half-line spacing when pasted into
        // Outlook or Gmail; plain text is the fallback.
        const html = '<div style="font-family:Calibri,Arial,sans-serif;font-size:11pt;">' + this.reportTextToHtml(text) + '</div>';
        let p;
        try {
            p = navigator.clipboard.write([new ClipboardItem({
                'text/html': new Blob([html], { type: 'text/html' }),
                'text/plain': new Blob([text], { type: 'text/plain' })
            })]);
        } catch (e) { p = Promise.reject(e); }
        p.catch(() => navigator.clipboard.writeText(text))
            .then(() => this.showToast('Report copied.', 'success'))
            .catch(() => this.showToast('Could not copy — select the text manually.', 'warning'));
    },

    // Formatted Excel: title, summary, then one styled table per section
    // (bold coloured headers, borders, wrapped text, set column widths,
    // zebra rows, numbered), ready to print on A4 landscape.
    exportDailyReportExcel() {
        const m = this._lastModel;
        if (!m) { this.showToast('Generate a report first.', 'warning'); return; }
        if (!window.ExcelJS) this.showToast('Preparing Excel…', 'info');
        this.loadExcelJs()
            .then(() => this.writeReportXlsx(m))
            .catch(err => this.showToast(err && err.noLib ? 'Could not load the Excel library — check your connection and try again.' : 'Excel export failed: ' + (err && err.message || err), 'error'));
    },

    // Loads ExcelJS once (shared by export and past-report import).
    loadExcelJs() {
        if (window.ExcelJS) return Promise.resolve();
        if (this._excelJsLoading) return this._excelJsLoading;
        this._excelJsLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js';
            s.onload = () => resolve();
            s.onerror = () => { this._excelJsLoading = null; s.remove(); const e = new Error('Excel library not loaded'); e.noLib = true; reject(e); };
            document.head.appendChild(s);
        });
        return this._excelJsLoading;
    },

    /* ---------- PAST REPORTS ----------
       Old Daily Activity Reports (Excel in the house template or any
       layout, or plain text) are read line by line and kept on this
       device. When the same task comes up again without Notes, its report
       line is worded the way it was written before — with month names
       moved forward by the gap between the old report and this one. */
    pastReportsKey() { return 'pureEnergyPastReports_' + (this.currentUser || 'default'); },

    loadPastReports() {
        let d = null;
        try { d = JSON.parse(localStorage.getItem(this.pastReportsKey()) || 'null'); } catch (e) { d = null; }
        this.pastReports = d && Array.isArray(d.lines) ? { files: Array.isArray(d.files) ? d.files : [], lines: d.lines } : { files: [], lines: [] };
        this._pastIndex = null;
        return this.pastReports;
    },

    savePastReports() {
        try { localStorage.setItem(this.pastReportsKey(), JSON.stringify(this.pastReports)); }
        catch (e) { this.showToast('Not enough space on this device to keep all past report lines.', 'error'); }
        this._pastIndex = null;
        this.renderPastReports();
    },

    PAST_MONTHS: ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'],

    // "Thursday, 1 October 2026", "01-10-2026", "2026-10-01" → "2026-10-01"
    pastDateFrom(text) {
        const s = String(text || '');
        let m = s.match(/(20\d\d)-(\d{1,2})-(\d{1,2})/);
        if (m) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
        m = s.match(/\b(\d{1,2})[-\/.](\d{1,2})[-\/.](20\d\d)\b/);
        if (m) return m[3] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
        m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\s*,?\s*(20\d\d)\b/);
        if (m) {
            const mi = this.PAST_MONTHS.findIndex(x => x.indexOf(m[2].toLowerCase().slice(0, 3)) === 0);
            if (mi >= 0) return m[3] + '-' + String(mi + 1).padStart(2, '0') + '-' + String(m[1]).padStart(2, '0');
        }
        return '';
    },

    pastNorm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); },

    pastTokens(s) {
        const stop = { the: 1, and: 1, of: 1, for: 1, to: 1, a: 1, an: 1, in: 1, on: 1, with: 1, is: 1, by: 1, at: 1, from: 1, dr: 1, mr: 1, ms: 1 };
        return this.pastNorm(s).split(' ').filter(w => w && !stop[w] && !/^\d+$/.test(w));
    },

    // Report lines out of a list of rows (each row = its cell texts).
    pastLinesFromRows(rows) {
        const intro = new Set(this.paymentIntroLines().map(x => this.pastNorm(x)));
        const skip = /^(dear\b|please find|regards|thanks|thank you|summary\b|count\b|daily activity report|generated\b|duplicates? removed|other work completed|payments?\b|followed up|routine daily|other activities|vendor name\b|narration\b|work done\b)/i;
        const bulletRx = /^\s*(?:[*•\-–]|\d+[.)])\s*/;
        const bulletOnly = (c) => /^\s*(?:[*•\-–]|\d+[.)])\s*$/.test(c);
        const hasBullets = rows.some(r => r.length && bulletOnly(r[0]) || (r[0] && bulletRx.test(r[0]) && r[0].replace(bulletRx, '').length > 3));
        const out = [];
        rows.forEach(r => {
            let cells = r.map(c => String(c == null ? '' : c).replace(/\s+/g, ' ').trim()).filter(Boolean);
            // merged cells repeat the same text — keep one
            cells = cells.filter((c, i) => i === 0 || c !== cells[i - 1]);
            if (!cells.length) return;
            let bulleted = false;
            if (bulletOnly(cells[0])) { cells = cells.slice(1); bulleted = true; }
            else if (bulletRx.test(cells[0])) { cells[0] = cells[0].replace(bulletRx, ''); bulleted = true; }
            if (hasBullets && !bulleted) return;
            if (!cells.length) return;
            let line = cells.length >= 2 && cells[0].length <= 80 && !/[:.]$/.test(cells[0]) ? cells[0] + ': ' + cells.slice(1).join(' ') : cells.join(' ');
            line = line.replace(/\s+/g, ' ').trim();
            if (line.length < 12 || skip.test(line) || intro.has(this.pastNorm(line))) return;
            if (/^\d+(\.\d+)?$/.test(line)) return;
            out.push(line);
        });
        return out;
    },

    // File picker handler: .xlsx / .txt / .csv / .md, several at once.
    importPastReports(input) {
        const files = Array.from((input && input.files) || []);
        if (!files.length) return;
        if (!this.pastReports) this.loadPastReports();
        const box = document.getElementById('pastReportsStatus');
        if (box) box.textContent = 'Reading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…';
        const readOne = (f) => {
            const name = f.name || 'report';
            if (/\.xlsx$/i.test(name)) {
                return this.loadExcelJs().then(() => f.arrayBuffer()).then(buf => {
                    const wb = new ExcelJS.Workbook();
                    return wb.xlsx.load(buf).then(() => {
                        const ws = wb.worksheets.find(w => !/duplicate/i.test(w.name)) || wb.worksheets[0];
                        const rows = [];
                        let dateText = '';
                        ws.eachRow({ includeEmpty: false }, row => {
                            const cells = [];
                            row.eachCell({ includeEmpty: false }, c => {
                                let v = c.value;
                                if (v && typeof v === 'object') v = v.richText ? v.richText.map(x => x.text).join('') : (v.text || v.result || (v instanceof Date ? v.toISOString().slice(0, 10) : ''));
                                cells.push(String(v == null ? '' : v));
                            });
                            if (!dateText && row.number <= 4) dateText = cells.join(' ');
                            rows.push(cells);
                        });
                        return { name, date: this.pastDateFrom(name) || this.pastDateFrom(dateText), lines: this.pastLinesFromRows(rows) };
                    });
                });
            }
            if (/\.(txt|csv|md|text)$/i.test(name) || /^text\//.test(f.type || '')) {
                return f.text().then(txt => {
                    const rows = txt.split(/\r?\n/).map(l => /\.csv$/i.test(name) ? l.split(',') : [l]);
                    return { name, date: this.pastDateFrom(name) || this.pastDateFrom(txt.slice(0, 200)), lines: this.pastLinesFromRows(rows) };
                });
            }
            return Promise.resolve({ name, date: '', lines: [], unsupported: true });
        };
        const results = [];
        files.reduce((p, f) => p.then(() => readOne(f).then(r => results.push(r), err => results.push({ name: f.name, lines: [], error: (err && err.message) || 'could not read' }))), Promise.resolve())
            .then(() => {
                const have = new Set(this.pastReports.lines.map(l => this.pastNorm(l.text)));
                let added = 0;
                results.forEach(r => {
                    if (!r.lines.length) return;
                    r.lines.forEach(text => {
                        const k = this.pastNorm(text);
                        if (have.has(k)) return;
                        have.add(k);
                        const ci = text.indexOf(':');
                        const title = ci > 2 && ci <= 140 ? text.slice(0, ci) : text;
                        this.pastReports.lines.push({ title: title.trim(), text: text, date: r.date || '' });
                        added++;
                    });
                    this.pastReports.files = this.pastReports.files.filter(x => x.name !== r.name).concat([{ name: r.name, date: r.date || '', lines: r.lines.length }]);
                });
                this.savePastReports();
                const bad = results.filter(r => r.unsupported || r.error);
                const msg = added + ' new line' + (added === 1 ? '' : 's') + ' learned from ' + results.filter(r => r.lines.length).length + ' file(s)' +
                    (bad.length ? ' · skipped: ' + bad.map(r => r.name + (r.unsupported ? ' (use .xlsx or .txt)' : ' (' + r.error + ')')).join(', ') : '');
                this.showToast(msg, added ? 'success' : 'warning');
                if (input) input.value = '';
            });
    },

    clearPastReports() {
        if (!confirm('Forget all lines learned from past reports on this device?')) return;
        this.pastReports = { files: [], lines: [] };
        this.savePastReports();
        this.showToast('Past report lines cleared.', 'success');
    },

    renderPastReports() {
        const box = document.getElementById('pastReportsStatus');
        if (!box) return;
        if (!this.pastReports) this.loadPastReports();
        const p = this.pastReports;
        box.textContent = p.lines.length
            ? p.lines.length + ' lines learned from ' + p.files.length + ' report' + (p.files.length === 1 ? '' : 's') + ': ' +
              p.files.slice(-6).map(f => f.name + (f.date ? ' (' + this.formatDateStr(f.date) + ')' : '')).join(', ') + (p.files.length > 6 ? ', …' : '')
            : '';
    },

    // Moves "September 2026" (or "September") forward by the months between
    // the old report and this one.
    shiftPastMonths(text, fromDate, toDate) {
        const a = this.parseYMD(fromDate), b = this.parseYMD(toDate);
        if (!a || !b) return text;
        const delta = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
        if (!delta) return text;
        const names = this.PAST_MONTHS;
        return String(text).replace(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\b(\s*[-']?\s*(20\d\d))?/gi, (all, mon, ysp, yr) => {
            const mi = names.indexOf(mon.toLowerCase());
            let y = yr ? Number(yr) : null;
            let nm = mi + delta;
            const yAdd = Math.floor(nm / 12);
            nm = ((nm % 12) + 12) % 12;
            const cap = names[nm].charAt(0).toUpperCase() + names[nm].slice(1);
            return y ? cap + ' ' + (y + yAdd) : cap;
        });
    },

    // Best past line for this task: same title (ignoring case/punctuation),
    // else a close match on the words of the title. Newest report wins.
    pastLineFor(t, reportDate) {
        if (!this.pastReports) this.loadPastReports();
        const lines = this.pastReports.lines;
        if (!lines.length || !t || !t.description) return '';
        if (!this._pastIndex) {
            const idx = new Map();
            lines.forEach(l => { const k = this.pastNorm(l.title); if (k) (idx.get(k) || idx.set(k, []).get(k)).push(l); });
            this._pastIndex = idx;
        }
        const newest = (arr) => arr.slice().sort((x, y) => String(y.date || '').localeCompare(String(x.date || '')))[0];
        let hit = null;
        const exact = this._pastIndex.get(this.pastNorm(t.description));
        if (exact && exact.length) hit = newest(exact);
        if (!hit) {
            const want = new Set(this.pastTokens(t.description));
            if (want.size < 2) return '';
            let best = null, bestScore = 0;
            lines.forEach(l => {
                const got = this.pastTokens(l.title);
                if (got.length < 2) return;
                let common = 0; got.forEach(w => { if (want.has(w)) common++; });
                const score = common / (want.size + got.length - common);
                if (score > bestScore || (score === bestScore && best && String(l.date) > String(best.date))) { best = l; bestScore = score; }
            });
            if (best && bestScore >= 0.7) hit = best;
        }
        if (!hit) return '';
        return hit.date && reportDate ? this.shiftPastMonths(hit.text, hit.date, reportDate) : hit.text;
    },

    writeReportXlsx(m) {
        // If the on-screen report is AI-written, use its wording for the
        // non-payment sections (payment lines are identical either way).
        const ai = this._lastReport && this._lastReport.aiText;
        if (ai) {
            const titles = m.sections.map(s => s.title.toLowerCase());
            const got = {}; let cur = null;
            ai.split('\n').forEach(l => {
                const t = l.trim(); if (!t) return;
                if (t.indexOf('* ') === 0) { if (cur) (got[cur] = got[cur] || []).push(t.slice(2).trim()); return; }
                const i = titles.findIndex(x => t.toLowerCase().indexOf(x) === 0);
                cur = i >= 0 ? m.sections[i].key : null;
            });
            m = Object.assign({}, m, { sections: m.sections.map(s => {
                const lines = got[s.key];
                if (s.key === 'pay' || !lines || lines.length !== s.rows.length) return s;
                return Object.assign({}, s, { rows: s.rows.map((r, i) => Object.assign({}, r, { cols: [lines[i]].concat(r.cols.slice(1)) })) });
            }) });
        }
        const wb = new ExcelJS.Workbook();
        wb.creator = 'Banking Work Tracker';
        // Layout follows the house template (Daily_Activity_Report_*.xlsx):
        // A "*" | B 30 | C 47.36; title bar, summary, "Dear Sir" greeting,
        // then the lines with no section headings. Text rows are 23 high
        // (taller only when the text wraps), a blank line between tasks and
        // a half line between Domestic / Urgent payment lines.
        const ws = wb.addWorksheet('Daily Report', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
            views: [{ showGridLines: false }]
        });
        const COLS = 3;
        const W = [4, 30, 47.36328125];
        ws.columns = W.map(w => ({ width: w }));
        const ROW_H = 23, LINE_H = 14.5, HALF_H = 7.25;

        const thin = { style: 'thin', color: { argb: 'FFB8C2D6' } };
        const border = { top: thin, left: thin, bottom: thin, right: thin };
        const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb } });
        const white = fill('FFFFFFFF');
        const black = { size: 11, color: { argb: 'FF000000' } };
        const title = this.formatDateStr(m.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        // Rough wrapped-line count for a cell of the given column width.
        const lines = (txt, width) => String(txt || '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / Math.max(1, width * 1.15))), 0);
        const fitH = (n) => Math.max(ROW_H, n * LINE_H + 1);

        let r = ws.addRow(['Daily Activity Report']);
        ws.mergeCells(r.number, 1, r.number, COLS);
        r.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }; r.height = 28;
        r.getCell(1).fill = fill('FF1F4E79'); r.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        r = ws.addRow([title]);
        ws.mergeCells(r.number, 1, r.number, COLS);
        r.font = { size: 11, italic: true, color: { argb: 'FF1F4E79' } }; r.height = ROW_H;
        r.getCell(1).alignment = { vertical: 'middle' };

        // summary
        ws.addRow([]);
        const sumHead = ws.addRow(['', 'Summary', 'Count']);
        sumHead.height = ROW_H;
        [2, 3].forEach(c => { const cell = sumHead.getCell(c); cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = fill('FF2E75B6'); cell.border = border; cell.alignment = { vertical: 'middle' }; });
        m.sections.forEach(s => {
            if (!s.rows.length) return;
            const row = ws.addRow(['', s.title, s.rows.length]);
            row.height = ROW_H;
            [2, 3].forEach(c => { row.getCell(c).border = border; row.getCell(c).alignment = { vertical: 'middle' }; });
            row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        });
        if (m.dupes) {
            const row = ws.addRow(['', 'Duplicates removed', m.dupes]);
            row.height = ROW_H;
            [2, 3].forEach(c => { row.getCell(c).border = border; row.getCell(c).font = { italic: true, color: { argb: 'FF7F7F7F' } }; row.getCell(c).alignment = { vertical: 'middle' }; });
            row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
        }

        // body (white panel)
        ws.addRow([]);
        const bodyRow = (vals, h) => {
            const x = ws.addRow(vals);
            for (let c = 1; c <= COLS; c++) x.getCell(c).fill = white;
            x.height = h;
            return x;
        };
        const spacer = (h) => bodyRow([], h);
        const fullLine = (txt) => {
            const x = bodyRow(['*', txt], fitH(lines(txt, W[1] + W[2])));
            ws.mergeCells(x.number, 2, x.number, COLS);
            x.getCell(1).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
            x.getCell(2).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
            x.getCell(2).font = black;
        };
        const greet = bodyRow(['', 'Dear Sir,\n\nPlease find below the summary of work completed.'], 42);
        ws.mergeCells(greet.number, 2, greet.number, COLS);
        greet.getCell(2).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        greet.getCell(2).font = black;

        m.sections.forEach(s => {
            if (!s.rows.length) return;
            spacer(LINE_H);
            (s.intro || []).forEach((line, li) => { if (li) spacer(LINE_H); fullLine(line); });
            if (s.intro && s.intro.length) spacer(LINE_H);
            s.rows.forEach((row, i) => {
                if (s.key === 'pay') {
                    if (i) spacer(HALF_H);
                    const v = row.cols[0], n = row.cols[1];
                    const x = bodyRow(['*', v, n], fitH(Math.max(lines(v, W[1]), lines(n, W[2]))));
                    x.getCell(1).alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
                    [2, 3].forEach(c => { x.getCell(c).alignment = { vertical: 'top', horizontal: 'left', wrapText: true }; x.getCell(c).font = black; });
                } else {
                    if (i) spacer(LINE_H);
                    fullLine(row.cols[0]);
                }
            });
        });

        ws.addRow([]);
        const foot = ws.addRow(['Generated ' + new Date().toLocaleString('en-IN')]);
        ws.mergeCells(foot.number, 1, foot.number, COLS);
        foot.font = { size: 9, italic: true, color: { argb: 'FF7F7F7F' } }; foot.height = 12;

        // Second sheet: every duplicate line that was left out, and where
        // the copy that stayed in the report is.
        const ds = wb.addWorksheet('Duplicates Removed', {
            pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
            views: [{ showGridLines: false }]
        });
        ds.columns = [{ width: 6 }, { width: 26 }, { width: 70 }, { width: 26 }];
        let d = ds.addRow(['Duplicates Removed — ' + title]);
        ds.mergeCells(d.number, 1, d.number, 4);
        d.font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } }; d.height = 28;
        d.getCell(1).fill = fill('FF1F4E79'); d.getCell(1).alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
        ds.addRow([]);
        const dh = ds.addRow(['#', 'Removed from', 'Duplicate line', 'Kept in']);
        dh.height = ROW_H;
        for (let c = 1; c <= 4; c++) { const cell = dh.getCell(c); cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; cell.fill = fill('FF2E75B6'); cell.border = border; cell.alignment = { vertical: 'middle', horizontal: c === 1 ? 'center' : 'left' }; }
        const dl = m.dupeList || [];
        if (!dl.length) {
            const x = ds.addRow(['', 'No duplicates were removed for this date.']);
            ds.mergeCells(x.number, 2, x.number, 4);
            x.height = ROW_H; x.getCell(2).font = { italic: true, color: { argb: 'FF7F7F7F' } }; x.getCell(2).alignment = { vertical: 'middle' };
        }
        dl.forEach((x, i) => {
            const row = ds.addRow([i + 1, x.section, x.line, x.keptIn]);
            row.height = fitH(lines(x.line, 70));
            for (let c = 1; c <= 4; c++) { const cell = row.getCell(c); cell.border = border; cell.alignment = { vertical: 'top', horizontal: c === 1 ? 'center' : 'left', wrapText: true }; }
        });

        return wb.xlsx.writeBuffer().then(buf => {
            const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'Daily_Activity_Report_' + m.date + '.xlsx';
            document.body.appendChild(a); a.click();
            setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
            this.showToast('Excel report downloaded.', 'success');
        });
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
                        <button type="button" class="btn-icon bad" onclick="app.deleteReportSample('${this.jsArg(s.id)}')" title="Delete sample">${this.SVGS.bin}</button>
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
        this.bindCfgScrollSpy();
    },

    // Desktop: the jump bar stays pinned on top while scrolling, sections
    // pass cleanly under it, and the highlighted item follows the section
    // you're reading as you scroll up or down.
    bindCfgScrollSpy() {
        const box = document.getElementById('configTab');
        const nav = document.getElementById('cfgNav');
        if (!box || !nav) return;
        const measure = () => box.style.setProperty('--cfg-nav-h', nav.offsetHeight + 'px');
        measure();
        if (this._cfgSpyBound) return;
        this._cfgSpyBound = true;
        let ticking = false;
        const spy = () => {
            ticking = false;
            if (document.documentElement.getAttribute('data-shell') !== 'desktop') return;
            if (Date.now() < (this._cfgJumpUntil || 0)) return;
            const line = nav.getBoundingClientRect().bottom + 16;
            let best = null, bestTop = -Infinity;
            document.querySelectorAll('#cfgPanels .cfg-panel').forEach(el => {
                const r = el.getBoundingClientRect();
                if (r.height && r.top <= line && r.top > bestTop) { bestTop = r.top; best = el; }
            });
            if (!best) best = document.querySelector('#cfgPanels .cfg-panel');
            if (!best) return;
            const slug = best.dataset.cfgPanel;
            nav.querySelectorAll('.cfg-nav-item').forEach(el => el.classList.toggle('active', el.dataset.cfgPanel === slug));
        };
        box.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(spy); } }, { passive: true });
        window.addEventListener('resize', measure, { passive: true });
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
        // Desktop shows every section at once — jump to the one asked for.
        if (document.documentElement.getAttribute('data-shell') === 'desktop') {
            const el = document.querySelector('.cfg-panel[data-cfg-panel="' + slug + '"]');
            if (el) {
                this._cfgJumpUntil = Date.now() + 900;
                const nav = document.getElementById('cfgNav'), box = document.getElementById('configTab');
                if (nav && box) box.style.setProperty('--cfg-nav-h', nav.offsetHeight + 'px');
                el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                el.classList.add('flash');
                setTimeout(() => el.classList.remove('flash'), 1200);
            }
        }
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
                            <input type="checkbox" ${f.active ? 'checked' : ''} onchange="app.toggleFixedTask('${this.jsArg(f.id)}', this.checked)" style="width:16px; height:16px; accent-color:var(--accent); flex:0 0 auto;">
                            <span style="font-size:0.86rem; color:var(--label); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.sanitize(f.description)}</span>
                        </label>
                        <button type="button" class="btn-icon bad" onclick="app.deleteFixedTask('${this.jsArg(f.id)}')" title="Delete">${this.SVGS.bin}</button>
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
        this.loadPastReports();
        this.renderPastReports();
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

        if (typeof rt !== 'undefined') rt.init();
        if (this.tasks.length === 0 && !(typeof rt !== 'undefined' && rt.active)) this.pullTasksFromCloud(false);

        this.engineInterval = setInterval(() => { this.processEngine(); }, 5000);
        setInterval(() => { this.updateHeader(); this.updateStats(); this.renderNudgeSettings(); this.checkHolidayAlerts(new Date()); }, 60000);
        setInterval(() => { this.syncCycle(); }, this.SYNC_EVERY_MS);
        setTimeout(() => this.syncCycle(), 2500);
        setTimeout(() => this.checkHolidayAlerts(new Date()), 3000);

        const unlock = () => this.initAudio();
        document.addEventListener('click', unlock, { passive: true });
        document.addEventListener('keydown', unlock, { passive: true });
        document.addEventListener('touchstart', unlock, { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) { this.reapExpiredSirens(); this.initAudio(); this.processEngine(); this.syncCycle(); }
        });
        window.addEventListener('online', () => this.syncCycle());

        // Two windows of the app on one device (installed app + browser tab)
        // share storage. Each used to keep its own in-memory list and write
        // it back whole — the last window to save silently erased the other
        // window's changes. Now every window merges what the others save.
        window.addEventListener('storage', (e) => {
            if (!e.key || e.newValue === null) return;
            if (e.key === CONFIG.STORAGE_KEY) {
                let incoming = [];
                try { incoming = JSON.parse(e.newValue) || []; } catch (err) { return; }
                if (!Array.isArray(incoming)) return;
                this.loadTombstones();
                const res = this.mergeTasks(incoming);
                this.tasks = this.tasks.filter(t => !this.isTombstoned(t.id));
                if (res.added || res.updated) {
                    try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.tasks)); } catch (err) {}
                    this.updateStats();
                    if (!this.editorOpen()) { this.renderTable(); if (this.currentTab === 'Dashboard') this.renderDashboard(); }
                }
            } else if (e.key === CONFIG.TOMBSTONES_KEY) {
                this.loadTombstones();
                const before = this.tasks.length;
                this.tasks = this.tasks.filter(t => !this.isTombstoned(t.id));
                if (this.tasks.length !== before) { this.updateStats(); if (!this.editorOpen()) this.renderTable(); }
            } else if (e.key === CONFIG.LISTS_KEY || e.key === CONFIG.HOLIDAYS_KEY) {
                if (e.key === CONFIG.LISTS_KEY) this.loadLists(); else this.loadHolidays();
                if (!this.editorOpen()) { this.populateDropdowns(); this.renderTable(); }
            }
        });

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

        const pill = document.getElementById('saveStatus');
        if (pill) {
            pill.style.cursor = 'pointer';
            pill.addEventListener('click', () => {
                if (typeof rt !== 'undefined' && rt.active && rt.state === 'signin') { rt.signIn(); return; }
                this.switchTab('Config'); this.showCfgPanel('cfgCloudSync'); this.renderSyncHealth();
            });
        }
    },

    handleDelegatedClick(e) {
        const el = e.target.closest('[data-action]');
        if (!el) { this.handleRecordClick(e); return; }
        const action = el.dataset.action;
        const id = el.dataset.id;

        switch (action) {
            case 'edit': this.openTaskModal(id); break;
            case 'done': this.tryCompleteTask(id, true); break;
            case 'done-nodar': this.tryCompleteTask(id, false); break;
            case 'reopen': this.reopenTask(id); break;
            case 'bin': this.softDelete(id); break;
            case 'restore': this.restoreTask(id); break;
            case 'hard-delete': this.hardDelete(id); break;
            case 'copy-mail': {
                const t = this.findTask(id);
                if (t) this.copyToClipboard(t.mailChain || '', el);
                // On a Tasks card, the copy button also opens the entry for editing.
                if (t && el.closest('#taskCardList')) setTimeout(() => this.openTaskModal(id), 250);
                break;
            }
            case 'copy-narration': {
                const t = this.findTask(id);
                if (t) this.copyToClipboard(this.narrationFor(t, 'tally'), el);
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

    /* ---------- DELETION TOMBSTONES ----------
       A permanently deleted entry leaves a tombstone (id + time) instead of
       a "purged" copy. Tombstones are sent to the sheet as deletedIds, the
       sheet keeps them for 30 days (max 400) and hands the list back on
       every pull, so every other phone / workstation drops the entry too —
       and none of them can push their stale copy back up (no more zombie
       tasks resurrecting on a second device). */
    TOMBSTONE_DAYS: 30,
    _tomb: null,

    loadTombstones() {
        let t = null;
        try { t = JSON.parse(localStorage.getItem(CONFIG.TOMBSTONES_KEY) || 'null'); } catch (e) {}
        if (!t || typeof t !== 'object') t = {};
        if (!t.ids || typeof t.ids !== 'object') t.ids = {};
        if (!Array.isArray(t.pending)) t.pending = [];
        const cutoff = Date.now() - this.TOMBSTONE_DAYS * 86400000;
        Object.keys(t.ids).forEach(id => { if ((Number(t.ids[id]) || 0) < cutoff && t.pending.indexOf(id) === -1) delete t.ids[id]; });
        this._tomb = t;
        return t;
    },

    saveTombstones() {
        try { localStorage.setItem(CONFIG.TOMBSTONES_KEY, JSON.stringify(this._tomb || { ids: {}, pending: [] })); } catch (e) {}
    },

    isTombstoned(id) {
        const t = this._tomb || this.loadTombstones();
        return Object.prototype.hasOwnProperty.call(t.ids, String(id));
    },

    // Removes the entry from this device and queues its deletion for the sheet.
    tombstone(id) {
        const key = String(id);
        const t = this._tomb || this.loadTombstones();
        t.ids[key] = Date.now();
        if (t.pending.indexOf(key) === -1) t.pending.push(key);
        if (!Array.isArray(t.rtPending)) t.rtPending = [];
        if (t.rtPending.indexOf(key) === -1) t.rtPending.push(key);
        this.tasks = this.tasks.filter(x => String(x.id) !== key);
        this.saveTombstones();
    },

    // Deletions reported by the sheet (made on any device).
    applyRemoteTombstones(ids) {
        if (!Array.isArray(ids) || !ids.length) return 0;
        const t = this._tomb || this.loadTombstones();
        const set = new Set(ids.map(String));
        let removed = 0;
        set.forEach(id => { if (!t.ids[id]) t.ids[id] = Date.now(); });
        t.pending = t.pending.filter(id => !set.has(id));   // server has it — no need to resend
        const before = this.tasks.length;
        this.tasks = this.tasks.filter(x => !set.has(String(x.id)));
        removed = before - this.tasks.length;
        this.saveTombstones();
        return removed;
    },

    /* ---------- CLOUD SYNC ---------- */
    mergeTasks(remoteTasks) {
        const byId = new Map();
        this.tasks.forEach(t => byId.set(String(t.id), t));
        let added = 0, updated = 0;

        (remoteTasks || []).forEach(r => {
            if (!r || r.id === undefined || r.id === null || r.id === '') return;
            const key = String(r.id);
            if (this.isTombstoned(key)) return;
            if (r.purged) { this.tombstone(key); byId.delete(key); return; }
            this.normalizeTaskShape(r);
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

    restoreFromCloud() {
        if (!confirm("This REPLACES every entry on this device with the cloud copy.\n\nA CSV backup of your current data will be downloaded first.\n\nContinue?")) return;
        this.exportData('csv', true);

        this.cloudRequest({ action: "fetchTasks", since: 0 })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error((data && data.message) || "Failed to fetch cloud copy");
                this.applyRemoteTombstones(data.deletedIds);
                this.tasks = (data.tasks || []).filter(t => t && !t.purged && !this.isTombstoned(t.id)).map(t => {
                    if (!t.id) t.id = this.newId();
                    if (!t.updatedAt) t.updatedAt = 0;
                    return this.normalizeTaskShape(t);
                });
                this.applyRemoteLists(data.lists, data.listsUpdatedAt);
                this.applyRemoteCalendar(data);
                const st = this.syncState();
                st.ack = {}; this.tasks.forEach(t => { st.ack[String(t.id)] = Number(t.updatedAt) || 0; });
                st.cursor = Number(data.serverTime) || 0;
                this.saveSyncState();
                this.userClearedAll = true;
                this.saveData();
                this.userClearedAll = false;
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

    // Holidays, leave days and custom calendars travel as one bundle with
    // one timestamp; the newer side wins, same as the category lists.
    applyRemoteCalendar(data) {
        if (!data || !Array.isArray(data.holidays)) return;
        const ts = Number(data.holidaysUpdatedAt) || 0;
        if (ts <= (Number(this.holidaysUpdatedAt) || 0)) return;
        this.holidays = data.holidays.map(h => Object.assign({ alert: true }, h, { id: h.id || this.newId() }));
        if (Array.isArray(data.leaveDays)) { this.leaveDays = data.leaveDays.slice(); localStorage.setItem(CONFIG.LEAVE_DAYS_KEY, JSON.stringify(this.leaveDays)); }
        if (Array.isArray(data.customCalendars)) { this.customCalendars = data.customCalendars.slice(); localStorage.setItem(CONFIG.CUSTOM_CALENDARS_KEY, JSON.stringify(this.customCalendars)); }
        this.holidaysUpdatedAt = ts;
        localStorage.setItem(CONFIG.HOLIDAYS_TS_KEY, String(ts));
        this.saveHolidays(false);
    },

    bumpCalendarTs() {
        this.holidaysUpdatedAt = Date.now();
        localStorage.setItem(CONFIG.HOLIDAYS_TS_KEY, String(this.holidaysUpdatedAt));
    },

    /* ================= DELTA SYNC ENGINE =================
       The device remembers, per entry, which version the sheet already has
       (ack map) and the server time of its last successful call (cursor).
       Each call uploads ONLY entries edited since then and downloads ONLY
       rows written since then — a few entries, not the whole register.
       First run on a device (cursor 0) does one full download, then
       uploads anything local-only in batches of 100. */
    MAX_PUSH: 100,

    syncState() {
        if (this._sync && this._sync.user === this.currentUser) return this._sync;
        const u = this.currentUser;
        let ack = {};
        try { ack = JSON.parse(localStorage.getItem('pureEnergySyncAck_' + u) || '{}') || {}; } catch (e) {}
        this._sync = {
            user: u, ack: ack,
            cursor: Number(localStorage.getItem('pureEnergySyncCursor_' + u)) || 0,
            listsAck: Number(localStorage.getItem('pureEnergySyncListsAck_' + u)) || 0,
            calAck: Number(localStorage.getItem('pureEnergySyncCalAck_' + u)) || 0
        };
        return this._sync;
    },

    saveSyncState() {
        const st = this.syncState(), u = st.user;
        try {
            localStorage.setItem('pureEnergySyncAck_' + u, JSON.stringify(st.ack));
            localStorage.setItem('pureEnergySyncCursor_' + u, String(st.cursor));
            localStorage.setItem('pureEnergySyncListsAck_' + u, String(st.listsAck));
            localStorage.setItem('pureEnergySyncCalAck_' + u, String(st.calAck));
        } catch (e) {}
    },

    resetSyncState() {
        const st = this.syncState();
        st.ack = {}; st.cursor = 0; st.listsAck = 0; st.calAck = 0;
        this.saveSyncState();
    },

    dirtyTasks() {
        const ack = this.syncState().ack;
        return this.tasks.filter(t => t && t.id && ack[String(t.id)] !== (Number(t.updatedAt) || 0));
    },

    runSync(opts) {
        opts = opts || {};
        const manual = !!opts.manual;
        if (!this.currentUser) return Promise.resolve();
        if ((localStorage.getItem(CONFIG.SYNC_URL_KEY) || '').trim() === '') {
            if (manual) this.showToast('Add your sheet link in Config → Cloud Sync → Connection', 'info');
            return Promise.resolve();
        }
        if (this._syncRunning) { this._syncAgain = true; this._syncAgainManual = this._syncAgainManual || manual; return this._syncRunning; }

        const st = this.syncState();
        const first = !st.cursor;
        const dirty = first ? [] : this.dirtyTasks();
        const batch = dirty.slice(0, this.MAX_PUSH);
        const tomb = this._tomb || this.loadTombstones();
        const pending = tomb.pending.slice();
        const sent = batch.map(t => ({ id: String(t.id), ts: Number(t.updatedAt) || 0 }));

        const payload = { action: 'syncTasks', since: st.cursor, tasks: batch, deletedIds: pending,
            listsUpdatedAt: this.listsUpdatedAt || 0, holidaysUpdatedAt: this.holidaysUpdatedAt || 0 };
        const sendLists = !first && (this.listsUpdatedAt || 0) > st.listsAck;
        const sendCal = !first && (this.holidaysUpdatedAt || 0) > st.calAck;
        if (sendLists) payload.lists = this.lists;
        if (sendCal) { payload.holidays = this.holidays; payload.leaveDays = this.leaveDays || []; payload.customCalendars = this.customCalendars || []; }
        const listsTsSent = this.listsUpdatedAt || 0, calTsSent = this.holidaysUpdatedAt || 0;

        const mark = document.getElementById('appMark');
        const saver = document.getElementById('saveStatus');
        if (mark) mark.classList.add('busy');
        if (saver && (manual || batch.length || first)) saver.innerHTML = '<span class="dot" style="background:var(--blue)"></span> syncing…';
        this.syncInProgress = true;
        let ok = false;
        const gen = this._syncGen = (this._syncGen || 0) + 1;

        this._syncStartedAt = Date.now();
        this._syncRunning = this.cloudRequest(payload).then(data => {
            if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Sync failed');
            ok = true;

            if (pending.length) {
                tomb.pending = tomb.pending.filter(id => pending.indexOf(id) === -1);
                this.saveTombstones();
            }
            const removed = this.applyRemoteTombstones(data.deletedIds);
            const incoming = Array.isArray(data.tasks) ? data.tasks : [];
            const res = this.mergeTasks(incoming);

            // What the sheet now holds, per entry:
            incoming.forEach(r => { if (r && r.id) st.ack[String(r.id)] = Number(r.updatedAt) || 0; });
            const accepted = Array.isArray(data.accepted) ? new Set(data.accepted.map(String)) : null;
            const rejected = new Set((data.rejected || []).map(String));
            sent.forEach(s => { if (accepted ? accepted.has(s.id) : !rejected.has(s.id)) st.ack[s.id] = s.ts; });
            if (data.full) {            // forget acks for entries that no longer exist anywhere
                const live = new Set(this.tasks.map(t => String(t.id)));
                Object.keys(st.ack).forEach(id => { if (!live.has(id)) delete st.ack[id]; });
            }
            if (sendLists) st.listsAck = listsTsSent;
            if (sendCal) st.calAck = calTsSent;
            this.applyRemoteLists(data.lists, data.listsUpdatedAt);
            this.applyRemoteCalendar(data);
            if (first) { st.listsAck = Math.max(st.listsAck, Math.min(this.listsUpdatedAt || 0, Number(data.listsUpdatedAt) || 0)); }
            if (data.serverTime) st.cursor = Number(data.serverTime);
            this.saveSyncState();

            const moved = res.added + res.updated + removed;
            if (moved) {
                this.saveData();
                this.refreshUiWhenIdle();
            }
            this.noteSyncResult(true);
            const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            if (saver) saver.innerHTML = `<span class="dot" style="background:var(--green)"></span> synced ${timeStr}`;

            if (manual) {
                this.showToast(sent.length || moved
                    ? `Synced — sent ${sent.length}, received ${moved}` + (dirty.length > batch.length ? ` (${dirty.length - batch.length} more on the way)` : '')
                    : 'Already up to date', sent.length || moved ? 'success' : 'info');
            } else if (moved && !first) {
                this.showToast(`Updated from another device: ${moved} ${moved === 1 ? 'entry' : 'entries'}`, 'info');
            }
            // More to send? Go again right away — but only for work that a
            // repeat can actually finish. Entries the sheet rejected stay
            // dirty on purpose and are retried by the normal 30 s cycle; and a
            // reply with no serverTime leaves the cursor at 0, which used to
            // look like "first run again" forever (a request every 0.4 s).
            const stillDirty = this.dirtyTasks().some(t => !rejected.has(String(t.id)));
            const listsPending = (this.listsUpdatedAt || 0) > st.listsAck;
            const calPending = (this.holidaysUpdatedAt || 0) > st.calAck;
            if (st.cursor && (first || dirty.length > batch.length || stillDirty || listsPending || calPending)) this._syncAgain = true;
        }).catch(err => {
            console.error('Sync error:', err);
            this._syncAgain = false;
            this.noteSyncResult(false, err && err.message);
            if (saver) saver.innerHTML = '<span class="dot" style="background:var(--amber)"></span> ' + (navigator.onLine ? 'retrying…' : 'offline — saved here');
            if (manual) this.showToast((err && err.message) || 'Sync failed — your entries are safe on this device.', 'error');
        }).then(() => {
            // Only the newest sync may clear the flag: syncCycle() can free a
            // stuck one early, and an old request finishing late must not
            // wipe the flag of the sync that replaced it.
            if (this._syncGen === gen) {
                this.syncInProgress = false;
                if (mark) mark.classList.remove('busy');
                this._syncRunning = null;
            }
            if (ok && this._syncAgain && (this._againRuns || 0) < 5) {
                // At most 5 back-to-back follow-ups; after that the 30 s cycle takes over.
                this._againRuns = (this._againRuns || 0) + 1;
                this._syncAgain = false; this._syncAgainManual = false;
                setTimeout(() => this.runSync({}), 400);
            } else {
                this._againRuns = 0;
                this._syncAgain = false; this._syncAgainManual = false;
            }
        });
        return this._syncRunning;
    },

    // "Pull changes" and "Sync now" — both are the same single call now.
    pullTasksFromCloud(manual = false) {
        if (typeof rt !== 'undefined' && rt.active && rt.ready) {
            // The live listener already has everything; re-attach it to be sure.
            rt.stopListening(); rt.listen(); rt.schedulePush(10);
            if (manual) this.showToast('Realtime sync is live — changes arrive automatically.', 'success');
        }
        return this.runSync({ manual: manual });
    },

    // Called after every local change: waits 1.5 s so a burst of edits
    // goes up as one small call.
    syncToGoogleSheets(manual = false) {
        if (typeof rt !== 'undefined' && rt.active) {
            rt.schedulePush();                 // realtime: goes up within a second
            if (!manual) return Promise.resolve();
        }
        if (manual) return this.runSync({ manual: true });
        clearTimeout(this._pushTimer);
        this._pushTimer = setTimeout(() => {
            if (Date.now() < (this.syncBackoffUntil || 0)) return;   // the cycle will retry
            if (!this.claimSyncLeader()) return;
            this.runSync({});
        }, 1500);
        return Promise.resolve();
    },

    SYNC_EVERY_MS: 30000,
    cycleBusy: false,

    syncCycle(manual = false) {
        if (!this.currentUser) return;
        if ((localStorage.getItem(CONFIG.SYNC_URL_KEY) || '').trim() === '') return;
        if (!manual && document.hidden) return;
        // Realtime on: the Sheet is only a backup copy — refresh it every 5 min.
        if (!manual && typeof rt !== 'undefined' && rt.active) {
            if (Date.now() - (this._lastSheetBackup || 0) < 5 * 60000) return;
            this._lastSheetBackup = Date.now();
        }
        // After failures, wait a little longer each time: 15 s … 5 min.
        if (!manual && Date.now() < (this.syncBackoffUntil || 0)) return;
        // Only ONE window per device talks to the sheet.
        if (!manual && !this.claimSyncLeader()) return;
        // An open editor no longer pauses sync (edits made elsewhere used to
        // stay invisible, and yours stayed un-uploaded, for as long as a form
        // was left open). Only the on-screen refresh waits — see refreshUiWhenIdle().
        // A request stuck for too long (phone slept) must not block forever.
        // (_syncStartedAt is stamped in runSync when a request really starts —
        // stamping it here on every cycle kept a stuck sync "fresh" forever.)
        if (this._syncRunning && Date.now() - (this._syncStartedAt || 0) > this.REQUEST_TIMEOUT_MS + 10000) this._syncRunning = null;
        this.runSync({ manual: manual });
    },

    TAB_ID: Math.random().toString(36).slice(2),
    LEADER_KEY: 'pureEnergySyncLeader',

    claimSyncLeader() {
        const now = Date.now();
        let cur = null;
        try { cur = JSON.parse(localStorage.getItem(this.LEADER_KEY) || 'null'); } catch (e) {}
        if (cur && cur.id !== this.TAB_ID && now - (Number(cur.ts) || 0) < this.SYNC_EVERY_MS * 3) return false;
        try { localStorage.setItem(this.LEADER_KEY, JSON.stringify({ id: this.TAB_ID, ts: now })); } catch (e) {}
        return true;
    },

    // Repaints the lists and tables now, or — while an editor is open, where
    // swapping dropdowns under the user would be wrong — marks them stale so
    // processEngine() repaints a moment after the editor closes.
    refreshUiWhenIdle() {
        if (this.editorOpen()) { this._uiDirty = true; return; }
        this._uiDirty = false;
        this.populateDropdowns();
        this.renderTable();
    },

    flushDeferredUi() {
        if (this._uiDirty && !this.editorOpen()) this.refreshUiWhenIdle();
    },

    EDITOR_MODALS: ['taskModal', 'listManagerModal', 'subCategoryRulesModal', 'narrationRulesModal', 'holidayModal', 'calendarManagerModal'],

    editorOpen() {
        return this.EDITOR_MODALS.some(id => { const m = document.getElementById(id); return m && m.classList.contains('open'); });
    },

    openSyncSetup() {
        document.getElementById('syncUrlInput').value = localStorage.getItem(CONFIG.SYNC_URL_KEY) || '';
        document.getElementById('gmailIndexInput').value = localStorage.getItem(CONFIG.GMAIL_INDEX_KEY) || '0';
        const res = document.getElementById('connTestResult');
        if (res) { res.style.display = 'none'; res.innerHTML = ''; }
        const fb = document.getElementById('fbConfigInput');
        if (fb) fb.value = localStorage.getItem(rt.CFG_KEY) || '';
        if (fb) fb.placeholder = 'Built in: project working-dashboard-655ca — nothing to paste. Only paste here to use a different project.';
        const st = document.getElementById('rtStatus');
        if (st) st.innerHTML = rt.statusHtml();
        document.getElementById('syncSetupModal').classList.add('open');
    },

    // Checks the URL typed in the Connection box WITHOUT saving it.
    testConnection() {
        const out = document.getElementById('connTestResult');
        const btn = document.getElementById('connTestBtn');
        const url = (document.getElementById('syncUrlInput').value || '').trim();
        const show = (ok, html) => { out.className = 'conn-result ' + (ok ? 'ok' : 'bad'); out.innerHTML = html; out.style.display = 'block'; };
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url)) {
            show(false, '<b>URL looks wrong.</b> It must look like https://script.google.com/macros/s/…/exec (copy it from Deploy → Manage deployments).');
            return;
        }
        if (btn) { btn.disabled = true; btn.textContent = 'Testing…'; }
        const ctrl = window.AbortController ? new AbortController() : null;
        const timer = ctrl ? setTimeout(() => ctrl.abort(), 30000) : null;
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'ping' }), signal: ctrl ? ctrl.signal : undefined })
            .then(r => r.text())
            .then(text => {
                let data = null;
                try { data = JSON.parse(text); } catch (e) {}
                if (!data) { show(false, '<b>Google answered, but not with your data.</b><br>' + this.sanitize(this.explainHtmlReply(text)) + '<br>If this keeps happening for more than a few minutes, redeploy the script (Deploy → Manage deployments → ✏ Edit → New version).'); return; }
                if (data.status === 'error' && /unauthori[sz]ed|unknown action: ping/i.test(data.message || '')) {
                    show(false, '<b>Connected ✓ — but the deployed script is an older build.</b><br>Paste the latest Code.gs into Apps Script and deploy a <b>New version</b> (same deployment).');
                    return;
                }
                if (data.status === 'success') {
                    show(true, '<b>Connected ✓</b><br>Your sheet has <b>' + (data.taskCount || 0) + '</b> entries (tab ' + this.sanitize(data.sheet || '') + ').' +
                        (data.scriptVersion && Number(data.scriptVersion) < 70 ? '<br>Script build ' + this.sanitize(String(data.scriptVersion)) + ' — deploy the latest Code.gs as a New version.' : '') +
                        '<br>Tap <b>Save Settings</b> to use this.');
                    return;
                }
                show(false, '<b>Script replied with an error:</b> ' + this.sanitize(data.message || 'unknown'));
            })
            .catch(err => {
                show(false, err && err.name === 'AbortError'
                    ? '<b>No answer in 30 s.</b> Google is busy — try again in a minute.'
                    : '<b>Could not reach script.google.com.</b> Check your internet, or a browser shield/extension blocking it.');
            })
            .finally(() => { if (timer) clearTimeout(timer); if (btn) { btn.disabled = false; btn.textContent = 'Test connection'; } });
    },

    saveRealtimeConfig() {
        const el = document.getElementById('fbConfigInput');
        const text = (el && el.value || '').trim();
        localStorage.removeItem(rt.OFF_KEY);
        if (!text) { localStorage.removeItem(rt.CFG_KEY); rt.init().then(() => { if (rt.auth && !rt.auth.currentUser) rt.signIn(); }); return; }
        const cfg = rt.parseConfig(text);
        if (!cfg) { this.showToast('That doesn\'t look like a Firebase config — it needs apiKey and projectId.', 'error'); return; }
        const changed = localStorage.getItem(rt.CFG_KEY) !== text;
        localStorage.setItem(rt.CFG_KEY, text);
        if (changed && window.firebase && firebase.apps && firebase.apps.length) { this.showToast('Saved — reloading to apply.', 'info'); setTimeout(() => location.reload(), 600); return; }
        rt.init().then(() => { if (rt.auth && !rt.auth.currentUser) rt.signIn(); });
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
        document.getElementById('syncSetupModal').classList.remove('open');
        this.syncPaused = ''; this.syncBackoffUntil = 0;
        this.showToast("Settings saved — syncing", "success");
        this.syncCycle(true);
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

        this.fetchT(this.cloudGetUrl({ action: 'fetchEmails' }), { method: 'GET' })
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
            this.fetchT(this.cloudGetUrl({ action: 'markEmailRead', id: id }), { method: 'GET' })
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
        this.fetchT(this.cloudGetUrl({ action: 'emailBody', id: email.id }), { method: 'GET' })
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
        const perm = ("Notification" in window) ? Notification.permission : 'unsupported';
        if (btn) {
            btn.style.opacity = perm === 'granted' ? '0.6' : '';
            btn.title = perm === 'granted' ? 'Alerts are on' : (perm === 'denied' ? 'Alerts are blocked in your browser settings' : 'Turn on alerts for missed deadlines');
        }
        if (!hint) return;
        if (perm === 'granted') {
            hint.innerHTML = 'Alerts are <b>on</b>. You will get a notification while the app is open or in the background.';
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
    // True once a task's strict deadline has actually passed and it hasn't
    // been acknowledged today. Independent of the due-time reminder.
    isDeadlineCrossed(t, now) {
        const n = now || new Date();
        const dl = this.getTaskDeadlineDateTime(t);
        return !!dl && n >= dl && t.deadlineAckDate !== this.getLocalDateStr(n);
    },

    processEngine() {
        this.flushDeferredUi();
        this.autoSkipDailyOnNonWorking();
        const now = new Date();
        const localTodayStr = this.getLocalDateStr(now);
        const activeOverdue = [];
        const addedIds = new Set();
        const addOnce = (t) => { if (!addedIds.has(String(t.id))) { addedIds.add(String(t.id)); activeOverdue.push(t); } };

        this.tasks.forEach(t => {
            if (t.deleted || t.status === 'Completed') return;

            const snoozeUntil = Number(t.snoozeUntil) || 0;

            // Deadline crossed — a separate, strict alarm (RBI / RTGS cut-off
            // style). It has its own acknowledgement (deadlineAckDate), so
            // silencing the softer due-time reminder earlier in the day does
            // NOT pre-silence it: see isDeadlineCrossed() / alarmAction('ack').
            if (this.isDeadlineCrossed(t, now) && now.getTime() >= snoozeUntil) {
                addOnce(t);
            }

            if (!t.dueDate) return;
            const dueDateTime = this.getTaskDueDateTime(t);
            if (!dueDateTime) return;

            const dueMinsOfDay = t.dueTime ? this.parseTimeToMinutes(t.dueTime, 1439) : 1439;
            const todayAtDueTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(),
                Math.floor(dueMinsOfDay / 60), dueMinsOfDay % 60, 0);

            if (now >= dueDateTime && now >= todayAtDueTime &&
                t.lastAckDate !== localTodayStr && now.getTime() >= snoozeUntil) {
                addOnce(t);
                return;
            }

            // Pre-day heads-up: if the due date itself falls on a holiday,
            // Sunday, or leave day, surface it a day early so there's time
            // to choose "do it today" or "move to the next working day"
            // before it's overdue on a day nothing can actually be done.
            // Asked from the LAST working day before it (Saturday for a
            // Monday holiday too), so it can be preponed or postponed.
            if (t.recurrence !== 'Daily' && t.dueDate > localTodayStr && this.isNonWorkingDay(t.dueDate) &&
                this.prevWorkingDayFrom(t.dueDate) <= localTodayStr &&
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
                    <div id="alarmMutedNote" style="display:none; margin:-4px 0 12px; padding:8px 12px; border-radius:10px; font-size:0.78rem; font-weight:600; color:var(--label-2); background:var(--fill); border:1px solid var(--line);">🔇 Sound auto-muted after 2 minutes to save battery. The alerts below are still open.</div>
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

        if (!this.isSirenActive('alarm')) {
            this.startSiren('alarm', this.SIREN_MAX_MS, () => {
                const note = document.getElementById('alarmMutedNote');
                if (note) note.style.display = 'block';
            });
            const note = document.getElementById('alarmMutedNote');
            if (note) note.style.display = 'none';
        }
    },

    /* ---------- SIREN CONTROLLER ----------
       Every looping alert sound runs through here. Each one is capped by the
       wall clock (not by counting ticks), so even when the OS throttles
       timers under the lock screen, the very next tick after the cap stops
       it. Once nothing is sounding, the AudioContext is suspended so the
       audio hardware can sleep instead of draining the battery. */
    SIREN_MAX_MS: 120000,
    SIREN_EVERY_MS: 1800,
    _sirens: {},

    isSirenActive(owner) { return !!this._sirens[owner]; },

    startSiren(owner, maxMs, onAutoMute) {
        this.stopSiren(owner);
        const rec = { startedAt: Date.now(), maxMs: maxMs || this.SIREN_MAX_MS, onAutoMute: onAutoMute || null };
        const tick = () => {
            if (Date.now() - rec.startedAt >= rec.maxMs) { this.stopSiren(owner, true); return; }
            this.playBeepPair();
        };
        rec.interval = setInterval(tick, this.SIREN_EVERY_MS);
        rec.guard = setTimeout(() => this.stopSiren(owner, true), rec.maxMs + 250);
        this._sirens[owner] = rec;
        this.playBeepPair();
    },

    stopSiren(owner, auto = false) {
        const rec = this._sirens[owner];
        if (!rec) return;
        clearInterval(rec.interval);
        clearTimeout(rec.guard);
        delete this._sirens[owner];
        if (auto && typeof rec.onAutoMute === 'function') { try { rec.onAutoMute(); } catch (e) {} }
        if (!Object.keys(this._sirens).length) {
            if (navigator.vibrate) { try { navigator.vibrate(0); } catch (e) {} }
            setTimeout(() => {
                if (!Object.keys(this._sirens).length && this.audioCtx && this.audioCtx.state === 'running') {
                    this.audioCtx.suspend().catch(() => {});
                }
            }, 1500);
        }
    },

    // Called when the app comes back to the foreground: anything that ran
    // past its cap while timers were frozen is shut off straight away.
    reapExpiredSirens() {
        Object.keys(this._sirens).forEach(owner => {
            const rec = this._sirens[owner];
            if (rec && Date.now() - rec.startedAt >= rec.maxMs) this.stopSiren(owner, true);
        });
    },

    renderAlarmTasks() {
        const container = document.getElementById('alarmTasksContainer');
        if (!container) return;
        container.innerHTML = '';
        const offDue = this.alarmingTasks.filter(t => t.recurrence !== 'Daily' && this.isNonWorkingDay(t.dueDate));
        if (offDue.length > 1) {
            const today = this.getLocalDateStr(new Date());
            const canPre = offDue.some(t => this.prevWorkingDayFrom(t.dueDate) >= today);
            const bar = document.createElement('div');
            bar.style = 'display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:10px 12px; margin-bottom:12px; border-radius:14px; font-size:0.82rem; font-weight:700; color:var(--amber-ink); background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.28);';
            bar.innerHTML = '<span>' + offDue.length + ' tasks fall on ' + this.sanitize(this.nonWorkingLabel(offDue[0].dueDate)) + ' (office closed)</span><span style="display:flex; gap:8px; flex-wrap:wrap;">' +
                (canPre ? '<button type="button" class="btn-row" onclick="app.resolveAllNonWorkingDue(\'prev\')" style="padding:6px 12px; font-size:0.76rem; font-weight:700; color:var(--green-ink); background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.25); border-radius:10px; cursor:pointer;">Prepone all</button>' : '') +
                '<button type="button" class="btn-row go" onclick="app.resolveAllNonWorkingDue(\'next\')" style="padding:6px 12px; font-size:0.76rem; font-weight:700; color:var(--blue-ink); background:rgba(37,99,235,0.1); border:1px solid rgba(37,99,235,0.2); border-radius:10px; cursor:pointer;">Postpone all</button></span>';
            container.appendChild(bar);
        }

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

            const nonWorking = task.recurrence !== 'Daily' && this.isNonWorkingDay(task.dueDate);
            // Prepone target: the last working day before it, never a day
            // already gone (on the holiday itself only Postpone is offered).
            const preDay = nonWorking ? this.prevWorkingDayFrom(task.dueDate) : '';
            const preTo = preDay && preDay >= this.getLocalDateStr(new Date()) ? preDay : '';
            const deadlineCrossed = this.isDeadlineCrossed(task);
            const deadlineBanner = deadlineCrossed ? `
                <div class="alarm-deadline" style="margin: 8px 0; padding: 8px 10px; border-radius: 10px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.78rem; color: var(--red-ink);">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                        <span style="font-weight:700;">⏰ Deadline crossed: ${this.formatDateStr(task.deadlineDate)} at ${task.deadlineTime ? this.formatTimeStr(task.deadlineTime) : '11:59 PM'}</span>
                        <button type="button" class="btn-row" onclick="app.acknowledgeDeadline('${this.jsArg(task.id)}')" style="padding:5px 10px; font-size:0.74rem; font-weight:600; color:var(--label); background:var(--fill); border:1px solid var(--line); border-radius:9px; cursor:pointer;">Acknowledge</button>
                    </div>
                </div>` : '';
            const nonWorkingBanner = nonWorking ? `
                <div class="alarm-nonworking" style="margin: 8px 0; padding: 8px 10px; border-radius: 10px; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.25); font-size: 0.78rem; color: var(--amber-ink);">
                    <div style="font-weight:700; margin-bottom:6px;">Due on ${this.sanitize(this.nonWorkingLabel(task.dueDate))} (${this.formatDateStr(task.dueDate)}) — the office is closed. ${preTo ? 'Prepone or postpone?' : 'Postpone it to the next working day?'}</div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${preTo ? `<button type="button" class="btn-row" onclick="app.resolveNonWorkingDue('${this.jsArg(task.id)}', 'prev')" style="padding:6px 12px; font-size:0.76rem; font-weight:600; color:var(--green-ink); background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.25); border-radius:10px; cursor:pointer;">Prepone to ${this.formatDateStr(preTo)}</button>` : ''}
                        <button type="button" class="btn-row go" onclick="app.resolveNonWorkingDue('${this.jsArg(task.id)}', 'next')" style="padding:6px 12px; font-size:0.76rem; font-weight:600; color:var(--blue-ink); background:rgba(37,99,235,0.1); border:1px solid rgba(37,99,235,0.2); border-radius:10px; cursor:pointer;">Postpone to ${this.formatDateStr(this.nextWorkingDayFrom(task.dueDate))}</button>
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
                    <span class="alarm-field" title="Change this entry's status" style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: var(--input-bg); border: 1px solid var(--line);">
                        <select id="alarmStatus_${idAttr}" onchange="app.changeAlarmStatus('${this.jsArg(task.id)}', this.value)" style="font-size: 0.84rem; font-weight: 600; color: var(--blue-ink); background: transparent; border: none; outline: none; padding: 4px; cursor:pointer;">
                            ${(this.lists.statuses || []).concat(this.lists.statuses.indexOf(task.status) === -1 && task.status ? [task.status] : []).map(st => `<option value="${this.escAttr(st)}"${st === task.status ? ' selected' : ''}>${this.sanitize(st)}</option>`).join('')}
                        </select>
                    </span>
                    <span class="alarm-field" style="display: flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 10px; background: var(--input-bg); border: 1px solid var(--line);">
                        <select id="alarmRec_${idAttr}" onchange="app.changeAlarmRecurrence('${this.jsArg(task.id)}', this.value)" style="font-size: 0.84rem; font-weight: 600; color: var(--violet-ink); background: transparent; border: none; outline: none; padding: 4px; cursor:pointer;">
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
        task.updatedAt = this.stamp();
        this.saveData();
        this.renderTable();
        this.showToast('Recurrence set to ' + (task.recurrence === 'None' ? "doesn't repeat" : task.recurrence), 'success');
    },

    // Status straight from the overdue-alert card. "Completed" goes through
    // the normal Mark done path (sub-category checks, report, recurrence);
    // any other status is saved like the Edit form does, and the remark
    // typed on the card is kept in Notes.
    changeAlarmStatus(taskId, val) {
        const task = this.findTask(taskId);
        if (!task || !val || val === task.status) return;
        if (val === 'Completed') { this.alarmAction('done', taskId); return; }
        const remarkEl = document.getElementById('alarmRemarks_' + taskId);
        const remark = remarkEl ? remarkEl.value.trim() : '';
        if (remark) {
            task.notes = (task.notes ? task.notes + '\n' : '') + '[' + this.formatDateStr(this.getLocalDateStr(new Date())) + '] ' + remark;
            remarkEl.value = '';
        }
        const old = task.status;
        task.status = val;
        task.completedDate = null;
        if (!this.isUnstartedStatus(val)) {
            this.noteWork(task, val);
            this.logTaskActivity(task, 'status-changed', this.reportDetailsFor(task, 'Status changed from "' + (old || '—') + '" to "' + val + '"'));
        }
        task.updatedAt = this.stamp();
        this.saveData();
        this.renderTable();
        this.showToast('Status set to ' + val + '.', 'success');
    },

    acknowledgeDeadline(taskId) {
        const task = this.findTask(taskId);
        if (!task) return;
        task.deadlineAckDate = this.getLocalDateStr(new Date());
        task.updatedAt = this.stamp();
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
        // Applied only once the action is certain to go ahead — an early
        // return (blank snooze minutes, no date, "pick another time") must not
        // leave the remark half-added, or a retry would add it twice.
        const applyRemark = () => {
            if (!remark) return;
            task.notes = (task.notes ? task.notes + '\n' : '') + '[' + this.formatDateStr(this.getLocalDateStr(new Date())) + '] ' + remark;
        };

        if (action === 'done') {
            applyRemark();
            if (!this.subCategoryComplete(task)) {
                this.tryCompleteTask(taskId);
                return;
            }
            this.markComplete(taskId);
        } else if (action === 'ack') {
            // Silences today's due-time reminder only. A deadline that has
            // ALREADY been crossed is on screen too, so it goes with it —
            // but a later cut-off (e.g. 4:30 PM RTGS) stays armed and will
            // still fire when its time comes.
            applyRemark();
            const today = this.getLocalDateStr(new Date());
            const crossedNow = this.isDeadlineCrossed(task);
            task.lastAckDate = today;
            if (crossedNow) task.deadlineAckDate = today;
            task.updatedAt = this.stamp();
            this.saveData(); this.renderTable();
            const laterDeadline = !crossedNow && this.getTaskDeadlineDateTime(task) && this.getTaskDeadlineDateTime(task) > new Date() && task.deadlineDate === today;
            this.showToast(laterDeadline
                ? 'Reminder silenced. The ' + this.formatTimeStr(task.deadlineTime || '23:59') + ' deadline alarm is still armed.'
                : 'Task silenced for today.', 'info');
        } else if (action === 'skip') {
            applyRemark();
            this.skipTask(taskId);
        } else if (action === 'snooze') {
            const input = document.getElementById('snoozeMins_' + taskId);
            const mins = parseInt(input ? input.value : '', 10) || 0;
            if (mins <= 0) { this.showToast("Please enter minutes to snooze.", "warning"); return; }
            applyRemark();
            task.snoozeUntil = Date.now() + (mins * 60000);
            task.updatedAt = this.stamp();
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
                const keepBoth = confirm(
                    '"' + taken.description + '" already holds ' + this.formatTimeStr(taken.dueTime) + '.\n\n' +
                    'OK = Double-book anyway\nCancel = Pick another time' + (free ? ' (next free: ' + this.formatTimeStr(free) + ')' : '')
                );
                if (!keepBoth) {
                    if (free && timeEl) timeEl.value = free;
                    return;
                }
            }
            applyRemark();
            task.dueDate = newDate;
            task.dueTime = this.normalizeTime(newTime);
            task.lastAckDate = null;
            task.snoozeUntil = null;
            task.updatedAt = this.stamp();
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

        this.stopSiren('alarm');
        this.isAlarming = false;

        if (acknowledgeAllRemaining && this.alarmingTasks.length > 0) {
            const localTodayStr = this.getLocalDateStr(new Date());
            this.alarmingTasks.forEach(t => {
                const task = this.findTask(t.id);
                if (!task) return;
                // Only deadlines already crossed are silenced; later cut-offs stay armed.
                if (this.isDeadlineCrossed(task)) task.deadlineAckDate = localTodayStr;
                task.lastAckDate = localTodayStr;
                task.updatedAt = this.stamp();
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

    // Shared by nudges and time slots. Reads 24-hour AND 12-hour AM/PM
    // times; anything unreadable returns the fallback instead of NaN.
    nudgeToMinutes(hhmm, fallback) {
        const mins = this.parseTimeToMinutes(hhmm, null);
        if (mins === null || !isFinite(mins)) return fallback;
        return Math.max(0, Math.min(1439, mins));
    },

    nudgeToClock(mins) {
        mins = Math.max(0, Math.min(1439, Math.round(Number(mins) || 0)));
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

        if (!this.isSirenActive('nudge-' + kind)) this.startSiren('nudge-' + kind, 30000);
    },

    stopNudge(kind) {
        const state = this.nudgeState[kind] || (this.nudgeState[kind] = {});
        const modal = document.getElementById('nudgeModal_' + kind);
        if (modal) modal.classList.remove('open');
        this.stopSiren('nudge-' + kind);
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

    // Clipboard write with a fallback for browsers/contexts without the
    // async Clipboard API (older WebViews, non-HTTPS previews).
    writeClipboard(text) {
        if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
        return new Promise((resolve, reject) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text; ta.setAttribute('readonly', '');
                ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
                document.body.appendChild(ta); ta.select();
                const ok = document.execCommand('copy');
                document.body.removeChild(ta);
                ok ? resolve() : reject(new Error('copy failed'));
            } catch (err) { reject(err); }
        });
    },

    // One-tap copy for the icon buttons sitting inside form fields.
    copyField(fieldId, btnEl) {
        const el = document.getElementById(fieldId);
        const text = el ? String(el.value || '').trim() : '';
        if (!text) { this.showToast('Nothing to copy yet', 'info'); return; }
        this.writeClipboard(text).then(() => {
            if (!btnEl) return;
            if (!btnEl.dataset.icon) btnEl.dataset.icon = btnEl.innerHTML;
            clearTimeout(btnEl._copyTimer);
            btnEl.innerHTML = this.SVGS.copied;
            btnEl.classList.add('done');
            btnEl._copyTimer = setTimeout(() => { btnEl.innerHTML = btnEl.dataset.icon; btnEl.classList.remove('done'); }, 1500);
        }).catch(() => this.showToast('Could not copy', 'error'));
    },

    copyToClipboard(text, btnEl) {
        if (!text) { this.showToast('Nothing to copy', 'info'); return; }
        this.writeClipboard(text).then(() => {
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
        // Your own edits (bump) repaint at once; lists arriving from the sheet
        // wait if an editor is open.
        if (bump) { this.populateDropdowns(); this.renderTable(); }
        else this.refreshUiWhenIdle();
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
        this.bumpCalendarTs();
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
                <button type="button" class="btn-icon bad" onclick="app.deleteLeaveDay('${this.jsArg(d)}')" title="Remove">${this.SVGS.bin}</button>
            </div>
        `).join('');
    },

    /* ---------- NON-WORKING DAY HELPERS (Sunday / holiday / leave day) ----------
       Used to decide whether a task's due date needs the "do today or move
       to next working day" choice at alert time. ---------- */
    isNonWorkingDay(dateStr) {
        if (!dateStr) return false;
        const d = this.parseYMD(dateStr);
        if (!d) return false;
        if (d.getDay() === 0) return true; // Sunday
        if (this.holidays.some(h => h.date === dateStr && this.isOfficeClosed(h))) return true;
        if (this.leaveDays.indexOf(dateStr) !== -1) return true;
        return false;
    },

    // "Office closed" tick on each holiday. Not set yet -> Indian / company /
    // office holidays count as closed, USD (market) holidays don't.
    isOfficeClosed(h) {
        if (!h) return false;
        if (typeof h.officeClosed === 'boolean') return h.officeClosed;
        return /indian|india|company|office/i.test(String(h.type || ''));
    },

    // Why a date is off, for the prompts: holiday name, leave day or Sunday.
    nonWorkingLabel(dateStr) {
        const h = this.holidays.find(x => x.date === dateStr && this.isOfficeClosed(x));
        if (h) return h.name;
        if (this.leaveDays.indexOf(dateStr) !== -1) return 'your leave day';
        return 'Sunday';
    },

    prevWorkingDayFrom(dateStr) {
        const d = this.parseYMD(dateStr);
        if (!d) return dateStr;
        for (let i = 0; i < 30; i++) {
            d.setDate(d.getDate() - 1);
            const candidate = this.getLocalDateStr(d);
            if (!this.isNonWorkingDay(candidate)) return candidate;
        }
        return dateStr;
    },

    // Moves a task's due date (and its deadline by the same gap).
    shiftTaskDue(t, newDate) {
        const from = this.parseYMD(t.dueDate), to = this.parseYMD(newDate);
        if (from && to && t.deadlineDate) {
            const dl = this.parseYMD(t.deadlineDate);
            if (dl) { dl.setDate(dl.getDate() + Math.round((to - from) / 86400000)); t.deadlineDate = this.getLocalDateStr(dl); }
        }
        t.dueDate = newDate;
        t.deadlineAckDate = null;
        t.snoozeUntil = null;
        t.updatedAt = this.stamp();
    },

    // Daily tasks never fall on a day the office is closed: any open Daily
    // entry due on such a day (today or later) moves to the next working
    // day by itself, recorded as skipped, not as done.
    autoSkipDailyOnNonWorking() {
        const today = this.getLocalDateStr(new Date());
        const moved = [];
        this.tasks.forEach(t => {
            if (!t || t.deleted || t.purged || t.status === 'Completed' || t.recurrence !== 'Daily') return;
            if (!t.dueDate || t.dueDate < today || !this.isNonWorkingDay(t.dueDate)) return;
            const off = t.dueDate;
            const next = this.nextWorkingDayFrom(off);
            if (!next || next === off) return;
            if (!Array.isArray(t.skippedDates)) t.skippedDates = [];
            if (t.skippedDates.indexOf(off) === -1) t.skippedDates.push(off);
            this.shiftTaskDue(t, next);
            t.lastAckDate = null;
            moved.push({ t: t, off: off, next: next });
        });
        if (!moved.length) return false;
        this.saveData();
        this.renderTable();
        this.syncToGoogleSheets();
        const m = moved[0];
        this.showToast(moved.length === 1
            ? '"' + m.t.description + '" (daily) skipped for ' + this.nonWorkingLabel(m.off) + ' — next on ' + this.formatDateStr(m.next) + '.'
            : moved.length + ' daily tasks skipped for ' + this.nonWorkingLabel(m.off) + ' — next on ' + this.formatDateStr(m.next) + '.', 'info');
        return true;
    },

    nextWorkingDayFrom(dateStr) {
        const d = this.parseYMD(dateStr);
        if (!d) return dateStr;
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
        if (choice === 'next' || choice === 'prev') {
            const today = this.getLocalDateStr(new Date());
            let newDate = choice === 'next' ? this.nextWorkingDayFrom(t.dueDate) : this.prevWorkingDayFrom(t.dueDate);
            if (choice === 'prev' && newDate < today) newDate = today;
            this.shiftTaskDue(t, newDate);
            // Preponed to today: it's being dealt with now, so today's
            // reminder doesn't ring again straight away.
            t.lastAckDate = newDate === today ? today : null;
            this.logTaskActivity(t, 'rescheduled', (choice === 'next' ? 'Postponed' : 'Preponed') + ' off a non-working day to ' + newDate);
            if (!this._bulkResolving) this.showToast((choice === 'next' ? 'Postponed' : 'Preponed') + ' to ' + this.formatDateStr(newDate) + '.', 'success');
        } else {
            t.lastAckDate = this.getLocalDateStr(new Date());
            t.updatedAt = this.stamp();
            this.showToast('Kept for today.', 'success');
        }
        this.saveData();
        this.renderTable();
        this.processEngine();
        this.syncToGoogleSheets();
    },

    // "Prepone all" / "Postpone all" for every task in the alert that falls
    // on a day the office is closed.
    resolveAllNonWorkingDue(choice) {
        const ids = (this.alarmingTasks || []).filter(t => t.recurrence !== 'Daily' && this.isNonWorkingDay(t.dueDate)).map(t => String(t.id));
        if (!ids.length) return;
        this._bulkResolving = true;
        try { ids.forEach(id => this.resolveNonWorkingDue(id, choice)); } finally { this._bulkResolving = false; }
        this.showToast(ids.length + ' task' + (ids.length === 1 ? '' : 's') + ' ' + (choice === 'next' ? 'postponed' : 'preponed') + '.', 'success');
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
        this.bumpCalendarTs();
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
                ${isBuiltIn ? '' : `<button type="button" class="btn-icon bad" onclick="app.deleteCustomCalendar('${this.jsArg(name)}')" title="Delete">${this.SVGS.bin}</button>`}
            </div>`;
        }).join('');
    },

    // Skips weekends and any other holidays already on file, so the
    // suggested "next working day" is genuinely the next open day.
    computeNextWorkingDay(dateStr) {
        const d = this.parseYMD(dateStr);
        if (!d) return '';
        const dateSet = new Set(this.holidays.map(h => h.date));
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
            document.getElementById('holidayOfficeClosed').checked = this.isOfficeClosed(h);
            if (delBtn) delBtn.style.display = '';
        } else {
            this.editingHolidayId = null;
            document.getElementById('holidayModalTitle').textContent = 'Add Holiday';
            document.getElementById('holidayAlertOn').checked = true;
            document.getElementById('holidayOfficeClosed').checked = true;
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
            alert: document.getElementById('holidayAlertOn').checked,
            officeClosed: document.getElementById('holidayOfficeClosed').checked
        };

        if (this.editingHolidayId) {
            const h = this.holidays.find(x => String(x.id) === String(this.editingHolidayId));
            if (h) Object.assign(h, fields);
        } else {
            this.holidays.push(Object.assign({ id: this.newId() }, fields));
        }

        const wasEditing = !!this.editingHolidayId;   // closeHolidayModal() clears it
        this.saveHolidays();
        this.closeHolidayModal();
        this.showToast(wasEditing ? 'Holiday updated.' : 'Holiday added.', 'success');
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
        const parse = (ds) => this.parseYMD(ds);

        const blocks = [];
        const seen = new Set();

        Array.from(dateSet).sort().forEach(ds => {
            if (seen.has(ds) || !parse(ds)) return;
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

        const tomorrow = this.todayNoon(now); tomorrow.setDate(tomorrow.getDate() + 1);
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
            this.loadTombstones();
            this.tasks.forEach(t => {
                if (!t.id) t.id = this.newId();
                if (!t.updatedAt) t.updatedAt = 0;
                this.normalizeTaskShape(t);
            });
            this.tasks = this.tasks.filter(t => !this.isTombstoned(t.id));
        } catch (e) {
            console.error('Could not read local data:', e);
            this.tasks = [];
            // Unreadable local copy: keep the raw text aside (it is about to
            // be overwritten) and make the next sync a FULL download — a
            // "changes since last time" sync would never bring back entries
            // that didn't change, leaving the app empty for good.
            try {
                const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
                if (raw) localStorage.setItem(CONFIG.STORAGE_KEY + '_unreadable_' + Date.now(), raw);
            } catch (e2) {}
            try { localStorage.removeItem('pureEnergySyncCursor_' + this.currentUser); localStorage.removeItem('pureEnergySyncAck_' + this.currentUser); } catch (e3) {}
            this._sync = null;
        }
    },

    saveData() {
        if (typeof rt !== 'undefined' && rt.active && !rt._fromRemote) rt.schedulePush();
        try {
            // Fold in anything another window saved since we last looked,
            // before writing our list back.
            try {
                const onDisk = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '[]');
                if (Array.isArray(onDisk) && onDisk.length && !this.userClearedAll) {
                    const mine = new Set(this.tasks.map(t => String(t.id)));
                    onDisk.forEach(d => {
                        if (!d || !d.id || this.isTombstoned(d.id)) return;
                        const key = String(d.id);
                        if (!mine.has(key)) { this.tasks.push(d); return; }
                        const cur = this.findTask(key);
                        if (cur && (Number(d.updatedAt) || 0) > (Number(cur.updatedAt) || 0)) Object.assign(cur, d);
                    });
                }
            } catch (err) {}
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
        document.getElementById('badgeBin').textContent = binned;

        // Live metric badges: overdue count on Dashboard, bank holidays in
        // the next 7 days on Holidays. Hidden when zero so they only speak up
        // when there's something to see.
        const now = new Date();
        const overdue = active.filter(t => t.status !== 'Completed' && this.isDateInRange(t, 'Overdue')).length;
        const setBadge = (id, n) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = n > 99 ? '99+' : String(n);
            el.hidden = !n;
        };
        setBadge('badgeDashboard', overdue);
        setBadge('badgeRegister', active.filter(t => t.status !== 'Completed').length);
        setBadge('badgeCompletedTab', completed);
        setBadge('badgeBinTab', binned);
        const today = this.getLocalDateStr(now);
        const weekOut = this.addDaysStr(today, 7);
        setBadge('badgeHolidays', (this.holidays || []).filter(h => h.date >= today && h.date <= weekOut).length);
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
            this.dropFilterListener();
        };
        this._fpHandler = onDoc;
        // Deferred so the click that opened the panel doesn't immediately close it.
        setTimeout(() => { if (this._fpHandler === onDoc) document.addEventListener('click', onDoc, true); }, 0);
    },

    closeAllFilterPanels() {
        document.querySelectorAll('.filter-panel.open').forEach(p => p.classList.remove('open'));
        this.dropFilterListener();
    },

    // The outside-click listener used to be left behind whenever a panel was
    // closed any way other than clicking outside it (gear again, Esc, filters
    // cleared), so they piled up on the document.
    dropFilterListener() {
        if (this._fpHandler) document.removeEventListener('click', this._fpHandler, true);
        this._fpHandler = null;
    },

    // Search keeps its own width now — clicking it no longer hides the
    // rest of the toolbar.
    expandSearch(key) {
        this.closeAllFilterPanels();
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

    /* ESC peels back ONE layer at a time, innermost first:
       open multi-select / sort dropdown → open filter drawer → the topmost
       modal → an expanded search box → select mode. So pressing ESC inside
       a dropdown in the task form closes just the dropdown, never throws
       away the half-filled entry. Never acts while the PIN lock is up, and
       never dismisses the Past Due alert (that needs a real decision). */
    handleEscape(e) {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        if (typeof security !== 'undefined' && security.isLocked()) { e.preventDefault(); return; }

        const openDrop = document.querySelector('.multi-select.open, .ms-options.open');
        if (openDrop) { e.preventDefault(); e.stopPropagation(); this.closeDropdowns(); return; }

        if (document.querySelector('.filter-panel.open')) { e.preventDefault(); this.closeAllFilterPanels(); return; }

        const open = Array.from(document.querySelectorAll('.modal.open'));
        if (open.length) {
            e.preventDefault();
            // Topmost = highest z-index, ties broken by later in the DOM.
            const z = (el) => Number(getComputedStyle(el).zIndex) || 0;
            const top = open.reduce((a, b) => (z(b) >= z(a) ? b : a));
            const closers = {
                taskModal: () => this.closeTaskModal(),
                listManagerModal: () => this.closeListManager(),
                calendarManagerModal: () => this.closeCalendarManager(),
                subCategoryRulesModal: () => this.closeSubCategoryRules(),
                narrationRulesModal: () => this.closeNarrationRules(),
                holidayModal: () => this.closeHolidayModal(),
                alarmModal: () => {},                                   // needs an explicit choice
                nudgeModal_walk: () => this.snoozeNudge('walk'),
                nudgeModal_water: () => this.snoozeNudge('water')
            };
            (closers[top.id] || (() => top.classList.remove('open')))();
            return;
        }

        const expanded = document.querySelector('.toolbar-row.search-expanded');
        if (expanded) {
            const key = (expanded.id || '').replace('Toolbar', '');
            if (key) { e.preventDefault(); this.collapseSearch(key); return; }
        }
        if (this.selectMode) { e.preventDefault(); this.exitSelectMode(); }
    },

    setupEventListeners() {
        // Capture phase, so this runs before any input's own key handling.
        document.addEventListener('keydown', (e) => this.handleEscape(e), true);
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
        const titles = { 'Dashboard': 'Dashboard', 'Register': 'Register', 'Holidays': 'Bank Holidays', 'Config': 'Configuration', 'Completed': 'Completed', 'Bin': 'Bin' };

        const screen = document.getElementById(tabMap[tab]);
        if (screen) {
            screen.classList.add('active');
            screen.scrollTop = 0;
        }

        const btn = document.querySelector(`.tabbar-btn[data-tab="${tab}"]`);
        if (btn) btn.classList.add('active');
        document.getElementById('screenTitle').textContent = titles[tab] || tab;

        document.body.classList.toggle('fab-on', ['Register', 'Dashboard', 'Completed', 'Holidays'].indexOf(tab) !== -1);
        if (tab === 'Config') { this.renderPaymentIntroEditor(); this.renderLayoutPick(); this.renderSyncHealth(); this.loadReportSamples(); this.loadFixedTasks(); this.renderLeaveDaysList(); this.enterCfgTab(); if (typeof security !== 'undefined') security.renderPanel(); }

        this.renderTable();
    },

    isDateInRange(t, mode) {
        if (!t.dueDate) return false;
        if (mode === 'Overdue') {
            const dt = this.getTaskDueDateTime(t);
            return !!dt && dt < new Date();
        }
        const target = this.parseYMD(t.dueDate);
        if (!target) return false;
        const today = this.todayNoon();
        const diffDays = Math.round((target - today) / (1000 * 60 * 60 * 24));

        if (mode === 'Today') return diffDays === 0;
        // Due today and NOT yet past its time. Together with 'Overdue' this
        // splits 'DueByToday' exactly: DueTodayOpen + Overdue = DueByToday.
        if (mode === 'DueTodayOpen') {
            if (diffDays !== 0) return false;
            const dt = this.getTaskDueDateTime(t);
            return !!dt && dt >= new Date();
        }
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
        const d = this.parseYMD(dateStr);
        if (!d) return this.sanitize(String(dateStr));
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
            const alertIco = (h.alert !== false ? '🔔' : '🔕') + (this.isOfficeClosed(h) ? ' 🏢' : '');

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
                        <button type="button" class="btn-done dar" data-action="done" data-id="${idAttr}" title="Done + include in Daily Activity Report">✓ DAR</button><button type="button" class="btn-done" data-action="done-nodar" data-id="${idAttr}" title="Done — leave out of the Daily Activity Report">✓</button>
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
                            <button type="button" class="btn-done dar" data-action="done" data-id="${idAttr}" title="Done + include in Daily Activity Report">✓ DAR</button><button type="button" class="btn-done" data-action="done-nodar" data-id="${idAttr}" title="Done — leave out of the Daily Activity Report">✓</button>
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

    resetDarBox() { const b = document.getElementById('taskDarInclude'); if (b) b.checked = this._pendingDar !== false; this._pendingDar = true; },

    openTaskModal(id = null, emailIdForNew = null) {
        this.resetDarBox();
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
            document.getElementById('taskDueTime').value = this.normalizeTime(t.dueTime);
            const notesEl = document.getElementById('taskNotes'); if (notesEl) notesEl.style.height = '';
            document.getElementById('taskDeadlineDate').value = t.deadlineDate || '';
            document.getElementById('taskDeadlineTime').value = this.normalizeTime(t.deadlineTime);
            document.getElementById('taskMailChain').value = t.mailChain || '';
            document.getElementById('taskRecurrence').value = t.recurrence || 'None';
            document.getElementById('taskNotes').value = t.notes || '';
            const darBox = document.getElementById('taskDarInclude');
            if (darBox) darBox.checked = t.darInclude !== false;
            this.renderKeyPoints(t.keyPoints);
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
        box.dataset.ready = '0';
        box.innerHTML = '';
        this.normalizeKeyPoints(points).forEach(p => this.addKeyPointRow(p.key || '', p.value || ''));
        box.dataset.ready = '1';
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

    // "In-Progress", "In Progress" and "in_progress" are the same status.
    normStatus(status) {
        return String(status || '').trim().toLowerCase().replace(/[-_\s]+/g, ' ');
    },

    updateConditionalFields() {
        requestAnimationFrame(() => this.fitNarrationSpan && this.fitNarrationSpan());
        const cat = document.getElementById('taskCategory').value;
        const status = document.getElementById('taskStatus').value;
        const statusNorm = this.normStatus(status);

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
        const darRow = document.getElementById('darIncludeRow');
        if (darRow) darRow.style.display = statusNorm === 'completed' ? '' : 'none';

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
            const pvGroup = document.getElementById('narrationPreviewGroup');
            if (pvGroup) pvGroup.style.display = 'none';
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
                <button type="button" class="btn-icon" onclick="app.editSubCategoryRule('${this.jsArg(sc.id)}')" title="Edit">${this.SVGS.edit}</button>
                <button type="button" class="btn-icon bad" onclick="app.deleteSubCategoryRule('${this.jsArg(sc.id)}')" title="Delete">${this.SVGS.bin}</button>
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
                        ${(val && f.options.indexOf(val) === -1 ? [val].concat(f.options) : f.options).map(o => `<option value="${this.escAttr(o)}" ${o === val ? 'selected' : ''}>${this.sanitize(o)}</option>`).join('')}
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
            <label style="display:flex; align-items:center; gap:4px; font-size:0.68rem; color:var(--label-2); white-space:nowrap; cursor:pointer; flex:0 0 auto;" title="Lead field: leads the report line ('&lt;value&gt;: narration') and is kept out of the Tally narration. Tick as many fields as you need.">
                <input type="checkbox" class="nr-field-lead" style="width:auto;" ${isLead ? 'checked' : ''}> Lead
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
            const leads = this.leadLabels(nr);
            const extra = (nr.fields || []).map(f => f.label + (leads.indexOf(f.label) !== -1 ? ' (lead)' : '')).join(', ');
            return `
            <div style="display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:var(--input-bg); border:1px solid var(--line);">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:700; font-size:0.88rem; color:var(--label);">${this.sanitize(nr.name)}</div>
                    <div style="font-size:0.76rem; color:var(--label-2);">Being ${nr.hasPercent ? '[%] ' : ''}${this.sanitize(nr.phrase)}[${this.sanitize(nr.docLabel)}]${extra ? ' · Fields: ' + this.sanitize(extra) : ''}</div>
                </div>
                <button type="button" class="btn-icon" onclick="app.editNarrationRule('${this.jsArg(nr.id)}')" title="Edit">${this.SVGS.edit}</button>
                <button type="button" class="btn-icon bad" onclick="app.deleteNarrationRule('${this.jsArg(nr.id)}')" title="Delete">${this.SVGS.bin}</button>
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
        const leads = this.leadLabels(nr);
        (nr.fields || []).forEach(f => this.addNrFieldRow(f.label, f.options || [], leads.indexOf(f.label) !== -1));
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
        // Any number of Lead fields; leadFieldLabel keeps the first one for
        // copies of the app (and sheet data) from before multi-lead.
        const leadFieldLabels = collected.filter(f => f.isLead).map(f => f.label);
        const leadFieldLabel = leadFieldLabels[0] || '';
        if (!Array.isArray(this.lists.narrationTypes)) this.lists.narrationTypes = [];

        if (this.editingNrId) {
            const nr = this.lists.narrationTypes.find(x => String(x.id) === String(this.editingNrId));
            if (nr) { nr.name = name; nr.hasPercent = hasPercent; nr.phrase = phrase; nr.docLabel = docLabel; nr.fields = fields; nr.leadFieldLabel = leadFieldLabel; nr.leadFieldLabels = leadFieldLabels; }
        } else {
            if (this.lists.narrationTypes.some(x => x.name.toLowerCase() === name.toLowerCase())) {
                this.showToast('A narration type with that name already exists.', 'warning');
                return;
            }
            this.lists.narrationTypes.push({ id: this.newId(), name, hasPercent, phrase, docLabel, fields, leadFieldLabel, leadFieldLabels });
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
        const pvGroup = document.getElementById('narrationPreviewGroup');
        if (pvGroup) pvGroup.style.display = nr ? '' : 'none';
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
                        ${(val && f.options.indexOf(val) === -1 ? [val].concat(f.options) : f.options).map(o => `<option value="${this.escAttr(o)}" ${o === val ? 'selected' : ''}>${this.sanitize(o)}</option>`).join('')}
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
        return this.subCategoryText(sc, this.collectSubCategoryFields());
    },

    // "Label: value" for each filled Sub Category field — except the
    // vendor / payee field, which never goes into the narration (it leads
    // the report line instead). A label typed with its own colon
    // ("Vendor Name:") no longer comes out as "Vendor Name::".
    subCategoryText(sc, vals) {
        if (!sc || !sc.fields || !sc.fields.length) return '';
        vals = vals || {};
        return sc.fields.map(f => {
            if (this.PAYEE_RX.test(String(f.label || ''))) return '';
            const v = (vals[f.label] || '').toString().trim();
            return v ? (String(f.label).replace(/[\s:]+$/, '') + ': ' + v) : '';
        }).filter(Boolean).join(', ');
    },

    // Vendor typed into a Sub Category field (e.g. COD Charges → "Vendor Name").
    subCategoryPayee(task) {
        const sc = (this.lists.subCategories || []).find(x => x.name === (task && task.subCategory));
        if (!sc || !sc.fields) return '';
        const vals = (task && task.subCategoryFields) || {};
        const f = sc.fields.find(x => this.PAYEE_RX.test(String(x.label || '')) && String(vals[x.label] || '').trim());
        return f ? String(vals[f.label]).trim() : '';
    },

    // Sub Category part of a saved narration, rebuilt with the current rules
    // when the Sub Category is known on this device.
    narrationSubText(task) {
        const sc = (this.lists.subCategories || []).find(x => x.name === task.subCategory);
        if (sc) return this.subCategoryText(sc, task.subCategoryFields);
        const n = task.narration || {};
        return n.subCategoryText !== undefined ? n.subCategoryText : '';
    },

    /* Payee fields (the type's lead field, or any field named like
       "Name of Payee" / "Vendor Name" / "Beneficiary" / "Party Name")
       are NEVER part of the Generated Narration. They are used only in the
       Daily Activity Report, as "Payee Name: <narration without mail chain>". */
    // Only a label that IS the vendor's name counts as the payee field —
    // "Vendor Name", "Name of Payee", "Pay To", "Party Name", "Beneficiary".
    // Other fields that merely mention the vendor ("Vendor Invoice No",
    // "Supplier GSTIN") are ordinary fields and go into the narration.
    PAYEE_RX: /^\s*(?:name\s+of\s+(?:the\s+)?)?(?:vendor|payee|paye|pay\s*to|party|beneficiary|supplier)(?:'?s)?(?:\s+name)?\s*:*\s*$/i,

    // Lead fields of a narration type (several allowed; older types saved
    // a single leadFieldLabel).
    leadLabels(nr) {
        if (!nr) return [];
        if (Array.isArray(nr.leadFieldLabels)) return nr.leadFieldLabels.filter(Boolean);
        return nr.leadFieldLabel ? [nr.leadFieldLabel] : [];
    },

    isPayeeField(nr, label) {
        if (!label) return false;
        return this.leadLabels(nr).indexOf(label) !== -1 || this.PAYEE_RX.test(String(label));
    },

    // Vendor name hidden in a mail subject, e.g.
    // "PURE EV: Purchase Order - G Power Auto Parts - INPO/PP/26-27/0155 - PURE Energy"
    // → "G Power Auto Parts" (the part just before the PO / reference number).
    payeeFromMail(mail) {
        const s = String(mail || '').replace(/\s+/g, ' ').trim();
        if (!s) return '';
        const parts = s.split(/\s+[-–—|]\s+/).map(x => x.trim()).filter(Boolean);
        const isRef = (p) => /[A-Z]{2,}[A-Z0-9]*\/[A-Z0-9/-]*\d/i.test(p) || /^(po|wo|inv|invoice|bill)\s*(no\.?|#|:)?\s*\d/i.test(p);
        const isLabel = (p) => /:\s*$/.test(p) || (/(purchase|work|service)\s+order|^po$|^invoice$|^payment$|^re:|^fw:|^fwd:/i.test(p) && p.split(' ').length <= 5);
        const i = parts.findIndex(isRef);
        for (let j = i - 1; j >= 0; j--) { if (!isLabel(parts[j]) && !isRef(parts[j])) return parts[j]; }
        const k = parts.findIndex(p => /(purchase|work|service)\s+order/i.test(p));
        if (k >= 0 && parts[k + 1] && !isRef(parts[k + 1])) return parts[k + 1];
        return '';
    },

    // Vendor for a task: the Name of Paye field, else the one in the mail chain.
    taskPayee(t) {
        const n = (t && t.narration) || {};
        const nr = (this.lists.narrationTypes || []).find(x => x.name === n.typeName || (n.typeId && x.id === n.typeId));
        return String((nr && this.payeeValue(nr, n.fieldsValues)) || this.subCategoryPayee(t) || this.payeeFromMail(t && t.mailChain) || '').trim();
    },

    // Takes the vendor name out of a mail chain (for the Tally narration).
    stripPayeeFromMail(mail, payee) {
        let s = String(mail || '');
        const p = String(payee || '').trim();
        if (!s || !p) return s.trim();
        const esc = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        s = s.replace(new RegExp('\\s*[-–—|]\\s*' + esc + '(?=\\s*[-–—|]|\\s*$)', 'i'), '')
             .replace(new RegExp(esc, 'i'), '');
        return s.replace(/\s*[-–—|]\s*[-–—|]\s*/g, ' - ').replace(/^\s*[-–—|]\s*|\s*[-–—|]\s*$/g, '').replace(/\s+/g, ' ').trim();
    },

    // Text that leads the report line: every filled Lead field, in the
    // type's field order, joined with " - " (e.g. "Devi Cargo Movers -
    // DCM01"); with no Lead fields, the first vendor-name field.
    payeeValue(nr, fieldsValues) {
        fieldsValues = fieldsValues || {};
        const val = (l) => String(fieldsValues[l] || '').trim();
        const leads = this.leadLabels(nr);
        if (leads.length) {
            const order = (nr.fields || []).map(f => f.label).filter(l => leads.indexOf(l) !== -1)
                .concat(leads.filter(l => !(nr.fields || []).some(f => f.label === l)));
            const got = order.map(val).filter(Boolean);
            if (got.length) return got.join(' - ');
        }
        const labels = (nr && nr.fields ? nr.fields.map(f => f.label) : []).concat(Object.keys(fieldsValues));
        for (const l of labels) {
            if (this.PAYEE_RX.test(String(l)) && val(l)) return val(l);
        }
        return '';
    },

    // Generated Narration (Tally): "Being " + [%] + phrase + doc no +
    // [other extra fields] + [note] + [sub category fields] + Mail Chain.
    // Payee is left out.
    buildNarrationText(nr, percent, docNo, purpose, mailChain, fieldsValues, subCategoryText) {
        if (!nr) return '';
        fieldsValues = fieldsValues || {};
        const extraBits = (nr.fields || [])
            .filter(f => !this.isPayeeField(nr, f.label))
            .map(f => (fieldsValues[f.label] || '').toString().trim())
            .filter(Boolean);
        let text = 'Being ';
        if (nr.hasPercent && String(percent || '').trim()) text += String(percent).trim() + '% ';
        text += (nr.phrase || '') + String(docNo || '').trim();
        [extraBits.join(' '), String(purpose || '').trim(), String(subCategoryText || '').trim()]
            .filter(Boolean).forEach(bit => { text += ' ' + bit; });
        if (String(mailChain || '').trim()) {
            // never put the vendor name into the Tally narration — not even
            // through the mail subject
            const payee = this.payeeValue(nr, fieldsValues) || this.payeeFromMail(mailChain);
            const mail = this.stripPayeeFromMail(mailChain, payee);
            if (mail) text += ' ' + mail;
        }
        return text.replace(/\s+/g, ' ').trim();
    },

    // Daily Activity Report line: "Payee Name: <narration without mail chain>".
    // Report line for a payment: "Vendor Name: <narration with mail chain>".
    buildNarrationReportText(nr, percent, docNo, purpose, fieldsValues, subCategoryText, mailChain) {
        const body = this.buildNarrationText(nr, percent, docNo, purpose, mailChain || '', fieldsValues, subCategoryText);
        const payee = this.payeeValue(nr, fieldsValues);
        return payee ? payee + ': ' + body : body;
    },

    // Always built from the saved parts with the CURRENT rules, so entries
    // saved by older builds (payee inside the narration) come out right too.
    narrationFor(task, kind) {
        const n = task && task.narration;
        if (!n) return '';
        const nr = (this.lists.narrationTypes || []).find(x => x.name === n.typeName || (n.typeId && x.id === n.typeId));
        if (!nr) return n.text || n.reportText || '';
        const sub = this.narrationSubText(task);
        const mail = n.includeMail === false ? '' : task.mailChain;
        return kind === 'report'
            ? this.buildNarrationReportText(nr, n.percent, n.docNo, n.purpose, n.fieldsValues, sub, mail)
            : this.buildNarrationText(nr, n.percent, n.docNo, n.purpose, mail, n.fieldsValues, sub);
    },

    subCategoryTextFor(task) {
        const sc = (this.lists.subCategories || []).find(x => x.name === task.subCategory);
        return this.subCategoryText(sc, task.subCategoryFields);
    },

    // Generated Narration stretches to the end of whatever row it lands on,
    // so there is never an empty cell beside it.
    fitNarrationSpan() {
        const el = document.getElementById('narrationPreviewGroup');
        const grid = el && el.parentElement;
        if (!el || !grid) return;
        el.style.gridColumn = '';
        if (el.style.display === 'none' || !grid.clientWidth) return;
        const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
        if (cols < 3) return;
        const g = grid.getBoundingClientRect(), r = el.getBoundingClientRect();
        const colW = g.width / cols;
        const start = Math.round((r.left - g.left) / colW);
        const span = cols - start;
        if (span > 2) el.style.gridColumn = 'span ' + span;
    },

    updateNarrationPreview() {
        requestAnimationFrame(() => this.fitNarrationSpan());
        const preview = document.getElementById('narrationPreview');
        if (!preview) return;
        const name = document.getElementById('taskNarrationType').value;
        const nr = (this.lists.narrationTypes || []).find(x => x.name === name);
        const mailChain = this.narrationIncludesMail() && document.getElementById('taskMailChain') ? document.getElementById('taskMailChain').value : '';
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

    // "Include mail chain" tick beside Generated Narration (default on).
    narrationIncludesMail() {
        const el = document.getElementById('narrationIncludeMail');
        return !el || el.checked;
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
        const includeMail = this.narrationIncludesMail();
        const mailChain = includeMail && document.getElementById('taskMailChain') ? document.getElementById('taskMailChain').value.trim() : '';
        const fieldsValues = this.collectNarrationExtraFields();
        const subCategoryText = this.currentSubCategoryFieldsText();
        return {
            typeId: nr.id, typeName: nr.name, percent, docNo, purpose, fieldsValues, subCategoryText, includeMail,
            // Tally text (with Mail Chain, without payee) for Copy Narration.
            text: this.buildNarrationText(nr, percent, docNo, purpose, mailChain, fieldsValues, subCategoryText),
            // Daily Activity Report: "Payee: narration" without Mail Chain.
            reportText: this.buildNarrationReportText(nr, percent, docNo, purpose, fieldsValues, subCategoryText)
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
        const incl = document.getElementById('narrationIncludeMail');
        if (incl) incl.checked = !(narration && narration.includeMail === false);
        const nr = (this.lists.narrationTypes || []).find(x => x.name === (narration && narration.typeName));
        this.renderNarrationExtraFields(nr, narration ? narration.fieldsValues : {});
        this.updateNarrationPreview();
    },

    // Returns an error message if a required conditional field is missing
    // for the category+status combo currently selected, or '' if fine.
    validatePaymentDetails(fields) {
        if (this.isImportPaymentCategory(fields.category) && this.normStatus(fields.status) === 'in progress') {
            const pd = this.collectPaymentDetails();
            if (!pd.paymentPercent || !pd.paymentType || !pd.paymentAgainst) {
                return 'Import Payment marked In Progress needs Payment %, Payment Type, and Payment Against.';
            }
        }
        if (this.categoryHasSubCategory(fields.category) && this.normStatus(fields.status) === 'completed') {
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

    /* Data-loss guard for edits. The form only shows what the CURRENT
       category/status/rules can display, so anything else on the task —
       legacy payment fields (PO / invoice numbers), a narration whose type
       was renamed or not yet synced to this device, sub-category values for
       fields a rule no longer lists — used to be silently wiped on Save.
       This carries that data across instead. Only values the form really
       renders (and that you really cleared) are allowed to go blank. */
    preserveHiddenData(task, fields) {
        // Payment details: merge so legacy keys survive; the three visible
        // keys still follow the form (blank when their section is hidden).
        fields.paymentDetails = Object.assign({}, task.paymentDetails || {}, fields.paymentDetails || {});

        // Narration.
        const nrSel = document.getElementById('taskNarrationType');
        const pickedName = nrSel ? nrSel.value : '';
        const nrBox = document.getElementById('tallyNarrationBox');
        const narrationShown = !!nrBox && nrBox.style.display !== 'none';
        if (!fields.narration && task.narration) {
            const typeKnown = (this.lists.narrationTypes || []).some(x => x.name === task.narration.typeName);
            if (!narrationShown) {
                fields.narration = task.narration;                 // section hidden → untouched
            } else if (pickedName && pickedName === task.narration.typeName && !typeKnown) {
                fields.narration = task.narration;                 // type not on this device → keep as-is
            }
        }

        // Sub-category values for fields the current rule doesn't render.
        if (task.subCategoryFields && fields.subCategory && fields.subCategory === task.subCategory) {
            const sc = (this.lists.subCategories || []).find(x => x.name === fields.subCategory);
            const shown = new Set(((sc && sc.fields) || []).map(f => f.label));
            const keep = {};
            Object.keys(task.subCategoryFields).forEach(k => { if (!shown.has(k)) keep[k] = task.subCategoryFields[k]; });
            fields.subCategoryFields = Object.assign(keep, fields.subCategoryFields || {});
        } else if (!fields.subCategory && task.subCategory) {
            const subShown = (document.getElementById('subCategoryField') || { style: {} }).style.display !== 'none';
            if (!subShown) { fields.subCategory = task.subCategory; fields.subCategoryFields = task.subCategoryFields || {}; }
        }

        // Key Points: if the editor never rendered (e.g. a render error on
        // odd legacy data), never treat the empty box as "delete them all".
        const kpBox = document.getElementById('taskKeyPoints');
        if ((!kpBox || kpBox.dataset.ready !== '1') && Array.isArray(task.keyPoints) && task.keyPoints.length) {
            fields.keyPoints = task.keyPoints;
        }
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
            dueTime: this.normalizeTime(document.getElementById('taskDueTime').value),
            deadlineDate: document.getElementById('taskDeadlineDate').value,
            deadlineTime: this.normalizeTime(document.getElementById('taskDeadlineTime').value),
            mailChain: document.getElementById('taskMailChain').value.trim(),
            recurrence: document.getElementById('taskRecurrence').value || 'None',
            notes: document.getElementById('taskNotes').value,
            darInclude: (document.getElementById('taskDarInclude') || { checked: true }).checked,
            keyPoints: this.collectKeyPoints(),
            paymentDetails: this.collectPaymentDetails(),
            subCategoryFields: this.collectSubCategoryFields(),
            narration: this.collectNarration(),
            updatedAt: this.stamp()
        };

        const paymentError = this.validatePaymentDetails(fields);
        if (paymentError) { this.showToast(paymentError, 'warning'); return; }

        // Slot check only when the time is new or has actually moved — an
        // entry you already chose to double-book isn't challenged again just
        // because you edited its notes.
        const before = this.editingId ? this.findTask(this.editingId) : null;
        const slotMoved = !before || (before.dueDate || '') !== fields.dueDate ||
            this.normalizeTime(before.dueTime) !== fields.dueTime;
        const clash = slotMoved ? this.slotClash(fields.dueDate, fields.dueTime, this.editingId) : null;
        if (clash) {
            const free = this.nextFreeTime(fields.dueDate, fields.dueTime, this.editingId);
            this.checkSlotAvailability();
            const keepBoth = confirm(
                'Time slot already taken\n\n"' + clash.description + '" holds ' + this.formatTimeStr(clash.dueTime) +
                ' on ' + this.formatDateStr(fields.dueDate) + '.\n\n' +
                'OK = Double-book anyway (both stay at this time)\n' +
                'Cancel = Pick another time' + (free ? ' (next free: ' + this.formatTimeStr(free) + ')' : '')
            );
            if (!keepBoth) {
                if (free) this.showToast('Slot taken.', 'warning', { label: 'Use ' + this.formatTimeStr(free), onClick: () => this.useSlotTime(free) });
                return;
            }
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
            this.preserveHiddenData(task, fields);
            Object.assign(task, fields);
            if (dueChanged) { task.lastAckDate = null; task.snoozeUntil = null; }
            if (deadlineChanged) { task.deadlineAckDate = null; }
            if (this.storedEmailId) task.emailId = this.storedEmailId;

            if (task.status === 'Completed') {
                if (!task.completedDate || statusChanged) task.completedDate = todayStr;
            } else {
                task.completedDate = null;
            }
            if (statusChanged && !this.isUnstartedStatus(fields.status)) this.noteWork(task, fields.status);

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
            if (!this.isUnstartedStatus(task.status)) this.noteWork(task, task.status);
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

        const base = this.parseYMD(t.dueDate);
        if (!base) return null;

        // Monthly keeps the same day of the month, clamped to the month's
        // last day (31 Jan → 28/29 Feb, not 3 Mar).
        const step = (d) => {
            const n = new Date(d.getTime());
            if (t.recurrence === 'Daily') n.setDate(n.getDate() + 1);
            else if (t.recurrence === 'Weekly') n.setDate(n.getDate() + 7);
            else if (t.recurrence === 'Monthly') {
                const day = n.getDate();
                n.setDate(1); n.setMonth(n.getMonth() + 1);
                const last = new Date(n.getFullYear(), n.getMonth() + 1, 0, 12).getDate();
                n.setDate(Math.min(day, last));
            } else return null;
            return n;
        };
        const next = step(base);
        if (!next) return null;
        // A Daily task's next occurrence skips holidays (office closed),
        // leave days and Sundays.
        if (t.recurrence === 'Daily') {
            for (let i = 0; i < 30 && this.isNonWorkingDay(this.getLocalDateStr(next)); i++) next.setDate(next.getDate() + 1);
        }

        const nextDue = this.getLocalDateStr(next);

        // The deadline moves with the due date by the same gap, so the next
        // occurrence doesn't arrive with last cycle's (already crossed)
        // cutoff and fire a deadline alarm the moment it's created.
        let nextDeadline = t.deadlineDate || '';
        const dl = this.parseYMD(t.deadlineDate);
        if (dl) {
            const gap = Math.round((dl - base) / 86400000);
            const moved = new Date(next.getTime()); moved.setDate(moved.getDate() + gap);
            nextDeadline = this.getLocalDateStr(moved);
        }
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
            deadlineDate: nextDeadline,
            deadlineAckDate: null,
            dateLogged: this.getLocalDateStr(new Date()),
            completedDate: null,
            dateDeleted: null,
            deleted: false,
            purged: false,
            lastAckDate: null,
            snoozeUntil: null,
            updatedAt: this.stamp()
        });
    },

    // Entry point for every "quick done" gesture (table button, swipe, drag,
    // the alarm popup's Mark done). If the category needs a Sub Category,
    // its fields must be filled in first: open the entry so they can be
    // entered, instead of silently marking it done without them.
    tryCompleteTask(id, dar = true) {
        const t = this.findTask(id);
        if (!t) return;
        this._pendingDar = dar !== false;
        if (!this.subCategoryComplete(t)) {
            // Silence any active overdue alert for today so it doesn't pop
            // back up while the required fields are being filled in.
            t.lastAckDate = this.getLocalDateStr(new Date());
            t.updatedAt = this.stamp();
            this.saveData();
            if (this.isAlarming) this.stopPersistentAlarm(false);

            this.openTaskModal(id);
            this.setSelectValue('taskStatus', 'Completed');
            this.updateConditionalFields();
            this.setSelectValue('taskSubCategory', t.subCategory || '');
            this.renderSubCategoryFields(t.subCategoryFields || {});
            const darBox = document.getElementById('taskDarInclude');
            if (darBox) darBox.checked = dar !== false;
            this.showToast('Select a Sub Category and fill in its details, then save to mark this done.', 'warning');
            return;
        }
        this.markComplete(id, dar);
    },

    // dar = true  → "Done + DAR": listed in the Daily Activity Report
    // dar = false → "Done": completed, but left out of the report
    markComplete(id, dar = true) {
        const t = this.findTask(id);
        if (!t) return;

        t.status = 'Completed';
        t.darInclude = dar !== false;
        t.completedDate = this.getLocalDateStr(new Date());
        this.noteWork(t, 'Completed');
        t.lastAckDate = null;
        t.snoozeUntil = null;
        t.updatedAt = this.stamp();

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
        t.updatedAt = this.stamp();

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
        t.updatedAt = this.stamp();

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
        t.updatedAt = this.stamp();

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
        t.updatedAt = this.stamp();

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

        this.logTaskActivity(t, 'deleted permanently', '');
        this.tombstone(id);

        this.saveData();
        this.renderTable();
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
                t.updatedAt = this.stamp();
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
            if (cfg.hideEmpty) return '';
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

        return '<section class="dash-section' + (cfg.wide ? ' wide' : '') + '">' + head + '<div class="mini-grid">' + tiles + '</div></section>';
    },

    renderDashboard() {
        const heroBox = document.getElementById('dashHero');
        const chartBox = document.getElementById('dashCharts');
        const greetBox = document.getElementById('dashGreeting');
        if (!heroBox || !chartBox) return;

        const live = this.tasks.filter(t => !t.deleted && !t.purged);

        const open = live.filter(t => t.status !== 'Completed');
        const done = live.filter(t => t.status === 'Completed');

        // One clock for every card, so the numbers always add up:
        // Pending as on Today = Due Today (still on the clock) + Overdue.
        const overdue = open.filter(t => this.isDateInRange(t, 'Overdue'));
        const dueToday = open.filter(t => this.isDateInRange(t, 'DueTodayOpen'));
        const next7 = open.filter(t => this.isDateInRange(t, 'Next7Days'));
        const thisMonth = open.filter(t => this.isDateInRange(t, 'ThisMonth'));
        const monthName = new Date().toLocaleDateString('en-IN', { month: 'long' });
        const noDue = open.filter(t => !t.dueDate);
        const pendingNow = open.filter(t => (t.status || 'Pending') === 'Pending');
        const pendingToday = open.filter(t => this.isDateInRange(t, 'Overdue') || this.isDateInRange(t, 'DueTodayOpen'));

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
                title: 'Pending as on Today', count: pendingToday.length, colour: 'var(--red)',
                ftype: 'pendingToday', fvalue: 'DueByToday',
                sub: pendingToday.length ? 'Overdue + due today' : 'Nothing pending as of today'
            }),
            this.dashTile({
                title: 'Due Today', count: dueToday.length, colour: 'var(--blue)',
                ftype: 'due', fvalue: 'DueTodayOpen',
                sub: dueToday.length ? 'Still on the clock' : 'Nothing left for today'
            }),
            this.dashTile({
                title: 'Overdue', count: overdue.length, colour: 'var(--red)',
                ftype: 'due', fvalue: 'Overdue',
                sub: overdue.length ? 'Past the due time' : 'Nothing overdue'
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
            })
        ].join('');

        /* ---- breakdowns, as small tiles ---- */
        const total = open.length;
        chartBox.innerHTML = [
            this.dashSection({
                title: 'By Category', ftype: 'category', total: total, wide: true,
                rows: this.dashGroup(open, 'category', 'Uncategorised'),
                empty: 'Nothing open to break down.'
            }),
            this.dashSection({
                title: 'By Sub Category', ftype: 'subCategory', total: open.filter(t => t.subCategory).length,
                rows: this.dashGroup(open.filter(t => t.subCategory), 'subCategory', 'No sub category'),
                empty: 'No sub categories in use yet.', hideEmpty: true
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
        return /iPhone|iPod|Android.+Mobile/i.test(navigator.userAgent || '') ? 'mobile' : 'desktop';
    },

    applyShell() {
        const shell = this.resolvedShell();
        const before = document.documentElement.getAttribute('data-shell');
        document.documentElement.setAttribute('data-shell', shell);
        this.placeTabBar(shell);
        if (before && before !== shell) {
            const cfg = document.getElementById('cfgShell');
            if (cfg) cfg.classList.remove('showing-panel');
        }
        return shell;
    },

    /* On phones the tab bar floats at the bottom of the screen. It has to
       live outside the header: the header's entrance animation made it the
       tab bar's positioning box, so "fixed to the bottom" landed on top of
       the page title instead. On desktop it goes back inside the header. */
    placeTabBar(shell) {
        const bar = document.getElementById('tabBar');
        const header = document.getElementById('mainAppHeader');
        if (!bar || !header) return;
        if (!this._tabHome) {
            this._tabHome = document.createComment('tabbar-home');
            bar.parentNode.insertBefore(this._tabHome, bar);
        }
        if (shell === 'mobile') {
            if (bar.parentNode !== document.body) header.parentNode.insertBefore(bar, header.nextSibling);
        } else if (this._tabHome.parentNode && bar.previousSibling !== this._tabHome) {
            this._tabHome.parentNode.insertBefore(bar, this._tabHome.nextSibling);
        }
    },

    // The phone's floating + does whatever the current tab's own + does
    // (new entry, or new holiday on the Holidays tab).
    fabAction() {
        const tabEl = document.getElementById(({ Holidays: 'holidaysTab', Completed: 'completedTab' })[this.currentTab] || 'registerTab');
        const own = tabEl && tabEl.querySelector('.compact-toolbar > .btn-new-entry');
        if (own && this.currentTab === 'Holidays') { own.click(); return; }
        this.openTaskModal();
    },

    shellPref() {
        const v = localStorage.getItem('pureEnergyShell');
        return v === 'mobile' || v === 'desktop' ? v : 'auto';
    },

    setShellPref(v) {
        if (v === 'auto') localStorage.removeItem('pureEnergyShell');
        else localStorage.setItem('pureEnergyShell', v);
        this.applyShell();
        const beforeView = document.body.dataset.view;
        if (this.applyViewMode() !== beforeView) this.renderTable();
        this.renderLayoutPick();
        this.updateHeader && this.updateHeader();
        this.showToast(v === 'auto' ? 'Layout follows this device (' + this.resolvedShell() + ')' : 'Layout: ' + v, 'info');
    },

    renderLayoutPick() {
        const pref = this.shellPref();
        document.querySelectorAll('#layoutPick button').forEach(b => b.classList.toggle('active', b.dataset.shell === pref));
        const hint = document.getElementById('layoutPickHint');
        if (hint) {
            let auto = 'desktop';
            try { const saved = localStorage.getItem('pureEnergyShell'); localStorage.removeItem('pureEnergyShell'); auto = window.__shell ? window.__shell() : auto; if (saved) localStorage.setItem('pureEnergyShell', saved); } catch (e) {}
            hint.textContent = 'This device is detected as a ' + (auto === 'mobile' ? 'phone' : 'computer') + '. Auto uses the ' + auto + ' layout here.';
        }
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
            const deletedOn = this.parseYMD(t.dateDeleted);
            if (!deletedOn || deletedOn.getTime() >= cutoff) return;
            t.purged = true;
            cleared++;
        });
        // Anything flagged purged (now, or by an older build) becomes a real
        // tombstone and leaves this device.
        const legacy = this.tasks.filter(t => t.purged).map(t => t.id);
        legacy.forEach(id => this.tombstone(id));

        if (legacy.length && !cleared) this.saveData();
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
            (next ? '<button type="button" onclick="app.useNextWorkingDay(\'' + this.jsArg(next) +
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
            (free ? '<button type="button" onclick="app.useSlotTime(\'' + this.jsArg(free) + '\')">Use ' +
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
                t.updatedAt = this.stamp();
                const repeat = this.nextOccurrence(t);
                if (repeat) { if (!t.seriesId) t.seriesId = repeat.seriesId; spawned.push(repeat); }
                this.logTaskActivity(t, 'completed', this.reportDetailsFor(t));
            } else if (kind === 'reopen') {
                t.status = pending;
                t.completedDate = null; t.lastAckDate = null; t.snoozeUntil = null;
                t.updatedAt = this.stamp();
            } else if (kind === 'bin') {
                t.deleted = true;
                t.dateDeleted = todayStr;
                t.updatedAt = this.stamp();
            } else if (kind === 'restore') {
                t.deleted = false;
                t.dateDeleted = null;
                t.updatedAt = this.stamp();
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
        // Structured fields (Key Points, narration, sub-category values,
        // payment details) travel as JSON columns, so a CSV restore no
        // longer strips them off every entry.
        const headers = ['id', 'dateLogged', 'description', 'category', 'subCategory', 'priority', 'status', 'pendingWith',
            'dueDate', 'dueTime', 'deadlineDate', 'deadlineTime', 'mailChain', 'notes', 'recurrence', 'deleted', 'dateDeleted',
            'lastAckDate', 'deadlineAckDate', 'snoozeUntil', 'completedDate', 'emailId', 'updatedAt', 'purged', 'seriesId'];
        const jsonHeaders = ['keyPoints', 'paymentDetails', 'subCategoryFields', 'narration'];
        const all = headers.concat(jsonHeaders);
        const rows = [all.join(',')];
        // A value starting with = + - @ would run as a formula when the CSV is
        // opened in Excel; a leading ' makes it plain text (undone on import).
        const cell = (v) => {
            let t = String(v === undefined || v === null ? '' : v);
            if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
            return `"${t.replace(/"/g, '""')}"`;
        };

        this.tasks.forEach(t => {
            rows.push(headers.map(h => cell(t[h])).concat(jsonHeaders.map(h => cell(t[h] ? JSON.stringify(t[h]) : ''))).join(','));
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
                        if (['keyPoints', 'paymentDetails', 'subCategoryFields', 'narration'].indexOf(h) !== -1) {
                            if (!val) return;
                            try { val = JSON.parse(val); } catch (err) { if (h !== 'keyPoints') return; }
                        }
                        if (typeof val === 'string' && /^'[=+\-@\t\r]/.test(val)) val = val.slice(1);
                        task[h] = val;
                    });
                    if (!task.id) task.id = this.newId();
                    if (task.deleted === undefined) task.deleted = false;
                    if (task.purged === undefined) task.purged = false;
                    if (!task.recurrence) task.recurrence = 'None';
                    task.updatedAt = Number(task.updatedAt) || 0;   // 0 = the file did not say when it was last edited
                    this.normalizeTaskShape(task);
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

                // An entry the file gives no edit time for must not overwrite a copy
                // you already have (stamping it "now" made it win every time).
                // If you have it, yours is kept; if you don't, it is added as new.
                const stampMissing = (t) => { if (!t.updatedAt) t.updatedAt = this.stamp(); };

                if (merge) {
                    const incoming = importedTasks.filter(t => t.updatedAt || !this.findTask(t.id));
                    const kept = importedTasks.length - incoming.length;
                    incoming.forEach(stampMissing);
                    const res = this.mergeTasks(incoming);
                    this.showToast(`Merged: ${res.added} new, ${res.updated} updated` + (kept ? `, ${kept} left as they were (no edit time in the file)` : ''), 'success');
                } else {
                    importedTasks.forEach(stampMissing);
                    if (!confirm("REPLACE all current entries with the imported file? This cannot be undone.")) {
                        this.showToast('Import cancelled', 'info');
                        return;
                    }
                    // Entries that are not in the file must leave the cloud too,
                    // otherwise the next sync would simply pull them back.
                    const keep = new Set(importedTasks.map(t => String(t.id)));
                    this.tasks.map(t => String(t.id)).filter(id => !keep.has(id)).forEach(id => this.tombstone(id));
                    this.tasks = importedTasks;
                    this.userClearedAll = true;
                    this.showToast('CSV backup restored (replaced)', 'success');
                }

                this.saveData();
                this.userClearedAll = false;
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

/* ================================================================
   REALTIME SYNC — Google Firebase Firestore
   ----------------------------------------------------------------
   • Every device keeps a live listener on the database: a change made on
     one device arrives on the others in about a second. No polling.
   • One small document per entry (users/<you>/tasks/<id>), written only
     when that entry changes. Deletions remove the document.
   • Offline: Firestore's own offline queue holds writes and sends them
     when the connection is back.
   • Conflicts: newest updatedAt wins (same rule as before).
   • Only you can read/write your data (Google sign-in + security rules).
   The Google Sheet keeps being updated every 5 minutes as a backup copy.
   ================================================================ */
const rt = {
    CFG_KEY: 'pureEnergyFirebaseConfig',
    OFF_KEY: 'pureEnergyFirebaseOff',
    // Your project "Working-Dashboard" — built in, so every device connects
    // with just a Google sign-in. (A config pasted in Connection overrides it.)
    BUILT_IN: {
        apiKey: "AIzaSyCUQBToPJWSGXoiy5BnD3d9E1YEFiT4LhI",
        authDomain: "working-dashboard-655ca.firebaseapp.com",
        projectId: "working-dashboard-655ca",
        storageBucket: "working-dashboard-655ca.firebasestorage.app",
        messagingSenderId: "576017598084",
        appId: "1:576017598084:web:5e1bb752595113dc1524d1"
    },
    SDK: 'https://www.gstatic.com/firebasejs/10.12.2/',
    active: false, ready: false, uid: null, db: null, auth: null,
    unsub: [], _pushTimer: null, _pushing: false, _again: false, state: 'off',

    config() {
        if (localStorage.getItem(this.OFF_KEY) === '1') return null;
        const raw = localStorage.getItem(this.CFG_KEY) || '';
        return (raw && this.parseConfig(raw)) || this.BUILT_IN;
    },

    // Accepts the snippet exactly as Firebase shows it
    // (const firebaseConfig = { apiKey: "...", ... };) or plain JSON.
    parseConfig(text) {
        const s = String(text || '');
        const get = (k) => { const m = new RegExp(k + '\\s*["\']?\\s*:\\s*["\']([^"\']+)["\']').exec(s); return m ? m[1].trim() : ''; };
        const cfg = { apiKey: get('apiKey'), authDomain: get('authDomain'), projectId: get('projectId'),
            appId: get('appId'), storageBucket: get('storageBucket'), messagingSenderId: get('messagingSenderId') };
        return cfg.apiKey && cfg.projectId ? cfg : null;
    },

    loadScript(src) {
        return new Promise((res, rej) => {
            if (document.querySelector('script[data-fb="' + src + '"]')) return res();
            const el = document.createElement('script');
            el.src = src; el.async = true; el.dataset.fb = src;
            el.onload = () => res(); el.onerror = () => rej(new Error('Could not load Firebase (' + src.split('/').pop() + ')'));
            document.head.appendChild(el);
        });
    },

    // ---- per-device bookkeeping (separate from the Sheet sync's) ----
    ackKey() { return 'pureEnergyRtAck_' + (this.uid || 'x'); },
    ack() { if (!this._ack) { try { this._ack = JSON.parse(localStorage.getItem(this.ackKey()) || '{}') || {}; } catch (e) { this._ack = {}; } } return this._ack; },
    saveAck() { try { localStorage.setItem(this.ackKey(), JSON.stringify(this._ack || {})); } catch (e) {} },

    setState(state, note) {
        this.state = state;
        const pill = document.getElementById('saveStatus');
        const colours = { live: 'var(--green)', offline: 'var(--amber)', connecting: 'var(--blue)', error: 'var(--red)', signin: 'var(--amber)' };
        const words = { live: 'live', offline: 'offline — queued', connecting: 'connecting…', error: 'realtime error', signin: 'sign in to sync' };
        if (pill && state !== 'off') pill.innerHTML = '<span class="dot" style="background:' + (colours[state] || 'var(--label-2)') + '"></span> ' + (words[state] || state);
        const box = document.getElementById('rtStatus');
        if (box) box.innerHTML = this.statusHtml(note);
        if (window.app && app.renderSyncHealth) app.renderSyncHealth();
    },

    statusHtml(note) {
        if (!this.config()) return 'Switched off — tap "Save & connect" to turn realtime sync back on.';
        const u = this.auth && this.auth.currentUser;
        const txt = { live: '🟢 Live — changes appear on your other devices within a second.', offline: '🟠 Offline — edits are queued and will upload automatically.',
            connecting: '🔵 Connecting…', signin: '🟠 Signed out — tap "Sign in with Google".', error: '🔴 ' + (note || 'Error') }[this.state] || '';
        return txt + (u ? '<br>Signed in as <b>' + app.sanitize(u.email || u.uid) + '</b>' : '') + (note && this.state !== 'error' ? '<br>' + app.sanitize(note) : '');
    },

    /* ---------- start ---------- */
    init() {
        const cfg = this.config();
        if (!cfg) { this.active = false; return Promise.resolve(); }
        this.active = true;
        this.setState('connecting');
        return this.loadScript(this.SDK + 'firebase-app-compat.js')
            .then(() => Promise.all([this.loadScript(this.SDK + 'firebase-auth-compat.js'), this.loadScript(this.SDK + 'firebase-firestore-compat.js')]))
            .then(() => {
                if (!firebase.apps.length) firebase.initializeApp(cfg);
                this.auth = firebase.auth();
                this.db = firebase.firestore();
                try { this.db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (e) {}
                try { this.auth.getRedirectResult().catch(() => {}); } catch (e) {}
                this.auth.onAuthStateChanged(user => this.onAuth(user));
            })
            .catch(err => { this.setState('error', err.message); });
    },

    signIn() {
        if (!this.auth) { this.init(); app.showToast('Connecting to Firebase… tap Sign in again in a moment.', 'info'); return; }
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        this.auth.signInWithPopup(provider).catch(err => {
            if (err && /popup|blocked|operation-not-supported/i.test(err.code || err.message || '')) return this.auth.signInWithRedirect(provider);
            this.setState('error', this.explain(err));
            app.showToast(this.explain(err), 'error');
        });
    },

    signOut() {
        this.stopListening();
        if (this.auth) this.auth.signOut();
        this.setState('signin');
    },

    disconnect() {
        this.signOut();
        localStorage.removeItem(this.CFG_KEY);
        localStorage.setItem(this.OFF_KEY, '1');
        this.active = false; this.state = 'off';
        app.showToast('Realtime sync switched off — using the Google Sheet only.', 'info');
        const box = document.getElementById('rtStatus'); if (box) box.innerHTML = this.statusHtml();
    },

    explain(err) {
        const c = (err && (err.code || '')) + ' ' + (err && err.message || '');
        if (/unauthorized-domain/i.test(c)) return 'This web address is not allowed yet: Firebase → Authentication → Settings → Authorized domains → add ' + location.hostname;
        if (/permission-denied|insufficient permissions/i.test(c)) return 'Firestore rules block access — paste the rules from the setup steps (Firestore → Rules → Publish).';
        if (/api-key|invalid-api-key/i.test(c)) return 'The Firebase config looks wrong — copy it again from Project settings → Your apps.';
        if (/operation-not-allowed/i.test(c)) return 'Google sign-in is not enabled: Firebase → Authentication → Sign-in method → Google → Enable.';
        if (/unavailable|network/i.test(c)) return 'No connection to Firebase right now — edits are kept and will upload.';
        return (err && err.message) || 'Firebase error';
    },

    onAuth(user) {
        this.stopListening();
        this._ack = null;
        if (!user) {
            this.uid = null; this.ready = false; this.setState('signin');
            if (!this._askedSignIn) {
                this._askedSignIn = true;
                setTimeout(() => app.showToast('Turn on live sync across your devices — sign in with your Google account once.', 'info',
                    { label: 'Sign in', onClick: () => this.signIn() }), 1500);
            }
            return;
        }
        this.uid = user.uid;
        this.ready = true;
        this.listen();
        this.schedulePush(50);   // upload anything this device has that the database doesn't
    },

    col(name) { return this.db.collection('users').doc(this.uid).collection(name); },

    stopListening() { this.unsub.forEach(u => { try { u(); } catch (e) {} }); this.unsub = []; },

    /* ---------- incoming: live listener ---------- */
    listen() {
        const ack = this.ack();
        this.unsub.push(this.col('tasks').onSnapshot({ includeMetadataChanges: true }, snap => {
            const incoming = [], removed = [];
            snap.docChanges().forEach(ch => {
                if (ch.type === 'removed') { if (!ch.doc.metadata.hasPendingWrites) removed.push(ch.doc.id); return; }
                const d = ch.doc.data();
                if (!d || !d.id) return;
                incoming.push(d);
            });
            let moved = 0;
            if (removed.length) moved += app.applyRemoteTombstones(removed);
            if (incoming.length) {
                const r = app.mergeTasks(incoming);
                moved += r.added + r.updated;
                incoming.forEach(d => {
                    const local = app.findTask(d.id);
                    if (local && (Number(local.updatedAt) || 0) === (Number(d.updatedAt) || 0)) ack[String(d.id)] = Number(d.updatedAt) || 0;
                });
                this.saveAck();
            }
            if (moved) {
                this._fromRemote = true;
                app.saveData();
                this._fromRemote = false;
                // Repaint now, or — if an entry form is open — right after it
                // closes, so a live update never swaps the screen under the
                // user mid-entry (same rule as the Google Sheets sync).
                // renderTable() also redraws the Dashboard when it is showing.
                app.refreshUiWhenIdle();
            }
            this.setState(snap.metadata.fromCache ? 'offline' : 'live');
            if (!snap.metadata.fromCache) app.noteSyncResult(true);
        }, err => { this.setState('error', this.explain(err)); }));

        this.unsub.push(this.col('meta').onSnapshot(snap => {
            snap.docChanges().forEach(ch => {
                if (ch.type === 'removed') return;
                const d = ch.doc.data() || {};
                if (ch.doc.id === 'lists' && d.lists) { app.applyRemoteLists(d.lists, d.ts); this.metaAck('lists', d.ts); }
                if (ch.doc.id === 'calendar' && Array.isArray(d.holidays)) {
                    app.applyRemoteCalendar({ holidays: d.holidays, leaveDays: d.leaveDays || [], customCalendars: d.customCalendars || [], holidaysUpdatedAt: d.ts });
                    this.metaAck('calendar', d.ts);
                }
            });
            app.refreshUiWhenIdle();
        }, () => {}));
    },

    metaAck(k, ts) { const a = this.ack(); a['__' + k] = Math.max(Number(a['__' + k]) || 0, Number(ts) || 0); this.saveAck(); },

    /* ---------- outgoing: only what changed ---------- */
    schedulePush(delay) {
        if (!this.active || !this.ready) return;
        clearTimeout(this._pushTimer);
        this._pushTimer = setTimeout(() => this.push(), delay === undefined ? 300 : delay);
    },

    clean(obj) { return JSON.parse(JSON.stringify(obj)); },   // Firestore rejects undefined

    push() {
        if (!this.ready) return Promise.resolve();
        // A push that has not settled in 2 minutes (phone slept / offline
        // commit still queued) must not block every later push: writes are
        // plain overwrites, so sending again is safe.
        if (this._pushing && Date.now() - (this._pushStartedAt || 0) < 120000) { this._again = true; return Promise.resolve(); }
        const ack = this.ack();
        const dirty = app.tasks.filter(t => t && t.id && ack[String(t.id)] !== (Number(t.updatedAt) || 0));
        const tomb = app._tomb || app.loadTombstones();
        const dels = (tomb.rtPending || []).slice();
        const listsDirty = (app.listsUpdatedAt || 0) > (Number(ack.__lists) || 0);
        const calDirty = (app.holidaysUpdatedAt || 0) > (Number(ack.__calendar) || 0);
        if (!dirty.length && !dels.length && !listsDirty && !calDirty) return Promise.resolve();

        this._pushing = true;
        const pushId = this._pushStartedAt = Date.now();
        const batches = [];
        let b = this.db.batch(), n = 0;
        const add = (fn) => { if (n >= 450) { batches.push(b); b = this.db.batch(); n = 0; } fn(b); n++; };
        const sent = dirty.map(t => ({ id: String(t.id), ts: Number(t.updatedAt) || 0 }));
        dirty.forEach(t => add(bb => bb.set(this.col('tasks').doc(String(t.id)), this.clean(t))));
        dels.forEach(id => add(bb => bb.delete(this.col('tasks').doc(String(id)))));
        if (listsDirty) add(bb => bb.set(this.col('meta').doc('lists'), this.clean({ lists: app.lists, ts: app.listsUpdatedAt || 0 })));
        if (calDirty) add(bb => bb.set(this.col('meta').doc('calendar'), this.clean({ holidays: app.holidays, leaveDays: app.leaveDays || [], customCalendars: app.customCalendars || [], ts: app.holidaysUpdatedAt || 0 })));
        batches.push(b);

        // With offline persistence the write is safely queued on this device
        // at once; commit() resolves when the server has it.
        sent.forEach(s => { ack[s.id] = s.ts; });
        if (listsDirty) ack.__lists = app.listsUpdatedAt || 0;
        if (calDirty) ack.__calendar = app.holidaysUpdatedAt || 0;
        tomb.rtPending = (tomb.rtPending || []).filter(id => dels.indexOf(id) === -1);
        app.saveTombstones(); this.saveAck();

        return Promise.all(batches.map(x => x.commit()))
            .then(() => { if (this.state !== 'live') this.setState('live'); })
            .catch(err => {
                // put them back so the next push retries
                sent.forEach(s => { if (ack[s.id] === s.ts) delete ack[s.id]; });
                tomb.rtPending = (tomb.rtPending || []).concat(dels.filter(id => (tomb.rtPending || []).indexOf(id) === -1));
                app.saveTombstones(); this.saveAck();
                this.setState('error', this.explain(err));
            })
            .finally(() => {
                if (this._pushStartedAt !== pushId) return;     // a newer push took over
                this._pushing = false;
                if (this._again) { this._again = false; this.schedulePush(200); }
            });
    }
};

/* ================================================================
   SECURITY — PIN lock, privacy shield, brute-force lockout, cross-tab sync
   ----------------------------------------------------------------
   • PIN is never stored: only a PBKDF2-SHA256 hash (150k rounds, random
     16-byte salt) via WebCrypto.
   • Privacy shield: the moment the page is hidden (tab switch, app
     switcher, minimise) the screen is covered with a frosted shield, so
     the OS snapshot never shows banking data. Coming back only asks for
     the PIN if the real inactivity timeout has passed — otherwise the
     shield just lifts.
   • 5 wrong PINs → keypad frozen for 30 s. The counter and the lockout
     end-time live in localStorage, so a page refresh (or another tab)
     can't be used to skip it.
   • Lock / unlock / PIN changes are broadcast to every open tab
     (BroadcastChannel, with the storage event as a fallback).
   Device-level: shared by all profiles on this browser.
   ================================================================ */
const security = {
    PIN_KEY: 'pureEnergyPinV1',
    CFG_KEY: 'pureEnergyLockCfg',
    ACTIVE_KEY: 'pureEnergyLastActive',
    STATE_KEY: 'pureEnergyLockState',
    FAIL_KEY: 'pureEnergyPinFails',
    MAX_TRIES: 5,
    LOCKOUT_MS: 30000,
    ITER: 150000,
    TIMEOUTS: [[0, 'Immediately'], [1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']],

    locked: false,
    entry: '',
    busy: false,
    channel: null,
    _countdown: null,
    _lastTouch: 0,

    /* ---------- storage helpers ---------- */
    read(key, fallback) {
        try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v === null ? fallback : v; } catch (e) { return fallback; }
    },
    write(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} },

    cfg() {
        const c = Object.assign({ timeoutMin: 5, shield: true }, this.read(this.CFG_KEY, {}));
        c.timeoutMin = Math.max(0, Number(c.timeoutMin) || 0);
        c.shield = c.shield !== false;
        return c;
    },
    saveCfg(patch) { const c = Object.assign(this.cfg(), patch || {}); this.write(this.CFG_KEY, c); this.renderPanel(); return c; },

    pinRecord() { const r = this.read(this.PIN_KEY, null); return r && r.hash && r.salt ? r : null; },
    hasPin() { return !!this.pinRecord(); },
    isLocked() { return this.locked; },
    cryptoOk() { return !!(window.crypto && crypto.subtle && window.isSecureContext); },

    lastActive() { return Number(localStorage.getItem(this.ACTIVE_KEY)) || 0; },
    touch(force) {
        if (this.locked) return;
        const now = Date.now();
        if (!force && now - this._lastTouch < 5000) return;   // throttled
        this._lastTouch = now;
        try { localStorage.setItem(this.ACTIVE_KEY, String(now)); } catch (e) {}
    },
    idleExpired() {
        const ms = this.cfg().timeoutMin * 60000;
        return Date.now() - this.lastActive() >= ms;
    },

    fails() { return Object.assign({ count: 0, until: 0 }, this.read(this.FAIL_KEY, {})); },
    lockoutLeft() { return Math.max(0, (Number(this.fails().until) || 0) - Date.now()); },

    /* ---------- crypto ---------- */
    b64(buf) { return btoa(String.fromCharCode.apply(null, new Uint8Array(buf))); },
    unb64(str) { return Uint8Array.from(atob(str), c => c.charCodeAt(0)); },

    async derive(pin, saltBytes, iter) {
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
        const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: iter, hash: 'SHA-256' }, key, 256);
        return this.b64(bits);
    },

    async checkPin(pin) {
        const rec = this.pinRecord();
        if (!rec) return false;
        const got = await this.derive(pin, this.unb64(rec.salt), rec.iter || this.ITER);
        // constant-time-ish comparison
        let diff = got.length ^ rec.hash.length;
        for (let i = 0; i < Math.max(got.length, rec.hash.length); i++) diff |= (got.charCodeAt(i) || 0) ^ (rec.hash.charCodeAt(i) || 0);
        return diff === 0;
    },

    async storePin(pin) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await this.derive(pin, salt, this.ITER);
        this.write(this.PIN_KEY, { v: 1, salt: this.b64(salt), hash: hash, iter: this.ITER, len: String(pin).length, at: Date.now() });
    },

    validPinFormat(pin) { return /^\d{4,8}$/.test(String(pin || '')); },

    /* ---------- boot ---------- */
    init() {
        this.ensureDom();
        this.setInert();          // clear anything a previous build froze
        this.buildDots();
        this.bindKeypad();

        if ('BroadcastChannel' in window) {
            try {
                this.channel = new BroadcastChannel('btw-lock');
                this.channel.onmessage = (ev) => this.onRemote(ev.data || {});
            } catch (e) { this.channel = null; }
        }
        window.addEventListener('storage', (e) => {
            if (e.key === this.STATE_KEY) {
                const st = this.read(this.STATE_KEY, {});
                this.onRemote({ type: st.locked ? 'lock' : 'unlock' });
            } else if (e.key === this.PIN_KEY || e.key === this.CFG_KEY) {
                this.onRemote({ type: 'pin-changed' });
            } else if (e.key === this.FAIL_KEY && this.locked) {
                this.renderLockout();
            }
        });

        ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(ev =>
            document.addEventListener(ev, () => this.touch(false), { passive: true, capture: true }));

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.onHide(); else this.onShow();
        });
        // Fail-safes: the shield only belongs on screen while the page is
        // actually hidden. Any focus or tap on a visible page clears it.
        window.addEventListener('focus', () => { if (!document.hidden) this.clearShield(); });
        const sh = document.getElementById('privacyShield');
        if (sh) sh.addEventListener('pointerdown', () => this.clearShield());
        setInterval(() => { if (!document.hidden && document.body.classList.contains('is-shielded')) this.clearShield(); }, 3000);
        window.addEventListener('pagehide', () => this.onHide());
        window.addEventListener('pageshow', () => { if (!document.hidden) this.onShow(); });

        document.addEventListener('keydown', (e) => this.onKey(e), true);

        setInterval(() => this.idleCheck(), 10000);

        // Start locked if a PIN is set and either another tab is locked or
        // the app has been idle past the timeout (e.g. freshly reopened).
        if (this.hasPin()) {
            const st = this.read(this.STATE_KEY, {});
            if (st.locked || this.idleExpired()) this.lock('boot', false);
            else this.touch(true);
        }
        this.updateLockButton();
    },

    /* ---------- shield ---------- */
    onHide() {
        if (this.cfg().shield || this.hasPin()) document.body.classList.add('is-shielded');
    },

    onShow() {
        if (this.hasPin() && !this.locked && this.idleExpired()) this.lock('idle');
        // tiny delay so the shield is still up during the OS "return" animation
        setTimeout(() => this.clearShield(), 60);
        if (this.locked) this.renderLockout();
    },

    clearShield() {
        if (document.hidden) return;
        if (this.hasPin() && !this.locked && this.idleExpired()) { this.lock('idle'); }
        document.body.classList.remove('is-shielded');
    },

    idleCheck() {
        const c = this.cfg();
        if (!this.hasPin() || this.locked || c.timeoutMin === 0 || document.hidden) return;
        if (this.idleExpired()) this.lock('idle');
    },

    /* ---------- lock / unlock ---------- */
    lock(reason, broadcast = true) {
        if (!this.hasPin()) return;
        // Without WebCrypto (plain http) the PIN can never be verified, so
        // locking would trap the user behind a keypad that always says wrong.
        if (!this.cryptoOk()) return;
        try { this._lock(reason, broadcast); }
        catch (e) {
            // Never leave the app half-locked: undo and report.
            console.error('Lock failed', e);
            this.locked = false;
            document.body.classList.remove('is-locked');
            this.showLockDom(false);
            this.setInert();
        }
    },

    _lock(reason, broadcast) {
        const already = this.locked;
        this.ensureDom();
        this.locked = true;
        this.entry = '';
        this.buildDots();
        document.body.classList.add('is-locked');
        this.showLockDom(true);
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        const sub = document.getElementById('lockSub');
        if (sub) sub.textContent = reason === 'idle' ? 'Locked after inactivity — enter your PIN' : 'Enter your PIN';
        this.bindKeypad();
        this.renderLockout();
        if (!already) {
            this.write(this.STATE_KEY, { locked: true, ts: Date.now() });
            if (broadcast && this.channel) this.channel.postMessage({ type: 'lock' });
        }
    },

    lockNow() {
        if (!this.hasPin()) { app.showToast('Set a PIN first in Config → Security', 'info'); return; }
        this.lock('manual');
    },

    unlock(broadcast = true) {
        this.locked = false;
        this.entry = '';
        document.body.classList.remove('is-locked', 'is-shielded');
        this.showLockDom(false);
        this.setInert();
        clearInterval(this._countdown); this._countdown = null;
        this.write(this.STATE_KEY, { locked: false, ts: Date.now() });
        this.touch(true);
        if (broadcast && this.channel) this.channel.postMessage({ type: 'unlock' });
        if (window.app && app.processEngine) setTimeout(() => app.processEngine(), 200);
    },

    onRemote(msg) {
        if (msg.type === 'lock') { if (!this.locked) this.lock('remote', false); }
        else if (msg.type === 'unlock') { if (this.locked) this.unlock(false); }
        else if (msg.type === 'pin-changed') {
            if (!this.hasPin() && this.locked) this.unlock(false);
            this.buildDots(); this.renderPanel(); this.updateLockButton();
        }
    },

    // The full-screen overlay already blocks every tap; the page underneath
    // is NEVER made inert. (An earlier build did, and if the lock screen
    // failed to appear — e.g. an old cached index.html — the whole app was
    // left frozen.) This only cleans up anything that build left behind.
    setInert() {
        document.querySelectorAll('[inert]').forEach(el => {
            if (el.id === 'lockScreen') return;
            el.removeAttribute('inert');
            el.removeAttribute('aria-hidden');
        });
    },

    // Builds the shield + lock screen if this page's HTML doesn't have them
    // (version mismatch), so locking can never happen without a visible,
    // working keypad on top.
    ensureDom() {
        if (!document.getElementById('privacyShield')) {
            const sh = document.createElement('div');
            sh.className = 'privacy-shield'; sh.id = 'privacyShield'; sh.setAttribute('aria-hidden', 'true');
            sh.innerHTML = '<div class="shield-text">Banking Work Tracker</div>';
            document.body.appendChild(sh);
        }
        if (!document.getElementById('lockScreen')) {
            const ls = document.createElement('div');
            ls.className = 'lock-screen'; ls.id = 'lockScreen';
            ls.setAttribute('role', 'dialog'); ls.setAttribute('aria-modal', 'true');
            ls.innerHTML = '<div class="lock-card" id="lockCard"><div class="lock-title" id="lockTitle">App Locked</div>' +
                '<div class="lock-sub" id="lockSub">Enter your PIN</div><div class="lock-dots" id="lockDots"></div>' +
                '<div class="lock-msg" id="lockMsg"></div><div class="lock-pad" id="lockPad">' +
                ['1','2','3','4','5','6','7','8','9','ok','0','del'].map(k => '<button type="button" data-k="' + k + '"' +
                    (k === 'ok' || k === 'del' ? ' class="k-fn"' : '') + '>' + (k === 'ok' ? 'OK' : k === 'del' ? '⌫' : k) + '</button>').join('') +
                '</div><button type="button" class="lock-link" onclick="security.forgotPin()">Forgot PIN?</button></div>';
            document.body.appendChild(ls);
        }
        // Minimal inline styling so it works even without this build's CSS.
        const ls = document.getElementById('lockScreen');
        if (ls && getComputedStyle(ls).position !== 'fixed') {
            ls.style.cssText = 'position:fixed;inset:0;z-index:30001;display:none;align-items:center;justify-content:center;background:rgba(242,242,247,0.97);';
            ls.dataset.inlineStyled = '1';
        }
    },

    showLockDom(on) {
        const ls = document.getElementById('lockScreen');
        if (ls && ls.dataset.inlineStyled) ls.style.display = on ? 'flex' : 'none';
    },

    /* ---------- keypad ---------- */
    pinLength() { const r = this.pinRecord(); return (r && r.len) || 0; },

    buildDots() {
        const box = document.getElementById('lockDots');
        if (!box) return;
        const n = this.pinLength() || 4;
        box.innerHTML = '<i></i>'.repeat(n);
        this.renderDots();
    },

    renderDots() {
        const dots = document.querySelectorAll('#lockDots i');
        dots.forEach((d, i) => d.classList.toggle('on', i < this.entry.length));
    },

    bindKeypad() {
        const pad = document.getElementById('lockPad');
        if (!pad || pad._bound) return;
        pad._bound = true;
        pad.addEventListener('click', (e) => {
            const b = e.target.closest('button[data-k]');
            if (b) this.press(b.dataset.k);
        });
    },

    onKey(e) {
        if (!this.locked) return;
        const ls = document.getElementById('lockScreen');
        if (ls && e.target && e.target.closest && !e.target.closest('#lockScreen') && e.target !== document.body) {
            try { e.target.blur(); } catch (err) {}
        }
        if (/^\d$/.test(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); this.press(e.key); }
        else if (e.key === 'Backspace') { e.preventDefault(); e.stopImmediatePropagation(); this.press('del'); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.press('ok'); }
        else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); }
    },

    press(k) {
        if (!this.locked || this.busy || this.lockoutLeft() > 0) return;
        const max = this.pinLength() || 8;
        if (k === 'del') this.entry = this.entry.slice(0, -1);
        else if (k === 'ok') { if (this.entry.length >= 4) this.submit(); return; }
        else if (/^\d$/.test(k) && this.entry.length < max) this.entry += k;
        document.getElementById('lockMsg').textContent = '';
        this.renderDots();
        if (this.pinLength() && this.entry.length === this.pinLength()) this.submit();
    },

    async submit() {
        if (this.busy) return;
        this.busy = true;
        const attempt = this.entry;
        let ok = false;
        try { ok = await this.checkPin(attempt); } catch (e) { ok = false; }
        this.busy = false;
        if (ok) {
            this.write(this.FAIL_KEY, { count: 0, until: 0 });
            this.unlock(true);
            return;
        }
        const f = this.fails();
        f.count = (Number(f.count) || 0) + 1;
        if (f.count >= this.MAX_TRIES) { f.until = Date.now() + this.LOCKOUT_MS; f.count = 0; }
        this.write(this.FAIL_KEY, f);
        this.entry = '';
        this.renderDots();
        const card = document.getElementById('lockCard');
        if (card) { card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); }
        if (navigator.vibrate) { try { navigator.vibrate(120); } catch (e) {} }
        if (f.until > Date.now()) this.renderLockout();
        else document.getElementById('lockMsg').textContent = 'Wrong PIN · ' + (this.MAX_TRIES - f.count) + ' ' + ((this.MAX_TRIES - f.count) === 1 ? 'try' : 'tries') + ' left';
    },

    renderLockout() {
        const pad = document.getElementById('lockPad');
        const msg = document.getElementById('lockMsg');
        const left = this.lockoutLeft();
        clearInterval(this._countdown); this._countdown = null;
        if (left <= 0) { if (pad) pad.classList.remove('disabled'); return; }
        if (pad) pad.classList.add('disabled');
        const tick = () => {
            const s = Math.ceil(this.lockoutLeft() / 1000);
            if (s <= 0) {
                clearInterval(this._countdown); this._countdown = null;
                if (pad) pad.classList.remove('disabled');
                if (msg) msg.textContent = '';
                return;
            }
            if (msg) msg.textContent = 'Too many wrong tries · try again in ' + s + 's';
        };
        tick();
        this._countdown = setInterval(tick, 500);
    },

    // Keys that are only looks / preferences, so they survive a PIN reset.
    RESET_KEEP: ['pureEnergyTheme', 'pureEnergyTextSize', 'pureEnergyShell', 'pureEnergyView', 'pureEnergyAlarmSound'],

    forgotPin() {
        if (!confirm('Reset PIN?\n\nFor safety this erases everything stored on this device — your entries, lists, ' +
            'holidays AND the Cloud Sync link — and removes the PIN. Without the PIN, the cloud copy is not ' +
            'reachable from this device until you paste your script URL again in Config → Cloud Sync → Connection.\n\n' +
            'Anything not yet synced will be lost. Continue?')) return;
        try {
            const doomed = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.indexOf('pureEnergy') === 0 && this.RESET_KEEP.indexOf(k) === -1) doomed.push(k);
            }
            doomed.forEach(k => localStorage.removeItem(k));
            try { sessionStorage.clear(); } catch (e) {}
            this.write(this.STATE_KEY, { locked: false, ts: Date.now() });
        } catch (e) {}
        if (this.channel) this.channel.postMessage({ type: 'pin-changed' });
        window.location.reload();
    },

    updateLockButton() {
        const b = document.getElementById('lockNowBtn');
        if (b) b.hidden = !this.hasPin();
    },

    /* ---------- Config → Security panel ---------- */
    renderPanel() {
        const box = document.getElementById('securityPanelBody');
        if (!box) return;
        const has = this.hasPin();
        const c = this.cfg();
        const opts = this.TIMEOUTS.map(([v, l]) => `<option value="${v}"${v === c.timeoutMin ? ' selected' : ''}>${l}</option>`).join('');
        const pinField = (id, ph) => `<input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" id="${id}" placeholder="${ph}">`;

        if (!this.cryptoOk()) {
            box.innerHTML = '<p class="cfg-hint">PIN lock needs the app to be opened over HTTPS (or as the installed app). The privacy blur below still works.</p>';
        } else {
            box.innerHTML = `
                <div class="sec-status"><span class="dot" style="background:${has ? 'var(--green)' : 'var(--label-2)'}"></span>${has ? 'PIN lock is on' : 'No PIN set'}</div>
                <div class="sec-block">
                    <h4>${has ? 'Change PIN' : 'Set a PIN'}</h4>
                    <div class="sec-grid">
                        ${has ? pinField('secCurPin', 'Current PIN') : ''}
                        ${pinField('secNewPin', 'New PIN (4–8 digits)')}
                        ${pinField('secNewPin2', 'Confirm new PIN')}
                    </div>
                    <div class="sec-actions">
                        <button type="button" class="btn-modal primary" onclick="security.savePinFromPanel()">${has ? 'Change PIN' : 'Set PIN'}</button>
                        ${has ? '<button type="button" class="btn-modal secondary" onclick="security.lockNow()">Lock now</button>' : ''}
                        ${has ? '<button type="button" class="btn-modal danger" onclick="security.removePinFromPanel()">Remove PIN</button>' : ''}
                    </div>
                </div>`;
        }
        box.innerHTML += `
            <div class="sec-block">
                <h4>Behaviour</h4>
                <div class="sec-grid">
                    <label class="walk-field">Auto-lock after inactivity<select id="secTimeout" onchange="security.saveCfg({ timeoutMin: Number(this.value) })">${opts}</select></label>
                </div>
                <div class="sec-toggle" style="margin-top:12px;">
                    <span>Blur screen when switching apps / tabs</span>
                    <input type="checkbox" id="secShield" ${c.shield ? 'checked' : ''} ${has ? 'disabled title="Always on while a PIN is set"' : ''} onchange="security.saveCfg({ shield: this.checked })">
                </div>
            </div>`;
        if (window.app && app.noAutofill) app.noAutofill(box);
    },

    async savePinFromPanel() {
        const val = (id) => { const el = document.getElementById(id); return el ? el.value.trim() : ''; };
        const cur = val('secCurPin'), p1 = val('secNewPin'), p2 = val('secNewPin2');
        if (this.hasPin()) {
            if (this.lockoutLeft() > 0) { app.showToast('Too many wrong tries — wait ' + Math.ceil(this.lockoutLeft() / 1000) + 's', 'warning'); return; }
            if (!(await this.checkPin(cur))) {
                const f = this.fails(); f.count = (Number(f.count) || 0) + 1;
                if (f.count >= this.MAX_TRIES) { f.until = Date.now() + this.LOCKOUT_MS; f.count = 0; }
                this.write(this.FAIL_KEY, f);
                app.showToast('Current PIN is wrong', 'error'); return;
            }
        }
        if (!this.validPinFormat(p1)) { app.showToast('PIN must be 4 to 8 digits', 'warning'); return; }
        if (p1 !== p2) { app.showToast('The two new PINs do not match', 'warning'); return; }
        await this.storePin(p1);
        this.write(this.FAIL_KEY, { count: 0, until: 0 });
        this.touch(true);
        this.buildDots(); this.renderPanel(); this.updateLockButton();
        if (this.channel) this.channel.postMessage({ type: 'pin-changed' });
        app.showToast('PIN saved. The app will lock after ' + (this.TIMEOUTS.find(t => t[0] === this.cfg().timeoutMin) || [0, 'the set time'])[1].toLowerCase() + ' of inactivity.', 'success');
    },

    async removePinFromPanel() {
        const el = document.getElementById('secCurPin');
        const cur = el ? el.value.trim() : '';
        if (this.lockoutLeft() > 0) { app.showToast('Too many wrong tries — wait ' + Math.ceil(this.lockoutLeft() / 1000) + 's', 'warning'); return; }
        if (!cur) { app.showToast('Enter your current PIN to remove it', 'info'); if (el) el.focus(); return; }
        if (!(await this.checkPin(cur))) { app.showToast('Current PIN is wrong', 'error'); return; }
        localStorage.removeItem(this.PIN_KEY);
        this.write(this.FAIL_KEY, { count: 0, until: 0 });
        this.renderPanel(); this.updateLockButton();
        if (this.channel) this.channel.postMessage({ type: 'pin-changed' });
        app.showToast('PIN removed', 'info');
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
                this.reloadWhenSafe();
            });
            // While a form is open, an update (or the reload that follows it)
            // waits here and runs a moment after the form closes.
            setInterval(() => this.runPendingUpdate(), 2000);

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

    editorBusy() {
        return typeof app !== 'undefined' && typeof app.editorOpen === 'function' && app.editorOpen();
    },

    // Reloads now, or as soon as no entry form is open — never while one is.
    reloadWhenSafe() {
        if (this.reloading) return;
        if (this.editorBusy()) {
            if (!this._reloadQueued && typeof app !== 'undefined' && app.showToast) {
                app.showToast('Update ready — the app refreshes when you close this form.', 'info');
            }
            this._reloadQueued = true;
            return;
        }
        this.reloading = true;
        window.location.reload();
    },

    runPendingUpdate() {
        if (this.editorBusy()) return;
        if (this._reloadQueued) { this._reloadQueued = false; this.reloadWhenSafe(); return; }
        if (this._updateQueued) { this._updateQueued = false; this.applyUpdate(); }
    },

    applyUpdate() {
        if (this.editorBusy()) {
            // Don't swap files under a half-filled entry: finish first, then update.
            this._updateQueued = true;
            if (typeof app !== 'undefined' && app.showToast) app.showToast('Finish and save this entry — the update installs right after.', 'warning');
            return;
        }
        const worker = this.waitingWorker || (this.reg && this.reg.waiting);
        if (!worker) { this.reloadWhenSafe(); return; }
        if (typeof app !== 'undefined' && app.showToast) app.showToast('Updating…', 'info');
        worker.postMessage({ type: 'SKIP_WAITING' });
        // If the worker does not hand over within a few seconds, reload anyway
        // (still not while a form is open).
        setTimeout(() => this.reloadWhenSafe(), 4000);
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

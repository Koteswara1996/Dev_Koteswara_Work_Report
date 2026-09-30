/* ==========================================================================
   BANKING WORK TRACKER — PRODUCTION APP.JS
   ========================================================================== */

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
    BASE_DELETED_IDS_KEY: 'pureEnergyDeletedIds',
    get STORAGE_KEY() { return `${this.BASE_STORAGE_KEY}_${app.currentUser}`; },
    get LISTS_KEY() { return `${this.BASE_LISTS_KEY}_${app.currentUser}`; },
    get LISTS_TS_KEY() { return `${this.BASE_LISTS_TS_KEY}_${app.currentUser}`; },
    get HOLIDAYS_KEY() { return `${this.BASE_HOLIDAYS_KEY}_${app.currentUser}`; },
    get HOLIDAYS_TS_KEY() { return `${this.BASE_HOLIDAYS_TS_KEY}_${app.currentUser}`; },
    get HOLIDAY_ACK_KEY() { return `${this.BASE_HOLIDAY_ACK_KEY}_${app.currentUser}`; },
    get CUSTOM_CALENDARS_KEY() { return `${this.BASE_CUSTOM_CALENDARS_KEY}_${app.currentUser}`; },
    get LEAVE_DAYS_KEY() { return `${this.BASE_LEAVE_DAYS_KEY}_${app.currentUser}`; },
    get DEADLINE_ACK_KEY() { return `${this.BASE_DEADLINE_ACK_KEY}_${app.currentUser}`; },
    get DELETED_IDS_KEY() { return `${this.BASE_DELETED_IDS_KEY}_${app.currentUser}`; }
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
    
    // Sync & State Management
    cycleBusy: false, syncNeeded: false, _syncDebounceTimer: null,
    selectMode: false, selected: [],
    
    // Seed Holiday Calendar
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

    holidays: [],
    editingHolidayId: null,
    holidaysUpdatedAt: 0,

    SYNC_EVERY_MS: 45000,
    SLOT_HOLD_MINS: 30,

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

    getAuthToken() {
        return localStorage.getItem(CONFIG.TOKEN_KEY) || 'PureEnergySecure2026';
    },

    /* ---------- SECURITY SUBSYSTEM ---------- */
    security: {
        isLocked: false,
        pinBuffer: '',
        isVerifying: false,
        lastActivity: Date.now(),
        inactivityTimer: null,

        keys: {
            pinHash: 'btw_sec_pin_hash',
            pinSalt: 'btw_sec_pin_salt',
            timeout: 'btw_sec_timeout',
            bioEnabled: 'btw_sec_bio_enabled',
            bioCred: 'btw_sec_bio_cred',
            isLocked: 'btw_sec_locked_state',
            lockoutUntil: 'btw_sec_lockout_until',
            failedAttempts: 'btw_sec_failed_attempts'
        },

        async sha256(str) {
            if (window.crypto && window.crypto.subtle && window.crypto.subtle.digest) {
                try {
                    const buf = new TextEncoder().encode(str);
                    const digest = await crypto.subtle.digest('SHA-256', buf);
                    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
                } catch (e) {}
            }
            return this.sha256Fallback(str);
        },

        sha256Fallback(ascii) {
            function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
            var mathPow = Math.pow, maxWord = mathPow(2, 32);
            var i, j, result = '', words = [], asciiBitLength = ascii.length * 8;
            var hash = [], k = [], primeCounter = 0, isComposite = {};

            for (var candidate = 2; primeCounter < 64; candidate++) {
                if (!isComposite[candidate]) {
                    for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
                    hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
                    k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
                }
            }

            ascii += '\x80';
            while (ascii.length % 64 - 56) ascii += '\x00';
            for (i = 0; i < ascii.length; i++) {
                j = ascii.charCodeAt(i);
                words[i >> 2] |= j << ((3 - i) % 4) * 8;
            }
            words[words.length] = ((asciiBitLength / maxWord) | 0);
            words[words.length] = (asciiBitLength | 0);

            for (j = 0; j < words.length;) {
                var w = words.slice(j, j += 16), oldHash = hash;
                hash = hash.slice(0, 8);
                for (i = 0; i < 64; i++) {
                    var w15 = w[i - 15], w2 = w[i - 2];
                    var s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
                    var s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
                    w[i] = (i < 16) ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0;

                    var s1_h = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
                    var ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
                    var temp1 = (hash[7] + s1_h + ch + k[i] + w[i]) | 0;
                    var s0_h = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
                    var maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
                    var temp2 = (s0_h + maj) | 0;

                    hash = [(temp1 + temp2) | 0].concat(hash);
                    hash[4] = (hash[4] + temp1) | 0;
                }
                for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
            }

            for (i = 0; i < 8; i++) {
                for (j = 3; j >= 0; j--) {
                    var b = (hash[i] >> (8 * j)) & 255;
                    result += (b < 16 ? '0' : '') + b.toString(16);
                }
            }
            return result;
        },

        init() {
            this.updateUiStatus();
            this.bindActivityListeners();
            this.setupShortcuts();

            const savedTimeout = localStorage.getItem(this.keys.timeout);
            if (savedTimeout !== null) {
                const el = document.getElementById('cfgAutoLock');
                if (el) el.value = savedTimeout;
            }

            if (this.hasPin() && localStorage.getItem(this.keys.isLocked) === 'true') {
                this.lock(false);
            }

            document.addEventListener('visibilitychange', () => {
                if (!this.hasPin()) return;
                const timeoutMins = this.getTimeoutMinutes();

                if (document.hidden) {
                    document.body.classList.add('privacy-obscured');
                } else {
                    document.body.classList.remove('privacy-obscured');
                    if (timeoutMins > 0 && !this.isLocked) {
                        const elapsedMins = (Date.now() - this.lastActivity) / 60000;
                        if (elapsedMins >= timeoutMins) {
                            this.lock(true);
                        }
                    }
                }
            });

            window.addEventListener('storage', (e) => {
                if (e.key === this.keys.isLocked) {
                    if (e.newValue === 'true' && !this.isLocked) this.lock(false);
                    else if (e.newValue === 'false' && this.isLocked) this.unlock();
                }
            });
        },

        hasPin() { return !!localStorage.getItem(this.keys.pinHash); },

        getTimeoutMinutes() {
            const val = localStorage.getItem(this.keys.timeout);
            return val !== null ? Number(val) : 5;
        },

        async setPin(pin) {
            if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits');
            const salt = crypto.getRandomValues(new Uint8Array(16)).join('');
            const hash = await this.sha256(salt + pin);
            localStorage.setItem(this.keys.pinSalt, salt);
            localStorage.setItem(this.keys.pinHash, hash);
            this.updateUiStatus();
        },

        async verifyPin(pin) {
            const salt = localStorage.getItem(this.keys.pinSalt) || '';
            const expectedHash = localStorage.getItem(this.keys.pinHash);
            const computed = await this.sha256(salt + pin);
            return computed === expectedHash;
        },

        removePin() {
            localStorage.removeItem(this.keys.pinHash);
            localStorage.removeItem(this.keys.pinSalt);
            localStorage.removeItem(this.keys.bioEnabled);
            localStorage.removeItem(this.keys.bioCred);
            localStorage.removeItem(this.keys.isLocked);
            localStorage.removeItem(this.keys.lockoutUntil);
            localStorage.removeItem(this.keys.failedAttempts);
            this.updateUiStatus();
        },

        promptSetPin() {
            if (this.hasPin()) {
                const current = prompt('Enter CURRENT 4-digit PIN:');
                if (!current) return;
                this.verifyPin(current).then(valid => {
                    if (!valid) { app.showToast('Incorrect PIN', 'error'); return; }
                    const next = prompt('Enter NEW 4-digit PIN (leave empty to remove):');
                    if (next === null) return;
                    if (next.trim() === '') {
                        this.removePin();
                        app.showToast('Security PIN removed', 'success');
                    } else {
                        this.setPin(next.trim()).then(() => app.showToast('New PIN configured', 'success'))
                            .catch(err => app.showToast(err.message, 'warning'));
                    }
                });
            } else {
                const pin = prompt('Enter 4-digit PIN for privacy lock:');
                if (!pin) return;
                this.setPin(pin.trim()).then(() => app.showToast('Security PIN active', 'success'))
                    .catch(err => app.showToast(err.message, 'warning'));
            }
        },

        updateUiStatus() {
            const has = this.hasPin();
            const pinLbl = document.getElementById('pinCfgStatus');
            if (pinLbl) pinLbl.textContent = has ? 'Change PIN' : 'Set PIN';
            const bioBtn = document.getElementById('cfgBioBtn');
            const bioOn = localStorage.getItem(this.keys.bioEnabled) === 'true';
            if (bioBtn) {
                bioBtn.style.opacity = has ? '1' : '0.5';
                bioBtn.textContent = bioOn ? 'Biometrics On' : 'Biometrics Off';
            }
        },

        async toggleBiometrics() {
            if (!this.hasPin()) {
                app.showToast('Set a 4-digit PIN first', 'warning');
                return;
            }
            if (!window.PublicKeyCredential) {
                app.showToast('Biometrics not supported on this browser', 'warning');
                return;
            }

            const current = localStorage.getItem(this.keys.bioEnabled) === 'true';
            if (current) {
                localStorage.setItem(this.keys.bioEnabled, 'false');
                localStorage.removeItem(this.keys.bioCred);
                this.updateUiStatus();
                app.showToast('Biometric lock disabled', 'info');
                return;
            }

            try {
                const challenge = crypto.getRandomValues(new Uint8Array(32));
                const userId = crypto.getRandomValues(new Uint8Array(16));

                const credential = await navigator.credentials.create({
                    publicKey: {
                        challenge: challenge,
                        rp: { name: "Banking Work Tracker" },
                        user: {
                            id: userId,
                            name: app.currentUser || 'treasury_user',
                            displayName: "Treasury Session (" + (app.currentUser || 'default') + ")"
                        },
                        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
                        authenticatorSelection: { 
                            authenticatorAttachment: "platform", 
                            userVerification: "required",
                            residentKey: "preferred"
                        },
                        timeout: 60000
                    }
                });

                if (credential && credential.id) {
                    localStorage.setItem(this.keys.bioCred, credential.id);
                    localStorage.setItem(this.keys.bioEnabled, 'true');
                    this.updateUiStatus();
                    app.showToast('Biometrics active', 'success');
                }
            } catch (err) {
                app.showToast('Biometric registration cancelled or unsupported', 'warning');
            }
        },

        lock(toast = true) {
            if (!this.hasPin()) return;
            if (document.activeElement && typeof document.activeElement.blur === 'function') {
                document.activeElement.blur();
            }

            if (app.alarmInterval) { clearInterval(app.alarmInterval); app.alarmInterval = null; }
            if (app.alarmSoundTimeout) { clearTimeout(app.alarmSoundTimeout); app.alarmSoundTimeout = null; }

            this.isLocked = true;
            this.pinBuffer = '';
            this.isVerifying = false;
            localStorage.setItem(this.keys.isLocked, 'true');

            const overlay = document.getElementById('privacyLockOverlay');
            if (overlay) {
                this.updateDots();
                overlay.classList.add('active');
            }

            const bioBtn = document.getElementById('bioUnlockBtn');
            const bioEnabled = localStorage.getItem(this.keys.bioEnabled) === 'true';
            if (bioBtn) bioBtn.style.visibility = bioEnabled ? 'visible' : 'hidden';

            if (toast) app.showToast('Session locked for privacy', 'info');
        },

        unlock() {
            this.isLocked = false;
            this.pinBuffer = '';
            this.isVerifying = false;
            localStorage.setItem(this.keys.isLocked, 'false');
            this.lastActivity = Date.now();
            this.updateDots();

            const overlay = document.getElementById('privacyLockOverlay');
            if (overlay) overlay.classList.remove('active');
            app.showToast('Session unlocked', 'success');
        },

        enterDigit(digit) {
            if (this.isVerifying || this.pinBuffer.length >= 4) return;

            const lockoutUntil = Number(localStorage.getItem(this.keys.lockoutUntil)) || 0;
            if (Date.now() < lockoutUntil) {
                const waitSecs = Math.ceil((lockoutUntil - Date.now()) / 1000);
                app.showToast(`Keypad locked. Wait ${waitSecs}s`, 'warning');
                return;
            }

            this.pinBuffer += digit;
            this.updateDots();

            if (this.pinBuffer.length === 4) {
                this.isVerifying = true;
                setTimeout(async () => {
                    try {
                        const valid = await this.verifyPin(this.pinBuffer);
                        if (valid) {
                            localStorage.removeItem(this.keys.failedAttempts);
                            localStorage.removeItem(this.keys.lockoutUntil);
                            this.unlock();
                        } else {
                            let failed = (Number(localStorage.getItem(this.keys.failedAttempts)) || 0) + 1;
                            localStorage.setItem(this.keys.failedAttempts, String(failed));
                            this.pinBuffer = '';
                            this.updateDots();

                            if (failed >= 5) {
                                const lockExpiry = Date.now() + 30000;
                                localStorage.setItem(this.keys.lockoutUntil, String(lockExpiry));
                                app.showToast('5 incorrect entries. Keypad locked for 30s', 'error');
                            } else {
                                app.showToast(`Incorrect PIN (${5 - failed} attempts left)`, 'error');
                            }
                        }
                    } finally {
                        this.isVerifying = false;
                    }
                }, 120);
            }
        },

        clearPin() {
            if (this.isVerifying) return;
            this.pinBuffer = this.pinBuffer.slice(0, -1);
            this.updateDots();
        },

        updateDots() {
            const dots = document.querySelectorAll('#pinDots .lock-dot');
            dots.forEach((dot, idx) => {
                dot.classList.toggle('filled', idx < this.pinBuffer.length);
            });
        },

        async unlockWithBiometrics() {
            if (!window.PublicKeyCredential || localStorage.getItem(this.keys.bioEnabled) !== 'true') {
                app.showToast('Biometrics not configured', 'warning');
                return;
            }
            try {
                const challenge = crypto.getRandomValues(new Uint8Array(32));
                const credId = localStorage.getItem(this.keys.bioCred);

                const getOptions = { challenge: challenge, timeout: 60000, userVerification: 'required' };
                if (credId) {
                    let b64 = credId.replace(/-/g, '+').replace(/_/g, '/');
                    while (b64.length % 4) b64 += '=';
                    const rawId = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
                    getOptions.allowCredentials = [{ id: rawId, type: 'public-key' }];
                }

                const assertion = await navigator.credentials.get({ publicKey: getOptions });
                if (assertion) this.unlock();
            } catch (err) {
                app.showToast('Biometric verification cancelled', 'info');
            }
        },

        forgotPin() {
            if (confirm('Reset security PIN on this device? Your task database will remain intact.')) {
                if (prompt('Type RESET to confirm clearing the lock:') === 'RESET') {
                    this.removePin();
                    this.unlock();
                    app.showToast('PIN removed. Set a new PIN in Configuration.', 'success');
                }
            }
        },

        bindActivityListeners() {
            let lastRecord = 0;
            const record = () => {
                const now = Date.now();
                if (now - lastRecord < 15000) return;
                lastRecord = now;
                this.lastActivity = now;
            };

            ['pointerdown', 'keydown', 'touchstart', 'wheel'].forEach(evt => {
                window.addEventListener(evt, record, { passive: true });
            });
        },

        setupShortcuts() {
            window.addEventListener('keydown', (e) => {
                if (this.isLocked) {
                    if (e.key === 'Tab') { e.preventDefault(); return; }
                    if (e.key >= '0' && e.key <= '9') { e.preventDefault(); this.enterDigit(e.key); }
                    else if (e.key === 'Backspace') { e.preventDefault(); this.clearPin(); }
                    return;
                }

                const openModal = document.querySelector('.modal.open');
                if (openModal) {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        const form = openModal.querySelector('form');
                        if (form) { e.preventDefault(); form.requestSubmit(); }
                    }
                    return;
                }

                if (e.target.matches('input, textarea, select, [contenteditable="true"]')) {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                        const form = e.target.closest('form');
                        if (form) { e.preventDefault(); form.requestSubmit(); }
                    }
                    return;
                }

                switch (e.key.toLowerCase()) {
                    case 'n': e.preventDefault(); app.openTaskModal(); break;
                    case 'l': if (this.hasPin()) { e.preventDefault(); this.lock(); } break;
                    case '1': app.switchTab('Dashboard'); break;
                    case '2': app.switchTab('Register'); break;
                    case '3': app.switchTab('Completed'); break;
                    case '4': app.switchTab('Holidays'); break;
                    case '5': app.switchTab('Config'); break;
                    case '6': app.switchTab('Bin'); break;
                }
            });
        }
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
        if (!d || !(d instanceof Date) || isNaN(d.getTime())) return '';
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    formatDateStr(dateStr, opts) {
        if (!dateStr) return '-';
        const p = String(dateStr).split('-').map(Number);
        if (p.length < 3 || !p[0] || !p[1] || !p[2]) return this.sanitize(String(dateStr));
        return new Date(p[0], p[1] - 1, p[2], 12, 0, 0).toLocaleDateString('en-GB', opts || { day: 'numeric', month: 'short', year: 'numeric' });
    },

    formatTimeStr(timeStr) {
        if (!timeStr) return '';
        const totalMins = this.parseTimeToMinutes(timeStr);
        if (totalMins === null) return '';
        const h24 = Math.floor(totalMins / 60);
        const mm = String(totalMins % 60).padStart(2, '0');
        return `${h24 % 12 || 12}:${mm} ${h24 >= 12 ? 'PM' : 'AM'}`;
    },

    getTaskDueDateTime(t) {
        if (!t || !t.dueDate) return null;
        const [year, month, day] = String(t.dueDate).split('-').map(Number);
        if (!year || !month || !day) return null;
        let hours = 23, minutes = 59, seconds = 59;
        if (t.dueTime) {
            const totalMins = this.parseTimeToMinutes(t.dueTime);
            if (totalMins !== null) {
                hours = Math.floor(totalMins / 60);
                minutes = totalMins % 60;
                seconds = 0;
            }
        }
        return new Date(year, month - 1, day, hours, minutes, seconds);
    },

    getTaskDeadlineDateTime(t) {
        if (!t || !t.deadlineDate) return null;
        const [year, month, day] = String(t.deadlineDate).split('-').map(Number);
        if (!year || !month || !day) return null;
        let hours = 23, minutes = 59, seconds = 59;
        if (t.deadlineTime) {
            const totalMins = this.parseTimeToMinutes(t.deadlineTime);
            if (totalMins !== null) {
                hours = Math.floor(totalMins / 60);
                minutes = totalMins % 60;
                seconds = 0;
            }
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

    /* ---------- NETWORK & SYNCHRONIZATION ---------- */
    cloudRequest(payload) {
        const SCRIPT_URL = (localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim();
        if (!SCRIPT_URL) return Promise.reject(new Error("Cloud URL is not configured"));
        
        const body = Object.assign({}, payload, {
            username: payload.username || this.currentUser,
            token: this.getAuthToken()
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        return fetch(SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(body),
            signal: controller.signal
        })
        .then(res => {
            clearTimeout(timeoutId);
            return res.json();
        })
        .then(data => {
            if (data && data.status === 'error' && data.message && data.message.includes('Unauthorized')) {
                throw new Error('Authentication failed. Check security token in Cloud Sync settings.');
            }
            return data;
        })
        .catch(err => {
            clearTimeout(timeoutId);
            if (err.name === 'AbortError') {
                throw new Error('Cloud sync connection timed out (20s).');
            }
            throw err;
        });
    },

    isUnstartedStatus(status) {
        return /not\s*(yet\s*)?start/i.test(String(status || '').trim());
    },

    reportDetailsFor(task, fallback) {
        let text = '';
        if (task && task.narration) {
            if (task.narration.reportText) text = task.narration.reportText;
            else if (task.narration.text) {
                let t = task.narration.text;
                if (task.mailChain && t.indexOf(task.mailChain) !== -1) {
                    t = t.split(task.mailChain).join('').trim();
                }
                text = t;
            }
        }
        if (!text && task && task.notes) text = task.notes;
        if (!text) text = fallback || '';

        if (task && Array.isArray(task.keyPoints) && task.keyPoints.length > 0) {
            const kpStr = task.keyPoints.map(kp => `${kp.key}: ${kp.value}`).join(' | ');
            if (kpStr && text.indexOf(kpStr) === -1) {
                text = text ? `${text} [${kpStr}]` : `[${kpStr}]`;
            }
        }
        return text;
    },

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
                actions.style.display = 'flex';
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
        this.copyToClipboard(text);
    },

    exportDailyReportExcel() {
        const out = document.getElementById('dailyReportOutput');
        const text = out ? out.textContent : '';
        if (!text) { this.showToast('Generate a report first.', 'warning'); return; }
        
        const date = document.getElementById('dailyReportDate').value || this.getLocalDateStr(new Date());
        
        if (typeof XLSX !== 'undefined') {
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
        } else {
            const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `Daily_Report_${date}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            this.showToast('Report downloaded.', 'success');
        }
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

    /* ---------- CONFIG TAB: sidebar-nav + single-panel shell ---------- */
    CFG_LAST_PANEL_KEY: 'pureEnergyCfgLastPanel',

    enterCfgTab() {
        const shell = document.getElementById('cfgShell');
        if (!shell) return;
        const last = localStorage.getItem(this.CFG_LAST_PANEL_KEY);
        const first = document.querySelector('.cfg-nav-item')?.dataset.cfgPanel;
        this.setCfgActivePanel(last || first, false);
        shell.classList.remove('showing-panel');
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

    /* ---------- BOOT & INITIALIZATION ---------- */
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
        this.security.init();
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

        if (this.tasks.length === 0) this.unifiedSync(false);

        this.engineInterval = setInterval(() => { this.processEngine(); }, 5000);
        setInterval(() => { this.updateHeader(); this.renderNudgeSettings(); this.checkHolidayAlerts(new Date()); }, 60000);
        setInterval(() => { this.syncCycle(); }, this.SYNC_EVERY_MS);
        setTimeout(() => this.syncCycle(), 2500);
        setTimeout(() => this.checkHolidayAlerts(new Date()), 3000);

        const unlockAudio = () => this.initAudio();
        ['click', 'keydown', 'touchstart'].forEach(evt => document.addEventListener(evt, unlockAudio, { passive: true, once: true }));

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

        const reposition = () => {
            const open = document.querySelector('.multi-select.open');
            if (open) this.positionDropdown(open.id);
            else this.closeDropdowns();
        };
        window.addEventListener('scroll', reposition, true);
        window.addEventListener('resize', reposition);
        this.updateNotifyState();
    },

    /* ---------- UNIFIED SYNC ---------- */
    triggerQuickSync() {
        if (this.cycleBusy) { this.syncNeeded = true; return; }
        clearTimeout(this._syncDebounceTimer);
        this._syncDebounceTimer = setTimeout(() => this.unifiedSync(false), 2000);
    },

    unifiedSync(manual = false) {
        if (!this.currentUser) return Promise.resolve();
        const syncUrl = (localStorage.getItem(CONFIG.SYNC_URL_KEY) || "").trim();
        if (!syncUrl || this.cycleBusy) {
            if (this.cycleBusy) this.syncNeeded = true;
            return Promise.resolve();
        }

        this.cycleBusy = true;
        const mark = document.getElementById('appMark');
        const saver = document.getElementById('saveStatus');
        if (mark) mark.classList.add('busy', 'transmitting');
        if (saver) {
            saver.classList.add('transmitting');
            saver.innerHTML = '<span class="dot" style="background:var(--accent)"></span> syncing...';
        }

        const deletedIdsToSend = this.getDeletedIds();
        const payload = {
            action: "unifiedSync",
            tasks: this.tasks,
            deletedIds: deletedIdsToSend,
            fullReplace: this.userClearedAll,
            lists: this.lists,
            listsUpdatedAt: this.listsUpdatedAt || 0,
            holidays: this.holidays,
            leaveDays: this.leaveDays,
            customCalendars: this.customCalendars,
            holidaysUpdatedAt: this.holidaysUpdatedAt || 0
        };

        return this.cloudRequest(payload)
            .then(data => {
                if (!data || data.status !== 'success') throw new Error(data?.message || 'Sync error');
                if (deletedIdsToSend.length) this.clearDeletedIds(deletedIdsToSend);
                this.userClearedAll = false;

                if (Array.isArray(data.tasks)) this.mergeTasks(data.tasks);
                this.applyRemoteLists(data.lists, data.listsUpdatedAt);
                
                this.saveData();
                this.populateDropdowns();
                this.renderTable();
                
                const timeStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
                if (saver) saver.innerHTML = `<span class="dot" style="background:var(--green)"></span> synced ${timeStr}`;
                if (manual) this.showToast('Cloud sync completed.', 'success');
            })
            .catch(err => {
                if (saver) saver.innerHTML = '<span class="dot" style="background:var(--red)"></span> local only';
                if (manual) this.showToast(err.message || 'Sync failed', 'error');
            })
            .finally(() => {
                this.cycleBusy = false;
                if (mark) mark.classList.remove('busy', 'transmitting');
                if (saver) saver.classList.remove('transmitting');
                if (this.syncNeeded && navigator.onLine) {
                    this.syncNeeded = false;
                    this.triggerQuickSync();
                }
            });
    },

    syncCycle() { if (!document.hidden) this.unifiedSync(false); },
    
    getDeletedIds() {
        try { return JSON.parse(localStorage.getItem(CONFIG.DELETED_IDS_KEY) || '[]'); } catch (e) { return []; }
    },
    addDeletedId(id) {
        const l = this.getDeletedIds();
        if (!l.includes(String(id))) { l.push(String(id)); localStorage.setItem(CONFIG.DELETED_IDS_KEY, JSON.stringify(l)); }
    },
    clearDeletedIds(ids = null) {
        if (!ids) { localStorage.setItem(CONFIG.DELETED_IDS_KEY, '[]'); return; }
        const r = this.getDeletedIds().filter(x => !ids.includes(x));
        localStorage.setItem(CONFIG.DELETED_IDS_KEY, JSON.stringify(r));
    },

    mergeTasks(remoteTasks) {
        const map = new Map();
        this.tasks.forEach(t => map.set(String(t.id), t));
        const del = new Set(this.getDeletedIds());
        let added = 0, updated = 0;

        (remoteTasks || []).forEach(r => {
            if (!r || !r.id || del.has(String(r.id))) return;
            const l = map.get(String(r.id));
            if (!l) { map.set(String(r.id), r); added++; }
            else if ((Number(r.updatedAt) || 0) > (Number(l.updatedAt) || 0)) {
                map.set(String(r.id), Object.assign({}, l, r)); updated++;
            }
        });
        this.tasks = Array.from(map.values());
        return { added, updated };
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

        this.userClearedAll = true;
        this.tasks = [];
        this.clearDeletedIds();
        this.saveData();

        this.unifiedSync(true).then(() => {
            this.showToast(`Restored from cloud`, "success");
        }).catch(err => {
            this.showToast(err.message || "Restore failed", "error");
        });
    },

    openSyncSetup() {
        const modal = document.getElementById('syncSetupModal');
        if (!modal) return;
        document.getElementById('syncUrlInput').value = localStorage.getItem(CONFIG.SYNC_URL_KEY) || '';
        const authEl = document.getElementById('authTokenInput');
        if(authEl) authEl.value = localStorage.getItem(CONFIG.TOKEN_KEY) || '';
        document.getElementById('gmailIndexInput').value = localStorage.getItem(CONFIG.GMAIL_INDEX_KEY) || '0';
        document.getElementById('profileInput').value = this.currentUser || 'default';
        modal.classList.add('open');
    },

    saveSyncUrlModal() {
        const url = (document.getElementById('syncUrlInput')?.value || '').trim();
        const token = (document.getElementById('authTokenInput')?.value || '').trim();
        const idx = (document.getElementById('gmailIndexInput')?.value || '0').trim();
        const profile = (document.getElementById('profileInput')?.value || '').trim().toLowerCase() || 'default';

        if (url && !/\/exec$/.test(url)) {
            this.showToast("Apps Script URL must end in /exec", "warning");
            return;
        }

        if (url) localStorage.setItem(CONFIG.SYNC_URL_KEY, url);
        if (token) localStorage.setItem(CONFIG.TOKEN_KEY, token);
        localStorage.setItem(CONFIG.GMAIL_INDEX_KEY, idx);

        if (profile !== this.currentUser) {
            localStorage.setItem('currentUser', profile);
            this.showToast('Profile changed. Reloading workspace...', 'info');
            setTimeout(() => window.location.reload(), 700);
            return;
        }

        document.getElementById('syncSetupModal')?.classList.remove('open');
        this.showToast('Settings saved.', 'success');
        this.unifiedSync(true);
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

        const q = "?action=fetchEmails&username=" + encodeURIComponent(this.currentUser || '') + "&token=" + encodeURIComponent(this.getAuthToken());

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
                  "&username=" + encodeURIComponent(this.currentUser || '') + "&token=" + encodeURIComponent(this.getAuthToken()), { method: 'GET' })
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
              "&username=" + encodeURIComponent(this.currentUser || '') + "&token=" + encodeURIComponent(this.getAuthToken()), { method: 'GET' })
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

    /* ---------- HEALTH NUDGES (walk / water) ---------- */
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

    /* ---------- TIME SLOTS & AVAILABILITY ENGINE ---------- */
    parseTimeToMinutes(timeStr) {
        if (!timeStr) return null;
        const clean = String(timeStr).trim().toLowerCase();
        const isPM = clean.includes('pm');
        const isAM = clean.includes('am');
        const parts = clean.replace(/[^\d:]/g, '').split(':').map(Number);
        if (!isFinite(parts[0])) return null;
        let h = parts[0];
        const m = isFinite(parts[1]) ? parts[1] : 0;
        if (isPM && h < 12) h += 12;
        if (isAM && h === 12) h = 0;
        return h * 60 + m;
    },

    slotClash(dueDate, dueTime, ignoreId = null) {
        const cfg = this.slotCfg();
        if (!cfg.on || !dueDate || !dueTime) return null;
        
        const targetMins = this.parseTimeToMinutes(dueTime);
        if (targetMins === null) return null;

        return this.tasks.find(t => {
            if (t.deleted || t.purged || t.status === 'Completed') return false;
            if (ignoreId && String(t.id) === String(ignoreId)) return false;
            if (t.dueDate !== dueDate || !t.dueTime) return false;

            const tMins = this.parseTimeToMinutes(t.dueTime);
            if (tMins === null) return false;

            return Math.abs(tMins - targetMins) < cfg.minutes;
        }) || null;
    },

    nextFreeTime(dueDate, preferredTime, ignoreId = null) {
        const cfg = this.slotCfg();
        if (!dueDate) return '';
        let mins = this.parseTimeToMinutes(preferredTime) || 600;

        for (let guard = 0; guard < 300; guard++) {
            const timeStr = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
            const clash = this.slotClash(dueDate, timeStr, ignoreId);
            if (!clash) return timeStr;
            mins = this.parseTimeToMinutes(clash.dueTime) + cfg.minutes;
            if (mins >= 1439) return null;
        }
        return '';
    },

    SLOT_KEY: 'pureEnergySlotCfg',
    SLOT_DEFAULTS: { on: true, minutes: 30 },

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
                ' to ' + this.formatTimeStr(this.nudgeToClock(this.parseTimeToMinutes(timeStr) + cfg.minutes)) + '.</span>';
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
        if (timeEl) {
            timeEl.value = timeStr;
            this.checkSlotAvailability();
            this.showToast(`Time set to ${this.formatTimeStr(timeStr)}`, 'success');
        }
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

    /* ---------- BANK HOLIDAY AWARENESS ---------- */
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

    holidayCalendars() {
        const out = ['USD Holiday', 'Indian Bank Holiday'];
        (this.customCalendars || []).forEach(name => { if (out.indexOf(name) === -1) out.push(name); });
        this.holidays.forEach(h => { if (h.type && out.indexOf(h.type) === -1) out.push(h.type); });
        return out;
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
        if (inUse && !confirm(`"${name}" is used by existing holidays — remove it from the calendar list anyway?`)) return;
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

    /* ---------- LEAVE DAYS ---------- */
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

    isNonWorkingDay(dateStr) {
        if (!dateStr) return false;
        const p = String(dateStr).split('-').map(Number);
        if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return false;
        const d = new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
        if (d.getDay() === 0) return true; // Sunday
        if (this.holidays.some(h => h.date === dateStr)) return true;
        if (this.leaveDays.indexOf(dateStr) !== -1) return true;
        return false;
    },

    nextWorkingDayFrom(dateStr) {
        const p = String(dateStr).split('-').map(Number);
        if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return dateStr;
        const d = new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
        for (let i = 0; i < 30; i++) {
            d.setDate(d.getDate() + 1);
            const candidate = this.getLocalDateStr(d);
            if (!this.isNonWorkingDay(candidate)) return candidate;
        }
        return dateStr;
    },

    computeNextWorkingDay(dateStr) {
        const p = String(dateStr || '').split('-').map(Number);
        if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return '';
        const dateSet = new Set(this.holidays.map(h => h.date));
        const d = new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
        for (let i = 0; i < 14; i++) {
            d.setDate(d.getDate() + 1);
            const dow = d.getDay();
            const ds = this.getLocalDateStr(d);
            if (dow !== 0 && dow !== 6 && !dateSet.has(ds)) return ds;
        }
        return '';
    },

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
        this.triggerQuickSync();
    },

    holidayDateChanged() {
        const dateVal = document.getElementById('holidayDate').value;
        const nextField = document.getElementById('holidayNextWorking');
        if (nextField && dateVal) nextField.value = this.computeNextWorkingDay(dateVal);
    },

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

    computeHolidayBlocks() {
        const dateSet = new Set(this.holidays.map(h => h.date));
        const nameFor = (ds) => { const h = this.holidays.find(x => x.date === ds); return h ? h.name : null; };
        const isOff = (d) => { const dow = d.getDay(); return dow === 0 || dow === 6 || dateSet.has(this.getLocalDateStr(d)); };
        const parse = (ds) => { const p = ds.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2], 12, 0, 0); };

        const blocks = [];
        const seen = new Set();

        Array.from(dateSet).sort().forEach(ds => {
            if (seen.has(ds)) return;
            let start = parse(ds), end = parse(ds);
            while (true) { const prev = new Date(start); prev.setDate(prev.getDate() - 1); if (!isOff(prev)) break; start = prev; }
            while (true) { const next = new Date(end); next.setDate(next.getDate() + 1); if (!isOff(next)) break; end = next; }

            const days = Math.round((end - start) / 86400000) + 1;
            if (days < 2) return;

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

    /* ---------- ALARM MODAL ACTIONS ---------- */
    changeAlarmRecurrence(taskId, val) {
        const task = this.findTask(taskId);
        if (!task) return;
        task.recurrence = val || 'None';
        task.updatedAt = Date.now();
        this.saveData();
        this.renderTable();
        this.triggerQuickSync();
        this.showToast('Recurrence set to ' + (task.recurrence === 'None' ? "doesn't repeat" : task.recurrence), 'success');
    },

    acknowledgeDeadline(taskId) {
        const task = this.findTask(taskId);
        if (!task) return;
        task.deadlineAckDate = this.getLocalDateStr(new Date());
        task.updatedAt = Date.now();
        this.saveData();
        this.processEngine();
        this.triggerQuickSync();
        this.showToast('Deadline acknowledged for today.', 'success');
    },

    alarmAction(action, taskId) {
        const task = this.findTask(taskId);
        if (!task) return;

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
            this.saveData(); this.renderTable(); this.triggerQuickSync();
            this.showToast("Task silenced for today.", "info");
        } else if (action === 'skip') {
            this.skipTask(taskId);
        } else if (action === 'snooze') {
            const input = document.getElementById('snoozeMins_' + taskId);
            const mins = parseInt(input ? input.value : '', 10) || 0;
            if (mins <= 0) { this.showToast("Please enter minutes to snooze.", "warning"); return; }
            task.snoozeUntil = Date.now() + (mins * 60000);
            task.updatedAt = Date.now();
            this.saveData(); this.triggerQuickSync();
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
            this.saveData(); this.renderTable(); this.triggerQuickSync();
            this.showToast("Task rescheduled successfully.", "success");
        }

        this.alarmingTasks = this.alarmingTasks.filter(t => String(t.id) !== String(taskId));
        this.alarmSignature = this.alarmingTasks.map(t => String(t.id)).sort().join('|');

        if (this.alarmingTasks.length === 0) this.stopPersistentAlarm(false);
        else this.renderAlarmTasks();
    },

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
        this.triggerQuickSync();
        this.showToast("Skipped for today — still open, and won't be in today's report.", "info");
    },

    undoComplete(id, spawnedId) {
        if (spawnedId) {
            const spawned = this.findTask(spawnedId);
            if (spawned && !spawned.completedDate && !spawned.deleted) {
                this.tasks = this.tasks.filter(t => String(t.id) !== String(spawnedId));
            }
        }
        this.reopenTask(id);
    },

    /* ---------- UI: LIST MANAGERS, SUB-CATEGORIES & NARRATIONS ---------- */
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

    /* ---------- VIEW TOGGLES (CARDS/TABLE), FILTERS, SORTING ---------- */
    VIEW_KEY: 'pureEnergyView',
    viewMode: 'auto',

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
        if (mode === 'DueByToday') return diffDays <= 0;
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

        const keepValue = (elId, html) => {
            const el = document.getElementById(elId);
            if (!el) return;
            const previous = el.value;
            el.innerHTML = html;
            if (previous && Array.from(el.options).some(o => o.value === previous)) el.value = previous;
        };

        keepValue('filterPending', '<option value="All">All Pending With</option>' + union(this.lists.pendingWith, 'pendingWith').map(v => `<option value="${this.escAttr(v)}">${this.sanitize(v)}</option>`).join(''));
    },

    /* ---------- SORTING ENGINE ---------- */
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

    SORT_DEFAULTS: {
        Register:  ['dueDate', true],
        Completed: ['completedDate', false],
        Bin:       ['dateDeleted', false]
    },
    _sortChosen: {},

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
        this._sortChosen[this.currentTab] = [this.sortCol, this.sortAsc];
        this.closeDropdowns();
        this.renderTable();
    },

    updateSortHeaders() {
        const getIcon = (col) => this.sortCol === col ? (this.sortAsc ? '↑' : '↓') : '↕';
        const handle = (table, i) => `<span class="col-resize" data-table="${table}" data-col="${i}"></span>`;

        if (this.currentTab === 'Register') {
            const h = document.getElementById('registerTableHead');
            if(h) h.innerHTML = `
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
            const h = document.getElementById('completedTableHead');
            if(h) h.innerHTML = `
                <tr>
                    <th onclick="app.sortTable('dateLogged')">Logged<span>${getIcon('dateLogged')}</span>${handle('completed', 0)}</th>
                    <th onclick="app.sortTable('description')">Task<span>${getIcon('description')}</span>${handle('completed', 1)}</th>
                    <th onclick="app.sortTable('category')">Category<span>${getIcon('category')}</span>${handle('completed', 2)}</th>
                    <th onclick="app.sortTable('completedDate')">Completed On<span>${getIcon('completedDate')}</span>${handle('completed', 3)}</th>
                    <th>Actions${handle('completed', 4)}</th>
                </tr>`;
        } else if (this.currentTab === 'Bin') {
            const h = document.getElementById('binTableHead');
            if(h) h.innerHTML = `
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

    /* ---------- BULK SELECTION ENGINE ---------- */
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
        this.triggerQuickSync();

        const verb = { done: 'completed', reopen: 'reopened', bin: 'moved to the Bin', restore: 'restored' }[kind];
        let msg = n + ' ' + (n === 1 ? 'entry' : 'entries') + ' ' + verb + '.';
        if (needsSubCategory > 0) {
            msg += ' ' + needsSubCategory + ' skipped — open ' + (needsSubCategory === 1 ? 'it' : 'them') + ' individually to fill in the Sub Category first.';
        }
        this.showToast(msg, needsSubCategory > 0 ? 'warning' : 'success');
    },

    /* ---------- DASHBOARD ENGINE & RENDERING ---------- */
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

    holidayTypeColour(type) {
        const idx = Math.max(0, this.holidayCalendars().indexOf(type));
        return this.DASH_PALETTE[idx % this.DASH_PALETTE.length];
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

        heroBox.innerHTML = [
            this.dashTile({
                title: 'Due Today', count: dueToday.length, colour: 'var(--blue)',
                ftype: 'due', fvalue: 'Today',
                sub: dueToday.length ? 'On the clock' : 'Nothing to do Today'
            }),
            this.dashTile({
                title: 'Overdue', count: overdue.length, colour: 'var(--red)',
                ftype: 'due', fvalue: 'Overdue',
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

    /* ---------- VIEW RENDERING (CARDS + TABLE) ---------- */
    formatHolidayDate(dateStr) {
        if (!dateStr) return '-';
        const p = String(dateStr).split('-').map(Number);
        if (p.length < 3 || !p[0] || !p[1] || !p[2]) return this.sanitize(String(dateStr));
        const d = new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
        const dow = d.getDay();
        const isWeekend = dow === 0 || dow === 6;
        const text = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        return isWeekend
            ? '<span style="color:var(--red-ink); font-weight:700;">' + this.sanitize(text) + '</span>'
            : this.sanitize(text);
    },

    renderHolidays() {
        const search = (document.getElementById('searchHolidays')?.value || '').toLowerCase();
        const typeFilter = document.getElementById('filterHolidayType')?.value || 'All';
        const alertOnly = !!document.getElementById('filterHolidayAlertOnly')?.checked;

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
            `${filtered.length} of ${this.tasks.filter(t => !t.deleted && !t.purged && t.status !== 'Completed').length} entries shown`;
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
        if (!tbody) return;
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

    /* ---------- INTERACTION HELPERS ---------- */
    handleRecordClick(e) {
        if (this._swipeAt && Date.now() - this._swipeAt < 500) return;
        if (e.target.closest('a, button, input, textarea, select, label, .col-resize, .ms-options, .modal, #sortMenuPanel')) return;

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

    /* ---------- PWA SERVICE WORKER UTILITIES ---------- */
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

document.addEventListener('DOMContentLoaded', () => app.checkAuthOnStart());

/* Keep --toolbar-h in sync with whichever sticky toolbar is on screen */
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
        if (!worker || this.waitingWorker === worker) return;
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
    }
};
pwa.init();

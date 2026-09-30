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
    selected: [],
    selectMode: false,
    engineInterval: null,
    audioCtx: null, alarmInterval: null, alarmSoundTimeout: null, audioUnlocked: false,

    isAlarming: false, alarmingTasks: [], alarmSignature: '',
    lastSyncJSON: "", syncInProgress: false, userClearedAll: false, listsUpdatedAt: 0,
    fetchedEmails: [], storedEmailId: null, _searchTimer: null,
    cycleBusy: false, syncNeeded: false, _syncDebounceTimer: null,

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

    /* ---------- TIME SLOT ALLOCATION ENGINE ---------- */
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
        if (!dueDate || !dueTime) return null;
        const targetMins = this.parseTimeToMinutes(dueTime);
        if (targetMins === null) return null;

        return this.tasks.find(t => {
            if (t.deleted || t.purged || t.status === 'Completed') return false;
            if (ignoreId && String(t.id) === String(ignoreId)) return false;
            if (t.dueDate !== dueDate || !t.dueTime) return false;

            const tMins = this.parseTimeToMinutes(t.dueTime);
            if (tMins === null) return false;

            return Math.abs(tMins - targetMins) < this.SLOT_HOLD_MINS;
        }) || null;
    },

    nextFreeTime(dueDate, preferredTime, ignoreId = null) {
        if (!dueDate) return '';
        let mins = this.parseTimeToMinutes(preferredTime) || 600;

        for (let i = 0; i < 24; i++) {
            const timeStr = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
            if (!this.slotClash(dueDate, timeStr, ignoreId)) {
                return timeStr;
            }
            mins = Math.max(mins + 1, Math.ceil((mins + 1) / this.SLOT_HOLD_MINS) * this.SLOT_HOLD_MINS);
            if (mins >= 1200) break;
        }
        return '';
    },

    checkSlotAvailability() {
        const d = document.getElementById('taskDueDate')?.value;
        const t = document.getElementById('taskDueTime')?.value;
        if (!d || !t) return;
        const clash = this.slotClash(d, t, this.editingId);
        if (clash) {
            const free = this.nextFreeTime(d, t, this.editingId);
            this.showToast(
                `Slot clash: "${clash.description}" is within 30m.`,
                'warning',
                free ? { label: `Use ${this.formatTimeStr(free)}`, onClick: () => this.useSlotTime(free) } : null
            );
        }
    },

    useSlotTime(timeStr) {
        const el = document.getElementById('taskDueTime');
        if (el) {
            el.value = timeStr;
            this.showToast(`Time set to ${this.formatTimeStr(timeStr)}`, 'success');
        }
    },

    setSelectValue(id, val) {
        const el = document.getElementById(id);
        if (el) {
            el.value = val !== undefined && val !== null ? val : '';
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }
    },

    /* ---------- CORE HELPERS & UTILITIES ---------- */
    sanitize(str) {
        const div = document.createElement('div');
        div.textContent = (str === undefined || str === null) ? '' : str;
        return div.innerHTML;
    },

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
    debouncedRender() { clearTimeout(this._searchTimer); this._searchTimer = setTimeout(() => this.renderTable(), 200); },

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

    checkAuthOnStart() {
        this.currentUser = localStorage.getItem('currentUser') || 'default';
        localStorage.setItem('currentUser', this.currentUser);
        this.initApp();
        if (!(localStorage.getItem(CONFIG.SYNC_URL_KEY) || '').trim()) {
            setTimeout(() => this.showToast('Configure Cloud URL in Config tab.', 'info'), 1200);
        }
    },

    copyFieldValue(fieldId, btnEl) {
        const el = document.getElementById(fieldId);
        const val = el ? el.value.trim() : '';
        if (!val) {
            this.showToast('Field is empty — nothing to copy.', 'info');
            return;
        }
        const labelMap = { taskDescription: 'Purpose', taskMailChain: 'Mail Chain' };
        this.copyToClipboard(val, btnEl);
        this.showToast(`${labelMap[fieldId] || 'Value'} copied to clipboard`, 'success');
    },

    copyToClipboard(text, btnEl) {
        if (!text) { this.showToast('Nothing to copy', 'info'); return; }
        const onSuccess = () => {
            if (!btnEl) { this.showToast('Copied', 'success'); return; }
            const original = btnEl.innerHTML;
            btnEl.innerHTML = this.SVGS.copied;
            btnEl.classList.add('done');
            setTimeout(() => { btnEl.innerHTML = original; btnEl.classList.remove('done'); }, 1600);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(onSuccess).catch(() => this.fallbackCopy(text, onSuccess));
        } else {
            this.fallbackCopy(text, onSuccess);
        }
    },

    fallbackCopy(text, callback) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            if (callback) callback();
        } catch (e) {
            this.showToast('Copy failed — select text manually', 'warning');
        }
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

    isUnstartedStatus(status) { return /not\s*(yet\s*)?start/i.test(String(status || '').trim()); },

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

    /* ---------- INITIALIZATION & LIFECYCLE ---------- */
    initApp() {
        this.security.init();
        this.watchAutofill();
        this.loadLists();
        this.loadData();
        this.repairListsFromTaskData();
        this.loadHolidays();
        this.populateDropdowns();
        
        const reportDateEl = document.getElementById('dailyReportDate');
        if (reportDateEl && !reportDateEl.value) reportDateEl.value = this.getLocalDateStr(new Date());
        
        this.purgeOldBin();
        this.updateStats();
        this.updateHeader();
        this.switchTab('Dashboard');
        this.setupEventListeners();

        if (this.tasks.length === 0) this.pullTasksFromCloud(false);

        this.engineInterval = setInterval(() => this.processEngine(), 5000);
        setInterval(() => { this.updateHeader(); }, 60000);
        setInterval(() => this.syncCycle(), this.SYNC_EVERY_MS);
        setTimeout(() => this.syncCycle(), 2500);

        const unlockAudio = () => this.initAudio();
        ['click', 'keydown', 'touchstart'].forEach(evt => document.addEventListener(evt, unlockAudio, { passive: true, once: true }));

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) { this.initAudio(); this.processEngine(); this.syncCycle(); }
        });
        window.addEventListener('online', () => this.syncCycle());
    },

    purgeOldBin() {
        const cutoff = Date.now() - (30 * 86400000);
        let changed = false;
        this.tasks.forEach(t => {
            if (t.deleted && !t.purged && t.dateDeleted) {
                const parts = t.dateDeleted.split('-').map(Number);
                const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0).getTime();
                if (d < cutoff) {
                    t.purged = true;
                    this.addDeletedId(t.id);
                    changed = true;
                }
            }
        });
        if (changed) {
            this.tasks = this.tasks.filter(t => !t.purged);
            this.saveData();
        }
    },

    updateHeader() {
        const el = document.getElementById('headerDate');
        if (el) {
            el.textContent = new Date().toLocaleDateString('en-IN', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
        }
    },

    updateStats() {
        const active = this.tasks.filter(t => !t.deleted && !t.purged);
        const openTasks = active.filter(t => t.status !== 'Completed').length;
        const completed = active.filter(t => t.status === 'Completed').length;
        const binned = this.tasks.filter(t => t.deleted && !t.purged).length;

        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setTxt('entryCount', openTasks);
        setTxt('badgeRegister', openTasks);
        setTxt('badgeCompleted', completed);
        setTxt('badgeCompletedTab', completed);
        setTxt('badgeBin', binned);
        setTxt('badgeBinTab', binned);
    },

    watchAutofill() {
        document.querySelectorAll('input, select, textarea').forEach(el => {
            el.setAttribute('autocomplete', 'off');
            el.setAttribute('data-lpignore', 'true');
        });
    },

    /* ---------- MODAL FORM LIFECYCLE ---------- */
    openTaskModal(id = null, emailId = null) {
        const modal = document.getElementById('taskModal');
        if (!modal) return;
        const form = document.getElementById('taskForm');
        if (form) form.reset();

        this.editingId = id;
        this.storedEmailId = emailId;
        const titleEl = document.getElementById('modalTitle');

        if (id) {
            const task = this.findTask(id);
            if (!task) return;
            if (titleEl) titleEl.textContent = 'Edit Entry';

            document.getElementById('taskDescription').value = task.description || '';
            document.getElementById('taskMailChain').value = task.mailChain || '';
            this.setSelectValue('taskCategory', task.category || '');
            this.setSelectValue('taskPriority', task.priority || 'Medium');
            this.setSelectValue('taskStatus', task.status || 'Pending');
            this.setSelectValue('taskPendingWith', task.pendingWith || 'Self');
            this.setSelectValue('taskRecurrence', task.recurrence || 'None');
            document.getElementById('taskDueDate').value = task.dueDate || '';
            document.getElementById('taskDueTime').value = task.dueTime || '';
            document.getElementById('taskDeadlineDate').value = task.deadlineDate || '';
            document.getElementById('taskDeadlineTime').value = task.deadlineTime || '';
            document.getElementById('taskNotes').value = task.notes || '';

            if (task.paymentDetails) {
                const pp = document.getElementById('pdPaymentPercent');
                if (pp) pp.value = task.paymentDetails.paymentPercent || '';
                this.setSelectValue('pdPaymentType', task.paymentDetails.paymentType || 'Advance');
                this.setSelectValue('pdPaymentAgainst', task.paymentDetails.paymentAgainst || 'PI');
            }

            const kpContainer = document.getElementById('taskKeyPoints');
            if (kpContainer) {
                kpContainer.innerHTML = '';
                if (Array.isArray(task.keyPoints) && task.keyPoints.length > 0) {
                    task.keyPoints.forEach(kp => this.addKeyPointRow(kp.key, kp.value));
                }
            }

            this.updateConditionalFields();
            this.setSelectValue('taskSubCategory', task.subCategory || '');
            this.renderSubCategoryFields(task.subCategoryFields || {});
        } else {
            if (titleEl) titleEl.textContent = 'New Entry';
            const kpContainer = document.getElementById('taskKeyPoints');
            if (kpContainer) kpContainer.innerHTML = '';
            this.setSelectValue('taskPriority', 'Medium');
            this.setSelectValue('taskStatus', 'Pending');
            this.setSelectValue('taskPendingWith', 'Self');
            this.setSelectValue('taskRecurrence', 'None');
            this.updateConditionalFields();
        }

        modal.classList.add('open');
    },

    closeTaskModal() {
        const modal = document.getElementById('taskModal');
        if (modal) modal.classList.remove('open');
        this.editingId = null;
        this.storedEmailId = null;
    },

    openHolidayModal() {
        const modal = document.getElementById('holidayModal');
        if (modal) modal.classList.add('open');
    },

    closeHolidayModal() {
        const m = document.getElementById('holidayModal');
        if (m) m.classList.remove('open');
        this.editingHolidayId = null;
    },

    openSyncSetup() {
        const modal = document.getElementById('syncSetupModal');
        if (!modal) return;
        document.getElementById('syncUrlInput').value = localStorage.getItem(CONFIG.SYNC_URL_KEY) || '';
        document.getElementById('authTokenInput').value = localStorage.getItem(CONFIG.TOKEN_KEY) || '';
        document.getElementById('profileInput').value = this.currentUser || 'default';
        modal.classList.add('open');
    },

    saveSyncUrlModal() {
        const url = (document.getElementById('syncUrlInput')?.value || '').trim();
        const token = (document.getElementById('authTokenInput')?.value || '').trim();
        const profile = (document.getElementById('profileInput')?.value || '').trim().toLowerCase() || 'default';

        if (url && !/\/exec$/.test(url)) {
            this.showToast("Apps Script URL must end in /exec", "warning");
            return;
        }

        if (url) localStorage.setItem(CONFIG.SYNC_URL_KEY, url);
        if (token) localStorage.setItem(CONFIG.TOKEN_KEY, token);

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

    /* ---------- TASK MUTATIONS & ENGINE ---------- */
    saveTask(e) {
        if (e && e.preventDefault) e.preventDefault();
        const desc = document.getElementById('taskDescription').value.trim();
        if (!desc) { this.showToast('Enter task description.', 'warning'); return; }

        const fields = {
            description: desc,
            category: document.getElementById('taskCategory').value,
            subCategory: document.getElementById('taskSubCategory')?.value || '',
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

        const paymentErr = this.validatePaymentDetails(fields);
        if (paymentErr) { this.showToast(paymentErr, 'warning'); return; }

        const clash = this.slotClash(fields.dueDate, fields.dueTime, this.editingId);
        if (clash) {
            const free = this.nextFreeTime(fields.dueDate, fields.dueTime, this.editingId);
            const proceed = confirm(
                `Time Slot Warning:\n"${clash.description}" already holds ${this.formatTimeStr(clash.dueTime)}.\n\n` +
                (free ? `Next recommended free slot is ${this.formatTimeStr(free)}.\n\n` : '') +
                `Click OK to proceed anyway, or Cancel to choose another time.`
            );
            if (!proceed) {
                if (free) this.useSlotTime(free);
                return;
            }
        }

        const todayStr = this.getLocalDateStr(new Date());

        if (this.editingId) {
            const task = this.findTask(this.editingId);
            if (!task) return;
            const oldStatus = task.status;
            const wasCompleted = oldStatus === 'Completed';

            if (task.dueDate !== fields.dueDate && fields.dueDate) {
                const newDay = Number(fields.dueDate.split('-')[2]);
                if (newDay) task.recurrenceDay = newDay;
            }

            Object.assign(task, fields);

            if (fields.status === 'Completed') {
                if (!task.completedDate) task.completedDate = todayStr;
                if (!wasCompleted) {
                    const repeat = this.nextOccurrence(task);
                    if (repeat) {
                        if (!task.seriesId) task.seriesId = repeat.seriesId;
                        this.tasks.push(repeat);
                    }
                }
            } else {
                task.completedDate = null;
            }

            if (oldStatus !== fields.status && !this.isUnstartedStatus(fields.status)) {
                this.logTaskActivity(task, fields.status === 'Completed' ? 'completed' : 'status-changed', this.reportDetailsFor(task));
            }
        } else {
            const task = Object.assign({
                id: this.newId(),
                dateLogged: todayStr,
                deleted: false,
                purged: false,
                recurrenceDay: fields.dueDate ? Number(fields.dueDate.split('-')[2]) : null,
                completedDate: fields.status === 'Completed' ? todayStr : null
            }, fields);
            this.tasks.push(task);

            if (task.status === 'Completed') {
                const repeat = this.nextOccurrence(task);
                if (repeat) {
                    if (!task.seriesId) task.seriesId = repeat.seriesId;
                    this.tasks.push(repeat);
                }
                this.logTaskActivity(task, 'completed', this.reportDetailsFor(task));
            }
        }

        this.closeTaskModal();
        this.saveData();
        this.renderTable();
        this.processEngine();
        this.triggerQuickSync();
        this.showToast('Task saved successfully.', 'success');
    },

    nextOccurrence(t) {
        if (!t.recurrence || t.recurrence === 'None' || !t.dueDate) return null;
        const parts = String(t.dueDate).split('-').map(Number);
        if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return null;

        const curYear = parts[0], curMonth = parts[1] - 1, curDay = parts[2];
        const anchorDay = t.recurrenceDay || curDay;
        let next;

        if (t.recurrence === 'Daily') {
            next = new Date(curYear, curMonth, curDay + 1, 12, 0, 0);
        } else if (t.recurrence === 'Weekly') {
            next = new Date(curYear, curMonth, curDay + 7, 12, 0, 0);
        } else if (t.recurrence === 'Monthly') {
            const targetMonth = curMonth + 1;
            const targetYear = curYear + Math.floor(targetMonth / 12);
            const normalizedMonth = targetMonth % 12;
            const maxDays = new Date(targetYear, normalizedMonth + 1, 0, 12, 0, 0).getDate();
            const safeDay = Math.min(anchorDay, maxDays);
            next = new Date(targetYear, normalizedMonth, safeDay, 12, 0, 0);
        } else if (t.recurrence === 'Yearly') {
            const targetYear = curYear + 1;
            const maxDays = new Date(targetYear, curMonth + 1, 0, 12, 0, 0).getDate();
            const safeDay = Math.min(anchorDay, maxDays);
            next = new Date(targetYear, curMonth, safeDay, 12, 0, 0);
        } else {
            return null;
        }

        const nextDue = this.getLocalDateStr(next);
        const seriesId = t.seriesId || String(t.id);
        if (this.tasks.some(x => !x.purged && !x.deleted && String(x.seriesId || '') === seriesId && x.dueDate === nextDue)) return null;

        return Object.assign({}, t, {
            id: this.newId(),
            seriesId: seriesId,
            recurrenceDay: anchorDay,
            status: 'Pending',
            dueDate: nextDue,
            dateLogged: this.getLocalDateStr(new Date()),
            completedDate: null,
            dateDeleted: null,
            deleted: false,
            purged: false,
            skippedDates: [],
            lastAckDate: null,
            snoozeUntil: null,
            deadlineAckDate: null,
            updatedAt: Date.now()
        });
    },

    tryCompleteTask(id) {
        const t = this.findTask(id);
        if (!t) return;
        if (!this.subCategoryComplete(t)) {
            if (this.isAlarming) this.stopPersistentAlarm(false);
            this.openTaskModal(id);
            this.setSelectValue('taskStatus', 'Completed');
            this.updateConditionalFields();
            this.setSelectValue('taskSubCategory', t.subCategory || '');
            this.renderSubCategoryFields(t.subCategoryFields || {});
            this.showToast('Complete required subcategory fields.', 'warning');
            return;
        }
        this.markComplete(id);
    },

    markComplete(id) {
        const t = this.findTask(id);
        if (!t) return;

        t.status = 'Completed';
        t.completedDate = this.getLocalDateStr(new Date());
        t.updatedAt = Date.now();

        const repeat = this.nextOccurrence(t);
        if (repeat) {
            if (!t.seriesId) t.seriesId = repeat.seriesId;
            this.tasks.push(repeat);
        }

        this.saveData();
        this.renderTable();
        this.processEngine();
        this.logTaskActivity(t, 'completed', this.reportDetailsFor(t));
        this.triggerQuickSync();
        this.showToast('Marked complete.', 'success');
    },

    reopenTask(id) {
        const t = this.findTask(id);
        if (!t) return;
        t.status = 'Pending';
        t.completedDate = null;
        t.lastAckDate = null;
        t.snoozeUntil = null;
        t.updatedAt = Date.now();
        this.saveData();
        this.renderTable();
        this.processEngine();
        this.logTaskActivity(t, 'reopened', '');
        this.triggerQuickSync();
        this.showToast('Task reopened.', 'success');
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
        this.triggerQuickSync();
        this.showToast('Moved to Bin.', 'success');
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
        this.triggerQuickSync();
        this.showToast('Task restored.', 'success');
    },

    hardDelete(id) {
        const t = this.findTask(id);
        if (!t || !confirm('Permanently delete entry?')) return;
        this.addDeletedId(id);
        this.tasks = this.tasks.filter(x => String(x.id) !== String(id));
        this.saveData();
        this.renderTable();
        this.triggerQuickSync();
        this.showToast('Deleted permanently.', 'success');
    },

    findDuplicates() {
        const active = this.tasks.filter(t => !t.deleted && !t.purged && t.status !== 'Completed');
        const groups = new Map();
        active.forEach(t => {
            const key = `${(t.description || '').trim().toLowerCase()}||${(t.category || '').trim().toLowerCase()}||${t.dueDate || 'nodue'}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(t);
        });

        const dupes = Array.from(groups.values()).filter(g => g.length > 1);
        if (!dupes.length) { this.showToast('No open duplicates found.', 'success'); return; }

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
        this.triggerQuickSync();
        this.showToast('Duplicates moved to Bin.', 'success');
    },

    /* ---------- DYNAMIC SUBFIELDS & NARRATIONS ---------- */
    renderSubCategoryFields(existingVals = {}) {
        const box = document.getElementById('subCategoryRuleFields');
        if (!box) return;
        box.innerHTML = '';
        const name = document.getElementById('taskSubCategory')?.value;
        const sc = (this.lists.subCategories || []).find(x => x.name === name);
        if (!sc || !sc.fields || !sc.fields.length) return;

        sc.fields.forEach(f => {
            const val = existingVals[f.label] || '';
            const row = document.createElement('div');
            row.style = 'margin-top:8px;';
            row.innerHTML = `
                <label style="font-size:0.72rem; font-weight:700; color:var(--label-2);">${this.sanitize(f.label)}</label>
                <input type="text" class="scr-value-input" data-label="${this.escAttr(f.label)}" value="${this.escAttr(val)}" style="width:100%; height:34px; border-radius:8px; border:1px solid var(--line); padding:4px 8px; box-sizing:border-box;">
            `;
            box.appendChild(row);
        });
    },

    renderNarrationFields() {
        const name = document.getElementById('taskNarrationType')?.value;
        const box = document.getElementById('narrationDynamicInputs');
        if (!box) return;
        box.innerHTML = '';
        const nr = (this.lists.narrationTypes || []).find(x => x.name === name);
        if (!nr) { this.updateNarrationPreview(); return; }

        if (nr.hasPercent) {
            const d = document.createElement('div');
            d.innerHTML = `
                <label style="font-size:0.68rem;">Percentage %</label>
                <input type="text" id="narrationPercentInput" placeholder="100%" oninput="app.updateNarrationPreview()" style="width:100%; height:34px; border-radius:8px; border:1px solid var(--line); padding:4px 8px; box-sizing:border-box;">
            `;
            box.appendChild(d);
        }
        this.updateNarrationPreview();
    },

    updateNarrationPreview() {
        const preview = document.getElementById('narrationPreview');
        if (!preview) return;
        const name = document.getElementById('taskNarrationType')?.value || '';
        const docNo = document.getElementById('narrationDocNo')?.value || '';
        const pct = document.getElementById('narrationPercentInput')?.value || '';
        let out = name;
        if (pct) out += ` (${pct}%)`;
        if (docNo) out += ` Ref: ${docNo}`;
        preview.value = out.trim();
    },

    collectKeyPoints() {
        const box = document.getElementById('taskKeyPoints');
        if (!box) return [];
        return Array.from(box.querySelectorAll('.keypoint-row')).map(row => ({
            key: row.querySelector('.kp-key').value.trim(),
            value: row.querySelector('.kp-value').value.trim()
        })).filter(p => p.key || p.value);
    },

    addKeyPointRow(key = '', val = '') {
        const container = document.getElementById('taskKeyPoints');
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'keypoint-row';
        row.style = 'display:flex; gap:6px; align-items:center;';
        row.innerHTML = `
            <input type="text" class="kp-key" placeholder="Key (e.g. BOE No)" value="${this.escAttr(key)}" style="flex:1; height:30px !important; font-size:0.75rem !important;">
            <input type="text" class="kp-value" placeholder="Value" value="${this.escAttr(val)}" style="flex:1.5; height:30px !important; font-size:0.75rem !important;">
            <button type="button" class="btn-icon bad" onclick="this.parentElement.remove()" style="width:24px; height:24px; padding:0; cursor:pointer;">✕</button>
        `;
        container.appendChild(row);
    },

    collectPaymentDetails() {
        return {
            paymentPercent: document.getElementById('pdPaymentPercent')?.value.trim() || '',
            paymentType: document.getElementById('pdPaymentType')?.value || '',
            paymentAgainst: document.getElementById('pdPaymentAgainst')?.value || ''
        };
    },

    collectSubCategoryFields() {
        const box = document.getElementById('subCategoryRuleFields');
        if (!box) return {};
        const out = {};
        box.querySelectorAll('.scr-value-input').forEach(el => { if (el.value) out[el.dataset.label] = el.value; });
        return out;
    },

    collectNarration() {
        const name = document.getElementById('taskNarrationType')?.value;
        const nr = (this.lists.narrationTypes || []).find(x => x.name === name);
        if (!nr) return null;
        return {
            typeId: nr.id, typeName: nr.name,
            docNo: document.getElementById('narrationDocNo')?.value.trim() || '',
            text: document.getElementById('narrationPreview')?.value.trim() || ''
        };
    },

    validatePaymentDetails(fields) {
        const statusNorm = String(fields.status || '').trim().toLowerCase();
        const isProgress = /progress/i.test(statusNorm);
        const isCompleted = statusNorm === 'completed';

        if (this.isImportPaymentCategory(fields.category) && isProgress) {
            const pd = this.collectPaymentDetails();
            if (!pd.paymentPercent || !pd.paymentType || !pd.paymentAgainst) {
                return 'Import Payment marked In-Progress requires Payment %, Payment Type, and Payment Against.';
            }
        }
        if (this.categoryHasSubCategory(fields.category) && isCompleted) {
            if (!fields.subCategory) return 'Select Sub Category before marking Completed.';
            const sc = (this.lists.subCategories || []).find(x => x.name === fields.subCategory);
            if (sc && sc.fields && sc.fields.length) {
                const missing = sc.fields.filter(f => !((fields.subCategoryFields || {})[f.label] || '').toString().trim());
                if (missing.length) return 'Fill ' + missing.map(f => f.label).join(', ') + ' before marking Completed.';
            }
        }
        return '';
    },

    isDomesticPaymentCategory(cat) { return /domestic/i.test(cat || '') && /payment/i.test(cat || ''); },
    isImportPaymentCategory(cat) { return /import/i.test(cat || '') && /payment/i.test(cat || ''); },
    categoryHasSubCategory(cat) { return (this.lists.subCategoryCategories || []).includes(cat); },

    subCategoryComplete(t) {
        if (!t || !this.categoryHasSubCategory(t.category)) return true;
        if (!t.subCategory) return false;
        const sc = (this.lists.subCategories || []).find(x => x.name === t.subCategory);
        if (!sc || !sc.fields || !sc.fields.length) return true;
        const vals = t.subCategoryFields || {};
        return sc.fields.every(f => (vals[f.label] || '').toString().trim() !== '');
    },

    updateConditionalFields() {
        const cat = document.getElementById('taskCategory')?.value;
        const status = document.getElementById('taskStatus')?.value;
        const statusNorm = String(status || '').trim().toLowerCase();

        const isProgress = /progress/i.test(statusNorm);
        const isCompleted = statusNorm === 'completed';

        const importBox = document.getElementById('importInProgressFields');
        const subCategoryBox = document.getElementById('subCategoryField');
        const narrationBox = document.getElementById('tallyNarrationBox');

        if (importBox) importBox.style.display = (this.isImportPaymentCategory(cat) && isProgress) ? '' : 'none';
        if (subCategoryBox) subCategoryBox.style.display = (this.categoryHasSubCategory(cat) && isCompleted) ? '' : 'none';
        if (narrationBox) narrationBox.style.display = isCompleted ? '' : 'none';

        const subCatSelect = document.getElementById('taskSubCategory');
        if (subCatSelect && this.categoryHasSubCategory(cat)) {
            const currentSub = subCatSelect.value;
            const subs = (this.lists.subCategories || []).filter(s => !s.category || s.category === cat);
            subCatSelect.innerHTML = '<option value="">-- Select Sub Category --</option>' + 
                subs.map(s => `<option value="${this.escAttr(s.name)}">${this.sanitize(s.name)}</option>`).join('');
            if (currentSub) subCatSelect.value = currentSub;
        }
    },

    /* ---------- ENGINE, SYNC & ALARMS ---------- */
    processEngine() {
        const now = new Date();
        const localTodayStr = this.getLocalDateStr(now);
        const activeOverdue = [];
        const addedIds = new Set();
        const addOnce = t => { if (!addedIds.has(String(t.id))) { addedIds.add(String(t.id)); activeOverdue.push(t); } };

        this.tasks.forEach(t => {
            if (t.deleted || t.purged || t.status === 'Completed') return;

            const snoozeUntil = Number(t.snoozeUntil) || 0;
            if (now.getTime() < snoozeUntil) return;

            const deadlineDateTime = this.getTaskDeadlineDateTime(t);
            if (deadlineDateTime && now >= deadlineDateTime && t.deadlineAckDate !== localTodayStr) {
                addOnce(t);
            }

            if (!t.dueDate) return;
            const dueDateTime = this.getTaskDueDateTime(t);
            if (!dueDateTime) return;

            if (now >= dueDateTime && t.lastAckDate !== localTodayStr) {
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
    },

    triggerPersistentAlarm(tasks) {
        this.initAudio();
        this.isAlarming = true;
        this.alarmingTasks = tasks;
        if (!this.alarmInterval) {
            this.playBeepPair();
            this.alarmInterval = setInterval(() => this.playBeepPair(), 1800);
            if (this.alarmSoundTimeout) clearTimeout(this.alarmSoundTimeout);
            this.alarmSoundTimeout = setTimeout(() => {
                if (this.alarmInterval) { clearInterval(this.alarmInterval); this.alarmInterval = null; }
            }, 120000);
        }
    },

    stopPersistentAlarm(ackAll = false) {
        if (this.alarmInterval) { clearInterval(this.alarmInterval); this.alarmInterval = null; }
        if (this.alarmSoundTimeout) { clearTimeout(this.alarmSoundTimeout); this.alarmSoundTimeout = null; }
        this.isAlarming = false;
        if (ackAll) {
            const today = this.getLocalDateStr(new Date());
            this.alarmingTasks.forEach(t => {
                const task = this.findTask(t.id);
                if (task) { 
                    task.lastAckDate = today; 
                    task.deadlineAckDate = today;
                    task.updatedAt = Date.now(); 
                }
            });
            this.saveData();
            this.triggerQuickSync();
        }
        this.alarmingTasks = [];
    },

    initAudio() {
        try {
            if (!this.audioCtx) this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (this.audioCtx && this.audioCtx.state !== 'running') this.audioCtx.resume();
        } catch (e) {}
    },

    playBeepPair() {
        if (!this.audioCtx) return;
        try {
            const t = this.audioCtx.currentTime;
            const osc = this.audioCtx.createOscillator();
            const gain = this.audioCtx.createGain();
            osc.frequency.setValueAtTime(880, t);
            gain.gain.setValueAtTime(0.4, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            osc.connect(gain); gain.connect(this.audioCtx.destination);
            osc.start(t); osc.stop(t + 0.3);
            osc.onended = () => { try { osc.disconnect(); gain.disconnect(); } catch (e) {} };
        } catch (e) {}
    },

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
                this.saveData();
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
    pullTasksFromCloud(m) { return this.unifiedSync(m); },

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

    mergeTasks(remote) {
        const map = new Map();
        this.tasks.forEach(t => map.set(String(t.id), t));
        const del = new Set(this.getDeletedIds());

        remote.forEach(r => {
            if (!r || !r.id || del.has(String(r.id))) return;
            const l = map.get(String(r.id));
            if (!l || (Number(r.updatedAt) || 0) > (Number(l.updatedAt) || 0)) {
                map.set(String(r.id), r);
            }
        });
        this.tasks = Array.from(map.values());
    },

    loadLists() {
        try {
            this.lists = JSON.parse(localStorage.getItem(CONFIG.LISTS_KEY)) || {
                categories: ['Payment', 'Letter of Credit', 'Bill of Entry'],
                priorities: ['High', 'Medium', 'Low'],
                statuses: ['Pending', 'In-Progress', 'Completed'],
                pendingWith: ['Self', 'Bank', 'Finance Manager', 'Vendor'],
                subCategories: [],
                subCategoryCategories: [],
                narrationTypes: []
            };
        } catch (e) {
            this.lists = { categories: [], priorities: [], statuses: [], pendingWith: [] };
        }
    },

    saveLists(bump = true) {
        localStorage.setItem(CONFIG.LISTS_KEY, JSON.stringify(this.lists));
        this.populateDropdowns();
    },

    repairListsFromTaskData() {
        const fields = [
            ['categories', 'category'],
            ['priorities', 'priority'],
            ['statuses', 'status'],
            ['pendingWith', 'pendingWith']
        ];
        let changed = false;

        fields.forEach(([listKey, taskField]) => {
            if (!Array.isArray(this.lists[listKey])) this.lists[listKey] = [];
            if (this.lists[listKey].length === 0) {
                this.tasks.forEach(t => {
                    const v = t[taskField];
                    if (v && !this.lists[listKey].includes(v)) {
                        this.lists[listKey].push(v);
                        changed = true;
                    }
                });
            }
        });

        if (changed) this.saveLists(true);
    },

    loadData() {
        try { this.tasks = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY)) || []; } catch (e) { this.tasks = []; }
    },
    saveData() {
        try { localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(this.tasks)); } catch (e) {}
        this.updateStats();
    },
    loadHolidays() {
        try { this.holidays = JSON.parse(localStorage.getItem(CONFIG.HOLIDAYS_KEY)) || []; } catch (e) { this.holidays = []; }
    },
    saveHolidays() {
        localStorage.setItem(CONFIG.HOLIDAYS_KEY, JSON.stringify(this.holidays));
        this.renderTable();
        this.triggerQuickSync();
    },

    saveHoliday(e) {
        if (e && e.preventDefault) e.preventDefault();
        const name = document.getElementById('holidayName')?.value.trim();
        const date = document.getElementById('holidayDate')?.value;
        const type = document.getElementById('holidayType')?.value || 'Bank Holiday';
        const nextWork = document.getElementById('holidayNextWorking')?.value || '';

        if (!name || !date) {
            this.showToast('Enter holiday name and date.', 'warning');
            return;
        }

        this.holidays.push({ id: this.newId(), name, date, type, nextWorkingDay: nextWork });
        this.saveHolidays();
        this.closeHolidayModal();
        this.showToast('Holiday added.', 'success');
    },

    populateDropdowns() {
        ['taskCategory', 'taskPriority', 'taskStatus', 'taskPendingWith'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const key = id.replace('task', '').toLowerCase() + (id === 'taskCategory' ? 'ies' : 'es');
            const items = this.lists[key] || this.lists[id.replace('task', '').toLowerCase()] || [];
            if (Array.isArray(items)) {
                el.innerHTML = items.map(v => `<option value="${this.escAttr(v)}">${this.sanitize(v)}</option>`).join('');
            }
        });
        const hType = document.getElementById('holidayType');
        if (hType) {
            hType.innerHTML = '<option value="Indian Bank Holiday">Indian Bank Holiday</option><option value="USD Holiday">USD Holiday</option>';
        }
    },

    switchTab(tab) {
        this.currentTab = tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.querySelectorAll('.content-area').forEach(c => c.classList.remove('active'));
        const screen = document.getElementById(tab.toLowerCase() + 'Tab');
        if (screen) screen.classList.add('active');
        this.renderTable();
    },

    renderTable() {
        this.updateStats();
        const regBody = document.getElementById('taskTableBody');
        const compBody = document.getElementById('completedTableBody');
        const binBody = document.getElementById('binTableBody');
        const holBody = document.getElementById('holidaysTableBody');

        const qReg = (document.getElementById('searchInput')?.value || '').toLowerCase();
        const qComp = (document.getElementById('searchCompleted')?.value || '').toLowerCase();
        const qHol = (document.getElementById('searchHolidays')?.value || '').toLowerCase();

        if (regBody) {
            const items = this.tasks.filter(t => !t.deleted && !t.purged && t.status !== 'Completed' &&
                (!qReg || (t.description || '').toLowerCase().includes(qReg) || (t.category || '').toLowerCase().includes(qReg)));
            regBody.innerHTML = items.length ? items.map(t => `
                <tr data-record-id="${this.escAttr(t.id)}">
                    <td style="font-weight:600;">${this.sanitize(t.description)}</td>
                    <td>${this.sanitize(t.category || '-')}</td>
                    <td>${this.sanitize(t.priority || 'Medium')}</td>
                    <td><span class="tab-badge" style="background:rgba(0,122,255,0.1); color:var(--accent);">${this.sanitize(t.status || 'Pending')}</span></td>
                    <td>${this.formatDateStr(t.dueDate)} ${t.dueTime ? '<span style="color:var(--label-2); font-size:0.75rem;">' + this.formatTimeStr(t.dueTime) + '</span>' : ''}</td>
                    <td>
                        <button type="button" class="btn-row" data-action="edit" data-id="${this.escAttr(t.id)}">Edit</button>
                        <button type="button" class="btn-row ok" data-action="done" data-id="${this.escAttr(t.id)}">Done</button>
                        <button type="button" class="btn-row bad" data-action="bin" data-id="${this.escAttr(t.id)}">Bin</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="6" style="text-align:center; color:var(--label-2); padding:20px;">No open tasks.</td></tr>';
        }

        if (compBody) {
            const items = this.tasks.filter(t => !t.deleted && !t.purged && t.status === 'Completed' &&
                (!qComp || (t.description || '').toLowerCase().includes(qComp)));
            compBody.innerHTML = items.length ? items.map(t => `
                <tr data-record-id="${this.escAttr(t.id)}">
                    <td style="font-weight:600;">${this.sanitize(t.description)}</td>
                    <td>${this.sanitize(t.category || '-')}</td>
                    <td>${this.formatDateStr(t.completedDate)}</td>
                    <td><span class="tab-badge" style="background:rgba(52,199,89,0.1); color:var(--green);">Completed</span></td>
                    <td>
                        <button type="button" class="btn-row" data-action="edit" data-id="${this.escAttr(t.id)}">View</button>
                        <button type="button" class="btn-row ok" data-action="reopen" data-id="${this.escAttr(t.id)}">Reopen</button>
                        <button type="button" class="btn-row bad" data-action="bin" data-id="${this.escAttr(t.id)}">Bin</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="5" style="text-align:center; color:var(--label-2); padding:20px;">No completed tasks recorded.</td></tr>';
        }

        if (binBody) {
            const items = this.tasks.filter(t => t.deleted && !t.purged);
            binBody.innerHTML = items.length ? items.map(t => `
                <tr data-record-id="${this.escAttr(t.id)}">
                    <td>${this.sanitize(t.description)}</td>
                    <td>${this.sanitize(t.category || '-')}</td>
                    <td>${this.formatDateStr(t.dateDeleted)}</td>
                    <td>
                        <button type="button" class="btn-row ok" data-action="restore" data-id="${this.escAttr(t.id)}">Restore</button>
                        <button type="button" class="btn-row bad" data-action="hard-delete" data-id="${this.escAttr(t.id)}">Delete</button>
                    </td>
                </tr>
            `).join('') : '<tr><td colspan="4" style="text-align:center; color:var(--label-2); padding:20px;">Bin is empty.</td></tr>';
        }

        if (holBody) {
            const items = this.holidays.filter(h => !qHol || (h.name || '').toLowerCase().includes(qHol));
            holBody.innerHTML = items.length ? items.map(h => `
                <tr>
                    <td style="font-weight:600;">${this.sanitize(h.name)}</td>
                    <td>${this.formatDateStr(h.date)}</td>
                    <td>${this.sanitize(h.type || 'Bank Holiday')}</td>
                    <td>${this.formatDateStr(h.nextWorkingDay)}</td>
                    <td><button type="button" class="btn-row bad" onclick="app.deleteHoliday('${this.escAttr(h.id)}')">Remove</button></td>
                </tr>
            `).join('') : '<tr><td colspan="5" style="text-align:center; color:var(--label-2); padding:20px;">No holidays found.</td></tr>';
        }
    },

    deleteHoliday(id) {
        if (!confirm('Remove holiday?')) return;
        this.holidays = this.holidays.filter(h => String(h.id) !== String(id));
        this.saveHolidays();
    },

    generateDailyReport() {
        const date = document.getElementById('dailyReportDate')?.value || this.getLocalDateStr(new Date());
        const out = document.getElementById('dailyReportOutput');
        const actions = document.getElementById('dailyReportActions');

        if (out) { out.style.display = 'block'; out.textContent = 'Generating...'; }
        if (actions) actions.style.display = 'none';

        this.cloudRequest({ action: 'generateDailyReport', date: date })
            .then(data => {
                if (!data || data.status !== 'success') throw new Error(data?.message || 'Generation failed');
                if (out) out.textContent = data.report;
                if (actions) actions.style.display = 'flex';
                this.showToast('Report generated.', 'success');
            })
            .catch(err => {
                if (out) { out.textContent = ''; out.style.display = 'none'; }
                this.showToast(err.message || 'Report generation error', 'error');
            });
    },

    copyDailyReport() {
        const out = document.getElementById('dailyReportOutput');
        if (out && out.textContent) this.copyToClipboard(out.textContent);
    },

    exportDailyReportExcel() {
        const out = document.getElementById('dailyReportOutput');
        const text = out ? out.textContent : '';
        if (!text) { this.showToast('Generate report first.', 'warning'); return; }
        const blob = new Blob(['\uFEFF' + text], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Daily_Report_${document.getElementById('dailyReportDate')?.value || this.getLocalDateStr(new Date())}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast('Report downloaded.', 'success');
    },

    resyncCompletedForReport() {
        const date = document.getElementById('dailyReportDate')?.value || this.getLocalDateStr(new Date());
        const matches = this.tasks.filter(t => !t.deleted && t.status === 'Completed' && t.completedDate === date);
        if (!matches.length) { this.showToast('No completed tasks found for ' + date, 'info'); return; }

        const entries = matches.map(t => ({
            taskId: t.id,
            taskDescription: t.description,
            action: 'completed',
            details: this.reportDetailsFor(t),
            date: date
        }));

        this.cloudRequest({ action: 'logActivity', logType: 'task', entries: entries })
            .then(() => this.showToast(`Resynced ${matches.length} tasks for report.`, 'success'))
            .catch(err => this.showToast(err.message || 'Sync failed', 'error'));
    },

    exportData(format = 'csv') {
        const headers = ['id', 'description', 'category', 'priority', 'status', 'dueDate', 'dueTime', 'completedDate', 'notes'];
        const rows = [headers.join(',')];
        this.tasks.forEach(t => {
            rows.push(headers.map(h => `"${String(t[h] || '').replace(/"/g, '""')}"`).join(','));
        });
        const blob = new Blob(['\uFEFF' + rows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `tasks_backup_${this.getLocalDateStr(new Date())}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        this.showToast('CSV backup exported.', 'success');
    },

    showToast(msg, type = 'info', action = null) {
        const box = document.getElementById('toastContainer');
        if (!box) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        if (action && action.label && typeof action.onClick === 'function') {
            const btn = document.createElement('button');
            btn.textContent = action.label;
            btn.style.marginLeft = '8px';
            btn.style.background = 'var(--accent)';
            btn.style.border = 'none';
            btn.style.color = '#fff';
            btn.style.borderRadius = '4px';
            btn.style.padding = '2px 6px';
            btn.style.cursor = 'pointer';
            btn.onclick = action.onClick;
            toast.appendChild(btn);
        }
        box.appendChild(toast);
        setTimeout(() => { if (toast.isConnected) toast.remove(); }, 3500);
    },

    handleDelegatedClick(e) {
        const el = e.target.closest('[data-action]');
        if (!el) return;
        const act = el.dataset.action;
        const id = el.dataset.id;
        if (act === 'edit') this.openTaskModal(id);
        else if (act === 'done') this.tryCompleteTask(id);
        else if (act === 'reopen') this.reopenTask(id);
        else if (act === 'bin') this.softDelete(id);
        else if (act === 'restore') this.restoreTask(id);
        else if (act === 'hard-delete') this.hardDelete(id);
    },

    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            if (this.security && this.security.isLocked) return;
            this.closeTaskModal();
            this.closeHolidayModal();
            const syncModal = document.getElementById('syncSetupModal');
            if (syncModal) syncModal.classList.remove('open');
        });
        document.addEventListener('click', (e) => this.handleDelegatedClick(e));
    }
};

document.addEventListener('DOMContentLoaded', () => app.checkAuthOnStart());

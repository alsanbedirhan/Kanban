'use strict';

const AppState = {
    isAuthenticated: false,
    currentUser: null,
    currentBoardId: null,
    boards: [],
    currentColumns: [],
    // Counters, not booleans: overlapping requests must not clear each other's state.
    pendingRequests: 0,
    loadingRequests: 0,

    get isRequestPending() {
        return this.pendingRequests > 0;
    },

    isDragging: false,

    lastSyncTime: null,
    syncInterval: null,
    searchQuery: '',
    authFailureCount: 0,
    columnMenuListenerAttached: false,

    reset() {
        clearSessionState();
    }
};

function clearSessionState() {
    AppState.isAuthenticated = false;
    AppState.currentUser = null;
    AppState.currentBoardId = null;
    AppState.boards = [];
    AppState.currentColumns = [];
    AppState.isDragging = false;
    AppState.searchQuery = '';
    AppState.stopPolling();
    stopBoardSync();
    renderBoardList();
    renderColumns([]);
    QuickNoteState.reset();
}

function deleteAppCookies() {
    const names = ['XSRF-TOKEN', 'Kanflow.Antiforgery', 'Kanflow.Auth'];
    const expires = 'expires=Thu, 01 Jan 1970 00:00:00 GMT';
    names.forEach(name => {
        document.cookie = `${name}=;${expires};path=/;SameSite=Strict`;
        document.cookie = `${name}=;${expires};path=/;SameSite=Strict;Secure`;
    });
}

function escapeHtml(unsafe) {
    if (!unsafe) return "";
    return String(unsafe)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function stripHtml(html) {
    if (!html) return "";
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return doc.body.textContent || "";
}

// Card descriptions are user-authored HTML from other board members. Quill 1.x
// (incl. dangerouslyPasteHTML) writes HTML into a live node, so event handlers
// like <img onerror> would run. DOMPurify cleans it first, limited to what the
// editor toolbar can produce.
const RICH_TEXT_CONFIG = {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'ol', 'ul', 'li', 'span'],
    ALLOWED_ATTR: ['class', 'style']
};
const RICH_TEXT_STYLE = /^\s*(color|background-color)\s*:\s*(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|[a-z]+)\s*$/i;
let richTextHookInstalled = false;

function installRichTextHook() {
    if (richTextHookInstalled) return;
    // DOMPurify allows class/style wholesale; narrow them to Quill's own values.
    DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
        if (data.attrName === 'class') {
            data.attrValue = data.attrValue.split(/\s+/).filter(c => /^ql-[a-z0-9-]+$/i.test(c)).join(' ');
        } else if (data.attrName === 'style') {
            data.attrValue = data.attrValue.split(';').filter(d => RICH_TEXT_STYLE.test(d)).join(';');
        } else {
            return;
        }
        if (!data.attrValue) data.keepAttr = false;
    });
    richTextHookInstalled = true;
}

function sanitizeRichText(html) {
    if (!html) return '';
    // Fail closed: if DOMPurify did not load, show the text without markup.
    if (!window.DOMPurify?.sanitize) return escapeHtml(stripHtml(html));
    installRichTextHook();
    return DOMPurify.sanitize(String(html), RICH_TEXT_CONFIG);
}

function formatDateInput(value) {
    if (!value) return '';
    const str = String(value);
    if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function addDaysToDateInput(dateInput, days) {
    const [y, m, d] = dateInput.split('-').map(Number);
    return formatDateInput(new Date(y, m - 1, d + days));
}

function todayDateInput() {
    const d = new Date();
    return formatDateInput(d);
}

function swalWidth(desktop = '650px') {
    return window.innerWidth <= 768 ? undefined : desktop;
}

// Mirrors the BoardCards.Title column width.
const CARD_TITLE_MAX = 150;

// Dates follow the viewer's browser language (undefined = browser default).
const UI_LOCALE = undefined;

// Every dialog button maps to one of these roles, so colors stay predictable:
// primary = confirm/save/create, danger = destructive, info = edit,
// owner = ownership transfer, neutral = dismiss.
const SWAL_BTN = {
    primary: 'btn btn-primary',
    danger: 'btn btn-danger',
    info: 'btn btn-info',
    owner: 'btn btn-owner',
    neutral: 'btn btn-secondary'
};

// Action buttons carry an icon; dismissive buttons (Cancel/Close/OK) never do.
const UI_ICON = {
    create: '➕',
    save: '💾',
    delete: '🗑️',
    send: '📨',
    verify: '✅',
    login: '🔐',
    register: '📝',
    logout: '🚪',
    rename: '✏️',
    members: '👥',
    owner: '👑',
    accept: '✔️',
    decline: '✖️'
};

function swalDialog(options = {}) {
    const {
        confirmVariant = 'primary',
        denyVariant = 'danger',
        cancelVariant = 'neutral',
        framed = false,
        flush = false,
        customClass = {},
        ...rest
    } = options;

    const popupClass = [
        'kf-swal',
        framed ? 'kf-swal--framed' : '',
        flush ? 'kf-swal--flush' : '',
        customClass.popup || ''
    ].filter(Boolean).join(' ');

    return Swal.fire({
        reverseButtons: true,
        ...rest,
        buttonsStyling: false,
        customClass: {
            ...customClass,
            popup: popupClass,
            actions: ['kf-swal-actions', customClass.actions || ''].filter(Boolean).join(' '),
            confirmButton: SWAL_BTN[confirmVariant] || SWAL_BTN.primary,
            denyButton: SWAL_BTN[denyVariant] || SWAL_BTN.danger,
            cancelButton: SWAL_BTN[cancelVariant] || SWAL_BTN.neutral
        }
    });
}

function swalAlert(icon, title, text, options = {}) {
    return swalDialog({ icon, title, text, confirmButtonText: 'OK', ...options });
}

function swalFlash(icon, title, text = '', timer = 1600) {
    return swalDialog({ icon, title, text, timer, showConfirmButton: false });
}

function swalConfirm(options = {}) {
    const { confirmText = 'Confirm', cancelText = 'Cancel', icon = 'warning', ...rest } = options;
    return swalDialog({
        icon,
        showCancelButton: true,
        confirmButtonText: confirmText,
        cancelButtonText: cancelText,
        ...rest
    });
}

function swalForm(options = {}) {
    return swalDialog({
        width: swalWidth('440px'),
        showCancelButton: true,
        cancelButtonText: 'Cancel',
        focusConfirm: false,
        ...options
    });
}

function swalPanel(options = {}) {
    return swalDialog({
        showConfirmButton: false,
        showCloseButton: true,
        ...options
    });
}

function swalPasswordField(id, placeholder) {
    return `
        <div class="kf-password-field">
            <input id="${id}" type="password" class="kf-input" placeholder="${placeholder}">
            <button type="button" class="kf-pass-toggle pass-toggle" tabindex="-1" data-target="${id}" aria-label="Show password">🙈</button>
        </div>`;
}

function bindSwalPasswordToggles(root = Swal.getPopup()) {
    root?.querySelectorAll('.pass-toggle').forEach(toggle => {
        toggle.addEventListener('click', () => {
            const input = root.querySelector(`#${toggle.getAttribute('data-target')}`);
            if (!input) return;
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            toggle.textContent = show ? '🙊' : '🙈';
        });
    });
}

function showToast(title, icon = 'info', timer = 2500) {
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };

    let host = document.getElementById('kf-toast-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'kf-toast-host';
        host.setAttribute('aria-live', 'polite');
        document.body.appendChild(host);
    }

    const el = document.createElement('div');
    el.className = `kf-toast kf-toast--${icon}`;
    el.innerHTML = `
        <span class="kf-toast-icon" aria-hidden="true">${icons[icon] || icons.info}</span>
        <span class="kf-toast-text">${escapeHtml(title)}</span>`;
    host.appendChild(el);

    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
        el.classList.remove('is-visible');
        setTimeout(() => el.remove(), 300);
    }, timer);
}

function cardDisplayTitle(card) {
    const title = (card.title || '').trim();
    if (title) return title;

    const desc = stripHtml(card.desc || '').trim();
    if (!desc) return 'Untitled card';
    return desc.length > 60 ? `${desc.slice(0, 60)}…` : desc;
}

function cardMatchesSearch(card, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const title = (card.title || '').toLowerCase();
    const desc = stripHtml(card.desc || '').toLowerCase();
    const assignee = (card.assigneeName || '').toLowerCase();
    return title.includes(q) || desc.includes(q) || assignee.includes(q);
}

function filterColumnsForSearch(columns, query) {
    if (!query) return columns;
    return columns.map(col => ({
        ...col,
        cards: col.cards.filter(c => cardMatchesSearch(c, query)),
    }));
}

function getTurnstileToken(modalId) {
    if (!modalId) return null;
    const value = document.querySelector(`#${modalId} [name="cf-turnstile-response"]`)?.value?.trim();
    return value || null;
}

function getTurnstileTokenFromContainer(containerId) {
    const input = getTurnstileWrapEl(containerId)?.querySelector('[name="cf-turnstile-response"]');
    return input?.value?.trim() || null;
}

const turnstileWidgetIds = {};
let turnstileRenderToken = 0;

function getTurnstileContainerId(modalId) {
    return modalId === 'registerModal' ? 'turnstile-container-register' : 'turnstile-container-login';
}

function getTurnstileWrapEl(containerId) {
    return document.getElementById(containerId)?.closest('.turnstile-wrap') ?? null;
}

function hasTurnstileTokenInContainer(containerId) {
    const input = getTurnstileWrapEl(containerId)?.querySelector('[name="cf-turnstile-response"]');
    return !!(input?.value?.trim());
}

function setTurnstileLoaded(isLoaded, containerId) {
    const wrap = getTurnstileWrapEl(containerId);
    if (!wrap) return;
    wrap.classList.toggle('is-loaded', isLoaded);
    if (isLoaded) wrap.classList.remove('is-error');
}

function showTurnstileError(message, containerId) {
    if (hasTurnstileTokenInContainer(containerId)) return;

    const wrap = getTurnstileWrapEl(containerId);
    const container = document.getElementById(containerId);
    const errorEl = wrap?.querySelector('.turnstile-error');
    const widgetId = turnstileWidgetIds[containerId];

    if (window.turnstile && widgetId != null) {
        try { window.turnstile.remove(widgetId); } catch { /* ignore */ }
    }
    delete turnstileWidgetIds[containerId];

    if (container) container.innerHTML = '';
    if (wrap) {
        wrap.classList.add('is-error');
        wrap.classList.remove('is-loaded');
    }
    if (errorEl) errorEl.textContent = message;
}

function resetKanbanTurnstile(containerId) {
    turnstileRenderToken++;
    const widgetId = turnstileWidgetIds[containerId];
    if (window.turnstile && widgetId != null) {
        try { window.turnstile.remove(widgetId); } catch { /* ignore */ }
    }
    delete turnstileWidgetIds[containerId];

    const container = document.getElementById(containerId);
    const wrap = getTurnstileWrapEl(containerId);
    const errorEl = wrap?.querySelector('.turnstile-error');
    if (container) container.innerHTML = '';
    if (wrap) wrap.classList.remove('is-loaded', 'is-error');
    if (errorEl) errorEl.textContent = '';
    setTurnstileLoaded(false, containerId);
}

function renderKanbanTurnstile(containerId) {
    const container = document.getElementById(containerId);
    if (!container || !window.turnstile?.render) return;

    resetKanbanTurnstile(containerId);
    const renderToken = turnstileRenderToken;
    const siteKey = container.dataset.sitekey?.trim();

    if (!siteKey) {
        showTurnstileError('Verification is not configured.', containerId);
        return;
    }

    const markLoaded = () => {
        if (renderToken !== turnstileRenderToken) return;
        setTurnstileLoaded(true, containerId);
    };

    try {
        turnstileWidgetIds[containerId] = window.turnstile.render(container, {
            sitekey: siteKey,
            theme: 'light',
            size: 'normal',
            'refresh-expired': 'auto',
            callback: markLoaded,
            'after-interactive-callback': markLoaded,
            'error-callback': () => {
                if (renderToken !== turnstileRenderToken) return;
                if (hasTurnstileTokenInContainer(containerId)) return;
                showTurnstileError('Verification could not start. Use Retry verification below.', containerId);
            },
            'timeout-callback': () => {
                if (renderToken !== turnstileRenderToken) return;
                if (hasTurnstileTokenInContainer(containerId)) return;
                showTurnstileError('Verification timed out. Use Retry verification below.', containerId);
            },
            'expired-callback': () => {
                if (renderToken !== turnstileRenderToken) return;
                setTurnstileLoaded(false, containerId);
            }
        });
    } catch {
        showTurnstileError('Verification failed to load.', containerId);
        return;
    }

    setTimeout(() => {
        if (renderToken !== turnstileRenderToken) return;
        const wrap = getTurnstileWrapEl(containerId);
        if (wrap?.classList.contains('is-loaded') || wrap?.classList.contains('is-error')) return;
        if (hasTurnstileTokenInContainer(containerId)) {
            markLoaded();
            return;
        }
        const widgetId = turnstileWidgetIds[containerId];
        if (widgetId != null && window.turnstile.getResponse?.(widgetId)) {
            markLoaded();
            return;
        }
        showTurnstileError('Verification failed to load. Use Retry verification below.', containerId);
    }, 15000);
}

function waitForKanbanTurnstileAndRender(containerId, attempt = 0) {
    if (window.turnstile?.render) {
        renderKanbanTurnstile(containerId);
        return;
    }
    if (attempt < 80) {
        setTimeout(() => waitForKanbanTurnstileAndRender(containerId, attempt + 1), 100);
    } else {
        showTurnstileError('Verification failed to load. Check your connection and retry.', containerId);
    }
}

function resetModalTurnstile(modalId) {
    resetKanbanTurnstile(getTurnstileContainerId(modalId));
}

function refreshModalTurnstile(modalId) {
    waitForKanbanTurnstileAndRender(getTurnstileContainerId(modalId));
}

window.retryTurnstile = function (e) {
    const containerId = e?.target?.closest('[data-turnstile-target]')?.dataset?.turnstileTarget;
    if (containerId) waitForKanbanTurnstileAndRender(containerId);
};

function turnstileRequiredMessage() {
    return 'Please complete the verification. If it does not load, click "Retry verification" below.';
}

const OTP_TURNSTILE_CONTAINER = 'turnstile-container-otp';

function initOtpSwalTurnstile() {
    requestAnimationFrame(() => {
        waitForKanbanTurnstileAndRender(OTP_TURNSTILE_CONTAINER);
    });
}

function readOtpSwalTurnstileToken() {
    return getTurnstileTokenFromContainer(OTP_TURNSTILE_CONTAINER);
}

function bindSwalOtpInputs(container, options = {}) {
    const inputs = container.querySelectorAll('.otp-field');
    const afterLastInput = options.afterLastInput;
    if (inputs.length > 0) inputs[0].focus();

    inputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            if (!/^\d+$/.test(value)) { e.target.value = ''; return; }
            if (value && index < inputs.length - 1) inputs[index + 1].focus();
            else if (value && index === inputs.length - 1 && afterLastInput) afterLastInput();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) inputs[index - 1].focus();
            else if (e.key === 'Enter') Swal.clickConfirm();
        });
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const data = e.clipboardData.getData('text').trim();
            if (data.length === 6 && /^\d+$/.test(data)) {
                const digits = data.split('');
                inputs.forEach((inp, i) => inp.value = digits[i]);
                if (afterLastInput) afterLastInput();
                else if (inputs[5]) inputs[5].focus();
                Swal.clickConfirm();
            }
        });
    });
}

function readSwalOtpCode(container) {
    const inputs = container.querySelectorAll('.otp-field');
    let code = '';
    inputs.forEach(input => code += input.value);
    return code;
}

function isSafeHexColor(color) {
    return /^#[0-9A-Fa-f]{6}$/.test(color || '');
}

function setupOfflineDetection() {
    if (!navigator.onLine) showToast('You are offline', 'warning', 4000);
    window.addEventListener('offline', () => showToast('Connection lost', 'error', 4000));
    window.addEventListener('online', () => showToast('Back online', 'success', 2000));
}

function focusBoardSearch() {
    const wrap = document.getElementById('boardSearchWrap');
    const toggle = document.getElementById('boardSearchToggleBtn');
    if (wrap && window.matchMedia('(max-width: 768px)').matches) {
        wrap.classList.add('is-open');
        if (toggle) toggle.setAttribute('aria-expanded', 'true');
    }
    const input = document.getElementById('boardSearchInput');
    if (input) { input.focus(); input.select(); }
}

function toggleBoardSearch() {
    const wrap = document.getElementById('boardSearchWrap');
    const toggle = document.getElementById('boardSearchToggleBtn');
    if (!wrap) return;

    const isOpen = wrap.classList.toggle('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

    if (isOpen) {
        const input = document.getElementById('boardSearchInput');
        if (input) setTimeout(() => input.focus(), 50);
    }
}

function handleBoardSearchInput(e) {
    AppState.searchQuery = (e.target.value || '').trim();
    const clearBtn = document.getElementById('boardSearchClear');
    if (clearBtn) clearBtn.hidden = !AppState.searchQuery;
    renderColumns(AppState.currentColumns);
}

function clearBoardSearch() {
    const input = document.getElementById('boardSearchInput');
    if (input) input.value = '';
    AppState.searchQuery = '';
    const clearBtn = document.getElementById('boardSearchClear');
    if (clearBtn) clearBtn.hidden = true;
    renderColumns(AppState.currentColumns);
}

function shortcutNewCard() {
    if (!checkAuth() || !AppState.currentBoardId) return;
    const firstCol = AppState.currentColumns[0];
    if (firstCol) openCardModal(firstCol.id);
    else swalAlert('info', 'No Columns Yet', 'Add a column before creating a card.');
}

function cloneColumnsState() {
    return AppState.currentColumns.map(col => ({
        ...col,
        cards: col.cards.map(c => ({ ...c })),
    }));
}

function showLoading() {
    AppState.loadingRequests++;
    const el = document.getElementById('loadingOverlay');
    if (el) {
        el.style.display = 'flex';
        el.setAttribute('aria-busy', 'true');
    }
}

function hideLoading() {
    AppState.loadingRequests = Math.max(0, AppState.loadingRequests - 1);
    if (AppState.loadingRequests > 0) return;
    const el = document.getElementById('loadingOverlay');
    if (el) {
        el.style.display = 'none';
        el.setAttribute('aria-busy', 'false');
    }
}

function getXsrfToken() {
    const name = "XSRF-TOKEN=";
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.indexOf(name) === 0) {
            return cookie.substring(name.length);
        }
    }
    return null;
}

function isAuthEntryEndpoint(endpoint) {
    return /^\/Auth\/(Login|VerifyWork|Register|ResetPassword)/i.test(endpoint || '');
}

async function refreshXsrfToken() {
    try {
        const response = await fetch('/Home/GetToken', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json'
            }
        });
        if (!response.ok) return getXsrfToken();
        const data = await response.json();
        return data?.data?.xsrfToken || getXsrfToken();
    } catch (err) {
        console.warn('Token refresh error:', err);
        return getXsrfToken();
    }
}

async function apiRequest(endpoint, options = {}, showload = true, isPooling = false) {
    if (showload) showLoading();
    if (!isPooling) {
        AppState.pendingRequests++;
    }
    try {
        const method = (options.method || 'GET').toUpperCase();
        let xsrfToken = null;

        if (method !== 'GET') {
            xsrfToken = await refreshXsrfToken();
        }

        const sendRequest = async (token) => {
            const headers = {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json',
                ...options.headers
            };

            if (token) {
                headers['X-XSRF-TOKEN'] = token;
            }

            // Lets the server skip echoing this tab's own change back to it.
            const connectionId = BoardSync.connection?.connectionId;
            if (connectionId) {
                headers['X-Board-Connection'] = connectionId;
            }

            return fetch(endpoint, {
                ...options,
                headers: headers,
                credentials: 'same-origin'
            });
        };

        let response = await sendRequest(xsrfToken);

        if (response.status === 400 && method !== 'GET') {
            xsrfToken = await refreshXsrfToken();
            response = await sendRequest(xsrfToken);
        }

        if (response.status === 429) {
            let rateLimitMsg = 'Too many requests. Please try again later.';
            try {
                const errData = await response.json();
                if (errData.errorMessage) rateLimitMsg = errData.errorMessage;
            } catch (e) { }
            throw new Error(rateLimitMsg);
        }

        if (response.status === 401 || response.status === 403) {
            if (isAuthEntryEndpoint(endpoint)) {
                let authMsg = 'Authentication failed. Please refresh the page and try again.';
                try {
                    const errData = await response.json();
                    if (errData.errorMessage) authMsg = errData.errorMessage;
                } catch (e) { }
                throw new Error(authMsg);
            }

            if (isPooling) {
                AppState.authFailureCount++;
                if (AppState.authFailureCount < 2) {
                    throw new Error('Session expired or unauthorized.');
                }
                AppState.authFailureCount = 0;
            }
            console.warn('Session expired or unauthorized. Force clearing and redirecting...');
            recoverExpiredSession('Session expired. Please log in again.');
            throw new Error('Session expired or unauthorized.');
        }

        AppState.authFailureCount = 0;

        if (!response.ok) {
            let errorMsg = `HTTP error: ${response.status}`;
            try {
                const errData = await response.json();
                if (errData.errorMessage) errorMsg = errData.errorMessage;
            } catch (e) { }
            throw new Error(errorMsg);
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        return await response.text();

    } catch (error) {
        const expired = error.message === 'Session expired or unauthorized.';
        if (!expired) {
            console.error('API Error:', error);
            if (showload) {
                swalAlert('error', 'Error', error.message || 'A connection error occurred.');
            }
        }
        // failed: the request itself failed (network/HTTP), not a business-rule success:false.
        // handled: the user was already told (alert shown or session recovery started).
        return {
            success: false,
            failed: true,
            handled: showload || expired,
            errorMessage: error.message || 'A connection error occurred.'
        };
    } finally {
        if (showload) hideLoading();
        if (!isPooling) {
            AppState.pendingRequests = Math.max(0, AppState.pendingRequests - 1);
        }
    }
}

// Shows the failure unless apiRequest already reported it to the user.
function alertApiFailure(res, fallback) {
    if (res?.handled) return Promise.resolve();
    return swalAlert('error', 'Error', res?.errorMessage || fallback);
}

function canRefreshBoardNow() {
    if (!AppState.currentBoardId || !AppState.lastSyncTime || AppState.isDragging) return false;
    if (document.body.classList.contains('swal2-shown')) return false;
    if (AppState.isRequestPending) return false;
    if (document.getElementById('sidebar')?.classList.contains('open')) return false;
    if (document.getElementById('quickNoteContainer')?.classList.contains('active')) return false;
    return true;
}

AppState.startPolling = function () {
    this.stopPolling();

    this.syncInterval = setInterval(async () => {
        if (!canRefreshBoardNow()) return;

        // With a live SignalR connection only apply changes it announced; the
        // version polling below is the fallback while disconnected.
        if (isBoardSyncConnected()) {
            await flushBoardSync();
            return;
        }

        try {
            const res = await apiRequest(`/Kanban/CheckBoardVersion?boardId=${this.currentBoardId}`, {}, false, true);
            if (!res?.success || !res?.data) return;

            // Reload when the board changed after our last full load (both server clock).
            const boardUpdatedAt = new Date(res.data.lastUpdate).getTime();
            const loadedAt = new Date(this.lastSyncTime).getTime();

            if (boardUpdatedAt > loadedAt) {
                await loadBoardData(false);
            }
            checkNewUpdates(true);
        } catch (e) {
            console.warn("Polling error (transient):", e);
        }
    }, 5000);
};

AppState.stopPolling = function () {
    if (this.syncInterval) {
        clearInterval(this.syncInterval);
        this.syncInterval = null;
    }
};

const BoardSync = {
    connection: null,
    joinedBoardId: null,
    dirty: false,
    restartTimer: null
};

function isBoardSyncConnected() {
    return !!window.signalR && BoardSync.connection?.state === signalR.HubConnectionState.Connected;
}

function startBoardSync() {
    if (BoardSync.connection || !window.signalR || !AppState.isAuthenticated) return;

    const connection = new signalR.HubConnectionBuilder()
        .withUrl('/hubs/board')
        .withAutomaticReconnect()
        .build();

    connection.on('BoardChanged', (boardId) => {
        if (boardId !== AppState.currentBoardId) return;
        BoardSync.dirty = true;
        flushBoardSync();
    });

    connection.on('UpdatesChanged', () => checkNewUpdates(false));

    connection.onreconnected(async () => {
        // Group membership is per connection, and changes may have been missed meanwhile.
        BoardSync.joinedBoardId = null;
        await joinCurrentBoard();
        BoardSync.dirty = true;
        flushBoardSync();
        checkNewUpdates(false);
    });

    connection.onclose(() => {
        if (BoardSync.connection !== connection) return;
        BoardSync.connection = null;
        BoardSync.joinedBoardId = null;
        clearTimeout(BoardSync.restartTimer);
        if (AppState.isAuthenticated) {
            BoardSync.restartTimer = setTimeout(startBoardSync, 30000);
        }
    });

    BoardSync.connection = connection;
    connection.start()
        .then(joinCurrentBoard)
        .catch(err => console.warn('Live updates unavailable, falling back to polling:', err));
}

function stopBoardSync() {
    clearTimeout(BoardSync.restartTimer);
    const connection = BoardSync.connection;
    BoardSync.connection = null;
    BoardSync.joinedBoardId = null;
    BoardSync.dirty = false;
    connection?.stop().catch(() => { });
}

async function joinCurrentBoard() {
    const connection = BoardSync.connection;
    if (!isBoardSyncConnected()) return;

    const target = AppState.currentBoardId;
    if (BoardSync.joinedBoardId === target) return;

    if (BoardSync.joinedBoardId) {
        await connection.invoke('LeaveBoard', BoardSync.joinedBoardId).catch(() => { });
        BoardSync.joinedBoardId = null;
    }
    if (target && await connection.invoke('JoinBoard', target).catch(() => false)) {
        BoardSync.joinedBoardId = target;
    }
}

async function flushBoardSync() {
    if (!BoardSync.dirty || !canRefreshBoardNow()) return;
    BoardSync.dirty = false;

    const loaded = await loadBoardData(false);
    if (loaded === null) {
        BoardSync.dirty = true;
    } else if (loaded === false) {
        // Access was lost: removed from the board or the board was deleted.
        loadBoards();
    }
}

async function checkNewUpdates(isPolling = false) {
    if (!AppState.isAuthenticated) return;
    try {
        const res = await apiRequest('/Kanban/CheckUpdates', {}, false, isPolling);
        const badge = document.getElementById('nav-badge');
        if (!badge || !res || res.failed) return;

        if (res.success && res.data) {
            badge.style.display = 'block';
            badge.classList.add('pulse');
        } else {
            badge.style.display = 'none';
            badge.classList.remove('pulse');
        }
    } catch (e) { }
}

async function silentSessionCleanup() {
    try {
        await postLogoutRequest();
    } catch {
        // Server may have already invalidated the session.
    }
    deleteAppCookies();
}

async function fetchCurrentUser() {
    try {
        const res = await apiRequest('/Home/Fetch', {}, false);
        if (res?.failed) {
            // Transient network/server error: keep the current session instead of logging out.
            updateAuthUI();
            return;
        }
        if (res?.success) {
            AppState.isAuthenticated = true;
            AppState.currentUser = res.data;

            if (AppState.currentUser.avatar === 'def' || !AppState.currentUser.avatar) {
                initAvatarSelector();
                setTimeout(() => {
                    const modal = document.getElementById('avatarModal');
                    if (modal) modal.classList.add('active');
                }, 500);
            }
            initQuickNotes();
            startBoardSync();
        } else {
            clearSessionState();
            await silentSessionCleanup();
        }
    } catch {
        clearSessionState();
        await silentSessionCleanup();
    }
    updateAuthUI();
    if (AppState.isAuthenticated) {
        checkNewUpdates(false);
    }
}

function checkAuth() {
    if (AppState.isAuthenticated && AppState.currentUser) return true;

    swalConfirm({
        title: 'Login Required',
        text: 'Please login to perform this action.',
        confirmText: `${UI_ICON.login} Login`
    }).then((result) => {
        if (result.isConfirmed) openLoginModal();
    });
    return false;
}

async function openNotifications() {
    try {
        const res = await apiRequest('/Kanban/GetNotifications');

        if (!res?.success) {
            alertApiFailure(res, 'Could not load notifications.');
            return;
        }

        if (!res.data || res.data.length === 0) {
            return swalAlert('info', 'Notifications', 'No new notifications.')
                .then(() => openProfileMenu());
        }

        const listItemsHtml = res.data.map(n => `
            <div id="notif-${n.id}" class="kf-notif">
                <div class="kf-notif-main">
                    <span class="kf-notif-icon" aria-hidden="true">📢</span>
                    <div>
                        <div class="kf-notif-text">${escapeHtml(n.message)}</div>
                        <div class="kf-notif-time">
                            ${new Date(n.createdAt).toLocaleDateString(UI_LOCALE)} ${new Date(n.createdAt).toLocaleTimeString(UI_LOCALE, { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </div>
                <button type="button" class="kf-icon-btn kf-icon-btn--danger notif-delete-btn"
                        data-notif-id="${n.id}" title="Delete notification" aria-label="Delete notification">×</button>
            </div>
        `).join('');

        swalPanel({
            title: 'Notifications',
            width: swalWidth('460px'),
            framed: true,
            html: `
                <div class="kf-panel-head">
                    <span class="kf-panel-title">Recent</span>
                    <button type="button" id="delete-all-notifs-btn" class="btn btn-sm btn-danger-soft">
                        ${UI_ICON.delete} Delete All
                    </button>
                </div>
                <div id="notif-container" class="kf-scroll-sm">
                    ${listItemsHtml}
                </div>
            `,
            didOpen: () => {
                document.getElementById('delete-all-notifs-btn')
                    ?.addEventListener('click', () => deleteAllNotifications());

                document.getElementById('notif-container')?.addEventListener('click', (e) => {
                    const btn = e.target.closest('.notif-delete-btn');
                    if (btn?.dataset.notifId) deleteNotification(Number(btn.dataset.notifId));
                });
            }
        }).then(() => openProfileMenu());

    } catch (e) {
        console.error(e);
        swalAlert('error', 'Error', 'Could not load notifications.');
    }
}

async function deleteNotification(id) {
    try {
        const res = await apiRequest(`/Kanban/DeleteNotification`, {
            method: 'POST',
            body: JSON.stringify({ notificationId: id })
        }, false);

        if (!res?.success) {
            alertApiFailure(res, 'Could not delete notification.');
            return;
        }

        const el = document.getElementById(`notif-${id}`);
        if (el) {
            el.style.opacity = '0';
            setTimeout(() => {
                el.remove();
                checkIfEmpty();
                checkNewUpdates(false);
            }, 300);
        } else {
            checkNewUpdates(false);
        }
    } catch (e) {
        console.error(e);
        swalAlert('error', 'Error', 'Could not delete notification.');
    }
}

async function deleteAllNotifications() {
    if (!checkAuth()) return;
    const confirm = await swalConfirm({
        title: 'Clear All Notifications?',
        text: 'This will delete all of your notifications.',
        confirmText: `${UI_ICON.delete} Delete All`,
        confirmVariant: 'danger'
    });

    if (confirm.isConfirmed) {
        try {
            const res = await apiRequest('/Kanban/DeleteNotifications', { method: 'POST' });
            if (!res?.success) {
                alertApiFailure(res, 'Failed to delete all notifications.');
                return;
            }
            showToast('All notifications have been cleared.', 'success');
            checkNewUpdates(false);
        } catch (e) {
            console.error(e);
            swalAlert('error', 'Error', 'Network error.');
        }
    } else {
        openNotifications();
    }
}

function checkIfEmpty() {
    const container = document.getElementById('notif-container');
    if (container && container.children.length === 0) {
        container.innerHTML = '<div class="kf-panel-empty">No new notifications.</div>';
    }
}

async function openPendingInvites() {
    try {
        const res = await apiRequest('/Kanban/GetInvites');

        if (!res?.success) {
            alertApiFailure(res, 'Could not load invites.');
            return;
        }

        if (!res.data || res.data.length === 0) {
            return swalAlert('info', 'Invites', 'You have no pending invites.')
                .then(() => openProfileMenu());
        }

        const invitesHtml = res.data.map(invite => `
            <div class="kf-invite">
                <div class="kf-invite-board">📂 ${escapeHtml(invite.boardName)}</div>
                <div class="kf-invite-meta">Invited by: <b>${escapeHtml(invite.inviterName)}</b></div>
                <div class="kf-invite-actions">
                    <button type="button" class="btn btn-sm btn-primary invite-accept-btn" data-invite-id="${invite.id}">
                        ${UI_ICON.accept} Accept
                    </button>
                    <button type="button" class="btn btn-sm btn-danger invite-decline-btn" data-invite-id="${invite.id}">
                        ${UI_ICON.decline} Decline
                    </button>
                </div>
            </div>
        `).join('');

        swalPanel({
            title: 'Pending Invites',
            framed: true,
            html: `<div id="invites-wrapper" class="kf-scroll-md">${invitesHtml}</div>`,
            didOpen: () => {
                document.getElementById('invites-wrapper')?.addEventListener('click', (e) => {
                    const acceptBtn = e.target.closest('.invite-accept-btn');
                    const declineBtn = e.target.closest('.invite-decline-btn');
                    if (acceptBtn) {
                        handleInviteResponse(Number(acceptBtn.dataset.inviteId), true);
                    } else if (declineBtn) {
                        handleInviteResponse(Number(declineBtn.dataset.inviteId), false);
                    }
                });
            }
        }).then(() => openProfileMenu());

    } catch (e) {
        console.error(e);
        swalAlert('error', 'Error', 'Could not load invites.');
    }
}

async function handleInviteResponse(inviteId, isAccepted) {
    if (!checkAuth()) return;
    try {
        const res = await apiRequest(`/Kanban/WorkInvite`, {
            method: 'POST',
            body: JSON.stringify({ inviteId, isAccepted })
        }, false);

        if (!res?.success) {
            alertApiFailure(res, 'Operation failed.');
            return;
        }

        showToast(isAccepted ? 'Joined board!' : 'Invite declined', 'success');
        const inviteEl = document.querySelector(`.invite-accept-btn[data-invite-id="${inviteId}"]`)?.closest('.kf-invite');
        inviteEl?.remove();
        const wrapper = document.getElementById('invites-wrapper');
        if (wrapper && wrapper.children.length === 0) {
            wrapper.innerHTML = '<div class="kf-panel-empty">You have no pending invites.</div>';
        }
        checkNewUpdates(false);
        if (isAccepted) loadBoards();
    } catch (e) {
        console.error(e);
        swalAlert('error', 'Error', 'Network error occurred.');
    }
}

async function openChangePasswordModal() {
    if (!checkAuth()) return;

    const { value: passwordData, isDismissed } = await swalForm({
        title: 'Change Password',
        html: `
            ${swalPasswordField('swal-old-pass', 'Current Password')}
            ${swalPasswordField('swal-new-pass', 'New Password')}
            ${swalPasswordField('swal-conf-pass', 'Confirm New Password')}
        `,
        confirmButtonText: `${UI_ICON.save} Update Password`,
        didOpen: () => bindSwalPasswordToggles(),
        preConfirm: () => {
            const currentPassword = document.getElementById('swal-old-pass').value;
            const newPassword = document.getElementById('swal-new-pass').value;
            const confPass = document.getElementById('swal-conf-pass').value;

            if (!currentPassword || !newPassword || !confPass) {
                Swal.showValidationMessage('Please fill all fields.');
                return false;
            }
            if (newPassword.length < 8) {
                Swal.showValidationMessage('Password must be at least 8 characters.');
                return false;
            }
            if (newPassword !== confPass) {
                Swal.showValidationMessage('New passwords do not match.');
                return false;
            }
            return { currentPassword, newPassword };
        }
    });

    if (isDismissed) {
        openProfileMenu();
        return;
    }

    if (passwordData) {
        try {
            const res = await apiRequest('/Auth/ChangePassword', {
                method: 'POST',
                body: JSON.stringify(passwordData)
            });
            if (res?.success) {
                const temp = AppState.currentUser.email;

                await swalDialog({
                    title: 'Password Changed',
                    text: 'Please login again with your new password.',
                    icon: 'success',
                    confirmButtonText: `${UI_ICON.login} Login`
                });
                sessionStorage.setItem('kanflow:prefillEmail', temp);
                await handleLogout(true);
            } else if (!res?.failed) {
                // Business-rule failure (e.g. wrong current password): let the user retry.
                await swalAlert('error', 'Error', res?.errorMessage || 'Failed to update password.');
                openChangePasswordModal();
            }
        } catch (e) {
            console.error(e);
        }
    }
}

function openProfileMenu() {
    if (!checkAuth()) return;

    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) toggleSidebar();

    const name = escapeHtml(AppState.currentUser.fullName);
    const email = escapeHtml(AppState.currentUser.email);
    const avatar = getAvatarPath(AppState.currentUser.avatar || 'def');

    swalPanel({
        width: swalWidth('400px'),
        padding: '20px',
        html: `
            <div class="kf-profile">
                <img src="${avatar}" alt="" class="kf-profile-avatar">
                <h3 class="kf-profile-name">${name}</h3>
                <span class="kf-profile-email">${email}</span>
            </div>
            <div id="profile-menu-buttons" class="kf-menu">
                <button type="button" class="kf-menu-btn profile-menu-btn" data-menu-action="notifications">
                    <span class="kf-menu-icon" aria-hidden="true">🔔</span> Notifications
                </button>
                <button type="button" class="kf-menu-btn profile-menu-btn" data-menu-action="invites">
                    <span class="kf-menu-icon" aria-hidden="true">📩</span> Invites
                </button>
                <button type="button" class="kf-menu-btn profile-menu-btn" data-menu-action="avatar">
                    <span class="kf-menu-icon" aria-hidden="true">🎨</span> Change Avatar
                </button>
                <button type="button" class="kf-menu-btn profile-menu-btn" data-menu-action="password">
                    <span class="kf-menu-icon" aria-hidden="true">🔑</span> Change Password
                </button>
                <div class="kf-menu-sep"></div>
                <button type="button" class="kf-menu-btn kf-menu-btn--danger profile-menu-btn" data-menu-action="logout">
                    <span class="kf-menu-icon" aria-hidden="true">${UI_ICON.logout}</span> Logout
                </button>
            </div>
        `,
        didOpen: () => {
            document.getElementById('profile-menu-buttons')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.profile-menu-btn');
                if (!btn) return;

                Swal.close();
                switch (btn.dataset.menuAction) {
                    case 'notifications': openNotifications(); break;
                    case 'invites': openPendingInvites(); break;
                    case 'avatar': openAvatarModal(true); break;
                    case 'password': openChangePasswordModal(); break;
                    case 'logout': handleLogout(); break;
                }
            });
        }
    });
}

function updateAuthUI() {
    const authSection = document.getElementById('authSection');
    const area = document.getElementById("authHeaderArea");
    const boardHeader = document.getElementById("boardHeader");

    if (AppState.isAuthenticated && AppState.currentUser) {
        const safeName = escapeHtml(AppState.currentUser.fullName);
        const avatarPath = getAvatarPath(AppState.currentUser.avatar || 'def');

        area.innerHTML = `
            <div id="header-avatar-wrap" class="header-avatar-wrap" title="Menu">
                <img src="${avatarPath}" id="header-avatar-img" class="header-avatar-img" alt="">
                <span id="nav-badge" class="notification-badge"></span>
            </div>
        `;

        setTimeout(() => {
            document.getElementById('header-avatar-wrap')?.addEventListener('click', () => openProfileMenu());
        }, 0);

        authSection.innerHTML = `
            <div class="sidebar-user-card">
                <img src="${avatarPath}" class="sidebar-user-avatar" alt="">
                <div class="sidebar-user-info">
                    <div class="sidebar-user-name">${safeName}</div>
                    <div class="sidebar-user-email">${escapeHtml(AppState.currentUser.email)}</div>
                </div>
            </div>
            <button type="button" id="sidebar-menu-btn" class="btn btn-secondary btn-block">⚙️ Menu</button>
            <button type="button" id="sidebar-logout-btn" class="btn btn-danger btn-block">${UI_ICON.logout} Logout</button>
        `;

        setTimeout(() => {
            const menuBtn = document.getElementById('sidebar-menu-btn');
            const logoutBtn = document.getElementById('sidebar-logout-btn');
            if (menuBtn) menuBtn.addEventListener('click', () => openProfileMenu());
            if (logoutBtn) logoutBtn.addEventListener('click', () => confirmLogout());
        }, 0);

    } else {
        if (boardHeader) {
            boardHeader.classList.add('u-hidden');
            boardHeader.style.display = 'none';
        }
        document.getElementById("boardHeaderTitle").textContent = "";
        document.getElementById("board").innerHTML = "";

        area.innerHTML = `<button id="header-login-btn" class="btn btn-primary btn-login-header" type="button" title="Login" aria-label="Login">${UI_ICON.login}</button>`;
        authSection.innerHTML = `
            <button type="button" id="sidebar-login-btn" class="btn btn-primary btn-block">${UI_ICON.login} Login</button>
            <button type="button" id="sidebar-register-btn" class="btn btn-secondary btn-block">${UI_ICON.register} Register</button>
        `;

        setTimeout(() => {
            const headerLoginBtn = document.getElementById('header-login-btn');
            const sidebarLoginBtn = document.getElementById('sidebar-login-btn');
            const sidebarRegisterBtn = document.getElementById('sidebar-register-btn');
            if (headerLoginBtn) headerLoginBtn.addEventListener('click', () => openLoginModal());
            if (sidebarLoginBtn) sidebarLoginBtn.addEventListener('click', () => openLoginModal());
            if (sidebarRegisterBtn) sidebarRegisterBtn.addEventListener('click', () => openRegisterModal());
        }, 0);
    }
}

function switchToRegister() { closeLoginModal(); openRegisterModal(); }
function switchToLogin() { closeRegisterModal(); openLoginModal(); }

function openLoginModal(prefillEmail = null) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('open')) toggleSidebar();
    document.getElementById('loginModal').classList.add('active');
    if (prefillEmail) document.getElementById('loginEmail').value = prefillEmail;
    refreshModalTurnstile('loginModal');
    setTimeout(() => document.getElementById('loginEmail')?.focus(), 50);
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
    resetModalTurnstile('loginModal');
}

function openRegisterModal(prefillEmail = null) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('open')) toggleSidebar();
    document.getElementById('registerModal').classList.add('active');
    if (prefillEmail) document.getElementById('registerEmail').value = prefillEmail;
    refreshModalTurnstile('registerModal');
    setTimeout(() => document.getElementById('registerFullName')?.focus(), 50);
}

function closeRegisterModal() {
    document.getElementById('registerModal').classList.remove('active');
    ['registerFullName', 'registerEmail', 'registerPassword', 'registerConfirmPassword']
        .forEach(id => document.getElementById(id).value = '');
    resetModalTurnstile('registerModal');
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const turnstileToken = getTurnstileToken('loginModal');

    if (!email || !password) return swalAlert('error', 'Missing Information', 'Please fill all fields.');
    if (!turnstileToken) return swalAlert('warning', 'Verification Required', turnstileRequiredMessage());

    try {
        const response = await apiRequest('/Auth/Login', {
            method: 'POST',
            body: JSON.stringify({ email, password, turnstileToken })
        });

        if (!response || response.failed) {
            // apiRequest already showed the error; the Turnstile token is single-use.
            refreshModalTurnstile('loginModal');
            return;
        }

        if (response.success) {
            await fetchCurrentUser();
            closeLoginModal();
            swalFlash('success', 'Welcome Back!', `Hello ${AppState.currentUser.fullName}`);
            loadBoards();
        } else {
            await swalAlert('error', 'Login Failed', response.errorMessage || 'Login failed.');
            refreshModalTurnstile('loginModal');
        }
    } catch (err) {
        console.error('Login error:', err);
    }
}

function showPrivacyPolicy(e) {
    if (e) e.preventDefault();
    swalDialog({
        title: 'Privacy Policy',
        framed: true,
        html: `
            <div class="kf-prose">
                <p><strong>Data Controller:</strong> Bedirhan Alşan (Kanflow Project)</p>
                <p>Your personal data (Name, Surname, Email) is processed solely for the purpose of membership registration and service provision.</p>
                <p>Your data is not shared with third parties (except for legal obligations).</p>
            </div>
        `,
        confirmButtonText: 'Close'
    });
}

function showUserAgreement(e) {
    if (e) e.preventDefault();
    swalDialog({
        title: 'User Agreement',
        framed: true,
        html: `
            <div class="kf-prose">
                <p><b>1</b>. The user agrees to remain loyal to <b>Atatürk</b>'s principles and reforms.</p>
                <p><b>2</b>. This application is developed as a portfolio project.</p>
                <p><b>3</b>. The permanence of data uploaded to the system (cards, boards) is not guaranteed.</p>
                <p><b>4</b>. The user agrees not to upload harmful, offensive, or illegal content to the system.</p>
            </div>
        `,
        confirmButtonText: 'Close'
    });
}

async function handleRegister() {
    const agreementCheckbox = document.getElementById('registerAgreement');
    if (!agreementCheckbox || !agreementCheckbox.checked) {
        return swalAlert('warning', 'Agreement Required', 'Please accept the User Agreement and Privacy Policy to proceed.');
    }

    const fullName = document.getElementById('registerFullName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    if (!fullName || !email || !password || !confirmPassword)
        return swalAlert('error', 'Missing Information', 'Please fill all fields.');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return swalAlert('error', 'Invalid Email', 'Please enter a valid email address.');
    if (password.length < 8) return swalAlert('error', 'Weak Password', 'Password must be at least 8 characters.');
    if (password !== confirmPassword) return swalAlert('error', 'Passwords Do Not Match', 'Please retype your password.');

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?:{}|<>]/.test(password)) {
        return swalAlert('error', 'Weak Password', 'Password must contain uppercase, lowercase, number, and special character.');
    }

    const turnstileToken = getTurnstileToken('registerModal');

    if (!turnstileToken) {
        return swalAlert('warning', 'Verification Required', turnstileRequiredMessage());
    }

    try {
        const verify = await apiRequest('/Auth/VerifyWork', {
            method: 'POST',
            body: JSON.stringify({ email, turnstileToken, purpose: 'register' })
        });

        if (!verify?.success) {
            refreshModalTurnstile('registerModal');
            return alertApiFailure(verify, 'Failed to send verification code.');
        }

        let isRegistered = false;
        const templateContent = document.getElementById('otpTemplate').innerHTML;

        while (!isRegistered) {
            const { value: formValues, dismiss } = await swalForm({
                title: 'Email Verification',
                html: `
                    <p class="kf-dialog-hint">A 6-digit code has been sent to <b>${escapeHtml(email)}</b>.</p>
                    ${templateContent}
                `,
                confirmButtonText: `${UI_ICON.verify} Verify & Register`,
                didOpen: () => {
                    const container = Swal.getHtmlContainer();
                    bindSwalOtpInputs(container);
                    initOtpSwalTurnstile();
                },
                preConfirm: () => {
                    const container = Swal.getHtmlContainer();
                    const code = readSwalOtpCode(container);
                    if (code.length !== 6) {
                        Swal.showValidationMessage('Please enter the complete 6-digit code');
                        return false;
                    }

                    const turnstileToken = readOtpSwalTurnstileToken();
                    if (!turnstileToken) {
                        Swal.showValidationMessage(turnstileRequiredMessage());
                        return false;
                    }

                    return { otpCode: code, turnstileToken };
                }
            });

            resetKanbanTurnstile(OTP_TURNSTILE_CONTAINER);
            // Any dismissal (Cancel, backdrop, Esc, close) ends the flow; only a
            // confirmed dialog without values should reopen it.
            if (dismiss) return;
            if (!formValues) continue;

            const response = await apiRequest('/Auth/Register', {
                method: 'POST',
                body: JSON.stringify({
                    fullName,
                    email,
                    password,
                    otpCode: formValues.otpCode,
                    turnstileToken: formValues.turnstileToken
                })
            });

            if (!response || response.failed) break;

            if (response.success) {
                isRegistered = true;
                await fetchCurrentUser();
                closeRegisterModal();
                swalFlash('success', 'Welcome!', `Registration successful! Welcome ${fullName}`, 2000);
                await loadBoards();
            } else {
                const msg = response.errorMessage || 'Registration failed.';
                await swalAlert('error', 'Registration Failed', msg);
                if (msg.toLowerCase().includes('already exists')) break;
            }
        }
    } catch (error) {
        refreshModalTurnstile('registerModal');
        console.error(error);
        swalAlert('error', 'Error', 'An unexpected error occurred during registration.');
    }
}

async function handleForgotPassword() {
    const turnstileToken = getTurnstileToken('loginModal');

    if (!turnstileToken) {
        return swalAlert('warning', 'Verification Required', turnstileRequiredMessage());
    }

    const loginEmail = document.getElementById('loginEmail')?.value.trim() || '';
    closeLoginModal();

    const { value: email, dismiss: emailDismiss } = await swalForm({
        title: 'Forgot Password',
        input: 'email',
        inputValue: loginEmail,
        inputLabel: 'Enter your registered Kanflow email address',
        inputPlaceholder: 'example@email.com',
        confirmButtonText: `${UI_ICON.send} Send Code`,
        inputValidator: (value) => {
            value = value.trim();
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!value) return 'Email address cannot be empty!';
            if (!emailRegex.test(value)) return 'Please enter a valid email address.';
        },
        preConfirm: () => Swal.getInput().value.trim()
    });

    if (!email || emailDismiss) {
        openLoginModal();
        return;
    }

    try {
        const verify = await apiRequest('/Auth/VerifyWork', {
            method: 'POST',
            body: JSON.stringify({ email, turnstileToken, purpose: 'reset' })
        });

        if (!verify?.success) {
            refreshModalTurnstile('loginModal');
            return alertApiFailure(verify, 'Failed to send verification code.');
        }

        const otpHtml = document.getElementById('otpTemplate').innerHTML;
        const combinedHtml = `
            <p class="kf-dialog-hint">If an account exists for <b>${escapeHtml(email)}</b>, a 6-digit code has been sent to it.</p>
            ${otpHtml}
            ${swalPasswordField('swal-new-password', 'New Password')}
            ${swalPasswordField('swal-confirm-password', 'Confirm New Password')}
        `;

        const { value: formValues, dismiss: formDismiss } = await swalForm({
            title: 'Reset Password',
            html: combinedHtml,
            confirmButtonText: `${UI_ICON.save} Reset Password`,
            didOpen: () => {
                const container = Swal.getHtmlContainer();
                bindSwalPasswordToggles(container);

                const firstPasswordInput = container.querySelector('#swal-new-password');
                bindSwalOtpInputs(container, {
                    afterLastInput: () => firstPasswordInput?.focus()
                });
                initOtpSwalTurnstile();
            },
            preConfirm: () => {
                const container = Swal.getHtmlContainer();
                const code = readSwalOtpCode(container);

                const pass = document.getElementById('swal-new-password').value;
                const confirmPass = document.getElementById('swal-confirm-password').value;

                if (code.length !== 6) {
                    Swal.showValidationMessage('Please enter the complete 6-digit code');
                    return false;
                }

                const turnstileToken = readOtpSwalTurnstileToken();
                if (!turnstileToken) {
                    Swal.showValidationMessage(turnstileRequiredMessage());
                    return false;
                }
                if (!pass || !confirmPass) {
                    Swal.showValidationMessage('Please fill the password fields');
                    return false;
                }
                if (pass.length < 8) {
                    Swal.showValidationMessage('Password must be at least 8 characters');
                    return false;
                }
                if (pass !== confirmPass) {
                    Swal.showValidationMessage('Passwords do not match');
                    return false;
                }
                if (!/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/[0-9]/.test(pass) || !/[!@#$%^&*(),.?:{}|<>]/.test(pass)) {
                    Swal.showValidationMessage('Password must contain uppercase, lowercase, number, and special character.');
                    return false;
                }

                return { otpCode: code, newPassword: pass, turnstileToken };
            }
        });

        resetKanbanTurnstile(OTP_TURNSTILE_CONTAINER);
        if (formDismiss) return;

        const resetResponse = await apiRequest('/Auth/ResetPassword', {
            method: 'POST',
            body: JSON.stringify({
                email: email,
                otpCode: formValues.otpCode,
                password: formValues.newPassword,
                turnstileToken: formValues.turnstileToken
            })
        });

        if (resetResponse?.success) {
            swalFlash('success', 'Password Reset', 'Your password has been reset. You can now log in.', 2500);
            openLoginModal(email);
        } else {
            alertApiFailure(resetResponse, 'Password reset failed. The code might be invalid or expired.');
        }

    } catch (error) {
        refreshModalTurnstile('loginModal');
        console.error(error);
        swalAlert('error', 'Error', 'An unexpected error occurred.');
    }
}

async function postLogoutRequest() {
    const token = await refreshXsrfToken();
    const response = await fetch('/Auth/Logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json',
            'X-XSRF-TOKEN': token || ''
        },
        credentials: 'same-origin'
    });
    return response.ok;
}

let sessionRecoveryStarted = false;

function recoverExpiredSession(message) {
    if (sessionRecoveryStarted) return;
    sessionRecoveryStarted = true;
    handleLogout(true, message);
}

async function handleLogout(refresh = true, message = '') {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('open')) toggleSidebar();

    try {
        await postLogoutRequest();
    } catch (error) {
        console.warn('Logout API error (continuing cleanup):', error);
    }

    clearSessionState();
    deleteAppCookies();
    updateAuthUI();

    if (refresh) {
        sessionRecoveryStarted = true;
        if (message.length > 0) {
            await swalFlash('warning', 'Session Expired', message, 1500);
        } else {
            await swalFlash('success', 'Logged Out', 'Logged out successfully.', 500);
        }
        window.location.replace('/Auth/ClearSession');
    }
}

function confirmLogout() {
    swalConfirm({
        title: 'Logout',
        text: 'Are you sure you want to logout?',
        icon: 'question',
        confirmText: `${UI_ICON.logout} Logout`,
        confirmVariant: 'danger'
    }).then(result => {
        if (result.isConfirmed) handleLogout();
    });
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuBtn = document.querySelector('.menu-toggle');
    const isOpen = sidebar.classList.toggle('open');
    overlay.classList.toggle('active', isOpen);
    if (window.innerWidth > 768) document.body.classList.toggle('sidebar-open', isOpen);
    if (menuBtn) menuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (overlay) overlay.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
}

async function loadBoards() {
    try {
        const res = await apiRequest('/Kanban/GetBoards');
        if (!res?.success || !res.data) return;

        AppState.boards = res.data;
        renderBoardList();

        if (AppState.boards.length === 0) return;

        const savedBoardId = Number(localStorage.getItem('kanflow:lastBoardId'));
        const hasSavedBoard = savedBoardId && AppState.boards.some(b => b.id === savedBoardId);
        const targetId = hasSavedBoard ? savedBoardId : AppState.boards[0].id;

        if (!AppState.currentBoardId || AppState.currentBoardId !== targetId) {
            await selectBoard(targetId);
        }
    } catch (e) {
        console.error('Failed to load boards:', e);
    }
}

function renderBoardList() {
    const boardHeader = document.getElementById('boardHeader');
    if (!AppState.isAuthenticated) {
        if (boardHeader) {
            boardHeader.classList.add('u-hidden');
            boardHeader.style.display = 'none';
        }
        document.getElementById('boardHeaderTitle').textContent = '';
    }

    const list = document.getElementById('boardList');
    const sharedList = document.getElementById('sharedBoardList');

    const myBoards = AppState.boards.filter(b => b.isOwner === true);
    const sharedBoards = AppState.boards.filter(b => b.isOwner === false);

    const boardHtml = (b) => `
        <li class="board-item ${b.id === AppState.currentBoardId ? 'active' : ''}" data-board-id="${b.id}">
            <span>📊 ${escapeHtml(b.title)}</span>
            <button type="button" class="board-actions-btn" data-board-menu="${b.id}"
                    title="Board options" aria-label="Board options">⋮</button>
        </li>
    `;

    if (list) list.innerHTML = myBoards.map(boardHtml).join('');
    if (sharedList) sharedList.innerHTML = sharedBoards.map(boardHtml).join('');

    [list, sharedList].forEach(container => {
        if (!container) return;
        const clone = container.cloneNode(true);
        container.parentNode.replaceChild(clone, container);

        clone.addEventListener('click', (e) => {
            const menuBtn = e.target.closest('.board-actions-btn');
            if (menuBtn) {
                e.stopPropagation();
                const boardId = Number(menuBtn.dataset.boardMenu);
                if (boardId) showBoardMenu(boardId);
                return;
            }
            const item = e.target.closest('.board-item');
            if (item) {
                const boardId = Number(item.dataset.boardId);
                if (boardId) selectBoard(boardId);
            }
        });
    });
}

async function selectBoard(id) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar?.classList.contains('open')) toggleSidebar();

    AppState.stopPolling();
    AppState.currentBoardId = id;
    localStorage.setItem('kanflow:lastBoardId', String(id));
    renderBoardList();
    await loadBoardData(true, true);
    BoardSync.dirty = false;
    joinCurrentBoard();
    AppState.startPolling();
}

async function openNewBoardModal() {
    if (!checkAuth()) return;
    const { value: tt } = await swalForm({
        title: 'New Board',
        input: 'text',
        inputLabel: 'Board name',
        inputPlaceholder: 'Enter board name...',
        confirmButtonText: `${UI_ICON.create} Create Board`,
        inputValidator: (value) => {
            if (value.trim().length < 3) return 'Name must be at least 3 characters!';
            if (value.trim().length > 100) return 'Name is too long!';
        }
    });
    if (tt && tt.trim()) {
        const res = await apiRequest('/Kanban/CreateBoard', {
            method: 'POST',
            body: JSON.stringify({ title: tt.trim() })
        });
        if (!res?.success) {
            alertApiFailure(res, 'Failed to create board.');
            return;
        }
        loadBoards();
        showToast('Board created', 'success');
    }
}

function createCardHtml(card, colId, currentUserId, isResultColumn = false) {
    if (isResultColumn) {
        return `
        <div class="card card--result"
             data-card-id="${card.id}"
             data-col-id="${colId}">
            <h3 class="card-title">${escapeHtml(cardDisplayTitle(card))}</h3>
        </div>`;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let cardBgColor = '#ffffff';
    if (card.dueDate && card.warningDays && card.highlightColor) {
        const dueDate = new Date(card.dueDate);
        dueDate.setHours(0, 0, 0, 0);
        const diffTime = dueDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays <= card.warningDays && diffDays >= 0) {
            cardBgColor = isSafeHexColor(card.highlightColor) ? card.highlightColor : '#ffffff';
        } else if (diffDays < 0) {
            cardBgColor = '#fee2e2';
        }
    }

    const isLocked = card.assigneeId && card.assigneeId !== currentUserId;
    const cursorStyle = isLocked ? 'not-allowed' : 'grab';
    const lockedClass = isLocked ? 'locked-card' : '';
    const lockIcon = isLocked ? '<span title="Locked by another user">🔒</span>' : '';
    const opacityStyle = isLocked ? 'opacity:0.8;' : '';

    const avatarHtml = card.assigneeAvatar
        ? `<img src="${getAvatarPath(card.assigneeAvatar)}" title="${escapeHtml(card.assigneeName)}" class="card-avatar-small">`
        : `<span class="card-avatar-empty" title="Unassigned">👤</span>`;

    const descText = stripHtml(card.desc).trim();

    const moveButtonsHtml = isLocked ? '' : `
        <div class="card-move-buttons">
            <button class="move-card-top-btn card-action-btn" data-card-id="${card.id}" data-col-id="${colId}" title="Move to Top" type="button">▲</button>
            <button class="move-card-bottom-btn card-action-btn" data-card-id="${card.id}" data-col-id="${colId}" title="Move to Bottom" type="button">▼</button>
        </div>
    `;

    return `
        <div class="card ${lockedClass}"
             data-card-id="${card.id}"
             data-col-id="${colId}"
             style="background-color:${cardBgColor}; transition:background-color 0.3s; cursor:${cursorStyle}; ${opacityStyle}">

            <div class="card-head-row">
                <div class="card-head-meta">
                    ${lockIcon}
                    ${card.dueDate ? `<span class="card-date">📅 ${new Date(card.dueDate).toLocaleDateString(UI_LOCALE)}</span>` : ''}
                </div>
                <button type="button" class="card-delete-btn" data-card-id="${card.id}"
                        title="Delete card" aria-label="Delete card">×</button>
            </div>

            <h3 class="card-title">${escapeHtml(cardDisplayTitle(card))}</h3>

            ${descText ? `<p class="card-desc-truncate">${escapeHtml(descText)}</p>` : ''}

            <div class="card-footer">
                <div class="card-owner-name">
                    ${card.assigneeName ? escapeHtml(card.assigneeName.split(' ')[0]) : 'Unassigned'}
                </div>
                <div class="card-footer-actions">
                    ${moveButtonsHtml}
                    ${avatarHtml}
                </div>
            </div>
        </div>
    `;
}

// Returns true on success, false when the server refused, null on a network/HTTP failure.
async function loadBoardData(showLoad = true, animate = false) {
    if (!AppState.currentBoardId) return false;
    try {
        const res = await apiRequest(`/Kanban/GetBoard?boardId=${AppState.currentBoardId}`, {}, showLoad);
        if (!res?.success || !res.data) {
            if (showLoad) alertApiFailure(res, 'Data could not be loaded.');
            return res?.failed ? null : false;
        }
        const columnsRes = res.data.item1;
        const timeRes = res.data.item2;

        AppState.currentColumns = columnsRes;
        AppState.lastSyncTime = timeRes;

        renderColumns(columnsRes, animate);

        const currentBoard = AppState.boards.find(b => b.id === AppState.currentBoardId);
        if (currentBoard) {
            const header = document.getElementById("boardHeader");
            if (header) {
                header.classList.remove('u-hidden');
                header.style.display = "flex";
            }
            document.getElementById("boardHeaderTitle").textContent = currentBoard.title;
        }
        if (kanflowCalendar && !document.getElementById('calendar')?.classList.contains('u-hidden')) {
            kanflowCalendar.refetchEvents();
        }
        return true;
    } catch (e) {
        console.error(e);
        if (showLoad) swalAlert('error', 'Error', 'Data could not be loaded.');
        return null;
    }
}

async function handleLoadMore(colId, btnElement) {
    if (!checkAuth()) return;
    const col = AppState.currentColumns.find(c => c.id === colId);
    if (!col) return;

    const skipCount = col.cards.length;
    const currentUserId = AppState.currentUser ? AppState.currentUser.userId : 0;

    const originalText = btnElement.textContent;
    btnElement.disabled = true;
    btnElement.textContent = "Loading...";

    try {
        const res = await apiRequest(`/Kanban/GetMoreCards?boardId=${AppState.currentBoardId}&columnId=${colId}&skipCount=${skipCount}`, {}, false);
        if (!res?.success) {
            btnElement.disabled = false;
            btnElement.textContent = originalText;
            showToast(res?.errorMessage || 'Could not load more cards', 'error');
            return;
        }
        const newCards = res.data;

        if (newCards && newCards.length > 0) {
            col.cards.push(...newCards);

            const container = document.querySelector(`.cards-container[data-column-id="${colId}"]`);
            if (container) {
                const newCardsHtml = newCards.map(card =>
                    createCardHtml(card, colId, currentUserId, col.isResultColumn)).join('');
                container.insertAdjacentHTML('beforeend', newCardsHtml);
            }

            if (col.cards.length >= col.totalCards) {
                btnElement.remove();
            } else {
                btnElement.disabled = false;
                btnElement.textContent = "Show More";
            }

            initSortable();
        } else {
            btnElement.remove();
        }
    } catch (e) {
        btnElement.disabled = false;
        btnElement.textContent = originalText;
    }
}

async function startRenameProcess(boardId) {
    const board = AppState.boards.find(b => b.id === boardId);
    if (!board) return;

    const currentName = board.title;

    const result = await swalForm({
        title: 'Rename Board',
        input: 'text',
        inputValue: currentName,
        inputLabel: 'Board name',
        confirmButtonText: `${UI_ICON.save} Save`,
        inputPlaceholder: 'Enter new board name',
        inputValidator: (value) => {
            if (value.trim().length < 3) return 'Name must be at least 3 characters!';
            if (value.trim().length > 100) return 'Name is too long!';
        }
    });

    const newTitle = result.value;
    if (result.isConfirmed && newTitle && newTitle.trim() !== currentName) {
        const finalTitle = newTitle.trim();
        const res = await apiRequest('/Kanban/UpdateBoardTitle', {
            method: 'POST',
            body: JSON.stringify({ boardId, title: finalTitle })
        }, false);
        if (!res?.success) {
            alertApiFailure(res, 'Failed to rename board.');
            return;
        }

        const b = AppState.boards.find(b => b.id === boardId);
        if (b) b.title = finalTitle;

        if (AppState.currentBoardId === boardId) {
            const headerTitle = document.getElementById('boardHeaderTitle');
            if (headerTitle) headerTitle.innerText = finalTitle;
        }

        renderBoardList();
        showToast('Board renamed', 'success');
    } else if (result.isDismissed) {
        showBoardMenu(boardId);
    }
}

async function showBoardMenu(boardId) {
    if (!checkAuth()) return;

    const board = AppState.boards.find(b => b.id === boardId);
    if (!board) return;

    // Only owners can rename or delete; for members the server's delete is "leave board".
    const isOwner = board.isOwner === true;

    await swalPanel({
        title: escapeHtml(board.title),
        width: swalWidth('400px'),
        html: `
            <div id="board-menu" class="kf-menu">
                ${isOwner ? `
                <button type="button" class="kf-menu-btn" data-menu-action="rename">
                    <span class="kf-menu-icon" aria-hidden="true">${UI_ICON.rename}</span> Rename Board
                </button>` : ''}
                <button type="button" class="kf-menu-btn" data-menu-action="manage">
                    <span class="kf-menu-icon" aria-hidden="true">${UI_ICON.members}</span> Manage Users
                </button>
                <div class="kf-menu-sep"></div>
                <button type="button" class="kf-menu-btn kf-menu-btn--danger" data-menu-action="delete">
                    <span class="kf-menu-icon" aria-hidden="true">${isOwner ? UI_ICON.delete : UI_ICON.logout}</span>
                    ${isOwner ? 'Delete Board' : 'Leave Board'}
                </button>
            </div>
        `,
        didOpen: () => {
            document.getElementById('board-menu')?.addEventListener('click', (e) => {
                const btn = e.target.closest('.kf-menu-btn');
                if (!btn) return;

                Swal.close();
                switch (btn.dataset.menuAction) {
                    case 'rename': startRenameProcess(boardId); break;
                    case 'manage': openManageUsersModal(boardId); break;
                    case 'delete': deleteBoard(boardId); break;
                }
            });
        }
    });
}

async function openManageUsersModal(boardId) {
    try {
        const res = await apiRequest(`/Kanban/GetBoardMembers?boardId=${boardId}`);
        if (!res?.success || !res.data) {
            alertApiFailure(res, 'Failed to load members.');
            return;
        }
        const members = res.data;

        const currentUserId = AppState.currentUser.userId;
        const me = members.find(m => m.userId === currentUserId);
        const amIOwner = me && me.roleCode === 'OWNER';

        const rowsHtml = members.map(m => {
            const isMe = m.userId === currentUserId;
            const isTargetOwner = m.roleCode === 'OWNER';

            const roleBadge = isTargetOwner
                ? `<span class="kf-badge kf-badge--owner">${UI_ICON.owner} Owner</span>`
                : `<span class="kf-badge">👤 Member</span>`;

            let actions = '';
            if (amIOwner && !isTargetOwner) {
                actions = `
                    <button type="button" class="btn btn-sm btn-square btn-owner member-promote-btn"
                            data-board-id="${boardId}" data-user-id="${m.userId}"
                            title="Make owner" aria-label="Make owner">${UI_ICON.owner}</button>
                    <button type="button" class="btn btn-sm btn-square btn-danger member-remove-btn"
                            data-board-id="${boardId}" data-user-id="${m.userId}"
                            title="Remove user" aria-label="Remove user">${UI_ICON.delete}</button>
                `;
            } else if (isMe) {
                actions = `<span class="kf-cell-note">(It's you)</span>`;
            }

            return `
                <tr>
                    <td>
                        <div class="kf-cell-name">${escapeHtml(m.fullName)}</div>
                        <div class="kf-cell-sub">${escapeHtml(m.email)}</div>
                    </td>
                    <td style="text-align:center;">${roleBadge}</td>
                    <td><div class="kf-table-actions">${actions}</div></td>
                </tr>
            `;
        }).join('');

        swalDialog({
            title: 'Manage Users',
            width: swalWidth('650px'),
            framed: true,
            html: `
                <div class="kf-scroll-sm">
                    <table class="kf-table">
                        <thead>
                            <tr>
                                <th>User</th>
                                <th style="text-align:center;">Role</th>
                                <th style="text-align:right;">Actions</th>
                            </tr>
                        </thead>
                        <tbody id="members-tbody">${rowsHtml}</tbody>
                    </table>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: `${UI_ICON.create} Invite User`,
            cancelButtonText: 'Close',
            showCloseButton: true,
            didOpen: () => {
                document.getElementById('members-tbody')?.addEventListener('click', (e) => {
                    const promoteBtn = e.target.closest('.member-promote-btn');
                    const removeBtn = e.target.closest('.member-remove-btn');
                    if (promoteBtn) {
                        promoteToOwner(Number(promoteBtn.dataset.boardId), Number(promoteBtn.dataset.userId));
                    } else if (removeBtn) {
                        removeMember(Number(removeBtn.dataset.boardId), Number(removeBtn.dataset.userId));
                    }
                });
            }
        }).then((result) => {
            if (result.isConfirmed) {
                addUserToBoard(boardId);
            } else {
                showBoardMenu(boardId);
            }
        });

    } catch (e) {
        console.error(e);
        swalAlert('error', 'Error', 'Failed to load members.');
    }
}

async function promoteToOwner(boardId, userId) {
    if (!checkAuth()) return;

    const confirm = await swalConfirm({
        title: 'Make Owner?',
        text: 'This user will have full control over the board.',
        icon: 'question',
        confirmText: `${UI_ICON.owner} Make Owner`,
        confirmVariant: 'owner'
    });

    if (confirm.isConfirmed) {
        const response = await apiRequest(`/Kanban/PromoteToOwner`, {
            method: 'POST',
            body: JSON.stringify({ boardId, userId })
        });
        if (response?.success) {
            showToast('User promoted to owner', 'success', 2000);
        } else {
            await alertApiFailure(response, 'Failed to promote user.');
        }
        openManageUsersModal(boardId);
    }
}

async function removeMember(boardId, userId) {
    const confirm = await swalConfirm({
        title: 'Remove User?',
        text: 'This user will be removed from the board.',
        confirmText: `${UI_ICON.delete} Remove User`,
        confirmVariant: 'danger'
    });

    if (confirm.isConfirmed) {
        const response = await apiRequest('/Kanban/DeleteMember', {
            method: 'POST',
            body: JSON.stringify({ boardId, userId })
        });
        if (response?.success) {
            showToast('User removed', 'success', 2000);
        } else {
            await alertApiFailure(response, 'Failed to remove user.');
        }
        openManageUsersModal(boardId);
    }
}

async function addUserToBoard(boardId) {
    const { value: email } = await swalForm({
        title: 'Invite User',
        input: 'email',
        inputLabel: 'Enter the user email address',
        inputPlaceholder: 'user@example.com',
        confirmButtonText: `${UI_ICON.send} Send Invite`
    });
    if (email) {
        const response = await apiRequest('/Kanban/InviteUserToBoard', {
            method: 'POST',
            body: JSON.stringify({ boardId, email })
        });
        if (response?.success) {
            showToast('Invite sent', 'success');
        } else {
            await alertApiFailure(response, 'User could not be invited.');
        }
    }
    openManageUsersModal(boardId);
}

async function deleteBoard(boardId) {
    // For non-owners the server's DeleteBoard removes only their membership.
    const isOwner = AppState.boards.find(b => b.id === boardId)?.isOwner === true;
    const result = await swalConfirm({
        ...(isOwner ? {
            title: 'Delete Board?',
            text: 'This board and all of its contents will be deleted.',
            confirmText: `${UI_ICON.delete} Delete Board`
        } : {
            title: 'Leave Board?',
            text: 'You will lose access to this board until you are invited again.',
            confirmText: `${UI_ICON.logout} Leave Board`
        }),
        confirmVariant: 'danger'
    });
    if (result.isConfirmed) {
        const res = await apiRequest(`/Kanban/DeleteBoard`, {
            method: 'POST',
            body: JSON.stringify({ boardId })
        });
        if (!res?.success) {
            alertApiFailure(res, isOwner ? 'Failed to delete board.' : 'Failed to leave board.');
            return;
        }
        if (AppState.currentBoardId === boardId) {
            AppState.currentBoardId = null;
            document.getElementById('board').innerHTML = '';
            document.getElementById("boardHeader").style.display = "none";
            joinCurrentBoard();
        }
        loadBoards();
        showToast(isOwner ? 'Board deleted' : 'You left the board', 'success');
    } else {
        showBoardMenu(boardId);
    }
}

let kanflowCalendar = null;

function changeView(e) {
    const boardEl = document.getElementById('board');
    const calendarEl = document.getElementById('calendar');

    let btn = null;
    if (e && e.target) {
        btn = e.target.closest('button');
    }

    const isCalendarHidden = calendarEl.classList.contains('u-hidden') || calendarEl.style.display === 'none' || calendarEl.style.display === '';

    if (isCalendarHidden) {
        openCalendarView();

        if (btn) {
            btn.innerHTML = '📋';
            btn.title = 'Board View';
            btn.setAttribute('aria-label', 'Board view');
        }
    } else {
        calendarEl.classList.add('u-hidden');
        calendarEl.style.display = 'none';
        boardEl.style.display = '';

        if (btn) {
            btn.innerHTML = '📅';
            btn.title = 'Calendar View';
            btn.setAttribute('aria-label', 'Calendar view');
        }
    }
}

function openCalendarView() {
    const boardEl = document.getElementById('board');
    const calendarEl = document.getElementById('calendar');

    boardEl.style.display = 'none';
    calendarEl.classList.remove('u-hidden');
    calendarEl.style.display = 'flex';

    setTimeout(() => {
        if (kanflowCalendar) {
            kanflowCalendar.updateSize();
            kanflowCalendar.refetchEvents();
            return;
        }

        kanflowCalendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            height: '100%',
            expandRows: true,
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek'
            },
            events: function (info, successCallback, failureCallback) {
                let calendarEvents = [];
                AppState.currentColumns.forEach(col => {
                    col.cards.forEach(card => {
                        if (card.dueDate || card.startDate) {
                            // Cards are date-only. FullCalendar treats `end` as exclusive,
                            // so the due day itself needs end = due + 1 day.
                            const due = formatDateInput(card.dueDate);
                            calendarEvents.push({
                                id: card.id,
                                title: cardDisplayTitle(card),
                                allDay: true,
                                start: formatDateInput(card.startDate || card.dueDate),
                                end: due ? addDaysToDateInput(due, 1) : undefined,
                                backgroundColor: card.calendarColor || '#3b82f6',
                                borderColor: card.calendarColor || '#3b82f6',
                                extendedProps: { columnId: col.id }
                            });
                        }
                    });
                });
                successCallback(calendarEvents);
            },
            eventClick: function (info) {
                const cardId = info.event.id;
                const colId = info.event.extendedProps.columnId;
                openCardModal(colId, cardId);
            }
        });

        kanflowCalendar.render();
    }, 10);
}
function closeAllColumnMenus() {
    document.querySelectorAll('.col-menu-dropdown.is-open').forEach(el => {
        el.classList.remove('is-open');
        el.previousElementSibling?.setAttribute('aria-expanded', 'false');
    });
}

function ensureColumnMenuListener() {
    if (AppState.columnMenuListenerAttached) return;
    document.addEventListener('click', closeAllColumnMenus);
    AppState.columnMenuListenerAttached = true;
}

function renderColumnHeaderHtml(col, isOwner, cardCountLabel) {
    const addCardBtn = `
        <button type="button" class="col-add-card-btn btn btn-sm btn-square btn-primary" data-col-id="${col.id}"
                title="Add card" aria-label="Add card">${UI_ICON.create}</button>`;

    const editBtn = isOwner
        ? `<button type="button" class="col-edit-btn btn btn-sm btn-square btn-info" data-col-id="${col.id}"
                   title="Edit column" aria-label="Edit column">${UI_ICON.rename}</button>`
        : '';

    const deleteBtn = isOwner
        ? `<button type="button" class="col-delete-btn btn btn-sm btn-square btn-secondary" data-col-id="${col.id}"
                   title="Delete column" aria-label="Delete column">${UI_ICON.delete}</button>`
        : `<button type="button" class="btn btn-sm btn-square btn-secondary" disabled
                   title="Only the owner can delete columns" aria-label="Delete column">${UI_ICON.delete}</button>`;

    const menuItems = [
        `<button type="button" class="col-menu-item col-add-card-btn" data-col-id="${col.id}" role="menuitem">
            <span class="col-menu-item-icon" aria-hidden="true">${UI_ICON.create}</span>
            <span>Add card</span>
        </button>`
    ];

    if (isOwner) {
        menuItems.push(
            `<button type="button" class="col-menu-item col-edit-btn" data-col-id="${col.id}" role="menuitem">
                <span class="col-menu-item-icon" aria-hidden="true">${UI_ICON.rename}</span>
                <span>Edit column</span>
            </button>`,
            `<button type="button" class="col-menu-item col-menu-item--danger col-delete-btn" data-col-id="${col.id}" role="menuitem">
                <span class="col-menu-item-icon" aria-hidden="true">${UI_ICON.delete}</span>
                <span>Delete column</span>
            </button>`
        );
    }

    return `
        <div class="column-header-top">
            <div class="column-header-main">
                <h2 class="column-title" title="${escapeHtml(col.title)}">${escapeHtml(col.title)}</h2>
                <span class="card-count">${cardCountLabel}</span>
            </div>
            <div class="column-header-actions column-header-actions--desktop">
                ${addCardBtn}
                ${editBtn}
                ${deleteBtn}
            </div>
            <div class="column-header-menu">
                <button type="button" class="col-menu-btn btn btn-sm btn-square btn-secondary"
                        data-col-id="${col.id}" aria-label="Column actions" aria-haspopup="menu" aria-expanded="false">⋮</button>
                <div class="col-menu-dropdown" role="menu">
                    ${menuItems.join('')}
                </div>
            </div>
        </div>`;
}

function bindColumnResultInfoToggle(root = document) {
    const checkbox = root.querySelector('#column-result-check');
    const info = root.querySelector('#column-result-info');
    if (!checkbox || !info) return;

    const sync = () => {
        info.hidden = !checkbox.checked;
    };
    checkbox.addEventListener('change', sync);
    sync();
}

function columnFormHtml(title = '', isResultColumn = false) {
    return `
        <div class="kf-form">
            <div class="kf-field">
                <label class="kf-label" for="column-title-input">Column name</label>
                <input type="text" id="column-title-input" class="kf-input" maxlength="100"
                       placeholder="Enter column name..." value="${escapeHtml(title)}">
            </div>
            <div class="kf-check-row">
                <input type="checkbox" id="column-result-check" ${isResultColumn ? 'checked' : ''}>
                <label for="column-result-check">Result column</label>
            </div>
            <div id="column-result-info" class="kf-result-info"${isResultColumn ? '' : ' hidden'}>
                <p class="kf-result-info-title">What changes in a result column?</p>
                <ul class="kf-result-info-list">
                    <li>Cards show <strong>only the title</strong>, not the description or dates.</li>
                    <li>Titles appear with a <strong>strikethrough</strong> to mark them complete.</li>
                    <li>Cards stay clickable — open them anytime to view or edit details.</li>
                </ul>
            </div>
        </div>`;
}

function renderColumns(columns, animate = false) {
    const boardDiv = document.getElementById('board');
    const displayColumns = filterColumnsForSearch(columns, AppState.searchQuery);
    if (!displayColumns || displayColumns.length === 0) {
        boardDiv.classList.remove('cards-animate');
        boardDiv.innerHTML = AppState.currentBoardId
            ? `<div class="board-empty">
                    <div class="board-empty-icon">🗂️</div>
                    <h2 class="board-empty-title">This board is empty</h2>
                    <p class="board-empty-text">Create your first column with the ➕ button in the top bar to start organizing your tasks.</p>
               </div>`
            : '';
        return;
    }

    const currentUserId = AppState.currentUser ? AppState.currentUser.userId : 0;
    const currentBoard = AppState.boards.find(b => b.id === AppState.currentBoardId);
    const isOwner = currentBoard && currentBoard.isOwner === true;

    const addColBtn = document.getElementById('btnNewColumn');
    if (addColBtn) {
        addColBtn.disabled = !isOwner;
        addColBtn.title = isOwner ? 'Add column' : 'Only the owner can add columns';
    }

    boardDiv.innerHTML = displayColumns.map(col => {
        const isSearching = !!AppState.searchQuery;
        const totalCards = col.totalCards || col.cards.length;
        const showLoadMore = !isSearching && totalCards > col.cards.length;
        const cardCountLabel = isSearching ? col.cards.length : totalCards;

        const loadMoreHtml = showLoadMore
            ? `<button type="button" class="load-more-btn btn btn-sm btn-secondary" data-col-id="${col.id}">Show More</button>`
            : '';

        return `
        <div class="column${col.isResultColumn ? ' column--result' : ''}" data-col-id="${col.id}">
            <div class="column-header">
                ${renderColumnHeaderHtml(col, isOwner, cardCountLabel)}
            </div>

            <div class="cards-container${col.cards.length === 0 ? ' cards-container--empty' : ''}" data-column-id="${col.id}">
                ${col.cards.length === 0 ? '<div class="cards-empty-label">Empty</div>' : ''}
                ${col.cards.map((card) => createCardHtml(card, col.id, currentUserId, col.isResultColumn)).join('')}
            </div>
            
            ${loadMoreHtml}

            <button type="button" class="col-add-card-bottom btn btn-success" data-col-id="${col.id}">${UI_ICON.create} Add Card</button>
        </div>
    `}).join('');

    ensureColumnMenuListener();

    const newBoardDiv = boardDiv.cloneNode(true);
    newBoardDiv.classList.toggle('cards-animate', animate);
    boardDiv.parentNode.replaceChild(newBoardDiv, boardDiv);

    if (animate) {
        setTimeout(() => newBoardDiv.classList.remove('cards-animate'), 600);
    }

    newBoardDiv.querySelectorAll('.cards-container').forEach(container => {
        const handleScroll = () => {
            const loadMoreBtn = container.parentElement.querySelector('.load-more-btn');
            if (!loadMoreBtn) return;

            const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 10;

            if (isAtBottom) {
                loadMoreBtn.style.opacity = '1';
                loadMoreBtn.style.pointerEvents = 'auto';
            } else {
                loadMoreBtn.style.opacity = '0';
                loadMoreBtn.style.pointerEvents = 'none';
            }
        };

        container.addEventListener('scroll', handleScroll);

        setTimeout(handleScroll, 0);
    });

    newBoardDiv.addEventListener('click', (e) => {
        const loadMoreBtn = e.target.closest('.load-more-btn');
        if (loadMoreBtn) {
            e.stopPropagation();
            const colId = Number(loadMoreBtn.dataset.colId);
            if (colId) {
                handleLoadMore(colId, loadMoreBtn);
                loadMoreBtn.style.opacity = '0';
                loadMoreBtn.style.pointerEvents = 'none';
            }
            return;
        }

        const deleteBtn = e.target.closest('.card-delete-btn');
        if (deleteBtn) {
            e.stopPropagation();
            const cardId = Number(deleteBtn.dataset.cardId);
            if (cardId) deleteCard(cardId, false);
            return;
        }

        const moveTopBtn = e.target.closest('.move-card-top-btn');
        if (moveTopBtn) {
            e.stopPropagation();
            const cardId = moveTopBtn.dataset.cardId;
            const colId = moveTopBtn.dataset.colId;
            moveCardTop(cardId, colId);
            return;
        }

        const moveBottomBtn = e.target.closest('.move-card-bottom-btn');
        if (moveBottomBtn) {
            e.stopPropagation();
            const cardId = moveBottomBtn.dataset.cardId;
            const colId = moveBottomBtn.dataset.colId;
            moveCardBottom(cardId, colId);
            return;
        }

        const colEditBtn = e.target.closest('.col-edit-btn');
        if (colEditBtn) {
            e.stopPropagation();
            closeAllColumnMenus();
            const colId = Number(colEditBtn.dataset.colId);
            if (colId) openEditColumnModal(colId);
            return;
        }

        const colMenuBtn = e.target.closest('.col-menu-btn');
        if (colMenuBtn) {
            e.stopPropagation();
            const dropdown = colMenuBtn.nextElementSibling;
            const wasOpen = dropdown?.classList.contains('is-open');
            closeAllColumnMenus();
            if (dropdown && !wasOpen) {
                dropdown.classList.add('is-open');
                colMenuBtn.setAttribute('aria-expanded', 'true');
            }
            return;
        }

        const colDeleteBtn = e.target.closest('.col-delete-btn');
        if (colDeleteBtn) {
            e.stopPropagation();
            closeAllColumnMenus();
            const colId = Number(colDeleteBtn.dataset.colId);
            if (colId) deleteColumn(colId);
            return;
        }

        const addCardBtn = e.target.closest('.col-add-card-btn') || e.target.closest('.col-add-card-bottom');
        if (addCardBtn) {
            e.stopPropagation();
            closeAllColumnMenus();
            const colId = Number(addCardBtn.dataset.colId);
            if (colId) openCardModal(colId);
            return;
        }

        const card = e.target.closest('.card');
        if (card) {
            const cardId = Number(card.dataset.cardId);
            const colId = Number(card.dataset.colId);
            if (cardId && colId) openCardModal(colId, cardId);
        }
    });

    newBoardDiv.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.card')) e.preventDefault();
    });

    initSortable();
}

async function moveCardTop(cardId, colId) {
    if (!checkAuth() || !cardId || !colId) return;

    const column = AppState.currentColumns.find(c => c.id == colId);
    if (!column || column.cards.length < 2) return;

    const res = await apiRequest('/Kanban/MoveCard', {
        method: 'POST',
        body: JSON.stringify({
            boardId: AppState.currentBoardId,
            cardId: cardId,
            newColumnId: colId,
            newOrder: 1
        })
    });
    if (!res?.success) {
        alertApiFailure(res, 'Failed to move card.');
        return;
    }
    await loadBoardData(false);

    const refreshedCol = document.querySelector(`.cards-container[data-column-id="${colId}"]`);
    if (refreshedCol) {
        refreshedCol.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

async function moveCardBottom(cardId, colId) {
    if (!checkAuth() || !cardId || !colId) return;

    const column = AppState.currentColumns.find(c => c.id == colId);
    if (!column || column.cards.length < 2) return;

    const res = await apiRequest('/Kanban/MoveCard', {
        method: 'POST',
        body: JSON.stringify({
            boardId: AppState.currentBoardId,
            cardId: cardId,
            newColumnId: colId,
            newOrder: 999999
        })
    });
    if (!res?.success) {
        alertApiFailure(res, 'Failed to move card.');
        return;
    }
    await loadBoardData(false);

    const refreshedCol = document.querySelector(`.cards-container[data-column-id="${colId}"]`);
    if (refreshedCol) {
        refreshedCol.scrollTo({ top: refreshedCol.scrollHeight, behavior: 'smooth' });
    }
}

let autoScrollSpeed = 0;
let autoScrollFrame = null;
let currentContainer = null;

document.addEventListener('dragover', (e) => {
    handleScrollCalculation(e.clientY, e.target);
});

document.addEventListener('touchmove', (e) => {
    if (!AppState.isDragging) return;

    const touch = e.touches[0];
    const y = touch.clientY;
    const x = touch.clientX;

    const elementUnderFinger = document.elementFromPoint(x, y);

    handleScrollCalculation(y, elementUnderFinger);
}, { passive: false });

function handleScrollCalculation(y, targetElement) {
    if (!AppState.isDragging || !targetElement) return;

    const container = targetElement.closest('.cards-container');

    if (!container) {
        autoScrollSpeed = 0;
        return;
    }

    currentContainer = container;
    const rect = container.getBoundingClientRect();

    const sensitivity = 200;
    const maxSpeed = 20;

    if (y < rect.top + sensitivity) {
        const intensity = 1 - Math.max(0, (y - rect.top) / sensitivity);
        autoScrollSpeed = -maxSpeed * intensity;
    }
    else if (y > rect.bottom - sensitivity) {
        const intensity = 1 - Math.max(0, (rect.bottom - y) / sensitivity);
        autoScrollSpeed = maxSpeed * intensity;
    }
    else {
        autoScrollSpeed = 0;
    }

    if (autoScrollSpeed !== 0 && !autoScrollFrame) {
        performSmoothScroll();
    }
}

function performSmoothScroll() {
    if (Math.abs(autoScrollSpeed) < 0.1 || !currentContainer) {
        cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = null;
        return;
    }

    currentContainer.scrollTop += autoScrollSpeed;
    autoScrollFrame = requestAnimationFrame(performSmoothScroll);
}

const stopScroll = () => {
    autoScrollSpeed = 0;
    if (autoScrollFrame) {
        cancelAnimationFrame(autoScrollFrame);
        autoScrollFrame = null;
    }
    currentContainer = null;
};

document.addEventListener('dragend', stopScroll);
document.addEventListener('touchend', stopScroll);

function syncColumnEmptyState(container) {
    if (!container) return;
    const hasCards = container.querySelector('.card');
    container.classList.toggle('cards-container--empty', !hasCards);
    let label = container.querySelector('.cards-empty-label');
    if (!hasCards) {
        if (!label) {
            label = document.createElement('div');
            label.className = 'cards-empty-label';
            label.textContent = 'Empty';
            container.prepend(label);
        }
    } else if (label) {
        label.remove();
    }
}

function initSortable() {
    const boardElement = document.getElementById('board');

    document.querySelectorAll('.cards-container').forEach(container => {
        // Called again after "Show More" and after re-renders; a second instance on the
        // same container would fire onEnd twice and send MoveCard twice.
        if (Sortable.get(container)) return;
        Sortable.create(container, {
            group: 'kanban',
            animation: 150,
            delay: 200,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            emptyInsertThreshold: 24,
            draggable: '.card',
            scroll: true,
            scrollSensitivity: 0,
            scrollSpeed: 0,
            bubbleScroll: true,
            ghostClass: 'kanban-card-placeholder',
            filter: ".card-delete-btn, .move-card-top-btn, .move-card-bottom-btn, .col-add-card-btn, .col-menu-btn, .col-menu-item, .col-edit-btn, .col-delete-btn",
            preventOnFilter: false,

            onMove: function (evt) {
                const cardId = evt.dragged.dataset.cardId;
                let card = null;
                outerLoop:
                for (const col of AppState.currentColumns) {
                    for (const c of col.cards) {
                        if (c.id == cardId) { card = c; break outerLoop; }
                    }
                }
                if (card) {
                    const isAssigned = card.assigneeId && card.assigneeId !== 0;
                    const isMe = AppState.currentUser && card.assigneeId === AppState.currentUser.userId;
                    if (isAssigned && !isMe) return false;
                }
            },

            onStart: function () {
                AppState.isDragging = true;
                if (boardElement && window.innerWidth < 768) boardElement.classList.add('is-dragging');
            },

            onEnd: async function (evt) {
                AppState.isDragging = false;
                if (boardElement) boardElement.classList.remove('is-dragging');

                const oldColumnId = evt.from.dataset.columnId;
                const newColumnId = evt.to.dataset.columnId;

                if (oldColumnId === newColumnId && evt.oldIndex === evt.newIndex) return;

                const snapshot = cloneColumnsState();
                const item = evt.item;
                const cardId = evt.item.dataset.cardId;
                const newIndex = evt.newIndex;

                item.setAttribute('data-col-id', newColumnId);
                item.dataset.colId = newColumnId;

                const childrenWithData = item.querySelectorAll('[data-col-id]');
                childrenWithData.forEach(child => {
                    child.setAttribute('data-col-id', newColumnId);
                    child.dataset.colId = newColumnId;
                });

                const sourceCol = AppState.currentColumns.find(c => c.id == oldColumnId);
                const targetCol = AppState.currentColumns.find(c => c.id == newColumnId);

                let movedCard = null;
                if (sourceCol) {
                    const cardIndex = sourceCol.cards.findIndex(c => c.id == cardId);
                    if (cardIndex > -1) {
                        movedCard = sourceCol.cards.splice(cardIndex, 1)[0];
                    }
                }

                if (movedCard && targetCol) {
                    movedCard.columnId = newColumnId;
                    targetCol.cards.splice(newIndex, 0, movedCard);
                }

                if (evt.from !== evt.to && movedCard && targetCol) {
                    const currentUserId = AppState.currentUser?.userId ?? 0;
                    const refreshed = document.createElement('div');
                    refreshed.innerHTML = createCardHtml(
                        movedCard,
                        targetCol.id,
                        currentUserId,
                        targetCol.isResultColumn
                    );
                    const newCardEl = refreshed.firstElementChild;
                    if (newCardEl) {
                        evt.item.replaceWith(newCardEl);
                    }
                }

                if (evt.from !== evt.to) {
                    const fromCol = evt.from.closest('.column');
                    if (fromCol) {
                        const countSpan = fromCol.querySelector('.card-count');
                        if (countSpan) countSpan.textContent = evt.from.querySelectorAll('.card').length;
                    }

                    const toCol = evt.to.closest('.column');
                    if (toCol) {
                        const countSpan = toCol.querySelector('.card-count');
                        if (countSpan) countSpan.textContent = evt.to.querySelectorAll('.card').length;
                    }
                }

                syncColumnEmptyState(evt.from);
                syncColumnEmptyState(evt.to);

                try {
                    const res = await apiRequest('/Kanban/MoveCard', {
                        method: 'POST',
                        body: JSON.stringify({ boardId: AppState.currentBoardId, cardId, newColumnId, newOrder: newIndex + 1 })
                    }, false);
                    if (!res?.success) throw new Error(res?.errorMessage || 'Move failed');
                } catch (error) {
                    console.error(error);
                    AppState.currentColumns = snapshot;
                    renderColumns(snapshot); // also re-initialises Sortable
                    swalAlert('error', 'Error', error.message || 'Card could not be moved.');
                }
            }
        });
    });
}

async function openNewColumnModal() {
    if (!checkAuth()) return;

    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) toggleSidebar();

    const { value: formValues } = await swalDialog({
        title: 'New Column',
        width: swalWidth('440px'),
        framed: true,
        html: columnFormHtml(),
        showCancelButton: true,
        confirmButtonText: `${UI_ICON.create} Create Column`,
        cancelButtonText: 'Cancel',
        focusConfirm: false,
        didOpen: () => {
            document.getElementById('column-title-input')?.focus();
            bindColumnResultInfoToggle(Swal.getPopup());
        },
        preConfirm: () => readColumnFormValues()
    });

    if (formValues) {
        const res = await apiRequest('/Kanban/AddColumn', {
            method: 'POST',
            body: JSON.stringify({
                boardId: AppState.currentBoardId,
                title: formValues.title,
                isResultColumn: formValues.isResultColumn
            })
        });
        if (!res?.success) {
            alertApiFailure(res, 'Failed to create column.');
            return;
        }
        loadBoardData();
        showToast('Column created', 'success');
    }
}

function readColumnFormValues() {
    const title = document.getElementById('column-title-input')?.value.trim() || '';
    const isResultColumn = document.getElementById('column-result-check')?.checked === true;

    if (title.length < 1) {
        Swal.showValidationMessage('Column name is required.');
        return false;
    }
    if (title.length > 100) {
        Swal.showValidationMessage('Column name cannot exceed 100 characters.');
        return false;
    }

    return { title, isResultColumn };
}

async function openEditColumnModal(columnId) {
    if (!checkAuth()) return;

    const column = AppState.currentColumns.find(c => c.id === columnId);
    if (!column) return;

    const { value: formValues } = await swalDialog({
        title: 'Edit Column',
        width: swalWidth('440px'),
        framed: true,
        html: columnFormHtml(column.title, column.isResultColumn),
        showCancelButton: true,
        confirmButtonText: `${UI_ICON.save} Save Changes`,
        cancelButtonText: 'Cancel',
        focusConfirm: false,
        didOpen: () => {
            const input = document.getElementById('column-title-input');
            if (input) {
                input.focus();
                input.select();
            }
            bindColumnResultInfoToggle(Swal.getPopup());
        },
        preConfirm: () => readColumnFormValues()
    });

    if (formValues) {
        const res = await apiRequest('/Kanban/UpdateColumn', {
            method: 'POST',
            body: JSON.stringify({
                boardId: AppState.currentBoardId,
                columnId,
                title: formValues.title,
                isResultColumn: formValues.isResultColumn
            })
        });
        if (!res?.success) {
            alertApiFailure(res, 'Failed to update column.');
            return;
        }
        loadBoardData();
        showToast('Column updated', 'success');
    }
}

async function deleteColumn(id) {
    if (!checkAuth()) return;
    const res = await swalConfirm({
        title: 'Delete Column?',
        text: 'The column and its cards will be deleted.',
        confirmText: `${UI_ICON.delete} Delete Column`,
        confirmVariant: 'danger'
    });
    if (res.isConfirmed) {
        const apiRes = await apiRequest(`/Kanban/DeleteColumn`, {
            method: 'POST',
            body: JSON.stringify({ boardId: AppState.currentBoardId, columnId: id })
        });
        if (!apiRes?.success) {
            alertApiFailure(apiRes, 'Failed to delete column.');
            return;
        }
        loadBoardData();
        showToast('Column deleted', 'success');
    }
}

// reopenOnCancel: true when the delete started from the card modal (its Delete
// button), so cancelling returns the user there instead of to the board.
async function deleteCard(id, reopenOnCancel = true) {
    if (!checkAuth()) return;
    const res = await swalConfirm({
        title: 'Delete Card?',
        text: 'This card will be permanently deleted.',
        confirmText: `${UI_ICON.delete} Delete Card`,
        confirmVariant: 'danger'
    });
    if (res.isConfirmed) {
        const apiRes = await apiRequest(`/Kanban/DeleteCard`, {
            method: 'POST',
            body: JSON.stringify({ boardId: AppState.currentBoardId, cardId: id })
        });
        if (!apiRes?.success) {
            alertApiFailure(apiRes, 'Failed to delete card.');
            return;
        }
        loadBoardData();
        showToast('Card deleted', 'success', 2000);
    } else if (reopenOnCancel) {
        for (const col of AppState.currentColumns) {
            if (col.cards.some(c => c.id == id)) {
                openCardModal(col.id, id);
                break;
            }
        }
    }
}

function buildColumnSelectOptions(selectedColumnId) {
    return AppState.currentColumns.map(col => {
        const tick = col.isResultColumn ? '✓ ' : '';
        const selected = col.id == selectedColumnId ? 'selected' : '';
        return `<option value="${col.id}" ${selected}>${tick}${escapeHtml(col.title)}</option>`;
    }).join('');
}

async function openCardModal(columnId, cardId = null) {
    if (!checkAuth()) return;

    const isEditMode = !!cardId;
    let card = null;

    if (isEditMode) {
        outerLoop:
        for (const col of AppState.currentColumns) {
            for (const c of col.cards) {
                if (c.id == cardId) { card = c; columnId = col.id; break outerLoop; }
            }
        }
        if (!card) return;
    }

    const currentUserId = AppState.currentUser.userId;
    const canEdit = !isEditMode || !card.assigneeId || card.assigneeId === currentUserId;

    const disabledAttr = canEdit ? '' : 'disabled';

    const minDate = isEditMode ? '2020-01-01' : todayDateInput();
    const membersRes = await apiRequest(`/Kanban/GetBoardMembers?boardId=${AppState.currentBoardId}`);
    if (!membersRes?.success || !membersRes.data) {
        // Without the member list a save would silently drop the assignee.
        alertApiFailure(membersRes, 'Could not load card details.');
        return;
    }

    let membersOptions = `<option value="">-- Unassigned --</option>`;
    membersRes.data.forEach(m => {
        const selected = (isEditMode && card.assigneeId && m.userId == card.assigneeId) ? 'selected' : '';
        membersOptions += `<option value="${m.userId}" ${selected}>${escapeHtml(m.fullName)}</option>`;
    });

    const defaults = {
        title: isEditMode ? (canEdit ? 'Edit Card' : 'View Card Details') : 'New Card',
        btnText: isEditMode ? `${UI_ICON.save} Save Changes` : `${UI_ICON.create} Create Card`,
        cardTitle: isEditMode ? (card.title || "") : "",
        desc: isEditMode ? (card.desc || "") : "",
        date: isEditMode ? formatDateInput(card.dueDate) : todayDateInput(),
        hasWarning: isEditMode ? (card.warningDays > 0) : false,
        warningDays: isEditMode ? card.warningDays : 1,
        color: isEditMode ? (card.highlightColor || '#ff0000') : '#ff0000',

        startDate: isEditMode ? formatDateInput(card.startDate) : todayDateInput(),
        calendarColor: isEditMode ? (card.calendarColor || '#3b82f6') : '#3b82f6'
    };

    const warningDisplay = defaults.hasWarning ? 'block' : 'none';
    const warningChecked = defaults.hasWarning ? 'checked' : '';

    let commentsSection = '';
    if (isEditMode) {
        commentsSection = `
            <div class="kf-comments">
                <h4 class="kf-section-title">💬 Comments</h4>
                <div id="comments-list" class="kf-comment-list">
                    <div class="kf-panel-empty">Loading comments...</div>
                </div>
                <div class="kf-comment-form">
                    <input type="text" id="new-comment-input" class="kf-input" maxlength="400" placeholder="Write a comment..."
                           aria-label="Write a comment">
                    <button type="button" id="submit-comment-btn" class="btn btn-sm btn-primary">
                        ${UI_ICON.send} Send
                    </button>
                </div>
            </div>
        `;
    }

    const columnOptions = isEditMode ? buildColumnSelectOptions(columnId) : '';
    const columnFieldHtml = isEditMode ? `
                <div class="kf-field">
                    <label class="kf-label" for="modal-column">Column</label>
                    <select id="modal-column" class="kf-select" ${disabledAttr}>
                        ${columnOptions}
                    </select>
                </div>
    ` : '';

    let quill;

    const { value: formValues, isDenied } = await swalDialog({
        title: defaults.title,
        width: swalWidth('660px'),
        framed: true,
        showCloseButton: true,
        closeButtonAriaLabel: 'Close',
        customClass: { popup: 'kf-swal-card', closeButton: 'kf-swal-close' },
        html: `
            <div class="kf-form ${canEdit ? '' : 'kf-form--readonly'}">
                ${columnFieldHtml}
                <div class="kf-field">
                    <label class="kf-label" for="modal-title">Title</label>
                    <input type="text" id="modal-title" class="kf-input" ${disabledAttr}
                           maxlength="${CARD_TITLE_MAX}" placeholder="Short summary of the card"
                           value="${escapeHtml(defaults.cardTitle)}">
                </div>

                <div>
                    <span class="kf-label">Description</span>
                    <div id="editor-container" class="kf-editor"></div>
                </div>

                <div class="kf-field-grid">
                     <div class="kf-field kf-field--date">
                        <label class="kf-label" for="modal-start-date">Start date</label>
                        <input type="date" id="modal-start-date" class="kf-input" ${disabledAttr}
                               value="${defaults.startDate}">
                    </div>

                    <div class="kf-field kf-field--date">
                        <label class="kf-label" for="modal-date">Due date</label>
                        <input type="date" id="modal-date" class="kf-input" ${disabledAttr}
                               value="${defaults.date}" min="${minDate}">
                    </div>

                     <div class="kf-field">
                        <label class="kf-label" for="modal-assignee">Assign to</label>
                        <select id="modal-assignee" class="kf-select" ${disabledAttr}>
                            ${membersOptions}
                        </select>
                    </div>

                    <div class="kf-field">
                        <label class="kf-label" for="modal-calendar-color">Calendar color</label>
                        <input type="color" id="modal-calendar-color" class="kf-color" ${disabledAttr}
                               value="${escapeHtml(defaults.calendarColor)}">
                    </div>
                </div>

                <div class="kf-check-row">
                    <input type="checkbox" id="modal-reminder-check" ${warningChecked} ${disabledAttr}>
                    <label for="modal-reminder-check">Show warning settings</label>
                </div>

                <div id="warning-area" class="kf-warning-box" style="display:${warningDisplay};">
                    <p class="kf-warning-note"><b>⚠️ Note:</b> The card will be highlighted when the due date approaches.</p>
                    <div class="kf-warning-row">
                        <div style="flex:2;">
                            <label class="kf-label-sm" for="modal-days">Reminder days</label>
                            <select id="modal-days" class="kf-select">
                                <option value="1" ${defaults.warningDays == 1 ? 'selected' : ''}>1 Day Remaining</option>
                                <option value="3" ${defaults.warningDays == 3 ? 'selected' : ''}>3 Days Remaining</option>
                                <option value="7" ${defaults.warningDays == 7 ? 'selected' : ''}>1 Week Remaining</option>
                            </select>
                        </div>
                        <div style="flex:1;">
                            <label class="kf-label-sm" for="modal-color">Warning color</label>
                            <input type="color" id="modal-color" class="kf-color" value="${escapeHtml(defaults.color)}">
                        </div>
                    </div>
                </div>

                ${commentsSection}
            </div>
        `,
        showCancelButton: true,
        showConfirmButton: canEdit,
        confirmButtonText: defaults.btnText,
        showDenyButton: isEditMode && canEdit,
        denyButtonText: `${UI_ICON.delete} Delete`,
        cancelButtonText: canEdit ? 'Cancel' : 'Close',

        didOpen: () => {
            quill = new Quill('#editor-container', {
                theme: 'snow',
                readOnly: !canEdit,
                modules: {
                    toolbar: canEdit ? [
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'color': [] }, { 'background': [] }],
                        [{ 'size': ['small', false, 'large', 'huge'] }],
                        ['clean']
                    ] : false
                }
            });
            quill.root.innerHTML = sanitizeRichText(defaults.desc);

            if (canEdit) {
                setTimeout(() => {
                    // A new card starts at the title; an existing one picks up
                    // where the description left off.
                    const titleInput = document.getElementById('modal-title');
                    if (!isEditMode && titleInput) {
                        titleInput.focus();
                        return;
                    }
                    quill.focus();
                    const length = quill.getLength();
                    quill.setSelection(length, length);
                }, 100);
            }

            const warningCheckbox = document.getElementById('modal-reminder-check');
            const warningArea = document.getElementById('warning-area');
            if (warningCheckbox && warningArea) {
                warningCheckbox.addEventListener('change', (e) => {
                    warningArea.style.display = e.target.checked ? 'block' : 'none';
                });
            }

            if (isEditMode) {
                // Bound once per modal; loadComments only re-renders the list contents.
                document.getElementById('comments-list')?.addEventListener('click', (e) => {
                    const btn = e.target.closest('.comment-delete-btn');
                    if (!btn) return;
                    const commentId = Number(btn.dataset.commentId);
                    const cCardId = Number(btn.dataset.cardId);
                    if (commentId && cCardId) deleteComment(commentId, cCardId);
                });

                loadComments(cardId);

                const commentInput = document.getElementById('new-comment-input');
                if (commentInput) {
                    commentInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submitComment(cardId);
                        }
                    });
                }

                const submitBtn = document.getElementById('submit-comment-btn');
                if (submitBtn) {
                    submitBtn.addEventListener('click', () => submitComment(cardId));
                }
            }
        },

        preConfirm: () => {
            if (!canEdit) return null;

            const title = document.getElementById('modal-title').value.trim();
            const description = quill.root.innerHTML;
            const assigneeId = document.getElementById('modal-assignee').value;
            const dueDate = document.getElementById('modal-date').value;

            const hasWarning = document.getElementById('modal-reminder-check').checked;
            const warningDays = hasWarning ? document.getElementById('modal-days').value : 0;
            const highlightColor = hasWarning ? document.getElementById('modal-color').value : null;

            const startDate = document.getElementById('modal-start-date').value || null;
            const calendarColor = document.getElementById('modal-calendar-color').value;
            const columnSelect = document.getElementById('modal-column');
            const targetColumnId = columnSelect ? parseInt(columnSelect.value, 10) : columnId;

            if (!dueDate) {
                Swal.showValidationMessage('Due Date is required');
                return false;
            }

            if (startDate && startDate > dueDate) {
                Swal.showValidationMessage('Start Date cannot be after the Due Date');
                return false;
            }

            return {
                title, description, assigneeId, dueDate, warningDays, highlightColor,
                startDate, calendarColor, targetColumnId
            };
        }
    });

    if (formValues && canEdit) {
        let startDate = formValues.startDate;
        if (isEditMode) {
            // Keep the stored start date when the field is left empty on a saved card.
            if (!startDate && card?.startDate) {
                startDate = formatDateInput(card.startDate);
            }
        } else if (!startDate) {
            startDate = todayDateInput();
        }

        const payload = {
            title: formValues.title,
            description: formValues.description,
            dueDate: formValues.dueDate,
            warningDays: parseInt(formValues.warningDays),
            highlightColor: formValues.highlightColor,
            startDate,
            calendarColor: formValues.calendarColor,
            assigneeId: formValues.assigneeId ? parseInt(formValues.assigneeId) : 0,
            boardId: AppState.currentBoardId
        };

        if (isEditMode && formValues.targetColumnId && formValues.targetColumnId !== columnId) {
            const targetCol = AppState.currentColumns.find(c => c.id === formValues.targetColumnId);
            const newOrder = (targetCol?.totalCards ?? targetCol?.cards?.length ?? 0) + 1;
            const moveRes = await apiRequest('/Kanban/MoveCard', {
                method: 'POST',
                body: JSON.stringify({
                    boardId: AppState.currentBoardId,
                    cardId,
                    newColumnId: formValues.targetColumnId,
                    newOrder
                })
            }, false);
            if (!moveRes?.success) {
                alertApiFailure(moveRes, 'Failed to move card to the selected column.');
                return;
            }
        }

        const saveRes = isEditMode
            ? await apiRequest('/Kanban/UpdateCard', {
                method: 'POST',
                body: JSON.stringify({ cardId, ...payload })
            })
            : await apiRequest('/Kanban/AddCard', {
                method: 'POST',
                body: JSON.stringify({ columnId, ...payload })
            });

        if (!saveRes?.success) {
            // A column move may already have succeeded, so refresh either way.
            if (isEditMode) loadBoardData(false);
            alertApiFailure(saveRes, `Failed to ${isEditMode ? 'update' : 'create'} the card.`);
            return;
        }

        loadBoardData();
        showToast(isEditMode ? 'Card updated' : 'Card created', 'success', 2000);
    } else if (isDenied) {
        deleteCard(cardId);
    }
}

async function loadComments(cardId) {
    const listEl = document.getElementById('comments-list');
    if (!listEl) return;
    const currentUserId = AppState.currentUser.userId;

    try {
        const res = await apiRequest(`/Kanban/GetComments?boardId=${AppState.currentBoardId}&cardId=${cardId}`, {}, false);

        if (!res?.success) {
            listEl.innerHTML = '<div class="kf-panel-empty" style="color:var(--danger);">Failed to load comments.</div>';
            return;
        }

        if (res.data?.length > 0) {
            listEl.innerHTML = res.data.map(c => {
                const deleteBtn = (c.userId === currentUserId)
                    ? `<button type="button" class="kf-icon-btn kf-icon-btn--danger comment-delete-btn"
                               data-comment-id="${c.id}" data-card-id="${cardId}"
                               title="Delete comment" aria-label="Delete comment">${UI_ICON.delete}</button>`
                    : '';

                return `
                    <div class="kf-comment">
                        <div class="kf-comment-head">
                            <div>
                                <strong>${escapeHtml(c.fullName)}</strong>
                                <span style="margin-left:5px; color:#cbd5e0;">•</span>
                                <span style="margin-left:5px;">${new Date(c.createdAt).toLocaleString(UI_LOCALE)}</span>
                            </div>
                            ${deleteBtn}
                        </div>
                        <div class="kf-comment-body">${escapeHtml(c.message)}</div>
                    </div>
                `;
            }).join('');
        } else {
            listEl.innerHTML = '<div class="kf-panel-empty">No comments yet.</div>';
        }
    } catch (e) {
        listEl.innerHTML = '<div class="kf-panel-empty" style="color:var(--danger);">Failed to load comments.</div>';
    }
}

async function submitComment(cardId) {
    const input = document.getElementById('new-comment-input');
    const message = input.value.trim();
    if (!message) return;

    if (message.length > 400) {
        Swal.showValidationMessage('Comment too long.');
        return;
    }
    input.disabled = true;

    try {
        const res = await apiRequest('/Kanban/AddComment', {
            method: 'POST',
            body: JSON.stringify({ cardId, message, boardId: AppState.currentBoardId })
        }, false);

        if (res?.success) {
            input.value = '';
            loadComments(cardId);
        } else {
            Swal.showValidationMessage(res?.errorMessage || 'Failed to post comment');
        }
    } catch (e) {
        console.error(e);
    } finally {
        input.disabled = false;
        input.focus();
    }
}

async function deleteComment(commentId, cardId) {
    if (!checkAuth()) return;
    const result = await swalConfirm({
        title: 'Delete Comment?',
        text: 'This action cannot be undone.',
        confirmText: `${UI_ICON.delete} Delete`,
        confirmVariant: 'danger',
        width: swalWidth('380px')
    });

    // The confirm dialog replaced the card modal; bring it back in every case.
    const reopenCard = () => {
        for (const col of AppState.currentColumns) {
            if (col.cards.some(c => c.id == cardId)) {
                openCardModal(col.id, cardId);
                return;
            }
        }
    };

    if (!result.isConfirmed) {
        reopenCard();
        return;
    }

    const res = await apiRequest(`/Kanban/DeleteComment`, {
        method: 'POST',
        body: JSON.stringify({ boardId: AppState.currentBoardId, commentId })
    }, false);

    if (!res?.success) {
        await alertApiFailure(res, 'Could not delete comment.');
        reopenCard();
        return;
    }

    reopenCard();
    showToast('Comment deleted', 'success', 1500);
}

function closeModal(modal) {
    modal.classList.remove('active');
    // A dismissed avatar picker must not reopen the profile menu on a later save.
    if (modal.id === 'avatarModal') avatarOpenedFromMenu = false;
}

function setupModalsAndKeyboard() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target !== modal) return;
            if (modal.id === 'loginModal') closeLoginModal();
            else if (modal.id === 'registerModal') closeRegisterModal();
            else closeModal(modal);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.target.matches('input, textarea, select, [contenteditable="true"]')) {
            if (e.key === 'Escape') e.target.blur();
            return;
        }
        if (document.body.classList.contains('swal2-shown')) return;

        if (e.key === 'Escape') {
            const sidebar = document.getElementById('sidebar');
            if (sidebar?.classList.contains('open')) {
                toggleSidebar();
                e.preventDefault();
                return;
            }
            if (document.getElementById('loginModal')?.classList.contains('active')) {
                closeLoginModal();
                return;
            }
            if (document.getElementById('registerModal')?.classList.contains('active')) {
                closeRegisterModal();
                return;
            }
            document.querySelectorAll('.modal.active').forEach(closeModal);
            return;
        }

        if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            focusBoardSearch();
            return;
        }

        if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) {
            if (!AppState.isAuthenticated || !AppState.currentBoardId) return;
            e.preventDefault();
            shortcutNewCard();
        }
    });
}

function setupVisibilitySync() {
    document.addEventListener('visibilitychange', async () => {
        if (document.hidden) {
            AppState.stopPolling();
            return;
        }
        if (!AppState.isAuthenticated) return;

        await fetchCurrentUser();
        if (!AppState.isAuthenticated || !AppState.currentBoardId) return;

        AppState.authFailureCount = 0;
        AppState.startPolling();
        loadBoardData(false);
        checkNewUpdates(true);
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    if (/^\/Error\/(401|403)\/?$/i.test(window.location.pathname)) {
        window.location.replace('/Auth/ClearSession');
        return;
    }

    const serverDataEl = document.getElementById('server-data');
    const invite = {
        status: serverDataEl?.getAttribute('data-invite-status') || 'NONE',
        message: serverDataEl?.getAttribute('data-server-message') || '',
        token: serverDataEl?.getAttribute('data-invite-token') || ''
    };

    // Keep the invite token out of the address bar and history once read.
    if (new URLSearchParams(window.location.search).has('token')) {
        history.replaceState(null, '', window.location.pathname);
    }

    // Resume an invite interrupted by "Logout & Switch".
    if (invite.status === 'NONE') {
        const pendingToken = sessionStorage.getItem(PENDING_INVITE_KEY);
        if (pendingToken) {
            sessionStorage.removeItem(PENDING_INVITE_KEY);
            window.location.replace(`/?token=${encodeURIComponent(pendingToken)}`);
            return;
        }
    }

    document.querySelectorAll(".toggle-password").forEach(btn => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            input.type = input.type === "password" ? "text" : "password";
            btn.textContent = input.type === "password" ? "🙈" : "🙊";
        });
    });

    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
        loginModal.addEventListener('submit', (e) => { e.preventDefault(); handleLogin(); });
    }

    const registerModal = document.getElementById('registerModal');
    if (registerModal) {
        registerModal.addEventListener('submit', (e) => { e.preventDefault(); handleRegister(); });
    }

    document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-action]');
        if (!el) return;

        const action = el.dataset.action;

        if (typeof window[action] === 'function') {
            window[action](e);
        } else {
            console.warn(`[Kanflow Action Dispatcher]: ${action}`);
        }
    });

    setupModalsAndKeyboard();
    setupVisibilitySync();
    setupOfflineDetection();

    const searchInput = document.getElementById('boardSearchInput');
    if (searchInput) searchInput.addEventListener('input', handleBoardSearchInput);

    await fetchCurrentUser();

    const prefillEmail = sessionStorage.getItem('kanflow:prefillEmail');
    if (prefillEmail) {
        sessionStorage.removeItem('kanflow:prefillEmail');
        openLoginModal(prefillEmail);
    }

    if (AppState.isAuthenticated && AppState.currentUser) {
        loadBoards();
    } else {
        toggleSidebar();
    }

    handleInviteStatus(invite.status, invite.message, invite.token);
});

const PENDING_INVITE_KEY = 'kanflow:pendingInvite';

async function confirmInvite(boardTitle, token) {
    const result = await swalConfirm({
        title: 'Board Invitation',
        html: `<p class="kf-dialog-hint">You have been invited to join <b>${escapeHtml(boardTitle)}</b>.</p>`,
        icon: 'question',
        confirmText: `${UI_ICON.accept} Accept Invite`,
        cancelText: 'Not Now'
    });
    if (!result.isConfirmed) return;

    const res = await apiRequest('/Home/AcceptInvite', {
        method: 'POST',
        body: JSON.stringify({ token })
    });
    if (!res?.success) {
        alertApiFailure(res, 'An error occurred while processing the invitation.');
        return;
    }
    handleInviteStatus(res.data, res.errorMessage || '', token);
}

function handleInviteStatus(status, message, token) {
    if (!status || status === 'NONE') return;

    switch (status) {
        case 'PENDING':
            confirmInvite(message, token);
            break;

        case 'REGISTER':
            swalFlash('info', 'Invitation Accepted!', 'Please register to access the board.', 3000);
            openRegisterModal(message);
            break;

        case 'ADDED':
            swalAlert('success', 'Success!', 'You have been successfully added to the board.').then(() => {
                if (!AppState.isAuthenticated) {
                    openLoginModal(message);
                } else {
                    loadBoards();
                }
            });
            break;

        case 'ALREADY':
            swalAlert('info', 'Already a Member', 'You are already a member of this board.');
            break;

        case 'WRONG_ACC': {
            const parts = (message || "").split('|');
            const currentEmail = escapeHtml(parts[0] || "Unknown");
            const targetEmail = escapeHtml(parts[1] || "Unknown");

            swalConfirm({
                title: 'Wrong Account Detected',
                html: `
                    <div class="kf-prose">
                        <p>You are currently logged in as: <br><b>${currentEmail}</b></p>
                        <div class="kf-menu-sep"></div>
                        <p>This invitation was sent to: <br><b>${targetEmail}</b></p>
                        <p>Please logout to accept this invitation with the correct account.</p>
                    </div>
                `,
                confirmText: `${UI_ICON.logout} Logout & Switch`,
                confirmVariant: 'danger'
            }).then((result) => {
                if (result.isConfirmed) {
                    if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
                    handleLogout();
                }
            });
            break;
        }

        case 'ERROR':
            swalAlert('error', 'Invitation Unavailable', message || 'This invitation is invalid, expired, or has already been used.');
            break;
    }
}

document.addEventListener('click', (e) => {
    if (e.target.closest('.swal2-container')) return;

    const quickNoteContainer = document.getElementById('quickNoteContainer');
    const quickNoteBtn = document.getElementById('quickNoteBtn');
    if (quickNoteContainer && quickNoteContainer.classList.contains('active') && !quickNoteContainer.contains(e.target) && !quickNoteBtn.contains(e.target)) {
        quickNoteContainer.classList.toggle('active');
    }
});

let quickNoteTimeout;
// The edit waiting for the debounce, bound to the note it was typed into, so
// switching notes or a server refresh cannot redirect or overwrite it.
let pendingNoteSave = null;
const quickNoteArea = document.getElementById('quickNoteArea');
const saveStatus = document.getElementById('saveStatus');

const QuickNoteState = {
    notes: [],
    activeNoteId: null,

    reset() {
        this.notes = [];
        this.activeNoteId = null;
        clearTimeout(quickNoteTimeout);
        pendingNoteSave = null;
        if (quickNoteArea) quickNoteArea.value = '';
    }
};

function toggleQuickNote() {
    if (!checkAuth()) return;

    const container = document.getElementById('quickNoteContainer');
    container.classList.toggle('active');

    if (container.classList.contains('active')) {
        initQuickNotes();
        quickNoteArea.focus();
    }
}

async function initQuickNotes() {
    if (!checkAuth()) return;

    const data = await apiRequest('/Auth/GetQuickNotes', {}, false);
    if (!data?.success || !data.data) return;

    QuickNoteState.notes = data.data;

    // Keep text the user typed but has not been saved yet.
    if (pendingNoteSave) {
        const pendingNote = QuickNoteState.notes.find(n => n.id === pendingNoteSave.noteId);
        if (pendingNote) pendingNote.note = pendingNoteSave.text;
    }

    if (QuickNoteState.activeNoteId == null || !QuickNoteState.notes.some(n => n.id === QuickNoteState.activeNoteId)) {
        QuickNoteState.activeNoteId = data.data.length > 0 ? data.data[0].id : null;
    }

    updateMainView();
}

function updateMainView() {
    const note = QuickNoteState.notes.find(n => n.id === QuickNoteState.activeNoteId);

    const currentTitleEl = document.getElementById('currentNoteTitle');
    if (currentTitleEl) {
        currentTitleEl.textContent = note ? note.title : 'No Notes';
    }

    quickNoteArea.value = note?.note ?? '';
}

function saveActiveNote() {
    const activeNote = QuickNoteState.notes.find(n => n.id === QuickNoteState.activeNoteId);
    if (!activeNote) return;

    // Update local state right away; only the network call is debounced.
    activeNote.note = quickNoteArea.value;
    pendingNoteSave = { noteId: activeNote.id, text: activeNote.note };

    saveStatus.style.opacity = '1';
    saveStatus.innerText = 'Typing...';

    clearTimeout(quickNoteTimeout);
    quickNoteTimeout = setTimeout(flushNoteSave, 1000);
}

async function flushNoteSave() {
    clearTimeout(quickNoteTimeout);
    if (!pendingNoteSave) return;

    const { noteId, text } = pendingNoteSave;
    pendingNoteSave = null;
    saveStatus.innerText = 'Saving...';

    const res = await apiRequest('/Auth/UpdateQuickNote', {
        method: 'POST',
        body: JSON.stringify({ userNoteId: noteId, note: text })
    }, false);
    if (!res?.success) {
        // Re-queue unless newer text for the same note arrived meanwhile.
        if (!pendingNoteSave) pendingNoteSave = { noteId, text };
        saveStatus.innerText = 'Error! ❌';
        return;
    }
    if (pendingNoteSave) return; // a newer edit is queued; let it report its own status
    saveStatus.innerText = 'Saved ✅';
    setTimeout(() => { saveStatus.style.opacity = '0'; }, 2000);
}

quickNoteArea.addEventListener('input', () => {
    saveActiveNote();
});

document.getElementById('noteHeader').addEventListener('click', async () => {
    if (!checkAuth()) return;

    if (QuickNoteState?.activeNoteId > 0) {
        await renameNoteFromTable(QuickNoteState.activeNoteId);
    }
});

document.getElementById('btnTrash').addEventListener('click', async () => {
    const note = QuickNoteState.notes.find(n => n.id === QuickNoteState.activeNoteId);
    if (!note || !note.note) return;

    const result = await swalConfirm({
        title: 'Clear Note?',
        text: 'The content of this note will be erased.',
        confirmText: `${UI_ICON.delete} Clear`,
        confirmVariant: 'danger'
    });
    if (!result.isConfirmed) return;

    quickNoteArea.value = '';
    saveActiveNote();
    flushNoteSave();
});

document.getElementById('btnOpenNoteTable').addEventListener('click', () => {
    document.getElementById('noteListOverlay').classList.add('active');
    renderNoteTable();
});

document.getElementById('btnCloseNoteTable').addEventListener('click', () => {
    document.getElementById('noteListOverlay').classList.remove('active');
});

['btnAddNote', 'btnAddNote2'].forEach(id => {
    document.getElementById(id).addEventListener('click', addNote);
});

async function addNote() {
    const title = `Note ${QuickNoteState.notes.length + 1}`;
    const data = await apiRequest('/Auth/AddQuickNote', {
        method: 'POST',
        body: JSON.stringify({ title, note: '' })
    });

    if (!data?.success) {
        showToast('Failed to add note', 'error', 1500);
        return;
    }

    QuickNoteState.notes.unshift(data.data);
    switchNote(data.data.id);
    showToast('Note added', 'success', 1000);
}

function renderNoteTable() {
    const tbody = document.getElementById('noteListTableBody');
    tbody.innerHTML = '';

    QuickNoteState.notes.forEach(note => {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.textContent = note.title;
        tdName.style.cursor = 'pointer';
        tdName.style.width = '100%';

        tdName.style.whiteSpace = 'normal';
        tdName.style.wordBreak = 'break-word';
        tdName.style.overflowWrap = 'break-word';

        if (note.id === QuickNoteState.activeNoteId) tdName.style.fontWeight = 'bold';
        tdName.addEventListener('click', () => switchNote(note.id));
        tr.appendChild(tdName);

        const tdActions = document.createElement('td');
        tdActions.style.whiteSpace = 'nowrap';
        tdActions.style.textAlign = 'right';

        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.textContent = UI_ICON.rename;
        btnEdit.className = 'btn-edit-row';
        btnEdit.title = 'Rename note';
        btnEdit.setAttribute('aria-label', 'Rename note');
        btnEdit.style.marginRight = '8px';
        btnEdit.addEventListener('click', () => renameNoteFromTable(note.id));
        tdActions.appendChild(btnEdit);

        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.textContent = UI_ICON.delete;
        btnDelete.className = 'btn-delete-row';
        btnDelete.title = 'Delete note';
        btnDelete.setAttribute('aria-label', 'Delete note');
        btnDelete.addEventListener('click', () => deleteNoteFromTable(note.id));
        tdActions.appendChild(btnDelete);

        tr.appendChild(tdActions);
        tbody.appendChild(tr);
    });
}
function switchNote(id) {
    flushNoteSave();
    QuickNoteState.activeNoteId = id;
    updateMainView();
    document.getElementById('noteListOverlay').classList.remove('active');
}

async function renameNoteFromTable(id) {
    const note = QuickNoteState.notes.find(n => n.id === id);
    const { value: newTitle } = await swalForm({
        title: 'Rename Note',
        input: 'text',
        inputValue: note.title,
        inputLabel: 'Note title',
        confirmButtonText: `${UI_ICON.save} Save`,
        inputAttributes: { maxlength: 30 }
    });

    if (!newTitle || newTitle.trim() === '' || newTitle.trim() === note.title) return;

    const ok = await apiRequest('/Auth/RenameQuickNote', {
        method: 'POST',
        body: JSON.stringify({ userNoteId: id, title: newTitle.trim() })
    });

    if (!ok?.success) {
        showToast('Failed to rename note', 'error', 1500);
        return;
    }

    note.title = newTitle.trim();
    renderNoteTable();

    if (QuickNoteState.activeNoteId === id) {
        updateMainView();
    }
    showToast('Note renamed', 'success', 1000);
}

async function deleteNoteFromTable(id) {
    if (QuickNoteState.notes.length <= 1) {
        swalFlash('warning', 'Oops', 'You must have at least one note.', 1500);
        return;
    }

    const result = await swalConfirm({
        title: 'Delete Note?',
        text: 'This note will be permanently deleted.',
        confirmText: `${UI_ICON.delete} Delete Note`,
        confirmVariant: 'danger'
    });

    if (!result.isConfirmed) return;

    const ok = await apiRequest('/Auth/DeleteQuickNote', {
        method: 'POST',
        body: JSON.stringify({ userNoteId: id })
    });

    if (!ok?.success) {
        showToast('Failed to delete note', 'error', 1500);
        return;
    }

    QuickNoteState.notes = QuickNoteState.notes.filter(n => n.id !== id);
    if (pendingNoteSave?.noteId === id) {
        clearTimeout(quickNoteTimeout);
        pendingNoteSave = null;
    }

    if (QuickNoteState.activeNoteId === id) {
        QuickNoteState.activeNoteId = QuickNoteState.notes[0].id;
        updateMainView();
    }

    renderNoteTable();
    showToast('Note deleted', 'success', 1000);
}

const AVATAR_OPTIONS = [
    "Abby", "Aiden", "Aneka", "Axel", "Bear", "Bella", "Brian", "Bubba", "Caleb", "Christopher", "Coco", "Cookie",
    "Daisy", "Easton", "Elsie", "Felix", "Finn", "Gizmo", "Hazel", "Hunter", "Jack", "Jasper", "Julia", "Lucky",
    "Luna", "Lydia", "Mason", "Maya", "Midnight", "Molly", "Nolan", "Oscar", "Pepper", "Rocky", "Scooter", "Shadow",
    "Sophie", "Sparky", "Willow", "Zoe"
];

let selectedAvatarTemp = "Felix";

function getAvatarPath(seed) {
    if (seed === 'def') return '/avatars/Felix.svg';
    if (!AVATAR_OPTIONS.includes(seed)) return '/avatars/Felix.svg';
    return `/avatars/${seed}.svg`;
}

let avatarOpenedFromMenu = false;

function openAvatarModal(fromMenu = false) {
    avatarOpenedFromMenu = fromMenu;
    initAvatarSelector();

    if (AppState.currentUser && AppState.currentUser.avatar && AppState.currentUser.avatar !== 'def') {
        selectedAvatarTemp = AppState.currentUser.avatar;
        setTimeout(() => {
            document.querySelectorAll('.avatar-option').forEach(img => {
                img.classList.toggle('is-selected', img.dataset.avatarName === selectedAvatarTemp);
            });
        }, 100);
    }

    document.getElementById('avatarModal').classList.add('active');
}

function initAvatarSelector() {
    const container = document.getElementById('avatarSelectionArea');
    if (!container) return;
    if (container.children.length > 0) return;

    container.innerHTML = AVATAR_OPTIONS.map(name => `
        <img src="${getAvatarPath(name)}"
             class="avatar-option"
             alt="${name}"
             title="${name}"
             data-avatar-name="${name}"
             loading="lazy">
    `).join('');

    container.addEventListener('click', (e) => {
        const img = e.target.closest('.avatar-option');
        if (img && img.dataset.avatarName) {
            selectAvatarTemp(img.dataset.avatarName, img);
        }
    });
}

function selectAvatarTemp(name, imgElement) {
    selectedAvatarTemp = name;
    document.querySelectorAll('.avatar-option').forEach(img => img.classList.remove('is-selected'));
    imgElement.classList.add('is-selected');
}

async function saveMyAvatar() {
    if (!checkAuth()) return;
    if (AppState.currentUser.avatar == selectedAvatarTemp) {
        document.getElementById('avatarModal').classList.remove('active');
        if (avatarOpenedFromMenu) { openProfileMenu(); avatarOpenedFromMenu = false; }
        return;
    }

    const res = await apiRequest(`/Auth/UpdateAvatar`, {
        method: 'POST',
        body: JSON.stringify({ avatar: selectedAvatarTemp })
    });
    if (!res?.success) {
        alertApiFailure(res, 'Could not save avatar.');
        return;
    }

    if (AppState.currentUser) {
        AppState.currentUser.avatar = selectedAvatarTemp;
    }
    document.getElementById('avatarModal').classList.remove('active');
    updateAuthUI();

    if (avatarOpenedFromMenu) { openProfileMenu(); avatarOpenedFromMenu = false; }
    showToast('Looks great!', 'success', 1200);
}

Object.assign(window, {
    toggleSidebar,
    openNewBoardModal,
    clearBoardSearch,
    toggleBoardSearch,
    changeView,
    openNewColumnModal,
    handleForgotPassword,
    closeLoginModal,
    switchToRegister,
    showPrivacyPolicy,
    showUserAgreement,
    closeRegisterModal,
    switchToLogin,
    saveMyAvatar,
    toggleQuickNote,
});
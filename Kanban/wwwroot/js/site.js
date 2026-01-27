'use strict';

const AppState = {
    isAuthenticated: false,
    currentUser: null,
    currentBoardId: null,
    boards: [],
    currentColumns: [],

    isDragging: false,

    lastSyncTime: null,
    syncInterval: null,

    reset() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.currentBoardId = null;
        this.boards = [];
        this.currentColumns = [];
        this.isDragging = false;
        this.stopPolling();
        renderBoardList();
        renderColumns([]);
        deleteAllCookies();
    }
};

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

function showLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'flex';
}

function hideLoading() {
    const el = document.getElementById('loadingOverlay');
    if (el) el.style.display = 'none';
}

function getXsrfToken() {
    const name = "XSRF-TOKEN=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(name) === 0) return c.substring(name.length, c.length);
    }
    return null;
}

async function apiRequest(endpoint, options = {}, showload = true) {
    if (showload) showLoading();

    try {
        const method = (options.method || 'GET').toUpperCase();

        if (method !== 'GET') {
            try {
                await fetch('/Home/GetToken', {}, false);
            } catch (err) {
                console.warn("Token error...", err);
            }
        }

        const token = getXsrfToken();
        const headers = {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Accept': 'application/json',
            ...options.headers
        };

        if (token) {
            headers['X-XSRF-TOKEN'] = token;
        }

        const response = await fetch(endpoint, {
            ...options,
            headers: headers,
            credentials: 'same-origin'
        });

        if (response.status === 401 || response.status === 403) {
            AppState.reset();
            updateAuthUI();
            throw new Error('Session expired or unauthorized.');
        }

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
        console.error('API Error:', error);
        if (showload) {
            Swal.fire('Error', error.message || 'A connection error occurred.', 'error');
        }
        throw error;
    } finally {
        if (showload) hideLoading();
    }
}

AppState.startPolling = function () {
    this.stopPolling();

    this.syncInterval = setInterval(async () => {
        if (!this.currentBoardId || !this.lastSyncTime || this.isDragging) return;

        try {
            const res = await apiRequest(`/Kanban/CheckBoardVersion?boardId=${this.currentBoardId}`, {}, false);

            const serverTime = new Date(res.data.lastUpdate).getTime();
            const localTime = new Date(res.data.now).getTime();

            if (serverTime > localTime) {
                console.log("New changes detected! Refreshing...");
                loadBoardData(false);
            }

            checkNewUpdates();

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

async function checkNewUpdates() {
    if (!AppState.isAuthenticated) return;

    try {
        const res = await apiRequest('/Kanban/CheckUpdates', {}, false);

        const badge = document.getElementById('nav-badge');
        if (!badge) return;

        if (res.success && res.data) {
            if (badge.style.display !== 'block') {
                badge.style.display = 'block';
                badge.classList.add('pulse');
            }
        } else {
            badge.style.display = 'none';
            badge.classList.remove('pulse');
        }

    } catch (e) {
    }
}

async function fetchCurrentUser() {
    try {
        const res = await apiRequest('/Home/Fetch', {}, false);
        if (res.success) {
            AppState.isAuthenticated = true;
            AppState.currentUser = res.data;

            if (AppState.currentUser.avatar === 'def' || !AppState.currentUser.avatar) {
                initAvatarSelector();
                setTimeout(() => {
                    const modal = document.getElementById('avatarModal');
                    if (modal) modal.classList.add('active');
                }, 500);
            }
        } else {
            AppState.reset();
        }
    } catch {
        AppState.reset();
    }
    updateAuthUI();
}

function checkAuth() {
    if (AppState.isAuthenticated && AppState.currentUser) return true;

    Swal.fire({
        title: 'Unauthorized Action',
        text: 'Please login to perform this action.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Login',
        cancelButtonText: 'Cancel',
        confirmButtonColor: '#667eea'
    }).then((result) => {
        if (result.isConfirmed) openLoginModal();
    });
    return false;
}

async function openNotifications() {
    try {
        const res = await apiRequest('/Kanban/GetNotifications');

        if (!res.success || !res.data || res.data.length === 0) {
            return Swal.fire({
                title: 'Notifications',
                text: 'No new notifications.',
                icon: 'info',
                confirmButtonColor: '#667eea'
            }).then(() => openProfileMenu());
        }

        const listItemsHtml = res.data.map(n => `
            <div id="notif-${n.id}" style="padding: 12px; border-bottom: 1px solid #eee; display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; text-align: left; transition: opacity 0.3s;">
                <div style="display: flex; gap: 10px; align-items: flex-start; flex: 1;">
                    <div style="font-size: 20px;">📢</div>
                    <div>
                        <div style="font-size: 14px; color: #2d3748;">${escapeHtml(n.message)}</div>
                        <div style="font-size: 11px; color: #a0aec0; margin-top: 4px;">
                            ${new Date(n.createdAt).toLocaleDateString('tr-TR')} ${new Date(n.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </div>
                <button onclick="deleteNotification(${n.id})" 
                        title="Delete"
                        style="background: none; border: none; color: #e53e3e; font-size: 18px; font-weight: bold; cursor: pointer; padding: 0 5px; line-height: 1;">
                    ×
                </button>
            </div>
        `).join('');

        const headerHtml = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 2px solid #f7fafc;">
                <span style="font-weight: bold; color: #4a5568; font-size: 14px;">Recent</span>
                <button onclick="deleteAllNotifications()" 
                        style="background: #fff5f5; border: 1px solid #fed7d7; color: #c53030; font-size: 12px; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-weight: 600; transition: 0.2s;"
                        onmouseover="this.style.background='#feb2b2'; this.style.color='white'"
                        onmouseout="this.style.background='#fff5f5'; this.style.color='#c53030'">
                    🗑️ Delete All
                </button>
            </div>
        `;

        Swal.fire({
            title: 'Notifications',
            html: `
                ${headerHtml}
                <div id="notif-container" style="max-height: 300px; overflow-y: auto;">
                    ${listItemsHtml}
                </div>
            `,
            showCloseButton: true,
            showConfirmButton: false,
            width: 450
        }).then(() => openProfileMenu());

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Could not load notifications.', 'error');
    }
}

async function deleteNotification(id) {
    try {
        const res = await apiRequest(`/Kanban/DeleteNotification`, {
            method: 'POST',
            body: JSON.stringify({ notificationId: id })
        }, false);

        if (res.success) {
            const el = document.getElementById(`notif-${id}`);
            if (el) {
                el.style.opacity = '0';
                setTimeout(() => {
                    el.remove();
                    checkIfEmpty();
                }, 300);
            }
        } else {
            Swal.fire('Error', res.errorMessage || 'Failed to delete', 'error');
        }
    } catch (e) {
        console.error(e);
    }
}

async function deleteAllNotifications() {
    if (!checkAuth()) return;
    const confirm = await Swal.fire({
        title: 'Clear all?',
        text: "This will delete all your notifications.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#e53e3e',
        confirmButtonText: 'Yes, delete all',
        cancelButtonText: 'Cancel'
    });

    if (confirm.isConfirmed) {
        try {
            const res = await apiRequest('/Kanban/DeleteNotifications', { method: 'POST' });

            if (res.success) {
                Swal.fire('Deleted!', 'All notifications have been cleared.', 'success');
            } else {
                Swal.fire('Error', res.errorMessage || 'Failed to delete all', 'error');
            }
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Network error.', 'error');
        }
    } else {
        openNotifications();
    }
}
function checkIfEmpty() {
    const container = document.getElementById('notif-container');
    if (container && container.children.length === 0) {
        container.innerHTML = '<div style="text-align:center; padding:20px; color:#a0aec0;">No new notifications.</div>';
    }
}

async function openPendingInvites() {
    try {
        const res = await apiRequest('/Kanban/GetInvites');

        if (!res.success || !res.data || res.data.length === 0) {
            return Swal.fire('Invites', 'You have no pending invites.', 'info').then(() => openProfileMenu());
        }

        const invitesHtml = res.data.map(invite => `
            <div style="padding: 15px; background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 10px; text-align: left;">
                <div style="font-weight: bold; color: #2d3748; margin-bottom: 5px;">
                    📂 ${escapeHtml(invite.boardName)}
                </div>
                <div style="font-size: 13px; color: #718096; margin-bottom: 10px;">
                    Invited by: <b>${escapeHtml(invite.inviterName)}</b>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button onclick="handleInviteResponse(${invite.id}, true)" 
                            style="flex: 1; padding: 8px; border: none; background: #48bb78; color: white; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Accept
                    </button>
                    <button onclick="handleInviteResponse(${invite.id}, false)" 
                            style="flex: 1; padding: 8px; border: none; background: #f56565; color: white; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Decline
                    </button>
                </div>
            </div>
        `).join('');

        Swal.fire({
            title: 'Pending Invites',
            html: `<div style="max-height: 400px; overflow-y: auto;">${invitesHtml}</div>`,
            showConfirmButton: false,
            showCloseButton: true
        }).then(() => openProfileMenu());

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Could not load invites.', 'error');
    }
}

async function handleInviteResponse(inviteId, isAccepted) {
    if (!checkAuth()) return;

    try {
        const res = await apiRequest(`/Kanban/WorkInvite`, {
            method: 'POST',
            body: JSON.stringify({ inviteId, isAccepted })
        }, false);

        if (res.success) {
            Swal.fire({
                icon: 'success',
                title: isAccepted ? 'Joined Board!' : 'Invite Declined',
                timer: 1500,
                showConfirmButton: false
            });

            if (isAccepted) {
                loadBoards();
            }
        } else {
            Swal.fire('Error', res.errorMessage || 'Operation failed', 'error');
        }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Network error occurred.', 'error');
    }
}

async function openChangePasswordModal() {
    if (!checkAuth()) return;
    const { value: formValues } = await Swal.fire({
        title: 'Change Password',
        html: `
            <input id="swal-old-pass" type="password" class="swal2-input" placeholder="Current Password">
            <input id="swal-new-pass" type="password" class="swal2-input" placeholder="New Password">
            <input id="swal-conf-pass" type="password" class="swal2-input" placeholder="Confirm New Password">
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Update',
        cancelButtonText: 'Cancel',
        preConfirm: () => {
            return [
                document.getElementById('swal-old-pass').value,
                document.getElementById('swal-new-pass').value,
                document.getElementById('swal-conf-pass').value
            ]
        }
    }).then(() => openProfileMenu());

    if (formValues) {
        const [oldPass, newPass, confPass] = formValues;

        if (!oldPass || !newPass || !confPass) return Swal.fire('Error', 'Please fill all fields.', 'error');
        if (newPass !== confPass) return Swal.fire('Error', 'New passwords do not match.', 'error');
        if (newPass.length < 6) return Swal.fire('Error', 'Password must be at least 6 characters.', 'error');

        try {
            await apiRequest('/Auth/ChangePassword', {
                method: 'POST',
                body: JSON.stringify({ oldPass, newPass })
            });
            Swal.fire('Success', 'Password updated successfully.', 'success');
        } catch (e) {
            Swal.fire('Error', 'Failed to update password.', 'error');
        }

    }
}
function openProfileMenu() {
    if (!checkAuth()) return;

    if (sidebar && sidebar.classList.contains('open')) toggleSidebar();

    const name = escapeHtml(AppState.currentUser.fullName);
    const email = escapeHtml(AppState.currentUser.email);
    const avatar = getAvatarPath(AppState.currentUser.avatar || 'def');

    const btnStyle = "width:100%; padding:12px; margin-bottom:8px; border:1px solid #e2e8f0; background:white; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:10px; font-size:15px; text-align:left; transition:background 0.2s;";
    const hoverEffect = "this.style.background='#f7fafc'";
    const outEffect = "this.style.background='white'";

    Swal.fire({
        html: `
            <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:20px;">
                <img src="${avatar}" style="width:70px; height:70px; border-radius:50%; border:3px solid #667eea; margin-bottom:10px;">
                <h3 style="margin:0; font-size:18px; color:#2d3748;">${name}</h3>
                <span style="font-size:13px; color:#718096;">${email}</span>
            </div>

            <div style="text-align:left;">
                <button onclick="Swal.close(); openNotifications()" style="${btnStyle}" onmouseover="${hoverEffect}" onmouseout="${outEffect}">
                    <span style="font-size:18px;">🔔</span> Notifications
                </button>

                <button onclick="Swal.close(); openPendingInvites()" style="${btnStyle}" onmouseover="${hoverEffect}" onmouseout="${outEffect}">
                    <span style="font-size:18px;">📩</span>  Invites
                </button>

                <button onclick="Swal.close(); openAvatarModal(true)" style="${btnStyle}" onmouseover="${hoverEffect}" onmouseout="${outEffect}">
                    <span style="font-size:18px;">🎨</span> Change Avatar
                </button>
                
                <button onclick="Swal.close(); openChangePasswordModal()" style="${btnStyle}" onmouseover="${hoverEffect}" onmouseout="${outEffect}">
                    <span style="font-size:18px;">🔑</span> Change Password
                </button>

                <hr style="border:0; border-top:1px solid #edf2f7; margin:15px 0;">

                <button onclick="handleLogout()" style="${btnStyle} color:#e53e3e; border-color:#fed7d7;" onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='white'">
                    <span style="font-size:18px;">🚪</span> Logout
                </button>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        width: 400,
        padding: '20px',
        customClass: {
            popup: 'animated fadeInDown'
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
            <div style="cursor:pointer; position:relative;" onclick="openProfileMenu()" title="Menu">
                <img src="${avatarPath}" 
                     style="width:45px; height:45px; border-radius:50%; object-fit:cover; border: 2px solid #e2e8f0; transition: transform 0.2s;"
                     onmouseover="this.style.transform='scale(1.05)'; this.style.borderColor='#667eea';"
                     onmouseout="this.style.transform='scale(1)'; this.style.borderColor='#e2e8f0';">

                <span id="nav-badge" class="notification-badge"></span>
            </div>
        `;

        authSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; padding:15px; background:rgba(255,255,255,0.05); border-radius:12px; border:1px solid rgba(255,255,255,0.1);">
                <img src="${avatarPath}" style="width:40px; height:40px; border-radius:50%; background:white;">
                <div style="overflow:hidden;">
                    <div style="font-weight:bold; font-size:14px;">${safeName}</div>
                    <div style="font-size:11px; color:#a0aec0;">${escapeHtml(AppState.currentUser.email)}</div>
                </div>
            </div>
            <button class="btn btn-secondary" style="width:100%; margin-bottom:15px" onclick="openProfileMenu()">⚙️ Menu</button>
            <button class="btn btn-danger" style="width:100%" onclick="confirmLogout()">Logout</button>
        `;

    } else {
        if (boardHeader) boardHeader.style.display = "none";
        document.getElementById("boardHeaderTitle").textContent = "";
        document.getElementById("board").innerHTML = "";

        area.innerHTML = `<button class="btn btn-primary" onclick="openLoginModal()">🔐</button>`;
        authSection.innerHTML = `
            <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="openLoginModal()">Login</button>
            <button class="btn btn-secondary" style="width:100%" onclick="openRegisterModal()">Register</button>
        `;
    }
}

function switchToRegister() { closeLoginModal(); openRegisterModal(); }
function switchToLogin() { closeRegisterModal(); openLoginModal(); }

function openLoginModal(prefillEmail = null) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) toggleSidebar();
    document.getElementById('loginModal').classList.add('active');
    if (prefillEmail) document.getElementById('loginEmail').value = prefillEmail;
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
}

function openRegisterModal(prefillEmail = null) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) toggleSidebar();
    document.getElementById('registerModal').classList.add('active');
    if (prefillEmail) document.getElementById('registerEmail').value = prefillEmail;
}

function closeRegisterModal() {
    document.getElementById('registerModal').classList.remove('active');
    const ids = ['registerFullName', 'registerEmail', 'registerPassword', 'registerConfirmPassword'];
    ids.forEach(id => document.getElementById(id).value = '');
}

async function handleLogin() {
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!email || !password) return Swal.fire('Error', 'Please fill all fields', 'error');

    try {
        const response = await apiRequest('/Auth/Login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });

        if (response.success) {
            await fetchCurrentUser();
            closeLoginModal();
            Swal.fire({
                title: 'Welcome Back!',
                text: `Hello ${escapeHtml(AppState.currentUser.fullName)}`,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
            loadBoards();
        } else {
            Swal.fire('Error', response.errorMessage || 'Login failed', 'error');
        }
    } catch {

    }
}

function showPrivacyPolicy(e) {
    e.preventDefault();
    Swal.fire({
        title: 'Privacy Policy',
        html: `
            <div style="text-align: left; font-size: 13px; max-height: 300px; overflow-y: auto;">
                <p><strong>Data Controller:</strong> Bedirhan Alşan (Kanflow Project)</p>
                <p>Your personal data (Name, Surname, Email) is processed solely for the purpose of membership registration and service provision.</p>
                <p>Your data is not shared with third parties (except for legal obligations).</p>
            </div>
        `,
        confirmButtonText: 'Close'
    });
}

function showUserAgreement(e) {
    e.preventDefault();
    Swal.fire({
        title: 'User Agreement',
        html: `
            <div style="text-align: left; font-size: 13px; max-height: 300px; overflow-y: auto;">
                <p>1. This application is developed as a portfolio project.</p>
                <p>2. The permanence of data uploaded to the system (cards, boards) is not guaranteed.</p>
                <p>3. The user agrees not to upload harmful, offensive, or illegal content to the system.</p>
            </div>
        `,
        confirmButtonText: 'Close'
    });
}

async function handleRegister() {
    const agreementCheckbox = document.getElementById('registerAgreement');
    if (!agreementCheckbox || !agreementCheckbox.checked) {
        return Swal.fire('Warning', 'Please accept the User Agreement and Privacy Policy to proceed.', 'warning');
    }

    const fullName = document.getElementById('registerFullName').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    if (!fullName || !email || !password || !confirmPassword)
        return Swal.fire('Error', 'Please fill all fields', 'error');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return Swal.fire('Error', 'Invalid email address', 'error');
    if (password.length < 6) return Swal.fire('Error', 'Password must be at least 6 characters', 'error');
    if (password !== confirmPassword) return Swal.fire('Error', 'Passwords do not match', 'error');

    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?:{}|<>]/.test(password)) {
        return Swal.fire('Error', 'Password must contain uppercase, lowercase, number, and special character.', 'error');
    }

    try {
        const verify = await apiRequest('/Auth/VerifyWork', {
            method: 'POST',
            body: JSON.stringify({ email })
        });

        if (!verify.success) {
            return Swal.fire('Error', verify.errorMessage || 'Failed to send verification code', 'error');
        }

        let isRegistered = false;
        const templateContent = document.getElementById('otpTemplate').innerHTML;

        while (!isRegistered) {
            const { value: otpCode, dismiss } = await Swal.fire({
                title: 'Email Verification',
                text: `A 6-digit code has been sent to ${escapeHtml(email)}.`,
                html: templateContent,
                showCancelButton: true,
                confirmButtonText: 'Verify & Register',
                cancelButtonText: 'Cancel',
                didOpen: () => {
                    const container = Swal.getHtmlContainer().querySelector('#otp-inputs');
                    const inputs = container.querySelectorAll('.otp-field');
                    if (inputs.length > 0) inputs[0].focus();

                    inputs.forEach((input, index) => {
                        input.addEventListener('input', (e) => {
                            const value = e.target.value;
                            if (!/^\d+$/.test(value)) { e.target.value = ''; return; }
                            if (value && index < inputs.length - 1) inputs[index + 1].focus();
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
                                inputs[5].focus();
                                Swal.clickConfirm();
                            }
                        });
                    });
                },
                preConfirm: () => {
                    const container = Swal.getHtmlContainer();
                    const inputs = container.querySelectorAll('.otp-field');
                    let code = "";
                    inputs.forEach(input => code += input.value);
                    if (code.length !== 6) {
                        Swal.showValidationMessage('Please enter the complete 6-digit code');
                        return false;
                    }
                    return code;
                }
            });

            if (dismiss === Swal.DismissReason.cancel || dismiss === Swal.DismissReason.backdrop) return;

            const response = await apiRequest('/Auth/Register', {
                method: 'POST',
                body: JSON.stringify({ fullName, email, password, otpCode })
            });

            if (response.success) {
                isRegistered = true;
                await fetchCurrentUser();
                closeRegisterModal();
                Swal.fire({
                    title: 'Welcome!',
                    text: `Registration successful! Welcome ${escapeHtml(fullName)}`,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
                loadBoards();
            } else {
                await Swal.fire('Registration Failed', response.message || 'Invalid code, please try again.', 'error');
            }
        }
    } catch (error) {
        console.error(error);
        Swal.fire('Error', 'An unexpected error occurred during registration.', 'error');
    }
}

async function handleLogout() {
    try {
        await apiRequest('/Auth/Logout', { method: 'POST' });
        AppState.reset();
        updateAuthUI();
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) toggleSidebar();
        AppState.stopPolling();
        Swal.fire('Success', 'Logged out successfully', 'success');
    } catch {
        Swal.fire('Error', 'Logout failed', 'error');
    }
}

function confirmLogout() {
    Swal.fire({
        title: "Logout",
        text: "Are you sure you want to logout?",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Yes, logout",
        cancelButtonText: "Cancel",
        confirmButtonColor: "#d33"
    }).then(result => {
        if (result.isConfirmed) handleLogout();
    });
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
    if (window.innerWidth > 768) document.body.classList.toggle('sidebar-open');
}

async function loadBoards() {
    try {
        const res = await apiRequest('/Kanban/GetBoards');
        AppState.boards = res.data;
        renderBoardList();

        if (AppState.boards.length > 0 && !AppState.currentBoardId) {
            selectBoard(AppState.boards[0].id);
        }
    } catch (e) {
        console.error('Failed to load boards:', e);
    }
}

function renderBoardList() {
    if (!AppState.isAuthenticated) {
        document.getElementById("boardHeader").style.display = "none";
        document.getElementById("boardHeaderTitle").textContent = "";
    }
    const list = document.getElementById('boardList');
    const sharedList = document.getElementById('sharedBoardList');

    const myBoards = AppState.boards.filter(b => b.isOwner === true);
    const sharedBoards = AppState.boards.filter(b => b.isOwner === false);

    const boardHtml = (b) => `
        <li class="board-item ${b.id === AppState.currentBoardId ? 'active' : ''}" onclick="selectBoard(${b.id})">
            <span>📊 ${escapeHtml(b.title)}</span>
            <div class="board-actions-btn" onclick="event.stopPropagation(); showBoardMenu(${b.id}, '${escapeHtml(b.title).replace(/'/g, "\\'")}')">⋮</div>
        </li>
    `;

    if (list) list.innerHTML = myBoards.map(boardHtml).join('');
    if (sharedList) sharedList.innerHTML = sharedBoards.map(boardHtml).join('');
}

async function selectBoard(id) {
    const sidebar = document.getElementById('sidebar');
    if (window.innerWidth <= 768 && sidebar.classList.contains('open')) toggleSidebar();

    AppState.stopPolling();
    AppState.currentBoardId = id;
    renderBoardList();

    await loadBoardData();

    AppState.startPolling();
}

async function openNewBoardModal() {
    if (!checkAuth()) return;
    const { value: title } = await Swal.fire({
        title: 'New Board Name',
        input: 'text',
        inputPlaceholder: 'Enter board name...',
        confirmButtonText: 'Create',
        showCancelButton: true
    });
    if (title) {
        try {
            await apiRequest('/Kanban/CreateBoard', {
                method: 'POST',
                body: JSON.stringify({ title })
            });
            Swal.fire('Success', 'Board created successfully', 'success');
            loadBoards();
        } catch {
            Swal.fire('Error', 'Failed to create board', 'error');
        }
    }
}

async function loadBoardData(showLoad = true) {
    if (!AppState.currentBoardId) return;

    try {
        const res = await apiRequest(`/Kanban/GetBoard?boardId=${AppState.currentBoardId}`, {}, showLoad);
        const columnsRes = res.data.item1;
        const timeRes = res.data.item2;

        AppState.currentColumns = columnsRes;
        AppState.lastSyncTime = timeRes;

        renderColumns(columnsRes);

        const currentBoard = AppState.boards.find(b => b.id === AppState.currentBoardId);
        if (currentBoard) {
            const header = document.getElementById("boardHeader");
            if (header) header.style.display = "flex";
            document.getElementById("boardHeaderTitle").textContent = currentBoard.title;
        }
    } catch (e) {
        console.error(e);
        if (showLoad) Swal.fire('Error', 'Data could not be loaded', 'error');
    }
}

async function showBoardMenu(boardId, boardName) {
    if (!checkAuth()) return;
    const result = await Swal.fire({
        title: escapeHtml(boardName),
        showCancelButton: true,
        confirmButtonText: 'Manage Users',
        confirmButtonColor: '#48bb78',
        cancelButtonText: 'Close',
        showDenyButton: true,
        denyButtonText: 'Delete Board',
        denyButtonColor: '#f56565'
    });
    if (result.isConfirmed) openManageUsersModal(boardId);
    else if (result.isDenied) deleteBoard(boardId);
}

async function openManageUsersModal(boardId) {
    try {
        const res = await apiRequest(`/Kanban/GetBoardMembers?boardId=${boardId}`);
        const members = res.data;

        const currentUserId = AppState.currentUser.userId;
        const me = members.find(m => m.userId === currentUserId);
        const amIOwner = me && me.roleCode === 'OWNER';

        let membersHtml = `
            <div style="text-align:left; max-height:300px; overflow-y:auto;">
                <table style="width:100%; border-collapse: collapse;">
                    <thead>
                        <tr style="border-bottom: 2px solid #eee; text-align:left;">
                            <th style="padding:8px;">User</th>
                            <th style="padding:8px; text-align:center;">Role</th>
                            <th style="padding:8px; text-align:right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        members.forEach(m => {
            const isMe = m.userId === currentUserId;
            const isTargetOwner = m.roleCode === 'OWNER';

            let roleBadge = isTargetOwner
                ? `<span style="padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; display: inline-block; background-color: #805ad5; color: white;">👑 Owner</span>`
                : `<span style="padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; display: inline-block; background-color: #e2e8f0; color: #4a5568; border: 1px solid #cbd5e0;">👤 Member</span>`;

            let buttons = '';

            if (amIOwner && !isTargetOwner) {
                buttons += `<button style="padding: 6px 10px; font-size: 12px; border-radius: 4px; border: none; cursor: pointer; color: white; margin-left: 5px; background-color: #6b46c1;" onclick="promoteToOwner(${boardId}, ${m.userId})" title="Make Owner">👑</button>`;
                buttons += `<button style="padding: 6px 10px; font-size: 12px; border-radius: 4px; border: none; cursor: pointer; color: white; margin-left: 5px; background-color: #f56565;" onclick="removeMember(${boardId}, ${m.userId})" title="Remove User">🗑️</button>`;
            }
            else if (isMe) {
                buttons = `<span style="font-size:11px; color:#aaa;">(It's you)</span>`;
            }

            membersHtml += `
                <tr style="border-bottom: 1px solid #f7fafc;">
                    <td style="padding:10px 8px;">
                        <div style="font-weight:bold;">${escapeHtml(m.fullName)}</div>
                        <div style="font-size:12px; color:#718096;">${escapeHtml(m.email)}</div>
                    </td>
                    <td style="padding:10px 8px; text-align:center;">${roleBadge}</td>
                    <td style="padding:10px 8px; text-align:right; white-space:nowrap;">
                        ${buttons}
                    </td>
                </tr>
            `;
        });

        membersHtml += `</tbody></table></div>`;

        Swal.fire({
            title: 'Manage Users',
            html: membersHtml,
            width: '650px',
            showCancelButton: true,
            confirmButtonText: '➕ Invite User',
            cancelButtonText: 'Close',
            showCloseButton: true,
        }).then((result) => {
            if (result.isConfirmed) {
                addUserToBoard(boardId);
            }
        });

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Failed to load members.', 'error');
    }
}

async function promoteToOwner(boardId, userId) {
    if (!checkAuth()) return;

    const confirm = await Swal.fire({
        title: 'Make Owner?',
        text: "This user will have full control over the board.",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#805ad5',
        confirmButtonText: 'Yes, Make Owner'
    });

    if (confirm.isConfirmed) {
        try {
            const response = await apiRequest(`/Kanban/PromoteToOwner`, {
                method: 'POST',
                body: JSON.stringify({ boardId, userId })
            });

            if (response.success) {
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                Toast.fire({ icon: 'success', title: 'User promoted to Owner!' });
            }
            else {
                Swal.fire('Error', response.errorMessage, 'error');
            }
        } catch {
            Swal.fire('Error', 'Failed to promote user', 'error');
        }
        openManageUsersModal(boardId);
    }
}

async function removeMember(boardId, userId) {
    const confirm = await Swal.fire({
        title: 'Remove User?',
        text: "User will be removed from this board.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, remove'
    });

    if (confirm.isConfirmed) {
        try {
            const response = await apiRequest('/Kanban/DeleteMember', {
                method: 'POST',
                body: JSON.stringify({ boardId, userId })
            });
            if (response.success) {
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                Toast.fire({ icon: 'success', title: 'User removed' });
            }
            else {
                Swal.fire('Error', response.errorMessage, 'error');
            }
        } catch (e) {
            Swal.fire('Error', 'Failed to remove user.', 'error');
        }
        openManageUsersModal(boardId);
    }
}

async function addUserToBoard(boardId) {
    const { value: email } = await Swal.fire({
        title: 'Invite User',
        input: 'email',
        inputLabel: 'Enter the user email address',
        inputPlaceholder: 'user@example.com',
        showCancelButton: true,
        confirmButtonText: 'Send Invite'
    });
    if (email) {
        try {
            const response = await apiRequest('/Kanban/InviteUserToBoard', {
                method: 'POST',
                body: JSON.stringify({ boardId, email })
            });
            if (response.success) Swal.fire('Success', 'User invited to board!', 'success');
            else Swal.fire('Error', response.errorMessage, 'error');
        } catch {
            Swal.fire('Error', 'User could not be invited.', 'error');
        }
    }
}

async function deleteBoard(boardId) {
    if (!checkAuth()) return;
    const result = await Swal.fire({
        title: 'Are you sure?',
        text: 'This board and all its contents will be deleted!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#f56565',
        confirmButtonText: 'Yes, delete it!'
    });
    if (result.isConfirmed) {
        try {
            await apiRequest(`/Kanban/DeleteBoard`, {
                method: 'POST',
                body: JSON.stringify({ boardId })
            });
            Swal.fire('Deleted!', 'Board has been deleted.', 'success');
            if (AppState.currentBoardId === boardId) {
                AppState.currentBoardId = null;
                document.getElementById('board').innerHTML = '';
                document.getElementById("boardHeader").style.display = "none";
            }
            loadBoards();
        } catch {
            Swal.fire('Error', 'Failed to delete board', 'error');
        }
    }
}

function renderColumns(columns) {
    const boardDiv = document.getElementById('board');
    if (!columns || columns.length === 0) {
        boardDiv.innerHTML = '';
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const currentUserId = AppState.currentUser ? AppState.currentUser.userId : 0;

    const currentBoard = AppState.boards.find(b => b.id === AppState.currentBoardId);
    const isOwner = currentBoard && currentBoard.isOwner === true;

    const addColBtn = document.getElementById('btnNewColumn') || document.querySelector("button[onclick='openNewColumnModal()']");

    if (addColBtn) {
        if (isOwner) {
            addColBtn.removeAttribute('disabled');
            addColBtn.style.opacity = '1';
            addColBtn.style.cursor = 'pointer';
        } else {
            addColBtn.setAttribute('disabled', 'true');
            addColBtn.style.opacity = '0.5';
            addColBtn.style.cursor = 'not-allowed';
        }
    }

    boardDiv.innerHTML = columns.map(col => {
        const deleteBtnAttr = isOwner
            ? `onclick="deleteColumn(${col.id})"`
            : `disabled style="opacity: 0.3; cursor: not-allowed;" title="Only owner can delete"`;

        return `
        <div class="column">
            <div class="column-header">
                <span class="column-title">${escapeHtml(col.title)}</span>
                <span class="card-count">${col.cards.length}</span>
                
                <button class="btn btn-danger" ${deleteBtnAttr}>🗑️</button>
            </div>
            <div class="cards-container" data-column-id="${col.id}">
                ${col.cards.map((card) => {
            let cardBgColor = '#ffffff';
            if (card.dueDate && card.warningDays && card.highlightColor) {
                const dueDate = new Date(card.dueDate);
                dueDate.setHours(0, 0, 0, 0);
                const diffTime = dueDate - today;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                if (diffDays <= card.warningDays && diffDays >= 0) {
                    cardBgColor = card.highlightColor;
                } else if (diffDays < 0) {
                    cardBgColor = '#fee2e2';
                }
            }

            const isLocked = card.assigneeId && card.assigneeId !== currentUserId;
            const cursorStyle = isLocked ? 'not-allowed' : 'grab';
            const lockedClass = isLocked ? 'locked-card' : '';
            const lockIcon = isLocked ? '<span title="Locked by another user">🔒</span>' : '';
            const opacityStyle = isLocked ? 'opacity: 0.8;' : '';

            const avatarHtml = card.assigneeAvatar
                ? `<img src="${getAvatarPath(card.assigneeAvatar)}" title="${escapeHtml(card.assigneeName)}" class="card-avatar-small">`
                : `<span class="card-avatar-empty" title="Unassigned">👤</span>`;

            return `
                        <div class="card ${lockedClass}" 
                             data-card-id="${card.id}" 
                             oncontextmenu="return false;"
                             style="background-color: ${cardBgColor}; transition: background-color 0.3s; cursor: ${cursorStyle}; ${opacityStyle}" 
                             onclick="openCardModal(${col.id},${card.id})">
                            
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                                <div style="display:flex; align-items:center; gap:5px;">
                                    ${lockIcon}
                                    <span class="card-date">📅 ${new Date(card.dueDate).toLocaleDateString('tr-TR')}</span>
                                </div>
                                <span style="cursor:pointer; font-weight:bold; font-size:16px;" onclick="event.stopPropagation(); deleteCard(${card.id})">×</span>
                            </div>

                            <p class="card-desc-truncate">${escapeHtml(stripHtml(card.desc))}</p>
                            
                            <div class="card-footer">
                                <div style="font-size:10px; color:#999;">
                                   ${card.assigneeName ? escapeHtml(card.assigneeName.split(' ')[0]) : 'Unassigned'}
                                </div>
                                ${avatarHtml}
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
            <button class="btn btn-success" style="width:100%" onclick="openCardModal(${col.id})">+ Add Card</button>
        </div>
    `}).join('');

    initSortable();
}

function initSortable() {
    const boardElement = document.getElementById('board');
    document.querySelectorAll('.cards-container').forEach(container => {
        Sortable.create(container, {
            group: 'kanban',
            animation: 150,
            delay: 100,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            scroll: true,
            scrollSensitivity: 80,
            scrollSpeed: 10,
            bubbleScroll: true,

            onMove: function (evt, originalEvent) {
                const cardId = evt.dragged.dataset.cardId;

                let card = null;
                outerLoop:
                for (const col of AppState.currentColumns) {
                    for (const c of col.cards) {
                        if (c.id == cardId) {
                            card = c;
                            break outerLoop;
                        }
                    }
                }

                if (card) {
                    const isAssigned = card.assigneeId && card.assigneeId !== 0;
                    const isMe = AppState.currentUser && card.assigneeId === AppState.currentUser.userId;

                    if (isAssigned && !isMe) {
                        return false;
                    }
                }
            },

            onStart: function () {
                AppState.isDragging = true;
                if (boardElement && window.innerWidth < 768) boardElement.classList.add('is-dragging');
            },
            onEnd: async function (evt) {
                AppState.isDragging = false;

                if (boardElement) boardElement.classList.remove('is-dragging');
                const cardId = evt.item.dataset.cardId;
                const newColumnId = evt.to.dataset.columnId;
                const newOrder = evt.newIndex + 1;

                if (evt.from === evt.to && evt.oldIndex === evt.newIndex) return;

                const fromCol = evt.from.closest('.column');
                if (fromCol) {
                    const countSpan = fromCol.querySelector('.card-count');
                    if (countSpan) countSpan.textContent = evt.from.querySelectorAll('.card').length;
                }

                if (evt.from !== evt.to) {
                    const toCol = evt.to.closest('.column');
                    if (toCol) {
                        const countSpan = toCol.querySelector('.card-count');
                        if (countSpan) countSpan.textContent = evt.to.querySelectorAll('.card').length;
                    }
                }

                try {
                    await apiRequest('/Kanban/MoveCard', {
                        method: 'POST',
                        body: JSON.stringify({ boardId: AppState.currentBoardId, cardId, newColumnId, newOrder })
                    }, false);
                } catch (error) {
                    console.error(error);
                    Swal.fire('Error', 'Card could not be moved.', 'error');
                    loadBoardData();
                }
            }
        });
    });
}

async function openNewColumnModal() {
    if (!checkAuth()) return;

    const sidebar = document.getElementById('sidebar');
    if (sidebar && sidebar.classList.contains('open')) {
        toggleSidebar();
    }

    const { value: title } = await Swal.fire({
        title: 'New Column Name',
        input: 'text',
        inputPlaceholder: 'Enter column name...',
        confirmButtonText: 'Create',
        showCancelButton: true
    });
    if (title) {
        try {
            await apiRequest('/Kanban/AddColumn', {
                method: 'POST',
                body: JSON.stringify({ boardId: AppState.currentBoardId, title })
            });
            loadBoardData();
            Swal.fire('Success', 'Column created successfully', 'success');
        } catch {
            Swal.fire('Error', 'Failed to create column', 'error');
        }
    }
}

async function deleteColumn(id) {
    if (!checkAuth()) return;
    const res = await Swal.fire({
        title: 'Are you sure?',
        text: 'Column will be deleted!',
        icon: 'warning',
        showCancelButton: true
    });
    if (res.isConfirmed) {
        try {
            await apiRequest(`/Kanban/DeleteColumn`, {
                method: 'POST',
                body: JSON.stringify({ boardId: AppState.currentBoardId, columnId: id })
            });
            Swal.fire('Success', 'Column deleted successfully', 'success');
            loadBoardData();
        } catch {
            Swal.fire('Error', 'Failed to delete column', 'error');
        }
    }
}

async function deleteCard(id) {
    if (!checkAuth()) return;
    const res = await Swal.fire({
        title: 'Are you sure?',
        text: 'Card will be deleted!',
        icon: 'warning',
        showCancelButton: true
    });
    if (res.isConfirmed) {
        try {
            await apiRequest(`/Kanban/DeleteCard`, {
                method: 'POST',
                body: JSON.stringify({ boardId: AppState.currentBoardId, cardId: id })
            });
            const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
            Toast.fire({ icon: 'success', title: 'Card deleted' });
            loadBoardData();
        } catch {
            Swal.fire('Error', 'Failed to delete card', 'error');
        }
    }
    else {
        openCardModal(null, id);
    }
}

async function openCardModal(columnId, cardId = null) {
    if (!checkAuth()) return;

    const isEditMode = !!cardId;
    let card = null;

    if (isEditMode) {
        outerLoop:
        for (const col of AppState.currentColumns) {
            for (const c of col.cards) {
                if (c.id == cardId) {
                    card = c;
                    columnId = col.id;
                    break outerLoop;
                }
            }
        }
        if (!card) return;
    }

    const currentUserId = AppState.currentUser.userId;
    const canEdit = !isEditMode || !card.assigneeId || card.assigneeId === currentUserId;

    const disabledAttr = canEdit ? '' : 'disabled';
    const inputStyle = canEdit ? '' : 'background-color: #f7fafc; color: #718096; cursor: not-allowed;';

    const minDate = isEditMode ? new Date('2020-01-01').toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
    const membersRes = await apiRequest(`/Kanban/GetBoardMembers?boardId=${AppState.currentBoardId}`);

    let membersOptions = `<option value="">-- Unassigned --</option>`;
    membersRes.data.forEach(m => {
        const selected = (isEditMode && card.assigneeId && m.userId == card.assigneeId) ? 'selected' : '';
        membersOptions += `<option value="${m.userId}" ${selected}>${escapeHtml(m.fullName)}</option>`;
    });

    const defaults = {
        title: isEditMode ? (canEdit ? 'Edit Card' : 'View Card Details') : 'New Card',
        btnText: isEditMode ? 'Save Changes' : 'Create Card',
        desc: isEditMode ? (card.desc || "") : "",
        date: isEditMode ? new Date(card.dueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        hasWarning: isEditMode ? (card.warningDays > 0) : false,
        warningDays: isEditMode ? card.warningDays : 1,
        color: isEditMode ? (card.highlightColor || '#ff0000') : '#ff0000'
    };

    const warningDisplay = defaults.hasWarning ? 'block' : 'none';
    const warningChecked = defaults.hasWarning ? 'checked' : '';

    let commentsSection = '';
    if (isEditMode) {
        commentsSection = `
            <div style="margin-top: 20px; padding-top: 15px; border-top: 2px solid #edf2f7;">
                <h4 style="margin: 0 0 10px 0; color: #2d3748; font-size: 14px;">💬 Comments</h4>
                
                <div id="comments-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 10px; background: #f8f9fa; padding: 10px; border-radius: 8px;">
                    <div style="text-align:center; color:#a0aec0; font-size:12px;">Loading comments...</div>
                </div>

                <div style="display: flex; gap: 10px;">
                    <input type="text" id="new-comment-input" class="swal2-input" maxlength="400" placeholder="Write a comment..."
                    onkeydown="if(event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitComment(${cardId}); }"
                           style="margin: 0; height: 38px; font-size: 13px; flex: 1;">
                    <button type="button" class="btn btn-primary" onclick="submitComment(${cardId})" 
                            style="padding: 0 20px; font-size: 13px; height: 38px;">Send</button>
                </div>
            </div>
        `;
    }

    let quill;

    const { value: formValues, isDenied } = await Swal.fire({
        title: defaults.title,
        width: '650px',
        html: `
            <div style="text-align:left; display:flex; flex-direction:column; gap:15px;">
                <div>
                    <label style="font-weight:bold; color:#718096; font-size:12px; margin-bottom:5px; display:block;">DESCRIPTION</label>
                    <div id="editor-container" style="height: 120px; background:white; ${canEdit ? '' : 'pointer-events: none; background: #f7fafc;'}"></div>
                </div>
                
                <div style="display:flex; flex-wrap:wrap; gap:15px;">
                    <div style="flex:1 1 200px;">
                        <label style="font-weight:bold; color:#718096; font-size:12px; margin-bottom:5px; display:block;">ASSIGN TO</label>
                        <select id="modal-assignee" class="swal2-select" ${disabledAttr} style="width:100%; margin:0; height:40px; border:1px solid #d9d9d9; border-radius:4px; ${inputStyle}">
                            ${membersOptions}
                        </select>
                    </div>

                    <div style="flex:1 1 200px;">
                        <label style="font-weight:bold; color:#718096; font-size:12px; margin-bottom:5px; display:block;">DUE DATE</label>
                        <input type="date" id="modal-date" class="swal2-input" ${disabledAttr}
                               style="width:100%; margin:0; height:40px; border:1px solid #d9d9d9; border-radius:4px; ${inputStyle}" 
                               value="${defaults.date}" min="${minDate}"> 
                    </div>
                </div>

                <div style="display: flex; align-items: center; gap: 8px; margin-top:5px;">
                    <input type="checkbox" id="modal-reminder-check" style="width: 18px; height: 18px; cursor: pointer;" ${warningChecked} ${disabledAttr}>
                    <label for="modal-reminder-check" style="font-weight: bold; cursor: pointer; font-size:13px; color: ${canEdit ? 'black' : '#a0aec0'}">Show Warning Settings</label>
                </div>

                <div id="warning-area" style="display: ${warningDisplay}; padding: 10px; background: #fff5f5; border: 1px dashed #feb2b2; border-radius: 8px; ${canEdit ? '' : 'opacity: 0.6; pointer-events: none;'}">
                    <p style="color: #c53030; font-size: 11px; margin-bottom: 10px;"><b>⚠️ Note:</b> Card will turn red when approaching due date.</p>
                    <div style="display: flex; gap: 10px; align-items: flex-end;">
                        <div style="flex: 2;">
                            <label style="font-size: 11px; font-weight: bold; display: block;">Reminder Days</label>
                            <select id="modal-days" class="swal2-select" style="width: 100%; margin: 5px 0 0 0; font-size: 13px; height:35px;">
                                <option value="1" ${defaults.warningDays == 1 ? 'selected' : ''}>1 Day Remaining</option>
                                <option value="3" ${defaults.warningDays == 3 ? 'selected' : ''}>3 Days Remaining</option>
                                <option value="7" ${defaults.warningDays == 7 ? 'selected' : ''}>1 Week Remaining</option>
                            </select>
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 11px; font-weight: bold; display: block;">Color</label>
                            <input type="color" id="modal-color" value="${defaults.color}" style="width: 100%; height: 35px; padding: 2px; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; margin-top: 5px;">
                        </div>
                    </div>
                </div>

                ${commentsSection}
            </div>
        `,
        showCancelButton: true,
        showConfirmButton: canEdit,
        confirmButtonText: defaults.btnText,
        confirmButtonColor: '#667eea',
        showDenyButton: isEditMode && canEdit,
        denyButtonText: '🗑️ Delete',
        denyButtonColor: '#f56565',
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
            quill.root.innerHTML = defaults.desc;

            const checkbox = document.getElementById('modal-reminder-check');
            const area = document.getElementById('warning-area');
            if (checkbox && area) {
                checkbox.addEventListener('change', (e) => {
                    area.style.display = e.target.checked ? 'block' : 'none';
                });
            }

            if (isEditMode) {
                loadComments(cardId);
            }
        },

        preConfirm: () => {
            if (!canEdit) return null;

            const description = quill.root.innerHTML;
            const assigneeId = document.getElementById('modal-assignee').value;
            const dueDate = document.getElementById('modal-date').value;
            const hasWarning = document.getElementById('modal-reminder-check').checked;
            const warningDays = hasWarning ? document.getElementById('modal-days').value : 0;
            const highlightColor = hasWarning ? document.getElementById('modal-color').value : null;

            if (!document.getElementById('modal-date').value) {
                Swal.showValidationMessage('Due Date is required');
                return false;
            }

            return { description, assigneeId, dueDate, warningDays, highlightColor };
        }
    });

    if (formValues && canEdit) {
        const payload = {
            description: formValues.description,
            dueDate: formValues.dueDate,
            warningDays: parseInt(formValues.warningDays),
            highlightColor: formValues.highlightColor,
            assigneeId: formValues.assigneeId ? parseInt(formValues.assigneeId) : 0,
            boardId: AppState.currentBoardId
        };

        try {
            if (isEditMode) {
                await apiRequest('/Kanban/UpdateCard', {
                    method: 'POST',
                    body: JSON.stringify({ cardId, ...payload })
                });
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                Toast.fire({ icon: 'success', title: 'Card updated' });
            } else {
                await apiRequest('/Kanban/AddCard', {
                    method: 'POST',
                    body: JSON.stringify({ columnId, ...payload })
                });
                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 2000 });
                Toast.fire({ icon: 'success', title: 'Card created' });
            }
            loadBoardData();
        } catch (e) {
            console.error(e);
            Swal.fire('Error', `Failed to ${isEditMode ? 'update' : 'create'} card`, 'error');
        }
    }
    else if (isDenied) {
        deleteCard(cardId);
    }
}

async function loadComments(cardId) {
    const listEl = document.getElementById('comments-list');
    if (!listEl) return;
    const currentUserId = AppState.currentUser.userId;

    try {
        const res = await apiRequest(`/Kanban/GetComments?boardId=${AppState.currentBoardId}&cardId=${cardId}`, {}, false);

        if (res.success && res.data.length > 0) {
            listEl.innerHTML = res.data.map(c => {
                const deleteBtn = (c.userId === currentUserId)
                    ? `<span onclick="deleteComment(${c.id}, ${cardId})" 
                            title="Delete Comment" 
                            style="cursor:pointer; color:#e53e3e; margin-left:10px; font-size:14px;">
                            🗑️
                       </span>`
                    : '';

                return `
                <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
                    <div style="display:flex; justify-content:space-between; font-size: 11px; color: #718096; margin-bottom: 2px;">
                        <div>
                            <strong>${escapeHtml(c.fullName)}</strong>
                            <span style="margin-left:5px; color:#cbd5e0;">•</span>
                            <span style="margin-left:5px;">${new Date(c.createdAt).toLocaleString('tr-TR')}</span>
                        </div>
                        <div>${deleteBtn}</div>
                    </div>
                    <div style="font-size: 13px; color: #2d3748; white-space: pre-wrap;">${escapeHtml(c.message)}</div>
                </div>
            `}).join('');
        } else {
            listEl.innerHTML = '<div style="text-align:center; color:#a0aec0; font-size:12px; padding:10px;">No comments yet.</div>';
        }
    } catch (e) {
        listEl.innerHTML = '<div style="text-align:center; color:#e53e3e; font-size:12px;">Failed to load comments.</div>';
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

        if (res.success) {
            input.value = '';
            loadComments(cardId);
        } else {
            Swal.showValidationMessage('Failed to post comment');
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
    const result = await Swal.fire({
        title: 'Delete comment?',
        text: "This action cannot be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        confirmButtonText: 'Yes, delete',
        cancelButtonText: 'Cancel',
        width: 300
    });

    if (result.isConfirmed) {
        try {
            const res = await apiRequest(`/Kanban/DeleteComment`, {
                method: 'POST',
                body: JSON.stringify({ boardId: AppState.currentBoardId, commentId })
            }, false);

            if (res.success) {
                loadComments(cardId);

                const Toast = Swal.mixin({ toast: true, position: 'top-end', showConfirmButton: false, timer: 1500 });
                Toast.fire({ icon: 'success', title: 'Comment deleted' });

                let columnId = null;
                outerLoop:
                for (const col of AppState.currentColumns) {
                    for (const c of col.cards) {
                        if (c.id == cardId) {
                            columnId = col.id;
                            break outerLoop;
                        }
                    }
                }

                if (columnId) openCardModal(columnId, cardId);
            } else {
                Swal.fire('Error', res.errorMessage || 'Could not delete comment', 'error');
            }
        } catch (e) {
            console.error(e);
            Swal.fire('Error', 'Network error', 'error');
        }
    }
}

function deleteAllCookies() {
    const cookies = document.cookie.split(";");

    for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;

        document.cookie = name.trim() + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
    }
}

window.addEventListener('DOMContentLoaded', async () => {

    document.querySelectorAll(".toggle-password").forEach(btn => {
        btn.addEventListener("click", () => {
            const input = document.getElementById(btn.dataset.target);
            if (!input) return;
            input.type = input.type === "password" ? "text" : "password";
            btn.textContent = input.type === "password" ? "🙈" : "🙊";
        });
    });

    const sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', () => {
            const sidebar = document.getElementById('sidebar');
            if (sidebar && sidebar.classList.contains('open')) {
                toggleSidebar();
            }
        });
    }

    await fetchCurrentUser();

    if (AppState.isAuthenticated && AppState.currentUser) { loadBoards(); }
    else { toggleSidebar(); }

    handleInviteStatus();
});

function handleInviteStatus() {
    const status = window.SERVER_INVITE_STATUS;
    if (!status || status === 'NONE') return;

    switch (status) {
        case 'REGISTER':
            Swal.fire({
                title: 'Invitation Verified!',
                text: 'Please register to access the board.',
                icon: 'info',
                timer: 3000,
                showConfirmButton: false
            });
            openRegisterModal(window.SERVER_MESSAGE);
            break;

        case 'ADDED':
            Swal.fire({
                title: 'Success!',
                text: 'You have been successfully added to the board.',
                icon: 'success'
            }).then(() => {
                if (!AppState.isAuthenticated) {
                    openLoginModal(window.SERVER_MESSAGE);
                } else {
                    loadBoards();
                }
            });
            break;

        case 'ALREADY':
            Swal.fire('Info', 'You are already a member of this board.', 'info');
            break;

        case 'WRONG_ACCOUNT':
            const parts = (window.SERVER_MESSAGE || "").split('|');
            const currentEmail = escapeHtml(parts[0] || "Unknown");
            const targetEmail = escapeHtml(parts[1] || "Unknown");

            Swal.fire({
                title: 'Wrong Account Detected',
                html: `
                    <div style="text-align:left; font-size:15px;">
                        <p>You are currently logged in as: <br><b>${currentEmail}</b></p>
                        <hr style="margin:10px 0; border:0; border-top:1px solid #eee;">
                        <p>This invitation was sent to: <br><b>${targetEmail}</b></p>
                        <br>
                        <p>Please logout to accept this invitation with the correct account.</p>
                    </div>
                `,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Logout & Switch',
                confirmButtonColor: '#d33',
                cancelButtonText: 'Cancel'
            }).then((result) => {
                if (result.isConfirmed) {
                    handleLogout().then(() => {
                        window.location.reload();
                    });
                }
            });
            break;

        case 'ERROR':
            Swal.fire('Error', escapeHtml(window.SERVER_MESSAGE) || 'An error occurred while processing the invitation.', 'error');
            break;
    }
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
    return `/avatars/${seed}.svg`;
}
let avatarOpenedFromMenu = false;
function openAvatarModal(fromMenu = false) {
    avatarOpenedFromMenu = fromMenu;
    initAvatarSelector();

    if (AppState.currentUser && AppState.currentUser.avatar && AppState.currentUser.avatar !== 'def') {
        selectedAvatarTemp = AppState.currentUser.avatar;
        setTimeout(() => {
            const allImgs = document.querySelectorAll('.avatar-option');
            allImgs.forEach(img => {
                if (img.alt === selectedAvatarTemp) {
                    img.style.borderColor = '#667eea';
                    img.style.transform = 'scale(1.1)';
                }
            });
        }, 100);
    }

    document.getElementById('avatarModal').classList.add('active');
}

function initAvatarSelector() {
    const container = document.getElementById('avatarSelectionArea');
    if (!container) return;

    if (container.children.length > 0) return;

    container.style.display = 'grid';
    container.style.gridTemplateColumns = 'repeat(auto-fill, minmax(60px, 1fr))';
    container.style.gap = '15px';
    container.style.maxHeight = '300px';
    container.style.overflowY = 'auto';
    container.style.padding = '10px';

    container.innerHTML = AVATAR_OPTIONS.map(name => `
        <div style="text-align:center;">
             <img src="${getAvatarPath(name)}" 
                 class="avatar-option" 
                 onclick="selectAvatarTemp('${name}', this)"
                 alt="${name}"
                 loading="lazy" 
                 style="width:60px; height:60px; border-radius:50%; cursor:pointer; border:4px solid transparent; transition:transform 0.2s;">
        </div>
    `).join('');
}

function selectAvatarTemp(name, imgElement) {
    selectedAvatarTemp = name;
    document.querySelectorAll('.avatar-option').forEach(img => {
        img.style.borderColor = 'transparent';
        img.style.transform = 'scale(1)';
    });
    imgElement.style.borderColor = '#667eea';
    imgElement.style.transform = 'scale(1.1)';
}

async function saveMyAvatar() {
    if (!checkAuth()) return;
    try {
        await apiRequest(`/Auth/UpdateAvatar`, {
            method: 'POST',
            body: JSON.stringify({ avatar: selectedAvatarTemp })
        });

        if (AppState.currentUser) {
            AppState.currentUser.avatar = selectedAvatarTemp;
        }
        document.getElementById('avatarModal').classList.remove('active');
        updateAuthUI();

        await Swal.fire({
            icon: 'success',
            title: 'Looks great!',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 500
        });

        if (avatarOpenedFromMenu) {
            openProfileMenu();
            avatarOpenedFromMenu = false;
        }

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Could not save avatar', 'error');
    }
}
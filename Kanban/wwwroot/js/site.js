'use strict';

const AppState = {
    isAuthenticated: false,
    currentUser: null,
    currentBoardId: null,
    boards: [],
    currentColumns: [],
    isRequestPending: false,

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
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.indexOf(name) === 0) {
            return cookie.substring(name.length);
        }
    }
    return null;
}

async function apiRequest(endpoint, options = {}, showload = true, isPooling = false) {
    if (showload) showLoading();
    if (!isPooling) {
        AppState.isRequestPending = true;
    }
    try {
        const method = (options.method || 'GET').toUpperCase();

        if (method !== 'GET') {
            try {
                await fetch('/Home/GetToken', { credentials: 'same-origin' });
            } catch (err) {
                console.warn("Token fetch error:", err);
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
            console.warn('Session expired or unauthorized. Redirecting to home...');
            AppState.reset();
            updateAuthUI();
            handleLogout().then(() => { setTimeout(() => { window.location.href = '/'; window.location.reload(); }, 500); });
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
        if (showload && error.message !== 'Session expired or unauthorized.') {
            Swal.fire('Error', error.message || 'A connection error occurred.', 'error');
        }
        throw error;
    } finally {
        if (showload) hideLoading();
        if (!isPooling) {
            AppState.isRequestPending = false;
        }
    }
}

AppState.startPolling = function () {
    this.stopPolling();

    this.syncInterval = setInterval(async () => {
        if (!this.currentBoardId || !this.lastSyncTime || this.isDragging) return;
        if (document.body.classList.contains('swal2-shown')) return;
        if (AppState.isRequestPending) return;

        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('open')) return;

        const container = document.getElementById('quickNoteContainer');
        if (container.classList.contains('active')) return;

        try {
            const res = await apiRequest(`/Kanban/CheckBoardVersion?boardId=${this.currentBoardId}`, {}, false, true);
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
    } catch (e) { }
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
            <div id="notif-${n.id}" class="notif-item" style="padding:12px; border-bottom:1px solid #eee; display:flex; align-items:flex-start; justify-content:space-between; gap:10px; text-align:left; transition:opacity 0.3s;">
                <div style="display:flex; gap:10px; align-items:flex-start; flex:1;">
                    <div style="font-size:20px;">📢</div>
                    <div>
                        <div style="font-size:14px; color:#2d3748;">${escapeHtml(n.message)}</div>
                        <div style="font-size:11px; color:#a0aec0; margin-top:4px;">
                            ${new Date(n.createdAt).toLocaleDateString('tr-TR')} ${new Date(n.createdAt).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                    </div>
                </div>
                <button class="notif-delete-btn" data-notif-id="${n.id}" title="Delete"
                        style="background:none; border:none; color:#e53e3e; font-size:18px; font-weight:bold; cursor:pointer; padding:0 5px; line-height:1;">×</button>
            </div>
        `).join('');

        const headerHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; padding-bottom:10px; border-bottom:2px solid #f7fafc;">
                <span style="font-weight:bold; color:#4a5568; font-size:14px;">Recent</span>
                <button id="delete-all-notifs-btn"
                        style="background:#fff5f5; border:1px solid #fed7d7; color:#c53030; font-size:12px; padding:5px 10px; border-radius:6px; cursor:pointer; font-weight:600; transition:0.2s;">
                    🗑️ Delete All
                </button>
            </div>
        `;

        Swal.fire({
            title: 'Notifications',
            html: `
                ${headerHtml}
                <div id="notif-container" style="max-height:300px; overflow-y:auto;">
                    ${listItemsHtml}
                </div>
            `,
            showCloseButton: true,
            showConfirmButton: false,
            width: 450,
            didOpen: () => {
                const deleteAllBtn = document.getElementById('delete-all-notifs-btn');
                if (deleteAllBtn) {
                    deleteAllBtn.addEventListener('mouseenter', () => {
                        deleteAllBtn.style.background = '#feb2b2';
                        deleteAllBtn.style.color = 'white';
                    });
                    deleteAllBtn.addEventListener('mouseleave', () => {
                        deleteAllBtn.style.background = '#fff5f5';
                        deleteAllBtn.style.color = '#c53030';
                    });
                    deleteAllBtn.addEventListener('click', () => deleteAllNotifications());
                }

                const notifContainer = document.getElementById('notif-container');
                if (notifContainer) {
                    notifContainer.addEventListener('click', (e) => {
                        const btn = e.target.closest('.notif-delete-btn');
                        if (btn) {
                            const id = btn.dataset.notifId;
                            if (id) deleteNotification(Number(id));
                        }
                    });
                }
            }
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
            <div style="padding:15px; background:#f7fafc; border:1px solid #e2e8f0; border-radius:8px; margin-bottom:10px; text-align:left;">
                <div style="font-weight:bold; color:#2d3748; margin-bottom:5px;">
                    📂 ${escapeHtml(invite.boardName)}
                </div>
                <div style="font-size:13px; color:#718096; margin-bottom:10px;">
                    Invited by: <b>${escapeHtml(invite.inviterName)}</b>
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="invite-accept-btn" data-invite-id="${invite.id}"
                            style="flex:1; padding:8px; border:none; background:#48bb78; color:white; border-radius:6px; cursor:pointer; font-weight:600;">
                        Accept
                    </button>
                    <button class="invite-decline-btn" data-invite-id="${invite.id}"
                            style="flex:1; padding:8px; border:none; background:#f56565; color:white; border-radius:6px; cursor:pointer; font-weight:600;">
                        Decline
                    </button>
                </div>
            </div>
        `).join('');

        Swal.fire({
            title: 'Pending Invites',
            html: `<div id="invites-wrapper" style="max-height:400px; overflow-y:auto;">${invitesHtml}</div>`,
            showConfirmButton: false,
            showCloseButton: true,
            didOpen: () => {
                const wrapper = document.getElementById('invites-wrapper');
                if (wrapper) {
                    wrapper.addEventListener('click', (e) => {
                        const acceptBtn = e.target.closest('.invite-accept-btn');
                        const declineBtn = e.target.closest('.invite-decline-btn');
                        if (acceptBtn) {
                            handleInviteResponse(Number(acceptBtn.dataset.inviteId), true);
                        } else if (declineBtn) {
                            handleInviteResponse(Number(declineBtn.dataset.inviteId), false);
                        }
                    });
                }
            }
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
            if (isAccepted) loadBoards();
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

    const containerStyle = `position:relative; max-width:100%; width:18em; margin:1em auto; display:flex; align-items:center;`;
    const inputStyle = `width:100%; margin:0; padding-right:35px; box-sizing:border-box;`;
    const iconStyle = `position:absolute; right:10px; z-index:2; cursor:pointer; font-size:1.2em; background:transparent; border:none; padding:0;`;

    const { value: passwordData } = await Swal.fire({
        title: 'Change Password',
        html: `
            <div style="${containerStyle}">
                <input id="swal-old-pass" type="password" class="swal2-input" placeholder="Current Password" style="${inputStyle}">
                <button type="button" class="pass-toggle" data-target="swal-old-pass" style="${iconStyle}">🙈</button>
            </div>
            <div style="${containerStyle}">
                <input id="swal-new-pass" type="password" class="swal2-input" placeholder="New Password" style="${inputStyle}">
                <button type="button" class="pass-toggle" data-target="swal-new-pass" style="${iconStyle}">🙈</button>
            </div>
            <div style="${containerStyle}">
                <input id="swal-conf-pass" type="password" class="swal2-input" placeholder="Confirm New Password" style="${inputStyle}">
                <button type="button" class="pass-toggle" data-target="swal-conf-pass" style="${iconStyle}">🙈</button>
            </div>
        `,
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Update',
        cancelButtonText: 'Cancel',
        didOpen: () => {
            const popup = Swal.getPopup();
            const toggles = popup.querySelectorAll('.pass-toggle');
            toggles.forEach(toggle => {
                toggle.addEventListener('click', () => {
                    const targetId = toggle.getAttribute('data-target');
                    const input = popup.querySelector(`#${targetId}`);
                    if (input.type === "password") {
                        input.type = "text";
                        toggle.textContent = "🙊";
                    } else {
                        input.type = "password";
                        toggle.textContent = "🙈";
                    }
                });
            });
        },
        preConfirm: () => {
            const currentPassword = document.getElementById('swal-old-pass').value;
            const newPassword = document.getElementById('swal-new-pass').value;
            const confPass = document.getElementById('swal-conf-pass').value;

            if (!currentPassword || !newPassword || !confPass) {
                Swal.showValidationMessage('Please fill all fields.');
                return false;
            }
            if (newPassword.length < 6) {
                Swal.showValidationMessage('Password must be at least 6 characters.');
                return false;
            }
            if (newPassword !== confPass) {
                Swal.showValidationMessage('New passwords do not match.');
                return false;
            }
            return { currentPassword, newPassword };
        }
    });

    if (passwordData) {
        try {
            const res = await apiRequest('/Auth/ChangePassword', {
                method: 'POST',
                body: JSON.stringify(passwordData)
            });
            if (res.success) {
                const temp = AppState.currentUser.email;

                await Swal.fire({
                    title: 'Password Changed',
                    text: 'Please login again with your new password.',
                    icon: 'success',
                    confirmButtonText: 'Login'
                });

                AppState.reset();
                updateAuthUI();
                const sidebar = document.getElementById('sidebar');
                if (sidebar && sidebar.classList.contains('open')) toggleSidebar();
                AppState.stopPolling();
                openLoginModal(temp);
            } else {
                await Swal.fire('Error', res.errorMessage || 'Failed to update password.', 'error');
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

    const btnStyle = `width:100%; padding:12px; margin-bottom:8px; border:1px solid #e2e8f0; background:white; border-radius:8px; cursor:pointer; display:flex; align-items:center; gap:10px; font-size:15px; text-align:left; transition:background 0.2s;`;

    Swal.fire({
        html: `
            <div style="display:flex; flex-direction:column; align-items:center; margin-bottom:20px;">
                <img src="${avatar}" style="width:70px; height:70px; border-radius:50%; border:3px solid #667eea; margin-bottom:10px;">
                <h3 style="margin:0; font-size:18px; color:#2d3748;">${name}</h3>
                <span style="font-size:13px; color:#718096;">${email}</span>
            </div>
            <div id="profile-menu-buttons" style="text-align:left;">
                <button class="profile-menu-btn" data-action="notifications" style="${btnStyle}">
                    <span style="font-size:18px;">🔔</span> Notifications
                </button>
                <button class="profile-menu-btn" data-action="invites" style="${btnStyle}">
                    <span style="font-size:18px;">📩</span> Invites
                </button>
                <button class="profile-menu-btn" data-action="avatar" style="${btnStyle}">
                    <span style="font-size:18px;">🎨</span> Change Avatar
                </button>
                <button class="profile-menu-btn" data-action="password" style="${btnStyle}">
                    <span style="font-size:18px;">🔑</span> Change Password
                </button>
                <hr style="border:0; border-top:1px solid #edf2f7; margin:15px 0;">
                <button class="profile-menu-btn" data-action="logout" style="${btnStyle} color:#e53e3e; border-color:#fed7d7;">
                    <span style="font-size:18px;">🚪</span> Logout
                </button>
            </div>
        `,
        showConfirmButton: false,
        showCloseButton: true,
        width: 400,
        padding: '20px',
        customClass: { popup: 'animated fadeInDown' },
        didOpen: () => {
            const container = document.getElementById('profile-menu-buttons');
            if (!container) return;

            container.querySelectorAll('.profile-menu-btn').forEach(btn => {
                const isLogout = btn.dataset.action === 'logout';
                btn.addEventListener('mouseenter', () => {
                    btn.style.background = isLogout ? '#fff5f5' : '#f7fafc';
                });
                btn.addEventListener('mouseleave', () => {
                    btn.style.background = 'white';
                });
            });

            container.addEventListener('click', (e) => {
                const btn = e.target.closest('.profile-menu-btn');
                if (!btn) return;

                Swal.close();
                switch (btn.dataset.action) {
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
            <div id="header-avatar-wrap" style="cursor:pointer; position:relative;" title="Menu">
                <img src="${avatarPath}" id="header-avatar-img"
                     style="width:45px; height:45px; border-radius:50%; object-fit:cover; border:2px solid #e2e8f0; transition:transform 0.2s;">
                <span id="nav-badge" class="notification-badge"></span>
            </div>
        `;

        setTimeout(() => {
            const wrap = document.getElementById('header-avatar-wrap');
            const img = document.getElementById('header-avatar-img');
            if (wrap && img) {
                wrap.addEventListener('click', () => openProfileMenu());
                img.addEventListener('mouseenter', () => {
                    img.style.transform = 'scale(1.05)';
                    img.style.borderColor = '#667eea';
                });
                img.addEventListener('mouseleave', () => {
                    img.style.transform = 'scale(1)';
                    img.style.borderColor = '#e2e8f0';
                });
            }
        }, 0);

        authSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; padding:15px; background:rgba(255,255,255,0.05); border-radius:12px; border:1px solid rgba(255,255,255,0.1);">
                <img src="${avatarPath}" style="width:40px; height:40px; border-radius:50%; background:white;">
                <div style="overflow:hidden;">
                    <div style="font-weight:bold; font-size:14px;">${safeName}</div>
                    <div style="font-size:11px; color:#a0aec0;">${escapeHtml(AppState.currentUser.email)}</div>
                </div>
            </div>
            <button id="sidebar-menu-btn" class="btn btn-secondary" style="width:100%; margin-bottom:15px;">⚙️ Menu</button>
            <button id="sidebar-logout-btn" class="btn btn-danger" style="width:100%;">Logout</button>
        `;

        setTimeout(() => {
            const menuBtn = document.getElementById('sidebar-menu-btn');
            const logoutBtn = document.getElementById('sidebar-logout-btn');
            if (menuBtn) menuBtn.addEventListener('click', () => openProfileMenu());
            if (logoutBtn) logoutBtn.addEventListener('click', () => confirmLogout());
        }, 0);

    } else {
        if (boardHeader) boardHeader.style.display = "none";
        document.getElementById("boardHeaderTitle").textContent = "";
        document.getElementById("board").innerHTML = "";

        area.innerHTML = `<button id="header-login-btn" class="btn btn-primary">🔐</button>`;
        authSection.innerHTML = `
            <button id="sidebar-login-btn" class="btn btn-primary" style="width:100%; margin-bottom:10px;">Login</button>
            <button id="sidebar-register-btn" class="btn btn-secondary" style="width:100%;">Register</button>
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
    ['registerFullName', 'registerEmail', 'registerPassword', 'registerConfirmPassword']
        .forEach(id => document.getElementById(id).value = '');
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
    } catch { }
}

function showPrivacyPolicy(e) {
    if (e) e.preventDefault();
    Swal.fire({
        title: 'Privacy Policy',
        html: `
            <div style="text-align:left; font-size:13px; max-height:300px; overflow-y:auto;">
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
    Swal.fire({
        title: 'User Agreement',
        html: `
            <div style="text-align:left; font-size:13px; max-height:300px; overflow-y:auto;">
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

    const turnstileInput = document.querySelector('[name="cf-turnstile-response"]');
    const turnstileToken = turnstileInput ? turnstileInput.value : null;

    if (!turnstileToken) {
        return Swal.fire({ icon: 'warning', title: 'Verification Required', text: 'Please verify that you are human.' });
    }

    try {
        const verify = await apiRequest('/Auth/VerifyWork', {
            method: 'POST',
            body: JSON.stringify({ email, turnstileToken })
        });

        if (!verify.success) {
            if (window.turnstile) window.turnstile.reset();
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

            if (window.turnstile) window.turnstile.reset();
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
        if (window.turnstile) window.turnstile.reset();
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
        <li class="board-item ${b.id === AppState.currentBoardId ? 'active' : ''}" data-board-id="${b.id}">
            <span>📊 ${escapeHtml(b.title)}</span>
            <div class="board-actions-btn" data-board-menu="${b.id}">⋮</div>
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
    if (sidebar.classList.contains('open')) toggleSidebar();

    AppState.stopPolling();
    AppState.currentBoardId = id;
    renderBoardList();
    await loadBoardData();
    AppState.startPolling();
}

async function openNewBoardModal() {
    if (!checkAuth()) return;
    const { value: tt } = await Swal.fire({
        title: 'New Board Name',
        input: 'text',
        inputPlaceholder: 'Enter board name...',
        confirmButtonText: 'Create',
        showCancelButton: true,
        inputValidator: (value) => {
            if (value.trim().length < 3) return 'Name must be at least 3 characters!';
            if (value.trim().length > 100) return 'Name is too long!';
        }
    });
    if (tt && tt.trim()) {
        try {
            await apiRequest('/Kanban/CreateBoard', {
                method: 'POST',
                body: JSON.stringify({ title: tt.trim() })
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

async function startRenameProcess(boardId) {
    const board = AppState.boards.find(b => b.id === boardId);
    if (!board) return;

    const currentName = board.title;

    const result = await Swal.fire({
        title: 'Rename Board',
        input: 'text',
        inputValue: currentName,
        showCancelButton: true,
        confirmButtonText: 'Save',
        confirmButtonColor: '#3182ce',
        cancelButtonText: 'Cancel',
        inputPlaceholder: 'Enter new board name',
        inputValidator: (value) => {
            if (value.trim().length < 3) return 'Name must be at least 3 characters!';
            if (value.trim().length > 100) return 'Name is too long!';
        }
    });

    const newTitle = result.value;
    if (result.isConfirmed && newTitle && newTitle.trim() !== currentName) {
        const finalTitle = newTitle.trim();
        try {
            await apiRequest('/Kanban/UpdateBoardTitle', {
                method: 'POST',
                body: JSON.stringify({ boardId, title: finalTitle })
            }, false);

            const b = AppState.boards.find(b => b.id === boardId);
            if (b) b.title = finalTitle;

            if (AppState.currentBoardId === boardId) {
                const headerTitle = document.getElementById('boardHeaderTitle');
                if (headerTitle) headerTitle.innerText = finalTitle;
            }

            renderBoardList();

            Swal.fire({
                icon: 'success',
                title: 'Renamed!',
                text: 'Board name has been updated.',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error("Rename error", error);
            Swal.fire('Error', 'Failed to rename board.', 'error');
        }
    } else if (result.isDismissed) {
        showBoardMenu(boardId);
    }
}

async function showBoardMenu(boardId) {
    if (!checkAuth()) return;

    const board = AppState.boards.find(b => b.id === boardId);
    if (!board) return;

    await Swal.fire({
        title: escapeHtml(board.title),
        html: `
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:10px;">
                <button id="menuBtnRename" class="swal2-confirm swal2-styled" style="background-color:#3182ce; width:100%; margin:0;">
                    ✏️ Rename Board
                </button>
                <button id="menuBtnManage" class="swal2-confirm swal2-styled" style="background-color:#48bb78; width:100%; margin:0;">
                    👥 Manage Users
                </button>
                <button id="menuBtnDelete" class="swal2-deny swal2-styled" style="background-color:#f56565; width:100%; margin:0;">
                    🗑️ Delete Board
                </button>
            </div>
        `,
        showConfirmButton: false,
        showDenyButton: false,
        showCloseButton: true,
        didOpen: () => {
            document.getElementById('menuBtnRename').addEventListener('click', () => {
                Swal.close();
                startRenameProcess(boardId);
            });
            document.getElementById('menuBtnManage').addEventListener('click', () => {
                Swal.close();
                openManageUsersModal(boardId);
            });
            document.getElementById('menuBtnDelete').addEventListener('click', () => {
                Swal.close();
                deleteBoard(boardId);
            });
        }
    });
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
                <table style="width:100%; border-collapse:collapse;">
                    <thead>
                        <tr style="border-bottom:2px solid #eee; text-align:left;">
                            <th style="padding:8px;">User</th>
                            <th style="padding:8px; text-align:center;">Role</th>
                            <th style="padding:8px; text-align:right;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="members-tbody">
        `;

        members.forEach(m => {
            const isMe = m.userId === currentUserId;
            const isTargetOwner = m.roleCode === 'OWNER';

            const roleBadge = isTargetOwner
                ? `<span style="padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold; display:inline-block; background-color:#805ad5; color:white;">👑 Owner</span>`
                : `<span style="padding:4px 8px; border-radius:12px; font-size:11px; font-weight:bold; display:inline-block; background-color:#e2e8f0; color:#4a5568; border:1px solid #cbd5e0;">👤 Member</span>`;

            let buttons = '';
            if (amIOwner && !isTargetOwner) {
                buttons = `
                    <button class="member-promote-btn" data-board-id="${boardId}" data-user-id="${m.userId}"
                            style="padding:6px 10px; font-size:12px; border-radius:4px; border:none; cursor:pointer; color:white; margin-left:5px; background-color:#6b46c1;" title="Make Owner">👑</button>
                    <button class="member-remove-btn" data-board-id="${boardId}" data-user-id="${m.userId}"
                            style="padding:6px 10px; font-size:12px; border-radius:4px; border:none; cursor:pointer; color:white; margin-left:5px; background-color:#f56565;" title="Remove User">🗑️</button>
                `;
            } else if (isMe) {
                buttons = `<span style="font-size:11px; color:#aaa;">(It's you)</span>`;
            }

            membersHtml += `
                <tr style="border-bottom:1px solid #f7fafc;">
                    <td style="padding:10px 8px;">
                        <div style="font-weight:bold;">${escapeHtml(m.fullName)}</div>
                        <div style="font-size:12px; color:#718096;">${escapeHtml(m.email)}</div>
                    </td>
                    <td style="padding:10px 8px; text-align:center;">${roleBadge}</td>
                    <td style="padding:10px 8px; text-align:right; white-space:nowrap;">${buttons}</td>
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
            didOpen: () => {
                const tbody = document.getElementById('members-tbody');
                if (tbody) {
                    tbody.addEventListener('click', (e) => {
                        const promoteBtn = e.target.closest('.member-promote-btn');
                        const removeBtn = e.target.closest('.member-remove-btn');
                        if (promoteBtn) {
                            promoteToOwner(Number(promoteBtn.dataset.boardId), Number(promoteBtn.dataset.userId));
                        } else if (removeBtn) {
                            removeMember(Number(removeBtn.dataset.boardId), Number(removeBtn.dataset.userId));
                        }
                    });
                }
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
            } else {
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
            } else {
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
    } else {
        showBoardMenu(boardId);
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

    const addColBtn = document.getElementById('btnNewColumn');
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
        const deleteBtnHtml = isOwner
            ? `<button class="col-delete-btn" data-col-id="${col.id}" style="padding:5px 10px;" title="Delete Column">🗑️</button>`
            : `<button style="padding:5px 10px; opacity:0.3; cursor:not-allowed;" disabled title="Only owner can delete">🗑️</button>`;

        return `
        <div class="column">
            <div class="column-header">
                <div style="display:flex; align-items:center; gap:5px; width: 100%">
                    <span class="column-title">${escapeHtml(col.title)}</span>
                    <span class="card-count" style="margin: 0 auto">${col.cards.length}</span>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="col-add-card-btn btn btn-primary" data-col-id="${col.id}" style="padding:5px 10px;" title="Add Card">＋</button>
                    ${deleteBtnHtml}
                </div>
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
            const opacityStyle = isLocked ? 'opacity:0.8;' : '';

            const avatarHtml = card.assigneeAvatar
                ? `<img src="${getAvatarPath(card.assigneeAvatar)}" title="${escapeHtml(card.assigneeName)}" class="card-avatar-small">`
                : `<span class="card-avatar-empty" title="Unassigned">👤</span>`;

            const moveButtonsHtml = isLocked ? '' : `
                <div style="display:flex; flex-direction:column; margin-right:6px; justify-content:center;">
                    <button class="move-card-top-btn" data-card-id="${card.id}" data-col-id="${col.id}" 
                            title="Move to Top" 
                            style="border:none; background:transparent; cursor:pointer; font-size:10px; line-height:10px; padding:1px; color:#cbd5e0; transition:color 0.2s;"
                            onmouseover="this.style.color='#4a5568'" onmouseout="this.style.color='#cbd5e0'">▲</button>
                    <button class="move-card-bottom-btn" data-card-id="${card.id}" data-col-id="${col.id}" 
                            title="Move to Bottom" 
                            style="border:none; background:transparent; cursor:pointer; font-size:10px; line-height:10px; padding:1px; color:#cbd5e0; transition:color 0.2s;"
                            onmouseover="this.style.color='#4a5568'" onmouseout="this.style.color='#cbd5e0'">▼</button>
                </div>
            `;

            return `
                        <div class="card ${lockedClass}"
                             data-card-id="${card.id}"
                             data-col-id="${col.id}"
                             style="background-color:${cardBgColor}; transition:background-color 0.3s; cursor:${cursorStyle}; ${opacityStyle}">

                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                                <div style="display:flex; align-items:center; gap:5px;">
                                    ${lockIcon}
                                    <span class="card-date">📅 ${new Date(card.dueDate).toLocaleDateString('tr-TR')}</span>
                                </div>
                                <span class="card-delete-btn" data-card-id="${card.id}" style="cursor:pointer; font-weight:bold; font-size:16px; color:#cbd5e0;" onmouseover="this.style.color='#e53e3e'" onmouseout="this.style.color='#cbd5e0'">×</span>
                            </div>

                            <p class="card-desc-truncate">${escapeHtml(stripHtml(card.desc))}</p>

                            <div class="card-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:auto;">
                                <div style="font-size:10px; color:#999; font-weight:600;">
                                    ${card.assigneeName ? escapeHtml(card.assigneeName.split(' ')[0]) : 'Unassigned'}
                                </div>
                                <div style="display:flex; align-items:center;">
                                    ${moveButtonsHtml}
                                    ${avatarHtml}
                                </div>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
            <button class="col-add-card-bottom btn btn-success" data-col-id="${col.id}" style="width:100%;">+ Add Card</button>
        </div>
    `}).join('');

    const newBoardDiv = boardDiv.cloneNode(true);
    boardDiv.parentNode.replaceChild(newBoardDiv, boardDiv);

    newBoardDiv.addEventListener('click', (e) => {
        const deleteBtn = e.target.closest('.card-delete-btn');
        if (deleteBtn) {
            e.stopPropagation();
            const cardId = Number(deleteBtn.dataset.cardId);
            if (cardId) deleteCard(cardId);
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

        const colDeleteBtn = e.target.closest('.col-delete-btn');
        if (colDeleteBtn) {
            e.stopPropagation();
            const colId = Number(colDeleteBtn.dataset.colId);
            if (colId) deleteColumn(colId);
            return;
        }

        const addCardBtn = e.target.closest('.col-add-card-btn') || e.target.closest('.col-add-card-bottom');
        if (addCardBtn) {
            e.stopPropagation();
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
    if (column.cards.length < 2) return;

    try {
        await apiRequest('/Kanban/MoveCard', {
            method: 'POST',
            body: JSON.stringify({
                boardId: AppState.currentBoardId,
                cardId: cardId,
                newColumnId: colId,
                newOrder: 1
            })
        });
        await loadBoardData(false);

        const refreshedCol = document.querySelector(`.cards-container[data-column-id="${colId}"]`);
        if (refreshedCol) {
            refreshedCol.scrollTo({ top: 0, behavior: 'smooth' });
        }
    } catch {
        Swal.fire('Error', 'Failed to move card', 'error');
    }
}

async function moveCardBottom(cardId, colId) {
    if (!checkAuth() || !cardId || !colId) return;

    const column = AppState.currentColumns.find(c => c.id == colId);
    if (column.cards.length < 2) return;

    try {
        await apiRequest('/Kanban/MoveCard', {
            method: 'POST',
            body: JSON.stringify({
                boardId: AppState.currentBoardId,
                cardId: cardId,
                newColumnId: colId,
                newOrder: 999999
            })
        });
        await loadBoardData(false);

        const refreshedCol = document.querySelector(`.cards-container[data-column-id="${colId}"]`);
        if (refreshedCol) {
            refreshedCol.scrollTo({ top: refreshedCol.scrollHeight, behavior: 'smooth' });
        }
    } catch {
        Swal.fire('Error', 'Failed to move card', 'error');
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

function initSortable() {
    const boardElement = document.getElementById('board');

    document.querySelectorAll('.cards-container').forEach(container => {
        Sortable.create(container, {
            group: 'kanban',
            animation: 150,
            delay: 200,
            delayOnTouchOnly: true,
            touchStartThreshold: 5,
            scroll: true,
            scrollSensitivity: 0,
            scrollSpeed: 0,
            bubbleScroll: true,
            ghostClass: 'kanban-card-placeholder',
            filter: ".card-delete-btn, .move-card-top-btn, .move-card-bottom-btn, .col-add-card-btn",
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

                try {
                    await apiRequest('/Kanban/MoveCard', {
                        method: 'POST',
                        body: JSON.stringify({ boardId: AppState.currentBoardId, cardId, newColumnId, newOrder: newIndex + 1 })
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
    if (sidebar && sidebar.classList.contains('open')) toggleSidebar();

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
    } else {
        for (const col of AppState.currentColumns) {
            if (col.cards.some(c => c.id == id)) {
                openCardModal(col.id, id);
                break;
            }
        }
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
                if (c.id == cardId) { card = c; columnId = col.id; break outerLoop; }
            }
        }
        if (!card) return;
    }

    const currentUserId = AppState.currentUser.userId;
    const canEdit = !isEditMode || !card.assigneeId || card.assigneeId === currentUserId;

    const disabledAttr = canEdit ? '' : 'disabled';
    const inputStyle = canEdit ? '' : 'background-color:#f7fafc; color:#718096; cursor:not-allowed;';

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
            <div style="margin-top:20px; padding-top:15px; border-top:2px solid #edf2f7;">
                <h4 style="margin:0 0 10px 0; color:#2d3748; font-size:14px;">💬 Comments</h4>
                <div id="comments-list" style="max-height:200px; overflow-y:auto; margin-bottom:10px; background:#f8f9fa; padding:10px; border-radius:8px;">
                    <div style="text-align:center; color:#a0aec0; font-size:12px;">Loading comments...</div>
                </div>
                <div style="display:flex; gap:10px;">
                    <input type="text" id="new-comment-input" class="swal2-input" maxlength="400" placeholder="Write a comment..."
                           style="margin:0; height:38px; font-size:13px; flex:1;">
                    <button type="button" id="submit-comment-btn" class="btn btn-primary"
                            style="padding:0 20px; font-size:13px; height:38px;">Send</button>
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
                    <div id="editor-container" style="height:120px; background:white; ${canEdit ? '' : 'pointer-events:none; background:#f7fafc;'}"></div>
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

                <div style="display:flex; align-items:center; gap:8px; margin-top:5px;">
                    <input type="checkbox" id="modal-reminder-check" style="width:18px; height:18px; cursor:pointer;" ${warningChecked} ${disabledAttr}>
                    <label for="modal-reminder-check" style="font-weight:bold; cursor:pointer; font-size:13px; color:${canEdit ? 'black' : '#a0aec0'}">Show Warning Settings</label>
                </div>

                <div id="warning-area" style="display:${warningDisplay}; padding:10px; background:#fff5f5; border:1px dashed #feb2b2; border-radius:8px; ${canEdit ? '' : 'opacity:0.6; pointer-events:none;'}">
                    <p style="color:#c53030; font-size:11px; margin-bottom:10px;"><b>⚠️ Note:</b> Card will turn red when approaching due date.</p>
                    <div style="display:flex; gap:10px; align-items:flex-end;">
                        <div style="flex:2;">
                            <label style="font-size:11px; font-weight:bold; display:block;">Reminder Days</label>
                            <select id="modal-days" class="swal2-select" style="width:100%; margin:5px 0 0 0; font-size:13px; height:35px;">
                                <option value="1" ${defaults.warningDays == 1 ? 'selected' : ''}>1 Day Remaining</option>
                                <option value="3" ${defaults.warningDays == 3 ? 'selected' : ''}>3 Days Remaining</option>
                                <option value="7" ${defaults.warningDays == 7 ? 'selected' : ''}>1 Week Remaining</option>
                            </select>
                        </div>
                        <div style="flex:1;">
                            <label style="font-size:11px; font-weight:bold; display:block;">Color</label>
                            <input type="color" id="modal-color" value="${defaults.color}" style="width:100%; height:35px; padding:2px; border:1px solid #d1d5db; border-radius:4px; cursor:pointer; margin-top:5px;">
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

            if (canEdit) {
                setTimeout(() => {
                    quill.focus();
                    const length = quill.getLength();
                    quill.setSelection(length, length);
                }, 100);
            }

            const checkbox = document.getElementById('modal-reminder-check');
            const area = document.getElementById('warning-area');
            if (checkbox && area) {
                checkbox.addEventListener('change', (e) => {
                    area.style.display = e.target.checked ? 'block' : 'none';
                });
            }

            if (isEditMode) {
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

            const description = quill.root.innerHTML;
            const assigneeId = document.getElementById('modal-assignee').value;
            const dueDate = document.getElementById('modal-date').value;
            const hasWarning = document.getElementById('modal-reminder-check').checked;
            const warningDays = hasWarning ? document.getElementById('modal-days').value : 0;
            const highlightColor = hasWarning ? document.getElementById('modal-color').value : null;

            if (!dueDate) {
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

        if (res.success && res.data.length > 0) {
            listEl.innerHTML = res.data.map(c => {
                const deleteBtn = (c.userId === currentUserId)
                    ? `<span class="comment-delete-btn" data-comment-id="${c.id}" data-card-id="${cardId}"
                            title="Delete Comment"
                            style="cursor:pointer; color:#e53e3e; margin-left:10px; font-size:14px;">🗑️</span>`
                    : '';

                return `
                    <div style="margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #e2e8f0;">
                        <div style="display:flex; justify-content:space-between; font-size:11px; color:#718096; margin-bottom:2px;">
                            <div>
                                <strong>${escapeHtml(c.fullName)}</strong>
                                <span style="margin-left:5px; color:#cbd5e0;">•</span>
                                <span style="margin-left:5px;">${new Date(c.createdAt).toLocaleString('tr-TR')}</span>
                            </div>
                            <div>${deleteBtn}</div>
                        </div>
                        <div style="font-size:13px; color:#2d3748; white-space:pre-wrap;">${escapeHtml(c.message)}</div>
                    </div>
                `;
            }).join('');

            listEl.addEventListener('click', (e) => {
                const btn = e.target.closest('.comment-delete-btn');
                if (btn) {
                    const commentId = Number(btn.dataset.commentId);
                    const cCardId = Number(btn.dataset.cardId);
                    if (commentId && cCardId) deleteComment(commentId, cCardId);
                }
            });
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
                        if (c.id == cardId) { columnId = col.id; break outerLoop; }
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

    const serverDataEl = document.getElementById('server-data');
    if (serverDataEl) {
        window.SERVER_INVITE_STATUS = serverDataEl.getAttribute('data-invite-status');
        window.SERVER_MESSAGE = serverDataEl.getAttribute('data-server-message');
    }

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
            if (sidebar && sidebar.classList.contains('open')) toggleSidebar();
        });
    }

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
        switch (action) {
            case 'toggleSidebar': toggleSidebar(); break;
            case 'openNewBoardModal': openNewBoardModal(); break;
            case 'openNewColumnModal': openNewColumnModal(); break;
            case 'closeLoginModal': closeLoginModal(); break;
            case 'closeRegisterModal': closeRegisterModal(); break;
            case 'switchToRegister': switchToRegister(); break;
            case 'switchToLogin': switchToLogin(); break;
            case 'showPrivacyPolicy': showPrivacyPolicy(e); break;
            case 'showUserAgreement': showUserAgreement(e); break;
            case 'saveMyAvatar': saveMyAvatar(); break;
            case 'toggleQuickNote': toggleQuickNote(); break;
            case 'clearQuickNote': clearQuickNote(); break;
        }
    });

    await fetchCurrentUser();

    if (AppState.isAuthenticated && AppState.currentUser) {
        loadBoards();
    } else {
        toggleSidebar();
    }

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
                    handleLogout().then(() => { setTimeout(() => { window.location.href = '/'; window.location.reload(); }, 500); });
                }
            });
            break;

        case 'ERROR':
            Swal.fire('Error', escapeHtml(window.SERVER_MESSAGE) || 'An error occurred while processing the invitation.', 'error');
            break;
    }
}

let quickNoteTimeout;
const quickNoteArea = document.getElementById('quickNoteArea');
const saveStatus = document.getElementById('saveStatus');

function toggleQuickNote() {
    if (!checkAuth()) return;

    const container = document.getElementById('quickNoteContainer');
    container.classList.toggle('active');

    if (container.classList.contains('active')) {
        if (AppState.currentUser) {
            quickNoteArea.value = AppState.currentUser.quickNote || "";
        }
        quickNoteArea.focus();
    }
}

quickNoteArea.addEventListener('input', () => {
    saveStatus.style.opacity = '1';
    saveStatus.innerText = 'Typing...';

    if (AppState.currentUser) {
        AppState.currentUser.quickNote = quickNoteArea.value;
    }

    clearTimeout(quickNoteTimeout);

    quickNoteTimeout = setTimeout(async () => {
        saveStatus.innerText = 'Saving...';
        try {
            await apiRequest('/Auth/UpdateQuickNote', {
                method: 'POST',
                body: JSON.stringify({ quickNote: quickNoteArea.value })
            }, false);
            saveStatus.innerText = 'Saved ✅';
            setTimeout(() => { saveStatus.style.opacity = '0'; }, 2000);
        } catch (error) {
            saveStatus.innerText = 'Error! ❌';
        }
    }, 1000);
});

let deleteTimeout;

async function clearQuickNote() {
    if (!quickNoteArea.value.trim()) return;

    const btn = document.getElementById('btnTrash');

    if (btn.innerText === '🗑️') {
        btn.innerText = '❓';
        btn.style.color = 'red';

        deleteTimeout = setTimeout(() => {
            btn.innerText = '🗑️';
            btn.style.color = '';
        }, 3000);
    } else {
        clearTimeout(deleteTimeout);
        quickNoteArea.value = "";

        if (AppState.currentUser) {
            AppState.currentUser.quickNote = "";
        }

        try {
            saveStatus.style.opacity = '1';
            saveStatus.innerText = 'Clearing...';

            await apiRequest('/Auth/UpdateQuickNote', {
                method: 'POST',
                body: JSON.stringify({ quickNote: "" })
            }, false);

            saveStatus.innerText = 'Cleared ✨';
            setTimeout(() => { saveStatus.style.opacity = '0'; }, 2000);
        } catch (error) {
            console.error("Clear error", error);
        }

        btn.innerText = '🗑️';
        btn.style.color = '';
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
            document.querySelectorAll('.avatar-option').forEach(img => {
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
                 alt="${name}"
                 data-avatar-name="${name}"
                 loading="lazy"
                 style="width:60px; height:60px; border-radius:50%; cursor:pointer; border:4px solid transparent; transition:transform 0.2s;">
        </div>
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
        if (AppState.currentUser.avatar == selectedAvatarTemp) {
            document.getElementById('avatarModal').classList.remove('active');
            if (avatarOpenedFromMenu) { openProfileMenu(); avatarOpenedFromMenu = false; }
            return;
        }

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
            timer: 1000
        });

        if (avatarOpenedFromMenu) { openProfileMenu(); avatarOpenedFromMenu = false; }
    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Could not save avatar', 'error');
    }
}
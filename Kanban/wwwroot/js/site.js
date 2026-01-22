'use strict';

const AppState = {
    isAuthenticated: false,
    currentUser: null,
    currentBoardId: null,
    boards: [],

    reset() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.currentBoardId = null;
        this.boards = [];
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

function showLoading() { document.getElementById('loadingOverlay').style.display = 'flex'; }
function hideLoading() { document.getElementById('loadingOverlay').style.display = 'none'; }
function getXsrfToken() {
    const name = "XSRF-TOKEN=";
    const decodedCookie = decodeURIComponent(document.cookie);
    const ca = decodedCookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i].trim();
        if (c.indexOf(name) == 0) return c.substring(name.length, c.length);
    }
    return "";
}

async function apiRequest(endpoint, options = {}) {
    showLoading();
    try {
        const token = getXsrfToken();
        const response = await fetch(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                'X-XSRF-TOKEN': token,
                ...options.headers
            },
            ...options
        });

        if (response.status === 401) {
            AppState.reset();
            updateAuthUI();
            throw new Error('Unauthorized');
        }
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) return await response.json();
        return await response.text();
    } catch (error) {
        console.error('Error:', error);
        throw error;
    } finally {
        hideLoading();
    }
}

async function fetchCurrentUser() {
    try {
        const res = await apiRequest('/Home/Fetch');
        if (res.success) {
            AppState.isAuthenticated = true;
            AppState.currentUser = res.data;

            if (AppState.currentUser.avatar === 'def' || !AppState.currentUser.avatar) {
                initAvatarSelector();
                document.getElementById('avatarModal').classList.add('active');
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

function updateAuthUI() {
    const authSection = document.getElementById('authSection');
    const area = document.getElementById("authHeaderArea");

    if (AppState.isAuthenticated && AppState.currentUser) {

        const safeName = escapeHtml(AppState.currentUser.fullName);
        const avatarPath = getAvatarPath(AppState.currentUser.avatar || 'def');

        area.innerHTML = `<button class="btn btn-secondary" onclick="confirmLogout()">🔓</button>`;

        authSection.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:15px; padding:10px; background:rgba(255,255,255,0.1); border-radius:8px;">
                <img src="${avatarPath}" style="width:40px; height:40px; border-radius:50%; background:white; object-fit:cover;">
                <div style="font-weight:bold; overflow:hidden; text-overflow:ellipsis;">
                    ${safeName}
                </div>
            </div>
            <button class="btn btn-secondary" style="width:100%" onclick="confirmLogout()">Logout</button>
        `;



        //const safeName = escapeHtml(AppState.currentUser.fullName);
        //area.innerHTML = `<button class="btn btn-secondary" onclick="confirmLogout()">🔓</button>`;
        //authSection.innerHTML = `
        //    <button class="btn btn-primary" style="width:100%; margin-bottom:10px;">${safeName}</button>
        //    <button class="btn btn-secondary" style="width:100%" onclick="confirmLogout()">Logout</button>
        //`;
    } else {
        document.getElementById("boardHeader").style.display = "none";
        document.getElementById("boardHeaderTitle").textContent = "";
        document.getElementById("board").innerHTML = "";

        area.innerHTML = `<button class="btn btn-primary" onclick="openLoginModal()">🔐</button>`;
        authSection.innerHTML = `
            <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="openLoginModal()">Login</button>
            <button class="btn btn-secondary" style="width:100%" onclick="openRegisterModal()">Register</button>
        `;
    }
}

document.querySelectorAll(".toggle-password").forEach(btn => {
    btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.target);
        input.type = input.type === "password" ? "text" : "password";
        btn.textContent = input.type === "password" ? "🙈" : "🙊";
    });
});

function switchToRegister() { closeLoginModal(); openRegisterModal(); }
function switchToLogin() { closeRegisterModal(); openLoginModal(); }

function openLoginModal(prefillEmail = null) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) toggleSidebar();
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
    if (sidebar.classList.contains('open')) toggleSidebar();
    document.getElementById('registerModal').classList.add('active');
    if (prefillEmail) document.getElementById('registerEmail').value = prefillEmail;
}

function closeRegisterModal() {
    document.getElementById('registerModal').classList.remove('active');
    document.getElementById('registerFullname').value = '';
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerConfirmPassword').value = '';
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
        Swal.fire('Error', 'Login failed. Please check your credentials.', 'error');
    }
}

async function handleRegister() {
    const fullname = document.getElementById('registerFullname').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    if (!fullname || !email || !password || !confirmPassword)
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
                body: JSON.stringify({ fullname, email, password, otpCode })
            });

            if (response.success) {
                isRegistered = true;
                await fetchCurrentUser();
                closeRegisterModal();
                Swal.fire({
                    title: 'Welcome!',
                    text: `Registration successful! Welcome ${escapeHtml(fullname)}`,
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
        await fetchCurrentUser();
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('open')) toggleSidebar();
        renderBoardList();
        renderColumns([]);
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

    list.innerHTML = myBoards.map(boardHtml).join('');
    sharedList.innerHTML = sharedBoards.map(boardHtml).join('');
}

async function selectBoard(id) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) toggleSidebar();
    AppState.currentBoardId = id;
    renderBoardList();
    loadBoardData();
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

async function loadBoardData() {
    if (!AppState.currentBoardId) return;
    try {
        const columns = await apiRequest(`/Kanban/GetBoard?boardId=${AppState.currentBoardId}`);
        renderColumns(columns.data);
        const currentBoard = AppState.boards.find(b => b.id === AppState.currentBoardId);
        if (currentBoard) {
            document.getElementById("boardHeader").style.display = "flex";
            document.getElementById("boardHeaderTitle").textContent = currentBoard.title;
        }
    } catch {
        Swal.fire('Error', 'Data could not be loaded', 'error');
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
        if (!res.success) throw new Error('Failed to load members');
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
                ? `<span style="width:80px; height:25px; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; display: inline-block; background-color: #805ad5; color: white;">👑 Owner</span>`
                : `<span style="width:80px; height:25px; padding: 4px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; display: inline-block; background-color: #e2e8f0; color: #4a5568; border: 1px solid #cbd5e0;">👤 Member</span>`;

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
            const response = await apiRequest('/Kanban/PromoteToOwner', {
                method: 'PUT',
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
            await apiRequest(`/Kanban/DeleteBoard?boardId=${boardId}`, { method: 'DELETE' });
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

    boardDiv.innerHTML = columns.map(col => `
        <div class="column">
            <div class="column-header">
                <span class="column-title">${escapeHtml(col.title)}</span>
                <span class="card-count">${col.cards.length}</span>
                <button class="btn btn-danger" onclick="deleteColumn(${col.id})">🗑️</button>
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
        return `
                        <div class="card" data-card-id="${card.id}" style="background-color: ${cardBgColor}; transition: background-color 0.3s;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span class="card-date">📅 ${new Date(card.dueDate).toLocaleDateString('tr-TR')}</span>
                                <span style="cursor:pointer" onclick="deleteCard(${card.id})">×</span>
                            </div>
                            <p style="font-size:12px; color:#333; margin-top:8px; font-weight: 500;">${escapeHtml(card.desc)}</p>
                        </div>
                    `;
    }).join('')}
            </div>
            <button class="btn btn-success" style="width:100%" onclick="openNewCardModal(${col.id})">+ Add Card</button>
        </div>
    `).join('');

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

            onStart: function () {
                if (boardElement && window.innerWidth < 768) {
                    boardElement.classList.add('is-dragging');
                }
            },

            onEnd: async function (evt) {
                if (boardElement) {
                    boardElement.classList.remove('is-dragging');
                }

                const cardId = evt.item.dataset.cardId;
                const newColumnId = evt.to.dataset.columnId;
                const newOrder = evt.newIndex + 1;

                if (evt.from === evt.to && evt.oldIndex === evt.newIndex) {
                    return;
                }

                try {
                    await apiRequest('/Kanban/MoveCard', {
                        method: 'POST',
                        body: JSON.stringify({ boardId: AppState.currentBoardId, cardId, newColumnId, newOrder })
                    });

                    loadBoardData();

                } catch (error) {
                    console.error(error);
                    Swal.fire('Hata', 'Kart taşınamadı, değişiklikler geri alınıyor...', 'error');
                    loadBoardData();
                }
            }
        });
    });
}

async function openNewColumnModal() {
    if (!checkAuth()) return;
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
            await apiRequest(`/Kanban/DeleteColumn?columnId=${id}`, { method: 'DELETE' });
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
            await apiRequest(`/Kanban/DeleteCard?cardId=${id}`, { method: 'DELETE' });
            loadBoardData();
        } catch {
            Swal.fire('Error', 'Failed to delete card', 'error');
        }
    }
}

async function openNewCardModal(columnId) {
    if (!checkAuth()) return;
    const today = new Date().toISOString().split('T')[0];
    const { value: formValues } = await Swal.fire({
        title: 'New Card',
        html: `
            <div style="text-align: left;">
                <label style="font-weight: bold; display: block; margin-bottom: 5px;">Description</label>
                <textarea id="swal-input-desc" class="swal2-textarea" style="width: 100%; margin: 0; box-sizing: border-box; resize: vertical; min-height: 80px;" placeholder="Enter description..."></textarea>
                
                <label style="font-weight: bold; display: block; margin-top: 15px; margin-bottom: 5px;">Due Date</label>
                <input type="date" id="swal-input-date" class="swal2-input" style="width: 100%; margin: 0; box-sizing: border-box;" value="${today}" min="${today}">
                
                <div style="margin-top: 15px; display: flex; align-items: center; gap: 8px;">
                    <input type="checkbox" id="swal-input-reminder" style="width: 18px; height: 18px; cursor: pointer;">
                    <label for="swal-input-reminder" style="font-weight: bold; cursor: pointer;">Show Warning Settings</label>
                </div>
                
                <div id="warning-area" style="display: none; margin-top: 10px; padding: 10px; background: #fff5f5; border: 1px dashed #feb2b2; border-radius: 8px;">
                    <p style="color: #c53030; font-size: 12px; margin-bottom: 10px;"><b>⚠️ Note:</b> The card will be highlighted based on your settings.</p>
                    <div style="display: flex; gap: 10px; align-items: flex-end;">
                        <div style="flex: 2;">
                            <label style="font-size: 12px; font-weight: bold; display: block;">Reminder Days</label>
                            <select id="swal-input-days" class="swal2-select" style="width: 100%; margin: 5px 0 0 0; font-size: 14px;">
                                <option value="1">1 Day Remaining</option>
                                <option value="3">3 Days Remaining</option>
                                <option value="7">1 Week Remaining</option>
                                <option value="14">2 Week Remaining</option>
                            </select>
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 12px; font-weight: bold; display: block;">Color</label>
                            <input type="color" id="swal-input-color" value="#ff0000" style="width: 100%; height: 38px; padding: 2px; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; margin-top: 5px;">
                        </div>
                    </div>
                </div>
            </div>
        `,
        didOpen: () => {
            const checkbox = document.getElementById('swal-input-reminder');
            const warningArea = document.getElementById('warning-area');
            checkbox.addEventListener('change', (e) => {
                warningArea.style.display = e.target.checked ? 'block' : 'none';
            });
        },
        focusConfirm: false,
        showCancelButton: true,
        confirmButtonText: 'Add Card',
        preConfirm: () => {
            const description = document.getElementById('swal-input-desc').value.trim();
            const dueDate = document.getElementById('swal-input-date').value;
            const hasWarning = document.getElementById('swal-input-reminder').checked;
            const warningDays = document.getElementById('swal-input-days').value;
            const highlightColor = document.getElementById('swal-input-color').value;

            if (!description) {
                Swal.showValidationMessage('Description is required');
                return false;
            }
            return { description, dueDate, hasWarning, warningDays, highlightColor };
        }
    });

    if (formValues) {
        try {
            await apiRequest('/Kanban/AddCard', {
                method: 'POST',
                body: JSON.stringify({
                    columnId,
                    description: formValues.description,
                    dueDate: formValues.dueDate,
                    warningDays: formValues.hasWarning ? formValues.warningDays : 0,
                    highlightColor: formValues.hasWarning ? formValues.highlightColor : ""
                })
            });
            loadBoardData();
        } catch {
            Swal.fire('Error', 'Failed to add card', 'error');
        }
    }
}

window.addEventListener('DOMContentLoaded', async () => {
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

function initAvatarSelector() {
    const container = document.getElementById('avatarSelectionArea');
    if (!container) return;

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
    try {
        await apiRequest('/Kanban/UpdateAvatar', {
            method: 'PUT',
            body: JSON.stringify({ avatar : selectedAvatarTemp })
        });

        if (AppState.currentUser) {
            AppState.currentUser.avatar = selectedAvatarTemp;
        }

        document.getElementById('avatarModal').classList.remove('active');

        updateAuthUI();

        Swal.fire({
            icon: 'success',
            title: 'Looks great!',
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 3000
        });

    } catch (e) {
        console.error(e);
        Swal.fire('Error', 'Could not save avatar', 'error');
    }
}
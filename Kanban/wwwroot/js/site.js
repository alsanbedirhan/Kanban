let IS_AUTHENTICATED = false;
let CURRENT_USER = null;
let currentBoardId = null;
let boards = [];

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

document.querySelectorAll(".toggle-password").forEach(btn => {
    btn.addEventListener("click", () => {
        const input = document.getElementById(btn.dataset.target);

        if (input.type === "password") {
            input.type = "text";
            btn.textContent = "🙊";
        } else {
            input.type = "password";
            btn.textContent = "🙈";
        }
    });
});

async function fetchCurrentUser() {
    try {
        const res = await apiRequest('/Home/Fetch');

        if (res.success) {
            IS_AUTHENTICATED = true;
            CURRENT_USER = res.data;
        } else {
            IS_AUTHENTICATED = false;
            CURRENT_USER = null;
        }
    } catch {
        IS_AUTHENTICATED = false;
        CURRENT_USER = null;
    }

    updateAuthUI();
}

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
            IS_AUTHENTICATED = false;
            CURRENT_USER = null;
            updateAuthUI();
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
            return await response.json();
        }
        return await response.text();
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
    finally {
        hideLoading();
    }
}

function checkAuth() {
    if (IS_AUTHENTICATED && CURRENT_USER) {
        return true;
    }
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
    if (IS_AUTHENTICATED && CURRENT_USER) {
        area.innerHTML = `<button class="btn btn-secondary" onclick="confirmLogout()">🔓</button>`;
        authSection.innerHTML = `
            <button class="btn btn-primary" style="width:100%; margin-bottom:10px;">${CURRENT_USER.fullName}</button>
            <button class="btn btn-secondary" style="width:100%" onclick="confirmLogout()">Logout</button>
        `;
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

function switchToRegister() {
    closeLoginModal();
    openRegisterModal();
}

function switchToLogin() {
    closeRegisterModal();
    openLoginModal();
}


function openLoginModal() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) toggleSidebar();
    document.getElementById('loginModal').classList.add('active');
}

function closeLoginModal() {
    document.getElementById('loginModal').classList.remove('active');
    document.getElementById('loginEmail').value = '';
    document.getElementById('loginPassword').value = '';
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
                text: `Hello ${CURRENT_USER.fullName}`,
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

function openRegisterModal() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) toggleSidebar();
    document.getElementById('registerModal').classList.add('active');
}

function closeRegisterModal() {
    document.getElementById('registerModal').classList.remove('active');
    document.getElementById('registerFullname').value = '';
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
    document.getElementById('registerConfirmPassword').value = '';
}

async function handleRegister() {
    const fullname = document.getElementById('registerFullname').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerConfirmPassword').value;

    if (!fullname || !email || !password || !confirmPassword)
        return Swal.fire('Error', 'Please fill all fields', 'error');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
        return Swal.fire('Error', 'Invalid email address', 'error');

    if (password.length < 6)
        return Swal.fire('Error', 'Password must be at least 6 characters', 'error');

    if (password !== confirmPassword)
        return Swal.fire('Error', 'Passwords do not match', 'error');

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

        while (!isRegistered) {

            const { value: otpCode, dismiss } = await Swal.fire({
                title: 'Email Verification',
                text: `A 6-digit code has been sent to ${email}.`,
                html: `
                <div id="otp-inputs" style="display: flex; justify-content: center; gap: 8px; margin-top: 20px;">
                ${[...Array(6)].map(() => `
                <input type="text" class="otp-field" maxlength="1" style="width: 45px; height: 55px; text-align: center;
                font-size: 24px; font-weight: bold; border: 2px solid #ddd; border-radius: 8px; outline: none; transition: all 0.2s;"
                onfocus="this.style.borderColor='#3085d6'; this.style.boxShadow='0 0 8px rgba(48,133,214,0.3)';"
                onblur="this.style.borderColor='#ddd'; this.style.boxShadow='none';"
                >`).join('')}
                </div>`,
                showCancelButton: true,
                confirmButtonText: 'Verify & Register',
                cancelButtonText: 'Cancel',
                didOpen: () => {
                    const container = document.getElementById('otp-inputs');
                    const inputs = container.querySelectorAll('.otp-field');

                    inputs[0].focus();

                    inputs.forEach((input, index) => {
                        input.addEventListener('input', (e) => {
                            const value = e.target.value;
                            if (!/^\d+$/.test(value)) {
                                e.target.value = '';
                                return;
                            }
                            if (value && index < inputs.length - 1) {
                                inputs[index + 1].focus();
                            }
                        });

                        input.addEventListener('keydown', (e) => {
                            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                                inputs[index - 1].focus();
                            }
                            else if (e.key === 'Enter') {
                                Swal.clickConfirm();
                            }
                        });

                        input.addEventListener('paste', (e) => {
                            const data = e.clipboardData.getData('text').trim();
                            if (data.length === 6 && /^\d+$/.test(data)) {
                                const digits = data.split('');
                                inputs.forEach((input, i) => input.value = digits[i]);
                                inputs[5].focus();
                                Swal.clickConfirm();
                            }
                            e.preventDefault();
                        });
                    });
                },
                preConfirm: () => {
                    const inputs = document.querySelectorAll('.otp-field');
                    let code = "";
                    inputs.forEach(input => code += input.value);

                    if (code.length !== 6) {
                        Swal.showValidationMessage('Please enter the complete 6-digit code');
                        return false;
                    }
                    return code;
                }
            });


            if (dismiss === Swal.DismissReason.cancel || dismiss === Swal.DismissReason.backdrop) {
                return;
            }

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
                    text: `Registration successful! Welcome ${fullname}`,
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
        if (result.isConfirmed) {
            handleLogout();
        }
    });
}

async function handleLogout() {
    try {
        await apiRequest('/Auth/Logout', { method: 'POST' });
        await fetchCurrentUser();
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('open')) toggleSidebar();
        boards = [];
        currentBoardId = null;
        renderBoardList();
        renderColumns([]);
        Swal.fire('Success', 'Logged out successfully', 'success');
    } catch {
        Swal.fire('Error', 'Logout failed', 'error');
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebarOverlay').classList.toggle('active');
    if (window.innerWidth > 768) document.body.classList.toggle('sidebar-open');
}

async function loadBoards() {
    try {
        const res = await apiRequest('/Kanban/GetBoards');
        boards = res.data;
        renderBoardList();
        if (boards.length > 0 && !currentBoardId) selectBoard(boards[0].id);
    } catch (e) {
        console.error('Failed to load boards:', e);
    }
}

function renderBoardList() {
    if (!document.getElementById("boardHeader").style.display !== "none") {
        document.getElementById("boardHeader").style.display = "none";
        document.getElementById("boardHeaderTitle").textContent = "";
    }

    const list = document.getElementById('boardList');
    const sharedList = document.getElementById('sharedBoardList');

    const myBoards = boards.filter(b => b.isOwner === true);
    const sharedBoards = boards.filter(b => b.isOwner === false);

    const boardHtml = (b) => `
        <li class="board-item ${b.id === currentBoardId ? 'active' : ''}" onclick="selectBoard(${b.id})">
            <span>📊 ${b.title}</span>
            <div class="board-actions-btn" onclick="event.stopPropagation(); showBoardMenu(${b.id}, '${b.title}')">⋮</div>
        </li>
    `;

    list.innerHTML = myBoards.map(boardHtml).join('');
    sharedList.innerHTML = sharedBoards.map(boardHtml).join('');
}

async function selectBoard(id) {
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('open')) toggleSidebar();

    currentBoardId = id;
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
    if (!currentBoardId) return;

    try {
        const columns = await apiRequest(`/Kanban/GetBoard?boardId=${currentBoardId}`);
        renderColumns(columns.data);
        document.getElementById("boardHeader").style.display = "flex";
        document.getElementById("boardHeaderTitle").textContent = boards.find(b => b.id === currentBoardId).title;
    } catch {
        Swal.fire('Error', 'Data could not be loaded', 'error');
    }
}

async function showBoardMenu(boardId, boardName) {
    if (!checkAuth()) return;

    const { value: action } = await Swal.fire({
        title: boardName,
        showCancelButton: true,
        confirmButtonText: 'Add User',
        confirmButtonColor: '#48bb78',
        cancelButtonText: 'Close',
        showDenyButton: true,
        denyButtonText: 'Delete Board',
        denyButtonColor: '#f56565'
    });

    if (action === true) addUserToBoard(boardId);
    else if (action === false) deleteBoard(boardId);
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
            if (response.success) {
                Swal.fire('Success', 'User invited to board!', 'success');
            }
            else {
                Swal.fire('Error', response.errorMessage, 'error');
            }
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
                <span class="column-title">${col.title}</span>
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
                        <p style="font-size:12px; color:#333; margin-top:8px; font-weight: 500;">${card.desc}</p>
                    </div>
                `}).join('')}
            </div>
            <button class="btn btn-success" style="width:100%" onclick="openNewCardModal(${col.id})">+ Add Card</button>
        </div>
    `).join('');

    initSortable();
}

function initSortable() {
    document.querySelectorAll('.cards-container').forEach(container => {
        Sortable.create(container, {
            group: 'kanban',
            animation: 150,
            onEnd: async function (evt) {
                const cardId = evt.item.dataset.cardId;
                const newColumnId = evt.to.dataset.columnId;
                const newOrder = evt.newIndex + 1;

                try {
                    await apiRequest('/Kanban/MoveCard', {
                        method: 'POST',
                        body: JSON.stringify({ boardId: currentBoardId, cardId, newColumnId, newOrder })
                    });
                } catch {
                    Swal.fire('Error', 'Card could not be moved', 'error');
                }

                loadBoardData();
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
                body: JSON.stringify({ boardId: currentBoardId, title })
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

//async function openNewCardModal(columnId) {
//    if (!checkAuth()) return;
//    const { value: description } = await Swal.fire({
//        title: 'Description',
//        input: 'textarea',
//        inputPlaceholder: 'Enter description ...',
//        confirmButtonText: 'Add',
//        showCancelButton: true
//    });
//    if (description) {
//        try {
//            await apiRequest('/Kanban/AddCard', {
//                method: 'POST',
//                body: JSON.stringify({ columnId, description })
//            });
//            loadBoardData();
//        } catch {
//            Swal.fire('Error', 'Failed to add card', 'error');
//        }
//    }
//}

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

window.addEventListener('DOMContentLoaded', async () => {
    await fetchCurrentUser();
    if (IS_AUTHENTICATED && CURRENT_USER) loadBoards();
});
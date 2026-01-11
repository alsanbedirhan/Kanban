let IS_AUTHENTICATED = false;
let CURRENT_USER = null;
let currentBoardId = null;
let currentColumnId = null;
let boards = [];

function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

async function fetchCurrentUser() {
    try {
        const res = await apiRequest('/Home/Fetch');

        if (res.success) {
            IS_AUTHENTICATED = true;
            CURRENT_USER = res.user;
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

function getAntiForgeryToken() {
    const tokenInput = document.querySelector('input[name="__RequestVerificationToken"]');
    return tokenInput ? tokenInput.value : '';
}

async function apiRequest(endpoint, options = {}) {
    showLoading();
    try {
        const token = getAntiForgeryToken();

        const response = await fetch(endpoint, {
            headers: {
                'Content-Type': 'application/json',
                'RequestVerificationToken': token,
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
            const json = await response.json();
            if (json.success === false) {
                throw new Error(`API error: ${json.errorMessage}`);
            }
            return json;
        }

        throw new Error('Unexpected');
    } catch (error) {
        console.error('Error:', error);
        throw error;
    }
    finally {
        hideLoading();
    }
}

function checkAuth() {
    if (!IS_AUTHENTICATED) {
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
    return true;
}

function updateAuthUI() {
    const authSection = document.getElementById('authSection');
    if (IS_AUTHENTICATED && CURRENT_USER) {
        authSection.innerHTML = `
            <button class="btn btn-primary" style="width:100%; margin-bottom:10px;">${CURRENT_USER.fullName}</button>
            <button class="btn btn-secondary" style="width:100%" onclick="handleLogout()">Logout</button>
        `;
    } else {
        authSection.innerHTML = `
            <button class="btn btn-primary" style="width:100%; margin-bottom:10px;" onclick="openLoginModal()">Login</button>
            <button class="btn btn-secondary" style="width:100%" onclick="openRegisterModal()">Register</button>
        `;
    }
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

    if (!/[A-Z]/.test(password))
        return Swal.fire('Error', 'Password must contain at least one uppercase letter (A-Z)', 'error');

    if (!/[a-z]/.test(password))
        return Swal.fire('Error', 'Password must contain at least one lowercase letter (a-z)', 'error');

    if (!/[0-9]/.test(password))
        return Swal.fire('Error', 'Password must contain at least one number (0-9)', 'error');

    if (!/[!@#$%^&*(),.?:{}|<>]/.test(password))
        return Swal.fire('Error', 'Password must contain at least one special character (!, @, #, $, %, etc.)', 'error');

    try {
        const response = await apiRequest('/Auth/Register', {
            method: 'POST',
            body: JSON.stringify({ fullname, email, password })
        });

        if (response.success) {
            await fetchCurrentUser();
            closeRegisterModal();
            Swal.fire({
                title: 'Welcome!',
                text: `Registration successful! Welcome ${CURRENT_USER.fullName}`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
            loadBoards();
        } else {
            Swal.fire('Error', response.message || 'Registration failed', 'error');
        }
    } catch {
        Swal.fire('Error', 'Registration failed.', 'error');
    }
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
        boards = await apiRequest('/Kanban/GetBoards');
        renderBoardList();
        if (boards.length > 0 && !currentBoardId) selectBoard(boards[0].id);
    } catch (e) {
        console.error('Failed to load boards:', e);
    }
}

function renderBoardList() {
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
    sharedList.innerHTML = sharedBoards.length > 0
        ? sharedBoards.map(boardHtml).join('')
        : '<p style="padding:10px 20px; font-size:12px; color:#999;">No shared boards</p>';
}

async function selectBoard(id) {
    currentBoardId = id;
    renderBoardList();
    loadBoardData();
}

async function openNewBoardModal() {
    if (!checkAuth()) return;
    const { value: name } = await Swal.fire({
        title: 'New Board Name',
        input: 'text',
        inputPlaceholder: 'Enter board name...',
        showCancelButton: true
    });
    if (name) {
        try {
            await apiRequest('/Kanban/CreateBoard', {
                method: 'POST',
                body: JSON.stringify({ name })
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
    const boardDiv = document.getElementById('board');
    boardDiv.innerHTML = '<p style="color:white">Loading...</p>';

    try {
        const columns = await apiRequest(`/Kanban/GetBoard/${currentBoardId}`);
        renderColumns(columns);
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
            await apiRequest('/Kanban/AddUserToBoard', {
                method: 'POST',
                body: JSON.stringify({ boardId, email })
            });
            Swal.fire('Success', 'User added to board!', 'success');
        } catch {
            Swal.fire('Error', 'Could not add user.', 'error');
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
            await apiRequest(`/Kanban/DeleteBoard/${boardId}`, { method: 'DELETE' });
            Swal.fire('Deleted!', 'Board has been deleted.', 'success');
            loadBoards();
        } catch {
            Swal.fire('Error', 'Failed to delete board', 'error');
        }
    }
}

function renderColumns(columns) {
    const boardDiv = document.getElementById('board');
    boardDiv.innerHTML = columns.map(col => `
        <div class="column">
            <div class="column-header">
                <span class="column-title">${col.name}</span>
                <span class="card-count">${col.cards.length}</span>
                <button class="btn btn-danger" onclick="deleteColumn(${col.id})">🗑️</button>
            </div>
            <div class="cards-container" data-column-id="${col.id}">
                ${col.cards.map((card) => `
                    <div class="card" data-card-id="${card.id}">
                        <div style="display:flex; justify-content:space-between;">
                            <b>${card.title}</b>
                            <span style="cursor:pointer" onclick="deleteCard(${card.id})">×</span>
                        </div>
                        <p style="font-size:12px; color:#666; margin-top:5px;">${card.description || ''}</p>
                    </div>
                `).join('')}
            </div>
            <button class="btn btn-success" style="width:100%" onclick="openCardModal(${col.id})">+ Add Card</button>
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
                const newOrder = evt.newIndex;

                try {
                    await apiRequest('/Kanban/MoveCard', {
                        method: 'POST',
                        body: JSON.stringify({ cardId, newColumnId, newOrder })
                    });
                } catch {
                    Swal.fire('Error', 'Card could not be moved', 'error');
                }

                loadBoardData();
            }
        });
    });
}

function openColumnModal() {
    if (checkAuth()) document.getElementById('columnModal').classList.add('active');
}

function closeColumnModal() {
    document.getElementById('columnModal').classList.remove('active');
}

async function addColumn() {
    const name = document.getElementById('columnName').value.trim();
    if (!name) return Swal.fire('Warning', 'Name cannot be empty', 'warning');

    try {
        await apiRequest('/Kanban/AddColumn', {
            method: 'POST',
            body: JSON.stringify({ boardId: currentBoardId, name })
        });
        closeColumnModal();
        loadBoardData();
        Swal.fire({ toast: true, position: 'top-end', icon: 'success', title: 'Column added', showConfirmButton: false, timer: 1500 });
    } catch {
        Swal.fire('Error', 'Failed to add column', 'error');
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
            await apiRequest(`/Kanban/DeleteColumn/${id}`, { method: 'DELETE' });
            loadBoardData();
        } catch {
            Swal.fire('Error', 'Failed to delete column', 'error');
        }
    }
}

function openCardModal(id) {
    if (checkAuth()) {
        currentColumnId = id;
        document.getElementById('cardModal').classList.add('active');
    }
}

function closeCardModal() {
    document.getElementById('cardModal').classList.remove('active');
}

async function addCard() {
    const description = document.getElementById('cardDescription').value.trim();
    if (!description) return Swal.fire('Error', 'Description is required', 'error');

    try {
        await apiRequest('/Kanban/AddCard', {
            method: 'POST',
            body: JSON.stringify({ columnId: currentColumnId, title: description, description })
        });
        closeCardModal();
        loadBoardData();
    } catch {
        Swal.fire('Error', 'Failed to add card', 'error');
    }
}

async function deleteCard(id) {
    if (!checkAuth()) return;
    try {
        await apiRequest(`/Kanban/DeleteCard/${id}`, { method: 'DELETE' });
        loadBoardData();
    } catch {
        Swal.fire('Error', 'Failed to delete card', 'error');
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    await fetchCurrentUser();
    if (IS_AUTHENTICATED) loadBoards();
});
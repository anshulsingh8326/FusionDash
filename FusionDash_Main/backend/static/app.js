// --- STATE ---
let allServices = [];
let boards = [];
let activeBoardId = localStorage.getItem('fusion_active_board') || 'default';
let currentView = 'board';
let currentEditingId = null;

// --- DOM CACHE ---
const dom = {
    layout: document.getElementById('main-layout'),
    sidebar: document.getElementById('sidebar'),
    boardList: document.getElementById('board-list'),
    boardView: document.getElementById('board-view'),
    libraryView: document.getElementById('library-view'),
    pageTitle: document.getElementById('page-title'),
    wallpaperLayer: document.getElementById('wallpaper-layer'),
    wallpaperOverlay: document.getElementById('wallpaper-overlay'),
    addBtnText: document.getElementById('add-btn-text'),
    
    // Modals
    boardModal: document.getElementById('board-modal'),
    pickerModal: document.getElementById('app-picker-modal'),
    globalModal: document.getElementById('global-settings-modal'),
    editorSide: document.getElementById('editor-side'),
    overlay: document.getElementById('overlay'),
    
    // Inputs
    bInputs: {
        name: document.getElementById('b-name'),
        wallpaper: document.getElementById('b-wallpaper'),
        blur: document.getElementById('b-blur'),
        opacity: document.getElementById('b-opacity'),
        fit: document.getElementById('b-fit'),
        cardSize: document.getElementById('b-cardsize'),
        align: document.getElementById('b-align')
    },
    sInputs: {
        name: document.getElementById('e-name'),
        group: document.getElementById('e-group'),
        href: document.getElementById('e-href'),
        icon: document.getElementById('e-icon')
    }
};

// --- INIT ---
async function init() {
    loadLocalState();
    renderSidebar();

    try {
        const res = await fetch("/api/init");
        if(res.ok) {
            const data = await res.json();
            allServices = data.services || [];
            allServices.sort((a, b) => (a.order || 100) - (b.order || 100));
            
            updateLibraryStats();
            
            // Initial View Render
            if(currentView === 'board') switchBoard(activeBoardId);
            else renderLibrary();
        }
    } catch(e) { console.error("Backend fetch failed", e); }
}

function loadLocalState() {
    const saved = localStorage.getItem('fusion_boards');
    if(saved) {
        boards = JSON.parse(saved);
        // Migration: Ensure 'items' array exists
        boards.forEach(b => { if(!b.items) b.items = []; });
    } else {
        // DEFAULT: Empty board
        boards = [{
            id: 'default',
            name: 'Home',
            settings: { wallpaper: '', blur: 0, opacity: 0.5, fit: 'cover', cardSize: 'medium' },
            items: [] 
        }];
    }
}

// --- VIEW LOGIC ---

window.switchBoard = function(boardId) {
    const board = boards.find(b => b.id === boardId);
    if(!board) return switchBoard(boards[0].id);

    activeBoardId = board.id;
    currentView = 'board';
    localStorage.setItem('fusion_active_board', activeBoardId);

    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const btn = document.querySelector(`.board-btn[data-id="${boardId}"]`);
    if(btn) btn.classList.add('active');

    dom.boardView.classList.remove('hidden');
    dom.libraryView.classList.add('hidden');
    dom.pageTitle.innerText = board.name;
    dom.addBtnText.innerText = "Add App";

    applyBoardSettings(board.settings);
    renderBoard();
};

function applyBoardSettings(s) {
    if(!s) return;
    dom.wallpaperLayer.style.backgroundImage = s.wallpaper ? `url('${s.wallpaper}')` : 'none';
    dom.wallpaperLayer.style.backgroundSize = s.fit || 'cover';
    dom.wallpaperLayer.style.filter = `blur(${s.blur || 0}px)`;
    dom.wallpaperOverlay.style.opacity = s.opacity || 0.5;
    
    // Reset classes
    dom.boardView.className = 'view-container';
    if(s.align === 'center') dom.boardView.classList.add('align-center');
}

// --- RENDERERS ---

function renderSidebar() {
    dom.boardList.innerHTML = '';
    boards.forEach(b => {
        const btn = document.createElement('button');
        btn.className = `nav-item board-btn ${b.id === activeBoardId && currentView === 'board' ? 'active' : ''}`;
        btn.dataset.id = b.id;
        btn.innerHTML = `<i class="ph ph-layout"></i> <span>${b.name}</span>`;
        btn.onclick = () => switchBoard(b.id);
        dom.boardList.appendChild(btn);
    });
}

function renderBoard() {
    dom.boardView.innerHTML = '';
    const board = boards.find(b => b.id === activeBoardId);
    const term = document.getElementById("search").value.toLowerCase();

    // Map IDs to Objects
    let visible = [];
    if (board.items && board.items.length > 0) {
        visible = board.items
            .map(id => allServices.find(s => s.id === id))
            .filter(s => s !== undefined);
    }

    if(term) visible = visible.filter(s => s.name.toLowerCase().includes(term));

    const groups = [...new Set(visible.map(s => s.group || "General"))].sort();

    groups.forEach(groupName => {
        const section = document.createElement('div');
        section.className = 'board-section';
        const gridClass = `grid-${board.settings.cardSize || 'medium'}`;
        
        section.innerHTML = `
            <div class="section-header"><h4 class="section-title">${groupName}</h4></div>
            <div class="section-grid ${gridClass}"></div>
        `;
        
        const grid = section.querySelector('.section-grid');
        // Drag-and-drop init
        new Sortable(grid, { group: 'shared', animation: 150 });

        visible.filter(s => (s.group || "General") === groupName).forEach(s => {
            grid.appendChild(createCard(s));
        });
        
        dom.boardView.appendChild(section);
    });
    
    // Empty State
    if(visible.length === 0 && !term) {
        dom.boardView.innerHTML = `
            <div style="text-align:center; padding-top:100px; color:#666;">
                <i class="ph ph-squares-four" style="font-size:48px; margin-bottom:10px;"></i>
                <p>Board is empty</p>
                <button onclick="openAppPicker()" class="btn btn-primary" style="margin-top:10px; width:auto;">
                    Add App from Library
                </button>
            </div>
        `;
    }
}

function renderLibrary() {
    dom.libraryView.classList.remove('hidden');
    dom.boardView.classList.add('hidden');
    dom.pageTitle.innerText = "App Library";
    dom.addBtnText.innerText = "New Service";
    
    dom.wallpaperLayer.style.filter = "blur(10px)";

    const grid = document.getElementById("library-grid");
    grid.innerHTML = '';
    const term = document.getElementById("search").value.toLowerCase();

    allServices.forEach(s => {
        if(term && !s.name.toLowerCase().includes(term)) return;
        grid.appendChild(createCard(s, true));
    });
}

function createCard(service, isCompact = false) {
    const card = document.createElement('div');
    card.className = "card"; // CSS handles sizing based on parent grid
    
    let iconHTML = `<i class="ph ph-cube" style="font-size:32px;"></i>`;
    if(service.icon) {
        iconHTML = `<img src="${service.icon}" onerror="this.style.display='none'">`;
        if(!service.icon.includes('/') && !service.icon.includes('.')) {
             const url = `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${service.icon.toLowerCase()}.png`;
             iconHTML = `<img src="${url}" onerror="this.src='https://unpkg.com/@phosphor-icons/core/assets/duotone/cube-duotone.svg'">`;
        }
    }

    card.innerHTML = `
        <div class="status-dot js-status-${service.id}"></div>
        ${iconHTML}
        <div class="card-name">${service.name}</div>
        <div class="edit-trigger" onclick="window.editService('${service.id}', event)">
            <i class="ph-bold ph-dots-three-vertical"></i>
        </div>
    `;

    card.onclick = (e) => {
        if(e.target.closest('.edit-trigger')) return;
        if(service.href) window.open(service.href, '_blank');
    };

    setTimeout(() => checkStatus(service.id, service.href), 100);
    return card;
}

// --- PICKER (ADD APP) ---
window.openAppPicker = function() {
    const board = boards.find(b => b.id === activeBoardId);
    const pickerList = document.getElementById('picker-list');
    pickerList.innerHTML = '';
    
    // Filter apps NOT on this board
    const available = allServices.filter(s => !board.items.includes(s.id));
    
    available.forEach(s => {
        const item = document.createElement('div');
        item.className = 'picker-item';
        
        let iconSrc = s.icon;
        if(s.icon && !s.icon.includes('/') && !s.icon.includes('.')) {
            iconSrc = `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${s.icon.toLowerCase()}.png`;
        }
        
        item.innerHTML = `
            <img src="${iconSrc}" onerror="this.style.display='none'">
            <span>${s.name}</span>
        `;
        
        item.onclick = () => {
            board.items.push(s.id);
            saveBoards();
            renderBoard();
            closeModals();
        };
        
        pickerList.appendChild(item);
    });
    
    if(available.length === 0) {
        pickerList.innerHTML = '<div style="grid-column:1/-1; color:#666; text-align:center;">All library apps are already here.</div>';
    }

    dom.overlay.classList.add('active');
    dom.pickerModal.classList.add('active');
};

document.getElementById('btn-create-new').onclick = () => {
    closeModals();
    openEditor(null);
};


// --- SETTINGS & EDITING ---
window.editService = function(id, e) {
    if(e) e.stopPropagation();
    const service = allServices.find(s => s.id === id);
    if(!service) return;

    currentEditingId = id;
    dom.sInputs.name.value = service.name;
    dom.sInputs.group.value = service.group || "General";
    dom.sInputs.href.value = service.href;
    dom.sInputs.icon.value = service.icon || "";

    const delBtn = document.getElementById('delete-service-btn');
    if(currentView === 'board') {
        delBtn.innerText = "Remove from Board";
        delBtn.classList.remove('btn-danger');
        delBtn.classList.add('btn-secondary');
    } else {
        delBtn.innerText = "Uninstall Service";
        delBtn.classList.add('btn-danger');
        delBtn.classList.remove('btn-secondary');
    }

    dom.overlay.classList.add('active');
    dom.editorSide.classList.add('active');
};

document.getElementById('delete-service-btn').onclick = async () => {
    if(!currentEditingId) return;
    
    if(currentView === 'board') {
        const board = boards.find(b => b.id === activeBoardId);
        board.items = board.items.filter(id => id !== currentEditingId);
        saveBoards();
        renderBoard();
        closeModals();
    } else {
        if(!confirm("Permanently uninstall this service?")) return;
        boards.forEach(b => {
            if(b.items) b.items = b.items.filter(id => id !== currentEditingId);
        });
        saveBoards();
        await fetch(`/api/services/${currentEditingId}/hide`, { method: "POST" });
        closeModals();
        init();
    }
};

document.getElementById('save-service-btn').onclick = async () => {
    const payload = {
        name: dom.sInputs.name.value,
        group: dom.sInputs.group.value,
        href: dom.sInputs.href.value,
        icon: dom.sInputs.icon.value,
        pinned: true
    };
    
    const url = currentEditingId 
        ? `/api/services/${currentEditingId}/update`
        : `/api/services/add_manual`;

    await fetch(url, { method: "POST", body: JSON.stringify(payload), headers: {'Content-Type': 'application/json'} });
    closeModals();
    init();
};

function saveBoards() {
    localStorage.setItem('fusion_boards', JSON.stringify(boards));
}

// --- GLOBAL SETTINGS ---
document.getElementById('nav-settings').onclick = () => {
    dom.overlay.classList.add('active');
    dom.globalModal.classList.add('active');
};

document.getElementById('btn-hard-reset').onclick = () => {
    if(confirm("Are you sure? This will delete all boards.")) {
        localStorage.removeItem('fusion_boards');
        localStorage.removeItem('fusion_active_board');
        location.reload();
    }
};

// --- EVENT LISTENERS ---
document.getElementById('add-service-btn').onclick = () => {
    if(currentView === 'board') openAppPicker();
    else openEditor(null);
};

function openEditor(serviceId) {
    currentEditingId = serviceId;
    dom.sInputs.name.value = "";
    dom.sInputs.href.value = "http://";
    dom.overlay.classList.add('active');
    dom.editorSide.classList.add('active');
}

document.getElementById('sidebar-toggle').onclick = () => dom.sidebar.classList.toggle('collapsed');
document.getElementById('nav-library').onclick = () => {
    currentView = 'library';
    renderLibrary();
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('nav-library').classList.add('active');
};

// Close Handlers
function closeModals() {
    document.querySelectorAll('.modal, #editor-side, #overlay').forEach(el => el.classList.remove('active', 'open', 'visible'));
}
dom.overlay.onclick = closeModals;
document.querySelectorAll('.close-modal').forEach(b => b.onclick = closeModals);
document.getElementById('close-editor').onclick = closeModals;

// Board Settings
document.getElementById('board-settings-btn').onclick = () => {
    const board = boards.find(b => b.id === activeBoardId);
    dom.bInputs.name.value = board.name;
    const s = board.settings;
    dom.bInputs.wallpaper.value = s.wallpaper;
    dom.bInputs.align.value = s.align;
    dom.bInputs.cardSize.value = s.cardSize;
    dom.bInputs.blur.value = s.blur;
    dom.bInputs.opacity.value = s.opacity;
    dom.bInputs.fit.value = s.fit;
    dom.overlay.classList.add('active');
    dom.boardModal.classList.add('active');
};

document.getElementById('save-board-btn').onclick = () => {
    const board = boards.find(b => b.id === activeBoardId);
    board.name = dom.bInputs.name.value;
    board.settings.wallpaper = dom.bInputs.wallpaper.value;
    board.settings.align = dom.bInputs.align.value;
    board.settings.cardSize = dom.bInputs.cardSize.value;
    board.settings.blur = dom.bInputs.blur.value;
    board.settings.opacity = dom.bInputs.opacity.value;
    board.settings.fit = dom.bInputs.fit.value;
    
    saveBoards();
    switchBoard(activeBoardId);
    closeModals();
};

document.getElementById('create-board-btn').onclick = () => {
    const newId = 'b_' + Date.now();
    boards.push({ 
        id: newId, 
        name: 'New Board', 
        settings: { cardSize: 'medium' }, 
        items: [] 
    });
    saveBoards();
    renderSidebar();
    switchBoard(newId);
};

document.getElementById('delete-board-btn').onclick = () => {
    if(boards.length <= 1) return alert("Cannot delete the only board.");
    if(!confirm("Delete this board?")) return;
    boards = boards.filter(b => b.id !== activeBoardId);
    saveBoards();
    switchBoard(boards[0].id);
    renderSidebar();
    closeModals();
};

// Search
document.getElementById('search').oninput = () => {
    if(currentView === 'board') renderBoard();
    else renderLibrary();
};

// Status Utils
async function checkStatus(id, url) {
    const dots = document.querySelectorAll(`.js-status-${id}`);
    if(!url || dots.length === 0) return;
    try {
        const res = await fetch(`/api/status/ping?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        dots.forEach(d => {
            d.className = `status-dot js-status-${id} ${data.status === 'online' ? 'online' : 'offline'}`;
        });
    } catch(e) {}
}

function updateLibraryStats() {
     const el = document.getElementById('total-count');
     if(el) el.innerText = allServices.length;
}

init();
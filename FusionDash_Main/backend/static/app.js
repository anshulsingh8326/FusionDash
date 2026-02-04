// --- STATE ---
let State = {
    services: [],
    boards: [],
    prefs: {},
    activeBoardId: 'default',
    currentView: 'board', 
    statusTracker: {},
    editingSectionId: null,
    editingServiceId: null
};

// --- INIT ---
async function init() {
    loadLocalData();
    applyTheme(State.prefs);
    
    // Auto Collapse Sidebar Check
    if(window.innerWidth > 768 && State.prefs.autoCollapse) {
        document.getElementById('sidebar').classList.add('collapsed');
    }

    Render.renderSidebar(State.boards, State.activeBoardId);
    setupEventListeners();

    try {
        const res = await fetch("/api/init");
        if(res.ok) {
            const data = await res.json();
            State.services = data.services || [];
            State.services.sort((a, b) => (a.order || 100) - (b.order || 100));
            updateCounts();
            
            // ROUTING: Check URL for board ID
            const params = new URLSearchParams(window.location.search);
            const urlBoard = params.get('board');
            if(urlBoard && State.boards.find(b => b.id === urlBoard)) {
                State.activeBoardId = urlBoard;
            } else {
                // Fallback to localstorage or default
                const savedId = localStorage.getItem('fusion_active_board');
                if(savedId && State.boards.find(b => b.id === savedId)) State.activeBoardId = savedId;
            }

            if (State.currentView === 'board') window.switchBoard(State.activeBoardId);
            else renderLibrary();

            startPings();
        }
    } catch(e) { console.error("Init failed", e); }
}

function loadLocalData() {
    const savedBoards = localStorage.getItem('fusion_boards');
    if (savedBoards) {
        State.boards = JSON.parse(savedBoards);
        // Migration
        State.boards.forEach(b => {
            if (!b.sections) {
                b.sections = [];
                if (b.items && b.items.length > 0) b.sections.push({ id: 'sec_def', title: 'Main', items: b.items });
                delete b.items;
            }
        });
    } else {
        State.boards = [{ 
            id: 'default', name: 'Home', 
            sections: [{ id: 's1', title: 'General', items: [] }],
            settings: { cardSize: 'medium', style: 'standard' } 
        }];
    }
    const savedPrefs = localStorage.getItem('fusion_prefs');
    State.prefs = savedPrefs ? JSON.parse(savedPrefs) : { accent: '#007cff', autoCollapse: false };
}

// --- GLOBAL ACTIONS ---

window.switchBoard = (id) => {
    const board = State.boards.find(b => b.id === id);
    if (!board) return;

    State.activeBoardId = id;
    State.currentView = 'board';
    localStorage.setItem('fusion_active_board', id);

    // Update URL without reloading
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('board', id);
    window.history.pushState({}, '', newUrl);

    document.getElementById('board-view').classList.remove('hidden');
    document.getElementById('library-view').classList.add('hidden');
    document.getElementById('header-add-section-btn').classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('page-title').innerText = board.name;
    
    // Pass current search term to render
    const searchTerm = document.getElementById('search').value.toLowerCase();
    
    Render.renderSidebar(State.boards, id);
    applyBoardTheme(board.settings);
    Render.renderBoard(board, State.services, board.settings, searchTerm);
    
    // IMMEDIATELY restore status colors
    reapplyStatus();
};

window.addSection = () => {
    const board = State.boards.find(b => b.id === State.activeBoardId);
    const newSec = { id: `sec_${Date.now()}`, title: "New Section", items: [] };
    board.sections.push(newSec);
    saveBoards();
    window.switchBoard(State.activeBoardId);
};

window.editSection = (id) => {
    State.editingSectionId = id;
    const board = State.boards.find(b => b.id === State.activeBoardId);
    const sec = board.sections.find(s => s.id === id);
    if(!sec) return;
    document.getElementById('sec-title').value = sec.title;
    openModal('section-modal');
};

window.editService = (id, e) => {
    if(e) e.stopPropagation();
    State.editingServiceId = id;
    const service = State.services.find(s => s.id === id);
    if(!service) return;

    document.getElementById('e-name').value = service.name;
    document.getElementById('e-source').value = service.displaySource || service.source || 'docker'; // Load Source
    document.getElementById('e-group').value = service.group || "General";
    document.getElementById('e-href').value = service.href;
    document.getElementById('e-icon').value = service.icon || "";
    document.getElementById('e-widget').value = service.widgetType || "";
    document.getElementById('e-apikey').value = service.apiKey || "";

    const delBtn = document.getElementById('delete-service-btn');
    if(State.currentView === 'board') {
        delBtn.innerText = "Remove from Board";
        delBtn.className = 'btn btn-secondary';
    } else {
        delBtn.innerText = "Uninstall Service";
        delBtn.className = 'btn btn-danger';
    }

    document.getElementById('overlay').classList.add('active');
    document.getElementById('editor-side').classList.add('active');
};

window.handleDragEnd = (evt) => {
    const board = State.boards.find(b => b.id === State.activeBoardId);
    const sectionDivs = document.querySelectorAll('.board-section');
    board.sections.forEach(sec => {
        const domSec = [...sectionDivs].find(d => d.dataset.id === sec.id);
        if (domSec) {
            const grid = domSec.querySelector('.section-grid');
            const newItems = [...grid.children].map(c => c.dataset.id);
            sec.items = newItems;
        }
    });
    saveBoards();
};

let currentPickerSectionId = null;

window.openAppPicker = (sectionId) => {
    currentPickerSectionId = sectionId;
    const board = State.boards.find(b => b.id === State.activeBoardId);
    const section = board.sections.find(s => s.id === sectionId);
    
    const onBoardIds = board.sections.flatMap(s => s.items);
    const available = State.services.filter(s => !onBoardIds.includes(s.id));

    const list = document.getElementById('picker-list');
    list.innerHTML = '';
    document.getElementById('picker-target-msg').innerText = `Adding to: ${section.title}`;

    available.forEach(s => {
        const item = document.createElement('div');
        item.className = 'picker-item';
        item.innerHTML = `${Render.getIcon(s)}<span>${s.name}</span>`;
        item.onclick = () => {
            section.items.push(s.id);
            saveBoards();
            window.switchBoard(State.activeBoardId);
            closeModals();
        };
        list.appendChild(item);
    });

    const btnWidget = document.getElementById('btn-add-status-widget');
    if (onBoardIds.includes('builtin_status_summary')) {
        btnWidget.classList.add('hidden');
    } else {
        btnWidget.classList.remove('hidden');
        btnWidget.onclick = () => {
            section.items.unshift('builtin_status_summary');
            saveBoards();
            window.switchBoard(State.activeBoardId);
            closeModals();
        };
    }
    openModal('app-picker-modal');
};

window.removeWidget = (id) => {
    if(!confirm("Remove widget?")) return;
    const board = State.boards.find(b => b.id === State.activeBoardId);
    board.sections.forEach(s => { s.items = s.items.filter(i => i !== id); });
    saveBoards();
    window.switchBoard(State.activeBoardId);
};

// --- LISTENERS ---
function setupEventListeners() {
    document.getElementById('sidebar-toggle').onclick = () => {
        const sb = document.getElementById('sidebar');
        if(window.innerWidth <= 768) sb.classList.toggle('mobile-open');
        else sb.classList.toggle('collapsed');
    };

    document.getElementById('create-board-btn').onclick = () => {
        const newId = 'b_' + Date.now();
        State.boards.push({ 
            id: newId, name: 'New Board', 
            sections: [{id: 's1', title: 'Main', items: []}], 
            settings: { cardSize: 'medium' } 
        });
        saveBoards();
        Render.renderSidebar(State.boards, State.activeBoardId);
        window.switchBoard(newId);
    };

    document.getElementById('nav-library').onclick = () => {
        State.currentView = 'library';
        renderLibrary();
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.getElementById('nav-library').classList.add('active');
    };

    document.getElementById('nav-settings').onclick = () => {
        document.getElementById('g-appname').value = State.prefs.appName || 'FusionDash';
        document.getElementById('g-logo').value = State.prefs.logo || '';
        document.getElementById('g-accent').value = State.prefs.accent || '#007cff';
        document.getElementById('g-side-opacity').value = State.prefs.sideOpacity || 0.85;
        document.getElementById('g-autocollapse').checked = State.prefs.autoCollapse || false; // Set checked state
        openModal('global-settings-modal');
    };

    document.getElementById('header-add-section-btn').onclick = window.addSection;
    
    document.getElementById('board-settings-btn').onclick = () => {
        const board = State.boards.find(b => b.id === State.activeBoardId);
        document.getElementById('b-name').value = board.name;
        document.getElementById('b-wallpaper').value = board.settings.wallpaper || '';
        document.getElementById('b-blur').value = board.settings.blur || 0;
        document.getElementById('b-opacity').value = board.settings.opacity || 0.5;
        document.getElementById('b-style').value = board.settings.style || 'standard';
        document.getElementById('b-cardsize').value = board.settings.cardSize || 'medium';
        document.getElementById('b-align').value = board.settings.align || 'left';
        document.getElementById('b-fit').value = board.settings.fit || 'cover';
        openModal('board-modal');
    };

    // SEARCH LISTENER FIX
    document.getElementById('search').oninput = () => {
        if(State.currentView === 'board') window.switchBoard(State.activeBoardId);
        else renderLibrary();
    };

    document.getElementById('overlay').onclick = closeModals;
    document.querySelectorAll('.close-modal').forEach(b => b.onclick = closeModals);
    document.getElementById('close-editor').onclick = closeModals;

    document.getElementById('save-board-btn').onclick = () => {
        const board = State.boards.find(b => b.id === State.activeBoardId);
        board.name = document.getElementById('b-name').value;
        board.settings.wallpaper = document.getElementById('b-wallpaper').value;
        board.settings.blur = document.getElementById('b-blur').value;
        board.settings.opacity = document.getElementById('b-opacity').value;
        board.settings.style = document.getElementById('b-style').value;
        board.settings.cardSize = document.getElementById('b-cardsize').value;
        board.settings.align = document.getElementById('b-align').value;
        board.settings.fit = document.getElementById('b-fit').value;
        saveBoards();
        window.switchBoard(State.activeBoardId);
        closeModals();
    };
    
    document.getElementById('delete-board-btn').onclick = () => {
        if(State.boards.length <= 1) return alert("Cannot delete last board");
        if(!confirm("Delete this board?")) return;
        State.boards = State.boards.filter(b => b.id !== State.activeBoardId);
        saveBoards();
        window.switchBoard(State.boards[0].id);
        closeModals();
    };

    document.getElementById('save-section-btn').onclick = () => {
        const board = State.boards.find(b => b.id === State.activeBoardId);
        const sec = board.sections.find(s => s.id === State.editingSectionId);
        if(sec) {
            sec.title = document.getElementById('sec-title').value;
            saveBoards();
            window.switchBoard(State.activeBoardId);
        }
        closeModals();
    };

    document.getElementById('delete-section-btn').onclick = () => {
        if(!confirm("Delete section?")) return;
        const board = State.boards.find(b => b.id === State.activeBoardId);
        board.sections = board.sections.filter(s => s.id !== State.editingSectionId);
        saveBoards();
        window.switchBoard(State.activeBoardId);
        closeModals();
    };

    document.getElementById('save-global-btn').onclick = () => {
        State.prefs.appName = document.getElementById('g-appname').value;
        State.prefs.logo = document.getElementById('g-logo').value;
        State.prefs.accent = document.getElementById('g-accent').value;
        State.prefs.sideOpacity = document.getElementById('g-side-opacity').value;
        State.prefs.autoCollapse = document.getElementById('g-autocollapse').checked;
        localStorage.setItem('fusion_prefs', JSON.stringify(State.prefs));
        applyTheme(State.prefs);
        closeModals();
        location.reload(); 
    };
    
    document.getElementById('btn-hard-reset').onclick = () => {
        if(confirm("Factory Reset?")) { localStorage.clear(); location.reload(); }
    };

    document.getElementById('btn-create-new').onclick = () => {
        closeModals();
        State.editingServiceId = null;
        document.getElementById('e-name').value = "";
        document.getElementById('e-source').value = "web"; // Default
        document.getElementById('e-group').value = "";
        document.getElementById('e-href').value = "";
        document.getElementById('e-icon').value = "";
        document.getElementById('e-widget').value = "";
        document.getElementById('e-apikey').value = "";
        document.getElementById('overlay').classList.add('active');
        document.getElementById('editor-side').classList.add('active');
    };

    document.getElementById('save-service-btn').onclick = async () => {
        const payload = {
            name: document.getElementById('e-name').value,
            displaySource: document.getElementById('e-source').value, // SAVE SOURCE
            group: document.getElementById('e-group').value,
            href: document.getElementById('e-href').value,
            icon: document.getElementById('e-icon').value,
            widgetType: document.getElementById('e-widget').value,
            apiKey: document.getElementById('e-apikey').value
        };
        
        const url = State.editingServiceId 
            ? `/api/services/${State.editingServiceId}/update` 
            : `/api/services/add_manual`;
            
        await fetch(url, { method: "POST", body: JSON.stringify(payload), headers: {'Content-Type': 'application/json'} });
        
        if (!State.editingServiceId && currentPickerSectionId) {
             // If this was a new add, force reload to get ID then manual push logic (simplified: full reload)
             location.reload(); 
        } else {
            closeModals();
            init();
        }
    };

    document.getElementById('delete-service-btn').onclick = async () => {
        if(State.currentView === 'board') {
            const board = State.boards.find(b => b.id === State.activeBoardId);
            board.sections.forEach(s => { s.items = s.items.filter(id => id !== State.editingServiceId); });
            saveBoards();
            window.switchBoard(State.activeBoardId);
        } else {
            if(!confirm("Permanently uninstall?")) return;
            State.boards.forEach(b => {
                b.sections.forEach(s => { s.items = s.items.filter(id => id !== State.editingServiceId); });
            });
            saveBoards();
            await fetch(`/api/services/${State.editingServiceId}/hide`, { method: "POST" });
            init();
        }
        closeModals();
    };
}

// --- LOGIC ---

function renderLibrary() {
    document.getElementById('library-view').classList.remove('hidden');
    document.getElementById('board-view').classList.add('hidden');
    document.getElementById('page-title').innerText = "App Library";
    document.getElementById('header-add-section-btn').classList.add('hidden');

    const grid = document.getElementById("library-grid");
    grid.innerHTML = '';
    const term = document.getElementById("search").value.toLowerCase();

    State.services.forEach(s => {
        if(term && !s.name.toLowerCase().includes(term)) return;
        const card = Render.createCard(s);
        card.draggable = false;
        grid.appendChild(card);
    });
    
    // Also reapply status in library view
    reapplyStatus();
}

async function startPings() {
    for (const service of State.services) {
        checkServiceStatus(service);
        setInterval(() => checkServiceStatus(service), 60000); 
    }
}

async function checkServiceStatus(service) {
    if (service.source === 'docker' && service.state !== 'running') {
        updateStatusUI(service.id, false);
        return;
    }
    if (service.href) {
        try {
            const res = await fetch(`/api/status/ping?url=${encodeURIComponent(service.href)}`);
            const data = await res.json();
            updateStatusUI(service.id, data.status === 'online');
            if(data.status === 'online' && service.widgetType) fetchApiData(service);
        } catch { updateStatusUI(service.id, false); }
    }
}

function updateStatusUI(id, isOnline) {
    State.statusTracker[id] = isOnline ? 'online' : 'offline';
    // Update live DOM elements
    document.querySelectorAll(`.js-status-${id}`).forEach(el => {
        el.className = `status-dot js-status-${id} ${isOnline ? 'online' : 'offline'}`;
    });
    updateWidgetUI();
}

// NEW: Function to re-paint status colors on view change
function reapplyStatus() {
    Object.keys(State.statusTracker).forEach(id => {
        const status = State.statusTracker[id];
        const cls = status === 'online' ? 'online' : 'offline';
        document.querySelectorAll(`.js-status-${id}`).forEach(el => {
            el.className = `status-dot js-status-${id} ${cls}`;
        });
    });
    updateWidgetUI();
}

function updateWidgetUI() {
    const widgetDots = document.querySelector('.status-dots-row .loading-dots');
    if(widgetDots) {
        const online = Object.values(State.statusTracker).filter(s => s === 'online').length;
        widgetDots.innerText = `${online} / ${State.services.length} Services Online`;
        widgetDots.style.color = '#fff';
    }
}

async function fetchApiData(service) {
    const el = document.getElementById(`widget-${service.id}`);
    if(!el) return;
    if(service.widgetType === 'arr_queue') {
        try {
            const res = await fetch(`/api/integration/arr/queue?url=${encodeURIComponent(service.href)}&api_key=${service.apiKey}`);
            const data = await res.json();
            const content = el.querySelector('.api-content');
            el.classList.remove('hidden');
            if (data.count > 0) {
                content.innerText = `${data.count} Active Downloads`;
                content.style.color = '#4facfe';
            } else {
                content.innerText = "Queue Idle";
                content.style.color = '#666';
            }
        } catch(e) {}
    }
}

function saveBoards() { localStorage.setItem('fusion_boards', JSON.stringify(State.boards)); }
function openModal(id) { document.getElementById('overlay').classList.add('active'); document.getElementById(id).classList.add('active'); }
function closeModals() { document.querySelectorAll('.modal, #editor-side, #overlay').forEach(el => el.classList.remove('active')); }
function updateCounts() { const el = document.getElementById('total-count'); if(el) el.innerText = State.services.length; }

function applyTheme(p) { 
    document.documentElement.style.setProperty('--accent', p.accent || '#007cff'); 
    document.documentElement.style.setProperty('--glass', `rgba(18,18,24,${p.sideOpacity||0.85})`);
    if(p.appName) document.getElementById('brand-text').innerText = p.appName;
}

function applyBoardTheme(s) {
    if(!s) return;
    const bg = document.getElementById('wallpaper-layer');
    bg.style.backgroundImage = s.wallpaper ? `url('${s.wallpaper}')` : 'none';
    // FIX: Force cover if not set
    bg.style.backgroundSize = s.fit || 'cover';
    bg.style.filter = `blur(${s.blur||0}px)`;
    document.getElementById('wallpaper-overlay').style.opacity = s.opacity || 0.5;
}

init();
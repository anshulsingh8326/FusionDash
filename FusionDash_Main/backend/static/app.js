// --- STATE MANAGEMENT ---
let allServices = [];
let boards = [];
let prefs = {};
let activeBoardId = localStorage.getItem('fusion_active_board') || 'default';
let currentView = 'board';
let currentEditingId = null;

// Track active status for summary box
let statusTracker = {};

// --- DOM CACHE ---
const dom = {
    layout: document.getElementById('main-layout'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebar-toggle'),
    brandText: document.getElementById('brand-text'),
    brandLogo: document.getElementById('brand-logo'),
    
    boardList: document.getElementById('board-list'),
    boardView: document.getElementById('board-view'),
    libraryView: document.getElementById('library-view'),
    statusBar: document.getElementById('status-bar'), // New
    pageTitle: document.getElementById('page-title'),
    addBtnText: document.getElementById('add-btn-text'),
    
    wallpaperLayer: document.getElementById('wallpaper-layer'),
    wallpaperOverlay: document.getElementById('wallpaper-overlay'),
    
    // Modals & Overlays
    boardModal: document.getElementById('board-modal'),
    pickerModal: document.getElementById('app-picker-modal'),
    globalModal: document.getElementById('global-settings-modal'),
    editorSide: document.getElementById('editor-side'),
    overlay: document.getElementById('overlay'),
    
    // Inputs (Board)
    bInputs: {
        name: document.getElementById('b-name'),
        wallpaper: document.getElementById('b-wallpaper'),
        blur: document.getElementById('b-blur'),
        opacity: document.getElementById('b-opacity'),
        fit: document.getElementById('b-fit'),
        cardSize: document.getElementById('b-cardsize'),
        align: document.getElementById('b-align'),
        style: document.getElementById('b-style')
    },
    // Inputs (Service)
    sInputs: {
        name: document.getElementById('e-name'),
        group: document.getElementById('e-group'),
        href: document.getElementById('e-href'),
        icon: document.getElementById('e-icon'),
        widget: document.getElementById('e-widget'),
        apikey: document.getElementById('e-apikey')
    },
    // Inputs (Global)
    gInputs: {
        appname: document.getElementById('g-appname'),
        logo: document.getElementById('g-logo'),
        accent: document.getElementById('g-accent'),
        sideOpacity: document.getElementById('g-side-opacity'),
        autoCollapse: document.getElementById('g-autocollapse')
    }
};

// --- INIT ---
async function init() {
    loadLocalState();
    applyPreferences();
    renderSidebar();

    try {
        const res = await fetch("/api/init");
        if(res.ok) {
            const data = await res.json();
            allServices = data.services || [];
            allServices.sort((a, b) => (a.order || 100) - (b.order || 100));
            
            updateLibraryStats();
            renderStatusSummary(); // Init summary box
            
            if(currentView === 'board') switchBoard(activeBoardId);
            else renderLibrary();
        }
    } catch(e) { console.error("Backend fetch failed", e); }
}

function loadLocalState() {
    const savedBoards = localStorage.getItem('fusion_boards');
    if(savedBoards) {
        boards = JSON.parse(savedBoards);
        boards.forEach(b => { if(!b.items) b.items = []; });
    } else {
        boards = [{
            id: 'default',
            name: 'Home',
            settings: { wallpaper: '', blur: 0, opacity: 0.5, fit: 'cover', cardSize: 'medium', style: 'standard' },
            items: [] 
        }];
    }

    const savedPrefs = localStorage.getItem('fusion_prefs');
    if(savedPrefs) {
        prefs = JSON.parse(savedPrefs);
    } else {
        prefs = { appName: 'FusionDash', logo: 'ph-hexagon', accent: '#007cff', sideOpacity: 0.85, autoCollapse: false };
    }
}

// --- PREFERENCES ---
function applyPreferences() {
    dom.brandText.innerText = prefs.appName || 'FusionDash';
    
    if(prefs.logo && (prefs.logo.includes('/') || prefs.logo.includes('.'))) {
        dom.brandLogo.className = '';
        dom.brandLogo.innerHTML = `<img src="${prefs.logo}" style="width:24px; height:24px; object-fit:contain;">`;
    } else {
        dom.brandLogo.innerHTML = '';
        dom.brandLogo.className = `ph-fill ${prefs.logo || 'ph-hexagon'}`;
    }

    const root = document.documentElement;
    root.style.setProperty('--accent', prefs.accent || '#007cff');
    root.style.setProperty('--glass', `rgba(18, 18, 24, ${prefs.sideOpacity || 0.85})`);

    // Only auto-collapse on desktop
    if(window.innerWidth > 768 && prefs.autoCollapse && !dom.sidebar.classList.contains('collapsed')) {
        dom.sidebar.classList.add('collapsed');
    }
}

function savePreferences() {
    localStorage.setItem('fusion_prefs', JSON.stringify(prefs));
    applyPreferences();
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

function renderStatusSummary() {
    // Categorize services
    const summary = {};
    
    allServices.forEach(s => {
        // Use source (docker/manual) or create "Web" if manual
        let type = s.source === 'docker' ? 'Docker' : 'Web/Apps';
        if (!summary[type]) summary[type] = { total: 0, online: 0, offline: 0 };
        
        summary[type].total++;
        
        // Check current tracker state
        const state = statusTracker[s.id];
        if (state === 'online') summary[type].online++;
        else if (state === 'offline') summary[type].offline++;
    });

    dom.statusBar.innerHTML = '';
    
    Object.keys(summary).forEach(type => {
        const data = summary[type];
        const icon = type === 'Docker' ? 'ph-docker-logo' : 'ph-globe';
        
        const html = `
            <div class="status-pill">
                <i class="ph ${icon}"></i>
                <span>${type}</span>
                <div class="status-counts">
                    <span title="Online" class="count-online">● ${data.online}</span>
                    <span title="Offline" class="count-offline">● ${data.offline}</span>
                    <span title="Total" style="color:#666">/ ${data.total}</span>
                </div>
            </div>
        `;
        dom.statusBar.innerHTML += html;
    });
}

function renderBoard() {
    dom.boardView.innerHTML = '';
    const board = boards.find(b => b.id === activeBoardId);
    
    if(!document.getElementById('mobile-overlay')) {
        const mo = document.createElement('div');
        mo.id = 'mobile-overlay';
        mo.onclick = () => {
            dom.sidebar.classList.remove('mobile-open');
            mo.classList.remove('active');
        };
        document.body.appendChild(mo);
    }

    dom.boardView.className = 'view-container'; 
    if(board.settings.style) dom.boardView.classList.add(`style-${board.settings.style}`);
    if(board.settings.align === 'center') dom.boardView.classList.add('align-center');

    const term = document.getElementById("search").value.toLowerCase();
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
        new Sortable(grid, { group: 'shared', animation: 150 });

        visible.filter(s => (s.group || "General") === groupName).forEach(s => {
            grid.appendChild(createCard(s));
        });
        dom.boardView.appendChild(section);
    });

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
    card.className = "card";
    
    let iconHTML = `<i class="ph ph-cube" style="font-size:32px;"></i>`;
    if(service.icon) {
        iconHTML = `<img src="${service.icon}" onerror="this.style.display='none'">`;
        if(!service.icon.includes('/') && !service.icon.includes('.')) {
             const url = `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${service.icon.toLowerCase()}.png`;
             iconHTML = `<img src="${url}" onerror="this.src='https://unpkg.com/@phosphor-icons/core/assets/duotone/cube-duotone.svg'">`;
        }
    }

    const widgetHtml = `<div id="widget-${service.id}" class="widget-data"></div>`;

    card.innerHTML = `
        <div class="status-dot js-status-${service.id}"></div>
        ${iconHTML}
        <div class="card-name">${service.name}</div>
        ${widgetHtml}
        <div class="edit-trigger" onclick="window.editService('${service.id}', event)">
            <i class="ph-bold ph-dots-three-vertical"></i>
        </div>
    `;

    card.onclick = (e) => {
        if(e.target.closest('.edit-trigger')) return;
        if(service.href) window.open(service.href, '_blank');
    };

    setTimeout(() => {
        checkStatus(service.id, service.href, service.state);
        if(service.widgetType && service.apiKey) {
            fetchWidgetData(service);
        }
    }, 100);

    return card;
}

// --- WIDGETS ---
async function fetchWidgetData(service) {
    const el = document.getElementById(`widget-${service.id}`);
    if(!el) return;

    if(service.widgetType === 'arr_queue') {
        try {
            const res = await fetch(`/api/integration/arr/queue?url=${encodeURIComponent(service.href)}&api_key=${service.apiKey}`);
            const data = await res.json();
            
            if(data.count > 0) {
                el.innerText = `${data.count} Active`;
                el.style.color = "#4facfe";
            } else {
                el.innerText = "Idle";
                el.style.color = "#888";
            }
            el.classList.add('active');
        } catch(e) {
            console.log("Widget Error", e);
        }
    }
}

// --- APP PICKER ---
window.openAppPicker = function() {
    const board = boards.find(b => b.id === activeBoardId);
    const pickerList = document.getElementById('picker-list');
    pickerList.innerHTML = '';
    const available = allServices.filter(s => !board.items.includes(s.id));
    
    available.forEach(s => {
        const item = document.createElement('div');
        item.className = 'picker-item';
        let iconSrc = s.icon;
        if(s.icon && !s.icon.includes('/') && !s.icon.includes('.')) {
            iconSrc = `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${s.icon.toLowerCase()}.png`;
        }
        item.innerHTML = `<img src="${iconSrc}" onerror="this.style.display='none'"><span>${s.name}</span>`;
        item.onclick = () => {
            board.items.push(s.id);
            saveBoards();
            renderBoard();
            closeModals();
        };
        pickerList.appendChild(item);
    });
    
    if(available.length === 0) {
        pickerList.innerHTML = '<div style="grid-column:1/-1; color:#666; text-align:center;">All apps are already on this board.</div>';
    }
    dom.overlay.classList.add('active');
    dom.pickerModal.classList.add('active');
};
document.getElementById('btn-create-new').onclick = () => { closeModals(); openEditor(null); };

// --- EDITOR LOGIC ---
window.editService = function(id, e) {
    if(e) e.stopPropagation();
    
    const service = allServices.find(s => s.id === id);
    if(!service) { console.error("Service not found"); return; }

    currentEditingId = id;
    
    // Reset Fields
    dom.sInputs.name.value = "";
    dom.sInputs.href.value = "";
    dom.sInputs.apikey.value = "";

    // Populate
    dom.sInputs.name.value = service.name;
    dom.sInputs.group.value = service.group || "General";
    dom.sInputs.href.value = service.href;
    dom.sInputs.icon.value = service.icon || "";
    dom.sInputs.widget.value = service.widgetType || "";
    dom.sInputs.apikey.value = service.apiKey || "";

    const delBtn = document.getElementById('delete-service-btn');
    if(currentView === 'board') {
        delBtn.innerText = "Remove from Board";
        delBtn.className = 'btn btn-secondary';
    } else {
        delBtn.innerText = "Uninstall Service";
        delBtn.className = 'btn btn-danger';
    }

    dom.overlay.classList.add('active');
    dom.editorSide.classList.add('active');
};

document.getElementById('save-service-btn').onclick = async () => {
    const payload = {
        name: dom.sInputs.name.value,
        group: dom.sInputs.group.value,
        href: dom.sInputs.href.value,
        icon: dom.sInputs.icon.value,
        widgetType: dom.sInputs.widget.value,
        apiKey: dom.sInputs.apikey.value,
        pinned: true
    };
    
    const url = currentEditingId ? `/api/services/${currentEditingId}/update` : `/api/services/add_manual`;
    await fetch(url, { method: "POST", body: JSON.stringify(payload), headers: {'Content-Type': 'application/json'} });
    closeModals();
    init();
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
        if(!confirm("Permanently uninstall?")) return;
        boards.forEach(b => { if(b.items) b.items = b.items.filter(id => id !== currentEditingId); });
        saveBoards();
        await fetch(`/api/services/${currentEditingId}/hide`, { method: "POST" });
        closeModals();
        init();
    }
};

function saveBoards() { localStorage.setItem('fusion_boards', JSON.stringify(boards)); }

// --- GLOBAL SETTINGS ---
document.getElementById('nav-settings').onclick = () => {
    dom.gInputs.appname.value = prefs.appName || '';
    dom.gInputs.logo.value = prefs.logo || '';
    dom.gInputs.accent.value = prefs.accent || '#007cff';
    dom.gInputs.sideOpacity.value = prefs.sideOpacity || 0.85;
    dom.gInputs.autoCollapse.checked = prefs.autoCollapse || false;
    dom.overlay.classList.add('active');
    dom.globalModal.classList.add('active');
};
document.getElementById('save-global-btn').onclick = () => {
    prefs.appName = dom.gInputs.appname.value;
    prefs.logo = dom.gInputs.logo.value;
    prefs.accent = dom.gInputs.accent.value;
    prefs.sideOpacity = dom.gInputs.sideOpacity.value;
    prefs.autoCollapse = dom.gInputs.autoCollapse.checked;
    savePreferences(); closeModals();
};
document.getElementById('btn-hard-reset').onclick = () => {
    if(confirm("Reset everything?")) { localStorage.clear(); location.reload(); }
};

// --- EVENT LISTENERS ---
document.getElementById('sidebar-toggle').onclick = () => {
    if(window.innerWidth <= 768) {
        dom.sidebar.classList.toggle('mobile-open');
        const mo = document.getElementById('mobile-overlay');
        if(mo) mo.classList.toggle('active');
    } else {
        dom.sidebar.classList.toggle('collapsed');
    }
};

document.getElementById('add-service-btn').onclick = () => {
    if(currentView === 'board') openAppPicker(); else { openEditor(null); }
};
document.getElementById('nav-library').onclick = () => {
    currentView = 'library'; renderLibrary();
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.getElementById('nav-library').classList.add('active');
};
function closeModals() {
    document.querySelectorAll('.modal, #editor-side, #overlay').forEach(el => el.classList.remove('active', 'open', 'visible'));
}
dom.overlay.onclick = closeModals;
document.querySelectorAll('.close-modal').forEach(b => b.onclick = closeModals);
document.getElementById('close-editor').onclick = closeModals;

document.getElementById('board-settings-btn').onclick = () => {
    const board = boards.find(b => b.id === activeBoardId);
    dom.bInputs.name.value = board.name;
    const s = board.settings;
    dom.bInputs.wallpaper.value = s.wallpaper;
    dom.bInputs.align.value = s.align;
    dom.bInputs.cardSize.value = s.cardSize;
    dom.bInputs.style.value = s.style || 'standard';
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
    board.settings.style = dom.bInputs.style.value;
    board.settings.blur = dom.bInputs.blur.value;
    board.settings.opacity = dom.bInputs.opacity.value;
    board.settings.fit = dom.bInputs.fit.value;
    saveBoards(); switchBoard(activeBoardId); closeModals();
};
document.getElementById('create-board-btn').onclick = () => {
    const newId = 'b_' + Date.now();
    boards.push({ id: newId, name: 'New Board', settings: { cardSize: 'medium' }, items: [] });
    saveBoards(); renderSidebar(); switchBoard(newId);
};
document.getElementById('delete-board-btn').onclick = () => {
    if(boards.length <= 1) return alert("Cannot delete only board");
    if(!confirm("Delete board?")) return;
    boards = boards.filter(b => b.id !== activeBoardId);
    saveBoards(); switchBoard(boards[0].id); renderSidebar(); closeModals();
};
document.getElementById('search').oninput = () => { if(currentView === 'board') renderBoard(); else renderLibrary(); };

async function checkStatus(id, url, dockerState) {
    const dots = document.querySelectorAll(`.js-status-${id}`);
    if(dots.length === 0) return;
    
    let isOnline = false;

    // Fast check: If Docker says it's not running, it's offline.
    if(dockerState && dockerState !== 'running') {
        isOnline = false;
    } else if(url) {
        try {
            const res = await fetch(`/api/status/ping?url=${encodeURIComponent(url)}`);
            const data = await res.json();
            isOnline = (data.status === 'online');
        } catch(e) {}
    }

    dots.forEach(d => { 
        d.className = `status-dot js-status-${id} ${isOnline ? 'online' : 'offline'}`; 
    });

    // Update global tracker
    statusTracker[id] = isOnline ? 'online' : 'offline';
    
    // Refresh summary box
    renderStatusSummary();
}
function updateLibraryStats() { const el = document.getElementById('total-count'); if(el) el.innerText = allServices.length; }

init();
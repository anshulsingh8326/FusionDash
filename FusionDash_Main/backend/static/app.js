let allServices = [];
let currentView = 'board'; 
let currentEditingId = null;

// --- INIT ---
async function init() {
    try {
        const res = await fetch("/api/init");
        if (!res.ok) throw new Error("API Failed");
        const data = await res.json();
        
        applyTheme(data.theme);
        
        allServices = data.services || [];
        allServices.sort((a, b) => (a.order || 100) - (b.order || 100));
        
        updateLibraryStats();

        if(currentView === 'board') renderBoard();
        else renderLibrary();

    } catch (e) {
        console.error("Init Error:", e);
    }
}

function applyTheme(theme) {
    if(!theme) return;
    const root = document.documentElement;
    if(theme.wallpaper) {
        document.body.style.backgroundImage = `url('${theme.wallpaper}')`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
    }
    if(theme.accent) root.style.setProperty('--accent', theme.accent);
    if(theme.glass) root.style.setProperty('--glass-opacity', theme.glass);
    
    // Fill Settings Modal
    const wInput = document.getElementById("s-wallpaper");
    if(wInput) {
        wInput.value = theme.wallpaper || "";
        document.getElementById("s-accent").value = theme.accent || "#007cff";
        document.getElementById("s-glass").value = theme.glass || 0.7;
    }
}

// --- VIEW SWITCHING ---
window.switchView = function(viewName) {
    currentView = viewName;
    document.getElementById("board-view").classList.add("hidden");
    document.getElementById("library-view").classList.add("hidden");
    
    document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
    
    if (viewName === 'board') {
        document.getElementById("board-view").classList.remove("hidden");
        document.getElementById("page-title").innerText = "Main Board";
        document.querySelector("#board-nav .nav-item").classList.add("active");
        renderBoard();
    } else {
        document.getElementById("library-view").classList.remove("hidden");
        document.getElementById("page-title").innerText = "App Library";
        document.querySelector("#library-nav .nav-item").classList.add("active");
        renderLibrary();
    }
}

// --- RENDER BOARD (Pinned Items Only) ---
function renderBoard() {
    const container = document.getElementById("board-view");
    container.innerHTML = "";
    
    const term = document.getElementById("search").value.toLowerCase();

    // FILTER: Must be PINNED (default true) + Search Term
    const visibleApps = allServices.filter(s => {
        if (s.pinned === false) return false; // Hide unpinned items from board
        if (term && !s.name.toLowerCase().includes(term)) return false;
        return true;
    });

    const groups = [...new Set(visibleApps.map(s => s.group || "Unsorted"))].sort();

    groups.forEach(groupName => {
        const groupApps = visibleApps.filter(s => (s.group || "Unsorted") === groupName);
        if (groupApps.length === 0) return;

        const section = document.createElement("section");
        section.className = "board-section";
        section.innerHTML = `<h3 class="section-title">${groupName}</h3>`;
        
        const grid = document.createElement("div");
        grid.className = "section-grid";
        
        groupApps.forEach(service => {
            const card = createCard(service);
            grid.appendChild(card);
            checkStatus(service.id, service.href);
            if(service.apiKey) fetchArrStats(service.id, service.href, service.apiKey);
        });

        section.appendChild(grid);
        container.appendChild(section);
    });
}

// --- RENDER LIBRARY (Everything) ---
function renderLibrary() {
    const grid = document.getElementById("library-grid");
    grid.innerHTML = "";
    
    const term = document.getElementById("search").value.toLowerCase();

    allServices.forEach(service => {
        if (term && !service.name.toLowerCase().includes(term)) return;

        // Pass 'true' for compact mode
        const card = createCard(service, true);
        grid.appendChild(card);
    });
}

function createCard(service, isCompact = false) {
    const card = document.createElement("div");
    card.className = isCompact ? "card compact" : "card";
    card.dataset.id = service.id;
    
    // Dim card if unpinned in Library view
    if (isCompact && service.pinned === false) {
        card.style.opacity = "0.6";
    }

    const iconHtml = getIconHtml(service.icon, service.name);
    
    // Pin indicator for Library view
    const pinIndicator = (isCompact && service.pinned !== false) 
        ? `<i class="ph-fill ph-push-pin" style="position:absolute; top:5px; left:5px; color:var(--accent); font-size:12px;"></i>` 
        : '';

    card.innerHTML = `
        ${pinIndicator}
        <div class="status-dot" id="status-${service.id}"></div>
        <div class="icon-box">${iconHtml}</div>
        <div class="info">
            <div class="name" title="${service.name}">${service.name}</div>
            ${!isCompact ? `<div class="group">${service.group || 'Apps'}</div>` : ''}
            <div class="stats" id="stats-${service.id}"></div>
        </div>
        <button class="edit-btn"><i class="ph ph-dots-three-vertical"></i></button>
    `;

    card.onclick = () => { if(service.href) window.open(service.href, "_blank"); };
    
    const editBtn = card.querySelector(".edit-btn");
    editBtn.onclick = (e) => {
        e.stopPropagation();
        openEditor(service);
    };

    return card;
}

function updateLibraryStats() {
    document.getElementById("total-count").innerText = allServices.length;
    const pinnedCount = allServices.filter(s => s.pinned !== false).length;
    document.getElementById("arr-count").innerText = pinnedCount; // Re-purposed to "Pinned"
    document.getElementById("arr-label").innerText = "Pinned Apps";
}

// --- HELPERS ---
function getIconHtml(iconStr, appName) {
    if (iconStr && (iconStr.includes("/") || iconStr.includes(".") || iconStr.startsWith("http"))) {
        return `<img src="${iconStr}" alt="${appName}" onerror="this.style.display='none'">`;
    }
    const name = appName ? appName.toLowerCase() : "";
    if (!iconStr) {
        if (name.includes("sonarr")) return "📺";
        if (name.includes("radarr")) return "🎬";
        if (name.includes("prowlarr")) return "🔍";
        if (name.includes("lidarr")) return "🎵";
        if (name.includes("transmission") || name.includes("qbit")) return "📥";
        if (name.includes("plex") || name.includes("jellyfin")) return "🍿";
        if (name.includes("portainer")) return "🐳";
        return "📦";
    }
    return `<span style="font-size: 32px;">${iconStr}</span>`;
}

async function checkStatus(id, url) {
    if(!url || url === "#") {
        const d = document.getElementById(`status-${id}`);
        if(d) d.style.display = 'none';
        return;
    }
    const dot = document.getElementById(`status-${id}`);
    if(!dot) return;

    try {
        const res = await fetch(`/api/status/ping?url=${encodeURIComponent(url)}&_=${Date.now()}`);
        const data = await res.json();
        if (data.status === "online") {
            dot.className = "status-dot online";
        } else {
            dot.className = "status-dot offline";
        }
    } catch {
        dot.className = "status-dot offline";
    }
}

async function fetchArrStats(id, url, key) {
    const statsDiv = document.getElementById(`stats-${id}`);
    if(!statsDiv) return;
    try {
        const res = await fetch(`/api/integration/arr/queue?url=${encodeURIComponent(url)}&api_key=${key}`);
        const data = await res.json();
        if(data.count > 0) {
            statsDiv.innerHTML = `<span class="badge">${data.count} Active</span>`;
        }
    } catch(e) {}
}

// --- MODALS ---
function openEditor(service) {
    if(!service) {
        // Add New
        currentEditingId = null;
        document.getElementById("e-name").value = "";
        document.getElementById("e-group").value = "Unsorted";
        document.getElementById("e-href").value = "http://";
        document.getElementById("e-icon").value = "";
        document.getElementById("e-apikey").value = "";
        // Hide Pin/Hide buttons for new creation
        document.getElementById("pin-btn").style.display = "none";
        document.getElementById("hide-btn").style.display = "none";
    } else {
        // Edit Existing
        currentEditingId = service.id;
        document.getElementById("e-name").value = service.name;
        document.getElementById("e-group").value = service.group || "";
        document.getElementById("e-href").value = service.href;
        document.getElementById("e-icon").value = service.icon || "";
        document.getElementById("e-apikey").value = service.apiKey || "";

        // Toggle Pin Button Text
        const pinBtn = document.getElementById("pin-btn");
        pinBtn.style.display = "block";
        if (service.pinned === false) {
            pinBtn.innerText = "📌 Pin to Board";
            pinBtn.classList.remove("btn-danger");
            pinBtn.classList.add("btn-secondary");
        } else {
            pinBtn.innerText = "❌ Unpin from Board";
            pinBtn.classList.add("btn-danger");
            pinBtn.classList.remove("btn-secondary");
        }
        
        document.getElementById("hide-btn").style.display = "block";
    }
    document.getElementById("editor-side").classList.add("open");
    document.getElementById("overlay").classList.add("visible");
}

function closeOverlays() {
    document.getElementById("editor-side").classList.remove("open");
    document.getElementById("settings-modal").classList.remove("active");
    document.getElementById("overlay").classList.remove("visible");
}

// --- EVENTS ---

// SAVE
document.getElementById("save-btn").onclick = async () => {
    const data = {
        name: document.getElementById("e-name").value,
        group: document.getElementById("e-group").value,
        href: document.getElementById("e-href").value,
        icon: document.getElementById("e-icon").value,
        apiKey: document.getElementById("e-apikey").value
    };
    const url = currentEditingId ? `/api/services/${currentEditingId}/update` : `/api/services/add_manual`;
    await fetch(url, { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
    closeOverlays();
    init();
};

// PIN / UNPIN TOGGLE
document.getElementById("pin-btn").onclick = async () => {
    if(!currentEditingId) return;
    const service = allServices.find(s => s.id === currentEditingId);
    const newStatus = service.pinned === false ? true : false;
    
    // We send Name + Pinned Status
    const data = { 
        name: service.name, 
        pinned: newStatus 
    };
    
    await fetch(`/api/services/${currentEditingId}/update`, { 
        method: "POST", 
        body: JSON.stringify(data), 
        headers: { "Content-Type": "application/json" } 
    });
    
    closeOverlays();
    init();
};

// RESET BUTTON LOGIC
const resetBtn = document.getElementById("reset-btn");
if(resetBtn) {
    resetBtn.onclick = async () => {
        if(confirm("⚠ WARNING: This will delete ALL settings.\n\n- All manual apps will be deleted.\n- All custom names/icons will be lost.\n- Hidden apps will reappear.\n\nAre you sure?")) {
            try {
                await fetch("/api/settings/reset", { method: "POST" });
                // Force reload to clear cache and fetch fresh defaults
                window.location.reload();
            } catch(e) {
                alert("Reset failed: " + e);
            }
        }
    };
}

// GLOBAL HIDE (Uninstall)
document.getElementById("hide-btn").onclick = async () => {
    if(!currentEditingId) return;
    if(!confirm("Permanently hide this app from Library and Board? (Like uninstalling)")) return;
    
    await fetch(`/api/services/${currentEditingId}/hide`, { method: "POST" });
    closeOverlays();
    init();
};

document.getElementById("add-manual").onclick = () => openEditor(null);
document.getElementById("search").oninput = () => {
    if(currentView === 'board') renderBoard();
    else renderLibrary();
};
document.getElementById("open-settings").onclick = () => {
    document.getElementById("settings-modal").classList.add("active");
    document.getElementById("overlay").classList.add("visible");
};
document.getElementById("save-theme-btn").onclick = async () => {
    const data = {
        wallpaper: document.getElementById("s-wallpaper").value,
        accent: document.getElementById("s-accent").value,
        glass: document.getElementById("s-glass").value
    };
    await fetch("/api/settings/theme", { method: "POST", body: JSON.stringify(data), headers: { "Content-Type": "application/json" } });
    applyTheme(data);
    closeOverlays();
};
document.getElementById("overlay").onclick = closeOverlays;
document.getElementById("close-settings").onclick = closeOverlays;

init();
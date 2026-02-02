let allServices = [];
let currentEditingId = null;

// --- INITIALIZATION ---
async function init() {
    try {
        const res = await fetch("/api/init");
        if (!res.ok) throw new Error("API Failed");
        
        const data = await res.json();
        
        // 1. Apply Theme first so it looks good immediately
        applyTheme(data.theme);
        
        // 2. Store Data
        allServices = data.services || [];
        allServices.sort((a, b) => (a.order || 100) - (b.order || 100));
        
        // 3. Render UI
        renderCategories();
        renderGrid("all");

    } catch (e) {
        console.error("Init failed:", e);
    }
}

function applyTheme(theme) {
    if (!theme) return;
    const root = document.documentElement;
    
    if(theme.wallpaper) {
        document.body.style.backgroundImage = `url('${theme.wallpaper}')`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundPosition = "center";
    }
    
    if(theme.accent) root.style.setProperty('--accent', theme.accent);
    if(theme.glass) root.style.setProperty('--glass-opacity', theme.glass);
    
    // Update Settings Modal Inputs (if they exist)
    const wInput = document.getElementById("s-wallpaper");
    if(wInput) {
        wInput.value = theme.wallpaper || "";
        document.getElementById("s-accent").value = theme.accent || "#007cff";
        document.getElementById("s-glass").value = theme.glass || 0.7;
    }
}

// --- RENDERING ---

function renderCategories() {
    const nav = document.getElementById("category-list");
    if(!nav) return;

    // Reset to just "All Apps"
    nav.innerHTML = `
        <button class="nav-item active" onclick="filterCat('all', this)">
            <i class="ph ph-squares-four"></i> All Apps
        </button>
    `;

    // Extract Unique Groups
    const groups = [...new Set(allServices.map(s => s.group || "Unsorted"))].sort();
    
    groups.forEach(group => {
        const btn = document.createElement("button");
        btn.className = "nav-item";
        btn.innerHTML = `<i class="ph ph-folder"></i> ${group}`;
        btn.onclick = () => filterCat(group, btn);
        nav.appendChild(btn);
    });
}

// Make this global so onclick works in HTML
window.filterCat = function(cat, btnElement) {
    // UI Update
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
    
    // Render Grid
    renderGrid(cat);
}

function renderGrid(filterCat) {
    const grid = document.getElementById("grid");
    grid.innerHTML = "";

    const term = document.getElementById("search").value.toLowerCase();

    allServices.forEach(service => {
        // Filter Logic
        const sName = service.name ? service.name.toLowerCase() : "";
        const sGroup = service.group || "Unsorted";

        if (filterCat !== "all" && sGroup !== filterCat) return;
        if (term && !sName.includes(term)) return;

        // Create Card
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = service.id; // Helpful for debug
        
        const iconHtml = getIconHtml(service.icon, service.name);

        card.innerHTML = `
            <div class="status-dot" id="status-${service.id}" title="Checking..."></div>
            <div class="icon-box">${iconHtml}</div>
            <div class="info">
                <div class="name" title="${service.name}">${service.name}</div>
                <div class="stats" id="stats-${service.id}"></div>
            </div>
            <button class="edit-btn"><i class="ph ph-dots-three-vertical"></i></button>
        `;

        // Click Logic
        card.onclick = () => {
            if(service.href) window.open(service.href, "_blank");
        };
        
        // Edit Logic
        const editBtn = card.querySelector(".edit-btn");
        editBtn.onclick = (e) => {
            e.stopPropagation();
            openEditor(service);
        };

        grid.appendChild(card);
        
        // Fire async status check
        checkStatus(service.id, service.href);
    });
}

// --- HELPER FUNCTIONS (These were missing!) ---

function getIconHtml(iconStr, appName) {
    // 1. Image URL detection
    if (iconStr && (iconStr.includes("/") || iconStr.includes(".") || iconStr.startsWith("http"))) {
        return `<img src="${iconStr}" alt="${appName}" onerror="this.style.display='none'">`;
    }

    // 2. Default Emoji Mapping
    const name = appName ? appName.toLowerCase() : "";
    if (!iconStr) {
        if (name.includes("sonarr")) return "📺";
        if (name.includes("radarr")) return "🎬";
        if (name.includes("prowlarr")) return "🔍";
        if (name.includes("lidarr")) return "🎵";
        if (name.includes("readarr")) return "📚";
        if (name.includes("transmission") || name.includes("qbit")) return "📥";
        if (name.includes("plex") || name.includes("jellyfin")) return "🍿";
        if (name.includes("portainer")) return "🐳";
        return "📦";
    }

    // 3. Manual Emoji/Text
    return `<span style="font-size:32px">${iconStr}</span>`;
}

async function checkStatus(id, url) {
    if(!url || url === "#") return;
    
    const dot = document.getElementById(`status-${id}`);
    if(!dot) return;

    try {
        const res = await fetch(`/api/status/ping?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        if (data.status === "online") {
            dot.classList.add("online");
            dot.title = "Online";
        } else {
            dot.classList.add("offline");
            dot.title = "Offline";
        }
    } catch (e) {
        dot.classList.add("offline");
    }
}

// --- MODAL & EDITOR LOGIC ---

function openEditor(service) {
    if(!service) {
        // New Manual App Mode
        currentEditingId = null;
        document.getElementById("e-name").value = "";
        document.getElementById("e-group").value = "Unsorted";
        document.getElementById("e-href").value = "http://";
        document.getElementById("e-icon").value = "";
        document.getElementById("e-apikey").value = "";
    } else {
        // Edit Existing Mode
        currentEditingId = service.id;
        document.getElementById("e-name").value = service.name;
        document.getElementById("e-group").value = service.group || "";
        document.getElementById("e-href").value = service.href;
        document.getElementById("e-icon").value = service.icon || "";
        document.getElementById("e-apikey").value = service.apiKey || "";
    }
    
    document.getElementById("editor-side").classList.add("open");
    document.getElementById("overlay").classList.add("visible");
}

function closeOverlays() {
    document.getElementById("editor-side").classList.remove("open");
    document.getElementById("settings-modal").classList.remove("active");
    document.getElementById("overlay").classList.remove("visible");
}

// --- EVENT LISTENERS ---

// 1. Add Button
const addBtn = document.getElementById("add-manual");
if(addBtn) {
    addBtn.onclick = () => openEditor(null);
}

// 2. Search Bar
const searchInput = document.getElementById("search");
if(searchInput) {
    searchInput.oninput = () => renderGrid(document.querySelector('.nav-item.active').innerText.includes("All") ? "all" : "current");
}

// 3. Settings Button
const settingsBtn = document.getElementById("open-settings");
if(settingsBtn) {
    settingsBtn.onclick = () => {
        document.getElementById("settings-modal").classList.add("active");
        document.getElementById("overlay").classList.add("visible");
    };
}

// 4. Save App Changes
document.getElementById("save-btn").onclick = async () => {
    const data = {
        name: document.getElementById("e-name").value,
        group: document.getElementById("e-group").value,
        href: document.getElementById("e-href").value,
        icon: document.getElementById("e-icon").value,
        apiKey: document.getElementById("e-apikey").value
    };

    const url = currentEditingId ? `/api/services/${currentEditingId}/update` : `/api/services/add_manual`;
    
    try {
        await fetch(url, {
            method: "POST", 
            body: JSON.stringify(data),
            headers: { "Content-Type": "application/json" }
        });
        closeOverlays();
        init(); // Refresh grid
    } catch(e) {
        alert("Save failed");
    }
};

// 5. Hide App
document.getElementById("hide-btn").onclick = async () => {
    if(!currentEditingId) return; // Can't hide a new unsaved app
    if(!confirm("Hide this app?")) return;
    
    await fetch(`/api/services/${currentEditingId}/hide`, { method: "POST" });
    closeOverlays();
    init();
};

// 6. Save Global Settings
document.getElementById("save-theme-btn").onclick = async () => {
    const data = {
        wallpaper: document.getElementById("s-wallpaper").value,
        accent: document.getElementById("s-accent").value,
        glass: document.getElementById("s-glass").value
    };
    
    await fetch("/api/settings/theme", {
        method: "POST",
        body: JSON.stringify(data),
        headers: { "Content-Type": "application/json" }
    });
    
    applyTheme(data);
    closeOverlays();
};

// 7. Overlay Click (Close all)
document.getElementById("overlay").onclick = closeOverlays;
document.getElementById("close-settings").onclick = closeOverlays;

// --- START APP ---
init();
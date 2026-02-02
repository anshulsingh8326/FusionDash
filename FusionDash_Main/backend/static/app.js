let currentId = null;

// Initialize Sortable for Drag and Drop
const grid = document.getElementById("grid");
try {
    new Sortable(grid, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: async () => {
            const items = [...grid.querySelectorAll('.card')].map((el, index) => ({
                id: el.dataset.id,
                order: index
            }));
            await fetch('/api/services/reorder', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(items)
            });
        }
    });
} catch(e) { console.log("Sortable not loaded yet"); }

async function loadServices() {
    const res = await fetch("/api/services");
    let services = await res.json();
    
    // Sort by the 'order' field
    services.sort((a, b) => (a.order || 100) - (b.order || 100));

    const term = document.getElementById("search").value.toLowerCase();
    if(term) {
        services = services.filter(s => s.name.toLowerCase().includes(term));
    }
    render(services);
}

function render(services) {
    grid.innerHTML = "";
    
    services.forEach(service => {
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.id = service.id; // Important for Drag & Drop

        // 1. Determine Icon Type (Image vs Emoji)
        const iconHtml = getIconHtml(service.icon, service.name);

        card.innerHTML = `
            <div class="status-dot" id="status-${service.id}" title="Checking status..."></div>
            <div class="icon-box">${iconHtml}</div>
            <div class="info">
                <div class="name">${service.name}</div>
                <div class="group">${service.group || 'Apps'}</div>
                <div class="stats" id="stats-${service.id}"></div>
            </div>
            <div class="edit-trigger">⋮</div>
        `;

        // Card Click -> Open Link
        card.onclick = () => window.open(service.href, "_blank");

        // Edit Click -> Open Editor
        card.querySelector(".edit-trigger").onclick = (e) => {
            e.stopPropagation();
            openEditor(service);
        };

        grid.appendChild(card);

        // 2. Fire Async Status Checks (Don't await, let them load in bg)
        checkStatus(service.id, service.href);
        
        // 3. Fire API Stats Check (if key exists)
        if(service.apiKey) {
            fetchArrStats(service.id, service.href, service.apiKey);
        }
    });
}

/**
 * Smart Icon Logic:
 * - If string contains '/', '.', or 'http', render as <img src="...">
 * - If string is known app name, return default emoji
 * - Otherwise render as text/emoji
 */
function getIconHtml(iconStr, appName) {
    // 1. Explicit Image Path or URL
    if (iconStr && (iconStr.includes("/") || iconStr.includes(".") || iconStr.startsWith("http"))) {
        return `<img src="${iconStr}" class="custom-icon" alt="${appName}" onerror="this.style.display='none'">`;
    }

    // 2. Default Emoji Mapping (fallback)
    const name = appName.toLowerCase();
    if (!iconStr) {
        if (name.includes("sonarr")) return "📺";
        if (name.includes("radarr")) return "🎬";
        if (name.includes("prowlarr")) return "🔍";
        if (name.includes("lidarr")) return "🎵";
        if (name.includes("readarr")) return "📚";
        if (name.includes("transmission") || name.includes("qbit")) return "📥";
        if (name.includes("plex") || name.includes("jellyfin")) return "🍿";
        return "📦";
    }

    // 3. Manual Emoji/Text
    return `<span class="emoji-icon">${iconStr}</span>`;
}

/**
 * Pings the backend proxy to check if service is online
 */
async function checkStatus(id, url) {
    if(!url || url === "#") return;
    
    const dot = document.getElementById(`status-${id}`);
    try {
        const res = await fetch(`/api/status/ping?url=${encodeURIComponent(url)}`);
        const data = await res.json();
        
        if (data.status === "online") {
            dot.classList.add("online");
            dot.title = "Online";
        } else {
            dot.classList.add("offline");
            dot.title = "Offline/Unreachable";
        }
    } catch (e) {
        dot.classList.add("offline");
    }
}

/**
 * Fetches Queue count from *Arr apps via backend proxy
 */
async function fetchArrStats(id, url, key) {
    const statsDiv = document.getElementById(`stats-${id}`);
    try {
        const res = await fetch(`/api/integration/arr/queue?url=${encodeURIComponent(url)}&api_key=${key}`);
        const data = await res.json();
        
        if(data.count > 0) {
            statsDiv.innerHTML = `<span class="badge">${data.count} Active</span>`;
        }
    } catch(e) {
        console.log(`Stats failed for ${id}`, e);
    }
}

function openEditor(service = null) {
    currentId = service ? service.id : null;
    
    // Populate Fields
    document.getElementById("e-name").value = service ? service.name : "";
    document.getElementById("e-group").value = service ? service.group : "";
    document.getElementById("e-href").value = service ? service.href : "http://";
    document.getElementById("e-icon").value = service ? service.icon : "";
    
    // Populate API Key (handle undefined)
    document.getElementById("e-apikey").value = service ? (service.apiKey || "") : "";

    document.getElementById("editor-side").classList.add("open");
    document.getElementById("overlay").classList.add("visible");
}

function closeEditor() {
    document.getElementById("editor-side").classList.remove("open");
    document.getElementById("overlay").classList.remove("visible");
}

document.getElementById("save-btn").onclick = async () => {
    const data = {
        name: document.getElementById("e-name").value,
        group: document.getElementById("e-group").value,
        href: document.getElementById("e-href").value,
        icon: document.getElementById("e-icon").value,
        apiKey: document.getElementById("e-apikey").value
    };

    const url = currentId ? `/api/services/${currentId}/update` : `/api/services/add_manual`;
    
    try {
        await fetch(url, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(data)
        });
        closeEditor();
        loadServices();
    } catch (e) {
        alert("Failed to save changes.");
    }
};

document.getElementById("add-manual").onclick = () => openEditor();
document.getElementById("overlay").onclick = closeEditor;
document.getElementById("search").oninput = loadServices;

// Initial Load
loadServices();
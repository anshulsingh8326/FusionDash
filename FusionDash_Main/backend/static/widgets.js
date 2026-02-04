const Widgets = {
    registry: {},

    // Register a new widget type
    register(type, config) {
        this.registry[type] = config;
    },

    // Check if a service has a valid widget
    hasWidget(service) {
        return service.widgetType && this.registry[service.widgetType];
    },

    // Generate the HTML container for the widget
    renderContainer(service) {
        if (!this.hasWidget(service)) return '';
        const config = this.registry[service.widgetType];
        // The container is hidden by default until data is fetched
        return `
            <div id="widget-${service.id}" class="widget-container hidden ${config.className || ''}">
                <div class="widget-content">Loading...</div>
            </div>
        `;
    },

    // Generate the Built-in System Status Widget (Special Case)
    renderSystemWidget(allServices) {
        const dockerCount = allServices.filter(s => s.source === 'docker').length;
        const webCount = allServices.filter(s => s.source !== 'docker').length;
        
        return `
            <div class="card system-widget-card" data-id="builtin_status_summary">
                <div class="sys-widget-left">
                    <div class="pulsing-dot-container">
                        <div class="pulse-ring"></div>
                        <div class="pulse-dot"></div>
                    </div>
                    <div class="sys-info">
                        <span class="sys-title">System Online</span>
                        <span class="sys-sub">FusionDash Active</span>
                    </div>
                </div>
                <div class="sys-widget-right">
                    <div class="sys-stat">
                        <i class="ph-fill ph-docker-logo"></i>
                        <span>${dockerCount}</span>
                    </div>
                    <div class="sys-stat">
                        <i class="ph-bold ph-globe"></i>
                        <span>${webCount}</span>
                    </div>
                </div>
                <div class="edit-trigger" onclick="removeWidget('builtin_status_summary')">
                    <i class="ph-bold ph-trash"></i>
                </div>
            </div>
        `;
    },

    // Fetch data for a specific service
    async fetch(service) {
        if (!this.hasWidget(service)) return;
        const config = this.registry[service.widgetType];
        const el = document.getElementById(`widget-${service.id}`);
        if (!el) return;

        try {
            await config.onFetch(service, el);
        } catch (e) {
            console.error(`Widget Error [${service.name}]:`, e);
            el.querySelector('.widget-content').innerText = "Error";
            el.classList.remove('hidden');
        }
    },

    // Refresh all widgets on the screen
    refreshAll(services) {
        services.forEach(s => {
            if(s.widgetType) this.fetch(s);
        });
    }
};

// --- WIDGET DEFINITIONS ---

// 1. Arr Queue (Sonarr/Radarr)
Widgets.register('arr_queue', {
    className: 'widget-arr',
    onFetch: async (service, el) => {
        const content = el.querySelector('.widget-content');
        const res = await fetch(`/api/integration/arr/queue?url=${encodeURIComponent(service.href)}&api_key=${service.apiKey}`);
        const data = await res.json();
        
        el.classList.remove('hidden');
        
        if (data.count > 0) {
            content.innerHTML = `<i class="ph-bold ph-download-simple"></i> ${data.count} Downloading`;
            content.style.color = '#4facfe';
        } else {
            content.innerText = "Queue Idle";
            content.style.color = 'var(--dim)';
        }
    }
});
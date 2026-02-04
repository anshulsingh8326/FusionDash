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

    // Generate the HTML for the widget
    render(service) {
        if (!this.hasWidget(service)) return '';
        const config = this.registry[service.widgetType];
        return `
            <div id="widget-${service.id}" class="card-api ${config.className || ''}">
                <div class="api-divider"></div>
                <div class="api-content">Loading...</div>
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
            el.querySelector('.api-content').innerText = "Error";
        }
    },

    // Refresh all widgets on the screen
    refreshAll(services) {
        services.forEach(s => this.fetch(s));
    }
};

// --- REGISTER WIDGETS HERE ---

// 1. Arr Queue (Sonarr/Radarr)
Widgets.register('arr_queue', {
    className: 'widget-arr',
    onFetch: async (service, el) => {
        const content = el.querySelector('.api-content');
        const res = await fetch(`/api/integration/arr/queue?url=${encodeURIComponent(service.href)}&api_key=${service.apiKey}`);
        const data = await res.json();
        
        el.classList.remove('hidden');
        if (data.count > 0) {
            content.innerText = `${data.count} Active Downloads`;
            content.style.color = '#4facfe';
        } else {
            content.innerText = "Queue Idle";
            content.style.color = '#666';
        }
    }
});

// Example: You can add 'system_cpu' or 'weather' here later easily.
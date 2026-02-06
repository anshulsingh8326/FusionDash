const Render = {
    // --- Icons ---
    getIcon(service) {
        if (!service.icon) return `<i class="ph ph-cube" style="font-size:32px;"></i>`;
        let src = service.icon;
        // If it's a simple name like "plex", use the CDN
        if (!src.includes('/') && !src.includes('.')) {
            src = `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${service.icon.toLowerCase()}.png`;
        }
        return `<img src="${src}" onerror="this.src='https://unpkg.com/@phosphor-icons/core/assets/duotone/cube-duotone.svg'">`;
    },

    // --- Standard Card ---
    createCard(service, sectionSettings = {}) {
        const card = document.createElement('div');
        
        // Dynamic Classes based on Section Settings
        const styleClass = sectionSettings.style ? `style-${sectionSettings.style}` : 'style-standard';
        card.className = `card app-card ${styleClass}`;
        card.dataset.id = service.id; 

        // Label Logic
        let typeLabel = (service.displaySource || service.source || 'WEB').toUpperCase();
        if(typeLabel === 'MANUAL') typeLabel = 'WEB';

        // Description Logic
        const hasDesc = service.description && service.description.trim().length > 0;
        const descHtml = hasDesc ? `<div class="card-desc">${service.description}</div>` : '';

        // Widget HTML (Placeholder)
        const widgetHtml = Widgets.renderContainer(service);

        card.innerHTML = `
            <div class="card-content-wrapper">
                <div class="status-dot js-status-${service.id}"></div>
                
                <div class="card-icon-area">
                    ${this.getIcon(service)}
                </div>

                <div class="card-info-area">
                    <div class="card-header">
                        <div class="card-name">${service.name}</div>
                        <div class="type-badge">${typeLabel}</div>
                    </div>
                    ${descHtml}
                </div>
            </div>

            ${widgetHtml}

            <div class="edit-trigger" onclick="window.editService('${service.id}', event)">
                <i class="ph-bold ph-dots-three-vertical"></i>
            </div>
        `;

        card.onclick = (e) => {
            if (e.target.closest('.edit-trigger')) return;
            if (service.href) window.open(service.href, '_blank');
        };
        return card;
    },

    // --- Board Rendering ---
    renderBoard(board, allServices, searchTerm = "") {
        const container = document.getElementById('board-view');
        container.innerHTML = '';
        container.className = 'view-container'; 
        
        // Global board settings for background are handled in app.js applyBoardTheme, 
        // but layout settings are now PER SECTION.

        let hasVisibleItems = false;

        board.sections.forEach(section => {
            // Data Safety: Default settings if missing
            const settings = section.settings || { cardSize: 'medium', style: 'standard', align: 'left' };

            const secDiv = document.createElement('div');
            secDiv.className = 'board-section';
            secDiv.dataset.id = section.id;

            // --- Dynamic Class Generation for Grid ---
            let gridClasses = `section-grid grid-${settings.cardSize} style-${settings.style}`;
            // NEW: Add Alignment Class
            if (settings.align) {
                gridClasses += ` align-${settings.align}`;
            }
            
            
            // Add Fixed Grid classes if applicable
            if (settings.style === 'fixed') {
                gridClasses += ` cols-${settings.columns || 4}`; // Default to 4 columns
                if (settings.stretch !== false) {
                    gridClasses += ' autofill';
                }
            }

            // Header and Grid
            secDiv.innerHTML = `
                <div class="section-header">
                    <h4 class="section-title" onclick="editSection('${section.id}')">
                        ${section.title} <i class="ph-fill ph-pencil-simple-slash edit-icon"></i>
                    </h4>
                    <button class="btn-ghost btn-sm" onclick="openAppPicker('${section.id}')">
                        <i class="ph-bold ph-plus"></i>
                    </button>
                </div>
                <div class="${gridClasses}" data-section="${section.id}"></div>
            `;

            const grid = secDiv.querySelector('.section-grid');
            let sectionHasItems = false;
            
            section.items.forEach(itemId => {
                if (itemId === 'builtin_status_summary') {
                    // Use the new System Widget from Widgets.js
                    grid.innerHTML += Widgets.renderSystemWidget(allServices);
                    sectionHasItems = true;
                } else {
                    const service = allServices.find(s => s.id === itemId);
                    if (service) {
                        // SEARCH FILTER
                        if(searchTerm && !service.name.toLowerCase().includes(searchTerm)) return;
                        
                        grid.appendChild(this.createCard(service, settings));
                        sectionHasItems = true;
                    }
                }
            });

            // Initialize Sortable only if section has items or to allow dropping
            new Sortable(grid, {
                group: 'shared',
                animation: 150,
                ghostClass: 'sortable-ghost',
                onEnd: window.handleDragEnd
            });

            // Only append section if it has items OR if we are not searching (show empty sections when not searching)
            if(sectionHasItems || !searchTerm) {
                container.appendChild(secDiv);
                hasVisibleItems = true;
            }
        });

        // Empty States
        if (!hasVisibleItems && searchTerm) {
            container.innerHTML = `<div style="text-align:center; color:#666; padding-top:50px;">No apps found matching "${searchTerm}"</div>`;
        } else if (board.sections.length === 0) {
            container.innerHTML = `
                <div class="empty-board-state">
                    <i class="ph ph-kanban"></i>
                    <p>Start by adding a section</p>
                    <button onclick="window.addSection()" class="btn btn-primary">Create Section</button>
                </div>
            `;
        }
        
        // After rendering, trigger widget fetches
        Widgets.refreshAll(allServices);
    },

    // --- Sidebar ---
    renderSidebar(boards, activeId) {
        const list = document.getElementById('board-list');
        list.innerHTML = '';
        boards.forEach(b => {
            const btn = document.createElement('button');
            btn.className = `nav-item board-btn ${b.id === activeId ? 'active' : ''}`;
            btn.innerHTML = `<i class="ph ph-layout"></i> <span>${b.name}</span>`;
            btn.onclick = () => window.switchBoard(b.id);
            list.appendChild(btn);
        });
    }
};
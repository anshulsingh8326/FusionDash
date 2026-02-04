const Render = {
    // --- Icons ---
    getIcon(service) {
        if (!service.icon) return `<i class="ph ph-cube" style="font-size:32px;"></i>`;
        let src = service.icon;
        if (!src.includes('/') && !src.includes('.')) {
            src = `https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/${service.icon.toLowerCase()}.png`;
        }
        return `<img src="${src}" onerror="this.src='https://unpkg.com/@phosphor-icons/core/assets/duotone/cube-duotone.svg'">`;
    },

    // --- Status Widget ---
    createStatusWidget(data) {
        const div = document.createElement('div');
        div.className = 'card status-widget-card';
        div.dataset.id = 'builtin_status_summary';
        
        const dockerCount = data.filter(s => s.source === 'docker').length;
        const webCount = data.filter(s => s.source !== 'docker').length;
        
        div.innerHTML = `
            <div class="widget-header">
                <i class="ph-fill ph-activity" style="color:var(--accent)"></i>
                <span>System Status</span>
            </div>
            <div class="widget-row">
                <div class="stat-pill"><span class="label">Docker</span><span class="value">${dockerCount}</span></div>
                <div class="stat-pill"><span class="label">Web</span><span class="value">${webCount}</span></div>
            </div>
            <div class="widget-row status-dots-row"><div class="loading-dots">Checking...</div></div>
            <div class="edit-trigger" onclick="removeWidget('builtin_status_summary')"><i class="ph-bold ph-trash"></i></div>
        `;
        return div;
    },

    // --- Standard Card ---
    createCard(service) {
        const card = document.createElement('div');
        card.className = "card app-card";
        card.dataset.id = service.id; 

        // Use 'displaySource' if edited, else fallback to 'source'
        let typeLabel = (service.displaySource || service.source || 'WEB').toUpperCase();
        if(typeLabel === 'MANUAL') typeLabel = 'WEB'; // Fallback for old data

        card.innerHTML = `
            <div class="card-top">
                <div class="type-badge">
                    <div class="status-dot js-status-${service.id}"></div>
                    <span>${typeLabel}</span>
                </div>
            </div>
            <div class="card-main">
                ${this.getIcon(service)}
                <div class="card-name">${service.name}</div>
            </div>
            <div class="card-api hidden" id="widget-${service.id}">
                <div class="api-divider"></div>
                <div class="api-content">Loading...</div>
            </div>
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

    // --- Board Rendering (With Search) ---
    renderBoard(board, allServices, settings, searchTerm = "") {
        const container = document.getElementById('board-view');
        container.innerHTML = '';
        container.className = 'view-container'; 
        
        if (settings.style) container.classList.add(`style-${settings.style}`);
        if (settings.align === 'center') container.classList.add('align-center');

        let hasVisibleItems = false;

        board.sections.forEach(section => {
            const secDiv = document.createElement('div');
            secDiv.className = 'board-section';
            secDiv.dataset.id = section.id;

            const gridClass = `grid-${settings.cardSize || 'medium'}`;
            
            secDiv.innerHTML = `
                <div class="section-header">
                    <h4 class="section-title" onclick="editSection('${section.id}')">${section.title} <i class="ph-fill ph-pencil-simple-slash edit-icon"></i></h4>
                    <button class="btn-ghost btn-sm" onclick="openAppPicker('${section.id}')"><i class="ph-bold ph-plus"></i></button>
                </div>
                <div class="section-grid ${gridClass}" data-section="${section.id}"></div>
            `;

            const grid = secDiv.querySelector('.section-grid');
            let sectionHasItems = false;
            
            section.items.forEach(itemId => {
                if (itemId === 'builtin_status_summary') {
                    // Widgets always show unless filtered? Let's show them.
                    grid.appendChild(this.createStatusWidget(allServices));
                    sectionHasItems = true;
                } else {
                    const service = allServices.find(s => s.id === itemId);
                    if (service) {
                        // SEARCH FILTER
                        if(searchTerm && !service.name.toLowerCase().includes(searchTerm)) return;
                        
                        grid.appendChild(this.createCard(service));
                        sectionHasItems = true;
                    }
                }
            });

            if(sectionHasItems) {
                new Sortable(grid, {
                    group: 'shared',
                    animation: 150,
                    ghostClass: 'sortable-ghost',
                    onEnd: window.handleDragEnd
                });
                container.appendChild(secDiv);
                hasVisibleItems = true;
            }
        });

        // Empty States
        if (!hasVisibleItems) {
            if(searchTerm) {
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
        }
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
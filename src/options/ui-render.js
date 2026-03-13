// src/options/ui-render.js

export function renderStats(stats) {
    const usageCountEl = document.getElementById('usage-count');
    const timeSavedEl = document.getElementById('time-saved');
    
    if (usageCountEl) usageCountEl.innerText = stats.usageCount || 0;
    
    if (timeSavedEl) {
        const minutesSaved = Math.floor((stats.charsSaved || 0) / 300);
        let timeString = `${minutesSaved}m`;
        
        if (minutesSaved >= 60) {
            const hours = Math.floor(minutesSaved / 60);
            const minutes = minutesSaved % 60;
            timeString = `${hours}h ${minutes}m`;
        }
        timeSavedEl.innerText = timeString;
    }
}

export function renderFilterTags(tags, selectedFilters, onFilterToggle) {
    const filterSection = document.getElementById('filter-section');
    const filterTagsList = document.getElementById('filter-tags-list');
    const clearFiltersBtn = document.getElementById('clear-filters-btn');

    if (!filterSection || !filterTagsList) return;

    if (tags.length === 0) {
        filterSection.style.display = 'none';
        return;
    } else {
        filterSection.style.display = 'flex';
    }

    filterTagsList.innerHTML = '';
    tags.forEach(tag => {
        const btn = document.createElement('div');
        btn.className = 'filter-tag';
        if (selectedFilters.has(tag)) {
            btn.classList.add('active');
        }
        btn.innerText = `#${tag}`;
        btn.onclick = () => onFilterToggle(tag);
        filterTagsList.appendChild(btn);
    });

    if (clearFiltersBtn) {
        clearFiltersBtn.style.display = selectedFilters.size > 0 ? 'block' : 'none';
    }
}

export function renderGrid(dataToRender, selectedCards, options) {
    const { onEdit, onDelete, onCheckboxToggle, escapeHtml } = options;
    const grid = document.getElementById('grid');
    const emptyState = document.getElementById('empty-state');
    
    if (!grid) return;
    grid.innerHTML = '';

    const keys = Object.keys(dataToRender);
    if (emptyState) emptyState.style.display = keys.length === 0 ? 'block' : 'none';

    keys.sort().forEach(key => {
        const item = dataToRender[key];
        const card = document.createElement('div');
        card.className = 'card';

        let tagsHtml = '';
        if (item.tags && item.tags.length > 0) {
            tagsHtml = `<div class="card-tags">${item.tags.map(t => `<span class="card-tag">#${escapeHtml(t)}</span>`).join('')}</div>`;
        }

        let previewText = item.text || "";
        if (previewText.length > 150) {
            previewText = previewText.substring(0, 150) + '...';
        }

        card.innerHTML = `
            <div class="card-header">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <input type="checkbox" class="bulk-cb" style="cursor: pointer; width: 16px; height: 16px; margin: 0;" ${selectedCards.has(key) ? 'checked' : ''}>
                    <span class="card-key">${escapeHtml(key)}</span>
                </div>
            </div>
            ${tagsHtml}
            <div class="card-text" title="${escapeHtml(item.text)}">${escapeHtml(previewText)}</div>
            <div class="card-actions">
                <button class="action-btn edit">Edit</button>
                <button class="action-btn delete">Delete</button>
            </div>
        `;

        card.querySelector('.bulk-cb').addEventListener('change', (e) => onCheckboxToggle(key, e.target.checked));
        card.querySelector('.edit').onclick = () => onEdit(key, item);
        card.querySelector('.delete').onclick = () => onDelete(key);

        grid.appendChild(card);
    });
}

export function renderTagsInput(currentTags, tagInput, tagContainer, options) {
    const { onRemove, escapeHtml } = options;
    const pills = tagContainer.querySelectorAll('.tag-pill');
    pills.forEach(p => p.remove());

    currentTags.forEach((tag, index) => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.innerHTML = `#${escapeHtml(tag)} <span>×</span>`;
        pill.querySelector('span').onclick = (e) => {
            e.stopPropagation();
            onRemove(index);
        };
        tagContainer.insertBefore(pill, tagInput);
    });
}

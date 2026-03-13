// src/popup/main.js
import { getShortcuts, getSettings, saveSetting, onStorageChange } from '../shared/storage.js';

let allData = {};

document.addEventListener('DOMContentLoaded', async () => {
    const settings = await getSettings();
    applyTheme(settings.theme === 'dark');
    
    const shortcuts = await getShortcuts();
    allData = shortcuts;
    renderList(allData);
    renderTagCloud();
    
    document.getElementById('manage-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filterList(query);
    });

    document.getElementById('theme-toggle').addEventListener('click', async () => {
        const currentTheme = document.body.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        await saveSetting('theme', newTheme);
        applyTheme(newTheme === 'dark');
    });
});

function applyTheme(isDark) {
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (isDark) {
        document.body.setAttribute('data-theme', 'dark');
        if(themeToggleBtn) themeToggleBtn.innerText = '☀️';
    } else {
        document.body.removeAttribute('data-theme');
        if(themeToggleBtn) themeToggleBtn.innerText = '🌙';
    }
}

onStorageChange((changes) => {
    if (changes.theme) {
        applyTheme(changes.theme.newValue === 'dark');
    }
    if (changes.shortcuts) {
        allData = changes.shortcuts.newValue || {};
        renderList(allData);
        renderTagCloud();
    }
});

function renderTagCloud() {
    const tagCloud = document.getElementById('tag-cloud');
    if (!tagCloud) return;

    const tagsSet = new Set();
    for (const item of Object.values(allData)) {
        if (item.tags) item.tags.forEach(t => tagsSet.add(t));
    }
    
    const tags = Array.from(tagsSet).sort();
    tagCloud.innerHTML = '';
    
    tags.forEach(tag => {
        const span = document.createElement('span');
        span.className = 'tag';
        span.style.cursor = 'pointer';
        span.innerText = `#${tag}`;
        span.onclick = () => {
            const searchInput = document.getElementById('search');
            searchInput.value = `#${tag}`;
            filterList(`#${tag}`);
        };
        tagCloud.appendChild(span);
    });
}

function renderList(shortcutsObject) {
    const listElement = document.getElementById('list');
    const emptyState = document.getElementById('empty-state');
    if (!listElement) return;

    listElement.innerHTML = '';
    const keys = Object.keys(shortcutsObject);
    if (emptyState) emptyState.style.display = keys.length === 0 ? 'block' : 'none';

    keys.sort((a, b) => {
        const countA = shortcutsObject[a].usageCount || 0;
        const countB = shortcutsObject[b].usageCount || 0;
        if (countB !== countA) return countB - countA;
        return a.localeCompare(b);
    }).forEach(key => {
        const item = shortcutsObject[key];
        const li = document.createElement('li');
        li.className = 'shortcut-item';
        li.title = "Click to copy to clipboard";

        let preview = (typeof item === 'string' ? item : item.text).replace(/\n/g, '↵ ');
        
        let tagsHtml = '';
        if (item.tags && item.tags.length > 0) {
            tagsHtml = `<div class="tag-container">${item.tags.map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('')}</div>`;
        }

        li.innerHTML = `
            <div class="item-header">
                <span class="item-key">${escapeHtml(key)}</span>
            </div>
            <span class="item-preview">${escapeHtml(preview)}</span>
            ${tagsHtml}
            <div class="copy-badge">Copied!</div>
        `;

        li.addEventListener('click', () => {
            const rawText = (typeof item === 'string' ? item : item.text);
            const textToCopy = rawText
                .replace(/\{\{.*?\}\}/g, '')
                .replace(/\|/g, '')
                .replace(/[ \t]+/g, ' ')
                .replace(/\n\s*\n/g, '\n')
                .trim();

            navigator.clipboard.writeText(textToCopy).then(() => {
                const badge = li.querySelector('.copy-badge');
                badge.classList.add('visible');
                setTimeout(() => badge.classList.remove('visible'), 1000);
            });
        });

        listElement.appendChild(li);
    });
}

function filterList(query) {
    if (!query) return renderList(allData);

    const filtered = {};
    for (const [key, item] of Object.entries(allData)) {
        const matchesKey = key.toLowerCase().includes(query);
        const matchesText = (item.text || "").toLowerCase().includes(query);
        const matchesTag = (item.tags || []).some(tag => tag.toLowerCase().includes(query.replace('#','')));
        
        if (matchesKey || matchesText || matchesTag) {
            filtered[key] = item;
        }
    }
    renderList(filtered);
}

function escapeHtml(text) {
    if (!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

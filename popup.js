document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadShortcuts();
    
    document.getElementById('manage-btn').addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
    });

    document.getElementById('search').addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        filterList(query);
    });
});

let allData = {};

// --- THEME HANDLING ---
function loadTheme() {
    chrome.storage.local.get(['theme'], (result) => {
        applyTheme(result.theme === 'dark');
    });
}

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

document.getElementById('theme-toggle').addEventListener('click', () => {
    const isDark = document.body.getAttribute('data-theme') !== 'dark';
    chrome.storage.local.set({ theme: isDark ? 'dark' : 'light' }, () => {
        applyTheme(isDark);
    });
});

// Listen for theme changes from other windows
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.theme) {
        applyTheme(changes.theme.newValue === 'dark');
    }
});


function migrateFormatIfNeeded(shortcuts, callback) {
    let needsSave = false;
    let newShortcuts = {};
    for (let key in shortcuts) {
        if (typeof shortcuts[key] === 'string') {
            newShortcuts[key] = { text: shortcuts[key], tags: [] };
            needsSave = true;
        } else {
            newShortcuts[key] = shortcuts[key];
        }
    }
    if (needsSave) {
        chrome.storage.local.set({ shortcuts: newShortcuts }, () => callback(newShortcuts));
    } else {
        callback(shortcuts);
    }
}

function loadShortcuts() {
    chrome.storage.local.get(['shortcuts'], (result) => {
        migrateFormatIfNeeded(result.shortcuts || {}, (migratedData) => {
            allData = migratedData;
            renderList(allData);
        });
    });
}

function renderList(shortcutsObject) {
    const listElement = document.getElementById('list');
    const emptyState = document.getElementById('empty-state');
    listElement.innerHTML = '';
    
    const keys = Object.keys(shortcutsObject);
    emptyState.style.display = keys.length === 0 ? 'block' : 'none';

    keys.sort().forEach(key => {
        const item = shortcutsObject[key];
        const li = document.createElement('li');
        li.className = 'shortcut-item';
        li.title = "Click to copy to clipboard";

        let preview = item.text.replace(/\n/g, '↵ ');
        
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
            const textToCopy = item.text.replace(/\|/g, ''); // Strip the cursor marker
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
        const matchesText = item.text.toLowerCase().includes(query);
        const matchesTag = item.tags.some(tag => tag.toLowerCase().includes(query.replace('#','')));
        
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
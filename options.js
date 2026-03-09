document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    loadShortcuts();
    loadStats();
    loadSettings();
});

const shortcutInput = document.getElementById('shortcut');
const replacementInput = document.getElementById('replacement');
const tagInput = document.getElementById('tag-input');
const tagContainer = document.getElementById('tag-container');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const formTitle = document.getElementById('form-title');
const searchInput = document.getElementById('search');
const themeToggleBtn = document.getElementById('theme-toggle');
const pasteBehaviorSelect = document.getElementById('paste-behavior');

// --- SETTINGS ---
function loadSettings() {
    chrome.storage.local.get(['pasteBehavior'], (result) => {
        if (result.pasteBehavior) {
            pasteBehaviorSelect.value = result.pasteBehavior;
        }
    });
}

pasteBehaviorSelect.addEventListener('change', () => {
    chrome.storage.local.set({ pasteBehavior: pasteBehaviorSelect.value });
});

// Variable helper buttons logic
document.querySelectorAll('.var-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        const varText = btn.getAttribute('data-var');
        const start = replacementInput.selectionStart;
        const end = replacementInput.selectionEnd;
        const text = replacementInput.value;
        
        replacementInput.value = text.substring(0, start) + varText + text.substring(end);
        
        // Move cursor after the inserted variable
        const newPos = start + varText.length;
        replacementInput.selectionStart = replacementInput.selectionEnd = newPos;
        replacementInput.focus();
    });
});

// Element filters
const filterSection = document.getElementById('filter-section');
const filterTagsList = document.getElementById('filter-tags-list');
const clearFiltersBtn = document.getElementById('clear-filters-btn');

// Import elements
const importBtn = document.getElementById('import-btn');
const importFile = document.getElementById('import-file');

let editingOriginalKey = null;
let currentTags = [];
let allData = {};
let selectedFilters = new Set();
let selectedCards = new Set(); // Stores shortcut keys selected with checkboxes

// --- THEME HANDLING ---
function loadTheme() {
    chrome.storage.local.get(['theme'], (result) => {
        applyTheme(result.theme === 'dark');
    });
}

function applyTheme(isDark) {
    if (isDark) {
        document.body.setAttribute('data-theme', 'dark');
        if (themeToggleBtn) themeToggleBtn.innerText = '☀️ Light theme';
    } else {
        document.body.removeAttribute('data-theme');
        if (themeToggleBtn) themeToggleBtn.innerText = '🌙 Dark theme';
    }
}

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const isDark = document.body.getAttribute('data-theme') !== 'dark';
        chrome.storage.local.set({ theme: isDark ? 'dark' : 'light' }, () => {
            applyTheme(isDark);
        });
    });
}

// Nasłuchiwanie zmian motywu z innych okien
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

// --- LOADING DATABASE ---
function loadShortcuts() {
    chrome.storage.local.get(['shortcuts'], (result) => {
        migrateFormatIfNeeded(result.shortcuts || {}, (migratedData) => {
            allData = migratedData;
            renderFilterTags();
            applyFilters();
        });
    });
}

function loadStats() {
    chrome.storage.local.get(['stats'], (result) => {
        const stats = result.stats || { usageCount: 0, charsSaved: 0 };
        document.getElementById('usage-count').innerText = stats.usageCount;
        
        // Time calculation: 300 characters per minute
        const minutesSaved = Math.floor(stats.charsSaved / 300);
        let timeString = `${minutesSaved}m`;
        
        if (minutesSaved >= 60) {
            const hours = Math.floor(minutesSaved / 60);
            const minutes = minutesSaved % 60;
            timeString = `${hours}h ${minutes}m`;
        }
        
        document.getElementById('time-saved').innerText = timeString;
    });
}

// --- GENERATING FILTERS AT THE TOP ---
function extractAllTags() {
    const tagsSet = new Set();
    for (const item of Object.values(allData)) {
        if (item.tags) {
            item.tags.forEach(t => tagsSet.add(t));
        }
    }
    return Array.from(tagsSet).sort();
}

function renderFilterTags() {
    const tags = extractAllTags();
    filterTagsList.innerHTML = '';

    for (const f of selectedFilters) {
        if (!tags.includes(f)) selectedFilters.delete(f);
    }

    if (tags.length === 0) {
        filterSection.style.display = 'none';
        return;
    } else {
        filterSection.style.display = 'flex';
    }

    tags.forEach(tag => {
        const btn = document.createElement('div');
        btn.className = 'filter-tag';
        if (selectedFilters.has(tag)) {
            btn.classList.add('active');
        }
        btn.innerText = `#${tag}`;
        
        btn.onclick = () => {
            if (selectedFilters.has(tag)) {
                selectedFilters.delete(tag);
            } else {
                selectedFilters.add(tag);
            }
            renderFilterTags();
            applyFilters();
        };
        filterTagsList.appendChild(btn);
    });

    clearFiltersBtn.style.display = selectedFilters.size > 0 ? 'block' : 'none';
}

clearFiltersBtn.addEventListener('click', () => {
    selectedFilters.clear();
    searchInput.value = '';
    renderFilterTags();
    applyFilters();
});

// --- SEARCHING AND APPLYING FILTERS ---
searchInput.addEventListener('input', applyFilters);

function applyFilters() {
    const query = searchInput.value.toLowerCase();
    const filtered = {};

    for (const [key, item] of Object.entries(allData)) {
        const itemTags = item.tags || [];
        let matchesTags = true;
        
        if (selectedFilters.size > 0) {
            for (const fTag of selectedFilters) {
                if (!itemTags.includes(fTag)) {
                    matchesTags = false;
                    break;
                }
            }
        }

        let matchesSearch = true;
        if (query) {
            matchesSearch = key.toLowerCase().includes(query) || 
                            item.text.toLowerCase().includes(query) || 
                            itemTags.some(t => t.toLowerCase().includes(query.replace('#', '')));
        }

        if (matchesTags && matchesSearch) {
            filtered[key] = item;
        }
    }
    renderGrid(filtered);
}

// --- BULK ACTIONS ---
function updateBulkUI() {
    let bulkContainer = document.getElementById('bulk-container');
    
    // If container doesn't exist yet, create it dynamically above the card grid
    if (!bulkContainer) {
        bulkContainer = document.createElement('div');
        bulkContainer.id = 'bulk-container';
        bulkContainer.className = 'bulk-container'; // Use CSS class instead of inline styles for themeing
        
        bulkContainer.innerHTML = `
            <span class="bulk-label"><span id="bulk-count">0</span> selected</span>
            <input type="text" id="bulk-tag-input" placeholder="Type new tag...">
            <button id="bulk-add-btn" class="btn btn-primary bulk-btn">Assign tag</button>
            <button id="bulk-clear-btn" class="btn btn-secondary bulk-btn">Cancel</button>
        `;
        
        const grid = document.getElementById('grid');
        grid.parentNode.insertBefore(bulkContainer, grid);

        // Handle Enter key in bulk tagging input
        document.getElementById('bulk-tag-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                document.getElementById('bulk-add-btn').click();
            }
        });

        // Handle adding tag
        document.getElementById('bulk-add-btn').addEventListener('click', () => {
            const bulkTagInput = document.getElementById('bulk-tag-input');
            const newTag = bulkTagInput.value.trim().toLowerCase().replace(/[^a-z0-9ąćęłńóśźż-]/g, '');
            
            if (!newTag) {
                alert("Enter a valid tag before adding!");
                return;
            }

            chrome.storage.local.get(['shortcuts'], (result) => {
                const shortcuts = result.shortcuts || {};
                let updated = false;

                // Adding tag to all selected
                for (const key of selectedCards) {
                    if (shortcuts[key]) {
                        if (!shortcuts[key].tags) shortcuts[key].tags = [];
                        if (!shortcuts[key].tags.includes(newTag)) {
                            shortcuts[key].tags.push(newTag);
                            updated = true;
                        }
                    }
                }

                if (updated) {
                    chrome.storage.local.set({ shortcuts }, () => {
                        bulkTagInput.value = '';
                        selectedCards.clear();
                        updateBulkUI();
                        loadShortcuts(); // Refresh everything including the tag list at the top
                    });
                } else {
                    // Tag was already assigned everywhere
                    bulkTagInput.value = '';
                    selectedCards.clear();
                    updateBulkUI();
                    applyFilters(); // Just uncheck checkboxes
                }
            });
        });

        // Handle cancel
        document.getElementById('bulk-clear-btn').addEventListener('click', () => {
            selectedCards.clear();
            updateBulkUI();
            applyFilters(); // Rerender grid and uncheck checkboxes
        });
    }

    // Update panel visibility based on the number of selected cards
    if (selectedCards.size > 0) {
        bulkContainer.style.display = 'flex';
        document.getElementById('bulk-count').innerText = selectedCards.size;
    } else {
        bulkContainer.style.display = 'none';
    }
}


// --- RENDER CARDS ---
function renderGrid(dataToRender) {
    const grid = document.getElementById('grid');
    const emptyState = document.getElementById('empty-state');
    grid.innerHTML = '';

    const keys = Object.keys(dataToRender);
    emptyState.style.display = keys.length === 0 ? 'block' : 'none';

    keys.sort().forEach(key => {
        const item = dataToRender[key];
        const card = document.createElement('div');
        card.className = 'card';

        let tagsHtml = '';
        if (item.tags && item.tags.length > 0) {
            tagsHtml = `<div class="card-tags">${item.tags.map(t => `<span class="card-tag">#${escapeHtml(t)}</span>`).join('')}</div>`;
        }

        // Truncate very long templates to not break UI
        let previewText = item.text;
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

        // Checkbox logic
        card.querySelector('.bulk-cb').addEventListener('change', (e) => {
            if (e.target.checked) {
                selectedCards.add(key);
            } else {
                selectedCards.delete(key);
            }
            updateBulkUI();
        });

        card.querySelector('.edit').onclick = () => startEditing(key, item);
        card.querySelector('.delete').onclick = () => removeShortcut(key);

        grid.appendChild(card);
    });
    
    // Ensure bulk panel is correctly displayed after rerendering
    updateBulkUI();
}

// --- TAG FORM HANDLING ---
tagContainer.addEventListener('click', () => tagInput.focus());

tagInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(tagInput.value);
        tagInput.value = '';
    } else if (e.key === 'Backspace' && tagInput.value === '' && currentTags.length > 0) {
        removeTag(currentTags.length - 1);
    }
});

function addTag(text) {
    const tag = text.trim().toLowerCase().replace(/[^a-z0-9ąćęłńóśźż-]/g, '');
    if (tag && !currentTags.includes(tag)) {
        currentTags.push(tag);
        renderTagsInput();
    }
}

function removeTag(index) {
    currentTags.splice(index, 1);
    renderTagsInput();
}

function renderTagsInput() {
    const pills = tagContainer.querySelectorAll('.tag-pill');
    pills.forEach(p => p.remove());

    currentTags.forEach((tag, index) => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.innerHTML = `#${escapeHtml(tag)} <span>×</span>`;
        pill.querySelector('span').onclick = (e) => {
            e.stopPropagation();
            removeTag(index);
        };
        tagContainer.insertBefore(pill, tagInput);
    });
}

// --- SAVE AND EDIT ---
saveBtn.addEventListener('click', () => {
    const key = shortcutInput.value.trim();
    const text = replacementInput.value;

    if (!key || !text) {
        alert("Shortcut and content are required!");
        return;
    }

    if (tagInput.value.trim() !== '') {
        addTag(tagInput.value);
        tagInput.value = '';
    }

    const newItem = { text: text, tags: [...currentTags] };

    chrome.storage.local.get(['shortcuts'], (result) => {
        const shortcuts = result.shortcuts || {};
        
        if (editingOriginalKey && editingOriginalKey !== key) {
            delete shortcuts[editingOriginalKey];
            // Update bulk management if the key is modified
            if (selectedCards.has(editingOriginalKey)) {
                selectedCards.delete(editingOriginalKey);
                selectedCards.add(key);
                updateBulkUI();
            }
        }
        shortcuts[key] = newItem;
        
        chrome.storage.local.set({ shortcuts }, () => {
            resetForm();
            loadShortcuts();
        });
    });
});

function startEditing(key, item) {
    formTitle.innerText = "Edit Template";
    shortcutInput.value = key;
    replacementInput.value = item.text;
    editingOriginalKey = key;
    
    currentTags = [...(item.tags || [])];
    renderTagsInput();

    saveBtn.innerText = "Update";
    cancelBtn.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
    formTitle.innerText = "New Template";
    shortcutInput.value = '';
    replacementInput.value = '';
    tagInput.value = '';
    editingOriginalKey = null;
    currentTags = [];
    renderTagsInput();
    
    saveBtn.innerText = "Save Shortcut";
    cancelBtn.style.display = 'none';
}

cancelBtn.addEventListener('click', resetForm);

function removeShortcut(key) {
    if(!confirm(`Are you sure you want to delete shortcut "${key}"?`)) return;
    chrome.storage.local.get(['shortcuts'], (result) => {
        const shortcuts = result.shortcuts || {};
        delete shortcuts[key];
        
        if (editingOriginalKey === key) resetForm();
        
        // Safeguard for bulk actions - remove deleted key
        selectedCards.delete(key);
        updateBulkUI();
        
        chrome.storage.local.set({ shortcuts }, loadShortcuts);
    });
}

// --- EXPORT / IMPORT ---
document.getElementById('export-btn').addEventListener('click', () => {
    chrome.storage.local.get(['shortcuts'], (result) => {
        const jsonString = JSON.stringify(result.shortcuts || {}, null, 2);
        const blob = new Blob([jsonString], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'text-expander-templates.json';
        a.click();
        URL.revokeObjectURL(url);
    });
});

importBtn.addEventListener('click', () => {
    importFile.click();
});

importFile.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedShortcuts = JSON.parse(e.target.result);
            if (typeof importedShortcuts !== 'object' || importedShortcuts === null) throw new Error();
            
            chrome.storage.local.get(['shortcuts'], (result) => {
                const mergedShortcuts = { ...(result.shortcuts || {}), ...importedShortcuts };
                
                chrome.storage.local.set({ shortcuts: mergedShortcuts }, () => {
                    alert(`Success! Shortcuts imported.`);
                    loadShortcuts();
                    importFile.value = '';
                });
            });
        } catch (err) {
            alert("JSON file error. Make sure it's a valid backup.");
        }
    };
    reader.readAsText(file);
});

function escapeHtml(text) {
    if (!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
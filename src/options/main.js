// src/options/main.js
import { getShortcuts, getSettings, saveSetting, onStorageChange } from '../shared/storage.js';
import { renderStats, renderFilterTags, renderGrid, renderTagsInput } from './ui-render.js';
import { extractAllTags, addBulkTag, removeShortcut, saveShortcut } from './shortcuts.js';
import { exportToJSON, importFromJSON } from './import-export.js';

let allData = {};
let currentTags = [];
let editingOriginalKey = null;
let selectedFilters = new Set();
let selectedCards = new Set();

const shortcutInput = document.getElementById('shortcut');
const replacementInput = document.getElementById('replacement');
const tagInput = document.getElementById('tag-input');
const tagContainer = document.getElementById('tag-container');
const tagSuggestionsContainer = document.getElementById('tag-suggestions');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const formTitle = document.getElementById('form-title');
const searchInput = document.getElementById('search');

document.addEventListener('DOMContentLoaded', async () => {
    const settings = await getSettings();
    applyTheme(settings.theme === 'dark');
    loadSettingsUI(settings);
    
    allData = await getShortcuts();
    refreshUI();
    
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', async () => {
        const isDark = document.body.getAttribute('data-theme') !== 'dark';
        await saveSetting('theme', isDark ? 'dark' : 'light');
        applyTheme(isDark);
    });

    // Variable helpers
    document.querySelectorAll('.var-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const varText = btn.getAttribute('data-var');
            const start = replacementInput.selectionStart;
            const end = replacementInput.selectionEnd;
            replacementInput.value = replacementInput.value.substring(0, start) + varText + replacementInput.value.substring(end);
            replacementInput.selectionStart = replacementInput.selectionEnd = start + varText.length;
            replacementInput.focus();
        });
    });

    // Form handling
    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', resetForm);
    tagInput.addEventListener('keydown', handleTagInput);
    searchInput.addEventListener('input', applyFilters);
    
    // Import/Export
    document.getElementById('export-btn').addEventListener('click', exportToJSON);
    document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', handleImport);

    document.getElementById('clear-filters-btn').addEventListener('click', () => {
        selectedFilters.clear();
        searchInput.value = '';
        refreshUI();
    });
});

function applyTheme(isDark) {
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (isDark) {
        document.body.setAttribute('data-theme', 'dark');
        if (themeToggleBtn) themeToggleBtn.innerText = '☀️ Light theme';
    } else {
        document.body.removeAttribute('data-theme');
        if (themeToggleBtn) themeToggleBtn.innerText = '🌙 Dark theme';
    }
}

function loadSettingsUI(settings) {
    document.getElementById('paste-behavior').value = settings.pasteBehavior;
    document.getElementById('enable-sn-paste').checked = settings.enableSNPaste;
    document.getElementById('enable-sn-links').checked = settings.enableSNLinks;
    document.getElementById('enable-ghost-text').checked = settings.enableGhostText;
    document.getElementById('trigger-symbol').value = settings.triggerSymbol;

    // Setting listeners
    document.getElementById('paste-behavior').onchange = (e) => saveSetting('pasteBehavior', e.target.value);
    document.getElementById('enable-sn-paste').onchange = (e) => saveSetting('enableSNPaste', e.target.checked);
    document.getElementById('enable-sn-links').onchange = (e) => saveSetting('enableSNLinks', e.target.checked);
    document.getElementById('enable-ghost-text').onchange = (e) => saveSetting('enableGhostText', e.target.checked);
    document.getElementById('trigger-symbol').oninput = (e) => saveSetting('triggerSymbol', e.target.value);
}

async function refreshUI() {
    allData = await getShortcuts();
    const tags = extractAllTags(allData);
    
    renderFilterTags(tags, selectedFilters, (tag) => {
        if (selectedFilters.has(tag)) selectedFilters.delete(tag);
        else selectedFilters.add(tag);
        refreshUI();
    });
    
    applyFilters();
    
    chrome.storage.local.get(['stats'], (res) => {
        renderStats(res.stats || { usageCount: 0, charsSaved: 0 });
    });
}

function applyFilters() {
    const query = searchInput.value.toLowerCase();
    const filtered = {};

    for (const [key, item] of Object.entries(allData)) {
        const itemTags = item.tags || [];
        let matchesTags = true;
        if (selectedFilters.size > 0) {
            for (const fTag of selectedFilters) {
                if (!itemTags.includes(fTag)) { matchesTags = false; break; }
            }
        }
        let matchesSearch = true;
        if (query) {
            matchesSearch = key.toLowerCase().includes(query) || 
                            (item.text || "").toLowerCase().includes(query) || 
                            itemTags.some(t => t.toLowerCase().includes(query.replace('#', '')));
        }
        if (matchesTags && matchesSearch) filtered[key] = item;
    }

    renderGrid(filtered, selectedCards, {
        onEdit: (key, item) => {
            formTitle.innerText = "Edit Template";
            shortcutInput.value = key;
            replacementInput.value = item.text;
            editingOriginalKey = key;
            currentTags = [...(item.tags || [])];
            renderTagsInput(currentTags, tagInput, tagContainer, { onRemove: (idx) => { currentTags.splice(idx, 1); renderTagsInput(currentTags, tagInput, tagContainer, { onRemove: (i) => { currentTags.splice(i, 1); }, escapeHtml }); }, escapeHtml });
            saveBtn.innerText = "Update";
            cancelBtn.style.display = 'block';
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        onDelete: async (key) => {
            if (confirm(`Delete shortcut "${key}"?`)) {
                await removeShortcut(key);
                selectedCards.delete(key);
                refreshUI();
            }
        },
        onCheckboxToggle: (key, checked) => {
            if (checked) selectedCards.add(key);
            else selectedCards.delete(key);
            updateBulkUI();
        },
        escapeHtml
    });
}

function updateBulkUI() {
    let bulkContainer = document.getElementById('bulk-container');
    if (!bulkContainer && selectedCards.size > 0) {
        bulkContainer = document.createElement('div');
        bulkContainer.id = 'bulk-container';
        bulkContainer.className = 'bulk-container';
        bulkContainer.innerHTML = `<span class="bulk-label"><span id="bulk-count">0</span> selected</span><input type="text" id="bulk-tag-input" placeholder="Type new tag..."><button id="bulk-add-btn" class="btn btn-primary bulk-btn">Assign tag</button><button id="bulk-clear-btn" class="btn btn-secondary bulk-btn">Cancel</button>`;
        const grid = document.getElementById('grid');
        grid.parentNode.insertBefore(bulkContainer, grid);
        
        document.getElementById('bulk-add-btn').onclick = async () => {
            const input = document.getElementById('bulk-tag-input');
            const tag = input.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
            if (tag) {
                await addBulkTag(selectedCards, tag);
                selectedCards.clear();
                updateBulkUI();
                refreshUI();
            }
        };
        document.getElementById('bulk-clear-btn').onclick = () => { selectedCards.clear(); updateBulkUI(); applyFilters(); };
    }
    
    if (bulkContainer) {
        if (selectedCards.size > 0) {
            bulkContainer.style.display = 'flex';
            document.getElementById('bulk-count').innerText = selectedCards.size;
        } else {
            bulkContainer.style.display = 'none';
        }
    }
}

async function handleSave() {
    const key = shortcutInput.value.trim();
    const text = replacementInput.value;
    if (!key || !text) return alert("Shortcut and content are required!");

    const item = { text, tags: [...currentTags], usageCount: editingOriginalKey ? (allData[editingOriginalKey]?.usageCount || 0) : 0 };
    await saveShortcut(key, item, editingOriginalKey);
    resetForm();
    refreshUI();
}

function handleTagInput(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const tag = tagInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (tag && !currentTags.includes(tag)) {
            currentTags.push(tag);
            renderTagsInput(currentTags, tagInput, tagContainer, { onRemove: (idx) => { currentTags.splice(idx, 1); renderTagsInput(currentTags, tagInput, tagContainer, { onRemove: (i) => { currentTags.splice(i, 1); }, escapeHtml }); }, escapeHtml });
            tagInput.value = '';
        }
    }
}

async function handleImport(e) {
    const file = e.target.files[0];
    if (file) {
        await importFromJSON(file);
        refreshUI();
    }
}

function resetForm() {
    formTitle.innerText = "New Template";
    shortcutInput.value = '';
    replacementInput.value = '';
    tagInput.value = '';
    editingOriginalKey = null;
    currentTags = [];
    renderTagsInput(currentTags, tagInput, tagContainer, { onRemove: (idx) => { currentTags.splice(idx, 1); renderTagsInput(currentTags, tagInput, tagContainer, { onRemove: (i) => { currentTags.splice(i, 1); }, escapeHtml }); }, escapeHtml });
    saveBtn.innerText = "Save Shortcut";
    cancelBtn.style.display = 'none';
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

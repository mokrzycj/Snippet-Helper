// src/options/main.js
import { getShortcuts, getSettings, saveSetting, onStorageChange } from '../shared/storage.js';
import { renderStats, renderFilterTags, renderGrid, renderTagsInput } from './ui-render.js';
import { extractAllTags, addBulkTag, removeShortcut, removeShortcutsBulk, saveShortcut, findConflicts } from './shortcuts.js';
import { exportToJSON, importFromJSON } from './import-export.js';
import { TutorialManager } from './tutorial.js';

let allData = {};
let currentTags = [];
let editingOriginalKey = null;
let selectedFilters = new Set();
let selectedCards = new Set();
let filteredKeys = [];

const shortcutInput = document.getElementById('shortcut');
const replacementInput = document.getElementById('replacement');
const tagInput = document.getElementById('tag-input');
const tagContainer = document.getElementById('tag-container');
const tagSuggestionsContainer = document.getElementById('tag-suggestions');
const saveBtn = document.getElementById('save-btn');
const cancelBtn = document.getElementById('cancel-btn');
const formTitle = document.getElementById('form-title');
const searchInput = document.getElementById('search');
const selectAllCb = document.getElementById('select-all-cb');

document.addEventListener('DOMContentLoaded', async () => {
    const settings = await getSettings();
    applyTheme(settings.theme === 'dark');
    setTimeout(() => document.body.classList.add('ready'), 10);
    loadSettingsUI(settings);
    
    allData = await getShortcuts();
    refreshUI();

    const tutorial = new TutorialManager();
    tutorial.init();

    document.getElementById('show-guide-btn').onclick = () => tutorial.show();
    
    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', async () => {
        const isDark = document.documentElement.getAttribute('data-theme') !== 'dark';
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

    // Search Input
    searchInput.addEventListener('input', applyFilters);

    // Form handling
    saveBtn.addEventListener('click', handleSave);
    cancelBtn.addEventListener('click', resetForm);
    tagInput.addEventListener('keydown', handleTagInput);

    // Bulk Actions Setup
    document.getElementById('bulk-add-btn').onclick = async () => {
        const input = document.getElementById('bulk-tag-input');
        const tag = input.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        if (tag && selectedCards.size > 0) {
            await addBulkTag(Array.from(selectedCards), tag);
            input.value = '';
            selectedCards.clear();
            updateBulkUI();
            refreshUI();
        }
    };

    document.getElementById('bulk-delete-btn').onclick = async () => {
        if (selectedCards.size > 0 && await showConfirm("Bulk Delete", `Are you sure you want to delete ${selectedCards.size} shortcuts?`)) {
            await removeShortcutsBulk(Array.from(selectedCards));
            selectedCards.clear();
            updateBulkUI();
            refreshUI();
        }
    };

    document.getElementById('bulk-clear-btn').onclick = () => {
        selectedCards.clear();
        updateBulkUI();
        applyFilters();
    };

    // Select All
    selectAllCb.addEventListener('change', (e) => {
        if (e.target.checked) {
            filteredKeys.forEach(key => selectedCards.add(key));
        } else {
            selectedCards.clear();
        }
        updateBulkUI();
        applyFilters();
    });
    
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

async function showConfirm(title, body) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('modal-title');
        const bodyEl = document.getElementById('modal-body');
        const confirmBtn = document.getElementById('modal-confirm');
        const cancelBtn = document.getElementById('modal-cancel');

        titleEl.textContent = title;
        bodyEl.textContent = body;
        modal.style.display = 'flex';

        const cleanup = (val) => {
            modal.style.display = 'none';
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(val);
        };

        confirmBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);
    });
}

function applyTheme(isDark) {
    const themeToggleBtn = document.getElementById('theme-toggle');
    if (isDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggleBtn) themeToggleBtn.innerText = '☀️ Light theme';
    } else {
        document.documentElement.removeAttribute('data-theme');
        if (themeToggleBtn) themeToggleBtn.innerText = '🌙 Dark theme';
    }
}

function loadSettingsUI(settings) {
    document.getElementById('paste-behavior').value = settings.pasteBehavior;
    document.getElementById('enable-sn-paste').checked = settings.enableSNPaste;
    document.getElementById('enable-sn-links').checked = settings.enableSNLinks;
    document.getElementById('enable-sn-list-copy').checked = settings.enableSNListCopy;
    document.getElementById('enable-ghost-text').checked = settings.enableGhostText;
    document.getElementById('trigger-symbol').value = settings.triggerSymbol;

    // Setting listeners
    document.getElementById('paste-behavior').onchange = (e) => saveSetting('pasteBehavior', e.target.value);
    document.getElementById('enable-sn-paste').onchange = (e) => saveSetting('enableSNPaste', e.target.checked);
    document.getElementById('enable-sn-links').onchange = (e) => saveSetting('enableSNLinks', e.target.checked);
    document.getElementById('enable-sn-list-copy').onchange = (e) => saveSetting('enableSNListCopy', e.target.checked);
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
    filteredKeys = [];

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
        if (matchesTags && matchesSearch) {
            filtered[key] = item;
            filteredKeys.push(key);
        }
    }

    // Update Select All checkbox state
    if (filteredKeys.length > 0) {
        const allSelected = filteredKeys.every(k => selectedCards.has(k));
        selectAllCb.checked = allSelected;
        selectAllCb.indeterminate = !allSelected && filteredKeys.some(k => selectedCards.has(k));
    } else {
        selectAllCb.checked = false;
        selectAllCb.indeterminate = false;
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
            if (await showConfirm("Delete Shortcut", `Are you sure you want to delete "${key}"?`)) {
                await removeShortcut(key);
                selectedCards.delete(key);
                refreshUI();
            }
        },
        onCheckboxToggle: (key, checked) => {
            if (checked) selectedCards.add(key);
            else selectedCards.delete(key);
            updateBulkUI();
            applyFilters(); // To update Select All checkbox state
        },
        escapeHtml
    });
}

function updateBulkUI() {
    const bulkContainer = document.getElementById('bulk-actions-inline');
    if (bulkContainer) {
        bulkContainer.style.display = selectedCards.size > 0 ? 'flex' : 'none';
    }
}

async function handleSave() {
    const key = shortcutInput.value.trim();
    const text = replacementInput.value;
    if (!key || !text) return alert("Shortcut and content are required!");

    const conflicts = findConflicts(key, allData, editingOriginalKey);
    if (conflicts.length > 0) {
        const body = `Conflict detected:\n${conflicts.join('\n')}\n\nThis can cause issues with Ghost Text. Save anyway?`;
        if (!(await showConfirm("Conflict Detected", body))) return;
    }

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

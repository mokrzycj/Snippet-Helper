// src/background/service-worker.js
import { STORAGE_KEYS, DEFAULT_SETTINGS } from '../shared/constants.js';
import { getShortcuts, saveShortcuts, migrateFormatIfNeeded } from '../shared/storage.js';

chrome.runtime.onInstalled.addListener(async (details) => {
    // 1. Initialize Default Settings if missing
    const settingsKeys = Object.values(STORAGE_KEYS).filter(k => k !== STORAGE_KEYS.SHORTCUTS && k !== STORAGE_KEYS.STATS);
    const currentSettings = await chrome.storage.local.get(settingsKeys);
    
    const updates = {};
    for (const [key, defaultValue] of Object.entries(DEFAULT_SETTINGS)) {
        if (currentSettings[key] === undefined) {
            updates[key] = defaultValue;
        }
    }
    
    if (Object.keys(updates).length > 0) {
        await chrome.storage.local.set(updates);
    }

    // 2. Initial Data Migration
    const shortcuts = await getShortcuts();
    const { shortcuts: migrated, migrated: needsSave } = migrateFormatIfNeeded(shortcuts);
    if (needsSave) {
        await saveShortcuts(migrated);
    }

    // 3. First-run experience: Open options page on install
    if (details.reason === 'install') {
        chrome.runtime.openOptionsPage();
    }
});

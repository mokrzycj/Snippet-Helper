// src/shared/storage.js
import { STORAGE_KEYS, DEFAULT_SETTINGS } from './constants.js';

export function getShortcuts() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEYS.SHORTCUTS], (result) => {
            const rawShortcuts = result.shortcuts || {};
            const { shortcuts: migrated, migrated: needsSave } = migrateFormatIfNeeded(rawShortcuts);
            
            if (needsSave) {
                chrome.storage.local.set({ [STORAGE_KEYS.SHORTCUTS]: migrated }, () => {
                    resolve(migrated);
                });
            } else {
                resolve(rawShortcuts);
            }
        });
    });
}

export function saveShortcuts(shortcuts) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [STORAGE_KEYS.SHORTCUTS]: shortcuts }, resolve);
    });
}

export function getSettings() {
    const keys = [
        STORAGE_KEYS.TRIGGER_SYMBOL,
        STORAGE_KEYS.ENABLE_GHOST_TEXT,
        STORAGE_KEYS.ENABLE_SN_PASTE,
        STORAGE_KEYS.ENABLE_SN_LINKS,
        STORAGE_KEYS.PASTE_BEHAVIOR,
        STORAGE_KEYS.THEME
    ];
    
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => {
            resolve({
                triggerSymbol: result.triggerSymbol ?? DEFAULT_SETTINGS.triggerSymbol,
                enableGhostText: result.enableGhostText ?? DEFAULT_SETTINGS.enableGhostText,
                enableSNPaste: result.enableSNPaste ?? DEFAULT_SETTINGS.enableSNPaste,
                enableSNLinks: result.enableSNLinks ?? DEFAULT_SETTINGS.enableSNLinks,
                pasteBehavior: result.pasteBehavior ?? DEFAULT_SETTINGS.pasteBehavior,
                theme: result.theme ?? DEFAULT_SETTINGS.theme
            });
        });
    });
}

export function saveSetting(key, value) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, resolve);
    });
}

export function onStorageChange(callback) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            callback(changes);
        }
    });
}

export function migrateFormatIfNeeded(shortcuts) {
    let needsSave = false;
    let newShortcuts = {};
    for (let key in shortcuts) {
        if (typeof shortcuts[key] === 'string') {
            newShortcuts[key] = { text: shortcuts[key], tags: [], usageCount: 0 };
            needsSave = true;
        } else {
            newShortcuts[key] = shortcuts[key];
            if (newShortcuts[key].usageCount === undefined) {
                newShortcuts[key].usageCount = 0;
                needsSave = true;
            }
        }
    }
    return { shortcuts: newShortcuts, migrated: needsSave };
}

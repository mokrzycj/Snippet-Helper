// src/options/shortcuts.js
import { saveShortcuts, getShortcuts } from '../shared/storage.js';

export function extractAllTags(allData) {
    const tagsSet = new Set();
    for (const item of Object.values(allData)) {
        if (item.tags) {
            item.tags.forEach(t => tagsSet.add(t));
        }
    }
    return Array.from(tagsSet).sort();
}

export async function addBulkTag(selectedKeys, newTag) {
    const shortcuts = await getShortcuts();
    let updated = false;

    for (const key of selectedKeys) {
        if (shortcuts[key]) {
            if (!shortcuts[key].tags) shortcuts[key].tags = [];
            if (!shortcuts[key].tags.includes(newTag)) {
                shortcuts[key].tags.push(newTag);
                updated = true;
            }
        }
    }

    if (updated) {
        await saveShortcuts(shortcuts);
    }
    return updated;
}

export async function removeShortcut(key) {
    const shortcuts = await getShortcuts();
    delete shortcuts[key];
    await saveShortcuts(shortcuts);
}

export async function removeShortcutsBulk(keys) {
    const shortcuts = await getShortcuts();
    keys.forEach(key => delete shortcuts[key]);
    await saveShortcuts(shortcuts);
}

export async function saveShortcut(key, item, editingOriginalKey) {
    const shortcuts = await getShortcuts();
    
    if (editingOriginalKey && editingOriginalKey !== key) {
        delete shortcuts[editingOriginalKey];
    }
    
    shortcuts[key] = item;
    await saveShortcuts(shortcuts);
}

export function findConflicts(key, allData, editingOriginalKey) {
    const conflicts = [];
    for (const existingKey of Object.keys(allData)) {
        if (existingKey === editingOriginalKey) continue;
        
        if (existingKey.startsWith(key) && existingKey !== key) {
            conflicts.push(`"${key}" is a prefix of existing shortcut "${existingKey}"`);
        } else if (key.startsWith(existingKey) && existingKey !== key) {
            conflicts.push(`Existing shortcut "${existingKey}" is a prefix of "${key}"`);
        }
    }
    return conflicts;
}

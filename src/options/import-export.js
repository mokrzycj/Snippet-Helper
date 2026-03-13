// src/options/import-export.js
import { getShortcuts, saveShortcuts } from '../shared/storage.js';

export async function exportToJSON() {
    const shortcuts = await getShortcuts();
    const jsonString = JSON.stringify(shortcuts, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'text-expander-templates.json';
    a.click();
    URL.revokeObjectURL(url);
}

export async function importFromJSON(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedShortcuts = JSON.parse(e.target.result);
                if (typeof importedShortcuts !== 'object' || importedShortcuts === null) {
                    throw new Error("Invalid format");
                }
                
                const existingShortcuts = await getShortcuts();
                const mergedShortcuts = { ...existingShortcuts, ...importedShortcuts };
                await saveShortcuts(mergedShortcuts);
                resolve(mergedShortcuts);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsText(file);
    });
}

// src/content/main.js
import { MAX_LOOKBACK, STORAGE_KEYS } from '../shared/constants.js';
import { getShortcuts, getSettings, onStorageChange, migrateFormatIfNeeded, saveShortcuts } from '../shared/storage.js';
import { ShortcutEngine } from './trie.js';
import { GhostTextManager } from './ghost-text.js';
import { replaceText } from './expander.js';
import { linkifyStream, getRecordContext, isSafeRecordPage, uploadImageDirectly } from './servicenow.js';

const engine = new ShortcutEngine();
const ghost = new GhostTextManager();
let settings = {};
let SHORTCUTS = {}; // Keep a local reference for the popup

// --- INITIALIZATION ---

async function init() {
    const shortcuts = await getShortcuts();
    SHORTCUTS = shortcuts;
    engine.update(shortcuts);
    
    settings = await getSettings();

    // ServiceNow specific setup
    if (window.location.hostname.includes('service-now.com')) {
        const observer = new MutationObserver(() => {
            clearTimeout(window.snBoosterT);
            window.snBoosterT = setTimeout(() => linkifyStream(settings.enableSNLinks), 500);
        });
        observer.observe(document.body, { childList: true, subtree: true });
        setTimeout(() => linkifyStream(settings.enableSNLinks), 2000);
    }
}

init();

onStorageChange((changes) => {
    if (changes[STORAGE_KEYS.SHORTCUTS]) {
        SHORTCUTS = changes[STORAGE_KEYS.SHORTCUTS].newValue || {};
        engine.update(SHORTCUTS);
    }
    if (changes[STORAGE_KEYS.TRIGGER_SYMBOL]) {
        settings.triggerSymbol = changes[STORAGE_KEYS.TRIGGER_SYMBOL].newValue;
    }
    if (changes[STORAGE_KEYS.ENABLE_GHOST_TEXT]) {
        settings.enableGhostText = changes[STORAGE_KEYS.ENABLE_GHOST_TEXT].newValue;
        if (!settings.enableGhostText) ghost.hide();
    }
    if (changes[STORAGE_KEYS.ENABLE_SN_LINKS]) {
        settings.enableSNLinks = changes[STORAGE_KEYS.ENABLE_SN_LINKS].newValue;
    }
    if (changes[STORAGE_KEYS.ENABLE_SN_PASTE]) {
        settings.enableSNPaste = changes[STORAGE_KEYS.ENABLE_SN_PASTE].newValue;
    }
});

// --- HELPERS ---

function getDeepActiveElement() {
    let el = document.activeElement;
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
        el = el.shadowRoot.activeElement;
    }
    return el;
}

function getTextBeforeCursor(element, maxLength) {
    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        const start = element.selectionStart;
        if (typeof start !== 'number') return "";
        return element.value.substring(Math.max(0, start - maxLength), start);
    } 
    else if (element.isContentEditable) {
        const root = element.getRootNode();
        const selection = (root.getSelection ? root.getSelection() : null) || window.getSelection();
        if (!selection || !selection.rangeCount) return "";
        const range = selection.getRangeAt(0);
        const node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) { 
            return node.textContent.substring(Math.max(0, range.startOffset - maxLength), range.startOffset);
        } else {
            const textContent = node.textContent || "";
            return textContent.substring(Math.max(0, range.startOffset - maxLength), range.startOffset);
        }
    }
    return "";
}

function updateStats(shortcutKey, saved) {
    chrome.storage.local.get(['stats', 'shortcuts'], (res) => {
        const stats = res.stats || { usageCount: 0, charsSaved: 0 };
        stats.usageCount++;
        if (saved > 0) stats.charsSaved += saved;
        
        const shortcuts = res.shortcuts || {};
        if (shortcutKey && shortcuts[shortcutKey]) {
            if (typeof shortcuts[shortcutKey] === 'string') {
                shortcuts[shortcutKey] = { text: shortcuts[shortcutKey], tags: [], usageCount: 1 };
            } else {
                shortcuts[shortcutKey].usageCount = (shortcuts[shortcutKey].usageCount || 0) + 1;
            }
        }
        chrome.storage.local.set({ stats, shortcuts });
    });
}

// --- UI PROMPTS ---

async function showPrompt(label) {
    return new Promise((resolve) => {
        const activeEl = getDeepActiveElement();
        if (!activeEl) return resolve("");
        const rect = activeEl.getBoundingClientRect();
        const promptDiv = document.createElement('div');
        
        chrome.storage.local.get(['theme'], (res) => {
            const isDark = res.theme === 'dark';
            promptDiv.style.cssText = `position: fixed; top: ${Math.max(10, rect.top - 100)}px; left: ${rect.left}px; background: ${isDark ? '#1e1e1e' : '#fff'}; color: ${isDark ? '#e0e0e0' : '#333'}; border: 2px solid #278efc; padding: 15px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 2147483647; display: flex; flex-direction: column; gap: 10px; min-width: 240px; font-family: sans-serif;`;
            
            const labelEl = document.createElement('div');
            labelEl.style.cssText = "font-size: 11px; font-weight: bold; color: #278efc; text-transform: uppercase;";
            labelEl.textContent = label;

            const input = document.createElement('input');
            input.type = 'text';
            input.id = 'sn-prompt-input';
            input.style.cssText = `width: 100%; padding: 10px; border: 1px solid ${isDark ? '#444' : '#ccc'}; border-radius: 4px; outline: none; box-sizing: border-box; background: ${isDark ? '#2c2c2c' : '#fff'}; color: ${isDark ? '#fff' : '#000'};`;
            
            const hint = document.createElement('div');
            hint.style.cssText = `font-size: 10px; color: ${isDark ? '#aaa' : '#999'};`;
            hint.textContent = "Press Enter to insert, Esc to cancel";

            promptDiv.appendChild(labelEl);
            promptDiv.appendChild(input);
            promptDiv.appendChild(hint);
            document.body.appendChild(promptDiv);
            
            input.focus();
            const cleanup = () => { promptDiv.remove(); activeEl.focus(); };
            input.onkeydown = (e) => { if (e.key === 'Enter') { const val = input.value; cleanup(); resolve(val); } else if (e.key === 'Escape') { cleanup(); resolve(""); } };
            const clickHandler = (e) => { if (!promptDiv.contains(e.target)) { document.removeEventListener('mousedown', clickHandler); cleanup(); resolve(""); } };
            setTimeout(() => document.addEventListener('mousedown', clickHandler), 10);
        });
    });
}

async function showSelection(options) {
    return new Promise((resolve) => {
        const activeEl = getDeepActiveElement();
        if (!activeEl) return resolve("");
        const rect = activeEl.getBoundingClientRect();
        const promptDiv = document.createElement('div');
        
        chrome.storage.local.get(['theme'], (res) => {
            const isDark = res.theme === 'dark';
            promptDiv.style.cssText = `position: fixed; top: ${Math.max(10, rect.top - 120)}px; left: ${rect.left}px; background: ${isDark ? '#1e1e1e' : '#fff'}; color: ${isDark ? '#e0e0e0' : '#333'}; border: 2px solid #278efc; padding: 10px; border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.3); z-index: 2147483647; display: flex; flex-direction: column; gap: 5px; min-width: 260px; font-family: sans-serif;`;
            
            let selectedIndex = 0;
            let lastMouseX = -1;
            let lastMouseY = -1;

            const updateSelection = () => {
                const items = promptDiv.querySelectorAll('.sn-select-opt');
                items.forEach((el, idx) => {
                    const sel = idx === selectedIndex;
                    el.style.background = sel ? (isDark ? '#333' : '#eef6ff') : 'transparent';
                    el.style.borderColor = sel ? '#278efc' : (isDark ? '#333' : '#eee');
                });
            };

            const renderOptions = () => {
                promptDiv.innerHTML = ""; // Clear
                const title = document.createElement('div');
                title.style.cssText = "font-size: 11px; font-weight: bold; color: #278efc; text-transform: uppercase; margin-bottom: 5px; padding: 0 5px;";
                title.textContent = "Select Identity";
                promptDiv.appendChild(title);

                options.forEach((opt, idx) => {
                    const btn = document.createElement('div');
                    btn.className = 'sn-select-opt';
                    btn.style.cssText = `text-align: left; padding: 10px; border: 1px solid transparent; border-radius: 4px; cursor: pointer; font-size: 13px; transition: 0.1s;`;
                    
                    const labelSpan = document.createElement('b');
                    labelSpan.style.color = isDark ? '#ffb74d' : '#e67e22';
                    labelSpan.textContent = opt.label + ": ";
                    
                    btn.appendChild(labelSpan);
                    btn.appendChild(document.createTextNode(opt.value));
                    
                    btn.onmousedown = (e) => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        resolve(opt.value); 
                        cleanup(); 
                    };

                    btn.onmousemove = (e) => {
                        if (e.clientX !== lastMouseX || e.clientY !== lastMouseY) {
                            lastMouseX = e.clientX;
                            lastMouseY = e.clientY;
                            if (selectedIndex !== idx) {
                                selectedIndex = idx;
                                updateSelection();
                            }
                        }
                    };
                    promptDiv.appendChild(btn);
                });
                updateSelection();
            };

            const cleanup = () => { 
                document.removeEventListener('keydown', keyHandler); 
                document.removeEventListener('mousedown', clickHandler); 
                promptDiv.remove(); 
                activeEl.focus(); 
            };

            const keyHandler = (e) => {
                if (e.key === 'ArrowDown') { 
                    e.preventDefault(); 
                    selectedIndex = (selectedIndex + 1) % options.length; 
                    updateSelection(); 
                } else if (e.key === 'ArrowUp') { 
                    e.preventDefault(); 
                    selectedIndex = (selectedIndex - 1 + options.length) % options.length; 
                    updateSelection(); 
                } else if (e.key === 'Enter') { 
                    e.preventDefault(); 
                    resolve(options[selectedIndex].value); 
                    cleanup(); 
                } else if (e.key === 'Escape') { 
                    e.preventDefault(); 
                    cleanup(); 
                    resolve(""); 
                }
            };

            const clickHandler = (e) => { if (!promptDiv.contains(e.target)) { cleanup(); resolve(""); } };
            
            renderOptions();
            document.body.appendChild(promptDiv);
            document.addEventListener('keydown', keyHandler);
            setTimeout(() => document.addEventListener('mousedown', clickHandler), 10);
        });
    });
}

function showShortcutPopup(activeEl, trigger) {
    if (document.getElementById('sn-shortcut-popup')) return;
    const rect = activeEl.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.id = 'sn-shortcut-popup';
    
    chrome.storage.local.get(['theme'], (res) => {
        const isDark = res.theme === 'dark';
        popup.style.cssText = `position: fixed; top: ${Math.max(10, rect.top + 25)}px; left: ${rect.left}px; width: 350px; background: ${isDark ? '#1e1e1e' : '#fff'}; color: ${isDark ? '#e0e0e0' : '#333'}; border: 2px solid #278efc; padding: 10px; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); z-index: 2147483647; font-family: sans-serif; display: flex; flex-direction: column; gap: 10px;`;
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.id = 'sn-popup-search';
        searchInput.placeholder = 'Search templates...';
        searchInput.style.cssText = `width: 100%; padding: 8px; border: 1px solid ${isDark ? '#444' : '#ccc'}; border-radius: 4px; background: ${isDark ? '#2c2c2c' : '#fff'}; color: ${isDark ? '#fff' : '#000'}; outline: none; box-sizing: border-box;`;
        
        const listContainer = document.createElement('div');
        listContainer.id = 'sn-popup-list';
        listContainer.style.cssText = 'max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;';
        
        popup.appendChild(searchInput);
        popup.appendChild(listContainer);
        document.body.appendChild(popup);
        
        searchInput.focus();
        
        let selectedIndex = 0;
        let filteredKeys = [];
        let lastMouseX = -1;
        let lastMouseY = -1;

        const updateSelection = () => {
            const items = listContainer.querySelectorAll('.sn-popup-item');
            items.forEach((el, idx) => {
                const isSelected = idx === selectedIndex;
                el.style.background = isSelected ? (isDark ? '#333' : '#eef6ff') : 'transparent';
                el.style.borderColor = isSelected ? '#278efc' : (isDark ? '#333' : '#eee');
                if (isSelected) el.scrollIntoView({ block: 'nearest' });
            });
        };

        const renderList = () => {
            const query = searchInput.value.toLowerCase();
            const allKeys = Object.keys(SHORTCUTS);
            filteredKeys = allKeys.filter(key => {
                const item = SHORTCUTS[key];
                return key.toLowerCase().includes(query) || (item.text || "").toLowerCase().includes(query) || (item.tags && item.tags.some(t => t.toLowerCase().includes(query)));
            }).sort((a, b) => (SHORTCUTS[b].usageCount || 0) - (SHORTCUTS[a].usageCount || 0));
            
            selectedIndex = 0;
            listContainer.innerHTML = '';
            
            filteredKeys.forEach((key, idx) => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'sn-popup-item';
                itemDiv.style.cssText = `padding: 8px; border-radius: 4px; border: 1px solid transparent; cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: background 0.1s;`;
                
                const headerDiv = document.createElement('div');
                headerDiv.style.cssText = 'display: flex; justify-content: space-between; align-items: center; pointer-events: none;';
                
                const keyB = document.createElement('b');
                keyB.style.cssText = `color: ${isDark ? '#ffb74d' : '#e67e22'}; font-size: 13px;`;
                keyB.textContent = key;
                
                const usageSpan = document.createElement('span');
                usageSpan.style.cssText = `font-size: 10px; color: ${isDark ? '#aaa' : '#999'};`;
                usageSpan.textContent = `Used: ${SHORTCUTS[key].usageCount || 0}`;
                
                headerDiv.appendChild(keyB);
                headerDiv.appendChild(usageSpan);
                
                const textDiv = document.createElement('div');
                textDiv.style.cssText = `font-size: 11px; color: ${isDark ? '#aaa' : '#666'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;`;
                textDiv.textContent = (SHORTCUTS[key].text || "").substring(0, 60);
                
                itemDiv.appendChild(headerDiv);
                itemDiv.appendChild(textDiv);
                
                itemDiv.onmousedown = (e) => { 
                    e.preventDefault(); 
                    e.stopPropagation();
                    selectItem(key); 
                };

                itemDiv.onmousemove = (e) => {
                    if (e.clientX !== lastMouseX || e.clientY !== lastMouseY) {
                        lastMouseX = e.clientX;
                        lastMouseY = e.clientY;
                        if (selectedIndex !== idx) {
                            selectedIndex = idx;
                            updateSelection();
                        }
                    }
                };
                listContainer.appendChild(itemDiv);
            });
            updateSelection();
        };

        const selectItem = (key) => { 
            cleanup(true); 
            replaceText(activeEl, trigger, SHORTCUTS[key].text, key, { showPrompt, showSelection, updateStats }); 
        };

        const cleanup = (isSelection = false) => { 
            popup.remove(); 
            activeEl.focus(); 

            if (!isSelection) {
                if (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') {
                    const val = activeEl.value;
                    const start = activeEl.selectionStart;
                    if (val.substring(start - trigger.length, start) === trigger) {
                        const newVal = val.substring(0, start - trigger.length) + val.substring(start);
                        activeEl.value = newVal;
                        activeEl.setSelectionRange(start - trigger.length, start - trigger.length);
                        activeEl.dispatchEvent(new InputEvent('input', { bubbles: true }));
                    }
                } else if (activeEl.isContentEditable) {
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        for (let i = 0; i < trigger.length; i++) {
                            selection.modify('extend', 'backward', 'character');
                        }
                        const range = selection.getRangeAt(0);
                        range.deleteContents();
                    }
                }
            }
        };

        searchInput.oninput = renderList;
        searchInput.onkeydown = (e) => {
            if (e.key === 'ArrowDown') { 
                e.preventDefault(); 
                selectedIndex = (selectedIndex + 1) % Math.max(1, filteredKeys.length); 
                updateSelection(); 
            } else if (e.key === 'ArrowUp') { 
                e.preventDefault(); 
                selectedIndex = (selectedIndex - 1 + filteredKeys.length) % Math.max(1, filteredKeys.length); 
                updateSelection(); 
            } else if (e.key === 'Enter') { 
                e.preventDefault(); 
                if (filteredKeys[selectedIndex]) selectItem(filteredKeys[selectedIndex]); 
            } else if (e.key === 'Escape') { 
                e.preventDefault(); 
                cleanup(); 
            }
        };

        const clickHandler = (e) => { if (!popup.contains(e.target)) { document.removeEventListener('mousedown', clickHandler); cleanup(); } };
        setTimeout(() => document.addEventListener('mousedown', clickHandler), 10);
        renderList();
    });
}

// --- EVENT LISTENERS ---

window.addEventListener('input', (event) => {
    let target = event.target;
    if (!target || target.shadowRoot) {
        const deepTarget = getDeepActiveElement();
        if (deepTarget) target = deepTarget;
    }
    if (!target) return;

    const text = getTextBeforeCursor(target, MAX_LOOKBACK);
    if (text.length === 0) { ghost.hide(); return; }

    // Check for Trigger Symbol
    if (settings.triggerSymbol && text.endsWith(settings.triggerSymbol)) {
        ghost.hide();
        showShortcutPopup(target, settings.triggerSymbol);
        return;
    }

    // Try Standard Expansion
    const match = engine.findExactMatch(text);
    if (match) {
        ghost.hide();
        event.preventDefault();
        event.stopImmediatePropagation();
        replaceText(target, match.shortcut, typeof match.data === 'string' ? match.data : match.data.text, match.shortcut, { showPrompt, showSelection, updateStats });
        return;
    }

    // Try Ghost Text
    if (settings.enableGhostText && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
        const start = target.selectionStart || 0;
        const textAfter = target.value.substring(start);
        
        // Reliability: Only show if cursor is at the end of the current line OR followed only by whitespace/newlines on this line
        const currentLineAfter = textAfter.split('\n')[0];
        if (/[^\s]/.test(currentLineAfter)) {
            ghost.hide();
            return;
        }

        const lastWord = text.split(/\s/).pop();
        const gMatch = engine.findTrieMatch(lastWord);
        if (gMatch) ghost.show(target, gMatch, lastWord);
        else ghost.hide();
    } else ghost.hide();
}, true);

window.addEventListener('keydown', (e) => {
    if (settings.enableGhostText && e.key === 'Tab' && ghost.isActive() && ghost.targetElement) {
        const target = ghost.targetElement;
        const match = ghost.activeMatch;
        const prefix = target.value.substring(0, target.selectionStart).split(/\s/).pop();
        e.preventDefault(); e.stopImmediatePropagation();
        const suffix = match.shortcut.substring(prefix.length);
        target.setRangeText(suffix, target.selectionStart, target.selectionEnd, 'end');
        ghost.hide();
        replaceText(target, match.shortcut, match.text, match.shortcut, { showPrompt, showSelection, updateStats });
    } else if (e.key === 'Escape') ghost.hide();
}, true);

window.addEventListener('blur', (e) => {
    ghost.hide();
}, true);

document.addEventListener('paste', (event) => {
    if (settings.enableSNPaste === false) return;
    const context = getRecordContext();
    if (!isSafeRecordPage(context)) return;
    
    const items = (event.clipboardData || event.originalEvent?.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
            const blob = item.getAsFile();
            if (settings.pasteBehavior === 'auto') uploadImageDirectly(blob, context);
            else createStagedPreview(blob, context);
        }
    }
});

function createStagedPreview(blob, context) {
    let tray = document.getElementById('sn-booster-floating-tray');
    if (!tray) {
        tray = document.createElement('div');
        tray.id = 'sn-booster-floating-tray';
        tray.style.cssText = "position: fixed; bottom: 30px; right: 30px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; font-family: sans-serif;";
        document.body.appendChild(tray);
    }
    const wrapper = document.createElement('div');
    const url = URL.createObjectURL(blob);
    wrapper.style.cssText = "width: 250px; display: flex; flex-direction: column; gap: 8px; border: 1px solid #ccc; padding: 10px; background: white; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);";
    
    const header = document.createElement('div');
    header.style.cssText = "font-size: 11px; font-weight: bold; color: #555; text-transform: uppercase;";
    header.textContent = `Attach to: ${context.tableName}`;
    
    const img = document.createElement('img');
    img.src = url;
    img.style.cssText = "width: 100%; max-height: 180px; object-fit: contain; border: 1px solid #eee; background: #fafafa;";
    
    const btnGroup = document.createElement('div');
    btnGroup.style.cssText = "display: flex; gap: 10px;";
    
    const upBtn = document.createElement('button');
    upBtn.id = "up-btn";
    upBtn.style.cssText = "flex: 2; background: #278efc; color: white; border: none; padding: 8px; cursor: pointer; font-weight: bold; border-radius: 3px;";
    upBtn.textContent = "Upload (↵)";
    
    const delBtn = document.createElement('button');
    delBtn.id = "del-btn";
    delBtn.style.cssText = "flex: 1; background: #f44336; color: white; border: none; padding: 8px; cursor: pointer; border-radius: 3px;";
    delBtn.textContent = "Discard (Esc)";
    
    btnGroup.appendChild(upBtn);
    btnGroup.appendChild(delBtn);
    
    wrapper.appendChild(header);
    wrapper.appendChild(img);
    wrapper.appendChild(btnGroup);

    const cleanup = () => { window.removeEventListener('keydown', handleKeys); URL.revokeObjectURL(url); wrapper.remove(); if (tray && !tray.children.length) tray.remove(); };
    const handleKeys = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(); }
        else if (e.key === 'Enter') {
            const active = document.activeElement;
            if (!(active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable))) { e.preventDefault(); uploadAction(); }
        }
    };
    const uploadAction = async () => {
        upBtn.disabled = true;
        upBtn.textContent = "Uploading...";
        if (await uploadImageDirectly(blob, context)) {
            wrapper.innerHTML = "";
            const successMsg = document.createElement('b');
            successMsg.style.cssText = "color: #4CAF50; text-align: center; display: block;";
            successMsg.textContent = "✅ Successfully Attached";
            wrapper.appendChild(successMsg);
            setTimeout(cleanup, 2500);
        } else { alert("Upload failed."); cleanup(); }
    };
    upBtn.onclick = uploadAction;
    delBtn.onclick = cleanup;
    window.addEventListener('keydown', handleKeys);
    tray.appendChild(wrapper);
}

// content.js - TEXT EXPANDER + SERVICENOW PRODUCTIVITY BOOSTER

let SHORTCUTS = {};
let shortcutsByLastChar = new Map();
let trieRoot = {}; // For Ghost Text (Type-ahead)
let triggerSymbol = ';;';
let enableGhostText = true;
const MAX_LOOKBACK = 30;
const CURSOR_MARKER = "|";
const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/g;

// --- GHOST TEXT STATE ---
let ghostState = {
    element: null,
    activeMatch: null, // { shortcut, fullText }
    targetElement: null
};

// --- SHORTCUT CACHE & CONFIG ---

function buildTrie() {
    trieRoot = {};
    for (const [shortcut, data] of Object.entries(SHORTCUTS)) {
        let node = trieRoot;
        for (const char of shortcut) {
            if (!node[char]) node[char] = {};
            node = node[char];
        }
        node.$ = (typeof data === 'string' ? data : data.text);
    }
}

function findTrieMatch(prefix) {
    if (!prefix || prefix.length < 2) return null;
    let node = trieRoot;
    for (const char of prefix) {
        if (!node[char]) return null;
        node = node[char];
    }
    // Deep search for the first available terminal node ($)
    const findFirst = (n, currentPath) => {
        if (n.$) return { shortcut: prefix + currentPath, text: n.$ };
        for (const char in n) {
            if (char === '$') continue;
            const found = findFirst(n[char], currentPath + char);
            if (found) return found;
        }
        return null;
    };
    return findFirst(node, "");
}

function updateShortcutCache() {
    shortcutsByLastChar = new Map();
    for (const [shortcut, data] of Object.entries(SHORTCUTS)) {
        if (shortcut.length === 0) continue;
        const lastChar = shortcut.slice(-1);
        if (!shortcutsByLastChar.has(lastChar)) {
            shortcutsByLastChar.set(lastChar, []);
        }
        shortcutsByLastChar.get(lastChar).push({ shortcut, data });
    }
    // Sort by length descending to match more specific shortcuts first (e.g., 'trep//' before 'ep//')
    for (const candidates of shortcutsByLastChar.values()) {
        candidates.sort((a, b) => b.shortcut.length - a.shortcut.length);
    }
    buildTrie();
}

chrome.storage.local.get(['shortcuts', 'triggerSymbol', 'enableGhostText'], (result) => {
    if (result.shortcuts) {
        SHORTCUTS = result.shortcuts;
        updateShortcutCache();
    }
    if (result.triggerSymbol) {
        triggerSymbol = result.triggerSymbol;
    }
    enableGhostText = result.enableGhostText !== false;
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.shortcuts) {
            SHORTCUTS = changes.shortcuts.newValue || {};
            updateShortcutCache();
        }
        if (changes.triggerSymbol) {
            triggerSymbol = changes.triggerSymbol.newValue || ';;';
        }
        if (changes.enableGhostText) {
            enableGhostText = changes.enableGhostText.newValue !== false;
            if (!enableGhostText) hideGhost();
        }
    }
});

// --- CORE TEXT EXPANDER LOGIC ---

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

// --- GHOST UI ENGINE ---

function getCaretCoordinates(element) {
    const isTextArea = element.tagName === 'TEXTAREA';
    const div = document.createElement('div');
    const style = window.getComputedStyle(element);
    
    // Mimic the element's style
    const properties = [
        'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
        'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
        'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize'
    ];
    
    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordBreak = 'break-all';
    
    properties.forEach(prop => {
        div.style[prop] = style[prop];
    });

    const textBefore = isTextArea ? element.value.substring(0, element.selectionStart) : element.value;
    div.textContent = textBefore;

    const span = document.createElement('span');
    span.textContent = element.value.substring(element.selectionStart) || '.';
    div.appendChild(span);

    document.body.appendChild(div);
    const rect = element.getBoundingClientRect();
    const spanRect = span.getBoundingClientRect();
    const coords = {
        top: rect.top + (span.offsetTop - element.scrollTop),
        left: rect.left + (span.offsetLeft - element.scrollLeft)
    };
    document.body.removeChild(div);
    return coords;
}

function showGhost(target, match, prefix) {
    if (!ghostState.element) {
        ghostState.element = document.createElement('div');
        ghostState.element.id = 'sn-ghost-text';
        ghostState.element.style.cssText = `
            position: fixed;
            pointer-events: none;
            color: #bbb;
            font-family: inherit;
            font-size: inherit;
            white-space: pre;
            z-index: 2147483647;
            background: transparent;
            line-height: normal;
        `;
        document.body.appendChild(ghostState.element);
    }

    const coords = getCaretCoordinates(target);
    const suffix = match.shortcut.substring(prefix.length);
    
    ghostState.activeMatch = match;
    ghostState.targetElement = target;
    ghostState.element.textContent = suffix + " (Tab ⇥)";
    ghostState.element.style.top = `${coords.top}px`;
    ghostState.element.style.left = `${coords.left}px`;
    ghostState.element.style.display = 'block';
}

function hideGhost() {
    if (ghostState.element) {
        ghostState.element.style.display = 'none';
    }
    ghostState.activeMatch = null;
}

// --- EVENT LISTENERS ---

window.addEventListener('input', (event) => {
    let target = event.target;
    if (!target || target.shadowRoot) {
        const deepTarget = getDeepActiveElement();
        if (deepTarget) target = deepTarget;
    }
    if (!target) return;

    const isContentEditable = target.isContentEditable;
    const tagName = target.tagName;
    const ignoredTypes = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'image', 'color', 'hidden', 'date', 'datetime-local'];

    let isValid = isContentEditable || tagName === 'TEXTAREA' || (tagName === 'INPUT' && !ignoredTypes.includes(target.type?.toLowerCase()) && target.type !== 'password');
    if (!isValid) return;

    const text = getTextBeforeCursor(target, MAX_LOOKBACK);
    if (text.length === 0) {
        hideGhost();
        return;
    }

    // Check for Trigger Symbol (Quick Search Popup)
    if (triggerSymbol && text.endsWith(triggerSymbol)) {
        hideGhost();
        showShortcutPopup(target, triggerSymbol);
        return;
    }

    // Try Standard Expansion
    const candidates = shortcutsByLastChar.get(text.slice(-1));
    if (candidates) {
        for (const { shortcut, data } of candidates) {
            if (text.endsWith(shortcut)) {
                hideGhost();
                event.preventDefault();
                event.stopImmediatePropagation();
                replaceText(target, shortcut, typeof data === 'string' ? data : data.text, shortcut);
                return;
            }
        }
    }

    // Try Ghost Text (only for textarea/input in this PoC)
    if (enableGhostText && (tagName === 'TEXTAREA' || tagName === 'INPUT')) {
        const lastWord = text.split(/\s/).pop();
        const match = findTrieMatch(lastWord);
        if (match) {
            showGhost(target, match, lastWord);
        } else {
            hideGhost();
        }
    } else {
        hideGhost();
    }
}, true);

window.addEventListener('keydown', (e) => {
    if (enableGhostText && e.key === 'Tab' && ghostState.activeMatch && ghostState.targetElement) {
        const target = ghostState.targetElement;
        const match = ghostState.activeMatch;
        const prefix = target.value.substring(0, target.selectionStart).split(/\s/).pop();
        
        e.preventDefault();
        e.stopImmediatePropagation();
        
        // 1. Complete the shortcut key in the field
        const suffix = match.shortcut.substring(prefix.length);
        const start = target.selectionStart;
        const end = target.selectionEnd;
        target.setRangeText(suffix, start, end, 'end');
        
        // 2. Trigger the actual expansion
        const fullShortcut = match.shortcut;
        hideGhost();
        replaceText(target, fullShortcut, match.text, fullShortcut);
    } else if (e.key === 'Escape') {
        hideGhost();
    }
}, true);

async function resolveVariable(varName) {
    const context = getRecordContext();
    const table = context.tableName;

    const getFirstName = (fullName) => {
        if (!fullName) return "";
        return fullName.trim().split(' ')[0];
    };

    // System Variables
    if (varName === 'date') {
        return new Date().toISOString().split('T')[0];
    }
    if (varName === 'time') {
        return new Date().toTimeString().split(' ')[0].substring(0, 5);
    }
    if (varName === 'clipboard') {
        try {
            return await navigator.clipboard.readText();
        } catch (e) {
            return "";
        }
    }

    // Interactive Variables
    if (varName.startsWith('prompt:')) {
        const label = varName.split(':')[1] || "Input";
        return await showPrompt(label);
    }

    // ServiceNow Variables
    if (table) {
        const findField = (fieldNames, isDisplay = true) => {
            const names = Array.isArray(fieldNames) ? fieldNames : [fieldNames];
            
            for (const fieldName of names) {
                const patterns = isDisplay ? [
                    `sys_display.${table}.${fieldName}`,
                    `sys_display.IO:${fieldName}`,
                    `${table}.${fieldName}`,
                    `IO:${fieldName}`
                ] : [
                    `sys_readonly.${table}.${fieldName}`,
                    `${table}.${fieldName}`,
                    fieldName
                ];

                for (const id of patterns) {
                    const el = document.getElementById(id);
                    // Check if element exists and has a non-empty value/text
                    if (el) {
                        const val = el.value || el.innerText;
                        if (val && val.trim().length > 0) return val.trim();
                    }
                }
                
                const suffix = `.${fieldName}`;
                const elSuffix = document.querySelector(`[id$="${suffix}"]`);
                if (elSuffix) {
                    const val = elSuffix.value || elSuffix.innerText;
                    if (val && val.trim().length > 0) return val.trim();
                }
            }
            
            return null;
        };

        const callerCandidates = ['caller_id', 'u_caller', 'u_caller_id', 'opened_by'];
        const reqForCandidates = ['requested_for', 'requested_for_label', 'u_requested_for', 'u_requested_for_label', 'requested_for_display'];
        const openedByCandidates = ['opened_by', 'u_opened_by', 'opened_by_label'];
        const assignedToCandidates = ['assigned_to', 'u_assigned_to', 'assigned_to_label'];

        if (varName === 'identity_select') {
            const options = [
                { label: 'Requested For', value: findField(reqForCandidates) },
                { label: 'Opened By', value: findField(openedByCandidates) },
                { label: 'Caller', value: findField(callerCandidates) }
            ].filter(opt => opt.value && opt.value.trim().length > 0);

            if (options.length === 0) return "User";
            if (options.length === 1) return getFirstName(options[0].value);

            const selected = await showSelection(options);
            return getFirstName(selected);
        }

        if (varName === 'caller_name') {
            return getFirstName(findField(callerCandidates) || "User");
        }
        if (varName === 'requested_for') {
            return getFirstName(findField(reqForCandidates) || "User");
        }
        if (varName === 'opened_by') {
            return getFirstName(findField(openedByCandidates) || "User");
        }
        if (varName === 'assigned_to') {
            return getFirstName(findField(assignedToCandidates) || "Agent");
        }
        if (varName === 'ticket_number') {
            return findField(['number', 'id', 'u_number'], false) || "Ticket";
        }
        
        if (varName.startsWith('sn:')) {
            const field = varName.split(':')[1];
            return findField(field) || findField(field, false) || "";
        }
    }

    // Fallbacks
    const fallbacks = {
        'requested_for': 'User',
        'opened_by': 'User',
        'caller_name': 'User',
        'assigned_to': 'Agent',
        'ticket_number': 'Ticket',
        'identity_select': 'User'
    };
    
    return fallbacks[varName] !== undefined ? fallbacks[varName] : `{{${varName}}}`;
}

function showShortcutPopup(activeEl, trigger) {
    if (document.getElementById('sn-shortcut-popup')) return;

    const rect = activeEl.getBoundingClientRect();
    const popup = document.createElement('div');
    popup.id = 'sn-shortcut-popup';
    
    chrome.storage.local.get(['theme'], (res) => {
        const isDark = res.theme === 'dark';
        popup.style.cssText = `
            position: fixed;
            top: ${Math.max(10, rect.top + 25)}px;
            left: ${rect.left}px;
            width: 350px;
            background: ${isDark ? '#1e1e1e' : '#fff'};
            color: ${isDark ? '#e0e0e0' : '#333'};
            border: 2px solid #278efc;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 2147483647;
            font-family: sans-serif;
            display: flex;
            flex-direction: column;
            gap: 10px;
        `;

        popup.innerHTML = `
            <input type="text" id="sn-popup-search" placeholder="Search templates..." style="width: 100%; padding: 8px; border: 1px solid ${isDark ? '#444' : '#ccc'}; border-radius: 4px; background: ${isDark ? '#2c2c2c' : '#fff'}; color: ${isDark ? '#fff' : '#000'}; outline: none; box-sizing: border-box;">
            <div id="sn-popup-list" style="max-height: 250px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;"></div>
        `;

        document.body.appendChild(popup);
        const searchInput = popup.querySelector('#sn-popup-search');
        const listContainer = popup.querySelector('#sn-popup-list');
        searchInput.focus();

        let selectedIndex = 0;
        let filteredKeys = [];

        const renderList = () => {
            const query = searchInput.value.toLowerCase();
            const allKeys = Object.keys(SHORTCUTS);
            
            filteredKeys = allKeys.filter(key => {
                const item = SHORTCUTS[key];
                const matchesKey = key.toLowerCase().includes(query);
                const matchesText = (typeof item === 'string' ? item : item.text).toLowerCase().includes(query);
                const matchesTag = item.tags && item.tags.some(t => t.toLowerCase().includes(query));
                return matchesKey || matchesText || matchesTag;
            });

            // Sort by usageCount descending
            filteredKeys.sort((a, b) => {
                const countA = SHORTCUTS[a].usageCount || 0;
                const countB = SHORTCUTS[b].usageCount || 0;
                if (countB !== countA) return countB - countA;
                return a.localeCompare(b);
            });

            if (selectedIndex >= filteredKeys.length) selectedIndex = Math.max(0, filteredKeys.length - 1);

            listContainer.innerHTML = '';
            filteredKeys.forEach((key, idx) => {
                const item = SHORTCUTS[key];
                const isSelected = idx === selectedIndex;
                const itemDiv = document.createElement('div');
                itemDiv.className = 'sn-popup-item';
                itemDiv.dataset.idx = idx;
                itemDiv.style.cssText = `
                    padding: 8px;
                    border-radius: 4px;
                    background: ${isSelected ? (isDark ? '#333' : '#eef6ff') : 'transparent'};
                    border: 1px solid ${isSelected ? '#278efc' : (isDark ? '#333' : '#eee')};
                    cursor: pointer;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                    transition: background 0.1s;
                `;
                
                const preview = (typeof item === 'string' ? item : item.text).replace(/\n/g, ' ↵ ').substring(0, 60);
                itemDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; pointer-events: none;">
                        <b style="color: ${isDark ? '#ffb74d' : '#e67e22'}; font-size: 13px;">${key}</b>
                        <span style="font-size: 10px; color: ${isDark ? '#aaa' : '#999'};">Used: ${item.usageCount || 0}</span>
                    </div>
                    <div style="font-size: 11px; color: ${isDark ? '#aaa' : '#666'}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none;">${preview}</div>
                `;

                itemDiv.onmousedown = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    selectItem(key);
                };

                itemDiv.onmouseenter = () => {
                    selectedIndex = idx;
                    popup.querySelectorAll('.sn-popup-item').forEach((el, i) => {
                        const sel = i === selectedIndex;
                        el.style.background = sel ? (isDark ? '#333' : '#eef6ff') : 'transparent';
                        el.style.borderColor = sel ? '#278efc' : (isDark ? '#333' : '#eee');
                    });
                };
                listContainer.appendChild(itemDiv);
                if (isSelected) itemDiv.scrollIntoView({ block: 'nearest' });
            });

            if (filteredKeys.length === 0) {
                listContainer.innerHTML = `<div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">No matches found</div>`;
            }
        };

        const selectItem = (key) => {
            const data = SHORTCUTS[key];
            cleanup();
            replaceText(activeEl, trigger, typeof data === 'string' ? data : data.text, key);
        };

        const cleanup = () => {
            popup.remove();
            activeEl.focus();
        };

        searchInput.oninput = () => {
            selectedIndex = 0;
            renderList();
        };

        searchInput.onkeydown = (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = (selectedIndex + 1) % filteredKeys.length;
                renderList();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = (selectedIndex - 1 + filteredKeys.length) % filteredKeys.length;
                renderList();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (filteredKeys[selectedIndex]) selectItem(filteredKeys[selectedIndex]);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cleanup();
            }
        };

        const clickHandler = (e) => {
            if (!popup.contains(e.target)) {
                document.removeEventListener('mousedown', clickHandler);
                cleanup();
            }
        };
        setTimeout(() => document.addEventListener('mousedown', clickHandler), 10);

        renderList();
    });
}

function showSelection(options) {
    return new Promise((resolve) => {
        const activeEl = getDeepActiveElement();
        if (!activeEl) return resolve("");

        const rect = activeEl.getBoundingClientRect();
        const promptDiv = document.createElement('div');
        promptDiv.className = 'sn-variable-prompt';
        
        chrome.storage.local.get(['theme'], (res) => {
            const isDark = res.theme === 'dark';
            promptDiv.style.cssText = `
                position: fixed;
                top: ${Math.max(10, rect.top - 120)}px;
                left: ${rect.left}px;
                background: ${isDark ? '#1e1e1e' : '#fff'};
                color: ${isDark ? '#e0e0e0' : '#333'};
                border: 2px solid #278efc;
                padding: 10px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                gap: 5px;
                min-width: 260px;
                font-family: sans-serif;
            `;

            let selectedIndex = 0;

            const renderOptions = () => {
                let html = `<div style="font-size: 11px; font-weight: bold; color: #278efc; text-transform: uppercase; margin-bottom: 5px; padding: 0 5px;">Select Identity</div>`;
                promptDiv.innerHTML = html;

                options.forEach((opt, idx) => {
                    const isSelected = idx === selectedIndex;
                    const btn = document.createElement('div');
                    btn.className = 'sn-select-opt';
                    btn.style.cssText = `
                        text-align: left;
                        padding: 10px;
                        border: 1px solid ${isSelected ? '#278efc' : (isDark ? '#333' : '#eee')};
                        border-radius: 4px;
                        background: ${isSelected ? (isDark ? '#333' : '#eef6ff') : 'transparent'};
                        cursor: pointer;
                        font-size: 13px;
                        transition: 0.1s;
                    `;
                    btn.innerHTML = `<b style="color: ${isDark ? '#ffb74d' : '#e67e22'};">${opt.label}:</b> ${opt.value}`;
                    
                    btn.onmousedown = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        resolve(opt.value);
                        cleanup();
                    };

                    btn.onmouseenter = () => {
                        selectedIndex = idx;
                        promptDiv.querySelectorAll('.sn-select-opt').forEach((el, i) => {
                            const sel = i === selectedIndex;
                            el.style.background = sel ? (isDark ? '#333' : '#eef6ff') : 'transparent';
                            el.style.borderColor = sel ? '#278efc' : (isDark ? '#333' : '#eee');
                        });
                    };
                    promptDiv.appendChild(btn);
                });
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
                    renderOptions();
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    selectedIndex = (selectedIndex - 1 + options.length) % options.length;
                    renderOptions();
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

            const clickHandler = (e) => {
                if (!promptDiv.contains(e.target)) {
                    cleanup();
                    resolve("");
                }
            };

            renderOptions();
            document.body.appendChild(promptDiv);
            
            document.addEventListener('keydown', keyHandler);
            setTimeout(() => document.addEventListener('mousedown', clickHandler), 10);
        });
    });
}

function showPrompt(label) {
    return new Promise((resolve) => {
        const activeEl = getDeepActiveElement();
        if (!activeEl) return resolve("");

        const rect = activeEl.getBoundingClientRect();
        const promptDiv = document.createElement('div');
        promptDiv.className = 'sn-variable-prompt';
        
        chrome.storage.local.get(['theme'], (res) => {
            const isDark = res.theme === 'dark';
            promptDiv.style.cssText = `
                position: fixed;
                top: ${Math.max(10, rect.top - 100)}px;
                left: ${rect.left}px;
                background: ${isDark ? '#1e1e1e' : '#fff'};
                color: ${isDark ? '#e0e0e0' : '#333'};
                border: 2px solid #278efc;
                padding: 15px;
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                z-index: 2147483647;
                display: flex;
                flex-direction: column;
                gap: 10px;
                min-width: 240px;
                font-family: sans-serif;
            `;

            promptDiv.innerHTML = `
                <div style="font-size: 11px; font-weight: bold; color: #278efc; text-transform: uppercase;">${label}</div>
                <input type="text" id="sn-prompt-input" style="width: 100%; padding: 10px; border: 1px solid ${isDark ? '#444' : '#ccc'}; border-radius: 4px; outline: none; box-sizing: border-box; background: ${isDark ? '#2c2c2c' : '#fff'}; color: ${isDark ? '#fff' : '#000'};">
                <div style="font-size: 10px; color: ${isDark ? '#aaa' : '#999'};">Press Enter to insert, Esc to cancel</div>
            `;

            document.body.appendChild(promptDiv);
            const input = promptDiv.querySelector('#sn-prompt-input');
            input.focus();

            const cleanup = () => {
                promptDiv.remove();
                activeEl.focus();
            };

            input.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    const val = input.value;
                    cleanup();
                    resolve(val);
                } else if (e.key === 'Escape') {
                    cleanup();
                    resolve("");
                }
            };

            const clickHandler = (e) => {
                if (!promptDiv.contains(e.target)) {
                    document.removeEventListener('mousedown', clickHandler);
                    cleanup();
                    resolve("");
                }
            };
            setTimeout(() => document.addEventListener('mousedown', clickHandler), 10);
        });
    });
}

async function replaceText(element, shortcut, replacement, shortcutKey = null) {
    // Variable Resolution
    const varRegex = /\{\{(.*?)\}\}/g;
    let resolvedText = replacement;
    const matches = [...replacement.matchAll(varRegex)];
    
    for (const match of matches) {
        const fullMatch = match[0];
        const varName = match[1];
        const resolvedValue = await resolveVariable(varName);
        resolvedText = resolvedText.replace(fullMatch, resolvedValue);
    }

    const parts = resolvedText.split(CURSOR_MARKER);
    const head = (parts[0] || "").replace(/\r\n/g, "\n");
    const tail = (parts.slice(1).join("") || "").replace(/\r\n/g, "\n");
    const clean = head + tail;

    // Stats Update
    const saved = clean.length - shortcut.length;
    chrome.storage.local.get(['stats', 'shortcuts'], (res) => {
        // Global stats
        const stats = res.stats || { usageCount: 0, charsSaved: 0 };
        stats.usageCount++;
        if (saved > 0) stats.charsSaved += saved;
        
        // Per-shortcut stats
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

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
        element.focus();
        const start = element.selectionStart;
        const sStart = Math.max(0, start - shortcut.length);
        if (typeof element.setRangeText === 'function') {
            element.setRangeText(clean, sStart, start, 'end');
        } else {
            element.setSelectionRange(sStart, start);
            document.execCommand('insertText', false, clean);
        }
        if (parts.length > 1) {
            const pos = sStart + [...head].length;
            element.setSelectionRange(pos, pos);
        }
        element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    } 
    else if (element.isContentEditable) {
        const root = element.getRootNode();
        const sel = (root.getSelection ? root.getSelection() : null) || window.getSelection();
        if (!sel || !sel.rangeCount) return;
        
        // Remove shortcut
        for (let i = 0; i < [...shortcut].length; i++) sel.modify('extend', 'backward', 'character');
        
        document.execCommand('insertText', false, clean);
        
        if (parts.length > 1) {
            // Move cursor to marker position
            for (let i = 0; i < [...tail].length; i++) sel.modify('move', 'backward', 'character');
        }
        element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    }
}

// --- SERVICENOW LINKIFIER ---

function linkifyStream() {
    if (!chrome.runtime?.id) return; // Prevent "Extension context invalidated" error

    chrome.storage.local.get(['enableSNLinks'], (res) => {
        if (chrome.runtime.lastError) return; // Handle cases where context dies during the call
        if (res.enableSNLinks === false) return;

        const selectors = ['.sn-widget-textblock-body', '.sn-card-component_summary', '.activity-comment', '.activity-work-notes', '.journal-entry-text', '.outputmsg_text'];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                if (el.dataset.linkified === "true" || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
                
                const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
                let textNode;
                const nodesToReplace = [];
                // Use a non-global regex for testing to avoid index side effects
                const testRegex = new RegExp(URL_REGEX.source);
                while (textNode = walker.nextNode()) {
                    if (testRegex.test(textNode.nodeValue) && !textNode.parentElement.closest('a')) {
                        nodesToReplace.push(textNode);
                    }
                }
                nodesToReplace.forEach(node => {
                    const text = node.nodeValue;
                    const matches = Array.from(text.matchAll(URL_REGEX));
                    if (matches.length === 0) return;

                    const fragment = document.createDocumentFragment();
                    let lastIndex = 0;

                    for (const match of matches) {
                        const url = match[0];
                        const index = match.index;

                        // Add text before the match
                        if (index > lastIndex) {
                            fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
                        }

                        // Add the link
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.target = "_blank";
                        anchor.rel = "noopener noreferrer";
                        anchor.textContent = url;
                        anchor.style.cssText = "color: #278efc !important; text-decoration: underline !important; font-weight: bold;";
                        fragment.appendChild(anchor);

                        lastIndex = index + url.length;
                    }

                    // Add remaining text
                    if (lastIndex < text.length) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                    }

                    if (node.parentNode) {
                        node.parentNode.replaceChild(fragment, node);
                    }
                });
                el.dataset.linkified = "true";
            });
        });
    });
}

// --- SERVICENOW IMAGE PASTE & CONTEXT ---

let cachedEnableSNPaste = true;
chrome.storage.local.get(['enableSNPaste'], (res) => {
    cachedEnableSNPaste = res.enableSNPaste !== false;
});
chrome.storage.onChanged.addListener((changes) => {
    if (changes.enableSNPaste) cachedEnableSNPaste = changes.enableSNPaste.newValue !== false;
});

function getRecordContext() {
    const params = new URLSearchParams(window.location.search);
    let sysId = params.get('sys_id') || (window.g_form ? window.g_form.getUniqueValue() : null);
    let tableName = params.get('table') || params.get('sysparm_table');
    if (!tableName && window.location.pathname.includes('.do')) {
        tableName = window.location.pathname.split('/').pop().split('.do')[0];
    }
    return { sysId, tableName };
}

function isSafeRecordPage(context) {
    return context.sysId && context.tableName && context.sysId.length === 32 && !window.location.pathname.endsWith('_list.do');
}

document.addEventListener('paste', (event) => {
    if (cachedEnableSNPaste === false) return;

    const context = getRecordContext();
    if (!isSafeRecordPage(context)) return;

    const items = (event.clipboardData || event.originalEvent?.clipboardData).items;
    for (const item of items) {
        if (item.type.indexOf("image") !== -1) {
            const blob = item.getAsFile();
            
            chrome.storage.local.get(['pasteBehavior'], (result) => {
                if (result.pasteBehavior === 'auto') {
                    // Auto-upload without confirmation
                    uploadImageDirectly(blob, context);
                } else {
                    // Default behavior: show modal/tray
                    createStagedPreview(blob, context);
                }
            });
        }
    }
});

async function uploadImageDirectly(blob, context) {
    const fileName = `pasted_sn_${Date.now()}.png`;
    const url = `/api/now/attachment/file?table_name=${context.tableName}&table_sys_id=${context.sysId}&file_name=${fileName}`;
    const token = window.g_ck || (document.querySelector('input[name="sysparm_ck"]') ? document.querySelector('input[name="sysparm_ck"]').value : null);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': blob.type, 'X-UserToken': token },
            body: blob
        });
        if (res.ok) {
            console.log("ServiceNow Expander: Image auto-uploaded successfully.");
        }
    } catch (err) {
        console.error("ServiceNow Expander: Auto-upload failed.", err);
    }
}

function createStagedPreview(blob, context) {
    let tray = document.getElementById('sn-booster-floating-tray');
    if (!tray) {
        tray = document.createElement('div');
        tray.id = 'sn-booster-floating-tray';
        tray.style.cssText = "position: fixed; bottom: 30px; right: 30px; z-index: 10000; display: flex; flex-direction: column; gap: 10px; font-family: sans-serif;";
        document.body.appendChild(tray);
    }

    const wrapper = document.createElement('div');
    const URL_ObjectURL = URL.createObjectURL(blob);
    wrapper.style.cssText = "width: 250px; display: flex; flex-direction: column; gap: 8px; border: 1px solid #ccc; padding: 10px; background: white; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);";

    wrapper.innerHTML = `
        <div style="font-size: 11px; font-weight: bold; color: #555; text-transform: uppercase;">Attach to: ${context.tableName}</div>
        <img src="${URL_ObjectURL}" style="width: 100%; max-height: 180px; object-fit: contain; border: 1px solid #eee; background: #fafafa;">
        <div style="display: flex; gap: 10px;">
            <button id="up-btn" style="flex: 2; background: #278efc; color: white; border: none; padding: 8px; cursor: pointer; font-weight: bold; border-radius: 3px;" title="Press Enter to Upload">Upload (↵)</button>
            <button id="del-btn" style="flex: 1; background: #f44336; color: white; border: none; padding: 8px; cursor: pointer; border-radius: 3px;" title="Press Esc to Discard">Discard (Esc)</button>
        </div>
    `;

    const cleanup = () => {
        window.removeEventListener('keydown', handleKeys);
        URL.revokeObjectURL(URL_ObjectURL);
        wrapper.remove();
        if (tray && !tray.children.length) tray.remove();
    };

    const handleKeys = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cleanup();
        } else if (e.key === 'Enter') {
            // Only trigger if not typing in a textarea/input to avoid accidental uploads
            const active = document.activeElement;
            const isTyping = active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT' || active.isContentEditable);
            if (!isTyping) {
                e.preventDefault();
                uploadAction();
            }
        }
    };

    const uploadAction = async () => {
        const btn = wrapper.querySelector('#up-btn');
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerText = "Uploading...";
        wrapper.querySelector('#del-btn').style.display = 'none';
        window.removeEventListener('keydown', handleKeys);
        
        const fileName = `pasted_sn_${Date.now()}.png`;
        const url = `/api/now/attachment/file?table_name=${context.tableName}&table_sys_id=${context.sysId}&file_name=${fileName}`;
        const token = window.g_ck || (document.querySelector('input[name="sysparm_ck"]') ? document.querySelector('input[name="sysparm_ck"]').value : null);

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': blob.type, 'X-UserToken': token },
                body: blob
            });
            if (res.ok) {
                wrapper.innerHTML = `<b style="color: #4CAF50; text-align: center; display: block;">✅ Successfully Attached</b>`;
                setTimeout(cleanup, 2500);
            } else throw new Error();
        } catch (err) {
            alert("Upload failed. Session might have expired.");
            cleanup();
        }
    };

    wrapper.querySelector('#up-btn').onclick = uploadAction;
    wrapper.querySelector('#del-btn').onclick = cleanup;
    
    window.addEventListener('keydown', handleKeys);
    tray.appendChild(wrapper);
}

// --- INITIALIZATION ---

const observer = new MutationObserver(() => {
    clearTimeout(window.snBoosterT);
    window.snBoosterT = setTimeout(linkifyStream, 500);
});

if (window.location.hostname.includes('service-now.com')) {
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(linkifyStream, 2000);
}

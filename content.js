// content.js - TEXT EXPANDER + SERVICENOW PRODUCTIVITY BOOSTER

let SHORTCUTS = {};
let shortcutsByLastChar = new Map();
const MAX_LOOKBACK = 30;
const CURSOR_MARKER = "|";
const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;

// --- SHORTCUT CACHE & CONFIG ---

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
}

chrome.storage.local.get(['shortcuts'], (result) => {
    if (result.shortcuts) {
        SHORTCUTS = result.shortcuts;
        updateShortcutCache();
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.shortcuts) {
        SHORTCUTS = changes.shortcuts.newValue || {};
        updateShortcutCache();
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

    const isAddition = event.data || (event.inputType && event.inputType.startsWith('insert'));
    if (isAddition) {
        const text = getTextBeforeCursor(target, MAX_LOOKBACK);
        if (text.length === 0) return;

        const candidates = shortcutsByLastChar.get(text.slice(-1));
        if (candidates) {
            for (const { shortcut, data } of candidates) {
                if (text.endsWith(shortcut)) {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    replaceText(target, shortcut, typeof data === 'string' ? data : data.text);
                    return;
                }
            }
        }
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
        const findField = (fieldName, isDisplay = true) => {
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
                if (el) return el.value || el.innerText || "";
            }
            
            const suffix = `.${fieldName}`;
            const elSuffix = document.querySelector(`[id$="${suffix}"]`);
            if (elSuffix) return elSuffix.value || elSuffix.innerText || "";
            
            return null;
        };

        if (varName === 'identity_select') {
            const options = [
                { label: 'Caller', value: findField('caller_id') || findField('u_caller') },
                { label: 'Requested For', value: findField('requested_for') },
                { label: 'Opened By', value: findField('opened_by') }
            ].filter(opt => opt.value && opt.value.trim().length > 0);

            if (options.length === 0) return "User";
            if (options.length === 1) return getFirstName(options[0].value);

            const selected = await showSelection(options);
            return getFirstName(selected);
        }

        if (varName === 'caller_name') {
            return getFirstName(findField('caller_id') || findField('u_caller') || "User");
        }
        if (varName === 'requested_for') {
            return getFirstName(findField('requested_for') || "User");
        }
        if (varName === 'opened_by') {
            return getFirstName(findField('opened_by') || "User");
        }
        if (varName === 'assigned_to') {
            return getFirstName(findField('assigned_to') || "Agent");
        }
        if (varName === 'ticket_number') {
            return findField('number', false) || findField('id', false) || "Ticket";
        }
        
        if (varName.startsWith('sn:')) {
            const field = varName.split(':')[1];
            return findField(field) || findField(field, false) || "";
        }
    }

    // Fallbacks
    const fallbacks = {
        'caller_name': 'User',
        'requested_for': 'User',
        'opened_by': 'User',
        'assigned_to': 'Agent',
        'ticket_number': 'Ticket',
        'identity_select': 'User'
    };
    
    return fallbacks[varName] !== undefined ? fallbacks[varName] : `{{${varName}}}`;
}

function showSelection(options) {
    return new Promise((resolve) => {
        const activeEl = getDeepActiveElement();
        if (!activeEl) return resolve("");

        const rect = activeEl.getBoundingClientRect();
        const promptDiv = document.createElement('div');
        promptDiv.className = 'sn-variable-prompt';
        promptDiv.style.cssText = `
            position: fixed;
            top: ${Math.max(10, rect.top - 120)}px;
            left: ${rect.left}px;
            background: #fff;
            border: 2px solid #278efc;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            gap: 5px;
            min-width: 240px;
            font-family: sans-serif;
        `;

        let selectedIndex = 0;

        const renderOptions = () => {
            let html = `<div style="font-size: 11px; font-weight: bold; color: #278efc; text-transform: uppercase; margin-bottom: 5px;">Select Identity</div>`;
            options.forEach((opt, idx) => {
                const isSelected = idx === selectedIndex;
                const bg = isSelected ? "#eef6ff" : "#f9f9f9";
                const border = isSelected ? "1px solid #278efc" : "1px solid #eee";
                html += `<button class="sn-select-opt" data-idx="${idx}" style="text-align: left; padding: 8px; border: ${border}; border-radius: 4px; background: ${bg}; cursor: pointer; font-size: 13px; transition: 0.1s;">
                    <b style="color: #555;">${opt.label}:</b> ${opt.value}
                </button>`;
            });
            promptDiv.innerHTML = html;
            
            // Re-attach click listeners after re-render
            promptDiv.querySelectorAll('.sn-select-opt').forEach(btn => {
                btn.onclick = () => {
                    resolve(options[btn.getAttribute('data-idx')].value);
                    cleanup();
                };
                btn.onmouseenter = () => {
                    selectedIndex = parseInt(btn.getAttribute('data-idx'));
                    renderOptions();
                };
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
}

function showPrompt(label) {
    return new Promise((resolve) => {
        const activeEl = getDeepActiveElement();
        if (!activeEl) return resolve("");

        const rect = activeEl.getBoundingClientRect();
        const promptDiv = document.createElement('div');
        promptDiv.className = 'sn-variable-prompt';
        promptDiv.style.cssText = `
            position: fixed;
            top: ${Math.max(10, rect.top - 60)}px;
            left: ${rect.left}px;
            background: #fff;
            border: 2px solid #278efc;
            padding: 10px;
            border-radius: 8px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 2147483647;
            display: flex;
            flex-direction: column;
            gap: 8px;
            min-width: 220px;
            font-family: sans-serif;
        `;

        promptDiv.innerHTML = `
            <div style="font-size: 12px; font-weight: bold; color: #278efc; text-transform: uppercase;">${label}</div>
            <input type="text" id="sn-prompt-input" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; outline: none; box-sizing: border-box;">
            <div style="font-size: 10px; color: #999;">Press Enter to insert, Esc to cancel</div>
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

        // Click outside to cancel
        const clickHandler = (e) => {
            if (!promptDiv.contains(e.target)) {
                document.removeEventListener('mousedown', clickHandler);
                cleanup();
                resolve("");
            }
        };
        setTimeout(() => document.addEventListener('mousedown', clickHandler), 10);
    });
}

async function replaceText(element, shortcut, replacement) {
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
    chrome.storage.local.get(['stats'], (res) => {
        const stats = res.stats || { usageCount: 0, charsSaved: 0 };
        stats.usageCount++;
        if (saved > 0) stats.charsSaved += saved;
        chrome.storage.local.set({ stats });
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
    const selectors = ['.sn-widget-textblock-body', '.sn-card-component_summary', '.activity-comment', '.activity-work-notes', '.journal-entry-text', '.outputmsg_text'];
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            if (el.dataset.linkified === "true" || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
            
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
            let textNode;
            const nodesToReplace = [];
            while (textNode = walker.nextNode()) {
                if (URL_REGEX.test(textNode.nodeValue) && !textNode.parentElement.closest('a')) {
                    nodesToReplace.push(textNode);
                }
            }
            nodesToReplace.forEach(node => {
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;
                node.nodeValue.replace(URL_REGEX, (url, index) => {
                    fragment.appendChild(document.createTextNode(node.nodeValue.substring(lastIndex, index)));
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.target = "_blank";
                    anchor.rel = "noopener noreferrer";
                    anchor.textContent = url;
                    anchor.style.cssText = "color: #278efc !important; text-decoration: underline !important; font-weight: bold;";
                    fragment.appendChild(anchor);
                    lastIndex = index + url.length;
                });
                //fragment.appendChild(document.createTextNode(node.nodeValue.substring(lastIndex)));
                if (node.parentNode) node.parentNode.replaceChild(fragment, node);
            });
            el.dataset.linkified = "true";
        });
    });
}

// --- SERVICENOW IMAGE PASTE & CONTEXT ---

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
    wrapper.style.cssText = "width: 250px; display: flex; flex-direction: column; gap: 8px; border: 1px solid #ccc; padding: 10px; background: white; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);";

    wrapper.innerHTML = `
        <div style="font-size: 11px; font-weight: bold; color: #555; text-transform: uppercase;">Attach to: ${context.tableName}</div>
        <img src="${URL_ObjectURL = URL.createObjectURL(blob)}" style="width: 100%; max-height: 180px; object-fit: contain; border: 1px solid #eee; background: #fafafa;">
        <div style="display: flex; gap: 10px;">
            <button id="up-btn" style="flex: 2; background: #278efc; color: white; border: none; padding: 8px; cursor: pointer; font-weight: bold; border-radius: 3px;">Upload</button>
            <button id="del-btn" style="flex: 1; background: #f44336; color: white; border: none; padding: 8px; cursor: pointer; border-radius: 3px;">Discard</button>
        </div>
    `;

    wrapper.querySelector('#up-btn').onclick = async () => {
        const btn = wrapper.querySelector('#up-btn');
        btn.disabled = true;
        btn.innerText = "Uploading...";
        wrapper.querySelector('#del-btn').style.display = 'none';
        
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
                setTimeout(() => { wrapper.remove(); if (!tray.children.length) tray.remove(); }, 2500);
            } else throw new Error();
        } catch (err) {
            alert("Upload failed. Session might have expired.");
            wrapper.remove();
        }
    };

    wrapper.querySelector('#del-btn').onclick = () => { URL.revokeObjectURL(URL_ObjectURL); wrapper.remove(); if (!tray.children.length) tray.remove(); };
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

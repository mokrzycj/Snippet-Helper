// src/content/expander.js
import { CURSOR_MARKER } from '../shared/constants.js';
import { getRecordContext, findField } from './servicenow.js';

export async function resolveVariable(varName, showPrompt, showSelection) {
    const context = getRecordContext();
    const table = context.tableName;

    const getFirstName = (fullName) => {
        if (!fullName) return "";
        return fullName.trim().split(' ')[0];
    };

    // System Variables
    if (varName === 'date') return new Date().toISOString().split('T')[0];
    if (varName === 'time') return new Date().toTimeString().split(' ')[0].substring(0, 5);
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
        const callerCandidates = ['caller_id', 'u_caller', 'u_caller_id', 'opened_by'];
        const reqForCandidates = ['requested_for', 'requested_for_label', 'u_requested_for', 'u_requested_for_label', 'requested_for_display'];
        const openedByCandidates = ['opened_by', 'u_opened_by', 'opened_by_label'];
        const assignedToCandidates = ['assigned_to', 'u_assigned_to', 'assigned_to_label'];

        if (varName === 'identity_select') {
            const options = [
                { label: 'Requested For', value: findField(table, reqForCandidates) },
                { label: 'Opened By', value: findField(table, openedByCandidates) },
                { label: 'Caller', value: findField(table, callerCandidates) }
            ].filter(opt => opt.value && opt.value.trim().length > 0);

            if (options.length === 0) return "User";
            if (options.length === 1) return getFirstName(options[0].value);

            const selected = await showSelection(options);
            return getFirstName(selected);
        }

        if (varName === 'caller_name') return getFirstName(findField(table, callerCandidates) || "User");
        if (varName === 'requested_for') return getFirstName(findField(table, reqForCandidates) || "User");
        if (varName === 'opened_by') return getFirstName(findField(table, openedByCandidates) || "User");
        if (varName === 'assigned_to') return getFirstName(findField(table, assignedToCandidates) || "Agent");
        if (varName === 'ticket_number') return findField(table, ['number', 'id', 'u_number'], false) || "Ticket";
        
        if (varName.startsWith('sn:')) {
            const field = varName.split(':')[1];
            return findField(table, field) || findField(table, field, false) || "";
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

export async function replaceText(element, shortcut, replacement, shortcutKey, options) {
    const { showPrompt, showSelection, updateStats } = options;
    
    // Variable Resolution
    const varRegex = /\{\{(.*?)\}\}/g;
    let resolvedText = replacement;
    const matches = [...replacement.matchAll(varRegex)];
    
    for (const match of matches) {
        const fullMatch = match[0];
        const varName = match[1];
        const resolvedValue = await resolveVariable(varName, showPrompt, showSelection);
        resolvedText = resolvedText.replace(fullMatch, resolvedValue);
    }

    const parts = resolvedText.split(CURSOR_MARKER);
    const head = (parts[0] || "").replace(/\r\n/g, "\n");
    const tail = (parts.slice(1).join("") || "").replace(/\r\n/g, "\n");
    const clean = head + tail;

    // Stats Update
    const saved = clean.length - shortcut.length;
    updateStats(shortcutKey, saved);

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
        
        for (let i = 0; i < [...shortcut].length; i++) sel.modify('extend', 'backward', 'character');
        document.execCommand('insertText', false, clean);
        if (parts.length > 1) {
            for (let i = 0; i < [...tail].length; i++) sel.modify('move', 'backward', 'character');
        }
        element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    }
}

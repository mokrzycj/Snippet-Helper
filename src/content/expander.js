// src/content/expander.js
import { CURSOR_MARKER } from '../shared/constants.js';
import { getRecordContext, findField, getListCollectorValues, getGlideListValues, getRelatedListValues } from './servicenow.js';

export async function resolveVariable(varName, showPrompt, showSelection) {
    try {
        const context = getRecordContext();
        const table = context.tableName;

        const getFirstName = (fullName) => {
            if (!fullName) return "";
            return fullName.trim().split(' ')[0];
        };

        // System Variables
        if (varName === 'date') return new Date().toISOString().split('T')[0];
        if (varName === 'time') return new Date().toTimeString().split(' ')[0].substring(0, 5);

        // Interactive Variables
        if (varName.startsWith('prompt:')) {
            const label = varName.split(':')[1] || "Input";
            return await showPrompt(label);
        }

        // List Collector Variables
        if (varName.startsWith('list:')) {
            const field = varName.split(':')[1];
            return getListCollectorValues(field) || `[List:${field} Empty]`;
        }

        if (varName.startsWith('glide_list:')) {
            const field = varName.split(':')[1];
            return getGlideListValues(field) || `[GlideList:${field} Empty]`;
        }

        if (varName.startsWith('related_list:')) {
            const target = varName.split(':')[1];
            return getRelatedListValues(target) || `[RelatedList:${target} Empty]`;
        }

        // ServiceNow Variables
        if (table) {
            const callerCandidates = ['caller_id', 'u_caller', 'u_caller_id', 'opened_by'];
            const reqForCandidates = ['requested_for', 'u_requested_for', 'requested_for_display'];
            const openedByCandidates = ['opened_by', 'u_opened_by'];
            const assignedToCandidates = ['assigned_to', 'u_assigned_to'];

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
    } catch (err) {
        console.error(`Snippet Helper: Error resolving variable {{${varName}}}:`, err);
        return `{{${varName}}}`;
    }
}

export async function replaceText(element, shortcut, replacement, shortcutKey, options) {
    const { showPrompt, showSelection, updateStats } = options;
    
    try {
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
            
            // Modern alternative to document.execCommand('insertText')
            element.setRangeText(clean, sStart, start, 'end');

            if (parts.length > 1) {
                const pos = sStart + [...head].length;
                element.setSelectionRange(pos, pos);
            }
            element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        } 
        else if (element.isContentEditable) {
            element.focus();
            const root = element.getRootNode();
            const sel = (root.getSelection ? root.getSelection() : null) || window.getSelection();
            if (!sel || !sel.rangeCount) return;
            
            const range = sel.getRangeAt(0);
            
            // Move range start back by shortcut length to select the trigger
            for (let i = 0; i < [...shortcut].length; i++) {
                sel.modify('extend', 'backward', 'character');
            }
            
            const selectedRange = sel.getRangeAt(0);
            selectedRange.deleteContents();
            
            // Create and insert the new text node
            const textNode = document.createTextNode(clean);
            selectedRange.insertNode(textNode);
            
            // Handle cursor position if | marker was used
            if (parts.length > 1) {
                const newRange = document.createRange();
                newRange.setStart(textNode, [...head].length);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            } else {
                // Move cursor to the end of inserted text
                const newRange = document.createRange();
                newRange.setStartAfter(textNode);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
            
            element.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
        }
    } catch (err) {
        console.error("Snippet Helper: Failed to replace text.", err);
    }
}

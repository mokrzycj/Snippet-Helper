// src/content/servicenow.js
import { URL_REGEX } from '../shared/constants.js';

export function getRecordContext() {
    const params = new URLSearchParams(window.location.search);
    let sysId = params.get('sys_id') || (window.g_form ? window.g_form.getUniqueValue() : null);
    let tableName = params.get('table') || params.get('sysparm_table');
    if (!tableName && window.location.pathname.includes('.do')) {
        tableName = window.location.pathname.split('/').pop().split('.do')[0];
    }
    return { sysId, tableName };
}

export function isSafeRecordPage(context) {
    return context.sysId && context.tableName && context.sysId.length === 32 && !window.location.pathname.endsWith('_list.do');
}

export function findField(table, fieldNames, isDisplay = true) {
    if (!table) return null;
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
}

export function linkifyStream(enableSNLinks) {
    if (!enableSNLinks) return;

    const selectors = ['.sn-widget-textblock-body', '.sn-card-component_summary', '.activity-comment', '.activity-work-notes', '.journal-entry-text', '.outputmsg_text'];
    selectors.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            if (el.dataset.linkified === "true" || el.tagName === 'TEXTAREA' || el.isContentEditable) return;
            
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
            let textNode;
            const nodesToReplace = [];
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

                    if (index > lastIndex) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, index)));
                    }

                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.target = "_blank";
                    anchor.rel = "noopener noreferrer";
                    anchor.textContent = url;
                    anchor.style.cssText = "color: #278efc !important; text-decoration: underline !important; font-weight: bold;";
                    fragment.appendChild(anchor);

                    lastIndex = index + url.length;
                }

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
}

export async function uploadImageDirectly(blob, context) {
    const fileName = `pasted_sn_${Date.now()}.png`;
    const url = `/api/now/attachment/file?table_name=${context.tableName}&table_sys_id=${context.sysId}&file_name=${fileName}`;
    const token = window.g_ck || (document.querySelector('input[name="sysparm_ck"]') ? document.querySelector('input[name="sysparm_ck"]').value : null);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': blob.type, 'X-UserToken': token },
            body: blob
        });
        return res.ok;
    } catch (err) {
        console.error("ServiceNow Expander: Auto-upload failed.", err);
        return false;
    }
}

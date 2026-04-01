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

export function getSlushbucketValues(fieldName, side = 'right') {
    const suffix = side === 'right' ? '_select_1' : '_select_0';
    const patterns = [
        fieldName + suffix,
        `IO:${fieldName}${suffix}`,
        `sys_display.${fieldName}${suffix}`
    ];

    for (const id of patterns) {
        const selectEl = document.getElementById(id);
        if (selectEl && selectEl.options) {
            return Array.from(selectEl.options)
                .map(opt => opt.text || opt.innerText)
                .filter(val => val && val.trim().length > 0)
                .join(', ');
        }
    }
    return "";
}

export function getListCollectorValues(fieldName) {
    // Default to selected (right) values
    const rightValues = getSlushbucketValues(fieldName, 'right');
    if (rightValues) return rightValues;
    
    // Fallback to generic pill lookup
    const containerSelectors = [
        `[id*="${fieldName}"][class*="container"]`,
        `[id*="${fieldName}"][class*="list"]`,
        `.slushbucket-container`
    ];


    for (const selector of containerSelectors) {
        try {
            const containers = document.querySelectorAll(selector);
            for (const container of containers) {
                const pills = container.querySelectorAll('.sn-pill, .vst-pill, .select2-selection__choice, .pill, .list_item');
                if (pills.length > 0) {
                    const values = Array.from(pills)
                        .map(p => {
                            // Clone to remove the 'x' button text if it exists
                            const clone = p.cloneNode(true);
                            const removes = clone.querySelectorAll('.sn-pill-remove, .vst-pill-remove, .select2-selection__choice__remove, .remove, .delete');
                            removes.forEach(r => r.remove());
                            return clone.textContent.trim().replace(/×$/, '').trim();
                        })
                        .filter(v => v.length > 0)
                        .join(', ');
                    if (values) return values;
                }
            }
        } catch(e) {}
    }

    return "";
}

export function getGlideListValues(fieldName) {
    console.log("Snippet Helper: Debugging Glide List (Watch List)", fieldName);
    
    // 1. Try the "unlocked" select box (select_0 prefix)
    const select0Ids = [
        `select_0${fieldName}`,
        `select_0${fieldName.split('.').pop()}`,
        `vars_select_0${fieldName}`
    ];
    
    for (const id of select0Ids) {
        const select0 = document.getElementById(id);
        if (select0 && select0.options && select0.offsetParent !== null) { // Ensure it's visible/active
            const values = Array.from(select0.options)
                .map(opt => opt.text || opt.innerText)
                .filter(v => v && v.trim().length > 0)
                .join(', ');
            if (values) return values;
        }
    }

    // 2. Try the "locked" / "non-edit" hidden values (often for screen readers but reliable)
    const nonEditId = fieldName + "_nonedit_sr";
    const nonEditEl = document.getElementById(nonEditId);
    if (nonEditEl) {
        const val = nonEditEl.textContent.trim();
        if (val) {
            console.log("Snippet Helper: Found non-edit values", val);
            return val;
        }
    }

    // 3. Try various container IDs
    const containerIds = [
        `${fieldName}_list`,
        `sys_display.${fieldName}_list`,
        `${fieldName}_container`,
        `sys_display.${fieldName}`,
        fieldName
    ];
    
    for (const id of containerIds) {
        const container = document.getElementById(id);
        if (container) {
            const pills = container.querySelectorAll('.vst-pill, .list_item, [data-value], .sn-pill, .glide-list-pill, .select2-selection__choice');
            if (pills.length > 0) {
                const values = Array.from(pills)
                    .map(p => {
                        const clone = p.cloneNode(true);
                        const removes = clone.querySelectorAll('[class*="remove"], [class*="delete"], .delete-icon');
                        removes.forEach(r => r.remove());
                        let text = clone.textContent.trim();
                        return text.replace(/×$/, '').replace(/\s*x\s*$/i, '').trim();
                    })
                    .filter(t => t.length > 0)
                    .join(', ');
                if (values) return values;
            }
        }
    }

    return "";
}

export function getRelatedListValues(tableOrTitle) {
    console.log("Snippet Helper: Debugging Related List", tableOrTitle);
    const tables = document.querySelectorAll('table.list_table');
    
    for (const table of tables) {
        const wrapper = table.closest('.related-list-container, [id*="_wrapper"], .tabs_list_container');
        const title = wrapper ? wrapper.innerText.toLowerCase() : "";
        const id = table.id.toLowerCase();
        
        if (id.includes(tableOrTitle.toLowerCase()) || title.includes(tableOrTitle.toLowerCase())) {
            const rows = table.querySelectorAll('tr.list_row, tr.list_odd, tr.list_even');
            const values = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                // Skip checkbox and icon columns
                for (let i = 0; i < cells.length; i++) {
                    const cell = cells[i];
                    if (cell.classList.contains('list_checkbox') || cell.querySelector('input[type="checkbox"]')) continue;
                    if (cell.querySelector('a.list_popup')) continue;
                    
                    const text = cell.innerText.trim();
                    if (text && text.length > 1) {
                        values.push(text);
                        break;
                    }
                }
            });
            return values.join(', ');
        }
    }
    return "";
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
        console.error("Snippet Helper: Auto-upload failed.", err);
        return false;
    }
}

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

export function getListCollectorValues(fieldName) {
    console.log("Snippet Helper: Debugging List Collector", fieldName);
    const patterns = [
        `${fieldName}_select_1`,
        `IO:${fieldName}_select_1`,
        `sys_display.${fieldName}_select_1`
    ];

    for (const id of patterns) {
        const selectEl = document.getElementById(id);
        console.log(`Snippet Helper: Checking ID ${id}`, selectEl ? "Found" : "Not Found");
        if (selectEl && selectEl.options) {
            const values = Array.from(selectEl.options)
                .map(opt => opt.text || opt.innerText)
                .join(', ');
            console.log("Snippet Helper: Found values", values);
            return values;
        }
    }
    
    const suffix = `${fieldName}_select_1`;
    const elSuffix = document.querySelector(`select[id$="${suffix}"]`);
    if (elSuffix && elSuffix.options) {
        return Array.from(elSuffix.options)
            .map(opt => opt.text || opt.innerText)
            .join(', ');
    }

    return "";
}

export function getGlideListValues(fieldName) {
    console.log("Snippet Helper: Debugging Glide List (Watch List)", fieldName);
    
    // 1. Try the "unlocked" select box (select_0 prefix)
    const select0Id = `select_0${fieldName}`;
    const select0 = document.getElementById(select0Id) || document.querySelector(`select[id$="${fieldName}"][id^="select_0"]`);
    if (select0 && select0.options) {
        console.log("Snippet Helper: Found unlocked select_0 box");
        const values = Array.from(select0.options)
            .map(opt => opt.text || opt.innerText)
            .join(', ');
        if (values) return values;
    }

    // 2. Try the "locked" or "non-edit" container
    const selectors = [
        `#${fieldName}_list`,
        `#sys_display.${fieldName}_list`,
        `#${fieldName}_container`,
        `[id*="${fieldName}"][id$="_list"]`,
        `.glide-list-container`
    ];
    
    for (const selector of selectors) {
        const container = document.querySelector(selector);
        console.log(`Snippet Helper: Checking selector ${selector}`, container ? "Found" : "Not Found");
        if (container) {
            const pills = container.querySelectorAll('.vst-pill, .list_item, [data-value], .sn-pill, .glide-list-pill');
            console.log(`Snippet Helper: Found ${pills.length} pills in container`);
            if (pills.length > 0) {
                const values = Array.from(pills)
                    .map(p => {
                        let text = p.textContent.trim();
                        return text.replace(/×$/, '').replace(/\s*x\s*$/i, '').trim();
                    })
                    .filter(t => t.length > 0)
                    .join(', ');
                console.log("Snippet Helper: Found values", values);
                return values;
            }
        }
    }

    // Next Exp Check
    const nextExpPills = document.querySelectorAll(`[id*="${fieldName}"] .sn-pill-label, [id*="${fieldName}"] .pill-text`);
    if (nextExpPills.length > 0) {
        return Array.from(nextExpPills).map(p => p.textContent.trim()).join(', ');
    }

    return "";
}

export function getRelatedListValues(tableOrTitle) {
    console.log("Snippet Helper: Debugging Related List", tableOrTitle);
    const tables = document.querySelectorAll('table.list_table');
    console.log(`Snippet Helper: Found ${tables.length} list tables on page`);

    for (const table of tables) {
        const wrapper = table.closest('.related-list-container, [id*="_wrapper"]');
        const title = wrapper ? wrapper.innerText.toLowerCase() : "";
        const id = table.id.toLowerCase();
        
        console.log(`Snippet Helper: Checking Table ID: ${id}, Title: ${title}`);

        if (id.includes(tableOrTitle.toLowerCase()) || title.includes(tableOrTitle.toLowerCase())) {
            const rows = table.querySelectorAll('tr.list_row, tr.list_odd, tr.list_even');
            const values = [];
            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                for (let i = 2; i < Math.min(cells.length, 6); i++) {
                    const text = cells[i].innerText.trim();
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

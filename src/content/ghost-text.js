// src/content/ghost-text.js

export class GhostTextManager {
    constructor() {
        this.element = null;
        this.activeMatch = null;
        this.targetElement = null;
    }

    getCaretCoordinates(element) {
        if (element.isContentEditable) {
            const root = element.getRootNode();
            const selection = (root.getSelection ? root.getSelection() : null) || window.getSelection();
            if (selection && selection.rangeCount > 0) {
                const range = selection.getRangeAt(0).cloneRange();
                range.collapse(true);
                const rects = range.getClientRects();
                if (rects.length > 0) {
                    return { top: rects[0].top, left: rects[0].left };
                }
            }
            // Fallback for contentEditable if no selection rects
            const rect = element.getBoundingClientRect();
            return { top: rect.top, left: rect.left };
        }

        const isInput = element.tagName === 'INPUT';
        const isTextArea = element.tagName === 'TEXTAREA';
        if (!isInput && !isTextArea) return { top: 0, left: 0 };

        const div = document.createElement('div');
        const style = window.getComputedStyle(element);
        
        const properties = [
            'direction', 'boxSizing', 'width', 'height', 'overflowX', 'overflowY',
            'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
            'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
            'fontStyle', 'fontVariant', 'fontWeight', 'fontStretch', 'fontSize', 'fontSizeAdjust', 'lineHeight', 'fontFamily',
            'textAlign', 'textTransform', 'textIndent', 'textDecoration', 'letterSpacing', 'wordSpacing', 'tabSize', 'MozTabSize',
            'whiteSpace', 'wordWrap', 'overflowWrap', 'wordBreak'
        ];
        
        div.style.position = 'absolute';
        div.style.visibility = 'hidden';
        div.style.whiteSpace = 'pre-wrap';
        div.style.top = '0';
        div.style.left = '0';
        
        properties.forEach(prop => {
            if (style[prop]) div.style[prop] = style[prop];
        });

        const rect = element.getBoundingClientRect();
        div.style.width = `${rect.width}px`;
        div.style.height = `${rect.height}px`;

        if (isInput) {
            div.style.whiteSpace = 'nowrap';
        }

        const selectionStart = element.selectionStart || 0;
        const textBefore = element.value.substring(0, selectionStart);
        div.textContent = textBefore;

        const span = document.createElement('span');
        span.textContent = element.value.substring(selectionStart) || '.';
        div.appendChild(span);

        document.body.appendChild(div);
        
        const borderTop = parseFloat(style.borderTopWidth) || 0;
        const borderLeft = parseFloat(style.borderLeftWidth) || 0;

        const coords = {
            top: rect.top + borderTop + span.offsetTop - element.scrollTop,
            left: rect.left + borderLeft + span.offsetLeft - element.scrollLeft
        };
        
        document.body.removeChild(div);
        return coords;
    }

    show(target, match, prefix) {
        if (!this.element) {
            this.element = document.createElement('div');
            this.element.id = 'sn-ghost-text';
            this.element.style.cssText = `
                position: fixed;
                pointer-events: none;
                color: #bbb;
                white-space: pre;
                z-index: 2147483647;
                background: transparent;
            `;
            document.body.appendChild(this.element);
        }

        const style = window.getComputedStyle(target);
        this.element.style.fontFamily = style.fontFamily;
        this.element.style.fontSize = style.fontSize;
        this.element.style.fontStyle = style.fontStyle;
        this.element.style.fontWeight = style.fontWeight;
        this.element.style.lineHeight = style.lineHeight;
        this.element.style.letterSpacing = style.letterSpacing;

        const coords = this.getCaretCoordinates(target);
        const suffix = match.shortcut.substring(prefix.length);
        
        this.activeMatch = match;
        this.targetElement = target;
        this.element.textContent = suffix + " (Tab ⇥)";
        this.element.style.top = `${coords.top}px`;
        this.element.style.left = `${coords.left}px`;
        this.element.style.display = 'block';
    }

    hide() {
        if (this.element) {
            this.element.style.display = 'none';
        }
        this.activeMatch = null;
        this.targetElement = null;
    }

    isActive() {
        return !!this.activeMatch;
    }
}

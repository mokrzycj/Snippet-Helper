// src/content/ghost-text.js

export class GhostTextManager {
    constructor() {
        this.element = null;
        this.activeMatch = null;
        this.targetElement = null;
    }

    getCaretCoordinates(element) {
        const isTextArea = element.tagName === 'TEXTAREA';
        const div = document.createElement('div');
        const style = window.getComputedStyle(element);
        
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
        
        // Correcting positioning for various scroll states
        const coords = {
            top: rect.top + (span.offsetTop - element.scrollTop),
            left: rect.left + (span.offsetLeft - element.scrollLeft)
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
                font-family: inherit;
                font-size: inherit;
                white-space: pre;
                z-index: 2147483647;
                background: transparent;
                line-height: normal;
            `;
            document.body.appendChild(this.element);
        }

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

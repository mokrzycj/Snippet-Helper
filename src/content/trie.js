// src/content/trie.js

export class ShortcutEngine {
    constructor() {
        this.shortcuts = {};
        this.shortcutsByLastChar = new Map();
        this.trieRoot = {};
    }

    update(shortcuts) {
        this.shortcuts = shortcuts;
        this.shortcutsByLastChar = new Map();
        this.trieRoot = {};

        for (const [shortcut, data] of Object.entries(this.shortcuts)) {
            if (shortcut.length === 0) continue;
            
            // Update last char map
            const lastChar = shortcut.slice(-1);
            if (!this.shortcutsByLastChar.has(lastChar)) {
                this.shortcutsByLastChar.set(lastChar, []);
            }
            this.shortcutsByLastChar.get(lastChar).push({ shortcut, data });

            // Update trie
            let node = this.trieRoot;
            for (const char of shortcut) {
                if (!node[char]) node[char] = {};
                node = node[char];
            }
            node.$ = (typeof data === 'string' ? data : data.text);
        }

        // Sort by length descending for better matching
        for (const candidates of this.shortcutsByLastChar.values()) {
            candidates.sort((a, b) => b.shortcut.length - a.shortcut.length);
        }
    }

    findExactMatch(textBeforeCursor) {
        if (!textBeforeCursor) return null;
        const lastChar = textBeforeCursor.slice(-1);
        const candidates = this.shortcutsByLastChar.get(lastChar);
        if (!candidates) return null;

        for (const { shortcut, data } of candidates) {
            if (textBeforeCursor.endsWith(shortcut)) {
                return { shortcut, data };
            }
        }
        return null;
    }

    findTrieMatch(prefix) {
        if (!prefix || prefix.length < 2) return null;
        let node = this.trieRoot;
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
}

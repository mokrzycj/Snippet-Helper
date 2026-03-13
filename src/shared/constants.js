// src/shared/constants.js

export const MAX_LOOKBACK = 30;
export const CURSOR_MARKER = "|";
export const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/g;

export const DEFAULT_SETTINGS = {
    triggerSymbol: ';;',
    enableGhostText: true,
    enableSNPaste: true,
    enableSNLinks: true,
    pasteBehavior: 'smart', // 'smart', 'plain', 'html'
    theme: 'light'
};

export const STORAGE_KEYS = {
    SHORTCUTS: 'shortcuts',
    TRIGGER_SYMBOL: 'triggerSymbol',
    ENABLE_GHOST_TEXT: 'enableGhostText',
    ENABLE_SN_PASTE: 'enableSNPaste',
    ENABLE_SN_LINKS: 'enableSNLinks',
    PASTE_BEHAVIOR: 'pasteBehavior',
    THEME: 'theme',
    STATS: 'stats'
};

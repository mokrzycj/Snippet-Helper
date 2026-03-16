// src/shared/theme-init.js
// This script runs immediately to set the theme before the first paint.
// It is NOT a module to ensure it executes as early as possible.

(function() {
    // Synchronous check using localStorage (mirrored from chrome.storage)
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    }
    
    // Fallback/Update from storage
    chrome.storage.local.get(['theme'], (result) => {
        if (result.theme === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else if (result.theme === 'light') {
            document.documentElement.removeAttribute('data-theme');
            localStorage.setItem('theme', 'light');
        }
    });
})();

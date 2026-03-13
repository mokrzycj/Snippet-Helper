(async () => {
  const src = chrome.runtime.getURL('src/content/main.js');
  await import(src);
})();

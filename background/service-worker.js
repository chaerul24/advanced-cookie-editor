/**
 * Advanced Cookie Editor - Background Service Worker
 * Manifest V3 event-driven worker handling lifecycle, context menus, and navigation.
 */

// Context menu item IDs
const MENU_OPEN_DASHBOARD = 'ace-open-dashboard';
const MENU_INSPECT_CURRENT = 'ace-inspect-current';

chrome.runtime.onInstalled.addListener(() => {
  // Re-create context menus on installation or update
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_OPEN_DASHBOARD,
      title: 'Open Advanced Cookie Editor',
      contexts: ['action', 'page']
    });

    chrome.contextMenus.create({
      id: MENU_INSPECT_CURRENT,
      title: 'Inspect Cookies for Active Site',
      contexts: ['page']
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_OPEN_DASHBOARD) {
    chrome.tabs.create({
      url: chrome.runtime.getURL('dashboard/dashboard.html')
    });
  } else if (info.menuItemId === MENU_INSPECT_CURRENT) {
    let domainParam = '';
    const targetUrl = info.pageUrl || tab?.url;
    if (targetUrl) {
      try {
        const parsed = new URL(targetUrl);
        if (parsed.protocol.startsWith('http')) {
          domainParam = `?domain=${encodeURIComponent(parsed.hostname)}`;
        }
      } catch {
        // Fallback to opening dashboard without specific domain
      }
    }
    chrome.tabs.create({
      url: chrome.runtime.getURL(`dashboard/dashboard.html${domainParam}`)
    });
  }
});

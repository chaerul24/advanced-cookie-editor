/**
 * Advanced Cookie Editor & Realtime Session Monitor - Background Service Worker
 * Manifest V3 event-driven worker handling:
 * 1. Realtime Browser Session Monitor (1-second heartbeat & session state verification).
 * 2. Privacy & Security Guardrails: NO cookie values or authentication tokens are ever sent.
 * 3. Supported platforms: YouTube (LOGIN_DETECTED, LOGOUT_DETECTED, SESSION_UNKNOWN, SITE_UNAVAILABLE).
 * 4. Context menus & navigation shortcuts.
 */

// Context menu item IDs
const MENU_OPEN_DASHBOARD = 'ace-open-dashboard';
const MENU_INSPECT_CURRENT = 'ace-inspect-current';

// Session Monitor Defaults
const DEFAULT_MONITOR_CONFIG = {
  enabled: true,
  intervalMs: 1000, // 1 second target interval
  serverUrl: 'https://erul.my.id',
  deviceName: 'PC-01',
  monitoredDomains: ['youtube.com']
};

let monitorConfig = { ...DEFAULT_MONITOR_CONFIG };
let monitorIntervalId = null;
let currentDeviceUuid = null;
let currentPairingCode = null;
let isHeartbeatRunning = false;
let lastKnownSessionState = {};

let monitorState = {
  isPaired: false,
  deviceUuid: null,
  deviceName: DEFAULT_MONITOR_CONFIG.deviceName,
  pairingCode: null,
  isOnline: false,
  lastHeartbeat: 0,
  domainStatuses: {
    'youtube.com': {
      sessionState: 'SESSION_UNKNOWN',
      checkedAt: null,
      message: 'Belum diperiksa'
    }
  },
  error: null
};

// --- 1. CONTEXT MENUS SETUP ---
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_OPEN_DASHBOARD,
      title: 'Buka Cookie & Session Monitor CMS',
      contexts: ['action', 'page']
    });

    chrome.contextMenus.create({
      id: MENU_INSPECT_CURRENT,
      title: 'Inspect Status Sesi Situs Aktif',
      contexts: ['page']
    });
  });

  setupHeartbeatAlarm();
  initSessionMonitor();
});

chrome.runtime.onStartup.addListener(() => {
  setupHeartbeatAlarm();
  initSessionMonitor();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_OPEN_DASHBOARD) {
    chrome.tabs.create({ url: monitorConfig.serverUrl });
  } else if (info.menuItemId === MENU_INSPECT_CURRENT) {
    chrome.tabs.create({ url: `${monitorConfig.serverUrl}/#session-monitor` });
  }
});

// Setup periodic alarm to keep worker responsive under MV3
function setupHeartbeatAlarm() {
  chrome.alarms.get('ace-monitor-keepalive', (existing) => {
    if (!existing) {
      chrome.alarms.create('ace-monitor-keepalive', { periodInMinutes: 1 });
    }
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ace-monitor-keepalive') {
    startMonitorLoop();
    performHeartbeatAndCheck();
  }
});

// --- 2. DEVICE IDENTITY & PAIRING ---
async function initSessionMonitor() {
  try {
    const data = await chrome.storage.local.get(['ace_device_uuid', 'ace_pairing_code', 'ace_monitor_config']);
    
    // Generate or load persistent Device UUID
    if (data.ace_device_uuid) {
      currentDeviceUuid = data.ace_device_uuid;
    } else {
      currentDeviceUuid = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
      await chrome.storage.local.set({ ace_device_uuid: currentDeviceUuid });
    }

    if (data.ace_pairing_code) {
      currentPairingCode = data.ace_pairing_code;
    } else {
      currentPairingCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      await chrome.storage.local.set({ ace_pairing_code: currentPairingCode });
    }

    if (data.ace_monitor_config) {
      monitorConfig = { ...monitorConfig, ...data.ace_monitor_config };
    }

    monitorState.deviceUuid = currentDeviceUuid;
    monitorState.pairingCode = currentPairingCode;
    monitorState.deviceName = monitorConfig.deviceName;

    // Automatically pair device with server
    await pairDeviceWithServer();

    // Start 1-second realtime loop
    startMonitorLoop();
    performHeartbeatAndCheck();
  } catch (err) {
    console.error('[SessionMonitor] Initialization error:', err);
    startMonitorLoop();
  }
}

async function pairDeviceWithServer() {
  try {
    const res = await fetch(`${monitorConfig.serverUrl}/api/extension/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceUuid: currentDeviceUuid,
        deviceName: monitorConfig.deviceName,
        pairingCode: currentPairingCode,
        version: '2.2.0'
      })
    });

    if (res.ok) {
      monitorState.isPaired = true;
      monitorState.error = null;
    } else {
      const errTxt = await res.text().catch(() => '');
      monitorState.error = `Pairing failed: HTTP ${res.status} ${errTxt}`;
    }
  } catch (err) {
    monitorState.error = `Cannot connect to server: ${err.message}`;
  }
}

// --- 3. REALTIME 1-SECOND HEARTBEAT & MONITOR LOOP ---
function startMonitorLoop() {
  if (monitorIntervalId) {
    clearInterval(monitorIntervalId);
    monitorIntervalId = null;
  }

  if (!monitorConfig.enabled) return;

  const intervalMs = Math.max(1000, monitorConfig.intervalMs || 1000);
  monitorIntervalId = setInterval(() => {
    if (monitorConfig.enabled) {
      performHeartbeatAndCheck();
    }
  }, intervalMs);
}

async function performHeartbeatAndCheck() {
  if (isHeartbeatRunning) return;
  isHeartbeatRunning = true;

  try {
    // 1. Send Heartbeat to server (1-second heartbeat)
    await sendHeartbeat();

    // 2. Verify Session for Monitored Domains (e.g. YouTube)
    for (const domain of monitorConfig.monitoredDomains) {
      await verifyAndSendSessionStatus(domain);
    }
  } catch (err) {
    monitorState.isOnline = false;
    monitorState.error = err.message;
  } finally {
    isHeartbeatRunning = false;
    chrome.storage.local.set({ ace_monitor_state: monitorState }).catch(() => {});
  }
}

async function sendHeartbeat() {
  if (!currentDeviceUuid) return;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(`${monitorConfig.serverUrl}/api/extension/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-UUID': currentDeviceUuid
      },
      body: JSON.stringify({ deviceUuid: currentDeviceUuid }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (res.ok) {
      monitorState.isOnline = true;
      monitorState.lastHeartbeat = Date.now();
      monitorState.error = null;
    } else {
      monitorState.isOnline = false;
    }
  } catch (err) {
    monitorState.isOnline = false;
    throw err;
  }
}

// --- 4. SESSION VERIFICATION (STRICT ZERO-COOKIE TRANSMISSION) ---
/**
 * Verifies login session status for a domain (e.g., youtube.com)
 * STRICT SECURITY: Never accesses, reads, stores, or transmits cookie values or tokens!
 */
async function verifyAndSendSessionStatus(domain) {
  let sessionState = 'SESSION_UNKNOWN';

  try {
    if (domain === 'youtube.com' || domain.includes('youtube')) {
      // YouTube login session detection:
      // When a user logs in to YouTube, Google sets the 'LOGIN_INFO' cookie on .youtube.com.
      // If the user logs out, 'LOGIN_INFO' is cleared or absent.
      const cookieExists = await checkCookiePresence('https://www.youtube.com', 'LOGIN_INFO');
      
      if (cookieExists === true) {
        sessionState = 'LOGIN_DETECTED';
      } else if (cookieExists === false) {
        sessionState = 'LOGOUT_DETECTED';
      } else {
        sessionState = 'SESSION_UNKNOWN';
      }
    } else {
      sessionState = 'SESSION_UNKNOWN';
    }
  } catch (err) {
    sessionState = 'SITE_UNAVAILABLE';
  }

  const nowIso = new Date().toISOString();
  monitorState.domainStatuses[domain] = {
    sessionState,
    checkedAt: nowIso,
    message: sessionState === 'LOGIN_DETECTED' ? 'Sesi Login Terverifikasi' : (sessionState === 'LOGOUT_DETECTED' ? 'Tidak Ada Sesi Login' : 'Status Belum Terverifikasi')
  };

  // Only send to server if state changed or periodically every few seconds
  const stateKey = `${domain}_${sessionState}`;
  const lastSent = lastKnownSessionState[domain];
  
  if (lastSent !== sessionState || (Date.now() - (lastKnownSessionState[domain + '_time'] || 0) > 3000)) {
    lastKnownSessionState[domain] = sessionState;
    lastKnownSessionState[domain + '_time'] = Date.now();

    try {
      await fetch(`${monitorConfig.serverUrl}/api/extension/session-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceUuid: currentDeviceUuid,
          domain: domain,
          sessionState: sessionState,
          checkedAt: nowIso
        })
      });
    } catch (_) {}
  }
}

/**
 * Checks ONLY whether a specific authentication cookie exists on a domain.
 * STRICT SECURITY: Returns only a boolean (true/false).
 * DOES NOT RETURN, STORE, OR TRANSMIT ANY COOKIE VALUE, STRING, OR TOKEN.
 */
function checkCookiePresence(url, cookieName) {
  return new Promise((resolve) => {
    try {
      chrome.cookies.get({ url, name: cookieName }, (cookie) => {
        if (chrome.runtime.lastError) {
          resolve(null);
          return;
        }
        // Returns purely boolean: true if cookie exists and has non-empty name, false otherwise
        resolve(Boolean(cookie && cookie.name));
      });
    } catch {
      resolve(null);
    }
  });
}

// --- 5. RUNTIME MESSAGING FOR POPUP & OPTIONS ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_MONITOR_STATE') {
    sendResponse({
      state: monitorState,
      config: monitorConfig
    });
    return true;
  }

  if (message.type === 'UPDATE_MONITOR_CONFIG') {
    monitorConfig = { ...monitorConfig, ...message.config };
    chrome.storage.local.set({ ace_monitor_config: monitorConfig });
    startMonitorLoop();
    performHeartbeatAndCheck();
    sendResponse({ success: true, config: monitorConfig });
    return true;
  }

  if (message.type === 'TRIGGER_CHECK_NOW') {
    performHeartbeatAndCheck().then(() => {
      sendResponse({ success: true, state: monitorState });
    });
    return true;
  }
});

// Start initialization on worker load
initSessionMonitor();

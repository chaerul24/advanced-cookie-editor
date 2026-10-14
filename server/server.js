/**
 * Advanced Cookie Editor - Central Dashboard & Synchronization Server
 * Domain: https://erul.web.id/ & https://warnet.web.id/cookies
 * Organizes cookies per PC, per Domain, with Password status indicators.
 * Zero external dependencies (native Node.js http, fs, path, url).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8099;
const DATA_DIR = path.join(__dirname, 'data');
const MAX_BACKUPS = 500;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-PC-Name, X-Client-Name');
}

function sendJson(res, statusCode, data, isHead = false) {
  setCors(res);
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  });
  if (!isHead) res.end(payload);
  else res.end();
}

function sendHtml(res, html, isHead = false) {
  setCors(res);
  const len = Buffer.byteLength(html, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': len
  });
  if (!isHead) res.end(html);
  else res.end();
}

// Helper to extract clean domain
function cleanDomain(d) {
  if (!d) return 'unknown';
  return d.replace(/^\.+/, '').trim().toLowerCase();
}

// Read and parse all backups
function loadAllRecords() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const records = [];

  for (const f of files) {
    try {
      const fullPath = path.join(DATA_DIR, f);
      const raw = fs.readFileSync(fullPath, 'utf8');
      const data = JSON.parse(raw);

      // Determine PC Name
      let pcName = data.pcName || data.pc || data.metadata?.pc || data.metadata?.pcName || data.metadata?.client || data.payload?.metadata?.client || data.payload?.metadata?.pc;
      if (!pcName || pcName === 'unknown' || pcName.trim() === '') {
        pcName = data.clientIp ? `PC-${data.clientIp.split('.').pop()}` : 'PC-01';
      }

      // Determine Encryption & Password status
      const isEncrypted = Boolean(data.isEncrypted || data.passwordProtected || data.payload?.format === 'advanced-cookie-editor-encrypted');

      // Extract cookies list
      let cookies = [];
      if (Array.isArray(data.cookies)) {
        cookies = data.cookies;
      } else if (Array.isArray(data.payload?.cookies)) {
        cookies = data.payload.cookies;
      } else if (Array.isArray(data.payload)) {
        cookies = data.payload;
      }

      // Collect domains in this record
      const domains = new Set();
      if (data.domain && data.domain !== 'all') {
        domains.add(cleanDomain(data.domain));
      }
      for (const c of cookies) {
        if (c && c.domain) {
          domains.add(cleanDomain(c.domain));
        }
      }

      records.push({
        id: data.id || f.replace('.json', ''),
        pcName: pcName.trim(),
        clientIp: data.clientIp || '127.0.0.1',
        savedAt: data.savedAt || new Date().toISOString(),
        isEncrypted,
        passwordProtected: isEncrypted,
        itemCount: cookies.length > 0 ? cookies.length : (data.itemCount || 0),
        domains: Array.from(domains),
        cookies,
        rawPayload: data.payload || data
      });
    } catch (_) {}
  }

  return records.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

function rotateBackups() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  if (files.length > MAX_BACKUPS) {
    const sorted = files.map(f => ({
      name: f,
      time: fs.statSync(path.join(DATA_DIR, f)).mtimeMs
    })).sort((a, b) => a.time - b.time);

    while (sorted.length > MAX_BACKUPS) {
      const oldest = sorted.shift();
      try {
        fs.unlinkSync(path.join(DATA_DIR, oldest.name));
      } catch {}
    }
  }
}

// Generate Dashboard HTML Single Page Application
function getDashboardHtml(currentHost = 'erul.my.id') {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Cookie Editor — ${currentHost}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-dark: #0a0c10;
      --bg-card: #12151d;
      --bg-card-hover: #171b26;
      --bg-input: #1a1e2b;
      --border: #232838;
      --border-focus: #3b82f6;
      --text-main: #f1f5f9;
      --text-muted: #8e9bb0;
      --accent: #3b82f6;
      --accent-glow: rgba(59, 130, 246, 0.2);
      --green: #10b981;
      --green-bg: rgba(16, 185, 129, 0.12);
      --amber: #f59e0b;
      --amber-bg: rgba(245, 158, 11, 0.12);
      --red: #ef4444;
      --red-bg: rgba(239, 68, 68, 0.12);
      --purple: #8b5cf6;
      --purple-bg: rgba(139, 92, 246, 0.12);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      background: var(--bg-dark);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* Top Bar */
    .topbar {
      background: rgba(18, 21, 29, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 50;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      text-decoration: none;
      color: inherit;
    }
    .brand-icon {
      font-size: 26px;
      background: linear-gradient(135deg, #f59e0b, #d97706);
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
    }
    .brand-title {
      font-size: 17px;
      font-weight: 800;
      letter-spacing: -0.3px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .brand-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      background: rgba(59, 130, 246, 0.15);
      color: var(--accent);
      padding: 2px 8px;
      border-radius: 6px;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }
    .brand-host {
      font-size: 12px;
      color: var(--text-muted);
    }

    /* Stats Counter */
    .stats-bar {
      display: flex;
      gap: 16px;
      align-items: center;
    }
    .stat-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      background: var(--bg-card);
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .stat-val {
      font-family: 'JetBrains Mono', monospace;
      color: var(--accent);
      font-weight: 700;
    }
    .stat-pill.green .stat-val { color: var(--green); }
    .stat-pill.amber .stat-val { color: var(--amber); }

    /* Controls */
    .topbar-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.2s;
      text-decoration: none;
    }
    .btn-primary {
      background: var(--accent);
      color: white;
    }
    .btn-primary:hover {
      background: #2563eb;
      box-shadow: 0 4px 14px var(--accent-glow);
    }
    .btn-secondary {
      background: var(--bg-card);
      border-color: var(--border);
      color: var(--text-main);
    }
    .btn-secondary:hover {
      background: var(--bg-card-hover);
      border-color: #3b4255;
    }
    .btn-sm { padding: 6px 12px; font-size: 12px; border-radius: 8px; }
    .btn-danger { background: var(--red-bg); color: var(--red); border-color: rgba(239, 68, 68, 0.3); }
    .btn-danger:hover { background: var(--red); color: white; }

    /* Main Container */
    .dashboard-layout {
      flex: 1;
      display: grid;
      grid-template-columns: 320px 1fr;
      gap: 20px;
      padding: 20px 24px;
      max-width: 1700px;
      margin: 0 auto;
      width: 100%;
    }

    /* Left Sidebar: PC Devices */
    .pc-sidebar {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      height: calc(100vh - 100px);
      position: sticky;
      top: 80px;
    }
    .pc-sidebar-header {
      padding: 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .pc-sidebar-title {
      font-size: 14px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .search-input {
      width: 100%;
      background: var(--bg-input);
      border: 1px solid var(--border);
      color: var(--text-main);
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      outline: none;
      transition: border 0.2s;
    }
    .search-input:focus {
      border-color: var(--border-focus);
    }

    .pc-list {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .pc-item {
      background: var(--bg-dark);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .pc-item:hover {
      background: var(--bg-card-hover);
      border-color: #3b4255;
      transform: translateY(-1px);
    }
    .pc-item.active {
      border-color: var(--accent);
      background: rgba(59, 130, 246, 0.08);
      box-shadow: 0 4px 16px rgba(59, 130, 246, 0.15);
    }
    .pc-item-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .pc-name {
      font-weight: 700;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .pc-count {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      background: rgba(255, 255, 255, 0.08);
      padding: 2px 8px;
      border-radius: 12px;
      color: var(--text-muted);
    }
    .pc-item-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: var(--text-muted);
    }
    .badge {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 6px;
      border-radius: 6px;
      text-transform: uppercase;
    }
    .badge-plain {
      background: var(--green-bg);
      color: var(--green);
      border: 1px solid rgba(16, 185, 129, 0.3);
    }
    .badge-encrypted {
      background: var(--amber-bg);
      color: var(--amber);
      border: 1px solid rgba(245, 158, 11, 0.3);
    }

    /* Main Content Area */
    .content-area {
      display: flex;
      flex-direction: column;
      gap: 18px;
    }

    /* Active PC Header Card */
    .active-header-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }
    .active-info h1 {
      font-size: 22px;
      font-weight: 800;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .active-meta {
      margin-top: 6px;
      display: flex;
      gap: 16px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .active-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    /* Domain Pills Container */
    .domain-pills-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .domain-pills-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--text-muted);
    }
    .domain-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .domain-pill {
      background: var(--bg-dark);
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .domain-pill:hover {
      background: var(--bg-card-hover);
      border-color: #3b4255;
    }
    .domain-pill.active {
      background: var(--accent);
      border-color: var(--accent);
      color: white;
      box-shadow: 0 2px 10px var(--accent-glow);
    }
    .domain-pill-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      background: rgba(255, 255, 255, 0.15);
      padding: 1px 6px;
      border-radius: 10px;
    }

    /* Cookies Table Card */
    .cookies-table-card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .table-toolbar {
      padding: 14px 18px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .table-search {
      flex: 1;
      max-width: 360px;
    }
    .table-filter-group {
      display: flex;
      gap: 8px;
    }

    /* Table Styles */
    .table-wrapper {
      overflow-x: auto;
      max-height: 600px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 13px;
    }
    th {
      background: rgba(10, 12, 16, 0.6);
      padding: 12px 16px;
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 10;
    }
    td {
      padding: 14px 16px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    tr:hover td {
      background: rgba(255, 255, 255, 0.02);
    }
    .cookie-name {
      font-family: 'JetBrains Mono', monospace;
      font-weight: 700;
      color: #93c5fd;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .cookie-val-box {
      font-family: 'JetBrains Mono', monospace;
      font-size: 12px;
      background: var(--bg-dark);
      padding: 4px 8px;
      border-radius: 6px;
      border: 1px solid var(--border);
      max-width: 260px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }
    .val-text {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .copy-icon-btn {
      background: none;
      border: none;
      cursor: pointer;
      color: var(--text-muted);
      font-size: 12px;
      padding: 2px 4px;
      border-radius: 4px;
    }
    .copy-icon-btn:hover {
      color: white;
      background: rgba(255, 255, 255, 0.1);
    }

    .flag-pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .flag {
      font-size: 10px;
      font-weight: 700;
      padding: 2px 5px;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .flag-sec { background: var(--green-bg); color: var(--green); }
    .flag-http { background: var(--purple-bg); color: var(--purple); }
    .flag-same { background: rgba(59, 130, 246, 0.12); color: #60a5fa; }

    /* Empty state */
    .empty-state {
      padding: 60px 20px;
      text-align: center;
      color: var(--text-muted);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .empty-icon { font-size: 42px; opacity: 0.6; }

    /* Instructions Modal / Box */
    .info-banner {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(16, 185, 129, 0.08));
      border: 1px solid rgba(59, 130, 246, 0.2);
      border-radius: 14px;
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }
    .info-banner-text h4 { font-size: 14px; font-weight: 700; margin-bottom: 4px; }
    .info-banner-text p { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
    .code-chip {
      font-family: 'JetBrains Mono', monospace;
      background: var(--bg-dark);
      padding: 2px 6px;
      border-radius: 4px;
      color: #93c5fd;
      border: 1px solid var(--border);
    }

    /* Modal */
    .modal-overlay {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 20px;
    }
    .modal-overlay.open { display: flex; }
    .modal {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 18px;
      width: 100%;
      max-width: 580px;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 18px;
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-title { font-size: 18px; font-weight: 700; }
    .close-btn { background: none; border: none; color: var(--text-muted); font-size: 20px; cursor: pointer; }

    /* Responsive */
    @media (max-width: 900px) {
      .dashboard-layout { grid-template-columns: 1fr; }
      .pc-sidebar { height: auto; position: static; }
    }
  </style>
</head>
<body>

  <!-- Top Bar -->
  <header class="topbar">
    <a href="/" class="brand">
      <div class="brand-icon">🍪</div>
      <div>
        <div class="brand-title">
          <span>Cookie Editor Dashboard</span>
          <span class="brand-badge">${currentHost}</span>
        </div>
        <div class="brand-host">Central Realtime Multi-PC Cookie Inspector</div>
      </div>
    </a>

    <!-- Stats -->
    <div class="stats-bar">
      <div class="stat-pill">
        <span>💻 PC:</span>
        <span class="stat-val" id="stat-pcs">0</span>
      </div>
      <div class="stat-pill">
        <span>🌐 Domain:</span>
        <span class="stat-val" id="stat-domains">0</span>
      </div>
      <div class="stat-pill">
        <span>🍪 Total:</span>
        <span class="stat-val" id="stat-total-cookies">0</span>
      </div>
      <div class="stat-pill green">
        <span>🔓 Tanpa Password:</span>
        <span class="stat-val" id="stat-plain">0</span>
      </div>
      <div class="stat-pill amber">
        <span>🔒 Ada Password:</span>
        <span class="stat-val" id="stat-encrypted">0</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="topbar-actions">
      <button class="btn btn-secondary btn-sm" id="btn-refresh" onclick="fetchData()">
        🔄 Refresh
      </button>
      <button class="btn btn-primary btn-sm" onclick="openApiGuideModal()">
        🚀 Cara Kirim Cookie
      </button>
    </div>
  </header>

  <!-- Main Layout -->
  <main class="dashboard-layout">
    
    <!-- Left Sidebar: List of PCs -->
    <aside class="pc-sidebar">
      <div class="pc-sidebar-header">
        <div class="pc-sidebar-title">
          <span>Daftar Komputer (Per PC)</span>
          <span id="pc-total-badge" class="brand-badge">0 PC</span>
        </div>
        <input type="text" id="pc-search-input" class="search-input" placeholder="Cari nama PC..." oninput="renderPcList()">
      </div>
      <div class="pc-list" id="pc-list-container">
        <!-- Injected via JS -->
      </div>
    </aside>

    <!-- Right Content: Cookies for Selected PC -->
    <section class="content-area">

      <!-- How to Send Info Banner -->
      <div class="info-banner">
        <div class="info-banner-text">
          <h4>💡 Pengiriman Cookie Tanpa Password Aktif</h4>
          <p>
            Semua cookie yang dikirim dari <strong>Ekstensi Chrome/Edge</strong> atau <strong>APK CookieBrowser</strong> disimpan secara langsung <strong>tanpa password</strong>. Anda dapat melihat, menyalin, dan mengunduh cookie per domain secara instan.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="openApiGuideModal()">Lihat Endpoint</button>
      </div>

      <!-- Active PC Header Card -->
      <div class="active-header-card" id="active-pc-card">
        <div class="active-info">
          <h1 id="active-pc-title">
            <span>💻 Semua Perangkat</span>
            <span class="badge badge-plain" id="active-pc-pwd-badge">🔓 Tanpa Password</span>
          </h1>
          <div class="active-meta">
            <span id="active-pc-ip">IP: Semua</span>
            <span id="active-pc-lastseen">Update: Sekarang</span>
            <span id="active-pc-count">Total: 0 Cookie</span>
          </div>
        </div>
        <div class="active-actions">
          <button class="btn btn-secondary btn-sm" onclick="copyCurrentCookiesJson()">
            📋 Copy JSON
          </button>
          <button class="btn btn-secondary btn-sm" onclick="downloadCurrentCookies()">
            📥 Download .json
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteCurrentPcData()">
            🗑️ Hapus Data PC Ini
          </button>
        </div>
      </div>

      <!-- Domain Pills Filter -->
      <div class="domain-pills-card">
        <div class="domain-pills-label">Pilih Domain Situs:</div>
        <div class="domain-pills" id="domain-pills-container">
          <button class="domain-pill active" onclick="selectDomain('all')">
            <span>Semua Domain</span>
            <span class="domain-pill-badge" id="pill-all-count">0</span>
          </button>
          <!-- Injected via JS -->
        </div>
      </div>

      <!-- Cookies Table Card -->
      <div class="cookies-table-card">
        <div class="table-toolbar">
          <input type="text" id="cookie-search-input" class="search-input table-search" placeholder="Cari nama cookie, value, atau path..." oninput="renderTable()">
          <div class="table-filter-group">
            <button class="btn btn-secondary btn-sm active" id="filter-all" onclick="setSecurityFilter('all')">Semua</button>
            <button class="btn btn-secondary btn-sm" id="filter-plain" onclick="setSecurityFilter('plain')">🔓 Tanpa Password</button>
            <button class="btn btn-secondary btn-sm" id="filter-encrypted" onclick="setSecurityFilter('encrypted')">🔒 Terenkripsi</button>
          </div>
        </div>

        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Domain</th>
                <th>Nama Cookie</th>
                <th>Isi / Nilai (Value)</th>
                <th>Status Password</th>
                <th>Flags</th>
                <th>Kedaluwarsa</th>
                <th style="text-align: right;">Aksi</th>
              </tr>
            </thead>
            <tbody id="cookies-tbody">
              <!-- Injected via JS -->
            </tbody>
          </table>
          <div class="empty-state" id="empty-state" style="display: none;">
            <div class="empty-icon">🍪</div>
            <p>Tidak ada cookie yang ditemukan untuk kriteria ini.</p>
          </div>
        </div>
      </div>

    </section>
  </main>

  <!-- API Guide Modal -->
  <div class="modal-overlay" id="api-guide-modal" onclick="closeModalOnBackdrop(event)">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">🚀 Cara Kirim Cookie Tanpa Password</div>
        <button class="close-btn" onclick="closeApiGuideModal()">&times;</button>
      </div>

      <div style="font-size: 13px; color: var(--text-muted); line-height: 1.6; display: flex; flex-direction: column; gap: 14px;">
        <p>
          Anda dapat mengirimkan cookie dari perangkat/PC manapun langsung ke dashboard <strong style="color: white;">https://${currentHost}/</strong> secara terbuka (tanpa password):
        </p>

        <div>
          <strong style="color: white;">1. Endpoint Sinkronisasi:</strong>
          <div style="margin-top: 6px;">
            <span class="code-chip">POST https://${currentHost}/api/cookies</span>
          </div>
        </div>

        <div>
          <strong style="color: white;">2. Contoh Pengiriman via cURL (dari PC manapun):</strong>
          <pre style="background: var(--bg-dark); padding: 12px; border-radius: 8px; border: 1px solid var(--border); font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #a7f3d0; margin-top: 6px; overflow-x: auto;">curl -X POST https://${currentHost}/api/cookies \\
  -H "Content-Type: application/json" \\
  -d '{
    "pc": "PC-01",
    "domain": "youtube.com",
    "isEncrypted": false,
    "cookies": [
      {
        "name": "LOGIN_INFO",
        "value": "AFmmF2sw...",
        "domain": ".youtube.com",
        "path": "/",
        "secure": true,
        "httpOnly": true
      }
    ]
  }'</pre>
        </div>

        <div>
          <strong style="color: white;">3. Dari Ekstensi Chrome/Edge & CookieBrowser APK:</strong>
          <ul style="margin-left: 20px; margin-top: 6px;">
            <li>Buka tab <strong>Cloud Sync</strong> di ekstensi atau APK.</li>
            <li>Isi Server URL: <span class="code-chip">https://${currentHost}/api/cookies</span></li>
            <li><strong>JANGAN centang</strong> "Encrypt with Password" (agar cookie dikirim tanpa password).</li>
            <li>Klik <strong>Push Cookies</strong> ➔ Data langsung tampil di dashboard ini!</li>
          </ul>
        </div>
      </div>

      <div style="text-align: right; margin-top: 8px;">
        <button class="btn btn-primary btn-sm" onclick="closeApiGuideModal()">Tutup</button>
      </div>
    </div>
  </div>

  <script>
    let allRecords = [];
    let selectedPc = 'all';
    let selectedDomain = 'all';
    let securityFilter = 'all';
    let revealedValues = {};

    async function fetchData() {
      try {
        const res = await fetch('/api/cookies');
        const json = await res.json();
        allRecords = json.records || [];
        updateStats(json.stats || {});
        renderPcList();
        renderDomainPills();
        renderTable();
      } catch (err) {
        console.error('Error fetching cookies:', err);
      }
    }

    function updateStats(stats) {
      document.getElementById('stat-pcs').textContent = stats.totalPcs || 0;
      document.getElementById('stat-domains').textContent = stats.totalDomains || 0;
      document.getElementById('stat-total-cookies').textContent = stats.totalCookies || 0;
      document.getElementById('stat-plain').textContent = stats.plainCount || 0;
      document.getElementById('stat-encrypted').textContent = stats.encryptedCount || 0;
      document.getElementById('pc-total-badge').textContent = (stats.totalPcs || 0) + ' PC';
    }

    function getUniquePcs() {
      const pcMap = new Map();
      for (const r of allRecords) {
        const name = r.pcName || 'PC-Default';
        if (!pcMap.has(name)) {
          pcMap.set(name, {
            name,
            totalCookies: 0,
            hasEncrypted: false,
            hasPlain: false,
            lastSeen: r.savedAt,
            ip: r.clientIp,
            records: []
          });
        }
        const item = pcMap.get(name);
        item.totalCookies += r.itemCount || 0;
        if (r.isEncrypted) item.hasEncrypted = true;
        else item.hasPlain = true;
        if (new Date(r.savedAt) > new Date(item.lastSeen)) {
          item.lastSeen = r.savedAt;
        }
        item.records.push(r);
      }
      return Array.from(pcMap.values());
    }

    function renderPcList() {
      const pcs = getUniquePcs();
      const q = (document.getElementById('pc-search-input').value || '').toLowerCase();
      const container = document.getElementById('pc-list-container');
      container.innerHTML = '';

      // All PCs item
      const allItem = document.createElement('div');
      allItem.className = 'pc-item ' + (selectedPc === 'all' ? 'active' : '');
      allItem.onclick = () => selectPc('all');
      allItem.innerHTML = \`
        <div class="pc-item-head">
          <span class="pc-name">💻 Semua Perangkat</span>
          <span class="pc-count">\${allRecords.reduce((sum, r) => sum + (r.itemCount || 0), 0)} Cookies</span>
        </div>
        <div class="pc-item-meta">
          <span>Semua Komputer Warnet</span>
          <span class="badge badge-plain">Global</span>
        </div>
      \`;
      container.appendChild(allItem);

      // Render individual PCs
      pcs.filter(p => p.name.toLowerCase().includes(q)).forEach(p => {
        const item = document.createElement('div');
        item.className = 'pc-item ' + (selectedPc === p.name ? 'active' : '');
        item.onclick = () => selectPc(p.name);

        const badgeHtml = p.hasEncrypted && !p.hasPlain
          ? '<span class="badge badge-encrypted">🔒 Terkunci</span>'
          : '<span class="badge badge-plain">🔓 Tanpa Password</span>';

        const timeStr = formatRelativeTime(p.lastSeen);

        item.innerHTML = \`
          <div class="pc-item-head">
            <span class="pc-name">🖥️ \${escapeHtml(p.name)}</span>
            <span class="pc-count">\${p.totalCookies}</span>
          </div>
          <div class="pc-item-meta">
            <span>\${timeStr}</span>
            \${badgeHtml}
          </div>
        \`;
        container.appendChild(item);
      });
    }

    function selectPc(name) {
      selectedPc = name;
      selectedDomain = 'all';
      renderPcList();
      renderDomainPills();
      renderActivePcHeader();
      renderTable();
    }

    function renderActivePcHeader() {
      const titleEl = document.getElementById('active-pc-title');
      const ipEl = document.getElementById('active-pc-ip');
      const lastSeenEl = document.getElementById('active-pc-lastseen');
      const countEl = document.getElementById('active-pc-count');
      const badgeEl = document.getElementById('active-pc-pwd-badge');

      if (selectedPc === 'all') {
        titleEl.innerHTML = '<span>💻 Semua Komputer / Perangkat</span> <span class="badge badge-plain">Global</span>';
        ipEl.textContent = 'IP: Semua Client';
        lastSeenEl.textContent = 'Update: Realtime';
        const total = allRecords.reduce((s, r) => s + (r.itemCount || 0), 0);
        countEl.textContent = 'Total: ' + total + ' Cookie';
      } else {
        const pcs = getUniquePcs();
        const found = pcs.find(p => p.name === selectedPc);
        if (found) {
          titleEl.innerHTML = \`<span>🖥️ \${escapeHtml(found.name)}</span> \${found.hasEncrypted && !found.hasPlain ? '<span class="badge badge-encrypted">🔒 Terkunci</span>' : '<span class="badge badge-plain">🔓 Tanpa Password</span>'}\`;
          ipEl.textContent = 'IP: ' + found.ip;
          lastSeenEl.textContent = 'Update: ' + formatRelativeTime(found.lastSeen);
          countEl.textContent = 'Total: ' + found.totalCookies + ' Cookie';
        }
      }
    }

    function getFilteredRecords() {
      if (selectedPc === 'all') return allRecords;
      return allRecords.filter(r => r.pcName === selectedPc);
    }

    function renderDomainPills() {
      const records = getFilteredRecords();
      const domainCounts = new Map();
      let total = 0;

      for (const r of records) {
        if (Array.isArray(r.cookies)) {
          for (const c of r.cookies) {
            const d = cleanDomain(c.domain);
            domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
            total++;
          }
        }
      }

      document.getElementById('pill-all-count').textContent = total;
      const container = document.getElementById('domain-pills-container');
      
      // Preserve first button (All domains)
      const allBtn = container.firstElementChild;
      allBtn.className = 'domain-pill ' + (selectedDomain === 'all' ? 'active' : '');
      container.innerHTML = '';
      container.appendChild(allBtn);

      const sortedDomains = Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1]);
      for (const [dom, count] of sortedDomains) {
        const btn = document.createElement('button');
        btn.className = 'domain-pill ' + (selectedDomain === dom ? 'active' : '');
        btn.onclick = () => selectDomain(dom);
        btn.innerHTML = \`<span>\${escapeHtml(dom)}</span> <span class="domain-pill-badge">\${count}</span>\`;
        container.appendChild(btn);
      }
    }

    function selectDomain(dom) {
      selectedDomain = dom;
      renderDomainPills();
      renderTable();
    }

    function setSecurityFilter(filter) {
      securityFilter = filter;
      document.querySelectorAll('.table-filter-group .btn').forEach(b => b.classList.remove('active'));
      document.getElementById('filter-' + filter).classList.add('active');
      renderTable();
    }

    function renderTable() {
      const records = getFilteredRecords();
      const q = (document.getElementById('cookie-search-input').value || '').toLowerCase();
      const tbody = document.getElementById('cookies-tbody');
      const emptyState = document.getElementById('empty-state');
      tbody.innerHTML = '';

      let matchingCookies = [];

      for (const r of records) {
        // Filter by security type
        if (securityFilter === 'plain' && r.isEncrypted) continue;
        if (securityFilter === 'encrypted' && !r.isEncrypted) continue;

        if (Array.isArray(r.cookies)) {
          for (const c of r.cookies) {
            const dom = cleanDomain(c.domain);
            if (selectedDomain !== 'all' && dom !== selectedDomain) continue;

            const name = c.name || '';
            const val = String(c.value || '');
            const path = c.path || '/';

            if (q) {
              const fullStr = (name + ' ' + val + ' ' + dom + ' ' + path).toLowerCase();
              if (!fullStr.includes(q)) continue;
            }

            matchingCookies.push({
              cookie: c,
              recordId: r.id,
              pcName: r.pcName,
              isEncrypted: r.isEncrypted
            });
          }
        }
      }

      if (matchingCookies.length === 0) {
        emptyState.style.display = 'flex';
        return;
      }
      emptyState.style.display = 'none';

      for (const item of matchingCookies) {
        const c = item.cookie;
        const tr = document.createElement('tr');
        const cookieKey = item.recordId + '_' + c.name;
        const isRevealed = Boolean(revealedValues[cookieKey]);
        const displayVal = isRevealed ? (c.value || '') : '••••••••••••••••';

        const pwdBadge = item.isEncrypted
          ? '<span class="badge badge-encrypted">🔒 Ada Password</span>'
          : '<span class="badge badge-plain">🔓 Tanpa Password</span>';

        // Expiry
        let expText = 'Session';
        if (c.expirationDate) {
          const expDate = new Date(c.expirationDate * 1000);
          expText = expDate > new Date() ? expDate.toLocaleDateString() : '⚠️ Expired';
        }

        tr.innerHTML = \`
          <td>
            <span class="brand-badge" style="color: white; border-color: rgba(255,255,255,0.15);">\${escapeHtml(cleanDomain(c.domain))}</span>
          </td>
          <td>
            <div class="cookie-name">\${escapeHtml(c.name)}</div>
          </td>
          <td>
            <div class="cookie-val-box">
              <span class="val-text" id="val-\${cookieKey}">\${escapeHtml(displayVal)}</span>
              <div>
                <button class="copy-icon-btn" title="Toggle Show" onclick="toggleReveal('\${cookieKey}', '\${escapeJs(c.value || '')}')">👁️</button>
                <button class="copy-icon-btn" title="Copy Value" onclick="copyText('\${escapeJs(c.value || '')}')">📋</button>
              </div>
            </div>
          </td>
          <td>\${pwdBadge}</td>
          <td>
            <div class="flag-pills">
              \${c.secure ? '<span class="flag flag-sec">Secure</span>' : ''}
              \${c.httpOnly ? '<span class="flag flag-http">HttpOnly</span>' : ''}
              \${c.sameSite ? '<span class="flag flag-same">' + escapeHtml(c.sameSite) + '</span>' : ''}
            </div>
          </td>
          <td style="font-size: 11px; color: var(--text-muted); font-family: 'JetBrains Mono', monospace;">
            \${expText}
          </td>
          <td style="text-align: right;">
            <button class="btn btn-secondary btn-sm" title="Copy Name=Value" onclick="copyText('\${escapeJs(c.name + '=' + c.value)}')">Copy</button>
          </td>
        \`;

        tbody.appendChild(tr);
      }
    }

    function toggleReveal(key, fullVal) {
      revealedValues[key] = !revealedValues[key];
      const el = document.getElementById('val-' + key);
      if (el) {
        el.textContent = revealedValues[key] ? fullVal : '••••••••••••••••';
      }
    }

    function copyText(txt) {
      navigator.clipboard.writeText(txt).then(() => {
        alert('Tersalin ke clipboard!');
      }).catch(() => {
        prompt('Salin manual:', txt);
      });
    }

    function copyCurrentCookiesJson() {
      const records = getFilteredRecords();
      let cookies = [];
      for (const r of records) {
        if (Array.isArray(r.cookies)) cookies.push(...r.cookies);
      }
      if (selectedDomain !== 'all') {
        cookies = cookies.filter(c => cleanDomain(c.domain) === selectedDomain);
      }
      copyText(JSON.stringify(cookies, null, 2));
    }

    function downloadCurrentCookies() {
      const records = getFilteredRecords();
      let cookies = [];
      for (const r of records) {
        if (Array.isArray(r.cookies)) cookies.push(...r.cookies);
      }
      if (selectedDomain !== 'all') {
        cookies = cookies.filter(c => cleanDomain(c.domain) === selectedDomain);
      }
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cookies, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", (selectedPc !== 'all' ? selectedPc : 'cookies') + "-" + selectedDomain + ".json");
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }

    async function deleteCurrentPcData() {
      if (selectedPc === 'all') {
        if (!confirm('Hapus seluruh cookie di server?')) return;
      } else {
        if (!confirm('Hapus semua cookie untuk ' + selectedPc + '?')) return;
      }

      await fetch('/api/pcs/' + encodeURIComponent(selectedPc), { method: 'DELETE' });
      selectedPc = 'all';
      await fetchData();
    }

    function openApiGuideModal() {
      document.getElementById('api-guide-modal').classList.add('open');
    }
    function closeApiGuideModal() {
      document.getElementById('api-guide-modal').classList.remove('open');
    }
    function closeModalOnBackdrop(e) {
      if (e.target.id === 'api-guide-modal') closeApiGuideModal();
    }

    function formatRelativeTime(dateStr) {
      const d = new Date(dateStr);
      const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
      if (diffSec < 10) return 'Baru saja';
      if (diffSec < 60) return diffSec + ' dtk lalu';
      const min = Math.floor(diffSec / 60);
      if (min < 60) return min + ' mnt lalu';
      const hr = Math.floor(min / 60);
      if (hr < 24) return hr + ' jam lalu';
      return d.toLocaleDateString();
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function escapeJs(str) {
      if (!str) return '';
      return String(str)
        .replace(/\\\\/g, '\\\\\\\\')
        .replace(/'/g, "\\\\'")
        .replace(/\\"/g, '\\\\"')
        .replace(/\\n/g, '\\\\n')
        .replace(/\\r/g, '');
    }

    // Auto-refresh every 5 seconds
    setInterval(fetchData, 5000);
    fetchData();
  </script>
</body>
</html>`;
}

// HTTP Server
const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const normPath = pathname.replace(/\/+$/, '') || '/';
  const isHead = req.method === 'HEAD';
  const isGetOrHead = req.method === 'GET' || isHead;
  const currentHost = (req.headers['x-forwarded-host'] || req.headers.host || 'erul.my.id').split(':')[0];

  // 1. Health Endpoint
  if (normPath === '/health' || normPath === '/api/_extension_' || normPath === '/api/_extension_/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'cookie-editor-dashboard',
      domain: currentHost,
      version: '2.0.0',
      timestamp: new Date().toISOString()
    }, isHead);
  }

  // 2. Dashboard UI (GET / or GET /dashboard or GET /cookies)
  if (isGetOrHead && (normPath === '/' || normPath === '/dashboard' || normPath === '/cookies')) {
    return sendHtml(res, getDashboardHtml(currentHost), isHead);
  }

  // 3. API: List all cookies & stats (GET /api/cookies or GET /api/backup/cookies)
  if (isGetOrHead && (normPath === '/api/cookies' || normPath === '/api/backup/cookies' || normPath === '/api/_extension_/cookies')) {
    const records = loadAllRecords();
    const pcSet = new Set();
    const domainSet = new Set();
    let totalCookies = 0;
    let plainCount = 0;
    let encryptedCount = 0;

    for (const r of records) {
      pcSet.add(r.pcName);
      for (const d of r.domains) domainSet.add(d);
      totalCookies += (r.itemCount || 0);
      if (r.isEncrypted) encryptedCount += (r.itemCount || 0);
      else plainCount += (r.itemCount || 0);
    }

    return sendJson(res, 200, {
      status: 'success',
      stats: {
        totalPcs: pcSet.size,
        totalDomains: domainSet.size,
        totalCookies,
        plainCount,
        encryptedCount
      },
      records
    }, isHead);
  }

  // 4. API: POST cookies (from PC, Extension, or Android APK)
  if (req.method === 'POST' && (normPath === '/api/cookies' || normPath === '/api/backup/cookies' || normPath === '/api/_extension_/cookies')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 20 * 1024 * 1024) { // 20MB limit
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload exceeds 20MB limit' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);

        // Extract PC / Machine Name
        let pcName = req.headers['x-pc-name'] || req.headers['x-client-name'] || payload.pc || payload.pcName || payload.client || payload.metadata?.pc || payload.metadata?.client || payload.metadata?.pcName;
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '127.0.0.1';
        if (!pcName || pcName.trim() === '') {
          pcName = `PC-${clientIp.split('.').pop() || '01'}`;
        }

        // Determine if encrypted (per user request: ensure client sends plain cookies without password)
        const isEncrypted = Boolean(payload.format === 'advanced-cookie-editor-encrypted' || payload.isEncrypted);

        // Normalize cookie list
        let cookies = [];
        if (Array.isArray(payload.cookies)) {
          cookies = payload.cookies;
        } else if (Array.isArray(payload)) {
          cookies = payload;
        } else if (payload.payload && Array.isArray(payload.payload.cookies)) {
          cookies = payload.payload.cookies;
        }

        const domain = payload.domain || payload.metadata?.domain || (cookies.length > 0 && cookies[0].domain ? cleanDomain(cookies[0].domain) : 'all');
        const safePc = pcName.trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        const id = payload.isManualBackup ? ('bk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8)) : ('pc_' + safePc);
        const filename = `${id}.json`;

        const record = {
          id,
          pcName: pcName.trim(),
          clientIp,
          savedAt: new Date().toISOString(),
          isEncrypted,
          passwordProtected: isEncrypted,
          itemCount: cookies.length,
          domain,
          cookies,
          payload
        };

        fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(record, null, 2));
        rotateBackups();

        return sendJson(res, 201, {
          status: 'success',
          id,
          pcName: record.pcName,
          domain,
          itemCount: record.itemCount,
          isEncrypted,
          message: `Cookies successfully received and saved to ${currentHost} dashboard`
        });
      } catch (err) {
        return sendJson(res, 400, { error: 'Invalid JSON payload: ' + err.message });
      }
    });
    return;
  }

  // 5. API: Delete PC or specific backup
  const matchPc = normPath.match(/^\/api\/pcs\/(.+)$/);
  if (req.method === 'DELETE' && matchPc) {
    const pcTarget = decodeURIComponent(matchPc[1]);
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
    let deletedCount = 0;

    for (const f of files) {
      try {
        const fullPath = path.join(DATA_DIR, f);
        if (pcTarget === 'all') {
          fs.unlinkSync(fullPath);
          deletedCount++;
        } else {
          const raw = fs.readFileSync(fullPath, 'utf8');
          const d = JSON.parse(raw);
          if (d.pcName === pcTarget || d.pc === pcTarget || d.metadata?.client === pcTarget) {
            fs.unlinkSync(fullPath);
            deletedCount++;
          }
        }
      } catch {}
    }

    return sendJson(res, 200, { status: 'success', deletedCount, message: `Deleted ${deletedCount} records` });
  }

  sendJson(res, 404, { error: 'Route not found', path: pathname });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[+] Cookie Editor Dashboard Server running on http://127.0.0.1:${PORT}`);
  console.log(`[+] Serving web domain: https://erul.web.id/ and https://warnet.web.id/cookies`);
});

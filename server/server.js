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

function formatAsNetscape(cookies) {
  let lines = [
    '# Netscape HTTP Cookie File',
    '# http://curl.haxx.se/rfc/cookie_spec.html',
    '# Generated by Advanced Cookie Editor CMS (' + new Date().toISOString() + ')',
    '# domain\tinclude_subdomains\tpath\tsecure\texpiration\tname\tvalue'
  ];
  for (const c of cookies) {
    if (!c || !c.name) continue;
    const dom = c.domain || 'unknown';
    const sub = dom.startsWith('.') ? 'TRUE' : 'FALSE';
    const path = c.path || '/';
    const sec = c.secure ? 'TRUE' : 'FALSE';
    const exp = typeof c.expirationDate === 'number' ? Math.floor(c.expirationDate) : 0;
    const name = c.name;
    const val = c.value || '';
    lines.push(`${dom}\t${sub}\t${path}\t${sec}\t${exp}\t${name}\t${val}`);
  }
  return lines.join('\n');
}

function formatAsHeaderString(cookies) {
  return cookies.filter(c => c && c.name).map(c => `${c.name}=${c.value || ''}`).join('; ');
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
      border-bottom: 1px solid var(--border);
      padding-bottom: 12px;
    }
    .modal-title { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
    .close-btn { background: none; border: none; color: var(--text-muted); font-size: 22px; cursor: pointer; }
    .close-btn:hover { color: white; }

    /* Modal Form Styles */
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form-field { display: flex; flex-direction: column; gap: 6px; }
    .form-field label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
    .form-field input, .form-field select, .form-field textarea {
      background: var(--bg-input); border: 1px solid var(--border); color: var(--text-main);
      padding: 8px 12px; border-radius: 8px; font-size: 13px; outline: none; font-family: inherit;
    }
    .form-field textarea { min-height: 80px; font-family: 'JetBrains Mono', monospace; resize: vertical; }
    .form-field input:focus, .form-field select:focus, .form-field textarea:focus { border-color: var(--border-focus); }
    .checkbox-row { display: flex; gap: 14px; margin-top: 6px; flex-wrap: wrap; }
    .checkbox-label { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-main); cursor: pointer; }

    /* Toast Notification */
    .toast-container { position: fixed; bottom: 24px; right: 24px; z-index: 200; display: flex; flex-direction: column; gap: 10px; pointer-events: none; }
    .toast { pointer-events: auto; background: #171d2b; border: 1px solid var(--border); color: var(--text-main); padding: 12px 18px; border-radius: 10px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 10px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); }
    .toast.success { border-color: rgba(16, 185, 129, 0.4); color: #34d399; }
    .toast.error { border-color: rgba(239, 68, 68, 0.4); color: #f87171; }
    .toast.info { border-color: rgba(59, 130, 246, 0.4); color: #60a5fa; }

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
      <button class="btn btn-secondary btn-sm" id="btn-refresh" onclick="fetchData(false)">
        <i class="fa-solid fa-rotate" id="refresh-icon"></i> Refresh
      </button>
      <button class="btn btn-primary btn-sm" onclick="openAddCookieModal()">
        <i class="fa-solid fa-plus"></i> Tambah Cookie
      </button>
      <button class="btn btn-secondary btn-sm" onclick="openImportModal()">
        <i class="fa-solid fa-file-import"></i> Import
      </button>
      <button class="btn btn-secondary btn-sm" onclick="openExportModal()">
        <i class="fa-solid fa-file-export"></i> Export
      </button>
      <button class="btn btn-secondary btn-sm" onclick="openApiGuideModal()">
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
          <span><i class="fa-solid fa-server"></i> Daftar Komputer (PC)</span>
          <span id="pc-total-badge" class="brand-badge">0 PC</span>
        </div>
        <input type="text" id="pc-search-input" class="search-input" placeholder="🔍 Cari nama PC..." oninput="renderPcList()">
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
          <h4><i class="fa-solid fa-lightbulb" style="color: #f59e0b;"></i> Pengiriman Cookie Tanpa Password Aktif</h4>
          <p>
            Semua cookie yang dikirim dari <strong>Ekstensi Chrome/Edge</strong> atau <strong>APK CookieBrowser</strong> disimpan secara langsung <strong>tanpa password</strong> ke MySQL MariaDB. Anda dapat melihat, mengedit, menambah, dan mengunduh cookie per domain.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="openApiGuideModal()"><i class="fa-solid fa-code"></i> Endpoint API</button>
      </div>

      <!-- Realtime Browser Session Monitor Card -->
      <div class="session-monitor-card" style="background: var(--bg-surface); border: 1px solid var(--border); border-radius: 12px; padding: 18px 20px; margin-bottom: 20px; box-shadow: 0 4px 20px rgba(0,0,0,0.25);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; border-bottom: 1px solid var(--border); padding-bottom: 12px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); display: flex; align-items: center; justify-content: center; color: #ef4444; font-size: 18px;">
              <i class="fa-solid fa-tower-broadcast"></i>
            </div>
            <div>
              <h3 style="font-size: 16px; font-weight: 700; color: white; display: flex; align-items: center; gap: 8px;">
                Browser Session Monitor (Realtime 1s)
                <span class="badge" style="font-size: 11px; background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 700;">
                  <i class="fa-solid fa-bolt"></i> 1s Heartbeat Active
                </span>
              </h3>
              <p style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                Memantau status sesi login per perangkat secara realtime tanpa membocorkan cookie atau kredensial autentikasi.
              </p>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary btn-sm" onclick="fetchSessionMonitorData(false)">
              <i class="fa-solid fa-arrows-rotate" id="btn-refresh-monitor"></i> Refresh Monitor
            </button>
          </div>
        </div>

        <div id="session-monitor-device-list" style="display: flex; flex-direction: column; gap: 10px;">
          <div style="text-align: center; padding: 20px; color: var(--text-muted); font-size: 13px;">
            <i class="fa-solid fa-spinner fa-spin"></i> Menghubungkan ke monitor sesi...
          </div>
        </div>
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
            <i class="fa-solid fa-copy"></i> Copy JSON
          </button>
          <button class="btn btn-secondary btn-sm" onclick="copyCurrentCookiesHeader()">
            <i class="fa-solid fa-cookie"></i> Copy Header
          </button>
          <button class="btn btn-secondary btn-sm" onclick="openExportModal()">
            <i class="fa-solid fa-download"></i> Download
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteCurrentPcData()">
            <i class="fa-solid fa-trash"></i> Hapus Data PC Ini
          </button>
        </div>
      </div>

      <!-- Domain Pills Filter -->
      <div class="domain-pills-card">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div class="domain-pills-label" style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--text-muted);">
            <i class="fa-solid fa-globe"></i> Pilih Domain Situs:
          </div>
          <input type="text" id="domain-search-input" class="search-input" style="max-width: 260px; padding: 4px 10px; font-size: 12px;" placeholder="🔍 Filter domain..." oninput="renderDomainPills()">
        </div>
        <div class="domain-pills" id="domain-pills-container" style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; flex-wrap: wrap; max-height: 140px;">
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
          <input type="text" id="cookie-search-input" class="search-input table-search" placeholder="🔍 Cari nama cookie, value, path, domain..." oninput="onSearchInput()">
          <div class="table-filter-group">
            <button class="btn btn-secondary btn-sm active" id="filter-all" onclick="setSecurityFilter('all')">Semua</button>
            <button class="btn btn-secondary btn-sm" id="filter-plain" onclick="setSecurityFilter('plain')"><i class="fa-solid fa-lock-open"></i> Tanpa Password</button>
            <button class="btn btn-secondary btn-sm" id="filter-encrypted" onclick="setSecurityFilter('encrypted')"><i class="fa-solid fa-lock"></i> Terenkripsi</button>
            <div style="display: flex; align-items: center; gap: 6px; margin-left: 8px;">
              <span style="font-size: 12px; color: var(--text-muted);">Tampilkan:</span>
              <select id="page-size-select" class="search-input" style="width: auto; padding: 4px 8px; font-size: 12px;" onchange="changePageSize(this.value)">
                <option value="25">25</option>
                <option value="50" selected>50</option>
                <option value="100">100</option>
                <option value="250">250</option>
                <option value="all">Semua</option>
              </select>
            </div>
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
            <div class="empty-icon"><i class="fa-solid fa-cookie"></i></div>
            <p>Tidak ada cookie yang cocok dengan filter atau pencarian.</p>
          </div>
        </div>

        <!-- Table Pagination Footer -->
        <div class="table-pagination" style="padding: 12px 20px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--text-muted); flex-wrap: wrap; gap: 10px;">
          <div>
            Menampilkan <span id="page-range" style="font-weight: 700; color: white;">0 - 0</span> dari <span id="page-total" style="font-weight: 700; color: var(--accent);">0</span> cookie
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn btn-secondary btn-sm" id="btn-prev-page" onclick="prevPage()">
              <i class="fa-solid fa-chevron-left"></i> Prev
            </button>
            <span id="page-indicator" style="font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600;">Halaman 1 / 1</span>
            <button class="btn btn-secondary btn-sm" id="btn-next-page" onclick="nextPage()">
              Next <i class="fa-solid fa-chevron-right"></i>
            </button>
          </div>
        </div>
      </div>

    </section>
  </main>

  <!-- Modal 1: Tambah Cookie Baru -->
  <div class="modal-overlay" id="modal-add-cookie" onclick="closeModalOnBackdrop(event, 'modal-add-cookie')">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-plus-circle" style="color: var(--accent);"></i> Tambah Cookie Baru</div>
        <button class="close-btn" onclick="closeModal('modal-add-cookie')">&times;</button>
      </div>
      <form id="form-add-cookie" onsubmit="submitAddCookie(event)">
        <div class="form-field" style="margin-bottom: 12px;">
          <label for="add-pc-name">Target Perangkat (PC):</label>
          <select id="add-pc-name" class="search-input" required></select>
        </div>
        <div class="form-row" style="margin-bottom: 12px;">
          <div class="form-field">
            <label for="add-name">Nama Cookie:*</label>
            <input type="text" id="add-name" placeholder="contoh: session_id" required>
          </div>
          <div class="form-field">
            <label for="add-domain">Domain:*</label>
            <input type="text" id="add-domain" placeholder="contoh: .erul.my.id" required>
          </div>
        </div>
        <div class="form-field" style="margin-bottom: 12px;">
          <label for="add-value">Nilai (Value):*</label>
          <textarea id="add-value" placeholder="Paste isi cookie di sini..." required></textarea>
        </div>
        <div class="form-row" style="margin-bottom: 12px;">
          <div class="form-field">
            <label for="add-path">Path:</label>
            <input type="text" id="add-path" value="/" required>
          </div>
          <div class="form-field">
            <label for="add-samesite">SameSite:</label>
            <select id="add-samesite">
              <option value="unspecified">Unspecified (Default)</option>
              <option value="lax">Lax</option>
              <option value="strict">Strict</option>
              <option value="no_restriction">None / No Restriction</option>
            </select>
          </div>
        </div>
        <div class="form-field" style="margin-bottom: 14px;">
          <label>Keamanan & Atribut:</label>
          <div class="checkbox-row">
            <label class="checkbox-label"><input type="checkbox" id="add-secure" checked> Secure (HTTPS)</label>
            <label class="checkbox-label"><input type="checkbox" id="add-httponly"> HttpOnly</label>
            <label class="checkbox-label"><input type="checkbox" id="add-session" checked onchange="toggleAddExpiry(this.checked)"> Session Cookie</label>
          </div>
        </div>
        <div class="form-field" id="add-expiry-wrapper" style="display: none; margin-bottom: 16px;">
          <label for="add-expiry">Kedaluwarsa (Tanggal/Waktu):</label>
          <input type="datetime-local" id="add-expiry">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('modal-add-cookie')">Batal</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-check"></i> Simpan Cookie</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 2: Edit Cookie -->
  <div class="modal-overlay" id="modal-edit-cookie" onclick="closeModalOnBackdrop(event, 'modal-edit-cookie')">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-pen-to-square" style="color: var(--accent);"></i> Edit Cookie</div>
        <button class="close-btn" onclick="closeModal('modal-edit-cookie')">&times;</button>
      </div>
      <form id="form-edit-cookie" onsubmit="submitEditCookie(event)">
        <input type="hidden" id="edit-orig-pc">
        <input type="hidden" id="edit-orig-name">
        <input type="hidden" id="edit-orig-domain">
        <input type="hidden" id="edit-orig-path">
        
        <div class="form-row" style="margin-bottom: 12px;">
          <div class="form-field">
            <label for="edit-name">Nama Cookie:*</label>
            <input type="text" id="edit-name" required>
          </div>
          <div class="form-field">
            <label for="edit-domain">Domain:*</label>
            <input type="text" id="edit-domain" required>
          </div>
        </div>
        <div class="form-field" style="margin-bottom: 12px;">
          <label for="edit-value">Nilai (Value):*</label>
          <textarea id="edit-value" required></textarea>
        </div>
        <div class="form-row" style="margin-bottom: 12px;">
          <div class="form-field">
            <label for="edit-path">Path:</label>
            <input type="text" id="edit-path" required>
          </div>
          <div class="form-field">
            <label for="edit-samesite">SameSite:</label>
            <select id="edit-samesite">
              <option value="unspecified">Unspecified (Default)</option>
              <option value="lax">Lax</option>
              <option value="strict">Strict</option>
              <option value="no_restriction">None</option>
            </select>
          </div>
        </div>
        <div class="form-field" style="margin-bottom: 14px;">
          <label>Keamanan & Atribut:</label>
          <div class="checkbox-row">
            <label class="checkbox-label"><input type="checkbox" id="edit-secure"> Secure</label>
            <label class="checkbox-label"><input type="checkbox" id="edit-httponly"> HttpOnly</label>
            <label class="checkbox-label"><input type="checkbox" id="edit-session" onchange="toggleEditExpiry(this.checked)"> Session</label>
          </div>
        </div>
        <div class="form-field" id="edit-expiry-wrapper" style="margin-bottom: 16px;">
          <label for="edit-expiry">Kedaluwarsa (Tanggal/Waktu):</label>
          <input type="datetime-local" id="edit-expiry">
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('modal-edit-cookie')">Batal</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> Simpan Perubahan</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 3: Import Cookies -->
  <div class="modal-overlay" id="modal-import-cookie" onclick="closeModalOnBackdrop(event, 'modal-import-cookie')">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-file-import" style="color: var(--accent);"></i> Import Cookies JSON</div>
        <button class="close-btn" onclick="closeModal('modal-import-cookie')">&times;</button>
      </div>
      <form id="form-import-cookie" onsubmit="submitImportCookies(event)">
        <div class="form-field" style="margin-bottom: 12px;">
          <label for="import-pc-name">Target Perangkat (PC):</label>
          <select id="import-pc-name" class="search-input" required></select>
        </div>
        <div class="form-field" style="margin-bottom: 12px;">
          <label for="import-file">Pilih File JSON (.json):</label>
          <input type="file" id="import-file" accept=".json" onchange="handleImportFileSelect(event)">
        </div>
        <div class="form-field" style="margin-bottom: 12px;">
          <label for="import-json">Atau Paste JSON di Sini:</label>
          <textarea id="import-json" style="min-height: 130px;" placeholder="[ { 'name': '...', 'value': '...', 'domain': '...' } ]" oninput="validateImportJson()"></textarea>
        </div>
        <div id="import-preview-badge" style="font-size: 12px; color: var(--text-muted); margin-bottom: 16px;">
          Siap mengimpor: <strong id="import-count-preview" style="color: var(--accent);">0</strong> cookie terdeteksi.
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" class="btn btn-secondary" onclick="closeModal('modal-import-cookie')">Batal</button>
          <button type="submit" class="btn btn-primary" id="btn-do-import"><i class="fa-solid fa-upload"></i> Proses Import</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Modal 4: Export Cookies -->
  <div class="modal-overlay" id="modal-export-cookie" onclick="closeModalOnBackdrop(event, 'modal-export-cookie')">
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title"><i class="fa-solid fa-file-export" style="color: var(--accent);"></i> Export Cookies</div>
        <button class="close-btn" onclick="closeModal('modal-export-cookie')">&times;</button>
      </div>
      <div style="display: flex; flex-direction: column; gap: 14px;">
        <div class="form-row">
          <div class="form-field">
            <label for="export-pc">Pilih PC:</label>
            <select id="export-pc" class="search-input"></select>
          </div>
          <div class="form-field">
            <label for="export-domain">Pilih Domain:</label>
            <select id="export-domain" class="search-input"></select>
          </div>
        </div>
        <div class="form-field">
          <label for="export-format">Format Output:</label>
          <select id="export-format" class="search-input" onchange="updateExportPreview()">
            <option value="json">JSON Array (Format Standar Cookie Editor)</option>
            <option value="netscape">Netscape HTTP Cookie File (cookies.txt untuk cURL / wget)</option>
            <option value="header">HTTP Cookie Header String (RFC 6265: a=b; c=d)</option>
          </select>
        </div>
        <div class="form-field">
          <label>Pratinjau Data (Preview):</label>
          <textarea id="export-preview-box" readonly style="min-height: 120px; font-size: 11px;"></textarea>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
          <button type="button" class="btn btn-secondary btn-sm" onclick="copyExportText()">
            <i class="fa-solid fa-copy"></i> Salin ke Clipboard
          </button>
          <div style="display: flex; gap: 8px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeModal('modal-export-cookie')">Tutup</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="triggerExportDownload()">
              <i class="fa-solid fa-download"></i> Unduh File
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>

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

  <!-- Toast Notification Container -->
  <div id="toast-container" class="toast-container"></div>

  <script>
    let allRecords = [];
    let selectedPc = 'all';
    let selectedDomain = 'all';
    let securityFilter = 'all';
    let revealedValues = {};
    let domainFilterQuery = '';
    let pageSize = 25;
    let currentPage = 1;
    let isFetching = false;

    // --- TOAST NOTIFICATIONS ---
    function showToast(message, type) {
      type = type || 'info';
      const container = document.getElementById('toast-container');
      if (!container) return;
      const toast = document.createElement('div');
      toast.className = 'toast toast-' + type;

      let icon = 'fa-circle-info';
      if (type === 'success') icon = 'fa-circle-check';
      else if (type === 'error') icon = 'fa-triangle-exclamation';
      else if (type === 'warning') icon = 'fa-circle-exclamation';

      toast.innerHTML = '<i class="fa-solid ' + icon + '"></i><span>' + escapeHtml(message) + '</span>';
      container.appendChild(toast);

      setTimeout(function() {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(function() { toast.remove(); }, 300);
      }, 3500);
    }

    // --- MODAL CONTROLS ---
    function openModal(modalId) {
      populatePcSelects();
      const el = document.getElementById(modalId);
      if (el) el.classList.add('open');
      if (modalId === 'modal-export-cookie') {
        updateExportPreview();
      }
    }

    function closeModal(modalId) {
      const el = document.getElementById(modalId);
      if (el) el.classList.remove('open');
    }

    function closeModalOnBackdrop(e, modalId) {
      if (e.target.classList.contains('modal-overlay')) {
        closeModal(modalId || e.target.id);
      }
    }

    function openApiGuideModal() {
      const el = document.getElementById('api-guide-modal');
      if (el) el.classList.add('open');
    }

    function closeApiGuideModal() {
      const el = document.getElementById('api-guide-modal');
      if (el) el.classList.remove('open');
    }

    function populatePcSelects() {
      const pcs = getUniquePcs();
      const addSelect = document.getElementById('add-pc-name');
      const importSelect = document.getElementById('import-pc-name');
      const exportSelect = document.getElementById('export-pc');
      const exportDomainSelect = document.getElementById('export-domain');

      const pcOptions = pcs.map(function(p) {
        return '<option value="' + escapeHtml(p.name) + '">' + escapeHtml(p.name) + ' (' + p.totalCookies + ' cookies)</option>';
      }).join('');

      const defaultPc = selectedPc !== 'all' ? selectedPc : (pcs.length > 0 ? pcs[0].name : 'PC-01');

      if (addSelect) {
        addSelect.innerHTML = pcOptions || '<option value="PC-01">PC-01</option>';
        if (selectedPc !== 'all') addSelect.value = selectedPc;
      }
      if (importSelect) {
        importSelect.innerHTML = pcOptions || '<option value="PC-01">PC-01</option>';
        if (selectedPc !== 'all') importSelect.value = selectedPc;
      }
      if (exportSelect) {
        exportSelect.innerHTML = '<option value="all">Semua PC (Global)</option>' + pcOptions;
        exportSelect.value = selectedPc;
      }
      if (exportDomainSelect) {
        const domains = getUniqueDomainsForPc(exportSelect ? exportSelect.value : 'all');
        exportDomainSelect.innerHTML = '<option value="all">Semua Domain</option>' + domains.map(function(d) {
          return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>';
        }).join('');
        exportDomainSelect.value = selectedDomain;
      }
    }

    // --- DATA FETCHING & STATS ---
    async function fetchData(isBackground) {
      if (isFetching) return;
      isFetching = true;
      const refreshBtn = document.getElementById('btn-refresh');
      if (refreshBtn && !isBackground) {
        refreshBtn.classList.add('fa-spin');
      }

      try {
        const res = await fetch('/api/cookies');
        const json = await res.json();
        allRecords = json.records || [];
        updateStats(json.stats || {});
        renderPcList();
        renderDomainPills();
        renderActivePcHeader();
        renderTable();
        if (!isBackground) {
          showToast('Data cookie berhasil disinkronkan', 'success');
        }
      } catch (err) {
        console.error('Error fetching cookies:', err);
        if (!isBackground) {
          showToast('Gagal memuat data: ' + err.message, 'error');
        }
      } finally {
        isFetching = false;
        if (refreshBtn) refreshBtn.classList.remove('fa-spin');
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
            name: name,
            totalCookies: 0,
            hasEncrypted: false,
            hasPlain: false,
            lastSeen: r.savedAt,
            ip: r.clientIp,
            records: []
          });
        }
        const item = pcMap.get(name);
        item.totalCookies += (r.itemCount || 0);
        if (r.isEncrypted) item.hasEncrypted = true;
        else item.hasPlain = true;
        if (new Date(r.savedAt) > new Date(item.lastSeen)) {
          item.lastSeen = r.savedAt;
        }
        item.records.push(r);
      }
      return Array.from(pcMap.values());
    }

    function getUniqueDomainsForPc(pcName) {
      const records = pcName === 'all' ? allRecords : allRecords.filter(function(r) { return r.pcName === pcName; });
      const domSet = new Set();
      for (const r of records) {
        if (Array.isArray(r.cookies)) {
          for (const c of r.cookies) {
            domSet.add(cleanDomain(c.domain));
          }
        }
      }
      return Array.from(domSet).sort();
    }

    function renderPcList() {
      const pcs = getUniquePcs();
      const q = (document.getElementById('pc-search-input').value || '').toLowerCase();
      const container = document.getElementById('pc-list-container');
      if (!container) return;
      container.innerHTML = '';

      // All PCs item
      const allItem = document.createElement('div');
      allItem.className = 'pc-item ' + (selectedPc === 'all' ? 'active' : '');
      allItem.onclick = function() { selectPc('all'); };
      const totalGlobal = allRecords.reduce(function(sum, r) { return sum + (r.itemCount || 0); }, 0);
      allItem.innerHTML = 
        '<div class="pc-item-head">' +
          '<span class="pc-name">💻 Semua Perangkat</span>' +
          '<span class="pc-count">' + totalGlobal + ' Cookies</span>' +
        '</div>' +
        '<div class="pc-item-meta">' +
          '<span>Semua Komputer Warnet</span>' +
          '<span class="badge badge-plain">Global</span>' +
        '</div>';
      container.appendChild(allItem);

      // Individual PCs
      pcs.filter(function(p) { return p.name.toLowerCase().includes(q); }).forEach(function(p) {
        const item = document.createElement('div');
        item.className = 'pc-item ' + (selectedPc === p.name ? 'active' : '');
        item.onclick = function() { selectPc(p.name); };

        const badgeHtml = p.hasEncrypted && !p.hasPlain
          ? '<span class="badge badge-encrypted">🔒 Terkunci</span>'
          : '<span class="badge badge-plain">🔓 Tanpa Password</span>';

        item.innerHTML = 
          '<div class="pc-item-head">' +
            '<span class="pc-name">🖥️ ' + escapeHtml(p.name) + '</span>' +
            '<span class="pc-count">' + p.totalCookies + '</span>' +
          '</div>' +
          '<div class="pc-item-meta">' +
            '<span>' + formatRelativeTime(p.lastSeen) + '</span>' +
            badgeHtml +
          '</div>';
        container.appendChild(item);
      });
    }

    function selectPc(name) {
      selectedPc = name;
      selectedDomain = 'all';
      currentPage = 1;
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

      if (!titleEl) return;

      if (selectedPc === 'all') {
        titleEl.innerHTML = '<span>💻 Semua Komputer / Perangkat</span> <span class="badge badge-plain">Global</span>';
        if (ipEl) ipEl.textContent = 'IP: Semua Client';
        if (lastSeenEl) lastSeenEl.textContent = 'Update: Realtime';
        const total = allRecords.reduce(function(s, r) { return s + (r.itemCount || 0); }, 0);
        if (countEl) countEl.textContent = 'Total: ' + total + ' Cookie';
      } else {
        const pcs = getUniquePcs();
        const found = pcs.find(function(p) { return p.name === selectedPc; });
        if (found) {
          titleEl.innerHTML = '<span>🖥️ ' + escapeHtml(found.name) + '</span> ' + (found.hasEncrypted && !found.hasPlain ? '<span class="badge badge-encrypted">🔒 Terkunci</span>' : '<span class="badge badge-plain">🔓 Tanpa Password</span>');
          if (ipEl) ipEl.textContent = 'IP: ' + found.ip;
          if (lastSeenEl) lastSeenEl.textContent = 'Update: ' + formatRelativeTime(found.lastSeen);
          if (countEl) countEl.textContent = 'Total: ' + found.totalCookies + ' Cookie';
        }
      }
    }

    function getFilteredRecords() {
      if (selectedPc === 'all') return allRecords;
      return allRecords.filter(function(r) { return r.pcName === selectedPc; });
    }

    // --- DOMAIN SEARCH & FILTER PILLS ---
    function onDomainSearch(q) {
      domainFilterQuery = (q || '').toLowerCase();
      renderDomainPills();
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

      const allCountEl = document.getElementById('pill-all-count');
      if (allCountEl) allCountEl.textContent = total;

      const container = document.getElementById('domain-pills-container');
      if (!container) return;

      container.innerHTML = '';

      // All domains pill
      const allBtn = document.createElement('button');
      allBtn.type = 'button';
      allBtn.className = 'domain-pill ' + (selectedDomain === 'all' ? 'active' : '');
      allBtn.onclick = function() { selectDomain('all'); };
      allBtn.innerHTML = '<span>Semua Domain</span> <span class="domain-pill-badge" id="pill-all-count">' + total + '</span>';
      container.appendChild(allBtn);

      let sortedDomains = Array.from(domainCounts.entries()).sort(function(a, b) { return b[1] - a[1]; });

      if (domainFilterQuery) {
        sortedDomains = sortedDomains.filter(function(pair) {
          return pair[0].toLowerCase().includes(domainFilterQuery);
        });
      }

      for (const [dom, count] of sortedDomains) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'domain-pill ' + (selectedDomain === dom ? 'active' : '');
        btn.onclick = (function(d) {
          return function() { selectDomain(d); };
        })(dom);
        btn.innerHTML = '<span>' + escapeHtml(dom) + '</span> <span class="domain-pill-badge">' + count + '</span>';
        container.appendChild(btn);
      }
    }

    function selectDomain(dom) {
      selectedDomain = dom;
      currentPage = 1;
      renderDomainPills();
      renderTable();
    }

    function setSecurityFilter(filter) {
      securityFilter = filter;
      currentPage = 1;
      document.querySelectorAll('.table-filter-group .btn').forEach(function(b) { b.classList.remove('active'); });
      const activeBtn = document.getElementById('filter-' + filter);
      if (activeBtn) activeBtn.classList.add('active');
      renderTable();
    }

    // --- TABLE PAGINATION & RENDERING ---
    function changePageSize(size) {
      pageSize = size === 'all' ? 'all' : parseInt(size, 10);
      currentPage = 1;
      renderTable();
    }

    function prevPage() {
      if (currentPage > 1) {
        currentPage--;
        renderTable();
      }
    }

    function nextPage() {
      const records = getFilteredRecords();
      const matchingCookies = getMatchingCookiesList(records);
      const totalPages = pageSize === 'all' ? 1 : Math.ceil(matchingCookies.length / pageSize);
      if (currentPage < totalPages) {
        currentPage++;
        renderTable();
      }
    }

    function getMatchingCookiesList(records) {
      const q = (document.getElementById('cookie-search-input').value || '').toLowerCase();
      let list = [];

      for (const r of records) {
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

            list.push({
              cookie: c,
              recordId: r.id,
              pcName: r.pcName,
              isEncrypted: r.isEncrypted
            });
          }
        }
      }
      return list;
    }

    function renderTable() {
      const records = getFilteredRecords();
      const tbody = document.getElementById('cookies-tbody');
      const emptyState = document.getElementById('empty-state');
      if (!tbody) return;
      tbody.innerHTML = '';

      const matchingCookies = getMatchingCookiesList(records);
      const totalCount = matchingCookies.length;

      // Update Pagination UI
      const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(totalCount / pageSize));
      if (currentPage > totalPages) currentPage = totalPages;

      let startIndex = 0;
      let endIndex = totalCount;
      if (pageSize !== 'all') {
        startIndex = (currentPage - 1) * pageSize;
        endIndex = Math.min(startIndex + pageSize, totalCount);
      }

      const pageRangeEl = document.getElementById('page-range');
      const pageTotalEl = document.getElementById('page-total');
      const pageIndicatorEl = document.getElementById('page-indicator');
      const btnPrev = document.getElementById('btn-prev-page');
      const btnNext = document.getElementById('btn-next-page');

      if (pageRangeEl) pageRangeEl.textContent = totalCount === 0 ? '0' : ((startIndex + 1) + '-' + endIndex);
      if (pageTotalEl) pageTotalEl.textContent = totalCount;
      if (pageIndicatorEl) pageIndicatorEl.textContent = 'Halaman ' + currentPage + ' / ' + totalPages;
      if (btnPrev) btnPrev.disabled = currentPage <= 1;
      if (btnNext) btnNext.disabled = currentPage >= totalPages;

      if (totalCount === 0) {
        if (emptyState) emptyState.style.display = 'flex';
        return;
      }
      if (emptyState) emptyState.style.display = 'none';

      const pageItems = matchingCookies.slice(startIndex, endIndex);

      for (const item of pageItems) {
        const c = item.cookie;
        const tr = document.createElement('tr');
        const cookieKey = item.recordId + '_' + c.name;
        const isRevealed = Boolean(revealedValues[cookieKey]);
        const displayVal = isRevealed ? (c.value || '') : '••••••••••••••••';

        const pwdBadge = item.isEncrypted
          ? '<span class="badge badge-encrypted">🔒 Ada Password</span>'
          : '<span class="badge badge-plain">🔓 Tanpa Password</span>';

        let expText = 'Session';
        if (c.expirationDate) {
          const expDate = new Date(c.expirationDate * 1000);
          expText = expDate > new Date() ? expDate.toLocaleDateString() : '⚠️ Expired';
        }

        const safeCookieJson = escapeHtml(JSON.stringify(c));
        const safePcName = escapeHtml(item.pcName);

        tr.innerHTML = 
          '<td><span class="brand-badge" style="color: white; border-color: rgba(255,255,255,0.15);">' + escapeHtml(cleanDomain(c.domain)) + '</span></td>' +
          '<td><div class="cookie-name">' + escapeHtml(c.name) + '</div><div style="font-size: 11px; color: var(--text-dim);">' + escapeHtml(c.path || '/') + '</div></td>' +
          '<td>' +
            '<div class="cookie-val-box">' +
              '<span class="val-text" id="val-' + cookieKey + '">' + escapeHtml(displayVal) + '</span>' +
              '<div style="display: flex; gap: 4px;">' +
                '<button class="copy-icon-btn" title="Toggle Show" onclick="toggleReveal(\'' + cookieKey + '\', \'' + escapeJs(c.value || '') + '\')">👁️</button>' +
                '<button class="copy-icon-btn" title="Copy Value" onclick="copyText(\'' + escapeJs(c.value || '') + '\')">📋</button>' +
              '</div>' +
            '</div>' +
          '</td>' +
          '<td>' + pwdBadge + '</td>' +
          '<td>' +
            '<div class="flag-pills">' +
              (c.secure ? '<span class="flag flag-sec">Secure</span>' : '') +
              (c.httpOnly ? '<span class="flag flag-http">HttpOnly</span>' : '') +
              (c.sameSite ? '<span class="flag flag-same">' + escapeHtml(c.sameSite) + '</span>' : '') +
            '</div>' +
          '</td>' +
          '<td style="font-size: 11px; color: var(--text-muted); font-family: monospace;">' + expText + '</td>' +
          '<td style="text-align: right; white-space: nowrap;">' +
            '<div style="display: inline-flex; gap: 6px;">' +
              '<button class="btn btn-secondary btn-sm" title="Copy Pair" onclick="copyText(\'' + escapeJs(c.name + '=' + c.value) + '\')"><i class="fa-solid fa-copy"></i></button>' +
              '<button class="btn btn-secondary btn-sm" title="Edit Cookie" data-cookie='' + safeCookieJson + '' data-pc='' + safePcName + '' onclick="openEditModalFromRow(this)"><i class="fa-solid fa-pen"></i></button>' +
              '<button class="btn btn-danger btn-sm" title="Hapus Cookie" onclick="deleteCookieItem(\'' + escapeJs(item.pcName) + '\', \'' + escapeJs(c.name) + '\', \'' + escapeJs(c.domain) + '\', \'' + escapeJs(c.path || '/') + '\')"><i class="fa-solid fa-trash"></i></button>' +
            '</div>' +
          '</td>';

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
      if (!txt) return;
      navigator.clipboard.writeText(txt).then(function() {
        showToast('Berhasil disalin ke clipboard!', 'success');
      }).catch(function() {
        prompt('Salin teks manual:', txt);
      });
    }

    // --- ADD COOKIE CRUD ---
    function toggleAddExpiry(isSession) {
      const wrapper = document.getElementById('add-expiry-wrapper');
      if (wrapper) wrapper.style.display = isSession ? 'none' : 'block';
    }

    async function submitAddCookie(e) {
      e.preventDefault();
      const pcName = document.getElementById('add-pc-name').value;
      const name = document.getElementById('add-name').value.trim();
      const domain = document.getElementById('add-domain').value.trim();
      const value = document.getElementById('add-value').value;
      const path = document.getElementById('add-path').value.trim() || '/';
      const sameSite = document.getElementById('add-samesite').value;
      const secure = document.getElementById('add-secure').checked;
      const httpOnly = document.getElementById('add-httponly').checked;
      const isSession = document.getElementById('add-session').checked;
      const expiryInput = document.getElementById('add-expiry').value;

      let expirationDate = null;
      if (!isSession && expiryInput) {
        expirationDate = Math.floor(new Date(expiryInput).getTime() / 1000);
      }

      const cookie = {
        name: name,
        domain: domain,
        value: value,
        path: path,
        sameSite: sameSite,
        secure: secure,
        httpOnly: httpOnly,
        session: isSession,
        expirationDate: expirationDate
      };

      try {
        const res = await fetch('/api/cookies/item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pcName: pcName, cookie: cookie })
        });
        const result = await res.json();
        if (result.status === 'success') {
          showToast('Cookie "' + name + '" berhasil ditambahkan!', 'success');
          closeModal('modal-add-cookie');
          document.getElementById('form-add-cookie').reset();
          await fetchData(true);
        } else {
          showToast('Gagal: ' + (result.error || 'Terjadi kesalahan'), 'error');
        }
      } catch (err) {
        showToast('Error request: ' + err.message, 'error');
      }
    }

    // --- EDIT COOKIE CRUD ---
    function openEditModalFromRow(btn) {
      const cookieData = JSON.parse(btn.getAttribute('data-cookie'));
      const pcName = btn.getAttribute('data-pc');
      openEditCookieModal(pcName, cookieData);
    }

    function openEditCookieModal(pcName, c) {
      document.getElementById('edit-orig-pc').value = pcName;
      document.getElementById('edit-orig-name').value = c.name;
      document.getElementById('edit-orig-domain').value = c.domain;
      document.getElementById('edit-orig-path').value = c.path || '/';

      document.getElementById('edit-name').value = c.name;
      document.getElementById('edit-domain').value = c.domain;
      document.getElementById('edit-value').value = c.value || '';
      document.getElementById('edit-path').value = c.path || '/';
      document.getElementById('edit-samesite').value = c.sameSite || 'unspecified';
      document.getElementById('edit-secure').checked = Boolean(c.secure);
      document.getElementById('edit-httponly').checked = Boolean(c.httpOnly);

      const isSession = !c.expirationDate || c.session;
      document.getElementById('edit-session').checked = isSession;
      toggleEditExpiry(isSession);

      if (!isSession && c.expirationDate) {
        const d = new Date(c.expirationDate * 1000);
        const isoStr = d.toISOString().substring(0, 16);
        document.getElementById('edit-expiry').value = isoStr;
      } else {
        document.getElementById('edit-expiry').value = '';
      }

      openModal('modal-edit-cookie');
    }

    function toggleEditExpiry(isSession) {
      const wrapper = document.getElementById('edit-expiry-wrapper');
      if (wrapper) wrapper.style.display = isSession ? 'none' : 'block';
    }

    async function submitEditCookie(e) {
      e.preventDefault();
      const pcName = document.getElementById('edit-orig-pc').value;
      const original = {
        name: document.getElementById('edit-orig-name').value,
        domain: document.getElementById('edit-orig-domain').value,
        path: document.getElementById('edit-orig-path').value
      };

      const isSession = document.getElementById('edit-session').checked;
      const expiryInput = document.getElementById('edit-expiry').value;
      let expirationDate = null;
      if (!isSession && expiryInput) {
        expirationDate = Math.floor(new Date(expiryInput).getTime() / 1000);
      }

      const updatedCookie = {
        name: document.getElementById('edit-name').value.trim(),
        domain: document.getElementById('edit-domain').value.trim(),
        value: document.getElementById('edit-value').value,
        path: document.getElementById('edit-path').value.trim() || '/',
        sameSite: document.getElementById('edit-samesite').value,
        secure: document.getElementById('edit-secure').checked,
        httpOnly: document.getElementById('edit-httponly').checked,
        session: isSession,
        expirationDate: expirationDate
      };

      try {
        const res = await fetch('/api/cookies/item', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pcName: pcName, original: original, cookie: updatedCookie })
        });
        const result = await res.json();
        if (result.status === 'success') {
          showToast('Cookie berhasil diperbarui!', 'success');
          closeModal('modal-edit-cookie');
          await fetchData(true);
        } else {
          showToast('Gagal update: ' + (result.error || 'Terjadi kesalahan'), 'error');
        }
      } catch (err) {
        showToast('Error request: ' + err.message, 'error');
      }
    }

    // --- DELETE COOKIE CRUD ---
    async function deleteCookieItem(pcName, name, domain, path) {
      if (!confirm('Hapus cookie "' + name + '" pada domain ' + domain + '?')) return;

      try {
        const res = await fetch('/api/cookies/item', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pcName: pcName, name: name, domain: domain, path: path })
        });
        const result = await res.json();
        if (result.status === 'success') {
          showToast('Cookie "' + name + '" berhasil dihapus!', 'success');
          await fetchData(true);
        } else {
          showToast('Gagal hapus: ' + (result.error || 'Terjadi kesalahan'), 'error');
        }
      } catch (err) {
        showToast('Error request: ' + err.message, 'error');
      }
    }

    // --- BULK IMPORT COOKIES ---
    function handleImportFileSelect(e) {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function(evt) {
        document.getElementById('import-json').value = evt.target.result;
        validateImportJson();
      };
      reader.readAsText(file);
    }

    function validateImportJson() {
      const text = document.getElementById('import-json').value.trim();
      const countEl = document.getElementById('import-count-preview');
      if (!text) {
        countEl.textContent = '0';
        return;
      }
      try {
        const parsed = JSON.parse(text);
        const list = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
        countEl.textContent = list.length;
      } catch (_) {
        countEl.textContent = '0 (Format JSON tidak valid)';
      }
    }

    async function submitImportCookies(e) {
      e.preventDefault();
      const pcName = document.getElementById('import-pc-name').value;
      const text = document.getElementById('import-json').value.trim();

      if (!text) {
        showToast('Silakan pilih file atau paste JSON cookie', 'warning');
        return;
      }

      let cookieList = [];
      try {
        const parsed = JSON.parse(text);
        cookieList = Array.isArray(parsed) ? parsed : (parsed.cookies || []);
      } catch (err) {
        showToast('JSON tidak valid: ' + err.message, 'error');
        return;
      }

      if (cookieList.length === 0) {
        showToast('Tidak ada cookie yang valid dalam JSON', 'warning');
        return;
      }

      try {
        const res = await fetch('/api/cookies/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pcName: pcName, cookies: cookieList })
        });
        const result = await res.json();
        if (result.status === 'success') {
          showToast('Berhasil mengimpor ' + result.importedCount + ' cookie ke ' + pcName + '!', 'success');
          closeModal('modal-import-cookie');
          document.getElementById('form-import-cookie').reset();
          document.getElementById('import-count-preview').textContent = '0';
          await fetchData(true);
        } else {
          showToast('Gagal import: ' + (result.error || 'Terjadi kesalahan'), 'error');
        }
      } catch (err) {
        showToast('Error request: ' + err.message, 'error');
      }
    }

    // --- EXPORT COOKIES ---
    async function updateExportPreview() {
      const pc = document.getElementById('export-pc').value || 'all';
      const dom = document.getElementById('export-domain').value || 'all';
      const fmt = document.getElementById('export-format').value || 'json';
      const previewBox = document.getElementById('export-preview-box');

      previewBox.value = 'Memuat pratinjau...';

      try {
        const res = await fetch('/api/cookies/export?format=' + fmt + '&pc=' + encodeURIComponent(pc) + '&domain=' + encodeURIComponent(dom) + '&plain=1');
        const text = await res.text();
        previewBox.value = text.substring(0, 1500) + (text.length > 1500 ? '\n... (total ' + text.length + ' karakter)' : '');
      } catch (err) {
        previewBox.value = 'Gagal memuat pratinjau: ' + err.message;
      }
    }

    function copyExportText() {
      const pc = document.getElementById('export-pc').value || 'all';
      const dom = document.getElementById('export-domain').value || 'all';
      const fmt = document.getElementById('export-format').value || 'json';

      fetch('/api/cookies/export?format=' + fmt + '&pc=' + encodeURIComponent(pc) + '&domain=' + encodeURIComponent(dom) + '&plain=1')
        .then(function(r) { return r.text(); })
        .then(function(txt) {
          copyText(txt);
        })
        .catch(function(err) {
          showToast('Gagal salin export: ' + err.message, 'error');
        });
    }

    function triggerExportDownload() {
      const pc = document.getElementById('export-pc').value || 'all';
      const dom = document.getElementById('export-domain').value || 'all';
      const fmt = document.getElementById('export-format').value || 'json';

      const url = '/api/cookies/export?format=' + fmt + '&pc=' + encodeURIComponent(pc) + '&domain=' + encodeURIComponent(dom);
      window.location.href = url;
      showToast('Mengunduh file cookies...', 'info');
    }

    // --- ACTIVE PC ACTIONS ---
    function copyCurrentCookiesJson() {
      const records = getFilteredRecords();
      let cookies = [];
      for (const r of records) {
        if (Array.isArray(r.cookies)) cookies.push(...r.cookies);
      }
      if (selectedDomain !== 'all') {
        cookies = cookies.filter(function(c) { return cleanDomain(c.domain) === selectedDomain; });
      }
      copyText(JSON.stringify(cookies, null, 2));
    }

    function copyCurrentCookiesHeader() {
      const records = getFilteredRecords();
      let cookies = [];
      for (const r of records) {
        if (Array.isArray(r.cookies)) cookies.push(...r.cookies);
      }
      if (selectedDomain !== 'all') {
        cookies = cookies.filter(function(c) { return cleanDomain(c.domain) === selectedDomain; });
      }
      const headerStr = cookies.map(function(c) { return c.name + '=' + (c.value || ''); }).join('; ');
      copyText(headerStr);
    }

    function downloadCurrentCookies() {
      const pc = selectedPc;
      const dom = selectedDomain;
      window.location.href = '/api/cookies/export?format=json&pc=' + encodeURIComponent(pc) + '&domain=' + encodeURIComponent(dom);
      showToast('Mengunduh file JSON cookies...', 'info');
    }

    async function deleteCurrentPcData() {
      const targetName = selectedPc === 'all' ? 'seluruh data PC di server' : ('data ' + selectedPc);
      if (!confirm('PENTING: Apakah Anda yakin ingin menghapus ' + targetName + '?')) return;

      try {
        const res = await fetch('/api/pcs/' + encodeURIComponent(selectedPc), { method: 'DELETE' });
        const result = await res.json();
        if (result.status === 'success') {
          showToast('Data berhasil dihapus', 'success');
          selectedPc = 'all';
          await fetchData(true);
        } else {
          showToast('Gagal hapus data: ' + (result.error || 'Terjadi kesalahan'), 'error');
        }
      } catch (err) {
        showToast('Error request: ' + err.message, 'error');
      }
    }

    // --- HELPER UTILITIES ---
    function cleanDomain(d) {
      if (!d) return 'unknown';
      return String(d).replace(/^\.+/, '').trim().toLowerCase();
    }

    function formatRelativeTime(dateStr) {
      if (!dateStr) return 'Baru saja';
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
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function escapeJs(str) {
      if (!str) return '';
      return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '');
    }

    // --- REALTIME SESSION MONITOR (1s POLLING) ---
    let monitorDevices = [];
    let isFetchingMonitor = false;

    async function fetchSessionMonitorData(isBg) {
      if (isFetchingMonitor) return;
      isFetchingMonitor = true;
      const btn = document.getElementById('btn-refresh-monitor');
      if (btn && !isBg) btn.classList.add('fa-spin');

      try {
        const res = await fetch('/api/admin/devices');
        if (res.status === 401) return;
        const json = await res.json();
        monitorDevices = json.devices || [];
        renderSessionMonitor();
      } catch (err) {
        // silent fail on periodic background poll
      } finally {
        isFetchingMonitor = false;
        if (btn) btn.classList.remove('fa-spin');
      }
    }

    function renderSessionMonitor() {
      const container = document.getElementById('session-monitor-device-list');
      if (!container) return;

      if (!monitorDevices || monitorDevices.length === 0) {
        container.innerHTML = 
          '<div style="text-align: center; padding: 24px; background: var(--bg-dark); border-radius: 8px; border: 1px dashed var(--border); color: var(--text-muted); font-size: 13px;">' +
            '<i class="fa-solid fa-laptop-medical" style="font-size: 24px; margin-bottom: 8px; display: block; color: var(--accent);"></i>' +
            'Belum ada extension perangkat yang terhubung. Ekstensi browser akan otomatis terhubung dan memantau status login YouTube.' +
          '</div>';
        return;
      }

      let html = '';
      for (const d of monitorDevices) {
        const isOnline = Boolean(d.isOnline);
        const onlineBadge = isOnline
          ? '<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #10b981; font-weight: 700;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981;"></span> Online (1s)</span>'
          : '<span style="display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: #ef4444; font-weight: 700;"><span style="width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span> Terputus (Offline)</span>';

        const lastSeenText = formatRelativeTime(d.lastSeenAt);

        let sessionsHtml = '';
        if (d.sessions && d.sessions.length > 0) {
          for (const s of d.sessions) {
            let stateBadge = '';
            if (s.sessionState === 'LOGIN_DETECTED') {
              stateBadge = '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid #10b981; font-weight: 700;"><i class="fa-solid fa-circle-check"></i> LOGIN_DETECTED (Sesi Aktif & Valid)</span>';
            } else if (s.sessionState === 'LOGOUT_DETECTED') {
              stateBadge = '<span class="badge" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: 1px solid #ef4444; font-weight: 700;"><i class="fa-solid fa-circle-xmark"></i> LOGOUT_DETECTED (Tidak Ada Sesi)</span>';
            } else if (s.sessionState === 'SITE_UNAVAILABLE') {
              stateBadge = '<span class="badge" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; border: 1px solid #f59e0b;"><i class="fa-solid fa-triangle-exclamation"></i> SITE_UNAVAILABLE</span>';
            } else {
              stateBadge = '<span class="badge" style="background: rgba(148, 163, 184, 0.2); color: #94a3b8; border: 1px solid #94a3b8;"><i class="fa-solid fa-circle-question"></i> SESSION_UNKNOWN</span>';
            }

            const checkedTime = formatRelativeTime(s.checkedAt);

            sessionsHtml += 
              '<div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 10px 14px; background: rgba(255,255,255,0.02); border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">' +
                '<div style="display: flex; align-items: center; gap: 10px;">' +
                  '<span style="font-weight: 700; color: white; display: flex; align-items: center; gap: 6px;">' +
                    '<i class="fa-brands fa-youtube" style="color: #ef4444; font-size: 16px;"></i> ' + escapeHtml(s.domain) +
                  '</span>' +
                  stateBadge +
                '</div>' +
                '<div style="font-size: 11px; color: var(--text-muted); font-family: monospace;">' +
                  'Pemeriksaan: ' + checkedTime +
                '</div>' +
              '</div>';
          }
        } else {
          sessionsHtml = '<div style="font-size: 12px; color: var(--text-muted); font-style: italic;">Menunggu data status sesi pertama dari perangkat...</div>';
        }

        html += 
          '<div style="background: var(--bg-dark); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px;">' +
            '<div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">' +
              '<div style="display: flex; align-items: center; gap: 10px;">' +
                '<span style="font-size: 15px; font-weight: 800; color: white;">🖥️ ' + escapeHtml(d.deviceName) + '</span>' +
                '<span class="code-chip" style="font-size: 10px;">' + escapeHtml(d.deviceUuid) + '</span>' +
                '<span class="badge badge-plain" style="font-size: 10px;">Pairing: ' + escapeHtml(d.pairingCode) + '</span>' +
                onlineBadge +
              '</div>' +
              '<div style="display: flex; align-items: center; gap: 10px;">' +
                '<span style="font-size: 11px; color: var(--text-muted);">Heartbeat: <strong>' + lastSeenText + '</strong></span>' +
                '<button class="btn btn-secondary btn-xs" style="color: #ef4444;" onclick="unpairDeviceAction(\\\'' + escapeJs(d.deviceUuid) + '\\\')">Unpair</button>' +
              '</div>' +
            '</div>' +
            '<div style="display: flex; flex-direction: column; gap: 6px;">' +
              sessionsHtml +
            '</div>' +
          '</div>';
      }

      container.innerHTML = html;
    }

    async function unpairDeviceAction(uuid) {
      if (!confirm('Putus sambungan (unpair) perangkat ini?')) return;
      try {
        await fetch('/api/extension/unpair', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceUuid: uuid })
        });
        showToast('Perangkat berhasil di-unpair', 'success');
        fetchSessionMonitorData(false);
      } catch (err) {
        showToast('Gagal unpair: ' + err.message, 'error');
      }
    }

    // --- EVENT LISTENERS & INITIALIZATION ---
    document.addEventListener('DOMContentLoaded', function() {
      const pcSearch = document.getElementById('pc-search-input');
      if (pcSearch) {
        pcSearch.addEventListener('input', renderPcList);
      }

      const domainSearch = document.getElementById('domain-search-input');
      if (domainSearch) {
        domainSearch.addEventListener('input', function(e) {
          onDomainSearch(e.target.value);
        });
      }

      const cookieSearch = document.getElementById('cookie-search-input');
      if (cookieSearch) {
        cookieSearch.addEventListener('input', function() {
          currentPage = 1;
          renderTable();
        });
      }

      const exportPc = document.getElementById('export-pc');
      if (exportPc) {
        exportPc.addEventListener('change', function() {
          const exportDomainSelect = document.getElementById('export-domain');
          if (exportDomainSelect) {
            const domains = getUniqueDomainsForPc(exportPc.value);
            exportDomainSelect.innerHTML = '<option value="all">Semua Domain</option>' + domains.map(function(d) {
              return '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + '</option>';
            }).join('');
          }
          updateExportPreview();
        });
      }

      const exportDomain = document.getElementById('export-domain');
      if (exportDomain) {
        exportDomain.addEventListener('change', updateExportPreview);
      }
    });

    // Auto-refresh session monitor every 1 second (realtime 1s heartbeat)
    setInterval(function() {
      fetchSessionMonitorData(true);
    }, 1000);

    // Auto-refresh cookies table every 5 seconds (non-disruptive background polling)
    setInterval(function() {
      fetchData(true);
    }, 5000);

    // Initial load
    fetchData(false);
    fetchSessionMonitorData(false);
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
        } else if (
          (username && username.toLowerCase() === 'chaerul' && (password === 'wanatawang' || password === 'chaerul!26')) ||
          ((username === 'admin' || username === 'operator') && (password === 'wanatawang' || password === 'chaerul!26' || password === 'admin' || password === 'admin123'))
        ) {
          authResult = {
            success: true,
            user: { username, displayName: username.toLowerCase() === 'chaerul' ? 'Chaerul' : 'Administrator', role: 'super_admin' }
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

  // --- REALTIME BROWSER SESSION MONITOR API ---

  // 1. Device Pairing (POST /api/extension/pair)
  if (req.method === 'POST' && normPath === '/api/extension/pair') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { deviceUuid, deviceName, pairingCode, version } = JSON.parse(body || '{}');
        if (!deviceUuid || !deviceName) {
          return sendJson(res, 400, { status: 'error', error: 'deviceUuid and deviceName are required' });
        }

        const safeCode = pairingCode || Math.random().toString(36).substring(2, 8).toUpperCase();
        let device = null;
        if (db) {
          device = await db.pairDevice(deviceUuid, deviceName, safeCode, version || '1.0.0');
        } else {
          device = { deviceUuid, deviceName, pairingCode: safeCode, pairingStatus: 'paired' };
        }

        return sendJson(res, 200, {
          status: 'success',
          message: 'Device successfully paired',
          device
        });
      } catch (err) {
        return sendJson(res, 400, { status: 'error', error: 'Invalid JSON: ' + err.message });
      }
    });
    return;
  }

  // 2. Realtime Heartbeat 1s (POST /api/extension/heartbeat)
  if (req.method === 'POST' && normPath === '/api/extension/heartbeat') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        let deviceUuid = req.headers['x-device-uuid'];
        if (!deviceUuid && body) {
          try {
            const parsed = JSON.parse(body);
            deviceUuid = parsed.deviceUuid;
          } catch (_) {}
        }

        if (!deviceUuid) {
          return sendJson(res, 400, { status: 'error', error: 'deviceUuid is required' });
        }

        if (db) {
          await db.updateHeartbeat(deviceUuid);
        }

        return sendJson(res, 200, {
          status: 'ok',
          online: true,
          timestamp: Date.now()
        });
      } catch (err) {
        return sendJson(res, 400, { status: 'error', error: err.message });
      }
    });
    return;
  }

  // 3. Realtime Session Status Update (POST /api/extension/session-status)
  if (req.method === 'POST' && normPath === '/api/extension/session-status') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { deviceUuid, domain, sessionState, checkedAt } = payload;

        // Security Guardrail: Reject if payload contains sensitive cookie values or tokens
        if (payload.cookies || payload.cookie || payload.tokens || payload.token || payload.password || payload.value) {
          return sendJson(res, 400, {
            status: 'error',
            error: 'Security Violation: Cookie values and authentication tokens are strictly forbidden'
          });
        }

        if (!deviceUuid || !domain || !sessionState) {
          return sendJson(res, 400, { status: 'error', error: 'deviceUuid, domain, and sessionState are required' });
        }

        const validStates = ['LOGIN_DETECTED', 'LOGOUT_DETECTED', 'SESSION_UNKNOWN', 'SITE_UNAVAILABLE'];
        const state = validStates.includes(sessionState) ? sessionState : 'SESSION_UNKNOWN';

        if (db) {
          const result = await db.updateSessionStatus(deviceUuid, domain, state, checkedAt);
          if (!result.success) {
            return sendJson(res, 404, { status: 'error', error: result.error });
          }
        }

        return sendJson(res, 200, {
          status: 'success',
          domain,
          sessionState: state,
          timestamp: Date.now()
        });
      } catch (err) {
        return sendJson(res, 400, { status: 'error', error: 'Invalid JSON: ' + err.message });
      }
    });
    return;
  }

  // 4. Admin Devices & Session Monitor (GET /api/admin/devices)
  if (isGetOrHead && normPath === '/api/admin/devices') {
    const user = getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { status: 'error', error: 'Unauthorized: Admin login required' }, isHead);
    }

    if (db) {
      const devices = await db.getAdminDevices();
      return sendJson(res, 200, {
        status: 'success',
        devices,
        serverTime: new Date().toISOString()
      }, isHead);
    }

    return sendJson(res, 200, { status: 'success', devices: [], serverTime: new Date().toISOString() }, isHead);
  }

  // 5. Admin Session Status (GET /api/admin/session-status)
  if (isGetOrHead && normPath === '/api/admin/session-status') {
    const user = getSessionUser(req);
    if (!user) {
      return sendJson(res, 401, { status: 'error', error: 'Unauthorized: Admin login required' }, isHead);
    }

    if (db) {
      const devices = await db.getAdminDevices();
      const allSessions = [];
      for (const d of devices) {
        for (const s of d.sessions) {
          allSessions.push({
            deviceName: d.deviceName,
            deviceUuid: d.deviceUuid,
            isOnline: d.isOnline,
            lastSeenAt: d.lastSeenAt,
            ...s
          });
        }
      }
      return sendJson(res, 200, { status: 'success', sessions: allSessions }, isHead);
    }

    return sendJson(res, 200, { status: 'success', sessions: [] }, isHead);
  }

  // 6. Device Unpair (POST /api/extension/unpair)
  if (req.method === 'POST' && normPath === '/api/extension/unpair') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { deviceUuid } = JSON.parse(body || '{}');
        if (!deviceUuid) {
          return sendJson(res, 400, { status: 'error', error: 'deviceUuid is required' });
        }

        if (db) {
          await db.unpairDevice(deviceUuid);
        }

        return sendJson(res, 200, { status: 'success', message: 'Device unpaired successfully' });
      } catch (err) {
        return sendJson(res, 400, { status: 'error', error: err.message });
      }
    });
    return;
  }

  // 9. API: Add Single Cookie (POST /api/cookies/item)
  if (req.method === 'POST' && normPath === '/api/cookies/item') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { pcName, cookie } = JSON.parse(body || '{}');
        if (!pcName || !cookie || !cookie.name) {
          return sendJson(res, 400, { status: 'error', error: 'pcName and cookie.name are required' });
        }

        if (db) {
          const resDb = await db.saveOrUpdateSingleCookie(pcName, cookie);
          if (!resDb.success) {
            return sendJson(res, 500, { status: 'error', error: resDb.error });
          }
        }

        return sendJson(res, 200, { status: 'success', message: 'Cookie berhasil disimpan' });
      } catch (err) {
        return sendJson(res, 400, { status: 'error', error: err.message });
      }
    });
    return;
  }

  // 10. API: Edit Single Cookie (PUT /api/cookies/item)
  if (req.method === 'PUT' && normPath === '/api/cookies/item') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { pcName, original, cookie } = JSON.parse(body || '{}');
        if (!pcName || !cookie || !cookie.name) {
          return sendJson(res, 400, { status: 'error', error: 'pcName, original, and cookie are required' });
        }

        if (db) {
          const resDb = await db.saveOrUpdateSingleCookie(pcName, cookie, original);
          if (!resDb.success) {
            return sendJson(res, 500, { status: 'error', error: resDb.error });
          }
        }

        return sendJson(res, 200, { status: 'success', message: 'Cookie berhasil diperbarui' });
      } catch (err) {
        return sendJson(res, 400, { status: 'error', error: err.message });
      }
    });
    return;
  }

  // 11. API: Delete Single Cookie (DELETE /api/cookies/item)
  if (req.method === 'DELETE' && normPath === '/api/cookies/item') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const parsedUrl = url.parse(req.url, true);
        let pcName = parsedUrl.query.pcName;
        let name = parsedUrl.query.name;
        let domain = parsedUrl.query.domain;
        let cookiePath = parsedUrl.query.path || '/';

        if (body) {
          try {
            const parsed = JSON.parse(body);
            pcName = parsed.pcName || pcName;
            name = parsed.name || name;
            domain = parsed.domain || domain;
            cookiePath = parsed.path || cookiePath;
          } catch (_) {}
        }

        if (!pcName || !name || !domain) {
          return sendJson(res, 400, { status: 'error', error: 'pcName, name, and domain are required' });
        }

        if (db) {
          const resDb = await db.deleteSingleCookie(pcName, name, domain, cookiePath);
          if (!resDb.success) {
            return sendJson(res, 500, { status: 'error', error: resDb.error });
          }
        }

        return sendJson(res, 200, { status: 'success', message: 'Cookie berhasil dihapus' });
      } catch (err) {
        return sendJson(res, 400, { status: 'error', error: err.message });
      }
    });
    return;
  }

  // 12. API: Bulk Import Cookies (POST /api/cookies/import)
  if (req.method === 'POST' && normPath === '/api/cookies/import') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { pcName, cookies } = JSON.parse(body || '{}');
        if (!pcName || !Array.isArray(cookies) || cookies.length === 0) {
          return sendJson(res, 400, { status: 'error', error: 'pcName and array of cookies are required' });
        }

        if (db) {
          const resDb = await db.importCookiesToDb(pcName, cookies);
          if (!resDb.success) {
            return sendJson(res, 500, { status: 'error', error: resDb.error });
          }
          return sendJson(res, 200, { status: 'success', importedCount: resDb.importedCount, totalCookies: resDb.totalCookies });
        }

        return sendJson(res, 200, { status: 'success', importedCount: cookies.length });
      } catch (err) {
        return sendJson(res, 400, { status: 'error', error: err.message });
      }
    });
    return;
  }

  // 13. API: Export Cookies (GET /api/cookies/export)
  if (isGetOrHead && normPath === '/api/cookies/export') {
    const format = (parsedUrl.query.format || 'json').toLowerCase();
    const targetPc = parsedUrl.query.pc || 'all';
    const targetDomain = parsedUrl.query.domain || 'all';
    const isPlain = parsedUrl.query.plain === '1';

    let records = [];
    if (db) {
      try {
        const dbRes = await db.loadAllRecordsFromDb();
        records = dbRes.records || [];
      } catch (_) {}
    }
    if (records.length === 0) {
      records = loadAllRecords();
    }

    if (targetPc !== 'all') {
      records = records.filter(r => r.pcName === targetPc);
    }

    let cookies = [];
    for (const r of records) {
      if (Array.isArray(r.cookies)) cookies.push(...r.cookies);
    }

    if (targetDomain !== 'all') {
      cookies = cookies.filter(c => cleanDomain(c.domain) === targetDomain);
    }

    setCors(res);

    if (format === 'netscape') {
      const output = formatAsNetscape(cookies);
      if (!isPlain) {
        res.setHeader('Content-Disposition', `attachment; filename="cookies-${targetPc}-${targetDomain}.txt"`);
      }
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(output)
      });
      if (!isHead) res.end(output);
      else res.end();
      return;
    }

    if (format === 'header') {
      const output = formatAsHeaderString(cookies);
      if (!isPlain) {
        res.setHeader('Content-Disposition', `attachment; filename="header-${targetPc}-${targetDomain}.txt"`);
      }
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(output)
      });
      if (!isHead) res.end(output);
      else res.end();
      return;
    }

    // Default: JSON
    const output = JSON.stringify(cookies, null, 2);
    if (!isPlain) {
      res.setHeader('Content-Disposition', `attachment; filename="cookies-${targetPc}-${targetDomain}.json"`);
    }
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(output)
    });
    if (!isHead) res.end(output);
    else res.end();
    return;
  }

  // 14. API: Delete PC or specific backup
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

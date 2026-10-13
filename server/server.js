/**
 * Advanced Cookie Editor - Dedicated Cloudflare Extension Backup Server
 * Standalone microservice for warnet.web.id/api/_extension_/ & warnet.web.id/api/backup/cookies
 * Zero external dependencies (uses native Node.js http and fs modules).
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 8099;
const DATA_DIR = path.join(__dirname, 'data');
const MAX_BACKUPS = 50;

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function sendJson(res, statusCode, data) {
  setCors(res);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function getBackupList() {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const list = [];
  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
      const data = JSON.parse(raw);
      list.push({
        id: data.id || f.replace('.json', ''),
        savedAt: data.savedAt,
        isEncrypted: Boolean(data.isEncrypted),
        itemCount: data.itemCount,
        domain: data.domain,
        size: Buffer.byteLength(raw)
      });
    } catch {}
  }
  return list.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
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

  // 1. Health / status endpoints
  if (normPath === '/api/_extension_' || normPath === '/api/_extension_/health' || normPath === '/api/_extension_/status' || normPath === '/health') {
    return sendJson(res, 200, {
      status: 'ok',
      service: 'advanced-cookie-editor-backup',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  }

  // 2. POST /api/_extension_/cookies or /api/backup/cookies
  if (req.method === 'POST' && (normPath === '/api/_extension_/cookies' || normPath === '/api/backup/cookies')) {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) { // 10MB safety limit
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload exceeds limit of 10MB' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const id = 'bk_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
        const filename = `${id}.json`;
        const filePath = path.join(DATA_DIR, filename);

        const isEncrypted = Boolean(payload && payload.format === 'advanced-cookie-editor-encrypted');
        const itemCount = Array.isArray(payload?.cookies) ? payload.cookies.length : (payload?.itemCount || 0);
        const domain = payload?.metadata?.domain || payload?.domain || 'all';

        const record = {
          id,
          savedAt: new Date().toISOString(),
          isEncrypted,
          itemCount,
          domain,
          payload
        };

        fs.writeFileSync(filePath, JSON.stringify(record, null, 2));
        rotateBackups();

        return sendJson(res, 201, {
          status: 'success',
          id,
          savedAt: record.savedAt,
          isEncrypted,
          itemCount,
          domain,
          message: 'Cookie backup saved successfully to warnet.web.id'
        });
      } catch (err) {
        return sendJson(res, 400, { error: 'Invalid JSON payload: ' + err.message });
      }
    });
    return;
  }

  // 3. GET /api/_extension_/cookies/latest or /api/backup/cookies/latest
  if (req.method === 'GET' && (normPath === '/api/_extension_/cookies/latest' || normPath === '/api/backup/cookies/latest')) {
    const list = getBackupList();
    if (list.length === 0) {
      return sendJson(res, 404, { error: 'No backups found on server' });
    }
    const latestMeta = list[0];
    const raw = fs.readFileSync(path.join(DATA_DIR, `${latestMeta.id}.json`), 'utf8');
    const parsed = JSON.parse(raw);
    return sendJson(res, 200, parsed);
  }

  // 4. GET /api/_extension_/cookies or /api/backup/cookies (List)
  if (req.method === 'GET' && (normPath === '/api/_extension_/cookies' || normPath === '/api/backup/cookies')) {
    const list = getBackupList();
    return sendJson(res, 200, {
      status: 'success',
      count: list.length,
      backups: list
    });
  }

  // 5. GET /api/_extension_/cookies/:id or /api/backup/cookies/:id
  const matchGet = normPath.match(/^\/(?:api\/_extension_\/cookies|api\/backup\/cookies)\/([a-zA-Z0-9_-]+)$/);
  if (req.method === 'GET' && matchGet) {
    const id = matchGet[1];
    const targetFile = path.join(DATA_DIR, `${id}.json`);
    if (fs.existsSync(targetFile)) {
      const raw = fs.readFileSync(targetFile, 'utf8');
      return sendJson(res, 200, JSON.parse(raw));
    } else {
      return sendJson(res, 404, { error: 'Backup not found' });
    }
  }

  // 6. DELETE /api/_extension_/cookies/:id or /api/backup/cookies/:id
  if (req.method === 'DELETE' && matchGet) {
    const id = matchGet[1];
    const targetFile = path.join(DATA_DIR, `${id}.json`);
    if (fs.existsSync(targetFile)) {
      fs.unlinkSync(targetFile);
      return sendJson(res, 200, { status: 'success', message: 'Backup deleted successfully' });
    } else {
      return sendJson(res, 404, { error: 'Backup not found' });
    }
  }

  sendJson(res, 404, { error: 'Not found', path: pathname });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[+] Extension Backup Server running on http://127.0.0.1:${PORT}`);
});

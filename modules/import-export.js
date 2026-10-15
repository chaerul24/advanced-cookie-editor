/**
 * Advanced Cookie Editor - Import / Export Module
 * Handles file reading, schema validation, AES-GCM encryption/decryption on file I/O,
 * conflict previewing, and execution with per-item status tracking.
 */

import { createExportPayload, validateImportPayload } from './cookie-serializer.js';
import { encryptData, decryptData } from './crypto-service.js';
import { CookieService } from './cookie-service.js';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export class ImportExportService {
  /**
   * Export cookies to a JSON file (either Plain or Encrypted)
   * @param {Array<object>} cookies 
   * @param {object} options
   * @param {boolean} [options.encrypt=false]
   * @param {string} [options.password='']
   * @param {number} [options.iterations=250000]
   * @param {string} [options.filename='cookies-export.json']
   * @param {object} [options.metadata={}]
   * @returns {Promise<{ filename: string, size: number }>}
   */
  /**
   * Generate export payload as formatted string, optionally triggering file download
   * @param {Array<object>} cookies 
   * @param {object} options
   * @param {boolean} [options.encrypt=false]
   * @param {string} [options.password='']
   * @param {number} [options.iterations=250000]
   * @param {string} [options.filename='cookies-export.json']
   * @param {boolean} [options.download=true]
   * @param {object} [options.metadata={}]
   * @returns {Promise<{ filename: string, content: string, size: number, isEncrypted: boolean }>}
   */
  static async exportCookies(cookies, options = {}) {
    const payload = createExportPayload(cookies, options.metadata || {});

    let fileContent = '';
    let defaultFilename = options.filename || `cookies-${new Date().toISOString().slice(0, 10)}.json`;

    if (options.encrypt) {
      if (!options.password || options.password.length < 6) {
        throw new Error('Encryption requires a password of at least 6 characters.');
      }
      const envelope = await encryptData(payload, options.password, options.iterations || 250000);
      fileContent = JSON.stringify(envelope, null, 2);
      if (!defaultFilename.endsWith('.enc.json')) {
        defaultFilename = defaultFilename.replace(/\.json$/, '') + '.enc.json';
      }
    } else {
      fileContent = JSON.stringify(payload, null, 2);
    }

    // Trigger download in browser if requested (default true)
    if (options.download !== false && typeof document !== 'undefined') {
      this.downloadFile(fileContent, defaultFilename, 'application/json');
    }

    return {
      filename: defaultFilename,
      content: fileContent,
      size: new Blob([fileContent]).size,
      isEncrypted: Boolean(options.encrypt)
    };
  }

  /**
   * Trigger file download in browser
   * @param {string} content 
   * @param {string} filename 
   * @param {string} mimeType 
   */
  static downloadFile(content, filename, mimeType = 'application/json') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    setTimeout(() => {
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    }, 100);
  }

  /**
   * Parse arbitrary raw JSON text (from paste/clipboard or text area)
   * @param {string} text 
   * @returns {{ isEncrypted: boolean, parsedData: any, rawText: string }}
   */
  static parseJsonText(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('No JSON data provided.');
    }
    if (text.length > MAX_FILE_SIZE) {
      throw new Error('Data size exceeds maximum limit of 5 MB.');
    }

    const trimmed = text.trim();
    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      // Check if user pasted cookie header pairs: "name1=value1; name2=value2"
      if (trimmed.includes('=') && !trimmed.startsWith('{') && !trimmed.startsWith('[')) {
        const pairs = trimmed.split(';').map(p => p.trim()).filter(Boolean);
        const parsedCookies = [];
        for (const pair of pairs) {
          const eqIdx = pair.indexOf('=');
          if (eqIdx > 0) {
            const name = pair.substring(0, eqIdx).trim();
            const val = pair.substring(eqIdx + 1).trim();
            if (name) {
              parsedCookies.push({
                name: name,
                value: val,
                domain: typeof window !== 'undefined' && window.location ? window.location.hostname : '',
                path: '/',
                secure: true,
                httpOnly: false,
                sameSite: 'unspecified'
              });
            }
          }
        }
        if (parsedCookies.length > 0) {
          return {
            isEncrypted: false,
            parsedData: parsedCookies,
            rawText: text
          };
        }
      }
      throw new Error('Input is not valid JSON. Ensure proper syntax.');
    }

    const isEncrypted = Boolean(
      data &&
      typeof data === 'object' &&
      data.format === 'advanced-cookie-editor-encrypted'
    );

    return {
      isEncrypted,
      parsedData: data,
      rawText: text
    };
  }

  /**
   * Read and parse an uploaded file from a File object
   * @param {File} file 
   * @returns {Promise<{ isEncrypted: boolean, parsedData: any, rawText: string }>}
   */
  static async readFile(file) {
    if (!file) {
      throw new Error('No file provided.');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new Error(`File size (${(file.size / (1024 * 1024)).toFixed(1)}MB) exceeds maximum limit of 5MB.`);
    }

    const text = await file.text();
    return this.parseJsonText(text);
  }

  /**
   * Decrypt an encrypted backup file content using provided password
   * @param {object} encryptedEnvelope 
   * @param {string} password 
   * @returns {Promise<any>}
   */
  static async decryptBackup(encryptedEnvelope, password) {
    return await decryptData(encryptedEnvelope, password);
  }

  /**
   * Analyze imported cookies against current browser cookies to compute conflicts
   * @param {Array<object>} importedCookies 
   * @returns {Promise<{ conflicts: Array<{ imported: object, existing: object }>, additions: Array<object> }>}
   */
  static async analyzeImport(importedCookies) {
    const existingCookies = CookieService.isAvailable() ? await CookieService.getAll() : [];
    
    // Key by domain + name + path
    const existingMap = new Map();
    for (const c of existingCookies) {
      const key = `${(c.domain || '').toLowerCase()}|${c.path || '/'}|${c.name}`;
      existingMap.set(key, c);
    }

    const conflicts = [];
    const additions = [];

    for (const imported of importedCookies) {
      const key = `${(imported.domain || '').toLowerCase()}|${imported.path || '/'}|${imported.name}`;
      if (existingMap.has(key)) {
        conflicts.push({
          imported,
          existing: existingMap.get(key)
        });
      } else {
        additions.push(imported);
      }
    }

    return { conflicts, additions };
  }

  /**
   * Execute import of cookies into the browser
   * @param {Array<object>} cookies 
   * @param {'merge'|'replace'} strategy 
   * @param {string} [scopeDomain] Domain to clear if strategy is 'replace'
   * @returns {Promise<{ total: number, applied: number, failed: number, details: Array<{ name: string, domain: string, success: boolean, error?: string }> }>}
   */
  static async executeImport(cookies, strategy = 'merge', scopeDomain = '') {
    if (strategy === 'replace' && scopeDomain && CookieService.isAvailable()) {
      await CookieService.clearDomain(scopeDomain);
    }

    const results = {
      total: cookies.length,
      applied: 0,
      failed: 0,
      details: []
    };

    for (const cookie of cookies) {
      try {
        await CookieService.set(cookie);
        results.applied++;
        results.details.push({
          name: cookie.name,
          domain: cookie.domain,
          success: true
        });
      } catch (err) {
        results.failed++;
        results.details.push({
          name: cookie.name,
          domain: cookie.domain,
          success: false,
          error: err.message
        });
      }
    }

    return results;
  }

  /**
   * Check connection and health of remote Cloudflare sync server
   * @param {string} serverUrl Base endpoint (e.g. https://warnet.web.id/api/_extension_)
   * @returns {Promise<boolean>}
   */
  static async checkServerHealth(serverUrl = 'https://warnet.web.id/api/_extension_/health') {
    try {
      const target = serverUrl.endsWith('/health') ? serverUrl : serverUrl.replace(/\/cookies.*$/, '') + '/health';
      const res = await fetch(target, { method: 'GET', cache: 'no-store' });
      if (!res.ok) return false;
      const data = await res.json();
      return Boolean(data && data.status === 'ok');
    } catch {
      return false;
    }
  }

  /**
   * Push backup directly to remote Cloudflare server (warnet.web.id)
   * @param {Array<object>} cookies 
   * @param {object} options
   * @param {string} [options.serverUrl='https://warnet.web.id/api/_extension_/cookies']
   * @param {boolean} [options.encrypt=false]
   * @param {string} [options.password='']
   * @param {number} [options.iterations=250000]
   * @param {object} [options.metadata={}]
   * @returns {Promise<object>} Server response
   */
  static async syncToServer(cookies, options = {}) {
    const serverUrl = options.serverUrl || 'https://warnet.web.id/api/_extension_/cookies';
    const exportResult = await this.exportCookies(cookies, {
      encrypt: options.encrypt,
      password: options.password,
      iterations: options.iterations,
      download: false,
      metadata: options.metadata || {}
    });

    const res = await fetch(serverUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: exportResult.content
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Server returned ${res.status}: ${errText}`);
    }

    return await res.json();
  }

  /**
   * Pull latest backup directly from remote Cloudflare server
   * @param {string} serverUrl
   * @returns {Promise<any>} Raw backup payload from server
   */
  static async fetchLatestFromServer(serverUrl = 'https://warnet.web.id/api/_extension_/cookies/latest') {
    const target = serverUrl.includes('/latest') ? serverUrl : serverUrl.replace(/\/+$/, '') + '/latest';
    const res = await fetch(target, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('No backups found on server.');
      }
      throw new Error(`Failed to fetch from server (HTTP ${res.status})`);
    }
    const data = await res.json();
    return {
      payload: data.payload || data,
      filename: data.filename || 'cloud-backup.json'
    };
  }

  /**
   * List all stored backups on remote Cloudflare server
   * @param {string} serverUrl
   * @returns {Promise<Array<object>>}
   */
  static async listServerBackups(serverUrl = 'https://warnet.web.id/api/_extension_/cookies') {
    const target = serverUrl.replace(/\/latest$/, '').replace(/\/+$/, '');
    const res = await fetch(target, { method: 'GET', cache: 'no-store' });
    if (!res.ok) {
      throw new Error(`Failed to list backups from server (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data.backups || [];
  }
}

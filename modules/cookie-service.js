/**
 * Advanced Cookie Editor - Cookie Service
 * Encapsulates Chrome Cookies API operations with validation, error handling,
 * and safe transaction logic for cookie updates.
 */

import { validateCookieForSet, buildCookieUrl } from './cookie-validation.js';

export class CookieService {
  /**
   * Check if running in an active Chrome Extension environment with cookies permission
   * @returns {boolean}
   */
  static isAvailable() {
    return typeof chrome !== 'undefined' && Boolean(chrome.cookies);
  }

  /**
   * Retrieve all cookies matching optional filter details
   * @param {chrome.cookies.GetAllDetails} [details={}]
   * @returns {Promise<chrome.cookies.Cookie[]>}
   */
  static async getAll(details = {}) {
    if (!this.isAvailable()) {
      throw new Error('Chrome Cookies API is unavailable. Ensure extension permissions are granted.');
    }

    return new Promise((resolve, reject) => {
      // Build safe query object
      const query = {};
      if (details.domain) query.domain = details.domain;
      if (details.name) query.name = details.name;
      if (details.path) query.path = details.path;
      if (details.secure !== undefined) query.secure = details.secure;
      if (details.session !== undefined) query.session = details.session;
      if (details.storeId) query.storeId = details.storeId;
      if (details.url) query.url = details.url;
      if (details.partitionKey) query.partitionKey = details.partitionKey;

      chrome.cookies.getAll(query, (cookies) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(cookies || []);
      });
    });
  }

  /**
   * Retrieve a single cookie by exact parameters
   * @param {chrome.cookies.GetDetails} details 
   * @returns {Promise<chrome.cookies.Cookie|null>}
   */
  static async get(details) {
    if (!this.isAvailable()) {
      throw new Error('Chrome Cookies API is unavailable.');
    }

    return new Promise((resolve, reject) => {
      chrome.cookies.get(details, (cookie) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        resolve(cookie || null);
      });
    });
  }

  /**
   * Set (create or overwrite) a cookie with validation
   * @param {object} cookieData 
   * @returns {Promise<chrome.cookies.Cookie>}
   */
  static async set(cookieData) {
    if (!this.isAvailable()) {
      throw new Error('Chrome Cookies API is unavailable.');
    }

    const validation = validateCookieForSet(cookieData);
    if (!validation.valid) {
      throw new Error(`Cookie validation failed: ${validation.errors.join('; ')}`);
    }

    return new Promise((resolve, reject) => {
      chrome.cookies.set(validation.normalized, (createdCookie) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!createdCookie) {
          return reject(new Error('Browser rejected cookie creation without explicit error (check host permissions or policy restrictions).'));
        }
        resolve(createdCookie);
      });
    });
  }

  /**
   * Remove a cookie using its canonical URL and identifier
   * @param {object} cookie 
   * @returns {Promise<{ name: string, url: string, storeId?: string }>}
   */
  static async remove(cookie) {
    if (!this.isAvailable()) {
      throw new Error('Chrome Cookies API is unavailable.');
    }

    if (!cookie || !cookie.name || !cookie.domain) {
      throw new Error('Cookie name and domain are required for removal.');
    }

    const url = buildCookieUrl(cookie.domain, cookie.path || '/', Boolean(cookie.secure));

    const removeDetails = {
      url,
      name: cookie.name
    };

    if (cookie.storeId) {
      removeDetails.storeId = cookie.storeId;
    }

    if (cookie.partitionKey) {
      removeDetails.partitionKey = cookie.partitionKey;
    }

    return new Promise((resolve, reject) => {
      chrome.cookies.remove(removeDetails, (result) => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!result) {
          return reject(new Error(`Failed to remove cookie "${cookie.name}": cookie not found or inaccessible.`));
        }
        resolve(result);
      });
    });
  }

  /**
   * Safely update a cookie.
   * Chrome Cookies API does not offer a direct atomic update.
   * Strategy:
   * 1. Validate the new cookie payload before making any changes.
   * 2. If the identity (name, domain, path, storeId) changed, remove the old cookie.
   * 3. Set the new cookie.
   * 4. If set fails after removing the old cookie, attempt rollback by recreating the old cookie.
   * @param {object} oldCookie 
   * @param {object} newCookieData 
   * @returns {Promise<{ success: boolean, cookie?: object, error?: string, rolledBack?: boolean }>}
   */
  static async update(oldCookie, newCookieData) {
    if (!oldCookie) {
      throw new Error('Old cookie reference is required for update.');
    }

    // 1. Validate new data first to avoid removing old cookie on invalid input
    const validation = validateCookieForSet(newCookieData);
    if (!validation.valid) {
      return {
        success: false,
        error: `Validation error: ${validation.errors.join(', ')}`
      };
    }

    const identityChanged = 
      oldCookie.name !== newCookieData.name ||
      oldCookie.domain !== newCookieData.domain ||
      oldCookie.path !== newCookieData.path ||
      oldCookie.storeId !== newCookieData.storeId;

    let oldRemoved = false;

    try {
      if (identityChanged) {
        await this.remove(oldCookie);
        oldRemoved = true;
      }

      const created = await this.set(newCookieData);
      return {
        success: true,
        cookie: created
      };
    } catch (err) {
      let rolledBack = false;
      if (oldRemoved) {
        // Attempt rollback of the old cookie
        try {
          await this.set(oldCookie);
          rolledBack = true;
        } catch {
          rolledBack = false;
        }
      }

      return {
        success: false,
        error: err.message,
        rolledBack
      };
    }
  }

  /**
   * Remove multiple cookies safely and report individual outcomes
   * @param {Array<object>} cookies 
   * @returns {Promise<{ total: number, deleted: number, failed: number, errors: Array<{ cookie: string, error: string }> }>}
   */
  static async removeMultiple(cookies) {
    const results = {
      total: cookies.length,
      deleted: 0,
      failed: 0,
      errors: []
    };

    for (const cookie of cookies) {
      try {
        await this.remove(cookie);
        results.deleted++;
      } catch (err) {
        results.failed++;
        results.errors.push({
          cookie: `${cookie.name}@${cookie.domain}`,
          error: err.message
        });
      }
    }

    return results;
  }

  /**
   * Clear all accessible cookies for a specific domain
   * @param {string} domain 
   * @returns {Promise<{ deleted: number, failed: number }>}
   */
  static async clearDomain(domain) {
    const cookies = await this.getAll({ domain });
    return this.removeMultiple(cookies);
  }

  /**
   * Clear all accessible cookies across all domains
   * @returns {Promise<{ deleted: number, failed: number }>}
   */
  static async clearAll() {
    const cookies = await this.getAll();
    return this.removeMultiple(cookies);
  }
}

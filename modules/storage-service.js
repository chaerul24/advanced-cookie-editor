/**
 * Advanced Cookie Editor - Storage Service
 * Manages persistent preferences and Cookie Sets via chrome.storage.local
 * with fallback to window.localStorage.
 */

const SETTINGS_KEY = 'ace_settings';
const COOKIE_SETS_KEY = 'ace_cookie_sets';

const DEFAULT_SETTINGS = {
  theme: 'dark',
  maskValues: true,
  pbkdf2Iterations: 250000,
  defaultSort: 'name_asc',
  showThirdParty: true,
  cloudSyncUrl: 'https://warnet.web.id/api/_extension_/cookies'
};

export class StorageService {
  static isChromeStorage() {
    return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
  }

  /**
   * Get value by key
   * @param {string} key 
   * @param {any} [defaultValue=null]
   * @returns {Promise<any>}
   */
  static async get(key, defaultValue = null) {
    if (this.isChromeStorage()) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          if (chrome.runtime.lastError) {
            resolve(defaultValue);
            return;
          }
          resolve(result[key] !== undefined ? result[key] : defaultValue);
        });
      });
    }

    if (typeof localStorage !== 'undefined') {
      try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
      } catch {
        return defaultValue;
      }
    }

    return defaultValue;
  }

  /**
   * Set value by key
   * @param {string} key 
   * @param {any} value 
   * @returns {Promise<void>}
   */
  static async set(key, value) {
    if (this.isChromeStorage()) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          resolve();
        });
      });
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  }

  /**
   * Remove item by key
   * @param {string} key 
   * @returns {Promise<void>}
   */
  static async remove(key) {
    if (this.isChromeStorage()) {
      return new Promise((resolve, reject) => {
        chrome.storage.local.remove([key], () => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          resolve();
        });
      });
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  }

  /**
   * Get user settings
   * @returns {Promise<typeof DEFAULT_SETTINGS>}
   */
  static async getSettings() {
    const saved = await this.get(SETTINGS_KEY, {});
    return { ...DEFAULT_SETTINGS, ...saved };
  }

  /**
   * Update user settings
   * @param {Partial<typeof DEFAULT_SETTINGS>} updates 
   * @returns {Promise<typeof DEFAULT_SETTINGS>}
   */
  static async updateSettings(updates) {
    const current = await this.getSettings();
    const updated = { ...current, ...updates };
    await this.set(SETTINGS_KEY, updated);
    return updated;
  }

  /**
   * Get stored cookie sets
   * @returns {Promise<Array<object>>}
   */
  static async getCookieSets() {
    return (await this.get(COOKIE_SETS_KEY, [])) || [];
  }

  /**
   * Save stored cookie sets array
   * @param {Array<object>} sets 
   * @returns {Promise<void>}
   */
  static async saveCookieSets(sets) {
    await this.set(COOKIE_SETS_KEY, sets);
  }
}

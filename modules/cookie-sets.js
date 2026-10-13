/**
 * Advanced Cookie Editor - Cookie Sets Module
 * Manages named snapshots of cookies for session switching, debugging, and multi-profile workflows.
 */

import { StorageService } from './storage-service.js';
import { CookieService } from './cookie-service.js';
import { normalizeCookieForExport } from './cookie-serializer.js';

export class CookieSetsService {
  /**
   * Get all saved cookie sets
   * @returns {Promise<Array<object>>}
   */
  static async listSets() {
    return await StorageService.getCookieSets();
  }

  /**
   * Get a single cookie set by ID
   * @param {string} id 
   * @returns {Promise<object|null>}
   */
  static async getSet(id) {
    const sets = await this.listSets();
    return sets.find(s => s.id === id) || null;
  }

  /**
   * Create and save a new cookie set snapshot
   * @param {string} name 
   * @param {string} description 
   * @param {Array<object>} cookies 
   * @param {string} [domain='']
   * @returns {Promise<object>}
   */
  static async createSet(name, description, cookies, domain = '') {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Cookie Set name is required.');
    }
    if (!Array.isArray(cookies) || cookies.length === 0) {
      throw new Error('Cannot create an empty Cookie Set. At least one cookie is required.');
    }

    const sets = await this.listSets();
    const normalizedCookies = cookies.map(normalizeCookieForExport);

    const newSet = {
      id: 'cs_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      name: name.trim(),
      description: (description || '').trim(),
      domain: domain || (cookies[0]?.domain ?? 'multiple'),
      itemCount: normalizedCookies.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cookies: normalizedCookies
    };

    sets.unshift(newSet);
    await StorageService.saveCookieSets(sets);
    return newSet;
  }

  /**
   * Rename or update description of a cookie set
   * @param {string} id 
   * @param {string} newName 
   * @param {string} [newDescription] 
   * @returns {Promise<object>}
   */
  static async updateSetMeta(id, newName, newDescription) {
    const sets = await this.listSets();
    const index = sets.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`Cookie set with ID "${id}" not found.`);
    }

    if (newName && newName.trim().length > 0) {
      sets[index].name = newName.trim();
    }
    if (newDescription !== undefined) {
      sets[index].description = newDescription.trim();
    }
    sets[index].updatedAt = new Date().toISOString();

    await StorageService.saveCookieSets(sets);
    return sets[index];
  }

  /**
   * Delete a cookie set by ID
   * @param {string} id 
   * @returns {Promise<boolean>}
   */
  static async deleteSet(id) {
    const sets = await this.listSets();
    const filtered = sets.filter(s => s.id !== id);
    if (filtered.length === sets.length) {
      return false;
    }
    await StorageService.saveCookieSets(filtered);
    return true;
  }

  /**
   * Restore cookies from a set into the active browser environment
   * @param {string} id 
   * @param {'merge'|'replace'} [strategy='merge']
   * @returns {Promise<{ total: number, applied: number, failed: number, errors: Array<{ name: string, error: string }> }>}
   */
  static async restoreSet(id, strategy = 'merge') {
    const set = await this.getSet(id);
    if (!set) {
      throw new Error(`Cookie Set with ID "${id}" was not found.`);
    }

    if (strategy === 'replace' && set.domain && set.domain !== 'multiple') {
      // Clear domain cookies first
      await CookieService.clearDomain(set.domain);
    }

    const report = {
      total: set.cookies.length,
      applied: 0,
      failed: 0,
      errors: []
    };

    for (const cookie of set.cookies) {
      try {
        await CookieService.set(cookie);
        report.applied++;
      } catch (err) {
        report.failed++;
        report.errors.push({
          name: cookie.name,
          error: err.message
        });
      }
    }

    return report;
  }
}

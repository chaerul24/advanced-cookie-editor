/**
 * Advanced Cookie Editor - Cookie Serializer Module
 * Handles formatting for Clipboard (name=val, Cookie request header, Set-Cookie),
 * and structured JSON export/import schema versioning.
 */

export const SCHEMA_FORMAT = 'advanced-cookie-editor';
export const SCHEMA_VERSION = 1;

/**
 * Format single cookie as name=value
 * @param {object} cookie 
 * @returns {string}
 */
export function formatAsNameValue(cookie) {
  if (!cookie || !cookie.name) return '';
  return `${cookie.name}=${cookie.value ?? ''}`;
}

/**
 * Format array of cookies into standard HTTP Cookie Request Header string:
 * "name1=value1; name2=value2; name3=value3"
 * Notice: RFC 6265 Section 4.2 dictates that Cookie request headers ONLY contain name-value pairs,
 * NEVER attributes like Path, Domain, Secure, or HttpOnly (which belong strictly to Set-Cookie response header).
 * @param {Array<object>} cookies 
 * @returns {string}
 */
export function formatAsCookieHeader(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) return '';
  return cookies
    .filter(c => c && c.name)
    .map(c => `${c.name}=${c.value ?? ''}`)
    .join('; ');
}

/**
 * Format single cookie as Set-Cookie response header string (useful for debugging)
 * @param {object} cookie 
 * @returns {string}
 */
export function formatAsSetCookieHeader(cookie) {
  if (!cookie || !cookie.name) return '';
  const parts = [`${cookie.name}=${cookie.value ?? ''}`];

  if (cookie.domain) parts.push(`Domain=${cookie.domain}`);
  if (cookie.path) parts.push(`Path=${cookie.path}`);
  if (cookie.expirationDate) {
    const expiresDate = new Date(cookie.expirationDate * 1000).toUTCString();
    parts.push(`Expires=${expiresDate}`);
  }
  if (cookie.secure) parts.push('Secure');
  if (cookie.httpOnly) parts.push('HttpOnly');
  if (cookie.sameSite && cookie.sameSite !== 'unspecified') {
    const map = {
      'no_restriction': 'None',
      'lax': 'Lax',
      'strict': 'Strict'
    };
    parts.push(`SameSite=${map[cookie.sameSite] || cookie.sameSite}`);
  }
  if (cookie.partitionKey) {
    parts.push('Partitioned');
  }

  return parts.join('; ');
}

/**
 * Clean & normalize a cookie object for export
 * @param {object} cookie 
 * @returns {object}
 */
export function normalizeCookieForExport(cookie) {
  const normalized = {
    name: cookie.name,
    value: cookie.value ?? '',
    domain: cookie.domain,
    hostOnly: Boolean(cookie.hostOnly),
    path: cookie.path || '/',
    secure: Boolean(cookie.secure),
    httpOnly: Boolean(cookie.httpOnly),
    sameSite: cookie.sameSite || 'unspecified',
    session: Boolean(cookie.session)
  };

  if (!cookie.session && cookie.expirationDate) {
    normalized.expirationDate = cookie.expirationDate;
  }

  if (cookie.storeId) {
    normalized.storeId = cookie.storeId;
  }

  if (cookie.partitionKey) {
    normalized.partitionKey = cookie.partitionKey;
  }

  return normalized;
}

/**
 * Generate versioned export JSON structure
 * @param {Array<object>} cookies 
 * @param {object} [metadata={}]
 * @returns {object}
 */
export function createExportPayload(cookies, metadata = {}) {
  const normalizedCookies = (Array.isArray(cookies) ? cookies : []).map(normalizeCookieForExport);

  return {
    format: SCHEMA_FORMAT,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    itemCount: normalizedCookies.length,
    metadata,
    cookies: normalizedCookies
  };
}

/**
 * Validate imported JSON payload against schema and security limits
 * @param {any} data Parsed JSON payload
 * @param {number} [maxItemLimit=10000] Protection against memory exhaustion
 * @returns {{ valid: boolean, error?: string, cookies?: Array<object>, metadata?: object }}
 */
export function validateImportPayload(data, maxItemLimit = 10000) {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: 'Invalid JSON payload: expected a JSON object or array' };
  }

  let cookieList = [];
  let metadata = {};

  // Support both official versioned structure and direct array format (e.g. from standard Cookie-Editor tools)
  if (Array.isArray(data)) {
    cookieList = data;
  } else if (Array.isArray(data.cookies)) {
    if (data.format && data.format !== SCHEMA_FORMAT) {
      return { valid: false, error: `Unsupported backup format: ${data.format}` };
    }
    cookieList = data.cookies;
    metadata = data.metadata || {};
  } else {
    return { valid: false, error: 'JSON payload missing "cookies" array or is not a list of cookies.' };
  }

  if (cookieList.length > maxItemLimit) {
    return { valid: false, error: `Import file exceeds safety limit of ${maxItemLimit} items.` };
  }

  // Validate each item basic structure
  const validatedCookies = [];
  for (let i = 0; i < cookieList.length; i++) {
    const item = cookieList[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `Invalid cookie at index ${i}: item must be an object.` };
    }
    if (typeof item.name !== 'string' || item.name.length === 0) {
      return { valid: false, error: `Invalid cookie at index ${i}: missing or empty "name".` };
    }
    if (typeof item.domain !== 'string' || item.domain.length === 0) {
      return { valid: false, error: `Invalid cookie "${item.name}" at index ${i}: missing or empty "domain".` };
    }

    validatedCookies.push({
      name: item.name,
      value: String(item.value ?? ''),
      domain: item.domain,
      hostOnly: Boolean(item.hostOnly),
      path: item.path || '/',
      secure: Boolean(item.secure),
      httpOnly: Boolean(item.httpOnly),
      sameSite: item.sameSite || 'unspecified',
      session: Boolean(item.session ?? !item.expirationDate),
      expirationDate: item.expirationDate ? Number(item.expirationDate) : undefined,
      storeId: item.storeId,
      partitionKey: item.partitionKey
    });
  }

  return {
    valid: true,
    cookies: validatedCookies,
    metadata
  };
}

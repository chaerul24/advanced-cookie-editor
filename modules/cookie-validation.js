/**
 * Advanced Cookie Editor - Cookie Validation Module
 * Standardized validation according to RFC 6265bis and Chrome Cookies API specifications.
 */

/**
 * Validate cookie name according to RFC 6265 token rules.
 * Name cannot contain control characters, whitespace, or separators: ( ) < > @ , ; : \ " / [ ] ? = { }
 * @param {string} name 
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCookieName(name) {
  if (typeof name !== 'string') {
    return { valid: false, error: 'Cookie name must be a string' };
  }
  if (name.length === 0) {
    return { valid: false, error: 'Cookie name cannot be empty' };
  }
  // Check for control characters or separators
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F\s,;=\\]/.test(name)) {
    return { valid: false, error: 'Cookie name contains invalid characters (spaces, semicolons, commas, or control characters are not allowed)' };
  }
  return { valid: true };
}

/**
 * Validate cookie value.
 * Value cannot contain control characters, whitespace, or semicolons/commas unless quoted.
 * @param {string} value 
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateCookieValue(value) {
  if (typeof value !== 'string') {
    return { valid: false, error: 'Cookie value must be a string' };
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1F\x7F;]/.test(value)) {
    return { valid: false, error: 'Cookie value cannot contain semicolons or control characters' };
  }
  return { valid: true };
}

/**
 * Validate cookie domain format.
 * @param {string} domain 
 * @returns {{ valid: boolean, error?: string, normalized?: string }}
 */
export function validateCookieDomain(domain) {
  if (typeof domain !== 'string' || domain.trim().length === 0) {
    return { valid: false, error: 'Cookie domain cannot be empty' };
  }
  const cleanDomain = domain.trim().toLowerCase();
  
  // Localhost, IPv4, IPv6, or domain name
  if (cleanDomain === 'localhost' || cleanDomain === '.localhost') {
    return { valid: true, normalized: cleanDomain };
  }

  // IPv4 check
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(cleanDomain.replace(/^\./, ''))) {
    return { valid: true, normalized: cleanDomain };
  }

  // Domain name check (allowing leading dot for domain cookies)
  const domainRegex = /^(\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
  if (!domainRegex.test(cleanDomain)) {
    return { valid: false, error: 'Invalid domain format. Example: example.com or .example.com' };
  }

  return { valid: true, normalized: cleanDomain };
}

/**
 * Validate cookie path.
 * Path must start with '/'
 * @param {string} path 
 * @returns {{ valid: boolean, error?: string, normalized?: string }}
 */
export function validateCookiePath(path) {
  if (typeof path !== 'string' || path.trim().length === 0) {
    return { valid: true, normalized: '/' };
  }
  const cleanPath = path.trim();
  if (!cleanPath.startsWith('/')) {
    return { valid: false, error: 'Cookie path must start with "/"' };
  }
  // Semicolon check
  if (cleanPath.includes(';')) {
    return { valid: false, error: 'Cookie path cannot contain semicolons' };
  }
  return { valid: true, normalized: cleanPath };
}

/**
 * Validate SameSite attribute.
 * In Chrome, valid values are: 'unspecified', 'no_restriction', 'lax', 'strict'.
 * Note: SameSite='no_restriction' MUST have secure=true.
 * @param {string} sameSite 
 * @param {boolean} secure 
 * @returns {{ valid: boolean, error?: string, normalized?: string }}
 */
export function validateSameSite(sameSite, secure) {
  const allowed = ['unspecified', 'no_restriction', 'lax', 'strict'];
  const normalized = (sameSite || 'unspecified').toLowerCase();
  
  if (!allowed.includes(normalized)) {
    return { valid: false, error: `Invalid sameSite attribute. Must be one of: ${allowed.join(', ')}` };
  }

  if (normalized === 'no_restriction' && !secure) {
    return { 
      valid: false, 
      error: 'Cookies with SameSite=None (no_restriction) MUST be marked as Secure (HTTPS only).' 
    };
  }

  return { valid: true, normalized };
}

/**
 * Validate expiration date.
 * @param {number|null|undefined} expirationDate Seconds timestamp since epoch
 * @param {boolean} session 
 * @returns {{ valid: boolean, error?: string, normalized?: number|null }}
 */
export function validateExpirationDate(expirationDate, session) {
  if (session) {
    return { valid: true, normalized: null };
  }
  if (expirationDate === null || expirationDate === undefined || isNaN(Number(expirationDate))) {
    return { valid: false, error: 'Persistent cookies require a valid numeric expiration timestamp (seconds).' };
  }
  const timestamp = Number(expirationDate);
  if (timestamp <= 0) {
    return { valid: false, error: 'Expiration timestamp must be greater than 0' };
  }
  return { valid: true, normalized: Math.floor(timestamp) };
}

/**
 * Build canonical URL required for Chrome Cookies API operations (set, remove).
 * @param {string} domain 
 * @param {string} path 
 * @param {boolean} secure 
 * @returns {string}
 */
export function buildCookieUrl(domain, path = '/', secure = false) {
  const cleanDomain = (domain || '').replace(/^\./, '').trim();
  const cleanPath = path && path.startsWith('/') ? path : `/${path || ''}`;
  const protocol = secure ? 'https://' : 'http://';
  return `${protocol}${cleanDomain}${cleanPath}`;
}

/**
 * Validates a complete cookie object before attempting chrome.cookies.set().
 * @param {object} cookie 
 * @returns {{ valid: boolean, errors: string[], normalized?: object }}
 */
export function validateCookieForSet(cookie) {
  const errors = [];

  if (!cookie || typeof cookie !== 'object') {
    return { valid: false, errors: ['Cookie payload must be an object'] };
  }

  const nameVal = validateCookieName(cookie.name);
  if (!nameVal.valid) errors.push(nameVal.error);

  const valueVal = validateCookieValue(cookie.value ?? '');
  if (!valueVal.valid) errors.push(valueVal.error);

  const domainVal = validateCookieDomain(cookie.domain);
  if (!domainVal.valid) errors.push(domainVal.error);

  const pathVal = validateCookiePath(cookie.path ?? '/');
  if (!pathVal.valid) errors.push(pathVal.error);

  const secure = Boolean(cookie.secure);
  const httpOnly = Boolean(cookie.httpOnly);
  const isSession = Boolean(cookie.session);

  const sameSiteVal = validateSameSite(cookie.sameSite, secure);
  if (!sameSiteVal.valid) errors.push(sameSiteVal.error);

  let normalizedExpiration = null;
  if (!isSession) {
    const expVal = validateExpirationDate(cookie.expirationDate, false);
    if (!expVal.valid) {
      errors.push(expVal.error);
    } else {
      normalizedExpiration = expVal.normalized;
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const normalizedDomain = domainVal.normalized;
  const normalizedPath = pathVal.normalized;
  const canonicalUrl = buildCookieUrl(normalizedDomain, normalizedPath, secure);

  const normalized = {
    url: canonicalUrl,
    name: cookie.name.trim(),
    value: cookie.value ?? '',
    path: normalizedPath,
    secure,
    httpOnly,
    sameSite: sameSiteVal.normalized
  };

  // Host-only cookie check: if hostOnly is true, do NOT set domain attribute in chrome.cookies.set
  // This causes Chrome to create a host-only cookie for the URL's exact host.
  if (!cookie.hostOnly && normalizedDomain) {
    normalized.domain = normalizedDomain;
  }

  if (!isSession && normalizedExpiration !== null) {
    normalized.expirationDate = normalizedExpiration;
  }

  if (cookie.storeId) {
    normalized.storeId = cookie.storeId;
  }

  if (cookie.partitionKey && typeof cookie.partitionKey === 'object' && cookie.partitionKey.topLevelSite) {
    normalized.partitionKey = {
      topLevelSite: cookie.partitionKey.topLevelSite
    };
  }

  return { valid: true, errors: [], normalized };
}

/**
 * Automated Unit Tests for Cookie Serializer
 */

import {
  formatAsNameValue,
  formatAsCookieHeader,
  formatAsSetCookieHeader,
  createExportPayload,
  validateImportPayload,
  SCHEMA_FORMAT,
  SCHEMA_VERSION
} from '../modules/cookie-serializer.js';

export function runSerializerTests() {
  const suiteName = 'Cookie Serializer Tests';
  const results = [];

  function assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Test 1: formatAsNameValue
  try {
    const c = { name: 'session_id', value: 'abc-123' };
    assert(formatAsNameValue(c) === 'session_id=abc-123', 'Formats single name=value correctly');
    results.push({ name: 'formatAsNameValue single cookie', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'formatAsNameValue single cookie', status: 'FAIL', error: err.message });
  }

  // Test 2: formatAsCookieHeader (HTTP Request Header RFC 6265)
  try {
    const cookies = [
      { name: 'theme', value: 'dark', path: '/', httpOnly: false },
      { name: 'sid', value: 'xyz987', path: '/', httpOnly: true, secure: true }
    ];
    const header = formatAsCookieHeader(cookies);
    // Must contain ONLY name-value pairs, separated by semicolons and space
    assert(header === 'theme=dark; sid=xyz987', 'Request header contains only name=value pairs');
    assert(!header.includes('HttpOnly'), 'Request header must NOT contain HttpOnly attribute');
    assert(!header.includes('Secure'), 'Request header must NOT contain Secure attribute');
    assert(!header.includes('Path'), 'Request header must NOT contain Path attribute');
    results.push({ name: 'formatAsCookieHeader RFC 6265 compliance', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'formatAsCookieHeader RFC 6265 compliance', status: 'FAIL', error: err.message });
  }

  // Test 3: formatAsSetCookieHeader
  try {
    const c = {
      name: 'auth',
      value: 'token123',
      domain: '.example.com',
      path: '/api',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      expirationDate: 1735689600
    };
    const setCookie = formatAsSetCookieHeader(c);
    assert(setCookie.includes('auth=token123'), 'Includes name=value');
    assert(setCookie.includes('Domain=.example.com'), 'Includes Domain');
    assert(setCookie.includes('Path=/api'), 'Includes Path');
    assert(setCookie.includes('Secure'), 'Includes Secure flag');
    assert(setCookie.includes('HttpOnly'), 'Includes HttpOnly flag');
    assert(setCookie.includes('SameSite=Lax'), 'Includes SameSite');
    results.push({ name: 'formatAsSetCookieHeader response formatting', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'formatAsSetCookieHeader response formatting', status: 'FAIL', error: err.message });
  }

  // Test 4: createExportPayload schema versioning
  try {
    const cookies = [
      { name: 'token', value: 'secret', domain: 'example.com', path: '/', secure: true, httpOnly: true, session: true }
    ];
    const payload = createExportPayload(cookies, { notes: 'test backup' });
    assert(payload.format === SCHEMA_FORMAT, 'Schema format matches');
    assert(payload.version === SCHEMA_VERSION, 'Schema version matches');
    assert(payload.itemCount === 1, 'Item count matches');
    assert(Boolean(payload.exportedAt), 'Contains ISO-8601 exportedAt');
    assert(payload.cookies[0].name === 'token', 'Contains cookie data');
    results.push({ name: 'createExportPayload schema v1 structure', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'createExportPayload schema v1 structure', status: 'FAIL', error: err.message });
  }

  // Test 5: validateImportPayload with valid and invalid data
  try {
    // Valid standard payload
    const valid = {
      format: SCHEMA_FORMAT,
      version: 1,
      exportedAt: new Date().toISOString(),
      cookies: [{ name: 'test', value: 'val', domain: 'test.com' }]
    };
    const res1 = validateImportPayload(valid);
    assert(res1.valid === true, 'Valid schema accepted');
    assert(res1.cookies.length === 1, 'Extracted cookies');

    // Also valid raw array format (interoperability with standard cookie exports)
    const rawArray = [{ name: 'test2', value: 'val2', domain: 'test2.com' }];
    const res2 = validateImportPayload(rawArray);
    assert(res2.valid === true, 'Raw array format accepted');

    // Invalid format name
    const invalidFormat = { format: 'malicious-or-unknown-format', cookies: [] };
    const res3 = validateImportPayload(invalidFormat);
    assert(res3.valid === false, 'Unknown schema format rejected');

    // Missing cookie name
    const missingName = { format: SCHEMA_FORMAT, cookies: [{ value: 'abc', domain: 'test.com' }] };
    const res4 = validateImportPayload(missingName);
    assert(res4.valid === false, 'Cookie missing name rejected');

    results.push({ name: 'validateImportPayload structural validation', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'validateImportPayload structural validation', status: 'FAIL', error: err.message });
  }

  return { suite: suiteName, results };
}

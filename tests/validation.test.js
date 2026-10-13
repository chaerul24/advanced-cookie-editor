/**
 * Automated Unit Tests for Cookie Validation
 */

import {
  validateCookieName,
  validateCookieValue,
  validateCookieDomain,
  validateCookiePath,
  validateSameSite,
  validateExpirationDate,
  validateCookieForSet,
  buildCookieUrl
} from '../modules/cookie-validation.js';

export function runValidationTests() {
  const suiteName = 'Cookie Validation Tests';
  const results = [];

  function assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Test 1: Cookie Name Validation
  try {
    assert(validateCookieName('session_id').valid === true, 'Valid name passes');
    assert(validateCookieName('user.auth-token').valid === true, 'Dot and dash pass');
    assert(validateCookieName('').valid === false, 'Empty name fails');
    assert(validateCookieName('bad name').valid === false, 'Name with space fails');
    assert(validateCookieName('bad;name').valid === false, 'Name with semicolon fails');
    assert(validateCookieName('bad=name').valid === false, 'Name with equal fails');
    results.push({ name: 'validateCookieName rules', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'validateCookieName rules', status: 'FAIL', error: err.message });
  }

  // Test 2: Cookie Value Validation
  try {
    assert(validateCookieValue('simple_val_123').valid === true, 'Simple value passes');
    assert(validateCookieValue('abc;def').valid === false, 'Value with semicolon fails');
    results.push({ name: 'validateCookieValue rules', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'validateCookieValue rules', status: 'FAIL', error: err.message });
  }

  // Test 3: Domain Validation & Normalization
  try {
    assert(validateCookieDomain('example.com').valid === true, 'Standard domain passes');
    assert(validateCookieDomain('.example.com').valid === true, 'Leading dot domain passes');
    assert(validateCookieDomain('sub.domain.co.uk').valid === true, 'Subdomain passes');
    assert(validateCookieDomain('localhost').valid === true, 'Localhost passes');
    assert(validateCookieDomain('127.0.0.1').valid === true, 'IPv4 passes');
    assert(validateCookieDomain('invalid space.com').valid === false, 'Domain with space fails');
    assert(validateCookieDomain('').valid === false, 'Empty domain fails');
    results.push({ name: 'validateCookieDomain rules', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'validateCookieDomain rules', status: 'FAIL', error: err.message });
  }

  // Test 4: SameSite & Secure Rule Enforcement (SameSite=None MUST have Secure=true)
  try {
    assert(validateSameSite('lax', false).valid === true, 'Lax with insecure passes');
    assert(validateSameSite('strict', false).valid === true, 'Strict with insecure passes');
    assert(validateSameSite('no_restriction', true).valid === true, 'no_restriction with Secure passes');
    
    // Critical RFC rule:
    const noRestInsecure = validateSameSite('no_restriction', false);
    assert(noRestInsecure.valid === false, 'SameSite=no_restriction without Secure MUST be rejected');

    results.push({ name: 'validateSameSite with Secure constraint', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'validateSameSite with Secure constraint', status: 'FAIL', error: err.message });
  }

  // Test 5: Expiration Validation (Session vs Persistent)
  try {
    assert(validateExpirationDate(null, true).valid === true, 'Session cookie without expiration passes');
    assert(validateExpirationDate(1893456000, false).valid === true, 'Valid future timestamp passes');
    assert(validateExpirationDate(null, false).valid === false, 'Persistent cookie without expiration fails');
    assert(validateExpirationDate(-10, false).valid === false, 'Negative timestamp fails');
    results.push({ name: 'validateExpirationDate session vs persistent', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'validateExpirationDate session vs persistent', status: 'FAIL', error: err.message });
  }

  // Test 6: Canonical URL generation
  try {
    const url1 = buildCookieUrl('example.com', '/api', true);
    assert(url1 === 'https://example.com/api', 'Secure URL matches https://');
    const url2 = buildCookieUrl('.example.com', '/', false);
    assert(url2 === 'http://example.com/', 'Leading dot stripped in URL scheme');
    results.push({ name: 'buildCookieUrl canonical URL builder', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'buildCookieUrl canonical URL builder', status: 'FAIL', error: err.message });
  }

  // Test 7: Full cookie object validation for set
  try {
    const validCookie = {
      name: 'auth_token',
      value: 'xyz789',
      domain: '.example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'lax',
      session: true
    };
    const res = validateCookieForSet(validCookie);
    assert(res.valid === true, 'Valid cookie object returns valid=true');
    assert(res.normalized.url === 'https://example.com/', 'Normalized contains correct canonical URL');
    assert(res.normalized.httpOnly === true, 'HttpOnly preserved');

    // Invalid cookie: SameSite none without secure
    const invalidCookie = {
      name: 'bad_token',
      value: '123',
      domain: 'example.com',
      secure: false,
      sameSite: 'no_restriction',
      session: true
    };
    const resInvalid = validateCookieForSet(invalidCookie);
    assert(resInvalid.valid === false, 'Invalid cookie caught by validateCookieForSet');
    assert(resInvalid.errors.length > 0, 'Detailed errors returned');

    results.push({ name: 'validateCookieForSet comprehensive checks', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'validateCookieForSet comprehensive checks', status: 'FAIL', error: err.message });
  }

  return { suite: suiteName, results };
}

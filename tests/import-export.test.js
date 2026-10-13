/**
 * Automated Unit Tests for ImportExportService
 */

import { ImportExportService } from '../modules/import-export.js';

export async function runImportExportTests() {
  const suiteName = 'Import / Export Service Tests';
  const results = [];

  function assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Test 1: parseJsonText valid payload
  try {
    const raw = JSON.stringify([{ name: 'test_token', value: 'xyz123', domain: 'example.com' }]);
    const parsed = ImportExportService.parseJsonText(raw);
    assert(parsed.isEncrypted === false, 'Detects plain JSON');
    assert(Array.isArray(parsed.parsedData), 'Parsed data is an array');
    assert(parsed.parsedData[0].name === 'test_token', 'Cookie name preserved');
    results.push({ name: 'parseJsonText plain array JSON', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'parseJsonText plain array JSON', status: 'FAIL', error: err.message });
  }

  // Test 2: parseJsonText detects encrypted envelope
  try {
    const envelope = {
      format: 'advanced-cookie-editor-encrypted',
      version: 1,
      ciphertext: 'dummy'
    };
    const parsed = ImportExportService.parseJsonText(JSON.stringify(envelope));
    assert(parsed.isEncrypted === true, 'Detects encrypted envelope format');
    results.push({ name: 'parseJsonText encrypted envelope detection', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'parseJsonText encrypted envelope detection', status: 'FAIL', error: err.message });
  }

  // Test 3: parseJsonText rejects malformed JSON
  try {
    let failed = false;
    try {
      ImportExportService.parseJsonText('{"broken: json');
    } catch {
      failed = true;
    }
    assert(failed, 'Malformed JSON must throw error');
    results.push({ name: 'parseJsonText invalid JSON rejection', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'parseJsonText invalid JSON rejection', status: 'FAIL', error: err.message });
  }

  // Test 4: exportCookies string generation without download trigger
  try {
    const cookies = [
      { name: 'session', value: '12345', domain: '.example.com', path: '/', secure: true, session: true }
    ];
    const res = await ImportExportService.exportCookies(cookies, { download: false });
    assert(typeof res.content === 'string', 'Returns content string');
    assert(res.content.includes('session'), 'Contains cookie name');
    assert(res.isEncrypted === false, 'Plain export flag is false');
    assert(res.size > 0, 'Size is greater than 0');
    results.push({ name: 'exportCookies plain string generation', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'exportCookies plain string generation', status: 'FAIL', error: err.message });
  }

  // Test 5: exportCookies encrypted string generation with password
  try {
    const cookies = [
      { name: 'secret_cookie', value: 'top_secret', domain: 'example.com', path: '/', secure: true, session: true }
    ];
    const password = 'MasterPassword2026!';
    const res = await ImportExportService.exportCookies(cookies, {
      encrypt: true,
      password,
      download: false,
      iterations: 10000
    });
    assert(res.isEncrypted === true, 'Encrypted flag is true');
    const envelope = JSON.parse(res.content);
    assert(envelope.format === 'advanced-cookie-editor-encrypted', 'Valid encrypted envelope format');
    
    // Decrypt and verify
    const decrypted = await ImportExportService.decryptBackup(envelope, password);
    assert(decrypted.cookies[0].name === 'secret_cookie', 'Decrypted cookie name matches');
    assert(decrypted.cookies[0].value === 'top_secret', 'Decrypted cookie value matches');
    results.push({ name: 'exportCookies encrypted roundtrip verification', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'exportCookies encrypted roundtrip verification', status: 'FAIL', error: err.message });
  }

  return { suite: suiteName, results };
}

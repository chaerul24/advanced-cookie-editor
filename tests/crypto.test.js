/**
 * Automated Unit Tests for Crypto Service
 */

import { encryptData, decryptData, bufferToBase64, base64ToBuffer } from '../modules/crypto-service.js';

export async function runCryptoTests() {
  const suiteName = 'Crypto Service Tests';
  const results = [];

  function assert(condition, message) {
    if (!condition) {
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // Test 1: Base64 roundtrip
  try {
    const original = new Uint8Array([1, 2, 3, 255, 128, 0, 42]);
    const b64 = bufferToBase64(original);
    const roundtrip = base64ToBuffer(b64);
    assert(original.length === roundtrip.length, 'Base64 length matches');
    assert(original.every((v, i) => v === roundtrip[i]), 'Base64 byte values match');
    results.push({ name: 'Base64 encoding/decoding roundtrip', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'Base64 encoding/decoding roundtrip', status: 'FAIL', error: err.message });
  }

  // Test 2: Encrypt & Decrypt object payload
  try {
    const payload = {
      format: 'advanced-cookie-editor',
      version: 1,
      cookies: [
        { name: 'session_token', value: 'secret_abc_123', domain: 'example.com' },
        { name: 'csrf', value: 'token_xyz', domain: 'api.example.com' }
      ]
    };
    const password = 'SuperSecretMasterPassword123!';
    // Use lower iterations for fast unit test
    const iterations = 10000;

    const envelope = await encryptData(payload, password, iterations);
    assert(envelope.format === 'advanced-cookie-editor-encrypted', 'Envelope format identifier');
    assert(envelope.algorithm === 'AES-GCM', 'Envelope algorithm AES-GCM');
    assert(envelope.kdf === 'PBKDF2', 'Envelope KDF PBKDF2');
    assert(Boolean(envelope.salt), 'Envelope contains salt');
    assert(Boolean(envelope.iv), 'Envelope contains IV');
    assert(Boolean(envelope.ciphertext), 'Envelope contains ciphertext');
    assert(envelope.iterations === iterations, 'Envelope stores iteration count');

    const decrypted = await decryptData(envelope, password);
    assert(decrypted.format === payload.format, 'Decrypted payload matches format');
    assert(decrypted.cookies.length === 2, 'Decrypted cookies length matches');
    assert(decrypted.cookies[0].name === 'session_token', 'Decrypted cookie name matches');
    assert(decrypted.cookies[0].value === 'secret_abc_123', 'Decrypted cookie value matches');

    results.push({ name: 'AES-GCM encryption & decryption roundtrip', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'AES-GCM encryption & decryption roundtrip', status: 'FAIL', error: err.message });
  }

  // Test 3: Reject incorrect password
  try {
    const payload = { secret: 'top_secret' };
    const envelope = await encryptData(payload, 'correctPassword!123', 5000);

    let failedAsExpected = false;
    try {
      await decryptData(envelope, 'wrongPassword!999');
    } catch {
      failedAsExpected = true;
    }
    assert(failedAsExpected, 'Decrypting with incorrect password must fail');
    results.push({ name: 'Rejection of incorrect password', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'Rejection of incorrect password', status: 'FAIL', error: err.message });
  }

  // Test 4: Rejection of tampered ciphertext
  try {
    const payload = { test: 123 };
    const envelope = await encryptData(payload, 'validPassword123', 5000);

    // Tamper with base64 ciphertext
    const rawCipher = base64ToBuffer(envelope.ciphertext);
    rawCipher[0] = rawCipher[0] ^ 0xFF; // flip bits
    envelope.ciphertext = bufferToBase64(rawCipher);

    let failedAsExpected = false;
    try {
      await decryptData(envelope, 'validPassword123');
    } catch {
      failedAsExpected = true;
    }
    assert(failedAsExpected, 'Decrypting tampered ciphertext must fail due to AES-GCM tag mismatch');
    results.push({ name: 'Rejection of tampered ciphertext (AES-GCM integrity)', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'Rejection of tampered ciphertext (AES-GCM integrity)', status: 'FAIL', error: err.message });
  }

  // Test 5: Rejection of short password (< 6 chars)
  try {
    let rejected = false;
    try {
      await encryptData({ a: 1 }, '12345');
    } catch {
      rejected = true;
    }
    assert(rejected, 'Password shorter than 6 characters must be rejected');
    results.push({ name: 'Validation of minimum password length', status: 'PASS' });
  } catch (err) {
    results.push({ name: 'Validation of minimum password length', status: 'FAIL', error: err.message });
  }

  return { suite: suiteName, results };
}

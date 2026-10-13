/**
 * Advanced Cookie Editor - Cryptographic Service
 * Provides client-side AES-GCM 256-bit encryption with PBKDF2 key derivation using Web Crypto API.
 * Adheres to OWASP recommendations (250,000 PBKDF2 iterations with SHA-256).
 */

const DEFAULT_ITERATIONS = 250000;
const SALT_BYTE_LENGTH = 16;
const IV_BYTE_LENGTH = 12; // 96-bit IV recommended for AES-GCM
const KEY_BYTE_LENGTH = 32; // 256-bit AES key

/**
 * Convert ArrayBuffer or Uint8Array to Base64 string
 * @param {ArrayBuffer|Uint8Array} buffer 
 * @returns {string}
 */
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 * @param {string} base64 
 * @returns {Uint8Array}
 */
export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Get the Web Crypto subtle instance across browser and Node.js environments
 * @returns {SubtleCrypto}
 */
function getSubtleCrypto() {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    return crypto.subtle;
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API (crypto.subtle) is not available in this environment.');
}

/**
 * Derive an AES-GCM key from a password and salt using PBKDF2
 * @param {string} password 
 * @param {Uint8Array} salt 
 * @param {number} iterations 
 * @returns {Promise<CryptoKey>}
 */
async function deriveKey(password, salt, iterations = DEFAULT_ITERATIONS) {
  const subtle = getSubtleCrypto();
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  const baseKey = await subtle.importKey(
    'raw',
    passwordBuffer,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256'
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: KEY_BYTE_LENGTH * 8
    },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt arbitrary plain data (string or serializable object) using AES-GCM
 * @param {any} data Object or string to encrypt
 * @param {string} password Master password for encryption
 * @param {number} [iterations=250000] PBKDF2 iteration count
 * @returns {Promise<object>} Encrypted JSON envelope
 */
export async function encryptData(data, password, iterations = DEFAULT_ITERATIONS) {
  if (!password || typeof password !== 'string' || password.length < 6) {
    throw new Error('Encryption password must be at least 6 characters long.');
  }

  const subtle = getSubtleCrypto();
  const plaintextString = typeof data === 'string' ? data : JSON.stringify(data);
  const encoder = new TextEncoder();
  const plaintextBuffer = encoder.encode(plaintextString);

  // Generate cryptographic random salt and IV
  const salt = new Uint8Array(SALT_BYTE_LENGTH);
  const iv = new Uint8Array(IV_BYTE_LENGTH);
  crypto.getRandomValues(salt);
  crypto.getRandomValues(iv);

  const key = await deriveKey(password, salt, iterations);

  const ciphertextBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv
    },
    key,
    plaintextBuffer
  );

  return {
    format: 'advanced-cookie-editor-encrypted',
    version: 1,
    algorithm: 'AES-GCM',
    kdf: 'PBKDF2',
    hash: 'SHA-256',
    iterations,
    salt: bufferToBase64(salt),
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertextBuffer),
    timestamp: new Date().toISOString()
  };
}

/**
 * Decrypt an encrypted envelope using AES-GCM
 * @param {object} envelope Encrypted JSON envelope
 * @param {string} password Master password for decryption
 * @returns {Promise<any>} Decrypted payload (parsed JSON or raw string)
 */
export async function decryptData(envelope, password) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be provided.');
  }

  if (!envelope || typeof envelope !== 'object') {
    throw new Error('Invalid envelope: payload must be an object.');
  }

  if (envelope.format !== 'advanced-cookie-editor-encrypted') {
    throw new Error('Invalid format: file is not an Advanced Cookie Editor encrypted backup.');
  }

  if (envelope.algorithm !== 'AES-GCM' || envelope.kdf !== 'PBKDF2') {
    throw new Error(`Unsupported encryption algorithm: ${envelope.algorithm} / ${envelope.kdf}`);
  }

  if (!envelope.salt || !envelope.iv || !envelope.ciphertext) {
    throw new Error('Corrupted envelope: missing cryptographic parameters (salt, iv, or ciphertext).');
  }

  const iterations = Number(envelope.iterations) || DEFAULT_ITERATIONS;
  const subtle = getSubtleCrypto();

  let salt, iv, ciphertext;
  try {
    salt = base64ToBuffer(envelope.salt);
    iv = base64ToBuffer(envelope.iv);
    ciphertext = base64ToBuffer(envelope.ciphertext);
  } catch {
    throw new Error('Corrupted envelope: failed to decode Base64 parameters.');
  }

  let key;
  try {
    key = await deriveKey(password, salt, iterations);
  } catch (err) {
    throw new Error('Key derivation failed: ' + err.message);
  }

  let decryptedBuffer;
  try {
    decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv
      },
      key,
      ciphertext
    );
  } catch {
    // AES-GCM authentication failure indicates either incorrect password or tampered ciphertext
    throw new Error('Decryption failed: Incorrect password or corrupted/tampered data.');
  }

  const decoder = new TextDecoder();
  const plaintextString = decoder.decode(decryptedBuffer);

  try {
    return JSON.parse(plaintextString);
  } catch {
    return plaintextString;
  }
}

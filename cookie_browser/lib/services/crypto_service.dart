import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:crypto/crypto.dart' as crypto;
import 'package:pointycastle/export.dart';

class CryptoService {
  /// Generate cryptographically secure random bytes
  static Uint8List getRandomBytes(int length) {
    final rnd = Random.secure();
    final bytes = Uint8List(length);
    for (int i = 0; i < length; i++) {
      bytes[i] = rnd.nextInt(256);
    }
    return bytes;
  }

  /// Derive 256-bit (32 bytes) key from password using PBKDF2 with SHA-256
  static Uint8List deriveKey(String password, Uint8List salt, {int iterations = 100000}) {
    final pbkdf2 = PBKDF2KeyDerivator(HMac(SHA256Digest(), 64))
      ..init(Pbkdf2Parameters(salt, iterations, 32));
    final passwordBytes = Uint8List.fromList(utf8.encode(password));
    return pbkdf2.process(passwordBytes);
  }

  /// Encrypt payload using AES-GCM 256-bit
  static Map<String, dynamic> encryptPayload(String plaintext, String password, {int iterations = 100000}) {
    final salt = getRandomBytes(16);
    final iv = getRandomBytes(12);
    final key = deriveKey(password, salt, iterations: iterations);

    final cipher = GCMBlockCipher(AESEngine())
      ..init(true, AEADParameters(KeyParameter(key), 128, iv, Uint8List(0)));

    final input = Uint8List.fromList(utf8.encode(plaintext));
    final encrypted = cipher.process(input);

    return {
      'format': 'advanced-cookie-editor-encrypted',
      'version': 1,
      'algorithm': 'AES-GCM',
      'kdf': 'PBKDF2',
      'hash': 'SHA-256',
      'iterations': iterations,
      'salt': base64.encode(salt),
      'iv': base64.encode(iv),
      'ciphertext': base64.encode(encrypted),
      'timestamp': DateTime.now().toUtc().toIso8601String(),
    };
  }

  /// Decrypt envelope using AES-GCM 256-bit
  static String decryptPayload(Map<String, dynamic> envelope, String password) {
    final salt = base64.decode(envelope['salt'] as String);
    final iv = base64.decode(envelope['iv'] as String);
    final ciphertext = base64.decode(envelope['ciphertext'] as String);
    final iterations = (envelope['iterations'] as num?)?.toInt() ?? 100000;

    final key = deriveKey(password, salt, iterations: iterations);

    final cipher = GCMBlockCipher(AESEngine())
      ..init(false, AEADParameters(KeyParameter(key), 128, iv, Uint8List(0)));

    final decrypted = cipher.process(ciphertext);
    return utf8.decode(decrypted);
  }
}

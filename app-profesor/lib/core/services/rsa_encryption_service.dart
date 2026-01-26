import 'package:encrypt/encrypt.dart' as encrypt;
import 'package:pointycastle/asymmetric/api.dart';

/// RSA Encryption Service
/// Encrypts passwords using RSA-OAEP SHA-256 for secure transmission to backend
class RSAEncryptionService {
  // Public key from backend (RSA 4096-bit)
  static const String _publicKeyPem = '''-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAxPl91co6SigcVBtOQLf1
BhOK6t5CP8RLKqHbGBcvvxdZqqiZy1K/YkYW9ePDaA+wQvV8VJ2hTuMtbnaFha+r
Cyc5sNAjwcirPnTJQP+IAChuLq0mtAdaNKhLnOAV78ZpOrm4tPy80jE/NsO0vkDe
PpZJgl+Tu71lLQ0s3CG4+pK1wdrULp81+kGCAW+GLpJHFPf57e6U75/gA0iFicDQ
gp3yHr7xhUPugHKLvv8Z/4uhR2GP70L2XyazMuIr/GAbu1Ua2jYeMl8ni/r5HPiT
cVp9LU09jBHu2KtRsV+mDXSFfyAQeItKxfSgfkvV+PgytvUP4eM6DsZNHCrP5Ggl
pOXPV9mTE3Dqx9FdkMJEtzGQDxfnMJ1xFRBz1mn4qxYCMbhC52n14j6uO7L8aQ21
bjNXN1lnnaqRFpHgVRyMUZuOoww9db0m5b8l8A7K9yqS/QUojZSUafpHnfpMajE7
TKkQnDhp1RwgvmJh9/v1QLMTgB9D10DpP1xhemahis+zJ5KT/pXNLX/3v7492e8p
5LJ+oWzrhTchuRoTyhsRoof1KZbSiKjVdR1WawW6VX1ahugbierpqWBD/va9D7Zi
nxp6XfKAQeyvnbqtfrgGdNvrPeDX6E0+WnQ9vto17muz9MwbfKrMap/j6w/Lw372
UMRPIp4WhggjKe58uNusKdMCAwEAAQ==
-----END PUBLIC KEY-----''';

  late final encrypt.Encrypter _encrypter;
  late final RSAPublicKey _publicKey;

  RSAEncryptionService() {
    _initializeEncryption();
  }

  void _initializeEncryption() {
    try {
      // Parse the public key
      _publicKey = encrypt.RSAKeyParser().parse(_publicKeyPem) as RSAPublicKey;

      // Create encrypter with RSA-OAEP SHA-256 (matching backend)
      _encrypter = encrypt.Encrypter(
        encrypt.RSA(
          publicKey: _publicKey,
          encoding: encrypt.RSAEncoding.OAEP,
          digest: encrypt.RSADigest.SHA256,
        ),
      );
    } catch (e) {
      throw Exception('Failed to initialize RSA encryption: $e');
    }
  }

  /// Encrypt a password for secure transmission
  /// Returns base64-encoded encrypted string
  String encryptPassword(String password) {
    try {
      final encrypted = _encrypter.encrypt(password);
      return encrypted.base64;
    } catch (e) {
      throw Exception('Failed to encrypt password: $e');
    }
  }

  /// Test encryption (for debugging)
  bool testEncryption() {
    try {
      final testPassword = 'test123';
      final encrypted = encryptPassword(testPassword);
      return encrypted.isNotEmpty && encrypted != testPassword;
    } catch (e) {
      return false;
    }
  }
}

// Singleton instance
final rsaEncryptionService = RSAEncryptionService();

import 'package:encrypt/encrypt.dart' as encrypt;
import 'package:pointycastle/asymmetric/api.dart';

/// RSA Encryption Service
/// Encrypts passwords using RSA-OAEP SHA-256 for secure transmission to backend
class RSAEncryptionService {
  // Public key from backend (RSA 4096-bit)
  static const String _publicKeyPem = '''-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAxyKgOh66LT3fskoF1J9D
AU8nw5oBtzGA+4m//36xS+uy6S6LxqF5Wfgv2szKFVjTRLZ1gTIy/Lmv/F+ct4Q7
sFAq8n7EubbaTLNMndZ8ih6BRcuw9/aWQrZCBo5umZ+uAXWEX9wf4RqS75llsZgt
YDEOaN5M2sEhOicDHJKND1bXfGvvPqau2vq2Qs0fM3luyhFVzTRJ/2vIPrtPX0KW
Vh5fylRa5qVKo/bkUQSEviy25VS0A5qM/eSjE3tX6D9HrBcABxNiSgxURhTjQDYO
ZdE5zNU7lDMn2d0E+nqHviBAq9L0cTIDw4SuhJCj4ubsvw20xLNNGAz3QVysCbE+
ttsWIq3JssBAZVvi5L/KWCTOxFRWs2yJB9WaMDN3Fs7Y8pIIIk6Y3N4eX59imtfK
qt4UiIU6rrYkKgwMXeQay17WqatVCEgxvJ5f2v6ETWYT+swTShHu0y8w10qGMlab
rpes5n4rEg2CMM4BBhAN6lJUQZAVjywkMXqE+XeRxVy/1UrOwgp5tTcIC5FVxkl4
SWQtBBE+tGydf5UPcbe9sfr2FVTfK5nIveyrpnQEmuCKcQqSuKbDm3GzjnOATstH
iKMEuCMlMCCciMqvQ5UqA4hmsU0Tj3iJU4szCsZ8rkqt/R1NQuiPcN/ypDoQjn8v
xsL/fYza7eo+DEseSEO5BpECAwEAAQ==
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

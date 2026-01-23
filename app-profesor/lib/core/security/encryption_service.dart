import 'dart:convert';
import 'dart:typed_data';
import 'package:encrypt/encrypt.dart' as encrypt_pkg;
import 'package:pointycastle/export.dart';
import '../utils/utils.dart';

/// Servicio de encriptación RSA para contraseñas
/// Usa RSA-OAEP con SHA-256 para coincidir con el backend Node.js
class EncryptionService {
  // Clave pública del servidor para encriptación RSA
  static const String _publicKeyPEM = '''-----BEGIN PUBLIC KEY-----
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

  late final RSAPublicKey _publicKey;

  EncryptionService() {
    try {
      _publicKey = _parsePublicKey(_publicKeyPEM);
      Logger.info('EncryptionService inicializado con RSA-OAEP SHA-256');
    } catch (e, stackTrace) {
      Logger.error('Error al inicializar EncryptionService', e, stackTrace);
      rethrow;
    }
  }

  /// Parse la clave pública PEM usando el parser del paquete encrypt
  RSAPublicKey _parsePublicKey(String pem) {
    final parser = encrypt_pkg.RSAKeyParser();
    return parser.parse(pem) as RSAPublicKey;
  }

  /// Encripta una contraseña usando RSA-OAEP con SHA-256
  /// Esto coincide exactamente con el backend Node.js:
  /// padding: RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'
  String encryptPassword(String password) {
    try {
      Logger.info('Encriptando contraseña con RSA-OAEP SHA-256...');

      // Convertir password a bytes UTF-8
      final passwordBytes = Uint8List.fromList(utf8.encode(password));

      // Encriptar con OAEP + SHA-256
      final encryptedBytes = _encryptWithOAEP(passwordBytes);

      // Convertir a Base64
      final encryptedBase64 = base64.encode(encryptedBytes);

      Logger.info(
        'Contraseña encriptada correctamente (${encryptedBytes.length} bytes)',
      );
      return encryptedBase64;
    } catch (e, stackTrace) {
      Logger.error('Error al encriptar contraseña', e, stackTrace);
      rethrow;
    }
  }

  /// Encripta datos usando RSA-OAEP con SHA-256
  /// Matching Node.js crypto: RSA_PKCS1_OAEP_PADDING with SHA-256
  Uint8List _encryptWithOAEP(Uint8List data) {
    // Crear cipher OAEP con SHA-256
    final cipher = OAEPEncoding.withSHA256(RSAEngine())
      ..init(
        true, // true = encrypt
        PublicKeyParameter<RSAPublicKey>(_publicKey),
      );

    return cipher.process(data);
  }

  /// Encripta datos genéricos usando RSA-OAEP SHA-256
  String encryptData(String data) {
    try {
      final dataBytes = Uint8List.fromList(utf8.encode(data));
      final encryptedBytes = _encryptWithOAEP(dataBytes);
      return base64.encode(encryptedBytes);
    } catch (e, stackTrace) {
      Logger.error('Error al encriptar datos', e, stackTrace);
      rethrow;
    }
  }
}

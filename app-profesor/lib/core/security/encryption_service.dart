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

/// Global application constants
class AppConstants {
  static const String appName = 'App Profesores Universidad';
  static const String appVersion = '1.0.0';

  // Prefer ApiConstants.baseUrl (supports env override).
  static const String baseUrl = 'http://10.0.2.2:3000';
  static const int timeoutDuration = 30000; // 30 seconds

  // Database
  static const String databaseName = 'professors_app.db';
  static const int databaseVersion = 1;

  // Bluetooth/Beacon
  static const int scanDuration = 10; // seconds
  static const double proximityThreshold = 2.0; // meters

  // RSA Public Key for password encryption
  static const String rsaPublicKey = '''-----BEGIN PUBLIC KEY-----
MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEArF5a3wJHLAyafBk7RLE2
0DrQUq+FTGtNt6Ve34p4OxAs/ckxm9+8KuuM46kvN0L/qYk2Ft3qaOxqdnNw3m2R
Yz9nkCELOz5jXwVwCImSWQn/C4PtRbUX6z2yCGYQtCqYkXT4UMypEbQOVWKrRUC/
J8BCkFe6C1/2kU1/299urYA5eFx7gbLiUmOkPYRg44Lc7/irI1tqMsqRimrPI1Og
+pao+JkMiwzWiLcboTkAPsxNu4Dp19NmHnxdGkpako/NceIJJVFAKiVnpp/mxX9z
8dnXQVnq5zh1odLfUQnGNUkKQwy6e5OvMgIdcdp33aYzI9mAA6dg/TP+xjQnxkSi
DjKL2sIEYQCoaFiPaL1wpU1jG2l/Qkbn0Fz1Pxwil0aAbryVzopbq6EVmJi8U6Tn
n/vQ2quR7zqkETp72Icyjq4xLw63Sq8qVNqU/H9LFy1X9jPYeJuX3eVtmxndSH9w
2R2KxXrtTtYHU3OPhVHMGKasNX0PUwpImweItflqgwr2JnuCm/0FfNKv1yD5gtQ2
LOY2yBSObPdgR2mwsrOgjZY4WkakPrj/8XZwBU12icM6ELW0bPADfljwFyVA9kKi
qYqvgD/QEu/W2SNd7XZTwyPTS2Bm9hekozPJxKaofYh4zXJ/j09blH6DRqEofnaC
XgPSfQyppuhJqPdt6Sr9L9kCAwEAAQ==
-----END PUBLIC KEY-----''';
}

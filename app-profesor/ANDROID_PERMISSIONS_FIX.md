# Corrección de Permisos de Android - APK

## Problema Identificado
El APK generado no tenía los permisos necesarios en el AndroidManifest.xml, lo que causaba errores de conexión cuando el cliente intentaba usar la aplicación.

## Cambios Realizados

### 1. AndroidManifest.xml
**Archivo**: `android/app/src/main/AndroidManifest.xml`

#### Permisos Agregados:

**Permisos de Red (CRÍTICO para conexiones HTTP/HTTPS):**
- ✅ `INTERNET` - Permite conexiones a internet
- ✅ `ACCESS_NETWORK_STATE` - Permite verificar el estado de la red

**Permisos de Bluetooth (para funcionalidad de escaneo):**
- ✅ `BLUETOOTH` - Acceso básico a Bluetooth
- ✅ `BLUETOOTH_ADMIN` - Administración de Bluetooth
- ✅ `BLUETOOTH_SCAN` - Escaneo de dispositivos Bluetooth (Android 12+)
- ✅ `BLUETOOTH_CONNECT` - Conexión a dispositivos Bluetooth (Android 12+)
- ✅ `ACCESS_FINE_LOCATION` - Ubicación precisa (requerida para Bluetooth)
- ✅ `ACCESS_COARSE_LOCATION` - Ubicación aproximada (requerida para Bluetooth)

**Características de Hardware:**
- ✅ `android.hardware.bluetooth` (opcional)
- ✅ `android.hardware.bluetooth_le` (opcional)

#### Configuración de Seguridad de Red:
- ✅ Agregado `android:networkSecurityConfig="@xml/network_security_config"`

### 2. Network Security Config
**Archivo**: `android/app/src/main/res/xml/network_security_config.xml` (NUEVO)

Este archivo configura:
- ✅ Confianza en certificados SSL del sistema
- ✅ Confianza en certificados de usuario (útil para debugging)
- ✅ Configuración específica para los dominios:
  - `apipresencia.110694.xyz`
  - `campus.20040521.xyz`

## Próximos Pasos

### Para generar un nuevo APK:

1. **Limpiar el build anterior:**
   ```bash
   cd /Users/ebravo/proyects/presencia/app-profesor
   flutter clean
   ```

2. **Obtener dependencias:**
   ```bash
   flutter pub get
   ```

3. **Generar el APK de release:**
   ```bash
   flutter build apk --release
   ```

4. **Ubicación del APK generado:**
   ```
   build/app/outputs/flutter-apk/app-release.apk
   ```

### Para generar un App Bundle (recomendado para Play Store):
```bash
flutter build appbundle --release
```

## Verificación

Después de instalar el nuevo APK, la app debería:
- ✅ Conectarse correctamente a la API
- ✅ No mostrar errores de conexión
- ✅ Solicitar permisos de ubicación y Bluetooth al usuario (si es necesario)
- ✅ Funcionar correctamente en todas las versiones de Android soportadas

## Notas Importantes

1. **Primera instalación**: El usuario deberá aceptar los permisos de ubicación y Bluetooth cuando la app los solicite.

2. **Versiones de Android**: Los permisos están configurados para funcionar desde Android 5.0 (API 21) hasta Android 14 (API 34).

3. **Seguridad**: La configuración de red solo permite conexiones HTTPS seguras, excepto para los dominios específicos configurados.

## Contacto de Soporte

Si el cliente sigue experimentando problemas, puede llamar al número de soporte configurado en la app.

---
**Fecha de corrección**: 2026-02-05
**Versión**: 1.0.0+1

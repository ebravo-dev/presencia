# App de alumnos

Aplicación Flutter de Presencia para Android e iOS.

## Configuración del backend

La app usa `https://dashboarduat.presenciauat.fit` de forma predeterminada. La
configuración de producción también está disponible en `env.production.json`:

```bash
flutter run --dart-define-from-file=env.production.json
flutter build apk --release --dart-define-from-file=env.production.json
```

Para apuntar a otro entorno, copia el ejemplo (el archivo local está ignorado
por Git), cambia `PRESENCIA_API_BASE_URL` y compila con ese archivo:

```bash
cp env.example.json env.local.json
flutter run --dart-define-from-file=env.local.json
```

No guardes contraseñas ni tokens en estos archivos: las variables Dart quedan
incluidas en el binario de la aplicación.

## Desarrollo

```bash
flutter pub get
flutter analyze
flutter test
```

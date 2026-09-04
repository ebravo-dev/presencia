# App de alumnos

Aplicación Flutter de Presencia para Android e iOS.

## Configuración del backend

La app usa `https://dashboarduat.presenciauat.fit` de forma predeterminada.
`env.production.json` contiene únicamente valores públicos; para una build que
envíe diagnósticos, crea el archivo local ignorado por Git e inyecta la clave de
ingesta del despliegue:

```bash
cp env.example.json env.local.json
# Edita PRESENCIA_LOG_INGESTION_KEY con el valor entregado por CI/CD.
flutter build apk --release --dart-define-from-file=env.local.json
```

Para apuntar a otro entorno, copia el ejemplo (el archivo local está ignorado
por Git), cambia `PRESENCIA_API_BASE_URL` y compila con ese archivo:

```bash
cp env.example.json env.local.json
flutter run --dart-define-from-file=env.local.json
```

No guardes contraseñas ni tokens de usuario en estos archivos. La clave de
ingesta queda incluida en el binario, por lo que sólo autoriza escritura y el
backend aplica rate limit y validación estricta; nunca permite leer logs.

## Desarrollo

```bash
flutter pub get
flutter analyze
flutter test
```

# 🎓 App Profesores Universidad

Una aplicación móvil Flutter diseñada para facilitar el control de asistencia tanto de estudiantes como de profesores universitarios mediante tecnología Bluetooth y beacons.

## 📋 Descripción del Proyecto

Esta aplicación permite a los profesores universitarios:

- **📝 Gestionar grupos y estudiantes**: Organizar clases y listas de alumnos
- **✅ Tomar asistencia de estudiantes**: Registro manual o automático de la asistencia de los alumnos
- **📍 Registrar asistencia automática del profesor**: Detección automática de presencia del profesor en el aula mediante beacons Bluetooth
- **📊 Generar reportes**: Estadísticas y reportes de asistencia para seguimiento académico

### 🎯 Características Principales

- **Detección de Beacons**: Utiliza Bluetooth Low Energy (BLE) para detectar automáticamente cuando el profesor está en el aula
- **Gestión Offline**: Funciona sin conexión a internet, sincronizando cuando esté disponible
- **Interfaz Intuitiva**: Diseño simple y funcional para uso académico
- **Reportes Detallados**: Generación de estadísticas de asistencia por grupo, estudiante y período

## 🏗️ Arquitectura del Proyecto

### Feature-First Architecture

Este proyecto utiliza una **arquitectura Feature-First** combinada con **Riverpod** como state manager. Esta decisión se basó en:

#### ¿Por qué Feature-First?

1. **Complejidad Técnica Media-Alta**: 
   - Integración con Bluetooth/Beacons
   - Manejo de permisos del sistema
   - Sincronización de datos offline/online

2. **Múltiples Features Interconectadas**:
   - Gestión de usuarios (profesores/estudiantes)
   - Control de asistencia
   - Detección de beacons
   - Generación de reportes

3. **Escalabilidad**: Permite agregar nuevas funcionalidades de manera organizada

4. **Mantenibilidad**: Código organizado por características de negocio

#### ¿Por qué Riverpod?

1. **Performance Superior**: Rebuilds más eficientes y menor uso de memoria
2. **Compile-time Safety**: Detección de errores en tiempo de compilación
3. **Testing Friendly**: Facilita las pruebas unitarias y de integración
4. **Modern Approach**: Es el sucesor oficial de Provider

### 📁 Estructura de Carpetas

```
lib/
├── main.dart
├── core/
│   ├── constants/         # Constantes globales
│   ├── permissions/       # Manejo de permisos
│   ├── utils/            # Utilidades compartidas
│   └── widgets/          # Widgets reutilizables
├── features/
│   ├── authentication/   # Login/logout de profesores
│   ├── groups/          # Gestión de grupos/clases
│   ├── students/        # Gestión de estudiantes
│   ├── attendance/      # Control de asistencia
│   ├── beacon_detection/ # Detección de beacons BLE
│   └── reports/         # Reportes y estadísticas
├── services/
│   ├── bluetooth_service.dart  # Servicio Bluetooth
│   ├── beacon_service.dart     # Manejo de beacons
│   ├── database_service.dart   # Base de datos local
│   └── sync_service.dart       # Sincronización
└── shared/
    ├── providers/       # Providers compartidos
    ├── models/         # Modelos de datos globales
    └── widgets/        # Componentes UI compartidos
```

## 🚀 Tecnologías Utilizadas

- **Framework**: Flutter 3.24+
- **State Management**: Riverpod 2.5+
- **Navigation**: Go Router
- **Local Database**: Hive/SQLite
- **Bluetooth**: Flutter Blue Plus
- **HTTP Client**: Dio
- **Code Generation**: Build Runner

## 📱 Requisitos del Sistema

- **Android**: API Level 21+ (Android 5.0)
- **iOS**: iOS 12.0+
- **Bluetooth**: BLE 4.0+ compatible
- **Permisos requeridos**: 
  - Bluetooth
  - Ubicación (para BLE en Android)
  - Almacenamiento

## 🛠️ Instalación y Configuración

### Prerrequisitos

```bash
flutter --version  # Flutter 3.24+
dart --version     # Dart 3.5+
```

### Pasos de instalación

1. **Clonar el repositorio**
```bash
git clone https://github.com/ebravo-dev/appprofesoresuniversidad.git
cd appprofesoresuniversidad
```

2. **Instalar dependencias**
```bash
flutter pub get
```

3. **Generar código (si es necesario)**
```bash
flutter packages pub run build_runner build
```

4. **Ejecutar la aplicación**
```bash
flutter run
```

## 🧪 Testing

```bash
# Ejecutar todas las pruebas
flutter test

# Ejecutar pruebas con coverage
flutter test --coverage

# Ejecutar pruebas de integración
flutter drive --target=test_driver/app.dart
```

## 📈 Roadmap

- [ ] Implementación básica de autenticación
- [ ] Gestión de grupos y estudiantes
- [ ] Integración con beacons Bluetooth
- [ ] Sistema de asistencia manual
- [ ] Sistema de asistencia automática por proximidad
- [ ] Generación de reportes
- [ ] Sincronización con servidor
- [ ] Notificaciones push
- [ ] Modo offline completo

## 🤝 Contribución

1. Fork el proyecto
2. Crea tu feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para más detalles.

## 📞 Contacto

**Email**: [ederjgb94@gmail.com]
**Nombre**: Eder Glz Bravo

---

**Nota**: Esta aplicación está en desarrollo activo. Las características y funcionalidades pueden cambiar durante el proceso de desarrollo.

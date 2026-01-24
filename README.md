# 🎓 Presencia

> **Sistema de Asistencia para Profesores de la UAT**

**Presencia** es una solución integral para automatizar y gestionar el control de asistencia de profesores en la Universidad Autónoma de Tamaulipas (UAT), facilitando el proceso tanto para los docentes como para la administración.

---

## 🚀 Características Principales

*   **⚡ Inicio de Sesión Simplificado**: Acceso rápido con credenciales institucionales (email y contraseña).
*   **🔄 Sincronización Inteligente**: Detección automática de periodos académicos y descarga de grupos desde el portal oficial de la UAT.
*   **📱 App Móvil Intuitiva (Flutter)**: Interfaz limpia y moderna para ver grupos y registrar asistencia.
*   **🛡️ Backend Robusto (Node.js + PostgreSQL)**: API segura, rápida y escalable con gestión de sesiones y scraping automatizado.
*   **🐳 Dockerizado**: Despliegue sencillo y reproducible con Docker Compose.

---

## 🛠️ Stack Tecnológico

### Backend API
*   **Runtime**: Node.js v20 (TypeScript)
*   **Framework**: Fastify
*   **Base de Datos**: PostgreSQL
*   **ORM**: Prisma
*   **Colas**: BullMQ + Redis
*   **Scraping**: Playwright (Chromium)
*   **Seguridad**: JWT + Encriptación RSA

### App Móvil
*   **Framework**: Flutter
*   **Gestión de Estado**: Riverpod
*   **Almacenamiento Local**: Hive / Shared Preferences

---

## 📦 Estructura del Proyecto

```
presencia/
├── app-profesor/       # Aplicación móvil Flutter
├── backend/            # API REST y Workers
└── docker-compose.yml  # Orquestación de contenedores (DB, Redis, API)
```

---

## ⚡ Comandos Rápidos (Desarrollo)

### Backend
```bash
cd backend
npm install
npm run dev
```

### App Móvil
```bash
cd app-profesor
flutter pub get
flutter run
```

### Servicios (Docker)
```bash
# Levantar solo Base de Datos y Redis
docker-compose up -d postgres redis
```

---

## 🚢 Despliegue (Producción)

El proyecto está configurado para desplegarse fácilmente usando **Docker Compose** (compatible con Dokploy, Portainer, etc.).

1.  Configurar variables de entorno (ver `dokploy_deploy_guide.md`).
2.  Ejecutar:
    ```bash
    docker-compose up -d
    ```

---

## 📝 Notas de Versión

**v1.0.0**
*   Renombrado de proyecto a "Presencia".
*   Simplificación del flujo de login (eliminado registro manual).
*   Soporte para detección automática de periodos académicos.
*   Optimización de Dockerfiles para despliegue en producción.

---

Hecho con ❤️ para la UAT.

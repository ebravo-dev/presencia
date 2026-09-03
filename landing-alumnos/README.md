# Landing para alumnos

Sitio estático independiente para presentar Presencia y resolver las dudas más
frecuentes de los alumnos. El contenedor sirve la misma página en `/` y en
`/soporte/alumnos/`.

## Construcción

Desde la raíz del repositorio:

```bash
docker build -t presencia-landing-alumnos landing-alumnos
```

El contenedor escucha en el puerto `8080` y expone la verificación de salud en
`/health/ready`. En Dokploy se puede asignar el dominio completo al servicio o
configurar la ruta `/soporte/alumnos`.

Para un despliegue con Dockerfile en Dokploy, usa `landing-alumnos` como
directorio de contexto y `Dockerfile` como ruta del archivo de construcción.

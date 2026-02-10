# Plan de Migración a Arquitectura Cloud-Native (NWFG Platform)

## 1. Visión General
Transformación de la plataforma NWFG desde procesos PM2 aislados hacia una arquitectura de microservicios orquestada con Docker y desplegada en Dokploy.

**Nombre del Proyecto**: `nwfg-platform`
**Repositorio**: Monorepo

## 2. Estructura de Directorios

La estructura objetivo es la siguiente:

```
/ (root)
├── docker-compose.yml       # Orquestación local (Windows dev)
├── .env.example             # Plantilla de variables
├── /services
│   ├── /server-rates        # API Node.js + GraphQL + WebSockets
│   │   ├── Dockerfile
│   │   ├── src/
│   │   └── package.json
│   ├── /user-auth           # API Autenticación
│   │   ├── Dockerfile
│   │   ├── src/
│   │   └── package.json
│   └── /frontend            # Next.js App
│       ├── Dockerfile
│       ├── src/
│       └── package.json
└── /infrastructure
    └── /mysql               # Scripts de inicialización y vistas
```

## 3. Estrategia de Ramas (GitFlow)

- **develop**:
  - Conectada a: `NWFG-Test` en Dokploy.
  - URL: `test.nwfg.net`.
  - Propósito: Pruebas feature-by-feature.
  - CI/CD: Despliegue automático al push.

- **main**:
  - Conectada a: `NWFG-Prod` en Dokploy.
  - URL: `www.nwfg.net`.
  - Propósito: Producción estable.
  - CI/CD: Despliegue automático tras Merge Request aprobado desde develop.

## 4. Stack Tecnológico

- **Backend**: Node.js, Apollo Server (GraphQL), WebSockets (precios en tiempo real).
- **Frontend**: Next.js.
- **Base de Datos**: MySQL 8.0 (Dockerizada en Dokploy).
- **Infraestructura**: Dokploy (SSL, Env Vars, Contenedores).

## 5. Reglas de Negocio Clave

1.  **Mapeo de Tarifas**: Uso de `rates_view` para normalizar `SPL` (Service Provider Names) a nombres estandarizados.
2.  **Arquitectura**: Implementación de **Clean Architecture** en servicios (Separación de capas: Dominio, Casos de Uso, Infraestructura/Adaptadores).

## 6. Pasos de Ejecución

1.  Refactorización de estructura de directorios actual a la nueva propuesta.
2.  Creación de Dockerfiles optimizados para cada servicio.
3.  Configuración de `docker-compose.yml` para desarrollo local transparente.
4.  Definición de scripts SQL iniciales en `/infrastructure/mysql`.
5.  Configuración de CI/CD en Dokploy (Documentación).

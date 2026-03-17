# 📚 NWFG Platform — Documentación Maestra

> **Versión:** 2.0 | **Estado:** 🚧 In Progress (Integración Frontend / Gamificación)
> **Última actualización:** Marzo 2026

Esta es la fuente de verdad para el proyecto NWFG. Cubre arquitectura, infraestructura, contratos de API, decisiones de diseño y runbook operativo. Empieza aquí antes de tocar cualquier archivo de código.

---

## 📑 Tabla de Contenido

1. [Visión General del Proyecto](#1-visión-general-del-proyecto)
2. [Arquitectura y Patrones](#2-arquitectura-y-patrones)
3. [Estructura de Directorios](#3-estructura-de-directorios)
4. [Microservicios — Detalle por Servicio](#4-microservicios--detalle-por-servicio)
5. [Base de Datos (MySQL)](#5-base-de-datos-mysql)
6. [Variables de Entorno](#6-variables-de-entorno)
7. [WebSockets & Real-Time (Contrato Frontend)](#7-websockets--real-time-contrato-frontend)
8. [Autenticación y RBAC](#8-autenticación-y-rbac)
9. [Infraestructura Docker](#9-infraestructura-docker)
10. [Servidor de Producción](#10-servidor-de-producción)
11. [MinIO — Object Storage](#11-minio--object-storage)
12. [Developer Runbook (Comandos del Día a Día)](#12-developer-runbook-comandos-del-día-a-día)
13. [Decision Log (ADRs)](#13-decision-log-adrs)
14. [Diagnóstico de Errores Comunes](#14-diagnóstico-de-errores-comunes)

---

## 1. Visión General del Proyecto

| Campo | Valor |
|---|---|
| **Nombre** | NWFG Platform |
| **Dominio** | Energy Rate Management (Gas & Electric) |
| **Frontend** | Next.js / React (repo separado) |
| **Backend** | Node.js — Apollo Federation + Express |
| **DB** | MySQL 8.0 |
| **Cache / Pub-Sub** | Redis (ioredis) |
| **Object Storage** | MinIO (S3-compatible) |
| **Infra local** | Docker Compose |
| **Infra producción** | Ubuntu Server + Dokploy + Nginx |
| **URL Producción** | `https://nwfg.net` |
| **Panel Admin** | `https://panel.nwfg.net` |

### Flujo de Datos de Alto Nivel

```
Browser / Next.js
      │
      │  HTTPS / WSS
      ▼
  Nginx (SSL Termination)
      │
      │  HTTP (interno)
      ▼
graphql-gateway :4000  ◄──── Único punto de entrada público
      │                       (Apollo Federation + WebSocket)
      ├──► users-service :4001   (GraphQL subgrafo)
      ├──► rates-service :4002   (GraphQL subgrafo)
      └──► upload-service :4005  (REST interno + Redis Pub/Sub)
                │
                ├──► MySQL :3306
                ├──► Redis :6379
                └──► MinIO :9000
```

> **Regla de Oro:** El Frontend NUNCA se conecta directamente a un microservicio. Todo pasa por el gateway en el puerto 4000.

---

## 2. Arquitectura y Patrones

### 2.1 Clean Architecture por Servicio

Cada microservicio sigue esta separación de capas (de afuera hacia adentro):

```
src/
├── graphql/          # Resolvers y Schema (punto de entrada GraphQL)
├── routes/           # Rutas Express internas (solo upload-service y scripts-service)
├── controllers/      # Orquestación de lógica asíncrona
├── models/           # Lógica de negocio pura + queries SQL directas
├── services/         # Integraciones externas (MinIO client, Excel parser, etc.)
├── middleware/       # Auth, logging, error handling
├── config/           # Conexión a DB, env vars
├── utils/            # Helpers reutilizables
└── validators/       # Validaciones de input (Zod / custom)
```

### 2.2 Apollo Federation v2 (Gateway-First)

- El **gateway** usa `IntrospectAndCompose` para construir el supergraph automáticamente consultando los schemas de los subgrafos en arranque.
- Polling cada **10 segundos** para detectar cambios de schema sin reiniciar.
- El gateway **inyecta el contexto del usuario** en cada subgrafo vía headers HTTP internos:

| Header | Valor |
|---|---|
| `x-user-id` | ID del usuario autenticado |
| `x-user-role` | Rol enum (ej: `NWFG_ADMIN`) |
| `x-user-email` | Email |
| `x-user-nombre` | Nombre completo |
| `x-user-centro-id` | ID del centro de ventas |

### 2.3 Comunicación Interna entre Servicios

- **No hay REST externo entre servicios.** Solo el gateway habla con los subgrafos via GraphQL.
- El `upload-service` es la excepción — tiene endpoints REST internos para recibir archivos Excel (multipart/form-data). Nginx enruta `/api/upload/` a él.
- **Redis Pub/Sub** es el bus de eventos para propagar notificaciones del `upload-service` al `graphql-gateway` sin acoplamiento directo.

---

## 3. Estructura de Directorios

```
nwfg_docker/
├── services/
│   ├── graphql-gateway/        # Orquestador. Apollo Gateway + WS + Suscripciones.
│   │   ├── server.js           # Punto de entrada único del gateway.
│   │   ├── pubsub.js           # Instancia compartida del PubSub de Apollo.
│   │   └── kafka.js            # (Legado, actualmente desactivado)
│   │
│   ├── users-service/          # Autenticación, RBAC, perfiles.
│   │   └── src/
│   │       ├── graphql/        # schema.js (typeDefs) + resolvers.js
│   │       ├── models/         # users.model.js — queries SQL de usuarios
│   │       ├── config/         # db.js — pool de conexión MySQL
│   │       ├── middleware/     # verifyToken.js
│   │       └── server.js       # Express + Apollo Server (subgrafo)
│   │
│   ├── rates-service/          # Tarifas, proveedores, phantom rates.
│   │   └── src/
│   │       ├── graphql/        # schema.js + resolvers.js
│   │       ├── models/         # rates.model.js, provider.model.js, etc.
│   │       ├── config/         # db.js
│   │       ├── utils/          # Helpers de formato de tarifas
│   │       ├── validators/     # Validadores de entrada
│   │       └── server.js
│   │
│   ├── upload-service/         # ETL: recibe Excel, parsea, inserta en DB via Redis.
│   │   └── src/
│   │       ├── controllers/    # upload.controller.js — orquesta el flujo ETL
│   │       ├── routes/         # upload.routes.js — endpoint multipart
│   │       ├── services/       # excel.service.js
│   │       ├── config/         # db.js (MySQL pool), redis.js, minio.js
│   │       └── middleware/     # Auth para el endpoint de upload
│   │
│   ├── scripts-service/        # Listado dinámico de guiones PDF desde MinIO.
│   └── subscription-service/   # (Experimental / separación futura de WS)
│
├── infrastructure/
│   └── mysql/
│       └── init.sql            # ⚠️ Schema inicial. Se ejecuta SOLO en la primera creación del volumen.
│
├── env/                        # Variables de entorno segregadas por servicio.
│   ├── rates.env
│   └── users.env
│
├── docker-compose.yml          # Definición de todos los contenedores locales.
│
├── verify_*.js                 # Scripts de verificación/testing end-to-end (Node en host).
├── setup_db.js / setup_db.sql  # Scripts de inicialización/migración manual de DB.
└── NWFG_DOCS.md                # Este archivo.
```

---

## 4. Microservicios — Detalle por Servicio

### 4.1 `graphql-gateway` (Puerto 4000)

**Responsabilidad:** Punto único de entrada. Agrega los subgrafos, maneja autenticación JWT, y gestiona las suscripciones WebSocket.

**Endpoints:**
- `POST /graphql` — Queries y Mutations (HTTP)
- `WS /graphql` — Suscripciones en tiempo real
- `GET /health` — Health check

**Flujo de Autenticación (Dual-Mode):**
1. Busca token en `Authorization: Bearer <token>` header.
2. Si no, busca en la cookie `nwfg_token=<valor>` (usado por Server Actions de Next.js / BFF pattern).
3. Verifica con `JWT_SECRET`.
4. Si no hay token válido y la query no es `login` ni `IntrospectionQuery`, devuelve `GraphQLError` con `code: UNAUTHENTICATED` y HTTP 401.

**Suscripciones disponibles en este gateway (definidas localmente, no en subgrafos):**

```graphql
type Subscription {
  rateUpdated: RateBulkNotification      # Notifca actualización masiva de tarifas
  uploadEvent: UploadEventPayload        # Eventos del flujo ETL (progress, errores)
  presenceTyping: PresencePayload        # Gamificación: agente está buscando
}
```

**Bridge Redis → GraphQL PubSub:**
El gateway tiene una conexión Redis en modo subscriber (`redisSub`). Escucha los canales:
- `UPLOAD_EVENTS` → publica internamente como `UPLOAD_EVENT`
- `presence:typing` → publica internamente como `PRESENCE_TYPING`

---

### 4.2 `users-service` (Puerto 4001)

**Responsabilidad:** Autenticación, gestión de perfiles, credenciales de portales de terceros.

**GraphQL Schema (Subgrafo):**

```graphql
# Enum granular de 5 valores para control de acceso multi-tenant
enum Role {
  NWFG_ADMIN | FIS_ADMIN | NWFG_AGENT | FIS_AGENT | QA_AGENT
}

type User @key(fields: "id") {
  id: ID!
  nombre: String
  email: String
  tenant: String        # "NWFG" | "FIS" — controla theming en el frontend
  centro: String        # Valor raw de DB para backwards compat
  role: Role
  status: String
  accounts: [TPVAccount]
  thirdPartyCredentials: [ThirdPartyCredential]  # Solo muestra isPasswordSet, nunca el password
}
```

**Lógica de Mapeo de Roles (DB → Enum):**

La DB almacena `rol` (string: `admin`, `agent`, `qa`) y `centro` (int: `1=NWFG`, `2=FIS`). El resolver combina ambos para derivar el enum granular:

| DB `rol` | DB `centro` | Enum resultante |
|---|---|---|
| `admin` | `1` (NWFG) | `NWFG_ADMIN` |
| `admin` | `2` (FIS) | `FIS_ADMIN` |
| `agent` | `1` (NWFG) | `NWFG_AGENT` |
| `agent` | `2` (FIS) | `FIS_AGENT` |
| `qa` | cualquiera | `QA_AGENT` |

**JWT Payload (lo que viaja en el token):**
```json
{
  "id": 42,
  "email": "agent@nwfg.com",
  "rol": "NWFG_AGENT",
  "nombre": "Juan Pérez",
  "centro": 1,
  "tenant": "NWFG"
}
```
> **Expiración:** 10 horas. (ADR-007 — cubre un turno laboral completo. Tech Debt: implementar Refresh Tokens en v3.)

**Mutations:**
- `login(email, password)` → `AuthResponse!` — Retorna token + objeto User
- `updateProviderCredential(providerId, portalUser, portalPass, tpvId)` → `User` — Upsert en `agent_provider_credentials`

**Tablas de DB utilizadas:**
- `nwfg_db.users` — Tabla principal de usuarios
- `user_data_tpv_staging.user_provider_account` — Cuentas TPV por agente
- `user_data_tpv_staging.proveedores` — Catálogo de proveedores
- `nwfg_db.agent_provider_credentials` — Bóveda de credenciales de portales (acceso solo para `isPasswordSet`, nunca el raw password)

---

### 4.3 `rates-service` (Puerto 4002)

**Responsabilidad:** Consulta, ingesta y gestión de tarifas de energía. Implementa el motor de "Phantom Rates".

**Conceptos Clave:**

- **Tarifas Normales (Grupo 1 / CleanSky):** Vienen de Excel. Tienen registros físicos en la tabla `rates`. La columna `attributes` (JSON) absorbe columnas impredecibles del Excel sin romper el schema SQL.

- **Phantom Rates (Grupo 2 / APGE):** Tarifas que NO tienen registro en DB. Son fabricadas al vuelo por el motor en `rates.model.js` usando la tabla `provider_configs`. El objeto resultado incluye `is_placeholder: true`. Garantizan presencia de mercado sin insertar datos.

**Tablas de DB utilizadas:**
- `nwfg_db.rates` — Tabla maestra de tarifas con columna `attributes` JSON
- `nwfg_db.utility_aliases` — Mapeo "Human-in-the-loop": nombre sucio del Excel → ID oficial de utility
- `nwfg_db.provider_configs` — Configuraciones para Phantom Rates (Grupo 2)
- `nwfg_db.providers` — Catálogo de proveedores

---

### 4.4 `upload-service` (Puerto 4005)

**Responsabilidad:** Motor ETL. Recibe un archivo Excel (multipart/form-data), lo audita en MinIO, lo parsea y dispara eventos Redis en cada etapa del proceso.

**Flujo ETL Completo:**

```
1. Recibe POST con Excel (multipart)
   │
2. Audita el raw file en MinIO → /audit/excels/{fecha}_{archivo}.xlsx
   │
3. Emite UPLOAD_STARTED a Redis canal UPLOAD_EVENTS
   │
4. Parsea el Excel (ExcelJS / SheetJS)
   │
5. Para cada fila:
   ├─ Intenta resolver utility name → utility_alias table
   ├─ Si NO encuentra: emite MISSING_ALIAS (scope: 'local', userId del uploader)
   │     El uploader debe resolver el alias en el panel admin.
   └─ Si sí encuentra: inserta registro en rates, emite UPLOAD_PROGRESS
   │
6. Al terminar: emite PARSE_COMPLETE / UPLOAD_COMPLETE (scope: 'global')
```

**Eventos Redis emitidos al canal `UPLOAD_EVENTS`:**

| Tipo de Evento | Scope | Quién lo ve en el FE |
|---|---|---|
| `UPLOAD_STARTED` | `global` | Todos |
| `UPLOAD_PROGRESS` | `global` | Todos |
| `PARSE_COMPLETE` | `global` | Todos |
| `UPLOAD_COMPLETE` | `global` | Todos |
| `MISSING_ALIAS` | `local` | Solo el uploader (FE filtra por `userId`) |

---

### 4.5 `scripts-service` (Puerto 4006 — actualmente comentado en compose)

**Responsabilidad:** Expone un endpoint que lista dinámicamente los PDFs de guiones de venta almacenados en MinIO, organizados por proveedor e idioma.

**Endpoint:** `GET /api/scripts?spl=<slug_proveedor>`

**Respuesta:** JSON anidado por idioma:
```json
{
  "english": ["inbound.pdf", "outbound.pdf"],
  "spanish": ["inbound.pdf"]
}
```

> El Frontend construye las URLs completas combinando la respuesta con el patrón:
> `https://files.nwfg.net/nwfg-frontend/guiones/{slug}/{idioma}/{estado}.pdf`

---

## 5. Base de Datos (MySQL)

### 5.1 Schema Principal (`nwfg_db`)

El schema se inicializa con `infrastructure/mysql/init.sql` únicamente cuando se crea el volumen por primera vez.

> ⚠️ **CRÍTICO:** Si cambias `init.sql`, debes hacer `docker-compose down -v` y `docker-compose up --build` para aplicarlo. Esto **borra todos los datos**.

```sql
-- Catálogo de proveedores de energía
CREATE TABLE providers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  logo_url VARCHAR(255),
  status ENUM('active', 'inactive') DEFAULT 'active'
);

-- Catálogo de utilities (distribuidoras)
CREATE TABLE utilities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,       -- Ej: "Consolidated Edison"
  market ENUM('Gas', 'Electric') NOT NULL,
  alias_match JSON                    -- Ej: ["ConEd", "Con Edison"]
);

-- Tabla maestra de tarifas
CREATE TABLE rates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  provider_id INT REFERENCES providers(id),
  utility_id INT REFERENCES utilities(id),
  commodity ENUM('Gas', 'Electric') NOT NULL,
  rate_value DECIMAL(10, 4) NOT NULL,
  unit VARCHAR(20) DEFAULT 'kWh',
  term INT,
  status ENUM('draft', 'active', 'expired') DEFAULT 'draft',
  attributes JSON,                    -- Columnas custom del Excel (para Grupo 1)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 5.2 Tablas en `user_data_tpv_staging` (DB separada)

| Tabla | Propósito |
|---|---|
| `proveedores` | Catálogo completo de proveedores (compartido con users-service) |
| `user_provider_account` | Cuentas TPV por agente (un agente puede tener cuenta en múltiples proveedores) |

### 5.3 Tablas adicionales (schema extendido)

| Tabla | Propósito |
|---|---|
| `utility_aliases` | Mapeo sucio→limpio para el ETL (Human-in-the-loop) |
| `provider_configs` | Configuración para generar Phantom Rates al vuelo |
| `agent_provider_credentials` | Bóveda de credenciales de portales de terceros por agente |
| `upload_logs` | Auditoría de cada archivo Excel procesado por el ETL |

**Schema `upload_logs`:**
```sql
CREATE TABLE IF NOT EXISTS upload_logs (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    user_id           INT NOT NULL,                   -- x-user-id del uploader (del JWT)
    original_filename VARCHAR(255) NOT NULL,
    minio_path        VARCHAR(500) NOT NULL,           -- Ej: audit/excels/2026-03-17_{sessionId}_file.xlsx
    file_size_bytes   INT,
    status            ENUM('processing', 'completed', 'failed', 'reverted') DEFAULT 'processing',
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

> **Flujo del status:** El registro se crea con `processing` al recibir el archivo. `processSession()` lo actualiza a `completed` al terminar o `failed` si la sesión expira o hay un error crítico. El `logId` viaja en Redis (clave `upload:{sessionId}:logId`, TTL 1h) para que el proceso async pueda recuperarlo.

---

## 6. Variables de Entorno

> **Práctica:** No usar `.env` en la raíz. Cada servicio tiene su propio archivo en `/env/`.

### Regla crítica para Docker:
Los contenedores **deben usar el nombre del host Docker** para comunicarse entre sí, NO `localhost`.

| Servicio | Host desde contendor | Puerto |
|---|---|---|
| MySQL | `mysql` | `3306` |
| Redis | `redis` | `6379` |
| MinIO API | `minio` | `9000` |
| users-service | `users-service` | `4001` |
| rates-service | `rates-service` | `4002` |

### `env/rates.env`
```env
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root_password
DB_NAME=nwfg_db
REDIS_HOST=redis
REDIS_PORT=6379
PORT=4002
```

### `env/users.env`
```env
DB_HOST=mysql
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root_password
DB_NAME=nwfg_db
JWT_SECRET=NwfgMasterSecret2025!!
PORT=4001
```

### Variables del Gateway (en docker-compose.yml)
```env
PORT=4000
USERS_SERVICE_URL=http://users-service:4001/graphql
RATES_SERVICE_URL=http://rates-service:4002/graphql
JWT_SECRET=NwfgMasterSecret2025!!
FRONTEND_ORIGIN=http://localhost:3000   # En prod: https://nwfg.net
```

### Variables del Upload Service (`env/upload.env`)
```env
PORT=4005
RATES_SERVICE_URL=http://rates-service:4002
USERS_SERVICE_URL=http://users-service:4001
JWT_SECRET=NwfgMasterSecret2025!!
NODE_ENV=development

# MySQL
DB_HOST=mysql
DB_USER=root
DB_PASSWORD=root_password
DB_NAME=nwfg_db

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# MinIO (en prod: MINIO_ENDPOINT=files.nwfg.net, MINIO_PORT=443, MINIO_USE_SSL=true)
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=nwfg-frontend
```

---

## 7. WebSockets & Real-Time (Contrato Frontend)

El Frontend se conecta **una sola vez** al gateway en `ws://localhost:4000/graphql` (o `wss://nwfg.net/graphql` en prod) y escucha la suscripción.

### Resiliencia del cliente WS (`ApolloWrapper.tsx`)

La conexión WS está configurada para **nunca rendirse** si hay una caída de red o reinicio del servidor:

| Config | Valor | Por qué |
|---|---|---|
| `keepAlive` | 10 000 ms | Detecta drops silenciosos de Nginx / balanceadores |
| `retryAttempts` | `Infinity` | Reintenta indefinidamente |
| `retryWait` | Backoff exponencial 1s→2s→4s→…→30s | No satura el servidor durante un deploy de Dokploy |
| `shouldRetry` | `() => true` | No se rinde nunca, sin importar el código de cierre |

> Los eventos de conexión/cierre se loguean en la consola del browser: `[WS] ✅ Conectado` / `[WS] ⚠️ Conexión cerrada.`


```graphql
subscription {
  uploadEvent {
    type
    sessionId
    userId
    scope
    filename
    dirtyName
    processed
    total
    percent
    timestamp
  }
}
```

### Lógica de enrutamiento en el Frontend según el evento:

```
uploadEvent recibido
      │
      ├── type: "PRESENCE_TYPING" (scope: none)
      │    └── Muestra burbuja flotante del avatar junto al buscador.
      │        Payload: { userId, userName, center, avatar, action: "typing"|"stopped" }
      │
      ├── type: "UPLOAD_STARTED" | "UPLOAD_PROGRESS" | "PARSE_COMPLETE" (scope: "global")
      │    └── Dispara/actualiza el Sileo Toast en estado "Promise".
      │        Visible para TODOS los usuarios conectados.
      │
      ├── type: "UPLOAD_COMPLETE" (scope: "global")
      │    └── Resuelve el Sileo Toast con éxito.
      │
      └── type: "MISSING_ALIAS" (scope: "local")
           └── IGNORAR si currentUser.id !== event.userId
               Si coincide: mostrar UI de resolución en tabla del panel Admin.
               NO disparar un Sileo global.
```

### Presence (Gamificación — Zero DB)

Para emitir presencia, el Frontend llama la mutation vía WebSocket:

```graphql
mutation {
  setPresence(action: "typing")  # o "stopped"
}
```

El gateway construye el payload con el contexto del usuario JWT y lo publica en Redis `presence:typing`. **Nunca toca MySQL.**

---

## 8. Autenticación y RBAC

### Flujo de Login

```
1. FE → mutation login(email, password) → Gateway
2. Gateway → users-service resolver
3. users-service verifica password, genera JWT
4. JWT se retorna al FE
5. FE guarda el token en cookie HttpOnly (nwfg_token) vía Next.js Server Action
6. Todas las siguientes peticiones: cookie se envía automáticamente
7. Gateway extrae token de cookie o header Authorization
```

### Roles y Permisos

| Rol | Centro | Permisos |
|---|---|---|
| `NWFG_ADMIN` | NWFG (centro=1) | Acceso total. Puede subir Excel, gestionar alias, ver todos los agentes. |
| `FIS_ADMIN` | FIS (centro=2) | Mismo acceso total pero dentro del tenant FIS. |
| `NWFG_AGENT` | NWFG (centro=1) | Solo lectura de tarifas. Ve su propio perfil y credenciales. |
| `FIS_AGENT` | FIS (centro=2) | Igual que NWFG_AGENT pero tenant FIS. |
| `QA_AGENT` | Cualquiera | Acceso de testing / observabilidad. |

### Seguridad de Credenciales de Terceros

El campo `thirdPartyCredentials` en el schema de usuarios **nunca expone el password crudo**. Solo devuelve `isPasswordSet: Boolean` para que el frontend sepa si hay credencial registrada sin filtrar información sensible.

---

## 9. Infraestructura Docker

### Contenedores (docker-compose.yml local)

| Contenedor | Imagen | Puerto host | Red interna |
|---|---|---|---|
| `redis_cache` | `redis:alpine` | `6379` | `redis:6379` |
| `mysql_db` | `mysql:8.0` | `3306` | `mysql:3306` |
| `rates-service` | Build local | `4002` | `rates-service:4002` |
| `users-service` | Build local | `4001` | `users-service:4001` |
| `graphql-gateway` | Build local | `4000` | `graphql-gateway:4000` |
| `upload-service` | Build local | `4005` | `upload-service:4005` |

### Red Docker

Todos los contenedores comparten la red bridge `nwfg-network`. Los contenedores se descubren entre sí por **nombre de servicio** (no por IP ni `localhost`).

### Volúmenes

- `mysql_data` — Persistencia de MySQL. Este volumen sobrevive a `docker-compose down`. Solo se destruye con `docker-compose down -v`.

### Hot Reload (Desarrollo)

Los servicios montan sus directorios `src/` como volúmenes:
```yaml
volumes:
  - ./services/rates-service/src:/app/src
```
Esto permite editar código sin reconstruir la imagen Docker, siempre que el proceso Node tenga hot reload (nodemon o similar).

---

## 10. Servidor de Producción

### Topología de Red

```
Internet
   │
   ▼
Firewall Fortinet (bloquea puertos no whitelisted, incluido puerto 80 para certbot)
   │
   ▼
Ubuntu Server — IP Pública: 190.84.214.74
                IP Privada: 172.26.12.67
   │
   ▼
Nginx (Puerto 443 SSL Termination)
   │
   ├──► Puerto 3000: Frontend (Next.js vía Dokploy)
   ├──► Puerto 3001: upload-service
   ├──► Puerto 3002: rates-service
   ├──► Puerto 3003: auth-service (legacy)
   ├──► Puerto 3004: users-service
   ├──► Puerto 9000: Dokploy panel
   ├──► Puerto 9005: MinIO API
   └──► Puerto 9006: MinIO Console
```

> **Nota:** En producción los servicios corren en puertos 300x (Dokploy los mapea). **En local** corren en puertos 400x (docker-compose.yml).

### Dominios y SSL

| Dominio | Apunta a |
|---|---|
| `nwfg.net` / `www.nwfg.net` | Aplicación principal + APIs |
| `panel.nwfg.net` | Panel Dokploy |
| `test.nwfg.net` | Entorno de pruebas del frontend |
| `files.nwfg.net` | MinIO API (acceso a PDFs y auditorías) |
| `s3.nwfg.net` | MinIO Console (GUI administrativa) |

**Certificados SSL:** Let's Encrypt, gestionados con **DNS-01 Challenge** (certbot manual + registro TXT en Cloudflare) porque el Fortinet bloquea el puerto 80.

**Vencimiento actual:** 5 de mayo de 2026.

**Comando de renovación manual:**
```bash
sudo certbot -d nwfg.net -d www.nwfg.net -d panel.nwfg.net -d test.nwfg.net \
  --manual --preferred-challenges dns certonly
```
> ⚠️ La renovación NO es automática. Requiere crear nuevos registros TXT en Cloudflare manualmente cada vez.

### Configuración Nginx (Resumen de bloques)

```nginx
# nwfg.net — Aplicación principal
server {
    listen 443 ssl;
    server_name nwfg.net www.nwfg.net;
    client_max_body_size 50M;   # Para subida de Excels

    location /api/upload/  → proxy_pass http://127.0.0.1:3001;
    location /api/auth/    → proxy_pass http://127.0.0.1:3003;
    location /api/rates/   → proxy_pass http://127.0.0.1:3002;
    location /api/scripts  → proxy_pass http://127.0.0.1:3002;
    location /api/users    → rewrite → proxy_pass http://127.0.0.1:3004;
    location /             → proxy_pass http://127.0.0.1:3000;  (Frontend)
}

# panel.nwfg.net — Dokploy (con timeouts extendidos para deploys pesados)
server {
    listen 443 ssl;
    server_name panel.nwfg.net;
    location / → proxy_pass http://127.0.0.1:9000;
    proxy_connect_timeout 300s;
    proxy_send_timeout 300s;
    proxy_read_timeout 300s;
}

# files.nwfg.net / s3.nwfg.net — MinIO
server {
    listen 443 ssl;
    server_name files.nwfg.net s3.nwfg.net;
    # files → puerto 9005 (API), s3 → puerto 9006 (Console)
}
```

### Dokploy (Panel de Despliegue)

Dokploy corre como su propio Docker Compose stack en `/etc/dokploy/`:

```yaml
services:
  dokploy:          # Puerto 9000 en host (accedido por Nginx)
  dokploy-postgres: # Base de datos interna de Dokploy
  dokploy-redis:    # Redis interno de Dokploy (separado del Redis de NWFG)
```

Al crear una nueva App en Dokploy, mapear al puerto host que ya esté configurado en el bloque `location` de Nginx.

---

## 11. MinIO — Object Storage

### Configuración

```yaml
# docker-compose de MinIO en ~/stack/projects/minio-storage/
environment:
  MINIO_ROOT_USER: minioadmin
  MINIO_ROOT_PASSWORD: minioadmin
  MINIO_SERVER_URL: https://files.nwfg.net
  MINIO_BROWSER_REDIRECT_URL: https://s3.nwfg.net
ports:
  - "127.0.0.1:9005:9000"  # API
  - "127.0.0.1:9006:9001"  # Console
extra_hosts:
  # HAIRPINNING: Fuerza resolución a IP privada para evitar salir al firewall
  - "files.nwfg.net:172.26.12.67"
  - "s3.nwfg.net:172.26.12.67"
```

### Por qué Hairpinning

El servidor está detrás de un Fortinet que bloquea tráfico saliente no whitelisted. Si MinIO intenta validar su `MINIO_SERVER_URL` resolviendo `files.nwfg.net` a la IP pública (`190.84.214.74`), el tráfico sale al Fortinet y es bloqueado. Con `extra_hosts`, el tráfico resuelve a la IP privada y se queda dentro de la red del servidor.

### Bucket Principal: `nwfg-frontend`

**Política:** Lectura pública (download), sin listado de contenidos.

```bash
# Configurar alias mc (usar puerto interno para no pasar por firewall)
mc alias set local http://127.0.0.1:9005 minioadmin minioadmin

# Aplicar política de lectura pública
mc anonymous set download local/nwfg-frontend
```

### Estructura de Almacenamiento

```
nwfg-frontend/
├── guiones/
│   ├── {slug_proveedor}/         # Ej: ie/, cs/, apge/
│   │   ├── english/
│   │   │   └── {estado}.pdf      # Ej: dc.pdf, nj.pdf
│   │   └── spanish/
│   │       └── {estado}.pdf
└── audit/
    └── excels/
        └── {fecha}_{archivo}.xlsx  # Auditoría del raw Excel antes de procesar
```

**URL de acceso público a un guión:**
```
https://files.nwfg.net/nwfg-frontend/guiones/{slug}/{idioma}/{estado}.pdf
```

### Comandos útiles mc

```bash
# Listar contenido de una carpeta
mc ls local/nwfg-frontend/guiones/cs/

# Copiar archivos entre idiomas
mc cp local/nwfg-frontend/guiones/cs/spanish/inbound.pdf \
       local/nwfg-frontend/guiones/cs/english/inbound.pdf

# Ver política actual
mc anonymous get local/nwfg-frontend
```

---

## 12. Developer Runbook (Comandos del Día a Día)

### Entorno Local (Docker)

```powershell
# ⭐ ARRANQUE NORMAL (sin perder datos)
docker-compose up -d

# 🔨 ARRANQUE CON REBUILD (después de cambiar código en Dockerfile o package.json)
docker-compose up -d --build

# ☢️ MASTER RESET — BORRA TODOS LOS DATOS (usar si cambias init.sql)
docker-compose down -v
docker-compose up -d --build

# 📋 VER LOGS EN TIEMPO REAL
docker-compose logs -f graphql-gateway upload-service rates-service

# Ver logs de un solo servicio
docker-compose logs -f users-service

# 🔄 REINICIAR UN SOLO SERVICIO (sin afectar otros)
docker-compose restart users-service

# 📊 VER ESTADO DE TODOS LOS CONTENEDORES
docker ps
```

### Scripts de Verificación (Node en host)

Estos scripts validan features sin necesitar el Frontend. Requieren que los contenedores estén corriendo.

```powershell
# Simula subida de Excel completa (alias, ETL, Sileo Toast)
node verify_etl.js

# Valida Phantom Rates (Grupo 2 / APGE)
node verify_phantom.js

# Verifica flujo de autenticación end-to-end
node verify_e2e.js

# Verifica RBAC (roles y permisos)
node verify_rbac.js

# Verifica WebSockets y suscripciones en tiempo real
node verify_realtime.js

# Verifica credenciales de agentes
node verify_credentials.js
```

### Endpoints de Conexión (Desarrollo Local)

| Servicio | URL |
|---|---|
| GraphQL Gateway (API + WS) | `http://localhost:4000/graphql` |
| GraphQL Playground | `http://localhost:4000/graphql` (browser) |
| MySQL | Host: `localhost`, Puerto: `3306`, User: `root`, Pass: `root_password`, DB: `nwfg_db` |
| Redis | `localhost:6379` |
| MinIO API (si corre local) | `http://localhost:9005` |

---

## 13. Decision Log (ADRs)

### ADR-001: Backend Migration & Database Reset (Feb 10, 2026)

- **Contexto:** Migración a Docker enfrentó credenciales cacheadas y código residual de versión anterior.
- **Decisión:** Master Reset con `down -v` + forzar path correcto `src/server.js` en los Dockerfiles.
- **Resultado:** Backend estable y conexiones limpias.

### ADR-002: GraphQL-First Architecture

- **Contexto:** El sistema original mezclaba REST y GraphQL, dificultando la orquestación.
- **Decisión:** Gateway centralizado. El Frontend es 100% GraphQL. Todo fluye por `POST /graphql` y `WS /graphql`. Los microservicios solo exponen REST internamente cuando es estrictamente necesario entre servicios.

### ADR-003: Phantom Rates & columna `attributes` JSON (Feb 19, 2026)

- **Contexto:** Dos grupos de proveedores con formatos de Excel incompatibles: CleanSky (masivo/estándar) vs APGE (manual/no-estándar). Se necesitaba manejar columnas impredecibles sin romper el schema SQL normalizado.
- **Decisión:**
  1. Columna `attributes` (JSON) en la tabla `rates` para absorber data extra de Excels de Grupo 1.
  2. Sub-motor en `rates.model.js` + tabla `provider_configs` para fabricar objetos Rate con `is_placeholder: true` interceptados al vuelo para el Grupo 2.

### ADR-004: Event-Driven ETL & Gamificación (Feb 20, 2026)

- **Contexto:** El UX de subida de Excel no podía ser un spinner ciego. Se requería feedback local (errores de alias para el uploader) y global (notificaciones tipo Sileo Toast para todos).
- **Decisión:**
  1. Redis Pub/Sub como bus de eventos desde `upload-service` con `userId` y `scope` en cada payload.
  2. MinIO para auditoría del raw Excel antes de procesamiento.
  3. Mutación `setPresence` en el Gateway para gamificación de "typing" — pura RAM, **cero MySQL**, para evitar cuellos de botella.

### ADR-005: JWT Dual-Mode Extraction (Gateway)

- **Contexto:** El frontend Next.js usa Server Actions que lanzan peticiones desde el servidor. En ese contexto, no pueden poner el token en headers de manera sencilla, pero sí pueden usar cookies HttpOnly.
- **Decisión:** El gateway extrae el token de dos fuentes con prioridad: (1) `Authorization: Bearer` header, (2) cookie `nwfg_token`. Esto permite tanto el uso desde el browser (Apollo Client) como desde Server Actions (BFF pattern).
- **Nota de implementación WS:** La cookie `nwfg_token` es `HttpOnly`, por lo que `document.cookie` en el browser no puede leerla. El WebSocket NO usa `connectionParams` para autenticarse — el browser envía la cookie automáticamente en el HTTP upgrade handshake, y el gateway la lee server-side. `connectionParams` en `ApolloWrapper.tsx` es un stub vacío intencionalmente.

### ADR-007: Estrategia de Sesión B2B — JWT 10h (Mar 9, 2026)

- **Contexto:** Los agentes usan la plataforma en turnos de 8h. Con JWT de 2h, el WebSocket (que relee el token en cada reconexión) fallaría a mitad del turno si el cliente WS se desconectaba temporalmente. Implementar Refresh Tokens complica la arquitectura innecesariamente para un sistema interno detrás de Fortinet.
- **Decisión:** Extender `expiresIn` de `2h` a `10h` en `users-service/resolvers.js`. El cliente WS en `ApolloWrapper.tsx` complementa con `retryAttempts: Infinity` + backoff exponencial para sobrevivir caídas de red y redeploys.
- **Trade-off asumido:** Un JWT de 10h no se puede revocar remotamente hasta que expire. Aceptable en red corporativa interna (Fortinet + VPN). **Tech Debt:** Si se expone a usuarios externos, implementar Refresh Tokens.

### ADR-006: Hairpinning DNS para MinIO en Producción

- **Contexto:** El servidor de producción opera tras un Fortinet que bloquea tráfico saliente no whitelisted. MinIO necesita resolver su propia URL (`files.nwfg.net`) para validar uploads. Resolverla a la IP pública haría que el tráfico saliese al firewall y fuera bloqueado.
- **Decisión:** Usar `extra_hosts` en el docker-compose de MinIO para mapear `files.nwfg.net` y `s3.nwfg.net` a la **IP privada** del servidor (`172.26.12.67`). El tráfico nunca sale a internet.

---

## 14. Diagnóstico de Errores Comunes

| Error | Causa | Solución |
|---|---|---|
| `502 Bad Gateway` (Nginx) | El servicio en el puerto destino no está corriendo. | `docker ps` para verificar. `docker-compose up -d` si está caído. |
| `504 Gateway Timeout` (Nginx) | El panel.nwfg.net timeout durante un deploy largo. | Ya resuelto: timeouts de 300s configurados en el bloque Nginx de Dokploy. |
| `No autenticado` (GraphQL) | Token expirado, inválido o ausente. La cookie `nwfg_token` no viaja. | Verificar que el frontend envíe `credentials: 'include'` en Apollo Client. Verificar CORS. |
| `MISSING_ALIAS` en upload | El Excel tiene un nombre de utility que no está en `utility_aliases`. | El uploader debe resolver el alias desde el panel admin. El evento es `scope: local`. |
| `AccessDenied` (XML) en MinIO | El bucket no tiene política pública. | `mc anonymous set download local/nwfg-frontend` |
| `Could not get the public IP` en Dokploy logs | Fortinet bloquea la petición de autodetección de IP de Dokploy. | Error benigno, ignorar. No afecta el funcionamiento. |
| `NOTICE: identifier will be truncated` en PostgreSQL | Nombres de tablas de Dokploy muy largos. | Normal en la inicialización. No indica pérdida de datos. |
| Conexión MySQL falla desde contenedor | Se está usando `localhost` en lugar del hostname Docker. | Cambiar a `mysql` en las variables de entorno del contenedor. |
| Schema nuevo no aplicado después de `up --build` | El volumen `mysql_data` ya existe (init.sql solo corre si no hay datos). | `docker-compose down -v && docker-compose up -d --build` |

### Comandos de Mantenimiento del Servidor

```bash
# Nginx
sudo nginx -t                          # Validar sintaxis de configuración
sudo systemctl reload nginx            # Aplicar cambios sin downtime

# Dokploy
sudo docker logs -f dokploy            # Monitorear en tiempo real
sudo docker-compose restart            # Reiniciar stack completo de Dokploy

# SSL / DNS
dig +short TXT _acme-challenge.nwfg.net  # Verificar registro TXT de Certbot

# Docker permisos
sudo chmod 666 /var/run/docker.sock    # Dar acceso al socket de Docker

# Limpiar logs del contenedor dokploy
sudo truncate -s 0 $(docker inspect --format='{{.LogPath}}' dokploy)
```

---

## 15. Usuarios del Sistema (`user_data_tpv_staging.usuarios`)

> **Consultado:** Marzo 2026. Fuente: `user_data_tpv_staging.usuarios` en el contenedor `mysql_db`.
> El rol granular (columna **Rol Enum**) es derivado en runtime por el resolver combinando `rol` (DB) + `centro` (DB) según la lógica del `users-service` (ver sección 4.2).

| ID | Nombre | Username | Password | Email | Rol (DB) | Centro (DB) | Rol Enum (GraphQL) | Tenant | Status |
|---|---|---|---|---|---|---|---|---|---|
| `5` | Brian | `brian` | `Gabriela19@` | `brian@nwfg.com` | `admin` | `1` | `NWFG_ADMIN` | `NWFG` | `active` |
| `6` | FIS Agent | `fis.agent` | `fis` | `fis.agent@nwfg.com` | `agent` | `2` | `FIS_AGENT` | `FIS` | `active` |
| `7` | NWFG Agent | `nwfg.agent` | `nwfg` | `nwfg.agent@nwfg.com` | `agent` | `1` | `NWFG_AGENT` | `NWFG` | `active` |

### Detalle de Permisos por Usuario

| Usuario | Puede hacer ETL upload | Ve todas las tarifas | Admin de alias | Tenant |
|---|---|---|---|---|
| **Brian** (`NWFG_ADMIN`) | ✅ | ✅ | ✅ | NWFG |
| **FIS Agent** (`FIS_AGENT`) | ❌ | ✅ (solo lectura) | ❌ | FIS |
| **NWFG Agent** (`NWFG_AGENT`) | ❌ | ✅ (solo lectura) | ❌ | NWFG |

> **Credenciales de acceso local/dev:** Password en plain text en la DB (ver ADR pendiente: hashear passwords, Tech Debt).
> Para login: `mutation login(email: "...", password: "...")` en `http://localhost:4000/graphql`.

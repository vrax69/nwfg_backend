# Resumen de Migración al GraphQL Gateway con Apollo Federation

## 📋 Visión General

Este documento describe la implementación del **GraphQL Gateway** que unifica todos los servicios de la plataforma NWFG usando **Apollo Federation**. Esta arquitectura transforma los servicios REST independientes en una API GraphQL federada, proporcionando un único punto de entrada para el frontend.

---

## 🎯 Objetivos de la Arquitectura

### 1. **Centralización del Acceso**
- **Antes**: El frontend tenía que hacer múltiples llamadas a diferentes puertos (4001, 4002, 4005, etc.)
- **Después**: Un único endpoint GraphQL en el puerto 4000 que orquesta todas las peticiones

### 2. **Seguridad Unificada**
- El Gateway valida el JWT una sola vez y lo propaga a los subgrafos
- Eliminación de validaciones redundantes en cada servicio

### 3. **Eficiencia en Consultas**
- Posibilidad de obtener datos de múltiples servicios en una sola query GraphQL
- Ejemplo: Obtener el Plan (rates-service) y el Script asociado (scripts-service) en una sola petición

### 4. **Escalabilidad**
- Arquitectura preparada para agregar nuevos servicios como subgrafos
- Cada servicio mantiene su independencia pero se integra al ecosistema

---

## 🏗️ Arquitectura Implementada

### Componentes Principales

```
┌─────────────────┐
│  Frontend App   │
└────────┬────────┘
         │ GraphQL (puerto 4000)
         ▼
┌─────────────────┐
│ GraphQL Gateway │  ← Orquestador principal
│  (Apollo Fed)   │
└────────┬────────┘
         │
    ┌────┴────┬──────────┬──────────┐
    ▼         ▼          ▼          ▼
┌────────┐ ┌──────┐  ┌────────┐  ┌────────┐
│Scripts │ │Rates │  │ Users  │  │ Upload │
│Service │ │Service│  │Service │  │Service │
│(4006)  │ │(4002)│  │ (4001) │  │ (4005) │
└────────┘ └──────┘  └────────┘  └────────┘
```

---

## 📁 Estructura de Archivos Creados/Modificados

### 1. **GraphQL Gateway** (`services/graphql-gateway/`)

#### `package.json`
- Dependencias principales:
  - `@apollo/gateway`: Para la federación de subgrafos
  - `@apollo/server`: Servidor Apollo moderno
  - `express`: Framework web

#### `server.js`
- Configuración del Gateway usando `ApolloGateway` con `IntrospectAndCompose`
- Polling automático cada 10 segundos para detectar cambios en los esquemas
- Context middleware que propaga el JWT a los subgrafos
- Endpoint de salud en `/health`

**Características clave:**
```javascript
const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
      {
        name: 'scripts',
        url: 'http://scripts-service:4006/graphql',
      },
      // Más subgrafos se agregarán aquí
    ],
    pollIntervalInMs: 10000,
  }),
});
```

#### `Dockerfile`
- Imagen base: `node:18-alpine`
- Puerto expuesto: 4000

---

### 2. **Scripts Service** (Actualizado para Federación)

#### `package.json` (Actualizado)
- Agregadas dependencias:
  - `@apollo/subgraph`: Para crear subgrafos federados
  - `@apollo/server`: Servidor Apollo
  - `graphql-tag`: Para parsear schemas GraphQL

#### `server.js` (Creado)
- Configuración como subgrafo federado usando `buildSubgraphSchema`
- Endpoint GraphQL en `/graphql`
- Introspection habilitada para que el Gateway pueda leer el esquema
- Context que recibe y propaga el token JWT

**Transformación clave:**
```javascript
// Antes: Servidor GraphQL independiente
// Después: Subgrafo federado
const schema = buildSubgraphSchema({ typeDefs, resolvers });
```

#### `src/graphql/schema.js` (Actualizado)
- Cambio de `apollo-server` a `graphql-tag` para compatibilidad con Federation
- Schema GraphQL con tipos, queries, mutations y subscriptions

#### `src/graphql/resolvers.js` (Actualizado)
- Resolvers actualizados para importar correctamente `masterPool`
- Integración con `SectionsModel` para mutations
- Implementación de `reorderSections` mutation

#### `src/config/db.js` (Creado)
- Pool de conexiones MySQL configurado
- Función de prueba de conexión
- Variables de entorno para configuración flexible

#### `src/models/sections.model.js` (Actualizado)
- Exportación correcta del módulo
- Importación de `masterPool` desde config

---

### 3. **Docker Compose** (`docker-compose.yml`)

#### Servicios Agregados:

**scripts-service:**
```yaml
scripts-service:
  build: ./services/scripts-service
  container_name: scripts-service
  ports:
    - "4006:4006"
  env_file: ./env/scripts.env
  depends_on:
    - redis
  networks:
    - nwfg-network
```

**graphql-gateway:**
```yaml
graphql-gateway:
  build: ./services/graphql-gateway
  container_name: graphql-gateway
  ports:
    - "4000:4000"
  env_file: ./env/gateway.env
  depends_on:
    - scripts-service
  networks:
    - nwfg-network
```

#### Red Docker:
- Creada red `nwfg-network` (bridge) para comunicación entre servicios
- Todos los servicios ahora están en la misma red

---

### 4. **Archivos de Configuración** (`env/`)

#### `scripts.env` (Creado)
```env
PORT=4006
MASTER_DB_HOST=172.26.12.67
MASTER_DB_PORT=3306
MASTER_DB_USER=admin
MASTER_DB_PASSWORD=Usuario19.
MASTER_DB_NAME=Nwfg_master
JWT_SECRET=NwfgMasterSecret2025!!
KAFKA_OFF=true
KAFKA_CLIENT_ID=scripts-service
KAFKA_BROKERS=redpanda:9092
```

#### `gateway.env` (Actualizado)
```env
PORT=4000
NODE_ENV=development
SCRIPTS_SERVICE_URL=http://scripts-service:4006/graphql
# URLs para futuros subgrafos comentadas
```

---

## 🔄 Flujo de Datos

### Ejemplo: Consulta al Gateway

1. **Frontend** hace una query GraphQL al Gateway (puerto 4000):
```graphql
query {
  getTeleprompter(provider_id: 1, state: "PA", commodity: Electric) {
    section_name
    section_text
    section_order
  }
}
```

2. **Gateway** recibe la query y:
   - Valida el JWT (si está presente)
   - Identifica que la query pertenece al subgrafo `scripts`
   - Envía la query al `scripts-service` (puerto 4006) con el contexto

3. **Scripts Service** procesa la query:
   - Usa el contexto (token) para autenticación si es necesario
   - Ejecuta el resolver `getTeleprompter`
   - Consulta la base de datos
   - Retorna los datos

4. **Gateway** recibe la respuesta y la retorna al frontend

---

## 🚀 Beneficios de esta Arquitectura

### 1. **Para el Frontend**
- ✅ Un solo endpoint para todas las operaciones
- ✅ Queries complejas que combinan datos de múltiples servicios
- ✅ Type safety con GraphQL
- ✅ Documentación automática del schema

### 2. **Para el Backend**
- ✅ Servicios independientes y desacoplados
- ✅ Fácil agregar nuevos servicios como subgrafos
- ✅ Autenticación centralizada
- ✅ Monitoreo y logging unificado en el Gateway

### 3. **Para el Equipo**
- ✅ Desarrollo paralelo de servicios
- ✅ Testing independiente de cada subgrafo
- ✅ Deployment independiente
- ✅ Escalabilidad horizontal

---

## 📊 Plan de Migración Futuro

### Fase 1: ✅ Completada
- [x] GraphQL Gateway creado
- [x] Scripts-service migrado a subgrafo federado
- [x] Docker Compose configurado
- [x] Red Docker creada

### Fase 2: Pendiente
- [ ] Migrar `rates-service` a GraphQL (actualmente REST)
  - Crear schema GraphQL para rates, aliases, providers
  - Wrappear endpoints REST existentes
  - Agregar como subgrafo al Gateway

### Fase 3: Pendiente
- [ ] Migrar `users-service` a GraphQL
  - Schema para usuarios y autenticación
  - Integración con el sistema de roles
  - Agregar como subgrafo

### Fase 4: Pendiente
- [ ] `upload-service` como proxy REST
  - Mantener REST para uploads de archivos (mejor para binarios)
  - Gateway actúa como proxy/load balancer

---

## 🔧 Comandos Útiles

### Construir y levantar servicios
```bash
docker-compose up --build
```

### Ver logs del Gateway
```bash
docker-compose logs -f graphql-gateway
```

### Ver logs del Scripts Service
```bash
docker-compose logs -f scripts-service
```

### Probar el Gateway
```bash
# Health check
curl http://localhost:4000/health

# GraphQL query (usando curl)
curl -X POST http://localhost:4000/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __schema { types { name } } }"}'
```

---

## 🎓 Conceptos Clave

### Apollo Federation
- **Subgrafo**: Un servicio GraphQL independiente que expone parte del schema global
- **Supergrafo**: El schema combinado que el Gateway expone al frontend
- **Introspection**: Proceso por el cual el Gateway lee los esquemas de los subgrafos

### GraphQL vs REST
- **REST**: Múltiples endpoints, over-fetching/under-fetching
- **GraphQL**: Un endpoint, queries precisas, type-safe

### Schema Stitching vs Federation
- **Schema Stitching**: Combinación manual de schemas (deprecated)
- **Federation**: Estándar de Apollo para combinar subgrafos automáticamente (actual)

---

## 📝 Notas Importantes

1. **Puertos**:
   - Gateway: 4000
   - Scripts Service: 4006 (interno) / 4006 (externo para desarrollo)
   - Rates Service: 4002
   - Users Service: 4001
   - Upload Service: 4005

2. **Base de Datos**:
   - Actualmente externa (172.26.12.67)
   - Configurada en archivos `.env` de cada servicio

3. **Autenticación**:
   - JWT se propaga desde el Gateway a los subgrafos
   - Cada subgrafo puede validar el token según sus necesidades

4. **Desarrollo**:
   - El Gateway hace polling cada 10 segundos para detectar cambios en schemas
   - En producción, considerar usar un supergraph estático para mejor performance

---

## ✅ Checklist de Implementación

- [x] GraphQL Gateway creado y configurado
- [x] Scripts-service convertido a subgrafo federado
- [x] Docker Compose actualizado con ambos servicios
- [x] Red Docker configurada
- [x] Archivos de entorno creados
- [x] Configuración de base de datos para scripts-service
- [x] Resolvers y models actualizados
- [x] Documentación completa

---

## 🎯 Próximos Pasos Recomendados

1. **Testing**: Probar el Gateway con queries reales del frontend
2. **Monitoreo**: Agregar logging y métricas al Gateway
3. **Migración de Rates**: Comenzar a migrar rates-service a GraphQL
4. **Documentación de API**: Usar GraphQL Playground/Studio para documentar
5. **Performance**: Optimizar queries y considerar caching

---

**Fecha de Implementación**: Diciembre 2024  
**Autor**: Implementación guiada para migración a arquitectura federada  
**Versión**: 1.0.0


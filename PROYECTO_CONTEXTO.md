# NWFG Platform - Technical Context & Golden Rules

Este archivo sirve como "Ancla de Contexto" (Context Anchor) para cualquier IA o desarrollador que trabaje en esta plataforma. Lee este documento antes de proponer cambios arquitectónicos o escribir código.

## 🛠️ Stack Tecnológico

*   **Frontend:** Next.js 15 (App Router), React, Tailwind CSS.
*   **Backend:** Node.js (Express), Apollo GraphQL (Federation/Gateway).
*   **Base de Datos:** MySQL 8.0 (Normalizada).
*   **Tiempo Real / Caché:** Redis (Pub/Sub) para Presencia y WebSockets.
*   **Storage (Auditoría):** MinIO (S3 Compatible).
*   **Infraestructura:** Docker Compose (Despliegue local/producción en Ubuntu Server).

---

## 🏗️ Estructura de Carpetas (Monorepo)

El proyecto es un monorepo que separa claramente el Frontend (Next.js) de los Microservicios del Backend.

*   `/frontend` *(Próximamente)*: App en Next.js 15 con App Router.
    *   `/app`: Rutas del frontend (Buscador, Admin Dashboard).
    *   `/components`: Componentes reutilizables de UI (Tailwind).
    *   `/context`: Providers globales (ej. `NotificationContext` para WebSockets).
*   `/services`: Microservicios Backend en contenedores separados.
    *   `/graphql-gateway`: Orquestador, Apollo Federation, Servidor de WebSockets (Puerto 4000).
    *   `/rates-service`: Lógica de tarifas y reglas de negocio (Phantom Rates).
    *   `/users-service`: Autenticación y RBAC.
    *   `/upload-service`: Motor ETL asíncrono, parseo avanzado de Excel.
*   `/infrastructure`: Scripts SQL (`init.sql`) y configuraciones de infra.
*   `/env`: Archivos de entorno aislados por servicio.

---

## 👑 Reglas de Oro (Golden Rules)

1.  **TypeScript & Tailwind:** Escribir el Frontend usando TypeScript estricto y Tailwind CSS para los estilos. No usar librerías de UI externas pesadas (ej. Material UI) a menos que se apruebe. Mantener la estética limpia y fluida (Sileo Toasts, Animaciones).
2.  **GraphQL First:** El Frontend **NUNCA** se conecta a los microservicios individuales directamente (excepto para inyecciones puras de archivos al `/upload`). Todo el tráfico de datos, consultas y WebSockets pasa por el Gateway (`http://localhost:4000/graphql`).
3.  **Gestión de Estado Centralizada:** Usar React Context para conexiones que deben persistir en toda la app (como las notificaciones WebSocket globales de eventos de Upload y Presencia).
4.  **No Modificar APIs/DB del Backend sin Consenso:** El backend actual es estricto ("Clean Architecture"). Cualquier cambio en esquemas de BD o Resolvers debe evaluarse contra el impacto en la Federación de Apollo.

---

## 🧠 Arquitectura de Negocio (Backend Context)

El backend actual está completamente dockerizado y estable. Contiene dos grandes motores que el Frontend debe consumir:

### Universo 1: Proveedores ETL (Uploads)
*   Proveedores que requieren Excels gigantes (CleanSky, WGL).
*   **Extracción (Anchor Detection):** El `upload-service` analiza el Excel top-down, agrupa tablas por cabeceras y guarda en `attributes` (JSONB) las columnas variables.
*   **Carga Asíncrona (Sileo UX):** El proceso es en batch. Emite eventos por Redis (EJ: `UPLOAD_STARTED`, `UPLOAD_PROGRESS`, `UPLOAD_COMPLETE`) bajo el scope `global`. El Frontend debe mostrar "Toasts" globales informando del proceso.
*   **Human-in-the-loop (`MISSING_ALIAS`):** Si un Excel trae un nombre de Utility que no existe, el motor se pausa y emite evento local (`scope: 'local'`). El Frontend debe pedir la resolución en la vista del Admin (`resolveAlias`) antes de reanudar (`/confirm`).

### Universo 2: Generación Dinámica (Phantom Rates)
*   Proveedores matriciales sin Excel (APGE, Polaris).
*   Si una consulta (`getRates`) coincide con su zona de operación configurada (`provider_configs`), el Backend inyecta dinámicamente registros con `is_placeholder: true`. 
*   **Responsabilidad del Front:** Si `is_placeholder` es true, el Front **oculta** el número 0 y renderiza botones de acción ("Consult Price").

### Gamificación (Zero-DB Presence)
*   El Gateway alberga la mutación `setPresence(action)` y la suscripción `presenceTyping`.
*   Cuando un agente enfoca el input del buscador, el Frontend dispara "typing". Esto se rebota vía Redis (sin tocar MySQL) al resto de agentes para dibujar burbujas de estado flotantes tipo "Juan (Medellín) está escribiendo...".

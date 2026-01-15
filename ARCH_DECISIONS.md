Architecture Decision Records (ADR) - NWFG Docker Ecosystem
Este documento registra las decisiones tecnológicas clave y la justificación detrás de la arquitectura de microservicios.

ADR 001: Implementación de Ownership en Resolvers de Usuario
Estado: Aceptado

Contexto: El sistema permitía consultar cualquier usuario mediante getUserById(id), lo que generaba un riesgo de IDOR (Insecure Direct Object Reference).

Decisión: Se implementó una lógica de validación en el nivel de resolver que compara el currentUser.id (extraído del JWT) con el id solicitado.

Consecuencia: Solo el dueño de la cuenta o un usuario con rol Administrador puede acceder a datos sensibles. Se garantiza la privacidad de las cuentas TPV.

ADR 002: Gestión de Entidades Compartidas con @shareable
Estado: Aceptado

Contexto: Tanto el users-service como el rates-service requieren información de la entidad Provider. Esto causaba conflictos de composición en el Apollo Gateway.

Decisión: Se definió la entidad Provider con la directiva @shareable en ambos subgrafos.

Consecuencia: El Gateway puede resolver campos de proveedores desde cualquiera de los dos servicios, permitiendo que el users-service gestione la relación con la cuenta y el rates-service gestione los logos y tarifas sin duplicidad de datos.

ADR 003: Mapeo Directo Schema-to-DB (Zero-Transformation)
Estado: Aceptado

Contexto: Las transformaciones complejas en los resolvers (mapear row.status a cuenta_status) introducían latencia y errores de mantenimiento.

Decisión: Sincronizar los nombres de los campos en el Schema de GraphQL con los nombres de las columnas en MySQL (status, nombre, centro).

Consecuencia: Código más limpio, resolvers más rápidos y facilidad para que cualquier desarrollador de base de datos entienda la API sin "diccionarios" intermedios.

ADR 004: Uso de MySQL Staging como Fuente de Verdad
Estado: Aceptado

Contexto: Los datos de producción provienen de múltiples fuentes externas. Se requería una zona de aterrizaje estable para el desarrollo.

Decisión: Se utiliza el esquema user_data_tpv_staging para alimentar los microservicios, asegurando que el desarrollo no afecte a tablas críticas de producción.

Consecuencia: Aislamiento de entornos y facilidad para realizar limpiezas de datos (Truncate/Load) sin romper la lógica del negocio.

ADR 005: Desactivación de Kafka en Entornos de Desarrollo Local
Estado: Aceptado

Contexto: Redpanda/Kafka consume recursos significativos y puede bloquear el arranque de los servicios si no está disponible.

Decisión: Implementar un flag de entorno que permita al users-service arrancar sin conexión obligatoria a Kafka para tareas de desarrollo de UI/API.

Consecuencia: Mayor velocidad de desarrollo local y estabilidad en el ciclo de docker-compose up.

ADR 006: Resolución de Entidades Federadas (Bulk "Endpoint")
Estado: Aceptado

Contexto: La arquitectura requiere que el Gateway pueda resolver múltiples referencias de usuarios simultáneamente (ej: listas de autores) sin realizar múltiples llamadas HTTP (problema N+1 de red).

Decisión: Se utiliza el mecanismo nativo de Apollo Federation _entities. No se implementan endpoints REST de "bulk fetch". El resolver __resolveReference en cada entidad maneja la resolución por ID.

Consecuencia: El Gateway optimiza automáticamente las peticiones agrupando IDs. El backend debe implementar DataLoaders en el futuro si el volumen de __resolveReference causa sobrecarga en la base de datos, pero la interfaz de red se mantiene estándar y gestionada por el subgrafo.

ADR 007: Motor de Ingesta de Tarifas (Bulk REST API)
Estado: Aceptado

Contexto: La carga de miles de tarifas energéticas requiere un procesamiento complejo (normalización de precios, detección de Gas vs Electricidad, mapeo de nombres de utilidades) que es difícil de manejar eficientemente en una mutación GraphQL estándar.

Decisión: Se mantiene un endpoint REST dedicado POST /rates/bulk en el rates-service (puerto 4002).

Funciones Clave Implementadas:
1. Normalización Inteligente: Convierte centavos a dólares y detecta unidades (KWH/Therms/MCF) basada en umbrales de precio (>0.40 suele ser Gas).
2. Resolución de Alias: Compara nombres de utilidades entrantes (ej: "ConEd") con la base de datos normalizada ("Consolidated Edison") usando un resolveAlias.
3. Cache Busting: Invalida automáticamente la caché de Redis (live_rates_all) tras una inserción exitosa.

Consecuencia: Permite a los sistemas RPA y scripts de carga procesar grandes volúmenes de datos con validación de negocio en una sola transacción HTTP, separando la lógica de "Ingeniería de Datos" de la API de consumo GraphQL del frontend.
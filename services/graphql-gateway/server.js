import express from 'express';
import cors from 'cors';
import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { makeExecutableSchema } from '@graphql-tools/schema';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import Redis from 'ioredis';
import { pubsub } from './pubsub.js';

// --- Standalone Redis connections for gateway-level pub/sub ---
// redisSub: subscriber-mode (can only receive, needed for bridging channels to GraphQL WS)
// redisPub: command-mode (can publish + run commands like EXISTS)
const redisSub = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  retryStrategy: times => Math.min(times * 50, 2000)
});

const redisPub = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  retryStrategy: times => Math.min(times * 50, 2000)
});

redisPub.on('connect', () => console.log('✅ Gateway redisPub connected'));
redisPub.on('error', (err) => console.error('❌ Gateway redisPub error:', err.message));

redisSub.subscribe('UPLOAD_EVENTS', 'presence:typing', 'RATE_EVENTS', (err) => {
  if (err) console.error('❌ Redis subscribe failed:', err.message);
  else console.log('✅ Gateway subscribed to UPLOAD_EVENTS + presence:typing + RATE_EVENTS');
});

// Bridge Redis messages → GraphQL PubSub
redisSub.on('message', (channel, message) => {
  try {
    const payload = JSON.parse(message);
    if (channel === 'UPLOAD_EVENTS') {
      pubsub.publish('UPLOAD_EVENT', { uploadEvent: payload });
    } else if (channel === 'presence:typing') {
      pubsub.publish('PRESENCE_TYPING', { presenceTyping: payload });
    } else if (channel === 'RATE_EVENTS') {
      // Bridge rates-service pubsub → gateway WS clients
      pubsub.publish('RATE_UPDATED', { rateUpdated: payload });
    }
  } catch (e) {
    console.error('❌ Failed to parse Redis message:', e.message);
  }
});

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Configuración del Gateway con Apollo Federation
const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
      {
        name: 'users',
        url: process.env.USERS_SERVICE_URL || 'http://users-service:4001/graphql',
      },
      {
        name: 'rates',
        url: process.env.RATES_SERVICE_URL || 'http://rates-service:4002/graphql',
      },
    ],
    // Polling cada 10 segundos para detectar cambios en los esquemas
    pollIntervalInMs: 10000,
  }),
  // Configurar el datasource para inyectar headers en las peticiones a los subgrafos
  buildService({ url }) {
    return new RemoteGraphQLDataSource({
      url,
      willSendRequest({ request, context }) {
        // Inyectar los datos del usuario en los headers para que los subgrafos los lean
        if (context.user) {
          request.http.headers.set('x-user-id', context.user.id?.toString() || '');
          request.http.headers.set('x-user-role', context.user.rol || '');
          request.http.headers.set('x-user-email', context.user.email || '');
          request.http.headers.set('x-user-nombre', context.user.nombre || '');
          request.http.headers.set('x-user-centro-id', context.user.centro?.toString() || '');
        }
      },
    });
  },
});

// Definición del esquema LOCAL para Suscripciones
const subscriptionTypeDefs = `
  type Query {
    _health: Boolean
  }

  type Subscription {
    # --- Tasa / Rate Updates ---
    rateUpdated: RateBulkNotification

    # --- ETL Upload Events (scope: 'local' | 'global') ---
    # 'local' events have a userId so FE renders only in the uploader's table.
    # 'global' events (UPLOAD_COMPLETE, UPLOAD_PROGRESS) are shown to all.
    uploadEvent: UploadEventPayload

    # --- Presencia (ephemeral, zero-DB, pure Redis mirror) ---
    # Agentes ven quién está buscando tarifas en tiempo real.
    presenceTyping: PresencePayload
  }

  type RateBulkNotification {
    provider_id: ID
    count: Int
    timestamp: String
  }

  type UploadEventPayload {
    type: String!          # UPLOAD_STARTED | PARSE_COMPLETE | UPLOAD_PROGRESS | AWAITING_USER | UPLOAD_COMPLETE
    sessionId: String!
    userId: String         # Owner of the session (used for local vs global routing on FE)
    scope: String          # 'local' | 'global'
    filename: String
    dirtyName: String      # For AWAITING_USER events — the unresolved alias
    message: String        # Human-readable description for AWAITING_USER events
    processed: Int
    total: Int
    percent: Int
    providerId: ID
    rowCount: Int
    timestamp: String
  }

  # Ephemeral presence — never touches MySQL.
  # FE sends { user, center, avatar, action: 'typing' | 'stopped' } to presence:typing via REST or WS.
  type PresencePayload {
    userId: String!
    userName: String
    center: String         # e.g. 'NWFG' | 'FIS Medellin'
    avatar: String         # URL
    action: String!        # 'typing' | 'stopped'
    timestamp: String
  }

  type ConfirmUploadResult {
    success: Boolean!
    message: String
  }

  # Returned after the file is stored in Redis + MinIO by the upload-service.
  type UploadResult {
    sessionId: String!
    headers: [String!]!
    rowCount: Int!
  }

  type CancelUploadResult {
    success: Boolean!
    message: String
  }

  type Mutation {
    setPresence(action: String!): Boolean

    # ADR-002: Frontend calls this instead of the REST /api/upload endpoint.
    uploadFile(fileBase64: String!, filename: String!): UploadResult!

    # FE sends this after the column-mapping step. Gateway publishes ETL_START to Redis.
    confirmUpload(sessionId: String!, providerId: Int!, mappingJson: String): ConfirmUploadResult!

    # Abort an in-flight or stuck ETL session.
    # Sets a cancellation flag in Redis — the worker checks it before each batch and exits.
    cancelUpload(sessionId: String!): CancelUploadResult!
  }
`;

// Internal URL for container-to-container calls (allowed per ADR-002)
const UPLOAD_SERVICE_INTERNAL = process.env.UPLOAD_SERVICE_URL || 'http://upload-service:4005';

const subscriptionResolvers = {
  Subscription: {
    rateUpdated: {
      subscribe: () => pubsub.asyncIterator(['RATE_UPDATED']),
    },
    uploadEvent: {
      subscribe: () => pubsub.asyncIterator(['UPLOAD_EVENT']),
    },
    presenceTyping: {
      subscribe: () => pubsub.asyncIterator(['PRESENCE_TYPING']),
    },
  },
  Mutation: {
    uploadFile: async (_, { fileBase64, filename }, context) => {
      const userId = context.user?.id?.toString() || 'unknown';

      // Re-sign a short-lived internal token so upload-service can validate auth.
      // The user is already verified by the gateway at this point.
      const internalToken = jwt.sign(
        { id: context.user?.id, rol: context.user?.rol, nombre: context.user?.nombre },
        process.env.JWT_SECRET,
        { expiresIn: '60s' }
      );

      // Decode base64 → Buffer → Blob so FormData can carry it as a real file
      const buffer = Buffer.from(fileBase64, 'base64');
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const form = new FormData();
      form.append('file', blob, filename);

      const response = await fetch(`${UPLOAD_SERVICE_INTERNAL}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${internalToken}`,
          'x-user-id': userId,
        },
        body: form,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`upload-service error ${response.status}: ${text}`);
      }

      const result = await response.json();
      // upload-service returns { success, sessionId, headers, rowCount, ... }
      return {
        sessionId: result.sessionId,
        headers:   result.headers  ?? [],
        rowCount:  result.rowCount ?? 0,
      };
    },

    confirmUpload: async (_, { sessionId, providerId, mappingJson }, context) => {
      const userId = context.user?.id?.toString() || 'unknown';

      // Validate session still alive in Redis before publishing
      const exists = await redisPub.exists(`upload:${sessionId}:file`);
      if (!exists) {
        return { success: false, message: 'Sesión expirada o no encontrada. Sube el archivo de nuevo.' };
      }

      let mapping = null;
      if (mappingJson) {
        try { mapping = JSON.parse(mappingJson); } catch { /* mapping stays null */ }
      }

      await redisPub.publish('ETL_EVENTS', JSON.stringify({
        type: 'ETL_START',
        sessionId,
        providerId,
        mapping,
        userId,
        timestamp: new Date().toISOString(),
      }));

      console.log(`📡 [gateway] ETL_START published session=${sessionId?.slice(-6)} provider=${providerId}`);
      return { success: true, message: 'ETL iniciado' };
    },

    cancelUpload: async (_, { sessionId }, context) => {
      const userId = context.user?.id?.toString() || 'unknown';
      try {
        // 1. Flag the session so the worker stops after the current batch
        await redisPub.set(`upload:${sessionId}:status`, 'cancelled', 'EX', 3600);
        // 2. Publish a cancel event so the worker exits its loop immediately
        await redisPub.publish('ETL_EVENTS', JSON.stringify({
          type: 'ETL_CANCEL',
          sessionId,
          userId,
          timestamp: new Date().toISOString(),
        }));
        // 3. Emit a WS event so the FE updates its UI in real time
        pubsub.publish('UPLOAD_EVENT', {
          uploadEvent: {
            type:      'UPLOAD_CANCELLED',
            sessionId,
            userId,
            scope:     'local',
            message:   'Proceso cancelado por el usuario.',
            timestamp: new Date().toISOString(),
          },
        });
        console.log(`🛑 [gateway] cancelUpload session=${sessionId?.slice(-6)} by user=${userId}`);
        return { success: true, message: 'Proceso cancelado' };
      } catch (err) {
        console.error('❌ [gateway] cancelUpload error:', err.message);
        return { success: false, message: err.message };
      }
    },

    setPresence: async (_, { action }, context) => {
      const payload = {
        userId: context.user?.id?.toString() || 'anonymous',
        userName: context.user?.nombre || 'Agent',
        center: context.user?.centro?.toString() || 'NWFG',
        avatar: context.user?.avatar || '',
        action,
        timestamp: new Date().toISOString()
      };
      await pubsub.publish('PRESENCE_TYPING', { presenceTyping: payload });
      return true;
    },
  }
};

const subscriptionSchema = makeExecutableSchema({
  typeDefs: subscriptionTypeDefs,
  resolvers: subscriptionResolvers,
});

// DEBUG: verificar el schema antes de pasarlo al WS server
console.log('[DEBUG] subscriptionSchema queryType:', subscriptionSchema.getQueryType()?.name ?? 'NULL');
console.log('[DEBUG] subscriptionSchema __validationErrors:', subscriptionSchema.__validationErrors ?? 'ninguno');

// Crear httpServer explícitamente para compartirlo con WS y Express
const httpServer = createServer(app);

// Configurar WebSocket Server para Subscriptions
// maxPayload: 20 MB — covers base64-encoded Excel files (~7 MB for large rate sheets).
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
  maxPayload: 20 * 1024 * 1024,
});

// Activar el servidor de suscripciones
const serverCleanup = useServer({
  schema: subscriptionSchema,
  // validate eliminado — el custom validate llamaba gqlValidate que tira
  // "Query root type must be provided" y rompe el subscription silenciosamente.
  // graphql-ws maneja la validación por defecto correctamente.
  context: async (ctx, msg, args) => {
    let user = null;
    let decoded = null;

    // ── 1. connectionParams Authorization ────────────────────────────────────
    const paramToken = ctx.connectionParams?.Authorization?.split(' ')[1];
    if (paramToken && process.env.JWT_SECRET) {
      try { decoded = jwt.verify(paramToken, process.env.JWT_SECRET); } catch {}
    }

    // ── 2. Fallback: HttpOnly cookie from WS upgrade request ─────────────────
    if (!decoded && ctx.extra?.request?.headers?.cookie) {
      const match = ctx.extra.request.headers.cookie.match(/(?:^|;\s*)nwfg_token=([^;]+)/);
      if (match?.[1] && process.env.JWT_SECRET) {
        try { decoded = jwt.verify(match[1], process.env.JWT_SECRET); } catch {}
      }
    }

    // ── 3. Redis session check — same real-time invalidation as HTTP ──────────
    if (decoded) {
      if (decoded.jti) {
        const alive = await redisPub.exists(`sess:${decoded.jti}`);
        if (alive) user = decoded;
        else console.warn(`⚠️  [gateway WS] Session revoked jti=${decoded.jti?.slice(0, 8)}…`);
      } else {
        user = decoded; // legacy token — no jti
      }
    }

    return { user };
  },
  onConnect: (ctx) => {
    console.log('🔌 Cliente WebSocket conectado');
  },
  onDisconnect: (ctx) => {
    console.log('🔌 Cliente WebSocket desconectado');
  },
  onError: (ctx, msg, errors) => {
    console.error('❌ Error WebSocket:', JSON.stringify(errors));
  }
}, wsServer);

// Crear el servidor Apollo con el Gateway
const server = new ApolloServer({
  gateway,
  introspection: process.env.NODE_ENV !== 'production',
  plugins: [
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

// Inicializar el servidor
await server.start();

// CORS: permite cookies (credentials) desde el frontend Next.js
// En producción, FRONTEND_ORIGIN debe ser la URL de Dockploy.
const corsOptions = {
  origin: process.env.FRONTEND_ORIGIN || 'http://localhost:3000',
  credentials: true,  // Necesario para que las cookies HttpOnly viajen cross-origin
};
app.use(cors(corsOptions));
// 20 MB limit — base64-encoded Excel files can reach ~7 MB for large rate sheets.
// Apollo Server v4's expressMiddleware detects pre-parsed body and skips re-parsing.
app.use(express.json({ limit: '20mb' }));


// Endpoint de salud
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'graphql-gateway' });
});

// Montar GraphQL en /graphql
app.use('/graphql', expressMiddleware(server, {
  context: async ({ req }) => {
    const operationName = req.body?.operationName;
    const queryBody = req.body?.query || '';
    const isIntrospection = operationName === 'IntrospectionQuery';
    const isLogin = queryBody.includes('login') || operationName === 'Login';

    // --- Extracción del token: dual-mode ---
    // 1. Header Authorization: Bearer <token>  (usado por Apollo Client del browser)
    // 2. Cookie nwfg_token=<token>             (usado por Server Actions de Next.js / BFF)
    let token = req.headers.authorization?.split(' ')[1] || '';

    if (!token && req.headers.cookie) {
      const cookieMatch = req.headers.cookie.match(/(?:^|;\s*)nwfg_token=([^;]+)/);
      if (cookieMatch) token = cookieMatch[1];
    }

    let user = null;

    if (token && process.env.JWT_SECRET) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // ── Redis session check — real-time session invalidation ─────────────
        // Every request validates that sess:{jti} still exists in Redis.
        // Deleting it (logout / invalidateAllSessions) immediately kills the
        // session on the next request — no token expiry needed.
        if (decoded.jti) {
          const alive = await redisPub.exists(`sess:${decoded.jti}`);
          if (alive) {
            user = decoded;
          } else {
            console.warn(`⚠️  [gateway] Session revoked for jti=${decoded.jti?.slice(0, 8)}…`);
          }
        } else {
          // Legacy tokens without jti (issued before this change) — accept but warn
          console.warn('⚠️  [gateway] Token without jti — consider re-login');
          user = decoded;
        }
      } catch {
        console.warn('⚠️ Token inválido o expirado');
      }
    }

    // Permitir WebSocket handshakes sin bloquear
    if (req.headers?.upgrade === 'websocket') {
      return { user: null };
    }

    // Bloquear peticiones no autenticadas (excepto login e introspection)
    if (!user && !isLogin && !isIntrospection) {
      const { GraphQLError } = await import('graphql');
      throw new GraphQLError('No autenticado', {
        extensions: { code: 'UNAUTHENTICATED', http: { status: 401 } },
      });
    }

    return { user };
  },
}));


// Iniciar el servidor HTTP
httpServer.listen(PORT, async () => {
  console.log(`🚀 GraphQL Gateway corriendo en http://localhost:${PORT}/graphql`);
  console.log(`📊 Subgrafos configurados: users-service, scripts-service, rates-service`);
});


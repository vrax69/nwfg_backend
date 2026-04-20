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

// --- Standalone Redis subscriber for UPLOAD_EVENTS + presence:typing ---
// We use a separate ioredis connection in subscriber mode (pubsub.js already has publisher).
const redisSub = new Redis({
  host: process.env.REDIS_HOST || 'redis',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  retryStrategy: times => Math.min(times * 50, 2000)
});

redisSub.subscribe('UPLOAD_EVENTS', 'presence:typing', (err) => {
  if (err) console.error('❌ Redis subscribe failed:', err.message);
  else console.log('✅ Gateway subscribed to UPLOAD_EVENTS + presence:typing');
});

// Bridge Redis messages → GraphQL PubSub
redisSub.on('message', (channel, message) => {
  try {
    const payload = JSON.parse(message);
    if (channel === 'UPLOAD_EVENTS') {
      pubsub.publish('UPLOAD_EVENT', { uploadEvent: payload });
    } else if (channel === 'presence:typing') {
      pubsub.publish('PRESENCE_TYPING', { presenceTyping: payload });
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
    type: String!          # UPLOAD_STARTED | PARSE_COMPLETE | UPLOAD_PROGRESS | MISSING_ALIAS | UPLOAD_COMPLETE
    sessionId: String!
    userId: String         # Owner of the session (used for local vs global routing on FE)
    scope: String          # 'local' | 'global'
    filename: String
    dirtyName: String      # For MISSING_ALIAS events
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

  type Mutation {
    setPresence(action: String!): Boolean
  }
`;

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
    setPresence: async (_, { action }, context) => {
      // The context is injected by the WS useServer function below
      const payload = {
        userId: context.user?.id?.toString() || 'anonymous',
        userName: context.user?.nombre || 'Agent',
        center: context.user?.centro?.toString() || 'NWFG',
        avatar: context.user?.avatar || '',
        action,
        timestamp: new Date().toISOString()
      };
      // Emits purely in-memory/Redis, no DB hits
      await pubsub.publish('PRESENCE_TYPING', { presenceTyping: payload });
      return true;
    }
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
const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});

// Activar el servidor de suscripciones
const serverCleanup = useServer({
  schema: subscriptionSchema,
  // validate eliminado — el custom validate llamaba gqlValidate que tira
  // "Query root type must be provided" y rompe el subscription silenciosamente.
  // graphql-ws maneja la validación por defecto correctamente.
  context: (ctx, msg, args) => {
    // Inject user context from WS connection params
    let user = null;
    const token = ctx.connectionParams?.Authorization?.split(' ')[1] || ctx.connectionParams?.authToken;
    if (token && process.env.JWT_SECRET) {
      try {
        user = jwt.verify(token, process.env.JWT_SECRET);
      } catch (e) {
        // Ignorar para permit anónimos si se desea
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
app.use(express.json());


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
        user = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        console.warn('⚠️ Token inválido o expirado');
      }
    }

    // Permitir WebSocket handshakes sin bloquear
    if (req.headers?.upgrade === 'websocket') {
      return { user: null };
    }

    // Bloquear peticiones no autenticadas (excepto login e introspection)
    // Usamos GraphQLError para que Apollo devuelva 200 con error code UNAUTHENTICATED
    // y NO un HTTP 500 que rompe al cliente
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


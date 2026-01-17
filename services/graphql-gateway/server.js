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
import { connectConsumer } from './kafka.js';
import { pubsub } from './pubsub.js';

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
        name: 'scripts',
        url: process.env.SCRIPTS_SERVICE_URL || 'http://scripts-service:4006/graphql',
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

// Definición del esquema LOCAL para Suscripciones (se "mezcla" visualmente para el cliente)
const subscriptionTypeDefs = `
  type Subscription {
    rateUpdated: RateBulkNotification
  }

  type RateBulkNotification {
    type: String
    insertedCount: Int
    provider_id: [Int]
    timestamp: String
  }
`;

const subscriptionResolvers = {
  Subscription: {
    rateUpdated: {
      subscribe: () => pubsub.asyncIterator(['RATE_UPDATED']),
    },
  },
};

const subscriptionSchema = makeExecutableSchema({
  typeDefs: subscriptionTypeDefs,
  resolvers: subscriptionResolvers,
});

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

// Middleware
app.use(cors());
app.use(express.json());

// Endpoint de salud
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'graphql-gateway' });
});

// Montar GraphQL en /graphql
app.use('/graphql', expressMiddleware(server, {
  context: async ({ req }) => {
    // 1. Detectar si es una operación que DEBE ser pública
    const operationName = req.body.operationName;
    const queryBody = req.body.query || '';
    const isIntrospection = operationName === 'IntrospectionQuery';
    const isLogin = queryBody.includes('login') || operationName === 'Login';

    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1] || '';

    let user = null;

    if (token && process.env.JWT_SECRET) {
      try {
        user = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        console.warn('⚠️ Intento de acceso con token inválido');
      }
    }

    // 2. Aplicar el Bloqueo: Si no hay usuario y no es una excepción, lanzar error
    // 2. Aplicar el Bloqueo: Si no hay usuario y no es una excepción, lanzar error
    if (!user && !isLogin && !isIntrospection) {
      // Permitir paso si es WebSocket handshake (a veces req.method es GET pero headers upgrade)
      if (req.headers && req.headers.upgrade === 'websocket') {
        return { user: null }; // Permitir handshake anónimo por ahora
      }
      throw new Error('UNAUTHENTICATED');
    }

    return { user };
  },
}));

// Iniciar el servidor HTTP
httpServer.listen(PORT, async () => {
  console.log(`🚀 GraphQL Gateway corriendo en http://localhost:${PORT}/graphql`);
  console.log(`📊 Subgrafos configurados: users-service, scripts-service, rates-service`);

  // Conectar Consumidor de Kafka
  await connectConsumer();
});


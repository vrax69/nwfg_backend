import express from 'express';
import cors from 'cors';
import { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

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
        }
      },
    });
  },
});

// Crear el servidor Apollo con el Gateway
const server = new ApolloServer({
  gateway,
  // Habilitar introspection y playground en desarrollo
  introspection: process.env.NODE_ENV !== 'production',
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
    // Extraer y validar el token JWT del header Authorization
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1] || '';
    
    if (token && process.env.JWT_SECRET) {
      try {
        // Validar el token y decodificar los datos del usuario
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Retornar el usuario decodificado para que el Gateway lo pase a los subgrafos
        return { 
          user: {
            id: decoded.id,
            email: decoded.email,
            rol: decoded.rol,
            nombre: decoded.nombre,
          }
        };
      } catch (error) {
        // Token inválido o expirado, continuar sin usuario
        console.warn('⚠️ Token inválido o expirado:', error.message);
        return {};
      }
    }
    
    // Sin token, retornar contexto vacío (permite queries públicas)
    return {};
  },
}));

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🚀 GraphQL Gateway corriendo en http://localhost:${PORT}/graphql`);
  console.log(`📊 Subgrafos configurados: users-service, scripts-service, rates-service`);
});


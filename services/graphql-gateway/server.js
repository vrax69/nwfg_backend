import express from 'express';
import cors from 'cors';
import { ApolloGateway, IntrospectAndCompose } from '@apollo/gateway';
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// Configuración del Gateway con Apollo Federation
const gateway = new ApolloGateway({
  supergraphSdl: new IntrospectAndCompose({
    subgraphs: [
      {
        name: 'scripts',
        url: process.env.SCRIPTS_SERVICE_URL || 'http://scripts-service:4006/graphql',
      },
      {
        name: 'rates',
        url: process.env.RATES_SERVICE_URL || 'http://rates-service:4002/graphql',
      },
      // Aquí agregaremos más subgrafos cuando migremos los otros servicios
      // {
      //   name: 'users',
      //   url: process.env.USERS_SERVICE_URL || 'http://users-service:4001/graphql',
      // },
    ],
    // Polling cada 10 segundos para detectar cambios en los esquemas
    pollIntervalInMs: 10000,
  }),
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
    // Pasar el token JWT a los subgrafos para autenticación
    const token = req.headers.authorization || '';
    return { token };
  },
}));

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`🚀 GraphQL Gateway corriendo en http://localhost:${PORT}/graphql`);
  console.log(`📊 Subgrafos configurados: scripts-service, rates-service`);
});


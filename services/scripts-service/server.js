const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { buildSubgraphSchema } = require('@apollo/subgraph');
require('dotenv').config();

const typeDefs = require('./src/graphql/schema');
const resolvers = require('./src/graphql/resolvers');

// Middleware para leer los headers que inyecta el Gateway
const gatewayAuth = (req, res, next) => {
  req.user = {
    id: req.headers['x-user-id'],
    role: req.headers['x-user-role'] || req.headers['x-user-rol'],
    email: req.headers['x-user-email'],
    nombre: req.headers['x-user-nombre'],
  };
  next();
};

const app = express();
const PORT = process.env.PORT || 4006;

// Construir el esquema como subgrafo federado
const schema = buildSubgraphSchema({ typeDefs, resolvers });

// Crear el servidor Apollo
const server = new ApolloServer({
  schema,
  introspection: true, // Habilitar introspection para que el Gateway pueda leer el esquema
});

// Inicializar el servidor
async function startServer() {
  await server.start();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Endpoint de salud
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'scripts-service' });
  });

  // Montar GraphQL en /graphql
  app.use('/graphql', gatewayAuth, expressMiddleware(server, {
    context: async ({ req }) => {
      // El Gateway inyecta los datos del usuario mediante headers x-user-*
      // Si estos headers están presentes, el Gateway ya validó el JWT
      return {
        user: req.user || null, // Contiene id, role, email, nombre desde gatewayAuth
      };
    },
  }));

  // Iniciar el servidor
  app.listen(PORT, () => {
    console.log(`🚀 Scripts Service (GraphQL Subgraph) corriendo en http://localhost:${PORT}/graphql`);
    console.log(`📡 Listo para ser federado por el GraphQL Gateway`);
  });
}

startServer().catch((error) => {
  console.error('Error al iniciar el servidor:', error);
  process.exit(1);
});


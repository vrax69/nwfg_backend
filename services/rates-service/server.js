const app = require('./app');
const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { testConnections } = require('./src/config/db');
const { connectProducer } = require('./src/config/kafka');
const gatewayAuth = require('./src/middleware/gatewayAuth');

const typeDefs = require('./src/graphql/schema');
const resolvers = require('./src/graphql/resolvers');

const PORT = process.env.PORT || 4002;
const GRAPHQL_PATH = '/graphql';

// Crear el servidor Apollo para GraphQL
const apolloServer = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers }),
  introspection: true, // Habilitar introspection para que el Gateway pueda leer el esquema
});

// Función para inicializar todo
async function startServer() {
  // Inicializar Apollo Server
  await apolloServer.start();

  // Montar GraphQL en la misma app Express
  // Aplicar express.json() específicamente aquí para /graphql
  // aunque esté aplicado globalmente, Apollo Server necesita este orden específico
  app.use(
    GRAPHQL_PATH,
    express.json({ type: 'application/json' }),
    gatewayAuth, // Middleware para leer headers del Gateway (x-user-*)
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        // El Gateway inyecta los datos del usuario mediante headers x-user-*
        // Si estos headers están presentes, el Gateway ya validó el JWT
        return {
          user: req.user || null, // Contiene id, role, email, nombre desde gatewayAuth
        };
      },
    })
  );

  // 404 handler - debe ir DESPUÉS de montar GraphQL para no interceptar /graphql
  app.use((req, res) => {
    res.status(404).json({ message: 'Not Found' });
  });

  // Iniciar el servidor Express (REST + GraphQL)
  app.listen(PORT, () => {
    console.log(`🚀 Rates-service running on port ${PORT}`);
    console.log(`📊 REST API disponible en http://localhost:${PORT}`);
    console.log(`🔷 GraphQL Subgraph disponible en http://localhost:${PORT}${GRAPHQL_PATH}`);
    testConnections();
    connectProducer();
  });
}

// Iniciar el servidor
startServer().catch((error) => {
  console.error('❌ Error al iniciar el servidor:', error);
  process.exit(1);
});

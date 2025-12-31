const app = require('./app');
const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { testConnections } = require('./src/config/db');
const { connectProducer } = require('./src/config/kafka');

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
  app.use(
    GRAPHQL_PATH,
    cors(),
    express.json(),
    expressMiddleware(apolloServer, {
      context: async ({ req }) => {
        // Pasar el token JWT si está presente
        const token = req.headers.authorization || '';
        return { token };
      },
    })
  );

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

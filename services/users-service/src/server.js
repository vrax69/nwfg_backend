import dotenv from "dotenv";
import express from "express";
import app from "./app.js";
import { kafkaConnect } from "./config/kafka.js";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { buildSubgraphSchema } from "@apollo/subgraph";
import typeDefs from "./graphql/schema.js";
import resolvers from "./graphql/resolvers.js";
// import { startUserEventsConsumer } from "./events/consumers/userEvents.consumer.js";

dotenv.config();

const PORT = process.env.PORT;
const GRAPHQL_PATH = "/graphql";

// Crear el servidor Apollo para GraphQL
const apolloServer = new ApolloServer({
  schema: buildSubgraphSchema({ typeDefs, resolvers }),
  introspection: true, // Habilitar introspection para que el Gateway pueda leer el esquema
});

async function startServer() {
  try {
    await kafkaConnect();
    // await startUserEventsConsumer();

    // Inicializar Apollo Server
    await apolloServer.start();

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

    // Montar GraphQL en la misma app Express
    // El body parser ya está aplicado globalmente en app.js
    app.use(
      GRAPHQL_PATH,
      gatewayAuth, // Middleware para leer headers del Gateway (x-user-*)
      expressMiddleware(apolloServer, {
        context: async ({ req }) => {
          // Los headers x-user-* vienen del Gateway y se extraen en gatewayAuth
          // req.user contiene id, role, email, nombre
          return { req };
        },
      })
    );

    // 404 handler - debe ir DESPUÉS de montar GraphQL
    app.use((req, res) => {
      res.status(404).json({ message: "Not Found" });
    });

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Users-service corriendo en puerto ${PORT}`);
      console.log(`📊 REST API disponible en http://localhost:${PORT}`);
      console.log(`🔷 GraphQL Subgraph disponible en http://localhost:${PORT}${GRAPHQL_PATH}`);
    });

  } catch (error) {
    console.error("❌ Error iniciando el servicio:", error);
    process.exit(1);
  }
}

startServer();

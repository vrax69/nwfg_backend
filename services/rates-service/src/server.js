require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('apollo-server-express');
const db = require('./config/db'); // Importamos para probar conexión al inicio

// Importamos la capa GraphQL - Usamos require directamente si los ficheros ya existen o vamos a crearlos.
// Si no existen fallará. Voy a crearlos DESPUES de este paso.
const typeDefs = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');

async function startServer() {
    const app = express();
    const PORT = process.env.PORT || 4002;

    app.use(cors());
    app.use(express.json());

    // ---------------------------------------------------------
    // 1. INFRAESTRUCTURA (Solo para Docker/K8s)
    // ---------------------------------------------------------
    app.get('/health', async (req, res) => {
        try {
            // db.query en mysql2 retorna una promesa si se usa promise wrapper
            // En db.js exporté 'pool'. Si cambié a mysql2/promise, pool.query() es correcto.
            await db.query('SELECT 1'); // Ping a la DB
            res.status(200).send('OK - Ready for GraphQL');
        } catch (error) {
            console.error(error);
            res.status(500).send('ERROR - DB Disconnected');
        }
    });

    // ---------------------------------------------------------
    // 2. CAPA DE NEGOCIO (Solo GraphQL)
    // ---------------------------------------------------------
    const server = new ApolloServer({
        typeDefs,
        resolvers,
        context: ({ req }) => ({ req }) // Contexto para Auth futura
    });

    await server.start();

    // El endpoint será http://localhost:4002/graphql
    // Apollo Server 3 usa applyMiddleware
    server.applyMiddleware({ app, path: '/graphql' });

    // ---------------------------------------------------------
    // 3. ARRANQUE
    // ---------------------------------------------------------
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`🚀 Rates Subgraph listo en puerto ${PORT}`);
        console.log(`🔷 Endpoint: http://localhost:${PORT}${server.graphqlPath}`);
    });
}

startServer().catch(err => {
    console.error("❌ Error fatal al iniciar:", err);
});

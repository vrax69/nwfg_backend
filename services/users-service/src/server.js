import dotenv from "dotenv";
import app from "./app.js";
import { kafkaConnect } from "./config/kafka.js";
// import { startUserEventsConsumer } from "./events/consumers/userEvents.consumer.js";

dotenv.config();

const PORT = process.env.PORT;

async function startServer() {
  try {
    await kafkaConnect();
    // await startUserEventsConsumer();

    app.listen(PORT, () =>
      console.log(`🚀 Users-service corriendo en puerto ${PORT}`)
    );

  } catch (error) {
    console.error("❌ Error iniciando el servicio:", error);
  }
}

startServer();

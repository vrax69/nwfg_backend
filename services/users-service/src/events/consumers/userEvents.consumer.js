import { consumer } from "../../config/kafka.js";

export async function startUserEventsConsumer() {
  try {
    await consumer.subscribe({ topic: "user.updated", fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ topic, message }) => {
        const data = JSON.parse(message.value.toString());

        console.log(`📥 Evento recibido en ${topic}:`, data);

        // Aquí procesas data según tu lógica
      },
    });

  } catch (error) {
    console.error("❌ Error en userEvents.consumer:", error);
  }
}

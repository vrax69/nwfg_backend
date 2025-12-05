import { producer } from "../../config/kafka.js";

export async function publishUserCreated(user) {
  try {
    await producer.send({
      topic: "user.created",
      messages: [{ value: JSON.stringify(user) }],
    });

    console.log(`📢 Evento user.created enviado: ${user.id}`);
  } catch (error) {
    console.error("Error publicando user.created:", error);
  }
}

export async function publishUserUpdated(user) {
  try {
    await producer.send({
      topic: "user.updated",
      messages: [{ value: JSON.stringify(user) }],
    });

    console.log(`📢 Evento user.updated enviado: ${user.id}`);
  } catch (error) {
    console.error("Error publicando user.updated:", error);
  }
}

import { Kafka } from "kafkajs";

let producer, consumer, kafkaConnectFn;

if (process.env.KAFKA_OFF === "true") {
  console.log("⚠️ Kafka DESACTIVADO para desarrollo");
  
  producer = {
    send: async () => {
      console.log("⚠️ Kafka OFF - send() ignorado");
    },
    connect: async () => {},
    disconnect: async () => {},
  };
  
  consumer = {
    run: async () => {
      console.log("⚠️ Kafka OFF - run() ignorado");
    },
    connect: async () => {},
    disconnect: async () => {},
  };
  
  kafkaConnectFn = async function kafkaConnect() {
    console.log("⚠️ Kafka DESACTIVADO - kafkaConnect() ignorado");
  };
} else {
  const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || "users-service",
    brokers: process.env.KAFKA_BROKERS ? process.env.KAFKA_BROKERS.split(",") : ["redpanda:9092"],
  });

  producer = kafka.producer();
  consumer = kafka.consumer({
    groupId: "users-service-group",
  });

  kafkaConnectFn = async function kafkaConnect() {
    try {
      await producer.connect();
      console.log("🔵 Kafka Producer conectado");

      // Consumer más adelante
      // await consumer.connect();
      // console.log("🟢 Kafka Consumer conectado");

    } catch (err) {
      console.error("❌ Error conectando a Kafka:", err);
    }
  };
}

export { producer, consumer };
export const kafkaConnect = kafkaConnectFn;
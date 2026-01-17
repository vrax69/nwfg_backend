import { Kafka } from 'kafkajs';
import { pubsub } from './pubsub.js';

const isKafkaOff = process.env.KAFKA_OFF === 'true';

let consumer = null;

export const connectConsumer = async () => {
    if (isKafkaOff) {
        console.log('⚠ Kafka is disabled via KAFKA_OFF=true');
        return;
    }

    const kafka = new Kafka({
        clientId: 'graphql-gateway',
        brokers: [process.env.KAFKA_BROKERS || 'redpanda:9092'],
    });

    consumer = kafka.consumer({ groupId: 'gateway-group' });

    try {
        await consumer.connect();
        console.log('✔ Gateway Kafka Consumer connected');

        await consumer.subscribe({ topic: 'rates.events', fromBeginning: false });

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const value = message.value.toString();
                    const parsedValue = JSON.parse(value);

                    console.log(`🔔 Evento recibido en Gateway [${topic}]:`, parsedValue.type);

                    if (parsedValue.type === 'BULK_UPLOAD_COMPLETED') {
                        // Mapeo de datos para el payload de la suscripción
                        const notificationPayload = {
                            type: parsedValue.type,
                            insertedCount: parsedValue.inserted || parsedValue.insertedCount, // Manejar ambas variantes
                            provider_id: Array.isArray(parsedValue.provider_id) ? parsedValue.provider_id : [parsedValue.provider_id],
                            timestamp: parsedValue.timestamp,
                        };

                        // Publicar al PubSub
                        // Importante: La clave debe coincidir con el nombre del TRIGGER en el resolver
                        // y la estructura del objeto debe coincidir con el return type del resolver
                        await pubsub.publish('RATE_UPDATED', { rateUpdated: notificationPayload });
                        console.log('📡 Notificación enviada a suscriptores GraphQL');
                    }
                } catch (error) {
                    console.error('❌ Error procesando mensaje Kafka en Gateway:', error);
                }
            },
        });
    } catch (error) {
        console.error('❌ Error conectando consumidor Kafka:', error);
    }
};

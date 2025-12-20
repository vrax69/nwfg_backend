// services/rates-service/src/config/kafka.js
const { Kafka } = require('kafkajs');

const isKafkaOff = process.env.KAFKA_OFF === 'true';

let producer = null;

if (!isKafkaOff) {
    const kafka = new Kafka({
        clientId: 'rates-service',
        brokers: [process.env.KAFKA_BROKERS || 'redpanda:9092']
    });
    producer = kafka.producer();
}

const connectProducer = async () => {
    if (isKafkaOff) {
        console.log('⚠ Kafka is disabled via KAFKA_OFF=true');
        return;
    }
    try {
        await producer.connect();
        console.log('✔ Kafka Producer connected');
    } catch (error) {
        console.error('❌ Kafka Connection Error:', error);
    }
};

const sendMessage = async (topic, message) => {
    if (isKafkaOff) {
        console.log(`[Mock Kafka] Would send to ${topic}:`, message);
        return;
    }
    if (!producer) {
        console.error('❌ Kafka producer is not initialized');
        return;
    }
    try {
        await producer.send({
            topic,
            messages: [{ value: JSON.stringify(message) }],
        });
    } catch (error) {
        console.error(`❌ Error sending to Kafka topic ${topic}:`, error);
    }
};

module.exports = { producer, connectProducer, sendMessage };
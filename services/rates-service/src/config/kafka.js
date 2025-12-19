// services/rates-service/src/config/kafka.js
const { Kafka } = require('kafkajs');

const kafka = new Kafka({
    clientId: 'rates-service',
    brokers: [process.env.KAFKA_BROKERS || 'redpanda:9092']
});

const producer = kafka.producer();

const connectProducer = async () => {
    try {
        await producer.connect();
        console.log('✔ Kafka Producer connected');
    } catch (error) {
        console.error('❌ Kafka Connection Error:', error);
    }
};

module.exports = { producer, connectProducer };
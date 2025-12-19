// services/rates-service/src/config/redis.js
const { createClient } = require('redis');

const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://redis:6379'
});

redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));

(async () => {
    await redisClient.connect();
    console.log('✔ Connected to Redis');
})();

module.exports = redisClient;

// services/rates-service/src/config/redis.js
// Uses ioredis (already in package.json) — NOT the 'redis' v4 package.
// This client is used exclusively for publishing to Redis channels (RATE_EVENTS).
// It is NOT put in subscriber mode, so publish() is safe to call directly.
const Redis = require('ioredis');

const redisClient = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    retryStrategy: (times) => Math.min(times * 50, 2000),
});

redisClient.on('connect', () => console.log('✅ rates-service Redis connected'));
redisClient.on('error',   (err) => console.error('❌ rates-service Redis error:', err.message));

module.exports = redisClient;

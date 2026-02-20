const Redis = require('ioredis');

const redis = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: process.env.REDIS_PORT || 6379,
    retryStrategy: times => Math.min(times * 50, 2000)
});

redis.on('connect', () => console.log('✅ Upload Service connected to Redis'));
redis.on('error', (err) => console.error('❌ Redis Error:', err));

module.exports = redis;

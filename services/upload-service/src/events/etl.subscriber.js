const Redis = require('ioredis');
const { processQueue } = require('../queues/etl.queues');

const redisSub = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    retryStrategy: times => Math.min(times * 50, 2000),
});

redisSub.subscribe('ETL_EVENTS', (err) => {
    if (err) console.error('❌ [upload etl.subscriber] subscribe failed:', err.message);
    else console.log('✅ [upload-service] subscribed to ETL_EVENTS');
});

redisSub.on('message', async (channel, message) => {
    if (channel !== 'ETL_EVENTS') return;
    try {
        const payload = JSON.parse(message);
        if (payload.type !== 'ETL_START') return;

        const { sessionId, providerId, mapping, userId } = payload;
        await processQueue.add('process', {
            sessionId,
            providerId,
            mapping: mapping || null,
            userId,
        });
        console.log(`⚙️  [upload etl.subscriber] ETL_START → job enqueued session=${sessionId?.slice(-6)}`);
    } catch (err) {
        console.error('❌ [upload etl.subscriber] message error:', err.message);
    }
});

module.exports = redisSub;

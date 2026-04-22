const Redis = require('ioredis');
const RatesModel = require('../models/rates.model');
const pubsub = require('../config/pubsub');

const redisSub = new Redis({
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    retryStrategy: times => Math.min(times * 50, 2000),
});

redisSub.subscribe('ETL_EVENTS', (err) => {
    if (err) console.error('❌ [rates etl.subscriber] subscribe failed:', err.message);
    else console.log('✅ [rates-service] subscribed to ETL_EVENTS');
});

redisSub.on('message', async (channel, message) => {
    if (channel !== 'ETL_EVENTS') return;
    try {
        const payload = JSON.parse(message);

        if (payload.type === 'ETL_START') {
            await RatesModel.clearDrafts(payload.providerId);
            console.log(`🗑  [rates etl.subscriber] clearDrafts provider=${payload.providerId}`);
            return;
        }

        if (payload.type === 'ETL_BATCH') {
            const { providerId, rates } = payload;
            await RatesModel.bulkInsert(providerId, rates);

            pubsub.publish('RATE_UPDATED', {
                ratesUpdated: {
                    provider_id: providerId,
                    count: rates.length,
                    timestamp: new Date().toISOString(),
                },
            }).catch(err => console.error('⚠️  [rates] pubsub RATE_UPDATED error:', err.message));
        }
    } catch (err) {
        console.error('❌ [rates etl.subscriber] message error:', err.message);
    }
});

module.exports = redisSub;

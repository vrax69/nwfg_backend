const { Queue } = require('bullmq');

const connection = {
    host: process.env.REDIS_HOST || 'redis',
    port: parseInt(process.env.REDIS_PORT) || 6379,
};

// Stage 1: async MinIO backup + audit log insert (fire-and-forget from HTTP handler)
const auditQueue = new Queue('etl-audit', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: 100,
        removeOnFail: 50,
    },
});

// Stage 2: full ETL row processing (triggered by /confirm)
const processQueue = new Queue('etl-process', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 100,
        removeOnFail: 200,
    },
});

module.exports = { auditQueue, processQueue, connection };

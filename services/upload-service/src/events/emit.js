const redis = require('../config/redis');

const CHANNEL = 'UPLOAD_EVENTS';

async function emitUploadEvent(payload) {
    const message = JSON.stringify({
        ...payload,
        timestamp: new Date().toISOString(),
    });
    const receivers = await redis.publish(CHANNEL, message);
    console.log(`📡 [emit] ${payload.type} session=${payload.sessionId?.slice(-6)} → ${receivers} subscribers`);
}

module.exports = { emitUploadEvent };

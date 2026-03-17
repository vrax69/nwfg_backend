const Minio = require('minio');

// Guard: MinIO is optional (skip if not configured in env)
if (!process.env.MINIO_ENDPOINT) {
    console.warn('⚠️  MINIO_ENDPOINT not set — MinIO audit backup disabled');
}

const minioClient = process.env.MINIO_ENDPOINT
    ? new Minio.Client({
        endPoint:  process.env.MINIO_ENDPOINT,
        port:      parseInt(process.env.MINIO_PORT, 10) || 9000,
        useSSL:    process.env.MINIO_USE_SSL === 'true',
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY,
    })
    : null;

const MINIO_BUCKET = process.env.MINIO_BUCKET || 'nwfg-frontend';

module.exports = { minioClient, MINIO_BUCKET };

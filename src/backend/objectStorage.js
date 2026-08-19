const fs = require('fs-extra');
const path = require('path');
const { Readable } = require('stream');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

class ObjectStorage {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    if (config.environment === 'production' && config.objectStorage.mode !== 'local' && (!config.objectStorage.endpoint || !config.objectStorage.accessKeyId || !config.objectStorage.secretAccessKey)) throw new Error('private_object_storage_required');
    this.s3 = config.objectStorage.endpoint || config.objectStorage.accessKeyId ? new S3Client({
      region: config.objectStorage.region,
      endpoint: config.objectStorage.endpoint || undefined,
      forcePathStyle: config.objectStorage.forcePathStyle,
      credentials: config.objectStorage.accessKeyId ? { accessKeyId: config.objectStorage.accessKeyId, secretAccessKey: config.objectStorage.secretAccessKey } : undefined
    }) : null;
  }

  safeKey(key) {
    const normalized = String(key || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalized || normalized.includes('..')) throw new Error('invalid_object_key');
    return normalized;
  }

  async putFile(key, filePath, contentType = 'application/octet-stream') {
    return this.putObject(key, await fs.readFile(filePath), contentType);
  }

  async putObject(key, body, contentType = 'application/octet-stream') {
    const safeKey = this.safeKey(key);
    if (this.s3) {
      const command = new PutObjectCommand({ Bucket: this.config.objectStorage.bucket, Key: safeKey, Body: body, ContentType: contentType, ServerSideEncryption: this.config.objectStorage.sse });
      await this.s3.send(command); return { key: safeKey, durable: true };
    }
    const filePath = path.join(this.config.objectStorage.localPath, safeKey);
    await fs.ensureDir(path.dirname(filePath));
    if (Buffer.isBuffer(body) || typeof body === 'string') await fs.writeFile(filePath, body);
    else if (body instanceof Readable) await new Promise((resolve, reject) => { const output = fs.createWriteStream(filePath); body.pipe(output).on('finish', resolve).on('error', reject); });
    else throw new Error('unsupported_object_body');
    return { key: safeKey, durable: false };
  }

  resolveLocalPath(key) {
    if (this.s3) return null;
    return path.join(this.config.objectStorage.localPath, this.safeKey(key));
  }

  async getSignedDownloadUrl(key, expiresIn = 300) {
    const safeKey = this.safeKey(key);
    if (this.s3) return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.config.objectStorage.bucket, Key: safeKey }), { expiresIn });
    return `/api/artifacts/local/${encodeURIComponent(safeKey)}`;
  }

  async deleteObject(key) {
    const safeKey = this.safeKey(key);
    if (this.s3) { await this.s3.send(new DeleteObjectCommand({ Bucket: this.config.objectStorage.bucket, Key: safeKey })); return; }
    await fs.remove(path.join(this.config.objectStorage.localPath, safeKey));
  }

  async cleanupExpired(artifacts) {
    const now = Date.now();
    for (const artifact of artifacts) {
      if (artifact.retentionUntil && new Date(artifact.retentionUntil).getTime() <= now) {
        await this.deleteObject(artifact.objectKey);
      }
    }
  }
}

module.exports = ObjectStorage;

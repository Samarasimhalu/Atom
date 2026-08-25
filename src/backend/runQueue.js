const { Queue, Worker } = require('bullmq');
const IORedis = require('ioredis');

class RunQueue {
  constructor(config, logger = console) {
    this.config = config;
    this.logger = logger;
    this.queueName = config.queue.name;
    this.connection = config.queue.redisUrl ? new IORedis(config.queue.redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: true, tls: config.environment === 'production' ? {} : undefined }) : null;
    if (config.environment === 'production' && config.queue.mode !== 'local' && !this.connection) throw new Error('durable_queue_required');
    this.queue = this.connection ? new Queue(this.queueName, { connection: this.connection }) : null;
    this.worker = null;
    this.localJobs = new Map();
    this.activeJobs = new Set();
  }

  async enqueue(runId, payload) {
    if (this.queue) {
      const job = await this.queue.add('execute-run', { runId, ...payload }, { jobId: runId, removeOnComplete: 1000, removeOnFail: 5000, attempts: this.config.queue.attempts, backoff: { type: 'exponential', delay: 1000 } });
      return { id: job.id, durable: true };
    }
    const timer = setImmediate(() => {
      const job = this.localJobs.get(runId);
      if (job && !job.cancelled && this.handler) {
        const activeJob = Promise.resolve(this.handler({ id: runId, data: { runId, ...payload } }))
          .catch(error => this.logger.error('queue.local.job_failed', { runId, error: error.message }))
          .finally(() => this.activeJobs.delete(activeJob));
        this.activeJobs.add(activeJob);
      }
    });
    this.localJobs.set(runId, { timer, cancelled: false });
    return { id: runId, durable: false };
  }

  registerHandler(handler) {
    this.handler = handler;
    if (this.queue && !this.worker) {
      this.worker = new Worker(this.queueName, handler, { connection: this.connection, concurrency: this.config.queue.concurrency });
      this.worker.on('failed', (job, error) => this.logger.error('queue.job_failed', { runId: job?.data?.runId, error: error.message }));
      this.worker.on('error', error => this.logger.error('queue.worker_error', { error: error.message }));
    }
  }

  async cancel(runId) {
    if (this.queue) {
      const job = await this.queue.getJob(runId);
      if (job) await job.remove();
      return Boolean(job);
    }
    const local = this.localJobs.get(runId);
    if (!local) return false;
    local.cancelled = true; clearImmediate(local.timer); this.localJobs.delete(runId); return true;
  }

  async close() {
    await Promise.all([...this.activeJobs]);
    if (this.worker) await this.worker.close();
    if (this.queue) await this.queue.close();
    if (this.connection) await this.connection.quit();
  }
}

module.exports = RunQueue;

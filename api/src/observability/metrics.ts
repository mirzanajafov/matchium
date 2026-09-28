import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequests = new Counter({
  name: 'matchium_http_requests_total',
  help: 'HTTP requests by method, route template and status code',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [registry],
});

export const httpDuration = new Histogram({
  name: 'matchium_http_request_duration_seconds',
  help: 'HTTP request duration by method and route template',
  labelNames: ['method', 'route'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

export const pushDeliveries = new Counter({
  name: 'matchium_push_deliveries_total',
  help: 'Web push deliveries by result',
  labelNames: ['result'] as const,
  registers: [registry],
});

export const emailsSent = new Counter({
  name: 'matchium_emails_total',
  help: 'Emails by kind and result',
  labelNames: ['kind', 'result'] as const,
  registers: [registry],
});

export const rateLimited = new Counter({
  name: 'matchium_rate_limited_total',
  help: 'Requests refused by a rate limit rule',
  labelNames: ['rule'] as const,
  registers: [registry],
});

export const openStreams = new Gauge({
  name: 'matchium_chat_streams_open',
  help: 'Chat event streams currently open on this instance',
  registers: [registry],
});

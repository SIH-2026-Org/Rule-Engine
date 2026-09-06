import express from 'express';
import webhookRoutes from './routes/webhook.routes.js';
import engineRoutes  from './routes/engine.routes.js';

const app = express();

// Parse JSON while preserving raw body for HMAC SHA-256 signature verification
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ─── Root info endpoint ───────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.status(200).json({
    service: 'SAARTHI-SETU',
    tagline: 'One Call. Right Scheme. Right Door.',
    version: '1.0.0',
    endpoints: {
      health:    'GET  /health',
      webhook:   'POST /webhook',
      match:     'POST /api/v1/match',
      schemes:   'GET  /api/v1/schemes',
      scheme:    'GET  /api/v1/scheme/:id',
      simulate:  'POST /api/v1/simulate',
      engine_hc: 'GET  /api/v1/engine/health',
    },
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'saarthi-setu' });
});

// ─── WhatsApp Webhook ─────────────────────────────────────────────────────────
app.use('/webhook', webhookRoutes);

// ─── Rule Engine API (channel-agnostic) ──────────────────────────────────────
// All channels: WhatsApp, IVR, SMS, Web, Mobile, CSC → POST /api/v1/match
app.use('/api/v1', engineRoutes);

export default app;

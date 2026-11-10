import { Router } from 'express';
import { dbHealth } from './db.js';

export const api = Router();

api.get('/health', async (_req, res) => {
  try {
    res.json({ status: 'ok', db: await dbHealth() });
  } catch (err) {
    res.status(503).json({ status: 'degraded', db: { error: err.message } });
  }
});

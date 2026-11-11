import express from 'express';
import { requireAuth } from './auth.js';
import shiftsRouter from './routes/shifts.js';
import botRouter from './routes/bot.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/messages', botRouter);
app.use('/api', requireAuth, shiftsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error' });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`checador-api listening on :${port}`);
});

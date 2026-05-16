import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import categoriesRoutes from './routes/categories';
import propertiesRoutes from './routes/properties';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({ origin: '*', credentials: true }));

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/auth', authRoutes);
app.route('/api/categories', categoriesRoutes);
app.route('/api/properties', propertiesRoutes);

app.get('/api/settings/public', async (c) => {
  const rows = await c.env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('company_name','company_logo_url','currency')"
  ).all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const row of rows.results) out[row.key] = row.value;
  return c.json({
    company_name: out['company_name'] ?? 'BillTrack',
    logo_url: out['company_logo_url'] ?? '',
    currency: out['currency'] ?? 'AED',
  });
});

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/index.html';
  return c.env.ASSETS.fetch(url.toString());
});

export default app;

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import categoriesRoutes from './routes/categories';
import propertiesRoutes from './routes/properties';
import billsRoutes from './routes/bills';
import billEntriesRoutes from './routes/bill-entries';
import billAttachmentsRoutes from './routes/bill-attachments';
import buildingsRoutes from './routes/buildings';
import unitsRoutes from './routes/units';
import tenantsRoutes from './routes/tenants';
import leasesRoutes from './routes/leases';
import rentPaymentsRoutes from './routes/rent-payments';
import rentalDocsRoutes from './routes/rental-documents';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({ origin: '*', credentials: true }));

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/auth', authRoutes);
app.route('/api/categories', categoriesRoutes);
app.route('/api/properties', propertiesRoutes);
app.route('/api/bills', billsRoutes);
app.route('/api/bill-entries', billEntriesRoutes);
app.route('/api/bill-attachments', billAttachmentsRoutes);
app.route('/api/buildings', buildingsRoutes);
app.route('/api/units', unitsRoutes);
app.route('/api/tenants', tenantsRoutes);
app.route('/api/leases', leasesRoutes);
app.route('/api/rent-payments', rentPaymentsRoutes);
app.route('/api/rental-documents', rentalDocsRoutes);

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

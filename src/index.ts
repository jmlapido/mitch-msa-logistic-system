import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './routes/auth';
import categoriesRoutes from './routes/categories';
import billsRoutes from './routes/bills';
import billEntriesRoutes from './routes/bill-entries';
import billAttachmentsRoutes from './routes/bill-attachments';
import buildingsRoutes from './routes/buildings';
import unitsRoutes from './routes/units';
import tenantsRoutes from './routes/tenants';
import leasesRoutes from './routes/leases';
import rentPaymentsRoutes from './routes/rent-payments';
import rentalDocsRoutes from './routes/rental-documents';
import contractsRoutes from './routes/contracts';
import pdcChequesRoutes from './routes/pdc-cheques';
import dashboardRoutes from './routes/dashboard';
import reportsRoutes from './routes/reports';
import settingsRoutes from './routes/settings';
import usersRoutes from './routes/users';
import type { Env } from './types';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors({ origin: '*', credentials: true }));

app.get('/api/health', (c) => c.json({ ok: true }));

app.route('/api/auth', authRoutes);
app.route('/api/categories', categoriesRoutes);
app.route('/api/bills', billsRoutes);
app.route('/api/bill-entries', billEntriesRoutes);
app.route('/api/bill-attachments', billAttachmentsRoutes);
app.route('/api/buildings', buildingsRoutes);
app.route('/api/units', unitsRoutes);
app.route('/api/tenants', tenantsRoutes);
app.route('/api/leases', leasesRoutes);
app.route('/api/rent-payments', rentPaymentsRoutes);
app.route('/api/rental-documents', rentalDocsRoutes);
app.route('/api/contracts', contractsRoutes);
app.route('/api/pdc-cheques', pdcChequesRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/users', usersRoutes);

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/index.html';
  return c.env.ASSETS.fetch(url.toString());
});

export default app;

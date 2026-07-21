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
import auditLogsRoutes from './routes/audit-logs';
import partnersRoutes from './routes/partners';
import partnerPaymentsRoutes from './routes/partner-payments';
import commissionsRoutes from './routes/commissions';
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
app.route('/api/audit-logs', auditLogsRoutes);
app.route('/api/partners', partnersRoutes);
app.route('/api/partner-payments', partnerPaymentsRoutes);
app.route('/api/commissions', commissionsRoutes);

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/index.html';
  return c.env.ASSETS.fetch(url.toString());
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // Purge financial data 1 year after tenant archive
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);
    const cutoffStr = cutoff.toISOString();

    const { results: expiredTenants } = await env.DB.prepare(
      "SELECT id FROM tenants WHERE status = 'archived' AND archived_at < ?"
    ).bind(cutoffStr).all<{ id: number }>();

    for (const { id } of expiredTenants) {
      try {
        await env.DB.prepare(
          'DELETE FROM rent_payments WHERE contract_id IN (SELECT id FROM contracts WHERE tenant_id = ?)'
        ).bind(id).run();

        // Delete PDC cheque R2 files
        const { results: pdcFiles } = await env.DB.prepare(
          'SELECT file_key FROM pdc_cheques WHERE contract_id IN (SELECT id FROM contracts WHERE tenant_id = ?) AND file_key IS NOT NULL'
        ).bind(id).all<{ file_key: string }>();
        for (const { file_key } of pdcFiles) {
          await env.R2.delete(file_key).catch(() => {});
        }

        await env.DB.prepare(
          'DELETE FROM pdc_cheques WHERE contract_id IN (SELECT id FROM contracts WHERE tenant_id = ?)'
        ).bind(id).run();

        const { results: docs } = await env.DB.prepare(
          "SELECT file_key FROM rental_documents WHERE entity_type = 'tenant' AND entity_id = ? AND file_key IS NOT NULL"
        ).bind(id).all<{ file_key: string }>();
        for (const { file_key } of docs) {
          await env.R2.delete(file_key).catch(() => {});
        }
        await env.DB.prepare(
          "DELETE FROM rental_documents WHERE entity_type = 'tenant' AND entity_id = ?"
        ).bind(id).run();
      } catch (e) {
        console.error(`[cleanup] failed for tenant ${id}:`, e);
      }
    }
  },
};

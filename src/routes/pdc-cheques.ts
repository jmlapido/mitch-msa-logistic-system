import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

type PdcRow = {
  id: number; contract_id: number; pdc_number: number;
  cheque_date: string | null; file_name: string | null;
  file_key: string | null; file_size: number | null;
  file_type: string | null; updated_at: string;
};

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
router.use('*', requireAuth);

router.get('/', async (c) => {
  const contractId = c.req.query('contract_id');
  if (!contractId) return c.json({ error: 'contract_id required' }, 400);
  const { results } = await c.env.DB.prepare(
    'SELECT id, contract_id, pdc_number, cheque_date, file_name, file_size, file_type, updated_at FROM pdc_cheques WHERE contract_id = ? ORDER BY pdc_number'
  ).bind(Number(contractId)).all<PdcRow>();
  return c.json(results);
});

router.post('/date', requireAdmin, zValidator('json', z.object({
  contract_id: z.number().int().positive(),
  pdc_number: z.number().int().min(1),
  cheque_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
})), async (c) => {
  const user = c.get('user');
  const { contract_id, pdc_number, cheque_date } = c.req.valid('json');
  await c.env.DB.prepare(`
    INSERT INTO pdc_cheques (contract_id, pdc_number, cheque_date, updated_at)
    VALUES (?,?,?,datetime('now'))
    ON CONFLICT (contract_id, pdc_number)
    DO UPDATE SET cheque_date = excluded.cheque_date, updated_at = datetime('now')
  `).bind(contract_id, pdc_number, cheque_date).run();
  const row = await c.env.DB.prepare(
    'SELECT id, contract_id, pdc_number, cheque_date, file_name, file_size, file_type, updated_at FROM pdc_cheques WHERE contract_id = ? AND pdc_number = ?'
  ).bind(contract_id, pdc_number).first();
  await auditLog(c.env.DB, user, 'pdc.date_set', 'pdc', (row as { id?: number } | null)?.id ?? null, `Contract ${contract_id} PDC #${pdc_number} → ${cheque_date}`);
  return c.json(row);
});

router.post('/upload', requireAdmin, async (c) => {
  const user = c.get('user');
  const fd = await c.req.formData();
  const contractId = Number(fd.get('contract_id'));
  const pdcNumber = Number(fd.get('pdc_number'));
  const file = fd.get('file') as File | null;
  if (!contractId || !pdcNumber || !file) return c.json({ error: 'Missing fields' }, 400);
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];
  if (!allowed.includes(file.type)) return c.json({ error: 'Invalid file type (jpg/png/webp/heic/pdf)' }, 400);
  if (file.size > 10 * 1024 * 1024) return c.json({ error: 'File too large (max 10MB)' }, 400);

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const key = `pdc/${contractId}/${pdcNumber}/${Date.now()}.${ext}`;
  await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const existing = await c.env.DB.prepare(
    'SELECT file_key FROM pdc_cheques WHERE contract_id = ? AND pdc_number = ?'
  ).bind(contractId, pdcNumber).first<{ file_key: string | null }>();
  if (existing?.file_key) await c.env.R2.delete(existing.file_key).catch(() => {});

  await c.env.DB.prepare(`
    INSERT INTO pdc_cheques (contract_id, pdc_number, file_name, file_key, file_size, file_type, uploaded_by, updated_at)
    VALUES (?,?,?,?,?,?,?,datetime('now'))
    ON CONFLICT (contract_id, pdc_number)
    DO UPDATE SET file_name = excluded.file_name, file_key = excluded.file_key,
      file_size = excluded.file_size, file_type = excluded.file_type,
      uploaded_by = excluded.uploaded_by, updated_at = datetime('now')
  `).bind(contractId, pdcNumber, file.name, key, file.size, file.type, user.sub).run();

  const row = await c.env.DB.prepare(
    'SELECT id, contract_id, pdc_number, cheque_date, file_name, file_size, file_type, updated_at FROM pdc_cheques WHERE contract_id = ? AND pdc_number = ?'
  ).bind(contractId, pdcNumber).first();
  await auditLog(c.env.DB, user, 'pdc.file_uploaded', 'pdc', (row as { id?: number } | null)?.id ?? null, `Contract ${contractId} PDC #${pdcNumber}: ${file.name}`);
  return c.json(row, 201);
});

router.delete('/:id/file', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT file_key FROM pdc_cheques WHERE id = ?').bind(id).first<{ file_key: string | null }>();
  if (row?.file_key) await c.env.R2.delete(row.file_key).catch(() => {});
  await c.env.DB.prepare(
    "UPDATE pdc_cheques SET file_name = NULL, file_key = NULL, file_size = NULL, file_type = NULL, updated_at = datetime('now') WHERE id = ?"
  ).bind(id).run();
  await auditLog(c.env.DB, user, 'pdc.file_deleted', 'pdc', id, `Removed file from PDC #${id}`);
  return c.json({ ok: true });
});

router.get('/:id/file', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare(
    'SELECT file_key, file_type, file_name FROM pdc_cheques WHERE id = ?'
  ).bind(id).first<{ file_key: string; file_type: string; file_name: string }>();
  if (!row?.file_key) return c.json({ error: 'No file' }, 404);
  const obj = await c.env.R2.get(row.file_key);
  if (!obj) return c.json({ error: 'File not found' }, 404);
  return new Response(obj.body, {
    headers: {
      'Content-Type': row.file_type,
      'Content-Disposition': `inline; filename="${row.file_name}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
});

export default router;

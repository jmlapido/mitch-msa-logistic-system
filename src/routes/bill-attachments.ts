import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/heic', 'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
function maxSizeFor(type: string) {
  return type === 'application/pdf' ? 20 * 1024 * 1024 : 5 * 1024 * 1024;
}

const billAttachments = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
billAttachments.use('*', requireAuth);

// POST /api/bill-attachments — multipart upload
billAttachments.post('/', async (c) => {
  const user = c.get('user');
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const entryId = Number(formData.get('entry_id'));

  if (!file) return c.json({ error: 'No file provided' }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return c.json({ error: 'File type not allowed' }, 400);
  if (file.size > maxSizeFor(file.type)) return c.json({ error: 'File too large (images/docs: 5 MB, PDF: 20 MB)' }, 400);
  if (!entryId) return c.json({ error: 'entry_id required' }, 400);

  const entry = await c.env.DB.prepare('SELECT id FROM bill_entries WHERE id = ?').bind(entryId).first();
  if (!entry) return c.json({ error: 'Bill entry not found' }, 404);

  const ext = file.name.split('.').pop() ?? 'bin';
  const key = `bills/${entryId}/${crypto.randomUUID()}.${ext}`;

  await c.env.R2.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type },
  });

  const attachment = await c.env.DB.prepare(
    `INSERT INTO bill_attachments (bill_entry_id, file_name, file_key, file_size, file_type, uploaded_by)
     VALUES (?,?,?,?,?,?) RETURNING *`
  ).bind(entryId, file.name, key, file.size, file.type, user.sub).first();

  return c.json(attachment, 201);
});

// GET /api/bill-attachments/:id/download — stream file from R2
billAttachments.get('/:id/download', async (c) => {
  const id = Number(c.req.param('id'));
  const att = await c.env.DB.prepare(
    'SELECT * FROM bill_attachments WHERE id = ?'
  ).bind(id).first<{ file_key: string; file_name: string; file_type: string }>();
  if (!att) return c.json({ error: 'Not found' }, 404);

  const obj = await c.env.R2.get(att.file_key);
  if (!obj) return c.json({ error: 'File not found in storage' }, 404);

  return new Response(obj.body, {
    headers: {
      'Content-Type': att.file_type,
      'Content-Disposition': `inline; filename="${att.file_name}"`,
    },
  });
});

// GET /api/bill-attachments?entry_id=X
billAttachments.get('/', async (c) => {
  const entryId = Number(c.req.query('entry_id'));
  if (!entryId) return c.json([]);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM bill_attachments WHERE bill_entry_id = ? ORDER BY uploaded_at'
  ).bind(entryId).all();
  return c.json(results);
});

// DELETE /api/bill-attachments/:id
billAttachments.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const att = await c.env.DB.prepare(
    'SELECT file_key FROM bill_attachments WHERE id = ?'
  ).bind(id).first<{ file_key: string }>();
  if (!att) return c.json({ error: 'Not found' }, 404);
  await c.env.R2.delete(att.file_key);
  await c.env.DB.prepare('DELETE FROM bill_attachments WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

export default billAttachments;

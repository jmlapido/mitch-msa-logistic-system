import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
const MAX_SIZE = 10 * 1024 * 1024;

const rentalDocs = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
rentalDocs.use('*', requireAuth);

rentalDocs.get('/', async (c) => {
  const entityType = c.req.query('entity_type');
  const entityId = Number(c.req.query('entity_id'));
  if (!entityType || !entityId) return c.json([]);
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM rental_documents WHERE entity_type = ? AND entity_id = ? ORDER BY uploaded_at DESC'
  ).bind(entityType, entityId).all();
  return c.json(results);
});

rentalDocs.post('/', async (c) => {
  const user = c.get('user');
  const fd = await c.req.formData();
  const file = fd.get('file') as File | null;
  const entityType = fd.get('entity_type') as string;
  const entityId = Number(fd.get('entity_id'));
  const docType = (fd.get('doc_type') as string) || 'other';

  if (!file) return c.json({ error: 'No file' }, 400);
  if (!ALLOWED_TYPES.includes(file.type)) return c.json({ error: 'File type not allowed' }, 400);
  if (file.size > MAX_SIZE) return c.json({ error: 'File exceeds 10MB' }, 400);
  if (!['lease', 'tenant', 'unit'].includes(entityType)) return c.json({ error: 'Invalid entity_type' }, 400);

  const ext = file.name.split('.').pop() ?? 'bin';
  const key = `rentals/${entityType}/${entityId}/${crypto.randomUUID()}.${ext}`;
  await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const doc = await c.env.DB.prepare(
    `INSERT INTO rental_documents (entity_type, entity_id, doc_type, file_name, file_key, file_size, file_type, uploaded_by)
     VALUES (?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(entityType, entityId, docType, file.name, key, file.size, file.type, user.sub).first();
  return c.json(doc, 201);
});

rentalDocs.get('/:id/download', async (c) => {
  const doc = await c.env.DB.prepare('SELECT * FROM rental_documents WHERE id = ?')
    .bind(Number(c.req.param('id'))).first<{ file_key: string; file_name: string; file_type: string }>();
  if (!doc) return c.json({ error: 'Not found' }, 404);
  const obj = await c.env.R2.get(doc.file_key);
  if (!obj) return c.json({ error: 'File not found in storage' }, 404);
  return new Response(obj.body, {
    headers: { 'Content-Type': doc.file_type, 'Content-Disposition': `inline; filename="${doc.file_name}"` },
  });
});

rentalDocs.delete('/:id', requireAdmin, async (c) => {
  const doc = await c.env.DB.prepare('SELECT file_key FROM rental_documents WHERE id = ?')
    .bind(Number(c.req.param('id'))).first<{ file_key: string }>();
  if (!doc) return c.json({ error: 'Not found' }, 404);
  await c.env.R2.delete(doc.file_key);
  await c.env.DB.prepare('DELETE FROM rental_documents WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default rentalDocs;

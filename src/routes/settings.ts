import { Hono } from 'hono';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const settings = new Hono<{ Bindings: Env }>();

settings.get('/public', async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT key, value FROM settings WHERE key IN ('company_name','company_logo_url','currency')"
  ).all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const row of results) out[row.key] = row.value;
  return c.json({
    company_name: out['company_name'] ?? 'BillTrack',
    logo_url: out['company_logo_url'] ?? '',
    currency: out['currency'] ?? 'AED',
  });
});

settings.get('/unit_types', requireAuth, async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'unit_types'").first<{ value: string }>();
  const types: string[] = row ? JSON.parse(row.value) : ['room', 'shop', 'apartment', 'office', 'villa'];
  return c.json(types);
});

settings.get('/', requireAuth, requireAdmin, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>();
  const out: Record<string, string> = {};
  for (const row of results) out[row.key] = row.value;
  return c.json(out);
});

settings.put('/:key', requireAuth, requireAdmin, async (c) => {
  const key = c.req.param('key');
  const { value } = await c.req.json<{ value: string }>();
  await c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').bind(key, value).run();
  return c.json({ key, value });
});

settings.post('/logo', requireAuth, requireAdmin, async (c) => {
  const fd = await c.req.formData();
  const file = fd.get('file') as File | null;
  if (!file) return c.json({ error: 'No file' }, 400);
  if (!['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'].includes(file.type))
    return c.json({ error: 'Invalid image type' }, 400);
  if (file.size > 2 * 1024 * 1024) return c.json({ error: 'Logo must be under 2MB' }, 400);

  const ext = file.name.split('.').pop() ?? 'png';
  const key = `branding/logo.${ext}`;
  await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });

  const logoUrl = `/api/settings/logo/file`;
  await c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').bind('company_logo_url', logoUrl).run();
  await c.env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)').bind('company_logo_key', key).run();
  return c.json({ logo_url: logoUrl });
});

settings.get('/logo/file', async (c) => {
  const row = await c.env.DB.prepare("SELECT value FROM settings WHERE key = 'company_logo_key'")
    .first<{ value: string }>();
  if (!row) return c.json({ error: 'No logo' }, 404);
  const obj = await c.env.R2.get(row.value);
  if (!obj) return c.json({ error: 'File not found' }, 404);
  return new Response(obj.body, {
    headers: { 'Content-Type': obj.httpMetadata?.contentType ?? 'image/png', 'Cache-Control': 'public, max-age=86400' },
  });
});

export default settings;

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { auditLog } from '../lib/auditLog';
import type { AuthVariables } from '../middleware/requireAuth';
import type { Env } from '../types';

const bills = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
bills.use('*', requireAuth);

const billSchema = z.object({
  category_id: z.number().int().positive(),
  particulars: z.string().min(1).max(100),
  account_no: z.string().max(60).nullish(),
  due_day: z.number().int().min(1).max(28).nullish(),
  is_recurring: z.coerce.boolean().default(true),
  notes: z.string().nullish(),
  building_id: z.number().int().positive().nullish(),
});

bills.get('/', async (c) => {
  const buildingId = c.req.query('building_id') ? Number(c.req.query('building_id')) : null;
  let query = `
    SELECT b.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
           p.name as property_name, p.type as property_type,
           bld.name as building_name
    FROM bills b
    JOIN categories c ON b.category_id = c.id
    LEFT JOIN properties p ON b.property_id = p.id
    LEFT JOIN buildings bld ON b.building_id = bld.id
    WHERE 1=1
  `;
  const binds: unknown[] = [];
  if (buildingId) { query += ' AND b.building_id = ?'; binds.push(buildingId); }
  query += ' ORDER BY c.sort_order, c.name, COALESCE(bld.name, p.name), b.particulars';
  const { results } = await c.env.DB.prepare(query).bind(...binds).all();
  return c.json(results);
});

const createBillSchema = billSchema.extend({ amount: z.number().min(0).default(0) });

bills.post('/', requireAdmin, zValidator('json', createBillSchema), async (c) => {
  const user = c.get('user');
  const { amount, ...data } = c.req.valid('json');
  const month = c.req.query('month') ?? new Date().toISOString().slice(0, 7);

  const result = await c.env.DB.prepare(
    `INSERT INTO bills (category_id, particulars, account_no, due_day, is_recurring, notes, building_id, created_by)
     VALUES (?,?,?,?,?,?,?,?) RETURNING *`
  ).bind(
    data.category_id, data.particulars, data.account_no ?? null,
    data.due_day ?? null, data.is_recurring ? 1 : 0, data.notes ?? null,
    data.building_id ?? null, user.sub
  ).first<{ id: number }>();

  let entry_id: number | null = null;
  if (result) {
    const entry = await c.env.DB.prepare(
      `INSERT OR IGNORE INTO bill_entries (bill_id, month, amount, status, updated_by) VALUES (?,?,?,'unpaid',?) RETURNING id`
    ).bind(result.id, month, amount, user.sub).first<{ id: number }>();
    if (entry) {
      entry_id = entry.id;
    } else {
      const existing = await c.env.DB.prepare(
        `SELECT id FROM bill_entries WHERE bill_id = ? AND month = ?`
      ).bind(result.id, month).first<{ id: number }>();
      entry_id = existing?.id ?? null;
    }
  }

  await auditLog(c.env.DB, user, 'bill.created', 'bill', result?.id ?? null, `Bill: ${data.particulars}`);
  return c.json({ ...result, entry_id }, 201);
});

bills.put('/:id', requireAdmin, zValidator('json', billSchema.partial()), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const dbData = {
    ...data,
    is_recurring: data.is_recurring !== undefined ? (data.is_recurring ? 1 : 0) : undefined,
  };
  const entries = Object.entries(dbData).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return c.json({ error: 'No fields to update' }, 400);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = [...entries.map(([, v]) => v), id];
  await c.env.DB.prepare(`UPDATE bills SET ${fields} WHERE id = ?`).bind(...values).run();
  await auditLog(c.env.DB, user, 'bill.edited', 'bill', id, `Updated: ${Object.keys(data).join(', ')}`);
  return c.json(await c.env.DB.prepare('SELECT * FROM bills WHERE id = ?').bind(id).first());
});

bills.delete('/:id', requireAdmin, async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('DELETE FROM bills WHERE id = ?').bind(id).run();
  await auditLog(c.env.DB, user, 'bill.deleted', 'bill', id);
  return c.json({ ok: true });
});

export default bills;

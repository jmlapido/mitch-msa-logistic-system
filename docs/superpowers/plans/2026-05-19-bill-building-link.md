# Bill-to-Building Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow bill categories to be flagged as building-linked, show a building picker on the bill form when relevant, and add building filters to the bills list and reports.

**Architecture:** Two SQLite `ALTER TABLE` migrations add `links_to_building` to `categories` and `building_id` to `bills`. Backend routes are updated to expose and filter by these fields. The frontend adds a conditional building dropdown in `BillFormModal`, a building filter chip in `BillsTable`, and a building selector in the Reports page.

**Tech Stack:** Hono (Cloudflare Workers), D1 SQLite, React + Tanstack Query, Zod, React Hook Form, Radix UI Select/Dialog, Tailwind CSS

---

## File Map

| File | Change |
|------|--------|
| `migrations/0003-bill-building-link.sql` | NEW — two ALTER TABLE statements |
| `schema.sql` | Update to reflect new columns (docs only) |
| `src/routes/categories.ts` | Accept + persist `links_to_building` |
| `src/routes/bills.ts` | Accept `building_id`, JOIN buildings in GET, support `?building_id=` filter |
| `src/routes/bill-entries.ts` | Add `building_id` + `building_name` to SELECT |
| `src/routes/reports.ts` | Apply `building_id` filter to all three bills sub-queries |
| `client/src/lib/hooks/useCategories.ts` | Add `links_to_building` to `Category` type |
| `client/src/lib/hooks/useBills.ts` | Add `building_id`, `building_name` to `BillEntry` + `BillTemplate`; add `building_id` to `BillCreateInput` |
| `client/src/pages/Settings.tsx` | Add checkbox + badge to `CategoriesTab` |
| `client/src/components/bills/BillFormModal.tsx` | Add conditional building dropdown |
| `client/src/components/bills/BillsTable.tsx` | Add building filter dropdown |
| `client/src/pages/Reports.tsx` | Add building state + selector; pass `buildingName` to view |
| `client/src/components/reports/BillsReportView.tsx` | Accept + display `buildingName` in subtitle |

---

## Task 1: DB Migration

**Files:**
- Create: `migrations/0003-bill-building-link.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/0003-bill-building-link.sql
ALTER TABLE categories ADD COLUMN links_to_building INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN building_id INTEGER REFERENCES buildings(id);
```

- [ ] **Step 2: Apply locally**

```bash
npx wrangler d1 execute mitch-app-db --local --file=migrations/0003-bill-building-link.sql
```

Expected output:
```
🌀 Executing on local database mitch-app-db ...
🚣 Executed 2 commands in ...
```

- [ ] **Step 3: Update schema.sql to document the new columns**

In `schema.sql`, find the `categories` table definition and add the new column before the closing `);`:

```sql
-- Bill categories
CREATE TABLE IF NOT EXISTS categories (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  color             TEXT NOT NULL DEFAULT '#3b82f6',
  icon              TEXT NOT NULL DEFAULT '📋',
  sort_order        INTEGER NOT NULL DEFAULT 0,
  links_to_building INTEGER NOT NULL DEFAULT 0
);
```

In `schema.sql`, find the `bills` table and add `building_id` after `property_id`:

```sql
-- Recurring bill templates
CREATE TABLE IF NOT EXISTS bills (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  property_id  INTEGER REFERENCES properties(id),
  building_id  INTEGER REFERENCES buildings(id),
  particulars  TEXT NOT NULL,
  account_no   TEXT,
  due_day      INTEGER,
  is_recurring INTEGER NOT NULL DEFAULT 1,
  notes        TEXT,
  created_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- [ ] **Step 4: Commit**

```bash
git add migrations/0003-bill-building-link.sql schema.sql
git commit -m "feat: add links_to_building to categories and building_id to bills"
```

---

## Task 2: Backend — categories route

**Files:**
- Modify: `src/routes/categories.ts`

- [ ] **Step 1: Add `links_to_building` to the Zod schema and POST handler**

Replace the entire file content of `src/routes/categories.ts`:

```ts
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import type { Env } from '../types';

const categories = new Hono<{ Bindings: Env }>();

categories.use('*', requireAuth);

const categorySchema = z.object({
  name: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  icon: z.string().max(10).default('📋'),
  sort_order: z.number().int().default(0),
  links_to_building: z.coerce.boolean().default(false),
});

categories.get('/', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM categories ORDER BY sort_order, name'
  ).all();
  return c.json(results);
});

categories.post('/', requireAdmin, zValidator('json', categorySchema), async (c) => {
  const data = c.req.valid('json');
  const result = await c.env.DB.prepare(
    'INSERT INTO categories (name, color, icon, sort_order, links_to_building) VALUES (?,?,?,?,?) RETURNING *'
  ).bind(data.name, data.color, data.icon, data.sort_order, data.links_to_building ? 1 : 0).first();
  return c.json(result, 201);
});

categories.put('/:id', requireAdmin, zValidator('json', categorySchema.partial()), async (c) => {
  const id = Number(c.req.param('id'));
  const data = c.req.valid('json');
  const dbData = {
    ...data,
    links_to_building: data.links_to_building !== undefined ? (data.links_to_building ? 1 : 0) : undefined,
  };
  const entries = Object.entries(dbData).filter(([, v]) => v !== undefined);
  const fields = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = [...entries.map(([, v]) => v), id];
  await c.env.DB.prepare(`UPDATE categories SET ${fields} WHERE id = ?`).bind(...values).run();
  const updated = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
  return c.json(updated);
});

categories.delete('/:id', requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

export default categories;
```

- [ ] **Step 2: Verify by running the API and checking the categories response**

Start the API: `npm run dev:api`

Visit `http://localhost:8787/api/categories` — each category object should include `"links_to_building": 0`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/categories.ts
git commit -m "feat: expose links_to_building on categories API"
```

---

## Task 3: Backend — bills route

**Files:**
- Modify: `src/routes/bills.ts`

- [ ] **Step 1: Update billSchema, GET, and POST to include building_id**

Replace the entire file content of `src/routes/bills.ts`:

```ts
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
  query += ' ORDER BY c.sort_order, c.name, bld.name, b.particulars';
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
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/bills.ts
git commit -m "feat: add building_id to bills API (GET join, POST/PUT accept)"
```

---

## Task 4: Backend — bill-entries route

**Files:**
- Modify: `src/routes/bill-entries.ts`

- [ ] **Step 1: Add `building_id` and `building_name` to the monthly entries SELECT**

In `src/routes/bill-entries.ts`, find the `billEntries.get('/', ...)` handler. Replace the large SELECT query (lines 52–72) with:

```ts
  const { results } = await c.env.DB.prepare(`
    SELECT
      be.id as entry_id, be.month, be.amount, be.status, be.paid_date,
      be.invoice_no, be.notes as entry_notes, be.updated_at,
      b.id as bill_id, b.particulars, b.account_no, b.due_day, b.is_recurring,
      b.building_id, bld.name as building_name,
      c.id as category_id, c.name as category_name, c.color as category_color, c.icon as category_icon,
      (SELECT COUNT(*) FROM bill_attachments WHERE bill_entry_id = be.id) as attachment_count,
      CASE
        WHEN be.status = 'paid' THEN 'paid'
        WHEN b.due_day IS NOT NULL AND
             date(month || '-' || printf('%02d', b.due_day)) < date('now') THEN 'overdue'
        WHEN b.due_day IS NOT NULL AND
             date(month || '-' || printf('%02d', b.due_day)) <= date('now', '+7 days') THEN 'due_soon'
        ELSE 'unpaid'
      END as computed_status
    FROM bill_entries be
    JOIN bills b ON be.bill_id = b.id
    JOIN categories c ON b.category_id = c.id
    LEFT JOIN buildings bld ON b.building_id = bld.id
    WHERE be.month = ?
    ORDER BY c.sort_order, c.name, b.particulars
  `).bind(month).all();
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/bill-entries.ts
git commit -m "feat: include building_id and building_name in bill-entries response"
```

---

## Task 5: Backend — reports route

**Files:**
- Modify: `src/routes/reports.ts`

- [ ] **Step 1: Apply building_id filter to all three bills sub-queries**

In `src/routes/reports.ts`, replace the entire `if (type === 'bills' || type === 'combined')` block (lines 18–68) with:

```ts
  if (type === 'bills' || type === 'combined') {
    let billsQuery = `
      SELECT
        be.month,
        c.name as category_name, c.color as category_color, c.icon as category_icon,
        b.particulars, b.account_no,
        be.amount, be.status, be.paid_date, be.invoice_no
      FROM bill_entries be
      JOIN bills b ON be.bill_id = b.id
      JOIN categories c ON b.category_id = c.id
      WHERE be.month BETWEEN ? AND ?
    `;
    const binds: unknown[] = [from, to];
    if (buildingId) { billsQuery += ' AND b.building_id = ?'; binds.push(buildingId); }
    if (categoryId) { billsQuery += ' AND c.id = ?'; binds.push(categoryId); }
    billsQuery += ' ORDER BY be.month, c.sort_order, b.particulars';

    const { results: billRows } = await db.prepare(billsQuery).bind(...binds).all();

    let monthQuery = `
      SELECT be.month,
        SUM(be.amount) as total,
        SUM(CASE WHEN be.status = 'paid' THEN be.amount ELSE 0 END) as paid,
        SUM(CASE WHEN be.status = 'unpaid' THEN be.amount ELSE 0 END) as unpaid
      FROM bill_entries be JOIN bills b ON be.bill_id = b.id
      WHERE be.month BETWEEN ? AND ?
    `;
    const monthBinds: unknown[] = [from, to];
    if (buildingId) { monthQuery += ' AND b.building_id = ?'; monthBinds.push(buildingId); }
    monthQuery += ' GROUP BY be.month ORDER BY be.month';
    const { results: monthSummary } = await db.prepare(monthQuery).bind(...monthBinds).all();

    let catQuery = `
      SELECT c.name, c.color, c.icon,
        SUM(be.amount) as total,
        SUM(CASE WHEN be.status = 'paid' THEN be.amount ELSE 0 END) as paid
      FROM bill_entries be JOIN bills b ON be.bill_id = b.id JOIN categories c ON b.category_id = c.id
      WHERE be.month BETWEEN ? AND ?
    `;
    const catBinds: unknown[] = [from, to];
    if (buildingId) { catQuery += ' AND b.building_id = ?'; catBinds.push(buildingId); }
    catQuery += ' GROUP BY c.id ORDER BY total DESC';
    const { results: catSummary } = await db.prepare(catQuery).bind(...catBinds).all();

    if (type === 'bills') {
      return c.json({ type, from, to, rows: billRows, monthSummary, catSummary });
    }

    const { results: rentMonthly } = await db.prepare(`
      SELECT rp.month,
        SUM(ROUND(c.annual_rent/12,2)) as expected,
        SUM(CASE WHEN rp.status = 'collected' THEN rp.amount ELSE 0 END) as collected
      FROM rent_payments rp JOIN contracts c ON rp.contract_id = c.id
      WHERE rp.month BETWEEN ? AND ?
      GROUP BY rp.month ORDER BY rp.month
    `).bind(from, to).all();

    return c.json({ type, from, to, billRows, monthSummary, catSummary, rentMonthly });
  }
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/reports.ts
git commit -m "feat: filter bills report by building_id"
```

---

## Task 6: Frontend types

**Files:**
- Modify: `client/src/lib/hooks/useCategories.ts`
- Modify: `client/src/lib/hooks/useBills.ts`

- [ ] **Step 1: Add `links_to_building` to the Category type in `useCategories.ts`**

Change line 4 from:
```ts
export type Category = { id: number; name: string; color: string; icon: string; sort_order: number };
```
to:
```ts
export type Category = { id: number; name: string; color: string; icon: string; sort_order: number; links_to_building: number };
```

- [ ] **Step 2: Add `building_id` and `building_name` to `BillEntry` and `BillTemplate` in `useBills.ts`**

In `useBills.ts`, add to the `BillEntry` type (after `category_icon`):
```ts
  building_id: number | null;
  building_name: string | null;
```

Add to the `BillTemplate` type (after `category_icon`):
```ts
  building_id?: number | null;
  building_name?: string | null;
```

Add to the `BillCreateInput` type (after `notes`):
```ts
  building_id?: number | null;
```

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/hooks/useCategories.ts client/src/lib/hooks/useBills.ts
git commit -m "feat: add building fields to Category, BillEntry, BillTemplate types"
```

---

## Task 7: Settings — Categories tab

**Files:**
- Modify: `client/src/pages/Settings.tsx`

- [ ] **Step 1: Update the catSchema, openEdit, and the form + list UI**

In `Settings.tsx`, find `const catSchema = z.object({` (around line 196) and replace it with:

```ts
const catSchema = z.object({
  name: z.string().min(1, 'Required'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  icon: z.string().max(10).default('📋'),
  links_to_building: z.boolean().default(false),
});
type CatForm = z.infer<typeof catSchema>;
```

In `CategoriesTab`, replace `openEdit` (around line 211):
```ts
function openEdit(c: typeof categories[0]) {
  reset({ name: c.name, color: c.color, icon: c.icon, links_to_building: c.links_to_building === 1 });
  setEditing({ ...c });
  setOpen(true);
}
```

In the category list row, add a badge after the color swatch (inside the left-side flex div):
```tsx
<div className="flex items-center gap-2">
  <span className="text-lg">{c.icon}</span>
  <span className="font-medium text-sm">{c.name}</span>
  <span className="w-4 h-4 rounded-full inline-block border" style={{ background: c.color }} />
  {c.links_to_building === 1 && (
    <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">🏢 building</span>
  )}
</div>
```

In the dialog form, add the checkbox field before `<DialogFooter>`:
```tsx
<div className="flex items-center gap-2">
  <input
    type="checkbox"
    id="links_to_building"
    {...register('links_to_building')}
    className="w-4 h-4 accent-primary cursor-pointer"
  />
  <label htmlFor="links_to_building" className="text-sm cursor-pointer select-none">
    Requires building selection
  </label>
</div>
```

- [ ] **Step 2: Start both servers and verify**

```bash
npm run dev:api   # in one terminal
npm run dev:client  # in another terminal
```

Open Settings → Categories tab. Edit a category (e.g. Maintenance) and check "Requires building selection". Save. The category row should show the "🏢 building" badge.

- [ ] **Step 3: Commit**

```bash
git add client/src/pages/Settings.tsx
git commit -m "feat: add links_to_building checkbox and badge to category settings"
```

---

## Task 8: Bill Form Modal — conditional building dropdown

**Files:**
- Modify: `client/src/components/bills/BillFormModal.tsx`

- [ ] **Step 1: Import `useBuildings` and add `building_id` to the schema**

At the top of `BillFormModal.tsx`, add the import:
```ts
import { useBuildings } from '@/lib/hooks/useRentals';
```

Change the `schema` object to add `building_id`:
```ts
const schema = z.object({
  category_id: z.string().min(1, 'Required'),
  particulars: z.string().min(1, 'Required').max(100),
  account_no: z.string().optional(),
  due_day: z.string().optional(),
  is_recurring: z.boolean().default(true),
  notes: z.string().optional(),
  amount: z.string().optional(),
  building_id: z.string().optional(),
});
```

- [ ] **Step 2: Add building data fetch and derive `showBuildingPicker`**

Inside the `BillFormModal` function body, after the existing hooks:
```ts
const { data: buildings = [] } = useBuildings();
const selectedCategoryId = watch('category_id');
const selectedCategory = categories.find(c => String(c.id) === selectedCategoryId);
const showBuildingPicker = selectedCategory?.links_to_building === 1;
```

- [ ] **Step 3: Clear building_id when switching to a non-building category**

Add a `useEffect` after the existing `useEffect` (the one that runs on `editing` change):
```ts
useEffect(() => {
  if (!showBuildingPicker) setValue('building_id', undefined);
}, [showBuildingPicker, setValue]);
```

- [ ] **Step 4: Update the `editing` reset to include `building_id`**

In the `useEffect` that resets on `editing`, change:
```ts
  reset({
    category_id: String(editing.category_id),
    particulars: editing.particulars,
    account_no: editing.account_no ?? '',
    due_day: editing.due_day ? String(editing.due_day) : '',
    is_recurring: editing.is_recurring === 1,
    notes: editing.notes ?? '',
    amount: editing.amount != null ? String(editing.amount) : '',
    building_id: editing.building_id ? String(editing.building_id) : undefined,
  });
```

- [ ] **Step 5: Add `building_id` to the bill payload in `onSubmit`**

In `onSubmit`, change `billPayload` to:
```ts
const billPayload = {
  category_id: Number(values.category_id),
  particulars: values.particulars,
  account_no: values.account_no || null,
  due_day: values.due_day ? Number(values.due_day) : null,
  is_recurring: values.is_recurring ? 1 : 0,
  notes: values.notes || null,
  building_id: values.building_id ? Number(values.building_id) : null,
};
```

- [ ] **Step 6: Add the building dropdown in the JSX, after the Category select**

After the closing `</div>` of the Category field block, add:
```tsx
{showBuildingPicker && (
  <div>
    <Label>Building</Label>
    <Select
      value={watch('building_id') ?? 'none'}
      onValueChange={v => setValue('building_id', v === 'none' ? undefined : v)}
    >
      <SelectTrigger><SelectValue placeholder="None / General" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">None / General</SelectItem>
        {buildings.map(b => (
          <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
)}
```

- [ ] **Step 7: Verify in browser**

Navigate to Bills page. Click "Add Bill". Select a category that has `links_to_building = 1` (e.g. Maintenance). Verify the Building dropdown appears with your buildings listed. Switch to a non-building category — verify the dropdown disappears.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/bills/BillFormModal.tsx
git commit -m "feat: show building picker in bill form for building-linked categories"
```

---

## Task 9: Bills table — building filter

**Files:**
- Modify: `client/src/components/bills/BillsTable.tsx`

- [ ] **Step 1: Update `toTemplate` to include `building_id` and `building_name`**

In `BillsTable.tsx`, update the `toTemplate` function:

```ts
function toTemplate(e: BillEntry): BillTemplate {
  return {
    id: e.bill_id,
    category_id: e.category_id,
    particulars: e.particulars,
    account_no: e.account_no,
    due_day: e.due_day,
    is_recurring: e.is_recurring,
    notes: null,
    category_name: e.category_name,
    category_color: e.category_color,
    category_icon: e.category_icon,
    entry_id: e.entry_id,
    amount: e.amount,
    building_id: e.building_id,
    building_name: e.building_name,
  };
}
```

- [ ] **Step 2: Add `buildingFilter` state and derive unique buildings from entries**

In `BillsTable.tsx`, after the existing `useState` declarations, add:
```ts
const [buildingFilter, setBuildingFilter] = useState<string>('all');
```

After the existing `categories` memo, add:
```ts
const buildingOptions = useMemo(() => {
  const seen = new Map<number, string>();
  for (const e of entries) {
    if (e.building_id && e.building_name && !seen.has(e.building_id)) {
      seen.set(e.building_id, e.building_name);
    }
  }
  return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
}, [entries]);
```

- [ ] **Step 3: Add building filter to the `filtered` memo**

In the existing `filtered` useMemo, add a building filter condition:
```ts
const filtered = useMemo(() => entries.filter(e => {
  if (search && !`${e.particulars} ${e.account_no ?? ''}`.toLowerCase().includes(search.toLowerCase())) return false;
  if (statusFilter !== 'all' && e.computed_status !== statusFilter) return false;
  if (catFilter !== 'all' && e.category_name !== catFilter) return false;
  if (buildingFilter !== 'all' && String(e.building_id ?? '') !== buildingFilter) return false;
  return true;
}), [entries, search, statusFilter, catFilter, buildingFilter]);
```

- [ ] **Step 4: Add building filter dropdown to the filter bar UI**

In the filter bar `<div>`, add the building dropdown after the category `<select>`:
```tsx
<select value={buildingFilter} onChange={e => setBuildingFilter(e.target.value)}
  className="text-xs px-2 py-1 rounded border bg-background border-border">
  <option value="all">All buildings</option>
  {buildingOptions.map(b => (
    <option key={b.id} value={String(b.id)}>{b.name}</option>
  ))}
</select>
```

- [ ] **Step 5: Verify in browser**

Navigate to Bills page. If you have bills linked to a building, the building dropdown should show. Select a building — only its bills should appear in the table.

- [ ] **Step 6: Commit**

```bash
git add client/src/components/bills/BillsTable.tsx
git commit -m "feat: add building filter to bills table"
```

---

## Task 10: Reports — building filter + BillsReportView update

**Files:**
- Modify: `client/src/pages/Reports.tsx`
- Modify: `client/src/components/reports/BillsReportView.tsx`

- [ ] **Step 1: Update `BillsReportView` to accept and show `buildingName`**

In `BillsReportView.tsx`, add `buildingName?: string` to the `Props` type:
```ts
type Props = {
  rows: Row[];
  monthSummary: MonthSummary[];
  catSummary: CatSummary[];
  from: string;
  to: string;
  buildingName?: string;
};
```

Change the `subtitle` line:
```ts
const dateRange = from === to ? monthLabel(from) : `${monthLabel(from)} – ${monthLabel(to)}`;
const subtitle = buildingName ? `${dateRange} · ${buildingName}` : dateRange;
```

Update the function signature to destructure `buildingName`:
```ts
export function BillsReportView({ rows, monthSummary, catSummary, from, to, buildingName }: Props) {
```

- [ ] **Step 2: Add building state and selector to `Reports.tsx`**

In `Reports.tsx`, add the import:
```ts
import { useBuildings } from '@/lib/hooks/useRentals';
```

Inside the `Reports` function, add state and data fetch after existing state:
```ts
const [buildingId, setBuildingId] = useState<string>('all');
const { data: buildings = [] } = useBuildings();
const selectedBuilding = buildings.find(b => String(b.id) === buildingId);
```

Update the `useQuery` to include `buildingId` in the key and URL:
```ts
const { data, isLoading, refetch } = useQuery<Record<string, unknown>>({
  queryKey: ['reports', activeTab, from, to, buildingId],
  queryFn: () => api.get(
    `/api/reports?type=${activeTab}&from=${from}&to=${to}${buildingId !== 'all' ? `&building_id=${buildingId}` : ''}`
  ),
});
```

In the filter bar (the `<div className="flex flex-wrap gap-4 ...">` block), add the building selector after the "To" date input and before the Apply button:
```tsx
{activeTab === 'bills' && (
  <div>
    <Label className="text-xs">Building</Label>
    <select
      value={buildingId}
      onChange={e => setBuildingId(e.target.value)}
      className="mt-1 block border rounded px-2 py-1 text-sm bg-background border-border"
    >
      <option value="all">All buildings</option>
      {buildings.map(b => (
        <option key={b.id} value={String(b.id)}>{b.name}</option>
      ))}
    </select>
  </div>
)}
```

Pass `buildingName` to `BillsReportView` in the `<TabsContent value="bills">` block:
```tsx
<BillsReportView
  rows={arr('rows')}
  monthSummary={arr('monthSummary')}
  catSummary={arr('catSummary')}
  from={from}
  to={to}
  buildingName={selectedBuilding?.name}
/>
```

- [ ] **Step 3: Verify in browser**

Navigate to Reports page. On the Bills tab, a "Building" dropdown should appear. Select a building. Click Apply. The report should show only bills linked to that building, and the subtitle should include the building name.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Reports.tsx client/src/components/reports/BillsReportView.tsx
git commit -m "feat: add building filter to bills report"
```

---

## Task 11: Apply migration to production

- [ ] **Step 1: Deploy and migrate production DB**

```bash
npx wrangler d1 execute mitch-app-db --remote --file=migrations/0003-bill-building-link.sql
```

Expected output:
```
🌀 Executing on remote database mitch-app-db ...
🚣 Executed 2 commands in ...
```

- [ ] **Step 2: Deploy the app**

```bash
npm run deploy
```

- [ ] **Step 3: Smoke test in production**

1. Open Settings → Categories — verify `links_to_building` column didn't break anything
2. Edit one category, enable "Requires building selection", save
3. Open Bills page, add a bill with that category — building picker should appear
4. Open Reports → Bills tab — building filter should be present

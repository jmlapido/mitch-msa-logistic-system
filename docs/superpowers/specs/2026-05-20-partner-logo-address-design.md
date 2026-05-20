# Partner Logo & Address Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional logo image and a 3-part address (street, city, country) to each partner, with the logo shown as a 40×40 rounded square on the partner card (falling back to initials) and the city/country shown as a compact line below the email.

**Architecture:** Four new nullable columns on the `partners` table (`logo_key`, `address_street`, `address_city`, `address_country`). Logo images stored in R2 under `partner-logos/{id}/{uuid}.{ext}` and served via a dedicated backend route. Address columns passed through the existing partner CRUD schema with no separate table.

**Tech Stack:** Cloudflare Workers + Hono, D1 (SQLite), R2, React + TanStack Query v5, TypeScript, Tailwind, Zod

---

## File Map

| File | Change |
|------|--------|
| `migrations/0008-partner-logo-address.sql` | Create — add 4 columns to `partners` |
| `src/routes/partners.ts` | Modify — add logo routes, add address fields to schema, delete logo on partner delete |
| `client/src/lib/hooks/usePartners.ts` | Modify — update `Partner` type, add `uploadLogo`/`deleteLogo` |
| `client/src/components/partners/tabs/PartnersTab.tsx` | Modify — card logo square, address line, edit dialog new fields |
| `client/src/components/partners/PartnerModal.tsx` | Modify — show full address in modal header |

---

## Tasks

### Task 1: DB migration

**Files:**
- Create: `migrations/0008-partner-logo-address.sql`

- [ ] **Write the migration**

```sql
-- migrations/0008-partner-logo-address.sql
ALTER TABLE partners ADD COLUMN logo_key        TEXT;
ALTER TABLE partners ADD COLUMN address_street  TEXT;
ALTER TABLE partners ADD COLUMN address_city    TEXT;
ALTER TABLE partners ADD COLUMN address_country TEXT;
```

- [ ] **Apply locally**

```bash
npx wrangler d1 execute mitch-app-db --local --file=migrations/0008-partner-logo-address.sql
```

Expected: no errors, 4 rows affected (one per ALTER TABLE).

- [ ] **Commit**

```bash
git add migrations/0008-partner-logo-address.sql
git commit -m "feat: add logo_key and address columns to partners table"
```

---

### Task 2: Backend — logo routes + address schema

**Files:**
- Modify: `src/routes/partners.ts`

- [ ] **Add address fields to `partnerSchema`**

In `src/routes/partners.ts`, the existing schema is:

```typescript
const partnerSchema = z.object({
  company_name: z.string().min(1).max(200),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
});
```

Replace with:

```typescript
const partnerSchema = z.object({
  company_name: z.string().min(1).max(200),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().optional(),
  address_street: z.string().max(200).optional(),
  address_city: z.string().max(100).optional(),
  address_country: z.string().max(100).optional(),
});
```

- [ ] **Update POST /api/partners to persist address fields**

Find the `partners.post('/', ...)` handler. The insert currently stores `company_name`, `phone`, `email`, `notes`. Update it to also store the three address fields:

```typescript
partners.post('/', requireAdmin, zValidator('json', partnerSchema), async (c) => {
  const user = c.get('user');
  const d = c.req.valid('json');
  const { meta } = await c.env.DB.prepare(`
    INSERT INTO partners (company_name, phone, email, notes, address_street, address_city, address_country)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    d.company_name,
    d.phone || null,
    d.email || null,
    d.notes || null,
    d.address_street || null,
    d.address_city || null,
    d.address_country || null,
  ).run();
  await auditLog(c.env.DB, user.id, 'create_partner', { id: meta.last_row_id, company_name: d.company_name });
  return c.json({ id: meta.last_row_id }, 201);
});
```

- [ ] **Update PUT /api/partners/:id to persist address fields**

Find the `partners.put('/:id', ...)` handler. Update the SET clause to include address fields:

```typescript
partners.put('/:id', requireAdmin, zValidator('json', partnerSchema), async (c) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const d = c.req.valid('json');
  const { meta } = await c.env.DB.prepare(`
    UPDATE partners
    SET company_name    = ?,
        phone           = ?,
        email           = ?,
        notes           = ?,
        address_street  = ?,
        address_city    = ?,
        address_country = ?
    WHERE id = ?
  `).bind(
    d.company_name,
    d.phone || null,
    d.email || null,
    d.notes || null,
    d.address_street || null,
    d.address_city || null,
    d.address_country || null,
    id,
  ).run();
  if (meta.changes === 0) return c.json({ error: 'Not found' }, 404);
  await auditLog(c.env.DB, user.id, 'update_partner', { id, company_name: d.company_name });
  return c.json({ ok: true });
});
```

- [ ] **Add logo upload route: POST /api/partners/:id/logo**

Add after the PUT handler. Images only (jpeg, png, heic), 2 MB max. DB-first pattern: insert key first, then upload to R2; on R2 failure, roll back the DB update.

```typescript
partners.post('/:id/logo', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const existing = await c.env.DB.prepare('SELECT logo_key FROM partners WHERE id = ?').bind(id).first<{ logo_key: string | null }>();
  if (!existing) return c.json({ error: 'Not found' }, 404);

  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return c.json({ error: 'No file' }, 400);

  const LOGO_ALLOWED = ['image/jpeg', 'image/png', 'image/heic'];
  if (!LOGO_ALLOWED.includes(file.type)) return c.json({ error: 'Images only (JPEG, PNG, HEIC)' }, 400);
  if (file.size > 2 * 1024 * 1024) return c.json({ error: 'Logo too large (max 2 MB)' }, 400);

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/heic' ? 'heic' : 'jpg';
  const key = `partner-logos/${id}/${crypto.randomUUID()}.${ext}`;

  // DB first
  await c.env.DB.prepare('UPDATE partners SET logo_key = ? WHERE id = ?').bind(key, id).run();

  // Then R2 — roll back on failure
  try {
    await c.env.R2.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  } catch (err) {
    await c.env.DB.prepare('UPDATE partners SET logo_key = ? WHERE id = ?').bind(existing.logo_key, id).run();
    console.error('[partners] R2 logo upload failed', err);
    return c.json({ error: 'Upload failed' }, 500);
  }

  // Delete old logo from R2 if it existed
  if (existing.logo_key) {
    await c.env.R2.delete(existing.logo_key).catch(err => console.error('[partners] R2 old logo delete failed', err));
  }

  return c.json({ key });
});
```

- [ ] **Add logo serve route: GET /api/partners/:id/logo**

```typescript
partners.get('/:id/logo', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT logo_key FROM partners WHERE id = ?').bind(id).first<{ logo_key: string | null }>();
  if (!row || !row.logo_key) return c.json({ error: 'No logo' }, 404);

  const obj = await c.env.R2.get(row.logo_key);
  if (!obj) return c.json({ error: 'Not found' }, 404);

  const contentType = obj.httpMetadata?.contentType ?? 'image/jpeg';
  return new Response(obj.body, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
```

- [ ] **Add logo delete route: DELETE /api/partners/:id/logo**

```typescript
partners.delete('/:id/logo', requireAdmin, async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare('SELECT logo_key FROM partners WHERE id = ?').bind(id).first<{ logo_key: string | null }>();
  if (!row) return c.json({ error: 'Not found' }, 404);
  if (!row.logo_key) return c.json({ ok: true }); // already no logo

  await c.env.DB.prepare('UPDATE partners SET logo_key = NULL WHERE id = ?').bind(id).run();
  await c.env.R2.delete(row.logo_key).catch(err => console.error('[partners] R2 logo delete failed', err));
  return c.json({ ok: true });
});
```

- [ ] **Clean up logo on partner DELETE**

Find the `DELETE /api/partners/:id` handler. Before deleting the DB row, fetch and delete the logo from R2 if it exists. Add this block before the `DELETE FROM partners` statement:

```typescript
// Clean up logo from R2
const logoRow = await c.env.DB.prepare('SELECT logo_key FROM partners WHERE id = ?').bind(id).first<{ logo_key: string | null }>();
if (logoRow?.logo_key) {
  await c.env.R2.delete(logoRow.logo_key).catch(err => console.error('[partners] R2 logo delete on cascade failed', err));
}
```

- [ ] **Commit**

```bash
git add src/routes/partners.ts
git commit -m "feat: partner logo routes and address fields in backend"
```

---

### Task 3: Frontend — Partner type + logo mutations

**Files:**
- Modify: `client/src/lib/hooks/usePartners.ts`

- [ ] **Update the `Partner` type** (around line 6)

```typescript
export type Partner = {
  id: number;
  company_name: string;
  phone?: string;
  email?: string;
  notes?: string;
  logo_key?: string;
  address_street?: string;
  address_city?: string;
  address_country?: string;
  created_at: string;
  contract_id?: number;
  contract_end?: string;
  expected_amount?: number;
  payment_frequency?: 'monthly' | 'quarterly' | 'annual' | 'one-time';
  total_paid: number;
  status: 'paid' | 'partial' | 'overdue' | 'pending' | 'no_contract';
};
```

- [ ] **Add `uploadLogo` and `deleteLogo` to `usePartnerMutations`**

Inside `usePartnerMutations()`, after the existing `uploadDocument` function, add:

```typescript
const uploadLogo = async (partnerId: number, file: File) => {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(`/api/partners/${partnerId}/logo`, {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? 'Upload failed');
  }
  invalidatePartners();
};

const deleteLogo = useMutation({
  mutationFn: (partnerId: number) =>
    fetch(`/api/partners/${partnerId}/logo`, { method: 'DELETE', credentials: 'include' })
      .then(r => { if (!r.ok) throw new Error('Delete failed'); }),
  onSuccess: invalidatePartners,
});
```

Add `uploadLogo` and `deleteLogo` to the return object.

- [ ] **Commit**

```bash
git add client/src/lib/hooks/usePartners.ts
git commit -m "feat: update Partner type and add logo mutations"
```

---

### Task 4: Frontend — Partner card logo + address

**Files:**
- Modify: `client/src/components/partners/tabs/PartnersTab.tsx`

- [ ] **Replace the Handshake icon with a logo square in the card**

The current card header (around line 132–139 in `PartnersTab.tsx`) looks like:

```tsx
<div className="flex items-center gap-2 min-w-0">
  <Handshake size={16} className="text-primary shrink-0" />
  <div className="min-w-0">
    <div className="font-semibold text-sm truncate">{p.company_name}</div>
    {p.email && <div className="text-xs text-muted-foreground truncate">{p.email}</div>}
  </div>
</div>
```

Replace with:

```tsx
<div className="flex items-center gap-2 min-w-0">
  <div className="w-10 h-10 rounded-lg border border-border bg-muted flex items-center justify-center shrink-0 overflow-hidden text-sm font-bold text-muted-foreground">
    {p.logo_key
      ? <img src={`/api/partners/${p.id}/logo`} alt="" className="w-full h-full object-cover" />
      : p.company_name.slice(0, 2).toUpperCase()
    }
  </div>
  <div className="min-w-0">
    <div className="font-semibold text-sm truncate">{p.company_name}</div>
    {p.email && <div className="text-xs text-muted-foreground truncate">{p.email}</div>}
    {(p.address_city || p.address_country) && (
      <div className="text-xs text-muted-foreground/70 truncate">
        {[p.address_city, p.address_country].filter(Boolean).join(', ')}
      </div>
    )}
  </div>
</div>
```

Remove the `Handshake` import if it's no longer used elsewhere in the file.

- [ ] **Add address fields to the edit dialog form schema**

The Zod schema at the top of the file:

```typescript
const schema = z.object({
  company_name: z.string().min(1, 'Required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  notes: z.string().optional(),
  address_street: z.string().optional(),
  address_city: z.string().optional(),
  address_country: z.string().optional(),
});
type F = z.infer<typeof schema>;
```

- [ ] **Update `openAdd` and `openEdit` to include address + logo state**

First, update the React import to include `useRef` (the file currently only imports `useState`):

```typescript
import { useState, useRef } from 'react';
```

Add a `logoFile` state variable at the top of `PartnersTab()`:

```tsx
const [logoFile, setLogoFile] = useState<File | null>(null);
const logoRef = useRef<HTMLInputElement>(null);
```

Update `openAdd`:

```tsx
function openAdd() {
  reset({ company_name: '', phone: '', email: '', notes: '', address_street: '', address_city: '', address_country: '' });
  setEditing(null);
  setLogoFile(null);
  setOpen(true);
}
```

Update `openEdit`:

```tsx
function openEdit(p: Partner) {
  reset({
    company_name: p.company_name,
    phone: p.phone ?? '',
    email: p.email ?? '',
    notes: p.notes ?? '',
    address_street: p.address_street ?? '',
    address_city: p.address_city ?? '',
    address_country: p.address_country ?? '',
  });
  setEditing(p);
  setLogoFile(null);
  setOpen(true);
}
```

- [ ] **Update `onSubmit` to upload logo when editing**

```tsx
async function onSubmit(v: F) {
  try {
    if (editing) {
      await updatePartner.mutateAsync({ id: editing.id, ...v });
      if (logoFile) await uploadLogo(editing.id, logoFile);
      toast.success('Updated');
    } else {
      await createPartner.mutateAsync(v);
      toast.success('Partner added');
    }
    setOpen(false);
  } catch (err) { console.error(err); toast.error(err instanceof Error ? err.message : 'Failed'); }
}
```

Destructure `uploadLogo` and `deleteLogo` from `usePartnerMutations()`:

```tsx
const { createPartner, updatePartner, deletePartner, uploadLogo, deleteLogo } = usePartnerMutations();
```

- [ ] **Add logo upload UI and address fields to the dialog form**

Add logo upload section (only shown when editing) after the Company Name field:

```tsx
{editing && (
  <div>
    <Label>Logo</Label>
    <div className="flex items-center gap-3 mt-1">
      <div className="w-12 h-12 rounded-lg border border-border bg-muted flex items-center justify-center overflow-hidden text-sm font-bold text-muted-foreground shrink-0">
        {logoFile
          ? <img src={URL.createObjectURL(logoFile)} alt="" className="w-full h-full object-cover" />
          : editing.logo_key
            ? <img src={`/api/partners/${editing.id}/logo`} alt="" className="w-full h-full object-cover" />
            : editing.company_name.slice(0, 2).toUpperCase()
        }
      </div>
      <div className="flex flex-col gap-1">
        <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => logoRef.current?.click()}>
          <Paperclip size={12} className="mr-1" /> {editing.logo_key || logoFile ? 'Change' : 'Upload Logo'}
        </Button>
        {(editing.logo_key || logoFile) && (
          <Button
            type="button" size="sm" variant="ghost"
            className="h-7 text-xs text-destructive hover:text-destructive"
            onClick={() => { setLogoFile(null); deleteLogo.mutate(editing.id); }}
          >
            Remove
          </Button>
        )}
        <span className="text-xs text-muted-foreground">Images only · max 2 MB</span>
      </div>
      <input ref={logoRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.heic"
        onChange={e => { setLogoFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
    </div>
  </div>
)}
```

Add address fields after the Notes field:

```tsx
<div>
  <Label>Address — Street</Label>
  <Input {...register('address_street')} placeholder="e.g. 12 Sheikh Zayed Rd" className="mt-1" />
</div>
<div className="grid grid-cols-2 gap-2">
  <div>
    <Label>City</Label>
    <Input {...register('address_city')} placeholder="Dubai" className="mt-1" />
  </div>
  <div>
    <Label>Country</Label>
    <Input {...register('address_country')} placeholder="UAE" className="mt-1" />
  </div>
</div>
```

Add `Paperclip` to the lucide-react import at the top.

- [ ] **Commit**

```bash
git add client/src/components/partners/tabs/PartnersTab.tsx
git commit -m "feat: partner card logo square, address line, edit dialog logo upload and address fields"
```

---

### Task 5: Frontend — PartnerModal address display

**Files:**
- Modify: `client/src/components/partners/PartnerModal.tsx`

- [ ] **Show full address in the modal Partner Info section**

In `PartnerModal.tsx`, find the "Partner Info" section (around line 83). It currently has email, phone, and notes lines inside `<div className="space-y-1 text-sm">`. Add the address line after the notes line:

```tsx
{partner.notes && <p className="text-xs text-muted-foreground italic mt-1">{partner.notes}</p>}
{(partner.address_street || partner.address_city || partner.address_country) && (
  <p className="text-xs text-muted-foreground">
    📍 {[partner.address_street, partner.address_city, partner.address_country].filter(Boolean).join(', ')}
  </p>
)}
```

This makes the full address (`12 Sheikh Zayed Rd, Dubai, UAE`) appear as a compact one-liner in the info block, only when at least one address field is set.

- [ ] **Commit**

```bash
git add client/src/components/partners/PartnerModal.tsx
git commit -m "feat: show full address in PartnerModal header"
```

---

### Task 6: Apply remote migration + deploy

- [ ] **Apply migration to remote D1**

```bash
npx wrangler d1 execute mitch-app-db --remote --file=migrations/0008-partner-logo-address.sql
```

Expected output: 4 statements executed successfully.

- [ ] **Build and deploy**

```bash
npm run deploy
```

Expected: successful deploy to `https://mitch-app.jmlapido.workers.dev`.

- [ ] **Smoke test**
  - Open a partner card — see 40×40 rounded-square with initials
  - Edit a partner — set address fields, save → city/country appears on card
  - Edit a partner — upload a logo image → logo appears in card and modal
  - Edit a partner — click Remove logo → reverts to initials
  - Open PartnerModal → full address line visible in header

- [ ] **Commit** (if any fixes needed after smoke test)

---

## Notes

- Logo upload is only available in the **edit** dialog (partner must exist to attach a file to an ID). After creating a new partner, open edit to add a logo.
- The `GET /api/partners/:id/logo` route does **not** require admin — any authenticated user can fetch the logo for display. Upload and delete require admin.
- Logo files use a UUID filename to bust caches when a logo is replaced.
- The `Cache-Control: public, max-age=3600` on the logo serve route means browsers cache for 1 hour. Replacing a logo generates a new UUID key, so the new image is fetched immediately.
- Address fields are plain nullable TEXT — no normalization or validation beyond max length.

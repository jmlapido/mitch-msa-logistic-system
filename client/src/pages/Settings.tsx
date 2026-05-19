import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Upload, UserPlus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useCategories, useCategoryMutations } from '@/lib/hooks/useCategories';
import { BuildingsTab } from '@/components/rentals/tabs/BuildingsTab';
import { UnitsTab } from '@/components/rentals/tabs/UnitsTab';

// ── Branding ──────────────────────────────────────────────────────────────────
function BrandingTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery<Record<string, string>>({
    queryKey: ['settings-all'],
    queryFn: () => api.get('/api/settings'),
  });
  const [name, setName] = useState('');
  const logoRef = useRef<HTMLInputElement>(null);

  async function saveName() {
    await api.put('/api/settings/company_name', { value: name || (settings?.['company_name'] ?? '') });
    qc.invalidateQueries({ queryKey: ['settings'] });
    qc.invalidateQueries({ queryKey: ['settings-all'] });
    toast.success('Company name saved');
  }

  async function uploadLogo(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/settings/logo', { method: 'POST', body: fd, credentials: 'include' });
    if (!res.ok) { const e = await res.json() as { error: string }; toast.error(e.error); return; }
    qc.invalidateQueries({ queryKey: ['settings'] });
    toast.success('Logo uploaded');
  }

  return (
    <div className="max-w-md space-y-5">
      <div>
        <Label>Company Name</Label>
        <div className="flex gap-2 mt-1">
          <Input
            defaultValue={settings?.['company_name'] ?? ''}
            onChange={e => setName(e.target.value)}
            placeholder="Your company name"
          />
          <Button onClick={saveName} size="sm">Save</Button>
        </div>
      </div>
      <div>
        <Label>Company Logo</Label>
        <div className="mt-1 flex items-center gap-3">
          {settings?.['company_logo_url'] && (
            <img src={settings['company_logo_url']} alt="Logo" className="h-12 w-12 rounded object-contain border" />
          )}
          <Button variant="outline" size="sm" onClick={() => logoRef.current?.click()}>
            <Upload size={13} className="mr-2" /> Upload Logo
          </Button>
          <input ref={logoRef} type="file" className="hidden" accept="image/*"
            onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
        </div>
        <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG — max 2MB. Appears in nav and PDF reports.</p>
      </div>
      <div>
        <Label>Currency</Label>
        <div className="flex gap-2 mt-1">
          <Input defaultValue={settings?.['currency'] ?? 'AED'} className="w-24" readOnly />
          <p className="text-xs text-muted-foreground self-center">Contact admin to change</p>
        </div>
      </div>
    </div>
  );
}

// ── Users ─────────────────────────────────────────────────────────────────────
type User = { id: number; name: string; email: string; role: string; active: number };

const userSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'staff']),
});
type UserForm = z.infer<typeof userSchema>;

function UsersTab() {
  const qc = useQueryClient();
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/api/users'),
  });
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, setValue, watch, reset, formState: { isSubmitting, errors } } = useForm<UserForm>({ resolver: zodResolver(userSchema) });

  async function onSubmit(v: UserForm) {
    try {
      await api.post('/api/users', v);
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success('User created');
      reset(); setOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Failed'); }
  }

  async function toggleActive(u: User) {
    try {
      await api.put(`/api/users/${u.id}`, { active: !u.active });
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.success(u.active ? 'Deactivated' : 'Reactivated');
    } catch { toast.error('Failed'); }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">System Users</h3>
        <Button size="sm" onClick={() => setOpen(true)}><UserPlus size={14} className="mr-1" /> Add User</Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Email</th>
              <th className="text-left px-3 py-2">Role</th>
              <th className="text-center px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {users.map(u => (
              <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                <td className="px-3 py-2 font-medium">{u.name}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{u.email}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${u.role === 'admin' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-muted text-muted-foreground'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className={`text-xs ${u.active ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {u.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <button onClick={() => toggleActive(u)} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <RefreshCw size={11} /> {u.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add User</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div><Label>Name *</Label><Input {...register('name')} className="mt-1" /></div>
            <div>
              <Label>Email *</Label>
              <Input {...register('email')} type="email" className="mt-1" />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div><Label>Password * (min 8 chars)</Label><Input {...register('password')} type="password" className="mt-1" /></div>
            <div>
              <Label>Role *</Label>
              <Select value={watch('role')} onValueChange={v => setValue('role', v as UserForm['role'])}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin (full access)</SelectItem>
                  <SelectItem value="staff">Staff (add/edit only)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Creating…' : 'Create'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────────────────
const catSchema = z.object({
  name: z.string().min(1, 'Required'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#3b82f6'),
  icon: z.string().max(10).default('📋'),
  links_to_building: z.boolean().default(false),
});
type CatForm = z.infer<typeof catSchema>;

function CategoriesTab() {
  const { data: categories = [] } = useCategories();
  const { create, update, remove } = useCategoryMutations();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: number } | null>(null);
  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm<CatForm>({ resolver: zodResolver(catSchema) });

  function openAdd() { reset({ color: '#3b82f6', icon: '📋', links_to_building: false }); setEditing(null); setOpen(true); }
  function openEdit(c: typeof categories[0]) { reset({ name: c.name, color: c.color, icon: c.icon, links_to_building: c.links_to_building === 1 }); setEditing({ id: c.id }); setOpen(true); }

  async function onSubmit(v: CatForm) {
    try {
      if (editing) { await update.mutateAsync({ id: editing.id, ...v }); toast.success('Updated'); }
      else { await create.mutateAsync(v); toast.success('Created'); }
      setOpen(false);
    } catch { toast.error('Failed'); }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this category? Bills using it will need to be reassigned.')) return;
    try { await remove.mutateAsync(id); toast.success('Deleted'); } catch { toast.error('Failed'); }
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">Bill Categories</h3>
        <Button size="sm" onClick={openAdd}><Plus size={14} className="mr-1" /> Add Category</Button>
      </div>
      <div className="space-y-1">
        {categories.map(c => (
          <div key={c.id} className="flex items-center justify-between border rounded px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{c.icon}</span>
              <span className="font-medium text-sm">{c.name}</span>
              <span className="w-4 h-4 rounded-full inline-block border" style={{ background: c.color }} />
              {c.links_to_building === 1 && (
                <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">🏢 building</span>
              )}
            </div>
            <div className="flex gap-1">
              <button onClick={() => openEdit(c)} className="p-1 text-muted-foreground hover:text-foreground"><Pencil size={13} /></button>
              <button onClick={() => handleDelete(c.id)} className="p-1 text-muted-foreground hover:text-destructive"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
      <Dialog open={open} onOpenChange={v => !v && setOpen(false)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{editing ? 'Edit Category' : 'Add Category'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
            <div><Label>Name *</Label><Input {...register('name')} className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Icon (emoji)</Label><Input {...register('icon')} className="mt-1" maxLength={10} /></div>
              <div><Label>Color</Label><Input {...register('color')} type="color" className="mt-1 h-9" /></div>
            </div>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Unit Types ────────────────────────────────────────────────────────────────
function UnitTypesTab() {
  const qc = useQueryClient();
  const { data: types = [] } = useQuery<string[]>({
    queryKey: ['unit-types'],
    queryFn: () => api.get('/api/settings/unit_types'),
  });
  const [newType, setNewType] = useState('');

  async function addType() {
    const trimmed = newType.trim().toLowerCase();
    if (!trimmed) return;
    if (types.includes(trimmed)) { toast.error('Type already exists'); return; }
    try {
      await api.put('/api/settings/unit_types', { value: JSON.stringify([...types, trimmed]) });
      qc.invalidateQueries({ queryKey: ['unit-types'] });
      setNewType('');
      toast.success('Type added');
    } catch { toast.error('Failed'); }
  }

  async function removeType(t: string) {
    try {
      await api.put('/api/settings/unit_types', { value: JSON.stringify(types.filter(x => x !== t)) });
      qc.invalidateQueries({ queryKey: ['unit-types'] });
      toast.success('Type removed');
    } catch { toast.error('Failed'); }
  }

  return (
    <div className="max-w-sm">
      <h3 className="font-semibold mb-1">Unit Types</h3>
      <p className="text-xs text-muted-foreground mb-4">Types available in the unit form dropdown.</p>
      <div className="space-y-1 mb-4">
        {types.map(t => (
          <div key={t} className="flex items-center justify-between border rounded px-3 py-2">
            <span className="text-sm capitalize">{t}</span>
            <button onClick={() => removeType(t)} className="p-1 text-muted-foreground hover:text-destructive">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newType}
          onChange={e => setNewType(e.target.value)}
          placeholder="e.g. studio, bed space"
          onKeyDown={e => e.key === 'Enter' && addType()}
          className="flex-1"
        />
        <Button size="sm" onClick={addType}><Plus size={14} className="mr-1" />Add</Button>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Settings() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <Tabs defaultValue="branding">
        <TabsList className="mb-4">
          <TabsTrigger value="branding">Branding</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="unit-types">Unit Types</TabsTrigger>
          <TabsTrigger value="properties">Properties</TabsTrigger>
        </TabsList>
        <TabsContent value="branding"><BrandingTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="unit-types"><UnitTypesTab /></TabsContent>
        <TabsContent value="properties">
          <div className="space-y-8">
            <BuildingsTab />
            <hr className="border-border" />
            <UnitsTab />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

# Design: Move Buildings & Units Config to Settings

**Date:** 2026-05-19  
**Status:** Approved

## Summary

Move the CRUD management of Buildings and Units out of the Rentals page and into Settings. The Rentals page retains read-only (display) versions of both tabs. Settings gains a new "Properties" tab that hosts full management of both entities.

## Goals

- Rentals page becomes display-only for Buildings and Units (no add/edit/delete).
- Settings gains a single "Properties" tab with Buildings and Units management sections.
- No duplicate rendering logic — the same components are reused with a `readonly` prop.

## Non-Goals

- No changes to the data model, API routes, or backend.
- No changes to Payments, Tenants, or Archived tabs.
- No role-based visibility changes beyond what already exists.

## Design

### 1. `BuildingsTab` — add `readonly` prop

**File:** `client/src/components/rentals/tabs/BuildingsTab.tsx`

Add `readonly?: boolean` to the component props. When `true`:
- Hide the "Add Building" `<Button>`.
- Hide the edit (`<Pencil>`) and delete (`<Trash2>`) icon buttons on each card.
- Keep the Dialog declaration in place but it will never be triggered (or optionally remove for cleanliness — acceptable either way).

### 2. `UnitsTab` — add `readonly` prop

**File:** `client/src/components/rentals/tabs/UnitsTab.tsx`

Add `readonly?: boolean` to the component props. When `true`:
- Hide the "Add Unit" `<Button>`.
- Hide the edit and delete icon buttons inside the table rows.
- The add/edit Dialog can remain mounted but unreachable, or be conditionally excluded.

### 3. `Rentals.tsx` — pass `readonly`

**File:** `client/src/pages/Rentals.tsx`

Pass `readonly` to both tab components:

```tsx
<TabsContent value="units"><UnitsTab readonly /></TabsContent>
<TabsContent value="buildings"><BuildingsTab readonly /></TabsContent>
```

### 4. `Settings.tsx` — add "Properties" tab

**File:** `client/src/pages/Settings.tsx`

Add a new tab value `"properties"` to the Settings tabs:

```tsx
<TabsTrigger value="properties">Properties</TabsTrigger>
```

The tab content renders `BuildingsTab` then `UnitsTab` (no `readonly` prop), with a visual divider (`<hr>` or spacing) between the two sections and section headings ("Buildings & Shops", "Units") above each.

Import `BuildingsTab` and `UnitsTab` from their existing paths.

## File Change Summary

| File | Change |
|------|--------|
| `client/src/components/rentals/tabs/BuildingsTab.tsx` | Add `readonly?: boolean` prop; conditionally hide Add/Edit/Delete controls |
| `client/src/components/rentals/tabs/UnitsTab.tsx` | Add `readonly?: boolean` prop; conditionally hide Add/Edit/Delete controls |
| `client/src/pages/Rentals.tsx` | Pass `readonly` to `<BuildingsTab>` and `<UnitsTab>` |
| `client/src/pages/Settings.tsx` | Add "Properties" tab importing and rendering both components |

## Testing

- Rentals > Units tab: no Add Unit button, no edit/delete buttons visible.
- Rentals > Buildings tab: no Add Building button, no edit/delete buttons visible.
- Settings > Properties tab: full CRUD visible and functional for Buildings and Units.
- Existing role checks (admin/superadmin) on Settings remain intact.

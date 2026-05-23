# Design: Link Bills to Buildings

**Date:** 2026-05-19  
**Status:** Approved

## Overview

Allow bill categories to be marked as "building-linked". When a user adds a bill whose category is building-linked, an optional building selector appears. Bills can then be filtered by building in both the bills list and the reports page.

## Requirements

- Categories can be individually flagged as `links_to_building`
- When adding/editing a bill, the building picker appears only if the selected category has `links_to_building = 1`
- Building selection is **optional** — a bill in a building-linked category can still have no building assigned
- The bills list gets a building filter dropdown (client-side)
- The bills report gets a building filter (server-side via query param)
- Buildings come from the existing `buildings` table (the same ones shown in Rentals > Buildings)

## Database Changes

Two `ALTER TABLE` migrations:

```sql
ALTER TABLE categories ADD COLUMN links_to_building INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bills ADD COLUMN building_id INTEGER REFERENCES buildings(id);
```

No existing data is affected. Both columns default to 0/NULL.

## API Changes

### `GET /api/categories`
Already returns all columns; no change needed once migration is applied.

### `POST /api/categories` and `PUT /api/categories/:id`
Accept optional `links_to_building: boolean` in the request body (Zod schema updated).

### `GET /api/bills`
- Add `LEFT JOIN buildings bld ON bills.building_id = bld.id`
- Return `building_id`, `building_name` in each row
- Accept optional `?building_id=` query param to filter server-side (used by reports)

### `POST /api/bills` and `PUT /api/bills/:id`
Accept optional `building_id: number | null` in the request body.

## UI Changes

### Settings → Categories Tab

**Category list:** Each category row shows a small "🏢" badge if `links_to_building = 1`.

**Category add/edit dialog:** New checkbox field:
- Label: "Requires building selection"
- Hint: "Shows a building picker when this category is used on a bill"

### Bill Form Modal (`BillFormModal.tsx`)

After the Category dropdown, conditionally render a Building dropdown:
- Shown only when the selected category has `links_to_building = 1`
- Fetches from `useBuildings()` hook (already exists for rentals)
- First option: "None / General" (value = null)
- Pre-populates from `editing.building_id` when editing
- Clears when user switches to a non-building-linked category

### Bills Table (`BillsTable.tsx`)

New filter in the filter bar (between category dropdown and search input):
- Dropdown: "All buildings" + one entry per building name
- Client-side filter: hides bills with no building when a specific building is selected
- Always visible in the filter bar

### Bills Report Page

New building selector before the date range inputs:
- Dropdown: "All buildings" (default) + list of buildings
- When a specific building is selected, the API call appends `&building_id=X`
- Report subtitle includes building name: e.g. "Building A · Jan–Mar 2026"
- Monthly summary, category summary, and detail table all reflect the filtered data

## Data Flow

```
User selects category (links_to_building=1)
  → Building dropdown appears in BillFormModal
  → User picks a building (or leaves as None)
  → building_id saved to bills table on POST/PUT

Bills list loads for month
  → GET /api/bills returns building_id + building_name per row
  → Client-side building filter applied in BillsTable

Reports page
  → User selects building filter
  → GET /api/reports/bills?from=&to=&building_id=X
  → Server filters bill_entries by building_id
  → BillsReportView renders with building in subtitle
```

## Out of Scope

- Enforcing building selection at the DB level (it remains optional)
- Filtering by unit within a building
- Bulk-assigning buildings to existing bills

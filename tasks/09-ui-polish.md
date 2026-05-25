# Task 09 — UI polish & mobile pass

**Phase:** 4
**Depends on:** 04, 05, 07, 08 (everything user-facing)

## Goal

A consistency pass across the three pages so the app feels like one product:
utilitarian, dense, mobile-first. No new features.

## Deliverables

1. Audit `/`, `/pantry`, `/shopping-list` on a 375px-wide viewport. Fix any:
   - Horizontal overflow that isn't a deliberate scrolling table.
   - Tap targets under 40×40px.
   - Inputs that zoom on iOS focus (font-size must be ≥16px).
2. Global polish:
   - Consistent header and nav across pages.
   - Loading and empty states for each page (one-line skeletons or text — no
     animated spinners as decoration).
   - Toast or inline banner for failed API calls. Reuse one component.
3. Stale-data warnings:
   - On the shopping list, any row whose `flipp_cache` `valid_to` is in the
     past renders a small "prices stale" marker. Per the design doc.
4. Replace any decorative icons / gradients / shadows that snuck in.
   Spreadsheet-adjacent only.
5. Lighthouse mobile pass: aim for ≥90 performance, ≥95 accessibility.
   Document anything that can't reach those numbers and why.

## Acceptance criteria

- Walking through the full flow on a phone-sized viewport works without
  pinch-zoom or sideways scrolling (except inside the pantry table).
- Loading and empty states exist on all three pages.
- One consistent error-banner pattern, not three.

## Notes / constraints

- Do not introduce a component library or icon pack.
- Do not change data shapes or API contracts.
- If a previous task shipped something inconsistent with the design doc,
  fix it here and note the change in your summary.

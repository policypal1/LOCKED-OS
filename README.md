# LOCKED OS

Daily checklist and Looksmaxxing tracker with local + Supabase state sync.

## Included files
- `index.html` — app shell
- `styles.css` — UI styles
- `app.js` — tracker logic
- `schema.sql` — Supabase state table setup
- `supabase-keepalive.yml` — optional keep-alive workflow

## This version adds
- Daily morning **Wash face** task in Looksmaxxing.
- **Edit task** inside the existing three-dot menu on Looksmaxxing tasks.
- Edited task names persist in local/Supabase state and carry forward to future days.
- Existing **Skip task** option remains available.
- New **Admin → Rotation calendar** showing the next 14 days of:
  - tretinoin / azelaic acid
  - microneedling
  - masseter training
  - shaving / eyebrow management
  - bed-sheet wash days
  - Sunday lip exfoliation
  - gym rotation
- Existing tretinoin frequency control still works and the calendar updates with it.

## Replacing your current site
You can replace the files in the repository root with the files from this folder. No database schema change is required for these updates.

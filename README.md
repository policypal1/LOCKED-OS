# LOCKED OS

Daily checklist, Looksmaxxing, weight, weekly review, and MK-677 tracking with local + Supabase state sync.

## Included files
- `index.html` — app shell
- `styles.css` — UI styles
- `app.js` — tracker logic
- `schema.sql` — Supabase state table setup
- `supabase-keepalive.yml` — optional keep-alive workflow

## This version adds
- New **MK-677** tab.
- Records an 8-week plan with Monday-Friday nights and Saturday-Sunday off.
- Current dose starts at **12.5 mg** and can be manually changed to **25 mg** only when you choose to update the clinician-set plan. The app never auto-escalates.
- Simplified daily logger for date, status, dose, time, weight, resting heart rate, and notes.
- Simple recent overview for resting heart rate, weight change, weekly logs, and taken days.
- Weekly regimen stays prominent, with the clinician-set cycle start and dose controls moved lower on the page.
- All MK-677 data is stored in the existing JSON state and syncs through the same Supabase row.

## Database
No schema change is required. The existing `state` JSONB column stores the new tracker data.

LOCKED OS - SUPABASE SYNC + RECOVERY FIX

WHAT TO REPLACE
1. Replace ONLY ghk-cu.js in the root of your current site/repo.
   - app.js stays exactly as it is.
   - index.html stays exactly as it is.
   - styles.css stays exactly as it is.
   - ghk-cu.css stays exactly as it is.

2. Put supabase-keepalive.yml at this exact repo path:
   .github/workflows/supabase-keepalive.yml
   The old copy sitting in the repo root can be deleted afterward; it does nothing there.

SUPABASE
- If LOCKED OS worked with Supabase before, DO NOT rerun schema.sql just for this fix.
- schema.sql is included only in case the table/policies are actually missing.
- CHECK-SUPABASE-DATA.sql is read-only. It can be run to see whether weights/tasks/data still exist in the current Supabase row.

DATA RECOVERY
- Do NOT clear browser/site data on any device.
- Before opening the old version on another device, deploy the fixed ghk-cu.js first.
- The fixed code archives the device's local save before applying cloud data and does a one-time non-destructive merge of missing historical data.
- recover-data.html can inspect old v4-v17 localStorage saves and the new recovery snapshots. It must be hosted on the SAME domain/origin as LOCKED OS to see that browser's saved data.

IMPORTANT
If both Supabase and every browser/device localStorage copy have already been overwritten/cleared, a source file cannot recreate the old numeric values. Paid Supabase plans may have database backups that can be restored separately.

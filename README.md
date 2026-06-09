# Accountability OS

Premium rebuild of the accountability tracker.

## Files
- `index.html` - app shell
- `styles.css` - premium cream UI
- `app.js` - tracker logic
- `schema.sql` - optional Supabase cloud sync table

## Main changes
- Cleaner premium cream design
- Fake-page/tab layout:
  - Today
  - Planner
  - Stats
  - History
  - Settings
- Strict mode is permanent
- Morning section is a gate
- Afternoon/night are locked until morning is fully resolved
- You can complete morning tasks or fail unfinished morning tasks
- Better progress system:
  - done count
  - resolved count
  - failures
  - perfect days
  - XP
  - ranks
  - achievements
  - 21-day history
- Quick-add tasks
- Custom recurring tasks
- Export/import backup
- Optional Supabase sync

## GitHub Pages setup
Upload these files to your repository root:

```text
index.html
styles.css
app.js
schema.sql
README.md
```

Then go to:

```text
Settings → Pages → Deploy from branch → main → /root
```

## Supabase setup
1. Create a Supabase project.
2. Run `schema.sql` in the Supabase SQL Editor.
3. Open `app.js`.
4. Fill in:

```js
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";
```

Use your Supabase project URL and anon/public key. Do not use a service role key in frontend code.

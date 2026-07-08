# C&A Rankings — אתר MVP

זה אתר אמיתי ל־Cloudflare Pages עם דאטהבייס Supabase.

## מה יש בפנים
- Dashboard לאביה
- Dashboard לחן
- יצירת דירוג
- Artist Ranking / Mixed Playlist
- הדבקת רשימת שירים
- Review Songs עם Spotify URL ידני
- פרסום דירוג
- דירוג 1–10 עם Autosave
- חזרה לאותו עמוד
- התקדמות עם אינדיקטור ויניל
- Ready to Reveal
- אישור Reveal כי זו פעולה בלתי הפיכה
- Results פשוטים: שיר, ציון סופי, Spotify link
- Ranking Collection
- בלי Google Sheets
- בלי התקנות

## שלב 1 — Supabase
1. לפתוח supabase.com
2. New project
3. להיכנס ל־SQL Editor
4. להדביק את כל התוכן של `schema.sql`
5. Run

## שלב 2 — להכניס מפתחות
1. Supabase → Project Settings → API
2. להעתיק:
   - Project URL
   - anon public key
3. לפתוח את `config.js`
4. להחליף:
   - `PASTE_SUPABASE_URL_HERE`
   - `PASTE_SUPABASE_ANON_KEY_HERE`

## שלב 3 — Cloudflare Pages
1. לפתוח dash.cloudflare.com
2. Workers & Pages
3. Create application
4. Pages
5. Upload assets
6. להעלות את כל תיקיית האתר או ZIP
7. Deploy

## קישורים באתר
אחרי שהאתר באוויר:

- לאביה:
`https://YOUR-SITE.pages.dev/#/avia`

- לחן:
`https://YOUR-SITE.pages.dev/#/chen`

## הערה חשובה
זו גרסת MVP. היא בנויה כדי להתחיל לעבוד באמת, לא כדי להיות “ספר אפיון”.

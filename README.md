# ExamTrack

A mobile-first recruitment and exam tracker built with Next.js, TypeScript, Supabase Auth, and Supabase Postgres. Includes cloud-synced records, manual entry/edit/delete, application status tracking, filters, CSV export, best-effort PDF text/date extraction, and browser notification reminders.

## Features

- Email/password sign-up and sign-in
- Private, per-user data using Supabase Row Level Security (RLS)
- Add, edit, delete and track recruitment opportunities
- Application start, deadline, exam, admit-card and result dates
- Custom category names, links, pay, eligibility notes, fees, application number, notes
- Filters: not applied, applied, closing soon, deadline passed, upcoming exams, dates unknown
- Search, category/status filters and CSV export
- PDF text extraction in the browser (up to 30 pages); extracted dates are only suggestions and must be verified
- Multiple private attachments per exam: application forms, registration/payment receipts, admit cards, scorecards/results, and other documents
- Private Supabase Storage bucket, per-user access policies, signed links for viewing/downloading, and delete controls
- Per-record reminder offsets (7, 3, 1 days and deadline day)
- Responsive design and installable PWA manifest

## Requirements

- Windows 10/11
- Node.js 20.9+ (LTS recommended) and npm
- A Supabase account/project
- A Vercel account for deployment (optional)

## 1. Create the Supabase database

1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor** in the project dashboard.
3. Open `supabase/schema.sql` from this project, paste the complete contents into SQL Editor, and run it.
4. In **Project Settings → API** (or **Data API / API Keys**, depending on the dashboard), copy:
   - Project URL
   - anon/public key (or publishable key)
5. In **Authentication → URL Configuration**, set the Site URL to your local address while testing (`http://localhost:3000`). For production, change it to your deployed domain. Add redirect URLs for local and production origins if required.

The schema enables RLS and policies so a signed-in user can access only rows where `user_id = auth.uid()`. It also creates a private `exam-documents` Storage bucket and `exam_documents` metadata table. Files use a path containing the authenticated user ID and exam ID; viewing uses short-lived signed URLs. Never put the Supabase `service_role` key in a browser app.

## 2. Run on Windows

Extract the ZIP, open PowerShell in the `examtrack` directory, then run:

```powershell
node --version
npm --version
npm install
Copy-Item .env.example .env.local
notepad .env.local
```

Set the values in `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_OR_PUBLISHABLE_KEY
```

Save the file and run:

```powershell
npm run dev
```

Open http://localhost:3000. Create an account, then add an opportunity. If email confirmation is enabled in Supabase, confirm the signup email before signing in. Restart `npm run dev` after editing `.env.local`.

## 3. Deploy to Vercel

1. Create a private GitHub repository and push this project.
2. In https://vercel.com, import that repository as a Next.js project.
3. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel project environment variables for Production (and Preview if desired).
4. Deploy.
5. In Supabase Authentication URL Configuration, set Site URL to the production URL and add local/production redirect URLs as allowed.
6. Open the Vercel URL on your phone, sign in, and add it to the home screen.

## 4. Install on phone

### iPhone (Safari)
1. Open the deployed HTTPS URL in Safari.
2. Tap Share → Add to Home Screen.
3. Open ExamTrack from the home screen and sign in.

### Android (Chrome)
1. Open the deployed HTTPS URL in Chrome.
2. Use the browser menu → Install app / Add to Home screen.
3. Open the installed app and sign in.

The PWA manifest is included. Add polished app icons and a service worker if you want a richer install prompt/offline shell.

## PDF import limitations

PDF import is client-side and uses `pdfjs-dist` to extract selectable text from up to 30 pages. It attempts to identify a few common date labels, fills a draft form, and retains an excerpt of extracted text in Notes. It is deliberately **not an authoritative parser**: layouts vary, dates can be ambiguous, and scanned PDFs require OCR. Review all extracted values against the original notification before saving. This version does not send PDFs to an AI provider.

## Reminders — important limitation

This starter checks reminder offsets when the app is opened and records which reminders it has shown in that browser's local storage. If browser notification permission is granted, it can show a notification while the app is active/open. It does **not** guarantee background or push notifications when the app is closed, and local reminder-seen state is per device.

For reliable reminders while the app is closed, add a scheduled server-side job (for example Supabase Edge Function + Supabase Cron) and a Web Push service worker. Web Push requires a VAPID key pair, a subscription table, secure server-side key storage, and notification delivery code. Native iOS web push requires an installed Home Screen web app on supported iOS versions and user permission.

## Data model

`supabase/schema.sql` creates `public.exams`, `public.exam_documents`, a private `exam-documents` Storage bucket, indexes, RLS policies, and an `updated_at` trigger. Attachments accept PDF/JPG/PNG/WEBP up to 10 MB each. Dates are stored as SQL `date` values, statuses are constrained, and records belong to an authenticated Supabase user.

## Security and backup

- Keep `.env.local` private; never commit it.
- Use only the anon/publishable key in browser code and keep RLS enabled.
- Export visible filtered records with the Export button for a CSV backup.
- Do not put passwords, identity documents or other secrets in notes.
- Before production use, test RLS with two separate accounts.

## Troubleshooting

- **Supabase is not configured:** verify `.env.local` is in the project root and restart the dev server.
- **Invalid API key / fetch error:** verify the Project URL and anon/publishable key match the same Supabase project.
- **Sign-up does not sign in:** check email confirmation and Supabase Auth URL configuration.
- **Database permission error:** run `supabase/schema.sql` and verify RLS policies exist.
- **PDF import misses dates:** verify dates manually; scanned/image PDFs need OCR.
- **No notification appears:** enable browser notification permission and reopen the app near a configured reminder date.

## Production hardening ideas

- Add a dedicated custom-category table per user (currently custom categories are client-side suggestions; a category already used by a saved exam remains visible).
- Add push subscriptions and scheduled delivery for closed-app reminders.
- Add robust PDF/OCR or LLM extraction with explicit review and source citations.
- Add pagination, automated tests, error telemetry, and an automated daily reminder worker.


## Add document storage to an existing deployment

If you already ran the original schema before this feature was added, open Supabase SQL Editor and run the **updated complete** `supabase/schema.sql` again. The statements are designed to be re-runnable and will create the document table, private bucket and storage policies. Existing exam records are preserved. Afterward, redeploy the updated source.

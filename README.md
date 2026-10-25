# Garden Guide

A website for growing guides tailored to where you live. Anyone can create an account; each account has its own garden that syncs across every device it signs in on.

- **Setup walkthrough.** After creating an account, a 4-step guide asks for your location (or uses your phone's), lets you tick plants from a starter list or type your own, builds every guide, and connects your calendar.
- **Plant guides.** Growing steps, harvest, uses, pet and people safety notes, all with the same fields (N/A where something doesn't apply).
- **Ready-made guides.** 118 free guides for common vegetables, herbs, fruit, flowers, natives and indoor plants, plus the Woy Woy starter set. Pick them in setup or type a name in Add plant; seasonal reminders are dated from the day you add them. They're written for temperate and subtropical coastal Australia.
- **Add, remove, group and edit plants** at any time. With a Claude key, Claude writes each new guide in about half a minute. Without one, new plants start as blank guides you fill in or paste into with **Edit guide**, including their calendar reminders.
- **Growing regions.** Eight Australian presets (coastal NSW, SE Queensland, tropical north, Perth & south-west WA, Adelaide, Melbourne, cold areas, inland). Ready-made guides get that region's planting times, soil, water, climate and pest advice, local tips, and reminders moved to the right season. The region is guessed from the location typed in setup and can be changed.
- **Change location** and ready-made guides update for the new region instantly and free; with a Claude key, every guide can instead be rewritten for the exact place.
- **Calendar feed.** Each account gets its own feed of care reminders at 6pm local time. Subscribe once; it updates as plants change.
- **Accounts.** Email and password, with "Forgot password" emails. Sign out, change password or delete the account from the account button.

The site runs on GitHub Pages. Accounts, gardens and guide-writing run on [Supabase](https://supabase.com) (free plan).

## Set up the backend (once, about 15 minutes, works on a phone)

### 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) and tap **New project**. Any name and region (Sydney is closest for Australia). Save the database password somewhere safe; you won't need it here.
2. When it's ready, open **Project Settings → General** and copy the **Project ID** (20 letters, e.g. `abcdefghijklmnopqrst`).
3. Open your account menu → **Account preferences → Access tokens → Generate new token**. Name it `github` and copy it (starts with `sbp_`).

### 2. Add secrets to this GitHub repo

**Settings → Secrets and variables → Actions → New repository secret**, once for each:

| Name | Value |
| --- | --- |
| `SUPABASE_PROJECT_REF` | the Project ID from step 1.2 |
| `SUPABASE_ACCESS_TOKEN` | the `sbp_…` token from step 1.3 |
| `ANTHROPIC_API_KEY` | *Optional.* A Claude API key from [console.anthropic.com](https://console.anthropic.com), for automatic guide writing. Billed per use, separately from a Claude subscription; a guide costs a few cents. Add it any time and rerun Deploy backend. |

Also check **Settings → Actions → General → Workflow permissions** is set to **Read and write**.

### 3. Deploy

**Actions → Deploy backend → Run workflow.** In about two minutes it:

- creates the database tables, with each account locked to its own data,
- sets sign-in to send people back to this site,
- uploads the backend and its secrets,
- writes `config.json` so the site can find the backend.

Then open the site and **Create account**. It redeploys by itself whenever backend files change.

## Costs and limits

- **Supabase free plan.** Free projects pause after about a week with no activity. Data is kept; open the Supabase dashboard and tap **Resume project**. Normal use (opening the app, calendar refreshes) usually keeps it awake.
- **Claude (optional).** Without `ANTHROPIC_API_KEY` everything works except automatic guide writing, rewriting and local tips for new places. With it, because anyone can sign up, each account can have **30** guides written per day and the whole site **300** per day. Change these with repository **variables** (same settings page, Variables tab) named `DAILY_LIMIT` and `GLOBAL_DAILY_LIMIT`, then rerun **Deploy backend**. `CLAUDE_MODEL` changes the model (default `claude-sonnet-5-5`).
- **Emails.** New accounts are confirmed straight away, so no email is needed to sign up. Password-reset emails use Supabase's built-in sender, which only sends a few per hour; for more, add your own email service under **Authentication → Emails** in Supabase.

## How it works

| Path | Purpose |
| --- | --- |
| `index.html`, `app.js`, `styles.css`, `icon.svg` | The website, including sign-in and setup walkthrough |
| `api.js` | Talks to Supabase: accounts, your garden, the backend |
| `calendar.js` | Builds calendar files (shared with the backend) |
| `starter/` | The ready-made starter plants and Woy Woy peninsula tips |
| `library/regions.js` | Growing regions: advice for each plant type in each region, and which type each ready-made plant is |
| `library/` | Ready-made guides: edit the `.txt` files, then run `node library/build.mjs` to rebuild `library/plants.json` |
| `supabase/schema.sql` | Database tables and per-account security rules |
| `supabase/functions/garden/` | Backend: writes guides with Claude, imports starters, serves calendar feeds, deletes accounts |
| `.github/workflows/deploy-backend.yml` | Sets up and deploys everything on Supabase |
| `config.json` | Written by the deploy; tells the site where the backend is |

Guides are written by AI from general horticultural knowledge. Traditional uses are not medical advice; check with a GP or pharmacist before using any herb medicinally.

# Garden Guide

A small website for your garden on the Woy Woy peninsula. It has an overview page and one tab per plant, each with growing steps, harvest tips, uses and care reminders. It runs free on GitHub Pages.

From the site you can:

- **Add a plant by name.** Claude writes a guide tailored to peninsula conditions, adds it as a new tab, and puts its care reminders in your calendar feed.
- **Remove a plant.** Its tab and its calendar reminders go away.
- **Group plants.** Move any plant into a group, or type a new group name.

Changes take about a minute. They run as a GitHub Action, so they show up on every device.

## Setup (about 15 minutes, once)

### 1. Put the files on GitHub

1. Sign in at github.com and create a new **public** repository, e.g. `garden-guide`. GitHub Pages needs a public repo on a free account.
2. Click **uploading an existing file**, drag in everything from this folder (including the `.github` folder), and commit.
   - Phone tip: the `.github` folder can be hidden when uploading from a phone. If `Actions` shows no workflow later, create the file `.github/workflows/garden.yml` in the repo and paste in its contents.

### 2. Turn on the website

**Settings → Pages →** Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)` → **Save**.
After a minute your site is at `https://YOUR-NAME.github.io/garden-guide/`.

### 3. Let the Action save changes

**Settings → Actions → General →** Workflow permissions: **Read and write permissions** → **Save**.

### 4. Add your Claude API key

1. Get a key at [console.anthropic.com](https://console.anthropic.com) (billed per use; a plant guide costs a few cents).
2. In the repo: **Settings → Secrets and variables → Actions → New repository secret**. Name: `ANTHROPIC_API_KEY`, value: your key.

Optional repository **variables** on the same page:

| Variable | What it does | Default |
| --- | --- | --- |
| `CLAUDE_MODEL` | Model used to write guides | `claude-sonnet-5-5` |
| `GARDEN_LOCATION` | Where your garden is, for tailoring advice | Woy Woy peninsula, Central Coast NSW |

### 5. Connect the site to your repo

1. Create a token at **github.com → Settings → Developer settings → Fine-grained tokens → Generate new token**.
   - Repository access: *Only select repositories* → your garden repo.
   - Permissions: **Actions: Read and write**, **Contents: Read-only**.
2. Open your site, tap the **gear icon**, and enter `YOUR-NAME/garden-guide`, branch `main`, and the token.

The token is stored only in that browser. Repeat this step on each device you use.

### 6. Subscribe to the calendar feed

On the site's Overview, use **Subscribe in Google Calendar**, or copy the feed address. On Android, subscribe in Google Calendar on the web (calendar.google.com → Other calendars → **+** → From URL). It then appears in your phone's calendar, including Samsung Calendar if your Google account is synced.

Every plant you add puts its reminders here automatically, at 6pm on the day, and removed plants drop out. Subscribed calendars refresh every few hours, so a new plant can take up to a day to appear in your calendar.

The original 13 plants' reminders were already added straight to your phone calendar, so they're kept out of the feed to avoid doubling up. Removing one of those plants removes its guide; delete its old reminders in your calendar app.

## How it works

| Path | Purpose |
| --- | --- |
| `index.html`, `assets/` | The website |
| `data/plants.json` | Every plant's guide, group and reminders |
| `data/overview.md` | General peninsula, planting and indoor tips on the Overview |
| `calendar.ics` | The calendar feed, rebuilt on every change |
| `scripts/garden.mjs` | Adds, removes or regroups a plant and rebuilds the feed |
| `.github/workflows/garden.yml` | Runs that script when the site asks |

You can also run changes from GitHub itself: **Actions → Update garden guide → Run workflow**.
To edit any guide by hand, change `data/plants.json` on GitHub.

Guides are written by AI from general horticultural knowledge. Traditional uses are not medical advice; check with a GP or pharmacist before using any herb medicinally.

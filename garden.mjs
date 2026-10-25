// Garden guide automation: add, remove, regroup or relocate, then rebuild calendar.ics.
// Run by .github/workflows/garden.yml. Usage (env vars):
//   ACTION=add      PLANT="Basil"  GROUP="Kitchen herbs"           (needs ANTHROPIC_API_KEY)
//   ACTION=remove   PLANT="basil"                                    (slug or name)
//   ACTION=group    PLANT="basil"  GROUP="Kitchen herbs"
//   ACTION=location LOCATION="Hobart, Tasmania" REGENERATE=true    (needs ANTHROPIC_API_KEY)
//   ACTION=calendar                                                  (rebuild calendar.ics only)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { buildCalendar } from "./calendar.js";

const PLANTS = new URL("./plants.json", import.meta.url);
const SETTINGS = new URL("./settings.json", import.meta.url);
const OVERVIEW = new URL("./overview.md", import.meta.url);
const CAL = new URL("./calendar.ics", import.meta.url);
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";
const DEFAULT_SETTINGS = {
  location: "Woy Woy peninsula, Central Coast NSW, Australia",
  label: "Woy Woy peninsula",
  notes: "frost-free, sandy soil, salt wind, humid summers",
  timezone: "Australia/Sydney",
};

const action = (process.env.ACTION || "").trim().toLowerCase();
const plantArg = (process.env.PLANT || "").trim().slice(0, 80);
const groupArg = (process.env.GROUP || "").trim().slice(0, 40);
const locationArg = (process.env.LOCATION || "").trim().slice(0, 120);
const timezoneArg = (process.env.TIMEZONE || "").trim().slice(0, 60);
const regenerate = /^(true|yes|1)$/i.test(process.env.REGENERATE || "");

export const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const load = () => JSON.parse(readFileSync(PLANTS, "utf8"));
const save = (plants) => writeFileSync(PLANTS, JSON.stringify(plants, null, 2) + "\n");
const loadSettings = () => ({ ...DEFAULT_SETTINGS, ...(existsSync(SETTINGS) ? JSON.parse(readFileSync(SETTINGS, "utf8")) : {}) });

function findPlant(plants, key) {
  const s = slugify(key);
  return plants.find((p) => p.slug === s || p.name.toLowerCase() === key.toLowerCase());
}

function validTimezone(tz) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch { return false; }
}

function localToday(settings) {
  const tz = validTimezone(settings.timezone) ? settings.timezone : "UTC";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date());
}

const where = (s) => `${s.location}${s.notes ? ` (${s.notes})` : ""}`;

function plantPrompt(name, settings, today, hint = "") {
  return `You are an expert horticulturist. Write a growing guide for "${name}"${hint} for a home gardener in ${where(settings)}. Today is ${today}.

Reply with ONLY a JSON object, no prose, matching exactly:
{
  "name": "common name, title case",
  "botanical": "botanical name",
  "summary": "1-2 sentences: what it is, size, life cycle in this climate",
  "glance": {"sun": "", "water": "", "spacing": "e.g. 45 cm", "pot": "min pot size or 'Not suited'", "indoors": "Good / Possible / Poor / No, plus a few words"},
  "growing": [["Position", "..."], ["Soil", "..."], ["Water", "..."], ["Feeding", "..."], ["Care", "..."], ["Pests", "..."], ["Winter", "..."]],
  "harvest": "when and how to harvest, or how to enjoy it if not harvested",
  "uses": [["Kitchen", "..."], ["Traditional", "..."], ["Garden", "..."], ["Caution", "only if there are toxicity, allergy, pet or medication concerns"]],
  "reminders": "one line summary of the care schedule",
  "tasks": [
    {"title": "short calendar title, e.g. 'Basil: pinch out flowers'", "notes": "what to do", "start": "YYYY-MM-DD", "rrule": "optional RFC 5545 RRULE without 'RRULE:', e.g. FREQ=WEEKLY;BYDAY=SA;UNTIL=20270430"}
  ]
}

Rules:
- Tailor every point to that location's climate, soil, frost risk, pests and the correct hemisphere's seasons. Use the local units and names gardeners there would use.
- "growing" has 5-8 items; keep each under 30 words.
- "tasks": 4-10 important care reminders for the next 12 months (planting out, watering, feeding, pruning, pollinating, pest checks, frost protection, harvest, seed saving), timed for that location. Start dates must be on or after ${today}. Use RRULE only for repeating jobs and always bound them with UNTIL or COUNT. No general watering task more often than weekly.
- If "${name}" is not a real plant, reply {"error": "reason"}.`;
}

function overviewPrompt(settings) {
  return `You are an expert horticulturist. Write the general tips page of a home garden guide for a gardener in ${where(settings)}.

Reply with ONLY Markdown (no code fences), using exactly these "## " headings in this order:
## Your local conditions
(One sentence summary, then 6-8 bullets: climate and seasons, frost or heat risk with typical dates, typical soil and how to improve it, wind/humidity/rainfall, major local pests, watering advice. Each bullet starts with a short **bold label:**.)
## Planting out new seedlings
(A numbered list of 5-6 steps, adjusted for this climate.)
## Indoor care basics
(5-7 bullets with **bold labels:**; say which window direction gets most sun in this hemisphere.)
## A note on traditional uses
(One short paragraph: traditional uses are folk practice, not medical advice; check with a doctor or pharmacist before using any herb medicinally.)

Plain Markdown only: headings, bullets, numbered lists and **bold**. No links, tables or HTML.`;
}

async function callClaude(content, maxTokens = 4000) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY secret is not set in the repository.");
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: "user", content }] }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await new Promise((r) => setTimeout(r, attempt * 5000));
      continue;
    }
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }
}

async function askGuide(name, settings, today, hint) {
  const text = await callClaude(plantPrompt(name, settings, today, hint));
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

const str = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pairs = (v) =>
  Array.isArray(v) ? v.filter((x) => Array.isArray(x) && x.length === 2).map(([a, b]) => [str(a, 30), str(b)]).filter(([a, b]) => a && b) : [];

export function cleanTasks(tasks, today) {
  if (!Array.isArray(tasks)) return [];
  const max = new Date(today);
  max.setFullYear(max.getFullYear() + 3);
  return tasks
    .map((t) => ({ title: str(t.title, 80), notes: str(t.notes, 500), start: str(t.start, 10), rrule: str(t.rrule, 120).replace(/^RRULE:/i, "") }))
    .filter((t) => t.title && /^\d{4}-\d{2}-\d{2}$/.test(t.start) && t.start >= today && new Date(t.start) <= max)
    .map((t) => (/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+\-]+)*$/.test(t.rrule) ? t : { ...t, rrule: "" }))
    .slice(0, 12);
}

function guideFields(g, today) {
  const glance = g.glance || {};
  return {
    botanical: str(g.botanical, 80),
    summary: str(g.summary),
    glance: Object.fromEntries(["sun", "water", "spacing", "pot", "indoors"].map((k) => [k, str(glance[k], 80)])),
    growing: pairs(g.growing),
    harvest: str(g.harvest),
    uses: pairs(g.uses),
    reminders: str(g.reminders),
    calendar: true,
    tasks: cleanTasks(g.tasks, today),
  };
}

async function addPlant(plants, settings) {
  if (!plantArg) throw new Error("No plant name given.");
  if (findPlant(plants, plantArg)) throw new Error(`"${plantArg}" is already in the guide.`);
  const today = localToday(settings);
  const g = await askGuide(plantArg, settings, today);
  if (g.error) throw new Error(`Could not create a guide: ${g.error}`);
  const name = str(g.name, 60) || plantArg;
  const slug = slugify(name);
  if (!slug) throw new Error("Could not make a page name for that plant.");
  if (plants.some((p) => p.slug === slug)) throw new Error(`"${name}" is already in the guide.`);
  plants.push({ slug, name, group: groupArg || "Other plants", ...guideFields(g, today), added: today });
  console.log(`Added ${name} with ${plants.at(-1).tasks.length} reminders.`);
}

function removePlant(plants) {
  const p = findPlant(plants, plantArg);
  if (!p) throw new Error(`"${plantArg}" is not in the guide.`);
  console.log(`Removed ${p.name}.`);
  return plants.filter((x) => x !== p);
}

function regroup(plants) {
  const p = findPlant(plants, plantArg);
  if (!p) throw new Error(`"${plantArg}" is not in the guide.`);
  p.group = groupArg || "Other plants";
  console.log(`Moved ${p.name} to ${p.group}.`);
}

// Run async jobs with at most `limit` in flight.
async function pool(items, limit, fn) {
  const results = [];
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const n = i++;
      results[n] = await fn(items[n]).then((v) => ({ ok: true, v }), (e) => ({ ok: false, e }));
    }
  }));
  return results;
}

async function relocate(plants) {
  if (!locationArg) throw new Error("No location given.");
  const settings = {
    location: locationArg,
    label: locationArg.split(",")[0].trim().slice(0, 40),
    notes: "",
    timezone: validTimezone(timezoneArg) ? timezoneArg : loadSettings().timezone,
  };
  const overview = (await callClaude(overviewPrompt(settings), 3000)).replace(/^```\w*\n?|```\s*$/g, "").trim();
  if (!overview.includes("## ")) throw new Error("Couldn't write local tips for that location. Try a more specific place name.");
  writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  writeFileSync(OVERVIEW, overview + "\n");
  console.log(`Location set to ${settings.location}.`);
  if (!regenerate) return;
  const today = localToday(settings);
  const results = await pool(plants, 4, async (p) => {
    const g = await askGuide(p.name, settings, today, p.botanical ? ` (${p.botanical})` : "");
    if (g.error) throw new Error(g.error);
    Object.assign(p, guideFields(g, today), { updated: today });
  });
  results.forEach((r, n) => (r.ok ? console.log(`Rewrote ${plants[n].name}.`) : console.log(`::warning::Kept old guide for ${plants[n].name}: ${r.e.message}`)));
  if (results.length && results.every((r) => !r.ok)) throw new Error("Couldn't rewrite any plant guides. Check the Action log.");
}

async function main() {
  let plants = load();
  if (action === "add") await addPlant(plants, loadSettings());
  else if (action === "remove") plants = removePlant(plants);
  else if (action === "group") regroup(plants);
  else if (action === "location") await relocate(plants);
  else if (action !== "calendar") throw new Error(`Unknown action "${action}".`);
  save(plants);
  const s = loadSettings();
  writeFileSync(CAL, buildCalendar(plants, { name: `Garden reminders (${s.label})`, timezone: s.timezone }));
  console.log(`calendar.ics: ${plants.filter((p) => p.calendar).reduce((n, p) => n + p.tasks.length, 0)} reminders.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}

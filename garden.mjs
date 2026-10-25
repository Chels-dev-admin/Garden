// Garden guide automation: add, remove or regroup plants, then rebuild calendar.ics.
// Run by .github/workflows/garden.yml. Usage (env vars):
//   ACTION=add    PLANT="Basil"  GROUP="Kitchen herbs"   (needs ANTHROPIC_API_KEY)
//   ACTION=remove PLANT="basil"                            (slug or name)
//   ACTION=group  PLANT="basil"  GROUP="Kitchen herbs"
//   ACTION=calendar                                        (rebuild calendar.ics only)
import { readFileSync, writeFileSync } from "node:fs";
import { buildCalendar } from "../assets/calendar.js";

const PLANTS = new URL("../data/plants.json", import.meta.url);
const CAL = new URL("../calendar.ics", import.meta.url);
const LOCATION = process.env.GARDEN_LOCATION || "the Woy Woy peninsula, Central Coast NSW, Australia (frost-free, sandy soil, salt wind, humid summers)";
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

const action = (process.env.ACTION || "").trim().toLowerCase();
const plantArg = (process.env.PLANT || "").trim().slice(0, 80);
const groupArg = (process.env.GROUP || "").trim().slice(0, 40);

export const slugify = (s) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const load = () => JSON.parse(readFileSync(PLANTS, "utf8"));
const save = (plants) => writeFileSync(PLANTS, JSON.stringify(plants, null, 2) + "\n");

function findPlant(plants, key) {
  const s = slugify(key);
  return plants.find((p) => p.slug === s || p.name.toLowerCase() === key.toLowerCase());
}

function sydneyToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney" }).format(new Date());
}

function prompt(name, today) {
  return `You are an expert horticulturist. Write a growing guide for "${name}" for a home gardener on ${LOCATION}. Today is ${today}.

Reply with ONLY a JSON object, no prose, matching exactly:
{
  "name": "common name, title case",
  "botanical": "botanical name",
  "summary": "1-2 sentences: what it is, size, life cycle",
  "glance": {"sun": "", "water": "", "spacing": "e.g. 45 cm", "pot": "min pot size or 'Not suited'", "indoors": "Good / Possible / Poor / No, plus a few words"},
  "growing": [["Position", "..."], ["Soil", "..."], ["Water", "..."], ["Feeding", "..."], ["Care", "..."], ["Pests", "..."]],
  "harvest": "when and how to harvest, or how to enjoy it if not harvested",
  "uses": [["Kitchen", "..."], ["Traditional", "..."], ["Garden", "..."], ["Caution", "only if there are toxicity, allergy, pet or medication concerns"]],
  "reminders": "one line summary of the care schedule",
  "tasks": [
    {"title": "short calendar title, e.g. 'Basil: pinch out flowers'", "notes": "what to do", "start": "YYYY-MM-DD", "rrule": "optional RFC 5545 RRULE without 'RRULE:', e.g. FREQ=WEEKLY;BYDAY=SA;UNTIL=20270430"}
  ]
}

Rules:
- Tailor every point to the local conditions above (sandy soil, salt wind, frost-free, Southern Hemisphere seasons).
- "growing" has 5-8 items; keep each under 30 words.
- "tasks": 4-10 important care reminders for the next 12 months (planting out, watering, feeding, pruning, pollinating, pest checks, harvest, seed saving). Start dates must be on or after ${today}. Use RRULE only for repeating jobs and always bound them with UNTIL or COUNT. Do not add a general watering task more often than weekly.
- If "${name}" is not a real plant, reply {"error": "reason"}.`;
}

async function askClaude(name) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY secret is not set in the repository.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: "user", content: prompt(name, sydneyToday()) }] }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  return JSON.parse(json);
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

async function addPlant(plants) {
  if (!plantArg) throw new Error("No plant name given.");
  if (findPlant(plants, plantArg)) throw new Error(`"${plantArg}" is already in the guide.`);
  const g = await askClaude(plantArg);
  if (g.error) throw new Error(`Could not create a guide: ${g.error}`);
  const name = str(g.name, 60) || plantArg;
  const slug = slugify(name);
  if (!slug) throw new Error("Could not make a page name for that plant.");
  if (plants.some((p) => p.slug === slug)) throw new Error(`"${name}" is already in the guide.`);
  const today = sydneyToday();
  const glance = g.glance || {};
  plants.push({
    slug,
    name,
    group: groupArg || "Other plants",
    botanical: str(g.botanical, 80),
    summary: str(g.summary),
    glance: Object.fromEntries(["sun", "water", "spacing", "pot", "indoors"].map((k) => [k, str(glance[k], 80)])),
    growing: pairs(g.growing),
    harvest: str(g.harvest),
    uses: pairs(g.uses),
    reminders: str(g.reminders),
    calendar: true,
    tasks: cleanTasks(g.tasks, today),
    added: today,
  });
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

async function main() {
  let plants = load();
  if (action === "add") await addPlant(plants);
  else if (action === "remove") plants = removePlant(plants);
  else if (action === "group") regroup(plants);
  else if (action !== "calendar") throw new Error(`Unknown action "${action}".`);
  save(plants);
  writeFileSync(CAL, buildCalendar(plants));
  console.log(`calendar.ics: ${plants.filter((p) => p.calendar).reduce((n, p) => n + p.tasks.length, 0)} reminders.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(`::error::${e.message}`);
    process.exit(1);
  });
}

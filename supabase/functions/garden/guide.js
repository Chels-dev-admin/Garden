// Plant guide prompts and clean-up, shared by the backend (and its tests).
// Pure JavaScript: no Deno or Node APIs.

export const NA = "N/A";
export const OTHER = "Other plants";
const GROWING_ORDER = ["Position", "Soil", "Drainage", "Water", "Mulch", "Feeding", "Support", "Training", "Pruning", "Deadheading", "Care", "Tip", "Spreading", "Propagation", "Indoors", "Pests", "Problems", "Pets", "Caution", "Winter", "Next year"];
const USES_ORDER = ["Kitchen", "Home", "Traditional", "Garden", "Caution"];
const GLANCE_KEYS = ["sun", "water", "spacing", "pot", "indoors"];
const TEXT_KEYS = ["botanical", "summary", "harvest", "reminders"];

export const slugify = (s) =>
  String(s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export const str = (v, max = 400) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const pairs = (v) =>
  Array.isArray(v) ? v.filter((x) => Array.isArray(x) && x.length === 2).map(([a, b]) => [str(a, 30), str(b)]).filter(([a, b]) => a && b) : [];

export function validTimezone(tz) {
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return Boolean(tz); } catch { return false; }
}

export function localToday(tz) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: validTimezone(tz) ? tz : "UTC" }).format(new Date());
}

// Every plant shows the same fields: headings any plant uses are given to all,
// in a set order (unknown ones after, A–Z); missing values read "N/A".
function headings(plants, key, order, seedCount) {
  const seen = new Map();
  for (const p of plants) for (const [k] of p[key] || []) {
    const lk = k.toLowerCase();
    if (!seen.has(lk)) seen.set(lk, order.find((o) => o.toLowerCase() === lk) || k);
  }
  for (const o of order.slice(0, seedCount)) if (!seen.has(o.toLowerCase())) seen.set(o.toLowerCase(), o);
  const rank = (k) => { const i = order.findIndex((o) => o.toLowerCase() === k.toLowerCase()); return i < 0 ? order.length : i; };
  return [...seen.values()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function fieldSets(plants) {
  return { growing: headings(plants, "growing", GROWING_ORDER, 8), uses: headings(plants, "uses", USES_ORDER, 5) };
}

export function normalise(plants) {
  const sets = fieldSets(plants);
  const fill = (list, labels) => {
    const map = new Map((list || []).map(([k, v]) => [k.toLowerCase(), v]));
    return labels.map((l) => [l, String(map.get(l.toLowerCase()) ?? "").trim() || NA]);
  };
  return plants.map((p) => ({
    ...p,
    group: p.group || OTHER,
    growing: fill(p.growing, sets.growing),
    uses: fill(p.uses, sets.uses),
    glance: Object.fromEntries(GLANCE_KEYS.map((k) => [k, String(p.glance?.[k] ?? "").trim() || NA])),
    ...Object.fromEntries(TEXT_KEYS.map((k) => [k, String(p[k] ?? "").trim() || NA])),
    cautions: Array.isArray(p.cautions) ? p.cautions : [],
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
  }));
}

export function plantPrompt(name, location, today, hint = "", sets = fieldSets([])) {
  const list = (a) => a.map((x) => `"${x}"`).join(", ");
  return `You are an expert horticulturist. Write a growing guide for "${name}"${hint} for a home gardener in ${location}. Today is ${today}.

Reply with ONLY a JSON object, no prose, matching exactly:
{
  "name": "common name, title case",
  "botanical": "botanical name",
  "summary": "1-2 sentences: what it is, size, life cycle in this climate",
  "cautions": [{"who": "Pets", "text": "..."}, {"who": "People", "text": "..."}],
  "glance": {"sun": "", "water": "", "spacing": "e.g. 45 cm", "pot": "min pot size or 'Not suited'", "indoors": "Good / Possible / Poor / No, plus a few words"},
  "growing": [["Position", "..."], ["Soil", "..."]],
  "harvest": "when and how to harvest, or how to enjoy it if not harvested",
  "uses": [["Kitchen", "..."], ["Garden", "..."]],
  "reminders": "one line summary of the care schedule",
  "tasks": [
    {"title": "short calendar title, e.g. 'Basil: pinch out flowers'", "notes": "what to do", "start": "YYYY-MM-DD", "rrule": "optional RFC 5545 RRULE without 'RRULE:', e.g. FREQ=WEEKLY;BYDAY=SA;UNTIL=20270430"}
  ]
}

Rules:
- Tailor every point to that location's climate, soil, frost risk, pests and the correct hemisphere's seasons. Use the local units and names gardeners there would use.
- "cautions": every safety concern for pets (dogs, cats, birds, livestock) and people (toxicity, skin irritation, allergies, pregnancy, medication interactions, thorns or sharp leaves). One item per audience, under 30 words each. Use [] if there are none; don't invent risks.
- "growing" must have exactly these headings, in this order: ${list(sets.growing)}. Keep each under 30 words. Where a heading doesn't apply to this plant, write "${NA}".
- "uses" must have exactly these headings, in this order: ${list(sets.uses)}. Where one doesn't apply, write "${NA}". Put any toxicity or medical warning under "Caution".
- "tasks": 4-10 important care reminders for the next 12 months (planting out, watering, feeding, pruning, pollinating, pest checks, frost protection, harvest, seed saving), timed for that location. Start dates must be on or after ${today}. Use RRULE only for repeating jobs and always bound them with UNTIL or COUNT. No general watering task more often than weekly.
- If "${name}" is not a real plant, reply {"error": "reason"}.`;
}

export function overviewPrompt(location) {
  return `You are an expert horticulturist. Write the general tips page of a home garden guide for a gardener in ${location}.

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

export function parseJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The guide came back in an unexpected format. Please try again.");
  return JSON.parse(text.slice(start, end + 1));
}

export function cleanTasks(tasks, today) {
  if (!Array.isArray(tasks)) return [];
  const max = new Date(today);
  max.setFullYear(max.getFullYear() + 3);
  return tasks
    .map((t) => ({ title: str(t?.title, 80), notes: str(t?.notes, 500), start: str(t?.start, 10), rrule: str(t?.rrule, 120).replace(/^RRULE:/i, "") }))
    .filter((t) => t.title && /^\d{4}-\d{2}-\d{2}$/.test(t.start) && t.start >= today && new Date(t.start) <= max)
    .map((t) => (/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+\-]+)*$/.test(t.rrule) ? t : { ...t, rrule: "" }))
    .slice(0, 12);
}

export function cleanCautions(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({ who: /pet|dog|cat|animal|livestock|bird/i.test(c?.who) ? "Pets" : "People", text: str(c?.text, 300) }))
    .filter((c) => c.text)
    .slice(0, 4);
}

export function guideFields(g, today) {
  const glance = g.glance || {};
  return {
    botanical: str(g.botanical, 80),
    summary: str(g.summary),
    cautions: cleanCautions(g.cautions),
    glance: Object.fromEntries(GLANCE_KEYS.map((k) => [k, str(glance[k], 80)])),
    growing: pairs(g.growing),
    harvest: str(g.harvest),
    uses: pairs(g.uses),
    reminders: str(g.reminders),
    calendar: true,
    tasks: cleanTasks(g.tasks, today),
  };
}

// Tidies a plant supplied by the browser (starter imports), keeping only known fields.
export function cleanImported(p, today) {
  const name = str(p?.name, 60);
  const slug = slugify(p?.slug || name);
  if (!name || !slug) return null;
  return {
    slug,
    name,
    group: str(p.group, 40) || OTHER,
    ...guideFields({ ...p, tasks: [] }, today),
    cautions: cleanCautions(p.cautions),
    tasks: cleanTasks(p.tasks, today),
    calendar: p.calendar !== false,
    library: Boolean(p.library),
    added: today,
  };
}

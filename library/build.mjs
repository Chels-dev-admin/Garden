// Builds library/plants.json from the library/*.txt guide files and checks them.
// Run: node library/build.mjs
//
// Each guide starts with "@ Name" followed by "key: value" lines:
//   botanical, group, aka (comma list), summary, pets, people,
//   glance: sun | water | spacing | pot | indoors
//   any Growing heading (Position, Soil, Water, ...) or Uses heading (Kitchen, Home, Traditional, Garden, Caution)
//   harvest, reminders
//   task: MM-DD | title | notes | rrule | months-the-repeat-lasts
// Reminder dates are turned into real dates when someone adds the plant.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { slugify } from "../supabase/functions/garden/guide.js";

const DIR = new URL("./", import.meta.url);
const GROWING = ["Position", "Soil", "Drainage", "Water", "Mulch", "Feeding", "Support", "Training", "Pruning", "Deadheading", "Care", "Tip", "Spreading", "Propagation", "Indoors", "Pests", "Problems", "Pets", "Winter", "Next year"];
const USES = ["Kitchen", "Home", "Traditional", "Garden", "Caution"];
const TOP = ["botanical", "group", "aka", "summary", "pets", "people", "glance", "harvest", "reminders", "task"];

export function parse(text, file) {
  const plants = [];
  const errors = [];
  let cur = null;
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    const where = `${file}:${i + 1}`;
    if (!line || line.startsWith("#")) return;
    if (line.startsWith("@ ")) {
      cur = { name: line.slice(2).trim(), growing: [], uses: [], tasks: [], cautions: [], aka: [], where };
      plants.push(cur);
      return;
    }
    if (!cur) return errors.push(`${where}: text before the first "@ Name"`);
    const m = line.match(/^([A-Za-z ]+):\s*(.*)$/);
    if (!m) return errors.push(`${where}: expected "key: value"`);
    const [, key, value] = m;
    if (GROWING.includes(key)) cur.growing.push([key, value]);
    else if (USES.includes(key)) cur.uses.push([key, value]);
    else if (key === "glance") {
      const parts = value.split("|").map((s) => s.trim());
      if (parts.length !== 5) errors.push(`${where}: glance needs 5 parts`);
      const [sun, water, spacing, pot, indoors] = parts;
      cur.glance = { sun, water, spacing, pot, indoors };
    } else if (key === "task") {
      const [md, title, notes = "", rrule = "", months = ""] = value.split("|").map((s) => s.trim());
      if (!/^\d{2}-\d{2}$/.test(md)) errors.push(`${where}: task date must be MM-DD`);
      if (!title) errors.push(`${where}: task needs a title`);
      if (rrule && !/^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,]+)*$/.test(rrule)) errors.push(`${where}: bad repeat rule`);
      if (rrule && !Number(months)) errors.push(`${where}: repeating task needs months`);
      cur.tasks.push({ md, title, notes, rrule, months: Number(months) || 0 });
    } else if (key === "pets" || key === "people") {
      if (value && !/^none( widely)? known/i.test(value)) cur.cautions.push({ who: key === "pets" ? "Pets" : "People", text: value });
    } else if (key === "aka") cur.aka = value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (TOP.includes(key)) cur[key] = value;
    else errors.push(`${where}: unknown key "${key}"`);
  });
  return { plants, errors };
}

function build() {
  const all = [];
  const errors = [];
  for (const f of readdirSync(DIR).filter((f) => f.endsWith(".txt")).sort()) {
    const r = parse(readFileSync(new URL(f, DIR), "utf8"), f);
    all.push(...r.plants);
    errors.push(...r.errors);
  }
  const seen = new Map();
  for (const p of all) {
    p.slug = slugify(p.name);
    for (const k of ["botanical", "group", "summary", "harvest", "reminders", "glance"]) if (!p[k]) errors.push(`${p.where}: ${p.name} is missing ${k}`);
    if (p.growing.length < 4) errors.push(`${p.where}: ${p.name} has only ${p.growing.length} growing notes`);
    if (!p.uses.length) errors.push(`${p.where}: ${p.name} has no uses`);
    for (const name of [p.name, ...p.aka]) {
      const k = name.toLowerCase();
      if (seen.has(k)) errors.push(`${p.where}: "${name}" also used by ${seen.get(k)}`);
      seen.set(k, p.name);
    }
    for (const [k, v] of [...p.growing, ...p.uses]) if (v.split(/\s+/).length > 45) errors.push(`${p.where}: ${p.name} ${k} is long (${v.split(/\s+/).length} words)`);
  }
  const out = all.map(({ where, ...p }) => ({ ...p, library: true, calendar: true }));
  return { out, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { out, errors } = build();
  if (errors.length) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  writeFileSync(new URL("plants.json", DIR), JSON.stringify(out) + "\n");
  const groups = out.reduce((m, p) => ((m[p.group] = (m[p.group] || 0) + 1), m), {});
  console.log(`library/plants.json: ${out.length} guides`, groups);
}

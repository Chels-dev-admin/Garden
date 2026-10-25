// Builds an iCalendar (.ics) feed of plant care reminders. Shared by the
// GitHub Action (Node) and the web app (per-plant download).

const TZ = "Australia/Sydney";
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZ}`,
  "BEGIN:STANDARD",
  "DTSTART:19700405T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU",
  "TZOFFSETFROM:+1100",
  "TZOFFSETTO:+1000",
  "TZNAME:AEST",
  "END:STANDARD",
  "BEGIN:DAYLIGHT",
  "DTSTART:19701004T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU",
  "TZOFFSETFROM:+1000",
  "TZOFFSETTO:+1100",
  "TZNAME:AEDT",
  "END:DAYLIGHT",
  "END:VTIMEZONE",
];

const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Fold lines longer than 75 octets (RFC 5545 §3.1).
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = "";
  let len = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (len + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      len = 0;
    }
    cur += ch;
    len += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function hash(s) {
  let h = 5381;
  for (const c of s) h = ((h << 5) + h + c.codePointAt(0)) >>> 0;
  return h.toString(36);
}

// UNTIL must be a UTC date-time when DTSTART has a time; end of that Sydney day.
function normaliseRrule(rrule) {
  if (!rrule) return "";
  return rrule.replace(/UNTIL=(\d{8})(T\d{6}Z?)?/, (_, d) => `UNTIL=${d}T125959Z`);
}

const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

export function eventsFor(plant, time = "180000") {
  return (plant.tasks || []).map((t) => {
    const day = t.start.replace(/-/g, "");
    const lines = [
      "BEGIN:VEVENT",
      `UID:${plant.slug}-${hash(t.title + t.start)}@garden-guide`,
      `DTSTAMP:${stamp()}`,
      `DTSTART;TZID=${TZ}:${day}T${time}`,
      `DURATION:PT30M`,
      `SUMMARY:${esc(t.title)}`,
      `DESCRIPTION:${esc(`${t.notes || ""}\n\n${plant.name} — garden guide`)}`,
      `CATEGORIES:${esc(plant.group || "Garden")}`,
    ];
    const rr = normaliseRrule(t.rrule);
    if (rr) lines.push(`RRULE:${rr}`);
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(t.title)}`, "TRIGGER:PT0M", "END:VALARM", "END:VEVENT");
    return lines;
  });
}

export function buildCalendar(plants, { name = "Garden reminders", onlyCalendar = true } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//garden-guide//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    `X-WR-TIMEZONE:${TZ}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    "X-PUBLISHED-TTL:PT12H",
    ...VTIMEZONE,
  ];
  for (const p of plants) {
    if (onlyCalendar && !p.calendar) continue;
    for (const ev of eventsFor(p)) lines.push(...ev);
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
